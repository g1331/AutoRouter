## 1. 配置契约与安全边界

- [x] 1.1 定义 CLIProxyAPI 连接、账号、模型、登录状态、代理测试和上游预设类型，并同步 `src/types/api.ts` 与内部服务类型
- [x] 1.2 设计 CLIProxyAPI 全局连接配置的持久化方式，明确外部服务模式与受管 sidecar 模式字段
- [x] 1.3 接入 Fernet 加密保存 client API key 与 management secret，并确保 API 响应只返回掩码或存在状态
- [x] 1.4 补充配置解析与密钥加解密测试，覆盖缺失配置、错误密钥、掩码展示和未配置时的兼容行为

## 2. CLIProxyAPI 服务层

- [x] 2.1 新增 CLIProxyAPI management API 客户端，统一处理 base URL、management secret、认证头、超时和错误转换
- [x] 2.2 实现账号列表、账号模型列表、账号状态更新、账号字段更新、登录 URL 获取和登录状态轮询方法
- [x] 2.3 实现 proxy endpoint、management endpoint 和出站代理配置的连通性测试方法，并复用现有 SSRF 与超时约束
- [x] 2.4 补充 CLIProxyAPI 服务层单元测试，覆盖成功响应、鉴权失败、网络失败、超时和不支持代理测试的返回

## 3. 管理 API

- [x] 3.1 新增 `/api/admin/cliproxyapi/config` 读取与保存接口，支持外部服务模式配置和敏感字段掩码返回
- [x] 3.2 新增 `/api/admin/cliproxyapi/status` 与连接测试接口，分别验证 proxy、management 和出站代理语义
- [x] 3.3 新增 `/api/admin/cliproxyapi/auth-files`、模型列表、账号状态更新和账号字段更新接口
- [x] 3.4 新增 Codex、Claude、Gemini OAuth 登录 URL 与登录状态轮询接口
- [x] 3.5 为新增管理 API 补充 route 测试，覆盖 admin 鉴权、参数校验、外部服务错误和敏感信息脱敏

## 4. 上游预设与代理接入

- [x] 4.1 定义 Codex OAuth、Claude OAuth、Gemini OAuth 池上游预设，输出 base URL、route capabilities、模型发现配置和默认名称
- [x] 4.2 扩展上游创建与更新契约，保存 CLIProxyAPI 上游级元数据，包括 connection id、provider、账号 prefix 和池模式
- [x] 4.3 支持从 CLIProxyAPI 单账号生成固定账号上游初始值，并创建对应模型规则初始值
- [x] 4.4 确认代理主流程继续按能力过滤、授权过滤、模型规则、负载选择、日志和计费执行，补充必要回归测试
- [x] 4.5 补充上游 CRUD、模型规则和连接测试回归，覆盖 CLIProxyAPI 池上游、固定账号上游和未配置 CPA 的普通上游

## 5. 管理端界面

- [x] 5.1 新增 CLI OAuth 管理入口，展示 CLIProxyAPI 服务连接、management 状态、出站代理和最近测试结果
- [x] 5.2 实现 OAuth 账号列表，展示 provider、账号名称、启用状态、模型数量、冷却或错误状态和可用操作
- [x] 5.3 实现 Codex、Claude、Gemini OAuth 登录入口，展示授权 URL、device code、过期时间和轮询状态
- [x] 5.4 在上游创建弹窗加入 CLI OAuth 上游预设入口，允许保存前修改预填配置
- [x] 5.5 支持从账号列表打开固定账号上游创建流程，并回显账号 prefix 与模型规则初始值
- [x] 5.6 补齐中英文文案、加载态、空态、失败态、选择反馈和移动端线性布局
- [x] 5.7 补充组件和 hooks 测试，覆盖连接配置、账号列表、OAuth 登录状态、预设填充和固定账号创建

## 6. 部署与本地测试

- [ ] 6.1 更新 `.env.example`，补充 CLIProxyAPI 外部服务、management secret、client API key、出站代理和 sidecar 相关配置说明
- [ ] 6.2 更新 Docker Compose 模板，加入可选 CLIProxyAPI sidecar、auth-dir 持久化、config 持久化和必要 OAuth 回调端口说明
- [ ] 6.3 更新本地测试说明，覆盖外部 CLIProxyAPI 启动、连接测试、OAuth 登录、池上游请求和固定账号路由验证
- [ ] 6.4 确认发布与个人部署流程在未启用 CLIProxyAPI 时保持原部署行为

## 7. 质量门禁与提交节点

- [ ] 7.1 每个阶段完成后运行相关单元测试或组件测试，并在同一提交中更新对应任务勾选状态
- [ ] 7.2 完成后运行 `pnpm exec tsc --noEmit`、`pnpm test:run` 和 `pnpm build`
- [ ] 7.3 运行 `openspec validate add-cliproxyapi-integration --strict`，确认 proposal、design、specs 和 tasks 均可归档
- [ ] 7.4 检查 `git diff`，确认无乱码、无敏感信息明文、无无关格式化改动
