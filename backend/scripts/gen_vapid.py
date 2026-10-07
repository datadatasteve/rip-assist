"""Print a fresh VAPID key pair in the format the app expects.

    .venv/bin/python scripts/gen_vapid.py
"""
import base64

from cryptography.hazmat.primitives import serialization
from py_vapid import Vapid01

v = Vapid01()
v.generate_keys()
raw_priv = v.private_key.private_numbers().private_value.to_bytes(32, "big")
raw_pub = v.public_key.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
b64 = lambda b: base64.urlsafe_b64encode(b).rstrip(b"=").decode()  # noqa: E731
print(f"VAPID_PUBLIC_KEY={b64(raw_pub)}")
print(f"VAPID_PRIVATE_KEY={b64(raw_priv)}")
