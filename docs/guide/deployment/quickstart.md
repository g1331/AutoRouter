---
title: 快速开始（源码 docker compose）
outline: deep
---

# 快速开始（源码 docker compose）

本页给出从克隆仓库到首次成功登录管理后台的最短路径。完成后会得到两个容器：`autorouter`（Next.js 应用）与 `db`（PostgreSQL 16），共享 `autorouter-net` bridge 网络，数据持久化到 named volume。CLIProxyAPI 是否需要叠加，根据是否要承接 Codex / Claude / Gemini 等 OAuth 上游账号决定，本页不涉及，需要时另见 [CI 部署后追加 CLIProxyAPI sidecar](./cliproxy-sidecar) 与现有长篇 [`docs/cliproxy-deployment.md`](/cliproxy-deployment)。

## 前置依赖

| 工具                               | 用途                       | 推荐版本                                  |
| ---------------------------------- | -------------------------- | ----------------------------------------- |
| Docker Engine 与 Docker Compose v2 | 启动两个容器、共享网络与卷 | Docker 24+；`docker compose` 子命令需可用 |
| `git`                              | 克隆仓库                   | 任意现代版本                              |
| `openssl` 或 Node.js               | 生成加密密钥与管理 token   | 二者任一即可                              |

无需在宿主机预装 Node.js / pnpm；构建与运行都发生在容器内。

## 第一步：克隆仓库

```bash
git clone https://github.com/g1331/AutoRouter.git
cd AutoRouter
```

仓库根目录的 `docker-compose.yml` 与 `.env.example` 是本次部署的全部主要资料。

## 第二步：生成两个必填密钥

`.env.example` 中标注 `REQUIRED` 的字段共两个：`ENCRYPTION_KEY` 与 `ADMIN_TOKEN`。前者用于上游密钥的 Fernet 加密，后者用于 `/api/admin/*` 接口鉴权。任意泄露都会造成严重影响，必须在首次启动前生成强随机值。

`ENCRYPTION_KEY` 必须是 base64 编码的 32 字节：

```bash
# 使用 Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# 或使用 openssl
openssl rand -base64 32
```

`ADMIN_TOKEN` 没有长度规定，但建议生成不少于 32 字节的高熵字符串：

```bash
openssl rand -hex 32
```

::: warning 务必备份 ENCRYPTION_KEY
丢失 `ENCRYPTION_KEY` 等同于丢失数据库中所有已加密的上游 API Key——上游记录还在，但解密会全部失败，需要逐条重新填写。建议在密码管理器或安全的密钥仓库中保存一份。
:::

## 第三步：编写 `.env`

把 `.env.example` 拷为 `.env`：

```bash
cp .env.example .env
```

最小可启动配置需要修改下列几行。其余字段保留默认值即可，每个字段的语义见 [环境变量参考](./env-reference)。

```env
# 自行选定强随机密码
POSTGRES_PASSWORD=<strong-postgres-password>

# 数据库连接串中的密码必须与 POSTGRES_PASSWORD 严格一致
DATABASE_URL=postgresql://autorouter:<strong-postgres-password>@db:5432/autorouter

# 第二步生成的 base64 32 字节密钥
ENCRYPTION_KEY=<your-base64-32-byte-key>

# 第二步生成的高熵 token
ADMIN_TOKEN=<your-strong-admin-token>
```

`DATABASE_URL` 的 host 必须是 `db`——这是 `docker-compose.yml` 中 PostgreSQL 容器的服务名。在 Docker 网络内填 `localhost` 会指向 AutoRouter 容器自身而非数据库。

`AUTOROUTER_IMAGE` 默认值 `ghcr.io/g1331/autorouter:latest` 指向最新发布。生产部署建议显式 pin 到具体 tag 或 digest，例如：

```env
AUTOROUTER_IMAGE=ghcr.io/g1331/autorouter:v0.1.0
# 或
AUTOROUTER_IMAGE=ghcr.io/g1331/autorouter@sha256:<digest>
```

## 第四步：启动

```bash
docker compose up -d
```

首次启动会拉取 `ghcr.io/g1331/autorouter` 与 `postgres:16-alpine` 两个镜像。`db` 服务的 healthcheck 通过后，`autorouter` 服务才会启动；这是 `docker-compose.yml` 中 `depends_on.condition: service_healthy` 的约束。

`autorouter` 自身的 healthcheck 是定时请求 `http://localhost:3000/api/health`，间隔 30 秒，失败 3 次判定为 unhealthy，启动期 40 秒。`db` 的 healthcheck 是 `pg_isready`，间隔 10 秒。

观察启动状态：

```bash
docker compose ps
docker compose logs -f autorouter
```

## 第五步：验证端到端可达

宿主机端口默认为 `${PORT:-3331}`，对应容器内的 `3000` 端口。健康端点的响应包含版本号：

```bash
curl http://localhost:3331/api/health
```

预期得到形如下方的 JSON：

```json
{
  "status": "healthy",
  "timestamp": "2026-05-23T09:00:00.000Z",
  "version": "0.1.0"
}
```

管理 API 的鉴权使用 `ADMIN_TOKEN`：

```bash
curl -H "Authorization: Bearer <ADMIN_TOKEN>" \
  http://localhost:3331/api/admin/health?active_only=true
```

返回 `200` 即说明应用、数据库与管理端鉴权均工作正常。

## 第六步：登录管理后台

打开浏览器访问：

```
http://<server-host>:3331/
```

页面会重定向到 `/login`，使用 `ADMIN_TOKEN` 登录。登录成功后进入仪表盘。

后续推荐的接入顺序：

1. 添加第一个上游：参考 [添加第一个上游](../usage/first-upstream)。
2. 创建第一把客户端 API Key：参考 [创建客户端 API Key](../usage/client-keys)。
3. 用 OpenAI 兼容客户端发一笔请求：参考 [通过 AutoRouter 调用模型](../usage/invoke-models)。
4. 需要 Codex / Claude / Gemini OAuth 上游时，按 [CLIProxyAPI 首次使用指南](../usage/cliproxy-first-time) 接入 sidecar。

## 常见首启动问题

下面只列出最常见的几类启动期错误。完整排障路径参见后续「常见部署问题排查」与 [故障排查手册](../usage/troubleshooting)。

`autorouter` 容器反复重启、日志含 `ENCRYPTION_KEY is required`：`ENCRYPTION_KEY` 未在 `.env` 中正确设置，或 `.env` 文件不在 `docker-compose.yml` 同目录下。

未设置 `ADMIN_TOKEN` 时容器仍会正常启动，但登录页输入任何 token 均会返回认证失败；请检查 `.env` 中 `ADMIN_TOKEN` 是否已正确填写。

`db` 容器 healthcheck 长时间不通过、日志含 `FATAL: password authentication failed`：`.env` 中 `POSTGRES_PASSWORD` 与 `DATABASE_URL` 内的密码不一致。`docker-compose.yml` 把两者分开读取，二者必须严格相同。

宿主机访问 `http://<host>:3331/` 拒绝连接：宿主机防火墙未放行 `PORT`（默认 `3331`），或 `PORT` 被其他服务占用。可在 `.env` 中改为其他端口，例如 `PORT=8331`，再 `docker compose up -d` 即可生效。

容器内 AutoRouter 报「上游地址不可达」并且地址形如 `http://localhost:xxxx`：填写了 `localhost`，但实际上目标服务在另一个容器中。Docker 网络内应使用「容器服务名」而非 `localhost`，例如 `http://cliproxyapi:8317`。
