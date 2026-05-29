from django.urls import path
from .views import (
    InitializePaymentView, VerifyPaymentView,
    PaystackWebhookView, SubscriptionStatusView, ApplyPromoCodeView
)

urlpatterns = [
    path('initialize/', InitializePaymentView.as_view(), name='payment-initialize'),
    path('verify/', VerifyPaymentView.as_view(), name='payment-verify'),
    path('webhook/', PaystackWebhookView.as_view(), name='payment-webhook'),
    path('status/', SubscriptionStatusView.as_view(), name='payment-status'),
    path('promo/', ApplyPromoCodeView.as_view(), name='payment-promo'),
]
