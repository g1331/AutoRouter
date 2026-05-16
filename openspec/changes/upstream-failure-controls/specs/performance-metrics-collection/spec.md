## MODIFIED Requirements

### Requirement: 代理层必须采集上游首 token 耗时（TTFT）
系统 MUST 在 SSE 流式请求中记录从上游请求发出到第一个有效输出 token 到达的时间差（毫秒级精度），并持久化到 request_logs 表的 ttft_ms 字段。输出 token 包含正文 token、thinking token、tool 输入 token 等。首字超时判定 MUST 复用同一有效输出事件语义。

#### Scenario: 流式请求记录 TTFT
- **WHEN** 代理层向上游发送流式请求并收到第一个包含输出 token 的 SSE data event
- **THEN** 系统 SHALL 计算从 fetch 发出到该 event 的时间差，并将其记录为 ttft_ms
- **AND** 系统 SHALL 将该 event 视为首字超时检测的成功信号

#### Scenario: 非流式请求的 TTFT 为空
- **WHEN** 代理层向上游发送非流式请求
- **THEN** 系统 SHALL 将 ttft_ms 记录为 NULL

#### Scenario: TTFT 排除纯元数据事件
- **WHEN** 上游先发送不包含任何输出 token 的元数据事件（如 Anthropic 的 `message_start`、OpenAI Chat 的 `choices[].delta.role`）
- **THEN** 系统 SHALL 不触发 TTFT，直到出现第一个输出 token 事件（可为文本、thinking、tool 输入等）
- **AND** 这些元数据事件不得解除首字超时等待
