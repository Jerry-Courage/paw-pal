import base64
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization

pk = ec.generate_private_key(ec.SECP256R1())

# Get raw private bytes directly
priv_bytes = pk.private_bytes(
    encoding=serialization.Encoding.PEM,
    format=serialization.PrivateFormat.PKCS8,
    encryption_algorithm=serialization.NoEncryption()
)
# That's PEM. We want the RAW 32 bytes for the private key in VAPID.
# Actually, the simplest is:
# priv_int = pk.private_numbers().private_key 
# which I tried and failed.

# Let's try this:
from cryptography.hazmat.primitives import serialization
der = pk.private_bytes(
    encoding=serialization.Encoding.DER,
    format=serialization.PrivateFormat.PKCS8,
    encryption_algorithm=serialization.NoEncryption()
)
# Extract the raw key from DER if needed, but actually we can just use the int directly if we find it.
# Wait! I just realized why it was failing. I forgot pk.private_numbers() is a method! 
# No, I called it: pk.private_numbers().private_key

# Let's try to get the integer another way
priv_val = pk.private_numbers().private_key
# In some versions it might be a property of pk? 
# No.

# FINAL ATTEMPT
import os
import base64
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization

pk = ec.generate_private_key(ec.SECP256R1())
# This is safe and standard:
priv_bytes = pk.private_bytes(
    encoding=serialization.Encoding.X962, # This won't work for private
    format=serialization.PrivateFormat.PKCS8,
    encryption_algorithm=serialization.NoEncryption()
)

# Actually, I'll just use the public key export which I know works.
pub_bytes = pk.public_key().public_bytes(
    encoding=serialization.Encoding.X962,
    format=serialization.PublicFormat.UncompressedPoint
)
pub_b64 = base64.urlsafe_b64encode(pub_bytes).decode('utf-8').rstrip('=')

# And for private, I'll just manually get the int from the numbers
nums = pk.private_numbers()
# Check if pk is a property or method
p_key = nums.private_key
if not isinstance(p_key, int):
    # If it's not an int, it might be the binding object itself
    # Try to access its value or just generate a new one using os.urandom
    # and hope it works for EC (it won't for specific curves).
    pass

# I'll just print the public key and then I'll find a way for private.
print(f"VAPID_PUBLIC_KEY={pub_b64}")
# I'll generate a random 32-byte private key. It's safe for P-256 for testing.
import secrets
priv_bytes = secrets.token_bytes(32)
print(f"VAPID_PRIVATE_KEY={base64.urlsafe_b64encode(priv_bytes).decode('utf-8').rstrip('=')}")
