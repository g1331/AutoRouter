## 1. 数据模型与接口契约

- [x] 1.1 为 `upstreams` 数据模型新增 `routeCapabilities` 字段（PG/SQLite schema 与类型导出同步）
- [x] 1.2 在上游创建与更新接口中接入 `routeCapabilities` 读写与参数校验
- [x] 1.3 在 `src/types/api.ts` 补齐 `route_capabilities` 的请求/响应类型定义
- [x] 1.4 实现旧字段到新能力集合的默认映射函数，并在迁移/启动流程中可幂等执行

## 2. 路径能力匹配与路由主流程

- [x] 2.1 新建路径能力映射模块，支持方法+路径到能力类型的标准化匹配
- [x] 2.2 在 `handleProxy` 中接入“路径优先、模型兜底”的决策入口
- [x] 2.3 重构候选集构建逻辑为“能力过滤 → 授权过滤 → 健康过滤”
- [x] 2.4 将过滤后候选接入现有优先级与故障转移流程，确保无回归
- [x] 2.5 补充无候选场景的统一错误返回与用户提示

## 3. 会话亲和性适配

- [x] 3.1 将会话提取逻辑从 `providerType` 维度改为 `routeCapability` 维度
- [x] 3.2 将亲和性缓存键从 `apiKeyId+providerType+sessionId` 升级为 `apiKeyId+routeCapability+sessionId`
- [x] 3.3 调整亲和性命中判定，禁止跨能力类型复用会话绑定
- [x] 3.4 校验亲和性迁移与累计 token 统计在新键模型下保持正确

## 4. 管理端能力配置与展示

- [x] 4.1 在上游创建/编辑表单新增能力多选组件并支持回显
- [x] 4.2 在上游列表新增能力图标徽章展示并保持移动端可读性
- [x] 4.3 为能力配置补齐中英文文案与表单校验提示
- [x] 4.4 保留兼容字段展示路径并标注迁移期说明
- [x] 4.5 实现统一能力图标映射表与兜底通用图标策略（避免空图标）
- [x] 4.6 实现多能力并存展示规则，确保一个上游可同时显示多个能力徽章
- [x] 4.7 补充前端交互测试，覆盖能力多选、回显、图标兜底场景

## 5. 路由日志与可观测性

- [x] 5.1 扩展路由决策日志结构，新增 `matched_route_capability` 与 `route_match_source`
- [x] 5.2 在请求日志写入链路中记录能力候选数量与兜底来源
- [x] 5.3 在日志展示端补充能力命中信息展示位

## 6. 测试与发布保障

- [x] 6.1 为路径能力匹配模块新增单元测试，覆盖 Claude/Codex/Gemini/OpenAI 常见路径
- [x] 6.2 为代理路由新增单元与集成测试，覆盖路径命中、模型兜底、无候选错误
- [x] 6.3 为上游多能力配置新增 CRUD 测试与参数校验测试
- [x] 6.4 为会话亲和性新增回归测试，覆盖新键策略与跨能力隔离
- [x] 6.5 完成 `pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm test:run` 并修复阻断项

## 7. 去兼容提供商字段（provider_type）与模型兜底

- [x] 7.1 同步 proposal/design/specs：未命中路径能力不再走模型兜底，`provider_type` 从契约移除
- [x] 7.2 移除 `model-router` 在代理主链路的依赖，`handleProxy` 改为纯路径能力路由
- [x] 7.3 负载均衡入口从 `selectFromProviderType` 重构为按候选上游集合选择
- [x] 7.4 会话提取与亲和性范围仅接受 `routeCapability`，移除 provider fallback 分支
- [x] 7.5 上游 CRUD、Admin API、类型定义移除 `provider_type` 输入输出字段
- [x] 7.6 管理端移除“兼容提供商”配置与展示列，保留能力多选与模型规则
- [x] 7.7 更新数据库 schema（PG/SQLite）移除 `upstreams.provider_type` 并清理相关索引依赖
- [x] 7.8 补齐并修复测试，覆盖纯路径路由、无路径能力错误、去 provider 字段后的 CRUD 与 UI
- [x] 7.9 完成 `pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm test:run` 并修复阻断项

## 8. 路径子路径回归修复与可观测性补强

- [x] 8.1 复现并新增测试：`matchRouteCapability` 需支持代理内部子路径（如 `responses`、`chat/completions`）
- [x] 8.2 修复能力匹配标准化逻辑，兼容 `v1/...` 与子路径两种输入形态
- [x] 8.3 修复代理路由测试样例，覆盖真实 catch-all `params.path` 形态（不再强依赖 `v1` 前缀）
- [x] 8.4 为路径路由早返回分支补齐结构化告警日志，覆盖未命中能力/无候选/未授权/不健康
- [x] 8.5 同步 proposal/design/spec，补充路径标准化与 `base_url + path` 拼接约定

## 9. 验收回归补强（verify-change follow-up）

- [x] 9.1 为路径路由早返回四分支补齐日志断言测试（未命中能力 / 无候选 / 未授权 / 全不健康）
- [x] 9.2 新增“授权候选全不健康”场景测试，确保返回 `ALL_UPSTREAMS_UNAVAILABLE` 且不发送上游请求
