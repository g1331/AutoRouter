## ADDED Requirements

### Requirement: All log rows are expandable

The system SHALL allow users to expand any log row to view detailed information, regardless of whether the log has routing decision or failover history.

#### Scenario: Expand log row without routing decision

- **WHEN** user clicks the expand button on a log row that has no routing decision
- **THEN** the row expands to show Token details section

#### Scenario: Expand log row with routing decision

- **WHEN** user clicks the expand button on a log row that has routing decision
- **THEN** the row expands to show both Token details and Routing decision sections

### Requirement: Token details displayed in expanded view

The system SHALL display Token details in the expanded row area instead of a hover tooltip.

#### Scenario: View token breakdown in expanded row

- **WHEN** user expands a log row
- **THEN** the expanded area shows Token details including:
  - Input tokens count
  - Output tokens count (with reasoning/reply breakdown if applicable)
  - Cache write tokens (if any)
  - Cache read tokens (if any)
  - Total tokens count

#### Scenario: Token column remains in table

- **WHEN** user views the logs table
- **THEN** the Token column displays compact summary (total, input/output, cache badge) without hover tooltip

### Requirement: Routing decision displayed without tooltip

The system SHALL display routing decision information in the table cell without hover tooltip, with full details only in the expanded view.

#### Scenario: View routing info in table cell

- **WHEN** user views the logs table
- **THEN** the Upstream column displays compact routing info (name, type badge, indicators) without hover tooltip

#### Scenario: View routing details in expanded row

- **WHEN** user expands a log row that has routing decision
- **THEN** the expanded area shows full routing decision details including model resolution, candidates, and excluded upstreams

### Requirement: Expanded view layout

The system SHALL display Token details and Routing decision side by side in the expanded view, with Failover history below.

#### Scenario: Two-column layout for details

- **WHEN** user expands a log row
- **THEN** Token details appear on the left and Routing decision appears on the right

#### Scenario: Failover history placement

- **WHEN** user expands a log row that has failover history
- **THEN** Failover history appears below the Token/Routing row, spanning full width
