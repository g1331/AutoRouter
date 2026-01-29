## ADDED Requirements

### Requirement: Automatic failover to same provider type

When an upstream fails, the system SHALL automatically failover to another upstream with the same provider_type.

#### Scenario: Failover on connection error

- **GIVEN** a request routed to an OpenAI upstream
- **WHEN** the upstream returns a connection error (timeout, refused, reset)
- **THEN** the circuit breaker SHALL mark the upstream as failed
- **AND** the system SHALL select another OpenAI upstream
- **AND** the request SHALL be retried

#### Scenario: Failover on HTTP 5xx error

- **GIVEN** a request routed to an Anthropic upstream
- **WHEN** the upstream returns HTTP 502/503/504
- **THEN** the circuit breaker SHALL record the failure
- **AND** the system SHALL failover to another Anthropic upstream if available

#### Scenario: Failover on HTTP 429 rate limit

- **GIVEN** a request routed to a Google upstream
- **WHEN** the upstream returns HTTP 429
- **THEN** the system SHALL treat this as a failover candidate
- **AND** retry with another Google upstream

#### Scenario: No failover when all upstreams unhealthy

- **GIVEN** all upstreams of a provider_type are in OPEN state
- **WHEN** a request arrives for that provider_type
- **THEN** the system SHALL return error "No healthy upstreams available"
- **AND** the error SHALL include which provider_type was requested

### Requirement: Maximum failover attempts

The system SHALL limit failover attempts to prevent infinite loops.

#### Scenario: Exhaust all available upstreams

- **GIVEN** a provider_type with 3 upstreams
- **WHEN** all 3 upstreams fail for a request
- **THEN** the system SHALL stop retrying after 3 attempts
- **AND** return the last error to the client

#### Scenario: Respect circuit breaker state during failover

- **GIVEN** a provider_type with 3 upstreams where 1 is OPEN
- **WHEN** failover occurs
- **THEN** the OPEN upstream SHALL be excluded from selection
- **AND** only 2 upstreams SHALL be attempted

### Requirement: Failover history tracking

The system SHALL track failover attempts for observability.

#### Scenario: Record failover attempts

- **GIVEN** a request that fails over 2 times before success
- **WHEN** the request completes
- **THEN** the request log SHALL include failover history
- **AND** history SHALL contain: upstream_id, upstream_name, error_type, timestamp

#### Scenario: No failover for successful first attempt

- **GIVEN** a request that succeeds on first upstream
- **WHEN** the request completes
- **THEN** the request log SHALL show `failoverAttempts: 0`
- **AND** `failoverHistory` SHALL be null

#### Scenario: Visualize failover timeline in admin UI

- **GIVEN** a request with failover history
- **WHEN** an admin expands the log row
- **THEN** the UI SHALL display a visual timeline showing:
  - Each attempted upstream in sequence
  - Error type and status code for failed attempts
  - Time spent on each attempt
  - Final successful upstream
- **AND** the timeline SHALL be collapsible/expandable

### Requirement: Failover decision path integration

The failover mechanism SHALL integrate with the routing decision path for complete observability.

#### Scenario: Include failover in routing decision path

- **GIVEN** a request that fails over before success
- **WHEN** the routing decision path is recorded
- **THEN** `failover_sequence` SHALL be included in the decision path
- **AND** each failover step SHALL contain: attempt number, upstream details, error classification, timestamp

#### Scenario: Correlate circuit breaker events with failover

- **GIVEN** a failover occurs due to circuit breaker opening
- **WHEN** the decision path is recorded
- **THEN** the exclusion reason SHALL indicate "circuit_open"
- **AND** the circuit breaker state transition SHALL be logged separately with correlation ID

### Requirement: Sticky session preference (optional)

The system MAY support sticky sessions to prefer the same upstream for consecutive requests.

#### Scenario: Prefer same upstream when healthy

- **GIVEN** sticky sessions enabled for an API key
- **AND** the previously used upstream is CLOSED
- **WHEN** a new request arrives
- **THEN** the system SHALL prefer the same upstream
- **AND** only failover if that upstream fails
