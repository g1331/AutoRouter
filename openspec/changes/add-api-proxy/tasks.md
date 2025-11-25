# Implementation Tasks: API Proxy with Multi-Upstream Support

## Phase 1: Dependencies & Configuration (P0)

- [ ] 1.1 Add httpx and loguru to production dependencies in `pyproject.toml`
- [ ] 1.2 Update `uv lock` to resolve new dependencies
- [ ] 1.3 Create `app/models/upstream.py` with `Provider` enum and `UpstreamConfig` model
- [ ] 1.4 Create `UpstreamManager` class to handle upstream selection and validation logic
- [ ] 1.5 Create `app/core/exceptions.py` with custom exceptions (`UpstreamNotFoundError`, `UpstreamTimeoutError`, etc.)
- [ ] 1.6 Create `app/core/logging.py` with loguru configuration and InterceptHandler
- [ ] 1.7 Extend `app/core/config.py` to add `upstreams: list[UpstreamConfig]` and `proxy_prefix: str = "/proxy"`
- [ ] 1.8 Test configuration loading with multiple upstreams via environment variables
- [ ] 1.9 Test loguru initialization and verify uvicorn/fastapi logs are intercepted

## Phase 2: HTTP Client Service (P0)

- [ ] 2.1 Create `app/services/proxy_client.py` with httpx client wrapper
- [ ] 2.2 Implement `filter_headers()` function to remove hop-by-hop headers
- [ ] 2.3 Implement `inject_auth_header()` function with provider-specific logic (Bearer vs x-api-key)
- [ ] 2.4 Implement `extract_usage()` function to parse usage from JSON/SSE payloads
- [ ] 2.5 Implement `stream_sse_response()` async generator for streaming responses with usage extraction
- [ ] 2.6 Implement `forward_request()` main function that orchestrates request forwarding
- [ ] 2.7 Add error handling for timeout (504), connection errors (502), and transparent error forwarding
- [ ] 2.8 Add comprehensive logging throughout proxy_client (request metadata, response metadata, usage)
- [ ] 2.9 Unit test header filtering (whitelist approach, HOP_BY_HOP set)
- [ ] 2.10 Unit test auth header injection for both OpenAI and Anthropic
- [ ] 2.11 Unit test usage extraction from OpenAI format (usage at event end)
- [ ] 2.12 Unit test usage extraction from Anthropic format (type: message with usage)
- [ ] 2.13 Unit test SSE streaming with multi-chunk boundary handling
- [ ] 2.14 Unit test error scenarios (timeout, connection refused)

## Phase 3: Route Handlers (P0)

- [ ] 3.1 Create `app/api/routes/proxy.py` with route handler skeleton
- [ ] 3.2 Implement `@router.api_route("/v1/{path:path}")` handler to forward all HTTP methods
- [ ] 3.3 Extract `X-Upstream-Name` header in handler
- [ ] 3.4 Call upstream manager to select upstream (with validation)
- [ ] 3.5 Construct request metadata for logging (request ID, path, method, body size)
- [ ] 3.6 Call `proxy_client.forward_request()` with upstream and request details
- [ ] 3.7 Return StreamingResponse with upstream status code, headers, and body
- [ ] 3.8 Implement `@router.get("/v1/upstreams")` endpoint to list available upstreams (no API keys exposed)
- [ ] 3.9 Add error response for invalid upstream names (400 with available list)
- [ ] 3.10 Integration test: POST to `/proxy/v1/responses` with OpenAI-like payload
- [ ] 3.11 Integration test: POST to `/proxy/v1/messages` with Anthropic-like payload
- [ ] 3.12 Integration test: Streaming response with SSE events
- [ ] 3.13 Integration test: Upstream selection via `X-Upstream-Name` header
- [ ] 3.14 Integration test: Default upstream fallback when header absent

## Phase 4: Application Integration (P0)

- [ ] 4.1 Create httpx lifespan context in `app/main.py` to initialize/cleanup client
- [ ] 4.2 Create UpstreamManager instance in lifespan and store in `app.state`
- [ ] 4.3 Call `setup_logging()` from `app/core/logging.py` in `create_app()`
- [ ] 4.4 Register proxy router with dynamic prefix: `app.include_router(proxy.router, prefix=settings.proxy_prefix)`
- [ ] 4.5 Keep existing health router unchanged at `/api/health`
- [ ] 4.6 Test application startup with sample UPSTREAMS env var
- [ ] 4.7 Test that both `/api/health` and `/proxy/v1/messages` routes work
- [ ] 4.8 Test dynamic prefix: set PROXY_PREFIX=/custom and verify routes at `/custom/v1/*`

## Phase 5: Testing & Documentation (P1)

- [ ] 5.1 Create `tests/conftest.py` with fixtures for upstream configs, mock HTTP responses, request factory
- [ ] 5.2 Create `tests/api/test_proxy.py` with comprehensive route tests
- [ ] 5.3 Create `tests/services/test_proxy_client.py` with comprehensive service tests
- [ ] 5.4 Create `.env.example` with sample UPSTREAMS configuration for OpenAI and Anthropic
- [ ] 5.5 Add integration test: full request/response cycle with token usage extraction
- [ ] 5.6 Add integration test: SSE streaming with multiple chunks (simulating TCP boundaries)
- [ ] 5.7 Add edge case tests: malformed JSON, empty SSE stream, missing usage field
- [ ] 5.8 Run full test suite: `uv run pytest --cov=app tests/`
- [ ] 5.9 Run type check: `uv run pyright`
- [ ] 5.10 Run linter: `uv run ruff check`
- [ ] 5.11 Document configuration format in README.md (examples for docker, kubernetes, .env)

## Phase 6: Validation & Sign-Off (P1)

- [ ] 6.1 Manual smoke test: start app with dev UPSTREAMS, curl `/proxy/v1/upstreams`
- [ ] 6.2 Manual smoke test: verify log output includes request/response with loguru formatting
- [ ] 6.3 Manual test: verify API key is not logged in plaintext
- [ ] 6.4 Manual test: change PROXY_PREFIX env var, restart app, verify new prefix works
- [ ] 6.5 Verify test coverage is >= 80% for proxy module
- [ ] 6.6 Review and address any mypy/pyright warnings (strict mode)
- [ ] 6.7 Final integration test in dev environment with real upstream
- [ ] 6.8 Update CHANGELOG.md with proxy feature summary
- [ ] 6.9 Create PR and mark ready for review

---

## Notes on Dependencies

- **Phase 1 and 4 can be done in parallel** (dependencies can be added before service is written)
- **Phase 2 is independent** and can start as soon as models are defined (Phase 1.3-1.4)
- **Phase 3 depends on Phase 2** (routes need proxy_client service)
- **Phase 4 needs both Phase 2 and 3** (integration in main.py)
- **Phase 5 and 6 depend on Phases 2-4** (testing needs working implementation)

## Acceptance Criteria

- ✅ All tests pass with `uv run pytest`
- ✅ Type checking passes with `uv run pyright --outputjson`
- ✅ Linting passes with `uv run ruff check`
- ✅ At least one working test for each scenario in spec.md
- ✅ Loguru successfully intercepts uvicorn and fastapi logs
- ✅ Token usage is correctly extracted and logged for both OpenAI and Anthropic
- ✅ SSE streaming works with multi-chunk boundaries
- ✅ API keys are never logged in plaintext
- ✅ Default upstream selection works when header absent
- ✅ Dynamic proxy_prefix configuration is respected

