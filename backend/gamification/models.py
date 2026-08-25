from django.db import models
from django.conf import settings
from django.utils import timezone


class ProgressionProfile(models.Model):
    """Single source of truth for user progression (XP, streak, level)."""
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='progression',
        db_index=True,
    )
    lifetime_xp = models.PositiveIntegerField(default=0)
    current_streak = models.PositiveIntegerField(default=0)
    longest_streak = models.PositiveIntegerField(default=0)
    streak_shields = models.PositiveSmallIntegerField(default=0)
    last_qualifying_activity_date = models.DateField(null=True, blank=True)
    migrated = models.BooleanField(
        default=False,
        help_text='True after existing XP/streak data has been migrated from legacy fields.',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-lifetime_xp']

    def __str__(self):
        return f'{self.user.email} — {self.lifetime_xp} XP — Lvl {self.level_num} ({self.rank_name})'

    # ── Derived level fields (computed from lifetime_xp) ──────
    @property
    def level_num(self) -> int:
        """Numeric level 1-50+. Deterministic from lifetime_xp."""
        return calculate_level(self.lifetime_xp)

    @property
    def rank_name(self) -> str:
        """Rank tier: Freshman→Sophomore→Junior→Senior→Graduate. Separate from level."""
        return calculate_rank(self.lifetime_xp)

    @property
    def current_level_threshold(self) -> int:
        """XP threshold for current numeric level."""
        return get_level_threshold(self.level_num)

    @property
    def next_level_threshold(self) -> int | None:
        """XP threshold for next level. None if level 50+ (max)."""
        if self.level_num >= MAX_LEVEL:
            return None
        return get_level_threshold(self.level_num + 1)

    @property
    def xp_into_level(self) -> int:
        """XP earned within current level."""
        return self.lifetime_xp - self.current_level_threshold

    @property
    def xp_for_next_level(self) -> int | None:
        """Total XP needed to advance from current level to next."""
        nxt = self.next_level_threshold
        if nxt is None:
            return None
        return nxt - self.current_level_threshold

    @property
    def progress_percent(self) -> int:
        """Percent progress toward next level (0-100)."""
        required = self.xp_for_next_level
        if required is None or required == 0:
            return 100
        return min(100, int((self.xp_into_level / required) * 100))


# ── Numeric Level Curve (1-50+) ──────────────────────────────
# Formula: XP_for_level_N = N * (N-1) * 50
# Level 1=0, 2=100, 3=300, 4=600, 5=1000, 10=4500, 20=19000, 50=122500

MAX_LEVEL = 50

def calculate_level(lifetime_xp: int) -> int:
    """Deterministic numeric level 1-50+ from lifetime XP.
    Uses inverse of quadratic formula: XP_for_level_N = N*(N-1)*50
    Solving: N = (1 + sqrt(1 + XP*2/25)) / 2
    """
    if lifetime_xp <= 0:
        return 1
    import math
    level = int((1 + math.isqrt(1 + lifetime_xp * 2 // 25)) // 2)
    return min(level, MAX_LEVEL)


def get_level_threshold(level_num: int) -> int:
    """XP threshold required to reach level_num. XP_for_level_N = N*(N-1)*50."""
    if level_num <= 1:
        return 0
    if level_num > MAX_LEVEL:
        # Beyond level 50: each additional level costs ~5000 XP
        return get_level_threshold(MAX_LEVEL) + (level_num - MAX_LEVEL) * 5000
    return level_num * (level_num - 1) * 50


# ── Rank Tiers (separate from numeric level) ─────────────────
# Based on cumulative lifetime XP milestones.

RANK_THRESHOLDS = [
    (0,     'Freshman'),
    (500,   'Sophomore'),
    (2500,  'Junior'),
    (10000, 'Senior'),
    (50000, 'Graduate'),
]

def calculate_rank(lifetime_xp: int) -> str:
    """Rank tier from lifetime XP. Completely separate from numeric level."""
    rank = 'Freshman'
    for threshold, name in RANK_THRESHOLDS:
        if lifetime_xp >= threshold:
            rank = name
    return rank


# ── XP Transaction Ledger ─────────────────────────────────────

class XPTransaction(models.Model):
    """Immutable audit trail for every XP award or deduction."""
    SOURCE_TYPES = [
        ('study_step', 'Study Step'),
        ('quiz_completion', 'Quiz Completion'),
        ('flashcard_session', 'Flashcard Session'),
        ('concept_completion', 'Concept Completion'),
        ('battle_participation', 'Battle Participation'),
        ('battle_win', 'Battle Win'),
        ('battle_perfect', 'Battle Perfect Score'),
        ('assignment_completion', 'Assignment Completion'),
        ('exam_prep_completion', 'Exam Prep Completion'),
        ('feedback', 'Feedback'),
        ('study_time', 'Study Time'),
        ('xp_pack_purchase', 'XP Pack Purchase'),
        ('marketplace_spend', 'Marketplace Spend'),
        ('migration', 'Migration'),
        ('admin_adjustment', 'Admin Adjustment'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='xp_transactions',
        db_index=True,
    )
    amount = models.IntegerField(
        help_text='Positive for XP earned, negative for XP spent (marketplace).',
    )
    source_type = models.CharField(max_length=40, choices=SOURCE_TYPES)
    source_id = models.CharField(
        max_length=120, blank=True, default='',
        help_text='Object ID that triggered this transaction (e.g. resource ID, battle ID).',
    )
    reason = models.CharField(max_length=255, blank=True, default='')
    metadata = models.JSONField(default=dict, blank=True)
    idempotency_key = models.CharField(
        max_length=200, unique=True, db_index=True,
        help_text='Prevents duplicate rewards for the same event.',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', 'source_type']),
        ]

    def __str__(self):
        sign = '+' if self.amount >= 0 else ''
        return f'{self.user.email} — {sign}{self.amount} XP ({self.source_type})'


# ── FlowCoin Wallet ───────────────────────────────────────────

class FlowCoinWallet(models.Model):
    """One wallet per user. FlowCoins are the spendable learning currency."""
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='flowcoin_wallet',
        db_index=True,
    )
    balance = models.PositiveIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'{self.user.email} — {self.balance} FlowCoins'


# ── FlowCoin Transaction Ledger ──────────────────────────────

class FlowCoinTransaction(models.Model):
    """Immutable audit trail for every FlowCoin earn/spend."""

    TRANSACTION_TYPES = [
        ('earn', 'Earn'),
        ('purchase', 'Purchase'),
        ('refund', 'Refund'),
        ('admin_adjustment', 'Admin Adjustment'),
        ('migration_bonus', 'Migration Bonus'),
    ]

    wallet = models.ForeignKey(
        FlowCoinWallet,
        on_delete=models.CASCADE,
        related_name='transactions',
        db_index=True,
    )
    amount = models.IntegerField(
        help_text='Positive for earned, negative for spent.',
    )
    transaction_type = models.CharField(max_length=30, choices=TRANSACTION_TYPES)
    source_type = models.CharField(max_length=40, blank=True, default='')
    source_id = models.CharField(max_length=120, blank=True, default='')
    description = models.CharField(max_length=255, blank=True, default='')
    balance_after = models.PositiveIntegerField()
    metadata = models.JSONField(default=dict, blank=True)
    idempotency_key = models.CharField(
        max_length=200, unique=True, db_index=True,
        help_text='Prevents duplicate FlowCoin awards.',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['wallet', 'transaction_type']),
        ]

    def __str__(self):
        sign = '+' if self.amount >= 0 else ''
        return f'{self.wallet.user.email} — {sign}{self.amount} FC ({self.transaction_type})'


# ── Streak Activity Ledger ───────────────────────────────────

class StreakActivity(models.Model):
    """One record per qualifying activity per day (audit/history)."""
    QUALIFYING_ACTIVITY_TYPES = [
        ('study_session', 'Study Session'),
        ('flashcard_session', 'Flashcard Session'),
        ('quiz_completion', 'Quiz Completion'),
        ('concept_completion', 'Concept Completion'),
        ('exam_prep_completion', 'Exam Prep Completion'),
        ('battle_win', 'Battle Win'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='streak_activities',
        db_index=True,
    )
    date = models.DateField(db_index=True)
    activity_type = models.CharField(max_length=40, choices=QUALIFYING_ACTIVITY_TYPES)
    source_id = models.CharField(max_length=120, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date']
        indexes = [
            models.Index(fields=['user', 'date']),
        ]

    def __str__(self):
        return f'{self.user.email} — {self.date} — {self.activity_type}'
