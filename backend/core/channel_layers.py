import os
import socket
from urllib.parse import urlparse


def _is_truthy(value):
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def get_channel_layers_config():
    """
    Smart channel layer config that:
    - Uses in-memory by default (safe, no external deps)
    - Only uses Redis if explicitly enabled and reachable
    - Fails safely if Redis is unavailable
    """
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
        # Test connection with a short timeout (0.5 seconds)
        sock = socket.create_connection((host, port), timeout=0.5)
        sock.close()
        # Redis is reachable - use it
        return {
            "default": {
                "BACKEND": "channels_redis.core.RedisChannelLayer",
                "CONFIG": {
                    "hosts": [redis_url],
                },
            }
        }
    except Exception:
        # Redis is unreachable, offline, or timed out - fall back to in-memory
        # This prevents startup failures when Redis is slow/down
        return {
            "default": {
                "BACKEND": "channels.layers.InMemoryChannelLayer",
            }
        }
