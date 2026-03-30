# Codebase Structure

**Analysis Date:** 2026-03-30

## Directory Layout

```text
AutoRouter/
├── src/                    # Application code for Next.js pages, API routes, services, utilities, and types
├── tests/                  # Unit, component, accessibility, visual, fixture, and end-to-end tests
├── drizzle/                # PostgreSQL migration SQL and Drizzle metadata snapshots
├── drizzle-sqlite/         # SQLite migration SQL and Drizzle metadata snapshots
├── scripts/                # Utility scripts such as seeding and CI consistency checks
├── docs/                   # Product-facing documentation and README image assets
├── openspec/               # Change proposals, archived designs, and current specifications
├── public/                 # Static assets served by Next.js
├── next.config.ts          # Next.js and next-intl integration config
├── drizzle.config.ts       # PostgreSQL Drizzle config
├── drizzle-sqlite.config.ts # SQLite Drizzle config
├── vitest.config.ts        # Vitest config for unit and component tests
└── playwright.e2e.config.ts # Playwright end-to-end test config
```

## Directory Purposes

**`src/app`:**

- Purpose: Hold all Next.js App Router entrypoints for pages, layouts, and API routes.
- Contains: `page.tsx`, `layout.tsx`, locale route groups such as `src/app/[locale]/(auth)` and `src/app/[locale]/(dashboard)`, plus API endpoints under `src/app/api`.
- Key files: `src/app/layout.tsx`, `src/app/[locale]/layout.tsx`, `src/app/[locale]/(dashboard)/layout.tsx`, `src/app/api/proxy/v1/[...path]/route.ts`.

**`src/components`:**

- Purpose: Hold reusable React view components.
- Contains: Admin console widgets in `src/components/admin`, dashboard-specific charts and sections in `src/components/dashboard`, shared log helpers in `src/components/logs`, and primitive UI building blocks in `src/components/ui`.
- Key files: `src/components/admin/sidebar.tsx`, `src/components/admin/keys-table.tsx`, `src/components/dashboard/usage-chart.tsx`, `src/components/ui/button.tsx`.

**`src/hooks`:**

- Purpose: Hold client-side data-fetching and subscription hooks.
- Contains: TanStack Query hooks and live update hooks for admin features.
- Key files: `src/hooks/use-dashboard-stats.ts`, `src/hooks/use-api-keys.ts`, `src/hooks/use-request-log-live.ts`, `src/hooks/use-upstreams.ts`.

**`src/lib`:**

- Purpose: Hold transport-agnostic business logic, database access, shared helpers, and client transport wrappers.
- Contains: Database modules in `src/lib/db`, service modules in `src/lib/services`, utility modules in `src/lib/utils`, shared API clients in `src/lib/api.ts` and `src/lib/apiClient.ts`, and capability definitions in `src/lib/route-capabilities.ts`.
- Key files: `src/lib/db/index.ts`, `src/lib/services/load-balancer.ts`, `src/lib/services/key-manager.ts`, `src/lib/utils/api-transformers.ts`.

**`src/providers`:**

- Purpose: Hold React context providers used by the locale shell.
- Contains: Auth, query-cache, and theme providers.
- Key files: `src/providers/auth-provider.tsx`, `src/providers/query-provider.tsx`, `src/providers/theme-provider.tsx`.

**`src/i18n`:**

- Purpose: Hold locale configuration and next-intl integration.
- Contains: Locale constants, routing rules, request helpers, and navigation helpers.
- Key files: `src/i18n/config.ts`, `src/i18n/routing.ts`, `src/i18n/navigation.ts`, `src/i18n/request.ts`.

**`src/messages`:**

- Purpose: Hold translation dictionaries.
- Contains: Locale JSON message bundles used by `next-intl`.
- Key files: `src/messages/en.json`, `src/messages/zh-CN.json`.

**`src/types`:**

- Purpose: Hold shared API-facing TypeScript contracts.
- Contains: A single API contract module that mirrors backend response shapes.
- Key files: `src/types/api.ts`.

**`tests`:**

- Purpose: Hold automated verification across layers.
- Contains: Unit tests in `tests/unit`, React component tests in `tests/components`, E2E flows in `tests/e2e`, accessibility checks in `tests/a11y`, visual checks in `tests/visual`, and replay fixtures in `tests/fixtures`.
- Key files: `tests/unit/api/proxy/route.test.ts`, `tests/unit/services/load-balancer.test.ts`, `tests/components/dashboard-layout.test.tsx`, `tests/e2e/logs-routing-decision.spec.ts`.

**`drizzle` and `drizzle-sqlite`:**

- Purpose: Hold generated SQL migrations and schema snapshots for both supported databases.
- Contains: Sequential `.sql` migrations and `meta/*_snapshot.json`.
- Key files: `drizzle/0025_flat_hawkeye.sql`, `drizzle/meta/_journal.json`, `drizzle-sqlite/0003_medical_rattler.sql`, `drizzle-sqlite/meta/_journal.json`.

**`scripts`:**

- Purpose: Hold operational helpers that sit outside runtime application code.
- Contains: Seed scripts, container entrypoint scripts, and CI consistency checks.
- Key files: `scripts/seed-lite.ts`, `scripts/docker-entrypoint.sh`, `scripts/ci/check-drizzle-consistency.mjs`.

**`docs`:**

- Purpose: Hold hand-written documentation and README assets.
- Contains: Operational docs and screenshots referenced by the README.
- Key files: `docs/circuit-breaker.md`, `docs/images/banner.svg`.

**`openspec`:**

- Purpose: Hold current specifications, active changes, and archived design history.
- Contains: Top-level project metadata, active change folders, archived change folders, and current spec folders.
- Key files: `openspec/project.md`, `openspec/config.yaml`, `openspec/changes/request-log-live-status/design.md`, `openspec/specs/path-based-routing/spec.md`.

## Key File Locations

**Entry Points:**

- `src/app/layout.tsx`: Root HTML shell and global fonts.
- `src/app/page.tsx`: Root redirect to `/login`.
- `src/app/[locale]/layout.tsx`: Locale-aware provider composition and translation loading.
- `src/app/[locale]/(auth)/login/page.tsx`: Admin login screen.
- `src/app/[locale]/(dashboard)/layout.tsx`: Auth-gated dashboard shell.
- `src/app/api/proxy/v1/[...path]/route.ts`: Main external gateway entrypoint.
- `src/app/api/admin/logs/live/route.ts`: Admin SSE stream for live request log updates.

**Configuration:**

- `next.config.ts`: Next.js build mode and next-intl plugin setup.
- `tsconfig.json`: TypeScript project config.
- `eslint.config.mjs`: ESLint rules.
- `vitest.config.ts`: Vitest runtime and include patterns.
- `playwright.e2e.config.ts`: Playwright browser test config.
- `drizzle.config.ts`: PostgreSQL Drizzle migration config.
- `drizzle-sqlite.config.ts`: SQLite Drizzle migration config.

**Core Logic:**

- `src/lib/services/load-balancer.ts`: Priority, circuit breaker, quota, concurrency, and affinity-aware upstream selection.
- `src/lib/services/model-router.ts`: Model-prefix routing helpers and redirect logic.
- `src/lib/services/route-capability-matcher.ts`: Path and protocol capability matching for proxy traffic.
- `src/lib/services/proxy-client.ts`: Upstream HTTP forwarding and stream handling.
- `src/lib/services/request-logger.ts`: Request lifecycle persistence.
- `src/lib/services/stats-service.ts`: Dashboard aggregations and leaderboard queries.
- `src/lib/services/key-manager.ts`: API key lifecycle rules.
- `src/lib/db/index.ts`: Lazy database creation and exported `db` proxy.

**Testing:**

- `tests/setup.ts`: Shared test setup.
- `tests/unit/api/admin`: Unit tests for admin API routes.
- `tests/unit/api/proxy`: Unit tests for proxy behavior.
- `tests/unit/services`: Unit tests for business services.
- `tests/components`: React component tests.
- `tests/e2e`: Browser flows.
- `tests/fixtures`: Recorded fixture payloads for replay and mock routing.

## Naming Conventions

**Files:**

- Next.js route files use framework names: `page.tsx`, `layout.tsx`, and `route.ts`, as seen in `src/app/[locale]/(dashboard)/dashboard/page.tsx` and `src/app/api/admin/keys/route.ts`.
- Service and utility modules use lowercase kebab-case domain names, such as `src/lib/services/load-balancer.ts`, `src/lib/services/request-log-live-updates.ts`, and `src/lib/utils/api-transformers.ts`.
- React hooks use the `use-*.ts` or `use-*.tsx` pattern, such as `src/hooks/use-dashboard-stats.ts` and `src/hooks/use-request-logs.ts`.
- Test files use `.test.ts`, `.test.tsx`, or `.spec.ts`, such as `tests/unit/services/stats-service.test.ts` and `tests/e2e/billing-tier-flow.spec.ts`.

**Directories:**

- Route segments follow Next.js App Router conventions, including dynamic segments such as `src/app/[locale]` and route groups such as `src/app/[locale]/(dashboard)`.
- Feature areas are grouped by noun under both UI and API trees, such as `src/app/api/admin/keys`, `src/app/api/admin/upstreams`, `src/components/admin`, and `src/components/dashboard`.

## Where to Add New Code

**New Feature:**

- Primary code: Add the page entry under `src/app/[locale]/(dashboard)/<feature>/page.tsx` for dashboard-visible features, or under `src/app/api/admin/<feature>/route.ts` for backend-only admin endpoints.
- Supporting client code: Put query hooks in `src/hooks/use-<feature>.ts`, feature widgets in `src/components/admin` or `src/components/dashboard`, and shared DTO additions in `src/types/api.ts`.
- Business rules: Put service logic in `src/lib/services/<feature>.ts`, and reuse `src/lib/utils/api-transformers.ts` when the route needs snake_case API output.
- Tests: Put route tests under `tests/unit/api/admin/<feature>`, service tests under `tests/unit/services/<feature>.test.ts`, and UI tests under `tests/components`.

**New Component/Module:**

- Admin management interfaces: `src/components/admin`.
- Dashboard analytics and charting pieces: `src/components/dashboard`.
- Reusable low-level controls: `src/components/ui`.
- Shared browser state or data subscriptions: `src/hooks`.
- Shared provider-level behavior: `src/providers`.

**Utilities:**

- Shared helpers: `src/lib/utils`.
- Shared request or response types: `src/types/api.ts`.
- Shared route capability constants and helpers: `src/lib/route-capabilities.ts`.
- Shared database entities or relation exports: `src/lib/db/schema.ts`, with database-specific definitions in `src/lib/db/schema-pg.ts` and `src/lib/db/schema-sqlite.ts`.

## Special Directories

**`drizzle`:**

- Purpose: PostgreSQL migration history used by Drizzle tooling and runtime deployments.
- Generated: Yes.
- Committed: Yes.

**`drizzle-sqlite`:**

- Purpose: SQLite migration history for local development mode.
- Generated: Yes.
- Committed: Yes.

**`tests/fixtures`:**

- Purpose: Recorded provider responses used by replay and mock routes such as `src/app/api/mock/[...path]/route.ts`.
- Generated: Mixed; fixtures can be produced by `src/lib/services/traffic-recorder.ts`.
- Committed: Yes.

**`openspec`:**

- Purpose: Specification and design history that sits alongside implementation.
- Generated: No.
- Committed: Yes.

**`docs/images`:**

- Purpose: Screenshot and banner assets referenced by `README.md`.
- Generated: No.
- Committed: Yes.

---

_Structure analysis: 2026-03-30_
