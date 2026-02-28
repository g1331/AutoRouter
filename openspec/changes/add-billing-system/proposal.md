## Why

当前 AutoRouter 的核心价值是多上游路由与故障转移，但管理员仍然无法回答一个关键问题：每个请求到底花了多少钱、为什么是这个价格、哪个上游最贵。尤其在不同上游倍率不一致、部分模型缺少官方价格的情况下，缺少统一计费视图会直接影响渠道运营和成本控制。

## What Changes

- 新增“价格目录”能力：自动拉取 LiteLLM 模型价格映射并记录来源、抓取时间、有效状态
- 新增“手动价格覆盖”能力：当模型无可用官方价格时，支持管理员手动录入模型单价并优先生效
- 新增“上游计费倍率”能力：为每个 upstream 配置输入/输出价格倍率，支持按上游差异化计费
- 新增“请求计费快照”能力：在请求日志完成时固化本次计费明细（基础单价、倍率、token 用量、最终费用），避免后续改价影响历史账单
- 新增“计费管理页（System/Billing）”：提供概览卡片、价格目录、缺失价格修复与同步状态，并提供前往请求日志查看请求费用的入口
- 在“上游管理页（/upstreams）”提供上游计费倍率配置入口，避免在 Billing 页面混淆“计费配置”与“渠道启停”语义
- 新增“计费管理 API”：包含概览统计、价格同步、覆盖价格 CRUD、倍率更新、未定价模型查询

## Capabilities

### New Capabilities

- `billing-price-catalog`: 模型价格目录能力，覆盖自动同步、来源追踪、价格缺失检测与手动覆盖
- `request-cost-accounting`: 请求级计费能力，基于 token 用量与上游倍率计算并固化费用快照
- `billing-management-console`: 计费管理控制台能力，提供概览、配置、修复、明细四类可视化操作

### Modified Capabilities

- 无

## Impact

- **受影响代码（预期）**
  - `src/lib/db/schema-pg.ts` / `src/lib/db/schema-sqlite.ts` / `src/lib/db/schema.ts`：新增计费相关表与字段
  - `src/lib/services/request-logger.ts`、`src/app/api/proxy/v1/[...path]/route.ts`：集成请求完成后的计费快照写入
  - `src/app/api/admin/*`：新增 billing 管理与统计接口
  - `src/hooks/*`、`src/app/[locale]/(dashboard)/system/*`：新增计费页面与数据 hooks
  - `src/components/admin/sidebar.tsx`、`src/app/[locale]/(dashboard)/settings/page.tsx`：新增计费入口
  - `src/messages/en.json`、`src/messages/zh-CN.json`：新增计费相关文案
- **数据库**
  - 需要新增迁移，用于价格目录、手动覆盖、请求费用快照、上游倍率字段
- **外部依赖**
  - LiteLLM price map（主价格源）
- **兼容性**
  - 非破坏性新增；历史日志无计费快照时前端需展示“未计费/待补齐”状态
