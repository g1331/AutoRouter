## ADDED Requirements

### Requirement: 代理入口必须支持多头 API key 鉴权
代理入口在处理 `/api/proxy/v1/*` 请求时必须支持从多个标准头中提取 API key，并按照固定优先级选择候选值用于后续校验。

#### Scenario: 使用 Authorization 鉴权
- **WHEN** 请求同时携带 `authorization` 与其他 API key 头
- **THEN** 系统必须优先使用 `authorization` 提取的 key 进行校验

#### Scenario: 回退到 x-api-key
- **WHEN** 请求缺少 `authorization` 且携带 `x-api-key`
- **THEN** 系统必须使用 `x-api-key` 提取的 key 进行校验

#### Scenario: 回退到 x-goog-api-key
- **WHEN** 请求缺少 `authorization` 与 `x-api-key` 且携带 `x-goog-api-key`
- **THEN** 系统必须使用 `x-goog-api-key` 提取的 key 进行校验

#### Scenario: 缺失所有支持头
- **WHEN** 请求未携带任何受支持的 API key 头
- **THEN** 系统必须返回 `401` 且错误语义保持 `Missing API key`

### Requirement: API key 校验语义必须保持兼容
在引入多头提取后，系统仍必须保持现有 key 前缀匹配、哈希校验和过期判断行为，不得放宽授权边界。

#### Scenario: 无效 key 仍返回 Invalid API key
- **WHEN** 提取出的 key 无法通过前缀候选与哈希校验
- **THEN** 系统必须返回 `401` 且错误语义为 `Invalid API key`

#### Scenario: 过期 key 仍返回 API key has expired
- **WHEN** 提取出的 key 校验通过但已过期
- **THEN** 系统必须返回 `401` 且错误语义为 `API key has expired`

### Requirement: 转发阶段必须替换并脱敏全部鉴权头
系统在转发到上游前必须移除来自客户端的鉴权头并注入上游凭据，同时确保所有鉴权头在观测数据中被脱敏。

#### Scenario: Google 上游使用 x-goog-api-key 注入
- **WHEN** 目标上游 provider 为 `google`
- **THEN** 转发请求必须包含 `x-goog-api-key` 上游密钥且不得透传客户端原始鉴权头值

#### Scenario: Anthropic 与 OpenAI 维持 provider 对应头语义
- **WHEN** 目标上游 provider 为 `anthropic` 或 `openai/custom`
- **THEN** 转发请求必须分别使用 provider 对应的鉴权头格式注入上游密钥

#### Scenario: 鉴权头在观测输出中脱敏
- **WHEN** 系统记录 `headerDiff`、fixture 或调试日志
- **THEN** `authorization`、`x-api-key`、`x-goog-api-key` 的值必须被脱敏，不得输出完整密钥

### Requirement: 系统必须记录入站鉴权来源
系统必须记录本次请求最终采用的入站鉴权头来源，用于定位不同 SDK 行为差异。

#### Scenario: 记录 Authorization 来源
- **WHEN** 最终使用 `authorization` 头完成鉴权
- **THEN** 系统必须将来源记录为 `authorization`

#### Scenario: 记录 Google 头来源
- **WHEN** 最终使用 `x-goog-api-key` 头完成鉴权
- **THEN** 系统必须将来源记录为 `x-goog-api-key`
