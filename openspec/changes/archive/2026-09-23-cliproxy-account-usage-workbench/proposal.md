## Why

CLIProxyAPI 已在 `auth-files` 返回账号级请求计数、近期请求分桶和可用的配额观测，但 AutoRouter 只同步账号目录与模型数量，管理员无法在账号列表判断实际使用情况。现有页面将实例、账号、关联上游和日志连续堆叠，窄屏时关键列被裁切，影响日常排查。

## What Changes

- 新增只读的管理员账号用量接口，直接读取 CLIProxyAPI `auth-files`，仅投影已知的非敏感统计字段，不消费请求队列或保存用量快照。
- 在账号工作区显示成功／失败次数、近期请求及配额观测和观测时间；明确表示请求计数为 CLIProxyAPI 进程内累计值，配额观测不等于供应商剩余额度，并区分缺失与零值。
- 将实例选择与账号管理设为主工作区，关联上游、实例日志作为切换的次级视图；优化桌面和移动端的信息层级、刷新及加载／错误／空状态。
- 补齐双语文案、接口契约与权限测试、组件行为测试和实际页面截图验收。

## Capabilities

### New Capabilities

- `cliproxy-account-usage`：管理员只读查询和查看 CLIProxyAPI 账号级用量与被动配额观测。

### Modified Capabilities

- `cliproxy-admin-ui`：重组管理页面的实例选择、账号主视图和次级视图，并适配窄屏及状态展示。

## Impact

影响 CLIProxyAPI 管理客户端、账号用量服务与 Admin API、React Query hook、CLIProxy 管理页面及相关组件和国际化文案。不变更数据库结构、CLIProxyAPI 配置或上游真实账号数据。
