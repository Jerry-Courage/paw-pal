"""
Centralised Reward Engine for FlowState 2.0.

All rewardable activities MUST call RewardEngine.process() instead of
directly mutating XP or streak fields. The engine is idempotent —
retrying the same event returns the existing result.

StreakService provides one authoritative streak implementation.
"""

import logging
from datetime import date, timedelta
from typing import Any

from django.db import transaction
from django.db.models import F
from django.utils import timezone

from .models import (
    ProgressionProfile,
    XPTransaction,
    FlowCoinWallet,
    FlowCoinTransaction,
    StreakActivity,
    calculate_level,
)

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════
# REWARD TABLE — Normalized XP + FlowCoin awards
# ═══════════════════════════════════════════════════════════════

REWARD_TABLE = {
    # ── Study steps (per-resource) ──
    # notes and practice have no standalone equivalent — unique activity types
    'study_notes':            {'xp': 50,  'flowcoins': 0,  'qualifies_streak': True},
    'study_practice':         {'xp': 100, 'flowcoins': 0,  'qualifies_streak': True},

    # ── Standalone activity completions ──
    # quiz, flashcards, examprep: ONE base reward per activity.
    # CompleteStepView now routes to these (not the old study_* variants).
    'quiz_completion':        {'xp': 20,  'flowcoins': 2,  'qualifies_streak': True},
    'quiz_bonus_80':          {'xp': 15,  'flowcoins': 3,  'qualifies_streak': False},
    'quiz_bonus_100':         {'xp': 30,  'flowcoins': 5,  'qualifies_streak': False},
    'flashcard_session':      {'xp': 15,  'flowcoins': 2,  'qualifies_streak': True},
    'exam_prep_completion':   {'xp': 60,  'flowcoins': 8,  'qualifies_streak': True},

    # ── Concept completion ──
    'concept_completion':     {'xp': 25,  'flowcoins': 3,  'qualifies_streak': True},

    # ── Assignment ──
    'assignment_completion':  {'xp': 40,  'flowcoins': 5,  'qualifies_streak': True},

    # ── Quiz Battle ──
    'battle_participation':   {'xp': 5,   'flowcoins': 0,  'qualifies_streak': True},
    'battle_win':             {'xp': 15,  'flowcoins': 3,  'qualifies_streak': True},
    'battle_perfect':         {'xp': 5,   'flowcoins': 2,  'qualifies_streak': False},

    # ── Study time milestones ──
    'study_time_30m':         {'xp': 10,  'flowcoins': 0,  'qualifies_streak': True},
    'study_time_60m':         {'xp': 20,  'flowcoins': 1,  'qualifies_streak': True},
    'study_time_120m':        {'xp': 40,  'flowcoins': 3,  'qualifies_streak': True},

    # ── Feedback ──
    'feedback':               {'xp': 25,  'flowcoins': 0,  'qualifies_streak': False},

    # ── Generic award (legacy compat, used by AwardXPView) ──
    'generic_award':          {'xp': 0,   'flowcoins': 0,  'qualifies_streak': False},
}

# Anti-farming: max FlowCoins from repeated same-quiz completions
QUIZ_FLOWCOIN_MAX_REPEATED = 3  # after N completions, no more FC from same quiz
QUIZ_FLOWCOIN_REDUCTION = 0.5   # FC multiplier for repeated attempts (1st attempt = full)


# ═══════════════════════════════════════════════════════════════
# REWARD ENGINE
# ═══════════════════════════════════════════════════════════════

class RewardEngine:
    """
    Centralised, idempotent reward processor.

    Usage:
        result = RewardEngine.process(
            user=user,
            activity_type='quiz_completion',
            source_id=str(quiz_attempt_id),
            context={'score': 85, 'resource_id': 42},
        )
        # result = {
        #     'xp': 35,
        #     'flowcoins': 5,
        #     'level': {'previous': 2, 'current': 3, 'leveled_up': True},
        #     'streak': {'current': 7, 'increased': True},
        # }
    """

    @staticmethod
    def process(
        user,
        activity_type: str,
        source_id: str = '',
        context: dict | None = None,
    ) -> dict[str, Any]:
        """
        Process a rewardable event idempotently.

        Returns a reward result dict. If the event was already processed,
        returns the cached result (no double-award).
        """
        context = context or {}

        # Build idempotency key
        idempotency_key = _build_idempotency_key(user.id, activity_type, source_id, context)

        # Check for existing transaction (idempotency)
        existing = XPTransaction.objects.filter(
            idempotency_key=idempotency_key,
        ).first()
        if existing:
            return _existing_result(user, existing)

        # Look up reward table
        reward = REWARD_TABLE.get(activity_type)
        if reward is None:
            logger.warning('Unknown activity_type: %s', activity_type)
            return {'xp': 0, 'flowcoins': 0, 'level': _level_result(user, 0), 'streak': _streak_result(user, False)}

        xp_amount = reward['xp']
        fc_amount = reward['flowcoins']

        # Anti-farming adjustments
        xp_amount, fc_amount = _apply_anti_farming(
            user, activity_type, source_id, context, xp_amount, fc_amount,
        )

        # Process atomically
        with transaction.atomic():
            profile, _ = ProgressionProfile.objects.select_for_update().get_or_create(user=user)
            previous_level = profile.level_num

            # Award XP
            if xp_amount > 0:
                profile.lifetime_xp = F('lifetime_xp') + xp_amount
                profile.save(update_fields=['lifetime_xp', 'updated_at'])
                profile.refresh_from_db()

                XPTransaction.objects.create(
                    user=user,
                    amount=xp_amount,
                    source_type=activity_type,
                    source_id=source_id,
                    reason=_build_reason(activity_type, context),
                    metadata=context,
                    idempotency_key=idempotency_key,
                )

            # Award FlowCoins
            fc_earned = 0
            if fc_amount > 0:
                fc_earned = _award_flowcoins(
                    user=user,
                    amount=fc_amount,
                    source_type=activity_type,
                    source_id=source_id,
                    description=_build_reason(activity_type, context),
                    context=context,
                )

            # Streak update
            streak_increased = False
            if reward.get('qualifies_streak') and xp_amount > 0:
                streak_increased = StreakService.record_activity(
                    user=user,
                    activity_type=activity_type,
                    source_id=source_id,
                )

            # Level check
            new_level = profile.level_num
            leveled_up = new_level > previous_level

        return {
            'xp': xp_amount,
            'flowcoins': fc_earned,
            'level': {
                'previous': previous_level,
                'current': new_level,
                'leveled_up': leveled_up,
            },
            'streak': {
                'current': profile.current_streak,
                'increased': streak_increased,
            },
            'missions': [],
            'achievements': [],
        }


# ═══════════════════════════════════════════════════════════════
# STREAK SERVICE
# ═══════════════════════════════════════════════════════════════

class StreakService:
    """
    One authoritative streak implementation.
    One qualifying activity per calendar day counts toward streak.
    """

    @staticmethod
    def record_activity(
        user,
        activity_type: str,
        source_id: str = '',
    ) -> bool:
        """
        Record a qualifying activity for streak purposes.
        Returns True if the streak increased (new day).
        """
        today = timezone.now().date()

        # Create streak activity record (for audit)
        StreakActivity.objects.create(
            user=user,
            date=today,
            activity_type=activity_type,
            source_id=source_id,
        )

        with transaction.atomic():
            profile, _ = ProgressionProfile.objects.select_for_update().get_or_create(user=user)

            # Already recorded a qualifying activity today → no streak change
            if profile.last_qualifying_activity_date == today:
                return False

            previous_streak = profile.current_streak

            if profile.last_qualifying_activity_date is None:
                # First ever activity
                profile.current_streak = 1
            elif profile.last_qualifying_activity_date == today - timedelta(days=1):
                # Consecutive day
                profile.current_streak += 1
            elif profile.last_qualifying_activity_date == today - timedelta(days=2):
                # Missed exactly 1 day — check if streak_shields available
                if profile.streak_shields > 0:
                    profile.streak_shields -= 1
                    # streak preserved (no increment, but not broken)
                else:
                    profile.current_streak = 1
            else:
                # Streak broken (missed >1 day without shield)
                profile.current_streak = 1

            profile.last_qualifying_activity_date = today
            profile.longest_streak = max(profile.longest_streak, profile.current_streak)
            profile.save(update_fields=[
                'current_streak', 'longest_streak', 'streak_shields',
                'last_qualifying_activity_date', 'updated_at',
            ])

            return profile.current_streak > previous_streak


# ═══════════════════════════════════════════════════════════════
# FLOWCOIN HELPERS
# ═══════════════════════════════════════════════════════════════

def _award_flowcoins(
    user,
    amount: int,
    source_type: str,
    source_id: str,
    description: str,
    context: dict,
) -> int:
    """
    Atomically award FlowCoins. Returns amount actually awarded.
    """
    if amount <= 0:
        return 0

    idemp_key = f'fc_{user.id}_{source_type}_{source_id}_{context.get("attempt_id", "")}'
    if not idemp_key.strip('fc_'):
        idemp_key = f'fc_{user.id}_{source_type}_{source_id}_{timezone.now().timestamp()}'

    # Check idempotency
    if FlowCoinTransaction.objects.filter(idempotency_key=idemp_key).exists():
        return 0

    wallet, _ = FlowCoinWallet.objects.select_for_update().get_or_create(user=user)
    wallet.balance = F('balance') + amount
    wallet.save(update_fields=['balance', 'updated_at'])
    wallet.refresh_from_db()

    FlowCoinTransaction.objects.create(
        wallet=wallet,
        amount=amount,
        transaction_type='earn',
        source_type=source_type,
        source_id=source_id,
        description=description,
        balance_after=wallet.balance,
        metadata=context,
        idempotency_key=idemp_key,
    )

    return amount


# ═══════════════════════════════════════════════════════════════
# ANTI-FARMING
# ═══════════════════════════════════════════════════════════════

def _apply_anti_farming(
    user,
    activity_type: str,
    source_id: str,
    context: dict,
    xp_amount: int,
    fc_amount: int,
) -> tuple[int, int]:
    """
    Adjust XP/FC based on anti-farming rules.
    Returns (adjusted_xp, adjusted_fc).
    """

    # Quiz: repeated attempts on same quiz get reduced FC
    if activity_type == 'quiz_completion' and source_id:
        quiz_id = source_id
        previous_completions = XPTransaction.objects.filter(
            user=user,
            source_type='quiz_completion',
            source_id=str(quiz_id),
        ).count()
        if previous_completions >= QUIZ_FLOWCOIN_MAX_REPEATED:
            fc_amount = 0
        elif previous_completions > 0:
            fc_amount = max(1, int(fc_amount * QUIZ_FLOWCOIN_REDUCTION))

    # Flashcard session: reward per session, not per card
    # (enforced by caller — only call once per session)

    # Study time: check for minimum qualifying duration
    if activity_type.startswith('study_time_'):
        minutes = context.get('minutes', 0)
        if minutes < 15:
            # Less than 15 minutes — no reward
            return 0, 0

    return xp_amount, fc_amount


# ═══════════════════════════════════════════════════════════════
# IDEMPOTENCY KEY BUILDER
# ═══════════════════════════════════════════════════════════════

def _build_idempotency_key(
    user_id: int,
    activity_type: str,
    source_id: str,
    context: dict,
) -> str:
    """
    Build a deterministic idempotency key for deduplication.
    """
    parts = [f'{user_id}', activity_type]

    if source_id:
        parts.append(str(source_id))

    # For quiz completions, use attempt_id if available
    if activity_type == 'quiz_completion':
        attempt_id = context.get('attempt_id', '')
        if attempt_id:
            parts.append(f'attempt:{attempt_id}')

    # For study steps, use step name
    if activity_type.startswith('study_'):
        step = context.get('step', '')
        if step:
            parts.append(f'step:{step}')

    # For battle, include battle_id
    if activity_type.startswith('battle_'):
        battle_id = context.get('battle_id', '')
        if battle_id:
            parts.append(f'battle:{battle_id}')

    return ':'.join(parts)


# ═══════════════════════════════════════════════════════════════
# RESULT BUILDERS
# ═══════════════════════════════════════════════════════════════

def _level_result(user, xp_delta: int = 0) -> dict:
    """Build level result from current profile state."""
    profile = getattr(user, 'progression', None)
    if profile:
        return {
            'previous': calculate_level(max(0, profile.lifetime_xp - xp_delta)),
            'current': profile.level_num,
            'leveled_up': calculate_level(max(0, profile.lifetime_xp - xp_delta)) < profile.level_num,
        }
    return {'previous': 1, 'current': 1, 'leveled_up': False}


def _streak_result(user, increased: bool) -> dict:
    """Build streak result."""
    profile = getattr(user, 'progression', None)
    return {
        'current': profile.current_streak if profile else 0,
        'increased': increased,
    }


def _existing_result(user, existing_tx: XPTransaction) -> dict:
    """Return cached result for an already-processed idempotent event."""
    profile = getattr(user, 'progression', None)
    return {
        'xp': existing_tx.amount,
        'flowcoins': 0,  # already awarded
        'level': _level_result(user, existing_tx.amount),
        'streak': _streak_result(user, False),
        'missions': [],
        'achievements': [],
    }


def _build_reason(activity_type: str, context: dict) -> str:
    """Human-readable reason for the XP transaction."""
    reasons = {
        'study_notes': 'Completed study notes',
        'study_practice': 'Completed practice session',
        'quiz_completion': f'Quiz completed (score: {context.get("score", "?")}%)',
        'quiz_bonus_80': 'Quiz bonus — 80%+ score',
        'quiz_bonus_100': 'Quiz bonus — perfect score',
        'flashcard_session': 'Flashcard session completed',
        'concept_completion': 'Learning concept completed',
        'assignment_completion': 'Assignment completed',
        'exam_prep_completion': 'Exam prep completed',
        'battle_participation': 'Quiz battle participated',
        'battle_win': 'Quiz battle won',
        'battle_perfect': 'Quiz battle — perfect score',
        'study_time_30m': '30 min study milestone',
        'study_time_60m': '60 min study milestone',
        'study_time_120m': '2 hour study milestone',
        'feedback': 'App feedback submitted',
        'generic_award': context.get('reason', 'XP award'),
    }
    return reasons.get(activity_type, activity_type)
