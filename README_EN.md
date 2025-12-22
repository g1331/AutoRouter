<div align="center">

<!-- Hero Banner -->
<img src="docs/images/banner.svg" alt="AutoRouter Banner" width="100%">

<h3>AI API Gateway</h3>
<p>A minimal multi-upstream AI API proxy</p>

<!-- Badges: Status -->
[![Lint](https://github.com/g1331/AutoRouter/actions/workflows/lint.yml/badge.svg)](https://github.com/g1331/AutoRouter/actions/workflows/lint.yml)
[![Test](https://github.com/g1331/AutoRouter/actions/workflows/test.yml/badge.svg)](https://github.com/g1331/AutoRouter/actions/workflows/test.yml)
[![codecov](https://codecov.io/gh/g1331/AutoRouter/graph/badge.svg)](https://codecov.io/gh/g1331/AutoRouter)

<!-- Badges: Tech -->
[![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)

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
- [Development](#development)
- [License](#license)

---

## Features

<table>
<tr>
<td width="50%">

### Core Features

- **API Key Management** - Create, distribute and manage client keys
- **Access Control** - Set model permissions and expiration per key
- **Multi-Upstream Routing** - Support OpenAI, Anthropic, Azure, etc.
- **Request Logging** - Complete request logs for auditing and debugging

</td>
<td width="50%">

### Security

- **Key Hashing** - API keys stored with bcrypt one-way hash
- **Encrypted Storage** - Upstream keys encrypted with Fernet
- **Token Auth** - Admin panel uses separate Admin Token

</td>
</tr>
<tr>
<td width="50%">

### User Experience

- **Cassette Futurism UI** - Retro-futuristic design style
- **Responsive Layout** - Works on desktop and mobile
- **Theme Switching** - Light / Dark / System

</td>
<td width="50%">

### Internationalization

- **Multi-language** - Chinese / English
- **Auto Detection** - Switches based on browser language
- **URL Routing** - Separate `/zh` and `/en` routes

</td>
</tr>
</table>

---

## Screenshots

<details open>
<summary><b>Dashboard - System Monitor</b></summary>
<br>
<img src="docs/images/dashboard-dark.png" alt="Dashboard" width="100%">
</details>

<details>
<summary><b>API Keys - Key Management</b></summary>
<br>
<img src="docs/images/keys-dark.png" alt="API Keys" width="100%">
</details>

<details>
<summary><b>Upstreams - Upstream Config</b></summary>
<br>
<img src="docs/images/upstreams-dark.png" alt="Upstreams" width="100%">
</details>

<details>
<summary><b>Login - Login Page</b></summary>
<br>
<img src="docs/images/login-dark.png" alt="Login" width="100%">
</details>

---

## Quick Start

### Requirements

| Dependency | Version | Note |
|------------|---------|------|
| Python | 3.12+ | Recommend [uv](https://github.com/astral-sh/uv) |
| Node.js | 22+ | Recommend [pnpm](https://pnpm.io/) |

### Installation

```bash
# 1. Clone the repo
git clone https://github.com/g1331/AutoRouter.git
cd AutoRouter
```

<details>
<summary><b>Backend Setup (apps/api)</b></summary>

```bash
cd apps/api

# Copy environment variables
cp .env.example .env

# Generate encryption key (add to .env)
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

# Install dependencies
uv sync

# Run database migrations
uv run alembic upgrade head

# Start the server
uv run uvicorn app.main:app --port 8000 --reload
```

</details>

<details>
<summary><b>Frontend Setup (apps/web)</b></summary>

```bash
cd apps/web

# Copy environment variables
cp .env.example .env.local

# Install dependencies
pnpm install

# Start dev server
pnpm dev
```

</details>

Visit http://localhost:3000 and login with your `ADMIN_TOKEN`.

---

## Configuration

### Backend Environment Variables (`apps/api/.env`)

| Variable | Required | Description |
|----------|:--------:|-------------|
| `ENCRYPTION_KEY` | Yes | Fernet key for encrypting upstream API keys |
| `ADMIN_TOKEN` | Yes | Admin panel login token |
| `DATABASE_URL` | | Database connection string, defaults to SQLite |

### Frontend Environment Variables (`apps/web/.env.local`)

| Variable | Required | Description |
|----------|:--------:|-------------|
| `NEXT_PUBLIC_API_URL` | Yes | Backend API URL, e.g. `http://localhost:8000` |

---

## Project Structure

```
AutoRouter/
├── apps/
│   ├── api/                # FastAPI backend
│   │   ├── app/
│   │   │   ├── api/        # Route handlers
│   │   │   ├── models/     # Data models
│   │   │   ├── services/   # Business logic
│   │   │   └── core/       # Core config
│   │   ├── alembic/        # Database migrations
│   │   └── tests/          # Test cases
│   │
│   └── web/                # Next.js frontend
│       ├── src/
│       │   ├── app/        # App Router pages
│       │   ├── components/ # React components
│       │   ├── hooks/      # Custom hooks
│       │   └── i18n/       # i18n config
│       └── messages/       # Translation files
│
├── docs/                   # Documentation
└── openspec/               # Design specs
```

---

## Development

<details>
<summary><b>Linting</b></summary>

```bash
# Python
cd apps/api
uv run ruff check .        # Lint
uv run ruff format .       # Format
uv run pyright             # Type check

# TypeScript
cd apps/web
pnpm lint                  # ESLint
pnpm format                # Prettier
pnpm exec tsc --noEmit     # Type check
```

</details>

<details>
<summary><b>Testing</b></summary>

```bash
# Python
cd apps/api
uv run pytest --cov=app

# TypeScript
cd apps/web
pnpm test:run --coverage
```

</details>

---

## License

[AGPL-3.0](LICENSE) © 2025 AutoRouter Contributors

<div align="center">
<br>

If you find this project helpful, please consider giving it a Star

<br>
</div>
