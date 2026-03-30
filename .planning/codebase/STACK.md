# Technology Stack

**Analysis Date:** 2026-03-30

## Languages

**Primary:**

- TypeScript 5 - application, API routes, services, hooks, and tests live in `src/**/*.ts`, `src/**/*.tsx`, `tests/**/*.ts`, and `tests/**/*.tsx`; compiler settings are in `tsconfig.json`, and the toolchain version is declared in `package.json`.

**Secondary:**

- SQL - migration artifacts are generated into `drizzle/` and `drizzle-sqlite/`; PostgreSQL migrations are applied at container start by `scripts/docker-entrypoint.sh`.
- Shell and YAML - delivery automation and infrastructure definitions live in `Dockerfile`, `docker-compose.yml`, `docker-compose.yaml`, and `.github/workflows/*.yml`.

## Runtime

**Environment:**

- Node.js 22 - required by `README.md`, used by `Dockerfile`, and pinned in `.github/workflows/verify.yml` and `.github/workflows/release.yml`.
- ESM Node runtime - `package.json` sets `"type": "module"`, and the proxy route in `src/app/api/proxy/v1/[...path]/route.ts` explicitly runs on `runtime = "nodejs"` for streaming support.

**Package Manager:**

- pnpm 9.12.0 - declared in `package.json`.
- Lockfile: present in `pnpm-lock.yaml`, consumed by `Dockerfile`, `.github/workflows/verify.yml`, and `.github/workflows/release.yml`.

## Frameworks

**Core:**

- Next.js 16.1.7 - fullstack App Router framework declared in `package.json` and configured in `next.config.ts`.
- React 19.2.3 and `react-dom` 19.2.3 - UI runtime for pages and admin components under `src/app/` and `src/components/`.
- `next-intl` 4.5.8 - i18n routing and request integration configured by `next.config.ts`, `src/i18n/request.ts`, `src/i18n/routing.ts`, and `src/app/[locale]/layout.tsx`.

**Testing:**

- Vitest 4.0.15 - unit and component test runner configured in `vitest.config.ts`.
- React Testing Library plus `jsdom` - browser-like component testing stack declared in `package.json` and wired through `vitest.config.ts`.
- Playwright 1.58.2 plus `@axe-core/playwright` - E2E and accessibility checks configured by `playwright.e2e.config.ts`.

**Build/Dev:**

- Drizzle Kit 0.30.1 - migration and schema tooling configured in `drizzle.config.ts` and `drizzle-sqlite.config.ts`.
- ESLint 9 with `eslint-config-next` 16.1.6 - static analysis configured in `eslint.config.mjs`.
- Prettier 3.3.3 - repository formatting entrypoint declared in `package.json`.
- Tailwind CSS 4.1.17, `@tailwindcss/postcss`, `postcss`, and `autoprefixer` - frontend styling toolchain declared in `package.json`.
- `tsx` 4.19.0 - TypeScript script runner used by `package.json` for `db:seed`.

## Key Dependencies

**Critical:**

- `drizzle-orm` 0.38.3 - typed database access across `src/lib/db/index.ts`, `src/lib/db/schema.ts`, `src/lib/db/schema-pg.ts`, and `src/lib/db/schema-sqlite.ts`.
- `postgres` 3.4.5 - PostgreSQL driver used in `src/lib/db/index.ts` and `scripts/docker-entrypoint.sh`.
- `@libsql/client` 0.17.0 - SQLite client loaded dynamically in `src/lib/db/index.ts` for local `DB_TYPE=sqlite` runs.
- `zod` 4.1.13 - environment validation in `src/lib/utils/config.ts` and request validation in admin API routes such as `src/app/api/admin/upstreams/route.ts` and `src/app/api/admin/keys/route.ts`.
- `bcryptjs` 3.0.3 - API key hashing and verification in `src/lib/utils/auth.ts`.
- `pino` 10.3.0 - structured logging factory in `src/lib/utils/logger.ts`.

**Infrastructure:**

- `next-themes` 0.4.6 - theme persistence via `src/providers/theme-provider.tsx`.
- `@tanstack/react-query` 5.90.11 - admin data fetching through `src/providers/query-provider.tsx` and hooks in `src/hooks/`.
- `recharts` 3.6.0 - dashboard chart rendering in `src/components/dashboard/usage-chart.tsx` and `src/components/dashboard/leaderboard-section.tsx`.

## Configuration

**Environment:**

- Central runtime validation is implemented in `src/lib/utils/config.ts`; production startup requires `DATABASE_URL` unless `DB_TYPE` is set explicitly.
- Repo-root `.env`, `.env.local`, `.env.test`, and `.env.example` files are present, but their contents were not read. Runtime references come from `README.md`, `docker-compose.yml`, `docker-compose.yaml`, and `.github/workflows/*.yml`.
- Build-time public versioning is injected from `package.json` into `NEXT_PUBLIC_APP_VERSION` in `next.config.ts` and consumed by `src/lib/app-version.ts`.
- Secret storage for upstream credentials depends on `ENCRYPTION_KEY` or `ENCRYPTION_KEY_FILE`, loaded by `src/lib/utils/encryption.ts`.

**Build:**

- `next.config.ts` controls standalone output and allowed remote image hosts.
- `tsconfig.json` enables strict TypeScript compilation and the `@/*` alias.
- `eslint.config.mjs`, `vitest.config.ts`, and `playwright.e2e.config.ts` define linting and test behavior.
- `drizzle.config.ts` targets PostgreSQL migrations under `drizzle/`; `drizzle-sqlite.config.ts` targets SQLite migrations under `drizzle-sqlite/`.
- `Dockerfile`, `docker-compose.yml`, and `docker-compose.yaml` define container packaging and compose topologies.

## Platform Requirements

**Development:**

- Node.js 22+ and pnpm 9.12.0 are the active JavaScript toolchain from `README.md` and `package.json`.
- Database setup expects either PostgreSQL 16+ through `DATABASE_URL` or local SQLite through `DB_TYPE=sqlite` and `SQLITE_DB_PATH`, as implemented in `src/lib/utils/config.ts` and `src/lib/db/index.ts`.
- Browser-based E2E testing requires Playwright browsers; CI installs Chromium in `.github/workflows/verify.yml`.
- Local seed and encryption-related flows rely on `ENCRYPTION_KEY`, as shown by `scripts/seed-lite.ts` and `src/lib/utils/encryption.ts`.

**Production:**

- Deployment uses a standalone Next.js Node container built by `Dockerfile` and started through `docker-compose.yml`.
- The production topology expects PostgreSQL 16 through `docker-compose.yml` and `DATABASE_URL`; startup migrations are applied by `scripts/docker-entrypoint.sh`.
- Release artifacts are published to GitHub Container Registry by `.github/workflows/release.yml`, then deployed to a personal server via `.github/workflows/deploy-personal.yml`.

---

_Stack analysis: 2026-03-30_
