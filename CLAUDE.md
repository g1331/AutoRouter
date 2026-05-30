# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AutoRouter is an AI API Gateway providing API Key distribution, multi-upstream routing, and request management. It is a Next.js 16 (App Router) fullstack application: the frontend is an internationalized admin dashboard, and the backend lives in Next.js API Routes. An OpenAI/Anthropic-compatible proxy under `/api/proxy/v1/*` fans incoming traffic out to configured upstreams using capability-based routing, load balancing, circuit breaking, quota/concurrency control, failover, session affinity, and per-request billing.

## Development Commands

```bash
# Install dependencies
pnpm install

# Run development server (resets the Next dev cache first, then starts next dev on port 3000)
pnpm dev

# Build / start production
pnpm build
pnpm start

# Database — PostgreSQL (default dialect)
pnpm db:generate          # Generate migrations from schema changes
pnpm db:migrate           # Apply migrations
pnpm db:push              # Push schema directly (development)
pnpm db:studio            # Open Drizzle Studio
pnpm db:check:consistency # Verify schema/migration artifacts are in sync (CI gate)

# Database — SQLite (local dev sandbox)
pnpm db:generate:sqlite   # Generate SQLite migrations (drizzle-sqlite.config.ts)
pnpm db:migrate:sqlite    # Apply SQLite migrations
pnpm db:seed              # Seed a local SQLite database (scripts/seed-lite.ts)

# Linting, formatting, types
pnpm lint                 # ESLint
pnpm format               # Prettier write
pnpm format:check         # Prettier check
pnpm exec tsc --noEmit    # Type checking

# Unit / component tests (Vitest, jsdom)
pnpm test                 # Watch mode
pnpm test:run             # Run once
pnpm test:run --coverage  # With coverage
pnpm test:run tests/unit/<file>.test.ts        # Single test file
pnpm test:run -t "<test name>"                 # Single test by name

# End-to-end tests (Playwright; spins up SQLite + dev server automatically)
pnpm e2e
pnpm e2e:headed
pnpm e2e tests/e2e/<file>.spec.ts              # Single E2E spec

# Proxy stability smoke check (CI gate)
pnpm test:proxy-stability

# Documentation site (VitePress)
pnpm docs:dev
pnpm docs:build
```

## Architecture

### Project Structure

```
src/
├── app/
│   ├── api/                 # Next.js API Routes (backend)
│   │   ├── admin/           # Admin API (Bearer ADMIN_TOKEN), one folder per domain:
│   │   │   ├── keys/        #   API key management (+ /reveal)
│   │   │   ├── upstreams/   #   Upstream CRUD, health, probes, quota, catalog, failure-rules
│   │   │   ├── circuit-breakers/   # Force open/close
│   │   │   ├── billing/     #   Prices, overrides, tier-rules, multipliers, overview, recent
│   │   │   ├── cliproxy/    #   CLIProxyAPI instances, auth accounts, OAuth login, pool
│   │   │   ├── background-sync/     # Scheduled background tasks + manual run
│   │   │   ├── traffic-recording(s)/  # Recorder settings + recorded fixtures
│   │   │   ├── compensation-rules/ # Header compensation rules
│   │   │   ├── stats/       #   overview / timeseries / leaderboard / live
│   │   │   └── logs/        #   Request logs (+ /live SSE)
│   │   ├── proxy/v1/[...path]/  # AI proxy entry point (catch-all)
│   │   ├── mock/[...path]/  # Replays recorded fixtures (non-production)
│   │   └── health/          # Health check
│   ├── [locale]/            # Internationalized routes (next-intl: en, zh-CN)
│   │   ├── (auth)/          # Login page (route group)
│   │   └── (dashboard)/     # dashboard, keys, upstreams, logs, settings, system
│   └── layout.tsx           # Root layout with providers
├── components/              # admin/, dashboard/, logs/, ui/ (shadcn/ui based)
├── hooks/                   # TanStack Query hooks (use-upstreams, use-billing, use-live-pulse, …)
├── lib/
│   ├── db/                  # Drizzle ORM
│   │   ├── schema.ts        # Dialect dispatcher (re-exports pg or sqlite tables/types)
│   │   ├── schema-pg.ts     # PostgreSQL table definitions
│   │   ├── schema-sqlite.ts # SQLite table definitions (mirror of pg)
│   │   └── index.ts         # Lazy dialect-aware client (Proxy-wrapped `db`)
│   ├── services/            # Business logic (see below)
│   ├── route-capabilities.ts    # Capability detection from request path/model
│   └── utils/               # auth.ts, encryption.ts (Fernet), config.ts, logger.ts, api-auth.ts, …
├── i18n/                    # next-intl configuration
├── messages/                # Translation JSON (en, zh)
├── providers/               # React context providers
└── types/                   # TypeScript type definitions

tests/                       # unit/ + components/ (Vitest), e2e/ (Playwright),
                             # a11y/, visual/, fixtures/ (recorded traffic), setup.ts
openspec/                    # OpenSpec change-management workspace (changes/, specs/)
scripts/                     # ci/, db/, dev/ helper scripts
docs/                        # VitePress documentation site
```

### Key Architectural Patterns

1. **Dual-dialect database**: Drizzle ORM with PostgreSQL (default, production) and SQLite (local dev sandbox). `config.dbType` selects the dialect; when unset it auto-detects `postgres` if `DATABASE_URL` exists, otherwise `sqlite`. `schema.ts` dispatches to `schema-pg.ts` or `schema-sqlite.ts` at import time, but **all business code is written against the PostgreSQL types** — the SQLite drizzle instance is treated as structurally compatible at runtime. Raw SQL via `db.execute()` may use PG-specific syntax (e.g. `PERCENTILE_CONT`) that does not run on SQLite. Production fails fast rather than silently falling back to SQLite.

2. **Security model**:
   - Admin authentication: Bearer token (`ADMIN_TOKEN`) on all `/api/admin/*` routes.
   - Client API keys: hashed with bcrypt, verified on proxy requests, scoped to authorized upstreams and expiry.
   - Upstream keys: encrypted at rest with Fernet (`ENCRYPTION_KEY`, 44-char base64).
   - SSRF protection (`upstream-ssrf-validator.ts`): blocks private/loopback/metadata addresses and validates DNS resolution when registering upstreams.

3. **Proxy flow** (`/api/proxy/v1/[...path]` → `proxy-client.ts`): verify client API key → detect route capability from path/model and resolve provider → build the candidate upstream set (capability match, key authorization, `model_redirects`, priority, weight, health, circuit-breaker state) → load-balance and acquire concurrency/queue admission → forward with SSE streaming support → record success/failure, token usage, and a billing snapshot → return the response or stream. Session affinity can pin a conversation to a previously selected upstream.

4. **Failover & circuit breaker**: Circuit breaker is a CLOSED / OPEN / HALF_OPEN state machine per upstream. On timeout or 5xx errors the proxy fails over to the next available candidate and logs each attempt with error type and timestamp. Background health checks mark upstreams healthy/unhealthy; admin endpoints can force a breaker open or closed. Upstream-specific failure rules and compensation rules further shape retry/header behavior.

5. **Billing**: Per-request cost is computed from synced model prices, manual overrides, tier rules, and per-upstream multipliers, then persisted as a request billing snapshot. Prices are kept current by a background sync task.

6. **Background sync**: A registry/scheduler runs recurring jobs (billing price sync, upstream model catalog sync, traffic-recording cleanup). Tasks are listed and can be triggered manually from the admin API.

7. **Traffic recording**: When enabled (`RECORDER_ENABLED`), requests are recorded as fixtures and can be replayed through `/api/mock/*` in non-production environments. Mode and redaction are configurable; the recorder is also the source of the `tests/fixtures/` corpus.

8. **CLIProxyAPI integration** (`cliproxy-*` services): AutoRouter can manage an external/sidecar CLIProxyAPI instance — registering instances, syncing auth accounts, and driving OAuth login flows for Codex / Claude / Gemini upstreams.

## Configuration

Environment variables are validated through a Zod schema in `src/lib/utils/config.ts`. Copy `.env.example` to `.env` (Docker/deploy) or `.env.local` (local dev).

```env
# Required (runtime)
DATABASE_URL=postgresql://user:password@host:5432/autorouter  # when using PostgreSQL
ENCRYPTION_KEY=<base64-32-bytes>   # Generate: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
ADMIN_TOKEN=<admin-token>          # Admin API authentication

# Database dialect
DB_TYPE=postgres                   # "postgres" | "sqlite"; auto-detected from DATABASE_URL when unset
SQLITE_DB_PATH=./data/dev.sqlite   # only used when DB_TYPE=sqlite

# Optional
ALLOW_KEY_REVEAL=false             # Allow revealing API keys via Admin API
LOG_RETENTION_DAYS=90              # Request log retention
LOG_LEVEL=info                     # fatal|error|warn|info|debug|trace
CORS_ORIGINS=http://localhost:3000
PORT=3000                          # In-app port (docker-compose maps host 3331 → container 3000)

# Traffic recorder
RECORDER_ENABLED=true              # docker-compose / deploy enable it; code default is off
RECORDER_MODE=all                  # all | success | failure
RECORDER_FIXTURES_DIR=tests/fixtures
RECORDER_REDACT_SENSITIVE=true

# CLIProxyAPI sidecar (optional) — see .env.example for the full CLIPROXY_* block
```

The default in-app port is **3000**; the production `docker-compose.yml` maps host port **3331** to container `3000`.

## Docker Deployment

```bash
# Production compose (PostgreSQL service + app)
docker compose up -d            # serves on host port 3331 by default

# Optional CLIProxyAPI sidecar overlay
docker compose -f docker-compose.yml -f docker-compose.cliproxy.yml up -d
```

## Code Quality & CI

`pnpm lint`, `pnpm format:check`, and `pnpm exec tsc --noEmit` are the local quality gates and are mirrored in the `verify.yml` GitHub Actions workflow, which runs on every PR to `master`:

| Job                   | What it runs                                                                      |
| --------------------- | --------------------------------------------------------------------------------- |
| Quality               | ESLint, Prettier check, `tsc --noEmit`, Vitest unit/component tests with coverage |
| Production Build      | `pnpm build` (with `DB_TYPE=postgres`)                                            |
| Migration Consistency | `pnpm db:check:consistency`, then `pnpm db:migrate` twice (idempotency)           |
| Proxy Stability       | `pnpm test:proxy-stability` against a live PostgreSQL                             |
| Playwright E2E        | `pnpm e2e` (Chromium)                                                             |
| GitHub Actions        | `actionlint` on workflow files                                                    |

Commits go through `.pre-commit-config.yaml` (prettier, eslint `--fix`, `tsc --noEmit`, plus generic file hooks). Do not bypass pre-commit when committing.

## Working Conventions

- **OpenSpec**: substantive changes are tracked under `openspec/`. Use the OpenSpec workflow (proposal → tasks → implementation → archive) for feature work. Code-touching tasks must include tests, and code should be committed at the end of each task phase.
- **Language**: issues, commit messages, and assistant replies default to Simplified Chinese; identifiers, CLI commands, logs, and error messages stay in their original language.
- **Destructive operations**: deleting database files, clearing data, or resetting state requires explicit user confirmation before execution.

## Common Development Tasks

### Adding a New Admin API Endpoint

1. Create the route in `src/app/api/admin/{domain}/route.ts` (guard with the admin Bearer token).
2. Put business logic in `src/lib/services/`; reuse existing service modules where the domain already exists.
3. If the data model changes, update `schema-pg.ts` and `schema-sqlite.ts` together, then `pnpm db:generate` (and `pnpm db:generate:sqlite`).
4. Add tests under `tests/unit/` or `tests/components/`.

### Adding a New Frontend Page

1. Create the route under `src/app/[locale]/(dashboard)/`.
2. Add translations to `src/messages/{en,zh}.json` for both locales.
3. Build components under `src/components/` (reuse `ui/` primitives).
4. Add data hooks using the TanStack Query patterns in `src/hooks/`.
