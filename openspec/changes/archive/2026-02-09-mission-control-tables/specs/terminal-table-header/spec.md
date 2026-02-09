## ADDED Requirements

### Requirement: Terminal-style header with system identifier

The system SHALL display a terminal-style header with a system identifier prefix (e.g., "SYS.UPSTREAM_ARRAY", "SYS.REQUEST_STREAM") using uppercase monospace font.

#### Scenario: Display system identifier

- **WHEN** the terminal header component is rendered with a systemId prop
- **THEN** the header displays the systemId in uppercase with "SYS." prefix
- **AND** the text uses monospace font with letter-spacing

### Requirement: Scanline visual effect on header

The system SHALL apply a scanline visual effect to the terminal header background using the existing `cf-scanlines` CSS class.

#### Scenario: Scanline effect visible

- **WHEN** the terminal header is rendered
- **THEN** horizontal scanline pattern is visible across the header background
- **AND** the effect does not interfere with text readability

### Requirement: Status indicators in header

The system SHALL support displaying status indicators (node count, live status, time range) in the header's right section.

#### Scenario: Display node count indicator

- **WHEN** the header receives a nodeCount prop
- **THEN** the header displays "[N NODES]" badge on the right side

#### Scenario: Display live indicator

- **WHEN** the header receives isLive=true prop
- **THEN** the header displays "[● LIVE]" badge with pulsing red LED animation

#### Scenario: Display time range indicator

- **WHEN** the header receives a timeRange prop (e.g., "30D")
- **THEN** the header displays "[30D]" badge on the right side

### Requirement: Reduced motion support

The system SHALL respect user's reduced motion preference for all header animations.

#### Scenario: Reduced motion preference enabled

- **WHEN** user has prefers-reduced-motion: reduce enabled
- **THEN** all pulsing and scanning animations are disabled
- **AND** static visual indicators remain visible
