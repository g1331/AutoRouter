# Tasks: 成员上游可见性开关

## 1. 设置存储与管理端入口

- [ ] 1.1 在 PG 与 SQLite schema 中新增 `portal_settings` 单例表并生成双方言迁移，实现 `portal-settings-service`（读取即建默认行、更新、切换到隐藏时全量重对齐成员密钥），补服务测试。
- [ ] 1.2 新增 `GET/PATCH /api/admin/portal-settings` 路由（requireAdmin + zod），补路由测试；运行迁移一致性校验，通过后提交。

## 2. 成员侧隐藏行为

- [ ] 2.1 `GET /api/user/upstreams` 返回 `upstreams_visible` 标志，隐藏时不出上游选项；成员密钥创建/更新在隐藏模式下忽略 `upstream_ids` 并自动绑定授权全集（空授权集拒绝创建），密钥响应置空 `upstream_ids`；`setUserUpstreams` 在隐藏模式下重同步该用户密钥；补服务与路由测试。
- [ ] 2.2 `GET /api/user/logs` 在隐藏模式下抹除上游身份字段，补路由测试；运行本阶段相关测试，通过后提交。

## 3. 前端与文案

- [ ] 3.1 门户密钥对话框按 `upstreams_visible` 隐藏上游选择区并调整表单校验与提交载荷，密钥表格空上游集显示“自动路由”；设置页新增内联开关与 hooks；补中英文文案与组件测试；E2E 页面级 mock 补新端点桩。
- [ ] 3.2 运行前端组件测试、lint、format、tsc 与本地 E2E，通过后提交。

## 4. 整体验证与交接

- [ ] 4.1 运行相关 Vitest、迁移一致性、lint、format check、tsc；复核 OpenSpec 规格与实现一致性，提交并推送分支、创建 draft PR。
