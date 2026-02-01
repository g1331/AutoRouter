## Why

日志页面的"上游"列当前只显示上游名称和一个含义不明确的路由类型徽章（如 `[自 动]`），用户无法理解：

- 为什么选择了这个上游
- 有哪些候选上游参与了选择
- 哪些上游因为熔断/模型不支持等原因被排除
- 故障转移的完整过程

系统在路由时已经有丰富的决策信息（`ModelRouterResult`），但没有完整记录到日志中，导致用户无法追溯路由决策过程。

## What Changes

### 后端改动

- 扩展数据库 schema，新增 `routing_decision` 字段存储完整路由决策信息（JSON 格式）
- 修改日志记录逻辑，在代理请求时保存完整的路由决策数据
- 更新 API 响应，返回新增的路由决策字段

### 前端改动

- 优化"上游"列的紧凑显示，增加关键指示器（候选数、故障转移等）
- 新增路由决策详情组件，支持点击展开或 Tooltip 查看完整决策流程
- 显示内容包括：
  - 模型解析过程（原始模型 → 解析模型，是否重定向）
  - 候选上游列表（名称、权重、熔断状态）
  - 被排除上游列表（名称、排除原因）
  - 最终选择（上游名称、选择策略）
  - 故障转移历史（如有）

## Capabilities

### New Capabilities

- `routing-decision-logging`: 完整的路由决策信息记录能力，包括数据库存储、API 返回、数据结构定义
- `routing-decision-display`: 路由决策信息的前端展示能力，包括紧凑显示和详情展开

### Modified Capabilities

无

## Impact

### 数据库

- `request_logs` 表新增 `routing_decision` 字段（TEXT 类型，存储 JSON）
- 需要数据库迁移

### API

- `GET /api/admin/logs` 响应新增 `routing_decision` 字段
- 类型定义更新：`RequestLogResponse` 接口

### 代码文件

- `src/lib/db/schema.ts` - 数据库 schema
- `src/lib/services/request-logger.ts` - 日志记录服务
- `src/app/api/proxy/v1/[...path]/route.ts` - 代理路由，传递路由决策信息
- `src/types/api.ts` - API 类型定义
- `src/components/admin/logs-table.tsx` - 日志表格组件
- 新增 `src/components/admin/routing-decision-display.tsx` - 路由决策展示组件

### 国际化

- `src/messages/en.json` 和 `src/messages/zh.json` 新增路由决策相关翻译
