# External Integrations

**Analysis Date:** 2026-03-30

## APIs & External Services

**AI Provider Upstreams:**

- OpenAI-compatible, Anthropic, Google Gemini, and custom provider endpoints are proxied through `src/app/api/proxy/v1/[...path]/route.ts`.
  - SDK/Client: native `fetch` and SSE handling in `src/lib/services/proxy-client.ts`, with capability-to-provider mapping in `src/lib/route-capabilities.ts` and path matching in `src/lib/services/route-capability-matcher.ts`.
  - Auth: per-upstream API keys are stored in the database and encrypted by `src/lib/utils/encryption.ts`; outbound auth headers are injected in `src/lib/services/proxy-client.ts` as `Authorization`, `x-api-key`, or `x-goog-api-key`.
- Upstream connection testing is exposed by `src/app/api/admin/upstreams/test/route.ts` and implemented in `src/lib/services/upstream-connection-tester.ts`.
  - SDK/Client: native `fetch` to `{baseUrl}/v1/models`.
  - Auth: admin caller uses `ADMIN_TOKEN` through `src/lib/utils/auth.ts`; provider credentials are supplied in the request body and are not persisted by the test endpoint.

**Pricing Catalog Sync:**

- LiteLLM pricing metadata is synchronized from `https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json` by `src/lib/services/billing-price-service.ts`, and the sync is triggered by `src/app/api/admin/billing/prices/sync/route.ts`.
  - SDK/Client: native `fetch`.
  - Auth: none.

**Container Registry and Release Infrastructure:**

- GitHub Container Registry publishes `ghcr.io/g1331/autorouter`, which is consumed by `docker-compose.yml` through `AUTOROUTER_IMAGE`.
  - SDK/Client: Docker-related GitHub Actions in `.github/workflows/release.yml`.
  - Auth: `secrets.GITHUB_TOKEN`.

**Coverage Reporting and Manual Deployment:**

- Codecov receives coverage and test-result uploads from `.github/workflows/verify.yml`.
  - SDK/Client: `codecov/codecov-action@v5` and `codecov/test-results-action@v1`.
  - Auth: `CODECOV_TOKEN`.
- Personal server deployment is executed from `.github/workflows/deploy-personal.yml`.
  - SDK/Client: `appleboy/ssh-action@v1.2.5`, remote `curl`, and remote `docker compose`.
  - Auth: `SERVER_HOST`, `SERVER_USER`, `SSH_PRIVATE_KEY`, optional `SERVER_PORT`, optional `DEPLOY_DIR`, and `ADMIN_TOKEN`.

**Remote Static Assets:**

- Google static hosting is used for Gemini-related artwork referenced in `src/components/admin/route-capability-badges.tsx`, and the host allowlist is configured in `next.config.ts`.
  - SDK/Client: Next.js remote image loading.
  - Auth: none.

## Data Storage

**Databases:**

- PostgreSQL 16 is the primary runtime database.
  - Connection: `DATABASE_URL`, validated in `src/lib/utils/config.ts`, consumed by `src/lib/db/index.ts`, `drizzle.config.ts`, `scripts/docker-entrypoint.sh`, `docker-compose.yml`, and `.github/workflows/verify.yml`.
  - Client: `drizzle-orm` plus `postgres`.
- SQLite is the local and sandbox alternative.
  - Connection: `DB_TYPE=sqlite` plus `SQLITE_DB_PATH`, resolved in `src/lib/utils/config.ts`, `src/lib/db/index.ts`, and `drizzle-sqlite.config.ts`.
  - Client: `drizzle-orm/libsql` plus `@libsql/client`.

**File Storage:**

- Local filesystem only.
  - Traffic fixtures are written under `tests/fixtures/` by `src/lib/services/traffic-recorder.ts`.
  - Containerized runtime mounts `/app/data` in `docker-compose.yml`.
  - Local SQLite defaults to `./data/dev.sqlite` in `src/lib/utils/config.ts`.

**Caching:**

- None as an external service.
  - In-process state is used for live log subscriptions and session affinity in `src/lib/services/request-log-live-updates.ts` and `src/lib/services/session-affinity.ts`.

## Authentication & Identity

**Auth Provider:**

- Custom.
  - Implementation: admin routes validate `Bearer` credentials against `ADMIN_TOKEN` through `src/lib/utils/auth.ts` and `src/lib/utils/config.ts`; client gateway access uses bcrypt-hashed API keys in `src/lib/utils/auth.ts`; upstream provider secrets are encrypted at rest with the Fernet-compatible implementation in `src/lib/utils/encryption.ts`.

## Monitoring & Observability

**Error Tracking:**

- None detected.

**Logs:**

- Structured runtime logs use `pino` in `src/lib/utils/logger.ts`.
- Request audit records are persisted through `src/lib/services/request-logger.ts` and served by `src/app/api/admin/logs/route.ts`.
- Live log streaming uses SSE from `src/app/api/admin/logs/live/route.ts`.
- Health monitoring is exposed by `src/app/api/health/route.ts`, `src/app/api/admin/health/route.ts`, and `src/app/api/admin/upstreams/health/route.ts`; the container healthcheck in `docker-compose.yml` probes `/api/health`.

## CI/CD & Deployment

**Hosting:**

- Standalone Next.js Node container produced by `Dockerfile`.
- Default production topology in `docker-compose.yml` runs `autorouter` with `postgres:16-alpine`.
- Local source-build topology in `docker-compose.yaml` builds from the checked-out repository instead of pulling a released image.

**CI Pipeline:**

- `.github/workflows/verify.yml` runs linting, formatting, TypeScript checking, Vitest coverage, migration consistency, Playwright E2E, Codecov upload, and actionlint.
- `.github/workflows/release.yml` validates release tags, builds the application, pushes a GHCR image, generates release metadata, and creates a GitHub Release.
- `.github/workflows/deploy-personal.yml` resolves a released image, downloads `docker-compose.yml` from GitHub, writes or updates the remote server `.env`, deploys over SSH, and verifies `/api/health` plus `/api/admin/health`.

## Environment Configuration

**Required env vars:**

- Core runtime: `DATABASE_URL` or `DB_TYPE=sqlite` plus `SQLITE_DB_PATH`, `ENCRYPTION_KEY` or `ENCRYPTION_KEY_FILE`, `ADMIN_TOKEN`, and `PORT`.
- Operational toggles: `ALLOW_KEY_REVEAL`, `LOG_RETENTION_DAYS`, `LOG_LEVEL`, `DEBUG_LOG_HEADERS`, `HEALTH_CHECK_INTERVAL`, `HEALTH_CHECK_TIMEOUT`, and `CORS_ORIGINS`.
- Traffic recorder: `RECORDER_ENABLED`, `RECORDER_MODE`, `RECORDER_FIXTURES_DIR`, and `RECORDER_REDACT_SENSITIVE`.
- CI and deployment secrets: `CODECOV_TOKEN`, `SERVER_HOST`, `SERVER_USER`, `SSH_PRIVATE_KEY`, optional `SERVER_PORT`, and optional `DEPLOY_DIR`.
- Build-time versioning: `NEXT_PUBLIC_APP_VERSION`, injected in `next.config.ts` and read by `src/lib/app-version.ts`.

**Secrets location:**

- Local and server runtime secrets are expected in repo-root `.env`, `.env.local`, and `.env.test` files or equivalent environment injection. These files are present in the repository root, and their contents were not read.
- GitHub Actions secrets are referenced by `.github/workflows/verify.yml`, `.github/workflows/release.yml`, and `.github/workflows/deploy-personal.yml`.
- Remote deployment secrets are materialized into the server-side `.env` by `.github/workflows/deploy-personal.yml`.

## Webhooks & Callbacks

**Incoming:**

- None detected.
- External callers interact with standard HTTP APIs in `src/app/api/proxy/v1/[...path]/route.ts`, `src/app/api/admin/**/route.ts`, `src/app/api/health/route.ts`, and the mock route `src/app/api/mock/[...path]/route.ts`; there is no webhook receiver or callback signature verifier in the repository.

**Outgoing:**

- None detected.
- Streaming responses use SSE in `src/app/api/proxy/v1/[...path]/route.ts` and `src/app/api/admin/logs/live/route.ts`, which are client-facing streams rather than outbound webhook deliveries.

---

_Integration audit: 2026-03-30_
