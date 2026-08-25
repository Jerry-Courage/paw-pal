from django.urls import path
from .views import ProgressionView, XPTransactionsView, FlowCoinTransactionsView

urlpatterns = [
    path('progress/', ProgressionView.as_view(), name='progression'),
    path('xp-transactions/', XPTransactionsView.as_view(), name='xp-transactions'),
    path('flowcoin-transactions/', FlowCoinTransactionsView.as_view(), name='flowcoin-transactions'),
]
