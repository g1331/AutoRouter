<div align="center">

<!-- Hero Banner -->
<img src="docs/images/banner.svg" alt="AutoRouter Banner" width="100%">

<h3>AI API Gateway</h3>
<p>一个极简的多上游 AI API 代理</p>

<!-- Badges: Status -->
[![Lint](https://github.com/g1331/AutoRouter/actions/workflows/lint.yml/badge.svg)](https://github.com/g1331/AutoRouter/actions/workflows/lint.yml)
[![Test](https://github.com/g1331/AutoRouter/actions/workflows/test.yml/badge.svg)](https://github.com/g1331/AutoRouter/actions/workflows/test.yml)
[![codecov](https://codecov.io/gh/g1331/AutoRouter/graph/badge.svg)](https://codecov.io/gh/g1331/AutoRouter)

<!-- Badges: Tech -->
[![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)

<!-- Badges: Community -->
[![License](https://img.shields.io/github/license/g1331/AutoRouter?color=blue)](LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/g1331/AutoRouter?style=flat&logo=github)](https://github.com/g1331/AutoRouter/stargazers)
[![GitHub Issues](https://img.shields.io/github/issues/g1331/AutoRouter)](https://github.com/g1331/AutoRouter/issues)
[![Last Commit](https://img.shields.io/github/last-commit/g1331/AutoRouter)](https://github.com/g1331/AutoRouter/commits/master)

</div>

---

## 目录

- [功能特性](#功能特性)
- [界面预览](#界面预览)
- [快速开始](#快速开始)
- [配置说明](#配置说明)
- [项目结构](#项目结构)
- [开发指南](#开发指南)
- [License](#license)

---

## 功能特性

<table>
<tr>
<td width="50%">

### 核心功能

- **API Key 管理** - 创建、分发和管理客户端密钥
- **权限控制** - 按 Key 设置模型访问权限和过期时间
- **多上游路由** - 支持 OpenAI、Anthropic、Azure 等
- **请求日志** - 完整的请求记录用于审计和调试

</td>
<td width="50%">

### 安全特性

- **密钥哈希** - API Keys 使用 bcrypt 单向哈希存储
- **加密存储** - 上游密钥使用 Fernet 对称加密
- **Token 认证** - 管理后台使用独立 Admin Token

</td>
</tr>
<tr>
<td width="50%">

### 用户体验

- **Cassette Futurism UI** - 复古未来主义设计风格
- **响应式布局** - 适配桌面和移动设备
- **主题切换** - 亮色 / 暗色 / 跟随系统

</td>
<td width="50%">

### 国际化

- **多语言支持** - 中文 / English
- **自动检测** - 根据浏览器语言自动切换
- **URL 路由** - `/zh` 和 `/en` 独立路由

</td>
</tr>
</table>

---

## 界面预览

<details open>
<summary><b>Dashboard - 系统监控</b></summary>
<br>
<img src="docs/images/dashboard-dark.png" alt="Dashboard" width="100%">
</details>

<details>
<summary><b>API Keys - 密钥管理</b></summary>
<br>
<img src="docs/images/keys-dark.png" alt="API Keys" width="100%">
</details>

<details>
<summary><b>Upstreams - 上游配置</b></summary>
<br>
<img src="docs/images/upstreams-dark.png" alt="Upstreams" width="100%">
</details>

<details>
<summary><b>Login - 登录界面</b></summary>
<br>
<img src="docs/images/login-dark.png" alt="Login" width="100%">
</details>

---

## 快速开始

### 环境要求

| 依赖 | 版本 | 说明 |
|------|------|------|
| Python | 3.12+ | 推荐使用 [uv](https://github.com/astral-sh/uv) 管理 |
| Node.js | 22+ | 推荐使用 [pnpm](https://pnpm.io/) 管理 |

### 安装步骤

```bash
# 1. 克隆项目
git clone https://github.com/g1331/AutoRouter.git
cd AutoRouter
```

<details>
<summary><b>后端启动 (apps/api)</b></summary>

```bash
cd apps/api

# 复制环境变量
cp .env.example .env

# 生成加密密钥 (填入 .env)
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

# 安装依赖
uv sync

# 数据库迁移
uv run alembic upgrade head

# 启动服务
uv run uvicorn app.main:app --port 8000 --reload
```

</details>

<details>
<summary><b>前端启动 (apps/web)</b></summary>

```bash
cd apps/web

# 复制环境变量
cp .env.example .env.local

# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev
```

</details>

启动后访问 http://localhost:3000，使用 `ADMIN_TOKEN` 登录。

---

## 配置说明

### 后端环境变量 (`apps/api/.env`)

| 变量 | 必填 | 说明 |
|------|:----:|------|
| `ENCRYPTION_KEY` | ✓ | Fernet 加密密钥，用于加密上游 API Key |
| `ADMIN_TOKEN` | ✓ | 管理后台登录令牌 |
| `DATABASE_URL` | | 数据库连接串，默认 SQLite |

### 前端环境变量 (`apps/web/.env.local`)

| 变量 | 必填 | 说明 |
|------|:----:|------|
| `NEXT_PUBLIC_API_URL` | ✓ | 后端 API 地址，如 `http://localhost:8000` |

---

## 项目结构

```
AutoRouter/
├── apps/
│   ├── api/                # FastAPI 后端
│   │   ├── app/
│   │   │   ├── api/        # 路由层
│   │   │   ├── models/     # 数据模型
│   │   │   ├── services/   # 业务逻辑
│   │   │   └── core/       # 核心配置
│   │   ├── alembic/        # 数据库迁移
│   │   └── tests/          # 测试用例
│   │
│   └── web/                # Next.js 前端
│       ├── src/
│       │   ├── app/        # App Router 页面
│       │   ├── components/ # React 组件
│       │   ├── hooks/      # 自定义 Hooks
│       │   └── i18n/       # 国际化配置
│       └── messages/       # 翻译文件
│
├── docs/                   # 文档资源
└── openspec/               # 设计规范
```

---

## 开发指南

<details>
<summary><b>代码检查</b></summary>

```bash
# Python
cd apps/api
uv run ruff check .        # Lint
uv run ruff format .       # Format
uv run pyright             # Type check

# TypeScript
cd apps/web
pnpm lint                  # ESLint
pnpm format                # Prettier
pnpm exec tsc --noEmit     # Type check
```

</details>

<details>
<summary><b>运行测试</b></summary>

```bash
# Python
cd apps/api
uv run pytest --cov=app

# TypeScript
cd apps/web
pnpm test:run --coverage
```

</details>

---

## License

[AGPL-3.0](LICENSE) © 2025 AutoRouter Contributors

<div align="center">
<br>

如果这个项目对你有帮助，请考虑给一个 Star ⭐

<br>
</div>
