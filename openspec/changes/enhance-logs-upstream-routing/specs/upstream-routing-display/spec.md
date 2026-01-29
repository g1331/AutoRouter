## ADDED Requirements

### Requirement: Display upstream name in logs table

The system SHALL display the upstream name instead of (or alongside) the upstream ID in the request logs table.

#### Scenario: Log entry has a valid upstream

- **WHEN** a log entry has an `upstream_id` that matches an existing upstream
- **THEN** the logs table SHALL display the upstream's current name

#### Scenario: Log entry references a deleted upstream

- **WHEN** a log entry has an `upstream_id` that no longer exists in the upstreams table
- **THEN** the logs table SHALL display "Unknown" as the upstream name

#### Scenario: Log entry has no upstream

- **WHEN** a log entry has `upstream_id` set to null
- **THEN** the logs table SHALL display "-" in the upstream column

### Requirement: Display routing type badge

The system SHALL display the routing type as a visual badge/label alongside the upstream name.

#### Scenario: Direct routing indicator

- **WHEN** a log entry has `routing_type` set to `direct`
- **THEN** the logs table SHALL display a badge indicating direct routing

#### Scenario: Group routing indicator

- **WHEN** a log entry has `routing_type` set to `group`
- **THEN** the logs table SHALL display a badge indicating group routing
- **AND** the group name SHALL be visible (in the badge or tooltip)

#### Scenario: Default routing indicator

- **WHEN** a log entry has `routing_type` set to `default`
- **THEN** the logs table SHALL display a badge indicating default routing

#### Scenario: Legacy log entries without routing type

- **WHEN** a log entry has `routing_type` set to null (pre-migration data)
- **THEN** no routing type badge SHALL be displayed

### Requirement: Expandable failover details

The system SHALL provide expandable failover details for log entries that experienced failover.

#### Scenario: Log entry with failover history

- **WHEN** a log entry has `failover_attempts` greater than 0
- **THEN** the logs table row SHALL display an expand indicator
- **AND** expanding the row SHALL show a list of failover attempts with upstream name, error type, error message, and timestamp

#### Scenario: Log entry without failover

- **WHEN** a log entry has `failover_attempts` equal to 0 or null
- **THEN** no expand indicator SHALL be shown

### Requirement: Internationalization of routing display elements

All user-facing text for routing display MUST be internationalized using next-intl.

#### Scenario: Routing labels are translated

- **WHEN** the user views the logs table in any supported locale (en, zh-CN)
- **THEN** routing type labels, failover detail labels, and column headers SHALL be displayed in the selected locale
