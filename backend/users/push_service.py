import logging
import json
from pywebpush import webpush, WebPushException
from django.conf import settings
from .models import PushSubscription

logger = logging.getLogger('flowstate')

class PushService:
    @staticmethod
    def send_notification(user, title, body, link=''):
        """Send a push notification to all active devices of a user."""
        subscriptions = PushSubscription.objects.filter(user=user)
        if not subscriptions.exists():
            return False

        payload = {
            'title': title,
            'body': body,
            'data': {
                'url': link or '/'
            }
        }

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
                    data=json.dumps(payload),
                    vapid_private_key=settings.VAPID_PRIVATE_KEY,
                    vapid_claims={
                        "sub": f"mailto:{settings.DEFAULT_FROM_EMAIL}"
                    }
                )
                success_count += 1
            except WebPushException as ex:
                logger.error(f"Push failed for sub {sub.id}: {ex}")
                # If the subscription is expired or invalid, delete it
                if ex.response and ex.response.status_code in [404, 410]:
                    sub.delete()
            except Exception as e:
                logger.error(f"Unexpected push error: {e}")

        return success_count > 0
