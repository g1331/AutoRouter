## ADDED Requirements

### Requirement: Parse model from request body

The system SHALL extract the `model` field from the request body for all proxy requests.

#### Scenario: Valid model field in request

- **WHEN** a request is made to `/api/proxy/v1/*` with body containing `"model": "gpt-4"`
- **THEN** the system extracts "gpt-4" as the target model

#### Scenario: Missing model field

- **WHEN** a request is made without a `model` field
- **THEN** the system returns a 400 error with message "Missing required field: model"

### Requirement: Route based on model prefix

The system SHALL route requests to the appropriate upstream group based on the model name prefix.

#### Scenario: Claude model routes to anthropic group

- **WHEN** the model starts with "claude-"
- **THEN** the system routes to the "anthropic" upstream group

#### Scenario: GPT model routes to openai group

- **WHEN** the model starts with "gpt-"
- **THEN** the system routes to the "openai" upstream group

#### Scenario: Gemini model routes to google group

- **WHEN** the model starts with "gemini-"
- **THEN** the system routes to the "google" upstream group

### Requirement: Remove header-based routing

The system SHALL NOT use `X-Upstream-Name` or `X-Upstream-Group` headers for routing decisions.

#### Scenario: Header is ignored

- **WHEN** a request includes `X-Upstream-Name` or `X-Upstream-Group` headers
- **THEN** the system ignores these headers and routes based on model only

### Requirement: Group existence validation

The system SHALL validate that the target upstream group exists before routing.

#### Scenario: Group does not exist

- **WHEN** the model maps to a group that is not configured
- **THEN** the system returns a 400 error with message "No upstream group configured for model: {model}"
