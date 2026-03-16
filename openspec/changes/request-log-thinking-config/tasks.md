## 1. 请求侧 thinking 配置提取

- [x] 1.1 全面梳理 `src/app/api/proxy/v1/[...path]/route.ts` 现有请求体解析与日志写入链路，明确开始日志、完成日志、流式与非流式路径的接入点
- [x] 1.2 设计并实现请求侧 thinking 配置归一化提取器，覆盖 OpenAI Responses、OpenAI Chat、Anthropic、Gemini 的显式字段提取
- [x] 1.3 为非 JSON 请求、未显式指定字段和历史兼容场景定义空值语义，并落实到提取器输出

## 2. 日志存储与 API 扩展

- [x] 2.1 扩展 `request_logs` 表结构，增加 thinking 配置持久化字段，并生成数据库迁移
- [x] 2.2 扩展 `src/lib/services/request-logger.ts`、`src/types/api.ts`、`src/lib/utils/api-transformers.ts`，让请求日志服务、API 类型和转换结果返回 thinking 配置对象
- [x] 2.3 将 thinking 配置接入请求开始与请求完成日志路径，确保流式和非流式分支写入一致

## 3. 请求日志展示设计落地

- [x] 3.1 在 `src/components/admin/logs-table.tsx` 的模型单元格中增加紧凑的 thinking badge，不新增独立列且不破坏现有主信息布局
- [x] 3.2 在日志详情中新增独立的 thinking 配置展示区域，明确与 token usage、billing 和路由决策分区
- [x] 3.3 为 OpenAI、Anthropic、Gemini 三类 provider 定义稳定的显示文案和空状态文案

## 4. 测试与回归验证

- [x] 4.1 补充请求配置提取测试，覆盖不同 provider 的显式字段、缺失字段和非 JSON 场景
- [x] 4.2 补充日志 API 与转换测试，覆盖新增字段的返回和历史日志兼容行为
- [x] 4.3 补充日志界面测试，验证列表摘要、详情展示以及“未显式指定”空状态
