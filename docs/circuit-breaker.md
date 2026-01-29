# Circuit Breaker and Failover Documentation

## Overview

AutoRouter implements a circuit breaker pattern combined with automatic failover to provide resilient upstream connectivity. When an upstream fails, the system automatically routes requests to alternative upstreams while tracking failure patterns to prevent cascading failures.

## Circuit Breaker States

```
┌─────────┐    failures     ┌─────────┐    timeout      ┌─────────┐
│ CLOSED  │ ──────────────▶ │  OPEN   │ ──────────────▶ │HALF_OPEN│
│ (normal)│                 │(failing)│                 │(probing)│
└─────────┘                 └─────────┘                 └─────────┘
     ▲                                                        │
     │                     success                            ▼
     └──────────────────────────────────────────────────── CLOSED
```

### State Descriptions

| State         | Description      | Behavior                                                                     |
| ------------- | ---------------- | ---------------------------------------------------------------------------- |
| **CLOSED**    | Normal operation | Requests are routed to the upstream. Failures are counted.                   |
| **OPEN**      | Circuit is open  | Requests are blocked immediately. Returns error without attempting upstream. |
| **HALF_OPEN** | Probing state    | Limited requests allowed through to test if upstream recovered.              |

### State Transitions

1. **CLOSED → OPEN**: When failure count exceeds `failureThreshold` (default: 5)
2. **OPEN → HALF_OPEN**: After `openDuration` timeout (default: 30s)
3. **HALF_OPEN → CLOSED**: When success count reaches `successThreshold` (default: 2)
4. **HALF_OPEN → OPEN**: On any failure during probing

## Configuration

Circuit breaker can be configured per upstream via the `config` field:

```json
{
  "circuit_breaker": {
    "failure_threshold": 5,
    "success_threshold": 2,
    "open_duration": 30000,
    "probe_interval": 10000
  }
}
```

| Parameter           | Default | Description                                                     |
| ------------------- | ------- | --------------------------------------------------------------- |
| `failure_threshold` | 5       | Number of consecutive failures to open circuit                  |
| `success_threshold` | 2       | Number of consecutive successes to close circuit from half-open |
| `open_duration`     | 30000   | Milliseconds to wait before attempting recovery (half-open)     |
| `probe_interval`    | 10000   | Milliseconds between probe attempts in half-open state          |

## Failover Behavior

When a request fails with a failoverable error (timeout, 5xx, connection error, circuit open):

1. Circuit breaker records the failure
2. Upstream is marked as unhealthy
3. Failover attempt is logged with error type and timestamp
4. Request is retried with the next available upstream
5. Process repeats until success or all upstreams exhausted

### Failover Error Types

- `timeout`: Request timed out
- `http_5xx`: Upstream returned 5xx error
- `http_429`: Rate limited (429 Too Many Requests)
- `connection_error`: Network connection failed
- `circuit_open`: Circuit breaker is open for this upstream

## Admin API Endpoints

### List Circuit Breaker States

```http
GET /api/admin/circuit-breakers?page=1&page_size=20&state=open
```

### Get Specific Upstream State

```http
GET /api/admin/circuit-breakers/{upstreamId}
```

### Force Circuit Breaker Open

```http
POST /api/admin/circuit-breakers/{upstreamId}/force-open
```

Response:

```json
{
  "success": true,
  "message": "Circuit breaker forced to OPEN for upstream 'name'",
  "upstream_id": "uuid",
  "upstream_name": "name",
  "action": "force_open"
}
```

### Force Circuit Breaker Closed

```http
POST /api/admin/circuit-breakers/{upstreamId}/force-close
```

## Frontend UI

The upstreams table displays circuit breaker status:

- **Normal** (green): Circuit is CLOSED
- **OPEN** (red): Circuit is open, requests blocked
- **Recovering** (yellow): Circuit is HALF_OPEN, probing

Click on the status badge to view detailed information and manually control the circuit breaker state.

## Decision Path Logging

Failover attempts are logged in the request logs:

```json
{
  "failover_attempts": 2,
  "failover_history": [
    {
      "upstream_id": "uuid-1",
      "upstream_name": "openai-primary",
      "attempted_at": "2024-01-15T10:30:00Z",
      "error_type": "timeout",
      "error_message": "Request timeout after 30000ms",
      "status_code": null
    },
    {
      "upstream_id": "uuid-2",
      "upstream_name": "openai-backup",
      "attempted_at": "2024-01-15T10:30:05Z",
      "error_type": "circuit_open",
      "error_message": "Circuit breaker is OPEN",
      "status_code": null
    }
  ]
}
```

## Database Schema

### circuit_breaker_states Table

| Column            | Type      | Description                          |
| ----------------- | --------- | ------------------------------------ |
| `id`              | UUID      | Primary key                          |
| `upstream_id`     | UUID      | Reference to upstreams table         |
| `state`           | VARCHAR   | `closed`, `open`, `half_open`        |
| `failure_count`   | INTEGER   | Consecutive failures                 |
| `success_count`   | INTEGER   | Consecutive successes (in half_open) |
| `last_failure_at` | TIMESTAMP | Last failure timestamp               |
| `opened_at`       | TIMESTAMP | When circuit opened                  |
| `last_probe_at`   | TIMESTAMP | Last probe attempt                   |
| `config`          | JSONB     | Circuit breaker configuration        |

## Troubleshooting

### Circuit breaker keeps opening

1. Check upstream health in admin dashboard
2. Verify upstream configuration (URL, API key)
3. Check network connectivity to upstream
4. Review request logs for error patterns

### Failover not working

1. Ensure multiple upstreams are configured
2. Check that upstreams have matching provider types
3. Verify circuit breaker is not open on all upstreams
4. Check load balancer configuration

### High latency during failover

1. Consider reducing `openDuration` for faster recovery
2. Check health check intervals
3. Verify upstream connection pooling settings

## Best Practices

1. **Configure appropriate thresholds**: Set `failure_threshold` based on your upstream's reliability
2. **Monitor circuit breaker states**: Use the admin dashboard to spot problematic upstreams
3. **Set up alerts**: Monitor for circuits that stay open too long
4. **Test failover scenarios**: Regularly test failover behavior in staging
5. **Use health checks**: Enable health monitoring for proactive failure detection
