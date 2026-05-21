## 1. CPA 配置模板与启动脚本

- [ ] 1.1 新增 `cliproxy/config.yaml.template`，包含 `auth-dir`、`port`、`api-keys`、`remote-management.secret-key`、`remote-management.allow-remote`、`proxy-url` 等键，敏感值以 `CLIPROXY_*` 环境变量占位符表示
- [ ] 1.2 新增 `cliproxy/docker-entrypoint.sh`，读取 `CLIPROXY_*` 环境变量生成实际 `config.yaml`，优先使用 `envsubst`，缺失时回退到 `sed` 占位符替换，最后 `exec` 启动 CPA 进程
- [ ] 1.3 校验启动脚本对必填变量缺失的处理：`CLIPROXY_CLIENT_API_KEY` 或 `CLIPROXY_MANAGEMENT_KEY` 为空时输出可理解的错误并终止启动

## 2. Docker Compose 叠加文件

- [ ] 2.1 新增 `docker-compose.cliproxy.yml`，定义 `cliproxyapi` 服务，使用镜像 `eceasy/cli-proxy-api` 并支持经 `CLI_PROXY_IMAGE` 固定版本，接入 `autorouter-net` 网络
- [ ] 2.2 在 `cliproxyapi` 服务中配置端口、entrypoint 脚本与配置模板的只读挂载、auth-dir 与日志的 named volume，并新增对应 volume 声明
- [ ] 2.3 为 `cliproxyapi` 服务配置 `restart` 策略与 healthcheck，使其生命周期由 Docker Compose 管理
- [ ] 2.4 运行 `docker compose -f docker-compose.yml -f docker-compose.cliproxy.yml config` 校验叠加文件语法与服务合并结果正确

## 3. 环境变量样例

- [ ] 3.1 在 `.env.example` 补充 `CLIPROXY_CLIENT_API_KEY`、`CLIPROXY_MANAGEMENT_KEY`、`CLIPROXY_PROXY_URL`、`CLIPROXY_ALLOW_REMOTE`、`CLIPROXY_PORT`、`CLI_PROXY_IMAGE` 等变量及中文注释
- [ ] 3.2 在注释中区分「CLIProxyAPI 服务地址」与「OAuth 出站代理」两类配置，并说明密钥需与 `cliproxy_instances` 记录一致

## 4. 部署文档

- [ ] 4.1 新增 `docs/cliproxy-deployment.md`，说明外部 CPA 与受管 sidecar 两种部署方式的步骤
- [ ] 4.2 在文档中说明 CPA 凭据与 `cliproxy_instances` 记录的一致性要求，以及创建实例记录后用管理端连通性检测验证
- [ ] 4.3 在文档中说明 named volume 的备份与迁移方式，并提供 auth-dir 改用 bind mount 的变体说明
- [ ] 4.4 在文档中说明不同网络环境下 CPA 出站代理的配置方式，涵盖 `http`、`https`、`socks5` 格式

## 5. 收尾验证

- [ ] 5.1 复核主 `docker-compose.yml` 未被改动，未引入叠加文件的既有部署行为不变
- [ ] 5.2 复核所有新增工件编码为 UTF-8 无 BOM，配置模板不含明文密钥
- [ ] 5.3 使用 `openspec validate cliproxy-sidecar-deployment` 校验本变更工件完整，提交收尾改动
