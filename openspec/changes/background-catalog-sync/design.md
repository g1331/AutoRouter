## Context

当前仓库已经具备两类目录同步能力，但都需要管理员主动触发：

- 价格目录：`syncBillingModelPrices()` 从 LiteLLM 拉取模型价格和分层计费规则，写入 `billing_model_prices`、`billing_tier_rules` 和 `billing_price_sync_history`。
- 模型目录：`refreshUpstreamCatalog(upstreamId)` 基于上游 `model_discovery` 配置调用对应模型列表接口，写回 `model_catalog`、最近刷新时间、最近状态和最近错误。

现有能力示意如下：

```text
管理员操作
  │
  ├─ POST /api/admin/billing/prices/sync
  │    └─ syncBillingModelPrices()
  │
  └─ POST /api/admin/upstreams/:id/catalog/refresh
       └─ refreshUpstreamCatalog(id)
```

issue 108 需要补齐的是后台定时执行、统一状态查询和手动立即执行。该能力横跨服务启动、数据库状态、管理端 API、价格同步和模型发现配置，因此需要独立的后台任务层。

## Goals / Non-Goals

**Goals:**

- 提供通用后台同步任务服务，支持定时执行、启动后延迟首次执行、互斥、状态记录、执行历史和手动立即执行。
- 首批注册 `billing_price_catalog_sync` 和 `upstream_model_catalog_sync` 两个任务。
- 价格同步任务复用现有 LiteLLM 价格同步逻辑，保持失败时保留最近有效价格。
- 模型目录同步任务只刷新显式开启后台自动刷新的上游，且只更新目录缓存和刷新状态。
- 管理端提供后台任务状态面板，并在上游模型发现配置中展示和编辑自动刷新开关。
- 第一版覆盖单实例部署，行为边界在设计和规格中明确记录。

**Non-Goals:**

- 不引入外部队列、外部计划任务服务或独立 worker 进程。
- 不实现多实例数据库租约、主节点选举或跨实例互斥。
- 不自动把刷新得到的模型目录导入 `model_rules`。
- 不新增 LiteLLM 之外的价格来源。
- 不在第一版提供管理端在线修改全局任务间隔；任务间隔和总开关使用环境变量。

## Decisions

### Decision 1: 新增通用后台任务层，而不是在单个服务中直接增加定时器

任务关系如下：

```text
src/instrumentation.ts
  │
  └─ register()
      │
      └─ BackgroundSyncScheduler
          │
          ├─ billing_price_catalog_sync
          │    └─ syncBillingModelPrices()
          │
          └─ upstream_model_catalog_sync
               └─ refresh eligible upstream catalogs
```

选择该方案的原因：

- 价格目录和模型目录都需要相同的调度、互斥、状态记录和手动执行能力。
- 后续增加类似后台任务时，可以复用同一套管理端状态和 API。
- 价格服务和模型发现服务继续保持现有职责，不承担进程级调度。

备选方案：

- 仅在 `billing-price-service.ts` 内增加 `setInterval`。该方案可以覆盖价格同步，但模型目录和后续任务仍会复制一套状态与控制逻辑。

### Decision 2: 使用 `src/instrumentation.ts` 初始化后台任务

Next.js server 启动时通过 `instrumentation.ts` 的 `register()` 初始化后台任务。实现时需要只在 `NEXT_RUNTIME === "nodejs"` 时动态加载调度器，避免 Edge runtime 或构建阶段加载数据库和定时器。

```text
register()
  │
  ├─ runtime != nodejs  ──> return
  │
  └─ runtime == nodejs
       └─ import background scheduler
          └─ scheduler.start()
```

选择该方案的原因：

- 与 Next.js 16 的服务启动机制一致。
- 可以避免依赖某个 API route 被访问后才启动后台任务。
- 动态加载可以减少非 Node runtime 的副作用。

备选方案：

- 在某个 API route 顶层初始化。该方案启动时机依赖首个请求，不适合作为后台任务入口。

### Decision 3: 状态持久化，运行中互斥保留在进程内

新增通用持久化结构，记录任务配置快照、最近运行状态和执行历史。建议结构如下：

```text
background_sync_tasks
  task_name
  enabled
  interval_seconds
  startup_delay_seconds
  last_started_at
  last_finished_at
  last_success_at
  last_failed_at
  last_status
  last_error
  last_duration_ms
  next_run_at
  updated_at

background_sync_task_runs
  id
  task_name
  trigger_type        scheduled | startup | manual
  status              success | partial | failed | skipped
  success_count
  failure_count
  started_at
  finished_at
  duration_ms
  error_summary
```

运行中互斥使用进程内 `isRunning`。当同一任务正在执行时，新的手动执行请求不排队、不并发，返回当前运行状态。

选择该方案的原因：

- 重启后仍能查看最近状态和历史执行结果。
- 第一版单实例足够简单，避免把分布式锁引入当前任务。
- 持久化表为后续多实例租约预留数据基础。

备选方案：

- 仅使用内存状态。该方案实现简单，但服务重启后管理端无法查看最近执行情况。

### Decision 4: 配置采用环境变量，管理端只展示运行状态和任务操作

第一版建议增加以下环境变量：

| 变量 | 语义 | 默认值 |
| --- | --- | --- |
| `BACKGROUND_SYNC_ENABLED` | 后台同步总开关 | production 为 true，development/test 为 false |
| `BILLING_PRICE_SYNC_ENABLED` | 价格目录后台同步开关 | true |
| `BILLING_PRICE_SYNC_INTERVAL_SECONDS` | 价格目录同步间隔 | 86400 |
| `MODEL_CATALOG_SYNC_ENABLED` | 模型目录后台同步开关 | true |
| `MODEL_CATALOG_SYNC_INTERVAL_SECONDS` | 模型目录同步间隔 | 86400 |
| `BACKGROUND_SYNC_STARTUP_DELAY_SECONDS` | 启动后首次任务延迟基准 | 60 |

管理端显示这些配置的生效状态，但不在第一版提供全局间隔编辑表单。

选择该方案的原因：

- 当前项目配置主要由环境变量承载，首版保持部署模型简单。
- 在线编辑全局间隔需要额外处理权限、持久化和多实例传播，不适合并入首版。

备选方案：

- 新增数据库配置表并支持管理端编辑。该方案灵活，但会扩大本次变更范围。

### Decision 5: 模型目录后台刷新必须由上游显式开启

扩展 `model_discovery` 配置，增加后台自动刷新开关。建议内部字段为：

```text
model_discovery:
  mode: ...
  custom_endpoint: ...
  enable_lite_llm_fallback: ...
  auto_refresh_enabled: boolean
```

模型目录后台任务只处理满足以下条件的上游：

```text
is_active = true
  AND model_discovery.auto_refresh_enabled = true
  AND model_discovery 可以解析为有效发现配置
```

手动刷新不受 `auto_refresh_enabled` 限制。这样管理员可以先保留手动刷新能力，再单独选择哪些上游进入后台自动刷新。

管理端上游编辑界面中的模型发现区域增加一个明确开关：

```text
┌─────────────────────────────────────────────┐
│ 模型发现                                    │
├─────────────────────────────────────────────┤
│ 发现模式        [OpenAI 兼容          v]    │
│ LiteLLM 辅助     [开启]                     │
│ 后台自动刷新    [开启]                      │
│                                             │
│ 最近状态：成功                              │
│ 最近刷新：2026-04-25 13:20                 │
│                                             │
│ [刷新目录] [导入选中模型]                   │
└─────────────────────────────────────────────┘
```

选择该方案的原因：

- 避免后台任务对所有历史上游发起外部请求。
- 对需要人工控制、费用敏感或接口限制严格的上游更清晰。
- 与用户确认的“模型自动刷新需要显式配置为开启”一致。

备选方案：

- 所有 active 上游默认自动刷新。该方案自动化程度高，但会改变历史上游的外部请求行为。

### Decision 6: 后台任务状态面板放在系统管理区域

管理端新增“后台任务”面板，展示任务状态并支持手动执行。Billing 页面继续保留价格同步摘要，不承载所有任务控制。

桌面布局示意：

```text
系统设置
┌────────────────────────────────────────────────────────────┐
│ 后台任务                                                   │
├──────────────────────┬────────┬──────────┬───────────────┤
│ 任务                 │ 状态   │ 下次执行 │ 操作          │
├──────────────────────┼────────┼──────────┼───────────────┤
│ 价格目录同步         │ 成功   │ 23h 12m  │ [立即执行]    │
│ 模型目录自动刷新     │ 部分成功│ 23h 48m  │ [立即执行]    │
└──────────────────────┴────────┴──────────┴───────────────┘

详情区
最近开始 / 最近完成 / 最近成功 / 最近失败 / 失败原因 / 耗时 / 成功数 / 失败数
```

移动端布局示意：

```text
┌──────────────────────────────┐
│ 后台任务                     │
├──────────────────────────────┤
│ 价格目录同步                 │
│ 状态：成功                   │
│ 下次执行：23h 12m            │
│ 最近耗时：1.4s               │
│ [立即执行]                   │
├──────────────────────────────┤
│ 模型目录自动刷新             │
│ 状态：部分成功               │
│ 成功：8  失败：2             │
│ [立即执行]                   │
└──────────────────────────────┘
```

视觉层级：

- 一级信息：任务名、状态、下一次计划执行时间、立即执行按钮。
- 二级信息：最近成功、最近失败、耗时、成功数量、失败数量。
- 三级信息：失败摘要，默认单行截断，详情通过展开区域或提示框查看。

选择该方案的原因：

- 后台任务属于系统运行状态，不只服务于 Billing 页面。
- Billing 页面现有“最近同步”仍然可以快速反馈价格目录状态。

备选方案：

- 仅放在 Billing 页面。该方案会让模型目录任务缺少自然入口。

## Risks / Trade-offs

- [多实例部署会重复执行任务] → 第一版明确支持单实例；多实例环境建议关闭内置后台同步，使用单个实例或后续数据库租约方案。
- [后台模型目录刷新触发大量外部请求] → 仅处理显式开启自动刷新的 active 上游，并通过任务间隔和手动执行互斥控制请求频率。
- [任务长时间运行影响后续调度] → 同一任务运行时跳过新的计划执行，记录 `skipped` 历史；手动执行返回当前运行状态。
- [价格同步失败导致目录不可用] → 沿用现有语义，保留最近有效价格，只记录失败状态。
- [模型目录失败覆盖旧缓存] → 沿用现有模型发现语义，失败时保留旧目录缓存并记录失败状态。

## Migration Plan

1. 新增通用后台任务状态表和执行历史表，并同步 PostgreSQL、SQLite schema 与迁移产物。
2. 扩展 `model_discovery` 配置，增加 `auto_refresh_enabled` 字段，历史数据默认视为关闭后台自动刷新。
3. 新增后台任务配置解析，读取环境变量并生成任务定义。
4. 新增后台调度服务和 `src/instrumentation.ts` 启动入口。
5. 接入 `billing_price_catalog_sync`，复用 `syncBillingModelPrices()`。
6. 接入 `upstream_model_catalog_sync`，只扫描并刷新显式开启自动刷新的 active 上游。
7. 新增管理端任务状态 API 和手动立即执行 API。
8. 新增系统管理区域后台任务面板，并在上游模型发现配置区加入后台自动刷新开关。
9. 补齐单元测试、API 测试、组件测试、类型检查和迁移一致性检查。

回退策略：

- 关闭 `BACKGROUND_SYNC_ENABLED` 可停止后台任务启动。
- 数据库新增表和新增配置字段可以保留为惰性字段，旧代码不读取时不会影响请求代理和手动同步。
- 若需要回退到旧版本，先停止服务，回退代码，再启动旧版本；价格目录、模型目录和手动刷新接口继续沿用旧语义。

## Open Questions

- 全局任务间隔是否需要在后续版本支持管理端编辑。
- 多实例部署是否在后续版本引入数据库租约字段与租约续期机制。
