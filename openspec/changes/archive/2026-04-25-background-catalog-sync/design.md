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
- 管理端支持动态修改每个后台任务的启用状态和执行间隔，修改后无需重启服务。

**Non-Goals:**

- 不引入外部队列、外部计划任务服务或独立 worker 进程。
- 不自动把刷新得到的模型目录导入 `model_rules`。
- 不新增 LiteLLM 之外的价格来源。
- 不提供环境变量形式的后台任务总开关、任务开关或任务间隔配置。

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

### Decision 3: 状态和任务级配置持久化，运行中互斥保留在进程内

新增通用持久化结构，记录任务级配置、最近运行状态和执行历史。建议结构如下：

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

任务定义提供默认值，只在任务首次注册且数据库不存在对应记录时写入。之后以 `background_sync_tasks` 中的 `enabled`、`interval_seconds` 和 `startup_delay_seconds` 为准，保留管理员在运行期做出的配置修改。

选择该方案的原因：

- 重启后仍能查看最近状态和历史执行结果。
- 任务级启用状态和执行间隔可以在管理端动态修改，无需改环境变量或重启服务。
- 进程内互斥能覆盖当前内置调度器的同名任务重复执行问题，避免引入更重的协调机制。

备选方案：

- 仅使用内存状态。该方案实现简单，但服务重启后管理端无法查看最近执行情况。

### Decision 4: 任务配置通过管理端动态修改

后台任务列表 API 返回每个任务当前配置，管理端面板提供启用开关和执行间隔输入。管理员提交后调用任务配置更新 API：

```text
PATCH /api/admin/background-sync/tasks/:taskName
  enabled?: boolean
  interval_seconds?: number
```

API 写入 `background_sync_tasks` 后，调度器立即重排对应任务：

```text
enabled = false  -> 清除该任务定时器，next_run_at = null
enabled = true   -> 按新的 interval_seconds 计算 next_run_at
interval 修改    -> 按新的 interval_seconds 重排下一次计划执行
```

手动立即执行不受 `enabled` 限制。`enabled` 只表示自动定时执行是否开启。

选择该方案的原因：

- 后台任务属于运行期运维配置，管理端修改比环境变量更符合使用场景。
- 配置写入现有后台任务状态表，可以和任务状态、最近执行结果一起查询。
- 移除环境变量总开关后，任务能在界面中直接显示为开启或关闭，避免出现“任务配置开启但全局调度关闭”的双层状态。

备选方案：

- 环境变量配置。该方案实现简单，但需要重启服务，且无法在管理端动态修改。
- 新增独立配置表。该方案可以承载更多全局参数，但本次只需要任务级配置，复用 `background_sync_tasks` 更直接。

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
├──────────────────────┬──────────────┬────────┬──────────┬───────────────┤
│ 任务                 │ 配置         │ 状态   │ 下次执行 │ 操作          │
├──────────────────────┼──────────────┼────────┼──────────┼───────────────┤
│ 价格目录同步         │ 开启 / 86400 │ 成功   │ 23h 12m  │ [立即执行]    │
│ 模型目录自动刷新     │ 开启 / 86400 │ 部分成功│ 23h 48m │ [立即执行]    │
└──────────────────────┴──────────────┴────────┴──────────┴───────────────┘

详情区
最近开始 / 最近完成 / 最近成功 / 最近失败 / 失败原因 / 耗时 / 成功数 / 失败数
```

移动端布局示意：

```text
┌──────────────────────────────┐
│ 后台任务                     │
├──────────────────────────────┤
│ 价格目录同步                 │
│ 配置：开启 / 86400s          │
│ 状态：成功                   │
│ 下次执行：23h 12m            │
│ 最近耗时：1.4s               │
│ [立即执行]                   │
├──────────────────────────────┤
│ 模型目录自动刷新             │
│ 配置：开启 / 86400s          │
│ 状态：部分成功               │
│ 成功：8  失败：2             │
│ [立即执行]                   │
└──────────────────────────────┘
```

视觉层级：

- 一级信息：任务名、启用状态、执行间隔、状态、下一次计划执行时间、立即执行按钮。
- 二级信息：最近成功、最近失败、耗时、成功数量、失败数量。
- 三级信息：失败摘要，默认单行截断，详情通过展开区域或提示框查看。

选择该方案的原因：

- 后台任务属于系统运行状态，不只服务于 Billing 页面。
- Billing 页面现有“最近同步”仍然可以快速反馈价格目录状态。

备选方案：

- 仅放在 Billing 页面。该方案会让模型目录任务缺少自然入口。

## Risks / Trade-offs

- [后台模型目录刷新触发大量外部请求] → 仅处理显式开启自动刷新的 active 上游，并通过任务间隔和手动执行互斥控制请求频率。
- [任务长时间运行影响后续调度] → 同一任务运行时跳过新的计划执行，记录 `skipped` 历史；手动执行返回当前运行状态。
- [价格同步失败导致目录不可用] → 沿用现有语义，保留最近有效价格，只记录失败状态。
- [模型目录失败覆盖旧缓存] → 沿用现有模型发现语义，失败时保留旧目录缓存并记录失败状态。

## Migration Plan

1. 新增通用后台任务状态表和执行历史表，并同步 PostgreSQL、SQLite schema 与迁移产物。
2. 扩展 `model_discovery` 配置，增加 `auto_refresh_enabled` 字段，历史数据默认视为关闭后台自动刷新。
3. 新增后台任务默认配置，首次注册任务时写入数据库，后续保留数据库中的动态配置。
4. 新增后台调度服务和 `src/instrumentation.ts` 启动入口。
5. 接入 `billing_price_catalog_sync`，复用 `syncBillingModelPrices()`。
6. 接入 `upstream_model_catalog_sync`，只扫描并刷新显式开启自动刷新的 active 上游。
7. 新增管理端任务状态 API、任务配置更新 API 和手动立即执行 API。
8. 新增系统管理区域后台任务面板，支持启用状态和间隔编辑，并在上游模型发现配置区加入后台自动刷新开关。
9. 补齐单元测试、API 测试、组件测试、类型检查和迁移一致性检查。

回退策略：

- 在管理端关闭指定后台任务后，调度器停止该任务的自动定时执行。
- 数据库新增表和新增配置字段可以保留为惰性字段，旧代码不读取时不会影响请求代理和手动同步。
- 若需要回退到旧版本，先停止服务，回退代码，再启动旧版本；价格目录、模型目录和手动刷新接口继续沿用旧语义。
