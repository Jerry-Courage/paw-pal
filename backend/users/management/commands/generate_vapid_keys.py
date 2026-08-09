"""
Management command to generate a fresh VAPID key pair for web push notifications.
Usage: python manage.py generate_vapid_keys
"""
from django.core.management.base import BaseCommand
import hashlib
import base64
import os


class Command(BaseCommand):
    help = 'Generate a VAPID key pair for web push notifications'

    def handle(self, *args, **options):
        try:
            from cryptography.hazmat.primitives.asymmetric import ec
            from cryptography.hazmat.primitives import serialization

            key = ec.generate_private_key(ec.SECP256R1())
            private_bytes = key.private_numbers().private_value.to_bytes(32, 'big')
            public_key = key.public_key()
            public_bytes = public_key.public_bytes(
                serialization.Encoding.X962,
                serialization.PublicFormat.UncompressedPoint
            )

            def b64url(data):
                return base64.urlsafe_b64encode(data).rstrip(b'=').decode()

            pub = b64url(public_bytes)
            priv = b64url(private_bytes)

            self.stdout.write(self.style.SUCCESS('\n  VAPID Key Pair Generated\n'))
            self.stdout.write(f'  VAPID_PUBLIC_KEY={pub}')
            self.stdout.write(f'  VAPID_PRIVATE_KEY={priv}')
            self.stdout.write(self.style.WARNING(
                '\n\n  Add these to your environment variables on Render.'
                '\n  These are a matched pair — the public key goes to the frontend,'
                '\n  the private key stays on the backend.\n'
            ))
        except ImportError:
            self.stdout.write(self.style.ERROR(
                'cryptography package not installed. Run: pip install cryptography'
            ))
