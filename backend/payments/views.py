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
PLAN_PRICE_CENTS = 1000  # GH₵ 10.00 in pesewas (Paystack GHS)
SUBSCRIPTION_DAYS = 30  # 1 month per payment
SUPPORTED_CURRENCIES = {'GHS', 'USD', 'NGN', 'ZAR', 'KES', 'GBP', 'EUR'}


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
                        'currency': 'GHS',
                        'callback_url': callback_url,
                        'metadata': {
                            'user_id': user.id,
                            'username': user.username,
                            'plan': 'premium_monthly',
                            'promo_code': promo_code_str,
                        },
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
                                amount=str(discounted_cents / 100), currency='GHS', status='pending',
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

        # Support geo-based currency from frontend (default GHS for Ghana Paystack)
        req_currency = request.data.get('currency', 'GHS').upper()
        req_amount = request.data.get('amount')
        if req_currency not in SUPPORTED_CURRENCIES:
            req_currency = 'GHS'

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

                # Idempotency: skip if this reference was already processed
                already_processed = PaymentTransaction.objects.filter(
                    reference=reference, status='success'
                ).exists()
                if already_processed:
                    user.refresh_from_db()
                    return Response({
                        'success': True,
                        'is_premium': True,
                        'expires_at': user.subscription_expires_at.isoformat(),
                        'message': 'Payment already confirmed.',
                    })

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
            payment_type = metadata.get('type')

            if user_id:
                from django.contrib.auth import get_user_model
                User = get_user_model()

                # Idempotency: skip if this reference was already processed
                existing_txn = PaymentTransaction.objects.filter(
                    reference=reference, status='success'
                ).exists()
                if existing_txn:
                    logger.info(f"[Paystack Webhook] Reference {reference} already processed — skipping")
                    return Response({'status': 'ok'})

                try:
                    user = User.objects.get(id=user_id)
                    if payment_type == 'xp_pack':
                        # XP packs are deprecated in FlowState 2.0.
                        # Process the payment but do NOT award XP.
                        # Old clients that still initiate this flow get a controlled no-op.
                        xp_amount = int(metadata.get('xp_amount', 0))
                        logger.warning(
                            f"[Paystack Webhook] XP pack purchase deprecated — user {user_id}, "
                            f"amount {xp_amount}. Payment recorded but no XP awarded."
                        )
                    else:
                        _activate_premium(user)
                    PaymentTransaction.objects.filter(reference=reference).update(
                        status='success',
                        paystack_data=data,
                    )
                except User.DoesNotExist:
                    logger.error(f"[Paystack Webhook] User {user_id} not found")

        return Response({'status': 'ok'})


class SubscriptionStatusView(APIView):
    """GET /api/payments/status/"""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        notes_used = user.total_resources_created
        assignments_used = user.total_assignments_created
        return Response({
            'is_premium': user.has_active_subscription,
            'notes_used': notes_used,
            'notes_limit': user.FREE_NOTES_LIMIT,
            'notes_remaining': max(0, user.FREE_NOTES_LIMIT - notes_used),
            'at_limit': not user.has_active_subscription and notes_used >= user.FREE_NOTES_LIMIT,
            'assignments_used': assignments_used,
            'assignments_limit': user.FREE_ASSIGNMENTS_LIMIT,
            'assignments_remaining': max(0, user.FREE_ASSIGNMENTS_LIMIT - assignments_used),
            'assignments_at_limit': not user.has_active_subscription and assignments_used >= user.FREE_ASSIGNMENTS_LIMIT,
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


def deactivate_expired_subscriptions():
    """
    Proactively deactivate all users whose premium has expired.
    Called daily by management command or django-q schedule.
    Returns the number of users deactivated.
    """
    from django.contrib.auth import get_user_model
    User = get_user_model()
    now = timezone.now()

    expired_users = User.objects.filter(
        is_premium=True,
        subscription_expires_at__lt=now,
    )

    count = 0
    for user in expired_users:
        user.is_premium = False
        user.subscription_expires_at = None
        user.save(update_fields=['is_premium', 'subscription_expires_at'])
        count += 1

        try:
            from users.notifications import create_notification
            create_notification(
                user, 'system',
                '🔒 Premium Expired',
                'Your premium access has ended. Upgrade again to keep unlimited study kits and AI features.',
                '/upgrade'
            )
        except Exception:
            pass

        logger.info(f"[Payments] Expired premium for {user.email}")

    if count:
        logger.info(f"[Payments] Deactivated {count} expired subscription(s)")
    return count


# ── MARKETPLACE & POWER-UPS ──────────────────────────────────────────────────

POWERUP_PRICES = {
    'clue_5050':    {'name': '50/50 Clue',       'cost_xp': 250, 'icon': 'tips_and_updates', 'desc': 'Eliminates 2 wrong options in a Quiz Battle'},
    'time_extend':  {'name': 'Time Extension',   'cost_xp': 300, 'icon': 'hourglass_top',    'desc': 'Adds +10 seconds to your question timer'},
    'streak_guard': {'name': 'Streak Guard',     'cost_xp': 500, 'icon': 'shield',           'desc': 'Saves your streak on 1 wrong answer'},
    'double_xp':    {'name': '2x XP Boost',      'cost_xp': 400, 'icon': 'bolt',             'desc': 'Earn double XP for your next 3 Quiz Battles'},
    'hint':         {'name': 'AI Clue / Poll',   'cost_xp': 350, 'icon': 'visibility',       'desc': 'Shows AI answer probability breakdown'},
}

THEME_PRICES = {
    'theme_emerald': {'name': 'Forest Emerald', 'cost_xp': 1000, 'color': '#10b981', 'bg': '#064e3b', 'primary': '#34d399'},
    'theme_amethyst': {'name': 'Royal Amethyst', 'cost_xp': 1200, 'color': '#8b5cf6', 'bg': '#2e1065', 'primary': '#a78bfa'},
    'theme_nordic': {'name': 'Nordic Slate', 'cost_xp': 800, 'color': '#64748b', 'bg': '#0f172a', 'primary': '#94a3b8'},
    'theme_neon': {'name': 'Cyberpunk Neon', 'cost_xp': 2000, 'color': '#ec4899', 'bg': '#09090b', 'primary': '#f472b6'},
}

XP_PACKS = {
    'pack_500': {'xp': 500, 'price_ghs': 10.00, 'amount_cents': 1000, 'name': 'Starter Pack'},
    'pack_1500': {'xp': 1500, 'price_ghs': 25.00, 'amount_cents': 2500, 'name': 'Pro Pack'},
    'pack_5000': {'xp': 5000, 'price_ghs': 70.00, 'amount_cents': 7000, 'name': 'Mega Pack'},
}


class MarketplaceInventoryView(APIView):
    """GET /api/payments/marketplace/inventory/ — Returns user XP balance & power-up inventory."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        obs = user.onboarding_status or {}

        # Sum earned XP from study resources
        from library.models import ResourceProgress
        from django.db.models import Sum
        earned_xp = ResourceProgress.objects.filter(user=user).aggregate(
            total=Sum('xp_earned')
        )['total'] or 0

        quiz_xp = int(obs.get('quiz_xp', 0))
        bonus_xp = int(obs.get('bonus_xp', 0))
        spent_xp = int(obs.get('spent_xp', 0))
        
        net_xp = max(0, earned_xp + quiz_xp + bonus_xp - spent_xp)

        inventory = obs.get('inventory', {
            'clue_5050': 0, 'time_extend': 0, 'streak_guard': 0, 'double_xp': 0, 'hint': 0
        })

        return Response({
            'total_xp': net_xp,
            'earned_xp': earned_xp,
            'quiz_xp': quiz_xp,
            'bonus_xp': bonus_xp,
            'spent_xp': spent_xp,
            'inventory': inventory,
            'unlocked_themes': obs.get('unlocked_themes', ['default', 'light']),
            'catalog': POWERUP_PRICES,
            'themes_catalog': THEME_PRICES,
            'xp_packs': XP_PACKS,
        })


class MarketplaceBuyPowerupView(APIView):
    """POST /api/payments/marketplace/buy-powerup/ — DEPRECATED. XP marketplace retired in FlowState 2.0."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        return Response({
            'error': 'XP marketplace purchases are no longer available. FlowCoins will replace this feature.',
            'deprecated': True,
        }, status=410)


class MarketplaceUsePowerupView(APIView):
    """POST /api/payments/marketplace/use-powerup/ — Mark a powerup as consumed."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        item_id = request.data.get('item_id')
        if not item_id:
            return Response({'error': 'Missing item_id.'}, status=400)
        user = request.user
        obs = user.onboarding_status or {}
        inventory = obs.get('inventory', {})

        count = inventory.get(item_id, 0)
        if count <= 0:
            return Response({'error': 'You don\'t own this powerup.'}, status=400)

        inventory[item_id] = count - 1
        if inventory[item_id] <= 0:
            del inventory[item_id]
        obs['inventory'] = inventory
        user.onboarding_status = obs
        user.save(update_fields=['onboarding_status'])

        return Response({'ok': True, 'inventory': inventory})


class MarketplaceBuyThemeView(APIView):
    """POST /api/payments/marketplace/buy-theme/ — DEPRECATED. XP marketplace retired in FlowState 2.0."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        return Response({
            'error': 'XP theme purchases are no longer available. FlowCoins will replace this feature.',
            'deprecated': True,
        }, status=410)


class MarketplaceBuyXPView(APIView):
    """POST /api/payments/marketplace/buy-xp/ — DEPRECATED. XP packs retired in FlowState 2.0."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        # XP packs are deprecated. Return a controlled error for old clients.
        return Response({
            'error': 'XP packs are no longer available. Earn XP through learning activities instead.',
            'deprecated': True,
        }, status=410)
