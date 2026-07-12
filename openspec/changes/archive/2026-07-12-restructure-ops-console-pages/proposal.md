## Why

一期（PR #223，`feat/ops-console-2-restyle`）交付了令牌系统、Saira 字体、chart 主题与视觉/无障碍测试基座，但用户期望的“全面重构”是**页面显示逻辑级**的：用什么形式呈现数据、编辑交互怎么组织。三项已查实的痛点仍在：

1. **上游编辑弹窗不实用**：`upstream-form-dialog.tsx` 4074 行单体弹窗，13 个配置段靠长滚动 + 锚点跳转；列表是信息全量平铺的大卡片网格，密度低、扫读难。
2. **设计不统一（圆角）**：六套半径系统并行——`rounded-cf-*` 令牌、md-sys 迁移残留 `rounded-md`（30 处 / 8 个弹窗文件）、裸 `rounded`（10 处，绕过令牌）、任意值 `rounded-[Npx]`（8 种数值 / 13 处），16px 档全域零使用，视觉噪声高、易再漂移。
3. **数字字体不统一**：同为指标数字，dashboard KPI 卡走 Saira display、topbar live-pulse 走正文 Manrope、logs/billing 表格走 mono、leaderboard 走 `type-body-small`，四套并行且无契约；另有 **3 个从未定义的 `type-*` 类在 10 处被调用**（`type-label-small` ×7、`type-headline-small` ×2、`type-heading-small` ×1），命中元素静默退化为无样式（portal KPI 数字即因此损坏）。

后端零改动即可支撑分区独立保存已核实：`PUT /api/admin/upstreams/[id]` 与 `PUT /api/admin/keys/[id]` 均为全字段可选的真·partial update，`GET` 单条均已存在，仅缺 `useUpstream(id)` / `useApiKey(id)` hook。现是把地基一次性铺成“页面形式级”一致体系的合适时机。

## What Changes

- **全站设计统一契约（新增强制契约）**：数据数字排印三档（Tier 1 Saira 英雄/KPI 含 topbar live-pulse；Tier 2 mono 表格/密集/标识符；Tier 3 sans + tabular 次级小数字），半径词汇收敛为四种（`rounded-cf-sm`/`rounded-cf-md`/`rounded-full`/`rounded-none`），并以守护单测锁定禁裸 `rounded` / `rounded-[` / `rounded-(sm|md|lg|xl)`。
- **共享原语抽取**：`PageHeader`、`PageShell`、`IconBox`、`StatCard`、`SectionForm` 五个原语，替换 7+ 页手写头卡、23 处手写图标方块、两处逐字重复的 StatCard，并作为详情页分区外壳统一底座。
- **未定义 `type-*` 类修复（10 处）**：`type-label-small` 补定义、`type-headline-small` 随 `StatCard` 换 `type-display-small`、`type-heading-small` 换 `type-title-medium`。
- **上游编辑重构**：新增 `/upstreams/[id]` 详情页，左侧 sticky 分区导航，**13 分区各自独立表单、独立 dirty 检测、独立 partial 保存**；瘦 create dialog 仅收必填项，创建后跳详情页补全；`upstream-form-dialog.tsx` 拆解后删除。
- **上游列表重构**：大卡片网格 → 按 priority tier 分组的紧凑行表（LED + 名称 + 熔断 StateChip + 关键指标 + 行操作），并**恢复连接测试动作**（修 `onTest` 声明却从未调用的死 bug）。
- **密钥编辑重构**：新增 `/keys/[id]` 详情页（基础信息 / 访问模式与上游授权 / 花费规则 / 模型白名单 / 到期），同分区独立保存模式；瘦 create dialog 保留一次性密钥展示后跳转；`edit-key-dialog.tsx` 删除。
- **其余页面分级处置**：billing 组件化（IA 不变）、logs-table 抽子组件（DOM 等价）、admin 各页接共享原语与契约对齐、portal + login 排印/半径对齐；**修 settings 页缺 users/cliproxy 两入口 bug**。
- **清退 terminal 版 StatusLed**：`ui/terminal/status-led.tsx` 仍被 `upstreams-table.tsx` 消费，非死代码；行表改用 `ui/status-led.tsx` 后于 Phase B3 再删（删前 grep 复核无消费者）。
- 保留 View Transitions morph（create / delete / revoke / portal ×3 / billing-reset），仅撤除被页面跳转取代的 edit morph；单 PR、分阶段提交。

## Capabilities

### New Capabilities

- `api-key-management-workbench`: 管理台 API Key 编辑工作台——密钥编辑从单体弹窗迁移到 `/keys/[id]` 详情页，按基础信息 / 访问模式与上游授权 / 花费规则 / 模型白名单 / 到期分区，各分区独立表单独立保存；瘦 create 流程保留一次性密钥一次可见后跳转补全。

### Modified Capabilities

- `frontend-visual-foundation-v2`: 半径词汇从多套并行收敛为四种令牌类白名单并以守护单测锁定；补齐此前未定义、静默退化的 `type-*` 排印类；新增“页面级共享结构原语必须统一复用”的基础约束。
- `data-display-and-interaction-v2`: 数据数字排印从四套无契约并行升级为三档强制契约（英雄/KPI、密集/标识符、次级小数字），并新增统一 `StatCard` 原语作为 Tier-1 数字唯一承载。
- `admin-console-layout-v2`: 页面区块模板要求从“统一模板”强化为“必须复用共享页面原语（PageHeader/PageShell/IconBox）”；修复设置页缺失用户管理与 CLIProxy 入口的导航完整性缺陷。
- `upstream-operations-workbench`: 上游列表从大卡片网格改为按 tier 分组的紧凑行表（LED + 熔断芯片 + 关键指标 + 展开行），操作区恢复连接测试动作，编辑入口由内联弹窗改为跳转详情页。
- `upstream-endpoint-experience`: 上游长表单编辑从弹窗内锚点跳转改为独立详情页 + sticky 分区导航，并新增“各配置分区独立表单、独立 dirty 检测、独立分区级保存”的编辑范式（取代整表单一次保存与离开二次确认）。

## Impact

- **前端页面**：新增 `src/app/[locale]/(dashboard)/upstreams/[id]/page.tsx`、`keys/[id]/page.tsx`；改造 upstreams / keys 列表页、billing、logs、dashboard、system/users、system/cliproxy、traffic-recording、background-sync、failure-rules、header-compensation、settings、portal 四页与 login。
- **组件**：新增 `admin/page-header.tsx`、`admin/page-shell.tsx`、`ui/icon-box.tsx`、`dashboard/stat-card.tsx`、`admin/section-form.tsx`；新增 `admin/upstream/sections/*.tsx`、`admin/billing/*`、`logs/*` 子组件；删除 `upstream-form-dialog.tsx`、`edit-key-dialog.tsx`；Phase B3 行表迁移后删除 `ui/terminal/status-led.tsx`（消费者迁走后）。
- **hooks**：新增 `useUpstream(id)`、`useApiKey(id)`；复用 `useToggleUpstreamActive` 的 optimistic + 回滚范式做分区保存。
- **令牌 / 样式**：`src/app/globals.css` 补 `.type-label-small`；全仓半径 sweep（30 + 10 + 13 处）；`tailwind.config.ts` 删裸 `sm`/`md`/`lg` 半径别名（保留 `--vr-radius-lg` 令牌本体）。
- **i18n**：`src/messages/{en,zh-CN}.json` 新增详情页 / 分区 / 原语文案，双语同落。
- **测试**：半径守护单测、分区 payload 单测（partial 只含本区字段、`api_key` 空省略）、共享原语组件测试、`upstreams/[id]` 详情页 E2E、logs/settings/billing 的 visual/a11y 覆盖，`admin-page-mocks` 补 `GET /admin/upstreams/[id]` 与 `keys/[id]` stub；`billing-tier-flow` / `logs-routing-decision` / `user-management` / `portal-self-service` 各 spec 守护。
- **后端 / API / 数据库**：零改动（复用已有 GET 单条与全 optional PUT）。
- **不在范围**：billing 信息架构、logs-table 完整拆分、portal 表单形态合并、后端服务、VitePress docs 站。
