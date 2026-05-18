## Why

请求录制目前由 `RECORDER_*` 环境变量控制，运行中无法从管理端启停、查看占用或清理记录。Issue #160 要求把录制从部署模式提升为可实时管理的功能，并让管理员能够查看录制详情、按条件检索和删除记录。

## What Changes

- 新增请求录制运行时配置，管理员可在系统设置中启停录制、选择录制模式、配置脱敏策略和保留天数。
- 保留现有 fixture 文件录制格式，用数据库索引记录文件位置、大小、请求元信息和查询字段。
- 新增录制记录管理 API 与页面，支持分页、时间范围、状态码、模型等条件查询，支持查看详情和删除单条记录。
- 新增录制清理后台任务，按保留天数删除过期索引与文件，并支持手动执行。
- 移除 `RECORDER_ENABLED`、`RECORDER_MODE`、`RECORDER_REDACT_SENSITIVE` 对运行时录制决策的直接控制；`RECORDER_FIXTURES_DIR` 仅作为存储根目录兼容配置保留。

## Capabilities

### New Capabilities
- `traffic-recording-runtime-control`: 管理端实时控制请求录制、查询录制索引、读取录制详情与删除录制记录。

### Modified Capabilities
- `background-sync-tasks`: 新增请求录制清理任务，纳入现有后台任务状态、手动执行与调度能力。

## Impact

- 数据库：新增录制配置表与录制索引表，覆盖 PostgreSQL 与 SQLite schema/migration。
- 后端：调整 `traffic-recorder`、代理路由录制判断、管理端录制 API、后台任务注册与清理服务。
- 前端：系统设置页新增请求录制入口，新建请求录制管理页面与相关 hooks/i18n。
- 测试：覆盖服务、API、代理录制分支、后台清理任务和管理端页面。
