---
title: 环境变量参考
outline: deep
---

# 环境变量参考

本页把 `.env.example` 中的每一个字段按段落展开，标注用途、默认值、生成方式、修改后是否需要重启。所有「代码默认值」与 `docker-compose.yml` 中的 `${VAR:-default}` 默认值都按仓库现状记录；二者偶尔不一致时分别说明，避免读者在源码与部署之间被绕晕。

下表中「修改后是否需要重启」一栏的含义：

- **重启**：变量在进程启动时一次性读取，修改后必须重启对应容器才能生效。
- **无需重启**：变量由后台轮询或下次请求时按需读取，修改后下一次取数即可生效（实际多为 docker compose 配置类，重启更稳妥）。
- **运行时配置覆盖**：变量是默认值，但管理后台的「Runtime Settings」会覆盖它，运行期以后者为准。

`.env.example` 中带 `# ` 行首注释的变量都是可选项，未在 `.env` 中显式设置时按表中默认值或代码默认值行为。

## Docker 部署相关

| 变量               | 必填 | 默认值                            | 重启 | 说明                                                                                                                                                                                            |
| ------------------ | ---- | --------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AUTOROUTER_IMAGE` | 否   | `ghcr.io/g1331/autorouter:latest` | 重启 | `docker-compose.yml` 中 `autorouter` 服务的镜像引用。建议显式 pin 到具体 tag 或带 digest 的形式，避免 `latest` 漂移。`deploy-personal.yml` 会用 `workflow_dispatch` 输入的 `image_ref` 覆盖此值 |
| `PORT`             | 否   | `3331`（docker-compose 默认）     | 重启 | 宿主机侧端口，映射到容器内 `3000`。`docker-compose.yml` 中是 `"${PORT:-3331}:3000"`；与代码中应用监听端口 `3000` 不要混淆                                                                       |

## PostgreSQL 凭据（受 docker-compose 使用）

| 变量                | 必填 | 默认值       | 重启 | 说明                                                                                                                                                           |
| ------------------- | ---- | ------------ | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POSTGRES_USER`     | 否   | `autorouter` | 重启 | `db` 服务的 PostgreSQL 超级用户                                                                                                                                |
| `POSTGRES_PASSWORD` | 是   | 无           | 重启 | PostgreSQL 密码。`docker-compose.yml` 不为该字段提供 fallback；缺失会导致 `db` 启动失败。`deploy-personal.yml` 首次部署时用 `openssl rand -base64 24` 自动生成 |
| `POSTGRES_DB`       | 否   | `autorouter` | 重启 | 数据库名                                                                                                                                                       |

`POSTGRES_*` 三项仅用于 `db` 容器内部 PostgreSQL 实例。应用侧连接靠下面的 `DATABASE_URL`，二者必须保持口径一致。

## 数据库连接

| 变量             | 必填             | 默认值                                                             | 重启 | 说明                                                                                                                                             |
| ---------------- | ---------------- | ------------------------------------------------------------------ | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DB_TYPE`        | 否               | 由代码自动推断：有 `DATABASE_URL` 时为 `postgres`，否则为 `sqlite` | 重启 | 取值 `postgres` 或 `sqlite`。生产环境若未显式设置 `DB_TYPE` 且 `DATABASE_URL` 缺失，应用会快速失败拒绝静默回退到 SQLite                          |
| `DATABASE_URL`   | 生产 PG 模式下是 | 无                                                                 | 重启 | PostgreSQL 连接串。Docker 部署默认值 `postgresql://autorouter:<password>@db:5432/autorouter`，host 必须为 `db`（容器服务名），不能填 `localhost` |
| `SQLITE_DB_PATH` | 否               | `./data/dev.sqlite`                                                | 重启 | 仅 `DB_TYPE=sqlite` 时生效。本地轻量场景用                                                                                                       |

::: warning DATABASE_URL 中的密码必须与 POSTGRES_PASSWORD 一致
`docker-compose.yml` 分别把这两个值传给应用容器与 `db` 容器，二者不会自动同步。任何一侧改动后必须同步修改另一侧并重启栈，否则应用容器会反复重启并报 `password authentication failed`。
:::

## 加密与管理鉴权（必填）

| 变量                  | 必填 | 默认值 | 重启 | 说明                                                                                                                                                    |
| --------------------- | ---- | ------ | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ENCRYPTION_KEY`      | 是   | 无     | 重启 | Fernet 加密密钥。代码强制其为 base64 编码、长度 44 字符（对应 32 字节）。用于加密上游 API Key、CLIProxyAPI 凭据等敏感字段写入数据库前后。生成方式见下文 |
| `ENCRYPTION_KEY_FILE` | 否   | 无     | 重启 | 从文件读取密钥。优先级与 `ENCRYPTION_KEY` 的关系以代码实现为准；通常二选一即可                                                                          |
| `ADMIN_TOKEN`         | 是   | 无     | 重启 | 管理 API token。`/api/admin/*` 与登录页都用 `Authorization: Bearer <token>` 比对。缺失时所有管理请求会被拒绝                                            |

生成 `ENCRYPTION_KEY` 的两种等价方式：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# 或
openssl rand -base64 32
```

生成 `ADMIN_TOKEN`：

```bash
openssl rand -hex 32
```

::: danger ENCRYPTION_KEY 丢失后果
该密钥用于解密所有已加密上游凭据；丢失等同于丢失所有上游配置。强烈建议在密码管理器或安全密钥仓库中备份，并在多机部署间使用同一份密钥。轮换密钥需要先用旧密钥读出再用新密钥重新加密，仓库目前未提供自动迁移工具，需要手工脚本处理。
:::

## 日志与可观测

| 变量                 | 必填 | 默认值                                   | 重启 | 说明                                                                                                                                                                                            |
| -------------------- | ---- | ---------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LOG_LEVEL`          | 否   | 生产 `info`，开发 `debug`                | 重启 | Pino 日志级别。可取值 `fatal` / `error` / `warn` / `info` / `debug` / `trace`                                                                                                                   |
| `LOG_RETENTION_DAYS` | 否   | `90`                                     | 重启 | 请求日志保留天数。后台清理任务以该值为界                                                                                                                                                        |
| `DEBUG_LOG_HEADERS`  | 否   | `false`                                  | 重启 | 是否在日志中输出请求头。仅排障时短时开启；含敏感字段，长期开启有泄露风险                                                                                                                        |
| `CORS_ORIGINS`       | 否   | `http://localhost:3000`（代码 fallback） | 重启 | 逗号分隔的跨域来源列表；为空时退化到上述代码 fallback。**当前该变量仅被 `config.ts` 解析，未接入任何 CORS 中间件或响应头写入逻辑，设置后在运行期无实际效果。**`docker-compose.yml` 默认透传空值 |

`HEALTH_CHECK_INTERVAL` 与 `HEALTH_CHECK_TIMEOUT` 是代码默认值 `30` 秒与 `10` 秒，目前未在 `.env.example` 中暴露，确有需要可通过 `.env` 注入。

## 功能开关

| 变量               | 必填 | 默认值  | 重启 | 说明                                                                                        |
| ------------------ | ---- | ------- | ---- | ------------------------------------------------------------------------------------------- |
| `ALLOW_KEY_REVEAL` | 否   | `false` | 重启 | 是否允许通过 Admin API 揭示完整的客户端 API Key。生产环境务必保持关闭，仅在受控场景临时开启 |

## 请求录制

请求录制的运行期开关已经全部搬到「数据库中的 Runtime Settings 单例」（表 `traffic_recording_settings`），由 `src/lib/services/traffic-recording-service.ts:167` 的 `getTrafficRecordingSettings()` 读取，首次读取时按以下默认值初始化：

| Runtime Settings 字段 | 默认值      | 说明                                    |
| --------------------- | ----------- | --------------------------------------- |
| `enabled`             | `false`     | 是否开启录制                            |
| `mode`                | `"failure"` | 录制范围：`all` / `success` / `failure` |
| `redact_sensitive`    | `true`      | 是否脱敏敏感字段                        |
| `retention_days`      | `7`         | 录制文件保留天数                        |

修改方式：管理后台「系统 → 请求录制」页面（`/system/traffic-recording`）。修改后立即生效，不需要重启。

::: warning 三个 RECORDER\_\* 环境变量当前不再作为运行时开关
`.env.example` 与 `docker-compose.yml` 仍包含 `RECORDER_ENABLED`、`RECORDER_MODE`、`RECORDER_REDACT_SENSITIVE` 三个键，但它们**已经不再控制运行期行为**——代码层的 `shouldRecordFixture()` 只从 Runtime Settings 拿值，不再回退到 env var。即便 `.env` 中显式设置任意值，是否开启录制、录制模式、是否脱敏都以管理后台 Runtime Settings 的当前值为准。这三个键是历史遗留，未来可能被清理；不要据其调整部署预期。
:::

唯一仍生效的录制相关 env var 是文件目录：

| 变量                    | 必填 | 默认值                                                                         | 重启 | 说明                                                                                                                |
| ----------------------- | ---- | ------------------------------------------------------------------------------ | ---- | ------------------------------------------------------------------------------------------------------------------- |
| `RECORDER_FIXTURES_DIR` | 否   | 代码默认 `data/traffic-recordings`；docker-compose.yml 中默认 `tests/fixtures` | 重启 | 录制文件落盘目录。由 `resolveRecordingRoot()` / `getTrafficRecordingRoot()` 直接读取 env var，未走 Runtime Settings |

## CLIProxyAPI Sidecar（可选）

下列变量仅在以受管 sidecar 形态运行 CLIProxyAPI 时需要，即同时引入 `docker-compose.cliproxy.yml`。使用外部独立 CLIProxyAPI 的部署无需设置。

| 变量                      | 必填 | 默认值                        | 重启 | 说明                                                                                                                      |
| ------------------------- | ---- | ----------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------- |
| `CLI_PROXY_IMAGE`         | 否   | `eceasy/cli-proxy-api:latest` | 重启 | CLIProxyAPI 镜像引用。建议固定到具体 tag 或 digest                                                                        |
| `CLIPROXY_PORT`           | 否   | `8317`                        | 重启 | CLIProxyAPI 监听端口，AutoRouter 通过该端口转发代理请求与调用管理 API                                                     |
| `CLIPROXY_CLIENT_API_KEY` | 是   | 无                            | 重启 | 客户端 API Key。所有经 CLIProxyAPI 转发的代理请求都需携带；必须与 AutoRouter 管理端登记实例时填写的客户端 API Key 一致    |
| `CLIPROXY_MANAGEMENT_KEY` | 是   | 无                            | 重启 | 管理 API 密钥。AutoRouter 调用 CLIProxyAPI 管理接口时使用；必须与 AutoRouter 管理端登记实例时填写的管理密钥一致           |
| `CLIPROXY_ALLOW_REMOTE`   | 否   | `true`                        | 重启 | 是否允许非本机访问 CLIProxyAPI 管理 API。受管 sidecar 下 AutoRouter 与 CLIProxyAPI 跨容器，必须保持为 `true`              |
| `CLIPROXY_PROXY_URL`      | 否   | 空（不使用代理）              | 重启 | CLIProxyAPI 的出站代理，供其访问 Codex / Claude / Gemini 的登录与模型 API。支持 `http://` / `https://` / `socks5://` 形式 |

::: warning 两个密钥要在三处保持一致
`CLIPROXY_CLIENT_API_KEY` 与 `CLIPROXY_MANAGEMENT_KEY` 同时是 CLIProxyAPI 配置来源与 AutoRouter 管理端「登记实例」时录入的明文来源。任何一侧改动都需要同步另一侧，否则连通性检测会失败。具体步骤参见 [CI 部署后追加 CLIProxyAPI sidecar](./cliproxy-sidecar)。
:::

## 两类地址的区分

CLIProxyAPI 涉及两类地址，含义不同：

| 地址类型             | 方向                                   | 配置位置                                                                                                           |
| -------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| CLIProxyAPI 服务地址 | AutoRouter -> CLIProxyAPI              | AutoRouter 管理端「登记实例」时填写。受管 sidecar 下为 `http://cliproxyapi:8317`（容器服务名），不在 `.env` 中配置 |
| OAuth 出站代理       | CLIProxyAPI -> Codex / Claude / Gemini | `.env` 中 `CLIPROXY_PROXY_URL`                                                                                     |

二者不要混填。受管 sidecar 下「服务地址」必须用服务名 `cliproxyapi` 而不是 `localhost`，否则 AutoRouter 容器无法到达 CLIProxyAPI 容器。

## 构建期变量（不在运行时 `.env` 中）

下列变量是镜像构建期使用，不需要写到 `.env`，列出仅供参考：

| 变量                      | 用途                                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_APP_VERSION` | 应用版本号。`release.yml` 通过 `docker build --build-arg` 注入，运行期通过 `/api/health` 返回值与 UI 顶部展示 |
| `NEXT_TELEMETRY_DISABLED` | 关闭 Next.js 匿名遥测，`release.yml` 与开发指令中默认设为 `1`                                                 |
| `NODE_ENV`                | 通常由 docker / Next.js 自动设置                                                                              |

## 修改后如何安全生效

变量分两类情况：

- 在 `.env` 中改任何字段后，单独 `docker compose restart <service>` 不一定能让新值生效，因为 Compose 把 `.env` 内的值在 `up` 时注入到容器环境。最稳妥的做法：
  ```bash
  docker compose up -d
  # 或带 sidecar 时
  docker compose -f docker-compose.yml -f docker-compose.cliproxy.yml up -d
  ```
  这会让 Compose 检测到环境变化并重建相关容器，原 named volume 数据不受影响。
- 若涉及 `ENCRYPTION_KEY` 变更，需要先在旧密钥下导出已加密字段、用新密钥重新加密后再写回。仓库未提供自动迁移工具，盲目轮换密钥会导致所有上游凭据无法解密。

## 来源对照

本页的事实依据：

- `.env.example`：字段清单与注释来源
- `docker-compose.yml`、`docker-compose.cliproxy.yml`：`${VAR:-default}` 形式的部署默认值
- `src/lib/utils/config.ts`：代码层的默认值、必填校验与 fail-fast 逻辑
- `src/lib/services/traffic-recording-service.ts`、`tests/unit/services/traffic-recorder.test.ts`：录制功能已迁移到数据库 Runtime Settings 单例，仅 `RECORDER_FIXTURES_DIR` 仍通过 env var 生效
- `.github/workflows/deploy-personal.yml`：CI 自动生成 `.env` 时的填值规则
