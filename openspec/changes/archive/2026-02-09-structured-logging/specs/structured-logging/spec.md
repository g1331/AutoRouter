## ADDED Requirements

### Requirement: 统一日志工厂

系统 SHALL 提供一个集中的日志工厂模块（`src/lib/utils/logger.ts`），导出一个预配置的 pino logger 实例和创建 child logger 的工厂函数。所有服务层和 API 路由 SHALL 通过该工厂获取 logger，禁止直接使用 `console.*` 进行日志输出。

#### Scenario: 导入并使用 logger

- **WHEN** 服务或路由需要输出日志
- **THEN** 通过 `import { logger } from "@/lib/utils/logger"` 获取 logger 实例，调用 `logger.info/warn/error/debug` 等方法

#### Scenario: 创建带上下文的 child logger

- **WHEN** 代理请求处理流程需要在多个函数间传播 requestId
- **THEN** 通过 `logger.child({ requestId })` 创建 child logger，后续该请求链路中的所有日志自动携带 requestId 字段

### Requirement: 环境感知的输出格式

系统 SHALL 根据运行环境自动选择日志输出格式：生产环境输出 JSON（便于日志聚合系统解析），开发环境通过 `pino-pretty` 输出人类可读的彩色格式。

#### Scenario: 生产环境 JSON 输出

- **WHEN** `NODE_ENV` 为 `production`
- **THEN** 日志输出为单行 JSON 格式，包含 `level`、`time`、`msg` 及所有附加字段

#### Scenario: 开发环境美化输出

- **WHEN** `NODE_ENV` 不为 `production`
- **THEN** 日志通过 `pino-pretty` 输出为带颜色、缩进的人类可读格式

### Requirement: 日志级别可配置

系统 SHALL 支持通过 `LOG_LEVEL` 环境变量控制日志输出级别。未设置时 SHALL 根据 `NODE_ENV` 自动选择默认值。

#### Scenario: 通过环境变量设置级别

- **WHEN** `LOG_LEVEL` 环境变量设置为 `warn`
- **THEN** 仅输出 `warn`、`error`、`fatal` 级别的日志

#### Scenario: 未设置环境变量时的默认行为

- **WHEN** `LOG_LEVEL` 未设置且 `NODE_ENV` 为 `production`
- **THEN** 默认日志级别为 `info`

#### Scenario: 开发环境默认级别

- **WHEN** `LOG_LEVEL` 未设置且 `NODE_ENV` 不为 `production`
- **THEN** 默认日志级别为 `debug`

### Requirement: 日志分级策略

系统 SHALL 按以下策略对不同场景的日志进行分级：

- `error`: 操作失败需要关注（API 路由 catch 块、服务层异常）
- `warn`: 异常但可恢复（客户端断连、校验失败、熔断器状态变更）
- `info`: 业务关键事件（API Key 创建/删除/吊销、健康检查结果、请求完成摘要）
- `debug`: 开发调试信息（代理请求追踪 [IN]/[OUT]/[BODY]、路由决策详情）

#### Scenario: API 路由错误使用 error 级别

- **WHEN** API 路由的 catch 块捕获到异常
- **THEN** 使用 `logger.error({ err, ... }, "描述信息")` 记录，包含错误对象和请求上下文

#### Scenario: 代理请求追踪使用 debug 级别

- **WHEN** proxy-client 发起上游请求或收到响应
- **THEN** 使用 `logger.debug({ requestId, method, url, ... }, "upstream request")` 记录，生产环境默认不输出

#### Scenario: 业务审计事件使用 info 级别

- **WHEN** API Key 被创建、删除或吊销
- **THEN** 使用 `logger.info({ keyId, action, ... }, "描述信息")` 记录

### Requirement: 全量替换 console 调用

系统中所有 `console.log`、`console.warn`、`console.error` 调用 SHALL 被替换为对应级别的结构化 logger 调用。替换后不得残留任何 `console.*` 日志调用（`console.table` 等非日志用途除外）。

#### Scenario: 替换后无残留

- **WHEN** 变更完成后对 `src/` 目录执行 `console.(log|warn|error|info|debug)` 搜索
- **THEN** 搜索结果为零匹配
