## 1. 服务端滚动窗口聚合器

- [x] 1.1 新增 `src/lib/services/live-pulse-aggregator.ts`，实现按秒分桶的 60 秒环形窗口：导出 `recordPulseSample({ statusCode, durationMs, totalTokens, occurredAt? })` 与 `getPulseWindowSnapshot()`；快照换算 req/min、错误率（非 2xx 占比）、平均延迟（仅成功请求）、TPM。
- [x] 1.2 实现过期桶清理逻辑：读取与写入时均剔除超过 60 秒的样本，保证窗口外样本不计入。
- [x] 1.3 新增 `tests/unit/services/live-pulse-aggregator.test.ts`，覆盖：窗口内聚合正确、过期样本移出窗口、错误率只统计非 2xx、平均延迟只算成功请求、无样本时返回零值快照。
- [x] 1.4 运行 `pnpm test:run` 相关用例与 `pnpm exec tsc --noEmit` 通过；提交本阶段。
  - 验收：聚合器单测全绿，类型检查通过；指标口径与 `specs/live-pulse-bar/spec.md` 中「滚动窗口」需求一致。

## 2. 取样接入与快照拼装（含网关健康信号）

- [x] 2.1 在 `src/lib/services/request-logger.ts` 的请求收口路径（终态写入处）调用 `recordPulseSample(...)`，仅在请求收口为终态、`durationMs/totalTokens` 已确定时取样；不在请求创建（进行中）处取样。
- [x] 2.2 新增快照拼装函数（新增 `live-pulse-service.ts`），合并滚动窗口快照与 `getAllHealthStatusWithCircuitBreaker()` 得到的健康上游数/总数、熔断打开数，产出完整 `LivePulseSnapshot`；定义其 TypeScript 类型。
- [x] 2.3 新增快照拼装单元测试：健康/熔断计数与传入的健康检查结果一致（打开/半开不计为关闭）；窗口指标与健康信号正确合并。
- [x] 2.4 运行相关测试与类型检查通过；提交本阶段。
  - 验收：取样仅发生在终态收口；快照拼装单测全绿；健康/熔断口径与 `routing-failover-observability` 既有真实状态一致。

## 3. 实时脉搏 SSE 端点

- [x] 3.1 新增 `src/app/api/admin/stats/live/route.ts`，鉴权复用 `validateAdminAuth`（`ADMIN_TOKEN` Bearer），与 `/api/admin/logs/live` 一致；`runtime = "nodejs"`、`dynamic = "force-dynamic"`。
- [x] 3.2 连接建立即推送一帧 `live-pulse` 快照，随后约每 2 秒推送一帧；保留约 15 秒心跳注释行；正确清理定时器与中止监听，避免断开后写入。
- [x] 3.3 提供降级拉取路径：`?mode=snapshot` 以普通 GET 返回一次性快照（供前端 fallback 使用）；缺失/无效凭据返回 401 且不泄露任何指标。
- [x] 3.4 运行 `pnpm lint` 与 `pnpm exec tsc --noEmit` 通过；提交本阶段。
  - 验收：未授权请求返回 401 且无指标数据；端点能稳定推送 `live-pulse` 帧并按断开清理资源。

## 4. 前端实时脉搏客户端与桌面状态条

- [x] 4.1 新增 `src/hooks/use-live-pulse.ts`，结构对齐 `use-request-log-live.ts`：连接 `/api/admin/stats/live`，解析 `live-pulse` 事件，维护快照与 `connecting/live/fallback` 三态；断线降级为定时拉取一次性快照。新增 `src/providers/live-pulse-provider.tsx`，在布局层只建立一条共享连接，供顶栏与移动端窄条共用，避免逐页重连。
- [x] 4.2 新增 `src/components/admin/live-pulse-bar.tsx`，纯展示组件：呈现在线指示灯（按三态着色）、req/min、错误率、平均延迟、TPM、健康上游数/总数、熔断打开数；错误率超阈值与熔断打开数 >0 时按既有错误/警示样式强调；数字格式跟随 next-intl 当前语言。含组件单元测试。
- [x] 4.3 扩展 `src/components/admin/topbar.tsx`，在右栏承载状态条（桌面端完整版，窄屏退化为紧凑版）；所有管理页因复用 `Topbar` 自动获得。
- [x] 4.4 在 `src/messages/en.json` 与 `src/messages/zh-CN.json` 新增 `livePulse` 命名空间文案键（指标标签、在线/降级提示等）。
- [x] 4.5 运行 `eslint`、`pnpm exec tsc --noEmit`、`prettier --check` 通过；提交本阶段。
  - 验收：桌面端各管理页顶栏常驻状态条，指标随推送更新，降级时指示灯转琥珀色并持续刷新；无流量时显示零值。

## 5. 移动端紧凑形态

- [ ] 5.1 为状态条提供紧凑形态（仅在线指示灯 + req/min + 错误率），在移动端 `Topbar` 隐藏时通过 `layout.tsx` 移动端页头区域或独立窄条展示，不挤压标题与返回导航。
- [ ] 5.2 校验移动端视口下紧凑形态正确显示且不破坏既有移动端布局；运行 `pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm format:check` 通过；提交本阶段。
  - 验收：移动端可见核心状态，标题与返回导航不被遮挡或挤压。

## 6. 校验与收尾

- [ ] 6.1 运行完整 `pnpm test:run` 与 `pnpm build`，确认无回归。
- [ ] 6.2 运行 `npx openspec validate live-pulse-bar --strict` 通过；逐项核对 `tasks.md` 勾选完成。
- [ ] 6.3 创建隔离功能分支并推送，开启 PR（遵循仓库 OpenSpec PR 工作流）；不自行合并。
  - 验收：CI 通过，PR 已开启待评审；变更可按需归档。
