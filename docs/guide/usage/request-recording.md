---
title: 请求录制
outline: deep
---

# 请求录制

请求录制（Traffic Recording）把每次代理请求的入站请求体、上游响应体、SSE chunks 整体快照成一个 JSON fixture 写到磁盘，索引信息写到 `traffic_recordings` 表。用途主要是事后排查 / 回归测试 / 喂给 `/api/mock` 做本地回放，**默认关闭**，开启后所有写盘走 fire-and-forget 不影响请求延迟。本页讲清开关位置、磁盘布局、脱敏规则、回放端点的边界。

## 默认关闭，运行时开关

录制行为由数据库表 `traffic_recording_settings` 单行（id = `"default"`）控制，**不再受 env 变量直接控制**。环境里仍然存在历史遗留的 `RECORDER_ENABLED` / `RECORDER_MODE` / `RECORDER_REDACT_SENSITIVE`（`.env.example:81-98`），但 [环境变量参考](../deployment/env-reference) 已经明确这三个 env 不再控制运行期行为——`shouldRecordFixture()` 只从 Runtime Settings 读值。

默认值（`src/lib/services/traffic-recording-service.ts:169-178`，`src/lib/db/schema-pg.ts:347-355`）：

| 字段               | 默认值      | 含义                                    |
| ------------------ | ----------- | --------------------------------------- |
| `enabled`          | `false`     | 总开关；`false` 时整个录制管道短路      |
| `mode`             | `"failure"` | 录制粒度：`all` / `success` / `failure` |
| `redact_sensitive` | `true`      | 是否对敏感 header / base URL 脱敏       |
| `retention_days`   | `7`         | 录制保留天数，超期由后台任务清理        |

判定逻辑（`traffic-recording-service.ts:219-224`）：

```ts
shouldRecordTraffic(outcome) === enabled && (mode === "all" || mode === outcome);
```

每次代理请求单独调一次 `getTrafficRecordingSettings()`（`route.ts:2481`，每请求新查 DB，无 in-memory 缓存），所以**改设置立即生效，不需要重启**。

入口：管理后台 **系统 → 流量录制**（`/system/traffic-recording`，页面文件 `src/app/[locale]/(dashboard)/system/traffic-recording/page.tsx`）。

## 磁盘布局与文件命名

### 目录

由 env 变量 `RECORDER_FIXTURES_DIR` 指定，未设置时默认 `data/traffic-recordings`（`src/lib/services/traffic-recording-service.ts:10`）。

::: warning .env.example 注释与实际默认值不一致
`.env.example:92` 的注释里把默认目录写成 `tests/fixtures`，但源码常量 `DEFAULT_TRAFFIC_RECORDING_ROOT` 是 `data/traffic-recordings`。实际生效值以源码为准——env 不设时录制写到 `data/traffic-recordings`，不是 `tests/fixtures`。
:::

### 文件路径与命名

`buildFixturePath`（`src/lib/services/traffic-recorder.ts:249-254`）：

```
{RECORDER_FIXTURES_DIR}/{provider}/{route}/{timestamp}.json
```

- `provider` 与 `route` 经 `sanitizePathSegment()` 处理：非字母数字字符 → `_`
- `timestamp` 来自 `fixture.meta.createdAt`，`:` 与 `.` → `-`
- 同目录额外写 `latest.json`，每次覆盖，永远指向最新一次录制

每次请求落 **2 个文件**（时间戳文件 + `latest.json`），**内容相同**，都是整体 JSON。流式 SSE 的 chunks 在内存里全部读完后以 `streamChunks: string[]` 数组形式写入同一个 JSON，**不是逐 chunk 落盘**。

### 单次 fixture 大小上限

`traffic-recorder.ts:122` 常量 `MAX_RECORDING_BYTES = 16 MiB`。超过后录制侧追加 `"[RECORDING_TRUNCATED]"` 标记并取消录制流，**client 侧的响应不受影响**——录制和响应是两个独立的 `tee()` 分支。

### 大型 SSE 事件的瘦身

`compactSSEChunks`（`traffic-recorder.ts:354-384`）对 OpenAI Responses 的 `response.created` / `response.in_progress` / `response.completed` 这几个携带完整 instructions / tools 的快照事件做特殊处理：把 `instructions` 与 `tools` 字段替换为 `"[STRIPPED:see_inbound_body]"`，避免一份 fixture 重复保存若干份相同的 system prompt。完整 instructions / tools 仍可以从 `inboundRequestBody` 字段里取到。

## traffic_recordings 表

`src/lib/db/schema-pg.ts:360-390`。**索引层**：每条 fixture 一行 DB 索引，fixture JSON 本体在磁盘上。

| 字段                  | 类型                   | 说明                            |
| --------------------- | ---------------------- | ------------------------------- |
| `id`                  | uuid PK                |                                 |
| `request_log_id`      | uuid FK → request_logs | 关联到 [请求日志](./logs-stats) |
| `api_key_id`          | uuid FK → api_keys     |                                 |
| `upstream_id`         | uuid FK → upstreams    |                                 |
| `method`              | varchar(10)            |                                 |
| `path`                | text                   |                                 |
| `model`               | varchar(128)           |                                 |
| `status_code`         | integer                |                                 |
| `outcome`             | varchar(16) NOT NULL   | `"success"` / `"failure"`       |
| `fixture_path`        | text NOT NULL UNIQUE   | 磁盘绝对路径                    |
| `fixture_size_bytes`  | integer                |                                 |
| `request_size_bytes`  | integer                |                                 |
| `response_size_bytes` | integer                |                                 |
| `redacted`            | boolean NOT NULL       | 该 fixture 是否经过脱敏         |
| `created_at`          | timestamptz            |                                 |

设置表 `traffic_recording_settings` 单行（id = `"default"`），字段 `enabled` / `mode` / `redact_sensitive` / `retention_days` / 时间戳，对应 Runtime Settings。

## 录制管道

### 入口与执行时机

`src/app/api/proxy/v1/[...path]/route.ts`：

| 行        | 行为                                                                                                |
| --------- | --------------------------------------------------------------------------------------------------- |
| 2481      | `await getTrafficRecordingSettings()` —— 每请求一次 DB 查询                                         |
| 2482-2485 | 计算 `shouldRecordSuccess` / `shouldRecordFailure` / `recorderEnabled`                              |
| 2485      | `recorderEnabled === true` 时才 `await readRequestBody(request)` 把请求体读进内存                   |
| 3202      | `teeStreamForRecording(originalStream)` —— `ReadableStream.tee()` 分叉流，一路给 client，一路给录制 |
| 3597      | 流式成功路径：`return recordTrafficFixture(...)`，落盘在后台 `.then()` 里，client 响应已先行返回    |
| 3796      | 非流式成功路径：`void recordTrafficFixture(...).catch(...)` 显式 fire-and-forget                    |
| 4034      | 失败路径：`void recordTrafficFixture(...).catch(...)` 同上                                          |

**所有落盘均为 fire-and-forget**，client 端不阻塞等磁盘写入。读取请求体只在 `recorderEnabled === true` 时才发生，关闭录制时**不会**多产生 body 读取开销。

### 脱敏规则

`traffic-recorder.ts:124-136` 的 `SENSITIVE_HEADER_NAMES`：

```
authorization, proxy-authorization, x-forwarded-authorization,
x-api-key, x-goog-api-key, cookie, set-cookie, session_id,
x-codex-turn-metadata, x-codex-beta-features
```

`redactSensitive === true` 时：

- 上表所有 header 的值替换为 `"[REDACTED]"`（key 名保留）。
- 上游 base URL 的 host 部分替换为 `"[REDACTED]"`，路径保留。
- fixture 的 `meta.redacted = true`，DB 行的 `redacted` 列同步为 `true`。

`redactSensitive === false` 时上述字段保留原值。**强烈建议**生产环境保持默认 `true`——fixture 是写到磁盘的明文 JSON，关掉脱敏意味着 auth 头、cookie、CPA management key 等都会留在文件里。

### 保留期与清理

后台任务 `traffic recording cleanup`（已注册到 background sync 注册表，`src/lib/services/background-sync-registry.ts`）按 `retention_days` 字段定期跑，删除超期的 DB 行与对应磁盘文件。

手动触发：

```
POST /api/admin/traffic-recordings/cleanup
```

返回 `{deleted_count, failure_count, error_summary}`。

## 管理 API

全部要求 `Authorization: Bearer <ADMIN_TOKEN>`。

| Method   | Path                                    | 行为                                                                                                                 |
| -------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/admin/traffic-recording/settings` | 读 Runtime Settings                                                                                                  |
| `PATCH`  | `/api/admin/traffic-recording/settings` | 更新 Runtime Settings（字段任意可选）                                                                                |
| `GET`    | `/api/admin/traffic-recordings`         | 分页列表；过滤 `api_key_id` / `upstream_id` / `request_log_id` / `status_code` / `model` / `start_time` / `end_time` |
| `GET`    | `/api/admin/traffic-recordings/[id]`    | 返回单条索引元数据 + 内联 `fixture` 字段（磁盘 JSON 内容）                                                           |
| `DELETE` | `/api/admin/traffic-recordings/[id]`    | 删 DB 行 + 删磁盘文件                                                                                                |
| `POST`   | `/api/admin/traffic-recordings/cleanup` | 立即清理所有超 `retention_days` 的录制                                                                               |

源文件分别是 `src/app/api/admin/traffic-recording/settings/route.ts`、`src/app/api/admin/traffic-recordings/route.ts`、`.../[id]/route.ts`、`.../cleanup/route.ts`。

**没有独立的下载端点**——fixture 内容是通过详情 GET 的 `fixture` 字段内联返回，前端 UI 直接渲染。

## 回放：`/api/mock/[...path]`

`src/app/api/mock/[...path]/route.ts`。

::: warning 仅非 production 生效
`NODE_ENV !== "production"` 才放行，否则返回 404。**生产环境不可用**。
:::

工作流：以请求路径定位 `provider/route` 目录，`readLatestFixture()` 读 `latest.json`，按 fixture 内容回放响应。**无需 auth**，靠 NODE_ENV 隔离。

查询参数：

| 参数                       | 行为                                   |
| -------------------------- | -------------------------------------- |
| `provider=<name>`          | 切换 provider，默认 `"default"`        |
| `mock_stream=1`            | 按 SSE chunks 回放                     |
| `mock_error=429`           | 直接以指定状态码失败响应               |
| `mock_delay_ms=<n>`        | 在响应前注入延迟                       |
| `mock_interrupt_after=<n>` | 流式模式专用，回放 `n` 个 chunk 后中断 |

主要用于：

- 复现某次失败：找到对应 fixture，用 mock 端点重放给开发环境的客户端。
- 离线 / 弱网调试：让客户端连到 mock 端点，不消耗真实 Key。
- 压测协议层：让 client 反复打 mock 端点测自身解析能力，绕开上游配额。

## 前端：`/system/traffic-recording` 页面

UI 操作（`src/app/[locale]/(dashboard)/system/traffic-recording/page.tsx`）：

- **Settings 卡片**：enabled 开关 / mode 下拉（`failure` / `success` / `all`）/ `redact_sensitive` 开关 / `retention_days` 输入框 / Save 按钮。保存即生效。
- **统计面板**：记录总数 / 磁盘用量（formatBytes）/ 当前 mode / 最新录制时间。
- **过滤列表**：状态码（200/400/401/429/500/all）/ model 模糊搜索 / api_key_id 精确 / upstream_id 精确 / 时间范围（today/7d/30d/自定义）。
- **列表列**：时间 / 状态码 badge / model / method+path / fixture 大小 / 脱敏 badge / 操作。
- **操作按钮**：「查看详情」（内联展开 fixture JSON）/「打开来源日志」（跳到 `/logs?focus=<request_log_id>`，仅有 request_log_id 时显示）/「删除」（二次确认）。
- **「清理过期」**：触发 `POST /api/admin/traffic-recordings/cleanup`。

## 实用配方

### 我只想录制失败请求做事后排查

默认配置就是。把 `enabled` 切到 `true`、`mode` 保持 `failure` 即可。开启后未来失败的请求都会被录制，已发生的请求不会回溯录制。

### 我想给某次故障录一份完整快照

短时间打开 `mode = all`，定向触发问题请求，结束后改回 `failure`。注意 `all` 模式磁盘占用涨得很快，不要忘记切回。

### 我想用录制 fixture 在开发环境回放

1. 把 fixture 文件 / 目录从生产环境拷到开发环境的 `RECORDER_FIXTURES_DIR` 下，保持 `provider/route` 目录结构。
2. 在 dev server 上请求 `/api/mock/<原 path>?provider=<provider>&mock_stream=1`。
3. mock 端点会读对应目录的 `latest.json` 回放。

如果想精确回放某个时间戳文件，把它 rename 成 `latest.json` 覆盖原文件即可。mock 端点目前不支持按时间戳精确选择。

## 不在本页范围内

- 字段级到底落了哪些计费维度：见 [请求日志与统计](./logs-stats)。
- 上游模型与 routing decision 的字段语义：见 [请求生命周期](../architecture/request-lifecycle)。
- CLIProxyAPI 管理 API 的 fixture / OAuth credentials 备份：见 [CLIProxyAPI 出站代理配置](./cliproxy-egress-proxy) 与 [CI 部署后追加 CLIProxyAPI sidecar](../deployment/cliproxy-sidecar)。
