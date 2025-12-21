# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

## Project Overview

AutoRouter is an enterprise AI API Gateway providing API Key distribution, multi-upstream routing, and request management. It's a monorepo with a FastAPI backend and Next.js frontend.

## Development Commands

### Backend (apps/api)

```bash
cd apps/api

# Install dependencies
uv sync --extra dev --group dev

# Run development server
uv run uvicorn app.main:app --port 8000 --reload

# Database migrations
uv run alembic upgrade head          # Apply all migrations
uv run alembic revision --autogenerate -m "description"  # Generate migration

# Linting & formatting
uv run ruff check .                  # Lint
uv run ruff check --fix .            # Lint with auto-fix
uv run ruff format .                 # Format code
uv run pyright                       # Type checking

# Testing
uv run pytest                        # Run all tests
uv run pytest tests/test_file.py    # Run specific file
uv run pytest -k "test_name"        # Run tests matching pattern
uv run pytest --cov=app             # Run with coverage
```

### Frontend (apps/web)

```bash
cd apps/web

# Install dependencies
pnpm install

# Run development server
pnpm dev

# Build
pnpm build

# Linting & formatting
pnpm lint                           # ESLint
pnpm format                         # Prettier format
pnpm format:check                   # Check formatting
pnpm exec tsc --noEmit              # Type checking

# Testing
pnpm test                           # Run tests (watch mode)
pnpm test:run                       # Run tests once
pnpm test:run --coverage            # Run with coverage
```

## Architecture

### Backend Structure (apps/api)

```
app/
├── main.py              # FastAPI app factory, lifespan management
├── api/routes/
│   ├── admin.py         # Admin API: keys, upstreams, stats, request logs
│   ├── proxy.py         # Proxy routes: forward requests to AI providers
│   └── health.py        # Health check endpoint
├── models/
│   ├── db_models.py     # SQLAlchemy ORM models (ApiKey, Upstream, RequestLog)
│   ├── schemas.py       # Pydantic request/response schemas
│   └── upstream.py      # UpstreamConfig, Provider enum, UpstreamManager
├── services/
│   ├── key_manager.py   # API key CRUD, hashing, permissions
│   ├── proxy_client.py  # HTTP client for upstream forwarding
│   ├── upstream_service.py  # Upstream CRUD operations
│   ├── request_logger.py    # Request logging to database
│   └── stats_service.py     # Dashboard statistics aggregation
├── core/
│   ├── config.py        # pydantic-settings configuration
│   ├── encryption.py    # Fernet encryption for upstream keys
│   └── logging.py       # Loguru configuration
└── db/
    └── base.py          # Database session management
```

### Frontend Structure (apps/web)

```
src/
├── app/
│   ├── [locale]/        # Internationalized routes (next-intl)
│   │   ├── (auth)/      # Login page (route group)
│   │   └── (dashboard)/ # Protected dashboard pages
│   └── layout.tsx       # Root layout with providers
├── components/          # React components (shadcn/ui based)
├── hooks/               # Custom React hooks
├── lib/                 # Utilities (API client, cn helper)
├── i18n/                # next-intl configuration
├── messages/            # Translation JSON files (en, zh)
├── providers/           # React context providers
└── types/               # TypeScript type definitions
```

### Key Architectural Patterns

1. **Upstream Management**: Upstreams (AI providers like OpenAI, Anthropic) are loaded from database on startup with environment variable fallback. Runtime selection via `X-Upstream-Name` header.

2. **Security Model**:
   - Admin authentication: Bearer token (`ADMIN_TOKEN` env var)
   - API key authentication: Client keys hashed with bcrypt, verified on proxy requests
   - Upstream keys: Encrypted at rest with Fernet (`ENCRYPTION_KEY` env var)

3. **Proxy Flow**: `proxy.py` receives requests → validates API key → selects upstream → forwards via `proxy_client.py` → logs request → returns SSE stream or response

4. **Database**: SQLite by default (async via aiosqlite), managed through SQLAlchemy async sessions and Alembic migrations

## Configuration

### Backend Environment Variables (apps/api/.env)

```env
ENCRYPTION_KEY=<fernet-key>     # Required: Generate with `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`
ADMIN_TOKEN=<admin-token>       # Required: Admin API authentication
DATABASE_URL=sqlite+aiosqlite:///./autorouter.db  # Optional: Default SQLite
```

### Frontend Environment Variables (apps/web/.env.local)

```env
NEXT_PUBLIC_API_URL=http://localhost:8000  # Backend API URL
```

## Code Quality Standards

- **Python**: Strict pyright type checking, ruff for linting/formatting (line length 100)
- **TypeScript**: ESLint + Prettier, strict mode
- **Testing**: pytest-asyncio for backend, vitest for frontend
- **CI**: GitHub Actions run lint and test workflows on all PRs

## Common Development Tasks

### Adding a New API Endpoint

1. Add route in `app/api/routes/admin.py` or create new router
2. Add Pydantic schemas in `app/models/schemas.py`
3. Add service logic in `app/services/`
4. Write tests in `tests/`

### Adding a New Frontend Page

1. Create route in `src/app/[locale]/(dashboard)/`
2. Add translations in `src/messages/{en,zh}.json`
3. Create components in `src/components/`
4. Add API hooks using TanStack Query patterns from `src/hooks/`
