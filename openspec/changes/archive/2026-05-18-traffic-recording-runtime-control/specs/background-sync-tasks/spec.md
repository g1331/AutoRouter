## ADDED Requirements

### Requirement: 系统必须提供请求录制清理后台任务
系统 MUST 将请求录制清理注册为后台同步任务，使过期录制文件和索引能够按配置自动清理，并能由管理员手动立即执行。

#### Scenario: 注册请求录制清理任务
- **WHEN** 应用注册后台同步任务定义
- **THEN** 系统 SHALL 注册任务名为 `traffic_recording_cleanup` 的后台任务
- **AND** 该任务 SHALL 出现在后台任务状态列表中

#### Scenario: 自动清理过期录制
- **WHEN** 请求录制清理任务执行
- **THEN** 系统 SHALL 根据请求录制配置中的保留天数删除过期录制索引和对应 fixture 文件
- **AND** 任务结果 SHALL 记录删除数量和失败数量

#### Scenario: 手动执行清理任务
- **WHEN** 管理员请求立即执行 `traffic_recording_cleanup`
- **THEN** 系统 SHALL 立即执行过期录制清理
- **AND** API SHALL 返回本次执行结果或当前运行状态
