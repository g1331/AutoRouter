---
title: CLIProxyAPI 首次使用指南
outline: deep
---

# CLIProxyAPI 首次使用指南

本页带读者从「AutoRouter 已部署 + CLIProxyAPI（下称 CPA）sidecar 已起来」出发，走完一条完整链路：登记 CPA 实例 → OAuth 登录账号（Codex / Claude / Gemini）→ 创建池上游 → 客户端调用成功。整个流程在管理后台 `/system/cliproxy` 页面与命令行客户端之间反复切换，每一步的字段含义、失败排查方法、踩坑点都按出现顺序展开。

前置条件：

- AutoRouter 实例可访问且能登录管理后台（参见 [快速开始](../deployment/quickstart)）。
- CPA sidecar 已通过 `docker-compose.cliproxy.yml` 叠加文件启动（参见 [CLIProxyAPI Sidecar 部署](../deployment/cliproxy-sidecar)）。

## 第一步：登记 CPA 实例

侧边栏 **系统 → CLIProxyAPI**（页面文件 `src/app/[locale]/(dashboard)/system/cliproxy/page.tsx`）。点击「添加实例」按钮打开表单弹窗（`src/components/admin/cliproxy-instance-form-dialog.tsx`）。

实例字段对应数据库表 `cliproxy_instances`（`src/lib/db/schema-pg.ts:718`），表单字段如下：

| 字段             | 必填                   | 含义                                                                                      |
| ---------------- | ---------------------- | ----------------------------------------------------------------------------------------- |
| `name`           | 是，唯一，最长 64 字符 | 实例名称，仅用于管理后台显示                                                              |
| `mode`           | 是，默认 `managed`     | `managed`（sidecar，与 AutoRouter 同 Docker 网络）/ `external`（独立运行的远端 CPA 服务） |
| `base_url`       | 是                     | 客户端代理转发的基础地址。后续创建池上游时会拼接 provider 后缀作为上游 `base_url`         |
| `management_url` | 是                     | 管理 API 基础地址。AutoRouter 调用 `/v0/management/*` 拉取账号、发起 OAuth 等都走这里     |
| `client_api_key` | 创建必填，编辑可留空   | 转发流量时注入到 `Authorization` 头的密钥；DB 中以 Fernet 加密存（`schema-pg.ts:727`）    |
| `management_key` | 创建必填，编辑可留空   | 管理 API 鉴权密钥；DB 中同样 Fernet 加密                                                  |
| `enabled`        | 否，默认 true          | 关闭后所有依赖该实例的池上游不可用                                                        |
| `description`    | 否，最长 512 字符      | 备注                                                                                      |

### sidecar 拓扑下的 base_url 与 management_url 怎么填

`mode = managed` 时，AutoRouter 容器与 CPA 容器在同一 Docker 网络中，**不能**用 `localhost`——`localhost` 指向 AutoRouter 容器自身。两个地址都应填 **CPA 容器的 Docker 服务名**，例如：

```
base_url:        http://cliproxyapi:<port>
management_url:  http://cliproxyapi:<port>
```

CPA 实际监听的端口由 CPA 自身配置决定，AutoRouter 源码中没有硬编码默认端口（`src/lib/db/schema-pg.ts:725-726` 只声明字段，不指定值），请以 `docker-compose.cliproxy.yml` 中暴露的端口为准；若未改动，按 CLIProxyAPI 自身文档的默认值填即可。

`mode = external` 时按外部 CPA 服务的真实地址填，可以是 `https://cpa.example.com` 或带端口的 IP。

### 「保存前先测一下」

表单内置「连通性预测试」按钮（`src/components/admin/cliproxy-instance-form-dialog.tsx:123-134`）。填好 `management_url` 与 `management_key` 后点它，会向 `/api/admin/cliproxy/instances/test` 发请求，后端调用 `testCliproxyConnection`（`src/lib/services/cliproxy-connection-tester.ts`）。

测试逻辑：以 `management_key` 作为 Bearer，对 `<management_url>/v0/management/auth-files` 发 GET 请求，超时 10 秒。结果按下表归类（`src/lib/services/cliproxy-connection-tester.ts:83-123`）：

| 返回状态        | 触发条件                      | 文案示例                                         |
| --------------- | ----------------------------- | ------------------------------------------------ |
| `success`       | HTTP 2xx                      | 连接正常                                         |
| `auth_failed`   | HTTP 401 / 403                | 「管理 API 密钥无效，CLIProxyAPI 拒绝鉴权」      |
| `service_error` | 其他非 2xx                    | 「CLIProxyAPI 管理 API 返回异常状态码 `<N>`」    |
| `unreachable`   | 10 秒超时、DNS 失败、连接拒绝 | 「管理 API 地址不可达：请求在 10 秒内未完成」 等 |

`unreachable` 几乎都是 `localhost` 与容器服务名填错引起。**推荐**习惯：保存前一定先点这个按钮，不要靠保存后再排查。

## 第二步：OAuth 登录账号

实例保存后，进入实例详情页或在实例行点击「OAuth 登录」按钮。AutoRouter 支持三种 provider（`src/lib/services/cliproxy-management-client.ts:9`）：

```ts
export const CLIPROXY_OAUTH_PROVIDERS = ["codex", "anthropic", "gemini"] as const;
```

对应 CPA 管理 API 的授权端点片段（`src/lib/services/cliproxy-management-client.ts:13-17`）：

| Provider    | CPA 端点                                           |
| ----------- | -------------------------------------------------- |
| `codex`     | `/v0/management/codex-auth-url?is_webui=true`      |
| `anthropic` | `/v0/management/anthropic-auth-url?is_webui=true`  |
| `gemini`    | `/v0/management/gemini-cli-auth-url?is_webui=true` |

`is_webui=true` 由 AutoRouter 自动追加（`src/lib/services/cliproxy-management-client.ts:227-230`），用于让 CPA 的 callback forwarder 处理容器部署下的回调链。

### 流程

1. UI 点「OAuth 登录」选择 provider → 前端调用 `POST /api/admin/cliproxy/instances/:id/oauth-login`，body `{ provider }`，后端走 `initiateCliproxyOAuthLogin`（`src/lib/services/cliproxy-oauth-login-service.ts:64-75`），返回 `{ provider, url, state }`。
2. UI 弹出新窗口打开 `url`（OAuth 授权页），等用户在该窗口完成授权并被重定向回 CPA。
3. UI 同时按固定间隔轮询 `GET /api/admin/cliproxy/instances/:id/oauth-login/status?state=<state>`，调用 `pollCliproxyOAuthStatus`（`cliproxy-oauth-login-service.ts:83-97`）。
4. 当 CPA 报告登录成功，`pollCliproxyOAuthStatus` 自动触发 `syncCliproxyAuthAccounts` 把账号同步到 AutoRouter 数据库的 `cliproxy_auth_accounts` 表（`src/lib/db/schema-pg.ts:744`）。

AutoRouter 自身**不持久化 OAuth 会话**，`state` 完全由 CPA 维护（`cliproxy-oauth-login-service.ts:63-65`）；OAuth token 也始终留在 CPA 的 auth 目录里，AutoRouter 只缓存账号非敏感元数据（`schema-pg.ts:741-742`）。这一层职责切分意味着：

- 账号过期：AutoRouter 侧没有刷新 token 的机制（`cliproxy-auth-account-service.ts` 只提供启停、字段更新、同步缓存三类操作）。过期账号需要重新走一次 OAuth 登录流程。
- 备份 CPA 自身的 auth 目录就等于备份了所有 OAuth 凭据，参见 [CLIProxyAPI Sidecar 部署](../deployment/cliproxy-sidecar) 的卷管理章节。

### 相关管理 API 路由清单

| 方法   | 路径                                                             | 说明                     |
| ------ | ---------------------------------------------------------------- | ------------------------ |
| `GET`  | `/api/admin/cliproxy/instances`                                  | 列出全部实例             |
| `POST` | `/api/admin/cliproxy/instances`                                  | 创建实例                 |
| `POST` | `/api/admin/cliproxy/instances/test`                             | 创建前的连通性预检       |
| `POST` | `/api/admin/cliproxy/instances/:id/oauth-login`                  | 发起 OAuth 登录          |
| `GET`  | `/api/admin/cliproxy/instances/:id/oauth-login/status?state=...` | 轮询登录状态             |
| `GET`  | `/api/admin/cliproxy/instances/:id/auth-accounts`                | 列出已缓存账号           |
| `POST` | `/api/admin/cliproxy/instances/:id/auth-accounts/sync`           | 手动触发账号同步         |
| `POST` | `/api/admin/cliproxy/instances/:id/pool-upstreams`               | 一键创建池上游（见下节） |

## 第三步：创建池上游

「池上游」是按 provider 预设的、自动挂回 CPA 实例的上游记录。普通上游需要手填 base_url、API Key、route_capabilities 等十几个字段；池上游只要选一个 provider，剩下的字段由 `createCliproxyPoolUpstream`（`src/lib/services/cliproxy-upstream-preset.ts`）自动填好后落到 `upstreams` 表。

### 三类 provider 的预设

`src/lib/services/cliproxy-upstream-preset.ts:38-54` 定义如下：

| Provider    | 上游 base_url 后缀           | 自动声明的 route_capabilities                    |
| ----------- | ---------------------------- | ------------------------------------------------ |
| `codex`     | `/v1`                        | `["codex_cli_responses", "openai_responses"]`    |
| `anthropic` | `/api/provider/anthropic/v1` | `["claude_code_messages", "anthropic_messages"]` |
| `gemini`    | `/api/provider/google`       | `["gemini_native_generate"]`                     |

举例：实例 `base_url` 为 `http://cliproxyapi:8317`，anthropic 池上游被创建时实际 `baseUrl` = `http://cliproxyapi:8317/api/provider/anthropic/v1`。`api_key` 字段使用实例的 `clientApiKey`（运行时解密后注入）。落库后 `upstreams` 表里还会回填 `cliproxy_instance_id` 与 `cliproxy_provider` 两个字段，用来在 UI 上把池上游与所属实例关联回去（`cliproxy-upstream-preset.ts:186-190`）。

### UI 入口

在实例详情页或实例行点「创建池上游」按钮，弹出 `CliproxyPoolUpstreamDialog`（`src/components/admin/cliproxy-pool-upstream-dialog.tsx`）。只有 **服务商**（codex / anthropic / gemini）是必填，其余字段（名称、权重、优先级）都可省略——省略时使用如 `CLIProxyAPI <实例名> Codex Pool` 这样的自动名称（`cliproxy-upstream-preset.ts:178`）。

每选一次 provider 就会创建一条独立的池上游记录。同一个实例可以同时挂三类池上游，互不影响。

## 第四步：客户端调用

池上游创建后，它在 `/upstreams` 列表里与普通上游并列，路由层把它们一视同仁。客户端调用形态与普通上游完全一致——base URL 指向 AutoRouter、`Authorization` 使用 AutoRouter 颁发的客户端 Key 即可，详见 [通过 AutoRouter 调用模型](./invoke-models)。

不同的是：CLI 工具自带的特征请求头会让 AutoRouter 把 `RouteCapability` 从基础态升级到 CLI 专属态，从而命中池上游而非普通的 OpenAI / Anthropic / Gemini 上游。识别逻辑在 `src/lib/services/route-capability-matcher.ts`：

### Codex CLI

识别（`route-capability-matcher.ts:144-156`）：以下任一为真即升级 `POST /v1/responses` 的能力为 `codex_cli_responses`：

- 请求头 `originator: codex_cli_rs`
- `User-Agent` 以 `codex_cli_rs/` 开头
- 任意 `x-codex-*` 请求头

满足时命中声明 `codex_cli_responses` 的 CPA codex 池上游。最小调用示例：

```bash
OPENAI_API_KEY=sk-auto-... \
OPENAI_BASE_URL=http://<your-host>:3331/api/proxy/v1 \
codex "解释一下 main.go"
```

Codex CLI 默认自带 `originator: codex_cli_rs` 请求头，不需要额外配置。

### Claude Code CLI

识别（`route-capability-matcher.ts:158-169`）：以下任一为真即升级 `POST /v1/messages` 的能力为 `claude_code_messages`：

- 请求头 `anthropic-beta` 包含 `claude-code-`
- `User-Agent` 以 `claude-cli/` 开头**且**请求头 `x-app: cli` 同时存在

满足时命中声明 `claude_code_messages` 的 CPA anthropic 池上游。最小调用示例：

```bash
ANTHROPIC_API_KEY=sk-auto-... \
ANTHROPIC_BASE_URL=http://<your-host>:3331/api/proxy/v1 \
claude "帮我写一个 hello world"
```

### Gemini SDK

Gemini 路由能力仅看路径 `/v1beta/models/<model>:generateContent` 或 `:streamGenerateContent`，**不涉及**请求头 profile 升级（`route-capability-matcher.ts:207-209`）。所以 Gemini SDK 调用本身没有「升级」一说，而是由声明 `gemini_native_generate` 的上游池整体承接。

```python
from google import genai

client = genai.Client(
    api_key="sk-auto-...",
    http_options={"base_url": "http://<your-host>:3331/api/proxy/v1"},
)
response = client.models.generate_content(model="gemini-2.0-flash", contents="hello")
print(response.text)
```

`base_url` 末尾必须保留 `/v1`，Gemini SDK 会再追加 `/v1beta/...`，丢掉会落到 404；详见 [通过 AutoRouter 调用模型](./invoke-models)。

## 常见踩坑速查

| 现象                                          | 多半原因                                                                             |
| --------------------------------------------- | ------------------------------------------------------------------------------------ |
| 连通性测试 `unreachable`                      | sidecar 拓扑下填了 `localhost`、端口写错、CPA 容器未启动                             |
| 连通性测试 `auth_failed`                      | `management_key` 与 CPA 侧配置不一致；CPA 配置文件改过、AutoRouter 侧未同步          |
| OAuth 登录窗口打开但回调一直不结束            | CPA 侧 callback forwarder 没工作；检查 CPA 配置与日志                                |
| 账号显示「已过期」                            | AutoRouter 侧无 token 刷新，重新走一次 OAuth 即可；老账号不需要先删                  |
| Codex CLI 调用走到普通 OpenAI 上游了          | 检查请求头是否带 `originator: codex_cli_rs`；自定义代理可能剥离了该头导致能力没升级  |
| Claude Code CLI 调用走到普通 Anthropic 上游了 | 检查 `anthropic-beta` 是否含 `claude-code-`；或 `User-Agent` 与 `x-app` 是否同时满足 |

## 不在本页范围内

- CPA 自身的 client_api_key / management_key 怎么生成、CPA 配置文件结构、CPA 监听端口：源码中未直接体现，参见 CLIProxyAPI 自身文档与 [CLIProxyAPI Sidecar 部署](../deployment/cliproxy-sidecar) 的卷与文件章节。
- 多实例并存的负载均衡逻辑：与普通上游完全一致，见 [负载均衡与权重](./load-balancing)。
- 模型字段如何与池上游能力交叉匹配：见 [模型路由规则](./model-routing)。
- 熔断器在池上游上的行为：见 [熔断器配置](./circuit-breaker-config) 与 [`docs/circuit-breaker.md`](/circuit-breaker)。
