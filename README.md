# AutoRouter - AI API Gateway

AutoRouter 是一个企业级 AI API Gateway，提供 API key 分发、权限控制、请求日志和多上游路由功能。

## 核心功能

- **API Key 管理**：分发和管理客户端 API keys，支持权限控制和过期时间
- **多上游路由**：支持 OpenAI、Anthropic 等多个 AI 服务提供商
- **权限控制**：基于 API key 的细粒度上游访问控制
- **请求日志**：记录所有请求用于审计、分析和成本追踪
- **安全存储**：API keys 使用 bcrypt 哈希，上游 keys 使用 Fernet 加密
- **Admin API**：完整的管理接口用于 keys 和 upstreams 的 CRUD 操作

## 目录结构

- `apps/api`：FastAPI 服务（AI Gateway 核心）
- `apps/web`：Next.js 前端（管理界面，待开发）
- `packages/`：预留复用包（UI、SDK、配置等）
- `openspec/`：OpenSpec 规范和变更提案

## 环境要求

- Python 3.12.x
- Node.js 18+ / 20+，`pnpm` 9+
- SQLite（默认）或 PostgreSQL（生产环境推荐）

## 快速开始

### 1. 安装依赖

```bash
cd apps/api
uv venv .venv --python 3.12
uv sync
```

### 2. 配置环境变量

复制 `.env.example` 到 `.env` 并填写必需的配置：

```bash
cp .env.example .env
```

**必需配置**：

```env
# 生成加密密钥（用于加密上游 API keys）
ENCRYPTION_KEY=$(python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")

# 设置 Admin API 访问令牌
ADMIN_TOKEN=your-secret-admin-token-here
```

⚠️ **重要**：请妥善备份 `ENCRYPTION_KEY`，丢失后所有上游 API keys 将无法解密！

### 3. 初始化数据库

```bash
cd apps/api
uv run alembic upgrade head
```

### 4. 启动服务

```bash
uv run uvicorn app.main:app --reload --port 8000
```

服务将在 `http://localhost:8000` 启动。

## 使用指南

### 创建上游服务

使用 Admin API 添加上游 AI 服务：

```bash
curl -X POST http://localhost:8000/admin/upstreams \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "openai",
    "provider": "openai",
    "base_url": "https://api.openai.com",
    "api_key": "sk-your-openai-key",
    "is_default": true,
    "timeout": 60
  }'
```

### 创建 API Key

为客户端生成 API key：

```bash
curl -X POST http://localhost:8000/admin/keys \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "client-app-1",
    "description": "API key for client application",
    "upstream_ids": ["<upstream-id-from-previous-step>"]
  }'
```

响应将包含完整的 API key（仅显示一次）：

```json
{
  "id": "...",
  "key_value": "sk-auto-AbCdEf1234...",
  "key_prefix": "sk-auto-AbCd",
  ...
}
```

### 使用 API Key 访问代理

客户端使用分发的 API key 访问代理：

```bash
curl -X POST http://localhost:8000/proxy/v1/chat/completions \
  -H "Authorization: Bearer sk-auto-AbCdEf1234..." \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

## Admin API 端点

所有 Admin API 端点需要 `Authorization: Bearer $ADMIN_TOKEN` 认证。

### API Keys

- `POST /admin/keys` - 创建 API key
- `GET /admin/keys` - 列出所有 keys（分页）
- `DELETE /admin/keys/{id}` - 撤销 key

### Upstreams

- `POST /admin/upstreams` - 创建上游
- `GET /admin/upstreams` - 列出所有上游（分页）
- `PUT /admin/upstreams/{id}` - 更新上游
- `DELETE /admin/upstreams/{id}` - 删除上游（软删除）

完整 API 文档：`http://localhost:8000/docs`

## 数据库迁移

### 创建新迁移

```bash
cd apps/api
uv run alembic revision --autogenerate -m "description"
```

### 应用迁移

```bash
uv run alembic upgrade head
```

### 回滚迁移

```bash
uv run alembic downgrade -1
```

## 测试

```bash
cd apps/api
uv run pytest
```

## 安全注意事项

1. **ENCRYPTION_KEY**：
   - 必须通过环境变量或文件提供
   - 丢失后所有上游 API keys 无法解密
   - 建议使用 HashiCorp Vault 或 AWS Secrets Manager 管理

2. **ADMIN_TOKEN**：
   - 使用强随机字符串
   - 定期轮换
   - 不要在日志中记录

3. **API Keys**：
   - 使用 bcrypt 哈希存储（不可逆）
   - 仅在创建时返回完整 key
   - 支持过期时间和撤销

4. **请求日志**：
   - 不记录请求/响应 body
   - 仅存储元数据（tokens, status, duration）
   - 默认保留 90 天

## 环境变量参考

| 变量 | 必需 | 默认值 | 说明 |
|------|------|--------|------|
| `ENCRYPTION_KEY` | ✅ | - | Fernet 加密密钥（44字符 base64） |
| `ADMIN_TOKEN` | ✅ | - | Admin API 访问令牌 |
| `DATABASE_URL` | ❌ | `sqlite:///./data.db` | 数据库连接 URL |
| `LOG_RETENTION_DAYS` | ❌ | `90` | 请求日志保留天数 |
| `PROXY_PREFIX` | ❌ | `/proxy` | 代理路由前缀 |
| `LOG_LEVEL` | ❌ | `INFO` | 日志级别 |

完整配置参见 `.env.example`。

## 架构设计

详细的技术设计文档：`openspec/changes/add-key-management/design.md`

## 贡献指南

本项目使用 OpenSpec 工作流管理变更：

1. 创建 proposal：`/openspec:proposal`
2. 编写设计文档和规范
3. 实现功能
4. 验证和测试
5. 归档变更：`/openspec:archive`

## License

MIT
