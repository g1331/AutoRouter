## ADDED Requirements

### Requirement: ASCII-style progress bar display

The system SHALL display a progress bar using ASCII block characters (█ and ░) to represent filled and empty portions.

#### Scenario: Display progress percentage

- **WHEN** the progress bar receives value=75 and max=100
- **THEN** the bar displays approximately 75% filled blocks (████████░░)
- **AND** the bar uses monospace font for consistent character width

#### Scenario: Display zero progress

- **WHEN** the progress bar receives value=0
- **THEN** the bar displays all empty blocks (░░░░░░░░░░)

#### Scenario: Display full progress

- **WHEN** the progress bar receives value equal to max
- **THEN** the bar displays all filled blocks (██████████)

### Requirement: Configurable bar width

The system SHALL support configurable bar width through a width prop specifying the number of characters.

#### Scenario: Custom width bar

- **WHEN** the progress bar receives width=5
- **THEN** the bar displays exactly 5 characters total

#### Scenario: Default width bar

- **WHEN** the progress bar does not receive a width prop
- **THEN** the bar displays 10 characters by default

### Requirement: Value label display

The system SHALL optionally display the numeric value alongside the progress bar.

#### Scenario: Show value label

- **WHEN** the progress bar receives showValue=true
- **THEN** the bar displays the value after the bar (e.g., "███░░░░░░░ 3")

#### Scenario: Show percentage label

- **WHEN** the progress bar receives showPercentage=true
- **THEN** the bar displays the percentage after the bar (e.g., "███████░░░ 75%")

### Requirement: Color variants

The system SHALL support color variants for different semantic meanings.

#### Scenario: Success variant

- **WHEN** the progress bar receives variant="success"
- **THEN** filled blocks use green color (status-success)

#### Scenario: Warning variant

- **WHEN** the progress bar receives variant="warning"
- **THEN** filled blocks use amber color (amber-500)

#### Scenario: Error variant

- **WHEN** the progress bar receives variant="error"
- **THEN** filled blocks use red color (status-error)

#### Scenario: Default variant

- **WHEN** the progress bar does not receive a variant prop
- **THEN** filled blocks use amber color (amber-500)
