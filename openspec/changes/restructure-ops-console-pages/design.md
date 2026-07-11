## Context

一期（PR #223，`feat/ops-console-2-restyle`）已交付令牌体系、Saira 字体、chart 主题与视觉/无障碍测试基座，属于**视觉层**换血。本次二期是**页面形式级**重构：改变数据的呈现形式与编辑交互的组织方式，同时把散落的视觉规则收敛为全站强制契约。

已代码勘察核实的现状与约束：

- **后端零改动即可支撑分区独立保存**：`PUT /api/admin/upstreams/[id]` 的 `updateUpstreamSchema` 全字段 `optional`（`route.ts:94-154`），是真·partial update；`GET` 单条已存在（`route.ts:159-178`）。`PUT /api/admin/keys/[id]` 的 `updateApiKeySchema` 同样全 optional 且 `.strict()` + `.refine(Object.keys>0)`（`route.ts:64-90`），含 `spending_rules`；`GET` 单条已存在（`route.ts:22`）。仅缺 `useUpstream(id)` / `useApiKey(id)` 两个查询 hook。
- **分区自保存有现成蓝本**：`useToggleUpstreamActive`（`use-upstreams.ts:320-393`）已实现单字段 PUT + optimistic 写入 + 失败回滚 + `onSettled` 失效；`UpstreamFailureRulesEditor` 自带 CRUD 自保存。分区表单直接照抄该 optimistic 范式。
- **弹窗内已具备 13 分区三分类左导航结构**（Basic 5 / Strategy 4 / Reliability 4），可直接迁入路由页；`editUpstreamFormSchema`（`upstream-form-dialog.tsx:384`）可按字段切分为分区子 schema。
- **存量 bug**：`upstreams-table` 的 `onTest` prop 声明但从未调用（连接测试 UI 不可达）；settings 页缺 users / cliproxy 两入口；`ui/terminal/status-led.tsx` 零引用死代码。
- **半径六套并行**：`rounded-cf-*` 令牌、md-sys 残留 `rounded-md`（30 处 / 8 弹窗文件）、裸 `rounded`（10 处）、任意值 `rounded-[Npx]`（8 种数值 / 13 处），16px 档全域零使用。
- **数字排印四套无契约**：dashboard KPI 走 Saira、topbar live-pulse 走正文 Manrope、logs/billing 表格走 mono、leaderboard 走 `type-body-small`；另有 3 个未定义 `type-*` 类在 10 处被调用后静默退化。
- **两处 StatCard 逐字重复**：portal 的 `OverviewStatCard` 与 users/[id] 的 `StatCard` 是重复代码且同带 bug（`type-headline-small` 未定义）。

参考稿为一期已合并的 Ops Console 2.0 令牌与组件；本文件把二期的页面形式契约固化为实施依据。

## Goals / Non-Goals

**Goals:**

- 建立全站**数据数字排印三档契约**与**半径四词汇契约**，并以守护单测锁定防漂移。
- 抽取五个共享页面原语（PageHeader / PageShell / IconBox / StatCard / SectionForm），消除 7+ 页手写头卡与重复 StatCard。
- 上游编辑从 4074 行单体弹窗迁移为 `/upstreams/[id]` 详情页，13 分区各自独立表单、独立 dirty 检测、独立 partial 保存。
- 上游列表从大卡片网格改为按 tier 分组的紧凑行表，并恢复连接测试动作（修死 bug）。
- 密钥编辑同模式迁移为 `/keys/[id]` 详情页；billing 组件化、logs 抽子组件、admin/portal/login 契约对齐。
- 单 PR、分阶段可回滚提交；保留全部招牌 morph 交互（仅撤除被页面跳转取代的 edit morph）。

**Non-Goals:**

- 不改任何后端 API、数据库、代理逻辑（复用已有 GET 单条 + 全 optional PUT）。
- 不动 billing 信息架构（仅组件化去重）；不做 logs-table 完整拆分（仅抽最大 3-4 子组件，DOM 等价）。
- 不合并 portal 表单形态（portal-usage-chart 仅 retheme）。
- 不引入 Tabs（全仓无先例）、不新造 breadcrumb（仓库无先例）、不做 `/upstreams/new` 或 `/keys/new` 整页。
- 不新增运行时 npm 依赖。

## Decisions

### D1 — 设计统一契约（实现与验收共同依据）

#### D1.1 数据数字排印三档

| 档 | 语境 | 规则 |
|---|---|---|
| **Tier 1 · 英雄/KPI 数字** | dashboard KPI 卡、portal/users 概览卡、**topbar live-pulse 主指标** | Saira（`font-display`）+ `tabular-nums`；字号随语境（KPI 卡 `type-display-medium`，topbar 用同族小字号），**字族必须统一为 Saira** |
| **Tier 2 · 表格/密集行内/标识符数字** | logs 表、billing 表、延迟/token 列、请求 ID | `font-mono`（JetBrains Mono）+ `tabular-nums` |
| **Tier 3 · 次级小数字** | hint、「共 N 条」、副标签 | sans（`type-body-small` / `type-caption`）+ `tabular-nums`；**禁 Saira、禁 mono** |

**铁律**：任何指标值不得用无 `tabular-nums` 的普通正文渲染。`live-pulse-bar.tsx` 全部主指标迁 Tier 1（Saira）。

**理由**：四套并行的根因是缺乏“数字按语境分档”的契约，而非某一处写错。用语境（英雄 / 密集 / 次级）而非页面来定档，可让新页面天然落到正确档位。

**备选**：a) 全站统一一种数字字体——牺牲 KPI 英雄感或表格对齐，弃；b) 保持现状仅修 portal——治标不治本，弃。

#### D1.2 半径收敛

目标词汇**仅四种**：`rounded-cf-sm`(4px 微元素) / `rounded-cf-md`(8px 容器) / `rounded-full` / `rounded-none`。

迁移映射表：

| 来源 | 处数 | 目标 |
|---|---|---|
| `rounded-md`（8 个 key/upstream 弹窗文件） | 30 | `rounded-cf-md` |
| 裸 `rounded`（绕过令牌） | 10 | `rounded-cf-sm` |
| `rounded-[1px]` / `[2px]` / `[5px]` / `[6px]` | 归并 | `rounded-cf-sm` |
| `rounded-[8px]` / `[10px]` | 归并 | `rounded-cf-md` |
| `rounded-[18px]` / `[22px]`（药丸：login ×6、upstreams:319、hero-terminal:63、logs-table ×2、lifecycle-track:325） | 归并 | `rounded-full` |

迁移完成后：从 `tailwind.config.ts` **删裸 `sm`/`md`/`lg` 半径别名**（`--vr-radius-lg` 令牌本体保留，供令牌类继续引用）。

**守护单测**（新增）：禁裸 `rounded`（单独类）、禁 `rounded-[`、禁 `rounded-(sm|md|lg|xl)`。正则须避开 `rounded-cf-*` / `rounded-full` / `rounded-none` 与 `rounded-t/b/l/r-*` 方向类的误伤。

**理由**：半径词汇是有限枚举，收敛为白名单后由单测常驻守护，比逐处 review 更可持续。

#### D1.3 共享原语抽取

| 原语 | 落点 | 替换目标 |
|---|---|---|
| `PageHeader`（icon + 标题 + 描述 + actions 槽） | `src/components/admin/page-header.tsx` | 7+ 页各自手写的头卡 |
| `PageShell`（`maxWidth` prop） | `src/components/admin/page-shell.tsx` | 每页手写 `mx-auto max-w-7xl space-y-6 px-4 py-5`；归一 header-compensation 非标骨架 |
| `IconBox`（`size` / `tone`） | `src/components/ui/icon-box.tsx` | 23 处手写 amber 图标方块（9 文件） |
| `StatCard`（Tier-1 数字） | `src/components/dashboard/stat-card.tsx` | 合并 portal `OverviewStatCard` 与 users/[id] `StatCard`（逐字重复 + 同带 bug） |
| `SectionForm`（详情页分区外壳：标题 + dirty 徽标 + 保存/重置底栏） | `src/components/admin/section-form.tsx` | upstreams / keys 详情页共用 |
| **删死代码** | 删 `ui/terminal/status-led.tsx`（零 import，删前 grep 复核） | 保留 `ui/status-led.tsx` |

#### D1.4 未定义 `type-*` 类修复（10 处）

- `type-label-small`（login ×5、hero-section ×1、edit-user-dialog ×1）→ `globals.css` **补定义**（label 尺度底端档）。
- `type-headline-small`（`portal/page.tsx:34`、`users/[id]/page.tsx:43`，均为 KPI 数字）→ 随共享 `StatCard` 换 `type-display-small`。
- `type-heading-small`（`failure-rules/page.tsx:30`）→ `type-title-medium`。

### D2 — Upstreams 重构（旗舰）

#### D2.1 详情页 `/upstreams/[id]` 布局

路由骨架照抄 `system/users/[id]/page.tsx` 惯例：`useParams` + Topbar + ghost 返回按钮 + ApiError 404 分支（仓库无 breadcrumb，不新造）。左侧 sticky 分区导航为**滚动锚点**（非 Tabs），滚动容器加 `scroll-pt-14` 防 Topbar 遮挡。

```
┌───────────────────────────────────────────────────────────────┐
│ Topbar (>> live-pulse)                                          │
├───────────────────────────────────────────────────────────────┤
│ ‹ 返回   [IconBox] openai-primary            ● 熔断 CLOSED       │  ← PageHeader
├────────────────┬──────────────────────────────────────────────┤
│ 分区导航(sticky)│  ┌── SectionForm: 基础 · 名称 ────────────┐   │
│                │  │ name                       [脏] 保存 重置 │   │
│ 基础信息        │  └──────────────────────────────────────────┘  │
│  · 名称  ●脏   │  ┌── SectionForm: 基础 · 资料 ────────────┐   │
│  · 资料        │  │ description / official_website_url        │   │
│  · 路由与端点   │  │                            [干净]保存disabled│  │
│  · API Key     │  └──────────────────────────────────────────┘  │
│  · 诊断探针     │  ┌── SectionForm: 路由与端点 ─────────────┐   │
│ 策略           │  │ base_url · route_capabilities · 预览      │   │
│  · 优先级/权重  │  └──────────────────────────────────────────┘  │
│  · 模型路由     │  … 逐分区独立表单，独立保存 …                 │
│  · 计费倍率     │                                                │
│  · 消费限额     │  scroll-pt-14 独立滚动内容区                   │
│ 稳定性         │                                                │
│  · 容量控制     │                                                │
│  · 熔断器       │                                                │
│  · 失败规则     │                                                │
│  · 亲和迁移     │                                                │
└────────────────┴──────────────────────────────────────────────┘
```

#### D2.2 十三分区 → 分区级 partial PUT 载荷

每分区 = 一个独立 `useForm` + 从 `editUpstreamFormSchema` 按字段切分出的分区子 Zod schema（同源复用，不另造契约），独立 dirty 检测、保存按钮 `disabled-until-dirty`、partial PUT **只含本分区字段**，optimistic 照抄 `useToggleUpstreamActive`。

| # | 分区 | PUT 载荷字段 | 说明 |
|---|---|---|---|
| 1 | basic-name | `{ name }` | |
| 2 | basic-profile | `{ official_website_url }` | 已确认 `description` 为死字段（无 DB 列、create/update schema 均不接收，静默 strip）——从本分区 UI 移除，仅保留 official_website_url（见 Open Questions） |
| 3 | basic-route-endpoint | `{ base_url, route_capabilities }` | 含 endpoint 预览、重复告警 |
| 4 | basic-api-key | `{ api_key }` | **write-only**：空不提交，占位提示「留空保持不变」 |
| 5 | basic-diagnostics | —（probe UI 非表单） | 连通性探针，不产生 PUT 载荷 |
| 6 | priority-weight | `{ priority, weight }` | |
| 7 | model-routing | `{ model_discovery, model_rules }` | 最大分区（646 行）；catalog preview/refresh/import 均 edit-only，天然适配详情页。schema 亦接受 `model_redirects` 与上游级 `allowed_models`，但当前表单未surface（已被 `model_rules` 取代）——如后续恢复编辑，归属本分区 |
| 8 | billing-multipliers | `{ billing_input_multiplier, billing_output_multiplier }` | |
| 9 | spending-quota | `{ spending_rules }` | |
| 10 | capacity-control | `{ max_concurrency, queue_policy, timeout }` | |
| 11 | circuit-breaker | `{ circuit_breaker_config }` | |
| 12 | failure-rules | `{ failure_rule_config }`（`use_global_rules` 开关） + `UpstreamFailureRulesEditor` 自保存 | 「是否用全局规则」开关走本分区 partial PUT；具体规则 CRUD 由内嵌 `UpstreamFailureRulesEditor` 自保存 |
| 13 | affinity-migration | `{ affinity_migration }` | |

保存后 `onSettled` 统一失效 `["upstreams", id]` 与列表缓存，避免分区间脏读。

#### D2.3 旧弹窗拆解后删除

`upstream-form-dialog.tsx`（4074 行）**拆解后删除**：分区体 → `src/components/admin/upstream/sections/*.tsx`；共享 helper（分区 schema 片段、coerce 函数、endpoint preview、`VirtualCatalogEntryList`）下沉 `src/components/admin/upstream/`。

#### D2.4 Create 流程

瘦 `create-upstream-dialog.tsx`：仅必填（`name`、`base_url`、`route_capabilities`、`api_key` required）→ 创建成功 `router.push` 详情页补全。保留 `morph-upstream-form`（指向 create）。**不做 `/upstreams/new` 整页**。

#### D2.5 列表行表

按 priority tier 分组（保留现 collapsible tier 结构）的紧凑行表：

```
▾ Tier 0 · priority 0            并发 12/50   活跃 3
  ● openai-primary   https://api.openai.com   [CLOSED]  cc 4/10  q 0  2 分钟前  [⏻] [Test] [✎→] [🗑]
  ● openai-backup    https://api2.openai.com  [ HALF ]  cc 1/10  q 2  未使用    [⏻] [Test] [✎→] [🗑]
    └▸ 展开：capabilities · multipliers · AsciiProgress · quota 明细（原卡片密集信息）
▸ Tier 1 · priority 1 …
```

行元素：LED（`ui/status-led.tsx`）· 名称 + base_url · 熔断 StateChip · 关键指标（并发、quota，数字 Tier-2/3）· **最近使用相对时间**（compact 行内直出「N 分钟前」/「未使用」，满足 baseline「上游列表时间信息以最近使用时间为主」——作为运营主时间指标常驻可见，不折进展开行）· 行操作：active 开关、**Test（恢复 `onTest` 调用，修 bug）**、Edit（跳详情页）、Delete（保留 `morph-upstream-delete`）、熔断恢复。展开行装原卡片密集信息。compact/comfortable 切换沿用。**edit morph 撤除**（页面跳转取代）。

### D3 — Keys 重构（同模式）

`/keys/[id]` 详情页，分区与载荷：

```
┌── SectionForm: 基础信息 ──────┐  { name, description, is_active }
┌── SectionForm: 访问模式与上游授权 ┐ { access_mode, upstream_ids }
┌── SectionForm: 花费规则 ──────┐  { spending_rules }
┌── SectionForm: 模型白名单 ────┐  { allowed_models }（key-model-allowlist-section 471 行整块迁入）
┌── SectionForm: 到期 ─────────┐  { expires_at }
```

后端已支持（GET 单条 + 全 optional `.strict()` PUT，`Object.keys>0`）；新增 `useApiKey(id)` hook；`SectionForm` 复用。**Create**：瘦 create dialog（必填项）→ 创建成功先展示一次性密钥（沿用 show-key 逻辑）→ 跳详情页补全，`morph-key-form` 留给 create。列表 keys-table 行内 Edit 改跳详情页；`edit-key-dialog.tsx`（788 行）删除；`morph-key-revoke` 保留。

注：`access_mode=restricted` 时 `upstream_ids` 非空由 PUT `superRefine` 强校验——「访问模式与上游授权」合为一个分区提交，避免拆两区触发跨区校验失败。

### D4 — 其余页面分级处置

| 级 | 页面 | 处置 |
|---|---|---|
| F 表单级 | system/billing（3735 行单体） | 抽 `BillingPriceRow` + `useBillingPriceRowEdit` 统一四路重复编辑逻辑，页面拆到 `src/components/admin/billing/*`；排印/半径对齐；**IA 不动**；`morph-billing-override-reset` 保留；`billing-tier-flow.spec` 全程守护 |
| M 拆单体 | logs-table（3752 行） | 抽最大 3-4 子组件（ThinkingConfigPanel、RequestKeyIdentity、ModelIdentity、LogRecordingSection 挂载点）到 `src/components/logs/*`，**DOM 逐字不变**；完整拆分留后续 |
| A 对齐 | dashboard、system/users、system/cliproxy、traffic-recording、background-sync、failure-rules、header-compensation、settings | 接 PageHeader/PageShell/IconBox/StatCard + 半径/排印契约；**settings 补 users/cliproxy 两入口 bug**；header-compensation 归一骨架 |
| P portal | 4 页 + login | portal 接共享 StatCard；portal-usage-chart 仅 retheme 不合并形态；portal-key-dialog 半径/排印对齐、3 个 portal morph 保留；login 半径令牌化 + `type-label-small` 修复（保留终端视觉身份） |

### D5 — SectionForm 契约

```
┌─ SectionForm ─────────────────────────────────────┐
│ [标题]                          [● 未保存]  ← dirty  │
│ ──────────────────────────────────────────────────│
│  <分区字段插槽 (children)>                          │
│ ──────────────────────────────────────────────────│
│                          [重置]  [保存]  ← disabled │
│                                        until dirty  │
└────────────────────────────────────────────────────┘
```

props 契约：`title`、`description?`、`isDirty`、`isSaving`、`onSave`、`onReset`、`children`；保存中禁用双按钮并显示 pending 态；保存成功后 dirty 清零。upstreams 与 keys 详情页共用，保证两处分区外壳视觉与交互一致。

## Risks / Trade-offs

| 风险 | 缓解 |
|---|---|
| E2E 锚点断裂（specs 断言 `text=openai-primary` 等 mock 文本） | 行表/拆分保留名称与价格文本渲染；每域改完先跑对应 spec |
| morph 回归 | 保留的 morph 名与结构一行不动（create/delete/revoke/portal ×3/billing-reset）；edit morph 撤除是有意决策；globals 的 view-transition 规则不动 |
| billing 拆分回归 | DOM 尽量等价 + spec 每步守护 + IA 不动 |
| 分区保存并发/脏读 | 各分区 PUT 后 `onSettled` 统一失效 `["upstreams"/"keys", id]` 与列表缓存 |
| `api_key` write-only 语义 | 空不提交 + 占位提示；payload 单测锁定「空省略」 |
| keys 访问模式跨区校验 | access_mode 与 upstream_ids 合并为单分区提交，规避 `superRefine` 跨区失败 |
| i18n 遗漏 | 新串双语同落；真实 next-intl 契约测试抓 typo（namespace 顶层无点号） |
| 单 PR 体量 | 共享原语先行，A–E 每阶段独立可回滚；logs 完整拆分、billing IA、portal 表单合并显式排除在外 |
| 无测试覆盖页（cliproxy/header-compensation/traffic-recording/background-sync/settings） | 仅做对齐级改动 + 视觉校验代理浏览器核验兜底 |
| 半径守护正则误伤 | 白名单避开 `rounded-cf-*`/`rounded-full`/`rounded-none`/方向类；单测自带反例断言 |

## Migration Plan

分阶段单 PR，每阶段独立可回滚：

- **Phase A 契约与共享原语**（1 提交）：先铺 `.type-label-small`、半径 sweep、删裸别名、五原语、删死代码、10 处 type 类修复、live-pulse 数字迁 Saira、settings 补两入口。这是后续所有页面的地基，最先落地。
- **Phase B Upstreams**（3 提交）：B1 hook + 瘦 create + 详情页骨架 + form 共享模块抽取；B2 13 分区表单 + SectionForm + 分区保存；B3 列表行表 + Test 修复 + 删旧弹窗。
- **Phase C Keys**（2 提交）：C1 hook + 详情页 + 分区表单 + 瘦 create；C2 列表接线 + 删 edit-key-dialog。
- **Phase D 其余站点**（4 提交）：D1 billing、D2 logs、D3 admin 对齐、D4 portal + login。
- **Phase E 全量验证与基线**（1 提交）：lint + format:check + tsc + test:run --coverage + e2e --workers=2 + visual 基线重生成 + a11y 全量 + build(postgres) → push → CI 绿 → 建 PR。

回滚策略：每阶段一至多个独立提交，任一阶段异常可 revert 该阶段提交而不影响前序地基；共享原语与页面接线解耦，原语先行使页面改造可逐页回退。

**交接边界**：推进到 push + CI 绿 + 建 PR 为止，合并由用户决定。

## Open Questions

- **上游 `description` 持久化（已定论）**：经核实，`upstreams` 表无 `description` 列（`schema-pg.ts`），create 与 update 两个 Zod schema 均不接收该字段（plain object 静默 strip），现表单读写它是**确认的死字段/no-op**。**决策：从 UI 整体移除** basic-profile 不再含 description（保留 `official_website_url`）。补齐 DB 列/schema 属后端与数据库改动，明确在本变更 Non-Goals 之外，故不在本变更内新增该能力；如未来确需上游描述，另立独立变更处理后端落库。相应地 basic-profile payload 单测断言载荷只含已持久化字段（`official_website_url`）。
- **topbar live-pulse 迁 Saira 字号**：Tier 1 要求字族统一 Saira，但 topbar 空间紧凑，具体小字号档（复用 `type-*` 哪一档）由实现期视觉校验代理双主题实测定档。
