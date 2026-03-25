<div align="center">

<!-- Hero Banner -->
<img src="docs/images/banner.svg" alt="AutoRouter Banner" width="100%">

<h3>AI API Gateway</h3>
<p>An AI API Gateway for multi-upstream routing and operations</p>

<!-- Badges: Status -->

[![Verify](https://github.com/g1331/AutoRouter/actions/workflows/verify.yml/badge.svg)](https://github.com/g1331/AutoRouter/actions/workflows/verify.yml)
[![Release](https://github.com/g1331/AutoRouter/actions/workflows/release.yml/badge.svg)](https://github.com/g1331/AutoRouter/actions/workflows/release.yml)
[![codecov](https://codecov.io/gh/g1331/AutoRouter/graph/badge.svg)](https://codecov.io/gh/g1331/AutoRouter)

<!-- Badges: Tech -->

[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)

<!-- Badges: Community -->

[![License](https://img.shields.io/github/license/g1331/AutoRouter?color=blue)](LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/g1331/AutoRouter?style=flat&logo=github)](https://github.com/g1331/AutoRouter/stargazers)
[![GitHub Issues](https://img.shields.io/github/issues/g1331/AutoRouter)](https://github.com/g1331/AutoRouter/issues)
[![Last Commit](https://img.shields.io/github/last-commit/g1331/AutoRouter)](https://github.com/g1331/AutoRouter/commits/master)

<br>

**English** · [简体中文](./README.md)

</div>

---

## Table of Contents

- [Features](#features)
- [Screenshots](#screenshots)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Project Structure](#project-structure)
- [Development Guide](#development-guide)
- [License](#license)

---

## Features

<table>
<tr>
<td width="50%">

### Core Features

- **OpenAI-Compatible Proxy** - Forward requests via `/api/proxy/v1/*` with regular responses and SSE streaming
- **API Key Lifecycle Management** - Create, update, disable and revoke keys with upstream bindings and expiration control
- **Multi-Upstream Capability Routing** - Build candidate upstream pools from request path capability and API key authorization, then apply `model_redirects`, priority, weight, circuit breaking, concurrency, quota, and failover
- **Observable Request Logs** - Persist candidate pools, routing decisions, failover history, session-affinity hits, token usage, and billing snapshots

</td>
<td width="50%">

### Security Features

- **Dual-Layer Secret Protection** - API keys are bcrypt-hashed, upstream secrets are Fernet-encrypted at rest
- **Isolated Admin Authentication** - `/api/admin/*` is protected by dedicated `ADMIN_TOKEN`
- **SSRF Protection** - Upstream URL validation blocks private/loopback/metadata targets and validates DNS resolution
- **Sensitive Operation Guardrail** - `ALLOW_KEY_REVEAL` is off by default to prevent accidental secret exposure

</td>
</tr>
<tr>
<td width="50%">

### User Experience

- **Rebuilt Admin Visual System** - Unified light/dark semantics with stronger information hierarchy and readability
- **Responsive Navigation** - Desktop sidebar plus mobile bottom navigation
- **Statistics Workspace** - Overview / Timeseries / Leaderboard dashboards
- **Health and Circuit Controls** - Upstream health visibility with circuit-breaker state and force-open/close operations

</td>
<td width="50%">

### Internationalization

- **Multi-language Support** - Chinese / English
- **Language Switcher** - Switch language directly from sidebar and settings
- **URL Routing** - Independent `/zh-CN` and `/en` routes

</td>
</tr>
</table>

---

## Screenshots

<details open>
<summary><b>Login - Authentication</b></summary>
<br>
<img src="docs/images/login-dark.png" alt="Login" width="100%">
</details>

<details open>
<summary><b>Dashboard - System Monitoring</b></summary>
<br>
<img src="docs/images/dashboard-dark.png" alt="Dashboard" width="100%">
</details>

<details open>
<summary><b>Logs - Request Observability</b></summary>
<br>
<img src="docs/images/logs-dark.png" alt="Logs" width="100%">
</details>

<details>
<summary><b>API Keys - Key Management</b></summary>
<br>
<img src="docs/images/keys-dark.png" alt="API Keys" width="100%">
</details>

<details>
<summary><b>Upstreams - Upstream Configuration</b></summary>
<br>
<img src="docs/images/upstreams-dark.png" alt="Upstreams" width="100%">
</details>

### Mobile Preview

| Dashboard                                                                            | Upstreams                                                                            |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| <img src="docs/images/mobile-dashboard-dark.png" alt="Mobile Dashboard" width="260"> | <img src="docs/images/mobile-upstreams-dark.png" alt="Mobile Upstreams" width="260"> |
| Logs                                                                                 | API Keys                                                                             |
| <img src="docs/images/mobile-logs-dark.png" alt="Mobile Logs" width="260">           | <img src="docs/images/mobile-keys-dark.png" alt="Mobile API Keys" width="260">       |

---

## Quick Start

### Requirements

| Dependency | Version | Notes                                               |
| ---------- | ------- | --------------------------------------------------- |
| Node.js    | 22+     | Recommend using [pnpm](https://pnpm.io/)            |
| PostgreSQL | 16+     | Recommended for production (default)                |
| SQLite     | Latest  | Optional for local development via `DB_TYPE=sqlite` |

### Docker Deployment (Recommended)

```bash
# 1. Clone the repository
git clone https://github.com/g1331/AutoRouter.git
cd AutoRouter

# 2. Configure environment variables
cp .env.example .env
# Edit .env file, set ADMIN_TOKEN and ENCRYPTION_KEY

# 3. Start services
docker compose up -d

# 4. Visit http://localhost:3331 by default
# If you changed PORT in .env, use that port instead
```

### Release And Personal Deployment

The default GitHub Actions flow now handles verification, image publishing, and GitHub Releases. Personal server deployment is a separate manual workflow that only deploys images that have already been released.

**1. Publish an official release**

```bash
# 1. Ensure master has passed the Verify workflow

# 2. Update the version in package.json

# 3. Create and push the release tag
git tag v1.0.0
git push origin v1.0.0
```

After the tag is pushed, the `Release` workflow validates the tag, publishes the GHCR image, and creates the GitHub Release.

**2. Configure personal deployment secrets**

Add these secrets in Settings → Secrets and variables → Actions:

| Secret            | Description                                                    |
| ----------------- | -------------------------------------------------------------- |
| `SERVER_HOST`     | Server IP or domain                                            |
| `SERVER_USER`     | SSH username                                                   |
| `SSH_PRIVATE_KEY` | SSH private key content                                        |
| `SERVER_PORT`     | SSH port, optional, default `22`                               |
| `DEPLOY_DIR`      | Deploy directory, optional, default `/opt/autorouter`          |
| `ADMIN_TOKEN`     | Admin console token written to the server `.env` during deploy |

**3. Initialize the server**

```bash
mkdir -p /opt/autorouter && cd /opt/autorouter
curl -O https://raw.githubusercontent.com/g1331/AutoRouter/v1.0.0/docker-compose.yml
# Set AUTOROUTER_IMAGE in .env, for example ghcr.io/g1331/autorouter:v1.0.0
nano .env
docker compose up -d
```

**4. Trigger a personal deployment**

```bash
# Run the Personal Deploy workflow from GitHub Actions
# image_ref may be a release tag, full ghcr.io image ref, or sha256 digest
# confirm_release_id must be the matching release tag, for example v1.0.0
```

### Local Development

Do not copy `.env.example` and run it unchanged. The repository supports two local runtime modes, and the database setup differs between them.

#### Option 1: Local PostgreSQL

```bash
# 1. Clone the repository
git clone https://github.com/g1331/AutoRouter.git
cd AutoRouter

# 2. Copy environment variables
cp .env.example .env.local

# 3. Change DATABASE_URL in .env.local to a host-local address
# For example:
# DATABASE_URL=postgresql://autorouter:password@localhost:5432/autorouter

# 4. Generate encryption key (add to .env.local)
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# 5. Install dependencies
pnpm install

# 6. Push PostgreSQL schema
pnpm db:push

# 7. Start development server
pnpm dev
```

After starting, visit http://localhost:3000 and login with `ADMIN_TOKEN`.

#### Option 2: Local SQLite

The runtime supports SQLite for local sandboxing:

```bash
# 1. Copy environment variables
cp .env.example .env.local

# 2. Set these values in .env.local
# DB_TYPE=sqlite
# SQLITE_DB_PATH=./data/dev.sqlite

# 3. Generate encryption key
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# 4. Install dependencies
pnpm install

# 5. Start development server
pnpm dev
```

Note: the packaged Drizzle CLI scripts currently target PostgreSQL by default. SQLite is supported at runtime, but this README no longer claims that `pnpm db:push` is a general SQLite initialization flow.

---

## Configuration

### Environment Variables (`.env` or `.env.local`)

| Variable                    |  Required   | Description                                                                                                                     |
| --------------------------- | :---------: | ------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`              | Conditional | Required in PostgreSQL mode; when `DB_TYPE` is unset, providing this value makes the app choose PostgreSQL automatically        |
| `DB_TYPE`                   |             | Database backend: `postgres` or `sqlite`; when unset, the app auto-detects based on whether `DATABASE_URL` exists               |
| `SQLITE_DB_PATH`            |             | SQLite file path (used when `DB_TYPE=sqlite`)                                                                                   |
| `ENCRYPTION_KEY`            |    Yes\*    | Fernet key (either this or `ENCRYPTION_KEY_FILE`)                                                                               |
| `ENCRYPTION_KEY_FILE`       |    Yes\*    | Load Fernet key from file (either this or `ENCRYPTION_KEY`)                                                                     |
| `ADMIN_TOKEN`               |     Yes     | Admin console login token                                                                                                       |
| `ALLOW_KEY_REVEAL`          |             | Allow revealing full API keys, default `false`                                                                                  |
| `LOG_RETENTION_DAYS`        |             | Request log retention days, default `90`                                                                                        |
| `LOG_LEVEL`                 |             | Log level: `fatal`/`error`/`warn`/`info`/`debug`/`trace`                                                                        |
| `DEBUG_LOG_HEADERS`         |             | Debug header logging switch, default `false`                                                                                    |
| `HEALTH_CHECK_INTERVAL`     |             | Upstream health check interval in seconds, default `30`                                                                         |
| `HEALTH_CHECK_TIMEOUT`      |             | Upstream health check timeout in seconds, default `10`                                                                          |
| `CORS_ORIGINS`              |             | CORS allowlist, comma-separated                                                                                                 |
| `PORT`                      |             | Service port, default `3000`                                                                                                    |
| `RECORDER_ENABLED`          |             | Enable traffic recording. Code defaults to off, while the repository compose file enables it by default                         |
| `RECORDER_MODE`             |             | Recorder mode: `all` / `success` / `failure`                                                                                    |
| `RECORDER_FIXTURES_DIR`     |             | Fixture output directory, default `tests/fixtures`                                                                              |
| `RECORDER_REDACT_SENSITIVE` |             | Redact sensitive fields in fixtures. Code default is `true`, but the repository's production deployment template writes `false` |

---

## Project Structure

| Path                           | Purpose                                                                                                                           |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/api/proxy`            | Proxy entrypoint handling path-capability matching, candidate construction, failover, and request logging                         |
| `src/app/api/admin`            | Admin APIs for keys, upstreams, stats, logs, billing, compensation, health, and circuit breakers                                  |
| `src/app/[locale]/(dashboard)` | Admin console pages including dashboard, keys, logs, upstreams, settings, `system/billing`, and `system/header-compensation`      |
| `src/lib/services`             | Core services such as load balancing, circuit breaker, health checking, billing, logging, traffic recording, and session affinity |
| `src/lib/db`                   | Database access and schema definitions with PostgreSQL / SQLite runtime support                                                   |
| `src/components`               | Admin console components and shared UI primitives                                                                                 |
| `tests`                        | Unit, component, E2E, accessibility, and visual regression tests                                                                  |
| `drizzle` / `drizzle-sqlite`   | PostgreSQL / SQLite migration outputs                                                                                             |
| `docs` / `openspec`            | Supporting documentation and change specifications                                                                                |

---

## Development Guide

<details>
<summary><b>Code Checking</b></summary>

```bash
pnpm lint                  # ESLint
pnpm format                # Prettier
pnpm exec tsc --noEmit     # Type check
```

</details>

<details>
<summary><b>Running Tests</b></summary>

```bash
pnpm test                  # Watch mode
pnpm test:run              # Single run
pnpm test:run --coverage   # Coverage report
pnpm e2e                   # Playwright E2E
pnpm e2e:headed            # Run E2E with visible browser
```

</details>

<details>
<summary><b>Database Operations</b></summary>

```bash
pnpm db:generate           # Generate migration files
pnpm db:migrate            # Apply migrations
pnpm db:push               # Push schema to database
pnpm db:seed               # Seed lightweight sample data
pnpm db:studio             # Open Drizzle Studio
```

</details>

---

## License

[AGPL-3.0](LICENSE) © 2025 AutoRouter Contributors

<div align="center">
<br>

If this project helps you, please consider giving it a Star

<br>
</div>
