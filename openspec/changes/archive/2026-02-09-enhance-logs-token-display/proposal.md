# Change: Enhance Logs Token Display

## Why

当前日志系统存在以下问题：

1. **Token 显示不直观**：用户反馈看不懂 Token 列的 `27,296 / 27` 格式，缺乏标签说明
2. **缓存 Token 未记录**：主流 AI API（OpenAI、Anthropic）均返回缓存相关 Token 数据，但系统未记录
3. **缺少自动刷新**：用户需手动刷新才能看到新日志，体验不佳

### 缓存 Token 的重要性

根据官方 SDK 类型定义（来源：GitHub openai/openai-python、anthropics/anthropic-sdk-python）：

**OpenAI API (`CompletionUsage`)：**

- `prompt_tokens_details.cached_tokens` - 缓存命中的输入 Token（计费 50% 折扣）
- `prompt_tokens_details.audio_tokens` - 音频输入 Token
- `completion_tokens_details.reasoning_tokens` - 推理 Token（o1/o3 模型）
- `completion_tokens_details.audio_tokens` - 音频输出 Token
- `completion_tokens_details.accepted_prediction_tokens` - Predicted Outputs 命中 Token
- `completion_tokens_details.rejected_prediction_tokens` - Predicted Outputs 未命中 Token

**Anthropic API (`Usage`)：**

- `cache_creation_input_tokens` - 缓存创建 Token（写入缓存）
- `cache_read_input_tokens` - 缓存读取 Token（命中缓存，计费 90% 折扣）
- `cache_creation.ephemeral_5m_input_tokens` - 5 分钟 TTL 缓存创建 Token
- `cache_creation.ephemeral_1h_input_tokens` - 1 小时 TTL 缓存创建 Token

缓存 Token 直接影响 API 成本计算，是计费核对的关键数据。

## What Changes

### 1. 数据库 Schema 扩展

新增 4 个 Token 相关字段到 `request_logs` 表：

- `cached_tokens` - 缓存命中 Token（OpenAI cached_tokens / Anthropic cache_read_input_tokens）
- `reasoning_tokens` - 推理 Token（OpenAI o1/o3 模型）
- `cache_creation_tokens` - 缓存创建 Token（Anthropic cache_creation_input_tokens）
- `cache_read_tokens` - 缓存读取 Token（统一字段，兼容 OpenAI/Anthropic）

### 2. 后端 Token 提取增强

扩展 `extractTokenUsage()` 函数，支持提取：

- OpenAI `prompt_tokens_details.cached_tokens`
- OpenAI `completion_tokens_details.reasoning_tokens`
- Anthropic `cache_creation_input_tokens`
- Anthropic `cache_read_input_tokens`

### 3. 前端 Token 显示优化

改进 `LogsTable` 组件的 Token 列显示：

- 添加清晰的标签（输入/输出/缓存）
- 支持 Tooltip 显示完整明细
- 缓存命中时显示特殊标识

### 4. 自动刷新功能

新增日志页面自动刷新：

- 支持关闭/10s/30s/60s 刷新间隔
- 用户偏好持久化（localStorage）
- 刷新时保持当前分页位置

## Impact

- Affected specs: `request-logs`（修改现有 capability）
- Affected code:
  - `src/lib/db/schema.ts` - 数据库 schema 扩展
  - `drizzle/` - 新增数据库迁移
  - `src/lib/services/request-logger.ts` - Token 提取逻辑增强
  - `src/app/api/admin/logs/route.ts` - API 响应字段扩展
  - `src/types/api.ts` - 类型定义更新
  - `src/lib/utils/api-transformers.ts` - 响应转换器更新
  - `src/components/admin/logs-table.tsx` - Token 显示组件重构
  - `src/app/[locale]/(dashboard)/logs/page.tsx` - 自动刷新功能
  - `src/hooks/use-request-logs.ts` - 支持 refetchInterval
  - `src/messages/*.json` - i18n 翻译更新
  - `tests/` - 相关测试更新
