# Coding Conventions

**Analysis Date:** 2026-03-30

## Naming Patterns

**Files:**

- Use kebab-case for feature modules, hooks, services, and components: `src/components/admin/create-key-dialog.tsx`, `src/lib/services/request-logger.ts`, `src/hooks/use-api-keys.ts`.
- Keep framework entry filenames literal under App Router: `src/app/api/admin/keys/route.ts`, `src/app/[locale]/page.tsx`, `src/app/[locale]/layout.tsx`.
- Use `index.ts` only as a narrow barrel for a cohesive folder: `src/components/dashboard/index.ts`, `src/lib/db/schema.ts`.

**Functions:**

- Use camelCase for helpers and service functions: `normalizeAccessMode`, `buildFallbackQuotaState`, `resolveFailureStage`, `extractTokenUsage`.
- Prefix React hooks with `use`: `useAPIKeys`, `useCreateAPIKey`, `useUpstreamHealth` in `src/hooks/use-api-keys.ts` and `src/hooks/use-upstreams.ts`.
- Name React components in PascalCase even when the file is kebab-case: `CreateKeyDialog` in `src/components/admin/create-key-dialog.tsx`, `Button` in `src/components/ui/button.tsx`.
- Name custom errors with an `Error` suffix: `ApiKeyNotFoundError`, `LegacyApiKeyError`, `NoHealthyUpstreamsError` in `src/lib/services/key-manager.ts` and `src/lib/services/load-balancer.ts`.

**Variables:**

- Use camelCase for local state, helpers, and derived values: `spendingRuleDrafts`, `upstreamSearchQuery`, `selectedFilteredCount`, `queryClient`.
- Use UPPER_SNAKE_CASE for module-level constants: `REQUEST_LOG_STALE_MINUTES`, `MAX_FAILOVER_ERROR_BODY_BYTES`, `STALE_REQUEST_LOG_STATUS_CODE` in `src/lib/services/request-logger.ts` and `src/app/api/proxy/v1/[...path]/route.ts`.
- Use short conventional handles for shared concerns: `t` and `tCommon` for translations in `src/components/admin/create-key-dialog.tsx`, `log` for module loggers in `src/app/api/admin/keys/route.ts` and `src/lib/services/request-logger.ts`.

**Types:**

- Use PascalCase for interfaces and type aliases: `APIKeyCreateResponse`, `RoutingDecisionLog`, `UpstreamSelectionResult` in `src/types/api.ts` and `src/lib/services/load-balancer.ts`.
- Keep transport-facing DTO fields in snake_case to mirror the HTTP contract: `access_mode`, `upstream_ids`, `spending_rules` in `src/types/api.ts`.
- Convert transport DTOs to camelCase at the route/service boundary: `src/app/api/admin/keys/route.ts` maps `access_mode` to `accessMode` and `upstream_ids` to `upstreamIds`.
- Re-export shared types from the canonical source instead of redefining them: `src/types/api.ts` re-exports `RouteCapability` and `RouteMatchSource` from `src/lib/route-capabilities.ts`.

## Code Style

**Formatting:**

- Use Prettier from `.prettierrc`.
- Current settings from `.prettierrc`: double quotes, semicolons, `trailingComma: "es5"`, `printWidth: 100`, `arrowParens: "always"`, `endOfLine: "lf"`.
- Preserve Prettier-produced multiline wrapping for long objects, JSX props, and call sites as seen in `src/components/admin/create-key-dialog.tsx`, `src/app/api/proxy/v1/[...path]/route.ts`, and `src/lib/services/key-manager.ts`.
- Pre-commit checks formatting with `pnpm exec prettier --check` in `.pre-commit-config.yaml`.

**Linting:**

- Use the flat ESLint config in `eslint.config.mjs` with `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript`.
- Prefer `@/*` imports over deep relative traversals; `eslint.config.mjs` rejects `../*../*`.
- Prefix intentionally unused locals or parameters with `_` to satisfy `@typescript-eslint/no-unused-vars`.
- Keep application logging on `createLogger` rather than `console`; `eslint.config.mjs` warns on `console` in `src/**/*` except `console.warn` and `console.error`.
- Add JSDoc on exported services and API handlers. `eslint.config.mjs` applies `jsdoc/require-jsdoc` to `src/lib/services/**/*.ts` and `src/app/api/**/*.ts`, and `tsdoc/syntax` to non-component `src/**/*.ts`.
- Pre-commit also runs `pnpm exec eslint --fix` on `src/**/*` and `pnpm exec tsc --noEmit` on TypeScript files in `.pre-commit-config.yaml`.

## Import Organization

**Order:**

1. Import third-party runtime modules first: `react-hook-form`, `next/server`, `zod`, `@tanstack/react-query` in `src/components/admin/create-key-dialog.tsx`, `src/app/api/admin/keys/route.ts`, and `src/hooks/use-api-keys.ts`.
2. Import internal alias modules next, grouped by domain: `@/components/**`, `@/lib/**`, `@/hooks/**`, `@/providers/**`, `@/types/**`.
3. Import relative siblings last when staying inside one folder or package: `./show-key-dialog` in `src/components/admin/create-key-dialog.tsx`, `../db` and `../utils/auth` in `src/lib/services/key-manager.ts`.

**Path Aliases:**

- Use the `@/*` alias from `tsconfig.json` and `vitest.config.ts` for cross-tree imports.
- Current source files primarily use `@/components`, `@/lib`, `@/hooks`, `@/providers`, and `@/types`; `components.json` defines matching shadcn aliases for the same roots.
- Use `import type` for type-only imports when the runtime value is unused, as shown in `src/hooks/use-api-keys.ts`, `src/components/admin/create-key-dialog.tsx`, and `src/app/api/proxy/v1/[...path]/route.ts`.

## Error Handling

**Patterns:**

- Validate boundary input with Zod and encode cross-field rules in `superRefine`, as in `src/components/admin/create-key-dialog.tsx`, `src/app/api/admin/keys/route.ts`, and `src/lib/utils/config.ts`.
- Catch `z.ZodError` at the route boundary, turn it into an HTTP error, and reserve logging for server-side faults: `src/app/api/admin/keys/route.ts`.
- Use explicit domain error classes for service-level exceptional cases: `src/lib/services/key-manager.ts` and `src/lib/services/load-balancer.ts`.
- Treat secondary persistence and synchronization steps as best-effort. Current code logs and continues for quota sync, billing snapshot writes, and stale-request reconciliation in `src/lib/services/key-manager.ts`, `src/app/api/proxy/v1/[...path]/route.ts`, and `src/lib/services/request-logger.ts`.
- In UI submit handlers, let hooks own mutation error presentation and keep the local catch block empty when the error is already surfaced elsewhere, as in `src/components/admin/create-key-dialog.tsx`.

## Logging

**Framework:** `pino` via `src/lib/utils/logger.ts`

**Patterns:**

- Create one child logger per module with `createLogger("<module-name>")`: `src/app/api/admin/keys/route.ts`, `src/lib/services/request-logger.ts`, `src/app/api/proxy/v1/[...path]/route.ts`.
- Emit structured context objects alongside a stable message string: `log.error({ err: error }, "failed to create API key")` in `src/app/api/admin/keys/route.ts`, `log.info({ keyPrefix, name }, "deleted API key")` in `src/lib/services/key-manager.ts`.
- Keep sensitive values out of logs. `src/lib/services/key-manager.ts` explicitly avoids logging decrypted API key material.
- Treat `console.warn` in `src/lib/utils.ts` as the rare design-time exception rather than the default application logging style.

## Comments

**When to Comment:**

- Put short JSDoc blocks on exported hooks, route handlers, services, utilities, and type groups: `src/hooks/use-api-keys.ts`, `src/lib/services/load-balancer.ts`, `src/app/api/proxy/v1/[...path]/route.ts`, `src/types/api.ts`.
- Use inline comments to explain non-obvious behavior and edge conditions, especially around draft numeric form state, failover attribution, and best-effort persistence: `src/components/admin/create-key-dialog.tsx`, `src/lib/services/request-logger.ts`, `src/app/api/proxy/v1/[...path]/route.ts`.
- Keep comments intent-focused. Current files explain why a branch exists or what invariant is being protected, not the mechanics of simple assignments.

**JSDoc/TSDoc:**

- `src/lib/services/**/*.ts` and `src/app/api/**/*.ts` are the strongest documentation zones because `eslint.config.mjs` targets them with `jsdoc/require-jsdoc`.
- Rich type-overview comments are also common in `src/types/api.ts`, `src/lib/utils/config.ts`, and `src/components/dashboard/index.ts`.

## Function Design

**Size:** Extract helper functions for normalization, filtering, and mapping even inside large orchestration files. `src/lib/services/load-balancer.ts` and `src/app/api/proxy/v1/[...path]/route.ts` keep complex flows in named helpers rather than burying everything inside one exported function.

**Parameters:** Use positional parameters for short stable APIs such as `useAPIKeys(page, pageSize)` in `src/hooks/use-api-keys.ts`. Switch to a typed object parameter once the call surface becomes cross-cutting or largely optional, as in `persistBillingSnapshotSafely(input)` and `logRequest(input)` in `src/app/api/proxy/v1/[...path]/route.ts` and `src/lib/services/request-logger.ts`.

**Return Values:** Prefer typed object returns that preserve metadata for the caller. Current examples are `UpstreamSelectionResult` in `src/lib/services/load-balancer.ts`, paginated envelopes in `src/lib/services/key-manager.ts`, and transport DTO interfaces in `src/types/api.ts`.

## Module Design

**Exports:** Default to named exports for hooks, components, helpers, constants, and types. This is the dominant pattern in `src/hooks/use-api-keys.ts`, `src/lib/utils/config.ts`, `src/components/ui/button.tsx`, and `src/types/api.ts`.

**Barrel Files:** Use barrels only for tight subpackages, not repo-wide aggregation. Current examples are `src/components/dashboard/index.ts` and `src/lib/db/schema.ts`.

---

_Convention analysis: 2026-03-30_
