## Why

现有 API Key 只有花费配额和到期时间，无法限制短时间内的突发流量。一把有效密钥可以瞬间发起任意多请求并消耗上游并发、触发上游限流或耗尽订阅额度；因此需要在密钥边界补充与累计花费互补的速率防护。

## What Changes

- 为每个 API Key 增加可选的每分钟请求数（RPM）和每分钟 token 数（TPM）限制；未配置时保持不限速。
- 在单进程内以滑动窗口追踪每把密钥的请求与已计量 token：RPM 在代理准入时阻止超限请求，TPM 在请求完成并获得 token 后记账，超过后阻止下一次请求。
- 对限流拒绝统一返回不泄露上游信息的 HTTP 429 错误，并附带标准 `Retry-After` 响应头；同时写入不关联上游的请求日志。
- 扩展管理员和成员自助密钥 API、响应类型和界面，以配置并展示 RPM/TPM；成员更新只能收紧既有限制，不能移除或提高限制。
- 补充密钥使用文档，明确 TPM 属于“已计量 token 的事后拦截”口径，以及针对双实例以上部署的内存范围。

## Capabilities

### New Capabilities

- `api-key-rate-limiting`: 为 API Key 提供单进程滑动窗口 RPM/TPM 准入、429 响应与限流日志的端到端行为。

### Modified Capabilities

- `api-key-management-workbench`: 管理台密钥详情页增加独立的 RPM/TPM 配置分区。
- `user-portal`: 成员自助密钥创建和编辑支持 RPM/TPM，并在服务端强制只能收紧限制。

## Impact

- 数据模型与 PostgreSQL/SQLite 迁移：`api_keys` 新增两个可空速率限制字段。
- 密钥服务、Admin/User Key API、API 转换器和 TypeScript 接口新增 `rpm_limit` / `tpm_limit`。
- 代理入口新增速率检查与 token 记账；统一错误模块支持限流错误及 `Retry-After` 头。
- 管理台详情分区、成员门户表单、中英文文案、请求日志与用户文档需要同步更新。
- 新增限流器、服务/API/代理/UI 的聚焦测试，并执行数据库迁移一致性校验。
