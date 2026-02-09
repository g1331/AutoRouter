## 1. Database Schema Extension

- [x] 1.1 编写 schema 字段新增测试
  - 测试新字段存在性验证
  - 测试默认值为 0

- [x] 1.2 更新 `src/lib/db/schema.ts` 添加新字段
  - `cachedTokens: integer("cached_tokens").notNull().default(0)`
  - `reasoningTokens: integer("reasoning_tokens").notNull().default(0)`
  - `cacheCreationTokens: integer("cache_creation_tokens").notNull().default(0)`
  - `cacheReadTokens: integer("cache_read_tokens").notNull().default(0)`

- [x] 1.3 生成并应用数据库迁移
  - 运行 `pnpm db:generate`
  - 运行 `pnpm db:push`（开发环境）

- [x] 1.4 验证迁移
  - 运行 `pnpm lint`
  - 运行 `pnpm exec tsc --noEmit`

## 2. Token Extraction Enhancement

- [x] 2.1 编写 Token 提取测试用例
  - 测试 OpenAI 格式：prompt_tokens_details.cached_tokens
  - 测试 OpenAI 格式：completion_tokens_details.reasoning_tokens
  - 测试 Anthropic 格式：cache_creation_input_tokens
  - 测试 Anthropic 格式：cache_read_input_tokens
  - 测试缺失字段时的默认值处理

- [x] 2.2 更新 `extractTokenUsage()` 函数
  - 添加 OpenAI cached_tokens 提取
  - 添加 OpenAI reasoning_tokens 提取
  - 添加 Anthropic cache_creation_input_tokens 提取
  - 添加 Anthropic cache_read_input_tokens 提取

- [x] 2.3 更新 `LogRequestInput` 接口
  - 添加 cachedTokens、reasoningTokens、cacheCreationTokens、cacheReadTokens

- [x] 2.4 更新 `logRequest()` 函数
  - 保存新增的 Token 字段到数据库

- [x] 2.5 验证 Token 提取
  - 运行 `pnpm test:run tests/unit/services/request-logger.test.ts`

## 3. API Response Extension

- [x] 3.1 编写 API 响应测试
  - 测试响应包含新的 Token 字段

- [x] 3.2 更新 `src/types/api.ts` 类型定义
  - 添加 cached_tokens、reasoning_tokens、cache_creation_tokens、cache_read_tokens

- [x] 3.3 更新 `src/lib/utils/api-transformers.ts`
  - 扩展 transformRequestLogToApi 转换新字段

- [x] 3.4 更新 `RequestLogResponse` 类型
  - 添加新字段到服务层响应类型

- [x] 3.5 验证 API 响应
  - 运行 `pnpm test:run`
  - 运行 `pnpm exec tsc --noEmit`

## 4. Frontend Token Display Enhancement

- [x] 4.1 编写 LogsTable Token 显示测试
  - 测试 Token 列显示标签格式
  - 测试缓存指示器显示
  - 测试 Tooltip 内容

- [x] 4.2 更新 `use-request-logs.ts` hook
  - 添加新 Token 字段到类型

- [x] 4.3 重构 `formatTokens()` 函数
  - 显示带标签的 Token 分解
  - 添加缓存命中指示器

- [x] 4.4 添加 Token Tooltip 组件
  - 创建 `TokenTooltip` 组件
  - 显示完整 Token 明细
  - 隐藏零值字段

- [x] 4.5 更新 i18n 翻译
  - 添加 Token 相关标签到 `en.json` 和 `zh-CN.json`

- [x] 4.6 验证前端组件
  - 运行 `pnpm test:run tests/components/logs-table.test.tsx`
  - 运行 `pnpm lint`

## 5. Auto Refresh Feature

- [x] 5.1 编写自动刷新测试
  - 测试刷新间隔选择
  - 测试 localStorage 持久化
  - 测试手动刷新按钮

- [x] 5.2 创建 RefreshIntervalSelect 组件
  - 下拉选择：关闭/10s/30s/60s
  - 读写 localStorage

- [x] 5.3 更新 `use-request-logs.ts` hook
  - 添加 refetchInterval 参数支持

- [x] 5.4 更新 logs page
  - 集成 RefreshIntervalSelect 组件
  - 添加手动刷新按钮

- [x] 5.5 更新 i18n 翻译
  - 添加刷新相关标签

- [x] 5.6 验证自动刷新功能
  - 运行 `pnpm test:run`
  - 手动测试刷新功能

## 6. Integration & Validation

- [x] 6.1 运行完整测试套件
  - `pnpm test:run`

- [x] 6.2 运行 lint 和类型检查
  - `pnpm lint`
  - `pnpm exec tsc --noEmit`

- [x] 6.3 手动验证
  - 启动开发服务器 `pnpm dev`
  - 发起测试请求验证 Token 记录
  - 验证日志页面显示
  - 验证自动刷新功能

- [x] 6.4 提交代码
  - 确保所有测试通过
  - 创建 PR
