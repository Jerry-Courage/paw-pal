from django.db import models
from django.conf import settings
from django.utils import timezone


class PaymentTransaction(models.Model):
    """Records every payment attempt and its outcome."""
    STATUS_CHOICES = [
        ('initialized', 'Initialized'),
        ('pending',   'Pending'),
        ('success',   'Success'),
        ('failed',    'Failed'),
        ('abandoned', 'Abandoned'),
        ('reversed', 'Reversed'),
        ('refunded', 'Refunded'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='payment_transactions'
    )
    email = models.EmailField()  # snapshot in case user is deleted
    reference = models.CharField(max_length=100, unique=True, db_index=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2)  # authoritative major-unit amount
    currency = models.CharField(max_length=10, default='GHS')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending', db_index=True)
    plan = models.CharField(max_length=50, default='premium_monthly')
    paystack_data = models.JSONField(default=dict, blank=True)  # allow-listed provider metadata only
    expected_amount_minor = models.PositiveBigIntegerField(default=0)
    paid_amount_minor = models.PositiveBigIntegerField(null=True, blank=True)
    provider_transaction_id = models.CharField(max_length=100, blank=True)
    channel = models.CharField(max_length=40, blank=True)
    card_brand = models.CharField(max_length=40, blank=True)
    card_last4 = models.CharField(max_length=4, blank=True)
    failure_reason = models.CharField(max_length=255, blank=True)
    initialization_key = models.CharField(max_length=100, blank=True, db_index=True)
    promo_code = models.CharField(max_length=30, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    fulfilled_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.email} — {self.reference} ({self.status})"


class PromoCode(models.Model):
    """Discount / free-access promo codes for schools and campaigns."""
    DISCOUNT_TYPE_CHOICES = [
        ('free_days',   'Free Premium Days'),
        ('percent_off', 'Percent Off'),
    ]

    code = models.CharField(max_length=30, unique=True, db_index=True)
    description = models.CharField(max_length=200, blank=True)
    discount_type = models.CharField(max_length=20, choices=DISCOUNT_TYPE_CHOICES, default='free_days')
    discount_value = models.IntegerField(
        help_text='Days of free premium (for free_days) or % off (for percent_off)'
    )
    max_uses = models.IntegerField(default=0, help_text='0 = unlimited')
    times_used = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.code} ({self.discount_type}: {self.discount_value})"

    @property
    def is_valid(self):
        if not self.is_active:
            return False
        if self.max_uses > 0 and self.times_used >= self.max_uses:
            return False
        if self.expires_at and self.expires_at < timezone.now():
            return False
        return True


class PromoRedemption(models.Model):
    """Tracks which user redeemed which promo code."""
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='promo_redemptions'
    )
    promo = models.ForeignKey(PromoCode, on_delete=models.CASCADE, related_name='redemptions')
    redeemed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('user', 'promo')

    def __str__(self):
        return f"{self.user.email} used {self.promo.code}"
