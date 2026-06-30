import os
import socket
from urllib.parse import urlparse


def _is_truthy(value):
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def get_channel_layers_config():
    use_redis_channels = _is_truthy(os.getenv("USE_REDIS_CHANNELS", "False"))
    redis_url = os.getenv("REDIS_URL")

    if not use_redis_channels or not redis_url:
        return {
            "default": {
                "BACKEND": "channels.layers.InMemoryChannelLayer",
            }
        }

    parsed = urlparse(redis_url)
    host = parsed.hostname or "localhost"
    port = parsed.port or 6379

    try:
        sock = socket.create_connection((host, port), timeout=0.5)
    except OSError:
        return {
            "default": {
                "BACKEND": "channels.layers.InMemoryChannelLayer",
            }
        }
    else:
        sock.close()
        return {
            "default": {
                "BACKEND": "channels_redis.core.RedisChannelLayer",
                "CONFIG": {
                    "hosts": [redis_url],
                },
            }
        }
