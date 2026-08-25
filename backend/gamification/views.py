from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Sum
from .models import ProgressionProfile, FlowCoinWallet, XPTransaction, FlowCoinTransaction


class ProgressionView(APIView):
    """
    GET /api/gamification/progress/

    Returns the user's unified progression data.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        profile, _ = ProgressionProfile.objects.get_or_create(user=user)

        return Response({
            'level': {
                'num': profile.level_num,
                'rank': profile.rank_name,
            },
            'lifetime_xp': profile.lifetime_xp,
            'current_level_threshold': profile.current_level_threshold,
            'next_level_threshold': profile.next_level_threshold,
            'xp_into_level': profile.xp_into_level,
            'xp_required_for_next_level': profile.xp_for_next_level,
            'progress_percent': profile.progress_percent,
            'flowcoins': _get_flowcoin_balance(user),
            'current_streak': profile.current_streak,
            'longest_streak': profile.longest_streak,
            'streak_shields': profile.streak_shields,
        })


class XPTransactionsView(APIView):
    """
    GET /api/gamification/xp-transactions/

    Returns paginated XP transaction history.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        transactions = XPTransaction.objects.filter(
            user=request.user,
        ).order_by('-created_at')[:50]

        return Response([
            {
                'id': tx.id,
                'amount': tx.amount,
                'source_type': tx.source_type,
                'source_id': tx.source_id,
                'reason': tx.reason,
                'created_at': tx.created_at.isoformat(),
            }
            for tx in transactions
        ])


class FlowCoinTransactionsView(APIView):
    """
    GET /api/gamification/flowcoin-transactions/

    Returns paginated FlowCoin transaction history.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        wallet = FlowCoinWallet.objects.filter(user=request.user).first()
        if not wallet:
            return Response([])

        transactions = FlowCoinTransaction.objects.filter(
            wallet=wallet,
        ).order_by('-created_at')[:50]

        return Response([
            {
                'id': tx.id,
                'amount': tx.amount,
                'transaction_type': tx.transaction_type,
                'source_type': tx.source_type,
                'description': tx.description,
                'balance_after': tx.balance_after,
                'created_at': tx.created_at.isoformat(),
            }
            for tx in transactions
        ])


def _get_flowcoin_balance(user) -> int:
    wallet = FlowCoinWallet.objects.filter(user=user).first()
    return wallet.balance if wallet else 0
