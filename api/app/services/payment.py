"""Razorpay: create orders and check signatures. In mock mode no money moves."""
import hashlib
import hmac
import secrets

import httpx

from ..config import get_settings

RAZORPAY_ORDERS_URL = "https://api.razorpay.com/v1/orders"


def create_gateway_order(amount: int, currency: str, receipt: str, notes: dict) -> dict:
    """Amount in paise. Returns {"id": "order_...", ...}."""
    s = get_settings()
    if s.payment_mode == "mock":
        return {"id": f"mock_order_{secrets.token_hex(8)}", "amount": amount, "currency": currency}
    res = httpx.post(
        RAZORPAY_ORDERS_URL,
        auth=(s.razorpay_key_id, s.razorpay_key_secret),
        json={"amount": amount, "currency": currency, "receipt": receipt, "notes": notes},
        timeout=15,
    )
    res.raise_for_status()
    return res.json()


def _sign(secret: str, message: bytes) -> str:
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()


def verify_checkout_signature(order_id: str, payment_id: str, signature: str | None) -> bool:
    """Razorpay signs "order_id|payment_id" with your key secret. A fake payment can't produce it."""
    if not signature:
        return False
    expected = _sign(get_settings().razorpay_key_secret, f"{order_id}|{payment_id}".encode())
    return hmac.compare_digest(expected, signature)


def verify_webhook_signature(raw_body: bytes, signature: str | None) -> bool:
    secret = get_settings().razorpay_webhook_secret
    if not secret or not signature:
        return False
    return hmac.compare_digest(_sign(secret, raw_body), signature)


def public_payment_config() -> dict:
    s = get_settings()
    return {"mode": s.payment_mode, "keyId": s.razorpay_key_id if s.payment_mode == "razorpay" else None}
