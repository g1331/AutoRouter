# Design: AI API Proxy with Multi-Upstream Support

## Context

The FastAPI backend needs to become an intelligent proxy for AI API requests, supporting multiple upstream providers with different authentication schemes. This requires careful handling of:
- HTTP header filtering (hop-by-hop headers must be removed)
- Provider-specific authentication (OpenAI vs Anthropic use different header formats)
- Streaming responses (SSE events with token usage extraction)
- Structured logging (loguru integration with uvicorn/fastapi)
- Flexible configuration (support dynamic proxy route prefixes)

## Goals

- Enable transparent proxying of `/v1/messages` (Anthropic) and `/v1/responses` (OpenAI) requests
- Support configuring multiple upstream services with independent credentials
- Allow runtime selection of which upstream to use per request
- Maintain detailed audit logs including request paths, response sizes, token usage
- Provide dynamic configuration of the proxy route prefix
- Ensure production-grade code quality with comprehensive error handling

## Non-Goals

- Hot-reloading of upstream configuration (requires app restart)
- Load balancing or failover across multiple upstreams
- Request/response caching
- Rate limiting or quota enforcement
- Custom authentication schemes beyond Bearer token and x-api-key

## Decisions

### 1. Upstream Configuration Management

**Decision**: Use pydantic-settings with JSON environment variable format

**Why**:
- Pydantic validation ensures type safety and early detection of misconfiguration
- JSON format in env vars scales better than nested env var indexing
- Compatible with container orchestration (Docker, K8s) secret management
- Supports multiple upstreams in a single configuration

**Example**:
```bash
UPSTREAMS='[
  {
    "name": "primary-openai",
    "provider": "openai",
    "base_url": "https://api.openai.com",
    "api_key": "sk-xxx",
    "is_default": true
  }
]'
```

### 2. Upstream Selection Mechanism

**Decision**: Request header `X-Upstream-Name` with default fallback

**Why**:
- Non-intrusive: doesn't pollute URL path or query params
- Compatible with upstream SDK expectations
- Network infrastructure can route/log based on header
- Simple to implement in client libraries
- Backward compatible: missing header uses default

**Flow**:
```
Client sends X-Upstream-Name: backup-openai
→ Validate upstream exists
→ Use that upstream's credentials
→ If header missing or invalid → use default upstream
```

### 3. HTTP Client Selection

**Decision**: Use httpx.AsyncClient instead of aiohttp

**Why**:
- Native async/await support matching FastAPI patterns
- Better integration with pydantic validation
- Simpler API for streaming responses
- Active maintenance and modern Python 3.12+ support
- Type hints are first-class (useful for strict type checking)

### 4. Authentication Header Injection

**Decision**: Provider-specific header formats

**Why**:
- OpenAI officially uses `Authorization: Bearer ${key}`
- Anthropic officially uses `x-api-key: ${key}`
- Attempting to normalize would break compatibility with official SDKs
- Per-provider logic is explicit and testable

**Implementation**:
```python
if upstream.provider == Provider.OPENAI:
    headers["Authorization"] = f"Bearer {api_key}"
elif upstream.provider == Provider.ANTHROPIC:
    headers["x-api-key"] = api_key
```

### 5. Logging Architecture

**Decision**: Replace standard logging with loguru + InterceptHandler

**Why**:
- Loguru provides structured logging with better formatting options
- Rich context support (function, line number, timestamps)
- Better for cloud/containerized deployments (better stdout handling)
- Can intercept uvicorn and fastapi logs for unified output
- Easier to exclude sensitive information (API keys)

**Integration**:
- Configure loguru in `app/core/logging.py`
- Create InterceptHandler to forward standard logging to loguru
- Initialize in `create_app()` during lifespan setup

### 6. Streaming Response Handling

**Decision**: Parse SSE events line-by-line, extract usage from each complete event

**Why**:
- SSE format is line-oriented; TCP chunks may split events
- Token usage appears in the final message of a stream
- Must buffer incomplete lines and emit usage when events complete
- Supports both OpenAI and Anthropic SSE formats

**Key Challenge**: Events are delimited by blank lines (`\n\n`), not chunk boundaries
```
data: {...usage...}\n
\n
data: {...next event...}\n
```

### 7. Route Prefix Flexibility

**Decision**: Dynamic proxy_prefix in Settings, register router at config time

**Why**:
- Users may need different prefixes (`/api`, `/proxy`, `/v1`) depending on infrastructure
- Configuration-driven approach avoids hardcoding routing
- Allows different instances to expose proxy at different paths

**Limitation**: Requires app restart to change prefix (acceptable for deployment config)

## Alternatives Considered

### 1. Single hardcoded route path
**Rejected**: Lacks flexibility for different deployment scenarios

### 2. Dynamic routing via middleware
**Rejected**: More complex; routing should be explicit in configuration

### 3. Unified authentication header (all Bearer)
**Rejected**: Breaks Anthropic API compatibility; official client uses x-api-key

### 4. Standard Python logging with formatters
**Rejected**: Less flexible formatting; loguru has superior structured logging

### 5. Request/response body caching
**Rejected**: Out of scope; increases memory usage and complexity

## Risks & Mitigation

| Risk | Mitigation |
|------|-----------|
| Misconfigured upstream URLs → 502 errors | Validate URLs at startup; clear error messages |
| SSE event buffering edge cases | Extensive tests for multi-chunk boundaries |
| Logging library version conflicts | Pin loguru version; test with integration tests |
| Hop-by-hop headers corrupting upstream | Whitelist approach: only copy safe headers |
| API key leakage in logs | Use SecretStr; log only key prefix; never log request bodies |
| Timeout during SSE stream | Set httpx read timeout to None; document implications |

## Migration Plan

This is a new capability; no migration needed.

### Rollout Steps

1. Deploy with `UPSTREAMS` env var pointing to staging upstream
2. Monitor logs for header filtering issues and token usage accuracy
3. Gradually migrate traffic from direct API calls to proxy
4. Verify SSE streaming works for long-running requests
5. Add monitoring/alerting for upstream health checks (future)

## Open Questions

1. Should we add health check endpoint for upstreams (`/proxy/v1/health`)?
   - **Decision**: Not in MVP; can add in future change
2. Should we support request/response filtering or transformation?
   - **Decision**: No; keep proxy transparent
3. Should proxy_prefix support hot-reload (signal-based)?
   - **Decision**: No; config changes require restart (standard practice)

