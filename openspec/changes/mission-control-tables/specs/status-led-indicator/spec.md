## ADDED Requirements

### Requirement: LED indicator with multiple states

The system SHALL display an LED-style status indicator supporting healthy, degraded, and offline states with corresponding visual styles.

#### Scenario: Display healthy state

- **WHEN** the LED indicator receives status="healthy"
- **THEN** the indicator displays "◉" character in green color (status-success)
- **AND** the indicator has a subtle green glow effect

#### Scenario: Display degraded state

- **WHEN** the LED indicator receives status="degraded"
- **THEN** the indicator displays "◎" character in amber color (amber-500)
- **AND** the indicator has a faster pulsing animation

#### Scenario: Display offline state

- **WHEN** the LED indicator receives status="offline"
- **THEN** the indicator displays "●" character in red color (status-error)
- **AND** the indicator has a persistent red glow effect

### Requirement: Pulsing animation for active states

The system SHALL apply a pulsing glow animation to LED indicators in healthy and degraded states.

#### Scenario: Healthy state pulse animation

- **WHEN** the LED indicator is in healthy state
- **THEN** the indicator pulses with a 2-second cycle using cf-pulse-glow animation

#### Scenario: Degraded state fast pulse

- **WHEN** the LED indicator is in degraded state
- **THEN** the indicator pulses with a 1-second cycle (faster than healthy)

#### Scenario: Offline state static glow

- **WHEN** the LED indicator is in offline state
- **THEN** the indicator maintains a static red glow without pulsing

### Requirement: Accessible status label

The system SHALL provide an accessible text label alongside the visual LED indicator.

#### Scenario: Screen reader accessible

- **WHEN** the LED indicator is rendered
- **THEN** an aria-label or visually-hidden text describes the status (e.g., "Status: healthy")

### Requirement: Reduced motion support

The system SHALL disable pulsing animations when user prefers reduced motion.

#### Scenario: Reduced motion preference

- **WHEN** user has prefers-reduced-motion: reduce enabled
- **THEN** all pulsing animations are disabled
- **AND** the LED indicator displays static color without animation
