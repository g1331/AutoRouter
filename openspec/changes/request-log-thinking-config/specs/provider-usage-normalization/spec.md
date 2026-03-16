## ADDED Requirements

### Requirement: provider 归一化必须覆盖请求侧 thinking 配置
系统的 provider 归一化能力除了处理响应侧 usage 外，还必须统一处理请求侧显式 thinking 或 reasoning 配置，并输出可持久化的归一化结构。

#### Scenario: 相同 provider 在流式与非流式路径上一致归一化
- **WHEN** 同一协议的请求分别进入流式和非流式日志路径
- **THEN** 系统必须生成语义一致的 thinking 配置对象，不得因为日志写入路径不同而改变字段解释

#### Scenario: 归一化结果保留 provider 与协议信息
- **WHEN** 系统从请求体提取到 thinking 或 reasoning 配置
- **THEN** 归一化结果必须同时包含 provider 标识、协议标识和来源路径，便于后续 API 和界面稳定消费

### Requirement: 系统不得从响应反推 thinking 等级
系统必须将请求侧 thinking 配置与响应侧 usage 信号分开处理，不得根据 `reasoning_tokens`、thinking 文本块、summary 或其他响应内容反推出请求等级。

#### Scenario: 响应包含 reasoning token 但请求无显式配置
- **WHEN** 某次响应产生了 `reasoning_tokens` 或等价的思考 usage，但请求未显式设置 thinking 配置
- **THEN** 系统必须保持 thinking 配置为空，并仅记录响应 usage 信号

#### Scenario: 响应包含思考摘要或思考内容块
- **WHEN** 响应中出现 reasoning summary、Anthropic thinking block 或其他思考内容
- **THEN** 系统不得将这些内容转换成请求等级字段，仍然只允许它们作为响应侧信号存在
