## 1. Database Schema Extension

- [x] 1.1 Add `routing_type`, `group_name`, `lb_strategy`, `failover_attempts`, `failover_history` columns to `request_logs` in `src/lib/db/schema.ts`
- [x] 1.2 Generate and apply database migration via `pnpm db:generate` and `pnpm db:migrate`
- [x] 1.3 Write schema tests to verify new columns exist with correct types and defaults

## 2. Request Logger Service

- [x] 2.1 Extend `LogRequestInput` interface in `src/lib/services/request-logger.ts` with routing decision fields
- [x] 2.2 Update `logRequest` function to persist the new fields
- [x] 2.3 Extend `RequestLogResponse` interface to include routing fields
- [x] 2.4 Update `listRequestLogs` to return the new fields
- [x] 2.5 Write unit tests for `logRequest` with routing decision data

## 3. Proxy Route - Collect Routing Information

- [ ] 3.1 Define a `RoutingDecision` type to carry routing info through the proxy flow
- [ ] 3.2 Capture routing type (`direct`/`group`/`default`) in `handleProxy` based on which header is used
- [ ] 3.3 Capture group name and load balancer strategy for group routing
- [ ] 3.4 Update `forwardWithFailover` to collect failover attempt records (upstream_id, name, error_type, error_message, status_code, timestamp)
- [ ] 3.5 Pass routing decision and failover history to all `logRequest` calls
- [ ] 3.6 Write unit tests for routing decision collection in proxy route

## 4. Admin API - Return Upstream Name

- [ ] 4.1 Update `listRequestLogs` query to JOIN `upstreams` table and return upstream name
- [ ] 4.2 Update the logs API response to include `upstream_name` and routing fields
- [ ] 4.3 Write unit tests for logs API response with upstream name and routing data

## 5. Types and API Contracts

- [ ] 5.1 Update `RequestLog` type in `src/types/api.ts` with routing fields and `upstream_name`
- [ ] 5.2 Update API hooks in `src/hooks/` if needed for the new response shape

## 6. UI - Logs Table Enhancement

- [ ] 6.1 Add "Upstream" column to logs table displaying upstream name
- [ ] 6.2 Add routing type badge (direct/group/default) next to upstream name
- [ ] 6.3 Implement expandable row for failover details (show only when `failover_attempts > 0`)
- [ ] 6.4 Display failover attempt list with upstream name, error type, message, and timestamp
- [ ] 6.5 Handle edge cases: null upstream (show "-"), deleted upstream (show "Unknown"), null routing_type (no badge)

## 7. Internationalization

- [ ] 7.1 Add English translations to `src/messages/en.json` for routing labels, failover detail labels, and column header
- [ ] 7.2 Add Chinese translations to `src/messages/zh-CN.json` for the same keys
- [ ] 7.3 Integrate translations in logs table component using `useTranslations`

## 8. Verification

- [ ] 8.1 Run full test suite (`pnpm test:run`) and fix any failures
- [ ] 8.2 Run type check (`pnpm exec tsc --noEmit`) and lint (`pnpm lint`)
- [ ] 8.3 Verify build succeeds (`pnpm build`)
