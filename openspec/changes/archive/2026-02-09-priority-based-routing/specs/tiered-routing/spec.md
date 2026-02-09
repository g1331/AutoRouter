## ADDED Requirements

### Requirement: Upstream priority field

Each upstream SHALL have a `priority` field (integer, default 0). Lower values indicate higher priority (0 = highest). The field MUST be non-negative.

#### Scenario: Create upstream with default priority

- **WHEN** a new upstream is created without specifying priority
- **THEN** the upstream's priority SHALL be set to 0

#### Scenario: Create upstream with explicit priority

- **WHEN** a new upstream is created with priority = 2
- **THEN** the upstream's priority SHALL be stored as 2

#### Scenario: Reject negative priority

- **WHEN** a new upstream is created with priority = -1
- **THEN** the system SHALL reject the request with a validation error

### Requirement: Tiered upstream selection

When selecting an upstream for a request, the system SHALL group all matching upstreams by priority tier and attempt selection from the highest-priority (lowest number) tier first. Only when all upstreams in a tier are unavailable SHALL the system proceed to the next tier.

#### Scenario: Select from highest priority tier

- **WHEN** a request for providerType "openai" arrives
- **AND** there are upstreams A (priority=0), B (priority=0), C (priority=1)
- **AND** A and B are both healthy
- **THEN** the system SHALL select from {A, B} only, never C

#### Scenario: Degrade to next tier when current tier exhausted

- **WHEN** a request for providerType "openai" arrives
- **AND** upstream A (priority=0) has circuit breaker OPEN
- **AND** upstream B (priority=0) has circuit breaker OPEN
- **AND** upstream C (priority=1) is healthy
- **THEN** the system SHALL select upstream C

#### Scenario: Degrade across multiple tiers

- **WHEN** a request for providerType "openai" arrives
- **AND** all priority=0 upstreams have circuit breaker OPEN
- **AND** all priority=1 upstreams have circuit breaker OPEN
- **AND** upstream D (priority=2) is healthy
- **THEN** the system SHALL select upstream D

#### Scenario: All tiers exhausted

- **WHEN** a request for providerType "openai" arrives
- **AND** all upstreams across all priority tiers are unavailable (circuit breaker OPEN or excluded)
- **THEN** the system SHALL return a NoHealthyUpstreamsError

### Requirement: Weighted selection within tier

Within a single priority tier, the system SHALL select upstreams using weighted random selection based on each upstream's `weight` field.

#### Scenario: Weighted distribution within tier

- **WHEN** selecting from tier 0 with upstream A (weight=3) and upstream B (weight=1)
- **THEN** upstream A SHALL be selected approximately 75% of the time and B approximately 25%

#### Scenario: Equal weights behave as uniform distribution

- **WHEN** selecting from tier 0 with upstream A (weight=1) and upstream B (weight=1)
- **THEN** each upstream SHALL be selected with approximately equal probability

### Requirement: Failover triggers cross-tier degradation

During a single request's failover sequence, when an upstream fails and is added to the exclude list, the system SHALL consider excluded upstreams as unavailable for tier evaluation. This allows a single request to degrade across tiers within its failover loop.

#### Scenario: Single request degrades through tiers via failover

- **WHEN** a request selects upstream A (priority=0) and it returns HTTP 500
- **AND** upstream A is the only priority=0 upstream
- **AND** upstream B (priority=1) is healthy
- **THEN** the failover retry SHALL select upstream B from the next tier

#### Scenario: Failover within same tier before degrading

- **WHEN** a request selects upstream A (priority=0) and it returns HTTP 500
- **AND** upstream B (priority=0) is healthy
- **THEN** the failover retry SHALL select upstream B from the same tier, not degrade

### Requirement: API key upstream authorization with tiered routing

The tiered selection algorithm SHALL respect API key upstream authorization. Only upstreams that the requesting API key is authorized to use SHALL be considered during tier evaluation.

#### Scenario: Authorized upstreams filtered before tiering

- **WHEN** API key K1 is authorized for upstreams {A, C} only
- **AND** upstream A (priority=0), B (priority=0), C (priority=1) exist
- **THEN** the system SHALL evaluate tier 0 with {A} only, and tier 1 with {C} only, ignoring B entirely

### Requirement: Upstream group removal

The system SHALL NOT have an upstream groups concept. The `upstreamGroups` table and all associated API endpoints SHALL be removed.

#### Scenario: Group API endpoints return 404

- **WHEN** a client sends a request to any `/api/admin/upstreams/groups` endpoint
- **THEN** the system SHALL return HTTP 404

#### Scenario: Upstream creation without groupId

- **WHEN** a new upstream is created
- **THEN** the system SHALL NOT accept or require a `groupId` field

### Requirement: Global health check configuration

Health check interval and timeout SHALL be configured via environment variables instead of per-group settings.

#### Scenario: Default health check values

- **WHEN** no health check environment variables are set
- **THEN** the system SHALL use interval=30 seconds and timeout=10 seconds

#### Scenario: Custom health check values

- **WHEN** HEALTH_CHECK_INTERVAL=60 and HEALTH_CHECK_TIMEOUT=15 are set
- **THEN** the system SHALL use interval=60 seconds and timeout=15 seconds

### Requirement: Request log records selected tier

Each request log entry SHALL record the priority tier of the upstream that ultimately served the request.

#### Scenario: Log tier for successful request

- **WHEN** a request is served by an upstream with priority=1 (after tier 0 degradation)
- **THEN** the request log SHALL record priority_tier=1

#### Scenario: Log tier for direct success

- **WHEN** a request is served by an upstream with priority=0 on first attempt
- **THEN** the request log SHALL record priority_tier=0
