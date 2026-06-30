#!/usr/bin/env python3
"""
Standalone test for channel layer fallback logic.
Does not require Django setup.
"""
import os
import sys
from unittest.mock import patch, MagicMock

# Add backend to path
sys.path.insert(0, os.path.dirname(__file__))

from core.channel_layers import get_channel_layers_config


def test_uses_inmemory_by_default():
    """When USE_REDIS_CHANNELS is not set, use in-memory."""
    with patch.dict(os.environ, {}, clear=True):
        config = get_channel_layers_config()
        assert config["default"]["BACKEND"] == "channels.layers.InMemoryChannelLayer"
        print("✓ Uses in-memory by default when no Redis config")


def test_uses_inmemory_when_redis_disabled():
    """When USE_REDIS_CHANNELS is false, use in-memory."""
    with patch.dict(os.environ, {"USE_REDIS_CHANNELS": "false", "REDIS_URL": "redis://localhost:6379"}, clear=True):
        config = get_channel_layers_config()
        assert config["default"]["BACKEND"] == "channels.layers.InMemoryChannelLayer"
        print("✓ Uses in-memory when USE_REDIS_CHANNELS is false")


def test_uses_inmemory_when_redis_unreachable():
    """When Redis is unreachable, fall back to in-memory."""
    with patch.dict(os.environ, {"USE_REDIS_CHANNELS": "true", "REDIS_URL": "redis://localhost:6379"}, clear=True):
        with patch("core.channel_layers.socket.create_connection", side_effect=OSError("Connection refused")):
            config = get_channel_layers_config()
            assert config["default"]["BACKEND"] == "channels.layers.InMemoryChannelLayer"
            print("✓ Falls back to in-memory when Redis is unreachable")


def test_uses_redis_when_enabled_and_available():
    """When Redis is enabled and available, use it."""
    with patch.dict(os.environ, {"USE_REDIS_CHANNELS": "true", "REDIS_URL": "redis://localhost:6379"}, clear=True):
        with patch("core.channel_layers.socket.create_connection") as mock_connect:
            mock_sock = MagicMock()
            mock_connect.return_value = mock_sock
            
            config = get_channel_layers_config()
            assert config["default"]["BACKEND"] == "channels_redis.core.RedisChannelLayer"
            assert config["default"]["CONFIG"]["hosts"] == ["redis://localhost:6379"]
            print("✓ Uses Redis when enabled and available")


def test_parses_redis_url_correctly():
    """Parse Redis URL to extract host and port."""
    with patch.dict(os.environ, {"USE_REDIS_CHANNELS": "true", "REDIS_URL": "redis://custom-host:9999/0"}, clear=True):
        with patch("core.channel_layers.socket.create_connection") as mock_connect:
            mock_sock = MagicMock()
            mock_connect.return_value = mock_sock
            
            config = get_channel_layers_config()
            # Verify socket.create_connection was called with the right host/port
            mock_connect.assert_called_once_with(("custom-host", 9999), timeout=0.5)
            print("✓ Parses Redis URL correctly")


if __name__ == "__main__":
    test_uses_inmemory_by_default()
    test_uses_inmemory_when_redis_disabled()
    test_uses_inmemory_when_redis_unreachable()
    test_uses_redis_when_enabled_and_available()
    test_parses_redis_url_correctly()
    print("\n✅ All fallback tests passed!")
