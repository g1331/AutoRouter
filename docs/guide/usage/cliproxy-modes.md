---
title: CLIProxyAPI 外部 vs sidecar 选择
outline: deep
---

# CLIProxyAPI 外部 vs sidecar 选择

`cliproxy_instances` 表的 `mode` 字段只有两个取值：`managed` 与 `external`（`src/lib/services/cliproxy-instance-crud.ts:20` 常量 `CLIPROXY_INSTANCE_MODES`）。这两个值不是单纯的展示标签——它们在地址校验、网络拓扑、运维边界上有真实差异。本页把这些差异列清楚，再给出一份选型建议。

> 前置阅读：[CLIProxyAPI 首次使用指南](./cliproxy-first-time)（实例字段总览、OAuth 流程、池上游创建）。本页只讨论模式选择本身。

## 一图看懂

```
┌──────────────────────────────┐    ┌──────────────────────────────┐
│ managed（sidecar）            │    │ external（远端独立服务）       │
├──────────────────────────────┤    ├──────────────────────────────┤
│ AutoRouter 与 CPA 同一 docker │    │ CPA 跑在另一台主机/另一网络   │
│ 网络，通过服务名互访           │    │ 通过公网 / 内网域名访问        │
│ base_url:        cliproxyapi  │    │ base_url:    cpa.example.com  │
│ management_url:  cliproxyapi  │    │ management_url: 同上           │
│ 允许私有/内网/loopback 地址   │    │ 拒绝私有/loopback IP 字面量   │
│ 适合自托管单实例 / 小团队     │    │ 适合多 AR 共享一个 CPA 服务    │
└──────────────────────────────┘    └──────────────────────────────┘
```

## 模式差异

### 地址校验

两种模式的核心差异在 `validateInstanceAddress`（`src/lib/services/cliproxy-instance-crud.ts:105-128`）：

```ts
if (mode === "external") {
  const result = isUrlSafe(urlString);
  if (!result.safe) {
    throw new InvalidCliproxyInstanceAddressError(
      `${label} 未通过地址安全校验：${result.reason ?? "地址不被允许"}`
    );
  }
}
```

| 模式       | URL 格式 | 协议（http / https） | SSRF 校验              | IPv4 字面量为私有 / loopback / 元数据 | IPv6 字面量（含 loopback / ULA） | 域名解析到私有 IP  |
| ---------- | -------- | -------------------- | ---------------------- | ------------------------------------- | -------------------------------- | ------------------ |
| `managed`  | 必须     | 必须                 | **跳过**               | **允许**                              | **允许**                         | **允许**           |
| `external` | 必须     | 必须                 | 走 `isUrlSafe`（SSRF） | **拦截**                              | **不拦截**（hostname 含方括号）  | **不解析、不拦截** |

`isUrlSafe`（`src/lib/services/upstream-ssrf-validator.ts:69-94`）的判定逻辑分三路：

- 解析出的 hostname 是 `localhost`：拒绝。
- hostname 字面是 IPv4 字面量（正则 `^[\d.:]+$` 命中）：交给 `isIpSafe` 校验，私有网段（10/8、172.16/12、192.168/16）、loopback（127/8）、链路本地（169.254/16，含 AWS 元数据端点）等全部拒绝。
- 其余情况（普通域名 + IPv6 字面量）：**直接返回 `safe: true`**，**不做 DNS 解析**。

::: warning 重要限制：仅 IPv4 字面量被拦截
`isUrlSafe` 的拦截能力只覆盖 **IPv4 字面量**。两类危险地址会逃过校验：

1. **IPv6 字面量**：`new URL("http://[::1]/").hostname === "[::1]"`（含方括号），正则 `/^[\d.:]+$/` 因为方括号不匹配，hostname 被当作普通域名直接 `safe: true`。`http://[::1]`、`http://[fc00::1]`、`http://[fe80::1]` 等 IPv6 loopback / ULA / 链路本地地址在 `external` 模式下**都能通过校验**。
2. **域名**：`http://cpa.internal` 即使最终解析到 `192.168.x.x` 或 `169.254.169.254`，也能通过校验，因为 `isUrlSafe` 不做 DNS 解析。

仓库里另有一个 `resolveAndValidateHostname`（同文件 `:99-153`）会做 DNS 解析并校验所有解析结果（含 IPv6），但 `validateInstanceAddress` 当前没有调用它。如果对外部 CPA 的拓扑信任度不够，建议把 `base_url` / `management_url` 写成公网 IPv4 字面量（让 IP 校验起作用），或者通过反向代理网关收敛入口；至少不要依赖 `external` 模式的 SSRF 校验来挡住 IPv6 或域名形式的内网地址。
:::

为什么要差异化处理：

- `managed` 模式下 CPA 在同一个 Docker 网络里，地址通常是 `http://cliproxyapi:port` 形式的服务名，或 `172.18.0.x` 之类的私有 IP。如果套上 SSRF 校验，正常的 sidecar 拓扑直接被拒。
- `external` 模式下 CPA 是远端独立服务，地址通常是公网域名。即使 SSRF 校验只在 IP 字面量上生效，对显式填写私有 IP 的恶意登记仍然有效，是一道有限但有意义的防御。

简记：**managed 完全跳过 SSRF 校验，external 启用基于 IP 字面量的 SSRF 校验**。一旦把模式设错，要么填地址被无故拒（managed 应填的内网 IP 在 external 下被 SSRF 拦），要么把内网管理面无意中开放给 SSRF 利用面。

### 拓扑与地址填法

`managed`（sidecar 模式）：

- 部署形态：[CI 部署后追加 CLIProxyAPI sidecar](../deployment/cliproxy-sidecar) 描述的 `docker-compose.cliproxy.yml` 叠加文件。
- 地址格式：`http://<CPA 服务名>:<port>`。`base_url` 与 `management_url` 通常**填同一个值**——CPA 的代理转发端点与管理 API 端点是同一个 HTTP 服务的不同路径。
- 严禁使用 `localhost` / `127.0.0.1`：这两个在 AutoRouter 容器里指向自身，不是 CPA。

`external`（外部服务模式）：

- 部署形态：CPA 跑在另一台主机、另一台容器、甚至公网托管。
- 地址格式：`https://cpa.example.com` 或公网 IP + 端口。
- `base_url` 与 `management_url` 仍然通常相同；若管理面与转发面被反代到不同子路径，两者可以分别填。
- 实际填的地址必须能通过 SSRF 校验：任何非 `localhost` 的域名都能通过，IP 字面量必须是非私有 / 非 loopback / 非元数据网段。注意域名校验**不查 DNS**（见上一节警告），如需更强保护请填公网 IP 字面量。

### `enabled` 字段的实际语义

`enabled` 字段在 schema、UI、管理后台 badge 都存在（`src/lib/db/schema-pg.ts:729`、`src/components/admin/cliproxy-instances-table.tsx:79-80`），但**当前版本任何路由 / 调度代码都没有读它**：

- 上游选路（`load-balancer.ts`）只看 `upstreams.is_active`，不看 `cliproxy_instances.enabled`。
- 池上游创建、连通性测试、OAuth 登录、账号同步等管理 API 也不在入口处检查 `enabled`。
- 把 `enabled` 设为 `false` **不会**让依赖该实例的池上游自动停止接流量；只是管理后台显示一个 `disabled` 角标。

要让一个实例下的池上游全部停摆，可靠做法是把对应的**上游**（`upstreams` 表）逐条 `is_active = false`。直接尝试删除实例并不能跳过这一步——见下一节。

### 删除实例的影响

`DELETE /api/admin/cliproxy/instances/:id` 路由调用 `deleteCliproxyInstance`（`src/lib/services/cliproxy-instance-crud.ts:290-324`），删除前依次做两轮引用校验：

```ts
// 1) 缓存账号引用校验
if (referencingAccounts.length > 0) {
  throw new CliproxyInstanceInUseError(
    instanceId,
    "该实例下仍存在缓存的 OAuth 账号，请先移除账号后再删除实例"
  );
}
// 2) 上游引用校验，外键 set null 仅作兜底
if (referencingUpstreams.length > 0) {
  throw new CliproxyInstanceInUseError(
    instanceId,
    "该实例下仍存在关联的池上游或单账号上游，请先删除相关上游后再删除实例"
  );
}
```

`CliproxyInstanceInUseError` 被路由层映射成 HTTP **409 Conflict**。`cliproxyInstanceId` 列虽然声明了 `onDelete: set null`（`src/lib/db/schema-pg.ts:115-117`），但应用层校验在 SQL 删除之前就会拒绝，外键策略只在数据被绕过应用层（直连 DB 删除）时才生效。

因此正确的删除顺序是：

| 步骤 | 操作                                                                                                            |
| ---- | --------------------------------------------------------------------------------------------------------------- |
| 1    | 该实例下所有**池上游 / 单账号上游**逐条删除（或先 `is_active = false` 让流量停掉，再删除）                      |
| 2    | 在 **CPA 侧**删掉对应的 auth-file，再回到 AutoRouter 触发**账号同步**，让本地缓存条目随同步被清除（见下方说明） |
| 3    | 删除实例本身                                                                                                    |

任何一步漏做都会让第三步返 409，提示中明确写出还有哪一类引用未清理。**没有「强制删除」开关**——这是有意设计，避免把还在接流量的池上游意外切断。

::: warning 账号列表当前没有「删除账号」按钮
账号子路由 `src/app/api/admin/cliproxy/instances/[id]/auth-accounts/[accountName]/route.ts` 只导出了 `PATCH`（字段更新），同目录下另有 `status/route.ts`（启停）与 `upstream/route.ts`（映射上游），但 AutoRouter **没有**为账号实现 `DELETE` 路由。管理后台账号表 UI 只提供「启用/禁用」「编辑字段」「映射为上游」三个动作。

因此「清掉本地缓存账号」的可行做法是借助 sync 反向清理：

1. 在 CPA 自己的管理界面（或直接操作其 auth-files 目录）删掉对应 OAuth 凭据文件。
2. 回到 AutoRouter 触发账号同步（管理后台账号列表的「同步」按钮，或调用 `POST /api/admin/cliproxy/instances/:id/auth-accounts/sync`）。
3. 同步流程在 `cliproxy-auth-account-service.ts:189-197` 会把本地 `cliproxy_auth_accounts` 中「CPA 侧已不存在」的行 `db.delete` 掉，`sync` 结果里的 `removed` 字段记录了清理条数。

如果 CPA 也不可达、根本同步不动，又必须删除 AutoRouter 侧的实例，最后的兜底是直接对 `cliproxy_auth_accounts` 表执行 `DELETE FROM cliproxy_auth_accounts WHERE instance_id = '<uuid>'`（生产环境慎用，建议先备份）。
:::

如果需要迁移到另一台 CPA：先建好新实例并把流量切过去（新建池上游 + 老池上游 `is_active = false` 让权重自然停止流入），观察一段无流量后再按上面三步删除老实例。

## 何时选哪个

| 场景                                                    | 选 `managed` | 选 `external` |
| ------------------------------------------------------- | ------------ | ------------- |
| 自托管单实例，AutoRouter + CPA 同一台机                 | ✓            |               |
| 用 `docker-compose.cliproxy.yml` 叠加文件部署的标准形态 | ✓            |               |
| 团队内一套 CPA 共用、多个 AR 远程接                     |              | ✓             |
| CPA 跑在公网托管、靠域名访问                            |              | ✓             |
| 跨网络管理面、需要 SSRF 校验作为附加防御                |              | ✓             |
| 临时本地开发，AR 在宿主、CPA 在 docker（端口映射访问）  | ✓ 或 ✗       | ✓ 或 ✗        |

最后一行需要展开：本地开发若把 AR 跑在宿主、CPA 跑在 docker 暴露的 `127.0.0.1:port`，填 `http://127.0.0.1:port` 会在 `external` 下被 SSRF 拦掉，必须选 `managed`。反过来，若 AR 在 docker、CPA 也在 docker 但属于不同 compose 网络，靠映射端口互通，那也只能用 `managed`。

## 切换模式

`mode` 字段允许通过 PATCH 接口修改（`src/lib/services/cliproxy-instance-crud.ts:238`，`mode = input.mode ?? (current.mode as CliproxyInstanceMode)`）。但要注意切换方向：

- `managed` → `external`：切换会立即触发地址重新校验。**只有内网 IPv4 字面量**（如 `http://172.20.0.5:8317`）会被 `isUrlSafe` 拦下，PATCH 被拒；Docker 服务名（如 `http://cliproxyapi:8317`）、IPv6 字面量、任意域名都会**通过校验**——参见上文「地址校验」一节的限制说明。也就是说大多数 sidecar 拓扑下的 managed 实例切到 external 时**不会因为校验失败而被拒**，但这些值原本就不适合外部模式（服务名只在 docker 网络内可解析），切换后实例虽然能保存，CPA 调用仍会因连不上而失败。要换 mode 时仍应该把地址改成外部可达的真实地址，校验通不通过都不是判定能不能切的依据。
- `external` → `managed`：放宽校验，地址原值不变。切换后立即生效。

无论哪个方向，切换 `mode` 不影响已存在的池上游、OAuth 账号缓存、转发流量；仅影响后续创建 / 编辑实例时的地址校验。

## 不在本页范围内

- CPA sidecar 的 docker-compose 配置细节：见 [CI 部署后追加 CLIProxyAPI sidecar](../deployment/cliproxy-sidecar) 与 [现有长篇 `docs/cliproxy-deployment.md`](/cliproxy-deployment)。
- 从 0 登记实例 / OAuth 登录 / 创建池上游的具体步骤：见 [CLIProxyAPI 首次使用指南](./cliproxy-first-time)。
- CPA 在受限网络环境下的出站代理配置：见 [CLIProxyAPI 出站代理配置](./cliproxy-egress-proxy)。
- AutoRouter 自身与上游、池上游之间的转发逻辑：见 [请求生命周期](../architecture/request-lifecycle)。
