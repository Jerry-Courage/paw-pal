from rest_framework.throttling import UserRateThrottle, AnonRateThrottle


class AIRateThrottle(UserRateThrottle):
    """Strict throttle for AI/OpenRouter endpoints to protect API credits."""
    scope = 'ai'


class UploadRateThrottle(UserRateThrottle):
    """Throttle for file upload endpoints."""
    scope = 'upload'


class BurstRateThrottle(UserRateThrottle):
    """Short burst throttle — 60 requests per minute."""
    scope = 'burst'
    THROTTLE_RATES = {'burst': '60/min'}
