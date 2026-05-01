## Context

AutoRouter 当前负责客户端 API Key、上游授权、能力路由、模型规则、请求日志、计费、熔断、并发和配额治理。上游记录已经支持 `baseUrl`、加密 API Key、`config`、`routeCapabilities`、模型发现、模型目录、模型规则、队列策略和计费倍率等字段。

CLIProxyAPI 负责 Codex、Claude Code、Gemini CLI 的 OAuth 登录、token 文件、自动刷新、多账号调度、账号冷却、模型状态和 management API。该能力与 AutoRouter 的网关职责互补，适合作为 sidecar 或外部服务接入。

目标请求形态保持为：

```text
Client
  |
  | AutoRouter API Key
  v
AutoRouter /api/proxy/v1/*
  |
  | upstream route capability + model rules + load balancing
  v
CLIProxyAPI proxy endpoint
  |
  | OAuth account selection + token refresh
  v
Codex / Claude Code / Gemini CLI upstream
```

管理面需要同时表达两个网络方向：

```text
AutoRouter  --->  CLIProxyAPI service / management API
CLIProxyAPI --->  OAuth login endpoint / model API
```

前者由 AutoRouter 连接配置控制，后者由 CLIProxyAPI 出站代理配置控制。界面文案、测试动作和错误提示必须区分这两类地址，避免管理员把 sidecar 服务地址误认为 OAuth 出站代理。

## Goals / Non-Goals

**Goals:**

- 支持配置外部 CLIProxyAPI 服务，并预留受管 sidecar 模式所需的配置结构。
- 支持保存加密后的 CLIProxyAPI client API key 与 management secret，并在响应中只返回掩码或状态信息。
- 支持调用 CLIProxyAPI management API 查看账号、模型、状态，发起 Codex、Claude、Gemini OAuth 登录并轮询登录状态。
- 支持一键创建 Codex OAuth 池、Claude OAuth 池、Gemini OAuth 池上游，自动填充 base URL、能力标签和模型发现初始配置。
- 支持将单个 CLIProxyAPI 账号通过 prefix 与 AutoRouter 模型规则固定为独立上游。
- 保持 AutoRouter 现有代理主流程不变：API Key 授权、能力过滤、模型规则、负载选择、请求日志和计费仍由 AutoRouter 执行。
- 支持本地外部 CLIProxyAPI 调试，并补充 Docker Compose sidecar、auth-dir、config 持久化和出站代理配置说明。

**Non-Goals:**

- AutoRouter 内部不实现 Codex、Claude Code、Gemini CLI 的 OAuth 协议细节。
- AutoRouter 数据库不保存 OAuth token 明文、refresh token 明文或 CLIProxyAPI auth-dir 文件内容。
- 本变更不引入 sub2api 作为主集成对象，也不替换 AutoRouter 现有 API Key、计费和路由体系。
- 首批实现不要求 AutoRouter 托管 CLIProxyAPI 的完整进程生命周期；外部服务模式先作为基础能力交付，sidecar 模式保留配置与部署入口。

## Decisions

### 1. CLIProxyAPI 作为外部代理边界

**Decision**: AutoRouter 将 CLIProxyAPI 视为受管 sidecar 或外部服务，不在主应用内实现 OAuth 协议与账号调度。

**Why**:

- AutoRouter 的核心优势在网关治理，CLIProxyAPI 的核心优势在 CLI OAuth 与账号池调度，两者职责边界清晰。
- OAuth token 文件、刷新、账号冷却和 provider 特有协议变化应留在 CLIProxyAPI 内部，降低 AutoRouter 的维护面。
- 现有代理入口已经按能力、授权、模型规则、运行态约束选择上游，只需把 CLIProxyAPI endpoint 建模为上游即可复用主链路。

**Alternatives considered:**

| 方案 | 取舍 |
| --- | --- |
| 在 AutoRouter 内重写 CLI OAuth | 控制力更高，但需要长期跟踪多个 CLI 协议和 token 存储细节，维护成本过高。 |
| 集成 sub2api | 功能覆盖更宽，但它更像完整订阅分发平台，与 AutoRouter 已有 Key、计费、路由和管理台重叠较多。 |
| 只允许手工创建普通 upstream | 改动较小，但无法满足账号管理、OAuth 登录、出站代理和固定账号上游等验收项。 |

### 2. 配置分为全局连接与上游实例引用

**Decision**: 新增 CLIProxyAPI 连接配置类型，区分全局服务连接和具体上游的 CPA 引用；具体存储在实现阶段优先复用 `upstreams.config` 表达上游级元数据，同时为全局连接配置提供单独管理 API。

```text
CLIProxyAPI Connection
  - mode: external | managed_sidecar
  - base_url
  - client_api_key_encrypted
  - management_url
  - management_secret_encrypted
  - outbound_proxy
  - status snapshot

AutoRouter Upstream
  - base_url: CPA provider proxy URL
  - api_key_encrypted: CPA client API key or placeholder for inherited config
  - route_capabilities: existing capability set
  - config.cliproxyapi: connection id, provider, account prefix, pool mode
```

**Why**:

- 上游转发所需的 `baseUrl`、`apiKeyEncrypted` 和 `routeCapabilities` 已经存在，继续使用这些字段可以减少代理主链路改动。
- `upstreams.config` 目前是通用 JSON 文本字段，适合承载 connection id、provider、account prefix、pool mode 等上游级扩展信息。
- 全局 management secret 不应重复写入每个上游，独立配置可以减少密钥轮换成本。

**Alternatives considered:**

| 方案 | 取舍 |
| --- | --- |
| 全部写入每个 upstream 的 `config` | 实现简单，但 management secret 会重复存储，账号列表也难以跨上游复用。 |
| 新增 OAuth account 表并同步 CPA 账号 | 便于本地查询，但会引入状态一致性问题，且 token 明文仍不可进入 AutoRouter。 |
| 只用环境变量配置 CPA | 部署简单，但管理端无法完成连接测试、OAuth 登录、代理配置和状态展示。 |

### 3. CPA management API 通过服务层封装

**Decision**: 新增 `cliproxyapi-service`，统一封装 management API 调用、认证头、超时、错误标准化、敏感字段掩码和响应类型转换。

**Why**:

- 管理路由需要复用同一套错误处理、超时和鉴权注入规则，避免在多个 API Route 中散落 fetch 调用。
- 服务层可以隔离 CLIProxyAPI 返回结构变化，并把外部错误转换为 AutoRouter 管理端可理解的错误信息。
- 账号列表、模型列表、登录 URL、登录状态、账号状态更新、账号字段更新和代理配置写入都属于同一个外部管理边界。

### 4. 一键上游预设只生成 AutoRouter 上游配置

**Decision**: Codex、Claude、Gemini OAuth 池预设负责生成 AutoRouter 上游初始值，不直接改变代理路由主流程。

| 预设 | base URL 示例 | route capabilities | 模型发现初始值 |
| --- | --- | --- | --- |
| Codex OAuth 池 | `http://cliproxyapi:8317/v1` | `codex_cli_responses`, `openai_responses` | OpenAI compatible |
| Claude OAuth 池 | `http://cliproxyapi:8317/api/provider/anthropic/v1` | `claude_code_messages`, `anthropic_messages` | Anthropic native |
| Gemini OAuth 池 | `http://cliproxyapi:8317/api/provider/google` | `gemini_native_generate` | Gemini native |

**Why**:

- 现有 `route_capabilities` 已能表达 Codex CLI、Claude Code 和 Gemini native 能力。
- 一键预设减少输入错误，同时仍让管理员在保存前调整名称、权重、优先级、模型规则、配额和并发。
- 代理入口继续按现有“能力过滤 → 授权过滤 → 模型规则 → 运行态选择 → 转发”执行，回归影响较小。

### 5. 管理端采用“连接状态 + 账号列表 + 上游预设”结构

**Decision**: 管理端新增 CLI OAuth 管理入口，并在上游创建弹窗提供 CPA 预设入口。

桌面布局示意：

```text
┌──────────────────────────────────────────────────────────────┐
│ CLI OAuth 管理                                                │
├───────────────┬──────────────────────────────────────────────┤
│ 服务连接      │ OAuth 账号                                    │
│ - Base URL    │ ┌─────────┬────────┬────────┬─────────────┐ │
│ - Mgmt URL    │ │ Provider│ Account│ Models │ Actions     │ │
│ - Secret      │ ├─────────┼────────┼────────┼─────────────┤ │
│ - Test        │ │ Codex   │ main   │ 12     │ login/edit  │ │
│               │ │ Claude  │ work   │ 8      │ disable     │ │
│ 出站代理      │ └─────────┴────────┴────────┴─────────────┘ │
│ - URL         │                                              │
│ - Test        │ 上游预设                                     │
│               │ [创建 Codex 池] [创建 Claude 池] [创建 Gemini 池]│
└───────────────┴──────────────────────────────────────────────┘
```

视觉层级说明：

| 区域 | 层级 | 目的 |
| --- | --- | --- |
| 服务连接 | 最高 | 先确认 AutoRouter 能访问 CLIProxyAPI management API。 |
| OAuth 账号 | 最高 | 展示账号状态、模型数量、启停和字段维护。 |
| 上游预设 | 次高 | 把已确认的 CPA 服务转换为 AutoRouter 上游。 |
| 出站代理 | 次高 | 配置 CPA 访问 OAuth 与模型 API 的网络出口。 |
| 详情错误 | 局部 | 在对应区域内展示，不覆盖账号列表和预设入口。 |

移动端布局示意：

```text
CLI OAuth 管理
  1. 服务连接
  2. 出站代理
  3. OAuth 登录入口
  4. 账号列表
  5. 上游预设
```

### 6. 敏感数据只做加密保存与掩码展示

**Decision**: CLIProxyAPI client API key 与 management secret 使用现有 Fernet 加密能力保存；列表和详情响应只返回掩码、存在状态、更新时间和连接状态。

**Why**:

- 项目已有 `encrypt`、`decrypt`、API key 掩码和 reveal 控制模式，应复用现有安全边界。
- OAuth token 明文属于 CLIProxyAPI auth-dir 管辖范围，AutoRouter 只持有访问 CPA 所需的最小凭据。
- management secret 权限较高，必须避免在管理端普通响应中回显明文。

## Risks / Trade-offs

| 项目 | 缓解方式 |
| --- | --- |
| CLIProxyAPI management API 版本变化导致调用失败 | 服务层集中封装响应解析，并在错误信息中标明外部服务返回状态。 |
| 管理端混淆 CPA 服务地址与 OAuth 出站代理地址 | UI 分成“AutoRouter 到 CPA”和“CPA 到 OAuth/模型服务”两个区域，并提供独立测试动作。 |
| 托管 sidecar 引入进程生命周期复杂度 | 首批实现以外部服务模式为基础，sidecar 仅在部署配置和检测层预留。 |
| 单账号固定路由与模型目录不完全一致 | 固定账号依赖管理员配置的 prefix 和模型规则，目录仅作为辅助信息，不限制显式别名目标。 |
| CPA 服务不可用影响对应上游 | AutoRouter 保持现有熔断、故障转移、请求日志和错误分类，让不可用状态进入现有运行态治理。 |

## Migration Plan

1. 新增 CLIProxyAPI 类型、配置解析和服务层，默认不开启任何 CPA 行为。
2. 新增管理 API 与连接测试接口，验证外部 CLIProxyAPI 可访问后再开放账号列表和 OAuth 登录入口。
3. 增加一键上游预设，生成普通 AutoRouter upstream 记录，保持现有代理主流程兼容。
4. 增加管理端 CLI OAuth 页面或设置入口，并补齐中英文文案、加载态、空态和失败态。
5. 更新 Docker Compose 与环境变量示例，说明外部服务模式和 sidecar 模式的 auth-dir/config 持久化方式。
6. 分阶段运行单元测试、组件测试、TypeScript 检查和构建；如果 CPA 未配置，现有上游管理与代理功能应保持原行为。

回退策略：删除 CPA 连接配置和 CPA 生成的上游即可停止使用该能力；未创建 CPA 上游时，新增代码路径不应影响普通 HTTP API Key 上游。

## Open Questions

- CLIProxyAPI 的 management API 是否提供稳定的出站代理写入接口与代理连通性测试接口，还是需要 AutoRouter 只保存并展示建议配置。
- 受管 sidecar 模式首批是否只提供 Docker Compose 配置，还是需要在 Node.js 运行时内实现本机子进程检测与启动。
- 全局 CLIProxyAPI 连接配置应落在专用数据库表，还是先使用系统配置型存储；实现前需要结合项目现有配置持久化模式再定。
