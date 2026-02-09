# Spec: Admin Console - API Keys Management

## ADDED Requirements

### Requirement: Keys List View

管理员可以查看所有 API Keys 的列表，支持分页浏览。

#### Scenario: 显示 API Keys 列表

**Given** 数据库中存在 5 个 API Keys

**When** 管理员访问 `/keys` 页面

**Then** 应显示包含所有 keys 的表格

**And** 表格应包含列：Key Prefix、名称、Upstreams、创建时间、过期时间、状态、操作

**And** 每行应显示对应 key 的信息

#### Scenario: Key Prefix 显示格式

**Given** 数据库中有一个 key，key_prefix 为 `sk-auto-abcd`

**When** 管理员查看 keys 列表

**Then** Key Prefix 列应显示 `sk-auto-abcd****`

**And** 不应显示完整的 key value

#### Scenario: Upstreams 显示

**Given** 一个 key 有权限访问 2 个 upstreams（openai, anthropic）

**When** 管理员查看 keys 列表

**Then** Upstreams 列应显示 upstream 名称（如 "openai, anthropic"）

**Or** 显示为 badges（如 `<Badge>openai</Badge> <Badge>anthropic</Badge>`）

#### Scenario: 状态标识

**Given** 数据库中有 3 个 keys：

- Key A：is_active=true, expires_at=null
- Key B：is_active=false
- Key C：is_active=true, expires_at=昨天

**When** 管理员查看 keys 列表

**Then** Key A 状态应显示为 "Active"（绿色 badge）

**And** Key B 状态应显示为 "Inactive"（灰色 badge）

**And** Key C 状态应显示为 "Expired"（红色 badge）

#### Scenario: 分页显示

**Given** 数据库中存在 25 个 API Keys

**And** pageSize 设置为 20

**When** 管理员访问 `/keys` 页面

**Then** 应显示前 20 个 keys

**And** 应显示分页控件，显示当前页为 1，总页数为 2

**And** "下一页" 按钮应可用

**And** "上一页" 按钮应禁用

#### Scenario: 翻页

**Given** 管理员在 keys 列表第 1 页

**When** 管理员点击 "下一页" 按钮

**Then** 应请求 `GET /admin/keys?page=2&page_size=20`

**And** 应显示第 2 页的 keys

**And** URL 应更新为 `/keys?page=2`（可选，使用 query params）

#### Scenario: 空状态

**Given** 数据库中不存在任何 API Keys

**When** 管理员访问 `/keys` 页面

**Then** 应显示空状态组件

**And** 空状态应包含提示文字 "还没有任何 API Key"

**And** 应显示 "创建第一个 API Key" 按钮

**When** 管理员点击该按钮

**Then** 应打开创建 Key 对话框

---

### Requirement: Create API Key

管理员可以创建新的 API Key，指定名称、描述、权限和过期时间。

#### Scenario: 打开创建对话框

**Given** 管理员在 `/keys` 页面

**When** 管理员点击 "创建 API Key" 按钮

**Then** 应打开模态对话框

**And** 对话框标题为 "创建 API Key"

**And** 对话框应包含表单字段：名称、描述、Upstreams（多选）、过期时间（可选）

#### Scenario: 成功创建 API Key

**Given** 管理员在创建对话框中

**And** 数据库中存在 2 个 upstreams（openai, anthropic）

**When** 管理员填写表单：

- 名称：`test-key`
- 描述：`Test API Key`
- Upstreams：选中 `openai`
- 过期时间：留空

**And** 点击 "创建" 按钮

**Then** 应调用 `POST /admin/keys`，请求 body 为：

```json
{
  "name": "test-key",
  "description": "Test API Key",
  "upstream_ids": ["<openai-uuid>"],
  "expires_at": null
}
```

**And** 后端返回成功响应，包含完整 key_value

**And** 应关闭创建对话框

**And** 应打开 "显示 Key" 对话框，显示完整 key value

**And** 应显示成功 toast "API Key 创建成功"

**And** keys 列表应刷新，显示新创建的 key

#### Scenario: 显示完整 Key（仅一次）

**Given** API Key 创建成功，返回 key_value 为 `sk-auto-abc123xyz`

**When** 前端打开 "显示 Key" 对话框

**Then** 对话框应显示完整 key value `sk-auto-abc123xyz`

**And** 应显示 "复制" 按钮

**And** 应显示警告提示 "请妥善保存此 Key，关闭后将无法再次查看"

**When** 管理员点击 "复制" 按钮

**Then** key value 应复制到剪贴板

**And** 显示 toast "已复制到剪贴板"

**When** 管理员关闭对话框

**Then** key value 不应再次显示（即使重新打开列表）

#### Scenario: 表单验证 - 必填字段

**Given** 管理员在创建对话框中

**When** 管理员提交空表单

**Then** 应显示验证错误：

- 名称：required 提示 "请输入名称"
- Upstreams：required 提示 "至少选择一个 Upstream"

**And** 不应调用后端 API

#### Scenario: 表单验证 - 名称长度

**Given** 管理员在创建对话框中

**When** 管理员输入名称为 300 个字符（超过 255）

**And** 提交表单

**Then** 应显示验证错误 "名称过长（最多 255 字符）"

**And** 不应调用后端 API

#### Scenario: 表单验证 - Upstreams 为空

**Given** 管理员在创建对话框中

**When** 管理员填写名称但未选择任何 Upstream

**And** 提交表单

**Then** 应显示验证错误 "至少选择一个 Upstream"

**And** 不应调用后端 API

#### Scenario: 创建失败 - 后端错误

**Given** 管理员在创建对话框中

**When** 管理员提交有效表单

**And** 后端返回 400 错误，detail 为 `"Invalid or inactive upstream IDs"`

**Then** 应显示错误 toast "创建失败：Invalid or inactive upstream IDs"

**And** 对话框应保持打开，用户可以修改后重试

---

### Requirement: Revoke API Key

管理员可以撤销（软删除）API Key，撤销后 key 立即失效。

#### Scenario: 打开撤销确认对话框

**Given** 管理员在 keys 列表页面

**And** 列表中有一个 active 状态的 key

**When** 管理员点击该 key 行的 "撤销" 按钮

**Then** 应打开确认对话框

**And** 对话框标题为 "撤销 API Key"

**And** 对话框内容应显示：

- Key prefix（如 `sk-auto-****`）
- Key 名称
- 警告文字 "撤销后此 Key 将立即失效，无法恢复"

#### Scenario: 成功撤销 API Key

**Given** 管理员在撤销确认对话框中

**When** 管理员点击 "确认撤销" 按钮

**Then** 应调用 `DELETE /admin/keys/{key_id}`

**And** 后端返回 204 No Content

**And** 应关闭确认对话框

**And** 应显示成功 toast "API Key 已撤销"

**And** keys 列表应刷新

**And** 该 key 状态应变为 "Inactive"

#### Scenario: 撤销已撤销的 Key

**Given** 列表中有一个 inactive 状态的 key

**When** 管理员查看该 key 的操作列

**Then** "撤销" 按钮应禁用或不显示

**And** 应显示提示 "已撤销"

#### Scenario: 撤销失败 - Key 不存在

**Given** 管理员在撤销确认对话框中

**When** 管理员点击 "确认撤销" 按钮

**And** 后端返回 404 错误

**Then** 应显示错误 toast "撤销失败：Key 不存在"

**And** keys 列表应刷新（该 key 可能已被删除）

---

### Requirement: Loading and Error States

API Keys 管理页面应优雅处理加载和错误状态。

#### Scenario: 加载状态

**Given** 管理员访问 `/keys` 页面

**When** API 请求尚未完成

**Then** 应显示 loading 状态（骨架屏或 spinner）

**And** 不应显示空状态或错误提示

#### Scenario: 网络错误

**Given** 管理员访问 `/keys` 页面

**When** API 请求失败（网络错误）

**Then** 应显示错误提示 "加载失败，请稍后重试"

**And** 应显示 "重试" 按钮

**When** 管理员点击 "重试" 按钮

**Then** 应重新请求 `GET /admin/keys`

#### Scenario: 按钮 Loading 状态

**Given** 管理员在创建对话框中提交表单

**When** API 请求进行中

**Then** "创建" 按钮应显示 loading spinner

**And** 按钮应禁用（防止重复提交）

**And** 表单其他字段应禁用

**When** API 请求完成（成功或失败）

**Then** 按钮应恢复正常状态

**And** 表单字段应恢复可用

---

### Requirement: Data Refresh

Keys 列表应在数据变更后自动刷新，保持数据最新。

#### Scenario: 创建后自动刷新

**Given** 管理员成功创建一个新的 API Key

**When** 创建操作完成

**Then** 应 invalidate TanStack Query cache（queryKey: `['api-keys']`）

**And** keys 列表应自动重新请求 `GET /admin/keys`

**And** 新创建的 key 应出现在列表顶部（按 created_at desc 排序）

#### Scenario: 撤销后自动刷新

**Given** 管理员成功撤销一个 API Key

**When** 撤销操作完成

**Then** keys 列表应自动刷新

**And** 该 key 状态应更新为 "Inactive"

#### Scenario: 乐观更新（可选）

**Given** 管理员点击撤销按钮

**When** API 请求开始

**Then** 列表中该 key 状态应立即变为 "Inactive"（乐观更新）

**And** 应显示 loading indicator

**When** API 请求成功

**Then** loading indicator 消失，状态保持 "Inactive"

**When** API 请求失败

**Then** 状态应回滚为 "Active"

**And** 显示错误 toast
