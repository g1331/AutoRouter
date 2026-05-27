<div align="center">

<!-- Hero Banner -->
<img src="docs/images/banner.svg" alt="AutoRouter Banner" width="100%">

<h3>AI API Gateway</h3>
<p>An AI API Gateway for multi-upstream routing and operations</p>

<!-- Badges: Status -->

[![Verify](https://github.com/g1331/AutoRouter/actions/workflows/verify.yml/badge.svg)](https://github.com/g1331/AutoRouter/actions/workflows/verify.yml)
[![Release](https://github.com/g1331/AutoRouter/actions/workflows/release.yml/badge.svg)](https://github.com/g1331/AutoRouter/actions/workflows/release.yml)
[![codecov](https://codecov.io/gh/g1331/AutoRouter/graph/badge.svg)](https://codecov.io/gh/g1331/AutoRouter)
[![Docs](https://img.shields.io/badge/Docs-online-3eaf7c?logo=vite&logoColor=white)](https://g1331.github.io/AutoRouter/)

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

> The full documentation site is maintained in Simplified Chinese. The English README covers the high-level overview, screenshots, and the minimal Docker quick start; for deployment, configuration, and architecture details please follow the doc-site links below or use your browser's translation feature.

---

## Table of Contents

- [Features](#features)
- [Screenshots](#screenshots)
- [Quick Start](#quick-start)
- [Documentation](#documentation)
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

Minimum start-up flow:

```bash
git clone https://github.com/g1331/AutoRouter.git
cd AutoRouter
cp .env.example .env
# Edit .env: at minimum set ADMIN_TOKEN and ENCRYPTION_KEY
docker compose up -d
# Visit http://localhost:3331 by default
```

Runtime requirements: Node.js 22+ (for source builds), PostgreSQL 16 (default, recommended for production); SQLite is supported for local development.

For deployment topologies, release workflow, personal deployment secrets, source-based local development, and SQLite switching, see the [Deployment Guide](https://g1331.github.io/AutoRouter/guide/deployment/overview) on the docs site (Simplified Chinese; browser translation works for the prose sections, while code blocks remain in English).

---

## Documentation

| Topic                              | Link                                                                                                                                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Deployment topologies & quickstart | [`guide/deployment`](https://g1331.github.io/AutoRouter/guide/deployment/overview)                                                                                                   |
| Environment variable reference     | [`guide/deployment/env-reference`](https://g1331.github.io/AutoRouter/guide/deployment/env-reference)                                                                                |
| GitHub Actions deployment          | [`guide/deployment/github-actions`](https://g1331.github.io/AutoRouter/guide/deployment/github-actions)                                                                              |
| Admin console usage                | [`guide/usage`](https://g1331.github.io/AutoRouter/guide/usage/admin-overview)                                                                                                       |
| Architecture & request lifecycle   | [`guide/architecture`](https://g1331.github.io/AutoRouter/guide/architecture/overview)                                                                                               |
| Testing strategy & contributing    | [`guide/architecture/testing`](https://g1331.github.io/AutoRouter/guide/architecture/testing) · [`contributing`](https://g1331.github.io/AutoRouter/guide/architecture/contributing) |

Documentation scope, background, and version planning are tracked in [issue #167](https://github.com/g1331/AutoRouter/issues/167).

---

## License

[AGPL-3.0](LICENSE) © 2025 AutoRouter Contributors

<div align="center">
<br>

If this project helps you, please consider giving it a Star

<br>
</div>
