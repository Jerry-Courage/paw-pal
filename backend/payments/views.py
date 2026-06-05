import hashlib
import hmac
import json
import logging
import os

import requests
from django.conf import settings
from django.utils import timezone
from datetime import timedelta
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

logger = logging.getLogger('flowstate')

PAYSTACK_SECRET = os.environ.get('PAYSTACK_SECRET_KEY', '')
PLAN_PRICE_CENTS = 99   # $0.99 USD in cents
SUBSCRIPTION_DAYS = 30  # 1 month per payment


def _paystack_headers():
    return {
        'Authorization': f'Bearer {PAYSTACK_SECRET}',
        'Content-Type': 'application/json',
    }


class InitializePaymentView(APIView):
    """
    POST /api/payments/initialize/
    Body: { "callback_url": "...", "promo_code": "SCHOOL2024" }
    Returns Paystack authorization_url.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        from .models import PaymentTransaction, PromoCode, PromoRedemption

        user = request.user
        promo_code_str = request.data.get('promo_code', '').strip().upper()

        # ── Promo code check ────────────────────────────────────
        if promo_code_str:
            try:
                promo = PromoCode.objects.get(code=promo_code_str)
                if not promo.is_valid:
                    return Response({'error': 'This promo code is expired or no longer valid.'}, status=400)
                if PromoRedemption.objects.filter(user=user, promo=promo).exists():
                    return Response({'error': 'You have already used this promo code.'}, status=400)

                # Apply promo — grant free days or percent discount
                if promo.discount_type == 'free_days':
                    _activate_premium(user, days=promo.discount_value)
                    PromoRedemption.objects.create(user=user, promo=promo)
                    promo.times_used += 1
                    promo.save(update_fields=['times_used'])
                    return Response({
                        'promo_applied': True,
                        'message': f'🎉 Promo applied! {promo.discount_value} days of Premium unlocked.',
                        'is_premium': True,
                        'expires_at': user.subscription_expires_at.isoformat(),
                    })
                elif promo.discount_type == 'percent_off':
                    # percent_off: reduce the charge amount and proceed to Paystack
                    discount_pct = min(promo.discount_value, 100)
                    discounted_cents = max(1, int(PLAN_PRICE_CENTS * (1 - discount_pct / 100)))
                    PromoRedemption.objects.create(user=user, promo=promo)
                    promo.times_used += 1
                    promo.save(update_fields=['times_used'])
                    # Fall through to Paystack with discounted amount
                    callback_url = request.data.get(
                        'callback_url',
                        f"{os.environ.get('FRONTEND_URL', 'https://flowstate-frontend-7irq.onrender.com')}/dashboard?payment=success"
                    )
                    payload = {
                        'email': user.email,
                        'amount': discounted_cents,
                        'currency': 'USD',
                        'callback_url': callback_url,
                        'metadata': {
                            'user_id': user.id,
                            'username': user.username,
                            'plan': 'premium_monthly',
                            'promo_code': promo_code_str,
                        },
                        'channels': ['card'],
                    }
                    try:
                        resp = requests.post(
                            'https://api.paystack.co/transaction/initialize',
                            headers=_paystack_headers(),
                            json=payload,
                            timeout=10,
                        )
                        data = resp.json()
                        if data.get('status'):
                            ref = data['data']['reference']
                            PaymentTransaction.objects.create(
                                user=user, email=user.email, reference=ref,
                                amount=str(discounted_cents / 100), currency='USD', status='pending',
                            )
                            return Response({
                                'authorization_url': data['data']['authorization_url'],
                                'access_code': data['data']['access_code'],
                                'reference': ref,
                                'promo_applied': True,
                                'discount_pct': discount_pct,
                                'message': f'{discount_pct}% discount applied!',
                            })
                        return Response({'error': data.get('message', 'Payment init failed')}, status=502)
                    except Exception as e:
                        logger.error(f"[Paystack] Initialize error with promo: {e}")
                        return Response({'error': 'Payment service unavailable'}, status=503)
            except PromoCode.DoesNotExist:
                return Response({'error': 'Invalid promo code.'}, status=400)

        # ── Normal Paystack payment ──────────────────────────────
        callback_url = request.data.get(
            'callback_url',
            f"{os.environ.get('FRONTEND_URL', 'https://flowstate-frontend-7irq.onrender.com')}/dashboard?payment=success"
        )

        # Support geo-based currency from frontend
        req_currency = request.data.get('currency', 'USD').upper()
        req_amount = request.data.get('amount')
        SUPPORTED_CURRENCIES = {'USD', 'GHS', 'NGN', 'ZAR', 'KES', 'GBP', 'EUR'}
        if req_currency not in SUPPORTED_CURRENCIES:
            req_currency = 'USD'

        if req_amount:
            try:
                amount_cents = int(float(req_amount) * 100)
            except (ValueError, TypeError):
                amount_cents = PLAN_PRICE_CENTS
        else:
            amount_cents = PLAN_PRICE_CENTS

        payload = {
            'email': user.email,
            'amount': amount_cents,
            'currency': req_currency,
            'callback_url': callback_url,
            'metadata': {
                'user_id': user.id,
                'username': user.username,
                'plan': 'premium_monthly',
            },
            'channels': ['card'],
        }

        try:
            resp = requests.post(
                'https://api.paystack.co/transaction/initialize',
                headers=_paystack_headers(),
                json=payload,
                timeout=10,
            )
            data = resp.json()
            if data.get('status'):
                ref = data['data']['reference']
                # Record pending transaction
                PaymentTransaction.objects.create(
                    user=user,
                    email=user.email,
                    reference=ref,
                    amount='0.99',
                    currency='USD',
                    status='pending',
                )
                return Response({
                    'authorization_url': data['data']['authorization_url'],
                    'access_code': data['data']['access_code'],
                    'reference': ref,
                })
            logger.error(f"[Paystack] Initialize failed: {data}")
            return Response({'error': data.get('message', 'Payment init failed')}, status=502)
        except Exception as e:
            logger.error(f"[Paystack] Initialize error: {e}")
            return Response({'error': 'Payment service unavailable'}, status=503)


class VerifyPaymentView(APIView):
    """
    GET /api/payments/verify/?reference=xxx
    Called by frontend after Paystack popup closes.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from .models import PaymentTransaction
        reference = request.query_params.get('reference')
        if not reference:
            return Response({'error': 'reference required'}, status=400)

        try:
            resp = requests.get(
                f'https://api.paystack.co/transaction/verify/{reference}',
                headers=_paystack_headers(),
                timeout=10,
            )
            data = resp.json()
            if data.get('status') and data['data']['status'] == 'success':
                user = request.user
                _activate_premium(user)
                # Update transaction record
                PaymentTransaction.objects.filter(reference=reference).update(
                    status='success',
                    paystack_data=data.get('data', {}),
                )
                return Response({
                    'success': True,
                    'is_premium': True,
                    'expires_at': user.subscription_expires_at.isoformat(),
                    'message': 'Payment confirmed. Welcome to Premium!',
                })
            # Mark as failed/abandoned
            PaymentTransaction.objects.filter(reference=reference).update(status='abandoned')
            return Response({'success': False, 'message': 'Payment not completed'}, status=402)
        except Exception as e:
            logger.error(f"[Paystack] Verify error: {e}")
            return Response({'error': 'Verification failed'}, status=503)


class PaystackWebhookView(APIView):
    """
    POST /api/payments/webhook/
    Paystack server-to-server event delivery.
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        from .models import PaymentTransaction
        # Verify HMAC signature
        signature = request.headers.get('X-Paystack-Signature', '')
        body = request.body
        expected = hmac.new(
            PAYSTACK_SECRET.encode('utf-8'),
            body,
            hashlib.sha512
        ).hexdigest()

        if not hmac.compare_digest(signature, expected):
            logger.warning('[Paystack Webhook] Invalid signature')
            return Response({'error': 'Invalid signature'}, status=400)

        try:
            event = json.loads(body)
        except Exception:
            return Response({'error': 'Bad payload'}, status=400)

        event_type = event.get('event')
        data = event.get('data', {})

        if event_type == 'charge.success':
            reference = data.get('reference', '')
            metadata = data.get('metadata', {})
            user_id = metadata.get('user_id')

            if user_id:
                from django.contrib.auth import get_user_model
                User = get_user_model()
                try:
                    user = User.objects.get(id=user_id)
                    _activate_premium(user)
                    PaymentTransaction.objects.filter(reference=reference).update(
                        status='success',
                        paystack_data=data,
                    )
                    logger.info(f"[Paystack Webhook] Premium activated for user {user_id}")
                except User.DoesNotExist:
                    logger.error(f"[Paystack Webhook] User {user_id} not found")

        return Response({'status': 'ok'})


class SubscriptionStatusView(APIView):
    """GET /api/payments/status/"""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        notes_used = user.resources.count()
        return Response({
            'is_premium': user.has_active_subscription,
            'notes_used': notes_used,
            'notes_limit': user.FREE_NOTES_LIMIT,
            'notes_remaining': max(0, user.FREE_NOTES_LIMIT - notes_used),
            'at_limit': not user.has_active_subscription and notes_used >= user.FREE_NOTES_LIMIT,
            'subscription_expires_at': (
                user.subscription_expires_at.isoformat()
                if user.subscription_expires_at else None
            ),
        })


class ApplyPromoCodeView(APIView):
    """POST /api/payments/promo/ — standalone promo code redemption."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        from .models import PromoCode, PromoRedemption
        code = request.data.get('code', '').strip().upper()
        if not code:
            return Response({'error': 'code required'}, status=400)

        try:
            promo = PromoCode.objects.get(code=code)
        except PromoCode.DoesNotExist:
            return Response({'error': 'Invalid promo code.'}, status=400)

        if not promo.is_valid:
            return Response({'error': 'This promo code is expired or no longer valid.'}, status=400)

        user = request.user
        if PromoRedemption.objects.filter(user=user, promo=promo).exists():
            return Response({'error': 'You have already used this promo code.'}, status=400)

        if promo.discount_type == 'free_days':
            _activate_premium(user, days=promo.discount_value)
            PromoRedemption.objects.create(user=user, promo=promo)
            promo.times_used += 1
            promo.save(update_fields=['times_used'])
            return Response({
                'success': True,
                'message': f'🎉 {promo.discount_value} days of Premium unlocked!',
                'is_premium': True,
                'expires_at': user.subscription_expires_at.isoformat(),
            })

        if promo.discount_type == 'percent_off':
            # percent_off via standalone endpoint: not valid without a payment flow.
            # Redirect caller to use /payments/initialize/ with the promo code instead.
            return Response({
                'error': 'This promo code gives a discount on payment. Use it at checkout.',
                'requires_payment': True,
            }, status=400)

        return Response({'error': 'Unsupported promo type.'}, status=400)


def _activate_premium(user, days: int = SUBSCRIPTION_DAYS):
    """Grant premium access. Extends existing subscription if still active."""
    now = timezone.now()
    current_expiry = user.subscription_expires_at or now
    new_expiry = max(current_expiry, now) + timedelta(days=days)
    user.is_premium = True
    user.subscription_expires_at = new_expiry
    user.save(update_fields=['is_premium', 'subscription_expires_at'])
    logger.info(f"[Payments] Premium activated for {user.email} until {new_expiry}")

    # Send welcome notification
    try:
        from users.notifications import create_notification
        create_notification(
            user, 'system',
            '🎉 Premium Activated!',
            f'Your premium access is active until {new_expiry.strftime("%B %d, %Y")}. Enjoy unlimited study kits!',
            '/library'
        )
    except Exception:
        pass


def send_expiry_reminders():
    """
    Called by a scheduled task (django-q or cron).
    Sends a notification to users whose premium expires in 3 days.
    """
    from django.contrib.auth import get_user_model
    User = get_user_model()
    now = timezone.now()
    reminder_window_start = now + timedelta(days=2, hours=23)
    reminder_window_end = now + timedelta(days=3, hours=1)

    expiring_users = User.objects.filter(
        is_premium=True,
        subscription_expires_at__gte=reminder_window_start,
        subscription_expires_at__lte=reminder_window_end,
    )

    for user in expiring_users:
        try:
            from users.notifications import create_notification
            create_notification(
                user, 'system',
                '⏰ Premium Expiring Soon',
                'Your premium access expires in 3 days. Renew now to keep unlimited study kits.',
                '/library'
            )
            logger.info(f"[Payments] Expiry reminder sent to {user.email}")
        except Exception as e:
            logger.error(f"[Payments] Reminder failed for {user.email}: {e}")
