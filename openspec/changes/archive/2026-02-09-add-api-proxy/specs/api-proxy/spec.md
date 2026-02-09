# API Proxy Specification

## ADDED Requirements

### Requirement: Multi-Upstream Configuration

The system SHALL support configuring multiple AI service upstream providers, each with independent base URL, API credentials, timeout, and default designation.

#### Scenario: Configure single OpenAI upstream

- **WHEN** environment variable `UPSTREAMS` contains a single OpenAI configuration
- **THEN** application starts successfully with that upstream available for proxying

#### Scenario: Configure multiple upstreams (mixed providers)

- **WHEN** environment variable `UPSTREAMS` contains JSON array with OpenAI, Anthropic, and backup OpenAI configs
- **THEN** application starts successfully and all three upstreams are available for selection

#### Scenario: Validate upstream configuration at startup

- **WHEN** application initializes with invalid upstream configuration (missing api_key, invalid provider)
- **THEN** application exits with clear error message indicating the misconfiguration

#### Scenario: Set default upstream

- **WHEN** environment variable `UPSTREAMS` contains multiple entries with one marked `is_default: true`
- **THEN** requests without `X-Upstream-Name` header use the default upstream

#### Scenario: Auto-assign default if missing

- **WHEN** environment variable `UPSTREAMS` contains multiple entries with none marked `is_default`
- **THEN** first upstream is automatically marked as default

### Requirement: Runtime Upstream Selection

The system SHALL allow clients to select which upstream to use for a specific request via the `X-Upstream-Name` request header.

#### Scenario: Select specific upstream via header

- **WHEN** client sends `X-Upstream-Name: backup-openai` header with proxy request
- **THEN** request is forwarded to the "backup-openai" upstream configuration

#### Scenario: Use default when header absent

- **WHEN** client sends request without `X-Upstream-Name` header
- **THEN** request uses the default upstream

#### Scenario: Reject invalid upstream name

- **WHEN** client sends `X-Upstream-Name: nonexistent` header
- **THEN** proxy returns 400 Bad Request with list of available upstream names

#### Scenario: Query available upstreams

- **WHEN** client makes GET request to `/[proxy_prefix]/v1/upstreams`
- **THEN** response contains JSON list of available upstream names (without exposing API keys)

### Requirement: OpenAI API Forwarding

The system SHALL forward requests to OpenAI API endpoints using correct authentication and response handling.

#### Scenario: Forward OpenAI message request

- **WHEN** client sends POST request to `/[proxy_prefix]/v1/responses` with model payload
- **THEN** request is forwarded to OpenAI's `/v1/responses` endpoint with `Authorization: Bearer <key>` header

#### Scenario: Preserve request headers

- **WHEN** client sends custom headers (content-type, user-agent, etc.)
- **THEN** non-hop-by-hop headers are forwarded; connection, transfer-encoding, host, content-length are removed

#### Scenario: Stream OpenAI response

- **WHEN** OpenAI response has `Content-Type: text/event-stream`
- **THEN** response is streamed back to client with each SSE event intact

#### Scenario: Extract token usage from OpenAI SSE

- **WHEN** OpenAI streams a message with final event containing usage data
- **THEN** usage (input_tokens, output_tokens, cache_creation_input_tokens, etc.) is logged with request context

### Requirement: Anthropic API Forwarding

The system SHALL forward requests to Anthropic API endpoints using correct authentication and response handling.

#### Scenario: Forward Anthropic message request

- **WHEN** client sends POST request to `/[proxy_prefix]/v1/messages` with message payload
- **THEN** request is forwarded to Anthropic's `/v1/messages` endpoint with `x-api-key: <key>` header

#### Scenario: Use correct authentication header for Anthropic

- **WHEN** proxy forwards request to Anthropic upstream
- **THEN** authentication is via `x-api-key` header, not Bearer token

#### Scenario: Stream Anthropic response

- **WHEN** Anthropic response has `Content-Type: text/event-stream`
- **THEN** response is streamed back to client with each SSE event intact

#### Scenario: Extract token usage from Anthropic SSE

- **WHEN** Anthropic streams a message with final event containing usage data
- **THEN** usage (input_tokens, output_tokens) is logged with request context

### Requirement: Request Logging

The system SHALL log detailed information about proxied requests for debugging and audit purposes.

#### Scenario: Log request metadata

- **WHEN** proxy receives a request
- **THEN** log entry includes: request ID, upstream name, HTTP method, path, request size, timestamp

#### Scenario: Log request headers (when enabled)

- **WHEN** configuration `proxy_log_headers: true`
- **THEN** log entry includes filtered request headers (excluding Authorization, x-api-key)

#### Scenario: Redact API keys in logs

- **WHEN** proxy logs contain authentication headers or API keys
- **THEN** sensitive values are never fully logged (e.g., "sk-xxx..." format)

### Requirement: Response Logging and Token Usage Tracking

The system SHALL log upstream responses and extract token usage metrics.

#### Scenario: Log response metadata

- **WHEN** proxy receives upstream response
- **THEN** log entry includes: response status, response size, elapsed time, upstream name

#### Scenario: Log token usage from OpenAI

- **WHEN** OpenAI response includes usage in SSE or JSON
- **THEN** log entry includes: input_tokens, output_tokens, total_tokens, cache_creation_input_tokens, cache_read_input_tokens

#### Scenario: Log token usage from Anthropic

- **WHEN** Anthropic response includes usage in SSE or JSON
- **THEN** log entry includes: input_tokens, output_tokens, total_tokens

#### Scenario: Handle streaming responses without usage field

- **WHEN** SSE stream ends without usage data (incomplete request)
- **THEN** response is forwarded normally without throwing error; partial usage logged if available

### Requirement: HTTP Client Lifecycle Management

The system SHALL properly initialize and clean up HTTP client resources.

#### Scenario: Create httpx client on startup

- **WHEN** application lifespan begins
- **THEN** httpx.AsyncClient is created with appropriate timeout settings

#### Scenario: Close client on shutdown

- **WHEN** application lifespan ends
- **THEN** httpx.AsyncClient is properly closed, releasing all resources

#### Scenario: Configure timeouts for streaming

- **WHEN** httpx client is configured
- **THEN** connection timeout is set, read timeout is None (to support long SSE streams)

### Requirement: Error Handling and Status Code Transparency

The system SHALL transparently forward upstream errors to clients.

#### Scenario: Upstream returns 404

- **WHEN** upstream service returns 404 Not Found
- **THEN** proxy forwards 404 response with upstream body intact

#### Scenario: Upstream times out

- **WHEN** upstream fails to respond within timeout
- **THEN** proxy returns 504 Gateway Timeout with error message

#### Scenario: Upstream connection refused

- **WHEN** upstream service is unreachable
- **THEN** proxy returns 502 Bad Gateway with error message

#### Scenario: Malformed request to proxy

- **WHEN** client sends request with invalid upstream name
- **THEN** proxy returns 400 Bad Request with available upstream list

### Requirement: Structured Logging with Loguru

The system SHALL use loguru for structured, rich logging that integrates with uvicorn and FastAPI.

#### Scenario: Initialize loguru on startup

- **WHEN** application creates FastAPI app
- **THEN** loguru is configured with custom format and color output

#### Scenario: Intercept uvicorn logs

- **WHEN** uvicorn emits log messages
- **THEN** messages are intercepted and reformatted through loguru

#### Scenario: Intercept fastapi logs

- **WHEN** FastAPI emits log messages (e.g., startup, shutdown)
- **THEN** messages are intercepted and reformatted through loguru

#### Scenario: Unified log output

- **WHEN** application is running
- **THEN** all logs (proxy, uvicorn, fastapi) appear in consistent loguru format on stderr

### Requirement: Dynamic Proxy Route Prefix

The system SHALL support configurable routing prefix for the proxy endpoints.

#### Scenario: Default proxy prefix

- **WHEN** application starts without `PROXY_PREFIX` environment variable
- **THEN** proxy routes are available at `/proxy/v1/*` (default)

#### Scenario: Custom proxy prefix

- **WHEN** environment variable `PROXY_PREFIX=/api` is set
- **THEN** proxy routes are available at `/api/v1/*`

#### Scenario: Upstream endpoints available at prefix

- **WHEN** proxy prefix is set to `/custom-proxy`
- **THEN** endpoints `/custom-proxy/v1/messages`, `/custom-proxy/v1/responses`, `/custom-proxy/v1/upstreams` are available

#### Scenario: Configuration prefix takes effect on restart

- **WHEN** administrator changes `PROXY_PREFIX` environment variable and restarts application
- **THEN** new prefix is used; old prefix is no longer routed
