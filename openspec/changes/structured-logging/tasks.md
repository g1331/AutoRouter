## 1. 基础设施搭建

- [ ] 1.1 安装 `pino` 依赖和 `pino-pretty`（devDependency）
- [ ] 1.2 创建 `src/lib/utils/logger.ts`：导出根 logger 实例和 `createLogger(name)` 工厂函数，复用 `config.ts` 中的 `LOG_LEVEL`，开发环境使用 pino-pretty transport
- [ ] 1.3 为 logger 模块编写单元测试

## 2. 服务层替换

- [ ] 2.1 替换 `src/lib/services/proxy-client.ts` 中的 `console.warn` 为 `logger.debug`（带 requestId child logger）
- [ ] 2.2 替换 `src/lib/services/key-manager.ts` 中的 `console.warn` 为 `logger.info`（审计事件）
- [ ] 2.3 替换 `src/lib/services/health-checker.ts` 中的 `console.error/warn` 为对应级别 logger
- [ ] 2.4 替换 `src/lib/services/upstream-connection-tester.ts` 中的 `console.*` 为 logger
- [ ] 2.5 替换 `src/lib/services/upstream-crud.ts` 中的 `console.*` 为 logger
- [ ] 2.6 替换 `src/lib/utils/encryption.ts` 中的 `console.*` 为 logger

## 3. 代理路由替换

- [ ] 3.1 替换 `src/app/api/proxy/v1/[...path]/route.ts` 中的 `console.*` 为 logger（使用 child logger 传播 requestId）

## 4. Admin API 路由替换

- [ ] 4.1 替换 `src/app/api/admin/keys/route.ts` 和 `src/app/api/admin/keys/[id]/route.ts` 中的 `console.error`
- [ ] 4.2 替换 `src/app/api/admin/keys/[id]/reveal/route.ts` 中的 `console.error`
- [ ] 4.3 替换 `src/app/api/admin/upstreams/route.ts`、`src/app/api/admin/upstreams/[id]/route.ts` 中的 `console.error`
- [ ] 4.4 替换 `src/app/api/admin/upstreams/test/route.ts`、`src/app/api/admin/upstreams/[id]/test/route.ts` 中的 `console.error`
- [ ] 4.5 替换 `src/app/api/admin/upstreams/health/route.ts` 中的 `console.error`
- [ ] 4.6 替换 `src/app/api/admin/circuit-breakers/route.ts`、`[id]/route.ts`、`[id]/force-open/route.ts`、`[id]/force-close/route.ts` 中的 `console.error`
- [ ] 4.7 替换 `src/app/api/admin/stats/route.ts`、`overview/route.ts`、`timeseries/route.ts`、`leaderboard/route.ts` 中的 `console.error`
- [ ] 4.8 替换 `src/app/api/admin/logs/route.ts`、`src/app/api/admin/health/route.ts` 中的 `console.error`

## 5. 验证与收尾

- [ ] 5.1 全量搜索确认 `src/` 下无残留 `console.(log|warn|error|info|debug)` 调用
- [ ] 5.2 运行 `pnpm lint` 和 `pnpm exec tsc --noEmit` 确保无类型和 lint 错误
- [ ] 5.3 运行 `pnpm test:run` 确保所有测试通过
- [ ] 5.4 更新 `.env.example`（如有）添加 `LOG_LEVEL` 说明
