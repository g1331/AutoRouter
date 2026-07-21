---
title: 创建客户端 API Key
outline: deep
---

# 创建客户端 API Key

「客户端 API Key」是 AutoRouter 颁发给调用方的 token，调用方在 `Authorization: Bearer <key>` 中携带它来访问 `/api/proxy/v1/*` 代理路径。AutoRouter 用它做两件事：判定调用方身份、决定该调用方可以访问哪些上游与哪些模型。

它与「上游 API Key」是两个完全不同的概念——后者是 AutoRouter 在转发给上游时使用的凭证，存在「上游管理」页的 `api_key` 字段。理解这一层关系后，本页要做的就是把第一把客户端 Key 创建出来。

## 进入密钥管理页

侧边栏「密钥管理」→ `/keys`。点击「新增密钥」打开创建对话框。

需要决定四件事：名称、访问模式、绑定哪些上游、是否设置过期。

## 必填的两个字段

| 字段                      | 取值要求                       | 说明                                                                                                 |
| ------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------- |
| 名称（`name`）            | 1–255 字符                     | 用于辨识用途，例如 `my-app-prod`、`telegram-bot`、`tester-1`。仅用于管理端显示与日志识别，不参与鉴权 |
| 访问模式（`access_mode`） | `restricted` 或 `unrestricted` | 决定该 Key 可访问的上游集合；下节展开                                                                |

如果只填名称、不显式指定访问模式与绑定上游，AutoRouter 会按下面的规则自动推断（`src/app/api/admin/keys/route.ts:26`）：

- 选中了至少一条上游 → 默认 `restricted`
- 一条都没选 → 默认 `unrestricted`

显式选 `restricted` 但又没选上游会被服务端校验拒绝并提示「至少需要选择一条上游」。

## 访问模式：受限 vs 全量

| 模式                   | 行为                                                            | 适合                                                                      |
| ---------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `unrestricted`（全量） | 该 Key 可路由到任何「活跃」上游，由 AutoRouter 按模型与路径筛选 | 个人用的「自己一切都能调」的密钥；不需要按业务分流；信任的内部应用        |
| `restricted`（受限）   | 该 Key 只能命中 `upstream_ids` 列表中的上游                     | 分配给特定业务 / 特定团队的 Key；按上游做计费分摊；隔离高风险或高成本上游 |

受限模式不是按「模型」隔离，而是按「上游」隔离。模型粒度的限制要在「可见模型白名单」字段单独配置：

| 字段             | 默认 | 用途                                                                                                                    |
| ---------------- | ---- | ----------------------------------------------------------------------------------------------------------------------- |
| `allowed_models` | null | 该 Key 可访问的模型白名单。null 表示不限制（不止本字段不限，还要叠加上游侧的 `allowed_models`）；非空时仅这些模型可访问 |

例如「这把 Key 只允许调用 `gpt-4o-mini` 与 `claude-3-5-haiku`，但允许走任意能承接它们的上游」，即把 `access_mode` 设为 `unrestricted`、`allowed_models` 填入这两个模型名。

## 可选：过期、消费与速率规则

| 字段             | 默认 | 用途                                                                      |
| ---------------- | ---- | ------------------------------------------------------------------------- |
| `expires_at`     | null | ISO 8601 时间戳，到期后该 Key 鉴权会被拒绝（HTTP 401）。null 表示永不过期 |
| `description`    | null | 备注信息，便于后续维护时回忆 Key 的用途                                   |
| `spending_rules` | null | 该 Key 的消费限额规则。支持 `daily` / `monthly` / `rolling` 三种周期      |
| `rpm_limit`      | null | 每分钟请求数（RPM）上限。正整数；null 表示不限制请求数                    |
| `tpm_limit`      | null | 每分钟 Token 数（TPM）上限。正整数；null 表示不限制已计量的响应 Token 数  |

过期判定（`src/app/api/proxy/v1/[...path]/route.ts:2469`）发生在每次代理请求鉴权时：`expiresAt && expiresAt < new Date()` 即返回 401。无需周期任务介入。

`spending_rules` 与上游的 `spending_rules` 含义类似，但作用对象是「该 Key 的累计消费」而非「该上游的累计消费」。

## 每分钟速率限制（RPM / TPM）

管理员可在密钥详情页的「速率限制」分区分别配置 RPM 与 TPM；两个维度互不依赖，留空即为该维度不限速。管理 API 的创建、更新和读取接口均使用 `rpm_limit` / `tpm_limit` 这两个字段，例如：

```json
{
  "rpm_limit": 60,
  "tpm_limit": 120000
}
```

限流使用 **60 秒滑动窗口**，并且状态只保存在当前 Node.js 进程内存中：

- 同一个进程中的同一把 Key 会共享计数；进程重启后计数可以清空，但已保存的配置不会丢失。
- 多实例部署时，各实例独立计数；它不是跨实例聚合的全局限流。需要严格的全局额度时，应在网关或共享限流存储层额外实现。
- RPM 在鉴权和请求上下文解析后、上游候选选择前检查。被允许的请求立即计入窗口；被拒绝的请求不会选路、排队或调用上游。
- TPM 只记录响应完成后真实得到的正 `totalTokens`：普通响应完成时记录，流式响应在 usage settle 后记录。系统不会预估未返回的 Token，也不会中断让累计量达到上限的当前请求；**该请求仍会完成，下一次请求才可能因 TPM 被拒绝**。

命中 RPM 或 TPM 时，客户端会收到统一的 429 响应；没有任何上游身份或候选信息泄露给调用方：

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 17
Content-Type: application/json
```

```json
{
  "error": {
    "code": "API_KEY_RATE_LIMITED",
    "type": "rate_limited",
    "did_send_upstream": false
  }
}
```

`Retry-After` 是大于 0 的整秒数，表示所有已启用限流维度都恢复后可以再次尝试的最早时间。限流拒绝也会写入请求日志，关联该 Key，但不会关联任何上游。

成员门户同样提供这两个字段。成员编辑已有 Key 时只能收紧限制：已配置的上限不能清除或调高；管理员仍可独立调整任何方向的配置。

## 保存：什么时候能看到完整密钥

点击「保存」后，浏览器向 `POST /api/admin/keys` 发请求。服务端流程（`src/lib/services/key-manager.ts:262`）：

1. 生成密钥：`sk-auto-<43 字符 base64url>`，例如 `sk-auto-h3z9...`。前 12 个字符（含 `sk-auto-` 前缀）作为「key prefix」存储，便于日志展示。
2. 完整密钥用 bcrypt（12 轮）哈希后存入 `keyHash` 列，用于后续鉴权比对。
3. 完整密钥用 `ENCRYPTION_KEY` 做 Fernet 加密后存入 `keyValueEncrypted` 列；在 `ALLOW_KEY_REVEAL=true` 时可用于揭示。
4. 创建接口的 201 响应体中 **唯一一次** 返回完整的 `key_value`；后续 GET / list 接口只返回 `key_prefix`。

::: danger 必须在创建对话框关闭前复制完整密钥
完整密钥仅在创建成功的那一次响应中返回。后续即使去「揭示密钥」入口也只在 `ALLOW_KEY_REVEAL=true` 时才可恢复；该开关默认关闭，且不建议长期开启。务必在创建完成的对话框 / 浮层关闭前把密钥复制到客户端的配置中。
:::

未复制密钥就关闭了对话框、且 `ALLOW_KEY_REVEAL` 关闭：唯一的恢复办法是删除该 Key 重新创建。

## 揭示已颁发的密钥

仅当部署侧 `ALLOW_KEY_REVEAL=true` 时可用。揭示接口：

```
GET /api/admin/keys/<id>/reveal
# 或
POST /api/admin/keys/<id>/reveal
```

响应体：

```json
{
  "id": "<key-uuid>",
  "key_value": "sk-auto-...",
  "key_prefix": "sk-auto-h3z9",
  "name": "my-app-prod"
}
```

返回前服务端会：

1. 检查 `config.allowKeyReveal`；false 时直接返回 403 `"Key reveal is disabled. Set ALLOW_KEY_REVEAL=true to enable."`。
2. 解密 `keyValueEncrypted`。
3. 校验 `bcrypt.compare(decryptedPlain, keyHash)`，防止数据库被横向迁移后揭示错配。
4. 通过则返回完整密钥。

如果该 Key 是早期创建的「legacy 形态」（只有 bcrypt hash、没有加密原文列），返回 400 `"Legacy keys (bcrypt-only) cannot be revealed."`。重置办法是删除后重新创建一把新 Key。

`ALLOW_KEY_REVEAL` 的安全权衡：

- 关闭（默认）：丢失密钥就只能重新创建；多客户端只能在创建时一次性分发。安全性高。
- 打开：管理员可以随时把已颁发密钥复述给客户端。便利性高，但任何能登入管理后台的人都可以拿到全部已颁发密钥的完整明文，等同于把分发权下放给所有管理员。

仅在确实需要、且管理后台访问严格受控的部署中开启。生产部署建议保持默认关闭。

## 停用与撤销

密钥管理页对每条 Key 提供以下生命周期操作：

| 操作        | 实际接口                      | 行为                                                                                                                                          |
| ----------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 编辑        | `PUT /api/admin/keys/[id]`    | 修改名称、访问模式、绑定上游、模型白名单、过期、消费规则与 RPM/TPM 速率限制                                                                   |
| 停用 / 启用 | `PUT /api/admin/keys/[id]`    | 通过修改 `is_active` 字段切换。停用后鉴权立即被拒绝，但数据库记录保留，可随时启用恢复                                                         |
| 撤销 / 删除 | `DELETE /api/admin/keys/[id]` | UI 上的「撤销」按钮调用 DELETE 接口，由 `deleteApiKey` 从数据库移除该 Key 记录。不可恢复，但请求日志中的 Key 字段会以历史快照形式保留以便追溯 |

::: warning 撤销 = 删除记录
当前实现里「撤销」与「删除」是同一个操作，调用 `DELETE /api/admin/keys/[id]` 把数据库记录真实抹掉（`src/app/api/admin/keys/[id]/route.ts:47`、`src/lib/services/key-manager.ts` 的 `deleteApiKey`）。如果你的合规或审计流程需要保留 Key 记录以便日后查阅，请使用「停用」（`is_active=false`）而不是「撤销」。
:::

## 使用密钥发请求

完整调用示例与各语言 SDK 集成示例见 [通过 AutoRouter 调用模型](./invoke-models)。最简形态：

```bash
curl -X POST http://<your-host>:3331/api/proxy/v1/chat/completions \
  -H "Authorization: Bearer sk-auto-..." \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role": "user", "content": "hello"}]
  }'
```

AutoRouter 也支持额外两种 header 名称（`src/app/api/proxy/v1/[...path]/route.ts:2255`）：

```
Authorization: Bearer <key>
x-api-key: <key>
x-goog-api-key: <key>
```

`x-api-key` 是为 Anthropic SDK 默认 header 准备的，`x-goog-api-key` 是为 Gemini SDK 准备的。三者任意一个都能通过鉴权。

## 鉴权失败的常见返回

| 现象                       | 原因                                                                                                       |
| -------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 401 Unauthorized           | header 中没有任何形式的密钥、密钥拼写错误、Key 已停用或撤销、Key 已过期、Key 已删除                        |
| 403 Forbidden（路由层）    | 受限模式下命中的路由能力没有任何绑定上游能承接（例如绑定的全是 OpenAI 上游、但发的是 `/v1/messages` 请求） |
| 429 `API_KEY_RATE_LIMITED` | 该 Key 的 RPM 或已计量 TPM 位于 60 秒窗口上限。等待响应中的 `Retry-After` 秒数后重试                       |
| 400 Bad Request            | 请求体中没有 `model` 字段、或模型名无法被解析                                                              |

## 不在本页范围内

- 调用各类模型与协议的 SDK 示例：见 [通过 AutoRouter 调用模型](./invoke-models)。
- 模型路由如何决定命中哪条上游：见后续「模型路由规则」。
- 上游的创建与字段：见 [添加第一个上游](./first-upstream)。
- 计费与消费规则的具体语义、对接：见后续「请求日志与统计」与「计费」相关文档。
