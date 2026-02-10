## Why

当前系统的负载均衡是完全无状态的逐请求路由，同一对话的后续请求可能被分配到不同上游。这会导致大模型提供商侧的 Prompt Cache 失效，整个对话历史需要在新上游重新处理，产生显著的额外 token 费用和延迟。以 Anthropic 为例，一个 35K token 的对话从 cache_read（极低成本）变为 cache_create（约 12.5 倍），经济损失明显。

## What Changes

- 新增会话标识符提取能力，从请求中自动识别会话（Anthropic 的 `metadata.user_id`、OpenAI 的 `headers.session_id`）
- 新增内存级会话亲和性缓存（Session Affinity Store），将会话绑定到特定上游，TTL 与上游 Prompt Cache 生命周期对齐（默认 5 分钟滑动窗口）
- 在上游选择流程中集成亲和性查询，优先将同一会话的请求路由到同一上游
- 新增智能迁移机制：当更高优先级上游恢复时，根据对话大小决定是否迁移会话（短对话迁移，长对话保持亲和）
- 上游配置新增亲和性迁移选项（`affinityMigration`），由目标上游声明是否接受迁移及阈值

## Capabilities

### New Capabilities

- `session-affinity`: 会话亲和性核心能力，包括会话标识符提取、亲和性缓存存储、TTL 管理、与负载均衡器的集成
- `affinity-migration`: 智能迁移能力，包括上游级迁移配置、对话大小评估、优先级恢复时的迁移决策逻辑

### Modified Capabilities

（无现有 spec 需要修改）

## Impact

- **后端服务层**：`load-balancer.ts` 选择逻辑需要集成亲和性查询；新增 `session-affinity.ts` 模块
- **代理路由**：`proxy/v1/[...path]/route.ts` 需要提取会话标识符并传递给选择逻辑
- **数据库 Schema**：`upstreams` 表新增 `affinityMigration` JSON 配置字段
- **前端**：上游编辑表单新增亲和性迁移配置项
- **API**：上游 CRUD 接口需要支持新字段的读写
