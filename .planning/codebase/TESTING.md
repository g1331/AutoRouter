# Testing Patterns

**Analysis Date:** 2026-03-30

## Test Framework

**Runner:**

- Vitest `4.0.15` for unit, hook, component, and route-handler tests from `vitest.config.ts`.
- Config: `vitest.config.ts`

**Assertion Library:**

- Vitest `expect` plus `@testing-library/jest-dom` from `tests/setup.ts`

**Run Commands:**

```bash
pnpm test                     # Run Vitest in watch mode
pnpm test:run                # Run Vitest once
pnpm test:run --coverage     # Emit text/html/lcov coverage into coverage/
pnpm e2e                     # Run Playwright specs from tests/e2e
pnpm e2e:headed              # Run Playwright with a visible browser
```

## Test File Organization

**Location:**

- Put Vitest component tests in `tests/components/**/*.test.tsx` and unit-style tests in `tests/unit/**/*.test.{ts,tsx}` because `vitest.config.ts` only includes those two globs.
- Put Playwright browser tests in `tests/e2e/**/*.spec.ts`; `playwright.e2e.config.ts` sets `testDir: "./tests/e2e"`.
- `tests/a11y/pages.spec.ts` and `tests/visual/pages.spec.ts` exist, but no script or Playwright config currently selects those directories.

**Naming:**

- Use `*.test.ts` and `*.test.tsx` for Vitest: `tests/unit/services/load-balancer.test.ts`, `tests/components/create-key-dialog.test.tsx`.
- Use `*.spec.ts` for Playwright: `tests/e2e/billing-tier-flow.spec.ts`.

**Structure:**

```text
tests/
├── setup.ts
├── components/
├── unit/
│   ├── api/
│   ├── hooks/
│   ├── lib/
│   ├── services/
│   └── utils/
├── e2e/
├── a11y/
├── visual/
└── fixtures/
```

## Test Structure

**Suite Organization:**

```typescript
describe("use-api-keys hooks", () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    vi.clearAllMocks();
  });

  it("creates API key successfully", async () => {
    const { result } = renderHook(() => useCreateAPIKey(), { wrapper });

    result.current.mutate({ name: "New Key", upstream_ids: ["upstream-1"] });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});
```

Pattern taken from `tests/unit/hooks/use-api-keys.test.ts`.

**Patterns:**

- Reset mocks, modules, and environment in lifecycle hooks: `tests/unit/services/load-balancer.test.ts`, `tests/unit/utils/config.test.ts`, `tests/unit/utils/logger.test.ts`, `tests/unit/api/proxy/route.test.ts`.
- Create a fresh `QueryClient` per test and disable retries for hook and component tests: `tests/unit/hooks/use-api-keys.test.ts`, `tests/components/create-key-dialog.test.tsx`, `tests/components/upstream-form-dialog.test.tsx`.
- Use `waitFor` for async UI and hook assertions, and `expect.objectContaining` or `expect.arrayContaining` for large payloads: `tests/components/create-key-dialog.test.tsx`, `tests/unit/api/admin/keys/route.test.ts`, `tests/unit/api/proxy/route.test.ts`.
- Current component interaction tests use `fireEvent`; no `userEvent` usage was detected outside recorded fixture payloads.
- When private helpers are not exported, tests may mirror the pure logic locally rather than widening the production API. `tests/unit/api/proxy-route.test.ts` follows this pattern for proxy helper behavior.

## Mocking

**Framework:** Vitest mocks in `tests/unit/**/*` and `tests/components/**/*`; Playwright request interception in `tests/e2e/**/*`

**Patterns:**

```typescript
const { mockToastError } = vi.hoisted(() => ({
  mockToastError: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/hooks/use-api-keys", () => ({
  useCreateAPIKey: () => ({
    mutateAsync: mockCreateMutateAsync,
    isPending: false,
  }),
}));
```

Pattern from `tests/components/create-key-dialog.test.tsx`.

```typescript
await page.addInitScript(() => {
  window.sessionStorage.setItem("admin_token", "e2e-admin-token");
});

await page.route("**/api/admin/billing/**", async (route) => {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ items: [], total: 0 }),
  });
});
```

Pattern from `tests/e2e/billing-tier-flow.spec.ts`.

**What to Mock:**

- Mock translations, toast notifications, auth providers, API clients, and data hooks around the unit under test: `tests/components/create-key-dialog.test.tsx`, `tests/components/upstream-form-dialog.test.tsx`, `tests/unit/hooks/use-api-keys.test.ts`.
- Mock DB access, proxy/network services, and cross-module collaborators for route and service tests: `tests/unit/api/admin/keys/route.test.ts`, `tests/unit/api/proxy/route.test.ts`, `tests/unit/services/load-balancer.test.ts`.
- Seed browser session state and stub backend responses in Playwright with `page.addInitScript` and `page.route`: `tests/e2e/billing-tier-flow.spec.ts`, `tests/e2e/logs-routing-decision.spec.ts`.
- Stub environment before importing singleton config/log modules whose values are read at import time: `tests/unit/utils/logger.test.ts`, `tests/unit/utils/config.test.ts`.

**What NOT to Mock:**

- Keep the subject module real. `tests/unit/services/load-balancer.test.ts` imports the actual load-balancer after registering mocks for DB, circuit breaker, and quota dependencies.
- Keep actual hook state and form behavior live in React Testing Library. `tests/components/create-key-dialog.test.tsx` and `tests/components/upstream-form-dialog.test.tsx` render the real component and only mock surrounding data sources or mutation hooks.

## Fixtures and Factories

**Test Data:**

```typescript
function makeUpstream(opts: MockUpstreamOpts = {}) {
  const id = opts.id ?? "upstream-1";
  const providerType = opts.providerType ?? "openai";

  return {
    id,
    name: opts.name ?? id,
    providerType,
    priority: opts.priority ?? 0,
    weight: opts.weight ?? 1,
    health: { isHealthy: true, latencyMs: 100 },
  };
}
```

Factory pattern from `tests/unit/services/load-balancer.test.ts`.

**Location:**

- Most data builders live inline in the owning test file: `makeUpstream` in `tests/unit/services/load-balancer.test.ts`, `makeApiKey` in `tests/unit/hooks/use-api-keys.test.ts`, `buildServiceApiKey` in `tests/unit/api/admin/keys/route.test.ts`, and `createTierRule` in `tests/e2e/billing-tier-flow.spec.ts`.
- Captured HTTP fixtures live under `tests/fixtures/**`. These are recorded data assets, not the main factory mechanism used by current unit, hook, or component tests.

## Coverage

**Requirements:** No enforced minimum threshold was detected in `vitest.config.ts`, `package.json`, or `.pre-commit-config.yaml`.

**View Coverage:**

```bash
pnpm test:run --coverage
```

- Coverage uses the V8 provider and writes `text`, `html`, and `lcov` reports to `coverage/`.
- Included source globs are `src/components/**/*.tsx`, `src/lib/**/*.ts`, and `src/hooks/**/*.ts` in `vitest.config.ts`.

## Test Types

**Unit Tests:**

- Service and utility logic lives in `tests/unit/services/**/*.test.ts`, `tests/unit/utils/**/*.test.ts`, and `tests/unit/lib/**/*.test.ts`.
- Hook behavior lives in `tests/unit/hooks/**/*.test.ts` and is exercised through `renderHook` plus a `QueryClientProvider`.
- Route helper behavior also appears under `tests/unit/api/**/*.test.ts`; some files call real route exports, while `tests/unit/api/proxy-route.test.ts` tests private logic with a local mirror implementation.

**Integration Tests:**

- A separate integration-test harness was not detected.
- Current integration-style coverage is folded into `tests/unit/api/**/*.test.ts` by constructing `NextRequest` and invoking exported route handlers from files such as `src/app/api/admin/keys/route.ts` and `src/app/api/proxy/v1/[...path]/route.ts`.
- Data-layer integration is also approximated in `tests/unit/hooks/**/*.test.ts` by wiring a real `QueryClientProvider` around each hook.

**E2E Tests:**

- Playwright drives browser flows in `tests/e2e/**/*.spec.ts` using `playwright.e2e.config.ts`.
- The runner starts `pnpm dev --port ${PLAYWRIGHT_PORT}`, reuses an existing local server outside CI, and keeps `trace`, failure screenshots, and failure video enabled.
- Auxiliary Playwright suites exist in `tests/a11y/pages.spec.ts` and `tests/visual/pages.spec.ts`, but they are currently outside the configured `testDir`.

## Common Patterns

**Async Testing:**

```typescript
fireEvent.click(screen.getByText("create"));

await waitFor(() => {
  expect(mockCreateMutateAsync).toHaveBeenCalledWith({
    name: "Quota Key",
    description: null,
    access_mode: "unrestricted",
    upstream_ids: [],
    expires_at: null,
    spending_rules: [{ period_type: "daily", limit: 12.5 }],
  });
});
```

Pattern from `tests/components/create-key-dialog.test.tsx`.

**Error Testing:**

```typescript
await expect(selectFromProviderType("openai")).rejects.toThrow(AllCandidatesConcurrencyFullError);

await expect(import("@/lib/utils/config")).rejects.toThrow("Configuration validation failed");
```

Patterns from `tests/unit/services/load-balancer.test.ts` and `tests/unit/utils/config.test.ts`.

---

_Testing analysis: 2026-03-30_
