## ADDED Requirements

### Requirement: Passive health monitoring via request results

The system SHALL passively monitor upstream health based on request outcomes.

#### Scenario: Record success on 2xx response

- **GIVEN** a request to an upstream
- **WHEN** the upstream returns HTTP 200-299
- **THEN** the circuit breaker SHALL record a success
- **AND** increment `success_count` if in HALF_OPEN state

#### Scenario: Record failure on 5xx response

- **GIVEN** a request to an upstream
- **WHEN** the upstream returns HTTP 500-599
- **THEN** the circuit breaker SHALL record a failure
- **AND** increment `failure_count`

#### Scenario: Record failure on network error

- **GIVEN** a request to an upstream
- **WHEN** a network error occurs (timeout, connection refused, etc.)
- **THEN** the circuit breaker SHALL record a failure
- **AND** the error type SHALL be categorized

#### Scenario: Do not record failure on 4xx client errors

- **GIVEN** a request to an upstream
- **WHEN** the upstream returns HTTP 400-499 (except 429)
- **THEN** the circuit breaker SHALL NOT record as failure
- **AND** the request SHALL NOT trigger failover

### Requirement: Active health monitoring via probes

The system SHALL support active health checks when upstream is in HALF_OPEN state.

#### Scenario: Probe when entering half-open

- **GIVEN** an upstream transitioning to HALF_OPEN
- **WHEN** the `probeInterval` elapses
- **THEN** the system SHALL send a probe request
- **AND** the probe SHALL use a lightweight endpoint (e.g., models list)

#### Scenario: Probe success transitions to closed

- **GIVEN** an upstream in HALF_OPEN state
- **WHEN** a probe request succeeds
- **THEN** `success_count` SHALL be incremented
- **AND** if `success_count` reaches `successThreshold`, transition to CLOSED

#### Scenario: Probe failure transitions back to open

- **GIVEN** an upstream in HALF_OPEN state
- **WHEN** a probe request fails
- **THEN** the circuit SHALL transition back to OPEN
- **AND** `opened_at` SHALL be reset to current time

### Requirement: Health status API

The system SHALL provide API endpoints to query health status.

#### Scenario: Query all upstreams health

- **WHEN** an admin requests `/api/admin/health`
- **THEN** the system SHALL return health status for all upstreams
- **AND** include: upstream_id, state, failure_count, last_failure_at, latency

#### Scenario: Query single upstream health

- **WHEN** an admin requests `/api/admin/health/{upstreamId}`
- **THEN** the system SHALL return detailed health for that upstream
- **AND** include circuit breaker config and recent history

### Requirement: Health metrics aggregation

The system SHALL aggregate health metrics for monitoring.

#### Scenario: Calculate upstream availability

- **GIVEN** a time range (e.g., last 24 hours)
- **WHEN** health metrics are queried
- **THEN** the system SHALL calculate availability percentage
- **AND** formula: `successful_requests / total_requests * 100`

#### Scenario: Track latency trends

- **GIVEN** request logs with duration
- **WHEN** health metrics are aggregated
- **THEN** the system SHALL calculate p50/p95/p99 latency per upstream
