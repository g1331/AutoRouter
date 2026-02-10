## 1. 数据库 Schema 扩展

- [ ] 1.1 在 `src/lib/db/schema.ts` 的 upstreams 表新增 `affinityMigration` JSON 字段（nullable），包含 `enabled`、`metric`、`threshold` 三个属性
- [ ] 1.2 生成并应用数据库迁移（`pnpm db:generate && pnpm db:migrate`）
- [ ] 1.3 在 `src/types/api.ts` 中新增 `AffinityMigrationConfig` 类型定义，更新 Upstream 相关类型

## 2. 会话亲和性核心模块

- [ ] 2.1 创建 `src/lib/services/session-affinity.ts`，实现 `SessionAffinityStore` 类（内存 Map + TTL 管理 + 定期清理），缓存条目包含 `upstreamId`、`lastAccessedAt`、`contentLength`、`cumulativeTokens`
- [ ] 2.2 实现 `extractSessionId(providerType, headers, bodyJson)` 函数，支持 Anthropic（metadata.user_id 中提取 session UUID）和 OpenAI（headers.session_id）两种提取策略
- [ ] 2.3 实现 `updateCumulativeTokens(fingerprint, usage)` 方法，在响应完成后将 input tokens（含 cache_read + cache_creation + input）累加到缓存条目
- [ ] 2.4 编写 `tests/unit/services/session-affinity.test.ts`，覆盖：缓存写入/查询/TTL 过期/定期清理/会话标识符提取（Anthropic/OpenAI/无标识符）/token 累计更新

## 3. 负载均衡器集成

- [ ] 3.1 修改 `selectFromProviderType` 函数签名，新增可选参数 `sessionId` 和 `contentLength`，在分层选择逻辑前插入亲和性查询
- [ ] 3.2 实现亲和性路由逻辑：缓存命中且上游可用时直接返回，否则走正常选择并写入/更新缓存
- [ ] 3.3 更新 `tests/unit/services/load-balancer.test.ts`（如存在）或新建测试，覆盖：有亲和性绑定且上游可用、绑定上游不可用时重新选择、无 sessionId 时行为不变

## 4. 智能迁移逻辑

- [ ] 4.1 在 `session-affinity.ts` 中实现迁移评估函数 `shouldMigrate(currentUpstream, candidates, contentLength, cumulativeTokens)`，根据目标上游的 metric 配置选择使用 tokens（优先）或 length 进行阈值比较
- [ ] 4.2 在负载均衡器的亲和性路由命中路径中集成迁移评估，满足条件时迁移并更新缓存
- [ ] 4.3 编写迁移逻辑测试，覆盖：tokens 指标下迁移/不迁移、length 指标下迁移/不迁移、首次请求（cumulativeTokens=0）时允许迁移、未配置迁移时保持、当前已是最高优先级时不评估

## 5. 代理路由集成

- [ ] 5.1 将 `extractModelFromRequest` 扩展为 `extractRequestContext`，一次解析同时提取 model 和 sessionId（避免重复解析 body）
- [ ] 5.2 在 `forwardWithFailover` 中将 sessionId 和 contentLength 传递给 `selectFromProviderType`
- [ ] 5.3 在响应完成后（usage 提取之后），调用 `affinityStore.updateCumulativeTokens` 将 token 数据回写到亲和性缓存
- [ ] 5.4 更新代理路由测试，验证 sessionId 正确提取并传递到上游选择逻辑，以及 token 累计回写

## 6. 上游 API 扩展

- [ ] 6.1 更新上游 CRUD API（`src/app/api/admin/upstreams/`），支持 `affinityMigration` 字段的创建、读取、更新
- [ ] 6.2 添加 `affinityMigration` 字段的输入验证（metric 枚举校验、threshold 正整数校验）
- [ ] 6.3 更新上游 API 测试，覆盖 affinityMigration 字段的 CRUD 操作

## 7. 前端上游配置

- [ ] 7.1 在上游编辑/创建表单中新增亲和性迁移配置区域（开关 + metric 选择 + threshold 输入）
- [ ] 7.2 添加 i18n 翻译（en/zh）
- [ ] 7.3 更新前端 hooks（use-upstreams）以支持新字段的读写
