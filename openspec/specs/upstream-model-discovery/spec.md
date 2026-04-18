# upstream-model-discovery Specification

## Purpose
定义上游模型发现配置、目录缓存、刷新状态和 LiteLLM 辅助候选的规范要求。

## Requirements
### Requirement: 上游必须支持模型发现配置与兼容推断
系统 MUST 为每个上游提供模型发现配置，支持 OpenAI 兼容、Anthropic 原生、Gemini 原生、Gemini OpenAI 兼容、自定义地址和 LiteLLM 目录模式；当历史上游记录缺少该配置时，系统 MUST 基于现有能力集合推断可兼容的默认模式用于读取和首次刷新。

#### Scenario: 保存标准发现模式
- **WHEN** 管理员为具备单一提供商能力的上游选择标准发现模式并保存
- **THEN** 系统 MUST 持久化该模式及其附属配置，并在后续读取时完整回显

#### Scenario: 历史记录缺少发现配置
- **WHEN** 旧上游记录的 `model_discovery` 为空且其能力集合可以推断兼容提供商族
- **THEN** 系统 MUST 在管理端读取时提供可兼容的默认发现模式，并允许管理员直接执行首次刷新

#### Scenario: 自定义发现地址跟随能力族校验
- **WHEN** 管理员提交自定义发现地址
- **THEN** 系统 MUST 保留该地址配置并继续按当前上游能力族决定认证方式

### Requirement: 系统必须缓存模型目录与最近刷新状态
系统 MUST 将上游模型发现结果缓存为目录条目，并记录最近刷新时间、最近状态、最近错误和最近失败时间，供管理端展示和后续导入使用。

#### Scenario: 原生发现成功
- **WHEN** 管理员触发目录刷新且原生发现接口返回可解析的模型列表
- **THEN** 系统 MUST 更新 `model_catalog`、`model_catalog_updated_at` 和最近状态为成功

#### Scenario: 原生发现失败
- **WHEN** 管理员触发目录刷新且原生发现接口返回错误或不可解析结果
- **THEN** 系统 MUST 记录最近状态为失败，写入最近错误和最近失败时间，并保留已有目录缓存

#### Scenario: 刷新结果区分来源
- **WHEN** 系统将模型目录写入缓存
- **THEN** 每个目录条目 MUST 标记来源为 `native` 或 `inferred`，以便管理端区分真实返回与推断结果

### Requirement: 原生发现失败时系统必须支持 LiteLLM 目录辅助候选
当上游启用了 LiteLLM 回退选项且原生发现失败时，系统 MUST 允许使用 LiteLLM 目录作为辅助候选来源，并明确标记其来源属于推断目录。

#### Scenario: 原生发现失败且启用回退
- **WHEN** 原生发现失败且 `enable_lite_llm_fallback=true`
- **THEN** 系统 MUST 尝试读取 LiteLLM 目录，并把成功得到的条目标记为 `inferred`

#### Scenario: 原生发现失败且未启用回退
- **WHEN** 原生发现失败且 `enable_lite_llm_fallback=false`
- **THEN** 系统 MUST 保持本次刷新为失败状态，不得写入推断目录

#### Scenario: LiteLLM 回退成功后仍保留来源差异
- **WHEN** 系统通过 LiteLLM 目录完成本次刷新
- **THEN** 管理端 MUST 能看到本次目录并非上游真实返回结果，而是推断候选
