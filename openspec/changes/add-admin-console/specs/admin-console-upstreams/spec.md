# Spec: Admin Console - Upstreams Management

## ADDED Requirements

### Requirement: Upstreams List View

管理员可以查看所有 Upstreams 的列表，支持分页浏览。

#### Scenario: 显示 Upstreams 列表

**Given** 数据库中存在 3 个 upstreams

**When** 管理员访问 `/upstreams` 页面

**Then** 应显示包含所有 upstreams 的表格

**And** 表格应包含列：名称、Provider、Base URL、API Key、默认、状态、操作

**And** 每行应显示对应 upstream 的信息

#### Scenario: API Key Masking

**Given** 数据库中有一个 upstream，api_key 为 `sk-openai-1234567890`

**When** 管理员查看 upstreams 列表

**Then** API Key 列应显示 masked 格式 `sk-***7890`

**And** 不应显示完整的 api_key 或加密后的密文

#### Scenario: Provider 显示

**Given** 数据库中有 2 个 upstreams：
- Upstream A：provider = `openai`
- Upstream B：provider = `anthropic`

**When** 管理员查看 upstreams 列表

**Then** Provider 列应分别显示 "OpenAI" 和 "Anthropic"（首字母大写）

**Or** 显示对应的图标/logo

#### Scenario: 默认标记

**Given** 数据库中有 3 个 upstreams：
- Upstream A：is_default = true
- Upstream B：is_default = false
- Upstream C：is_default = false

**When** 管理员查看 upstreams 列表

**Then** Upstream A 的 "默认" 列应显示绿色 badge "默认"

**And** Upstream B 和 C 的 "默认" 列应为空或显示 "-"

#### Scenario: 状态显示

**Given** 数据库中有 2 个 upstreams：
- Upstream A：is_active = true
- Upstream B：is_active = false

**When** 管理员查看 upstreams 列表

**Then** Upstream A 状态应显示为 "Active"（绿色 badge）

**And** Upstream B 状态应显示为 "Inactive"（灰色 badge）

#### Scenario: 分页显示

**Given** 数据库中存在 25 个 upstreams

**And** pageSize 设置为 20

**When** 管理员访问 `/upstreams` 页面

**Then** 应显示前 20 个 upstreams

**And** 应显示分页控件，当前页为 1，总页数为 2

#### Scenario: 空状态

**Given** 数据库中不存在任何 upstreams

**When** 管理员访问 `/upstreams` 页面

**Then** 应显示空状态组件

**And** 空状态应包含提示文字 "还没有配置任何 Upstream"

**And** 应显示 "添加第一个 Upstream" 按钮

---

### Requirement: Create Upstream

管理员可以创建新的 Upstream，配置 AI 服务提供商的连接信息。

#### Scenario: 打开创建对话框

**Given** 管理员在 `/upstreams` 页面

**When** 管理员点击 "添加 Upstream" 按钮

**Then** 应打开模态对话框

**And** 对话框标题为 "添加 Upstream"

**And** 对话框应包含表单字段：
- 名称（必填）
- Provider（下拉选择：OpenAI, Anthropic）
- Base URL（必填）
- API Key（必填）
- 设为默认（checkbox，默认 false）
- Timeout（数字，默认 60）

#### Scenario: 成功创建 Upstream

**Given** 管理员在创建对话框中

**When** 管理员填写表单：
- 名称：`my-openai`
- Provider：`OpenAI`
- Base URL：`https://api.openai.com`
- API Key：`sk-test-key-123`
- 设为默认：true
- Timeout：30

**And** 点击 "创建" 按钮

**Then** 应调用 `POST /admin/upstreams`，请求 body 为：
```json
{
  "name": "my-openai",
  "provider": "openai",
  "base_url": "https://api.openai.com",
  "api_key": "sk-test-key-123",
  "is_default": true,
  "timeout": 30
}
```

**And** 后端返回成功响应（201）

**And** 应关闭创建对话框

**And** 应显示成功 toast "Upstream 创建成功"

**And** upstreams 列表应刷新，显示新创建的 upstream

#### Scenario: 表单验证 - 必填字段

**Given** 管理员在创建对话框中

**When** 管理员提交空表单

**Then** 应显示验证错误：
- 名称：required 提示 "请输入名称"
- Provider：required 提示 "请选择 Provider"
- Base URL：required 提示 "请输入 Base URL"
- API Key：required 提示 "请输入 API Key"

**And** 不应调用后端 API

#### Scenario: 表单验证 - 名称长度

**Given** 管理员在创建对话框中

**When** 管理员输入名称为 70 个字符（超过 64）

**And** 提交表单

**Then** 应显示验证错误 "名称过长（最多 64 字符）"

**And** 不应调用后端 API

#### Scenario: 表单验证 - Base URL 格式

**Given** 管理员在创建对话框中

**When** 管理员输入 Base URL 为 `invalid-url`

**And** 提交表单

**Then** 应显示验证错误 "请输入有效的 URL（如 https://api.openai.com）"

**And** 不应调用后端 API

#### Scenario: 表单验证 - Timeout 范围

**Given** 管理员在创建对话框中

**When** 管理员输入 Timeout 为 `-10`

**And** 提交表单

**Then** 应显示验证错误 "Timeout 必须大于 0"

**And** 不应调用后端 API

#### Scenario: 创建失败 - 名称重复

**Given** 数据库中已存在名称为 `my-openai` 的 upstream

**When** 管理员尝试创建同名 upstream

**And** 后端返回 400 错误，detail 为 `"Upstream name already exists"`

**Then** 应显示错误 toast "创建失败：Upstream 名称已存在"

**And** 对话框应保持打开，用户可以修改名称后重试

---

### Requirement: Update Upstream

管理员可以编辑现有的 Upstream 配置，支持更新除名称外的所有字段。

#### Scenario: 打开编辑对话框

**Given** 管理员在 upstreams 列表页面

**And** 列表中有一个 upstream，数据为：
- 名称：`my-openai`
- Provider：`openai`
- Base URL：`https://api.openai.com`
- is_default：true
- timeout：60

**When** 管理员点击该 upstream 行的 "编辑" 按钮

**Then** 应打开模态对话框

**And** 对话框标题为 "编辑 Upstream"

**And** 表单字段应预填充现有数据：
- 名称：`my-openai`（禁用，不可编辑）
- Provider：`OpenAI`
- Base URL：`https://api.openai.com`
- API Key：留空（占位符 "留空表示不更新"）
- 设为默认：checked
- Timeout：60

#### Scenario: 成功更新 Upstream（不更新 API Key）

**Given** 管理员在编辑对话框中

**When** 管理员修改字段：
- Base URL：`https://api.openai.com/v2`
- Timeout：120
- API Key：留空

**And** 点击 "保存" 按钮

**Then** 应调用 `PUT /admin/upstreams/{upstream_id}`，请求 body 为：
```json
{
  "base_url": "https://api.openai.com/v2",
  "timeout": 120
}
```

**And** 不应包含 `api_key` 字段（留空表示不更新）

**And** 后端返回成功响应

**And** 应关闭编辑对话框

**And** 应显示成功 toast "Upstream 更新成功"

**And** upstreams 列表应刷新，显示更新后的数据

#### Scenario: 成功更新 Upstream（同时更新 API Key）

**Given** 管理员在编辑对话框中

**When** 管理员修改字段：
- Base URL：保持不变
- API Key：`sk-new-key-456`
- Timeout：保持不变

**And** 点击 "保存" 按钮

**Then** 应调用 `PUT /admin/upstreams/{upstream_id}`，请求 body 包含：
```json
{
  "api_key": "sk-new-key-456"
}
```

**And** 后端返回成功响应

**And** 列表刷新后，该 upstream 的 masked key 应更新为 `sk-***456`

#### Scenario: 名称不可编辑

**Given** 管理员在编辑对话框中

**When** 管理员查看名称字段

**Then** 名称字段应禁用（disabled）

**And** 应显示提示 "Upstream 名称创建后不可修改"

#### Scenario: 更新失败 - Upstream 不存在

**Given** 管理员在编辑对话框中

**When** 管理员提交表单

**And** 后端返回 404 错误

**Then** 应显示错误 toast "更新失败：Upstream 不存在"

**And** 对话框应关闭

**And** 列表应刷新（该 upstream 可能已被删除）

---

### Requirement: Delete Upstream

管理员可以删除（软删除）Upstream，删除后该 upstream 不可用。

#### Scenario: 打开删除确认对话框

**Given** 管理员在 upstreams 列表页面

**And** 列表中有一个 active 状态的 upstream

**When** 管理员点击该 upstream 行的 "删除" 按钮

**Then** 应打开确认对话框

**And** 对话框标题为 "删除 Upstream"

**And** 对话框内容应显示：
- Upstream 名称
- 警告文字 "删除后，使用此 Upstream 的 API Keys 将无法访问该服务"
- 二次确认文字 "此操作无法撤销"

#### Scenario: 成功删除 Upstream

**Given** 管理员在删除确认对话框中

**When** 管理员点击 "确认删除" 按钮

**Then** 应调用 `DELETE /admin/upstreams/{upstream_id}`

**And** 后端返回 204 No Content

**And** 应关闭确认对话框

**And** 应显示成功 toast "Upstream 已删除"

**And** upstreams 列表应刷新

**And** 该 upstream 状态应变为 "Inactive"（软删除）

#### Scenario: 删除已删除的 Upstream

**Given** 列表中有一个 inactive 状态的 upstream

**When** 管理员查看该 upstream 的操作列

**Then** "删除" 按钮应禁用或不显示

**And** 应显示提示 "已删除"

#### Scenario: 删除失败 - Upstream 不存在

**Given** 管理员在删除确认对话框中

**When** 管理员点击 "确认删除" 按钮

**And** 后端返回 404 错误

**Then** 应显示错误 toast "删除失败：Upstream 不存在"

**And** upstreams 列表应刷新

---

### Requirement: Loading and Error States

Upstreams 管理页面应优雅处理加载和错误状态。

#### Scenario: 加载状态

**Given** 管理员访问 `/upstreams` 页面

**When** API 请求尚未完成

**Then** 应显示 loading 状态（骨架屏或 spinner）

**And** 不应显示空状态或错误提示

#### Scenario: 网络错误

**Given** 管理员访问 `/upstreams` 页面

**When** API 请求失败（网络错误）

**Then** 应显示错误提示 "加载失败，请稍后重试"

**And** 应显示 "重试" 按钮

**When** 管理员点击 "重试" 按钮

**Then** 应重新请求 `GET /admin/upstreams`

---

### Requirement: Data Refresh

Upstreams 列表应在数据变更后自动刷新。

#### Scenario: 创建后自动刷新

**Given** 管理员成功创建一个新的 Upstream

**When** 创建操作完成

**Then** 应 invalidate TanStack Query cache（queryKey: `['upstreams']`）

**And** upstreams 列表应自动重新请求 `GET /admin/upstreams`

**And** 新创建的 upstream 应出现在列表中

#### Scenario: 更新后自动刷新

**Given** 管理员成功更新一个 Upstream

**When** 更新操作完成

**Then** upstreams 列表应自动刷新

**And** 该 upstream 的数据应更新为最新值

#### Scenario: 删除后自动刷新

**Given** 管理员成功删除一个 Upstream

**When** 删除操作完成

**Then** upstreams 列表应自动刷新

**And** 该 upstream 状态应更新为 "Inactive"
