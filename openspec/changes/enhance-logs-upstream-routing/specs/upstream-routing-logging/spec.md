## ADDED Requirements

### Requirement: Record routing type in request logs

The system SHALL record the routing type used for each proxy request. The routing type MUST be one of: `direct` (X-Upstream-Name header), `group` (X-Upstream-Group header), or `default` (automatic selection).

#### Scenario: Direct routing via X-Upstream-Name

- **WHEN** a proxy request includes the `X-Upstream-Name` header
- **THEN** the request log entry SHALL have `routing_type` set to `direct`
- **AND** `group_name` and `lb_strategy` SHALL be null

#### Scenario: Group routing via X-Upstream-Group

- **WHEN** a proxy request includes the `X-Upstream-Group` header (without X-Upstream-Name)
- **THEN** the request log entry SHALL have `routing_type` set to `group`
- **AND** `group_name` SHALL contain the group name
- **AND** `lb_strategy` SHALL contain the strategy used (e.g., `round_robin`, `weighted`, `least_connections`)

#### Scenario: Default routing

- **WHEN** a proxy request includes neither `X-Upstream-Name` nor `X-Upstream-Group`
- **THEN** the request log entry SHALL have `routing_type` set to `default`

### Requirement: Record failover attempts in request logs

The system SHALL record the number of failover attempts and the detailed failover history when group-based routing encounters failures.

#### Scenario: Successful first attempt (no failover)

- **WHEN** the first upstream attempt succeeds
- **THEN** `failover_attempts` SHALL be `0`
- **AND** `failover_history` SHALL be null

#### Scenario: Failover after upstream failure

- **WHEN** an upstream returns HTTP 5xx or 429, or a connection/timeout error occurs
- **AND** the request is retried on another upstream
- **THEN** `failover_attempts` SHALL equal the number of failed attempts before success
- **AND** `failover_history` SHALL contain a JSON array of attempt records

#### Scenario: Failover history record structure

- **WHEN** a failover attempt is recorded
- **THEN** each entry in `failover_history` SHALL include:
  - `upstream_id`: the upstream that was attempted
  - `upstream_name`: the name of the upstream at the time of the attempt
  - `attempted_at`: ISO 8601 timestamp
  - `error_type`: one of `timeout`, `http_5xx`, `http_429`, `connection_error`
  - `error_message`: human-readable error description
  - `status_code`: HTTP status code (if applicable, otherwise null)

#### Scenario: All failover attempts exhausted

- **WHEN** all failover attempts fail and no upstream succeeds
- **THEN** `failover_attempts` SHALL equal the total number of attempts
- **AND** `failover_history` SHALL contain all attempt records
- **AND** the error log entry SHALL still be recorded

### Requirement: Backward-compatible schema extension

The system SHALL extend the `request_logs` table without breaking existing data or queries.

#### Scenario: New fields have safe defaults

- **WHEN** the migration adds new columns to `request_logs`
- **THEN** `routing_type` SHALL default to null (existing rows unaffected)
- **AND** `group_name` SHALL default to null
- **AND** `lb_strategy` SHALL default to null
- **AND** `failover_attempts` SHALL default to `0`
- **AND** `failover_history` SHALL default to null
