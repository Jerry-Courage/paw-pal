import hashlib
import hmac
import json
import logging
import os
import secrets
from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import PaymentTransaction, PromoCode, PromoRedemption
from .services import (
    PAYMENT_PLANS, PaymentConfigurationError, PaymentValidationError,
    activate_premium, frontend_url, fulfill_payment, initialize_provider, paystack_secret,
    verify_provider,
)

logger = logging.getLogger('flowstate')


def transaction_payload(txn):
    return {
        'reference': txn.reference, 'plan': txn.plan,
        'amount': str(txn.amount), 'amount_minor': txn.expected_amount_minor,
        'currency': txn.currency, 'status': txn.status,
        'channel': txn.channel or None, 'card_brand': txn.card_brand or None,
        'card_last4': txn.card_last4 or None,
        'created_at': txn.created_at.isoformat(),
        'paid_at': txn.paid_at.isoformat() if txn.paid_at else None,
    }


class InitializePaymentView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        plan_id = request.data.get('plan_id', 'premium_monthly')
        plan = PAYMENT_PLANS.get(plan_id)
        if not plan:
            return Response({'error': 'Unknown payment plan.'}, status=400)
        key = str(request.data.get('idempotency_key') or '').strip()[:100]
        if key:
            existing = PaymentTransaction.objects.filter(user=request.user, initialization_key=key).first()
            cached = (existing.paystack_data or {}).get('initialization') if existing else None
            if existing and cached:
                return Response({**cached, 'reused': True})

        amount_minor = plan['amount_minor']
        promo_code = str(request.data.get('promo_code') or '').strip().upper()
        if promo_code:
            promo = PromoCode.objects.select_for_update().filter(code=promo_code).first()
            if not promo or not promo.is_valid or PromoRedemption.objects.filter(user=request.user, promo=promo).exists():
                return Response({'error': 'This promo code is invalid, expired, or already used.'}, status=400)
            if promo.discount_type == 'free_days':
                activate_premium(request.user, promo.discount_value)
                PromoRedemption.objects.create(user=request.user, promo=promo)
                promo.times_used += 1
                promo.save(update_fields=['times_used'])
                return Response({'promo_applied': True, 'is_premium': True, 'message': 'Premium access applied.', 'expires_at': request.user.subscription_expires_at.isoformat()})
            discount = min(max(promo.discount_value, 0), 99)
            amount_minor = max(1, int((Decimal(amount_minor) * Decimal(100 - discount) / 100).quantize(Decimal('1'), rounding=ROUND_HALF_UP)))

        try:
            checkout_frontend_url = frontend_url()
            paystack_secret()
        except PaymentConfigurationError:
            return Response({'error': 'Payments are temporarily unavailable.'}, status=503)

        reference = f'fs-{request.user.id}-{secrets.token_hex(12)}'
        metadata = {'user_id': request.user.id, 'plan': plan_id, 'payment_reference': reference}
        if promo_code: metadata['promo_code'] = promo_code
        provider_payload = {
            'email': request.user.email, 'amount': amount_minor,
            'currency': plan['currency'], 'reference': reference,
            'callback_url': f'{checkout_frontend_url}/upgrade?reference={reference}',
            'metadata': metadata,
        }
        txn = PaymentTransaction.objects.create(
            user=request.user, email=request.user.email, reference=reference,
            amount=Decimal(amount_minor) / 100, expected_amount_minor=amount_minor,
            currency=plan['currency'], status='initialized', plan=plan_id,
            initialization_key=key, promo_code=promo_code,
        )
        try:
            initialized = initialize_provider(provider_payload)
        except PaymentConfigurationError as exc:
            txn.status, txn.failure_reason = 'failed', str(exc)
            txn.save(update_fields=['status', 'failure_reason', 'updated_at'])
            return Response({'error': 'Payments are temporarily unavailable.'}, status=503)
        except (PaymentValidationError, Exception) as exc:
            logger.exception('Paystack initialization failed')
            txn.status, txn.failure_reason = 'failed', str(exc)[:255]
            txn.save(update_fields=['status', 'failure_reason', 'updated_at'])
            return Response({'error': 'Payment initialization failed. Please try again.'}, status=502)
        result = {'authorization_url': initialized['authorization_url'], 'access_code': initialized.get('access_code'), 'reference': reference}
        txn.status = 'pending'
        txn.paystack_data = {'initialization': result}
        txn.save(update_fields=['status', 'paystack_data', 'updated_at'])
        return Response(result, status=201)


class VerifyPaymentView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        reference = request.query_params.get('reference', '')
        if not reference:
            return Response({'error': 'reference required'}, status=400)
        txn = PaymentTransaction.objects.filter(reference=reference).first()
        if not txn or txn.user_id != request.user.id:
            return Response({'error': 'Payment not found.'}, status=404)
        if txn.fulfilled_at:
            return Response({'success': True, 'payment': transaction_payload(txn), 'expires_at': request.user.subscription_expires_at})
        try:
            data = verify_provider(reference)
            if data.get('status') != 'success':
                provider_status = data.get('status', 'pending')
                if provider_status in {'failed', 'abandoned', 'reversed'}:
                    txn.status = provider_status
                    txn.failure_reason = data.get('gateway_response') or 'Payment was not completed.'
                    txn.save(update_fields=['status', 'failure_reason', 'updated_at'])
                    return Response({'success': False, 'status': provider_status, 'message': txn.failure_reason}, status=402)
                return Response({'success': False, 'status': 'pending', 'message': 'Payment is still pending.'}, status=202)
            txn, _ = fulfill_payment(reference, data)
            request.user.refresh_from_db()
            return Response({'success': True, 'payment': transaction_payload(txn), 'expires_at': request.user.subscription_expires_at})
        except PaymentConfigurationError:
            return Response({'error': 'Payment verification is temporarily unavailable.'}, status=503)
        except PaymentValidationError as exc:
            logger.warning('Rejected payment verification %s: %s', reference, exc)
            return Response({'error': 'Payment details did not match this checkout.'}, status=409)
        except Exception:
            logger.exception('Payment verification failed')
            return Response({'error': 'Verification failed. Please retry.'}, status=503)


class PaystackWebhookView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def post(self, request):
        try:
            secret = paystack_secret()
        except PaymentConfigurationError:
            return Response({'error': 'Webhook unavailable.'}, status=503)
        signature = request.headers.get('X-Paystack-Signature', '')
        expected = hmac.new(secret.encode(), request.body, hashlib.sha512).hexdigest()
        if not signature or not hmac.compare_digest(signature, expected):
            return Response({'error': 'Invalid signature.'}, status=400)
        try:
            event = json.loads(request.body)
        except (ValueError, TypeError):
            return Response({'error': 'Invalid payload.'}, status=400)
        if event.get('event') == 'charge.success':
            data = event.get('data') or {}
            reference = data.get('reference', '')
            try:
                fulfill_payment(reference, data)
            except PaymentTransaction.DoesNotExist:
                logger.warning('Webhook ignored unknown reference %s', reference)
            except PaymentValidationError as exc:
                logger.warning('Webhook rejected %s: %s', reference, exc)
        return Response({'status': 'ok'})


class SubscriptionStatusView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        history = PaymentTransaction.objects.filter(user=user).order_by('-created_at')[:20]
        plan = PAYMENT_PLANS['premium_monthly']
        return Response({
            'is_premium': user.has_active_subscription,
            'current_plan': 'premium_monthly' if user.has_active_subscription else 'free',
            'subscription_expires_at': user.subscription_expires_at.isoformat() if user.subscription_expires_at else None,
            'notes_used': user.total_resources_created, 'notes_limit': user.FREE_NOTES_LIMIT,
            'notes_remaining': max(0, user.FREE_NOTES_LIMIT - user.total_resources_created),
            'at_limit': not user.has_active_subscription and user.total_resources_created >= user.FREE_NOTES_LIMIT,
            'assignments_used': user.total_assignments_created, 'assignments_limit': user.FREE_ASSIGNMENTS_LIMIT,
            'assignments_remaining': max(0, user.FREE_ASSIGNMENTS_LIMIT - user.total_assignments_created),
            'assignments_at_limit': not user.has_active_subscription and user.total_assignments_created >= user.FREE_ASSIGNMENTS_LIMIT,
            'plans': [{'id': 'premium_monthly', 'name': plan['name'], 'amount': str(plan['amount']), 'amount_minor': plan['amount_minor'], 'currency': plan['currency'], 'interval': '30 days'}],
            'payment_history': [transaction_payload(item) for item in history],
        })
