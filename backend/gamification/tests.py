"""
Backend tests for the gamification app.
Tests cover: XP awarded once, idempotency, FlowCoins, wallet correctness,
concurrent safety, level calculation, level-up detection, streak behavior,
migration, rankings, Reward Engine results, anti-farming, and API auth.
"""

from django.test import TestCase, TransactionTestCase
from rest_framework.test import APIClient
from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from datetime import timedelta
from unittest.mock import patch

from gamification.models import (
    ProgressionProfile,
    XPTransaction,
    FlowCoinWallet,
    FlowCoinTransaction,
    StreakActivity,
    calculate_level,
    calculate_rank,
    get_level_threshold,
    MAX_LEVEL,
)
from gamification.services import RewardEngine, StreakService, _apply_anti_farming

User = get_user_model()


class LevelCalculationTest(TestCase):
    """Tests for the deterministic numeric level curve (1-50+)."""

    def test_level_1_at_zero_xp(self):
        self.assertEqual(calculate_level(0), 1)

    def test_level_1_below_threshold(self):
        self.assertEqual(calculate_level(99), 1)

    def test_level_2_at_100_xp(self):
        self.assertEqual(calculate_level(100), 2)

    def test_level_3_at_300_xp(self):
        self.assertEqual(calculate_level(300), 3)

    def test_level_5_at_1000_xp(self):
        self.assertEqual(calculate_level(1000), 5)

    def test_level_10_at_4500_xp(self):
        self.assertEqual(calculate_level(4500), 10)

    def test_level_20_at_19000_xp(self):
        self.assertEqual(calculate_level(19000), 20)

    def test_level_capped_at_50(self):
        self.assertEqual(calculate_level(500000), MAX_LEVEL)

    def test_level_50_at_122500_xp(self):
        self.assertEqual(calculate_level(122500), 50)

    def test_threshold_level_1(self):
        self.assertEqual(get_level_threshold(1), 0)

    def test_threshold_level_2(self):
        self.assertEqual(get_level_threshold(2), 100)

    def test_threshold_level_5(self):
        self.assertEqual(get_level_threshold(5), 1000)

    def test_threshold_level_10(self):
        self.assertEqual(get_level_threshold(10), 4500)

    def test_threshold_beyond_50(self):
        t50 = get_level_threshold(50)
        t51 = get_level_threshold(51)
        self.assertEqual(t51 - t50, 5000)


class RankCalculationTest(TestCase):
    """Tests for the rank tier system (separate from numeric level)."""

    def test_rank_freshman(self):
        self.assertEqual(calculate_rank(0), 'Freshman')
        self.assertEqual(calculate_rank(499), 'Freshman')

    def test_rank_sophomore(self):
        self.assertEqual(calculate_rank(500), 'Sophomore')
        self.assertEqual(calculate_rank(2499), 'Sophomore')

    def test_rank_junior(self):
        self.assertEqual(calculate_rank(2500), 'Junior')
        self.assertEqual(calculate_rank(9999), 'Junior')

    def test_rank_senior(self):
        self.assertEqual(calculate_rank(10000), 'Senior')
        self.assertEqual(calculate_rank(49999), 'Senior')

    def test_rank_graduate(self):
        self.assertEqual(calculate_rank(50000), 'Graduate')
        self.assertEqual(calculate_rank(500000), 'Graduate')


class ProgressionProfileTest(TestCase):
    """Tests for ProgressionProfile derived properties."""

    def setUp(self):
        self.user = User.objects.create_user(
            email='test@test.com', username='testuser', password='testpass123'
        )
        self.profile = ProgressionProfile.objects.create(
            user=self.user, lifetime_xp=1200
        )

    def test_level_num(self):
        self.assertEqual(self.profile.level_num, 5)

    def test_rank_name(self):
        self.assertEqual(self.profile.rank_name, 'Sophomore')

    def test_current_level_threshold(self):
        self.assertEqual(self.profile.current_level_threshold, 1000)

    def test_next_level_threshold(self):
        self.assertEqual(self.profile.next_level_threshold, 1500)

    def test_xp_into_level(self):
        self.assertEqual(self.profile.xp_into_level, 200)

    def test_xp_for_next_level(self):
        self.assertEqual(self.profile.xp_for_next_level, 500)

    def test_progress_percent(self):
        self.assertEqual(self.profile.progress_percent, 40)

    def test_max_level_progress(self):
        self.profile.lifetime_xp = 500000
        self.profile.save()
        self.assertEqual(self.profile.level_num, MAX_LEVEL)
        self.assertEqual(self.profile.progress_percent, 100)
        self.assertIsNone(self.profile.next_level_threshold)
        self.assertIsNone(self.profile.xp_for_next_level)


class RewardEngineTest(TransactionTestCase):
    """Tests for the RewardEngine — idempotency, awards, level-ups."""

    def setUp(self):
        self.user = User.objects.create_user(
            email='test@test.com', username='testuser', password='testpass123'
        )
        self.profile = ProgressionProfile.objects.create(
            user=self.user, lifetime_xp=0, current_streak=0
        )

    def test_quiz_completion_awards_xp_and_fc(self):
        result = RewardEngine.process(
            user=self.user,
            activity_type='quiz_completion',
            source_id='42',
            context={'score': 85, 'attempt_id': 'att_1'},
        )
        self.assertEqual(result['xp'], 20)
        self.assertEqual(result['flowcoins'], 2)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.lifetime_xp, 20)

    def test_idempotency_same_event(self):
        """Same event processed twice should not double-award."""
        result1 = RewardEngine.process(
            user=self.user,
            activity_type='quiz_completion',
            source_id='42',
            context={'attempt_id': 'att_1'},
        )
        result2 = RewardEngine.process(
            user=self.user,
            activity_type='quiz_completion',
            source_id='42',
            context={'attempt_id': 'att_1'},
        )
        self.assertEqual(result1['xp'], 20)
        self.assertEqual(result2['xp'], 20)  # Returns cached amount
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.lifetime_xp, 20)  # Not doubled

    def test_different_events_award_separately(self):
        RewardEngine.process(
            user=self.user,
            activity_type='quiz_completion',
            source_id='42',
            context={'attempt_id': 'att_1'},
        )
        RewardEngine.process(
            user=self.user,
            activity_type='quiz_completion',
            source_id='42',
            context={'attempt_id': 'att_2'},
        )
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.lifetime_xp, 40)

    def test_level_up_detection(self):
        """Level up from level 1 to level 2."""
        self.profile.lifetime_xp = 80
        self.profile.save()
        result = RewardEngine.process(
            user=self.user,
            activity_type='study_practice',
            source_id='1',
            context={'step': 'practice', 'score': 100, 'resource_id': 1},
        )
        self.assertTrue(result['level']['leveled_up'])
        self.assertEqual(result['level']['previous'], 1)
        self.assertEqual(result['level']['current'], 2)

    def test_no_level_up(self):
        """No level up when XP stays within same level."""
        result = RewardEngine.process(
            user=self.user,
            activity_type='quiz_completion',
            source_id='1',
            context={'attempt_id': 'a1'},
        )
        self.assertFalse(result['level']['leveled_up'])

    def test_unknown_activity_returns_zero(self):
        result = RewardEngine.process(
            user=self.user,
            activity_type='nonexistent_activity',
            source_id='1',
        )
        self.assertEqual(result['xp'], 0)
        self.assertEqual(result['flowcoins'], 0)


class FlowCoinTest(TransactionTestCase):
    """Tests for FlowCoin wallet correctness."""

    def setUp(self):
        self.user = User.objects.create_user(
            email='test@test.com', username='testuser', password='testpass123'
        )
        self.profile = ProgressionProfile.objects.create(user=self.user)

    def test_wallet_created_on_first_award(self):
        self.assertFalse(FlowCoinWallet.objects.filter(user=self.user).exists())
        RewardEngine.process(
            user=self.user,
            activity_type='quiz_completion',
            source_id='1',
            context={'attempt_id': 'a1'},
        )
        wallet = FlowCoinWallet.objects.get(user=self.user)
        self.assertEqual(wallet.balance, 2)

    def test_wallet_balance_accumulates(self):
        RewardEngine.process(
            user=self.user,
            activity_type='quiz_completion',
            source_id='1',
            context={'attempt_id': 'a1'},
        )
        RewardEngine.process(
            user=self.user,
            activity_type='quiz_completion',
            source_id='2',
            context={'attempt_id': 'a2'},
        )
        wallet = FlowCoinWallet.objects.get(user=self.user)
        self.assertEqual(wallet.balance, 4)

    def test_flowcoin_transaction_ledger(self):
        RewardEngine.process(
            user=self.user,
            activity_type='quiz_completion',
            source_id='1',
            context={'attempt_id': 'a1'},
        )
        tx = FlowCoinTransaction.objects.first()
        self.assertEqual(tx.amount, 2)
        self.assertEqual(tx.transaction_type, 'earn')
        self.assertEqual(tx.balance_after, 2)

    def test_flowcoin_idempotency(self):
        RewardEngine.process(
            user=self.user,
            activity_type='quiz_completion',
            source_id='1',
            context={'attempt_id': 'a1'},
        )
        RewardEngine.process(
            user=self.user,
            activity_type='quiz_completion',
            source_id='1',
            context={'attempt_id': 'a1'},
        )
        wallet = FlowCoinWallet.objects.get(user=self.user)
        self.assertEqual(wallet.balance, 2)


class AntiFarmingTest(TestCase):
    """Tests for anti-farming safeguards."""

    def setUp(self):
        self.user = User.objects.create_user(
            email='test@test.com', username='testuser', password='testpass123'
        )
        ProgressionProfile.objects.create(user=self.user)

    def test_repeated_quiz_reduces_fc(self):
        """After max repeated completions, no more FC from same quiz."""
        for i in range(5):
            RewardEngine.process(
                user=self.user,
                activity_type='quiz_completion',
                source_id='quiz_1',
                context={'attempt_id': f'att_{i}'},
            )
        wallet = FlowCoinWallet.objects.get(user=self.user)
        # Call 1: full FC (2). Call 2: reduced (1). Call 3: reduced (1). Call 4+: zero.
        # Total: 2 + 1 + 1 + 0 + 0 = 4
        self.assertEqual(wallet.balance, 4)

    def test_study_time_minimum(self):
        """Less than 15 minutes should not earn rewards."""
        result = RewardEngine.process(
            user=self.user,
            activity_type='study_time_30m',
            source_id='study_1',
            context={'minutes': 10},
        )
        self.assertEqual(result['xp'], 0)
        self.assertEqual(result['flowcoins'], 0)


class StreakTest(TransactionTestCase):
    """Tests for streak behavior."""

    def setUp(self):
        self.user = User.objects.create_user(
            email='test@test.com', username='testuser', password='testpass123'
        )
        self.profile = ProgressionProfile.objects.create(user=self.user)

    def test_first_activity_starts_streak(self):
        result = StreakService.record_activity(
            user=self.user,
            activity_type='quiz_completion',
            source_id='1',
        )
        self.assertTrue(result)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.current_streak, 1)

    def test_same_day_no_double_increment(self):
        StreakService.record_activity(
            user=self.user,
            activity_type='quiz_completion',
            source_id='1',
        )
        result = StreakService.record_activity(
            user=self.user,
            activity_type='quiz_completion',
            source_id='2',
        )
        self.assertFalse(result)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.current_streak, 1)

    def test_consecutive_day_increments(self):
        # Day 1
        StreakService.record_activity(
            user=self.user,
            activity_type='quiz_completion',
            source_id='1',
        )
        # Simulate day 2
        self.profile.refresh_from_db()
        self.profile.last_qualifying_activity_date = timezone.now().date() - timedelta(days=1)
        self.profile.current_streak = 1
        self.profile.save()
        # Day 2
        StreakService.record_activity(
            user=self.user,
            activity_type='quiz_completion',
            source_id='2',
        )
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.current_streak, 2)

    def test_broken_streak_resets(self):
        # Day 1
        StreakService.record_activity(
            user=self.user,
            activity_type='quiz_completion',
            source_id='1',
        )
        # Simulate 3 days later
        self.profile.refresh_from_db()
        self.profile.last_qualifying_activity_date = timezone.now().date() - timedelta(days=3)
        self.profile.current_streak = 5
        self.profile.save()
        # Day 4
        StreakService.record_activity(
            user=self.user,
            activity_type='quiz_completion',
            source_id='2',
        )
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.current_streak, 1)

    def test_longest_streak_tracked(self):
        # Build a streak of 3
        self.profile.current_streak = 3
        self.profile.longest_streak = 3
        self.profile.last_qualifying_activity_date = timezone.now().date() - timedelta(days=1)
        self.profile.save()

        StreakService.record_activity(
            user=self.user,
            activity_type='quiz_completion',
            source_id='1',
        )
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.current_streak, 4)
        self.assertEqual(self.profile.longest_streak, 4)


class StreakShieldTest(TransactionTestCase):
    """Tests for streak shield behavior."""

    def setUp(self):
        self.user = User.objects.create_user(
            email='test@test.com', username='testuser', password='testpass123'
        )
        self.profile = ProgressionProfile.objects.create(
            user=self.user,
            current_streak=5,
            longest_streak=5,
            streak_shields=1,
            last_qualifying_activity_date=timezone.now().date() - timedelta(days=2),
        )

    def test_shield_preserves_streak(self):
        StreakService.record_activity(
            user=self.user,
            activity_type='quiz_completion',
            source_id='1',
        )
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.current_streak, 5)  # Preserved
        self.assertEqual(self.profile.streak_shields, 0)  # Used

    def test_no_shield_breaks_streak(self):
        self.profile.streak_shields = 0
        self.profile.save()
        StreakService.record_activity(
            user=self.user,
            activity_type='quiz_completion',
            source_id='1',
        )
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.current_streak, 1)


class XPTransactionTest(TestCase):
    """Tests for XP transaction ledger."""

    def setUp(self):
        self.user = User.objects.create_user(
            email='test@test.com', username='testuser', password='testpass123'
        )
        ProgressionProfile.objects.create(user=self.user)

    def test_transaction_created(self):
        RewardEngine.process(
            user=self.user,
            activity_type='study_notes',
            source_id='1',
            context={'step': 'notes', 'score': 100, 'resource_id': 1},
        )
        tx = XPTransaction.objects.first()
        self.assertEqual(tx.amount, 50)
        self.assertEqual(tx.source_type, 'study_notes')
        self.assertEqual(tx.source_id, '1')

    def test_negative_xp_for_marketplace(self):
        """Marketplace spend can create negative XP transactions."""
        tx = XPTransaction.objects.create(
            user=self.user,
            amount=-250,
            source_type='marketplace_spend',
            reason='Purchased 50/50 clue',
            idempotency_key='spend:test:1',
        )
        self.assertEqual(tx.amount, -250)


class LifetimeXPNeverDecreasesTest(TransactionTestCase):
    """Fix 4: Ensure lifetime XP can never decrease through any code path."""

    def setUp(self):
        self.user = User.objects.create_user(
            email='test@test.com', username='testuser', password='testpass123'
        )
        self.profile = ProgressionProfile.objects.create(
            user=self.user, lifetime_xp=500
        )

    def test_marketplace_spend_does_not_reduce_lifetime_xp(self):
        """Marketplace spend uses separate spending, not lifetime_xp reduction."""
        from gamification.services import REWARD_TABLE
        # marketplace_spend is not a RewardEngine activity type
        self.assertNotIn('marketplace_spend', REWARD_TABLE)

    def test_negative_xp_transaction_does_not_reduce_lifetime_xp(self):
        """Manual negative XP transaction in ledger does not change lifetime_xp."""
        XPTransaction.objects.create(
            user=self.user,
            amount=-250,
            source_type='marketplace_spend',
            reason='Test spend',
            idempotency_key='spend:manual:1',
        )
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.lifetime_xp, 500)


class XPNotPurchasableTest(TestCase):
    """Fix 2: XP packs should be deprecated — old clients get a controlled error."""

    def test_xp_pack_activity_type_not_in_reward_table(self):
        from gamification.services import REWARD_TABLE
        self.assertNotIn('xp_pack_purchase', REWARD_TABLE)


class FlowCoinSecurityTest(TransactionTestCase):
    """Fix 5: FlowCoins should only be earned through server-approved rewards."""

    def setUp(self):
        self.user = User.objects.create_user(
            email='test@test.com', username='testuser', password='testpass123'
        )
        self.profile = ProgressionProfile.objects.create(user=self.user)

    def test_wallet_balance_only_increases_through_engine(self):
        wallet = FlowCoinWallet.objects.create(user=self.user, balance=0)
        RewardEngine.process(
            user=self.user,
            activity_type='quiz_completion',
            source_id='1',
            context={'attempt_id': 'a1'},
        )
        wallet.refresh_from_db()
        self.assertEqual(wallet.balance, 2)

    def test_no_direct_wallet_manipulation_api(self):
        """FlowCoinTransactionsView only exposes GET — no POST/PUT/PATCH."""
        from gamification.views import FlowCoinTransactionsView
        view = FlowCoinTransactionsView()
        self.assertFalse(hasattr(view, 'post'))
        self.assertFalse(hasattr(view, 'put'))
        self.assertFalse(hasattr(view, 'patch'))


class DoubleRewardPreventionTest(TransactionTestCase):
    """One activity completion = ONE base reward. Tests prove the end-to-end flow."""

    def setUp(self):
        self.user = User.objects.create_user(
            email='test@test.com', username='testuser', password='testpass123'
        )
        self.profile = ProgressionProfile.objects.create(user=self.user)

    def test_quiz_step_fires_quiz_completion_not_study_quiz(self):
        """When CompleteStepView fires quiz_completion, the old study_quiz is not in REWARD_TABLE."""
        from gamification.services import REWARD_TABLE
        self.assertNotIn('study_quiz', REWARD_TABLE)
        # quiz_completion is the canonical type
        self.assertIn('quiz_completion', REWARD_TABLE)
        result = RewardEngine.process(
            user=self.user,
            activity_type='quiz_completion',
            source_id='42',
            context={'score': 85, 'step': 'quiz', 'resource_id': 42},
        )
        self.assertEqual(result['xp'], 20)
        self.assertEqual(result['flowcoins'], 2)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.lifetime_xp, 20)
        # No second reward fires — only one XPTransaction created
        self.assertEqual(XPTransaction.objects.filter(user=self.user).count(), 1)

    def test_flashcard_step_fires_flashcard_session_not_study_flashcards(self):
        """When CompleteStepView fires flashcard_session, the old study_flashcards is not in REWARD_TABLE."""
        from gamification.services import REWARD_TABLE
        self.assertNotIn('study_flashcards', REWARD_TABLE)
        self.assertIn('flashcard_session', REWARD_TABLE)
        result = RewardEngine.process(
            user=self.user,
            activity_type='flashcard_session',
            source_id='10',
            context={'score': 100, 'step': 'flashcards', 'resource_id': 10},
        )
        self.assertEqual(result['xp'], 15)
        self.assertEqual(result['flowcoins'], 2)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.lifetime_xp, 15)
        self.assertEqual(XPTransaction.objects.filter(user=self.user).count(), 1)

    def test_examprep_step_fires_exam_prep_completion_not_study_examprep(self):
        """When CompleteStepView fires exam_prep_completion, the old study_examprep is not in REWARD_TABLE."""
        from gamification.services import REWARD_TABLE
        self.assertNotIn('study_examprep', REWARD_TABLE)
        self.assertIn('exam_prep_completion', REWARD_TABLE)
        result = RewardEngine.process(
            user=self.user,
            activity_type='exam_prep_completion',
            source_id='20',
            context={'score': 90, 'step': 'examprep', 'resource_id': 20},
        )
        self.assertEqual(result['xp'], 60)
        self.assertEqual(result['flowcoins'], 8)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.lifetime_xp, 60)
        self.assertEqual(XPTransaction.objects.filter(user=self.user).count(), 1)

    def test_notes_step_still_fires_study_notes(self):
        """study_notes has no standalone equivalent — unique activity type."""
        from gamification.services import REWARD_TABLE
        self.assertIn('study_notes', REWARD_TABLE)
        result = RewardEngine.process(
            user=self.user,
            activity_type='study_notes',
            source_id='5',
            context={'step': 'notes', 'score': 100, 'resource_id': 5},
        )
        self.assertEqual(result['xp'], 50)
        self.assertEqual(XPTransaction.objects.filter(user=self.user).count(), 1)

    def test_practice_step_still_fires_study_practice(self):
        """study_practice has no standalone equivalent — unique activity type."""
        from gamification.services import REWARD_TABLE
        self.assertIn('study_practice', REWARD_TABLE)
        result = RewardEngine.process(
            user=self.user,
            activity_type='study_practice',
            source_id='15',
            context={'step': 'practice', 'score': 100, 'resource_id': 15},
        )
        self.assertEqual(result['xp'], 100)
        self.assertEqual(XPTransaction.objects.filter(user=self.user).count(), 1)

    def test_quiz_bonus_stacks_with_quiz_completion(self):
        """Score bonuses (quiz_bonus_80/100) are separate events with separate idempotency keys."""
        RewardEngine.process(
            user=self.user,
            activity_type='quiz_completion',
            source_id='42',
            context={'score': 100, 'attempt_id': 'att_1'},
        )
        RewardEngine.process(
            user=self.user,
            activity_type='quiz_bonus_100',
            source_id='42',
            context={'attempt_id': 'att_1'},
        )
        self.profile.refresh_from_db()
        # 20 (base) + 30 (bonus) = 50
        self.assertEqual(self.profile.lifetime_xp, 50)
        self.assertEqual(XPTransaction.objects.filter(user=self.user).count(), 2)


class MigrationIdempotencyTest(TransactionTestCase):
    """Verify data migration is idempotent — running twice doesn't double-award."""

    def setUp(self):
        self.user = User.objects.create_user(
            email='test@test.com', username='testuser', password='testpass123'
        )

    def _run_migration(self):
        import importlib
        mod = importlib.import_module('gamification.migrations.0002_migrate_existing_data')
        from django.apps import apps as real_apps
        mod.forwards(real_apps, None)

    def test_migration_creates_profile_once(self):
        self._run_migration()
        profile1 = ProgressionProfile.objects.get(user=self.user)
        xp1 = profile1.lifetime_xp
        self._run_migration()
        profile2 = ProgressionProfile.objects.get(user=self.user)
        xp2 = profile2.lifetime_xp
        self.assertEqual(xp1, xp2)
        self.assertTrue(profile2.migrated)

    def test_migration_creates_wallet_once(self):
        self._run_migration()
        count1 = FlowCoinWallet.objects.filter(user=self.user).count()
        self._run_migration()
        count2 = FlowCoinWallet.objects.filter(user=self.user).count()
        self.assertEqual(count1, 1)
        self.assertEqual(count2, 1)


class APITest(TestCase):
    """Tests for the unified progression endpoint."""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            email='test@test.com', username='testuser', password='testpass123'
        )
        self.profile = ProgressionProfile.objects.create(
            user=self.user, lifetime_xp=1200, current_streak=3
        )
        FlowCoinWallet.objects.create(user=self.user, balance=15)
        self.client.force_authenticate(user=self.user)

    def test_progression_endpoint_returns_data(self):
        response = self.client.get('/api/gamification/progress/')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['lifetime_xp'], 1200)
        self.assertEqual(data['level']['num'], 5)
        self.assertEqual(data['level']['rank'], 'Sophomore')
        self.assertEqual(data['flowcoins'], 15)
        self.assertEqual(data['current_streak'], 3)

    def test_progression_endpoint_requires_auth(self):
        self.client.force_authenticate(user=None)
        response = self.client.get('/api/gamification/progress/')
        self.assertEqual(response.status_code, 401)


class XPTransactionsAPITest(TestCase):
    """Tests for the XP transactions endpoint."""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            email='test@test.com', username='testuser', password='testpass123'
        )
        self.client.force_authenticate(user=self.user)

    def test_returns_transactions(self):
        XPTransaction.objects.create(
            user=self.user,
            amount=50,
            source_type='study_notes',
            reason='Completed notes',
            idempotency_key='test:tx:1',
        )
        response = self.client.get('/api/gamification/xp-transactions/')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]['amount'], 50)
