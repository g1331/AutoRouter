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
│ 允许私有/内网/loopback 地址   │    │ 拒绝私有/内网/loopback/元数据 │
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

| 模式       | URL 格式 | 协议（http / https） | SSRF 校验              | 私有 IP / loopback / 云元数据端点 |
| ---------- | -------- | -------------------- | ---------------------- | --------------------------------- |
| `managed`  | 必须     | 必须                 | **跳过**               | **允许**                          |
| `external` | 必须     | 必须                 | 走 `isUrlSafe`（SSRF） | **拦截**                          |

`isUrlSafe` 是 AutoRouter 通用的 SSRF 防护函数（来自 `src/lib/services/upstream-ssrf-validator.ts`，也用于上游字段校验），会拒绝指向 169.254.169.254 这类云元数据端点、私有网段、loopback 等地址。

为什么要差异化处理：

- `managed` 模式下 CPA 在同一个 Docker 网络里，地址通常是 `http://cliproxyapi:port` 形式的服务名，或 `172.18.0.x` 之类的私有 IP。如果套上 SSRF 校验，正常的 sidecar 拓扑直接被拒。
- `external` 模式下 CPA 是远端独立服务，地址通常是公网域名。如果不做 SSRF 校验，攻击者可以登记一个指向云元数据端点的恶意「实例」，再通过 OAuth 登录/凭据测试等管理 API 请求做 SSRF 探测。

简记：**managed 牺牲一道防御换内网兼容性，external 牺牲内网兼容性换防御**。一旦把模式设错，要么填地址被无故拒（managed 应填的地址在 external 下被 SSRF 拦），要么把内网管理面无意中开放给 SSRF 利用面。

### 拓扑与地址填法

`managed`（sidecar 模式）：

- 部署形态：[CI 部署后追加 CLIProxyAPI sidecar](../deployment/cliproxy-sidecar) 描述的 `docker-compose.cliproxy.yml` 叠加文件。
- 地址格式：`http://<CPA 服务名>:<port>`。`base_url` 与 `management_url` 通常**填同一个值**——CPA 的代理转发端点与管理 API 端点是同一个 HTTP 服务的不同路径。
- 严禁使用 `localhost` / `127.0.0.1`：这两个在 AutoRouter 容器里指向自身，不是 CPA。

`external`（外部服务模式）：

- 部署形态：CPA 跑在另一台主机、另一台容器、甚至公网托管。
- 地址格式：`https://cpa.example.com` 或公网 IP + 端口。
- `base_url` 与 `management_url` 仍然通常相同；若管理面与转发面被反代到不同子路径，两者可以分别填。
- 实际填的地址必须能通过 SSRF 校验（公网域名或显式放行的非私有 IP）。

### `enabled` 字段的实际语义

`enabled` 字段在 schema、UI、管理后台 badge 都存在（`src/lib/db/schema-pg.ts:731`、`src/components/admin/cliproxy-instances-table.tsx:79-80`），但**当前版本任何路由 / 调度代码都没有读它**：

- 上游选路（`load-balancer.ts`）只看 `upstreams.is_active`，不看 `cliproxy_instances.enabled`。
- 池上游创建、连通性测试、OAuth 登录、账号同步等管理 API 也不在入口处检查 `enabled`。
- 把 `enabled` 设为 `false` **不会**让依赖该实例的池上游自动停止接流量；只是管理后台显示一个 `disabled` 角标。

要让一个实例下的池上游全部停摆，目前的可靠做法是把对应的**上游**（`upstreams` 表）逐条 `is_active = false`，或者直接删除该实例（删除时 `cliproxyInstanceId` 受 `onDelete: set null` 约束，相关上游的关联字段被清空但记录本身保留，仍按 `base_url` 直连——见下一节）。

### 删除实例的影响

`cliproxyInstanceId` 列声明（`src/lib/db/schema-pg.ts:115-117`）：

```ts
cliproxyInstanceId: uuid("cliproxy_instance_id").references(() => cliproxyInstances.id, {
  onDelete: "set null",
}),
```

删除一个 CPA 实例时：

| 关联对象                          | 行为                                                                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 池上游 / 单账号上游               | `cliproxyInstanceId` 置 NULL，`cliproxyProvider` / `cliproxyAuthFileName` 保留；上游记录**不删**，仍按 `base_url` 字面值发请求 |
| `cliproxy_auth_accounts` 本地缓存 | 不会被自动清理，需要单独处理                                                                                                   |
| 仍在跑的客户端请求                | 已经选定上游的请求继续发到原 `base_url`，CPA 关掉后会自然超时失败                                                              |

换言之，**删除实例不是优雅停机的方式**。要替换模式或迁移 CPA，先把相关上游 `is_active = false` 让流量自然停掉，再删实例。

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

- `managed` → `external`：切换会立即触发地址重新校验，如果当前 `base_url` / `management_url` 是内网地址，校验失败，PATCH 被拒。先把地址改成符合 SSRF 校验的形式（或同时改 mode + 地址），再保存。
- `external` → `managed`：放宽校验，地址原值不变。切换后立即生效。

无论哪个方向，切换 `mode` 不影响已存在的池上游、OAuth 账号缓存、转发流量；仅影响后续创建 / 编辑实例时的地址校验。

## 不在本页范围内

- CPA sidecar 的 docker-compose 配置细节：见 [CI 部署后追加 CLIProxyAPI sidecar](../deployment/cliproxy-sidecar) 与 [现有长篇 `docs/cliproxy-deployment.md`](/cliproxy-deployment)。
- 从 0 登记实例 / OAuth 登录 / 创建池上游的具体步骤：见 [CLIProxyAPI 首次使用指南](./cliproxy-first-time)。
- CPA 在受限网络环境下的出站代理配置：见 [CLIProxyAPI 出站代理配置](./cliproxy-egress-proxy)。
- AutoRouter 自身与上游、池上游之间的转发逻辑：见 [请求生命周期](../architecture/request-lifecycle)。
