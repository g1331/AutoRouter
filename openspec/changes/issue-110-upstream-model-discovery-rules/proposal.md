## Why

当前 `master` 中的上游模型控制仍停留在 `allowed_models` 与 `model_redirects` 两组静态配置。管理端无法从上游接口读取真实模型目录，无法把目录结果导入配置，也无法表达正则规则与显式别名规则。与此同时，代理入口在显式白名单未命中时仍可能回退到首个健康上游，这与 issue 110 希望建立的严格约束语义存在偏差。

当前仓库已经进入“路径能力优先”的路由架构，这项需求需要以现有能力路由和上游管理界面为基础定义契约，避免引入另一套 `provider_type` 驱动结构。issue 110 仍处于进行中状态，因此需要把模型发现、模型规则表达和管理端导入能力整理为可实现、可验证的契约。

## What Changes

- 新增上游模型发现配置，支持 OpenAI 兼容、Anthropic 原生、Gemini 原生、Gemini OpenAI 兼容以及自定义发现地址。
- 新增上游模型目录缓存，记录目录条目、来源、最近刷新时间、最近状态、最近错误与最近失败时间。
- 新增统一的上游模型规则结构，支持精确模型名、正则模式和人工别名，并兼容现有 `allowed_models` 与 `model_redirects` 的历史数据。
- 在代理入口把候选过滤顺序扩展为“路径能力命中 → API Key 授权 → 模型规则匹配 → 可用性选择”，使显式模型规则真正成为约束条件。
- 在管理端上游编辑界面加入模型发现与模型规则工作区，支持刷新目录、浏览来源、选择条目导入和人工补充规则。
- 调整上游测试与发现地址的解析方式，保留已配置 `base_url` 中的 API 根路径前缀，避免 `/codex/v1` 之类的兼容接口被错误截断。
- 在原生发现失败时支持 LiteLLM 目录作为辅助候选，并明确标记其来源属于推断目录而非上游真实返回。

## Capabilities

### New Capabilities
- `upstream-model-discovery`: 上游模型目录发现、缓存、刷新状态和来源标记。
- `upstream-model-allow-rules`: 上游模型规则表达、历史配置兼容和代理入口严格匹配语义。

### Modified Capabilities
- `upstream-operations-workbench`: 上游管理界面需要展示模型发现状态、目录导入动作和模型规则编辑区域。
- `path-based-routing`: 路径能力选路后的候选集合需要继续经过模型规则匹配，显式规则未命中时不得进入可用性选择。
- `upstream-endpoint-experience`: 上游测试与模型发现需要保留 API 根路径前缀，并在配置界面提供与实际请求一致的地址语义。

## Impact

- 受影响后端：`src/app/api/proxy/v1/[...path]/route.ts`、`src/lib/services/upstream-connection-tester.ts`、`src/lib/services/upstream-crud.ts`、新增模型发现与模型规则服务模块。
- 受影响数据模型：`upstreams` 表需要新增模型发现配置、模型目录缓存、最近刷新状态与模型规则字段，PostgreSQL 与 SQLite schema 需要同步更新。
- 受影响 API：admin upstream 创建、更新、读取接口需要扩展请求和响应契约；需要新增目录刷新与目录导入接口。
- 受影响前端：`src/components/admin/upstream-form-dialog.tsx`、上游列表与相关 hooks 需要加入模型发现和规则编辑能力。
- 受影响测试：上游 CRUD、代理入口、连接测试、管理端表单、API transformer 与新增服务模块都需要补齐回归测试。
