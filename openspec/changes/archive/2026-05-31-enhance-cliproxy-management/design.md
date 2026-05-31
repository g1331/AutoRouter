## Context

AutoRouter 的 CLIProxyAPI 管理页面（`system/cliproxy`）目前包含实例表格和账号面板两个区块，支持实例 CRUD、连通性检测、账号同步/启停/字段编辑、OAuth 登录（3 个 Provider）和上游创建。CLIProxyAPI 原生 WebUI 则额外提供认证文件上传/下载/删除、日志查看、OAuth 回调提交、6 个 Provider 支持等能力。本次变更在现有页面基础上扩展，补齐这些管理能力。

### 当前页面结构

```
┌─────────────────────────────────────────────────┐
│ Topbar: CLIProxyAPI                             │
├─────────────────────────────────────────────────┤
│ Card: Instances                    [+ Add]      │
│ ┌─────┬──────┬────────────┬────────┬──────────┐ │
│ │Name │ Mode │ Proxy URL  │ Status │ Actions  │ │
│ ├─────┼──────┼────────────┼────────┼──────────┤ │
│ │ ... │ ...  │ ...        │ Badge  │ ⋯ Menu   │ │
│ └─────┴──────┴────────────┴────────┴──────────┘ │
├─────────────────────────────────────────────────┤
│ Card: OAuth Accounts (选中实例后显示)            │
│          [OAuth Login] [Sync Accounts]          │
│ ┌──────┬──────────┬────────┬───────┬──────────┐ │
│ │ File │ Provider │ Status │Models │ Actions  │ │
│ ├──────┼──────────┼────────┼───────┼──────────┤ │
│ │ ...  │ Badge    │ Badge  │  N    │ ⋯ Menu   │ │
│ └──────┴──────────┴────────┴───────┴──────────┘ │
└─────────────────────────────────────────────────┘
```

## Goals / Non-Goals

**Goals:**

1. 在现有 CLIProxyAPI 管理页面中补齐认证文件管理（上传、下载、删除）、模型列表查看、账号详情查看、OAuth 回调提交、实例日志查看、关联上游查看共 6 个功能区
2. 将 OAuth Provider 从 3 个扩展到 6 个
3. 实例表格增加行内启停切换
4. 所有新增功能复用现有架构模式，保持代码风格一致

**Non-Goals:**

1. 不引入 CLIProxyAPI 的配置管理（config.yaml 读写）——远程修改运行时配置安全风险高
2. 不引入 AI Provider 密钥管理——AutoRouter 的上游管理已覆盖此能力
3. 不引入配额管理——与 AutoRouter 的 billing 系统概念重叠
4. 不引入 Ampcode 集成——小众 Provider，后续按需添加

## Decisions

### D1: 页面布局扩展策略

在现有两个 Card（实例表格 + 账号面板）的基础上，新增两个 Card（关联上游面板 + 日志面板），均在选中实例后显示。页面纵向排列顺序为：实例表格 → 账号面板 → 关联上游面板 → 日志面板。

**备选方案**：使用 Tab 切换不同面板。放弃原因：当前面板数量有限（4 个），纵向排列更符合现有布局风格且一目了然。

### 扩展后页面布局

```
┌──────────────────────────────────────────────────────┐
│ Topbar: CLIProxyAPI                                  │
├──────────────────────────────────────────────────────┤
│ Card: Instances                          [+ Add]     │
│ ┌──────┬──────┬────────────┬────────┬───────────────┐│
│ │Name  │ Mode │ Proxy URL  │ Status │   Actions     ││
│ ├──────┼──────┼────────────┼────────┼───────────────┤│
│ │ ...  │ ...  │ ...        │[Toggle]│ ⋯ Menu        ││
│ └──────┴──────┴────────────┴────────┴───────────────┘│
│                                            ▲         │
│                              行内 Switch 启停切换     │
├──────────────────────────────────────────────────────┤
│ Card: OAuth Accounts (选中实例后)                     │
│     [OAuth Login] [Upload Auth File] [Sync Accounts] │
│ ┌──────┬────────┬──────┬───────┬──────┬─────────────┐│
│ │ File │Provider│Status│Models │Prefix│  Actions     ││
│ ├──────┼────────┼──────┼───────┼──────┼─────────────┤│
│ │ ...  │ Badge  │Badge │  N 👁  │ ... │⋯ Menu       ││
│ └──────┴────────┴──────┴───────┴──────┴─────────────┘│
│                              ▲                       │
│            模型数可点击查看列表；Menu 增加详情/删除    │
├──────────────────────────────────────────────────────┤
│ Card: Linked Upstreams (选中实例后)                   │
│ ┌──────────────┬──────────┬────────────┬────────────┐│
│ │ Upstream Name│ Provider │ Type       │ Account    ││
│ ├──────────────┼──────────┼────────────┼────────────┤│
│ │ ... Pool     │ codex    │ Pool       │ —          ││
│ │ ... Account  │ anthropic│ Single     │ alice.json ││
│ └──────────────┴──────────┴────────────┴────────────┘│
├──────────────────────────────────────────────────────┤
│ Card: Instance Logs (选中实例后)                      │
│     [Refresh]  搜索框  时间范围选择                    │
│ ┌────────────────────────────────────────────────────┐│
│ │ 2025-05-31 10:23:45 [INFO] request forwarded ...  ││
│ │ 2025-05-31 10:23:46 [WARN] auth token expired ... ││
│ │ ...                                                ││
│ └────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────┘
```

### D2: 管理 API 客户端扩展方式

在现有 `cliproxy-management-client.ts` 中新增 5 个方法：`deleteAuthFile`、`uploadAuthFile`、`downloadAuthFile`、`submitOAuthCallback`、`getLogs`。保持与现有方法相同的模式：接受 `CliproxyManagementTarget`、调用 `requestManagementApi`、返回类型化结果。

`downloadAuthFile` 较特殊，返回的是原始 JSON 文本而非解析后的对象，需要在 `requestManagementApi` 之外单独处理响应。

### D3: OAuth Provider 扩展方式

在 `cliproxy-management-client.ts` 中扩展 `CLIPROXY_OAUTH_PROVIDERS` 常量和 `AUTH_URL_ENDPOINT` 映射。新增 Provider 对应的端点为：

| Provider | 端点片段 | 特殊参数 |
|----------|----------|----------|
| xAI/Grok | `xai-auth-url` | 无 |
| Antigravity | `antigravity-auth-url` | 无 |
| Kimi | `kimi-auth-url` | 无（无自动回调，需配合 OAuth callback 手动提交） |

前端 `CLIPROXY_PROVIDERS` 类型和 UI 选项列表同步扩展。`cliproxy-upstream-preset.ts` 中的 `CLIPROXY_UPSTREAM_PRESETS` 暂不扩展（新 Provider 的路径约定尚未确定），池上游创建仍限于原有 3 个 Provider。

**备选方案**：同时扩展 upstream preset 支持 6 个 Provider。放弃原因：xAI/Antigravity/Kimi 的 CLIProxyAPI 路径后缀和路由能力尚未有稳定约定，留作后续独立变更。

### D4: Admin 路由组织

新增路由全部放在 `src/app/api/admin/cliproxy/instances/[id]/` 下，保持与现有路由树一致：

```
instances/[id]/
  ├── auth-accounts/...           (existing)
  ├── oauth-login/...             (existing)
  ├── pool-upstreams/             (existing)
  ├── test/                       (existing)
  ├── auth-files/                 (NEW)
  │   ├── route.ts                POST: upload
  │   └── [name]/
  │       ├── route.ts            GET: download, DELETE: delete
  ├── oauth-callback/             (NEW)
  │   └── route.ts                POST: submit callback
  ├── logs/                       (NEW)
  │   └── route.ts                GET: fetch logs
  └── linked-upstreams/           (NEW)
      └── route.ts                GET: list linked upstreams
```

### D5: 认证文件删除与本地缓存清理

删除操作分两步：先调用 CLIProxyAPI `DELETE /v0/management/auth-files` 删除上游文件，成功后删除本地 `cliproxy_auth_accounts` 中对应的缓存记录。CLIProxyAPI 侧删除失败则整体失败，不触及本地缓存。

### D6: 日志面板实现

日志面板使用简单的增量拉取模式（`GET /v0/management/logs`），由前端手动刷新或设置自动刷新间隔。日志内容以等宽字体渲染，支持关键词筛选（前端过滤）。不使用 SSE 或 WebSocket 实时推送，保持实现简单。

**备选方案**：日志实时推送。放弃原因：CLIProxyAPI 管理 API 不提供日志推送端点，且 AutoRouter 在中间层做推送会增加不必要的复杂度。

### D7: 关联上游面板数据来源

直接查询 AutoRouter 本地 `upstreams` 表中 `cliproxyInstanceId` 匹配所选实例的记录。不需要调用 CLIProxyAPI 管理 API。查询结果包含上游名称、Provider、类型（池/单账号）、绑定的账号文件名。

## Risks / Trade-offs

**[CLIProxyAPI 版本兼容]** → 新增的管理 API 端点（auth-files 上传/下载/删除、oauth-callback、logs）可能在旧版本 CLIProxyAPI 中不存在。采用防御性处理：管理 API 调用失败时返回可理解的错误信息，不影响其他功能。

**[认证文件上传安全]** → 上传的 JSON 可能包含恶意内容。AutoRouter 仅做格式校验（合法 JSON），实际内容由 CLIProxyAPI 负责校验和处理。Admin API 本身需要 ADMIN_TOKEN 鉴权，风险可控。

**[日志体积]** → CLIProxyAPI 日志可能较大。前端限制单次拉取行数（默认 200 行），并支持时间范围过滤以控制返回体积。

**[新 Provider 无 upstream preset]** → xAI/Antigravity/Kimi 暂不支持一键创建池上游。OAuth 登录和账号管理可正常使用，上游创建需通过通用上游管理界面手动配置。
