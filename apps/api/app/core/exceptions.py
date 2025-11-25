"""Custom exceptions for the application."""


class UpstreamNotFoundError(Exception):
    """Raised when a requested upstream is not found."""



class UpstreamTimeoutError(Exception):
    """Raised when an upstream request times out."""



class UpstreamConnectionError(Exception):
    """Raised when connection to upstream fails."""



class UpstreamError(Exception):
    """Base class for upstream-related errors."""

