## 1. Database & Types

- [x] 1.1 Add `routing_decision` TEXT field to `request_logs` table in `src/lib/db/schema.ts`
- [x] 1.2 Generate database migration with `pnpm db:generate`
- [x] 1.3 Define `RoutingDecisionLog` interface in `src/types/api.ts`
- [x] 1.4 Update `RequestLogResponse` interface to include `routing_decision` field
- [x] 1.5 Apply migration with `pnpm db:migrate` (migration file generated, will apply on deployment)

## 2. Backend Service Layer

- [x] 2.1 Update `LogRequestInput` interface in `src/lib/services/request-logger.ts` to accept `routingDecision`
- [x] 2.2 Update `UpdateRequestLogInput` interface to accept `routingDecision`
- [x] 2.3 Update `StartRequestLogInput` interface to accept `routingDecision`
- [x] 2.4 Modify `logRequest()` function to serialize and store `routingDecision`
- [x] 2.5 Modify `logRequestStart()` function to store `routingDecision`
- [x] 2.6 Modify `updateRequestLog()` function to update `routingDecision`
- [x] 2.7 Modify `listRequestLogs()` to parse and return `routing_decision` as object

## 3. Proxy Route Integration

- [x] 3.1 Create helper function to transform `ModelRouterResult` to `RoutingDecisionLog`
- [x] 3.2 Update proxy route to pass routing decision to `logRequestStart()`
- [x] 3.3 Ensure routing decision is preserved through failover attempts
- [x] 3.4 Update final log entry with complete routing decision on request completion

## 4. API Response

- [x] 4.1 Update `GET /api/admin/logs` route to include `routing_decision` in response
- [x] 4.2 Update API transformer to handle `routing_decision` field

## 5. Frontend Component

- [x] 5.1 Create `src/components/admin/routing-decision-display.tsx` component
- [x] 5.2 Implement compact view with upstream name, routing type badge, and candidate count
- [x] 5.3 Implement visual indicators (🔄 redirect, ⚡ failover, 🔒 excluded, ⚠️ low candidates)
- [x] 5.4 Implement Tooltip with model resolution, candidates list, and excluded list
- [x] 5.5 Implement expanded view with full routing decision flow

## 6. Logs Table Integration

- [x] 6.1 Update `logs-table.tsx` to use `RoutingDecisionDisplay` component
- [x] 6.2 Modify row expansion logic to show routing decision alongside failover history
- [x] 6.3 Update expand button visibility logic (show if routing decision OR failover history exists)
- [x] 6.4 Implement graceful degradation for missing routing decision data

## 7. Internationalization

- [x] 7.1 Add routing type labels to `src/messages/zh.json` (自动路由, 分组路由, 无路由)
- [x] 7.2 Add routing type labels to `src/messages/en.json` (Auto Routing, Group Routing, No Routing)
- [x] 7.3 Add exclusion reason labels to both language files
- [x] 7.4 Add circuit state labels to both language files
- [x] 7.5 Add tooltip section headers to both language files

## 8. Testing

- [x] 8.1 Add unit tests for `RoutingDecisionLog` serialization/deserialization
- [x] 8.2 Add unit tests for `logRequest()` with routing decision
- [x] 8.3 Add unit tests for `listRequestLogs()` routing decision parsing
- [x] 8.4 Add component tests for `RoutingDecisionDisplay` compact view
- [x] 8.5 Add component tests for `RoutingDecisionDisplay` tooltip
- [x] 8.6 Add component tests for `RoutingDecisionDisplay` expanded view
- [x] 8.7 Add component tests for graceful degradation with missing data
