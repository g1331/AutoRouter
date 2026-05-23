---
title: 熔断器配置
outline: deep
---

# 熔断器配置

AutoRouter 给每条上游单独维护一个熔断器，行为遵循 CLOSED → OPEN → HALF_OPEN 的标准状态机。状态机本身的转移规则、与 failover 的协同详见现有长篇 [`docs/circuit-breaker.md`](/circuit-breaker)；本页只补全实际配置层面的三块内容：可调阈值字段、自定义失败规则、Admin 强制开关。

## 状态机一句话回顾

枚举位于 `src/lib/services/circuit-breaker.ts:13-17`：

```
CLOSED      // 正常服务
OPEN        // 已熔断，拒绝新流量；到达 openDuration 后自动转 HALF_OPEN
HALF_OPEN   // 半开，按 probeInterval 节奏放探针请求
```

驱动状态转移的三个函数：

| 函数                          | 触发                                     | 行为                                                                      |
| ----------------------------- | ---------------------------------------- | ------------------------------------------------------------------------- |
| `recordFailure`               | 转发失败时调（`circuit-breaker.ts:243`） | CLOSED 累计失败到 `failureThreshold` → OPEN；HALF_OPEN 任意失败 → 回 OPEN |
| `recordSuccess`               | 转发成功时调（`circuit-breaker.ts:208`） | 仅 HALF_OPEN 生效，连续 `successThreshold` 次成功 → CLOSED                |
| `acquireCircuitBreakerPermit` | 每次请求前调（`circuit-breaker.ts:160`） | OPEN 状态下若 `openDuration` 已超时自动转 HALF_OPEN                       |

详细行为图与边界处理见 [`docs/circuit-breaker.md`](/circuit-breaker)。

## 上游级可调阈值

熔断参数**不**直接落在 `upstreams` 表上，而是按上游写入 `circuit_breaker_states.config`（`src/lib/db/schema-pg.ts:236-243`）。创建或编辑上游时通过 `circuit_breaker_config` 嵌套对象提交，路由层用「上游覆盖值 → 全局默认值」的回退顺序读取。

API 字段（管理 API 层接收以秒为单位的输入并转换为毫秒存储；`src/app/api/admin/upstreams/route.ts:23-31`、`:81-88`）：

| API 字段              | 类型             | 默认 | 单位（API） | 单位（DB） | 含义                                                     |
| --------------------- | ---------------- | ---- | ----------- | ---------- | -------------------------------------------------------- |
| `failure_threshold`   | integer 1–100    | 5    | 次数        | 次数       | CLOSED 状态下累计多少次失败转 OPEN                       |
| `success_threshold`   | integer 1–100    | 2    | 次数        | 次数       | HALF_OPEN 状态下连续多少次成功转 CLOSED                  |
| `open_duration`       | integer 1–300000 | 300  | 秒          | 毫秒       | OPEN 持续多久后可转 HALF_OPEN（默认 5 分钟）             |
| `probe_interval`      | integer 1–60000  | 30   | 秒          | 毫秒       | HALF_OPEN 探针节流：相邻两次探针的最小间隔（默认 30 秒） |
| `first_byte_timeout`  | integer 1–300000 | 30   | 秒          | 毫秒       | 上游响应首字节超时（默认 30 秒）                         |
| `stream_idle_timeout` | integer 1–300000 | 60   | 秒          | 毫秒       | SSE 流空闲超时（默认 60 秒）                             |

默认值来源：`src/lib/circuit-breaker-defaults.ts:10-17`。`open_duration` / `probe_interval` 等字段在 API 层接收秒、在 DB 内部按毫秒存储，是为兼容更早期的纯毫秒提交格式而设的双单位约定。

**UI 入口**：上游编辑弹框的「Reliability → Circuit Breaker Config」分区（`src/components/admin/upstream-form-dialog.tsx:3651-3808`，分区 id `advanced-circuit-breaker`、`upstream-form-dialog.tsx:1282-1285`）。每个字段都带 i18n 标签与默认值显示，编辑后保存即生效——不需要重启进程。

### 调参建议

| 场景                          | 该调哪个                                                      |
| ----------------------------- | ------------------------------------------------------------- |
| 上游偶有抖动但不希望整条断开  | 调大 `failure_threshold`（默认 5 已经比较宽容）               |
| 上游故障后希望尽快尝试恢复    | 调小 `open_duration`（最小 1 秒，太短会让故障上游被反复探活） |
| HALF_OPEN 探针请求被压垮      | 调大 `probe_interval`，让探针之间留出更多缓冲                 |
| 上游 SSE 流空闲很久才继续输出 | 调大 `stream_idle_timeout`（默认 60 秒）                      |
| 上游首字节响应慢但稳定        | 调大 `first_byte_timeout`（默认 30 秒）                       |

## 自定义失败规则（upstream_failure_rules）

不是所有 HTTP 错误都应该被记入熔断器——有些是已知的、可预期的、对上游健康度没有意义的失败。AutoRouter 提供「失败规则」让你针对特定错误特征**抑制熔断计数**（但 failover 仍然发生）。

### Schema 与匹配语义

`upstream_failure_rules`（`src/lib/db/schema-pg.ts:257-274`）：

| 字段          | 类型               | 含义                                                  |
| ------------- | ------------------ | ----------------------------------------------------- |
| `upstream_id` | `uuid` 或 `NULL`   | `NULL` = 全局规则，命中所有上游；非 NULL = 仅对该上游 |
| `name`        | `varchar(128)`     | 规则名                                                |
| `enabled`     | boolean，默认 true | 是否启用                                              |
| `priority`    | integer，默认 0    | 匹配优先级（升序，越小越先匹配）                      |
| `match`       | json               | 匹配条件                                              |

`match` 字段结构（`src/lib/services/upstream-failure-rules.ts:8-14`）：

| 子字段                           | 含义                               |
| -------------------------------- | ---------------------------------- |
| `status_codes`                   | HTTP 状态码白名单（命中即匹配）    |
| `error_types`                    | 错误类型字符串列表（如 `timeout`） |
| `body_pattern`                   | 响应体正则                         |
| `header_name` + `header_pattern` | 响应头名 + 值正则                  |

四类子条件以 AND 关系拼接：都给值就都得满足；都不给则永远不匹配（空规则无意义）。

### 规则命中的效果

`matchFailureRule`（`upstream-failure-rules.ts:307`）按 `priority` 升序找第一条命中规则，返回 `MatchedFailureRule | null`。返回非 null 时：

- **failover 仍发生**：请求会换下一条上游继续重试。
- **熔断不计数**：`route.ts:1549-1557` 显式判断 `matchedFailureRule === null`，命中规则时跳过 `recordFailure(upstream, errorType)`。

也就是说失败规则的语义是「这次失败已经被规则解释了，不再算作上游故障」，而不是「这次失败不算失败」。

### 管理 API

| 方法                       | 路径                                      | 用途                 |
| -------------------------- | ----------------------------------------- | -------------------- |
| `GET` / `POST`             | `/api/admin/upstream-failure-rules`       | 列 / 建全局规则      |
| `GET` / `PATCH` / `DELETE` | `/api/admin/upstream-failure-rules/[id]`  | 取 / 改 / 删全局规则 |
| `GET` / `POST`             | `/api/admin/upstreams/[id]/failure-rules` | 列 / 建上游局部规则  |

POST body 字段对应 `match` 结构（`upstream-failure-rules.ts:16-22`、`failure-rules/route.ts:18-24`）：`name`、`enabled`、`priority`、`match.status_codes`、`match.error_types`、`match.body_pattern`、`match.header_name`、`match.header_pattern`。

### 典型用法

| 想做的事                                       | 写一条这样的规则                                                                  |
| ---------------------------------------------- | --------------------------------------------------------------------------------- |
| 上游侧返回的「模型暂时不可用」不要导致整条熔断 | `status_codes: [503]` + `body_pattern: "model.*not.*available"`                   |
| 用户侧 4xx 错误不影响上游健康度                | `status_codes: [400, 401, 403, 422]`（默认 failover 会跳过 4xx，但保险起见）      |
| 单一上游的特定 retry-after 不计入熔断          | `status_codes: [429]` + `header_name: "retry-after"` + `header_pattern: "^[1-9]"` |

## circuit_breaker_states 表与持久化

字段（`src/lib/db/schema-pg.ts:222-251`）：

| 字段              | 类型                         | 说明                                          |
| ----------------- | ---------------------------- | --------------------------------------------- |
| `upstream_id`     | `uuid UNIQUE NOT NULL`       | 一条上游对应一行                              |
| `state`           | `varchar(16)`，默认 `closed` | 当前状态                                      |
| `failure_count`   | integer，默认 0              | 累计失败次数                                  |
| `success_count`   | integer，默认 0              | HALF_OPEN 下连续成功计数                      |
| `last_failure_at` | timestamptz                  | 最后一次失败时间                              |
| `opened_at`       | timestamptz                  | 最近进入 OPEN 的时间（用于计算 openDuration） |
| `last_probe_at`   | timestamptz                  | 最近探针时间（用于 probeInterval 节流）       |
| `config`          | json 或 null                 | 上游覆盖配置（null = 全用默认值）             |

**状态完全持久化**：所有字段写入 PostgreSQL，进程重启后熔断状态完整恢复（`circuit-breaker.ts:43-46`，`getOrCreateCircuitBreakerState` 直接 `db.query` 读盘）。重启**不会**重置 OPEN 状态，`opened_at` 时间戳仍然有效，重启后下一次请求会按真实经过时间判断是否可转 HALF_OPEN。

## Admin 强制开关

有些场景下手动控制熔断比等自动状态机更直接，例如：

- 已知上游计划维护，提前 force open 避免触发 failover 浪费请求。
- 故障已修复但 OPEN 状态还没到期，想立刻恢复服务，force close。
- 想清空累积的 `failure_count`，让计数从零开始。

| 方法   | 路径                                                         | 行为                                                                           |
| ------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `POST` | `/api/admin/circuit-breakers/[id]/force-open`                | 调 `forceOpen`，写 `opened_at = now`、`state = OPEN`，不动 `failure_count`     |
| `POST` | `/api/admin/circuit-breakers/[id]/force-close`               | 调 `forceClose`，写 `state = CLOSED`、`failure_count = 0`、`success_count = 0` |
| `GET`  | `/api/admin/circuit-breakers/[id]`                           | 查单条上游熔断状态                                                             |
| `GET`  | `/api/admin/circuit-breakers?state=open&page=1&page_size=20` | 分页列出，可按状态过滤                                                         |

源码：`src/app/api/admin/circuit-breakers/[id]/force-open/route.ts:18-50`、`force-close/route.ts:18-50`；底层调用 `forceOpen`（`circuit-breaker.ts:293`）与 `forceClose`（`circuit-breaker.ts:309`）。

**UI 入口**：上游列表页（`src/app/[locale]/(dashboard)/upstreams/page.tsx:86`）可按 `circuit_open` 状态过滤；`useForceCircuitBreaker()` hook（`src/hooks/use-circuit-breaker.ts:33-58`）封装两个 mutation，按钮点击后自动 invalidate `circuit-breakers` 与 `upstreams` 查询缓存。

`force-open` 与 `force-close` 都不需要 body，仅需 `Authorization: Bearer <ADMIN_TOKEN>` 头。

## 与 failover 的关系

熔断与 failover 共用同一次 HTTP 失败事件，但处于两个独立的代码路径：

- **failover**：「换一个上游重试」。触发条件由 `src/lib/services/failover-config.ts:57-73` 决定，默认任何非 2xx 都触发，可通过 `excludeStatusCodes` 排除；策略可选 `exhaust_all`（默认）或 `max_attempts`（默认 10 次，`failover-config.ts:44-48`）。
- **熔断计数**：「这条上游不健康」。由 `recordFailure` 写入，受 `shouldRecordCircuitBreakerFailure(path)`（`route.ts:800-803`）与 `matchedFailureRule === null`（`route.ts:1549-1557`）两个条件共同控制。

`shouldRecordCircuitBreakerFailure` 维护一个路径白名单 `CIRCUIT_BREAKER_NEUTRAL_PATHS = {"messages/count_tokens"}`（`route.ts:793`）。命中白名单的路径即使失败也不计入熔断（这种 token 计数类请求不代表上游真实健康度）。

`matchedFailureRule` 在三处出现：HTTP 错误分支（`route.ts:1549-1556`）、流式错误 settlement 分支（`:1708-1712`）、网络 / 超时 settlement 分支（`:1948-1951`）。**例外**：流式 runtime 错误分支（`:1632-1635`）不检查 failure rule，直接按白名单决定。

## 排查清单

| 现象                             | 检查                                                                        |
| -------------------------------- | --------------------------------------------------------------------------- |
| 上游频繁被熔断                   | 检查 `failure_threshold` 是否过小；是否有规律性失败需要加 failure rule 抑制 |
| 已知好转但熔断状态不解除         | force-close；或调小该上游的 `open_duration`                                 |
| HALF_OPEN 探针请求太密集压垮上游 | 调大 `probe_interval`                                                       |
| 熔断状态进程重启后还在           | 是正常行为（持久化在 DB），如需清空请 force-close                           |
| 某类已知错误不应导致熔断         | 加 `upstream_failure_rules` 规则匹配该错误的状态码 / 响应体特征             |
| force-open 后忘了恢复            | 列表页过滤 `circuit_open`，再 force-close 单条恢复                          |

## 不在本页范围内

- 状态机的转移图、自动 failover 决策序列、健康检查与熔断的协同：见 [`docs/circuit-breaker.md`](/circuit-breaker)。
- 负载均衡如何把熔断 OPEN 的上游从候选剔除：见 [负载均衡与权重](./load-balancing) 的「熔断与并发」一节。
- 一次请求经过哪些阶段、`recordFailure` 何时被调：见 [请求生命周期](../architecture/request-lifecycle) 阶段五与阶段六。
- 错误码 / 状态码与统一错误响应：见 [通过 AutoRouter 调用模型](./invoke-models) 的「响应行为」一节。
