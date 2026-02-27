## 1. 数据库迁移

- [x] 1.1 在 `src/lib/db/schema.ts` 中新增 `compensation_rules` 表定义（id、name、is_builtin、enabled、capabilities、target_header、sources、mode、created_at、updated_at）
- [x] 1.2 在 `src/lib/db/schema.ts` 中为 `request_logs` 表新增 `session_id_compensated`（boolean, default false）和 `header_diff`（jsonb/text nullable）字段
- [x] 1.3 执行 `pnpm db:generate` 生成迁移文件，检查生成内容正确性
- [x] 1.4 在迁移文件中添加内置 "Session ID Recovery" 规则的 seed 语句

## 2. 后端核心：session-affinity 改造

- [x] 2.1 修改 `src/lib/services/session-affinity.ts` 中 `extractSessionId()` 的返回类型为 `{ sessionId: string | null; source: "header" | "body" | null }`
- [x] 2.2 更新 `extractSessionId()` 内部逻辑，在从头部提取时返回 `source: "header"`，从请求体提取时返回 `source: "body"`
- [x] 2.3 同步更新所有调用 `extractSessionId()` 的代码，适配新返回结构
- [x] 2.4 为 `extractSessionId()` 的新返回结构编写单元测试（覆盖 header/body/null 三种来源场景）

## 3. 后端核心：proxy-client 改造

- [x] 3.1 在 `src/lib/services/proxy-client.ts` 中新增 `HeaderDiff` 类型定义（inbound_count、outbound_count、dropped、auth_replaced、compensated）
- [x] 3.2 新增 `CompensationHeader` 类型定义（header、value、source）
- [x] 3.3 修改 `forwardRequest()` 函数签名，新增可选参数 `compensationHeaders?: CompensationHeader[]`
- [x] 3.4 在 `forwardRequest()` 中实现 `missing_only` 模式的头部注入逻辑
- [x] 3.5 将 `cf-ew-via` 加入 `INFRASTRUCTURE_REQUEST_HEADERS` 过滤集合
- [x] 3.6 修改 `forwardRequest()` 返回值，在 `ProxyResult` 中新增 `headerDiff?: HeaderDiff` 字段
- [x] 3.7 为头部注入逻辑和 `cf-ew-via` 过滤编写单元测试

## 4. 后端核心：compensation-service 新增

- [x] 4.1 新建 `src/lib/services/compensation-service.ts`，实现规则从数据库加载及 60 秒内存缓存逻辑
- [x] 4.2 实现 `buildCompensations(capability, headers, body)` 函数，按规则 sources 优先级解析值，返回 `CompensationHeader[]`
- [x] 4.3 实现来源路径解析器，支持 `headers.<name>` 和 `body.<path>`（含嵌套路径）两种格式
- [x] 4.4 实现路径格式校验，非法路径记录警告日志并跳过
- [x] 4.5 为 `buildCompensations()` 编写单元测试（覆盖 header 来源、body 来源、所有来源为空、规则禁用等场景）

## 5. 后端核心：route.ts 集成

- [x] 5.1 在 `src/app/api/proxy/v1/[...path]/route.ts` 中调用 `compensation-service.buildCompensations()`，将结果传入 `forwardWithFailover()`
- [x] 5.2 从 `forwardWithFailover()` 返回值中提取 `headerDiff`，计算 `sessionIdCompensated` 标志
- [x] 5.3 将 `sessionIdCompensated` 和 `headerDiff` 传入 `request-logger` 记录

## 6. 后端核心：request-logger 改造

- [x] 6.1 修改 `src/lib/services/request-logger.ts`，在日志写入时持久化 `session_id_compensated` 和 `header_diff` 字段

## 7. 补偿规则管理 API

- [x] 7.1 新建 `src/app/api/admin/compensation-rules/route.ts`，实现 `GET`（列表）和 `POST`（创建）端点
- [x] 7.2 新建 `src/app/api/admin/compensation-rules/[id]/route.ts`，实现 `PUT`（更新）和 `DELETE`（删除，内置规则返回 403）端点
- [x] 7.3 为管理 API 编写单元测试（覆盖删除内置规则返回 403 的场景）

## 8. 前端：Header Compensation 管理页面

- [ ] 8.1 新建 `src/app/[locale]/(dashboard)/system/header-compensation/page.tsx`，实现规则列表展示
- [ ] 8.2 实现内置规则的启用/禁用开关，隐藏删除按钮
- [ ] 8.3 实现自定义规则的新增、编辑、删除功能（含确认对话框）
- [ ] 8.4 实现规则编辑表单中来源列表的拖拽排序功能
- [ ] 8.5 实现页面底部的能力矩阵表格视图
- [ ] 8.6 新建对应的 TanStack Query hooks（`src/hooks/use-compensation-rules.ts`）

## 9. 前端：侧边栏导航更新

- [ ] 9.1 在侧边栏组件中新增 "System" 顶级导航分组，包含 "Header Compensation" 子项

## 10. 前端：日志可观测性组件

- [ ] 10.1 新建 `src/components/logs/header-diff-panel.tsx`，展示 `header_diff` 结构化数据（入站/出站数量、dropped、auth_replaced、compensated）
- [ ] 10.2 在 `logs-table.tsx` 的展开行中挂载 `header-diff-panel.tsx`，`header_diff` 为 null 时隐藏
- [ ] 10.3 修改 `routing-decision-timeline.tsx` Stage 2，当 `session_id_compensated=true` 时显示 `⚡ 补偿` 徽章及悬停 tooltip

## 11. 国际化

- [ ] 11.1 在 `src/messages/en.json` 中新增 Header Compensation 页面、头部差异面板、补偿徽章相关的所有翻译键
- [ ] 11.2 在 `src/messages/zh.json` 中新增对应的简体中文翻译

## 12. 提交节点

- [x] 12.1 完成任务 1-2 后提交：数据库迁移 + session-affinity 改造
- [ ] 12.2 完成任务 3-6 后提交：补偿引擎核心（proxy-client、compensation-service、route.ts、request-logger）
- [x] 12.3 完成任务 7 后提交：补偿规则管理 API
- [ ] 12.4 完成任务 8-11 后提交：前端页面、组件与国际化
