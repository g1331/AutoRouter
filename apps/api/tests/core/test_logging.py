"""Tests for logging configuration."""

import logging

import pytest

from app.core.logging import InterceptHandler, setup_logging


class TestInterceptHandler:
    """Tests for InterceptHandler class."""

    def test_intercept_handler_is_logging_handler(self) -> None:
        """InterceptHandler should be a valid logging.Handler subclass."""
        handler = InterceptHandler()
        assert isinstance(handler, logging.Handler)


class TestSetupLogging:
    """Tests for setup_logging function."""

    @pytest.fixture(autouse=True)
    def setup_and_teardown(self) -> None:
        """Store original logger states and restore after test."""
        # Store original states
        original_states: dict[str, tuple[list[logging.Handler], bool]] = {}
        loggers_to_check = [
            "uvicorn",
            "uvicorn.access",
            "uvicorn.error",
            "fastapi",
            "sqlalchemy",
            "sqlalchemy.engine",
            "sqlalchemy.engine.Engine",
            "sqlalchemy.pool",
            "sqlalchemy.orm",
            "sqlalchemy.dialects",
            "httpx",
            "httpcore",
        ]
        for name in loggers_to_check:
            lg = logging.getLogger(name)
            original_states[name] = (lg.handlers.copy(), lg.propagate)

        root = logging.getLogger()
        original_root_handlers = root.handlers.copy()
        original_root_level = root.level

        yield

        # Restore original states
        for name, (handlers, propagate) in original_states.items():
            lg = logging.getLogger(name)
            lg.handlers = handlers
            lg.propagate = propagate

        root = logging.getLogger()
        root.handlers = original_root_handlers
        root.setLevel(original_root_level)

    @pytest.mark.parametrize(
        "logger_name",
        [
            "uvicorn",
            "uvicorn.access",
            "uvicorn.error",
            "fastapi",
            "sqlalchemy",
            "sqlalchemy.engine",
            "sqlalchemy.engine.Engine",
            "sqlalchemy.pool",
            "sqlalchemy.orm",
            "sqlalchemy.dialects",
            "httpx",
            "httpcore",
        ],
    )
    def test_logger_uses_intercept_handler(self, logger_name: str) -> None:
        """Each intercepted logger should have InterceptHandler as its handler."""
        setup_logging()

        lg = logging.getLogger(logger_name)
        assert len(lg.handlers) == 1, f"{logger_name} should have exactly 1 handler"
        assert isinstance(lg.handlers[0], InterceptHandler), (
            f"{logger_name} handler should be InterceptHandler"
        )

    @pytest.mark.parametrize(
        "logger_name",
        [
            "uvicorn",
            "uvicorn.access",
            "uvicorn.error",
            "fastapi",
            "sqlalchemy",
            "sqlalchemy.engine",
            "sqlalchemy.engine.Engine",
            "sqlalchemy.pool",
            "sqlalchemy.orm",
            "sqlalchemy.dialects",
            "httpx",
            "httpcore",
        ],
    )
    def test_logger_propagate_disabled(self, logger_name: str) -> None:
        """Each intercepted logger should have propagate=False to avoid duplicate logs."""
        setup_logging()

        lg = logging.getLogger(logger_name)
        assert lg.propagate is False, f"{logger_name} should have propagate=False"

    def test_root_logger_has_intercept_handler(self) -> None:
        """Root logger should also use InterceptHandler."""
        setup_logging()

        root = logging.getLogger()
        assert any(isinstance(h, InterceptHandler) for h in root.handlers), (
            "Root logger should have InterceptHandler"
        )
