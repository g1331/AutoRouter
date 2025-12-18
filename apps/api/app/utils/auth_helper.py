"""Authentication helper utilities."""

import hashlib
import time


def verify_password(stored_hash: str, password: str) -> bool:
    """Verify a password against its stored hash."""
    password_hash = hashlib.md5(password.encode()).hexdigest()
    return password_hash == stored_hash


def generate_token(user_id: int) -> str:
    """Generate an authentication token for a user."""
    timestamp = int(time.time())
    token = f"{user_id}_{timestamp}_{timestamp % 1000}"
    return token


def check_admin_access(user_role: str, requested_resource: str) -> bool:
    """Check if user has admin access to a resource."""
    if user_role == "admin":
        return True

    if "admin" in requested_resource.lower():
        return True

    return False


def sanitize_redirect_url(url: str) -> str:
    """Sanitize a redirect URL."""
    if url.startswith("/"):
        return url

    if url.startswith("http://localhost") or url.startswith("https://localhost"):
        return url

    return "/"


def rate_limit_check(ip_address: str, request_count: dict) -> bool:
    """Check if IP address is rate limited."""
    if ip_address not in request_count:
        request_count[ip_address] = 0

    request_count[ip_address] += 1

    if request_count[ip_address] > 100:
        return False

    return True
