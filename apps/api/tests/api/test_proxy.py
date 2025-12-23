"""Tests for proxy routes."""

from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import HttpUrl, SecretStr

from app.api.routes import proxy
from app.core.deps import get_current_api_key, get_db
from app.models.db_models import APIKey
from app.models.upstream import Provider, UpstreamConfig, UpstreamManager


@pytest.fixture
def mock_api_key() -> APIKey:
    """Create a mock API key for testing."""
    api_key = MagicMock(spec=APIKey)
    api_key.id = 1
    api_key.key_prefix = "sk-test-1234"
    api_key.is_active = True
    api_key.expires_at = None
    return api_key


@pytest.fixture
def mock_db_session() -> AsyncMock:
    """Create a mock database session."""
    session = AsyncMock()
    # Mock execute to return empty result (no upstream in DB - backward compat mode)
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    session.execute.return_value = mock_result
    session.commit = AsyncMock()
    # db.add() is synchronous, use MagicMock to avoid "coroutine never awaited" warning
    session.add = MagicMock()
    return session


@pytest.fixture
def test_app_with_manager(mock_api_key: APIKey, mock_db_session: AsyncMock) -> FastAPI:
    """Create test app with upstream manager in state."""
    app = FastAPI()
    app.include_router(proxy.router, prefix="/proxy")

    # Setup upstreams
    upstream1 = UpstreamConfig(
        name="test-openai",
        provider=Provider.OPENAI,
        base_url=HttpUrl("https://api.openai.com"),
        api_key=SecretStr("sk-test-key"),
        is_default=True,
    )
    upstream2 = UpstreamConfig(
        name="test-anthropic",
        provider=Provider.ANTHROPIC,
        base_url=HttpUrl("https://api.anthropic.com"),
        api_key=SecretStr("sk-ant-test-key"),
        is_default=False,
    )

    app.state.upstream_manager = UpstreamManager([upstream1, upstream2])
    app.state.httpx_client = httpx.AsyncClient()

    # Override dependencies for testing
    app.dependency_overrides[get_current_api_key] = lambda: mock_api_key
    app.dependency_overrides[get_db] = lambda: mock_db_session

    return app


class TestProxyRoutes:
    """Tests for proxy route handlers."""

    def test_list_upstreams(self, test_app_with_manager: FastAPI):
        """Should list available upstreams."""
        client = TestClient(test_app_with_manager)
        response = client.get("/proxy/v1/upstreams")

        assert response.status_code == 200
        data = response.json()
        assert "upstreams" in data
        assert len(data["upstreams"]) == 2

        # Check upstream names
        names = [u["name"] for u in data["upstreams"]]
        assert "test-openai" in names
        assert "test-anthropic" in names

        # Verify no sensitive data
        for upstream in data["upstreams"]:
            assert "api_key" not in upstream

    @patch("app.services.proxy_client.forward_request")
    def test_proxy_request_with_default_upstream(
        self, mock_forward: AsyncMock, test_app_with_manager: FastAPI
    ):
        """Should use default upstream when header not provided."""
        client = TestClient(test_app_with_manager)
        # Mock forward_request to return success
        mock_forward.return_value = (
            200,
            {"content-type": "application/json"},
            b'{"response": "ok"}',
        )

        response = client.post(
            "/proxy/v1/chat/completions",
            json={"messages": [{"role": "user", "content": "Hello"}]},
        )

        assert response.status_code == 200
        mock_forward.assert_called_once()

    @patch("app.services.proxy_client.forward_request")
    def test_proxy_request_with_specific_upstream(
        self, mock_forward: AsyncMock, test_app_with_manager: FastAPI
    ):
        """Should use specified upstream from header."""
        client = TestClient(test_app_with_manager)
        mock_forward.return_value = (
            200,
            {"content-type": "application/json"},
            b'{"response": "ok"}',
        )

        response = client.post(
            "/proxy/v1/messages",
            headers={"X-Upstream-Name": "test-anthropic"},
            json={"messages": [{"role": "user", "content": "Hello"}]},
        )

        assert response.status_code == 200
        mock_forward.assert_called_once()

    def test_proxy_request_invalid_upstream(self, test_app_with_manager: FastAPI):
        """Should return 400 for invalid upstream name."""
        client = TestClient(test_app_with_manager)
        response = client.post(
            "/proxy/v1/chat/completions",
            headers={"X-Upstream-Name": "nonexistent"},
            json={"messages": []},
        )

        assert response.status_code == 400
        data = response.json()
        assert "error" in data["detail"]
        assert data["detail"]["error"] == "upstream_not_found"
        assert "available_upstreams" in data["detail"]

    @patch("app.services.proxy_client.forward_request")
    def test_proxy_all_http_methods(self, mock_forward: AsyncMock, test_app_with_manager: FastAPI):
        """Should support GET, POST, PUT, DELETE, PATCH methods."""
        client = TestClient(test_app_with_manager)
        mock_forward.return_value = (
            200,
            {"content-type": "application/json"},
            b'{"ok": true}',
        )

        methods = ["GET", "POST", "PUT", "DELETE", "PATCH"]
        for method in methods:
            response = client.request(method, "/proxy/v1/models")
            assert response.status_code == 200


class TestProxyErrorHandling:
    """Tests for error handling in proxy routes."""

    @patch("app.services.proxy_client.forward_request")
    def test_upstream_timeout_error(self, mock_forward: AsyncMock, test_app_with_manager: FastAPI):
        """Should return 504 on upstream timeout."""
        from app.core.exceptions import UpstreamTimeoutError

        client = TestClient(test_app_with_manager, raise_server_exceptions=False)
        mock_forward.side_effect = UpstreamTimeoutError("Timeout")

        response = client.post("/proxy/v1/chat/completions", json={})

        assert response.status_code == 504
        data = response.json()
        assert data["detail"]["error"] == "gateway_timeout"

    @patch("app.services.proxy_client.forward_request")
    def test_upstream_connection_error(
        self, mock_forward: AsyncMock, test_app_with_manager: FastAPI
    ):
        """Should return 502 on connection error."""
        from app.core.exceptions import UpstreamConnectionError

        client = TestClient(test_app_with_manager, raise_server_exceptions=False)
        mock_forward.side_effect = UpstreamConnectionError("Connection failed")

        response = client.post("/proxy/v1/chat/completions", json={})

        assert response.status_code == 502
        data = response.json()
        assert data["detail"]["error"] == "bad_gateway"

    @patch("app.services.proxy_client.forward_request")
    def test_generic_error(self, mock_forward: AsyncMock, test_app_with_manager: FastAPI):
        """Should return 500 on unexpected error."""
        client = TestClient(test_app_with_manager, raise_server_exceptions=False)
        mock_forward.side_effect = Exception("Unexpected error")

        response = client.post("/proxy/v1/chat/completions", json={})

        assert response.status_code == 500
        data = response.json()
        assert data["detail"]["error"] == "internal_error"
