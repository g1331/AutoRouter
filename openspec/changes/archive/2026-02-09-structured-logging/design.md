## Context

AutoRouter 是一个 AI API 网关，通过 Next.js API Routes 处理代理请求。当前代码中约 50 处 `console.*` 调用散落在服务层（`proxy-client.ts`、`key-manager.ts`、`health-checker.ts` 等）和 API 路由中。这些调用缺乏统一的分级、结构化输出和上下文传播能力。

现有的 `config.ts` 已定义 `LOG_LEVEL` 环境变量读取，但未被任何日志系统消费。`proxy-client.ts` 中通过手动字符串拼接 `[req_xxx]` 传递 requestId，无法被机器解析。

## Goals / Non-Goals

**Goals:**

- 引入 pino 作为统一的结构化日志库
- 所有 `console.*` 日志调用替换为结构化 logger
- 支持 child logger 传播 requestId 等请求上下文
- 生产环境 JSON 输出，开发环境 pino-pretty 美化
- 通过 `LOG_LEVEL` 环境变量控制日志级别

**Non-Goals:**

- 不改动 `request_logs` 数据库表（业务日志与运行时日志是两个维度）
- 不引入日志聚合基础设施（JSON 输出到 stdout，用户自行对接）
- 不记录请求体/响应体内容（安全敏感）
- 不添加日志轮转（Docker 环境由容器运行时管理）

## Decisions

### D1: 选择 pino 而非 winston/consola

**决策**: 使用 pino 作为日志库。

**理由**:
- pino 是 Node.js 生态中性能最优的结构化日志库，JSON 序列化速度远超 winston
- 对代理服务而言，日志开销必须极低，pino 的设计哲学（transport 分离、零开销序列化）完全匹配
- child logger 模式天然支持请求上下文传播
- 社区活跃，Next.js 生态中广泛使用

**备选方案**:
- winston: 功能更丰富但性能开销大，transport 系统过重
- consola: DX 好但结构化输出能力弱，更适合 CLI 工具
- 自定义封装: 造轮子，维护成本高

### D2: pino-pretty 作为 devDependency

**决策**: `pino-pretty` 仅作为 devDependency 安装，通过 pino 的 transport 机制在非生产环境动态加载。

**理由**: 生产镜像不需要美化输出，减小 Docker 镜像体积。pino 的 transport 机制支持条件加载，不会在生产环境引入额外开销。

### D3: logger 模块位置和导出方式

**决策**: 在 `src/lib/utils/logger.ts` 中创建并导出：
1. `logger` - 根 logger 实例，用于非请求上下文的通用日志
2. `createLogger(context)` - 工厂函数，创建带命名上下文的 child logger（如 `createLogger("proxy-client")`）

**理由**: 与现有 `src/lib/utils/` 下的工具模块（`config.ts`、`auth.ts`、`encryption.ts`）保持一致的组织方式。工厂函数让每个模块可以创建带模块名的 child logger，便于按模块过滤日志。

### D4: 复用现有 config.ts 中的 LOG_LEVEL

**决策**: 从 `config.ts` 导入已有的 `LOG_LEVEL` 配置，不重复定义环境变量读取逻辑。

**理由**: `config.ts` 已经定义了 `logLevel` 字段并从 `LOG_LEVEL` 环境变量读取，复用它避免重复代码。

### D5: 替换策略 - 逐模块机械替换

**决策**: 按模块逐个替换 `console.*` 调用，不改变现有日志的语义和触发时机，仅改变输出方式。

**理由**: 最小化风险。每个 `console.error` → `logger.error`，`console.warn` → `logger.warn`，`console.log` → `logger.info` 或 `logger.debug`（根据内容判断）。不重构日志点的位置或条件逻辑。

## Risks / Trade-offs

- **[Risk] pino-pretty 在 Next.js 开发模式下的兼容性** → pino transport 使用 worker_threads，Next.js 的 HMR 可能导致 transport 重复初始化。缓解：开发环境使用同步 transport（`pino-pretty` 的 `sync: true` 选项）。
- **[Risk] 替换遗漏** → 可能有 `console.*` 调用被遗漏。缓解：替换完成后用 grep 验证零残留。
- **[Trade-off] 日志输出量增加** → 结构化 JSON 比纯文本体积更大。可接受：JSON 的可解析性远超体积增加的代价，且可通过 LOG_LEVEL 控制输出量。
