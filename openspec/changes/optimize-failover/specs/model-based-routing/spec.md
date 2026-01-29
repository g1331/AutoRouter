## MODIFIED Requirements

### Requirement: Route to healthy upstreams only

The model-based router SHALL only route to upstreams that are not in OPEN circuit breaker state.

#### Scenario: Skip open circuit upstreams

- **GIVEN** a request for model "gpt-4"
- **AND** there are 3 OpenAI upstreams where 1 is OPEN
- **WHEN** the router selects an upstream
- **THEN** the OPEN upstream SHALL be excluded from selection
- **AND** the request SHALL be routed to one of the remaining 2

#### Scenario: All upstreams open returns error

- **GIVEN** a request for model "gpt-4"
- **AND** all OpenAI upstreams are in OPEN state
- **WHEN** the router attempts to select an upstream
- **THEN** the system SHALL return error "No healthy upstreams available for model: gpt-4"
- **AND** the error SHALL include provider_type "openai"

#### Scenario: Route to single healthy upstream

- **GIVEN** a request for model "claude-3-opus"
- **AND** there are 2 Anthropic upstreams where 1 is OPEN
- **WHEN** the router selects an upstream
- **THEN** the remaining CLOSED upstream SHALL be selected

## ADDED Requirements

### Requirement: Integrate circuit breaker with model routing

The model router SHALL integrate with circuit breaker for health-aware routing.

#### Scenario: Query circuit breaker before selection

- **GIVEN** model router is selecting from multiple upstreams
- **WHEN** evaluating candidates
- **THEN** the router SHALL query circuit breaker state for each
- **AND** only consider upstreams with state != 'open'

#### Scenario: Update circuit breaker after request

- **GIVEN** a request was routed through model router
- **WHEN** the request completes (success or failure)
- **THEN** the router SHALL notify circuit breaker of the result
- **AND** the circuit breaker SHALL update its state accordingly

### Requirement: Support provider_type based routing without groups

The model router SHALL support routing directly by provider_type without requiring upstream groups.

#### Scenario: Route by provider_type field

- **GIVEN** upstreams with provider_type="openai" but no group assignment
- **WHEN** a request for "gpt-4" arrives
- **THEN** the router SHALL query all upstreams WHERE provider_type='openai'
- **AND** select from the matching upstreams

#### Scenario: Fallback to group-based routing

- **GIVEN** a provider_type with no upstreams having that provider_type
- **AND** an upstream group with matching name exists
- **WHEN** a request arrives
- **THEN** the router SHALL fallback to group-based routing
- **AND** log a deprecation warning

### Requirement: Load balance across healthy upstreams

The model router SHALL apply load balancing strategies across available healthy upstreams.

#### Scenario: Round-robin across healthy upstreams

- **GIVEN** 3 OpenAI upstreams (all CLOSED)
- **AND** round-robin strategy configured
- **WHEN** multiple requests arrive
- **THEN** requests SHALL be distributed across all 3 upstreams

#### Scenario: Skip upstream when it opens mid-routing

- **GIVEN** an upstream becomes OPEN during request processing
- **WHEN** the next request arrives
- **THEN** the OPEN upstream SHALL be excluded from round-robin
- **AND** remaining upstreams SHALL receive requests

### Requirement: Record routing decision path for observability

The model router SHALL record the complete routing decision path for each request to enable debugging and monitoring.

#### Scenario: Log decision path for successful routing

- **GIVEN** a request for model "gpt-4"
- **AND** there are 3 OpenAI upstreams with various states
- **WHEN** the router selects an upstream successfully
- **THEN** the request log SHALL include `routing_decision_path` field
- **AND** the path SHALL contain: model, provider_type, candidate_count, filter_results, selection_strategy, selected_upstream_id, duration_ms

#### Scenario: Log excluded upstreams with reasons

- **GIVEN** a request with 5 candidate upstreams
- **AND** 2 are excluded (1 OPEN circuit, 1 not supporting the model)
- **WHEN** the request is routed
- **THEN** `routing_decision_path.excluded_upstreams` SHALL list excluded upstreams
- **AND** each exclusion SHALL include: upstream_id, upstream_name, reason ("circuit_open" | "model_not_allowed" | "unhealthy")

#### Scenario: Log failover decision path

- **GIVEN** a request that fails over 2 times before success
- **WHEN** the request completes
- **THEN** `routing_decision_path` SHALL include `failover_sequence` array
- **AND** each failover step SHALL include: attempt_number, attempted_upstream_id, error_type, timestamp

#### Scenario: Display decision path in admin UI

- **GIVEN** a request log with `routing_decision_path` data
- **WHEN** an admin views the log details
- **THEN** the UI SHALL display a visual timeline of the routing decision
- **AND** the timeline SHALL show: model extraction, candidate filtering, load balancing selection, failover attempts

### Requirement: Structured decision path format

The routing decision path SHALL use a structured JSON format for consistent logging and display.

#### Scenario: Decision path JSON structure

- **WHEN** recording a routing decision path
- **THEN** the format SHALL be:

```json
{
  "model": "gpt-4",
  "provider_type": "openai",
  "routing_type": "auto",
  "candidate_upstreams": [
    { "id": "uuid", "name": "openai-1", "weight": 3, "circuit_state": "closed" }
  ],
  "filtering": {
    "total_candidates": 3,
    "excluded": [{ "id": "uuid", "name": "openai-2", "reason": "circuit_open" }],
    "final_candidates": 2
  },
  "selection": {
    "strategy": "weighted",
    "selected_upstream_id": "uuid",
    "selected_upstream_name": "openai-1",
    "selection_duration_ms": 5
  },
  "failover_sequence": [
    {
      "attempt": 1,
      "upstream_id": "uuid",
      "upstream_name": "openai-1",
      "error_type": "timeout",
      "timestamp": "2024-01-15T10:30:00Z"
    }
  ],
  "final_result": {
    "upstream_id": "uuid",
    "upstream_name": "openai-3",
    "total_duration_ms": 250,
    "status_code": 200
  }
}
```
