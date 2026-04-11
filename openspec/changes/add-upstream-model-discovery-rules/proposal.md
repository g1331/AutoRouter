## Why

当前 AutoRouter 的上游模型支持仍以 `allowed_models` 与 `model_redirects` 的静态配置为主。管理员无法从上游真实接口持续发现模型目录，也无法用正则和人工别名表达企业自定义模型命名，导致模型维护成本高且运行时白名单语义不够明确。

## What Changes

- 新增上游模型发现能力，允许为每个上游配置发现方式、发现端点与兼容模式，并持久化最近一次抓取结果、抓取时间、成功状态与失败原因。
- 新增上游模型目录缓存与管理端浏览能力，支持管理员查看发现结果并将选中的模型一键导入当前上游的显式允许规则。
- 新增模型允许规则表达层，支持精确模型名、正则模式与人工自定义别名，并保留来源信息以区分手工录入、上游发现与 LiteLLM 推断候选。
- 新增 LiteLLM 目录回退策略：当原生发现失败时，可按当前上游类型加载 LiteLLM 候选目录，但必须明确标记其为推断结果而非上游真实返回值。
- 修改运行时模型约束语义：当上游显式配置了模型允许规则且请求模型未命中精确规则或正则规则时，该上游不得再被静默视为可用候选。
- 修改上游管理工作台，使其能够展示发现状态、目录来源、导入操作与模型规则摘要，而不是只暴露静态文本输入。

## Capabilities

### New Capabilities
- `upstream-model-discovery`: 上游模型目录的发现、抓取缓存、来源标记、抓取状态记录与管理端浏览导入能力。
- `upstream-model-allow-rules`: 上游模型允许规则的统一表达，包括精确模型名、正则模式、人工别名、LiteLLM 推断来源标记，以及这些规则在运行时的候选过滤语义。

### Modified Capabilities
- `upstream-operations-workbench`: 上游管理工作台需要新增模型发现状态、目录浏览与导入入口，并展示模型规则摘要。
- `upstream-route-capabilities`: 上游在完成路径能力匹配后，需要继续结合显式模型允许规则决定候选集，不再将未命中的显式白名单上游静默保留为可用候选。

## Impact

- 受影响后端：`src/app/api/admin/upstreams/route.ts`、`src/app/api/admin/upstreams/[id]/route.ts`、`src/app/api/admin/upstreams/test/route.ts`、`src/app/api/admin/upstreams/[id]/test/route.ts`、`src/app/api/proxy/v1/[...path]/route.ts`、`src/lib/services/upstream-crud.ts`、`src/lib/services/model-router.ts`、`src/lib/services/load-balancer.ts`、`src/lib/services/upstream-connection-tester.ts`。
- 受影响前端：`src/app/[locale]/(dashboard)/upstreams/page.tsx`、`src/components/admin/upstream-form-dialog.tsx`、`src/components/admin/upstreams-table.tsx`、`src/hooks/use-upstreams.ts`。
- 受影响类型与数据模型：`src/types/api.ts`、`src/lib/utils/api-transformers.ts`、`src/lib/db/schema-pg.ts`、`src/lib/db/schema-sqlite.ts`，并可能需要新增目录缓存与规则结构相关迁移。
- 受影响测试：上游 CRUD、模型路由、代理路由、上游表单与工作台交互测试需要补充模型发现、规则导入和严格候选过滤场景。
