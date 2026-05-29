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
PLAN_PRICE_KOBO = 99  # $0.99 USD — Paystack uses smallest currency unit
                       # For NGN schools set this to e.g. 150000 (₦1,500)
SUBSCRIPTION_DAYS = 30  # 1 month per payment


def _paystack_headers():
    return {
        'Authorization': f'Bearer {PAYSTACK_SECRET}',
        'Content-Type': 'application/json',
    }


class InitializePaymentView(APIView):
    """
    POST /api/payments/initialize/
    Body: { "callback_url": "https://..." }  (optional — frontend can handle redirect)
    Returns Paystack authorization_url to redirect/popup the user.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        user = request.user
        callback_url = request.data.get(
            'callback_url',
            f"{os.environ.get('FRONTEND_URL', 'https://flowstate-frontend-7irq.onrender.com')}/dashboard?payment=success"
        )

        payload = {
            'email': user.email,
            'amount': PLAN_PRICE_KOBO,   # in smallest unit (kobo/cents)
            'currency': 'USD',
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
                return Response({
                    'authorization_url': data['data']['authorization_url'],
                    'access_code': data['data']['access_code'],
                    'reference': data['data']['reference'],
                })
            logger.error(f"[Paystack] Initialize failed: {data}")
            return Response({'error': data.get('message', 'Payment init failed')}, status=502)
        except Exception as e:
            logger.error(f"[Paystack] Initialize error: {e}")
            return Response({'error': 'Payment service unavailable'}, status=503)


class VerifyPaymentView(APIView):
    """
    GET /api/payments/verify/?reference=xxx
    Called by frontend after Paystack redirect to confirm payment.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
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
                return Response({
                    'success': True,
                    'is_premium': True,
                    'expires_at': user.subscription_expires_at.isoformat(),
                    'message': 'Payment confirmed. Welcome to Premium!',
                })
            return Response({'success': False, 'message': 'Payment not completed'}, status=402)
        except Exception as e:
            logger.error(f"[Paystack] Verify error: {e}")
            return Response({'error': 'Verification failed'}, status=503)


class PaystackWebhookView(APIView):
    """
    POST /api/payments/webhook/
    Paystack sends events here. Verify signature and activate premium.
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        # Verify Paystack signature
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
            metadata = data.get('metadata', {})
            user_id = metadata.get('user_id')
            if user_id:
                from django.contrib.auth import get_user_model
                User = get_user_model()
                try:
                    user = User.objects.get(id=user_id)
                    _activate_premium(user)
                    logger.info(f"[Paystack] Premium activated for user {user_id} via webhook")
                except User.DoesNotExist:
                    logger.error(f"[Paystack] Webhook: user {user_id} not found")

        return Response({'status': 'ok'})


class SubscriptionStatusView(APIView):
    """
    GET /api/payments/status/
    Returns current subscription state + usage count for the frontend.
    """
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


def _activate_premium(user):
    """Grant premium access for SUBSCRIPTION_DAYS from now."""
    now = timezone.now()
    # Extend if already premium, otherwise start fresh
    current_expiry = user.subscription_expires_at or now
    new_expiry = max(current_expiry, now) + timedelta(days=SUBSCRIPTION_DAYS)
    user.is_premium = True
    user.subscription_expires_at = new_expiry
    user.save(update_fields=['is_premium', 'subscription_expires_at'])
    logger.info(f"[Paystack] Premium activated for {user.email} until {new_expiry}")
