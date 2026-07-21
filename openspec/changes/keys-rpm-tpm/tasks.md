## 1. 数据契约与持久化

- [x] 1.1 在 PostgreSQL 与 SQLite 的 API Key schema 中增加可空 RPM/TPM 字段，生成双方言迁移并验证迁移产物一致。
- [x] 1.2 增加共享速率限制值校验，并贯通 key-manager、Admin API、API 转换器与 TypeScript API 类型的创建、更新、查询响应。
- [x] 1.3 扩展成员密钥服务与 User API，强制 RPM/TPM 独立维度只能收紧，并补齐服务和路由测试。
- [x] 1.4 运行本阶段数据库、类型与聚焦 API 测试，通过后提交数据契约实现。

## 2. 限流核心与代理链路

- [x] 2.1 实现有界、可清理、可测试的单进程 API Key 滑动窗口限流器，并覆盖 RPM、TPM、窗口恢复与 Retry-After 计算单元测试。
- [x] 2.2 扩展统一错误以支持 API_KEY_RATE_LIMITED/rate_limited 和自定义响应头；在代理鉴权后、选路前执行准入检查并为拒绝写入无上游关联的请求日志。
- [x] 2.3 在非流式和流式 usage settle 路径记录已计量 totalTokens，并补齐代理路由测试：429、Retry-After、无上游转发、日志、TPM 事后拦截。
- [x] 2.4 运行本阶段服务、代理与类型测试，通过后提交限流核心实现。

## 3. 配置界面与文档

- [x] 3.1 为管理台密钥详情增加独立 RPM/TPM 分区，复用空值安全的数字输入约定，补齐默认值、schema、partial payload 与组件测试。
- [x] 3.2 在成员门户 Key 创建/编辑对话框加入 RPM/TPM 输入和只能收紧提示，补齐中英文文案及门户组件测试。
- [x] 3.3 更新客户端 Key 文档，说明配置字段、单进程范围、滑动窗口和 TPM 的已计量事后拦截语义。
- [x] 3.4 运行本阶段前端、文档构建与格式检查，通过后提交界面和文档实现。

## 4. 整体验证与交接

- [x] 4.1 执行相关 Vitest 测试、数据库一致性检查、lint、format check、TypeScript 检查与受影响构建验证，修复发现的问题。
- [x] 4.2 复核 OpenSpec 规格与实现的一致性，更新任务状态、提交最终验证修正并准备 Issue #237 的交接。

## 5. 审查修复

- [x] 5.1 修复下游流式断连时已结算 usage 未进入 TPM 窗口的问题，并补充回归测试。
- [x] 5.2 运行相关测试和静态检查，复核 OpenSpec 后提交审查修复。

## 6. CI 修复

- [x] 6.1 让 SQLite 迁移脚本测试从 journal 动态推导迁移数量和标签，覆盖本次新增迁移。
- [x] 6.2 运行相关测试与质量检查，复核 OpenSpec 后提交并推送 CI 修复。

## 7. 本地预览环境迁移修复

- [x] 7.1 补齐 SQLite `upstreams` 的 `official_website_url`、`max_concurrency`、`spending_rules` 前向迁移，并在全新库迁移测试中覆盖。
- [x] 7.2 验证迁移并使用隔离 SQLite 库启动 Issue #237 预览环境。
