# Change: API Key 管理和上游动态配置

## Why

当前系统是一个基础的 AI API 代理，但缺少核心的**中转路由器**能力：

1. **缺少 Key 分发机制** - 下游客户端必须知道真实的上游 API key，无法实现 key 隔离
2. **配置不灵活** - 上游配置硬编码在环境变量中，无法运行时动态修改
3. **无权限控制** - 任何人都可以访问所有配置的上游，无法实现多租户隔离
4. **无使用追踪** - 不记录请求日志，无法进行配额管理和成本分析

这限制了系统作为企业级 AI Gateway 的能力，无法支持多用户、配额控制、成本优化等核心场景。

## What Changes

### Phase 1: 核心 Key 管理和验证（本次实现）

**数据库层**：
- 新增 `api_keys` 表 - 存储分发给客户端的 key 及其权限
- 新增 `upstreams` 表 - 将上游配置从环境变量迁移到数据库
- 新增 `request_logs` 表 - 记录所有请求用于后续分析
- 实现数据库 migrations (Alembic)

**认证和授权**：
- 新增 API Key 验证中间件 - 验证客户端的 Bearer token
- 实现基于 key 的上游访问控制 - key 只能访问授权的上游列表
- 加密存储上游 API keys - 使用 Fernet 加密

**API 端点**：
- `POST /admin/keys` - 创建新的 API key
- `GET /admin/keys` - 列出所有 keys（分页）
- `DELETE /admin/keys/{id}` - 撤销 key
- `POST /admin/upstreams` - 添加上游配置
- `GET /admin/upstreams` - 列出上游
- `PUT /admin/upstreams/{id}` - 更新上游配置
- `DELETE /admin/upstreams/{id}` - 删除上游

**向后兼容**：
- 保留现有的环境变量 `UPSTREAMS` 配置方式作为 fallback
- 如果数据库中没有上游，则从环境变量读取（用于首次启动）

### Phase 2: 配额和限流（后续）
- Token 使用量统计和配额
- 请求频率限流
- 费用计算和预算控制

### Phase 3: 高级路由（后续）
- 上游分组管理
- 多路径前缀支持（`/proxy-gpt/*`, `/proxy-claude/*`）
- 智能故障转移和负载均衡

## Impact

**Affected specs**:
- 新建 `api-key-auth` - API Key 认证和授权规范
- 修改 `api-proxy` (如果存在) - 代理路由需要集成认证

**Affected code**:
- `app/core/deps.py` - 新增认证依赖注入
- `app/api/routes/proxy.py` - 集成 key 验证
- `app/models/` - 新增数据模型 (APIKey, Upstream, RequestLog)
- `app/db/` - 新建数据库配置模块
- `app/main.py` - 初始化数据库连接
- `alembic/` - 数据库 migrations

**Breaking Changes**:
- 无 - 保持向后兼容，环境变量配置仍然有效

**Dependencies**:
- 新增 `cryptography` - 用于加密上游 API keys（Fernet）和哈希客户端 keys（bcrypt）
- 新增 `cachetools` - 用于 LRU 缓存（TTLCache）
- 新增 `apscheduler` - 用于定时清理过期日志
- 现有的 `sqlalchemy`, `alembic` 将被实际使用

**Security Considerations**:
- 上游 API keys 必须加密存储（Fernet），不能明文
- 客户端 API keys 使用 bcrypt 哈希存储（work factor=12），数据库泄露不会暴露实际 key
- `ENCRYPTION_KEY` 必须通过环境变量提供（fail-fast），并妥善备份
- Admin API 需要额外的认证保护（简单 bearer token，统一返回 403）
