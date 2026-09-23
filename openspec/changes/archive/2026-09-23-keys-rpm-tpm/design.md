## Context

AutoRouter 已在 API Key 上提供花费配额与到期控制，但代理入口没有针对单把密钥的频率或 token 吞吐保护。现有登录、密码修改限流器与 session affinity 都是单进程内存实现，并通过有界 Map、滑动窗口清理计时器和测试用 reset 函数控制生命周期。本次沿用该部署边界：单实例可以可靠执行限制；多实例的聚合限流不属于本变更。

代理请求在 Key 鉴权后依次解析路径/模型、过滤授权与候选、转发、写请求日志，并在非流式响应结束或流式 usage settle 后获得 `totalTokens`。因此 RPM 能在准入点判断，TPM 只能使用已经完成计量的 token 做下一次准入判断。

管理台密钥编辑已是独立的分区详情页；成员门户使用单个创建/编辑对话框，并已在服务端为 `spending_rules` 实现“只能收紧”的防线。Issue #237 要求速率限制在这些既有入口保持一致。

## Goals / Non-Goals

**Goals:**

- 让每把 API Key 独立配置正整数 RPM 与 TPM，两个维度可单独启用，空值表示不限制。
- 在有效 Key 的代理准入阶段执行 60 秒滑动窗口检查；被拒绝时不选择或调用上游。
- 使用已经从响应提取出的 `totalTokens` 进行 TPM 记账，准确表达“超额请求已完成、下一请求被拦截”的口径。
- 返回统一、无上游身份泄露的 429 响应与标准 `Retry-After`，并为拒绝留下可追踪的请求日志。
- 让管理员可以独立保存速率配置，让成员创建时可设定、编辑时只能收紧；API、类型、双数据库方言、文案与文档保持同步。

**Non-Goals:**

- 不提供跨进程、跨节点或 Redis 等分布式计数器。
- 不预测输入 token、不预留尚未完成的流式请求 token，也不将无 usage 的响应估算为 token。
- 不新增全局、按用户或按上游的速率规则，不改变上游并发/队列机制或花费配额语义。
- 不在密钥创建的瘦管理员弹窗扩展额外可选项；管理员通过创建后详情页配置速率限制。

## Decisions

### 1. 使用两个可空整数字段而非 JSON 配置

`api_keys` 在 PostgreSQL 和 SQLite 中同时新增 `rpm_limit`、`tpm_limit`，均为可空正整数。Admin/User API 使用同名 snake_case 字段，服务层、响应转换和前端类型使用 camelCase。

- 选择独立列的原因：每个限制只有一个稳定、可索引/可校验的标量，不需要版本化 JSON，也能让 partial `PUT` 明确表达“未修改”与“显式清除”。
- 共享 Zod 校验会接受 `null` 或正整数；0、负数、小数、NaN 和超出数据库安全整数范围的输入均被拒绝。
- 备选方案是在 `spending_rules` 中新增 period 类型。该方案会把金额与速率两种量纲混在一起，也不能清晰表达 TPM 的事后计量，故不采用。

### 2. 单进程滑动窗口限流器同时维护请求与 token 事件

新增 `api-key-rate-limiter` 服务。它按 `apiKeyId` 保存两类时间序列：已准入请求的时间戳与 `{ timestamp, tokens }` token 事件。每次检查使用 `(now - 60s, now]` 窗口，先删除过期事件。

```text
API Key A
  request timestamps: [t-42s, t-14s, t-3s]     -- RPM
  token events:       [(t-38s, 120), (t-8s, 90)] -- TPM

checkAndRecordRequest(A, limits)
  ├─ prune events at or before t-60s
  ├─ requests >= rpm_limit ? reject
  ├─ sum(tokens) >= tpm_limit ? reject
  └─ otherwise append one request timestamp and allow

recordTokenUsage(A, totalTokens)
  └─ append completed response usage after it is known
```

调用 `checkAndRecordRequest` 是同步的，检查和追加之间不包含 `await`，因此同一 Node.js 进程内的并发请求不会穿透单一时间片的检查。只有启用了对应维度才保存对应事件；两个限制均为空时删除该 Key 的残留状态。服务使用有界键数、最早活动键淘汰和 `unref()` 的周期清理器，避免大量有效 Key 的低频请求无限占用内存，并导出 reset/诊断接口供测试使用。

对于被阻止的维度，重试时间取使窗口重新低于阈值所需的最晚过期事件；若 RPM 与 TPM 同时阻止，则取二者较大的秒数并向上取整，保证 `Retry-After` 后不会立即因为另一个维度再次拒绝。

备选方案是固定分钟桶。它会在分钟边界允许两倍突发，与 Issue 指定的滑动窗口不符，故不采用。

### 3. 代理链路在鉴权后、上游选路前准入，并在响应 settle 时记 TPM

代理会先完成 API Key 与 Key 所有者有效性校验，再解析请求上下文以便限流日志保留 path/model/能力信息，随后调用限流器；流量录制、候选加载、并发/队列准入和任何上游转发都发生在限流检查之后。

```text
valid API key + active owner
        │
        ▼
request context (path / model / capability)
        │
        ▼
rate limiter: TPM state check + RPM check-and-record
   ┌────┴────┐
 reject      allow
   │           │
429 + log     ▼
           auth/model/candidate checks → upstream
                                      │
                                      ▼
                     response or stream usage settles
                                      │
                                      ▼
                       recordTokenUsage(totalTokens)
```

RPM 对每个已通过 Key 鉴权的代理请求计数，包括后续会被模型授权或候选过滤拒绝的请求；这样密钥不能通过构造无效路由绕过入口保护。TPM 仅记录从实际响应中得到的正 `totalTokens`，不记录失败、取消或无 usage 的请求。导致窗口总 token 达到/超过限制的响应不被追溯中断；下一次检查会拒绝请求，符合 token 只能事后获得的限制。

备选方案是在转发前按请求体估算 token 或预扣保守额度。不同协议、模型和输出长度使估算不可靠且会产生大量误拒绝，故不采用。

### 4. 统一错误显式表示 `rate_limited` 并保留内部诊断日志

统一错误模块新增 `API_KEY_RATE_LIMITED` 代码、`API_KEY_RATE_LIMITED` reason 和 `rate_limited` error type，HTTP 状态为 429。响应只携带统一错误体、request ID、通用用户提示以及 `Retry-After`；不包含上游 ID、名称、URL、候选信息或具体限额值。

每个限流拒绝都复用现有 API Key 配额拒绝的日志模式：写入 `request_logs`、关联 Key 与所有者快照、`upstream_id = null`、token 为 0、状态 429，routing decision 标记为未向上游发送，`error_message` 使用可筛选的 `rate_limited` 标记和仅面向内部的维度说明。这样密钥统计包含拒绝而上游统计不会包含。

### 5. 管理与门户界面以“空值保持无限制”的受控数字输入呈现

管理台在密钥详情“策略”分组增加独立“速率限制”分区，包含 RPM 和 TPM 两个数字输入、说明和独立保存。数字表单沿用现有数值输入约定：状态保留字符串编辑态，渲染使用空字符串而非把 `null` 回填为 0，验证时再转换为 `number | null`，避免历史空值被意外保存为 0。

```text
密钥详情 / 策略
┌────────────────────────────────────────────────┐
│ 花费规则                                         │
├────────────────────────────────────────────────┤
│ 速率限制                                         │
│  每分钟请求数 (RPM)   [          ]  留空=不限   │
│  每分钟 Token 数(TPM) [          ]  留空=不限   │
│  以滑动窗口计数；TPM 在已计量后作用于下一请求    │
│                                        [保存]   │
└────────────────────────────────────────────────┘
```

成员门户在现有 Key 对话框中增加相同两项，并在编辑态显示“只能收紧”提示。服务端独立比较每一维：已有限制不能改为 `null`，也不能提高；从无限制改为正整数或降低已有值允许。客户端的最大值提示仅改善体验，服务端检查才是权限边界。

### 6. 使用双方言自动迁移并保留可回滚数据

先更新两个 Drizzle schema，再分别生成 PostgreSQL/SQLite 迁移并运行一致性检查。新列可空且无默认值，部署时现有 Key 自动表现为不限速。回滚应用代码时数据库新列不会破坏旧代码；若需要彻底回滚数据库，由运维在确认数据可丢弃后执行对应 migration 回退/人工列清理，本次不自动删除已保存配置。

## Risks / Trade-offs

- [多实例请求分散导致每实例都看不到完整窗口] → 文档明确限制为单实例/单进程口径；保留独立服务边界，以后可替换为共享存储实现。
- [TPM 无法在当前请求前知道输出量] → 明确“超了拦下一次”，仅使用已计量 `totalTokens`，不假装提供硬上限。
- [流式响应结束前并发请求尚未看到其 token] → 等 usage settle 后再记账，保证不因猜测误拒绝；该短暂空窗属于事后口径。
- [大量 Key 或 token 事件增加内存] → 仅对配置了限制的 Key 跟踪、有界键数、滑动窗口剪枝与 unref 清理计时器。
- [管理员把限制设得过低影响业务] → 管理台允许管理员独立调整/清除，成员端仅收紧，且 429 返回明确 Retry-After 便于客户端退避。
