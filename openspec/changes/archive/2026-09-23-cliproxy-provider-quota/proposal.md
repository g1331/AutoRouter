# Proposal

## Why

当前 CLIProxyAPI 工作台把进程内请求计数和被动配额信号放在“账号与用量”中，但没有展示管理员寻找的供应商剩余额度。配额信号埋在账号详情下方，且即使存在也不能等同于 Codex、Claude 账号的真实限额窗口。

## What Changes

- 为 Codex 和 Claude OAuth 账号提供单账号、按需触发的只读供应商额度查询，显示剩余百分比和重置时间；其他账号明确标为暂不支持。
- 经已有 CLIProxyAPI 管理连接调用其 `api-call`，由服务端选择固定供应商地址并仅返回额度展示字段；不把 `auth_index`、Token 或原始供应商响应传给浏览器。
- 在账号列表与详情中增加可见的“供应商额度”入口与加载、失败、无数据状态，明确区分现有请求统计和被动配额观测。

## Capabilities

### New Capabilities

- `cliproxy-provider-quota`: 账号级供应商额度查询、响应投影与界面呈现。

### Modified Capabilities

无。现有 `cliproxy-account-usage` 的进程内统计和被动观测语义保持不变。

## Impact

涉及 CLIProxyAPI 管理客户端、只读 Admin API、账号工作台组件及中英文文案；需要服务/API/UI 测试。无需数据库迁移或新依赖。额度查询会在管理员打开指定账号时向供应商发起一次只读请求，不后台批量探测。
