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

[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)

<!-- Badges: Community -->

[![License](https://img.shields.io/github/license/g1331/AutoRouter?color=blue)](LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/g1331/AutoRouter?style=flat&logo=github)](https://github.com/g1331/AutoRouter/stargazers)
[![GitHub Issues](https://img.shields.io/github/issues/g1331/AutoRouter)](https://github.com/g1331/AutoRouter/issues)
[![Last Commit](https://img.shields.io/github/last-commit/g1331/AutoRouter)](https://github.com/g1331/AutoRouter/commits/master)

<br>

[English](./README_EN.md) · **简体中文**

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

- **OpenAI 兼容代理** - 通过 `/api/proxy/v1/*` 转发请求，支持普通响应与 SSE 流式输出
- **API Key 生命周期管理** - 创建、更新、停用、撤销密钥，并绑定可访问上游与过期时间
- **智能多上游路由** - 按模型前缀自动分组，支持 `allowed_models`、`model_redirects`、权重与优先级
- **可观测请求日志** - 记录路由决策、故障转移历史、会话亲和命中与 Token 统计

</td>
<td width="50%">

### 安全特性

- **密钥双层保护** - API Key 使用 bcrypt 哈希，上游密钥使用 Fernet 加密存储
- **管理面鉴权隔离** - `/api/admin/*` 统一使用独立 `ADMIN_TOKEN` 鉴权
- **SSRF 防护** - 上游地址校验阻断私网/回环/元数据地址，并校验 DNS 解析结果
- **敏感操作开关** - `ALLOW_KEY_REVEAL` 默认关闭，避免误暴露完整密钥

</td>
</tr>
<tr>
<td width="50%">

### 用户体验

- **全新管理台视觉体系** - 深浅主题一致语义，强调信息层级与可读性
- **响应式导航** - 桌面侧边栏 + 移动端底部导航
- **统计面板** - Overview / Timeseries / Leaderboard 三类看板
- **健康与熔断控制** - 上游健康检查、熔断状态查看与强制开关

</td>
<td width="50%">

### 国际化

- **多语言支持** - 中文 / English
- **语言切换器** - 设置页与侧边栏可直接切换语言
- **URL 路由** - `/zh-CN` 和 `/en` 独立路由

</td>
</tr>
</table>

---

## 界面预览

<details open>
<summary><b>Login - 登录界面</b></summary>
<br>
<img src="docs/images/login-dark.png" alt="Login" width="100%">
</details>

<details open>
<summary><b>Dashboard - 系统监控</b></summary>
<br>
<img src="docs/images/dashboard-dark.png" alt="Dashboard" width="100%">
</details>

<details open>
<summary><b>Logs - 请求日志</b></summary>
<br>
<img src="docs/images/logs-dark.png" alt="Logs" width="100%">
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

---

## 快速开始

### 环境要求

| 依赖       | 版本 | 说明                                   |
| ---------- | ---- | -------------------------------------- |
| Node.js    | 22+  | 推荐使用 [pnpm](https://pnpm.io/) 管理 |
| PostgreSQL | 16+  | 生产环境推荐（默认）                   |
| SQLite     | 最新 | 本地开发可选（通过 `DB_TYPE=sqlite`）  |

### Docker 部署 (推荐)

```bash
# 1. 克隆项目
git clone https://github.com/g1331/AutoRouter.git
cd AutoRouter

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 文件，设置 ADMIN_TOKEN 和 ENCRYPTION_KEY

# 3. 启动服务
docker compose up -d

# 4. 访问 http://localhost:${PORT:-3000}
```

### 生产环境 CI/CD 部署

项目支持通过 GitHub Actions 自动构建并部署到云服务器。

**1. 配置 GitHub Secrets**

在仓库 Settings → Secrets and variables → Actions 中添加：

| Secret            | 说明                                  |
| ----------------- | ------------------------------------- |
| `SERVER_HOST`     | 服务器 IP 或域名                      |
| `SERVER_USER`     | SSH 用户名                            |
| `SSH_PRIVATE_KEY` | SSH 私钥内容                          |
| `SERVER_PORT`     | SSH 端口 (可选，默认 22)              |
| `DEPLOY_DIR`      | 部署目录 (可选，默认 /opt/autorouter) |
| `GHCR_TOKEN`      | GitHub PAT (私有仓库需要)             |

**2. 服务器初始化**

```bash
# 创建部署目录
mkdir -p /opt/autorouter && cd /opt/autorouter

# 下载 docker-compose.yml
curl -O https://raw.githubusercontent.com/g1331/AutoRouter/master/docker-compose.yml

# 创建 .env 文件 (参考 .env.example)
nano .env

# 首次启动
docker compose up -d
```

**3. 触发部署**

```bash
# 打 tag 触发自动部署
git tag v1.0.0
git push origin v1.0.0
```

或在 GitHub Actions 页面手动触发 "Build and Deploy" workflow。

### 本地开发

```bash
# 1. 克隆项目
git clone https://github.com/g1331/AutoRouter.git
cd AutoRouter

# 2. 复制环境变量
cp .env.example .env.local

# 3. 生成加密密钥 (填入 .env.local)
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# 4. 安装依赖
pnpm install

# 5. 数据库迁移
pnpm db:push

# 6. 启动开发服务器
pnpm dev
```

启动后访问 <http://localhost:3000>，使用 `ADMIN_TOKEN` 登录。

---

## 配置说明

### 环境变量 (`.env` 或 `.env.local`)

| 变量                        | 必填 | 说明                                                              |
| --------------------------- | :--: | ----------------------------------------------------------------- |
| `DATABASE_URL`              |  ✓   | PostgreSQL 连接串（`DB_TYPE=postgres` 时使用）                    |
| `DB_TYPE`                   |      | 数据库类型，`postgres`（默认）或 `sqlite`                         |
| `SQLITE_DB_PATH`            |      | SQLite 文件路径（`DB_TYPE=sqlite` 时使用）                        |
| `ENCRYPTION_KEY`            | ✓\*  | Fernet 加密密钥（与 `ENCRYPTION_KEY_FILE` 二选一）                |
| `ENCRYPTION_KEY_FILE`       | ✓\*  | 从文件读取加密密钥（与 `ENCRYPTION_KEY` 二选一）                  |
| `ADMIN_TOKEN`               |  ✓   | 管理后台登录令牌                                                  |
| `ALLOW_KEY_REVEAL`          |      | 是否允许展示完整 API Key，默认 `false`                            |
| `LOG_RETENTION_DAYS`        |      | 日志保留天数，默认 `90`                                           |
| `LOG_LEVEL`                 |      | 日志级别：`fatal` / `error` / `warn` / `info` / `debug` / `trace` |
| `DEBUG_LOG_HEADERS`         |      | 是否输出请求头调试日志，默认 `false`                              |
| `HEALTH_CHECK_INTERVAL`     |      | 上游健康检查间隔（秒），默认 `30`                                 |
| `HEALTH_CHECK_TIMEOUT`      |      | 上游健康检查超时（秒），默认 `10`                                 |
| `CORS_ORIGINS`              |      | CORS 白名单，逗号分隔                                             |
| `PORT`                      |      | 服务端口，默认 `3000`                                             |
| `RECORDER_ENABLED`          |      | 开启流量录制（仅开发环境建议使用）                                |
| `RECORDER_MODE`             |      | 录制模式：`all` / `success` / `failure`                           |
| `RECORDER_FIXTURES_DIR`     |      | 录制文件目录，默认 `tests/fixtures`                               |
| `RECORDER_REDACT_SENSITIVE` |      | 是否脱敏录制内容，默认 `true`                                     |

---

## 项目结构

```
AutoRouter/
├── src/
│   ├── app/                 # Next.js App Router
│   │   ├── [locale]/        # 国际化页面路由
│   │   └── api/             # API Routes
│   │       ├── admin/       # 管理 API
│   │       ├── mock/        # 录制回放 Mock API（开发环境）
│   │       ├── proxy/       # 代理 API
│   │       └── health/      # 健康检查
│   ├── components/          # React 组件
│   ├── hooks/               # 自定义 Hooks
│   ├── lib/
│   │   ├── db/              # Drizzle ORM 配置
│   │   ├── services/        # 业务逻辑服务
│   │   └── utils/           # 工具函数
│   ├── messages/            # 翻译文件
│   └── i18n/                # 国际化配置
├── tests/                   # 测试用例
├── drizzle/                 # 数据库迁移
├── docs/                    # 文档资源
└── openspec/                # 设计规范
```

---

## 开发指南

<details>
<summary><b>代码检查</b></summary>

```bash
pnpm lint                  # ESLint
pnpm format                # Prettier
pnpm exec tsc --noEmit     # Type check
```

</details>

<details>
<summary><b>运行测试</b></summary>

```bash
pnpm test                  # Watch 模式
pnpm test:run              # 单次运行
pnpm test:run --coverage   # 覆盖率报告
pnpm e2e                   # Playwright E2E
pnpm e2e:headed            # 有界面模式运行 E2E
```

</details>

<details>
<summary><b>数据库操作</b></summary>

```bash
pnpm db:generate           # 生成迁移文件
pnpm db:migrate            # 执行迁移
pnpm db:push               # 推送 Schema 到数据库
pnpm db:seed               # 写入轻量示例数据
pnpm db:studio             # 打开 Drizzle Studio
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
