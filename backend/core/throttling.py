from rest_framework.throttling import UserRateThrottle, AnonRateThrottle


class AIRateThrottle(UserRateThrottle):
    """
    Plan-aware throttle for AI endpoints.
    Premium users get 3x the requests of free users.
    """
    scope = 'ai'

    def get_cache_key(self, request, view):
        # Differentiate cache key by plan so limits are tracked separately
        if request.user and request.user.is_authenticated:
            plan = 'premium' if getattr(request.user, 'has_active_subscription', False) else 'free'
            ident = f'{request.user.pk}_{plan}'
            return self.cache_format % {
                'scope': self.scope,
                'ident': ident,
            }
        return super().get_cache_key(request, view)

    def get_rate(self):
        # Dynamically choose rate based on plan at request time
        # Called once per request so we need to inspect the current request
        # UserRateThrottle.get_rate() reads from settings — we override allow_request instead
        return super().get_rate()

    def allow_request(self, request, view):
        # Apply a higher rate for premium users
        if request.user and request.user.is_authenticated:
            if getattr(request.user, 'has_active_subscription', False):
                self.scope = 'ai_premium'
            else:
                self.scope = 'ai'
        return super().allow_request(request, view)


class UploadRateThrottle(UserRateThrottle):
    """Throttle for file upload endpoints."""
    scope = 'upload'


class BurstRateThrottle(UserRateThrottle):
    """Short burst throttle — 60 requests per minute."""
    scope = 'burst'
    THROTTLE_RATES = {'burst': '60/min'}
