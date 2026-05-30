---
title: 添加第一个上游
outline: deep
---

# 添加第一个上游

「上游」是 AutoRouter 转发请求时的目标 AI 服务方。一条上游记录至少绑定一个 base URL 与一把 API Key，并声明它支持哪些「路由能力」（如 `openai_chat_compatible`、`anthropic_messages`）。客户端经 AutoRouter 调用时，AutoRouter 按请求路径与模型从所有上游中筛出候选集，再按权重 / 优先级 / 熔断状态选一条转发。

本页用最常见的 OpenAI 兼容上游走一遍端到端流程，覆盖创建、保存、连通性测试、首次代理调用所需要的最小字段集。其他类型的上游（Anthropic、Gemini、CLIProxyAPI 池上游）字段填法基本一致，差别只在 `route_capabilities` 的取值，文末单列说明。

## 前置

- 已按 [快速开始](../deployment/quickstart) 完成部署，能用 `ADMIN_TOKEN` 登录管理后台。
- 已经持有目标上游服务的 API Key，例如 OpenAI 平台颁发的 `sk-...` 形式的 secret key。
- 知道目标上游的 base URL，例如 OpenAI 官方 API 是 `https://api.openai.com/v1`。中转服务一般给出形如 `https://<host>/v1` 的兼容地址。

## 进入上游管理页

侧边栏「上游管理」→ `/upstreams`。第一次部署后该页面为空。点击「新增上游」打开表单对话框。

表单字段较多，但绝大多数有合理默认值；以下分组介绍真正需要关注的字段。

## 必填的四个字段

最小化一个能立刻工作的上游只需要四个字段：

| 字段                             | 取值示例                     | 说明                                                                           |
| -------------------------------- | ---------------------------- | ------------------------------------------------------------------------------ |
| 名称（`name`）                   | `openai-official`            | 1–64 字符的可读标识。仅用于管理端显示与日志识别，不参与路由                    |
| Base URL（`base_url`）           | `https://api.openai.com/v1`  | 上游的根地址，AutoRouter 在转发时会在末尾追加路径，如 `/chat/completions`      |
| API Key（`api_key`）             | `sk-proj-...`                | 调用上游使用的密钥；保存时由 AutoRouter 用 Fernet 加密后写入数据库，原文不落盘 |
| 路由能力（`route_capabilities`） | `["openai_chat_compatible"]` | 声明该上游能承接哪些客户端请求路径，下节展开                                   |

字段名以 API 命名为准（snake_case），表单界面会用中文标签呈现。Zod 校验来自 `src/app/api/admin/upstreams/route.ts:91`。

## 路由能力字段：决定上游能承接哪些请求

`route_capabilities` 是路由决策的最重要依据。AutoRouter 收到代理请求后，先根据请求路径解析出一个「路由能力」枚举值，再从所有上游中筛出 `route_capabilities` 包含该枚举的候选集。当前支持的枚举值（来自 `src/lib/route-capabilities.ts`）：

| 路由能力                      | 对应客户端请求路径                                                                                        | 典型上游                                          |
| ----------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `openai_chat_compatible`      | `POST /v1/chat/completions`、`GET /v1/models`                                                             | OpenAI 官方、各类 OpenAI 兼容中转、本地 ollama 等 |
| `openai_extended`             | `POST /v1/completions`、`/v1/embeddings`、`/v1/moderations`、`/v1/images/generations`、`/v1/images/edits` | OpenAI 官方非 chat 路径                           |
| `openai_responses`            | `POST /v1/responses`（及子路径）                                                                          | OpenAI Responses API                              |
| `codex_cli_responses`         | 同上，针对 Codex CLI 客户端的请求头 profile                                                               | CLIProxyAPI 池上游                                |
| `anthropic_messages`          | `POST /v1/messages`（及子路径）                                                                           | Anthropic 官方、Claude 兼容中转                   |
| `claude_code_messages`        | 同上，针对 Claude Code CLI 客户端的请求头 profile                                                         | CLIProxyAPI 池上游                                |
| `gemini_native_generate`      | `POST /v1beta/models/<model>:generateContent` 等                                                          | Google AI Studio、Vertex AI                       |
| `gemini_code_assist_internal` | `POST /v1internal:generateContent` 等                                                                     | CLIProxyAPI 池上游                                |

校验规则：单个上游的 `route_capabilities` 必须属于同一个 provider 家族（`areSingleProviderCapabilities`，`src/lib/route-capabilities.ts:213`）。例如不能在同一条上游里同时勾选 `openai_chat_compatible` 与 `anthropic_messages`。需要承接两类协议时建一条 OpenAI 上游、再建一条 Anthropic 上游。

第一条 OpenAI 上游通常勾选 `openai_chat_compatible`；如果需要承接 `/v1/embeddings` 之类的非 chat 路径，再追加 `openai_extended`。

## 可选字段：影响选路与运行行为

下面这些字段都有默认值。最小化使用全部留空即可，但理解它们对后续调优很重要。

| 字段                                                     | 默认    | 用途                                                                                                                   |
| -------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------- |
| `weight`                                                 | `1`     | 权重，1–100 整数。在同组候选集中按权重做加权随机选择                                                                   |
| `priority`                                               | `0`     | 优先级，非负整数。同组先按优先级降序筛选，再在最高优先级内按权重选择                                                   |
| `timeout`                                                | `60`    | 转发请求的超时秒数                                                                                                     |
| `is_default`                                             | `false` | 标记为「默认上游」，在无其他匹配时兜底承接（视协议而定）                                                               |
| `official_website_url`                                   | null    | 上游官方网站链接，仅展示用                                                                                             |
| `allowed_models`                                         | null    | 该上游能承接的模型白名单。null 表示不限制                                                                              |
| `model_redirects`                                        | null    | 模型名映射，键为客户端请求的模型、值为转发到上游时实际使用的模型。例如把 `gpt-4o` 重定向为上游侧的 `gpt-4o-2024-11-20` |
| `model_rules`                                            | null    | 更复杂的模型规则，支持 `exact` / `regex` / `alias` 三类匹配。是 `model_redirects` 的演进版                             |
| `model_discovery`                                        | null    | 配置 AutoRouter 是否自动调用上游 `/v1/models` 拉取模型目录                                                             |
| `model_catalog`                                          | null    | 手工录入的模型目录条目，影响计费与可见性                                                                               |
| `circuit_breaker_config`                                 | null    | 熔断器阈值配置；具体语义见 [`docs/circuit-breaker.md`](/circuit-breaker)                                               |
| `max_concurrency`                                        | null    | 该上游的并发上限。达到上限的新请求按队列策略处理                                                                       |
| `queue_policy`                                           | null    | 并发饱和时的排队策略（队列长度上限、等待超时等）                                                                       |
| `failure_rule_config.use_global_rules`                   | null    | 是否启用「全局失败规则」覆盖默认熔断统计行为                                                                           |
| `billing_input_multiplier` / `billing_output_multiplier` | `1`     | 计费倍率。0–100 浮点                                                                                                   |
| `spending_rules`                                         | null    | 上游消费限额规则，支持 `daily` / `monthly` / `rolling` 三种周期                                                        |

## 保存：发生了什么

点击「保存」后，浏览器向 `POST /api/admin/upstreams` 发请求。服务端流程（`src/app/api/admin/upstreams/route.ts` 校验层 + `src/lib/services/upstream-crud.ts` 持久化层）：

1. Zod 校验（含 `route_capabilities` 同 provider 校验），不通过直接返回 400，不会触碰数据库。
2. 名称唯一性检查，已存在同名上游时返回错误。
3. `api_key` 字段用 `ENCRYPTION_KEY` 做 Fernet 加密后写入 `apiKeyEncrypted` 列；明文不进数据库。
4. 字段写入 `upstreams` 表，写入成功后立即出现在上游列表中，状态为活跃。

数据库约束之外，没有副作用——保存动作本身不会去触达上游，因此即使 base URL 写错或 API Key 失效，也能保存成功，问题要靠下一步连通性测试发现。

## 连通性测试

上游列表中每行末尾有「连通性测试」按钮，对应 `POST /api/admin/upstreams/[id]/test`（`src/app/api/admin/upstreams/[id]/test/route.ts`）。流程：

1. 从数据库读出该上游记录。
2. 用 `ENCRYPTION_KEY` 解密 `apiKeyEncrypted` 拿回明文。
3. 根据 `model_discovery.mode` 调用上游对应端点（OpenAI 兼容默认调 `GET /v1/models`），记录延迟。
4. 始终返回 HTTP 200，结果通过响应体的 `success` 字段与 `errorType` 字段表达：
   - `success: true`：地址可达、API Key 有效。
   - `success: false` + `errorType: "authentication"`：能联通但 API Key 被拒。
   - `success: false` + `errorType: "network"`：完全不可达，DNS 或 TCP 失败。
   - `success: false` + `errorType: "timeout"`：上游超过 `timeout` 未返回。
   - `success: false` + `errorType: "invalid_response"`：上游返回了非预期格式。
   - `success: false` + `errorType: "unknown"`：其他未分类失败。

排障指引：

| 现象                   | 通常原因                                                                                                        |
| ---------------------- | --------------------------------------------------------------------------------------------------------------- |
| `authentication`       | API Key 拼写错误、过期、绑定的项目无权限                                                                        |
| `network`              | base URL 拼写错误、DNS 不可解析、防火墙拦截                                                                     |
| `timeout`              | 上游响应慢；可临时把 `timeout` 调大复测，或检查网络出口                                                         |
| `invalid_response`     | base URL 末尾少了 `/v1`，导致命中了上游的非 API 路径                                                            |
| 表单填写时还想先测一下 | 用「保存前预测试」入口，对应 `POST /api/admin/upstreams/test`，直接带 inline credentials 测试，不依赖已保存记录 |

::: tip 容器服务名 vs localhost
如果上游是同一 Docker 网络里的另一容器（例如自部署的 LocalAI、Ollama、CLIProxyAPI），base URL 必须填写「容器服务名」而不是 `localhost`。AutoRouter 容器内的 `localhost` 指向自身，无法到达兄弟容器。例如填写 `http://cliproxyapi:8317` 而不是 `http://localhost:8317`。
:::

## 验证：用客户端发出第一笔请求

连通性测试通过后，还差「客户端 API Key」与「调用」两步。这两步分别在 [创建客户端 API Key](./client-keys) 与 [通过 AutoRouter 调用模型](./invoke-models) 展开。最短路径预览：

1. 在「密钥管理」创建一把 Key，绑定刚才的上游。
2. 用该 Key 调用 `POST http://<your-host>:3331/api/proxy/v1/chat/completions`，body 中 `model: "gpt-4o-mini"`。
3. 在「请求日志」看到该请求命中了刚才的上游、状态码 200。

闭环完成后，「仪表盘」上也会出现第一条统计数据。

## 其他上游类型的字段差别

| 上游类型                     | `route_capabilities` 取值                                                                  | base URL 与 API Key 形式                                                                            | 备注                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| OpenAI 兼容                  | `["openai_chat_compatible"]`，按需追加 `openai_extended` 或 `openai_responses`             | OpenAI 官方 `https://api.openai.com/v1`，OpenAI 形 `sk-...`                                         | 本页主要例子                                                                   |
| Anthropic                    | `["anthropic_messages"]`                                                                   | `https://api.anthropic.com`，Anthropic 形 `sk-ant-...`                                              | 客户端请求路径为 `/v1/messages`                                                |
| Gemini（AI Studio / Vertex） | `["gemini_native_generate"]`                                                               | `https://generativelanguage.googleapis.com`，Google API Key                                         | 客户端请求路径为 `/v1beta/models/<model>:generateContent`                      |
| CLIProxyAPI 池上游           | `["codex_cli_responses"]` / `["claude_code_messages"]` / `["gemini_code_assist_internal"]` | 受管 sidecar 下 `http://cliproxyapi:8317`，API Key 与 CLIProxyAPI 的 `CLIPROXY_CLIENT_API_KEY` 一致 | 需先按 [CLIProxyAPI 首次使用指南](./cliproxy-first-time) 登记 CLIProxyAPI 实例 |

## 不在本页范围内

- 模型路由的更细规则（前缀匹配、`model_rules` / `model_redirects` 的细节）：见后续「模型路由规则」。
- 多上游的权重 / 优先级 / 并发上限调度逻辑：见后续「负载均衡与权重」。
- 熔断器状态机与失败规则联动：见 [`docs/circuit-breaker.md`](/circuit-breaker) 与后续「熔断器配置」。
- CLIProxyAPI 池上游的完整建立流程：见 [CLIProxyAPI 首次使用指南](./cliproxy-first-time)。
