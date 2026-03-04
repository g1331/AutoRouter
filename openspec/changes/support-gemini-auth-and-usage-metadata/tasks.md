## 1. 基线校准与测试补桩

- [ ] 1.1 梳理并固定当前代理鉴权与 usage 解析基线样例，补充最小复现输入（验收：形成可直接运行的失败/对照测试用例）
- [ ] 1.2 在 `tests/unit/api/proxy/route.test.ts` 增加 `x-api-key` 与 `x-goog-api-key` 入站鉴权场景（验收：覆盖成功鉴权、缺失头、无效 key、过期 key）
- [ ] 1.3 在 `tests/unit/services/proxy-client.test.ts` 与 `tests/unit/services/request-logger.test.ts` 增加 Gemini usageMetadata 样例（验收：包含 total 缺失回退场景）

## 2. 入站鉴权与出站头替换改造

- [ ] 2.1 在代理入口实现多头 API key 提取优先级 `authorization -> x-api-key -> x-goog-api-key`（验收：保持现有 401 语义不变）
- [ ] 2.2 增加入站鉴权来源标记 `authSource`，并接入调试/观测输出（验收：可区分三类来源）
- [ ] 2.3 改造 `injectAuthHeader` 为 provider 驱动的注入策略并清理全部入站鉴权头（验收：google 使用 `x-goog-api-key`，openai/custom 使用 `Authorization`，anthropic 使用 `x-api-key`）
- [ ] 2.4 扩展 `headerDiff` 与 recorder 脱敏名单覆盖 `x-goog-api-key`（验收：观测输出中无明文密钥）

## 3. usage 归一化统一实现

- [ ] 3.1 提取共享 usage 归一化核心并让 `extractUsage` 与 `extractTokenUsage` 复用（验收：同载荷双路径输出一致）
- [ ] 3.2 实现 Gemini `usageMetadata` 到内部字段映射与回退逻辑（验收：`prompt/completion/total/cacheRead` 全部可用）
- [ ] 3.3 实现 Anthropic `cache_creation.ephemeral_5m_input_tokens` 与 `ephemeral_1h_input_tokens` 解析（验收：细分字段与总写入字段关系明确且可测试）
- [ ] 3.4 保持 OpenAI/Anthropic 既有样例不回归（验收：原有测试快照与关键断言保持通过）

## 4. 数据模型、接口与界面联动

- [ ] 4.1 为 `request_logs` 增加 TTL 细分字段迁移并更新 PG/SQLite schema（验收：迁移可执行且默认值兼容历史数据）
- [ ] 4.2 更新 `types/api.ts` 与 `api-transformers` 输出新字段（验收：日志 API 返回模型字段齐全）
- [ ] 4.3 更新日志明细 UI 展示缓存写入 TTL 细分（验收：仅在值大于 0 时显示，主布局不变）
- [ ] 4.4 校对 billing 输入映射，确保新增字段不会破坏现有成本计算（验收：cache read/write 计算结果与预期一致）

## 5. 回归验证与交付门禁

- [ ] 5.1 运行并通过定向测试集合（验收：proxy route、proxy client、request logger、auth 相关测试全部通过）
- [ ] 5.2 运行全量质量门禁 `pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm test:run`（验收：无阻断错误）
- [ ] 5.3 复核 OpenSpec 变更完整性并更新任务勾选状态（验收：`openspec status --change support-gemini-auth-and-usage-metadata` 显示 apply-ready）
