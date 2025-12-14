# Tasks: Add Request Logs UI

## 1. Backend - Request Logs Query API

- [x] 1.1 在 `request_logger.py` 添加 `list_request_logs` 查询方法
  - 支持分页（page, page_size）
  - 支持筛选（api_key_id, upstream_id, status_code, start_time, end_time）
  - 返回 `PaginatedRequestLogsResponse`

- [x] 1.2 在 `admin.py` 添加 `GET /admin/logs` 端点
  - 需要 Admin Token 认证
  - Query 参数支持筛选条件
  - 调用 `request_logger.list_request_logs`

- [x] 1.3 添加后端单元测试 `tests/test_request_logs.py`
  - 测试分页功能
  - 测试筛选功能
  - 测试权限验证

- [x] 1.4 验证后端
  - 运行 `uv run pytest tests/test_request_logs.py` (10 passed)
  - 运行 `uv run pyright` (新增代码无错误)
  - 运行 `uv run ruff check` (通过)

## 2. Frontend - Request Logs Hook & Component

- [ ] 2.1 添加 TypeScript 类型定义 `types/api.ts`
  - `RequestLog` 接口
  - `PaginatedRequestLogs` 接口

- [ ] 2.2 创建 `use-request-logs.ts` hook
  - 使用 React Query 获取日志列表
  - 支持分页和筛选参数

- [ ] 2.3 创建 `logs-table.tsx` 组件
  - Cassette Futurism 风格表格
  - 显示字段：时间、API Key（前缀）、Upstream、模型、Token 用量、状态码、耗时
  - 状态码颜色区分（成功/失败）

- [ ] 2.4 验证前端组件
  - 运行 `pnpm --filter web lint`
  - 运行 `pnpm --filter web type-check`

## 3. Frontend - Page & Navigation

- [ ] 3.1 创建 `/logs` 页面
  - 复用 Keys/Upstreams 页面结构
  - 包含分页控件

- [ ] 3.2 更新侧边栏导航
  - 添加 "Logs" 导航项
  - 使用 `ScrollText` 图标

- [ ] 3.3 添加 i18n 翻译
  - `messages/en.json`: 添加 logs 相关文案
  - `messages/zh.json`: 添加日志相关文案

- [ ] 3.4 验证前端集成
  - 运行 `pnpm --filter web lint`
  - 运行 `pnpm --filter web build`

## 4. End-to-End Validation

- [ ] 4.1 启动后端和前端，手动验证完整流程
  - 访问日志页面
  - 确认数据正确展示
  - 测试分页功能
