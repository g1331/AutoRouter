## ADDED Requirements

### Requirement: Compact upstream display shows key indicators

The logs table "Upstream" column SHALL display a compact summary with key routing indicators.

#### Scenario: Display upstream name and routing type

- **WHEN** a log entry is displayed in the table
- **THEN** the upstream column SHALL show the upstream name
- **AND** SHALL show a routing type badge (e.g., "自动", "分组", "直接")
- **AND** SHALL show the group/provider name if applicable

#### Scenario: Display candidate count indicator

- **WHEN** routing decision data is available
- **THEN** the upstream column SHALL show candidate count as "N/M" format
- **AND** N represents final candidates after filtering
- **AND** M represents total candidates before filtering

#### Scenario: Display visual indicators for special conditions

- **WHEN** `model_redirect_applied` is true
- **THEN** a redirect indicator (🔄) SHALL be displayed

- **WHEN** `failover_attempts` > 0
- **THEN** a failover indicator (⚡) SHALL be displayed

- **WHEN** `excluded` array is not empty
- **THEN** an exclusion indicator (🔒) SHALL be displayed

- **WHEN** `final_candidate_count` <= 1
- **THEN** a warning indicator (⚠️) SHALL be displayed

### Requirement: Tooltip displays routing decision summary

The upstream cell SHALL display a tooltip on hover showing routing decision details.

#### Scenario: Tooltip shows model resolution

- **WHEN** user hovers over the upstream cell
- **THEN** tooltip SHALL show original model name
- **AND** SHALL show resolved model name if different
- **AND** SHALL indicate if redirect was applied

#### Scenario: Tooltip shows candidate upstreams

- **WHEN** user hovers over the upstream cell
- **AND** candidates array is not empty
- **THEN** tooltip SHALL list candidate upstreams
- **AND** each candidate SHALL show name, weight, and circuit state
- **AND** the selected upstream SHALL be highlighted

#### Scenario: Tooltip shows excluded upstreams

- **WHEN** user hovers over the upstream cell
- **AND** excluded array is not empty
- **THEN** tooltip SHALL list excluded upstreams
- **AND** each excluded upstream SHALL show name and reason
- **AND** reason SHALL be displayed in human-readable format

### Requirement: Expandable row displays full routing decision

Log rows with routing decision data SHALL be expandable to show complete decision details.

#### Scenario: Row expansion shows routing decision flow

- **WHEN** user clicks on a log row with routing decision
- **THEN** an expanded section SHALL appear below the row
- **AND** SHALL display the complete routing decision flow in sections:
  1. Model Resolution (original → resolved, redirect status)
  2. Candidate Upstreams (list with weight and circuit state)
  3. Excluded Upstreams (list with reasons)
  4. Final Selection (upstream name, selection strategy)
  5. Failover History (if applicable)

#### Scenario: Expand button visibility

- **WHEN** a log entry has routing decision data OR failover history
- **THEN** an expand/collapse button SHALL be visible
- **WHEN** a log entry has neither
- **THEN** no expand button SHALL be displayed

#### Scenario: Failover history integration

- **WHEN** a log entry has both routing decision and failover history
- **THEN** the expanded view SHALL show both
- **AND** failover history SHALL be displayed after routing decision

### Requirement: Graceful degradation for missing data

The display components SHALL handle missing or partial routing decision data gracefully.

#### Scenario: No routing decision data

- **WHEN** `routing_decision` is null
- **THEN** the upstream column SHALL display only the upstream name
- **AND** no tooltip or expand functionality SHALL be available for routing decision
- **AND** existing failover expand functionality SHALL still work

#### Scenario: Partial routing decision data

- **WHEN** `routing_decision` has some fields missing
- **THEN** the display SHALL show available data
- **AND** missing sections SHALL be omitted (not show "N/A" or errors)

### Requirement: Internationalization support

All routing decision display text SHALL support internationalization.

#### Scenario: Routing type labels are translated

- **WHEN** displaying routing type badge
- **THEN** labels SHALL use translated strings:
  - `provider_type` → "自动路由" / "Auto Routing"
  - `group` → "分组路由" / "Group Routing"
  - `none` → "无路由" / "No Routing"

#### Scenario: Exclusion reasons are translated

- **WHEN** displaying excluded upstream reasons
- **THEN** reasons SHALL use translated strings:
  - `circuit_open` → "熔断器打开" / "Circuit Breaker Open"
  - `model_not_allowed` → "模型不支持" / "Model Not Allowed"
  - `unhealthy` → "健康检查失败" / "Health Check Failed"

#### Scenario: Circuit state labels are translated

- **WHEN** displaying circuit breaker state
- **THEN** states SHALL use translated strings:
  - `closed` → "关闭" / "Closed"
  - `open` → "打开" / "Open"
  - `half_open` → "半开" / "Half Open"

### Requirement: RoutingDecisionDisplay component

A new `RoutingDecisionDisplay` component SHALL be created to encapsulate routing decision visualization.

#### Scenario: Component accepts routing decision prop

- **WHEN** `RoutingDecisionDisplay` is rendered
- **THEN** it SHALL accept `routingDecision` prop of type `RoutingDecisionLog | null`
- **AND** SHALL accept optional `failoverHistory` prop

#### Scenario: Component renders compact view by default

- **WHEN** `RoutingDecisionDisplay` is rendered without `expanded` prop
- **THEN** it SHALL render the compact view (indicators + tooltip)

#### Scenario: Component renders expanded view when requested

- **WHEN** `RoutingDecisionDisplay` is rendered with `expanded={true}`
- **THEN** it SHALL render the full expanded view with all sections
