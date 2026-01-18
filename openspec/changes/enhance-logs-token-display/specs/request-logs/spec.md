## MODIFIED Requirements

### Requirement: Request Logs Query API

The system SHALL provide an admin API endpoint to query request logs with pagination and filtering, including detailed token usage information.

#### Scenario: List all logs with pagination

- **WHEN** admin requests `GET /admin/logs?page=1&page_size=20` with valid admin token
- **THEN** system returns paginated list of request logs
- **AND** response includes total count, current page, and total pages
- **AND** logs are ordered by created_at descending (newest first)
- **AND** each log includes basic tokens (prompt_tokens, completion_tokens, total_tokens)
- **AND** each log includes cache tokens (cached_tokens, cache_creation_tokens, cache_read_tokens)
- **AND** each log includes reasoning_tokens for o1/o3 models

#### Scenario: Filter logs by API key

- **WHEN** admin requests `GET /admin/logs?api_key_id={uuid}` with valid admin token
- **THEN** system returns only logs associated with the specified API key

#### Scenario: Filter logs by upstream

- **WHEN** admin requests `GET /admin/logs?upstream_id={uuid}` with valid admin token
- **THEN** system returns only logs routed through the specified upstream

#### Scenario: Filter logs by status code

- **WHEN** admin requests `GET /admin/logs?status_code=200` with valid admin token
- **THEN** system returns only logs with HTTP 200 status code

#### Scenario: Filter logs by time range

- **WHEN** admin requests `GET /admin/logs?start_time={iso8601}&end_time={iso8601}` with valid admin token
- **THEN** system returns only logs within the specified time range

#### Scenario: Unauthorized access denied

- **WHEN** request to `GET /admin/logs` lacks valid admin token
- **THEN** system returns HTTP 401 Unauthorized

### Requirement: Request Logs UI

The admin console SHALL provide a dedicated page to view request logs with enhanced token display.

#### Scenario: View logs table with token details

- **WHEN** admin navigates to `/logs` page
- **THEN** system displays a table with columns: Time, Method, Path, Model, Tokens, Status, Duration
- **AND** table follows Cassette Futurism design style
- **AND** status codes are color-coded (2xx green, 4xx/5xx red)
- **AND** Token column displays total with labeled breakdown (input/output)
- **AND** Token column shows cache indicator when cached_tokens > 0

#### Scenario: View token tooltip details

- **WHEN** admin hovers over the Token column
- **THEN** system displays tooltip with complete token breakdown
- **AND** tooltip shows: input_tokens, output_tokens, cached_tokens, cache_creation_tokens, cache_read_tokens, reasoning_tokens
- **AND** zero values are hidden from tooltip for clarity

#### Scenario: Paginate through logs

- **WHEN** logs exceed page size
- **THEN** pagination controls are displayed
- **AND** admin can navigate between pages

#### Scenario: Navigate to logs from sidebar

- **WHEN** admin views any dashboard page
- **THEN** sidebar includes "Logs" navigation item
- **AND** clicking navigates to `/logs` page

### Requirement: Request Logs I18n

The logs UI SHALL support internationalization for all token-related labels.

#### Scenario: English locale

- **WHEN** locale is `en`
- **THEN** logs page displays English labels (e.g., "Request Logs", "Tokens", "Duration")
- **AND** token labels show: "Input", "Output", "Cached", "Cache Write", "Cache Read", "Reasoning"

#### Scenario: Chinese locale

- **WHEN** locale is `zh`
- **THEN** logs page displays Chinese labels
- **AND** token labels show: "输入", "输出", "缓存命中", "缓存写入", "缓存读取", "推理"

## ADDED Requirements

### Requirement: Token Usage Extraction

The system SHALL extract and record detailed token usage from AI provider responses.

#### Scenario: Extract OpenAI standard tokens

- **WHEN** proxy receives response with OpenAI usage format
- **THEN** system extracts prompt_tokens, completion_tokens, total_tokens
- **AND** stores values in request log

#### Scenario: Extract OpenAI cached tokens

- **WHEN** proxy receives response with prompt_tokens_details.cached_tokens
- **THEN** system extracts cached_tokens value
- **AND** stores in cached_tokens and cache_read_tokens fields

#### Scenario: Extract OpenAI reasoning tokens

- **WHEN** proxy receives response with completion_tokens_details.reasoning_tokens
- **THEN** system extracts reasoning_tokens value
- **AND** stores in reasoning_tokens field

#### Scenario: Extract Anthropic standard tokens

- **WHEN** proxy receives response with Anthropic usage format
- **THEN** system extracts input_tokens as prompt_tokens
- **AND** extracts output_tokens as completion_tokens
- **AND** calculates total_tokens as sum

#### Scenario: Extract Anthropic cache creation tokens

- **WHEN** proxy receives response with cache_creation_input_tokens
- **THEN** system extracts value
- **AND** stores in cache_creation_tokens field

#### Scenario: Extract Anthropic cache read tokens

- **WHEN** proxy receives response with cache_read_input_tokens
- **THEN** system extracts value
- **AND** stores in cached_tokens and cache_read_tokens fields

#### Scenario: Handle missing token details

- **WHEN** response lacks detailed token information
- **THEN** system stores 0 for missing cache/reasoning fields
- **AND** basic tokens are still recorded if available

### Requirement: Logs Auto Refresh

The logs page SHALL support automatic refresh functionality.

#### Scenario: Enable auto refresh

- **WHEN** admin selects refresh interval from dropdown (10s/30s/60s)
- **THEN** logs table automatically refreshes at selected interval
- **AND** current page position is maintained during refresh
- **AND** preference is persisted to localStorage

#### Scenario: Disable auto refresh

- **WHEN** admin selects "Off" from refresh dropdown
- **THEN** auto refresh is disabled
- **AND** logs only update on manual page navigation

#### Scenario: Persist refresh preference

- **WHEN** admin returns to logs page in new session
- **THEN** previously selected refresh interval is restored
- **AND** auto refresh resumes with saved setting

#### Scenario: Manual refresh available

- **WHEN** auto refresh is disabled or enabled
- **THEN** manual refresh button remains available
- **AND** clicking refreshes logs immediately
