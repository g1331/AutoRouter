## ADDED Requirements

### Requirement: Database schema supports routing decision storage

The system SHALL store complete routing decision information in the `request_logs` table via a `routing_decision` TEXT field containing JSON data.

#### Scenario: New log entry includes routing decision

- **WHEN** a proxy request is logged
- **AND** routing decision information is available
- **THEN** the `routing_decision` field SHALL contain a valid JSON object
- **AND** the JSON SHALL include `original_model`, `resolved_model`, `provider_type`, `routing_type`, `candidates`, `excluded`, `candidate_count`, `final_candidate_count`, `selected_upstream_id`, `selection_strategy` fields

#### Scenario: Backward compatibility with missing routing decision

- **WHEN** a log entry has no routing decision information
- **THEN** the `routing_decision` field SHALL be NULL
- **AND** existing queries SHALL continue to work without errors

### Requirement: Routing decision JSON structure

The `routing_decision` JSON SHALL conform to the following structure:

```typescript
interface RoutingDecisionLog {
  original_model: string;
  resolved_model: string;
  model_redirect_applied: boolean;
  provider_type: string | null;
  routing_type: "provider_type" | "group" | "none";
  candidates: Array<{
    id: string;
    name: string;
    weight: number;
    circuit_state: "closed" | "open" | "half_open";
  }>;
  excluded: Array<{
    id: string;
    name: string;
    reason: "circuit_open" | "model_not_allowed" | "unhealthy";
  }>;
  candidate_count: number;
  final_candidate_count: number;
  selected_upstream_id: string | null;
  selection_strategy: string;
}
```

#### Scenario: Model redirect is recorded

- **WHEN** a model redirect is applied (e.g., `gpt-4` → `gpt-4-turbo`)
- **THEN** `original_model` SHALL contain the original model name
- **AND** `resolved_model` SHALL contain the redirected model name
- **AND** `model_redirect_applied` SHALL be `true`

#### Scenario: No model redirect

- **WHEN** no model redirect is applied
- **THEN** `original_model` and `resolved_model` SHALL be identical
- **AND** `model_redirect_applied` SHALL be `false`

#### Scenario: Candidates list records participating upstreams

- **WHEN** multiple upstreams are candidates for selection
- **THEN** `candidates` array SHALL include all upstreams that passed filtering
- **AND** each candidate SHALL have `id`, `name`, `weight`, and `circuit_state`

#### Scenario: Excluded list records filtered upstreams

- **WHEN** upstreams are excluded due to circuit breaker or model restrictions
- **THEN** `excluded` array SHALL include all excluded upstreams
- **AND** each excluded entry SHALL have `id`, `name`, and `reason`
- **AND** `reason` SHALL be one of: `circuit_open`, `model_not_allowed`, `unhealthy`

### Requirement: Log request input accepts routing decision

The `LogRequestInput` and `UpdateRequestLogInput` interfaces SHALL accept an optional `routingDecision` field of type `RoutingDecisionLog`.

#### Scenario: Log request with routing decision

- **WHEN** `logRequest()` is called with `routingDecision` parameter
- **THEN** the routing decision SHALL be serialized to JSON
- **AND** stored in the `routing_decision` database field

#### Scenario: Update request log with routing decision

- **WHEN** `updateRequestLog()` is called with `routingDecision` parameter
- **THEN** the existing log entry's `routing_decision` field SHALL be updated

### Requirement: API response includes routing decision

The `GET /api/admin/logs` endpoint SHALL return the `routing_decision` field in each log entry.

#### Scenario: API returns routing decision as parsed object

- **WHEN** a client requests logs via `GET /api/admin/logs`
- **AND** log entries have `routing_decision` data
- **THEN** the response SHALL include `routing_decision` as a parsed JSON object (not a string)

#### Scenario: API returns null for missing routing decision

- **WHEN** a log entry has no `routing_decision` data
- **THEN** the API response SHALL return `routing_decision: null`

### Requirement: Proxy route passes routing decision to logger

The proxy route (`/api/proxy/v1/[...path]`) SHALL pass the `ModelRouterResult.routingDecision` and candidate/excluded information to the request logger.

#### Scenario: Successful request logs routing decision

- **WHEN** a proxy request completes successfully
- **THEN** the log entry SHALL include the complete routing decision
- **AND** the decision SHALL reflect the actual routing path taken

#### Scenario: Failed request logs routing decision

- **WHEN** a proxy request fails after routing
- **THEN** the log entry SHALL still include the routing decision
- **AND** the decision SHALL show which upstream was attempted

#### Scenario: Failover request logs all attempts

- **WHEN** a proxy request fails over to another upstream
- **THEN** the routing decision SHALL reflect the final successful upstream
- **AND** the `failover_history` field SHALL contain previous attempts
