## 1. Database Schema

- [ ] 1.1 Create `circuit_breaker_states` table with fields: upstream_id, state, failure_count, success_count, last_failure_at, opened_at, last_probe_at, config, created_at, updated_at
- [ ] 1.2 Add foreign key constraint from `circuit_breaker_states.upstream_id` to `upstreams.id` (onDelete: cascade)
- [ ] 1.3 Create index on `circuit_breaker_states.state` for fast filtering
- [ ] 1.4 Create Drizzle ORM schema definition for the new table
- [ ] 1.5 Generate and run database migration

## 2. Circuit Breaker Core Service

- [ ] 2.1 Create `src/lib/services/circuit-breaker.ts` with CircuitBreakerState enum (CLOSED, OPEN, HALF_OPEN)
- [ ] 2.2 Implement `getCircuitBreakerState(upstreamId)` to load state from database
- [ ] 2.3 Implement `recordSuccess(upstreamId)` to handle success transitions
- [ ] 2.4 Implement `recordFailure(upstreamId, errorType)` to handle failure transitions
- [ ] 2.5 Implement `canRequestPass(upstreamId)` to check if request should be allowed
- [ ] 2.6 Implement `forceOpen(upstreamId)` and `forceClose(upstreamId)` for admin control
- [ ] 2.7 Add default configuration constants (failureThreshold=5, successThreshold=2, openDuration=30s, probeInterval=10s)

## 3. Health Monitoring Enhancement

- [ ] 3.1 Extend `src/lib/services/health-checker.ts` to integrate with circuit breaker
- [ ] 3.2 Implement `probeUpstream(upstreamId)` for half-open state verification
- [ ] 3.3 Add background task scheduler for periodic health probes
- [ ] 3.4 Implement health metrics aggregation (availability, latency percentiles)
- [ ] 3.5 Create `src/app/api/admin/health/route.ts` for health status API

## 4. Model Router Integration

- [ ] 4.1 Modify `src/lib/services/model-router.ts` to query upstreams by provider_type directly
- [ ] 4.2 Integrate circuit breaker check in upstream selection (filter out OPEN state)
- [ ] 4.3 Update `routeByModel()` to return list of candidate upstreams instead of single upstream
- [ ] 4.4 Add fallback to group-based routing when no provider_type match found
- [ ] 4.5 Update `ModelRouterResult` interface to include candidate upstreams list

## 5. Load Balancer Enhancement

- [ ] 5.1 Add `selectFromProviderType(providerType, excludeIds?)` method to load-balancer.ts
- [ ] 5.2 Modify selection strategies to work without group requirement
- [ ] 5.3 Integrate circuit breaker state check in upstream selection
- [ ] 5.4 Add support for weighted selection based on health scores
- [ ] 5.5 Implement sticky session preference (optional, if time permits)

## 6. Proxy Route Failover

- [ ] 6.1 Refactor `forwardWithFailover()` in proxy route to use circuit breaker
- [ ] 6.2 Implement retry logic with circuit breaker awareness
- [ ] 6.3 Track failover history for request logging
- [ ] 6.4 Update error handling to distinguish circuit breaker errors from upstream errors
- [ ] 6.5 Ensure streaming responses properly release connections on failure

## 7. Admin API

- [ ] 7.1 Create `GET /api/admin/circuit-breakers` to list all circuit breaker states
- [ ] 7.2 Create `GET /api/admin/circuit-breakers/{upstreamId}` to get specific state
- [ ] 7.3 Create `POST /api/admin/circuit-breakers/{upstreamId}/force-open` endpoint
- [ ] 7.4 Create `POST /api/admin/circuit-breakers/{upstreamId}/force-close` endpoint
- [ ] 7.5 Add circuit breaker status to upstream list API response

## 8. Frontend Updates

- [ ] 8.1 Add circuit breaker status column to upstreams table
- [ ] 8.2 Create circuit breaker detail view with state visualization
- [ ] 8.3 Add manual reset buttons (force open/close) for admins
- [ ] 8.4 Update upstream form to include circuit breaker configuration
- [ ] 8.5 Add health status indicator to upstream cards

## 9. Testing

- [ ] 9.1 Write unit tests for circuit breaker state transitions
- [ ] 9.2 Write unit tests for failover logic with multiple upstreams
- [ ] 9.3 Write integration tests for proxy route failover scenarios
- [ ] 9.4 Write tests for circuit breaker configuration overrides
- [ ] 9.5 Test database migration on existing data

## 10. Documentation

- [ ] 10.1 Update API documentation with new circuit breaker endpoints
- [ ] 10.2 Add configuration guide for circuit breaker thresholds
- [ ] 10.3 Document failover behavior and troubleshooting
- [ ] 10.4 Update CLAUDE.md with new architecture details
