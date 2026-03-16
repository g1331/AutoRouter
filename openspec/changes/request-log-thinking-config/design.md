## Context

当前仓库在代理入口已经会将 JSON 请求体读取为 `bodyJson`，但仅提取了 `model` 和 `stream`。请求日志链路目前主要记录响应侧 usage，例如 `reasoning_tokens`、cache token 和路由决策信息，管理端日志界面也围绕这些响应侧信号组织展示。

这带来两个实际问题。第一，用户无法从日志判断这次请求是否显式设置了 reasoning 或 thinking 等级。第二，不同 provider 的配置语义不同，如果继续依赖响应做反推，就会把“请求配置”和“运行结果”混淆。这个变更需要跨越代理入口、日志存储、API 转换和前端日志展示，因此需要在实现前把归一化结构和展示方案先定清楚。

涉及的主要约束如下：

- 必须兼容 OpenAI Responses、OpenAI Chat、Anthropic Messages、Gemini Generate 这几类已有请求协议。
- 只能记录请求里显式提供的配置，不能根据响应 token 或摘要反推出等级。
- 历史日志必须继续可读，新增字段不能破坏现有日志 API 和界面布局。
- 日志界面要能让用户一眼分清“请求配置”和“响应 usage”，避免把两者显示在同一个信息层级里。

## Goals / Non-Goals

**Goals:**

- 在请求进入代理时，统一提取不同 provider 的 thinking 或 reasoning 配置。
- 为请求日志定义一个稳定的归一化结构，保留 provider 差异，同时给前端提供统一显示接口。
- 在管理端日志列表和详情中设计 reasoning 等级信息的展示位置，并与响应 usage 分区显示。
- 对没有显式配置、非 JSON 请求体和历史数据给出明确的空值语义。

**Non-Goals:**

- 不新增基于 thinking 等级的筛选、排序或聚合统计能力。
- 不尝试从响应体、SSE 事件或 token 使用量反推请求等级。
- 不在本次变更中扩展新的响应 usage 指标归一化，例如 Gemini `thoughtsTokenCount`。
- 不改动现有 token 计量、billing 口径和路由决策逻辑。

## Decisions

### 1. 使用单个归一化 `thinking_config` 对象持久化请求侧配置

请求日志将新增一个可序列化的 `thinking_config` 字段，而不是为每个 provider 拆分独立列。建议结构如下：

```json
{
  "provider": "openai | anthropic | google",
  "protocol": "openai_responses | openai_chat | anthropic_messages | gemini_generate",
  "mode": "reasoning | thinking | adaptive | manual",
  "level": "none | minimal | low | medium | high | xhigh | MINIMAL | LOW | MEDIUM | HIGH | null",
  "budget_tokens": 8000,
  "include_thoughts": true,
  "explicit": true,
  "source_paths": [
    "reasoning.effort",
    "thinking.budget_tokens"
  ],
  "display_label": "Reasoning: medium",
  "raw_subset": {
    "reasoning": { "effort": "medium" }
  }
}
```

选择这个方案而不是多列拆分，原因有三点：

- OpenAI、Anthropic、Gemini 的字段命名和语义并不对齐，统一拆列会产生大量互斥空列。
- 前端展示需要的是“统一摘要 + provider 细节”，JSON 更适合承载这种异构结构。
- 后续如果 provider 增加新的 thinking 参数，可以在不做大规模迁移的前提下扩展对象字段。

替代方案：

- 多列方案：查询简单，但扩展性差，字段会快速膨胀。
- 完全原样存原始片段：实现快，但前端和 API 很难稳定消费，也不利于测试。

### 2. 在代理入口新增独立的请求侧 thinking 配置提取器

请求体解析逻辑将保持在代理入口，但 provider 相关的字段识别不应继续堆在 `route.ts` 中。设计上应新增一个独立提取器，用于接收 `matchedRouteCapability`、provider 信息和 `bodyJson`，返回归一化 `thinking_config` 或 `null`。

该提取器需要遵循以下规则：

- 仅在请求体为有效 JSON 时运行。
- 仅记录显式提供的字段，不写默认等级。
- 统一把“等级”和“预算”分开处理：
  - OpenAI Responses: `reasoning.effort`
  - OpenAI Chat: `reasoning_effort`
  - Anthropic: 优先 `effort`，其次 `thinking.type` 与 `thinking.budget_tokens`
  - Gemini: `generationConfig.thinkingConfig.thinkingLevel` 与 `thinkingBudget`
- 提取结果一旦生成，应在请求开始日志和请求完成日志两个路径上保持一致，避免流式与非流式分支产生不一致。

替代方案是直接在 `extractRequestContext` 中内联解析所有字段，但这样会继续放大代理路由文件的职责，不利于测试覆盖。

### 3. 管理端日志采用“模型名后 badge + 详情面板”双层展示

日志展示需要同时满足可扫读和可核对，因此采用双层结构：

- 列表层：不新增独立列，而是在模型单元格内、模型名后追加一个紧凑的 thinking badge，仅在存在显式配置时显示。
- 详情层：新增独立的 “Thinking Config” 面板，放在 token 详情相邻区域，但与 token usage 分开。

推荐布局如下：

```text
日志列表行
┌────────┬──────────────────────────┬───────────────┬────────┐
│ 状态   │ 模型                     │ Tokens        │ 耗时   │
├────────┼──────────────────────────┼───────────────┼────────┤
│ 200    │ gpt-5 [high]             │ in/out/cache  │ 1.2s   │
│ 200    │ gpt-5.4 [xhigh]          │ in/out        │ 2.4s   │
│ 200    │ claude-sonnet [adaptive] │ in/out        │ 0.9s   │
└────────┴──────────────────────────┴───────────────┴────────┘
```

```text
日志详情
┌───────────────────────┬───────────────────────┐
│ Thinking Config       │ Token Details         │
├───────────────────────┼───────────────────────┤
│ Provider: OpenAI      │ Input / Output        │
│ Protocol: Responses   │ Cache / ReasoningTok. │
│ Level: medium         │ ...                   │
│ Budget: -             │                       │
│ Source: reasoning...  │                       │
└───────────────────────┴───────────────────────┘
```

视觉层级要求：

- 列表中的 thinking badge 必须依附在模型名旁边显示，不新增独立列，也不挤占现有 token 列。
- badge 视觉优先级低于模型名，高于方法、路径等次级元信息。
- 详情中的 “Thinking Config” 面板与 “Token Details” 同级，不嵌套到 token 细节内部。
- 没有 thinking 配置时，模型名后不显示 badge；详情面板显示明确的 “未显式指定” 文案，而不是伪造默认值。

替代方案是新增独立的 Thinking 列，或把 thinking 等级塞进 token 详情或路由决策面板。前者会让表格更拥挤，后者会把请求配置和响应结果混在一起，阅读成本更高。

### 4. API 返回归一化对象，列表 badge 由前端基于配置对象渲染

管理端日志 API 返回完整 `thinking_config` 对象即可，列表中的 badge 文案由前端基于该对象渲染，例如 OpenAI 优先显示 `[high]`、Anthropic 可显示 `[adaptive]` 或 `[budget:8000]`、Gemini 可显示 `[HIGH]`。

原因：

- 当前模型单元格已经承载模型主信息和附加标识，前端在该单元格内追加 badge 更贴近现有组件结构。
- 避免为了列表文案单独引入服务端摘要字段，减少 API 和数据库设计噪声。

替代方案是在服务端额外返回 `thinking_summary_label`。该方案可行，但会重复表达已经存在于 `thinking_config` 中的信息，当前阶段收益不高。

## Risks / Trade-offs

- [不同 provider 的配置口径不一致] → 使用归一化对象保留原始来源路径和 provider 协议信息，避免“强行同构”。
- [用户未显式设置等级，但 provider 实际存在默认值] → 明确记录为“未显式指定”，不写推断默认值。
- [历史日志没有新字段] → API 和前端对 `thinking_config=null` 做兼容，列表不显示，详情显示空状态。
- [前端列表信息过密] → 列表只显示短摘要，完整细节放入展开面板。
- [后续需要筛选 thinking 等级] → 当前 JSON 结构便于先落地功能，但未来若要做复杂筛选，可能需要再增加派生列或查询索引。

## Migration Plan

1. 为 `request_logs` 增加 `thinking_config` 相关字段，生成并应用迁移。
2. 在代理请求入口接入 thinking 配置提取器，并将结果传入日志开始与完成路径。
3. 扩展服务层、API 类型和转换器，使管理端日志接口返回新增字段。
4. 在模型单元格中接入 badge 展示，并在日志详情区域接入完整配置展示。
5. 使用历史数据和新增测试验证空值兼容，再上线。

回滚策略：

- 若前端展示存在问题，可先保留数据库字段和 API 字段，只回退前端渲染。
- 若提取逻辑出现兼容问题，可将提取器返回强制降为 `null`，不影响原有日志主链路。

## Open Questions

- 是否需要在本次变更中同步支持按 thinking 等级筛选日志，还是先只做展示。
- Anthropic 的 `budget_tokens` 是否需要在列表摘要中直接显示，还是只在详情中显示以降低噪声。
