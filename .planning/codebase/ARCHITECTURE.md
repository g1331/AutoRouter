# Architecture

**Analysis Date:** 2026-03-30

## Pattern Overview

**Overall:** Layered Next.js App Router monolith with co-located frontend routes, backend API routes, and shared domain services.

**Key Characteristics:**

- UI routing and backend HTTP entrypoints live together under `src/app`, with locale-aware pages in `src/app/[locale]` and API handlers in `src/app/api`.
- Request-heavy business rules are concentrated in `src/lib/services`, while route handlers such as `src/app/api/admin/keys/route.ts` and `src/app/api/admin/stats/timeseries/route.ts` stay thin and delegate to services.
- Shared contracts and adapters connect layers: `src/types/api.ts` defines request and response shapes, `src/lib/utils/api-transformers.ts` converts service objects to API payloads, and `src/lib/db/index.ts` plus `src/lib/db/schema.ts` hide PostgreSQL and SQLite differences.

## Layers

**App Shell And Routing Layer:**

- Purpose: Compose the HTML shell, locale providers, auth gate, and page-level layouts.
- Location: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/[locale]/layout.tsx`, `src/app/[locale]/page.tsx`, `src/app/[locale]/(auth)/login/page.tsx`, `src/app/[locale]/(dashboard)/layout.tsx`.
- Contains: Root HTML metadata, font loading, next-intl locale setup, theme and query providers, login screen, dashboard shell, and redirect pages.
- Depends on: `src/providers/auth-provider.tsx`, `src/providers/query-provider.tsx`, `src/providers/theme-provider.tsx`, `src/i18n/routing.ts`, `src/i18n/navigation.ts`, `src/components/**`.
- Used by: All UI routes rendered by Next.js.

**Client Feature Layer:**

- Purpose: Render dashboard pages and bridge UI events to authenticated admin APIs.
- Location: `src/app/[locale]/(dashboard)/**`, `src/components/admin/**`, `src/components/dashboard/**`, `src/hooks/*.ts`.
- Contains: Page components such as `src/app/[locale]/(dashboard)/dashboard/page.tsx`, reusable admin widgets such as `src/components/admin/keys-table.tsx`, chart components such as `src/components/dashboard/usage-chart.tsx`, and TanStack Query hooks such as `src/hooks/use-dashboard-stats.ts`.
- Depends on: `src/providers/auth-provider.tsx`, `src/lib/api.ts`, `src/lib/apiClient.ts`, `src/types/api.ts`, `src/messages/en.json`, `src/messages/zh-CN.json`.
- Used by: Locale routes under `src/app/[locale]/(dashboard)` and the login page in `src/app/[locale]/(auth)/login/page.tsx`.

**API Route Layer:**

- Purpose: Expose admin CRUD endpoints, health endpoints, mock replay endpoints, and the main proxy gateway.
- Location: `src/app/api/admin/**/route.ts`, `src/app/api/proxy/v1/[...path]/route.ts`, `src/app/api/health/route.ts`, `src/app/api/mock/[...path]/route.ts`.
- Contains: Auth checks, query param parsing, Zod request validation, service invocation, response shaping, SSE streaming endpoints, and development-only fixture replay.
- Depends on: `src/lib/utils/auth.ts`, `src/lib/utils/api-auth.ts`, `src/lib/utils/api-transformers.ts`, `src/lib/services/**`, `src/lib/db/index.ts`.
- Used by: Browser clients through `/api/admin/*`, external callers through `/api/proxy/v1/*`, probes through `/api/health`, and local replay tools through `/api/mock/*`.

**Domain Service Layer:**

- Purpose: Hold business rules for routing, failover, billing, key management, upstream management, health monitoring, logging, quota tracking, and fixture recording.
- Location: `src/lib/services/*.ts`.
- Contains: Proxy forwarding in `src/lib/services/proxy-client.ts`, upstream selection in `src/lib/services/load-balancer.ts`, model and path capability resolution in `src/lib/services/model-router.ts` and `src/lib/services/route-capability-matcher.ts`, API key lifecycle rules in `src/lib/services/key-manager.ts`, stats aggregation in `src/lib/services/stats-service.ts`, and live log fan-out in `src/lib/services/request-log-live-updates.ts`.
- Depends on: `src/lib/db/index.ts`, `src/lib/db/schema.ts`, `src/lib/utils/*.ts`, `src/lib/route-capabilities.ts`, `src/types/api.ts`.
- Used by: API routes under `src/app/api/**` and some client-only helpers through `src/lib/api.ts`.

**Persistence And Schema Layer:**

- Purpose: Provide typed database access and runtime schema switching.
- Location: `src/lib/db/index.ts`, `src/lib/db/schema.ts`, `src/lib/db/schema-pg.ts`, `src/lib/db/schema-sqlite.ts`, `drizzle/`, `drizzle-sqlite/`.
- Contains: Lazy `db` proxy creation, exported table symbols and inferred types, PostgreSQL migrations in `drizzle/*.sql`, and SQLite migrations in `drizzle-sqlite/*.sql`.
- Depends on: `src/lib/utils/config.ts`, Drizzle ORM, runtime environment variables.
- Used by: Nearly every service in `src/lib/services`, plus a few route handlers such as `src/app/api/admin/circuit-breakers/route.ts`.

**Shared Contract And Utility Layer:**

- Purpose: Centralize API contracts, auth helpers, configuration, logging, and transport-specific transformations.
- Location: `src/types/api.ts`, `src/lib/utils/*.ts`, `src/lib/route-capabilities.ts`, `src/i18n/*.ts`.
- Contains: Snake_case API DTO adapters in `src/lib/utils/api-transformers.ts`, admin and API key auth helpers in `src/lib/utils/auth.ts`, pagination and error helpers in `src/lib/utils/api-auth.ts`, environment parsing in `src/lib/utils/config.ts`, logger creation in `src/lib/utils/logger.ts`, and locale routing helpers in `src/i18n/routing.ts`.
- Depends on: Shared schema types, runtime config, and framework utilities.
- Used by: Both UI-facing and backend-facing layers.

## Data Flow

**Admin Console Request Flow:**

1. A page such as `src/app/[locale]/(dashboard)/dashboard/page.tsx` renders a client component and calls hooks such as `src/hooks/use-dashboard-stats.ts`.
2. The hook retrieves `apiClient` from `src/providers/auth-provider.tsx`, which reads `admin_token` from `sessionStorage` and injects `Authorization: Bearer ...` through `src/lib/api.ts`.
3. The browser calls an API route such as `src/app/api/admin/stats/timeseries/route.ts`, which validates the admin token through `src/lib/utils/auth.ts`, parses request input, and delegates to a service such as `src/lib/services/stats-service.ts`.
4. The service reads from `src/lib/db/index.ts` and `src/lib/db/schema.ts`, then the route converts service results to API DTOs with `src/lib/utils/api-transformers.ts` before returning JSON.

**Proxy Gateway Flow:**

1. External callers send OpenAI-compatible traffic to `src/app/api/proxy/v1/[...path]/route.ts`.
2. The route authenticates the caller with `extractApiKey` and `verifyApiKey` from `src/lib/utils/auth.ts`, loads API key and upstream authorization state from `src/lib/db/index.ts`, and determines path capability through `src/lib/services/route-capability-matcher.ts` plus `src/lib/route-capabilities.ts`.
3. Candidate upstreams are filtered and selected through `src/lib/services/load-balancer.ts`, which applies circuit breaker state, quotas, concurrency limits, session affinity, and weighted selection.
4. The chosen upstream request is executed through `src/lib/services/proxy-client.ts`; request lifecycle data is persisted through `src/lib/services/request-logger.ts` and `src/lib/services/billing-cost-service.ts`; the route returns either a normal response or streamed SSE payload.

**Live Log Update Flow:**

1. The admin UI subscribes to `src/app/api/admin/logs/live/route.ts`.
2. The route keeps an authenticated SSE stream open and registers a listener through `src/lib/services/request-log-live-updates.ts`.
3. Request-log mutations publish in-process events, and connected dashboards receive them as `request-log-changed` SSE events.

**State Management:**

- Server-rendered shell state comes from Next.js layouts in `src/app/layout.tsx` and `src/app/[locale]/layout.tsx`.
- Client auth state is stored in `sessionStorage` by `src/providers/auth-provider.tsx`.
- Client data caching and refetch rules are handled by TanStack Query in `src/providers/query-provider.tsx` and `src/hooks/*.ts`.
- UI preference state is local to the browser: sidebar collapse is stored by `src/app/[locale]/(dashboard)/layout.tsx` in `localStorage`, theme is stored by `src/providers/theme-provider.tsx`, and locale preference is stored by `src/i18n/routing.ts` through a locale cookie.

## Key Abstractions

**Upstream:**

- Purpose: Represent an external AI provider endpoint together with routing, quota, circuit breaker, and billing metadata.
- Examples: `src/lib/db/schema.ts`, `src/lib/services/upstream-crud.ts`, `src/lib/services/upstream-service.ts`, `src/app/api/admin/upstreams/route.ts`.
- Pattern: Persistence model in `src/lib/db/*`, CRUD and validation rules in `src/lib/services/upstream-crud.ts`, and a barrel facade in `src/lib/services/upstream-service.ts`.

**API Key:**

- Purpose: Represent admin-managed client credentials, allowed upstream bindings, expiration, and spending rules.
- Examples: `src/lib/services/key-manager.ts`, `src/app/api/admin/keys/route.ts`, `src/types/api.ts`.
- Pattern: Route handlers accept snake_case payloads, services normalize to camelCase domain objects, and auth helpers verify hashed key values.

**Route Capability:**

- Purpose: Express which protocol family or API surface an upstream can handle, and use that to construct routing pools.
- Examples: `src/lib/route-capabilities.ts`, `src/lib/services/route-capability-matcher.ts`, `src/app/api/proxy/v1/[...path]/route.ts`, `src/components/admin/route-capability-badges.tsx`.
- Pattern: Shared enum-like definitions drive proxy routing, admin validation, API types, and UI badges from one source.

**Request Log And Billing Snapshot:**

- Purpose: Capture request lifecycle, routing decision, token usage, timing, and cost attribution for later dashboards and diagnostics.
- Examples: `src/lib/services/request-logger.ts`, `src/lib/services/billing-cost-service.ts`, `src/lib/services/stats-service.ts`, `src/app/api/admin/logs/route.ts`.
- Pattern: Proxy writes normalized lifecycle records first, then services aggregate those records into overview, timeseries, leaderboard, and billing APIs.

**Session Affinity:**

- Purpose: Keep related requests on the same upstream and optionally migrate to a higher-priority upstream when thresholds allow.
- Examples: `src/lib/services/session-affinity.ts`, `src/lib/services/load-balancer.ts`, `src/app/api/proxy/v1/[...path]/route.ts`.
- Pattern: In-memory affinity state is consulted during upstream selection and updated after successful request handling.

## Entry Points

**Root HTML Shell:**

- Location: `src/app/layout.tsx`
- Triggers: Every page render.
- Responsibilities: Load fonts, set `<html lang>`, and wrap all routes with the root body shell.

**Locale Shell:**

- Location: `src/app/[locale]/layout.tsx`
- Triggers: Every locale-prefixed page render.
- Responsibilities: Validate locale, load translation messages, and provide theme, query, tooltip, auth, and toaster context.

**Dashboard Shell:**

- Location: `src/app/[locale]/(dashboard)/layout.tsx`
- Triggers: Every authenticated admin page under `src/app/[locale]/(dashboard)`.
- Responsibilities: Enforce client-side auth presence, render the sidebar, maintain sidebar collapse state, and provide mobile back navigation.

**Login Entry Point:**

- Location: `src/app/[locale]/(auth)/login/page.tsx`
- Triggers: Navigating to `/login` or locale-prefixed login routes.
- Responsibilities: Collect the admin token, perform a probe request through `src/lib/api.ts`, persist auth state, and redirect into the dashboard.

**Admin API Surface:**

- Location: `src/app/api/admin/**/route.ts`
- Triggers: Browser or automation calls to `/api/admin/*`.
- Responsibilities: Authenticate the admin token, validate payloads, call domain services, and return transformed JSON or SSE responses.

**Proxy Gateway:**

- Location: `src/app/api/proxy/v1/[...path]/route.ts`
- Triggers: External AI-client traffic to `/api/proxy/v1/*`.
- Responsibilities: Authenticate API keys, resolve route capability and upstream, forward the request, handle failover, log request lifecycle, and persist billing snapshots.

**Operational Endpoints:**

- Location: `src/app/api/health/route.ts` and `src/app/api/mock/[...path]/route.ts`
- Triggers: Health checks, smoke tests, and local replay workflows.
- Responsibilities: Serve lightweight health metadata and replay recorded fixtures outside production.

## Error Handling

**Strategy:** Route handlers return structured HTTP responses close to the edge, while services throw typed errors that encode domain failure states.

**Patterns:**

- Admin routes such as `src/app/api/admin/keys/route.ts` and `src/app/api/admin/upstreams/route.ts` use `validateAdminAuth`, `errorResponse`, Zod parsing, and `createLogger` for consistent validation and logging.
- Proxy failures are normalized inside `src/app/api/proxy/v1/[...path]/route.ts` with helpers from `src/lib/services/unified-error.ts`, while failover context and routing diagnostics are preserved in request logs.
- Client-side request failures are wrapped by `ApiError` and `UnauthorizedError` in `src/lib/api.ts`, and `src/providers/auth-provider.tsx` clears auth state on 401 responses.

## Cross-Cutting Concerns

**Logging:** `src/lib/utils/logger.ts` creates scoped loggers used in API routes and services such as `src/app/api/admin/keys/route.ts`, `src/app/api/admin/logs/live/route.ts`, `src/lib/services/key-manager.ts`, and `src/app/api/proxy/v1/[...path]/route.ts`.

**Validation:** Request validation is performed at the route boundary with Zod in files such as `src/app/api/admin/keys/route.ts` and `src/app/api/admin/upstreams/route.ts`; shared normalization logic then continues in service modules such as `src/lib/services/key-manager.ts` and `src/lib/services/spending-rules.ts`.

**Authentication:** Admin UI access is stored client-side by `src/providers/auth-provider.tsx`, every admin endpoint re-checks the bearer token through `src/lib/utils/auth.ts`, and proxy callers are verified with hashed API keys before upstream routing begins in `src/app/api/proxy/v1/[...path]/route.ts`.

---

_Architecture analysis: 2026-03-30_
