<div align="center">

<!-- Hero Banner -->
<img src="docs/images/banner.svg" alt="AutoRouter Banner" width="100%">

<h3>AI API Gateway</h3>
<p>一个面向多上游治理的 AI API Gateway</p>

<!-- Badges: Status -->

[![Verify](https://github.com/g1331/AutoRouter/actions/workflows/verify.yml/badge.svg)](https://github.com/g1331/AutoRouter/actions/workflows/verify.yml)
[![Release](https://github.com/g1331/AutoRouter/actions/workflows/release.yml/badge.svg)](https://github.com/g1331/AutoRouter/actions/workflows/release.yml)
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
- **多上游能力路由** - 按请求路径能力与密钥授权筛选候选上游，并结合 `model_redirects`、优先级、权重、熔断、并发、配额与故障转移完成选路
- **可观测请求日志** - 记录候选集、路由决策、故障转移历史、会话亲和命中与 Token、计费快照

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

### 移动端预览

| 仪表盘                                                                               | 上游管理                                                                             |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| <img src="docs/images/mobile-dashboard-dark.png" alt="Mobile Dashboard" width="260"> | <img src="docs/images/mobile-upstreams-dark.png" alt="Mobile Upstreams" width="260"> |
| 请求日志                                                                             | 密钥管理                                                                             |
| <img src="docs/images/mobile-logs-dark.png" alt="Mobile Logs" width="260">           | <img src="docs/images/mobile-keys-dark.png" alt="Mobile API Keys" width="260">       |

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

# 4. 默认访问 http://localhost:3331
# 如果你修改了 .env 中的 PORT，请改用对应端口访问
```

### 版本发布与个人部署

仓库默认的 GitHub Actions 主线负责校验、构建镜像和创建 GitHub Release。个人服务器部署改为手动触发的独立流程，只消费已经发布的镜像。

**1. 正式版本发布**

```bash
# 1. 确认 master 已通过 Verify workflow

# 2. 更新 package.json 中的 version

# 3. 创建并推送标签
git tag v1.0.0
git push origin v1.0.0
```

推送标签后，`Release` workflow 会自动校验标签与版本号一致、构建 GHCR 镜像并创建 GitHub Release。

**2. 配置个人部署 Secrets**

在仓库 Settings → Secrets and variables → Actions 中添加：

| Secret            | 说明                                      |
| ----------------- | ----------------------------------------- |
| `SERVER_HOST`     | 服务器 IP 或域名                          |
| `SERVER_USER`     | SSH 用户名                                |
| `SSH_PRIVATE_KEY` | SSH 私钥内容                              |
| `SERVER_PORT`     | SSH 端口 (可选，默认 22)                  |
| `DEPLOY_DIR`      | 部署目录 (可选，默认 /opt/autorouter)     |
| `ADMIN_TOKEN`     | 管理后台令牌，会在部署时写入服务器 `.env` |

**3. 服务器初始化**

```bash
# 创建部署目录
mkdir -p /opt/autorouter && cd /opt/autorouter

# 下载 docker-compose.yml
curl -O https://raw.githubusercontent.com/g1331/AutoRouter/v1.0.0/docker-compose.yml

# 创建 .env 文件 (参考 .env.example)
# 其中 AUTOROUTER_IMAGE 需要填写目标发布镜像，例如 ghcr.io/g1331/autorouter:v1.0.0
nano .env

# 首次启动
docker compose up -d
```

**4. 手动触发个人部署**

```bash
# 在 GitHub Actions 页面手动运行 Personal Deploy
# image_ref 可填写 v1.0.0、完整 ghcr.io 镜像地址或 sha256 digest
# confirm_release_id 填写对应的发布标签，例如 v1.0.0
```

### 本地开发

README 当前提供两种运行模式，但数据库准备方式不同，请不要直接复制 `.env.example` 后原样执行。

#### 方案一：本地 PostgreSQL

```bash
# 1. 克隆项目
git clone https://github.com/g1331/AutoRouter.git
cd AutoRouter

# 2. 复制环境变量
cp .env.example .env.local

# 3. 把 .env.local 中的 DATABASE_URL 改成宿主机地址
# 例如：
# DATABASE_URL=postgresql://autorouter:password@localhost:5432/autorouter

# 4. 生成加密密钥 (填入 .env.local)
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# 5. 安装依赖
pnpm install

# 6. 推送 PostgreSQL Schema
pnpm db:push

# 7. 启动开发服务器
pnpm dev
```

启动后访问 <http://localhost:3000>，使用 `ADMIN_TOKEN` 登录。

#### 方案二：本地 SQLite

运行时代码支持 SQLite，本地快速试跑时可以这样配置：

```bash
# 1. 复制环境变量
cp .env.example .env.local

# 2. 在 .env.local 中设置
# DB_TYPE=sqlite
# SQLITE_DB_PATH=./data/dev.sqlite

# 3. 生成加密密钥 (填入 .env.local)
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# 4. 安装依赖
pnpm install

# 5. 启动开发服务器
pnpm dev
```

注意：仓库当前封装的 Drizzle CLI 脚本默认面向 PostgreSQL。SQLite 运行时是受支持的，但 README 不再把 `pnpm db:push` 宣传为 SQLite 的通用初始化命令。

---

## 配置说明

### 环境变量 (`.env` 或 `.env.local`)

| 变量                        |   必填   | 说明                                                                                  |
| --------------------------- | :------: | ------------------------------------------------------------------------------------- |
| `DATABASE_URL`              | 条件必填 | PostgreSQL 模式下必填；未设置 `DB_TYPE` 时，只要提供它就会自动选择 PostgreSQL         |
| `DB_TYPE`                   |          | 数据库类型，支持 `postgres` 或 `sqlite`；未设置时会按 `DATABASE_URL` 是否存在自动判断 |
| `SQLITE_DB_PATH`            |          | SQLite 文件路径（`DB_TYPE=sqlite` 时使用）                                            |
| `ENCRYPTION_KEY`            |   ✓\*    | Fernet 加密密钥（与 `ENCRYPTION_KEY_FILE` 二选一）                                    |
| `ENCRYPTION_KEY_FILE`       |   ✓\*    | 从文件读取加密密钥（与 `ENCRYPTION_KEY` 二选一）                                      |
| `ADMIN_TOKEN`               |    ✓     | 管理后台登录令牌                                                                      |
| `ALLOW_KEY_REVEAL`          |          | 是否允许展示完整 API Key，默认 `false`                                                |
| `LOG_RETENTION_DAYS`        |          | 日志保留天数，默认 `90`                                                               |
| `LOG_LEVEL`                 |          | 日志级别：`fatal` / `error` / `warn` / `info` / `debug` / `trace`                     |
| `DEBUG_LOG_HEADERS`         |          | 是否输出请求头调试日志，默认 `false`                                                  |
| `HEALTH_CHECK_INTERVAL`     |          | 上游健康检查间隔（秒），默认 `30`                                                     |
| `HEALTH_CHECK_TIMEOUT`      |          | 上游健康检查超时（秒），默认 `10`                                                     |
| `CORS_ORIGINS`              |          | CORS 白名单，逗号分隔                                                                 |
| `PORT`                      |          | 服务端口，默认 `3000`                                                                 |
| `RECORDER_ENABLED`          |          | 是否开启流量录制。代码默认关闭，仓库提供的 compose 默认开启                           |
| `RECORDER_MODE`             |          | 录制模式：`all` / `success` / `failure`                                               |
| `RECORDER_FIXTURES_DIR`     |          | 录制文件目录，默认 `tests/fixtures`                                                   |
| `RECORDER_REDACT_SENSITIVE` |          | 是否脱敏录制内容。代码默认 `true`，但仓库提供的生产部署模板默认写入 `false`           |

---

## 项目结构

| 目录                           | 说明                                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `src/app/api/proxy`            | 代理入口，负责路径能力判定、候选集构建、故障转移和日志记录                                              |
| `src/app/api/admin`            | 管理 API，包含 keys、upstreams、stats、logs、billing、compensation、health、circuit-breakers            |
| `src/app/[locale]/(dashboard)` | 管理台页面，包含 dashboard、keys、logs、upstreams、settings、system/billing、system/header-compensation |
| `src/lib/services`             | 核心业务服务，如负载均衡、熔断、健康检查、计费、日志、流量录制、会话亲和                                |
| `src/lib/db`                   | 数据库访问与 schema，运行时支持 PostgreSQL / SQLite                                                     |
| `src/components`               | 管理台组件与通用 UI 组件                                                                                |
| `tests`                        | 单元测试、组件测试、E2E、可访问性和视觉回归测试                                                         |
| `drizzle` / `drizzle-sqlite`   | PostgreSQL / SQLite 迁移产物                                                                            |
| `docs` / `openspec`            | 补充文档与变更规格                                                                                      |

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
