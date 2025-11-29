# Implementation Tasks: API Key Management

## 1. Database Infrastructure

- [ ] 1.1 添加依赖：`cryptography` 用于加密
- [ ] 1.2 创建数据库配置模块 `app/db/base.py`
  - AsyncEngine 配置
  - AsyncSession factory
  - Base declarative model
- [ ] 1.3 创建数据模型 `app/models/db_models.py`
  - APIKey model
  - Upstream model
  - RequestLog model
- [ ] 1.4 创建 Alembic migration
  - 初始化 alembic (如果未初始化)
  - 创建 migration: `alembic revision --autogenerate -m "add key management tables"`
  - 审查生成的 migration 脚本
- [ ] 1.5 实现加密工具 `app/core/encryption.py`
  - Fernet key 生成和加载
  - encrypt_api_key() / decrypt_api_key() 函数

## 2. 认证和授权

- [ ] 2.1 创建依赖注入函数 `app/core/deps.py`
  - get_db(): 获取数据库 session
  - get_current_api_key(): 验证 Bearer token
  - verify_admin_token(): 验证 admin 权限
- [ ] 2.2 更新配置 `app/core/config.py`
  - 添加 ENCRYPTION_KEY 配置
  - 添加 ADMIN_TOKEN 配置
  - DATABASE_URL 已存在，确认配置正确
- [ ] 2.3 修改 proxy 路由 `app/api/routes/proxy.py`
  - 集成 get_current_api_key 依赖
  - 验证 api_key 是否有权限访问选定的 upstream
  - 记录请求日志

## 3. Admin API

- [ ] 3.1 创建 Admin 路由 `app/api/routes/admin.py`
  - POST /admin/keys - 创建 API key
  - GET /admin/keys - 列出 keys (分页)
  - DELETE /admin/keys/{id} - 撤销 key
  - POST /admin/upstreams - 添加上游
  - GET /admin/upstreams - 列出上游
  - PUT /admin/upstreams/{id} - 更新上游
  - DELETE /admin/upstreams/{id} - 删除上游
- [ ] 3.2 创建 Pydantic schemas `app/models/schemas.py`
  - APIKeyCreate, APIKeyResponse
  - UpstreamCreate, UpstreamUpdate, UpstreamResponse
  - RequestLogResponse
- [ ] 3.3 实现业务逻辑 `app/services/key_manager.py`
  - generate_api_key(): 生成随机 key (格式: sk-auto-<random>)
  - create_api_key()
  - revoke_api_key()
  - list_api_keys()
- [ ] 3.4 实现上游管理逻辑 `app/services/upstream_manager.py`
  - create_upstream()
  - update_upstream()
  - delete_upstream()
  - list_upstreams()
  - load_upstreams_from_db(): 从数据库加载上游配置
- [ ] 3.5 Admin API 分页
  - GET /admin/keys 支持 `page`/`page_size` 查询参数，并设置默认值与最大限制
  - 响应包含 `total`, `page`, `page_size` 等分页元数据，按 `created_at desc` 排序
  - GET /admin/upstreams 沿用同一分页/排序逻辑，避免一次性返回全部记录
- [ ] 3.6 Admin API 数据遮罩
  - GET /admin/keys 只返回 `key_prefix` + `****` 掩码，永不返回完整 key
  - GET /admin/upstreams 返回 `api_key_masked` (如 `sk-***1234`)，不包含密文或明文
  - Admin API 的响应/错误日志都必须只展示前缀，防止敏感值写入日志

## 4. 主应用集成

- [ ] 4.1 修改 main.py 的 lifespan
  - 初始化数据库连接
  - 运行 migrations (可选，或要求手动运行)
  - 从数据库加载上游，如果为空则从环境变量导入
  - 初始化 UpstreamManager
- [ ] 4.2 注册 Admin 路由
  - 添加到 app.include_router
- [ ] 4.3 更新 UpstreamManager (如果需要)
  - 支持动态刷新上游列表
  - add_upstream(), remove_upstream() 方法

## 5. 请求日志

- [ ] 5.1 创建日志记录服务 `app/services/logger_service.py`
  - log_request(): 记录请求和响应
  - extract_usage_from_response(): 从响应中提取 token usage
- [ ] 5.2 在 proxy 路由中集成日志记录
  - 请求开始时记录基本信息
  - 请求结束时更新 tokens 和 status
- [ ] 5.3 添加日志查询 API (可选，低优先级)
  - GET /admin/logs - 查询请求日志

## 6. 测试

- [ ] 6.1 单元测试
  - test_encryption.py - 测试加密解密
  - test_key_manager.py - 测试 key 生成和验证
  - test_deps.py - 测试依赖注入函数
- [ ] 6.2 集成测试
  - test_admin_api.py - 测试 Admin API CRUD
  - test_proxy_auth.py - 测试代理路由的认证
  - test_permission.py - 测试权限控制 (key 只能访问授权的上游)
- [ ] 6.3 端到端测试
  - 创建 key → 使用 key 请求 proxy → 验证路由正确
  - 使用无效 key → 验证返回 401
  - 使用 key 访问未授权的 upstream → 验证返回 403
- [ ] 6.4 遮罩与脱敏测试
  - test_admin_api_masking.py 验证 GET /admin/keys 仅返回前缀/掩码并带分页元数据
  - test_upstream_masking.py 确认 GET /admin/upstreams 永不返回实际 upstream key
  - test_request_logs_redaction.py 保证 request_logs 只含 `api_key_id` 等元数据，不含明文 key 或请求内容
- [ ] 6.5 Fallback 测试
  - test_env_fallback.py 验证数据库为空时会从环境变量导入 upstreams
  - test_database_unavailable_fallback.py 模拟 DB 不可用时回退到 env 并写 warning
  - test_cache_revocation_fallback.py 覆盖缓存 miss/失效与撤销后立即清除缓存的流程

## 7. 文档和配置

- [ ] 7.1 更新 README.md
  - 添加数据库设置说明
  - 添加 Admin API 使用示例
  - 添加环境变量说明 (ENCRYPTION_KEY, ADMIN_TOKEN)
- [ ] 7.2 创建 .env.example
  - 添加新的环境变量模板
- [ ] 7.3 编写 migration 文档
  - 如何从环境变量配置迁移到数据库配置
- [ ] 7.4 创建 Admin API 文档
  - OpenAPI/Swagger 自动生成
  - 添加使用示例
- [ ] 7.5 ENCRYPTION_KEY 备份指南
  - 记录生成/轮换流程，推荐通过 `ENCRYPTION_KEY_FILE` 注入并妥善备份
  - 强调缺失 key 时应用会以 exit code 1 fail-fast，避免误删导致数据不可解密
  - 补充灾备和密钥存储最佳实践（HashiCorp Vault, AWS Secrets Manager）
- [ ] 7.6 请求日志保留策略文档
  - 说明 LOG_RETENTION_DAYS、默认 90 天和每日 02:00 清理作业
  - 提供手动触发清理脚本示例以及 "Cleaned up N old request logs" 记录格式
  - 解释合规/隐私注意事项及如何在删除前导出需要的日志

## 8. 部署和验证

- [ ] 8.1 本地测试完整流程
  - 初始化数据库
  - 创建 admin token
  - 创建 API key
  - 测试 proxy 请求
- [ ] 8.2 性能测试
  - 使用 hey/k6 测试 API key 验证的性能开销
  - 确保延迟增加 < 10ms
- [ ] 8.3 安全审查
  - 确认上游 API keys 已加密
  - 确认 admin API 有保护
  - 确认日志不泄露敏感信息
