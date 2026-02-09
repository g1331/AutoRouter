# Request Logs Capability

## ADDED Requirements

### Requirement: Request Logs Query API

The system SHALL provide an admin API endpoint to query request logs with pagination and filtering.

#### Scenario: List all logs with pagination

- **WHEN** admin requests `GET /admin/logs?page=1&page_size=20` with valid admin token
- **THEN** system returns paginated list of request logs
- **AND** response includes total count, current page, and total pages
- **AND** logs are ordered by created_at descending (newest first)

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

The admin console SHALL provide a dedicated page to view request logs.

#### Scenario: View logs table

- **WHEN** admin navigates to `/logs` page
- **THEN** system displays a table with columns: Time, API Key (prefix), Upstream, Model, Tokens (prompt/completion/total), Status, Duration
- **AND** table follows Cassette Futurism design style
- **AND** status codes are color-coded (2xx green, 4xx/5xx red)

#### Scenario: Paginate through logs

- **WHEN** logs exceed page size
- **THEN** pagination controls are displayed
- **AND** admin can navigate between pages

#### Scenario: Navigate to logs from sidebar

- **WHEN** admin views any dashboard page
- **THEN** sidebar includes "Logs" navigation item
- **AND** clicking navigates to `/logs` page

### Requirement: Request Logs I18n

The logs UI SHALL support internationalization.

#### Scenario: English locale

- **WHEN** locale is `en`
- **THEN** logs page displays English labels (e.g., "Request Logs", "Tokens", "Duration")

#### Scenario: Chinese locale

- **WHEN** locale is `zh`
- **THEN** logs page displays Chinese labels
