# Change: Add Request Logs UI

## Why

后端已实现请求日志记录功能（`RequestLog` 模型），用于审计和分析代理请求。但目前：

1. 后端没有暴露日志查询 API
2. 前端没有日志展示界面

管理员无法查看代理请求的审计记录和 Token 使用统计。

## What Changes

### Backend

- 新增 `GET /admin/logs` 分页查询端点
- 支持按 API Key、Upstream、状态码、时间范围筛选
- 复用已有的 `RequestLogResponse` 和 `PaginatedRequestLogsResponse` schema

### Frontend

- 新增 `/logs` 页面展示请求日志
- 新增 `LogsTable` 组件（复古终端风格）
- 新增 `useRequestLogs` hook
- 更新侧边栏添加日志导航入口
- 添加中英文 i18n 翻译

## Impact

- Affected specs: 新增 `request-logs` capability
- Affected code:
  - `apps/api/app/api/routes/admin.py`: 新增日志查询路由
  - `apps/api/app/services/request_logger.py`: 新增查询方法
  - `apps/web/src/app/[locale]/(dashboard)/logs/page.tsx`: 新页面
  - `apps/web/src/components/admin/logs-table.tsx`: 新组件
  - `apps/web/src/hooks/use-request-logs.ts`: 新 hook
  - `apps/web/src/components/admin/sidebar.tsx`: 添加导航
  - `apps/web/messages/*.json`: i18n 翻译
