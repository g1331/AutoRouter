# AutoRouter

企业级 AI API Gateway，提供 API Key 分发、多上游路由和请求管理功能。

## 截图

### 登录界面

![Login](docs/images/login-dark.png)

### 系统监控

![Dashboard](docs/images/dashboard-dark.png)

### API Keys 管理

![API Keys](docs/images/keys-dark.png)

### Upstreams 管理

![Upstreams](docs/images/upstreams-dark.png)

## 功能特性

- **API Key 管理** - 分发和管理客户端 API Keys，支持权限控制和过期时间
- **多上游路由** - 支持 OpenAI、Anthropic 等多个 AI 服务提供商
- **安全存储** - API Keys 使用 bcrypt 哈希，上游密钥使用 Fernet 加密
- **请求日志** - 记录所有请求用于审计和分析
- **Cassette Futurism UI** - 复古未来主义风格管理界面
- **国际化** - 支持中文 / 英文
- **主题切换** - 亮色 / 暗色 / 跟随系统

## 技术栈

| 后端 | 前端 |
|------|------|
| FastAPI | Next.js 16 |
| SQLAlchemy | React 19 |
| Alembic | Tailwind CSS 4 |
| Python 3.12 | TypeScript 5 |

## 快速开始

### 环境要求

- Python 3.12+ (推荐使用 uv)
- Node.js 18+ (推荐使用 pnpm)

### 安装

```bash
# 克隆项目
git clone https://github.com/your-username/autorouter.git
cd autorouter

# 后端
cd apps/api
cp .env.example .env
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --port 8000

# 前端 (新终端)
cd apps/web
cp .env.example .env.local
pnpm install
pnpm dev
```

### 配置

在 `apps/api/.env` 中配置：

```env
ENCRYPTION_KEY=<生成的Fernet密钥>
ADMIN_TOKEN=<你的管理员令牌>
```

访问 `http://localhost:3000` 使用 Admin Token 登录。

## 目录结构

```
autorouter/
├── apps/
│   ├── api/          # FastAPI 后端
│   └── web/          # Next.js 前端
├── docs/
│   └── images/       # 截图资源
└── openspec/         # 设计文档
```

## License

[AGPL-3.0](LICENSE)

Copyright (C) 2025 AutoRouter Contributors
