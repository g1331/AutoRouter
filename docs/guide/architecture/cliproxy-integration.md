---
title: CLIProxyAPI 集成位置
outline: deep
---

# CLIProxyAPI 集成位置

CLIProxyAPI（以下简称 CPA）是承接 Codex、Claude、Gemini 三类 CLI OAuth 账号的独立服务。AutoRouter 并不接管 OAuth 凭据，而是把 CPA 当作一个具备账号池能力的上游服务来挂接：在 AutoRouter 侧记录实例连接信息和账号元数据缓存，转发时按池上游或单账号映射两种形态分发，OAuth token 始终留在 CPA 自身的持久化目录里。

本文档梳理 CPA 在 AutoRouter 架构里的具体位置：数据表、服务模块、转发路径、管理 API、前端入口，以及受管 sidecar 与外部服务两种部署模式在代码层面的差异。

## 数据模型

CPA 相关共有两张表，以及 `upstreams` 表中三个关联字段。

### `cliproxy_instances` — CPA 实例

每条记录代表一个可访问的 CPA 服务，字段定义见 `src/lib/db/schema-pg.ts:718-738`：

| 字段                       | 类型               | 说明                                                                   |
| -------------------------- | ------------------ | ---------------------------------------------------------------------- |
| `id`                       | uuid PK            | 主键                                                                   |
| `name`                     | varchar(64) unique | 实例显示名                                                             |
| `mode`                     | varchar(16)        | `managed`（受管 sidecar）或 `external`（外部独立服务），默认 `managed` |
| `base_url`                 | text               | CPA 代理转发基础地址，用于拼接池上游的 `baseUrl`                       |
| `management_url`           | text               | CPA 管理 API 基础地址，用于列表/同步/启停账号、发起 OAuth 等管理操作   |
| `client_api_key_encrypted` | text               | CPA 客户端 API Key 的 Fernet 密文                                      |
| `management_key_encrypted` | text               | CPA 管理 API 密钥的 Fernet 密文                                        |
| `enabled`                  | boolean            | 实例是否启用，默认 `true`                                              |
| `description`              | text               | 备注                                                                   |

模式取值由 `src/lib/services/cliproxy-instance-crud.ts:20` 的 `CLIPROXY_INSTANCE_MODES` 常量约束：

```ts
export const CLIPROXY_INSTANCE_MODES = ["managed", "external"] as const;
```

凭据明文从不落库。`getDecryptedClientApiKey` 在 `cliproxy-instance-crud.ts` 中按需对 Fernet 密文做解密，用完即弃。

### `cliproxy_auth_accounts` — OAuth 账号元数据缓存

每条记录映射 CPA 上的一个 auth-file，字段见 `src/lib/db/schema-pg.ts:744-771`：

| 字段                | 类型                                                | 说明                                          |
| ------------------- | --------------------------------------------------- | --------------------------------------------- |
| `id`                | uuid PK                                             | 主键                                          |
| `instance_id`       | uuid FK → `cliproxy_instances.id` ON DELETE CASCADE | 所属实例                                      |
| `auth_file_name`    | text                                                | CPA 侧 auth-file 名                           |
| `provider`          | text                                                | 服务商（`codex` / `anthropic` / `gemini` 等） |
| `email` / `status`  | text                                                | CPA 同步过来的快照字段                        |
| `disabled`          | boolean                                             | 账号是否被禁用，默认 `false`                  |
| `prefix`            | text                                                | 模型名前缀，用于单账号固定路由                |
| `model_count`       | integer                                             | 该账号当前能用的模型数                        |
| `priority` / `note` | integer / text                                      | 管理员维护的优先级与备注                      |
| `raw_metadata`      | jsonb                                               | CPA 响应字段的非敏感快照，禁止包含 token      |
| `last_synced_at`    | timestamptz                                         | 上次同步成功时间                              |

`(instance_id, auth_file_name)` 上有唯一约束（`schema-pg.ts:768`），保证同步幂等。

::: warning OAuth token 不入库
表注释明确写明：「OAuth token material is never stored here; it stays in CLIProxyAPI's auth-dir」（`schema-pg.ts:742`）。AutoRouter 缓存的全部是非敏感元数据。`raw_metadata` 由 `buildRawMetadata` 过滤后写入，token 字段在过滤步骤被剔除。
:::

### `upstreams` 表的 CPA 关联字段

`src/lib/db/schema-pg.ts:114-119` 为 `upstreams` 表追加了三个可空字段：

```ts
cliproxyInstanceId: uuid("cliproxy_instance_id").references(() => cliproxyInstances.id, {
  onDelete: "set null",
}),
cliproxyAuthFileName: text("cliproxy_auth_file_name"),
cliproxyProvider: varchar("cliproxy_provider", { length: 32 }),
```

普通上游三个字段全为 `null`。CPA 上游按下面规则判定形态，没有专门的 `is_cliproxy_pool` 标志位：

| 形态           | `cliproxyInstanceId` | `cliproxyAuthFileName` | 说明                                               |
| -------------- | -------------------- | ---------------------- | -------------------------------------------------- |
| 普通上游       | `null`               | `null`                 | 不走 CPA                                           |
| 池上游         | 有值                 | `null`                 | 落到该实例的某个服务商池，CPA 内部按负载策略选账号 |
| 单账号映射上游 | 有值                 | 有值                   | 固定路由到该 auth-file 对应账号                    |

实例的删除受守卫保护，并非依赖 FK 级联兜底。`deleteCliproxyInstance`（`cliproxy-instance-crud.ts:290-324`）在删除前依次检查：

1. 实例下是否仍有缓存的 OAuth 账号——若有则抛 `CliproxyInstanceInUseError`，提示「请先移除账号后再删除实例」
2. 是否仍有关联该实例的上游（含池上游与单账号映射上游）——若有则抛同类错误，提示「请先删除相关上游后再删除实例」

只有当账号和上游都已清空时，实例本身才会被删除。三个 CPA 关联字段中只有 `cliproxyInstanceId` 带 FK `ON DELETE SET NULL`，但这条 FK 在正常路径下不会触发，仅作兜底，例如直接 SQL 删除绕过应用层守卫的极端情况。`cliproxyAuthFileName` 和 `cliproxyProvider` 是纯文本字段，没有外键，删除实例后不会自动清理。

## 服务模块分工

`src/lib/services/cliproxy-*` 共六个文件，各自承担独立职责。

| 文件                               | 职责                                                                               |
| ---------------------------------- | ---------------------------------------------------------------------------------- |
| `cliproxy-instance-crud.ts`        | 实例 CRUD、凭据加解密、按 mode 分支的地址校验                                      |
| `cliproxy-management-client.ts`    | 封装 CPA 管理 API 的 HTTP 调用（列 auth-files、查模型、改字段、查 OAuth URL/状态） |
| `cliproxy-auth-account-service.ts` | OAuth 账号本地缓存的列表、读取、同步、字段更新、启停                               |
| `cliproxy-oauth-login-service.ts`  | OAuth 登录流程编排（发起授权、轮询状态、登录成功后触发同步）                       |
| `cliproxy-upstream-preset.ts`      | 按服务商一键创建池上游与单账号映射上游，封装路径后缀、路由能力、前缀拼接           |
| `cliproxy-connection-tester.ts`    | CPA 管理 API 连通性检测（独立于普通上游连通性测试）                                |

服务商预设在 `cliproxy-upstream-preset.ts:38-54` 集中维护：

```ts
export const CLIPROXY_UPSTREAM_PRESETS: Record<CliproxyOAuthProvider, CliproxyUpstreamPreset> = {
  codex: {
    pathSuffix: "/v1",
    routeCapabilities: ["codex_cli_responses", "openai_responses"],
    label: "Codex",
  },
  anthropic: {
    pathSuffix: "/api/provider/anthropic/v1",
    routeCapabilities: ["claude_code_messages", "anthropic_messages"],
    label: "Claude",
  },
  gemini: {
    pathSuffix: "/api/provider/google",
    routeCapabilities: ["gemini_native_generate"],
    label: "Gemini",
  },
};
```

CPA 调整对外约定时，路径后缀与默认路由能力的改动集中在这一处。

## OAuth 账号同步机制

`syncCliproxyAuthAccounts` 在 `cliproxy-auth-account-service.ts:128-201` 实现，方向是**单向拉取**：CPA 管理 API → AutoRouter 数据库。

流程：

1. 通过 `listAuthFiles` 调用 CPA 的 `GET /v0/management/auth-files`，取得当前所有 auth-file 列表
2. 对每个 auth-file 逐条 upsert 到 `cliproxy_auth_accounts`（按 `(instance_id, auth_file_name)`）
3. 单条 auth-file 的模型数查询通过 `getAuthFileModels` 单独发起；失败时不中断，回退到上次值或 0
4. CPA 侧已不存在的本地缓存条目会被删除（`auth-account-service.ts:189-197`）
5. 单次同步返回 `{ added, updated, removed, total }` 计数

触发时机有两处：OAuth 登录成功后自动触发（`cliproxy-oauth-login-service.ts:91`），以及管理员手动调用 `POST /api/admin/cliproxy/instances/:id/auth-accounts/sync`。

## 转发路径中的 CPA 分支

CPA 上游在请求生命周期里只有一处特殊处理，即单账号映射上游的模型前缀注入，发生在 `src/app/api/proxy/v1/[...path]/route.ts:1511-1526`：

```ts
let cliproxyModelOverride: string | undefined;
if (selectedUpstream.cliproxyAuthFileName && selectedUpstream.cliproxyInstanceId && requestModel) {
  const accountPrefix = await resolveCliproxyAccountPrefix(
    selectedUpstream.cliproxyInstanceId,
    selectedUpstream.cliproxyAuthFileName
  );
  if (accountPrefix) {
    cliproxyModelOverride = buildCliproxyPrefixedModel(accountPrefix, requestModel);
  }
}
```

判断条件是 `cliproxyAuthFileName` 和 `cliproxyInstanceId` 同时有值，即仅单账号映射上游会进入这一分支；普通上游和池上游都会跳过。

拼接后的 `<prefix>/<model>` 形态通过 `forwardRequest` 的 `modelOverride` 参数传到 `proxy-client.ts:896` 的 `applyModelOverride` 函数：OpenAI / Anthropic 协议改写 JSON body 中的 `model` 字段；Gemini 原生协议改写 URL 路径中的模型段（`proxy-client.ts:887` 的 `GEMINI_NATIVE_MODEL_SEGMENT` 正则匹配）。

::: tip 池上游不依赖前缀
池上游的 baseUrl 已经拼好了服务商路径后缀（如 `/api/provider/anthropic/v1`），CPA 收到请求后会按 CPA 自身的账号选择策略分发，AutoRouter 不再额外注入前缀。
:::

## 受管 sidecar 与外部服务的差异

两种模式的代码差异集中在地址校验和容器编排上。

### 地址安全校验

`validateInstanceAddress`（`cliproxy-instance-crud.ts:105-128`）按 mode 分支：

| 模式       | 校验内容                                                                                                        |
| ---------- | --------------------------------------------------------------------------------------------------------------- |
| `managed`  | 仅校验 URL 格式与 `http:` / `https:` 协议；允许私有与内网地址（因为 sidecar 在同一 Docker 网络）                |
| `external` | 在上述基础上额外执行 `isUrlSafe`：拦截 `localhost`、字符串形态的私有 IP / loopback / link-local / IPv6 私网等等 |

`isUrlSafe` 是同步函数，只校验 URL 协议与字面 hostname；当 hostname 是域名时，**不做 DNS 解析**，因此该路径**不包括** [安全模型](./security#ssrf-三重校验) 文档里的第三重 `resolveAndValidateHostname` 校验。换言之，一个解析到 `127.0.0.1` 或 AWS 元数据地址的恶意域名理论上能通过 external 模式的实例创建校验。普通上游创建与连通性测试都会跑第三重 DNS 校验（参见上游连通性测试与探针），CPA 实例 external 模式目前是个例外。

填写 sidecar 的容器服务名 `http://cliproxyapi:8317` 之所以能通过校验，正是因为 managed 模式跳过了整个 `isUrlSafe` 那一层。

### 容器编排（仅 managed）

`docker-compose.cliproxy.yml` 是可选叠加文件，启用方式：

```bash
docker compose -f docker-compose.yml -f docker-compose.cliproxy.yml up -d
```

关键编排约定：

- 镜像 `${CLI_PROXY_IMAGE:-eceasy/cli-proxy-api:latest}`
- 入口脚本 `/cliproxy/docker-entrypoint.sh` 先按环境变量渲染 `config.yaml.template` 再启动 CPA 进程
- 命名卷 `cliproxy-auth` 挂到 `/root/.cli-proxy-api`，承载 OAuth 凭据目录，跨容器重启保留
- 命名卷 `cliproxy-logs` 挂到 `/CLIProxyAPI/logs`，承载运行日志
- 默认只在 `autorouter-net` 网络内可达，不暴露宿主机端口

`.env` 中的 `CLIPROXY_CLIENT_API_KEY` 与 `CLIPROXY_MANAGEMENT_KEY` 必须与 AutoRouter 实例记录里 Fernet 密文对应的明文一致，否则 AutoRouter 调 CPA 管理 API 会失败。

### 外部模式

`external` 模式下 AutoRouter 不参与容器编排，CPA 由运维独立部署。`base_url` 和 `management_url` 填外部地址，受 SSRF 校验约束，不能填私网或 loopback。

## 连通性检测

CPA 实例的连通性检测与普通上游完全分离。

`cliproxy-connection-tester.ts` 中的 `testCliproxyConnection` 调用 CPA 的 `GET /v0/management/auth-files` 端点验证管理 API 可达性与凭据有效性。普通上游的 `upstream-connection-tester.ts:322` 中的 `testUpstreamConnection` 没有 CPA 特殊分支——池上游和单账号映射上游虽然落库在 `upstreams` 表，但管理面板上的「测试连接」按钮对它们走的是普通上游的 OpenAI 兼容探测路径，不再去 CPA 管理 API 验账号。

实例本身的连通性测试由两条 Admin API 触发：保存前预检 `POST /api/admin/cliproxy/instances/test`，以及对已保存实例的 `POST /api/admin/cliproxy/instances/:id/test`。

## Admin API 全貌

`src/app/api/admin/cliproxy/instances/` 下的全部路由：

| 路径                                                                    | 方法                 | 职责                                        |
| ----------------------------------------------------------------------- | -------------------- | ------------------------------------------- |
| `/api/admin/cliproxy/instances`                                         | GET                  | 列出全部实例                                |
| `/api/admin/cliproxy/instances`                                         | POST                 | 创建实例                                    |
| `/api/admin/cliproxy/instances/test`                                    | POST                 | 未保存配置的创建前连通性预检                |
| `/api/admin/cliproxy/instances/:id`                                     | GET / PATCH / DELETE | 实例详情、更新、删除                        |
| `/api/admin/cliproxy/instances/:id/test`                                | POST                 | 已保存实例的连通性检测                      |
| `/api/admin/cliproxy/instances/:id/oauth-login`                         | POST                 | 发起 OAuth 登录，返回授权 URL 和 state      |
| `/api/admin/cliproxy/instances/:id/oauth-login/status`                  | GET                  | 轮询登录状态；成功时触发账号同步            |
| `/api/admin/cliproxy/instances/:id/auth-accounts`                       | GET                  | 列出实例下缓存的 OAuth 账号                 |
| `/api/admin/cliproxy/instances/:id/auth-accounts/sync`                  | POST                 | 手动触发账号同步                            |
| `/api/admin/cliproxy/instances/:id/auth-accounts/:accountName`          | PATCH                | 更新账号字段（prefix / priority / note 等） |
| `/api/admin/cliproxy/instances/:id/auth-accounts/:accountName/status`   | PATCH                | 启停账号                                    |
| `/api/admin/cliproxy/instances/:id/auth-accounts/:accountName/upstream` | POST                 | 创建单账号映射上游                          |
| `/api/admin/cliproxy/instances/:id/pool-upstreams`                      | POST                 | 按服务商一键创建 OAuth 池上游               |

所有路由都要求管理员 Bearer Token 鉴权。

## 前端入口

CPA 管理面板的唯一页面为 `src/app/[locale]/(dashboard)/system/cliproxy/page.tsx`，引用的核心组件按职责划分：

| 组件                                   | 职责                               |
| -------------------------------------- | ---------------------------------- |
| `cliproxy-instances-table.tsx`         | 实例列表表格                       |
| `cliproxy-instance-form-dialog.tsx`    | 实例创建 / 编辑表单                |
| `cliproxy-connection-test-dialog.tsx`  | 连通性检测对话框                   |
| `cliproxy-accounts-panel.tsx`          | OAuth 账号面板入口                 |
| `cliproxy-accounts-table.tsx`          | OAuth 账号表格（在 panel 内嵌套）  |
| `cliproxy-oauth-login-dialog.tsx`      | OAuth 登录流程对话框               |
| `cliproxy-pool-upstream-dialog.tsx`    | 按服务商一键创建池上游             |
| `cliproxy-account-upstream-dialog.tsx` | 单账号映射上游创建对话框           |
| `cliproxy-account-fields-dialog.tsx`   | 账号 prefix / priority / note 编辑 |

实例表单的 `mode` 选择决定下方 `base_url` / `management_url` 的字段提示策略：受管模式提示固定为 `http://cliproxyapi:8317`，外部模式切换为「填外部 CPA 的转发地址」。这块 UI 内嵌指南由 Issue #167 的 Phase 3 跟踪。

## 与其他架构文档的衔接

- 上游表 schema 全字段细节见 [上游模型](./upstream-model)
- 转发请求的完整生命周期（含 CPA 模型前缀注入位置）见 [请求生命周期](./request-lifecycle)
- 实例凭据 Fernet 加密、`isUrlSafe` 三重 SSRF 校验见 [安全模型](./security)
- 部署形态选择（受管 sidecar vs 外部）以及 sidecar 启用步骤见现有长篇 [`cliproxy-deployment`](/cliproxy-deployment)
