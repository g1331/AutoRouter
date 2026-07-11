> 每个 code-touching 任务都含对应测试；每个 ## 分组对应一次提交，收尾任务负责过质量门禁并提交。
> 固定验证（每提交前）：`pnpm exec tsc --noEmit` + `pnpm lint`（pre-commit 不跳过）→ 最窄对应测试 → 渲染契约改动推送前本地 `pnpm e2e --workers=2` → 暗/亮双主题浏览器 spot check + 保留 morph 冒烟（视觉校验代理执行）。

## 1. Phase A · 设计统一契约与共享原语（提交 `feat(ops-console)` A）

- [x] 1.1 `globals.css` 补 `.type-label-small` 定义（label 尺度底端档，含字距）
- [x] 1.2 未定义 `type-*` 类修复：`type-headline-small`（portal/page.tsx:34、users/[id]/page.tsx:43）随共享 StatCard 换 `type-display-small`；`type-heading-small`（failure-rules/page.tsx:30）换 `type-title-medium`；`type-label-small` 命中点（login ×5、hero-section、edit-user-dialog）接新定义
- [x] 1.3 全仓半径 sweep：`rounded-md`(30 处/8 弹窗文件)→`rounded-cf-md`；裸 `rounded`(10 处)→`rounded-cf-sm`；任意值 13 处按映射归并（[1/2/5/6px]→cf-sm、[8/10px]→cf-md、[18/22px]→rounded-full）
- [x] 1.4 从 `tailwind.config.ts` 删裸 `sm`/`md`/`lg` 半径别名（保留 `--vr-radius-lg` 令牌本体）
- [x] 1.5 新增半径守护单测 `tests/unit/radius-style-guard.test.ts`：禁裸 `rounded`、`rounded-[`、`rounded-(sm|md|lg|xl)`；含 `rounded-cf-*`/`rounded-full`/`rounded-none`/方向类反例断言不误伤
- [x] 1.6 抽取 `admin/page-header.tsx`（PageHeader）与 `admin/page-shell.tsx`（PageShell，maxWidth prop），含组件测试
- [x] 1.7 抽取 `ui/icon-box.tsx`（IconBox，size/tone）+ 组件测试；Phase A 仅在 settings 首个接入，**不做全仓一次性替换**——其余存续文件的替换随各自阶段落地（B/C 重构文件在重构中直接用 IconBox，D3 对齐组覆盖存续 admin 页面），避免替换将被 B2/C2 拆解或删除的文件（upstream-form-dialog、edit-key-dialog 等）
- [x] 1.8 抽取 `dashboard/stat-card.tsx`（StatCard，Tier-1 数字），合并 portal `OverviewStatCard` 与 users/[id] `StatCard`（消除重复与 type-* bug），含组件测试
- [x] 1.9 抽取 `admin/section-form.tsx`（SectionForm：标题 + dirty 徽标 + 保存/重置底栏，disabled-until-dirty），含组件测试
- [x] 1.10 `live-pulse-bar.tsx` 全部主指标迁 Tier 1（Saira `font-display` + tabular-nums）；topbar 字号档由双主题实测定档
- [x] 1.11 修 settings 页缺 users/cliproxy 两入口 bug；header-compensation 非标骨架归一到 PageShell
- [x] 1.12 就地将 `ui/terminal/status-led.tsx` 的 `rounded-[6px]` 迁移为 `rounded-cf-sm`（该组件仍被 `upstreams-table.tsx` 消费，**本阶段不可删**）；注意存在两个 StatusLed：terminal 版（status/showLabel/label API）vs `ui/status-led.tsx`（tone/pulse API），保留后者，terminal 版删除改期至 Phase B3（task 4.4）
- [x] 1.13 新增串双语同落 `src/messages/{en,zh-CN}.json`（namespace 顶层无点号）
- [x] 1.14 验收并提交：tsc + lint + 半径守护单测 + 新组件测试绿；双主题 spot check（dashboard/settings/portal 概览）；提交

## 2. Phase B1 · useUpstream + 瘦 create + 详情页骨架（提交 `feat(upstreams)` B1）

- [x] 2.1 新增 `useUpstream(id)` hook（queryKey `["upstreams", id]`），含 hook 单测
- [x] 2.2 从 `editUpstreamFormSchema` 抽取分区子 schema 片段与共享 helper（coerce 函数、endpoint preview、VirtualCatalogEntryList）下沉 `src/components/admin/upstream/`
- [x] 2.3 瘦 `create-upstream-dialog.tsx`：仅必填（name、base_url、route_capabilities、api_key）→ 创建成功 `router.push` 详情页；保留 `morph-upstream-form`（指向 create）
- [x] 2.4 新增 `/upstreams/[id]/page.tsx` 详情页骨架：照抄 users/[id] 惯例（useParams + Topbar + ghost 返回 + ApiError 404 分支）+ 左侧 sticky 分区导航（滚动锚点，scroll-pt-14）
- [x] 2.5 `admin-page-mocks` 补 `GET /admin/upstreams/[id]` stub；auth-role-routing.spec 现有锚点保持
- [x] 2.6 验收并提交：tsc + lint + hook 单测绿；create dialog morph 冒烟；本地 e2e --workers=2 绿；详情页骨架双主题 spot check；提交

## 3. Phase B2 · 13 分区表单 + 分区独立保存（提交 `feat(upstreams)` B2）

- [x] 3.1 分区体迁入 `src/components/admin/upstream/sections/*.tsx`（basic-name/profile/route-endpoint/api-key/diagnostics、priority-weight、model-routing、billing-multipliers、spending-quota、capacity-control、circuit-breaker、failure-rules、affinity-migration）
- [x] 3.2 各分区独立 useForm + 分区子 Zod schema + dirty 检测 + SectionForm 外壳 + partial PUT（只含本分区字段），optimistic 照抄 `useToggleUpstreamActive`；onSettled 统一失效 `["upstreams", id]` 与列表缓存
- [x] 3.3 api-key 分区 write-only：空不提交 + 占位提示「留空保持不变」；failure-rules 分区含 `use_global_rules` 开关（走 `{ failure_rule_config }` partial PUT）+ 内嵌 `UpstreamFailureRulesEditor`（规则 CRUD 沿用其自保存）
- [x] 3.4 移除失效的 `description` 字段：basic-profile 分区不再渲染/提交 description（已确认无 DB 列、create/update schema 均不接收，静默 strip；补列属 Non-Goals 之外的后端改动），仅保留 official_website_url
- [x] 3.5 分区 payload 单测：断言各分区 partial 只含本区字段、api_key 空省略、access 语义正确、**basic-profile 载荷只含已持久化字段（official_website_url，不含 description）**
- [x] 3.6 验收并提交：tsc + lint + 分区 payload 单测绿；13 分区双主题 spot check + 各分区保存冒烟；提交

## 4. Phase B3 · 列表行表 + Test 修复 + 删旧弹窗（提交 `feat(upstreams)` B3）

- [ ] 4.1 上游列表大卡片网格 → 按 priority tier 分组紧凑行表（LED + 名称/base_url + 熔断 StateChip + 关键指标 Tier-2/3 + **最近使用相对时间「N 分钟前」/「未使用」常驻 compact 行内，满足 baseline「时间信息以最近使用为主」** + 展开行装原卡片密集信息）；compact/comfortable 切换沿用
- [ ] 4.2 行操作：active 开关、**Test（恢复 onTest 调用，修死 bug）**、Edit（跳详情页）、Delete（保留 `morph-upstream-delete`）、熔断恢复；撤除 edit morph
- [ ] 4.3 拆解后删除 `upstream-form-dialog.tsx`（分区体与 helper 已迁出）
- [ ] 4.4 行表改写后列表 LED 全面改用 `@/components/ui/status-led`（tone/pulse API）；确认 terminal 版 StatusLed 无剩余消费者后（精确字面 grep 复核），删除 `ui/terminal/status-led.tsx`、其 barrel 导出行（`ui/terminal/index.ts`）与 `tests/components/ui/terminal/status-led.test.tsx`
- [ ] 4.5 新增 upstreams 详情页 e2e；列表 + 详情 visual/a11y 基线；auth-role-routing 锚点（`text=openai-primary` 等）保持渲染
- [ ] 4.6 验收并提交：tsc + lint + upstreams 相关单测/e2e 绿；本地 e2e --workers=2 绿；列表 + Test 动作 + delete morph 双主题冒烟；提交

## 5. Phase C1 · useApiKey + /keys/[id] 详情页 + 瘦 create（提交 `feat(keys)` C1）

- [ ] 5.1 新增 `useApiKey(id)` hook（queryKey `["keys", id]`），含 hook 单测；`admin-page-mocks` 补 `GET /admin/keys/[id]` stub
- [ ] 5.2 新增 `/keys/[id]/page.tsx` 详情页 + 分区：基础信息 / 访问模式与上游授权（合区提交避跨字段校验失败）/ 花费规则 / 模型白名单（key-model-allowlist-section 整块迁入）/ 到期；复用 SectionForm + partial PUT
- [ ] 5.3 瘦 create dialog（必填项）→ 创建成功先展示一次性密钥（沿用 show-key 逻辑）→ 跳详情页补全；`morph-key-form` 留给 create
- [ ] 5.4 分区 payload 单测（partial 只含本区字段、access_mode/upstream_ids 同区、spending_rules 空省略语义）；keys 详情页 e2e + visual/a11y
- [ ] 5.5 验收并提交：tsc + lint + keys 单测/e2e 绿；create + 一次性密钥展示 morph 冒烟；本地 e2e --workers=2 绿；双主题 spot check；提交

## 6. Phase C2 · keys 列表接线 + 删 edit-key-dialog（提交 `feat(keys)` C2）

- [ ] 6.1 keys-table 行内 Edit 改跳 `/keys/[id]` 详情页；`morph-key-revoke` 保留
- [ ] 6.2 删除 `edit-key-dialog.tsx`（788 行）
- [ ] 6.3 更新 keys 页已有 visual/a11y 基线；user-management/相关 spec 锚点保持
- [ ] 6.4 验收并提交：tsc + lint + keys 相关单测/e2e 绿；revoke morph 冒烟；本地 e2e --workers=2 绿；提交

## 7. Phase D1 · billing 组件化去重（提交 `refactor(billing)` D1）

- [ ] 7.1 抽 `BillingPriceRow` + `useBillingPriceRowEdit` 统一四路重复编辑逻辑，页面拆到 `src/components/admin/billing/*`；排印/半径对齐；**IA 不动**；`morph-billing-override-reset` 保留
- [ ] 7.2 billing 相关单测（编辑逻辑去重后行为等价）；`billing-tier-flow.spec` 全程守护 + 为 billing 补 visual/a11y 覆盖
- [ ] 7.3 验收并提交：tsc + lint + billing 单测 + billing-tier-flow 绿；billing-reset morph 冒烟；本地 e2e --workers=2 绿；提交

## 8. Phase D2 · logs-table 抽子组件（提交 `refactor(logs)` D2）

- [ ] 8.1 抽最大 3-4 子组件到 `src/components/logs/*`（ThinkingConfigPanel、RequestKeyIdentity、ModelIdentity、LogRecordingSection 挂载点），**DOM 逐字不变**；完整拆分留后续
- [ ] 8.2 logs 相关组件测试；`logs-routing-decision.spec` 守护 + 为 logs 补 visual/a11y 覆盖（扩 admin-page-mocks）
- [ ] 8.3 验收并提交：tsc + lint + logs 单测 + logs-routing-decision 绿；本地 e2e --workers=2 绿；logs 页双主题 spot check；提交

## 9. Phase D3 · admin 对齐组（提交 `refactor(admin)` D3）

- [ ] 9.1 dashboard、system/users、system/cliproxy、traffic-recording、background-sync、failure-rules、header-compensation、settings 接 PageHeader/PageShell/IconBox/StatCard + 半径/排印契约对齐；完成后全仓 grep 核实无残留手写 amber 图标方块三连样式（IconBox 收敛到位）
- [ ] 9.2 为 settings 补 visual/a11y 覆盖；user-management/相关 spec 守护
- [ ] 9.3 验收并提交：tsc + lint + 相关单测/spec 绿；对齐各页双主题 spot check（无测试覆盖页由视觉校验代理浏览器兜底）；本地 e2e --workers=2 绿；提交

## 10. Phase D4 · portal + login 对齐（提交 `refactor(portal)` D4）

- [ ] 10.1 portal 四页接共享 StatCard；portal-usage-chart 仅 retheme 不合并形态；portal-key-dialog 半径/排印对齐（3 个 portal morph 保留）
- [ ] 10.2 login 半径令牌化 + type-label-small 修复（保留终端视觉身份）
- [ ] 10.3 `portal-self-service.spec` 守护；portal 已有 visual/a11y 基线更新
- [ ] 10.4 验收并提交：tsc + lint + portal 单测/spec 绿；portal 3 morph + login 双主题冒烟；本地 e2e --workers=2 绿；提交

## 11. Phase E · 全量验证与基线 + PR（提交 `test(ops-console)` E）

- [ ] 11.1 全量验证：`pnpm lint` + `pnpm format:check` + `pnpm exec tsc --noEmit` + `pnpm test:run --coverage` + `pnpm e2e --workers=2` + `pnpm build`（DB_TYPE=postgres）
- [ ] 11.2 visual 基线一次性重生成（含新增 upstreams/keys 详情页与 logs/settings/billing 覆盖）；a11y 全量复跑并按兜底档修复越界项
- [ ] 11.3 push 分支 + CI 绿 + 建 PR（按模板附前后截图与双主题对照，Closes 对应 issue）；停在交接边界（合并由用户决定）
- [ ] 11.4 OpenSpec：`openspec validate restructure-ops-console-pages` 通过；PR 合并后归档 change（前置 chore 提交 + `--no-ff` 合并按仓库 OpenSpec PR 工作流）
