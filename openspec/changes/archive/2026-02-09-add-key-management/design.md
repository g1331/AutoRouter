# Technical Design: API Key Management

## Context

AutoRouter 需要从一个简单的代理服务演进为企业级的 AI Gateway，核心是实现 **key 分发和权限控制**。

**约束**：

- 必须保持现有 API 的向后兼容性
- 数据库已配置（SQLite + SQLAlchemy），但尚未使用
- FastAPI 框架，支持依赖注入和中间件

**参考实现**：

- LiteLLM - 开源 AI Gateway，提供 key management 和 budget controls
- Kong Gateway - API Gateway 的权限控制模式

## Goals / Non-Goals

**Goals**:

- ✅ 客户端使用我们分发的 key，无需知道真实上游 API key
- ✅ 基于 key 的权限控制（哪些 key 可以访问哪些上游）
- ✅ 运行时动态修改上游配置（无需重启服务）
- ✅ 记录所有请求日志用于后续分析
- ✅ 上游 API key 加密存储

**Non-Goals** (Phase 2/3):

- ❌ 复杂的用户系统（暂时不实现用户注册登录）
- ❌ 配额和限流（Phase 2 实现）
- ❌ 多路径前缀路由（Phase 3 实现）
- ❌ 分布式部署支持（SQLite 足够）

## Decisions

### 1. Key 验证方式：哈希存储的 Bearer Token

**选择**：使用随机生成的 Bearer token，哈希后存储在数据库

- 格式：`sk-auto-<32字节base64随机字符>`（模仿 OpenAI key 格式）
- 存储：使用 bcrypt 哈希（work factor=12），仅存储哈希值
- 验证：每次请求计算哈希并查询数据库，带 LRU 缓存优化
- 显示：仅保留前缀 `sk-auto-xxxx` 用于管理界面显示

**替代方案**：

- JWT Token：无需每次查数据库，但难以撤销，且包含敏感信息
- 明文存储：性能稍好，但数据库泄露会暴露所有 key
- API Key + Secret：增加复杂度，但收益不大

**选择理由**：

- 安全：数据库泄露不会暴露实际 key 值
- 可撤销：修改 is_active 字段即可
- 性能可控：LRU 缓存减少数据库查询（TTL 5分钟，撤销时清除）
- 符合最佳实践：与密码存储模式一致

### 2. 数据库 Schema 设计

**api_keys 表**：

```sql
CREATE TABLE api_keys (
    id UUID PRIMARY KEY,
    key_hash VARCHAR(128) UNIQUE NOT NULL,  -- bcrypt哈希，索引
    key_prefix VARCHAR(16) NOT NULL,  -- 'sk-auto-xxxx' 用于显示
    name VARCHAR(255) NOT NULL,
    description TEXT,
    user_id UUID NULL,  -- 预留，后续关联 users 表
    is_active BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_is_active ON api_keys(is_active);
```

**upstreams 表**：

```sql
CREATE TABLE upstreams (
    id UUID PRIMARY KEY,
    name VARCHAR(64) UNIQUE NOT NULL,
    provider VARCHAR(32) NOT NULL,  -- 'openai' | 'anthropic'
    base_url TEXT NOT NULL,
    api_key_encrypted TEXT NOT NULL,  -- Fernet 加密
    is_default BOOLEAN DEFAULT FALSE,
    timeout INTEGER DEFAULT 60,
    is_active BOOLEAN DEFAULT TRUE,
    config JSON NULL,  -- 预留，存储额外配置
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_upstreams_name ON upstreams(name);
CREATE INDEX idx_upstreams_is_active ON upstreams(is_active);
```

**api_key_upstreams 表**（join table，替代 JSON）：

```sql
CREATE TABLE api_key_upstreams (
    id UUID PRIMARY KEY,
    api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    upstream_id UUID NOT NULL REFERENCES upstreams(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(api_key_id, upstream_id)
);

CREATE INDEX idx_api_key_upstreams_api_key_id ON api_key_upstreams(api_key_id);
CREATE INDEX idx_api_key_upstreams_upstream_id ON api_key_upstreams(upstream_id);
```

**request_logs 表**：

```sql
CREATE TABLE request_logs (
    id UUID PRIMARY KEY,
    api_key_id UUID REFERENCES api_keys(id),
    upstream_id UUID REFERENCES upstreams(id),
    method VARCHAR(10),
    path TEXT,
    model VARCHAR(128),
    prompt_tokens INTEGER DEFAULT 0,
    completion_tokens INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    status_code INTEGER,
    duration_ms INTEGER,
    error_message TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- 分区键，用于后续分区表优化
    PARTITION BY RANGE (created_at)
);

CREATE INDEX idx_request_logs_api_key_id ON request_logs(api_key_id);
CREATE INDEX idx_request_logs_upstream_id ON request_logs(upstream_id);
CREATE INDEX idx_request_logs_created_at ON request_logs(created_at);
```

### 3. 上游 API Key 加密

**选择**：使用 `cryptography.fernet.Fernet` 对称加密

- 加密 key **必须**通过环境变量 `ENCRYPTION_KEY` 提供（32字节 base64 URL-safe）
- 如果未提供，应用启动失败（fail-fast），避免明文存储或不可恢复的数据
- 支持从文件读取：`ENCRYPTION_KEY_FILE=/path/to/key.txt`

**原因**：

- 对称加密足够（只有服务端需要解密）
- Fernet 提供认证加密（AEAD），防止篡改
- Fail-fast 避免运维错误（自动生成的 key 重启后会丢失）

**密钥管理**：

- 生成：`python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`
- 存储：使用 secrets management 服务（HashiCorp Vault, AWS Secrets Manager）或加密文件
- 备份：**必须**在首次部署时备份，丢失 key 会导致所有上游不可用
- 轮换：后续支持双 key 轮换机制（逐步解密旧 key，加密为新 key）

**风险**：

- `ENCRYPTION_KEY` 泄露会导致所有上游 key 泄露
- **缓解**：文档中强调必须安全存储，定期轮换，监控访问日志

### 4. 认证依赖注入 + LRU 缓存

**选择**：使用 FastAPI 依赖注入 + 进程内 LRU 缓存

```python
# app/core/deps.py
from functools import lru_cache
import bcrypt

# LRU 缓存: key_hash -> (api_key_obj, timestamp)
# 容量 10000, TTL 5分钟
api_key_cache = TTLCache(maxsize=10000, ttl=300)

async def get_current_api_key(
    authorization: str | None = Header(None, alias="Authorization"),
    db: AsyncSession = Depends(get_db)
) -> APIKey:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Invalid authorization header")

    key_value = authorization[7:]  # Remove "Bearer "
    key_hash = bcrypt.hashpw(key_value.encode(), bcrypt.gensalt()).decode()

    # 先查缓存
    if key_hash in api_key_cache:
        api_key = api_key_cache[key_hash]
        # 双重检查：验证未过期且仍然 active（防止撤销后缓存未清除）
        if api_key.is_active and (not api_key.expires_at or api_key.expires_at > datetime.utcnow()):
            return api_key

    # 缓存未命中，查数据库
    api_key = await db.execute(
        select(APIKey).where(
            APIKey.key_hash == key_hash,
            APIKey.is_active == True
        )
    )
    api_key = api_key.scalar_one_or_none()

    if not api_key:
        raise HTTPException(401, detail={"error":"invalid_api_key","message":"API key not found or inactive"})

    if api_key.expires_at and api_key.expires_at < datetime.utcnow():
        raise HTTPException(401, detail={"error":"api_key_expired","message":"API key has expired"})

    # 写入缓存
    api_key_cache[key_hash] = api_key
    return api_key

# 撤销 key 时清除缓存
async def revoke_api_key(key_id: UUID, db: AsyncSession):
    api_key = await db.get(APIKey, key_id)
    if api_key:
        api_key.is_active = False
        # 清除缓存
        if api_key.key_hash in api_key_cache:
            del api_key_cache[api_key.key_hash]
        await db.commit()

# 使用
@router.api_route("/v1/{path:path}", ...)
async def proxy_request(
    api_key: APIKey = Depends(get_current_api_key),
    upstream: UpstreamConfig = Depends(select_upstream),
    ...
):
    # 检查 api_key 是否有权限访问 upstream（查询 join table）
    has_permission = await db.execute(
        select(1).where(
            ApiKeyUpstream.api_key_id == api_key.id,
            ApiKeyUpstream.upstream_id == upstream.id
        )
    )
    if not has_permission.scalar():
        raise HTTPException(403, detail={"error":"forbidden","message":f"Not authorized for upstream: {upstream.name}"})
    ...
```

**原因**：

- 缓存减少 90%+ 数据库查询（热 keys）
- TTL 确保撤销后 5 分钟内生效
- 撤销时主动清除缓存，立即生效
- Admin API 可以使用不同的认证方式
- 易于测试（依赖注入可以 mock）

**性能指标**（目标）\*\*：

- 无缓存：每请求 +5-10ms（数据库查询 + bcrypt）
- 有缓存：每请求 <1ms（内存查询）
- P99 延迟增加 <10ms

### 5. 向后兼容策略 + 动态刷新

**Startup 逻辑**：

```python
from app.core.encryption import encrypt_upstream_key

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1. 初始化数据库
    await init_db()

    async with get_db_session() as db:
        # 2. 从数据库加载上游配置
        result = await db.execute(select(Upstream).where(Upstream.is_active == True))
        upstreams = result.scalars().all()

        # 3. 如果数据库为空，从环境变量导入（带加密）
        if not upstreams and settings.upstreams:
            for env_upstream in settings.upstreams:
                # ⚠️ 关键：必须加密 api_key
                encrypted_key = encrypt_upstream_key(env_upstream.api_key.get_secret_value())
                upstream_record = Upstream(
                    id=uuid4(),
                    name=env_upstream.name,
                    provider=env_upstream.provider,
                    base_url=str(env_upstream.base_url),
                    api_key_encrypted=encrypted_key,
                    is_default=env_upstream.is_default,
                    timeout=env_upstream.timeout
                )
                db.add(upstream_record)
            await db.commit()
            # 重新加载
            result = await db.execute(select(Upstream).where(Upstream.is_active == True))
            upstreams = result.scalars().all()

    # 4. 初始化可刷新的 UpstreamManager
    app.state.upstream_manager = RefreshableUpstreamManager(upstreams)
    app.state.db_session_factory = get_db_session  # 用于动态刷新

    yield

# 支持运行时刷新的 UpstreamManager
class RefreshableUpstreamManager(UpstreamManager):
    async def refresh_from_db(self, db: AsyncSession):
        """Admin API 修改上游后调用此方法刷新"""
        result = await db.execute(select(Upstream).where(Upstream.is_active == True))
        upstreams = result.scalars().all()
        self.upstreams = {u.name: u for u in upstreams}
        self.default_upstream = next((u for u in upstreams if u.is_default), upstreams[0] if upstreams else None)
```

**数据库不可用时的 fallback**：

```python
try:
    upstreams = await load_upstreams_from_db()
except DatabaseConnectionError:
    logger.warning("Database unavailable, falling back to environment variables")
    if settings.upstreams:
        upstreams = settings.upstreams  # 使用内存配置，只读模式
    else:
        raise RuntimeError("No database and no env upstreams - cannot start")
```

### 6. Admin API 保护

**Phase 1**：使用简单的 Bearer token（环境变量 `ADMIN_TOKEN`）

```python
def verify_admin_token(authorization: str | None = Header(None, alias="Authorization")):
    """验证 admin token，统一返回 403 避免泄露端点存在"""
    # 接受 optional header，统一处理
    if not authorization:
        raise HTTPException(403, detail={"error":"forbidden","message":"Admin access required"})

    # 规范化：移除大小写差异，统一格式
    auth_normalized = authorization.strip()
    if not auth_normalized.startswith("Bearer "):
        raise HTTPException(403, detail={"error":"forbidden","message":"Admin access required"})

    token = auth_normalized[7:]  # Remove "Bearer "
    if token != settings.admin_token:
        raise HTTPException(403, detail={"error":"forbidden","message":"Admin access required"})

# 应用到所有 admin 路由
@router.post("/admin/keys", dependencies=[Depends(verify_admin_token)])
async def create_api_key(...):
    ...
```

**Phase 2**（后续改进）：

- 实现独立的 admin 用户系统
- 使用 OAuth2 / OIDC
- 基于角色的访问控制 (RBAC)

### 7. 请求日志保留策略

**问题**：request_logs 表会无限增长，影响查询性能和存储

**策略**：

- **保留期限**：默认保留 90 天，可通过环境变量 `LOG_RETENTION_DAYS` 配置
- **清理机制**：定时任务（每天凌晨 2点）删除过期记录
- **归档选项**（Phase 2）：导出到 CSV/Parquet 文件后删除

**实现**：

```python
# app/services/log_cleaner.py
from apscheduler.schedulers.asyncio import AsyncIOScheduler

async def cleanup_old_logs(db: AsyncSession, retention_days: int = 90):
    """删除超过保留期的日志"""
    cutoff_date = datetime.utcnow() - timedelta(days=retention_days)
    result = await db.execute(
        delete(RequestLog).where(RequestLog.created_at < cutoff_date)
    )
    await db.commit()
    logger.info(f"Cleaned up {result.rowcount} old request logs")

# 在 lifespan 中启动定时任务
scheduler = AsyncIOScheduler(timezone='UTC')  # 使用 UTC 时区
scheduler.add_job(cleanup_old_logs, 'cron', hour=2, minute=0)  # UTC 02:00
scheduler.start()
```

**时区说明**：

- 清理作业使用 **UTC 时区**，每天 UTC 02:00 执行
- 避免夏令时问题，确保全球部署一致性
- 操作员可根据需要调整 cron 表达式

**索引优化**：

- SQLite 不直接支持 PARTITION BY，但可以定期创建归档表
- 为 created_at 创建索引加速删除操作

**缓存失效补充**：
当上游元数据变更时（如通过 Admin API 修改），系统行为：

- API key 缓存：仅在 revocation 时主动清除，其他情况依赖 TTL
- Upstream 缓存：Admin API 修改后调用 `upstream_manager.refresh_from_db()` 立即生效
- 如需立即清除所有 API key 缓存（罕见）：重启服务或实现 admin 端点 `POST /admin/cache/clear`

## Risks / Trade-offs

### Risk 1: 数据库性能瓶颈

- **风险**：每个请求都查询数据库验证 key
- **已缓解**：
  - ✅ 实现了 LRU 缓存（TTL 5分钟）
  - ✅ 数据库索引（key_hash 字段）
  - ✅ 撤销时主动清除缓存
  - P99 延迟预期 <10ms

### Risk 2: ENCRYPTION_KEY 管理

- **风险**：丢失 ENCRYPTION_KEY 会导致无法解密上游 API keys
- **缓解**：
  - 文档中明确说明必须备份
  - 支持通过环境变量或文件提供
  - 考虑后续集成 HashiCorp Vault 等 secrets 管理服务

### Risk 3: 数据库迁移失败

- **风险**：Alembic migration 可能失败，导致服务无法启动
- **缓解**：
  - 提供回滚脚本
  - 启动前检查数据库版本
  - 详细的迁移文档

## Migration Plan

### 数据迁移

1. 运行 `alembic upgrade head` 创建新表
2. 如果环境变量中有 `UPSTREAMS`，自动导入到数据库
3. 保留环境变量作为 fallback，不立即移除

### 配置迁移

**旧方式**（仍然支持）：

```env
UPSTREAMS='[{"name":"openai","provider":"openai",...}]'
```

**新方式**：

```bash
# 通过 Admin API 添加
curl -X POST http://localhost:8000/admin/upstreams \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"name":"openai","provider":"openai",...}'
```

### 回滚计划

如果需要回滚：

1. 设置环境变量 `USE_ENV_UPSTREAMS=true` 强制使用环境变量
2. 或运行 `alembic downgrade -1` 回退数据库

## Open Questions

1. **User 系统优先级**：
   - 当前 `api_keys.user_id` 是 nullable
   - 是否在 Phase 1 就实现基础的 users 表？
   - **决定**：Phase 1 跳过，user_id 保持 NULL

2. **多种认证方式共存**：
   - 是否允许同时支持 JWT 和 simple key？
   - **决定**：Phase 1 只实现 simple key，保持简单

3. **日志保留策略**：
   - request_logs 会无限增长，需要定期清理
   - **决定**：Phase 1 不实现自动清理，后续添加定时任务

4. **分布式部署**：
   - SQLite 不支持多实例写入
   - **决定**：Phase 1 只支持单实例，后续迁移到 PostgreSQL
