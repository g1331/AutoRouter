## ADDED Requirements

### Requirement: Circuit breaker maintains three states

The circuit breaker SHALL maintain one of three states for each upstream: CLOSED (normal operation), OPEN (failing fast), or HALF_OPEN (probing for recovery).

#### Scenario: State transitions from closed to open

- **WHEN** an upstream accumulates `failureThreshold` consecutive failures
- **THEN** the circuit breaker SHALL transition to OPEN state
- **AND** the `opened_at` timestamp SHALL be recorded

#### Scenario: State transitions from open to half-open

- **GIVEN** an upstream in OPEN state
- **WHEN** the `openDuration` has elapsed since `opened_at`
- **THEN** the circuit breaker SHALL transition to HALF_OPEN state
- **AND** the `success_count` SHALL be reset to 0

#### Scenario: State transitions from half-open to closed

- **GIVEN** an upstream in HALF_OPEN state
- **WHEN** the upstream accumulates `successThreshold` consecutive successes
- **THEN** the circuit breaker SHALL transition to CLOSED state
- **AND** the `failure_count` SHALL be reset to 0

#### Scenario: State transitions from half-open back to open

- **GIVEN** an upstream in HALF_OPEN state
- **WHEN** any failure occurs during probing
- **THEN** the circuit breaker SHALL transition back to OPEN state
- **AND** the `opened_at` timestamp SHALL be updated to current time

### Requirement: Configurable circuit breaker thresholds

The circuit breaker SHALL support configurable thresholds at upstream level with sensible defaults.

#### Scenario: Default configuration applied

- **GIVEN** a new upstream without custom configuration
- **WHEN** the circuit breaker is initialized
- **THEN** the following defaults SHALL apply:
  - `failureThreshold`: 5
  - `successThreshold`: 2
  - `openDuration`: 30 seconds
  - `probeInterval`: 10 seconds

#### Scenario: Custom configuration per upstream

- **GIVEN** an upstream with custom config: `{"failureThreshold": 3, "openDuration": 60}`
- **WHEN** the circuit breaker evaluates state transitions
- **THEN** the custom values SHALL override defaults
- **AND** unspecified values SHALL use defaults

### Requirement: Circuit breaker prevents requests to open upstreams

The circuit breaker SHALL reject requests to upstreams in OPEN state.

#### Scenario: Request blocked when circuit open

- **GIVEN** an upstream in OPEN state
- **WHEN** a request attempts to use this upstream
- **THEN** the request SHALL be rejected with `CircuitBreakerOpenError`
- **AND** the error SHALL include remaining time until HALF_OPEN

#### Scenario: Request allowed when circuit closed

- **GIVEN** an upstream in CLOSED state
- **WHEN** a request attempts to use this upstream
- **THEN** the request SHALL be allowed to proceed

#### Scenario: Limited requests allowed in half-open state

- **GIVEN** an upstream in HALF_OPEN state
- **WHEN** a request arrives and `probeInterval` has elapsed since last probe
- **THEN** the request SHALL be allowed as a probe
- **AND** subsequent requests SHALL be rejected until next probe interval

### Requirement: Circuit breaker state persistence

The circuit breaker SHALL persist state to database for multi-instance consistency.

#### Scenario: State saved on transition

- **WHEN** a circuit breaker state transition occurs
- **THEN** the new state SHALL be persisted to `circuit_breaker_states` table
- **AND** the `updated_at` timestamp SHALL be updated

#### Scenario: State loaded on startup

- **GIVEN** an existing upstream with circuit breaker record
- **WHEN** the system initializes or queries the upstream
- **THEN** the persisted state SHALL be loaded from database

### Requirement: Manual circuit breaker control

The system SHALL provide administrative control over circuit breaker states.

#### Scenario: Admin forces circuit open

- **WHEN** an administrator calls `forceOpen(upstreamId)`
- **THEN** the circuit SHALL transition to OPEN state
- **AND** the `opened_at` SHALL be set to current time

#### Scenario: Admin forces circuit closed

- **WHEN** an administrator calls `forceClose(upstreamId)`
- **THEN** the circuit SHALL transition to CLOSED state
- **AND** the `failure_count` and `success_count` SHALL be reset to 0

#### Scenario: Admin queries circuit state

- **WHEN** an administrator queries circuit breaker status
- **THEN** the system SHALL return current state, counts, and timestamps for all upstreams
