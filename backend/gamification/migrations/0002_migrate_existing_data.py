"""
Data migration: Migrate existing XP, streak, and level data into ProgressionProfile
and create FlowCoinWallet for every existing user.

This migration is idempotent — running it twice will not double-award.
"""

from datetime import date
from django.db import migrations
from django.db.models import Sum


def forwards(apps, schema_editor):
    User = apps.get_model('users', 'User')
    ProgressionProfile = apps.get_model('gamification', 'ProgressionProfile')
    FlowCoinWallet = apps.get_model('gamification', 'FlowCoinWallet')
    XPTransaction = apps.get_model('gamification', 'XPTransaction')
    ResourceProgress = apps.get_model('library', 'ResourceProgress')

    for user in User.objects.all():
        # ── Calculate existing lifetime XP ──
        # Source 1: ResourceProgress.xp_earned
        study_xp = ResourceProgress.objects.filter(user=user).aggregate(
            total=Sum('xp_earned')
        )['total'] or 0

        # Source 2: onboarding_status.quiz_xp (battle XP)
        obs = user.onboarding_status or {}
        quiz_xp = int(obs.get('quiz_xp', 0))

        # Source 3: onboarding_status.bonus_xp (purchased XP)
        bonus_xp = int(obs.get('bonus_xp', 0))

        # Source 4: spent_xp (marketplace deductions)
        spent_xp = int(obs.get('spent_xp', 0))

        lifetime_xp = max(0, study_xp + quiz_xp + bonus_xp - spent_xp)

        # ── Calculate existing streak ──
        current_streak = user.study_streak or 0
        # longest_streak: we don't have historical data, use current as floor
        longest_streak = current_streak

        # ── Create ProgressionProfile ──
        profile, created = ProgressionProfile.objects.get_or_create(
            user=user,
            defaults={
                'lifetime_xp': lifetime_xp,
                'current_streak': current_streak,
                'longest_streak': longest_streak,
                'streak_shields': 0,
                'last_qualifying_activity_date': user.last_study_date,
                'migrated': True,
            }
        )

        if not created and not profile.migrated:
            # Idempotent: only migrate if not already done
            profile.lifetime_xp = lifetime_xp
            profile.current_streak = current_streak
            profile.longest_streak = max(profile.longest_streak, longest_streak)
            profile.last_qualifying_activity_date = user.last_study_date or profile.last_qualifying_activity_date
            profile.migrated = True
            profile.save()

            # Create migration transaction for audit
            XPTransaction.objects.get_or_create(
                idempotency_key=f'migration:user:{user.id}:xp',
                defaults={
                    'user': user,
                    'amount': lifetime_xp,
                    'source_type': 'migration',
                    'reason': 'Migrated from legacy XP fields',
                    'metadata': {
                        'study_xp': study_xp,
                        'quiz_xp': quiz_xp,
                        'bonus_xp': bonus_xp,
                        'spent_xp': spent_xp,
                    },
                }
            )

        # ── Create FlowCoin wallet ──
        FlowCoinWallet.objects.get_or_create(
            user=user,
            defaults={'balance': 0},
        )


def backwards(apps, schema_editor):
    # Reverse migration: no-op (preserve data)
    pass


class Migration(migrations.Migration):
    dependencies = [
        ('users', '0013_feedback_model'),
        ('library', '0017_add_section_progress_tracking'),
        ('gamification', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
