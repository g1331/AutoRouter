## 1. 数据模型与迁移

- [x] 1.1 在 `src/lib/db/schema-pg.ts` 与 `src/lib/db/schema-sqlite.ts` 新增计费相关表结构（价格目录、手动覆盖、请求计费快照）与 upstream 倍率字段/配置结构
- [x] 1.2 在 `src/lib/db/schema.ts` 导出新增 schema 与类型，补齐 relations 与类型别名
- [x] 1.3 生成并校验 Drizzle 迁移文件，确认 PostgreSQL 与 SQLite 结构都可落地

## 2. 价格目录与费用计算服务

- [x] 2.1 新增价格同步服务（OpenRouter 主源、LiteLLM 兜底）并实现统一价格归一化
- [x] 2.2 新增手动价格覆盖服务（创建、更新、查询、删除）并实现优先级解析（override > synced）
- [x] 2.3 新增请求费用计算服务，输入 token 用量与 upstream 倍率，输出可持久化的费用快照
- [x] 2.4 为价格解析与费用计算补充单元测试（含无价格、无模型、流式请求等边界）

## 3. 代理链路计费集成

- [x] 3.1 在 `src/app/api/proxy/v1/[...path]/route.ts` 请求完成路径集成计费快照写入（stream / non-stream / error 分支）
- [x] 3.2 在 `src/lib/services/request-logger.ts` 扩展接口与查询结果，关联返回计费状态与快照字段
- [x] 3.3 确保计费失败不阻断主请求，失败时写入“未计费原因”用于后续修复
- [x] 3.4 为代理计费集成补充回归测试，覆盖成功与未计费两类场景

## 4. Billing 管理 API

- [x] 4.1 新增 Billing 概览接口（今日费用、本月费用、未定价模型数、同步状态）
- [x] 4.2 新增价格目录接口（同步触发、未定价模型列表、手动覆盖 CRUD）
- [x] 4.3 新增 upstream 倍率查询与更新接口（含输入校验与错误返回）
- [x] 4.4 在 `src/lib/utils/api-transformers.ts` 与相关 route 中补齐 snake_case 响应转换

## 5. 前端数据层与国际化

- [x] 5.1 在 `src/types/api.ts` 新增 Billing 页面与 API 所需类型定义
- [x] 5.2 新增 `src/hooks/use-billing.ts`（或等价拆分 hooks），实现查询与 mutation 的缓存失效策略
- [x] 5.3 在 `src/messages/en.json` 与 `src/messages/zh-CN.json` 新增 Billing 文案键，覆盖空状态、错误态、表头与操作提示

## 6. Billing 页面与入口集成

- [x] 6.1 新增 `src/app/[locale]/(dashboard)/system/billing/page.tsx`，实现概览卡片区
- [x] 6.2 实现 upstream 倍率管理表格（行内编辑、保存反馈、输入校验）
- [x] 6.3 实现未定价模型修复区（手动录入价格、同步按钮、状态反馈）
- [x] 6.4 实现近期计费明细表（含未计费高亮与原因展示）并处理 loading/empty/error 三态
- [x] 6.5 更新 `src/components/admin/sidebar.tsx` 与 `src/app/[locale]/(dashboard)/settings/page.tsx`，加入 Billing 导航入口

## 7. 分段提交与质量门禁

- [x] 7.1 完成第 1-2 组后执行 `pnpm exec tsc --noEmit` 与相关单测，通过后做第一个提交
- [x] 7.2 完成第 3-4 组后执行后端回归测试与 API 自检，通过后做第二个提交
- [x] 7.3 完成第 5-6 组后执行 `pnpm lint`、`pnpm test:run`、`pnpm build`，全部通过后做最终提交
