## 1. 基础设施

- [x] 1.1 定义 FailoverConfig 类型和默认配置
- [x] 1.2 定义统一错误响应格式和工具函数

## 2. 核心 Failover 逻辑重构

- [x] 2.1 修改 shouldFailover() 函数，支持所有非 2xx 响应触发 failover
- [x] 2.2 重构 forwardWithFailover() 循环，支持 exhaust_all 策略
- [x] 2.3 实现下游断开检测 (request.signal.aborted)
- [x] 2.4 实现可配置的 excludeStatusCodes 支持

## 3. 流式响应首包验证

- [x] 3.1 实现首包验证逻辑，在开始流式传输前检查响应
- [x] 3.2 修改 wrapStreamWithConnectionTracking() 支持流中途错误处理
- [x] 3.3 实现 SSE 错误事件发送

## 4. 错误响应统一

- [x] 4.1 修改所有上游失败时的错误响应，使用统一格式
- [x] 4.2 确保不透露上游信息给下游

## 5. 测试

- [x] 5.1 编写 failover 触发条件测试（4xx/5xx/连接错误）
- [x] 5.2 编写 exhaust_all 策略测试
- [x] 5.3 编写首包验证测试
- [x] 5.4 编写统一错误响应测试
- [x] 5.5 编写下游断开检测测试
