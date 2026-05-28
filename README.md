<div align="center">

<!-- Hero Banner -->
<img src="docs/images/banner.svg" alt="AutoRouter Banner" width="100%">

<h3>AI API Gateway</h3>
<p>一个面向多上游治理的 AI API Gateway</p>

<!-- Badges: Status -->

[![Verify](https://github.com/g1331/AutoRouter/actions/workflows/verify.yml/badge.svg)](https://github.com/g1331/AutoRouter/actions/workflows/verify.yml)
[![Release](https://github.com/g1331/AutoRouter/actions/workflows/release.yml/badge.svg)](https://github.com/g1331/AutoRouter/actions/workflows/release.yml)
[![codecov](https://codecov.io/gh/g1331/AutoRouter/graph/badge.svg)](https://codecov.io/gh/g1331/AutoRouter)
[![Docs](https://img.shields.io/badge/Docs-online-3eaf7c?logo=vite&logoColor=white)](https://g1331.github.io/AutoRouter/)

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
- [文档与延伸阅读](#文档与延伸阅读)
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

最小可用启动流程如下：

```bash
git clone https://github.com/g1331/AutoRouter.git
cd AutoRouter
cp .env.example .env
# 编辑 .env：至少设置 ADMIN_TOKEN 与 ENCRYPTION_KEY
docker compose up -d
# 默认访问 http://localhost:3331
```

环境要求：Node.js 22+（源码构建场景）、PostgreSQL 16（默认，生产推荐）；本地开发可改用 SQLite。

更完整的部署形态、版本发布、个人部署 secrets、源码本地开发、SQLite 切换流程，详见文档站 [部署指南](https://g1331.github.io/AutoRouter/guide/deployment/overview)。

---

## 文档与延伸阅读

| 主题                   | 链接                                                                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 部署形态与快速开始     | [`guide/deployment`](https://g1331.github.io/AutoRouter/guide/deployment/overview)                                                                                                   |
| 环境变量参考           | [`guide/deployment/env-reference`](https://g1331.github.io/AutoRouter/guide/deployment/env-reference)                                                                                |
| GitHub Actions 部署    | [`guide/deployment/github-actions`](https://g1331.github.io/AutoRouter/guide/deployment/github-actions)                                                                              |
| 管理后台使用指南       | [`guide/usage`](https://g1331.github.io/AutoRouter/guide/usage/admin-overview)                                                                                                       |
| 整体架构与请求生命周期 | [`guide/architecture`](https://g1331.github.io/AutoRouter/guide/architecture/overview)                                                                                               |
| 测试策略与贡献规范     | [`guide/architecture/testing`](https://g1331.github.io/AutoRouter/guide/architecture/testing) · [`contributing`](https://g1331.github.io/AutoRouter/guide/architecture/contributing) |

文档结构、撰写背景与版本规划参见 [issue #167](https://github.com/g1331/AutoRouter/issues/167)。

---

## License

[AGPL-3.0](LICENSE) © 2025 AutoRouter Contributors

<div align="center">
<br>

如果这个项目对你有帮助，请考虑给一个 Star ⭐

<br>
</div>
