# Tasks: Migrate to Next.js Fullstack Architecture

## Phase 1: Project Structure Migration

- [ ] 1.1 创建新的项目根目录结构
  - 将 `apps/web/src/` 内容移动到 `src/`
  - 移动配置文件到根目录 (next.config.ts, tsconfig.json, etc.)
  - 更新 package.json 和依赖

- [ ] 1.2 清理 Monorepo 配置
  - 移除 `pnpm-workspace.yaml`
  - 移除根目录的 workspace 相关配置
  - 更新 .gitignore

- [ ] 1.3 验证前端功能
  - 确保所有页面正常加载
  - 确保 i18n 正常工作
  - 运行 lint 和 type check

## Phase 2: Database Layer Migration

- [ ] 2.1 安装和配置 Drizzle ORM
  - 添加 drizzle-orm, drizzle-kit, postgres 依赖
  - 创建 drizzle.config.ts
  - 配置 DATABASE_URL 环境变量

- [ ] 2.2 创建数据库 Schema
  - 迁移 api_keys 表定义到 `src/lib/db/schema.ts`
  - 迁移 upstreams 表定义
  - 迁移 api_key_upstreams 关联表
  - 迁移 request_logs 表定义

- [ ] 2.3 创建数据库客户端
  - 创建 `src/lib/db/index.ts`
  - 配置连接池
  - 实现优雅关闭

- [ ] 2.4 生成和测试迁移
  - 运行 `drizzle-kit generate`
  - 运行 `drizzle-kit migrate`
  - 验证表结构正确

## Phase 3: Core Utils Migration

- [ ] 3.1 迁移配置管理
  - 创建 `src/lib/utils/config.ts`
  - 使用 env 变量替代 pydantic-settings
  - 添加 Zod schema 验证

- [ ] 3.2 迁移加密工具
  - 创建 `src/lib/utils/encryption.ts`
  - 实现 Fernet 兼容的加密/解密
  - 添加单元测试验证兼容性

- [ ] 3.3 迁移认证逻辑
  - 创建 `src/lib/utils/auth.ts`
  - 实现 Admin Token 验证
  - 实现 API Key 验证 (bcrypt)

## Phase 4: Services Migration

- [ ] 4.1 迁移 Key Manager 服务
  - 创建 `src/lib/services/key-manager.ts`
  - 实现 API Key CRUD 操作
  - 实现密钥哈希和验证
  - 添加单元测试

- [ ] 4.2 迁移 Upstream Service
  - 创建 `src/lib/services/upstream-service.ts`
  - 实现 Upstream CRUD 操作
  - 实现加密存储 API Key
  - 添加单元测试

- [ ] 4.3 迁移 Request Logger
  - 创建 `src/lib/services/request-logger.ts`
  - 实现请求日志记录
  - 实现 token 用量提取
  - 添加单元测试

- [ ] 4.4 迁移 Stats Service
  - 创建 `src/lib/services/stats-service.ts`
  - 迁移统计聚合 SQL 查询
  - 实现仪表盘数据接口
  - 添加单元测试

- [ ] 4.5 迁移 Proxy Client (核心)
  - 创建 `src/lib/services/proxy-client.ts`
  - 实现 HTTP 请求转发
  - 实现 SSE 流式传输
  - 实现请求头过滤和注入
  - 添加单元测试

## Phase 5: API Routes Migration

- [ ] 5.1 创建 Health API
  - 创建 `src/app/api/health/route.ts`
  - 实现健康检查端点
  - 验证响应格式

- [ ] 5.2 创建 Admin Keys API
  - 创建 `src/app/api/admin/keys/route.ts`
  - 实现 GET (列表), POST (创建)
  - 创建 `src/app/api/admin/keys/[id]/route.ts`
  - 实现 GET (详情), DELETE (撤销)
  - 添加 Admin Token 认证中间件

- [ ] 5.3 创建 Admin Upstreams API
  - 创建 `src/app/api/admin/upstreams/route.ts`
  - 实现 GET (列表), POST (创建)
  - 创建 `src/app/api/admin/upstreams/[id]/route.ts`
  - 实现 GET (详情), PUT (更新), DELETE (删除)
  - 添加 Admin Token 认证中间件

- [ ] 5.4 创建 Admin Stats API
  - 创建 `src/app/api/admin/stats/route.ts`
  - 实现统计数据接口
  - 创建 `src/app/api/admin/logs/route.ts`
  - 实现请求日志查询接口

- [ ] 5.5 创建 Proxy API (核心)
  - 创建 `src/app/api/proxy/v1/[...path]/route.ts`
  - 实现 API Key 认证
  - 实现 Upstream 选择逻辑
  - 实现请求转发和 SSE 流式响应
  - 实现请求日志记录
  - 验证流式传输正常工作

## Phase 6: Frontend Adaptation

- [ ] 6.1 更新 API 客户端
  - 更新 `src/lib/api.ts` 中的 API 路径
  - 从 `/admin/*` 改为 `/api/admin/*`
  - 添加错误处理

- [ ] 6.2 更新 React Hooks
  - 更新 hooks 中的 API 调用路径
  - 验证数据获取正常

- [ ] 6.3 验证所有页面功能
  - 验证 Dashboard 页面
  - 验证 Keys 管理页面
  - 验证 Upstreams 管理页面
  - 验证 Logs 页面

## Phase 7: Docker Deployment

- [ ] 7.1 创建 Dockerfile
  - 基于 Node.js 22 slim
  - 使用 standalone 输出
  - 优化镜像大小

- [ ] 7.2 创建 docker-compose.yaml
  - 配置 app 服务
  - 配置 PostgreSQL 服务
  - 配置健康检查
  - 配置数据卷

- [ ] 7.3 验证 Docker 部署
  - 构建镜像
  - 运行 docker compose up
  - 验证所有功能正常

## Phase 8: Testing & Validation

- [ ] 8.1 迁移现有测试
  - 将 pytest 测试转换为 Vitest
  - 确保核心功能测试覆盖

- [ ] 8.2 SSE 流式传输验证
  - 使用 curl 测试流式响应
  - 验证 token 正确传输
  - 验证长时间连接稳定性

- [ ] 8.3 端到端功能验证
  - 验证完整的代理流程
  - 验证管理面板所有功能
  - 验证统计数据准确性

## Phase 9: Cleanup & Documentation

- [ ] 9.1 清理旧代码
  - 删除 `apps/api/` 目录
  - 删除旧的 Python 相关配置
  - 更新 .gitignore

- [ ] 9.2 更新项目文档
  - 更新 README.md
  - 更新 CLAUDE.md
  - 更新 openspec/project.md
  - 创建数据迁移指南

- [ ] 9.3 更新环境变量文档
  - 更新 .env.example
  - 记录所有必需的环境变量

## Verification Checklist

- [ ] 所有管理面板页面正常工作
- [ ] API Key 创建、列表、撤销正常
- [ ] Upstream 创建、更新、删除正常
- [ ] 代理请求正常转发
- [ ] SSE 流式传输正常
- [ ] 统计数据正确显示
- [ ] Docker 一键部署成功
- [ ] 所有测试通过
- [ ] 文档更新完成
