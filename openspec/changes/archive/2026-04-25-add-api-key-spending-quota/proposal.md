## Why

当前系统已经具备 API Key 管理、请求日志、计费快照和上游消费限额能力，但缺少针对单个 API Key 的消费约束。只依赖上游限额无法阻止单个密钥过度消耗预算，也无法在密钥管理页直观解释某个密钥为什么被拒绝、何时恢复可用，因此需要补齐密钥级金额限额能力。

## What Changes

- 为 API Key 新增 `spending_rules` 配置，支持零条或多条金额限额规则。
- 支持与上游限额一致的周期语义：`daily`、`monthly`、`rolling`，其中 `rolling` 需要 `period_hours`。
- 在代理请求入口增加 API Key 消费限额检查；当任一规则超额时，后续请求立即以硬拒绝方式返回。
- 被 API Key 限额拒绝的请求仍写入请求日志，并计入密钥请求次数，但不计入上游请求次数。
- `unbilled` 请求允许通过，且不计入 API Key 消费限额。
- 在密钥管理页展示每条规则的已用金额、限额金额、占比、超额状态，以及 fixed window 的重置时间或 rolling window 的预计恢复时间。
- 管理员调整限额规则后立即生效；若新限额已低于当前已用金额，对应密钥立即进入临时超额状态，待窗口恢复后自动可用。

## Capabilities

### New Capabilities
- `api-key-spending-quota`: API Key 金额限额的配置、运行时拦截、消费追踪、管理台状态展示与拒绝日志语义。

### Modified Capabilities
- None.

## Impact

- Affected code:
  - `src/lib/db/schema-pg.ts`
  - `src/lib/db/schema-sqlite.ts`
  - `src/lib/services/key-manager.ts`
  - `src/app/api/admin/keys/route.ts`
  - `src/app/api/admin/keys/[id]/route.ts`
  - `src/app/api/proxy/v1/[...path]/route.ts`
  - `src/lib/services/request-logger.ts`
  - `src/lib/services/stats-service.ts`
  - `src/components/admin/create-key-dialog.tsx`
  - `src/components/admin/edit-key-dialog.tsx`
  - `src/components/admin/keys-table.tsx`
  - `src/hooks/use-api-keys.ts`
  - `src/types/api.ts`
- Affected systems:
  - API Key 管理 Admin API
  - 代理入口与请求日志链路
  - 密钥管理页额度状态展示
  - 基于请求日志与计费快照的密钥统计口径
