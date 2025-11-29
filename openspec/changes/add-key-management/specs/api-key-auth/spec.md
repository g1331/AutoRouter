# Capability: API Key Authentication and Authorization

## ADDED Requirements

### Requirement: API Key Generation
The system SHALL provide an admin interface to generate API keys for downstream clients.

#### Scenario: Generate new API key
- **GIVEN** an authenticated admin user
- **WHEN** a POST request is made to `/admin/keys` with a name and optional description
- **THEN** the system SHALL generate a unique API key with format `sk-auto-{32-byte-base64-random}`
- **AND** store the key in the database with status `active`
- **AND** return the key value (shown only once)

#### Scenario: Specify upstream permissions
- **GIVEN** an API key creation request
- **WHEN** the request includes a list of upstream IDs in `upstream_ids` field
- **THEN** the created API key SHALL only be authorized to access those upstreams
- **AND** attempts to access other upstreams SHALL be rejected with 403

#### Scenario: Set expiration time
- **GIVEN** an API key creation request
- **WHEN** the request includes an `expires_at` timestamp
- **THEN** the key SHALL become invalid after that timestamp
- **AND** requests using expired keys SHALL be rejected with 401

#### Scenario: Reject missing upstream list
- **GIVEN** an API key creation request
- **WHEN** the `upstream_ids` field is missing or empty
- **THEN** the system SHALL return 400 with error `{"error":"missing_upstreams","message":"At least one upstream must be specified"}`
- **AND** no API key SHALL be created

#### Scenario: Reject invalid upstream IDs
- **GIVEN** an API key creation request with `upstream_ids`=["valid-id", "invalid-id", "inactive-id"]
- **WHEN** any upstream ID does not exist or is inactive
- **THEN** the system SHALL return 400 with error `{"error":"invalid_upstream","details":["invalid-id","inactive-id"]}`
- **AND** the transaction SHALL rollback
- **AND** no API key or join table rows SHALL be created

### Requirement: Secure API Key Storage
The system SHALL store API keys securely using cryptographic hashing to prevent exposure in case of database breach.

#### Scenario: Hash API keys with bcrypt
- **GIVEN** a newly generated API key `sk-auto-{random}`
- **WHEN** storing to database
- **THEN** the system SHALL hash the key using bcrypt (work factor=12)
- **AND** store only the hash in `api_keys.key_hash` column
- **AND** store the prefix (first 12 characters) in `api_keys.key_prefix` for display
- **AND** never store the plaintext key value

#### Scenario: Return key only once
- **GIVEN** an API key creation response
- **WHEN** the response is returned to admin
- **THEN** the full key value SHALL be included in the response
- **AND** subsequent requests to list/get keys SHALL only return the prefix (e.g., `sk-auto-xxxx`)
- **AND** the full key value SHALL never be retrievable again

### Requirement: API Key Validation
The system SHALL validate API keys on every incoming proxy request before forwarding to upstream.

#### Scenario: Valid API key
- **GIVEN** a proxy request with `Authorization: Bearer sk-auto-xxxxx` header
- **WHEN** the key exists in database and is_active=true and not expired
- **THEN** the request SHALL proceed to upstream selection and forwarding

#### Scenario: Missing API key
- **GIVEN** a proxy request without Authorization header
- **WHEN** the request arrives at proxy endpoints
- **THEN** the system SHALL return 401 with error `{"error":"missing_api_key","message":"Authorization header required"}`

#### Scenario: Invalid API key
- **GIVEN** a proxy request with Authorization header
- **WHEN** the key does not exist in database or is_active=false
- **THEN** the system SHALL return 401 with error `{"error":"invalid_api_key","message":"API key not found or inactive"}`

#### Scenario: Expired API key
- **GIVEN** a proxy request with a valid but expired API key
- **WHEN** current time > expires_at
- **THEN** the system SHALL return 401 with error `{"error":"api_key_expired","message":"API key has expired"}`

### Requirement: Upstream Access Control
The system SHALL enforce permissions so API keys can only access authorized upstreams.

#### Scenario: Access authorized upstream
- **GIVEN** an API key with upstream_ids=["upstream-1", "upstream-2"]
- **WHEN** a proxy request uses X-Upstream-Name header to select "upstream-1"
- **THEN** the request SHALL be forwarded to upstream-1

#### Scenario: Access unauthorized upstream
- **GIVEN** an API key with upstream_ids=["upstream-1"]
- **WHEN** a proxy request attempts to access "upstream-2"
- **THEN** the system SHALL return 403 with error `{"error":"forbidden","message":"API key not authorized for upstream: upstream-2"}`

#### Scenario: Default upstream selection
- **GIVEN** an API key with upstream_ids=["upstream-1", "upstream-2"]
- **WHEN** a proxy request does not specify X-Upstream-Name header
- **THEN** the system SHALL select the default upstream from the authorized list
- **AND** if default is not in authorized list, use the first authorized upstream

#### Scenario: Upstream deleted or inactive (503 vs 403)
- **GIVEN** an API key authorized for upstream "deleted-upstream"
- **WHEN** the upstream has been soft-deleted (is_active=false) or does not exist
- **THEN** the system SHALL return 503 with error `{"error":"service_unavailable","message":"Upstream deleted-upstream is not available"}`
- **AND** NOT return 403 (because the key is authorized, but the service is unavailable)

#### Scenario: Distinguish forbidden from unavailable
- **GIVEN** a proxy request scenario
- **WHEN** the API key is not authorized for the selected upstream
- **THEN** return 403 `{"error":"forbidden"}`
- **WHEN** the API key is authorized but the upstream is inactive/deleted
- **THEN** return 503 `{"error":"service_unavailable"}`

### Requirement: API Key Management
The system SHALL provide admin endpoints to manage API keys lifecycle.

#### Scenario: List API keys
- **GIVEN** an authenticated admin
- **WHEN** a GET request is made to `/admin/keys`
- **THEN** the system SHALL return a paginated list of API keys
- **AND** exclude the actual key_value (only show last 4 characters like `****abcd`)
- **AND** include metadata: id, name, upstream_ids, is_active, created_at, expires_at

#### Scenario: Revoke API key
- **GIVEN** an existing active API key
- **WHEN** admin sends DELETE to `/admin/keys/{id}`
- **THEN** the system SHALL set is_active=false
- **AND** return 204 No Content
- **AND** subsequent requests with this key SHALL be rejected with 401

#### Scenario: Cannot revoke non-existent key
- **GIVEN** a key ID that does not exist
- **WHEN** admin attempts to delete it
- **THEN** the system SHALL return 404 with error `{"error":"not_found","message":"API key not found"}`

### Requirement: Upstream Dynamic Configuration
The system SHALL store upstream configurations in database instead of environment variables, allowing runtime updates.

#### Scenario: Create upstream via API
- **GIVEN** an authenticated admin
- **WHEN** a POST request is made to `/admin/upstreams` with name, provider, base_url, api_key
- **THEN** the system SHALL encrypt the api_key using Fernet
- **AND** store the upstream in database with is_active=true
- **AND** make it immediately available for proxy routing

#### Scenario: Update upstream configuration
- **GIVEN** an existing upstream
- **WHEN** admin sends PUT to `/admin/upstreams/{id}` with updated fields
- **THEN** the system SHALL update the database record
- **AND** re-encrypt api_key if changed
- **AND** reload the UpstreamManager to reflect changes immediately

#### Scenario: Delete upstream
- **GIVEN** an existing upstream
- **WHEN** admin sends DELETE to `/admin/upstreams/{id}`
- **THEN** the system SHALL set is_active=false (soft delete)
- **AND** the upstream SHALL no longer appear in available upstreams list
- **AND** existing API keys referencing this upstream SHALL fail with 503

#### Scenario: List upstreams
- **GIVEN** an authenticated admin
- **WHEN** a GET request is made to `/admin/upstreams`
- **THEN** the system SHALL return all upstreams
- **AND** mask the api_key (show as `sk-***1234`)
- **AND** include: id, name, provider, base_url, is_default, timeout, is_active

### Requirement: Backward Compatibility
The system SHALL maintain backward compatibility with environment variable configuration.

#### Scenario: Import from environment on first start
- **GIVEN** the database upstreams table is empty
- **WHEN** the application starts with UPSTREAMS environment variable set
- **THEN** the system SHALL import all upstreams from env var into database
- **AND** use those upstreams for routing

#### Scenario: Environment variable fallback
- **GIVEN** the database is unavailable
- **WHEN** the application starts with UPSTREAMS environment variable
- **THEN** the system SHALL use env var upstreams as fallback
- **AND** log a warning about database unavailability

### Requirement: Secure Storage
The system SHALL encrypt sensitive data at rest.

#### Scenario: Upstream API key encryption
- **GIVEN** an upstream with api_key="sk-real-upstream-key"
- **WHEN** stored in database
- **THEN** the api_key_encrypted field SHALL contain Fernet-encrypted data
- **AND** the plaintext key SHALL NOT be stored anywhere

#### Scenario: Encryption key required (fail-fast)
- **GIVEN** neither ENCRYPTION_KEY nor ENCRYPTION_KEY_FILE is set
- **WHEN** the application starts
- **THEN** the system SHALL immediately exit with error code 1
- **AND** log a fatal error: "ENCRYPTION_KEY is required. Generate with: python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'"
- **AND** NOT auto-generate a key (to prevent data loss on restart)

#### Scenario: Encryption key from file
- **GIVEN** ENCRYPTION_KEY_FILE=/path/to/key.txt is set
- **WHEN** the application starts
- **THEN** the system SHALL read the key from the file
- **AND** validate it is a valid Fernet key (44-character base64 URL-safe)
- **AND** exit with error if file is missing or key is invalid

#### Scenario: Decryption on use
- **GIVEN** an encrypted upstream api_key in database
- **WHEN** the proxy needs to forward a request to this upstream
- **THEN** the system SHALL decrypt the api_key in-memory
- **AND** inject it into the upstream request headers
- **AND** never log or expose the decrypted key

### Requirement: Request Logging
The system SHALL log all proxy requests for auditing and analytics.

#### Scenario: Log successful request
- **GIVEN** a proxy request completes successfully
- **WHEN** the upstream returns a response
- **THEN** the system SHALL record in request_logs table:
  - api_key_id, upstream_id, method, path, model
  - prompt_tokens, completion_tokens, total_tokens (extracted from response)
  - status_code, duration_ms, created_at

#### Scenario: Log failed request
- **GIVEN** a proxy request fails (timeout, connection error, or 4xx/5xx)
- **WHEN** the error occurs
- **THEN** the system SHALL record the request with:
  - status_code (or 0 if no response)
  - error_message (exception details)
  - tokens=0 (if unable to extract)

#### Scenario: Log without PII
- **GIVEN** any request log
- **WHEN** recorded to database
- **THEN** the log SHALL NOT contain:
  - Actual API key values (only api_key_id)
  - Upstream API keys
  - Request/response body content (except model name and token counts)

### Requirement: Admin Authentication
The system SHALL protect admin endpoints with bearer token authentication.

#### Scenario: Valid admin token
- **GIVEN** a request to any `/admin/*` endpoint
- **WHEN** the Authorization header contains `Bearer {ADMIN_TOKEN}` matching environment variable
- **THEN** the request SHALL proceed

#### Scenario: Invalid admin token
- **GIVEN** a request to `/admin/*` endpoint
- **WHEN** the Authorization header is missing or does not match ADMIN_TOKEN
- **THEN** the system SHALL return 403 with error `{"error":"forbidden","message":"Admin access required"}`

#### Scenario: Admin endpoints are protected
- **GIVEN** all endpoints under `/admin/*`
- **WHEN** accessed without authentication
- **THEN** they SHALL reject with 403 (not 401, to avoid revealing endpoint existence)

### Requirement: Request Log Retention
The system SHALL implement automatic cleanup of old request logs to prevent unbounded database growth.

#### Scenario: Default retention period
- **GIVEN** the LOG_RETENTION_DAYS environment variable is not set
- **WHEN** the log cleanup job runs
- **THEN** it SHALL delete logs older than 90 days
- **AND** keep all logs created within the last 90 days

#### Scenario: Configurable retention
- **GIVEN** LOG_RETENTION_DAYS=30 is set
- **WHEN** the cleanup job runs
- **THEN** it SHALL delete logs older than 30 days
- **AND** log the number of deleted records

#### Scenario: Scheduled cleanup
- **GIVEN** the application is running
- **WHEN** the time reaches 02:00 AM daily
- **THEN** the cleanup job SHALL execute automatically
- **AND** delete logs older than the retention period
- **AND** log completion: "Cleaned up N old request logs"

#### Scenario: No data loss within retention
- **GIVEN** logs exist within the retention period
- **WHEN** cleanup job runs
- **THEN** those logs SHALL NOT be deleted
- **AND** only logs with created_at < (now - retention_days) SHALL be removed

### Requirement: Performance - API Key Caching
The system SHALL cache validated API keys in memory to minimize database load and maintain low latency.

#### Scenario: Cache hit reduces latency
- **GIVEN** an API key has been validated within the last 5 minutes
- **WHEN** the same key is used in a new request
- **THEN** the system SHALL retrieve the key from cache (not database)
- **AND** validation latency SHALL be <1ms

#### Scenario: Cache miss falls back to database
- **GIVEN** an API key is not in cache (first use or expired from cache)
- **WHEN** a request uses this key
- **THEN** the system SHALL query the database
- **AND** store the result in cache with TTL=300 seconds
- **AND** return the validated key object

#### Scenario: Cache invalidation on revocation
- **GIVEN** an API key exists in the cache
- **WHEN** an admin revokes the key (DELETE /admin/keys/{id})
- **THEN** the system SHALL immediately remove the key from cache
- **AND** subsequent requests with this key SHALL be rejected with 401
- **AND** NOT wait for cache TTL expiration

#### Scenario: Cache size limit
- **GIVEN** the cache contains 10,000 entries (max capacity)
- **WHEN** a new API key is validated
- **THEN** the system SHALL evict the least recently used entry
- **AND** add the new key to cache
- **AND** maintain performance (LRU eviction in O(1))

#### Scenario: Performance target
- **GIVEN** API key validation with cache enabled
- **WHEN** measuring p99 latency over 1000 requests
- **THEN** the latency increase SHALL be <10ms compared to no authentication
- **AND** cache hit rate SHALL be >90% for typical workloads
