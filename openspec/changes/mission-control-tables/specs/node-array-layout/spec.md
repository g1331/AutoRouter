## ADDED Requirements

### Requirement: Group-based upstream organization

The system SHALL organize upstreams by group, displaying each group as a collapsible section with a summary header.

#### Scenario: Display grouped upstreams

- **WHEN** the upstream list contains upstreams with different group_name values
- **THEN** upstreams are grouped by group_name
- **AND** each group is displayed as a separate collapsible section

#### Scenario: Display ungrouped upstreams

- **WHEN** some upstreams have no group_name (null)
- **THEN** these upstreams are displayed in an "UNGROUPED" section at the bottom

### Requirement: Group header with status summary

The system SHALL display a group header showing aggregated health status and circuit breaker state.

#### Scenario: Display group health summary

- **WHEN** a group contains 3 upstreams with 2 healthy and 1 degraded
- **THEN** the group header displays "◎ 2/3 HEALTHY" with degraded LED indicator

#### Scenario: Display group circuit breaker summary

- **WHEN** a group has mixed circuit breaker states
- **THEN** the group header displays an ASCII progress bar showing percentage of closed circuits

#### Scenario: All healthy group

- **WHEN** all upstreams in a group are healthy with closed circuits
- **THEN** the group header displays "◉ N/N HEALTHY" with healthy LED indicator

### Requirement: Collapsible group sections

The system SHALL allow users to expand and collapse group sections.

#### Scenario: Collapse group

- **WHEN** user clicks the collapse button on an expanded group
- **THEN** the group's upstream rows are hidden
- **AND** only the group header remains visible

#### Scenario: Expand group

- **WHEN** user clicks the expand button on a collapsed group
- **THEN** the group's upstream rows become visible

#### Scenario: Default expanded state

- **WHEN** the page loads
- **THEN** all groups are expanded by default

### Requirement: Terminal-style group header

The system SHALL display group headers using terminal styling with the format "GROUP: <name>".

#### Scenario: Group header format

- **WHEN** a group named "openai" is rendered
- **THEN** the header displays "GROUP: openai" in uppercase monospace font
- **AND** the header has a distinct background (surface-300)

### Requirement: LED status indicators for upstreams

The system SHALL display LED status indicators for each upstream's health and circuit breaker state.

#### Scenario: Healthy upstream with closed circuit

- **WHEN** an upstream has health_status.is_healthy=true and circuit_state="closed"
- **THEN** the upstream row displays "◉" green LED indicator

#### Scenario: Unhealthy upstream with open circuit

- **WHEN** an upstream has health_status.is_healthy=false and circuit_state="open"
- **THEN** the upstream row displays "●" red LED indicator with glow effect

#### Scenario: Degraded upstream with half-open circuit

- **WHEN** an upstream has circuit_state="half_open"
- **THEN** the upstream row displays "◎" amber LED indicator with fast pulse

### Requirement: ASCII progress bar for weight display

The system SHALL display upstream weight using ASCII progress bar instead of plain number.

#### Scenario: Display weight as progress bar

- **WHEN** an upstream has weight=3 and max weight in group is 10
- **THEN** the weight column displays "███░░░░░░░ 3"

### Requirement: Flicker-in animation for new data

The system SHALL apply flicker-in animation when upstream data is refreshed.

#### Scenario: Data refresh animation

- **WHEN** upstream data is refreshed/reloaded
- **THEN** rows animate in using cf-flicker-in effect
- **AND** animation is staggered for visual appeal

### Requirement: Error state glow effect

The system SHALL apply red glow effect to upstream rows in error state.

#### Scenario: Unhealthy upstream glow

- **WHEN** an upstream has health_status.is_healthy=false
- **THEN** the row has a subtle red border glow (cf-glow-error)
