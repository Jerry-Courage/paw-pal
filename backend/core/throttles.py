from rest_framework.throttling import UserRateThrottle, AnonRateThrottle


class AIRateThrottle(UserRateThrottle):
    """30 AI requests per hour per user."""
    scope = 'ai'


class UploadRateThrottle(UserRateThrottle):
    """20 uploads per hour per user."""
    scope = 'upload'


class StrictAnonThrottle(AnonRateThrottle):
    """Strict throttle for unauthenticated endpoints like login/register."""
    scope = 'anon'
