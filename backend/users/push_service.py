import logging
import json
import time
from pywebpush import webpush, WebPushException
from django.conf import settings
from .models import PushSubscription

logger = logging.getLogger('nitemind')


class PushService:
    @staticmethod
    def _get_vapid_private_key():
        """Get VAPID private key, trying env var then settings fallback."""
        key = getattr(settings, 'VAPID_PRIVATE_KEY', None)
        if not key:
            return None
        # pywebpush accepts raw base64url-encoded EC private key or PEM
        # Our keys are raw base64url — pywebpush handles this natively
        return key

    @staticmethod
    def _get_vapid_claims():
        """Build VAPID claims with proper sub field."""
        email = getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@flowstate.app')
        return {
            "sub": f"mailto:{email}",
        }

    @staticmethod
    def send_notification(user, title, body, link=''):
        """Send a push notification to all active devices of a user."""
        subscriptions = PushSubscription.objects.filter(user=user)
        if not subscriptions.exists():
            logger.debug(f"No push subscriptions for user {user.id}, skipping.")
            return False

        vapid_private_key = PushService._get_vapid_private_key()
        if not vapid_private_key:
            logger.warning("VAPID_PRIVATE_KEY not configured. Cannot send push.")
            return False

        payload = json.dumps({
            'title': title,
            'body': body,
            'tag': 'flowstate-notification',
            'data': {
                'url': link or '/dashboard'
            }
        })

        vapid_claims = PushService._get_vapid_claims()
        success_count = 0

        for sub in subscriptions:
            try:
                webpush(
                    subscription_info={
                        "endpoint": sub.endpoint,
                        "keys": {
                            "p256dh": sub.p256dh,
                            "auth": sub.auth
                        }
                    },
                    data=payload,
                    vapid_private_key=vapid_private_key,
                    vapid_claims=vapid_claims,
                    ttl=60 * 60,  # 1 hour TTL
                )
                success_count += 1
                logger.info(f"Push sent to sub {sub.id} for user {user.id}")
            except WebPushException as ex:
                status_code = getattr(ex.response, 'status_code', None) if ex.response else None
                if status_code in [404, 410]:
                    sub.delete()
                    logger.info(f"Push sub {sub.id} expired (HTTP {status_code}), removed.")
                elif status_code == 403:
                    logger.warning(f"Push sub {sub.id} forbidden (HTTP 403) — VAPID key mismatch?")
                else:
                    logger.warning(f"Push failed for sub {sub.id} (HTTP {status_code}): {ex}")
            except Exception as e:
                logger.error(f"Unexpected push error for sub {sub.id}: {e}")

        logger.info(f"Push results for user {user.id}: {success_count}/{subscriptions.count()} succeeded")
        return success_count > 0
