from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization
import base64

key = ec.generate_private_key(ec.SECP256R1())
private_bytes = key.private_numbers().private_value.to_bytes(32, 'big')
public_key = key.public_key()
public_bytes = public_key.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)

def b64url(data):
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode()

print('PUBLIC:', b64url(public_bytes))
print('PRIVATE:', b64url(private_bytes))
