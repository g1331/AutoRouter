## MODIFIED Requirements

### Requirement: 管理台密钥编辑必须采用分区详情页
系统 MUST 将管理台 API Key 编辑承载于独立详情页 /keys/[id]（而非单体编辑弹窗），并按分区组织配置：基础信息（name/description/is_active）、访问模式与上游授权（access_mode/upstream_ids）、花费规则（spending_rules）、速率限制（rpm_limit/tpm_limit）、模型白名单（allowed_models）、到期（expires_at）。每个分区 MUST 是独立表单，具备独立 dirty 检测与独立分区级保存，保存按钮 MUST 在无改动时禁用，分区提交 MUST 仅携带本分区字段的 partial 载荷。访问模式与上游授权 MUST 合为同一分区提交，以避免 access_mode=restricted 时 upstream_ids 非空的跨字段校验在拆分提交下失败。密钥列表的编辑入口 MUST 跳转到该密钥详情页而非打开内联编辑弹窗。

#### Scenario: 密钥编辑在详情页按分区独立保存
- **WHEN** 管理员从密钥列表点击编辑
- **THEN** 系统 MUST 跳转到 /keys/[id] 详情页，并按基础信息、访问模式与上游授权、花费规则、速率限制、模型白名单、到期分区呈现独立表单
- **AND** 每个分区 MUST 可独立保存，保存按钮 MUST 在该分区无改动时禁用

#### Scenario: 分区提交仅携带本分区字段
- **WHEN** 管理员保存任一密钥配置分区
- **THEN** 系统 MUST 仅提交该分区对应字段的 partial 载荷，MUST NOT 携带其他分区字段

#### Scenario: 访问模式与授权同区提交
- **WHEN** 管理员将访问模式设为 restricted 并保存该分区
- **THEN** 系统 MUST 在同一提交中携带 access_mode 与 upstream_ids，保证 restricted 模式下上游授权非空校验通过

#### Scenario: 速率限制以空值呈现为不限速
- **WHEN** 管理员打开一个 rpm_limit 或 tpm_limit 为 null 的密钥详情
- **THEN** 对应数字输入 MUST 显示为空
- **AND** 保存未修改的分区 MUST NOT 将空值回填或持久化为 0
