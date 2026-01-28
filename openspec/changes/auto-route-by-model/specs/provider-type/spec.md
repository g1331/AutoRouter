## ADDED Requirements

### Requirement: Store provider type in upstream config

The system SHALL store a `provider_type` field for each upstream configuration.

#### Scenario: Create upstream with provider type

- **WHEN** creating an upstream with provider_type "anthropic"
- **THEN** the upstream is stored with provider_type set to "anthropic"

#### Scenario: Provider type validation

- **WHEN** creating an upstream with an invalid provider_type
- **THEN** the system returns a 400 error with valid options

### Requirement: Supported provider types

The system SHALL support the following provider types: "anthropic", "openai", "google", "custom".

#### Scenario: Valid provider types accepted

- **WHEN** creating upstreams with provider types "anthropic", "openai", "google", or "custom"
- **THEN** all are accepted and stored correctly

### Requirement: Provider type in API response

The system SHALL include `provider_type` in upstream API responses.

#### Scenario: List upstreams includes provider type

- **WHEN** retrieving the upstream list via Admin API
- **THEN** each upstream includes its `provider_type` field
