# Codebase Concerns

**Analysis Date:** 2026-03-30

## Tech Debt

**Proxy Request Lifecycle Is Concentrated In One File:**

- Issue: `src/app/api/proxy/v1/[...path]/route.ts` is a 3167-line handler that combines authentication, capability resolution, failover, stream settlement, billing snapshots, live logging, recorder writing, and unified error formatting.
- Files: `src/app/api/proxy/v1/[...path]/route.ts`, `src/lib/services/load-balancer.ts`, `src/lib/services/request-logger.ts`, `tests/unit/api/proxy/route.test.ts`
- Impact: Small route changes can regress unrelated behaviors such as connection-slot release, billing persistence, or failover attribution because the control flow crosses many concerns in one module and is paired with a 5974-line test file.
- Fix approach: Extract request parsing, upstream selection, failover execution, streaming settlement, recorder persistence, and terminal logging into separately testable modules with a narrower integration surface.

**Connection Slot Lifecycle Is Manually Coupled To Proxy Branches:**

- Issue: `src/lib/services/load-balancer.ts` reserves concurrency slots in `tryReserveConnectionSlot`, while `src/app/api/proxy/v1/[...path]/route.ts` releases them across several success, failover, error, and disconnect branches.
- Files: `src/lib/services/load-balancer.ts`, `src/app/api/proxy/v1/[...path]/route.ts`
- Impact: Any new early-return branch can leave `connectionCounts` inflated and silently reduce available capacity.
- Fix approach: Return a disposable reservation handle from selection or wrap upstream execution in a single `finally`-backed release path.

**Health Monitoring Is Described As Configurable But No Scheduler Is Present:**

- Issue: `src/lib/utils/config.ts` accepts `HEALTH_CHECK_INTERVAL`, and `README.md` documents a periodic interval, but the current code only exposes `checkUpstreamHealth(...)` and `probeUpstream(...)`; no recurring job or bootstrap scheduler is detected.
- Files: `src/lib/utils/config.ts`, `src/lib/services/health-checker.ts`, `src/app/api/admin/health/route.ts`, `src/app/api/admin/upstreams/health/route.ts`, `README.md`
- Impact: `upstream_health.last_check_at` freshness depends on manual checks or request-driven updates, so the recorded health state can drift away from the real upstream state.
- Fix approach: Add a dedicated server-side scheduler or worker that executes `checkUpstreamHealth(...)` on active upstreams and uses the configured interval.

## Known Bugs

**Streaming In-Progress Logs Can Remain Open Forever After Worker Failure:**

- Symptoms: `request_logs.status_code` can stay `null` for streaming rows if the request dies before the disconnect-settlement code updates the row.
- Files: `src/lib/services/request-logger.ts`, `src/app/api/proxy/v1/[...path]/route.ts`
- Trigger: Process crash, unhandled runtime failure, or premature termination during a streaming request after `logRequestStart(...)`.
- Workaround: Manual database cleanup or explicit reconciliation tooling; the current automatic reconciliation skips `isStream = true`.

**Recorder Output Defaults To An Ephemeral Container Path:**

- Symptoms: `docker-compose.yml` enables recording but writes to `tests/fixtures`, while only `/app/data` is mounted as a volume.
- Files: `docker-compose.yml`, `src/lib/services/traffic-recorder.ts`, `README.md`
- Trigger: Running the default compose deployment with recorder enabled.
- Workaround: Set `RECORDER_FIXTURES_DIR=/app/data/fixtures` or disable the recorder in production.

## Security Considerations

**Production Recorder Defaults Persist Sensitive Bodies:**

- Risk: The default compose config sets `RECORDER_ENABLED=true` and `RECORDER_REDACT_SENSITIVE=false`; `buildFixture(...)` persists inbound request bodies, outbound response bodies, downstream error bodies, and recorded SSE chunks.
- Files: `docker-compose.yml`, `src/lib/services/traffic-recorder.ts`, `src/app/api/proxy/v1/[...path]/route.ts`, `README.md`
- Current mitigation: Header names in `SENSITIVE_HEADER_NAMES` and upstream base URLs are redacted when `RECORDER_REDACT_SENSITIVE` is enabled.
- Recommendations: Default the deployment template to `RECORDER_ENABLED=false` or `RECORDER_REDACT_SENSITIVE=true`, and store recorder output under a mounted path with retention controls.

**Failover Evidence Bodies Are Stored In The Database:**

- Risk: Failed upstream responses are captured as `response_body_text` and `response_body_json`, attached to `failoverHistory`, and serialized into `request_logs.failover_history`.
- Files: `src/app/api/proxy/v1/[...path]/route.ts`, `src/lib/services/request-logger.ts`, `src/lib/db/schema-pg.ts`, `src/lib/db/schema-sqlite.ts`
- Current mitigation: Response headers are sanitized and body size is capped at 256 KiB.
- Recommendations: Redact or hash body evidence before persistence, or move raw evidence to a protected debug store that is disabled by default.

## Performance Bottlenecks

**Quota Sync Performs Many Repeated Aggregate Queries Without Matching Composite Indexes:**

- Problem: `syncFromDb()` and per-entity resyncs in both `src/lib/services/upstream-quota-tracker.ts` and `src/lib/services/api-key-quota-tracker.ts` issue one `sum(requestBillingSnapshots.finalCost)` query per rule per upstream or API key.
- Files: `src/lib/services/upstream-quota-tracker.ts`, `src/lib/services/api-key-quota-tracker.ts`, `src/lib/db/schema-pg.ts`, `src/lib/db/schema-sqlite.ts`
- Cause: The query predicate uses `upstream_id` or `api_key_id` plus `billing_status` and `billed_at`, but `request_billing_snapshots` only indexes `request_log_id`, `billing_status`, `model`, and `created_at`.
- Improvement path: Add composite indexes on `request_billing_snapshots` for quota lookups and batch aggregates by entity plus period in one query per sync cycle.

**Admin Read Paths Perform Reconciliation Writes On Every Request:**

- Problem: `listRequestLogs(...)`, `getOverviewStats()`, `getTimeseriesStats()`, and `getLeaderboardStats()` all call `reconcileStaleInProgressRequestLogs()` before serving data.
- Files: `src/lib/services/request-logger.ts`, `src/lib/services/stats-service.ts`, `src/lib/db/schema-pg.ts`, `src/lib/db/schema-sqlite.ts`
- Cause: The reconciliation query scans `request_logs` with `statusCode IS NULL ORDER BY createdAt`, but `request_logs` has no `status_code` or `(status_code, created_at)` index.
- Improvement path: Move reconciliation to a background task and add an index optimized for stale-row lookups.

**Health Metrics Scale Linearly With Upstream Count:**

- Problem: `getAllHealthMetrics()` loops through every upstream and calls `calculateHealthMetrics()` individually, which runs aggregate and percentile queries per upstream.
- Files: `src/lib/services/health-checker.ts`
- Cause: Per-upstream query fan-out instead of batched aggregation.
- Improvement path: Compute shared aggregates in grouped SQL, and defer percentile calculation until a specific upstream detail view needs it.

**Recorded Streams Can Consume Significant Memory And Disk Under Failure Load:**

- Problem: `readStreamChunks()` buffers up to 16 MiB per recorded stream, while failover capture keeps up to 256 KiB of body evidence per failed attempt.
- Files: `src/lib/services/traffic-recorder.ts`, `src/app/api/proxy/v1/[...path]/route.ts`
- Cause: Recording and failover evidence collection run alongside request handling with in-memory buffering.
- Improvement path: Lower defaults for production, stream large debug artifacts to an external store, and gate body capture behind an explicit debug mode.

## Fragile Areas

**Process-Local Routing State:**

- Files: `src/lib/services/load-balancer.ts`, `src/lib/services/session-affinity.ts`, `src/lib/services/upstream-quota-tracker.ts`, `src/lib/services/api-key-quota-tracker.ts`
- Why fragile: Concurrency counts, session affinity, and quota caches live in in-memory `Map` instances backed by local timers, so restart or multi-instance deployment immediately loses coordination.
- Safe modification: Treat these modules as single-node only until the state is externalized; when changing behavior, verify both request success paths and crash or restart semantics.
- Test coverage: `tests/unit/api/proxy/route.test.ts` and service tests cover single-process logic only.

**Proxy Routing Observability Contract:**

- Files: `src/app/api/proxy/v1/[...path]/route.ts`, `src/lib/services/request-logger.ts`, `src/lib/services/traffic-recorder.ts`, `src/components/admin/routing-decision-timeline.tsx`
- Why fragile: `did_send_upstream`, `selected_upstream_id`, `actual_upstream_id`, synthetic `concurrency_full` attempts, recorder fixtures, and failover evidence have to stay semantically aligned across backend logging and admin display.
- Safe modification: Change the backend log schema and admin rendering together, then verify real payloads in `tests/unit/api/proxy/route.test.ts` and `tests/e2e/logs-routing-decision.spec.ts`.
- Test coverage: Good on mock-driven shape assertions, thin on real end-to-end backend execution.

## Scaling Limits

**Session Affinity Capacity And Durability:**

- Current capacity: `src/lib/services/session-affinity.ts` caps the cache at 10,000 entries, uses a 5-minute sliding TTL, and enforces a 30-minute absolute TTL.
- Limit: Cross-instance affinity is not shared, and a single hot node can evict active sessions under load.
- Scaling path: Move affinity state to a shared store such as Redis and keep the hash-key format stable for migration.

**Concurrency And Quota Enforcement Are Single-Node Decisions:**

- Current capacity: `src/lib/services/load-balancer.ts`, `src/lib/services/upstream-quota-tracker.ts`, and `src/lib/services/api-key-quota-tracker.ts` make admission decisions from local counters and local cache snapshots.
- Limit: Running multiple `Next.js` server instances can over-admit requests, oversubscribe `maxConcurrency`, and exceed spending rules because each node sees only its own state.
- Scaling path: Replace local counters with shared atomic state and keep quota evaluation close to the billing snapshot source of truth.

**Dashboard Queries Read Raw Request History Directly:**

- Current capacity: `src/lib/services/stats-service.ts` computes overview, timeseries, and leaderboards directly from `request_logs` and `request_billing_snapshots`.
- Limit: Query cost grows with retained log volume because no rollup table, cache, or materialized aggregate is present.
- Scaling path: Add periodic rollups or cached aggregates for admin analytics.

## Dependencies at Risk

**Package-Level Risk:**

- Risk: Not detected in the inspected focus area.
- Impact: Not applicable.
- Migration plan: Not applicable.

## Missing Critical Features

**Automatic Health Check Runner:**

- Problem: `README.md` and `src/lib/utils/config.ts` expose `HEALTH_CHECK_INTERVAL`, but the current runtime does not contain a scheduler that repeatedly calls `checkUpstreamHealth(...)` for active upstreams.
- Blocks: Reliable `last_check_at` freshness, proactive unhealthy marking, and trustworthy admin health dashboards.

## Test Coverage Gaps

**Shadow Proxy Helper Test Has Drifted From Production Logic:**

- What's not tested: `tests/unit/api/proxy-route.test.ts` reimplements helper behavior instead of importing production code from `src/app/api/proxy/v1/[...path]/route.ts`, and its helper signatures do not reflect the richer error taxonomy now present in the route.
- Files: `tests/unit/api/proxy-route.test.ts`, `src/app/api/proxy/v1/[...path]/route.ts`
- Risk: The file can continue passing while the real route changes, creating maintenance noise and false confidence.
- Priority: Medium

**Proxy Route Tests Are Highly Mocked And Do Not Exercise The Real Backend Stack:**

- What's not tested: `tests/unit/api/proxy/route.test.ts` mocks auth, DB access, load balancing, health updates, circuit breakers, request logging, billing snapshots, recorder behavior, and proxy forwarding; Playwright E2E files also intercept admin APIs with `page.route(...)` rather than driving `/api/proxy/v1/*`.
- Files: `tests/unit/api/proxy/route.test.ts`, `tests/e2e/logs-routing-decision.spec.ts`, `tests/e2e/billing-tier-flow.spec.ts`, `.github/workflows/verify.yml`
- Risk: Integration regressions across DB schema, stream settlement, billing persistence, recorder persistence, and single-node state modules can pass CI without ever exercising a real proxy request.
- Priority: High

**Streaming Reconciliation Failure Path Has Only Unit-Level Coverage:**

- What's not tested: Recovery of stale streaming rows after worker restart or crash, especially when `logRequestStart(...)` succeeded but `updateRequestLog(...)` and billing snapshot persistence never ran.
- Files: `src/lib/services/request-logger.ts`, `src/app/api/proxy/v1/[...path]/route.ts`, `tests/unit/services/request-logger-db.test.ts`
- Risk: Orphaned in-progress logs and missing billing snapshots remain undetected until admin data drifts.
- Priority: High

---

_Concerns audit: 2026-03-30_
