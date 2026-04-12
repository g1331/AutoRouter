# upstream-model-discovery Specification

## Purpose
定义上游模型目录发现、缓存与抓取状态的主规格，确保管理端与运行时能够基于真实发现结果和明确标记的推断候选维护模型目录。

## Requirements
### Requirement: 每个上游必须可配置模型发现方式
系统 SHALL 允许管理员为每个上游配置模型发现方式、发现端点或兼容模式，以便从不同上游协议获取模型目录。

#### Scenario: 使用标准 OpenAI 兼容发现方式
- **WHEN** 管理员为某上游选择 OpenAI 兼容发现方式
- **THEN** 系统 MUST 使用该方式对应的标准发现端点获取模型列表

#### Scenario: 使用原生 Gemini 发现方式
- **WHEN** 管理员为某上游选择 Gemini 原生发现方式
- **THEN** 系统 MUST 使用 Gemini 原生发现端点获取模型目录，而不是强制套用 OpenAI 兼容路径

#### Scenario: 使用自定义发现端点
- **WHEN** 某上游不适合任何内置兼容模式且管理员显式配置了自定义发现端点
- **THEN** 系统 MUST 按该自定义端点执行发现请求

### Requirement: 系统必须持久化上游模型目录缓存与最近抓取状态
系统 SHALL 将每个上游最近一次模型发现结果持久化为目录缓存，并记录来源、抓取时间、最近一次成功状态与失败原因。

#### Scenario: 抓取成功时写入目录缓存
- **WHEN** 系统成功从某上游发现到模型列表
- **THEN** 系统 MUST 持久化规范化后的目录条目、来源类型与抓取时间
- **AND** 系统 MUST 将最近一次抓取状态标记为成功

#### Scenario: 抓取失败时保留失败信息
- **WHEN** 系统执行模型发现失败
- **THEN** 系统 MUST 记录失败时间与失败原因
- **AND** 系统 MUST 使管理端能够读取最近一次失败状态

### Requirement: 原生发现失败时系统必须支持 LiteLLM 推断目录回退
系统 SHALL 在原生发现失败时允许使用按上游类型筛选的 LiteLLM 目录作为辅助候选来源，但必须明确标识其为推断结果。

#### Scenario: 原生发现失败后展示 LiteLLM 候选目录
- **WHEN** 某上游的原生发现失败且该上游启用了 LiteLLM fallback
- **THEN** 系统 MUST 返回 LiteLLM 候选目录供管理员浏览
- **AND** 每个候选条目 MUST 标记为推断来源而不是上游真实返回

#### Scenario: 未启用 fallback 时仅展示原生失败状态
- **WHEN** 某上游的原生发现失败且未启用 LiteLLM fallback
- **THEN** 系统 MUST 仅展示失败状态与失败原因
- **AND** 系统 MUST NOT 伪造可导入的候选目录
