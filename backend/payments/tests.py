import hashlib
import hmac
import json
import os
from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from .models import PaymentTransaction, PromoCode
from .services import PaymentConfigurationError, PaymentValidationError, fulfill_payment, paystack_secret


class PaymentMigrationCompatibilityTests(TransactionTestCase):
    migrate_from = [('users', '0007_user_subscription_fields'), ('payments', '0001_initial')]
    migrate_to = [('users', '0007_user_subscription_fields'), ('payments', '0002_payment_security_fields')]

    def test_existing_payment_and_premium_entitlement_survive_security_migration(self):
        executor = MigrationExecutor(connection)
        executor.migrate(self.migrate_from)
        old_apps = executor.loader.project_state(self.migrate_from).apps
        User = old_apps.get_model('users', 'User')
        Payment = old_apps.get_model('payments', 'PaymentTransaction')
        expiry = timezone.now() + timedelta(days=20)
        user = User.objects.create(username='legacy-premium', email='legacy@example.com', is_premium=True, subscription_expires_at=expiry)
        Payment.objects.create(user_id=user.id, email=user.email, reference='legacy-paystack-ref', amount='0.99', currency='USD', status='success', plan='premium_monthly', paystack_data={})

        executor = MigrationExecutor(connection)
        executor.migrate(self.migrate_to)
        apps = executor.loader.project_state(self.migrate_to).apps
        MigratedUser = apps.get_model('users', 'User')
        MigratedPayment = apps.get_model('payments', 'PaymentTransaction')
        migrated_user = MigratedUser.objects.get(pk=user.id)
        migrated_payment = MigratedPayment.objects.get(reference='legacy-paystack-ref')

        self.assertTrue(migrated_user.is_premium)
        self.assertEqual(migrated_user.subscription_expires_at, expiry)
        self.assertEqual(migrated_payment.status, 'success')
        self.assertEqual(migrated_payment.currency, 'USD')
        self.assertEqual(migrated_payment.expected_amount_minor, 0)
        self.assertIsNone(migrated_payment.fulfilled_at)


class PaymentSecurityTests(APITestCase):
    def setUp(self):
        self.environment = patch.dict(os.environ, {
            'PAYSTACK_SECRET_KEY': 'sk_test_payment-suite',
            'PAYSTACK_MODE': 'test',
            'FRONTEND_URL': 'https://flowstate.example',
        })
        self.environment.start()
        self.addCleanup(self.environment.stop)
        User = get_user_model()
        self.user = User.objects.create_user(username='payer', email='payer@example.com', password='test-pass')
        self.other = User.objects.create_user(username='other', email='other@example.com', password='test-pass')
        self.client.force_authenticate(self.user)

    def transaction(self, **overrides):
        values = dict(user=self.user, email=self.user.email, reference='fs-1-test', amount='10.00', expected_amount_minor=1000, currency='GHS', status='pending', plan='premium_monthly')
        values.update(overrides)
        return PaymentTransaction.objects.create(**values)

    def provider_data(self, **overrides):
        values = {'id': 123, 'status': 'success', 'reference': 'fs-1-test', 'amount': 1000, 'currency': 'GHS', 'channel': 'card', 'metadata': {'user_id': self.user.id, 'plan': 'premium_monthly'}, 'authorization': {'brand': 'visa', 'last4': '4081'}}
        values.update(overrides)
        return values

    def webhook(self, data=None):
        body = json.dumps({'event': 'charge.success', 'data': data or self.provider_data()}, separators=(',', ':')).encode()
        signature = hmac.new(b'sk_test_payment-suite', body, hashlib.sha512).hexdigest()
        return self.client.post('/api/payments/webhook/', data=body, content_type='application/json', HTTP_X_PAYSTACK_SIGNATURE=signature)

    @patch('payments.secure_views.initialize_provider')
    def test_initialization_ignores_client_amount_and_currency(self, initialize):
        initialize.return_value = {'authorization_url': 'https://checkout.paystack.com/x', 'access_code': 'x'}
        response = self.client.post('/api/payments/initialize/', {'plan_id': 'premium_monthly', 'amount': 1, 'currency': 'USD', 'callback_url': 'https://evil.example'})
        self.assertEqual(response.status_code, 201)
        payload = initialize.call_args.args[0]
        self.assertEqual((payload['amount'], payload['currency']), (1000, 'GHS'))
        self.assertNotIn('evil.example', payload['callback_url'])

    @patch('payments.secure_views.initialize_provider')
    def test_initialization_ignores_all_client_authority_fields(self, initialize):
        initialize.return_value = {'authorization_url': 'https://checkout.paystack.com/x', 'access_code': 'x'}
        response = self.client.post('/api/payments/initialize/', {
            'plan_id': 'premium_monthly', 'amount': 100000, 'currency': 'NGN',
            'user_id': self.other.id, 'callback_url': 'https://attacker.example',
            'plan_name': 'premium', 'duration': 9999,
        })
        self.assertEqual(response.status_code, 201)
        payload = initialize.call_args.args[0]
        self.assertEqual(payload['amount'], 1000)
        self.assertEqual(payload['currency'], 'GHS')
        self.assertEqual(payload['metadata']['user_id'], self.user.id)
        self.assertEqual(payload['metadata']['plan'], 'premium_monthly')
        self.assertTrue(payload['callback_url'].startswith('https://flowstate.example/'))

    @patch('payments.secure_views.initialize_provider')
    def test_initialization_is_idempotent(self, initialize):
        initialize.return_value = {'authorization_url': 'https://checkout.paystack.com/x', 'access_code': 'x'}
        body = {'plan_id': 'premium_monthly', 'idempotency_key': 'same'}
        first = self.client.post('/api/payments/initialize/', body)
        second = self.client.post('/api/payments/initialize/', body)
        self.assertEqual(first.data['reference'], second.data['reference'])
        self.assertEqual(initialize.call_count, 1)

    @patch('payments.secure_views.initialize_provider')
    def test_idempotency_key_is_isolated_between_users(self, initialize):
        initialize.side_effect = [
            {'authorization_url': 'https://checkout.paystack.com/a', 'access_code': 'a'},
            {'authorization_url': 'https://checkout.paystack.com/b', 'access_code': 'b'},
        ]
        body = {'plan_id': 'premium_monthly', 'idempotency_key': 'shared-string'}
        first = self.client.post('/api/payments/initialize/', body)
        self.client.force_authenticate(self.other)
        second = self.client.post('/api/payments/initialize/', body)
        self.assertNotEqual(first.data['reference'], second.data['reference'])
        self.assertEqual(initialize.call_count, 2)

    @patch('payments.secure_views.initialize_provider')
    def test_idempotency_key_cannot_change_original_checkout(self, initialize):
        initialize.return_value = {'authorization_url': 'https://checkout.paystack.com/x', 'access_code': 'x'}
        first = self.client.post('/api/payments/initialize/', {'plan_id': 'premium_monthly', 'idempotency_key': 'fixed'})
        second = self.client.post('/api/payments/initialize/', {'plan_id': 'premium_monthly', 'idempotency_key': 'fixed', 'amount': 1, 'duration': 9999})
        self.assertEqual(first.data['reference'], second.data['reference'])
        txn = PaymentTransaction.objects.get(reference=first.data['reference'])
        self.assertEqual((txn.amount, txn.plan), (txn.amount.__class__('10.00'), 'premium_monthly'))

    def test_amount_mismatch_never_fulfills(self):
        self.transaction()
        with self.assertRaises(PaymentValidationError): fulfill_payment('fs-1-test', self.provider_data(amount=999))
        self.user.refresh_from_db(); self.assertFalse(self.user.is_premium)

    def test_currency_mismatch_never_fulfills(self):
        self.transaction()
        with self.assertRaises(PaymentValidationError): fulfill_payment('fs-1-test', self.provider_data(currency='USD'))

    def test_owner_mismatch_never_fulfills(self):
        self.transaction()
        with self.assertRaises(PaymentValidationError): fulfill_payment('fs-1-test', self.provider_data(metadata={'user_id': self.other.id, 'plan': 'premium_monthly'}))

    def test_plan_mismatch_never_fulfills(self):
        self.transaction()
        with self.assertRaises(PaymentValidationError): fulfill_payment('fs-1-test', self.provider_data(metadata={'user_id': self.user.id, 'plan': 'other'}))

    def test_success_fulfills_once(self):
        self.transaction()
        _, created = fulfill_payment('fs-1-test', self.provider_data())
        self.user.refresh_from_db(); expiry = self.user.subscription_expires_at
        _, created_again = fulfill_payment('fs-1-test', self.provider_data())
        self.user.refresh_from_db()
        self.assertTrue(created); self.assertFalse(created_again); self.assertEqual(expiry, self.user.subscription_expires_at)

    def test_active_renewal_extends_existing_expiry_once(self):
        original_expiry = timezone.now() + timedelta(days=12)
        self.user.is_premium = True; self.user.subscription_expires_at = original_expiry
        self.user.save(update_fields=['is_premium', 'subscription_expires_at'])
        self.transaction()
        fulfill_payment('fs-1-test', self.provider_data())
        self.user.refresh_from_db(); renewed = self.user.subscription_expires_at
        self.assertAlmostEqual((renewed - original_expiry).total_seconds(), timedelta(days=30).total_seconds(), delta=1)
        fulfill_payment('fs-1-test', self.provider_data())
        self.user.refresh_from_db(); self.assertEqual(self.user.subscription_expires_at, renewed)

    def test_existing_premium_and_legacy_payment_remain_unchanged(self):
        expiry = timezone.now() + timedelta(days=18)
        self.user.is_premium = True; self.user.subscription_expires_at = expiry
        self.user.save(update_fields=['is_premium', 'subscription_expires_at'])
        legacy = self.transaction(reference='legacy-success', amount='0.99', expected_amount_minor=0, currency='USD', status='success')
        response = self.client.get('/api/payments/status/')
        self.user.refresh_from_db(); legacy.refresh_from_db()
        self.assertTrue(response.data['is_premium'])
        self.assertEqual(self.user.subscription_expires_at, expiry)
        self.assertEqual((legacy.status, legacy.fulfilled_at, legacy.expected_amount_minor), ('success', None, 0))

    def test_ghana_mobile_money_metadata_is_recorded(self):
        self.transaction()
        txn, _ = fulfill_payment('fs-1-test', self.provider_data(channel='mobile_money', authorization={'channel': 'mobile_money'}))
        self.assertEqual(txn.channel, 'mobile_money')

    def test_international_card_safe_metadata_is_recorded(self):
        self.transaction()
        data = self.provider_data(authorization={'brand': 'mastercard', 'last4': '9912', 'authorization_code': 'must-not-store'})
        txn, _ = fulfill_payment('fs-1-test', data)
        self.assertEqual((txn.card_brand, txn.card_last4), ('mastercard', '9912'))
        self.assertNotIn('authorization_code', json.dumps(txn.paystack_data))

    @patch('payments.secure_views.verify_provider')
    def test_failed_payment_records_failure_without_entitlement(self, verify):
        self.transaction(); verify.return_value = self.provider_data(status='failed', gateway_response='Declined')
        response = self.client.get('/api/payments/verify/?reference=fs-1-test')
        self.assertEqual(response.status_code, 402)
        self.user.refresh_from_db(); self.assertFalse(self.user.is_premium)

    def test_unknown_plan_rejected_before_provider(self):
        response = self.client.post('/api/payments/initialize/', {'plan_id': 'invented'})
        self.assertEqual(response.status_code, 400)

    def test_cross_user_verify_is_hidden(self):
        self.transaction()
        self.client.force_authenticate(self.other)
        response = self.client.get('/api/payments/verify/?reference=fs-1-test')
        self.assertEqual(response.status_code, 404)

    @patch('payments.secure_views.verify_provider')
    def test_pending_verify_does_not_fulfill(self, verify):
        self.transaction(); verify.return_value = self.provider_data(status='ongoing')
        response = self.client.get('/api/payments/verify/?reference=fs-1-test')
        self.assertEqual(response.status_code, 202)
        self.user.refresh_from_db(); self.assertFalse(self.user.is_premium)

    @patch('payments.secure_views.verify_provider')
    def test_callback_only_fulfills_and_survives_fresh_session(self, verify):
        self.transaction(); verify.return_value = self.provider_data()
        response = self.client.get('/api/payments/verify/?reference=fs-1-test')
        self.assertTrue(response.data['success'])
        self.client.logout(); self.client.force_authenticate(self.user)
        fresh = self.client.get('/api/payments/status/')
        self.assertTrue(fresh.data['is_premium'])

    def test_webhook_only_fulfills_without_browser_callback(self):
        self.transaction()
        self.assertEqual(self.webhook().status_code, 200)
        self.user.refresh_from_db(); self.assertTrue(self.user.has_active_subscription)

    @patch('payments.secure_views.verify_provider')
    def test_callback_then_webhook_fulfills_once(self, verify):
        self.transaction(); verify.return_value = self.provider_data()
        self.client.get('/api/payments/verify/?reference=fs-1-test')
        self.user.refresh_from_db(); expiry = self.user.subscription_expires_at
        self.webhook(); self.user.refresh_from_db()
        self.assertEqual(self.user.subscription_expires_at, expiry)

    @patch('payments.secure_views.verify_provider')
    def test_webhook_then_callback_fulfills_once(self, verify):
        self.transaction(); verify.return_value = self.provider_data()
        self.webhook(); self.user.refresh_from_db(); expiry = self.user.subscription_expires_at
        response = self.client.get('/api/payments/verify/?reference=fs-1-test')
        self.user.refresh_from_db()
        self.assertTrue(response.data['success']); self.assertEqual(self.user.subscription_expires_at, expiry)

    @override_settings()
    @patch.dict('os.environ', {'PAYSTACK_SECRET_KEY': 'sk_test_webhook', 'PAYSTACK_MODE': 'test'})
    def test_webhook_signature_and_duplicate_are_safe(self):
        self.transaction()
        body = json.dumps({'event': 'charge.success', 'data': self.provider_data()}, separators=(',', ':')).encode()
        signature = hmac.new(b'sk_test_webhook', body, hashlib.sha512).hexdigest()
        first = self.client.post('/api/payments/webhook/', data=body, content_type='application/json', HTTP_X_PAYSTACK_SIGNATURE=signature)
        self.user.refresh_from_db(); expiry = self.user.subscription_expires_at
        second = self.client.post('/api/payments/webhook/', data=body, content_type='application/json', HTTP_X_PAYSTACK_SIGNATURE=signature)
        self.user.refresh_from_db()
        self.assertEqual((first.status_code, second.status_code), (200, 200)); self.assertEqual(expiry, self.user.subscription_expires_at)

    @patch.dict('os.environ', {'PAYSTACK_SECRET_KEY': 'sk_test_webhook', 'PAYSTACK_MODE': 'test'})
    def test_invalid_webhook_signature_rejected(self):
        response = self.client.post('/api/payments/webhook/', data=b'{}', content_type='application/json', HTTP_X_PAYSTACK_SIGNATURE='wrong')
        self.assertEqual(response.status_code, 400)

    def test_status_exposes_only_safe_card_metadata(self):
        self.transaction(card_brand='visa', card_last4='4081')
        response = self.client.get('/api/payments/status/')
        self.assertEqual(response.status_code, 200)
        serialized = json.dumps(response.data)
        self.assertIn('4081', serialized); self.assertNotIn('authorization_code', serialized)

    def test_payment_history_isolated_by_authenticated_owner(self):
        self.transaction(card_brand='visa', card_last4='4081')
        PaymentTransaction.objects.create(user=self.other, email=self.other.email, reference='other-secret', amount='10.00', expected_amount_minor=1000, currency='GHS')
        serialized = json.dumps(self.client.get('/api/payments/status/').data)
        self.assertIn('fs-1-test', serialized); self.assertNotIn('other-secret', serialized)

    @patch('payments.secure_views.verify_provider')
    def test_forged_success_query_never_bypasses_server_verification(self, verify):
        self.transaction(); verify.return_value = self.provider_data(status='ongoing')
        response = self.client.get('/api/payments/verify/?reference=fs-1-test&status=success')
        self.assertEqual(response.status_code, 202)
        self.user.refresh_from_db(); self.assertFalse(self.user.is_premium)

    def test_invalid_or_mismatched_paystack_mode_fails_closed(self):
        cases = [
            {'PAYSTACK_MODE': 'invalid', 'PAYSTACK_SECRET_KEY': 'sk_test_x'},
            {'PAYSTACK_MODE': 'live', 'PAYSTACK_SECRET_KEY': 'sk_test_x'},
            {'PAYSTACK_MODE': 'test', 'PAYSTACK_SECRET_KEY': 'sk_live_x'},
        ]
        for environment in cases:
            with self.subTest(environment=environment), patch.dict(os.environ, environment, clear=True):
                with self.assertRaises(PaymentConfigurationError): paystack_secret()

    @patch('payments.secure_views.initialize_provider')
    def test_missing_frontend_url_fails_before_provider(self, initialize):
        with patch.dict(os.environ, {'PAYSTACK_MODE': 'test', 'PAYSTACK_SECRET_KEY': 'sk_test_x'}, clear=True):
            response = self.client.post('/api/payments/initialize/', {'plan_id': 'premium_monthly'})
        self.assertEqual(response.status_code, 503)
        initialize.assert_not_called()

    def test_invalid_promo_does_not_change_entitlement(self):
        PromoCode.objects.create(code='EXPIRED', discount_type='percent_off', discount_value=50, is_active=False)
        response = self.client.post('/api/payments/initialize/', {'plan_id': 'premium_monthly', 'promo_code': 'EXPIRED'})
        self.assertEqual(response.status_code, 400)
        self.user.refresh_from_db(); self.assertFalse(self.user.is_premium)
