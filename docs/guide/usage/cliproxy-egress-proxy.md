---
title: CLIProxyAPI 出站代理配置
outline: deep
---

# CLIProxyAPI 出站代理配置

在受限网络环境（GFW、企业出口白名单）里，CLIProxyAPI（下称 CPA）访问 Codex / Claude / Gemini 的登录端点和模型 API 往往必须经一层 HTTP/SOCKS 代理。AutoRouter 自身**不参与**这一层代理——出站代理由 CPA 容器自己消费，AutoRouter 只在「为某个账号设置覆盖」这一点上有管理 API 入口。本页讲清楚两种粒度的代理是怎么生效的，何时该用哪个，以及怎么验证。

## 责任划分

```
┌───────────────────────────────────────────────────────────────┐
│ AutoRouter（Next.js / proxy-client.ts）                       │
│   不读 HTTP_PROXY / HTTPS_PROXY / ALL_PROXY                    │
│   不为 fetch 注入 dispatcher / agent                           │
│   AR → 上游（含 CPA 上游）的请求不走任何出站代理              │
└──────────────────────────┬────────────────────────────────────┘
                           │ 仅当上游是 CPA 池/单账号上游
                           ▼
┌───────────────────────────────────────────────────────────────┐
│ CLIProxyAPI 容器                                              │
│   全局：CLIPROXY_PROXY_URL（env → config.yaml proxy-url）     │
│   账号：每个 auth-file 的 proxy_url 字段覆盖全局              │
│   CPA → Codex / Claude / Gemini 的请求走这两层代理            │
└───────────────────────────────────────────────────────────────┘
```

`src/lib/services/proxy-client.ts:12-21` 的 `UpstreamForProxy` 接口字段里只有 `id` / `name` / `providerType` / `baseUrl` / `apiKey` / `timeout`，没有任何代理字段；同文件 `:139` 的 fetch 调用是 Node.js 原生 `fetch`，没有传 `dispatcher` 也没有读 `process.env.HTTP_PROXY`。这意味着即使在宿主机设了 `HTTPS_PROXY`，AutoRouter 的转发也不会走代理（Node `fetch` 默认行为）。

也就是说：

- AutoRouter 自身要出网的场景（向上游发请求）**不能配代理**。如果 AR 部署在受限网络里需要直接访问 OpenAI/Anthropic，要么换部署位置，要么在容器外用 transparent proxy 解决。
- CPA 上游链路（AR → CPA → 模型 API）里，AR → CPA 这一段在同一网络内不需要代理；CPA → 模型 API 这一段由 CPA 自己消费代理配置。

## 全局代理 `CLIPROXY_PROXY_URL`

适用范围：CPA 容器内**所有** auth-file 默认使用的出站代理。

### 配置链路

只对 `managed`（sidecar）模式有效。配置链路：

1. `.env` 文件中的 `CLIPROXY_PROXY_URL`（`.env.example:131-133`）。
2. `docker-compose.cliproxy.yml` 把该值注入 CPA 容器 environment：
   ```yaml
   environment:
     - CLIPROXY_PROXY_URL=${CLIPROXY_PROXY_URL:-}
   ```
   （`docker-compose.cliproxy.yml:25`）
3. CPA 容器 `docker-entrypoint.sh` 将 env 渲染进 `config.yaml`：
   ```bash
   export CLIPROXY_PROXY_URL="${CLIPROXY_PROXY_URL:-}"
   ...
   CONTENT=$(render_literal "$CONTENT" '${CLIPROXY_PROXY_URL}' "$CLIPROXY_PROXY_URL")
   ```
   （`cliproxy/docker-entrypoint.sh:34, 67`）
4. `cliproxy/config.yaml.template:32-34` 的 `proxy-url: "${CLIPROXY_PROXY_URL}"` 被替换为真实值。
5. CPA 启动时读取 `proxy-url`，对所有 auth-file 默认应用。

### 支持的格式

| 协议     | 示例                                          |
| -------- | --------------------------------------------- |
| `http`   | `http://proxy-host:8080`                      |
| `https`  | `https://proxy-host:8443`                     |
| `socks5` | `socks5://proxy-host:1080`                    |
| 留空     | 不使用代理（`.env` 中 `CLIPROXY_PROXY_URL=`） |

### 生效时机

环境变量在 `docker-compose` 配置中是**容器启动期注入**——修改 `.env` 后需要 `docker compose up -d` 或 `docker compose restart cliproxyapi` 让 CPA 重新读配置。运行中改 `.env` 不会自动生效。

### 外部模式（`external`）下

`external` 模式下 CPA 不由 AutoRouter 的 docker-compose 拉起，`CLIPROXY_PROXY_URL` 这条注入链路完全不存在。要给外部 CPA 配出站代理，必须在 CPA 自己的运行环境（systemd unit、docker-compose、Kubernetes manifest 等）里设置 `proxy-url`。AutoRouter `.env` 里的 `CLIPROXY_PROXY_URL` 在 `external` 模式下是无效字段。

## 账号粒度 `proxy_url`

适用范围：**单个 auth-file**，覆盖全局 `proxy-url`。

### 何时需要

- 不同 OAuth 账号属于不同地理区域（例如美区/欧区账号要走不同跳板）；
- 部分账号要直连、其他账号走代理；
- 同一台 CPA 服务多个团队，每个团队的账号通过各自代理出网。

如果没有以上需求，**只设全局 `CLIPROXY_PROXY_URL` 即可**，账号粒度字段留空。

### 设置入口

管理后台账号列表的「编辑账号」对话框会写这个字段，对应 API：

```
PATCH /api/admin/cliproxy/instances/:id/auth-accounts/:accountName
Body: { "proxy_url": "socks5://team-a-proxy:1080", ... }
```

字段约束（`src/app/api/admin/cliproxy/instances/[id]/auth-accounts/[accountName]/route.ts:14-23`）：`proxy_url` 是可选 string，trim 后最长 512 字符。

### 下发链路

1. PATCH 路由把 `proxy_url` 转给 `updateCliproxyAuthAccountFields`（`src/lib/services/cliproxy-auth-account-service.ts:238-244`）。
2. 服务层调用 `patchAuthFileFields`，向 CPA 管理 API 发：
   ```
   PATCH <management_url>/v0/management/auth-files/fields
   Body: { name, prefix, proxy_url, priority, note }
   ```
   （`src/lib/services/cliproxy-management-client.ts:212-221`）
3. CPA 收到后更新内部 auth-file 配置，**立即生效**——不需要重启容器（与全局 `CLIPROXY_PROXY_URL` 的重启要求不同）。
4. AutoRouter **不缓存** `proxy_url`：本地 `cliproxy_auth_accounts` 表的字段列里没有 `proxy_url`（`src/lib/db/schema-pg.ts:744-770`），实际值始终以 CPA 侧为准。下次想看某个账号当前的 `proxy_url`，要从 CPA 的 `/v0/management/auth-files` 列表读。

### 与全局的优先级

CPA 侧的行为：账号粒度 `proxy_url` 非空时覆盖全局；为空（或字段不存在）时使用全局 `CLIPROXY_PROXY_URL`；都为空则不使用代理。

注意：把账号粒度 `proxy_url` 设回空串与「未设置」在 CPA 不同版本里可能行为略有差异。最稳妥的「回到全局」做法是通过 CPA 管理 API 把字段删掉（AutoRouter 当前 PATCH 接口的 `proxy_url` 是 optional，不传该字段表示不更新，传空串需要 CPA 侧明确支持「空串 = 清除」语义）。如果发现「设了空串后仍然走老代理」，可以把账号删掉重建，或者直接到 CPA 侧改配置。

## 何时用哪个

| 场景                               | 全局 `CLIPROXY_PROXY_URL`    | 账号 `proxy_url` |
| ---------------------------------- | ---------------------------- | ---------------- |
| 整台 CPA 都要走同一个代理          | ✓                            |                  |
| 90% 账号走代理 A、几个特例走代理 B | ✓（代理 A）                  | ✓（代理 B）      |
| 每个账号都不同代理                 |                              | ✓                |
| 部分账号直连、其他账号走代理       |                              | ✓                |
| 全部账号直连                       |                              |                  |
| 仅 `external` 模式 CPA             | （AR 无法设置，到 CPA 自配） | ✓                |

## 校验方法

### 全局代理是否生效

1. 改完 `.env` 并 `docker compose -f docker-compose.yml -f docker-compose.cliproxy.yml up -d` 后，检查容器 env：
   ```
   docker compose exec cliproxyapi env | grep CLIPROXY_PROXY_URL
   ```
2. 检查渲染后的 config.yaml（默认路径 `/CLIProxyAPI/config.yaml`，由 `cliproxy/docker-entrypoint.sh:12` 的 `CLIPROXY_CONFIG_TARGET` 决定；若覆盖了该变量按实际值看）：
   ```
   docker compose exec cliproxyapi cat /CLIProxyAPI/config.yaml | grep proxy-url
   ```
3. 触发一次实际调用（管理后台列出账号 / 客户端发请求），CPA 日志中应能看到代理握手。

### 账号代理是否覆盖

通过管理后台编辑账号、保存 `proxy_url`，再调用 CPA `/v0/management/auth-files` 列表确认字段已更新。**不要**通过 AutoRouter 本地 `cliproxy_auth_accounts` 表来校验——该表无 `proxy_url` 字段，是缓存表，不反映 CPA 侧真实值。

### 常见症状速查

| 症状                                   | 排查方向                                                                                      |
| -------------------------------------- | --------------------------------------------------------------------------------------------- |
| 改了 `.env` 但 CPA 不走代理            | 没重启 CPA 容器；或当前是 `external` 模式（AR `.env` 不会注入到外部 CPA）                     |
| AR 本身访问上游被墙                    | AR 不支持出站代理，不可配；考虑在 AR 容器外解决，或换部署位置                                 |
| 账号 `proxy_url` 设了但 CPA 还在用全局 | 检查 CPA 版本对「空串 vs 未设置」的处理；或直接到 CPA 侧 `/v0/management/auth-files` 看真实值 |
| OAuth 登录卡住                         | 出站代理本身不通；先用宿主 `curl -x ... https://...` 自测代理可达                             |
| 管理后台显示账号正常但调用失败         | 账号粒度 `proxy_url` 写错；从 CPA 侧（不是 AR 缓存）取真实值核对                              |

## 不在本页范围内

- AR 容器在受限网络下访问数据库 / 监控 / DNS 等其它出站需求：与本页无关，按基础设施层方案处理。
- CPA `proxy-url` 的更高级配置（按目标域名分流、TLS 验证等）：见 CPA 自身文档。
- CPA 实例的 `mode` 字段差异：见 [CLIProxyAPI 外部 vs sidecar 选择](./cliproxy-modes)。
- 全部 sidecar 部署变量：见 [环境变量参考](../deployment/env-reference) 与 [CI 部署后追加 CLIProxyAPI sidecar](../deployment/cliproxy-sidecar)。
