## ADDED Requirements

### Requirement: Live recording indicator

The system SHALL display a live recording indicator "[● REC]" with pulsing red LED when viewing real-time logs.

#### Scenario: Display live indicator

- **WHEN** the logs page is in live/real-time mode
- **THEN** the header displays "[● REC]" badge with red pulsing animation

#### Scenario: Hide live indicator when not live

- **WHEN** the logs page is viewing historical data only
- **THEN** the "[● REC]" indicator is not displayed

### Requirement: Request rate display

The system SHALL display the current request rate in the header.

#### Scenario: Display request rate

- **WHEN** logs are being received
- **THEN** the header displays "[↓ X.X/s]" showing requests per second

### Requirement: Data scan animation for new entries

The system SHALL apply a horizontal scan line animation when new log entries appear.

#### Scenario: New log entry animation

- **WHEN** a new log entry is added to the table
- **THEN** the row displays a horizontal scan line effect (cf-data-scan) from left to right
- **AND** the animation completes within 0.5 seconds

### Requirement: LED status indicators for response codes

The system SHALL display LED-style indicators for HTTP response status codes.

#### Scenario: Success response indicator

- **WHEN** a log entry has status_code in 2xx range
- **THEN** the status displays "◉ 2xx" with green LED

#### Scenario: Client error indicator

- **WHEN** a log entry has status_code in 4xx range
- **THEN** the status displays "◎ 4xx" with amber LED

#### Scenario: Server error indicator

- **WHEN** a log entry has status_code in 5xx range
- **THEN** the status displays "● 5xx" with red LED and glow effect

### Requirement: Error row glow effect

The system SHALL apply persistent red glow effect to rows with error status codes.

#### Scenario: Error row highlighting

- **WHEN** a log entry has status_code >= 400
- **THEN** the row has a subtle red border glow (cf-glow-error)
- **AND** the glow persists (not animated)

### Requirement: Terminal-style error details

The system SHALL display error details using terminal-style indentation when expanded.

#### Scenario: Expanded error details format

- **WHEN** user expands a log row with error
- **THEN** error details display with tree-style indentation (├─ └─)
- **AND** error type and message are shown on separate indented lines

#### Scenario: Failover details format

- **WHEN** a log entry has failover_history
- **THEN** failover attempts display with "├─ FAILOVER: source → target [STATUS]" format

### Requirement: Cursor blink indicator

The system SHALL display a blinking cursor at the bottom of the log list to indicate live monitoring.

#### Scenario: Live cursor display

- **WHEN** the logs page is in live mode
- **THEN** a blinking underscore cursor "\_" is displayed below the last log entry
- **AND** the cursor blinks using cf-cursor-blink animation

#### Scenario: Hide cursor when not live

- **WHEN** the logs page is not in live mode
- **THEN** the blinking cursor is not displayed

### Requirement: Stream statistics footer

The system SHALL display aggregate statistics at the bottom of the log stream.

#### Scenario: Display stream stats

- **WHEN** logs are displayed
- **THEN** a footer shows: total requests, success rate, average duration, total tokens

#### Scenario: Stats format

- **WHEN** stream stats are rendered
- **THEN** stats display in format: "STREAM STATS: X requests │ Y% success │ avg Zs │ Nk tokens"

### Requirement: Reduced motion support

The system SHALL respect user's reduced motion preference for all animations.

#### Scenario: Reduced motion enabled

- **WHEN** user has prefers-reduced-motion: reduce enabled
- **THEN** scan animations, cursor blink, and LED pulses are disabled
- **AND** static visual indicators remain visible
