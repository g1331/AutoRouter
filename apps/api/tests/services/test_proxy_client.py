"""Tests for proxy_client service."""

from pydantic import HttpUrl, SecretStr

from app.models.upstream import Provider, UpstreamConfig
from app.services.proxy_client import (
    extract_usage,
    filter_headers,
    inject_auth_header,
)


class TestFilterHeaders:
    """Tests for filter_headers function."""

    def test_removes_hop_by_hop_headers(self):
        """Should remove hop-by-hop headers."""
        headers = {
            "content-type": "application/json",
            "connection": "keep-alive",
            "host": "example.com",
            "transfer-encoding": "chunked",
            "x-custom-header": "value",
        }

        filtered = filter_headers(headers)

        assert "content-type" in filtered
        assert "x-custom-header" in filtered
        assert "connection" not in filtered
        assert "host" not in filtered
        assert "transfer-encoding" not in filtered

    def test_preserves_safe_headers(self):
        """Should preserve all safe headers."""
        headers = {
            "content-type": "application/json",
            "authorization": "Bearer token",
            "x-api-key": "key",
            "user-agent": "test-client",
        }

        filtered = filter_headers(headers)

        assert filtered == headers


class TestInjectAuthHeader:
    """Tests for inject_auth_header function."""

    def test_openai_auth_format(self):
        """Should inject Bearer token for OpenAI."""
        headers = {"content-type": "application/json"}
        upstream = UpstreamConfig(
            name="test",
            provider=Provider.OPENAI,
            base_url=HttpUrl("https://api.openai.com"),
            api_key=SecretStr("sk-test-key"),
        )

        result = inject_auth_header(headers, upstream)

        assert result["Authorization"] == "Bearer sk-test-key"
        assert result["content-type"] == "application/json"

    def test_anthropic_auth_format(self):
        """Should inject x-api-key for Anthropic."""
        headers = {"content-type": "application/json"}
        upstream = UpstreamConfig(
            name="test",
            provider=Provider.ANTHROPIC,
            base_url=HttpUrl("https://api.anthropic.com"),
            api_key=SecretStr("sk-ant-test-key"),
        )

        result = inject_auth_header(headers, upstream)

        assert result["x-api-key"] == "sk-ant-test-key"
        assert result["content-type"] == "application/json"

    def test_does_not_modify_original(self):
        """Should not modify original headers dict."""
        headers = {"content-type": "application/json"}
        upstream = UpstreamConfig(
            name="test",
            provider=Provider.OPENAI,
            base_url=HttpUrl("https://api.openai.com"),
            api_key=SecretStr("sk-test-key"),
        )

        inject_auth_header(headers, upstream)

        assert "Authorization" not in headers


class TestExtractUsage:
    """Tests for extract_usage function."""

    def test_openai_format(self):
        """Should extract usage from OpenAI format."""
        data = {
            "id": "chatcmpl-123",
            "usage": {
                "prompt_tokens": 10,
                "completion_tokens": 15,
                "total_tokens": 25,
            },
        }

        usage = extract_usage(data)

        assert usage is not None
        assert usage["prompt_tokens"] == 10
        assert usage["completion_tokens"] == 15
        assert usage["total_tokens"] == 25

    def test_anthropic_format(self):
        """Should extract usage from Anthropic format."""
        data = {
            "id": "msg_123",
            "type": "message",
            "usage": {
                "input_tokens": 10,
                "output_tokens": 15,
            },
        }

        usage = extract_usage(data)

        assert usage is not None
        assert usage["prompt_tokens"] == 10
        assert usage["completion_tokens"] == 15
        assert usage["total_tokens"] == 25

    def test_no_usage_field(self):
        """Should return None if no usage field."""
        data = {
            "id": "test-123",
            "content": "Hello world",
        }

        usage = extract_usage(data)

        assert usage is None

    def test_anthropic_non_message_type(self):
        """Should return None for Anthropic non-message types."""
        data = {
            "type": "event",
            "usage": {
                "input_tokens": 10,
                "output_tokens": 15,
            },
        }

        usage = extract_usage(data)

        assert usage is None

    def test_handles_missing_token_fields(self):
        """Should handle missing token fields gracefully."""
        data = {
            "usage": {
                "prompt_tokens": 10,
            },
        }

        usage = extract_usage(data)

        assert usage is not None
        assert usage["prompt_tokens"] == 10
        assert usage["completion_tokens"] == 0
        assert usage["total_tokens"] == 0
