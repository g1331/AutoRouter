# api-key-management-workbench Specification

## Purpose
规定管理台 API Key 的创建、归属筛选与分区详情编辑体验，使管理员能够看清密钥归属、一次性取得新密钥，并按配置领域独立保存授权、消费和速率规则。

## Requirements

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

### Requirement: 密钥创建必须采用瘦弹窗并保留一次性密钥展示
系统 MUST 提供仅收集必填项的瘦创建弹窗；创建成功后 MUST 先一次性展示明文密钥（沿用现有一次可见逻辑），随后 MUST 引导管理员进入该密钥详情页补全其余配置。创建弹窗 MUST 保留既有的容器变形（morph）进场交互。

#### Scenario: 创建后展示一次性密钥并跳转补全
- **WHEN** 管理员在瘦创建弹窗填写必填项并提交成功
- **THEN** 系统 MUST 先一次性展示新密钥明文，管理员确认后 MUST 进入该密钥详情页补全其余配置

#### Scenario: 一次性密钥仅在创建时可见
- **WHEN** 管理员完成创建并离开一次性密钥展示
- **THEN** 系统 SHALL NOT 再次以明文回显该密钥，后续仅可在详情页管理非机密配置

### Requirement: 全局密钥列表按归属分离

管理台全局密钥列表（`GET /api/admin/keys`）SHALL 支持归属范围参数：默认范围 MUST 只返回无归属密钥（`user_id` 为空）；管理员可显式切换到“全部”范围查看所有密钥。密钥列表响应 SHALL 携带归属信息（`user_id` 与 `user_name`），“全部”范围下 UI MUST 为有归属密钥展示归属标识。指定 `user_id` 查询参数时 SHALL 返回该用户名下的密钥列表。

#### Scenario: 默认只见无归属密钥

- **WHEN** 管理员打开密钥页（未切换范围）
- **THEN** 列表只包含无归属密钥，成员名下的密钥不出现

#### Scenario: 全部范围可见归属

- **WHEN** 管理员把范围切换为“全部”
- **THEN** 列表包含全部密钥，有归属的密钥展示其归属用户名

#### Scenario: 按用户过滤

- **WHEN** 管理员以 `user_id` 查询密钥列表
- **THEN** 返回该用户名下的全部密钥
