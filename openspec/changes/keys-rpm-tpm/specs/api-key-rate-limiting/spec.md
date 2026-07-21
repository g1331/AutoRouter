## ADDED Requirements

### Requirement: API Key 可配置独立 RPM 与 TPM 限制
系统 SHALL 为每个 API Key 持久化可选的 rpm_limit 与 tpm_limit。两个字段均为正整数或 null，且相互独立；null 表示对应维度不限速。管理员创建和更新 API Key 时 MUST 可以提交这两个字段，Admin API 的创建、详情和列表响应 MUST 返回这两个字段。

#### Scenario: 管理员配置两个速率维度
- **WHEN** 管理员创建或更新 API Key，并提交 rpm_limit = 60 与 tpm_limit = 120000
- **THEN** 系统 MUST 持久化两个限制
- **AND** 后续代理请求 MUST 同时受 RPM 与 TPM 约束

#### Scenario: 仅配置一个速率维度
- **WHEN** 管理员只提交 rpm_limit 或只提交 tpm_limit
- **THEN** 系统 MUST 只启用已配置的维度
- **AND** 未配置的维度 MUST 不限制请求

#### Scenario: 清除管理员配置的限制
- **WHEN** 管理员将已有 rpm_limit 或 tpm_limit 显式更新为 null
- **THEN** 系统 MUST 移除对应维度的限制
- **AND** 另一个维度的配置 MUST 保持不变

#### Scenario: 提交非法速率值
- **WHEN** 调用方提交 0、负数、小数、非数值或超出安全整数范围的 rpm_limit 或 tpm_limit
- **THEN** 系统 MUST 返回参数校验错误
- **AND** 已存储的速率限制 MUST 不被修改

### Requirement: 每密钥 RPM 使用滑动窗口准入
系统 SHALL 对每个配置 rpm_limit 的有效 API Key 使用单进程、60 秒滑动窗口追踪已准入代理请求。检查 MUST 发生在 Key 鉴权和请求上下文解析之后、任何上游候选选择或调用之前；允许的请求 MUST 原子地计入该窗口，拒绝的请求 MUST 不计入。

#### Scenario: 窗口内请求数低于 RPM
- **WHEN** 某 API Key 配置 rpm_limit = 3，当前 60 秒窗口内已有 2 个已准入请求
- **THEN** 系统 MUST 允许下一请求继续
- **AND** 该请求 MUST 成为窗口内第 3 个请求

#### Scenario: 窗口内请求数达到 RPM
- **WHEN** 某 API Key 配置 rpm_limit = 3，当前 60 秒窗口内已有 3 个已准入请求
- **THEN** 系统 MUST 拒绝下一请求
- **AND** 系统 MUST 不选择、排队或调用任何上游

#### Scenario: 最早请求滑出窗口后恢复
- **WHEN** 某 API Key 先前因 RPM 被拒绝
- **AND** 足够早的已准入请求已滑出 60 秒窗口，使窗口内请求数低于 rpm_limit
- **THEN** 系统 MUST 允许下一请求

### Requirement: 每密钥 TPM 使用已计量 token 的滑动窗口
系统 SHALL 对每个配置 tpm_limit 的 API Key 在非流式响应完成或流式 usage settle 后记录已获得的正 totalTokens，并使用这些 token 事件的 60 秒滑动窗口进行下一次准入判断。系统 MUST NOT 估算尚未获得的 token，也 MUST NOT 中断导致累计 token 达到或超过 tpm_limit 的当前请求。

#### Scenario: 已计量 token 低于 TPM
- **WHEN** 某 API Key 配置 tpm_limit = 1000，当前 60 秒内已计量 token 总数为 900
- **THEN** 系统 MUST 允许下一请求继续

#### Scenario: 当前响应使 token 超过 TPM
- **WHEN** 某 API Key 配置 tpm_limit = 1000，当前窗口已计量 900 token
- **AND** 一个已准入请求完成后报告 200 token
- **THEN** 该已完成请求 MUST 保持原有响应结果
- **AND** 系统 MUST 记录该 200 token
- **AND** 下一次代理请求 MUST 因 TPM 被拒绝

#### Scenario: 未报告 usage 的响应
- **WHEN** 某次代理响应没有可用的 totalTokens
- **THEN** 系统 MUST NOT 为 TPM 估算或写入 token
- **AND** 该请求的 RPM 计数行为 MUST 不受影响

#### Scenario: token 事件滑出窗口后恢复
- **WHEN** 某 API Key 因 TPM 被拒绝
- **AND** 足够早的 token 事件滑出 60 秒窗口，使窗口内 token 总数低于 tpm_limit
- **THEN** 系统 MUST 允许下一请求

### Requirement: 限流拒绝使用统一 429 响应
系统 SHALL 对 RPM 或 TPM 限流拒绝返回 HTTP 429、统一错误 code API_KEY_RATE_LIMITED、统一错误 type rate_limited 和标准 Retry-After 响应头。Retry-After MUST 是大于 0 的整秒数，表示两个已启用维度都不再阻止请求所需的最早重试时间；响应体 MUST NOT 暴露上游身份、候选列表、上游 URL 或内部限流状态。

#### Scenario: RPM 限流响应
- **WHEN** 请求因 RPM 被拒绝
- **THEN** 系统 MUST 返回 HTTP 429
- **AND** 响应 MUST 包含 Retry-After 和统一的 rate_limited 错误体
- **AND** 响应 MUST 标记 did_send_upstream = false

#### Scenario: RPM 与 TPM 同时阻止
- **WHEN** 同一请求同时命中 RPM 与 TPM 限制
- **THEN** 系统 MUST 返回一个 HTTP 429 响应
- **AND** Retry-After MUST 至少覆盖两个维度中较晚恢复的时间

### Requirement: 限流拒绝必须写入无上游关联的请求日志
系统 SHALL 为每次 API Key 限流拒绝写入请求日志。该日志 MUST 关联 API Key 和所有者快照、状态码为 429、token 为 0、upstream_id 为 null，并以 rate_limited 标记错误；日志的路由诊断 MUST 表示请求未发送到上游。此类日志 MUST 计入密钥和所有者请求统计，MUST NOT 计入任何上游统计。

#### Scenario: RPM 拒绝请求被记录
- **WHEN** 请求在候选选择前因 RPM 被拒绝
- **THEN** 系统 MUST 写入一条关联该 Key 的请求日志
- **AND** 日志 MUST 不关联任何上游
- **AND** 日志错误标记 MUST 为 rate_limited

#### Scenario: TPM 拒绝请求被记录
- **WHEN** 请求在候选选择前因 TPM 被拒绝
- **THEN** 系统 MUST 写入一条关联该 Key 的请求日志
- **AND** 日志 MUST 不关联任何上游

### Requirement: 限流器状态遵循单进程边界且有界
系统 SHALL 将 RPM/TPM 窗口状态保持在当前 Node.js 进程内存中，并使用过期剪枝、有界 Key 数量和不阻止进程退出的清理计时器约束内存。进程重启后状态可以清空；不同实例之间 MUST NOT 被承诺为全局聚合限制。

#### Scenario: 无限制 Key 不保留限流状态
- **WHEN** 某 API Key 的 rpm_limit 和 tpm_limit 都为 null
- **THEN** 系统 MUST 不因该 Key 的代理请求持续保留速率窗口状态

#### Scenario: 进程重启后的行为
- **WHEN** 服务进程重启
- **THEN** 之前进程内的 RPM/TPM 计数可以清空
- **AND** 已持久化的每把 Key 配置 MUST 在重启后继续生效
