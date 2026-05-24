---
title: 安全模型
outline: deep
---

# 安全模型

AutoRouter 同时承担两类敏感数据：客户端 API Key（用户用来请求代理服务的凭据）和上游 API Key（AutoRouter 用来调用 OpenAI、Anthropic 等服务商的凭据）。两类凭据的保护策略不同：客户端 Key 使用 bcrypt 单向哈希存储，配合 Fernet 密文实现可控的「揭示」能力；上游 Key 必须能被解密用于实际转发，因此采用 Fernet 对称加密。

本文档梳理项目当前的安全机制：管理员鉴权、客户端 Key 哈希与揭示、上游 Key 加密、SSRF 三重校验，以及登录会话与中间件的边界划分。

## 管理员鉴权

管理员通过环境变量 `ADMIN_TOKEN` 配置静态 Bearer Token。`src/lib/utils/config.ts:25` 用 Zod schema 约束其非空：

```ts
adminToken: z.string().min(1).optional(),
```

`config.ts:124-130` 的 `validateAdminToken` 直接做字符串相等比对：

```ts
export function validateAdminToken(token: string | null): boolean {
  if (!config.adminToken) {
    return false; // 未配置时拒绝所有访问
  }
  return token === config.adminToken;
}
```

请求侧封装在 `src/lib/utils/auth.ts:70-73` 的 `validateAdminAuth`：先从 `Authorization` 头中通过 `extractApiKey` 提取（同时支持 `Bearer <token>` 和原始 token 两种形式，见 `auth.ts:40-52`），再交给 `validateAdminToken`。

所有 `/api/admin/*` 路由都在入口处调用这个函数。以 `src/app/api/admin/keys/route.ts:42-45` 的 GET 为例：

```ts
const authHeader = request.headers.get("authorization");
if (!validateAdminAuth(authHeader)) {
  return errorResponse("Unauthorized", 401);
}
```

::: warning Token 是单值密钥
当前未实现多管理员或细粒度权限。`ADMIN_TOKEN` 是单一全局密钥，任何持有该值的客户端都拥有全部管理员能力。生产环境务必使用足够强的随机值，并通过 `.env` 文件或密钥管理工具下发，避免明文出现在 shell 历史或镜像里。
:::

## 客户端 API Key 双轨存储

每条 API Key 在 `api_keys` 表里同时落两个字段（`src/lib/db/schema-pg.ts:48-49`）：

| 字段                  | 用途                                                  |
| --------------------- | ----------------------------------------------------- |
| `key_hash`            | bcrypt 哈希，cost factor 12，用于请求时的常量时间验证 |
| `key_value_encrypted` | Fernet 密文，用于「揭示」时还原明文                   |

bcrypt 由 `src/lib/utils/auth.ts:5-30` 封装：

```ts
const BCRYPT_ROUNDS = 12;

export async function hashApiKey(key: string): Promise<string> {
  return bcryptjs.hash(key, BCRYPT_ROUNDS);
}

export async function verifyApiKey(key: string, hash: string): Promise<boolean> {
  try {
    return await bcryptjs.compare(key, hash);
  } catch {
    return false;
  }
}
```

### 创建时

`src/lib/services/key-manager.ts:286-303` 生成明文 Key，并行计算 bcrypt 哈希与 Fernet 密文，连同前 12 字符 `keyPrefix`（用于查询时缩小候选范围）一起入库：

```ts
const keyValue = generateApiKey();
const keyPrefix = keyValue.slice(0, 12); // 'sk-auto-xxxx'
const keyHash = await hashApiKey(keyValue); // bcrypt
const keyValueEncrypted = encrypt(keyValue); // Fernet
```

### 转发时的验证

代理路由 `src/app/api/proxy/v1/[...path]/route.ts:2452-2473` 用前缀查候选行，再对候选逐条 bcrypt 比对：

```ts
const keyPrefix = getKeyPrefix(keyValue);
const candidates = await db.query.apiKeys.findMany({
  where: and(eq(apiKeys.keyPrefix, keyPrefix), eq(apiKeys.isActive, true)),
});

for (const candidate of candidates) {
  const isValid = await verifyApiKey(keyValue, candidate.keyHash);
  if (isValid) {
    if (candidate.expiresAt && candidate.expiresAt < new Date()) {
      return NextResponse.json({ error: "API key has expired" }, { status: 401 });
    }
    validApiKey = candidate;
    break;
  }
}
```

前缀索引把 bcrypt 比对次数从「所有活跃 Key」降到「同前缀候选」，正常情况下只有 1 条记录。

### 揭示（可选能力）

`ALLOW_KEY_REVEAL=true` 时管理员可以通过 `/api/admin/keys/:id/reveal` 拿回明文。`src/app/api/admin/keys/[id]/reveal/route.ts:27-36` 做两道闸门：

```ts
const authHeader = request.headers.get("authorization");
if (!validateAdminAuth(authHeader)) {
  return errorResponse("Unauthorized", 401);
}
if (!config.allowKeyReveal) {
  return errorResponse("Key reveal is disabled. ...", 403);
}
```

通过后调用 `revealApiKey`，内部在 `src/lib/utils/auth.ts:83-108` 先 `decrypt(encryptedKey)`，再用 `verifyApiKey(decryptedKey, keyHash)` 做 bcrypt 二次校验，防止数据库被篡改。

`ALLOW_KEY_REVEAL` 默认 `false`（`config.ts:31`），即使管理员通过鉴权也无法揭示，需要显式开启。

::: tip 历史 Legacy Key
存量数据中可能有只存了 `key_hash`、没有 `key_value_encrypted` 的 Legacy Key（早期版本）。`revealApiKey` 在 `auth.ts:84-86` 直接抛 `LegacyApiKeyError`，揭示路由返回 400「Legacy keys (bcrypt-only) cannot be revealed」。
:::

## 上游 API Key Fernet 加密

上游 Key 必须能解密回明文用于实际转发，因此使用对称加密。AutoRouter 自实现了 Fernet 兼容格式（`src/lib/utils/encryption.ts`），不依赖第三方库。

### 密钥与格式

`encryption.ts:6-17` 注释定义的 Fernet 帧格式：

| 段          | 长度     | 说明                                          |
| ----------- | -------- | --------------------------------------------- |
| Version     | 1 byte   | 固定 `0x80`                                   |
| Timestamp   | 8 bytes  | big-endian 秒级 Unix 时间，可用于未来扩展过期 |
| IV          | 16 bytes | 随机初始化向量                                |
| Ciphertext  | 变长     | AES-128-CBC，PKCS7 padding                    |
| HMAC-SHA256 | 32 bytes | 对前四段做认证                                |

`ENCRYPTION_KEY` 是一个 base64 编码的 32 字节密钥（44 个字符含 padding）。`encryption.ts:35-68` 的 `loadEncryptionKey` 按下面顺序加载：

```ts
const keyStr = process.env.ENCRYPTION_KEY;
const keyFile = process.env.ENCRYPTION_KEY_FILE;
// 优先环境变量，未设置时从 ENCRYPTION_KEY_FILE 指向的文件读取
```

base64 解码后必须恰好 32 字节，前 16 字节作 HMAC signing key，后 16 字节作 AES encrypt key（`encryption.ts:60-64`）。

### 加解密

`encrypt`（`encryption.ts:85-109`）：

1. 生成 16 字节随机 IV、当前时间戳
2. AES-128-CBC 加密明文
3. 拼接 `version + timestamp + iv + ciphertext` 作为 HMAC 输入
4. 用 signing key 计算 HMAC-SHA256
5. 整帧编码为 base64

`decrypt`（`encryption.ts:117-161`）：解析五段、校验 version、计算 HMAC 并用常量时间 `.equals()` 比对（`encryption.ts:146`），失败抛 `EncryptionError("HMAC verification failed")`，校验通过后 AES 解密。

### 调用点

上游 Key 字段为 `upstreams.api_key_encrypted`（`schema-pg.ts:81`）。

| 操作             | 文件位置                                                                       |
| ---------------- | ------------------------------------------------------------------------------ |
| 创建时加密       | `src/lib/services/upstream-crud.ts:480`（`encrypt(apiKey)`）                   |
| 更新时加密       | `upstream-crud.ts:575`（仅在请求带 `apiKey` 时改写）                           |
| 转发时解密       | `src/lib/services/proxy-client.ts:1293`（`decrypt(upstream.apiKeyEncrypted)`） |
| 健康检查解密     | `src/lib/services/health-checker.ts:283,559`                                   |
| 管理面板掩码展示 | `upstream-crud.ts:759`（取明文后做星号掩码再返回）                             |

### `ENCRYPTION_KEY` 丢失的影响

`encryption.ts:51-56` 在密钥未配置时直接抛错：

```ts
throw new EncryptionError(
  "ENCRYPTION_KEY is required. " +
    "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\""
);
```

任何加解密调用都会 fail-fast——服务启动后第一次访问加密路径就会 5xx。

如果丢失的是旧 `ENCRYPTION_KEY`（被新值替换），所有存量的上游 Key 密文都将无法解密，但 bcrypt 哈希的客户端 Key 不受影响。**该密钥务必随同数据库一起做备份**，否则只能让管理员重新填一遍上游 Key。

## SSRF 三重校验

`src/lib/services/upstream-ssrf-validator.ts` 实现三层校验，按调用顺序逐层加固，对应外部用户填入上游地址时可能出现的攻击面。

### 第一层 `isIpSafe`：IP 段拦截

`upstream-ssrf-validator.ts:7-63`，对原始 IP 字符串做拦截：

| 范围                                            | 拦截原因                                                              |
| ----------------------------------------------- | --------------------------------------------------------------------- |
| `127.0.0.0/8`、`::1`                            | loopback，防止读到本机服务                                            |
| `10.0.0.0/8`、`172.16.0.0/12`、`192.168.0.0/16` | IPv4 私网                                                             |
| `169.254.0.0/16`                                | link-local，覆盖 AWS / GCP / Azure 元数据端点（如 `169.254.169.254`） |
| `fc00::/7`、`fd00::/7`                          | IPv6 ULA 私有                                                         |
| `fe80::/10`                                     | IPv6 link-local                                                       |
| `ff00::/8`                                      | IPv6 multicast                                                        |
| `::ffff:x.x.x.x`、`::x.x.x.x`                   | IPv4-mapped / IPv4-compatible IPv6                                    |

### 第二层 `isUrlSafe`：URL 协议与字符串 hostname

`upstream-ssrf-validator.ts:69-94`：

```ts
if (url.protocol !== "http:" && url.protocol !== "https:") {
  return { safe: false, reason: "Only HTTP and HTTPS protocols are allowed" };
}

if (hostname === "localhost") {
  return { safe: false, reason: "Loopback addresses are not allowed" };
}

if (hostname.match(/^[\d.:]+$/)) {
  return isIpSafe(hostname);
}
```

仅允许 `http:` / `https:`（屏蔽 `file:` / `gopher:` / `ftp:` 等高风险协议），并把字符串形式的 IP 转给第一层处理。

### 第三层 `resolveAndValidateHostname`：DNS 解析

`upstream-ssrf-validator.ts:99-153`，防御 DNS rebinding。对域名依次尝试 `resolve4` / `resolve6` / `lookup`，把解析出的全部 IP 都交给 `isIpSafe` 验证：

```ts
for (const ip of addresses) {
  const ipCheck = isIpSafe(ip);
  if (!ipCheck.safe) {
    return {
      safe: false,
      reason: `Hostname resolves to blocked IP: ${ipCheck.reason}`,
    };
  }
}
```

解析失败也视为不安全（`upstream-ssrf-validator.ts:129-131`）。只验前两层会被解析到 `127.0.0.1` 的私有域名绕过，第三层补上这道闸。

### 调用点

| 场景                        | 文件:行                                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 上游连通性测试              | `upstream-connection-tester.ts:375`（`isUrlSafe`）、`:392`（`resolveAndValidateHostname`）                                           |
| 上游探针                    | `upstream-probe-service.ts:310`、`:316`                                                                                              |
| CPA `external` 模式实例创建 | `cliproxy-instance-crud.ts:121`（仅 `isUrlSafe`，参见 [CLIProxyAPI 集成位置](./cliproxy-integration#受管-sidecar-与外部服务的差异)） |

CPA `managed` 模式跳过 SSRF 校验，因为 sidecar 故意需要走 Docker 内网容器服务名，那条路径上 SSRF 不构成实际威胁。

## CORS

`CORS_ORIGINS` 在 `config.ts:42-45` 解析为字符串数组：

```ts
corsOrigins: z
  .string()
  .optional()
  .transform((s) => (s ? s.split(",").map((o) => o.trim()) : ["http://localhost:3000"])),
```

未设置时默认 `["http://localhost:3000"]`。该字段在 `config.ts` 中定义，但在当前中间件层（`src/proxy.ts`）和各 API 路由中没有引用——CORS 处理目前依赖 Next.js 自身的默认行为，并未基于 `config.corsOrigins` 做白名单。生产部署若需要严格 CORS，建议在反向代理层（Nginx / Caddy）配置。

## 中间件层

`src/proxy.ts` 是 Next.js 的 middleware 入口，仅做 i18n：

```ts
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  matcher: ["/((?!_next|api|.*\\..*).*)"],
};
```

`matcher` 明确排除 `/api/*`，因此鉴权、CORS、SSRF 校验全部在各 API 路由内联完成，没有中央拦截层。这种约定下新增 admin 路由时务必手动加上 `validateAdminAuth` 调用，避免遗漏。

## 登录会话

管理员登录流程极简，不依赖 JWT / iron-session / Cookie。

`src/app/[locale]/(auth)/login/page.tsx:144-147`：用户输入 token 后构造临时 `createApiClient` 调 `/admin/keys?page=1&page_size=1` 探测；探测通过则调 `setToken(inputValue)`。

`src/providers/auth-provider.tsx:18,71-75`：

```ts
const STORAGE_KEY = "admin_token";

const setToken = useCallback((newToken: string) => {
  sessionStorage.setItem(STORAGE_KEY, newToken);
  window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
}, []);
```

Token 完全存在浏览器 `sessionStorage`，使用 React `useSyncExternalStore`（`auth-provider.tsx:59`）订阅 `storage` 事件以保持多组件同步。每次 API 请求由 `auth-provider.tsx:101-104` 的 `createApiClient` 用 `getToken: () => token` 回调读取并拼成 `Authorization: Bearer <token>`。

`auth-provider.tsx:91-98` 的 `handleUnauthorized` 在收到 401 时清掉 `sessionStorage` 并跳回 `/login`：

```ts
const handleUnauthorized = useCallback(() => {
  if (pathname === "/login") return;
  clearToken();
  toast.error("认证已过期，请重新登录");
  router.push("/login");
}, [clearToken, pathname, router]);
```

::: tip sessionStorage 而非 localStorage
关闭浏览器标签页就丢失登录态。短期 / 单次操作场景下足够，但不支持「保持登录」语义。如果未来需要长期会话，需引入正式的 session 存储机制并配套 CSRF 防护。
:::

## 与其他架构文档的衔接

- 数据表 schema（含 `api_keys` / `upstreams` / `cliproxy_instances` 字段细节）见 [数据库 schema](./database-schema)
- 上游连通性测试与健康检查的调用流程见 [上游模型](./upstream-model)、[失败转移与熔断](./failover-circuit)
- CPA 实例凭据加密与 `managed` / `external` 校验差异见 [CLIProxyAPI 集成位置](./cliproxy-integration)
