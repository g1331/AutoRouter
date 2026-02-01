## 1. Database & Types

- [ ] 1.1 Add `routing_decision` TEXT field to `request_logs` table in `src/lib/db/schema.ts`
- [ ] 1.2 Generate database migration with `pnpm db:generate`
- [ ] 1.3 Define `RoutingDecisionLog` interface in `src/types/api.ts`
- [ ] 1.4 Update `RequestLogResponse` interface to include `routing_decision` field
- [ ] 1.5 Apply migration with `pnpm db:migrate`

## 2. Backend Service Layer

- [ ] 2.1 Update `LogRequestInput` interface in `src/lib/services/request-logger.ts` to accept `routingDecision`
- [ ] 2.2 Update `UpdateRequestLogInput` interface to accept `routingDecision`
- [ ] 2.3 Update `StartRequestLogInput` interface to accept `routingDecision`
- [ ] 2.4 Modify `logRequest()` function to serialize and store `routingDecision`
- [ ] 2.5 Modify `logRequestStart()` function to store `routingDecision`
- [ ] 2.6 Modify `updateRequestLog()` function to update `routingDecision`
- [ ] 2.7 Modify `listRequestLogs()` to parse and return `routing_decision` as object

## 3. Proxy Route Integration

- [ ] 3.1 Create helper function to transform `ModelRouterResult` to `RoutingDecisionLog`
- [ ] 3.2 Update proxy route to pass routing decision to `logRequestStart()`
- [ ] 3.3 Ensure routing decision is preserved through failover attempts
- [ ] 3.4 Update final log entry with complete routing decision on request completion

## 4. API Response

- [ ] 4.1 Update `GET /api/admin/logs` route to include `routing_decision` in response
- [ ] 4.2 Update API transformer to handle `routing_decision` field

## 5. Frontend Component

- [ ] 5.1 Create `src/components/admin/routing-decision-display.tsx` component
- [ ] 5.2 Implement compact view with upstream name, routing type badge, and candidate count
- [ ] 5.3 Implement visual indicators (🔄 redirect, ⚡ failover, 🔒 excluded, ⚠️ low candidates)
- [ ] 5.4 Implement Tooltip with model resolution, candidates list, and excluded list
- [ ] 5.5 Implement expanded view with full routing decision flow

## 6. Logs Table Integration

- [ ] 6.1 Update `logs-table.tsx` to use `RoutingDecisionDisplay` component
- [ ] 6.2 Modify row expansion logic to show routing decision alongside failover history
- [ ] 6.3 Update expand button visibility logic (show if routing decision OR failover history exists)
- [ ] 6.4 Implement graceful degradation for missing routing decision data

## 7. Internationalization

- [ ] 7.1 Add routing type labels to `src/messages/zh.json` (自动路由, 分组路由, 无路由)
- [ ] 7.2 Add routing type labels to `src/messages/en.json` (Auto Routing, Group Routing, No Routing)
- [ ] 7.3 Add exclusion reason labels to both language files
- [ ] 7.4 Add circuit state labels to both language files
- [ ] 7.5 Add tooltip section headers to both language files

## 8. Testing

- [ ] 8.1 Add unit tests for `RoutingDecisionLog` serialization/deserialization
- [ ] 8.2 Add unit tests for `logRequest()` with routing decision
- [ ] 8.3 Add unit tests for `listRequestLogs()` routing decision parsing
- [ ] 8.4 Add component tests for `RoutingDecisionDisplay` compact view
- [ ] 8.5 Add component tests for `RoutingDecisionDisplay` tooltip
- [ ] 8.6 Add component tests for `RoutingDecisionDisplay` expanded view
- [ ] 8.7 Add component tests for graceful degradation with missing data
