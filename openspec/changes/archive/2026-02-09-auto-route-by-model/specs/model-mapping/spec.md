## ADDED Requirements

### Requirement: Store allowed models per upstream

The system SHALL allow configuring a list of `allowed_models` for each upstream.

#### Scenario: Set allowed models

- **WHEN** configuring an upstream with allowed_models ["gpt-4", "gpt-4-turbo"]
- **THEN** the upstream only accepts requests for these models

#### Scenario: Null allowed models accepts all

- **WHEN** an upstream has allowed_models set to null
- **THEN** the upstream accepts requests for any model

### Requirement: Filter upstreams by model support

The system SHALL filter upstreams within a group based on model support.

#### Scenario: Only matching upstreams selected

- **GIVEN** a group with upstreams A (allowed_models: ["gpt-4"]) and B (allowed_models: ["claude-3"])
- **WHEN** routing a request for model "gpt-4"
- **THEN** only upstream A is considered for selection

### Requirement: Model redirects

The system SHALL support `model_redirects` to map incoming model names to different names.

#### Scenario: Redirect model name

- **GIVEN** an upstream with model_redirects {"gpt-4-turbo": "claude-3-opus-20240229"}
- **WHEN** a request arrives with model "gpt-4-turbo"
- **THEN** the upstream receives the request with model changed to "claude-3-opus-20240229"

#### Scenario: No redirect passes through

- **GIVEN** an upstream with no model_redirects entry for "gpt-4"
- **WHEN** a request arrives with model "gpt-4"
- **THEN** the upstream receives the request with model unchanged as "gpt-4"

### Requirement: Redirect chain validation

The system SHALL prevent redirect loops.

#### Scenario: Circular redirect detected

- **GIVEN** model_redirects {"a": "b", "b": "a"}
- **WHEN** processing a redirect
- **THEN** the system returns a 500 error with message "Circular model redirect detected"
