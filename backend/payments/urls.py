from django.urls import path
from .views import (
    InitializePaymentView, VerifyPaymentView,
    PaystackWebhookView, SubscriptionStatusView, ApplyPromoCodeView,
    MarketplaceInventoryView, MarketplaceBuyPowerupView, MarketplaceUsePowerupView, MarketplaceBuyXPView
)

urlpatterns = [
    path('initialize/', InitializePaymentView.as_view(), name='payment-initialize'),
    path('verify/', VerifyPaymentView.as_view(), name='payment-verify'),
    path('webhook/', PaystackWebhookView.as_view(), name='payment-webhook'),
    path('status/', SubscriptionStatusView.as_view(), name='payment-status'),
    path('promo/', ApplyPromoCodeView.as_view(), name='payment-promo'),
    path('marketplace/inventory/', MarketplaceInventoryView.as_view(), name='marketplace-inventory'),
    path('marketplace/buy-powerup/', MarketplaceBuyPowerupView.as_view(), name='marketplace-buy-powerup'),
    path('marketplace/use-powerup/', MarketplaceUsePowerupView.as_view(), name='marketplace-use-powerup'),
    path('marketplace/buy-xp/', MarketplaceBuyXPView.as_view(), name='marketplace-buy-xp'),
]
