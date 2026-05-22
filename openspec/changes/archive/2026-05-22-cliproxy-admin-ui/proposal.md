## Why

issue #142 的四个后端变更已交付 CLIProxyAPI 集成的全部 API 与服务能力，但没有任何前端界面。AutoRouter 管理端左侧菜单中没有 CLIProxyAPI 入口，管理员无法通过界面登记实例、查看 OAuth 账号、发起 OAuth 登录或创建 CLI OAuth 上游，只能直接调用 Admin API。issue #142 的验收条件第 1 至 7 条均要求「在 AutoRouter 管理端」完成相应操作，因此在补齐前端界面之前，issue #142 不能视为真正交付。本变更交付这一缺失的前端管理界面。

## What Changes

- 在左侧菜单的「系统」分组新增 CLIProxyAPI 入口，新增页面路由 `(dashboard)/system/cliproxy`。
- 新增 CLIProxyAPI 实例管理界面，覆盖实例列表展示、创建、编辑、删除，以及创建前预检测与已保存实例的连通性检测。
- 新增 OAuth 账号管理界面。选中实例后在同页面展示该实例的 OAuth 账号列表，含账号文件名、服务商、状态、模型数量、前缀，并提供账号同步、启停，以及前缀、出站代理、优先级、备注的编辑。
- 新增 OAuth 登录流程界面。以弹窗形式发起 Codex、Claude、Gemini 的 OAuth 登录，展示授权地址、device code、过期倒计时与轮询状态，登录完成后刷新账号列表。
- 新增 CLI OAuth 上游创建入口。实例行操作提供按服务商一键创建池上游，账号行操作提供将单个账号固定映射为上游。
- 新增上述界面的中英文翻译文案。

本变更不修改任何后端 API、服务或数据库 schema，全部前端界面均调用 issue #142 后端变更已交付的 Admin API。

## Capabilities

### New Capabilities

- `cliproxy-admin-ui`: 覆盖 CLIProxyAPI 管理界面的菜单入口与页面路由、实例管理界面、OAuth 账号管理界面、OAuth 登录流程界面、CLI OAuth 上游创建入口，以及对应的数据获取 hooks 与国际化文案。

### Modified Capabilities

无。本变更仅新增前端界面，不修改任何既有 spec 的需求文本。

## Impact

页面层面新增 `src/app/[locale]/(dashboard)/system/cliproxy/page.tsx`，并在 `src/components/admin/sidebar.tsx` 的系统导航数组新增菜单项。

组件层面新增 CLIProxyAPI 实例表格、实例创建编辑弹窗、删除确认弹窗、连通性检测弹窗、账号列表、账号编辑弹窗、OAuth 登录弹窗、池上游与单账号上游创建弹窗，置于 `src/components/admin/` 目录，复用既有的 `Dialog`、`Form`、`Table`、`Card`、`Button`、`PaginationControls`、`Topbar` 等组件。

数据层面新增 `src/hooks/use-cliproxy.ts`，按既有 `useAuth().apiClient` 加 TanStack Query 的模式封装实例、账号、OAuth 登录、上游创建的查询与变更 hooks。

国际化层面在 `src/messages/en.json` 与 `src/messages/zh-CN.json` 新增 `cliproxy` 命名空间，并在 `nav` 命名空间补充菜单标签。

测试层面在 `tests/unit/hooks/` 与 `tests/components/` 新增 hooks 与组件测试。
