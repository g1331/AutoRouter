## ADDED Requirements

### Requirement: Unicode block sparkline display

The system SHALL display a mini sparkline using Unicode block characters (▁▂▃▄▅▆▇█) to represent data trends.

#### Scenario: Display data trend

- **WHEN** the sparkline receives data=[10, 20, 30, 20, 10, 20, 30, 40, 30, 20]
- **THEN** the sparkline displays corresponding block heights (▁▂▃▂▁▂▃▄▃▂)
- **AND** values are normalized to the 8-level block character scale

#### Scenario: Display single value

- **WHEN** the sparkline receives data with only one value
- **THEN** the sparkline displays a single block character at appropriate height

#### Scenario: Display empty data

- **WHEN** the sparkline receives empty data array
- **THEN** the sparkline displays placeholder text "---"

### Requirement: Current value display

The system SHALL optionally display the current (latest) value alongside the sparkline.

#### Scenario: Show current value

- **WHEN** the sparkline receives showValue=true
- **THEN** the latest value is displayed after the sparkline (e.g., "▁▂▃▄▃▂ 245ms")

#### Scenario: Custom value formatter

- **WHEN** the sparkline receives a formatValue function
- **THEN** the displayed value uses the custom formatter

### Requirement: Configurable sparkline width

The system SHALL support configurable width through a width prop.

#### Scenario: Custom width sparkline

- **WHEN** the sparkline receives width=5
- **THEN** only the last 5 data points are displayed

#### Scenario: Default width sparkline

- **WHEN** the sparkline does not receive a width prop
- **THEN** the last 10 data points are displayed by default

### Requirement: Color based on trend

The system SHALL optionally color the sparkline based on trend direction.

#### Scenario: Upward trend color

- **WHEN** the sparkline receives colorByTrend=true and trend is upward
- **THEN** the sparkline uses amber color (neutral trend indicator)

#### Scenario: Downward trend for latency

- **WHEN** the sparkline receives colorByTrend=true, invertTrend=true, and trend is downward
- **THEN** the sparkline uses green color (good for latency going down)

### Requirement: Monospace font rendering

The system SHALL render sparkline characters using monospace font for consistent spacing.

#### Scenario: Consistent character width

- **WHEN** the sparkline is rendered
- **THEN** all block characters have equal width
- **AND** the sparkline maintains consistent visual alignment
