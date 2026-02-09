## Why

当前日志系统只记录最终使用的 upstream ID，管理员无法了解请求的路由决策过程：不知道上游名称、路由方式、负载均衡策略，也无法看到 failover 时尝试了哪些上游以及失败原因。这使得排查路由问题和优化负载均衡配置变得困难。

## What Changes

- 数据库 `request_logs` 表新增路由决策字段：路由类型、组名、负载均衡策略、failover 尝试次数、failover 历史 JSON
- 代理层在路由决策和 failover 过程中收集完整信息，传递给日志记录器
- Admin API 返回日志时 JOIN upstream 表获取上游名称，并返回路由决策详情
- UI 日志表新增上游名称列，支持展开查看 failover 详情
- 新增相关 i18n 翻译

## Capabilities

### New Capabilities

- `upstream-routing-logging`: 在请求日志中记录完整的路由决策信息（路由类型、组名、策略）和 failover 历史（尝试的上游、失败原因、最终结果）
- `upstream-routing-display`: 在日志 UI 中显示上游名称、路由方式标签，以及可展开的 failover 详情面板

### Modified Capabilities

(无已有 spec 需要修改)

## Impact

- `src/lib/db/schema.ts`: 新增 `routing_type`, `group_name`, `lb_strategy`, `failover_attempts`, `failover_history` 字段
- `src/lib/services/request-logger.ts`: 扩展 `LogRequestInput` 接口，接收路由决策信息
- `src/app/api/proxy/v1/[...path]/route.ts`: 收集路由决策和 failover 信息，传递给 logger
- `src/app/api/admin/logs/route.ts`: 返回上游名称和路由详情
- `src/types/api.ts`: 更新 `RequestLog` 类型
- `src/components/admin/logs-table.tsx`: 新增上游名称列和 failover 展开详情
- `src/messages/en.json`, `src/messages/zh-CN.json`: 新增翻译条目
- 需要新增数据库 migration
