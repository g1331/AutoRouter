## ADDED Requirements

### Requirement: All non-2xx responses trigger failover

The system SHALL attempt failover to another upstream when any upstream returns a non-2xx HTTP status code.

#### Scenario: 4xx error triggers failover

- **WHEN** upstream returns HTTP 401 Unauthorized
- **THEN** system SHALL record the failure and attempt the next available upstream

#### Scenario: 5xx error triggers failover

- **WHEN** upstream returns HTTP 500 Internal Server Error
- **THEN** system SHALL record the failure and attempt the next available upstream

#### Scenario: 429 rate limit triggers failover

- **WHEN** upstream returns HTTP 429 Too Many Requests
- **THEN** system SHALL record the failure and attempt the next available upstream

### Requirement: Exhaust all available upstreams by default

The system SHALL attempt all available upstreams (not in OPEN circuit breaker state) before returning an error to the downstream client.

#### Scenario: Multiple upstreams fail sequentially

- **WHEN** upstream A returns 500, upstream B returns 401, upstream C returns 200
- **THEN** system SHALL return the successful response from upstream C to downstream

#### Scenario: All upstreams fail

- **WHEN** all available upstreams return non-2xx responses
- **THEN** system SHALL return a unified error response to downstream

#### Scenario: Skip already-failed upstreams

- **WHEN** upstream A has already failed in the current request
- **THEN** system SHALL NOT retry upstream A again in the same request

### Requirement: First-chunk validation for streaming responses

The system SHALL validate the first chunk of streaming responses before starting transmission to downstream.

#### Scenario: First chunk is error response

- **WHEN** upstream returns HTTP 200 but first chunk contains error JSON
- **THEN** system SHALL NOT start streaming to downstream and SHALL attempt next upstream

#### Scenario: First chunk is valid data

- **WHEN** upstream returns HTTP 200 and first chunk contains valid SSE data
- **THEN** system SHALL start streaming to downstream

#### Scenario: Stream error after transmission started

- **WHEN** stream transmission has started and upstream stream errors mid-way
- **THEN** system SHALL send SSE error event to downstream and close the stream

### Requirement: Unified error response format

The system SHALL return a unified error format when all upstreams fail, without exposing upstream information.

#### Scenario: All upstreams unavailable

- **WHEN** all failover attempts are exhausted
- **THEN** system SHALL return HTTP 503 with body `{"error": {"message": "服务暂时不可用，请稍后重试", "type": "service_unavailable", "code": "ALL_UPSTREAMS_UNAVAILABLE"}}`

#### Scenario: No upstreams configured

- **WHEN** no upstreams are available for the requested model
- **THEN** system SHALL return HTTP 503 with unified error format

### Requirement: Downstream disconnect detection

The system SHALL detect when downstream client disconnects and gracefully stop the failover process.

#### Scenario: Client disconnects during failover

- **WHEN** downstream client closes connection while failover is in progress
- **THEN** system SHALL cancel current upstream request, cleanup resources, and log the disconnection

#### Scenario: Client disconnects during streaming

- **WHEN** downstream client closes connection during stream transmission
- **THEN** system SHALL cancel upstream stream and cleanup resources

### Requirement: Failover history logging

The system SHALL log detailed failover history for each request internally.

#### Scenario: Multiple failover attempts

- **WHEN** request requires multiple failover attempts
- **THEN** system SHALL log each attempt with upstream_id, upstream_name, timestamp, error_type, error_message, and status_code

#### Scenario: Successful after failover

- **WHEN** request succeeds after one or more failover attempts
- **THEN** system SHALL include failover_attempts count and failover_history in request log

### Requirement: Configurable failover strategy

The system SHALL support configurable failover strategies.

#### Scenario: Max attempts strategy

- **WHEN** failover strategy is configured as "max_attempts" with maxAttempts=5
- **THEN** system SHALL stop after 5 failed attempts even if more upstreams are available

#### Scenario: Exclude status codes

- **WHEN** status code 400 is in excludeStatusCodes configuration
- **THEN** system SHALL NOT trigger failover for HTTP 400 responses and return them directly to downstream
