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

AutoRouter is an AI API Gateway providing API Key distribution, multi-upstream routing, and request management. It's a Next.js fullstack application with API Routes for the backend.

## Development Commands

```bash
# Install dependencies
pnpm install

# Run development server
pnpm dev

# Build
pnpm build

# Database commands (Drizzle ORM)
pnpm db:generate    # Generate migrations from schema changes
pnpm db:migrate     # Apply migrations
pnpm db:push        # Push schema directly (development)
pnpm db:studio      # Open Drizzle Studio

# Linting & formatting
pnpm lint           # ESLint
pnpm format         # Prettier format
pnpm format:check   # Check formatting
pnpm exec tsc --noEmit  # Type checking

# Testing
pnpm test           # Run tests (watch mode)
pnpm test:run       # Run tests once
pnpm test:run --coverage  # Run with coverage
```

## Architecture

### Project Structure

```
src/
├── app/
│   ├── api/                 # Next.js API Routes (backend)
│   │   ├── admin/           # Admin API endpoints
│   │   │   ├── keys/        # API key management
│   │   │   ├── upstreams/   # Upstream management
│   │   │   ├── stats/       # Statistics endpoints
│   │   │   └── logs/        # Request logs
│   │   ├── proxy/v1/        # AI proxy endpoint
│   │   └── health/          # Health check
│   ├── [locale]/            # Internationalized routes (next-intl)
│   │   ├── (auth)/          # Login page (route group)
│   │   └── (dashboard)/     # Protected dashboard pages
│   └── layout.tsx           # Root layout with providers
├── components/              # React components (shadcn/ui based)
├── hooks/                   # Custom React hooks (TanStack Query)
├── lib/
│   ├── db/                  # Database (Drizzle ORM)
│   │   ├── schema.ts        # Table definitions
│   │   └── index.ts         # Database client
│   ├── services/            # Business logic
│   │   ├── key-manager.ts   # API key CRUD
│   │   ├── upstream-service.ts  # Upstream service (re-exports from focused modules)
│   │   ├── upstream-crud.ts     # Upstream database CRUD operations
│   │   ├── upstream-connection-tester.ts  # Upstream connection testing
│   │   ├── upstream-ssrf-validator.ts     # SSRF protection (IP/URL/DNS validation)
│   │   ├── proxy-client.ts  # HTTP proxy with SSE support
│   │   ├── request-logger.ts    # Request logging
│   │   └── stats-service.ts     # Statistics aggregation
│   └── utils/               # Utility functions
│       ├── auth.ts          # Authentication (bcrypt)
│       ├── encryption.ts    # Fernet encryption
│       └── config.ts        # Environment configuration
├── i18n/                    # next-intl configuration
├── messages/                # Translation JSON files (en, zh)
├── providers/               # React context providers
└── types/                   # TypeScript type definitions
```

### Key Architectural Patterns

1. **Upstream Management**: Upstreams (AI providers like OpenAI, Anthropic) stored in PostgreSQL database. Runtime selection via `X-Upstream-Name` header.

2. **Security Model**:
   - Admin authentication: Bearer token (`ADMIN_TOKEN` env var)
   - API key authentication: Client keys hashed with bcrypt, verified on proxy requests
   - Upstream keys: Encrypted at rest with Fernet (`ENCRYPTION_KEY` env var)

3. **Proxy Flow**: `/api/proxy/v1/*` receives requests → validates API key → selects upstream → forwards via proxy-client → logs request → returns SSE stream or response

4. **Database**: PostgreSQL with Drizzle ORM. Schema defined in `src/lib/db/schema.ts`.

## Configuration

### Environment Variables (.env)

```env
# Required
DATABASE_URL=postgresql://user:password@localhost:5432/autorouter
ENCRYPTION_KEY=<base64-32-bytes>  # Generate: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
ADMIN_TOKEN=<admin-token>         # Admin API authentication

# Optional
ALLOW_KEY_REVEAL=false            # Allow revealing API keys
LOG_RETENTION_DAYS=90             # Request log retention
CORS_ORIGINS=http://localhost:3000
```

## Docker Deployment

```bash
# Build and run with docker-compose
docker-compose up -d

# Or build manually
docker build -t autorouter .
docker run -p 3000:3000 \
  -e DATABASE_URL=postgresql://... \
  -e ENCRYPTION_KEY=... \
  -e ADMIN_TOKEN=... \
  autorouter
```

## Code Quality Standards

- **TypeScript**: ESLint + Prettier, strict mode
- **Database**: Drizzle ORM with typed schema
- **Testing**: Vitest for unit tests
- **CI**: GitHub Actions run lint and test workflows on all PRs

## Common Development Tasks

### Adding a New API Endpoint

1. Create route in `src/app/api/admin/{endpoint}/route.ts`
2. Add service logic in `src/lib/services/`
3. Update types in `src/types/api.ts` if needed
4. Write tests in `tests/`

### Adding a New Frontend Page

1. Create route in `src/app/[locale]/(dashboard)/`
2. Add translations in `src/messages/{en,zh}.json`
3. Create components in `src/components/`
4. Add API hooks using TanStack Query patterns from `src/hooks/`
