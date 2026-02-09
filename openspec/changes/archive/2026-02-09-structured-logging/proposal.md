## Why

当前项目中约 50 处 `console.log/warn/error` 调用散落在服务层和 API 路由中，缺乏统一的日志分级、结构化输出和请求上下文传播。在 Docker 生产部署后，stdout 中全是无法机器解析的纯文本，无法对接日志聚合系统（ELK/Loki/Datadog），排查问题只能靠肉眼搜索。

## What Changes

- 引入 `pino` 作为结构化日志库，生产环境输出 JSON，开发环境通过 `pino-pretty` 美化输出
- 新建 `src/lib/utils/logger.ts` 统一日志工厂，支持 child logger 传播 requestId 等上下文
- 通过 `LOG_LEVEL` 环境变量控制日志级别（生产默认 `info`，开发默认 `debug`）
- 替换所有 `console.log/warn/error` 为结构化 logger 调用，按场景分级：
  - `error`: API 路由 catch 块、服务层异常
  - `warn`: 客户端断连、校验失败等可恢复异常
  - `info`: 业务关键事件（Key 创建/删除、请求完成）
  - `debug`: 代理请求追踪（[IN]/[OUT]/[BODY] 等调试信息）
- 不涉及 `request_logs` 数据库表的改动（运行时日志与业务日志是两个维度）

## Capabilities

### New Capabilities

- `structured-logging`: 统一的结构化日志基础设施，包括日志工厂、分级策略、上下文传播和环境感知输出格式

### Modified Capabilities

（无现有 spec 需要修改）

## Impact

- **新增依赖**: `pino`, `pino-pretty`（devDependencies）
- **受影响代码**: `src/lib/services/` 下所有服务文件、`src/app/api/` 下所有路由文件（约 20 个文件的 `console.*` 替换）
- **环境变量**: 新增可选 `LOG_LEVEL`（默认值根据 `NODE_ENV` 自动选择）
- **无 Breaking Change**: 纯内部改动，不影响 API 接口和前端行为
