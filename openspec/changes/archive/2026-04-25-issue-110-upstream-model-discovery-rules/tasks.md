## 1. 数据契约与迁移准备

- [x] 1.1 为 `upstreams` 表新增 `model_discovery`、`model_catalog`、`model_catalog_updated_at`、`model_catalog_last_status`、`model_catalog_last_error`、`model_catalog_last_failed_at`、`model_rules` 字段，并同步更新 PostgreSQL 与 SQLite schema、迁移产物及一致性检查脚本
- [x] 1.2 扩展 `src/types/api.ts`、`src/lib/utils/api-transformers.ts` 和 upstream CRUD 输入输出契约，使新字段可以被创建、更新、读取和回显，同时保留 `allowed_models` 与 `model_redirects` 的兼容语义

## 2. 模型发现与规则服务

- [x] 2.1 新建模型规则服务，完成 `allowed_models` / `model_redirects` 到统一规则视图的规范化、规则解析和严格匹配语义，并补齐对应单元测试
- [x] 2.2 新建模型发现服务，完成发现模式解析、API 根路径保留、自定义地址解析、目录缓存写回和最近刷新状态管理，并补齐对应单元测试
- [x] 2.3 在模型发现服务中加入 LiteLLM 回退逻辑和来源标记，确保 `native` 与 `inferred` 目录条目在缓存与返回值中可区分
- [x] 2.4 实现“从目录导入模型规则”的服务接口，支持将所选目录条目导入为当前上游规则并阻止导入不存在于缓存中的模型

## 3. 代理入口与 Admin API 接入

- [x] 3.1 调整 `upstream-connection-tester` 与相关 Admin test 路由，改为保留 API 根路径并为不同发现模式使用正确的认证方式和目录地址
- [x] 3.2 在 `src/app/api/proxy/v1/[...path]/route.ts` 中接入“授权之后、可用性之前”的模型规则过滤，并把 `model_not_allowed`、别名命中和最终模型解析写入路由诊断信息
- [x] 3.3 新增上游目录刷新接口和目录导入接口，并将它们接入现有 upstream CRUD / service 结构与权限校验

## 4. 管理端模型发现与规则工作区

- [x] 4.1 扩展 `src/hooks/use-upstreams.ts`、`src/lib/api.ts` 和相关请求类型，支持读取新字段以及触发目录刷新、目录导入动作
- [x] 4.2 更新 `src/components/admin/upstream-form-dialog.tsx`，把模型路由区域实现为“顶部紧凑状态条 + 桌面双栏工作区 + 移动端单栏顺序”的单主画布布局，避免出现同权重卡片拼盘
- [x] 4.3 为模型目录工作区补齐加载态、空态、失败态、来源标记、选择反馈和导入主操作，并加入发现地址预览与模式说明
- [x] 4.4 视需要补充上游列表中的轻量目录状态信号，并同步更新中英文文案、组件测试和交互回归测试

## 5. 校验与收尾

- [x] 5.1 补齐并修复相关单元与组件测试，至少覆盖 schema 兼容、目录刷新、LiteLLM 回退、目录导入、严格规则过滤、管理端回显以及加载态/空态/失败态/响应式布局语义
- [x] 5.2 运行 `pnpm test:run`、`pnpm exec tsc --noEmit`、`pnpm lint` 与必要的 SQLite 一致性检查，修复阻塞项后再准备进入实现阶段提交
