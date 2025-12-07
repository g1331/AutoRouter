# AutoRouter - AI API Gateway

AutoRouter 是一个企业级 AI API Gateway，提供 API key 分发、权限控制、请求日志和多上游路由功能，配备 Cassette Futurism 风格的管理界面。

## 功能概览

### 核心功能

- **API Key 管理**：分发和管理客户端 API keys，支持权限控制和过期时间
- **多上游路由**：支持 OpenAI、Anthropic 等多个 AI 服务提供商
- **权限控制**：基于 API key 的细粒度上游访问控制
- **请求日志**：记录所有请求用于审计、分析和成本追踪
- **安全存储**：API keys 使用 bcrypt 哈希，上游 keys 使用 Fernet 加密
- **Admin API**：完整的管理接口用于 keys 和 upstreams 的 CRUD 操作

### Web 管理控制台

- **Cassette Futurism UI**：复古未来主义设计风格，琥珀色调 CRT 终端美学
- **双语支持**：中文 / 英文界面，URL 前缀路由
- **主题切换**：亮色 / 暗色 / 跟随系统，CRT 动画切换效果
- **响应式布局**：适配桌面端显示
- **无障碍设计**：符合 WCAG 2.1 AA 标准

## 技术栈

| 组件 | 技术 |
|------|------|
| **API 后端** | FastAPI 0.115+, SQLAlchemy 2.0, Alembic |
| **Web 前端** | Next.js 16, React 19, TypeScript 5 |
| **样式系统** | Tailwind CSS 4, shadcn/ui |
| **数据获取** | TanStack React Query 5 |
| **国际化** | next-intl 4.5 |
| **测试** | pytest, Vitest, Playwright |

## 目录结构

```
AutoRouter/
├── apps/
│   ├── api/                   # FastAPI 后端（AI Gateway 核心）
│   │   ├── app/               # 应用代码
│   │   │   ├── api/routes/    # 路由（admin, proxy, health）
│   │   │   ├── models/        # 数据模型
│   │   │   ├── services/      # 业务逻辑
│   │   │   └── core/          # 配置和依赖
│   │   ├── tests/             # 后端测试
│   │   └── alembic/           # 数据库迁移
│   │
│   └── web/                   # Next.js 前端（管理控制台）
│       ├── src/
│       │   ├── app/           # 页面和路由
│       │   ├── components/    # React 组件
│       │   ├── hooks/         # Custom hooks
│       │   ├── messages/      # i18n 翻译文件
│       │   └── providers/     # Context providers
│       └── tests/             # 前端测试（a11y, visual）
│
├── openspec/                  # OpenSpec 规范和变更提案
└── packages/                  # 预留共享包
```

## 环境要求

- Python 3.12.x + uv
- Node.js 18+ / 20+，pnpm 9+
- SQLite（默认）或 PostgreSQL（生产环境推荐）

## 快速开始

### 1. 克隆并安装依赖

```bash
# 后端
cd apps/api
uv venv .venv --python 3.12
uv sync

# 前端
cd apps/web
pnpm install
```

### 2. 配置环境变量

```bash
# 后端
cp apps/api/.env.example apps/api/.env

# 前端
cp apps/web/.env.example apps/web/.env.local
```

**后端必需配置** (`apps/api/.env`)：

```env
# 生成加密密钥（用于加密上游 API keys）
ENCRYPTION_KEY=$(python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")

# 设置 Admin API 访问令牌
ADMIN_TOKEN=your-secret-admin-token-here

# 可选：允许前端跨域访问
CORS_ORIGINS=["http://localhost:3000"]
```

**前端配置** (`apps/web/.env.local`)：

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

> **重要**：请妥善备份 `ENCRYPTION_KEY`，丢失后所有上游 API keys 将无法解密！

### 3. 初始化数据库

```bash
cd apps/api
uv run alembic upgrade head
```

### 4. 启动服务

```bash
# 终端 1：启动后端
cd apps/api
uv run uvicorn app.main:app --reload --port 8000

# 终端 2：启动前端
cd apps/web
pnpm dev
```

- 后端 API：`http://localhost:8000`
- 前端管理界面：`http://localhost:3000`
- API 文档：`http://localhost:8000/docs`

## Web 管理界面

### 登录

使用 `ADMIN_TOKEN` 环境变量中设置的令牌登录管理控制台。

### Dashboard

系统监控总览，显示 API Keys 数量、Upstreams 数量和系统状态。

### API Keys 管理

- 创建新的 API Key（支持选择可访问的上游、设置过期时间）
- 查看所有 Keys 列表（分页）
- 撤销 Key

### Upstreams 管理

- 添加上游服务（OpenAI / Anthropic）
- 编辑上游配置
- 删除上游（软删除）

### 界面功能

- **语言切换**：点击顶栏语言按钮切换中文/英文
- **主题切换**：点击顶栏主题按钮切换亮色/暗色/跟随系统

## API 使用

### 创建上游服务

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

```bash
curl -X POST http://localhost:8000/admin/keys \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "client-app-1",
    "description": "API key for client application",
    "upstream_ids": ["<upstream-id>"]
  }'
```

响应将包含完整的 API key（仅显示一次）。

### 使用 API Key 访问代理

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

| 方法 | 端点 | 说明 |
|------|------|------|
| POST | `/admin/keys` | 创建 API key |
| GET | `/admin/keys` | 列出所有 keys（分页） |
| DELETE | `/admin/keys/{id}` | 撤销 key |

### Upstreams

| 方法 | 端点 | 说明 |
|------|------|------|
| POST | `/admin/upstreams` | 创建上游 |
| GET | `/admin/upstreams` | 列出所有上游（分页） |
| PUT | `/admin/upstreams/{id}` | 更新上游 |
| DELETE | `/admin/upstreams/{id}` | 删除上游（软删除） |

### Proxy

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/proxy/v1/upstreams` | 列出可用上游 |
| ALL | `/proxy/v1/{path}` | 代理请求到上游 |

## 数据库迁移

```bash
cd apps/api

# 创建新迁移
uv run alembic revision --autogenerate -m "description"

# 应用迁移
uv run alembic upgrade head

# 回滚迁移
uv run alembic downgrade -1
```

## 测试

```bash
# 后端测试
cd apps/api
uv run pytest

# 前端测试
cd apps/web
pnpm test

# 无障碍测试
pnpm test:a11y

# 视觉回归测试
pnpm test:visual
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

### 后端 (apps/api)

| 变量 | 必需 | 默认值 | 说明 |
|------|------|--------|------|
| `ENCRYPTION_KEY` | 是 | - | Fernet 加密密钥（44字符 base64） |
| `ADMIN_TOKEN` | 是 | - | Admin API 访问令牌 |
| `DATABASE_URL` | 否 | `sqlite:///./data.db` | 数据库连接 URL |
| `LOG_RETENTION_DAYS` | 否 | `90` | 请求日志保留天数 |
| `PROXY_PREFIX` | 否 | `/proxy` | 代理路由前缀 |
| `LOG_LEVEL` | 否 | `INFO` | 日志级别 |
| `CORS_ORIGINS` | 否 | `[]` | 允许的 CORS 源 |

### 前端 (apps/web)

| 变量 | 必需 | 默认值 | 说明 |
|------|------|--------|------|
| `NEXT_PUBLIC_API_BASE_URL` | 是 | - | 后端 API 地址 |

## 功能实现状态

| 功能 | 状态 | 说明 |
|------|------|------|
| API Key 管理 | ✅ | bcrypt 哈希，一次性显示 |
| 上游服务管理 | ✅ | Fernet 加密，多提供商 |
| 权限控制 | ✅ | Key-Upstream 关联 |
| 请求日志 | ✅ | 元数据记录，90天保留 |
| 代理转发 | ✅ | OpenAI/Anthropic，Streaming |
| Web 管理界面 | ✅ | Cassette Futurism 风格 |
| 国际化 | ✅ | 中文/英文 |
| 主题切换 | ✅ | 亮色/暗色/系统 |
| 无障碍 | ✅ | WCAG 2.1 AA |

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
