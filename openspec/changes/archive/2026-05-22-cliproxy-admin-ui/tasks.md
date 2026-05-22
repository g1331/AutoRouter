## 1. 菜单入口、页面路由与实例管理界面

- [x] 1.1 在 `src/components/admin/sidebar.tsx` 的系统导航数组与类型新增 CLIProxyAPI 菜单项，图标取自 `lucide-react`
- [x] 1.2 在 `src/messages/en.json` 与 `src/messages/zh-CN.json` 的 `nav` 命名空间新增 CLIProxyAPI 菜单标签，并新建 `cliproxy` 命名空间承载本变更文案
- [x] 1.3 新增 `src/hooks/use-cliproxy.ts`，实现实例列表、创建、更新、删除、连通性预检测与已保存实例检测的 TanStack Query hooks，复用 `useAuth().apiClient` 与既有查询键约定
- [x] 1.4 新增页面 `src/app/[locale]/(dashboard)/system/cliproxy/page.tsx`，以 `Topbar` 与 `Card` 承载实例表格与操作区
- [x] 1.5 新增实例表格组件 `src/components/admin/cliproxy-instances-table.tsx`，展示实例名称、运行模式、地址、启用状态，并提供行操作菜单
- [x] 1.6 新增实例创建编辑弹窗 `src/components/admin/cliproxy-instance-form-dialog.tsx`，使用 `react-hook-form` 与 `zod`，敏感字段用 `PasswordInput`，内置连通性预检测
- [x] 1.7 新增实例删除确认弹窗与连通性检测弹窗组件
- [x] 1.8 为 `use-cliproxy.ts` 的实例 hooks 与实例表单弹窗补单元测试与组件测试
- [x] 1.9 运行 `pnpm test:run`、`pnpm exec tsc --noEmit`、`pnpm lint` 确认通过，提交本阶段代码

## 2. OAuth 账号列表与账号管理界面

- [x] 2.1 在 `use-cliproxy.ts` 新增账号列表、账号同步、账号启停、账号字段更新的 hooks
- [x] 2.2 在页面新增选中实例状态，选中后于实例表格下方内联面板展示账号列表
- [x] 2.3 新增账号列表组件 `src/components/admin/cliproxy-accounts-table.tsx`，展示账号文件名、服务商、状态、模型数量、前缀，并提供行操作菜单
- [x] 2.4 新增账号字段编辑弹窗，支持编辑前缀、出站代理、优先级、备注
- [x] 2.5 实现账号同步与账号启停操作及其结果提示
- [x] 2.6 为账号相关 hooks 与账号表格、账号编辑弹窗补测试
- [x] 2.7 运行 `pnpm test:run`、`pnpm exec tsc --noEmit`、`pnpm lint` 确认通过，提交本阶段代码

## 3. OAuth 登录流程界面

- [x] 3.1 在 `use-cliproxy.ts` 新增发起 OAuth 登录与轮询登录状态的 hooks，轮询间隔 3 秒，以客户端固定超时上限为硬性截止
- [x] 3.2 新增 OAuth 登录弹窗组件 `src/components/admin/cliproxy-oauth-login-dialog.tsx`，支持选择服务商发起登录
- [x] 3.3 在弹窗中展示授权地址与轮询状态，提供在新标签页打开、复制授权地址操作（接口不返回 device code 与过期时间，按实际契约实现）
- [x] 3.4 实现登录成功关闭弹窗并刷新账号列表、失败或超时停止轮询并展示重新发起入口、关闭弹窗停止轮询
- [x] 3.5 为登录 hooks 与登录弹窗补测试，覆盖发起登录、轮询启用、关闭停止
- [x] 3.6 运行 `pnpm test:run`、`pnpm exec tsc --noEmit`、`pnpm lint` 确认通过，提交本阶段代码

## 4. CLI OAuth 上游创建入口

- [x] 4.1 在 `use-cliproxy.ts` 新增创建池上游与创建单账号映射上游的 hooks
- [x] 4.2 在实例行操作菜单新增按服务商一键创建池上游入口，经确认弹窗执行
- [x] 4.3 在账号行操作菜单新增将账号映射为上游入口，经确认弹窗执行
- [x] 4.4 为上游创建 hooks 与创建入口补测试
- [x] 4.5 运行 `pnpm test:run`、`pnpm exec tsc --noEmit`、`pnpm lint` 确认通过，提交本阶段代码

## 5. 国际化补齐与收尾验证

- [x] 5.1 复核 `cliproxy` 与 `nav` 命名空间中英文文案完整，无遗漏键与硬编码字符串
- [x] 5.2 复核页面加载态、空态、错误态处理与既有页面一致
- [x] 5.3 运行 `pnpm format:check`、`pnpm test:run` 复核全部测试通过
- [x] 5.4 使用 `openspec validate cliproxy-admin-ui` 校验本变更工件完整，提交收尾改动
