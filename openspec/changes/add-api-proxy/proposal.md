# Change: Add AI API Proxy with Multi-Upstream Support

## Why

The application needs a flexible API proxy layer to:
1. Support multiple AI service providers (OpenAI, Anthropic) with independent configurations
2. Allow users to select which upstream service to use at request time via headers
3. Maintain detailed logging and token usage tracking for cost analysis
4. Handle streaming responses (SSE) correctly with full support for token usage extraction
5. Provide a configurable and dynamic routing prefix to adapt to different deployment environments

## What Changes

- **New API Gateway**: Add `/proxy/v1/*` endpoints to forward requests to configured upstream AI services
- **Multi-Upstream Configuration**: Support multiple upstream services via pydantic-settings environment variables
- **Runtime Upstream Selection**: Allow clients to specify which upstream to use via `X-Upstream-Name` request header
- **Provider-Specific Authentication**: Correctly inject authentication headers per provider (Bearer for OpenAI, x-api-key for Anthropic)
- **Streaming Response Support**: Full SSE stream handling with token usage extraction and logging
- **Structured Logging**: Replace standard logging with loguru to provide rich, structured logs that intercept uvicorn/fastapi logs
- **Dynamic Route Prefix**: Support configurable proxy route prefix via `proxy_prefix` setting

## Impact

- **New Specs**: `api-proxy` (API gateway and upstream management)
- **Affected Code**:
  - `apps/api/pyproject.toml` - Add httpx and loguru dependencies
  - `apps/api/app/core/config.py` - Extend Settings for upstream configs and proxy settings
  - `apps/api/app/main.py` - Register proxy routes, setup httpx lifecycle, configure loguru
  - **New Files**:
    - `apps/api/app/models/upstream.py` - Upstream configuration and manager
    - `apps/api/app/core/logging.py` - Loguru configuration
    - `apps/api/app/core/exceptions.py` - Custom exceptions
    - `apps/api/app/services/proxy_client.py` - HTTP proxy client
    - `apps/api/app/api/routes/proxy.py` - Proxy route handlers
    - `apps/api/tests/api/test_proxy.py` - Route tests
    - `apps/api/tests/services/test_proxy_client.py` - Service tests
    - `apps/api/.env.example` - Configuration example

- **Breaking Changes**: None - existing `/api/health` endpoint unchanged
- **Dependencies Added**: `httpx>=0.27.0`, `loguru>=0.7.0`

