import logging
import os
from datetime import timedelta
from decimal import Decimal

import requests
from django.db import transaction
from django.utils import timezone
from urllib.parse import urlparse

from .models import PaymentTransaction, PromoCode, PromoRedemption

logger = logging.getLogger('flowstate')

PAYMENT_PLANS = {
    'premium_monthly': {
        'name': 'FlowState Premium', 'amount_minor': 1000,
        'amount': Decimal('10.00'), 'currency': 'GHS', 'days': 30,
    },
}


class PaymentConfigurationError(Exception): pass
class PaymentValidationError(Exception): pass


def paystack_secret():
    secret = os.environ.get('PAYSTACK_SECRET_KEY', '').strip()
    mode = os.environ.get('PAYSTACK_MODE', '').strip().lower()
    if mode not in {'test', 'live'}:
        raise PaymentConfigurationError('PAYSTACK_MODE must be explicitly set to test or live.')
    expected = 'sk_live_' if mode == 'live' else 'sk_test_'
    if not secret or not secret.startswith(expected):
        raise PaymentConfigurationError(f'Paystack {mode} credentials are not configured correctly.')
    return secret


def frontend_url():
    value = os.environ.get('FRONTEND_URL', '').strip().rstrip('/')
    parsed = urlparse(value)
    if not value or parsed.scheme not in {'http', 'https'} or not parsed.netloc:
        raise PaymentConfigurationError('FRONTEND_URL is not configured correctly.')
    return value


def paystack_headers():
    return {'Authorization': f'Bearer {paystack_secret()}', 'Content-Type': 'application/json'}


def initialize_provider(payload):
    response = requests.post('https://api.paystack.co/transaction/initialize', headers=paystack_headers(), json=payload, timeout=15)
    data = response.json()
    if not response.ok or not data.get('status'):
        raise PaymentValidationError(data.get('message', 'Payment initialization failed.'))
    return data['data']


def verify_provider(reference):
    response = requests.get(f'https://api.paystack.co/transaction/verify/{reference}', headers=paystack_headers(), timeout=15)
    data = response.json()
    if not response.ok or not data.get('status'):
        raise PaymentValidationError(data.get('message', 'Payment verification failed.'))
    return data['data']


def activate_premium(user, days=30):
    now = timezone.now()
    user.subscription_expires_at = max(user.subscription_expires_at or now, now) + timedelta(days=days)
    user.is_premium = True
    user.save(update_fields=['is_premium', 'subscription_expires_at'])


def safe_provider_data(data):
    authorization = data.get('authorization') or {}
    return {
        'id': data.get('id'), 'status': data.get('status'),
        'reference': data.get('reference'), 'amount': data.get('amount'),
        'currency': data.get('currency'), 'channel': data.get('channel'),
        'gateway_response': data.get('gateway_response'),
        'paid_at': data.get('paid_at'),
        'metadata': {
            'user_id': (data.get('metadata') or {}).get('user_id'),
            'plan': (data.get('metadata') or {}).get('plan'),
            'payment_reference': (data.get('metadata') or {}).get('payment_reference'),
        },
        'authorization': {
            'brand': authorization.get('brand') or authorization.get('card_type'),
            'last4': authorization.get('last4'),
            'channel': authorization.get('channel'),
        },
    }


@transaction.atomic
def fulfill_payment(reference, provider_data):
    txn = PaymentTransaction.objects.select_for_update().select_related('user').get(reference=reference)
    if txn.fulfilled_at:
        return txn, False
    metadata = provider_data.get('metadata') or {}
    checks = {
        'provider status': provider_data.get('status') == 'success',
        'reference': str(provider_data.get('reference')) == txn.reference,
        'amount': int(provider_data.get('amount') or -1) == txn.expected_amount_minor,
        'currency': str(provider_data.get('currency', '')).upper() == txn.currency,
        'user': str(metadata.get('user_id')) == str(txn.user_id),
        'plan': metadata.get('plan') == txn.plan,
    }
    failed = [name for name, valid in checks.items() if not valid]
    if failed:
        txn.failure_reason = 'Verification mismatch: ' + ', '.join(failed)
        txn.paystack_data = safe_provider_data(provider_data)
        txn.save(update_fields=['failure_reason', 'paystack_data', 'updated_at'])
        raise PaymentValidationError(txn.failure_reason)
    plan = PAYMENT_PLANS.get(txn.plan)
    if not plan or not txn.user:
        raise PaymentValidationError('Payment is not linked to a valid entitlement.')
    activate_premium(txn.user, plan['days'])
    authorization = provider_data.get('authorization') or {}
    txn.status = 'success'
    txn.paid_amount_minor = provider_data['amount']
    txn.provider_transaction_id = str(provider_data.get('id') or '')
    txn.channel = provider_data.get('channel') or authorization.get('channel') or ''
    txn.card_brand = authorization.get('brand') or authorization.get('card_type') or ''
    txn.card_last4 = str(authorization.get('last4') or '')[-4:]
    txn.paid_at = timezone.now()
    txn.fulfilled_at = timezone.now()
    txn.failure_reason = ''
    txn.paystack_data = safe_provider_data(provider_data)
    txn.save()
    if txn.promo_code:
        promo = PromoCode.objects.select_for_update().filter(code=txn.promo_code).first()
        if promo and not PromoRedemption.objects.filter(user=txn.user, promo=promo).exists():
            PromoRedemption.objects.create(user=txn.user, promo=promo)
            promo.times_used += 1
            promo.save(update_fields=['times_used'])
    return txn, True
