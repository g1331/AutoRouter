## 1. 管理 API 客户端扩展

- [x] 1.1 在 `cliproxy-management-client.ts` 中扩展 `CLIPROXY_OAUTH_PROVIDERS` 和 `AUTH_URL_ENDPOINT`，新增 xAI、Antigravity、Kimi 三个 Provider；同步更新前端 `src/types/cliproxy.ts` 中的 `CliproxyProvider` 类型和 `CLIPROXY_PROVIDERS` 常量；编写对应的单元测试验证 `isCliproxyOAuthProvider` 对新 Provider 的识别
- [x] 1.2 在 `cliproxy-management-client.ts` 中新增 `deleteAuthFile`、`uploadAuthFile`、`downloadAuthFile` 三个方法；编写单元测试覆盖成功、鉴权失败、超时三种情况
- [x] 1.3 在 `cliproxy-management-client.ts` 中新增 `submitOAuthCallback` 方法；编写单元测试
- [x] 1.4 在 `cliproxy-management-client.ts` 中新增 `getLogs` 方法（支持可选 `since` 参数）；编写单元测试

## 2. 后端服务层扩展

- [x] 2.1 在 `cliproxy-auth-account-service.ts` 中新增 `deleteCliproxyAuthAccount`、`uploadCliproxyAuthFile`、`downloadCliproxyAuthFile`、`listCliproxyAccountModels` 服务方法；新增 `cliproxy-instance-logs-service.ts` 与 `cliproxy-linked-upstreams-service.ts` 两个独立服务；编写单元测试覆盖删除成功/失败/无缓存、上传后同步、下载、模型查询、日志获取、关联上游分类等场景
- [x] 2.2 在 `cliproxy-oauth-login-service.ts` 中新增 `submitCliproxyOAuthCallback`；OAuth Provider 通过 `isCliproxyOAuthProvider` 已自动覆盖新增的 xAI/Antigravity/Kimi，无需单独改动 Error 类型

## 3. Admin API 路由

- [ ] 3.1 新增 `instances/[id]/auth-files/route.ts`（POST: 上传认证文件，上传后触发同步并返回同步结果）；编写路由测试
- [ ] 3.2 新增 `instances/[id]/auth-files/[name]/route.ts`（GET: 下载认证文件，DELETE: 删除认证文件）；编写路由测试
- [ ] 3.3 新增 `instances/[id]/oauth-callback/route.ts`（POST: 提交回调 URL，成功后触发同步）；编写路由测试
- [ ] 3.4 新增 `instances/[id]/logs/route.ts`（GET: 查询实例日志，支持 `since` 查询参数）；编写路由测试
- [ ] 3.5 新增 `instances/[id]/linked-upstreams/route.ts`（GET: 查询关联上游列表）；编写路由测试
- [ ] 3.6 新增 `instances/[id]/auth-accounts/[accountName]/models/route.ts`（GET: 查询账号模型列表）；编写路由测试

## 4. 前端 hooks 与类型

- [ ] 4.1 在 `use-cliproxy.ts` 中新增 `useUploadCliproxyAuthFile`、`useDownloadCliproxyAuthFile`、`useDeleteCliproxyAuthFile` 三个 mutation hooks
- [ ] 4.2 在 `use-cliproxy.ts` 中新增 `useCliproxyAccountModels` query hook（按账号名查询模型列表）
- [ ] 4.3 在 `use-cliproxy.ts` 中新增 `useSubmitCliproxyOAuthCallback` mutation hook
- [ ] 4.4 在 `use-cliproxy.ts` 中新增 `useCliproxyInstanceLogs` query hook（支持 `since` 参数）和 `useCliproxyLinkedUpstreams` query hook
- [ ] 4.5 在 `use-cliproxy.ts` 中新增 `useToggleCliproxyInstanceEnabled` mutation hook（调用实例更新 API 仅修改 enabled 字段）
- [ ] 4.6 在 `src/types/cliproxy.ts` 中新增 `CliproxyAuthFileModel`、`CliproxyLogEntry`、`CliproxyLinkedUpstream` 等类型定义

## 5. 前端组件：实例表格增强与关联上游

- [ ] 5.1 修改 `cliproxy-instances-table.tsx`，将状态列的 Badge 替换为 Switch 组件，实现行内启停切换；编写组件测试
- [ ] 5.2 新增 `cliproxy-linked-upstreams-panel.tsx`，展示关联上游列表（上游名称、服务商、类型、绑定账号）；在 `page.tsx` 中挂载该面板，选中实例后显示
- [ ] 5.3 编写 `cliproxy-linked-upstreams-panel` 组件测试

## 6. 前端组件：账号管理增强

- [ ] 6.1 新增 `cliproxy-account-models-dialog.tsx`，弹窗展示账号可用模型列表（模型 ID、显示名称）；在 `cliproxy-accounts-table.tsx` 的模型数量列添加可点击入口
- [ ] 6.2 新增 `cliproxy-account-detail-dialog.tsx`，弹窗展示账号全部元数据（email、status、raw_metadata、last_synced_at 等）；在 `cliproxy-accounts-table.tsx` 行菜单中添加"详情"操作
- [ ] 6.3 修改 `cliproxy-accounts-table.tsx`，新增 email 列展示；在行菜单中新增"删除"和"详情"操作入口
- [ ] 6.4 编写 `cliproxy-account-models-dialog` 和 `cliproxy-account-detail-dialog` 组件测试

## 7. 前端组件：认证文件操作

- [ ] 7.1 新增 `cliproxy-auth-file-upload-dialog.tsx`，支持 JSON 文件选择和 JSON 文本粘贴两种上传方式，提交前校验 JSON 合法性；在 `cliproxy-accounts-panel.tsx` 中添加上传按钮
- [ ] 7.2 新增 `cliproxy-delete-auth-file-dialog.tsx`，确认弹窗删除认证文件；下载功能直接在行菜单触发浏览器下载
- [ ] 7.3 编写上传弹窗和删除弹窗的组件测试

## 8. 前端组件：OAuth 回调与 Provider 扩展

- [ ] 8.1 修改 `cliproxy-oauth-login-dialog.tsx`，将 Provider 选择器从 3 项扩展到 6 项；在登录超时/失败状态区域增加手动回调 URL 输入框和提交按钮
- [ ] 8.2 编写 OAuth 登录弹窗的 Provider 扩展和回调提交的组件测试

## 9. 前端组件：日志面板

- [ ] 9.1 新增 `cliproxy-instance-logs-panel.tsx`，包含刷新按钮、关键词搜索输入框、等宽字体日志显示区域；在 `page.tsx` 中挂载该面板，选中实例后显示
- [ ] 9.2 编写日志面板组件测试

## 10. 国际化

- [ ] 10.1 在 `en.json` 和 `zh-CN.json` 的 `cliproxy` 命名空间中补充所有新增功能的国际化文案，覆盖新 Provider 名称、认证文件操作、日志面板、关联上游面板、账号详情、账号模型、OAuth 回调等全部新增 UI 文案

## 11. 集成验证

- [ ] 11.1 运行 `pnpm lint` 和 `pnpm exec tsc --noEmit` 确保代码质量
- [ ] 11.2 运行 `pnpm test:run` 确保全部测试通过
- [ ] 11.3 启动开发服务器，在浏览器中验证所有新增功能的完整交互流程
