# header-compensation-config Specification

## Purpose
TBD - created by archiving change outbound-header-compensation. Update Purpose after archive.
## Requirements
### Requirement: 补偿规则列表展示
系统 SHALL 在管理界面提供补偿规则列表页面，展示所有规则（内置与自定义），每条规则显示名称、类型标签（内置/自定义）、启用状态、目标头部、适用能力列表及来源优先级摘要。

#### Scenario: 页面加载规则列表
- **WHEN** 管理员访问 System > Header Compensation 页面
- **THEN** 页面展示所有补偿规则，内置规则排在前面，每条规则显示完整信息

#### Scenario: 空规则列表
- **WHEN** 数据库中除内置规则外无任何自定义规则
- **THEN** 页面仍展示内置规则，并提供新增自定义规则的入口

---

### Requirement: 内置规则启用/禁用
系统 SHALL 允许管理员切换内置规则的 `enabled` 状态，但不允许删除内置规则。

#### Scenario: 禁用内置规则
- **WHEN** 管理员将内置规则的启用开关切换为关闭
- **THEN** 系统将该规则的 `enabled` 更新为 `false`，补偿引擎立即停止执行该规则（最多延迟 60 秒缓存刷新）

#### Scenario: 内置规则无删除按钮
- **WHEN** 管理员查看内置规则的操作区域
- **THEN** 操作区域仅显示启用开关和编辑按钮，不显示删除按钮

---

### Requirement: 自定义规则增删改
系统 SHALL 允许管理员创建、编辑和删除自定义补偿规则。

#### Scenario: 创建自定义规则
- **WHEN** 管理员填写规则名称、目标头部、适用能力、来源列表并提交
- **THEN** 系统将新规则持久化到数据库，规则立即在列表中可见

#### Scenario: 编辑自定义规则
- **WHEN** 管理员修改自定义规则的任意字段并保存
- **THEN** 系统更新数据库中对应记录，变更在下次缓存刷新后生效

#### Scenario: 删除自定义规则
- **WHEN** 管理员点击自定义规则的删除按钮并确认
- **THEN** 系统从数据库中删除该规则，规则从列表中消失

#### Scenario: 规则名称重复校验
- **WHEN** 管理员尝试创建与已有规则同名的新规则
- **THEN** 系统拒绝创建并提示名称已存在

---

### Requirement: 来源优先级拖拽排序
系统 SHALL 在规则编辑界面提供来源列表的拖拽排序功能，允许管理员调整来源路径的优先级顺序。

#### Scenario: 拖拽调整来源顺序
- **WHEN** 管理员在编辑规则时拖拽来源列表中的某一项到新位置
- **THEN** 列表顺序实时更新，保存后新顺序持久化到数据库

---

### Requirement: 能力矩阵视图
系统 SHALL 在页面底部展示能力矩阵，以表格形式显示每个 RouteCapability 对应的活跃规则数量和整体状态。

#### Scenario: 能力矩阵展示
- **WHEN** 管理员查看 Header Compensation 页面
- **THEN** 页面底部的能力矩阵列出所有已配置规则覆盖的 capability，显示每个 capability 的规则数量及是否有活跃规则

---

### Requirement: System 导航分组
系统 SHALL 在侧边栏新增顶级导航分组 "System"，包含 "Header Compensation" 子项。

#### Scenario: 侧边栏显示 System 分组
- **WHEN** 管理员登录后查看侧边栏
- **THEN** 侧边栏显示 "System" 分组，其下包含 "Header Compensation" 导航项

---

### Requirement: 补偿规则管理 API
系统 SHALL 提供以下 REST API 端点供前端调用：
- `GET /api/admin/compensation-rules`：获取所有规则列表
- `POST /api/admin/compensation-rules`：创建自定义规则
- `PUT /api/admin/compensation-rules/:id`：更新规则（内置规则仅允许更新 `enabled` 和 `sources`）
- `DELETE /api/admin/compensation-rules/:id`：删除规则（内置规则返回 403）

#### Scenario: 尝试删除内置规则
- **WHEN** 客户端发送 `DELETE /api/admin/compensation-rules/:id`，且目标规则 `is_builtin=true`
- **THEN** API 返回 403 Forbidden，规则不被删除

#### Scenario: 获取规则列表
- **WHEN** 客户端发送 `GET /api/admin/compensation-rules`
- **THEN** API 返回所有规则的完整信息，HTTP 200

