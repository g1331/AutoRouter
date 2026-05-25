---
title: HTTPS 与反向代理
outline: deep
---

# HTTPS 与反向代理

AutoRouter 的应用进程只在容器内监听明文 HTTP `3000` 端口，宿主机上默认映射到 `${PORT:-3331}`，本身不承担 TLS 终止。要把服务暴露到公网，需要在前面放一层反向代理负责证书与 TLS 握手。本页给出 Nginx、Caddy、1Panel 三种主流形态的最小可用配置，覆盖 SSE 长连接、流式响应、上传体大小、CORS 配置的衔接关系。

不在本页范围内的内容：环境变量字段说明见 [环境变量参考](./env-reference)；常见网络层问题见 [常见部署问题排查](./troubleshooting)；CLIProxyAPI 出站代理是另外一回事，见 [CLIProxyAPI 出站代理配置](../usage/cliproxy-egress-proxy)。

## 反向代理需要关注的四类行为

把 AutoRouter 摆到代理后面之前，先理清四个会影响反向代理配置的关键行为：

1. **明文 HTTP 上游**：容器内监听 `3000`，宿主机映射到 `${PORT:-3331}`。反向代理与 AutoRouter 之间用明文 HTTP 即可，没必要再做一层 TLS。
2. **SSE / 流式响应**：`/api/proxy/v1/*` 当请求体携带 `stream: true` 时按 `text/event-stream` 返回长连接流。反向代理必须关闭对该路径的缓冲（`proxy_buffering off`），并把读超时调到分钟级，否则首字延迟会被代理缓冲、流式片段丢失或连接被提前关。
3. **长上传 / 大上下文请求体**：聊天接口的请求体在多轮长对话或携带 `tool_calls` 时可能突破默认上限（Nginx 默认 `client_max_body_size 1m`、Caddy 默认 32 MiB），需要按业务上调。
4. **CORS**：AutoRouter 自身代码当前**不会**输出 `Access-Control-Allow-*` 响应头。`.env` 中的 `CORS_ORIGINS` 在 `src/lib/utils/config.ts:40-45` 里只是被解析了一次，没有运行期效果。需要跨域时一律由反向代理层注入响应头。

::: warning CORS_ORIGINS 当前无运行期效果
当前代码里 `corsOrigins` 字段只在 config 解析阶段被读取，没有任何 route handler 或 middleware 据此输出 `Access-Control-Allow-Origin` / `Access-Control-Allow-Methods` 等响应头。若需要从浏览器跨域调用 `/api/proxy/v1/*` 或 `/api/admin/*`，必须在反向代理层（Nginx / Caddy）显式 `add_header Access-Control-Allow-Origin "<origin>"`。这是部署里最容易踩到的环节之一。
:::

## 入站拓扑

最常见的入站拓扑：

```
                 公网 HTTPS (443)
                       │
                       ▼
        ┌──────────────────────────┐
        │  Reverse proxy (TLS 终止) │
        │   Nginx / Caddy / 1Panel │
        └──────────────────────────┘
                       │ 明文 HTTP 127.0.0.1:3331
                       ▼
        ┌──────────────────────────┐
        │  AutoRouter (容器内 3000)│
        └──────────────────────────┘
```

反向代理与 AutoRouter 既可以同机也可以跨机。同机部署时，让 `docker-compose.yml` 中的 `ports:` 只 bind `127.0.0.1`（默认是 `"3331:3000"`，意味着监听所有网卡），减少端口被外网直接探测的攻击面：

```yaml
# docker-compose.override.yml
services:
  autorouter:
    ports:
      - "127.0.0.1:3331:3000"
```

跨机部署时，反向代理通过内网或 VPN 访问 AutoRouter，宿主机防火墙只放行反向代理来源 IP，不让 `3331` 直接对公网开放。

## Nginx 最小配置

下列配置假设：

- 域名 `autorouter.example.com` 已通过 ACME（如 `certbot`）拿到证书，路径 `/etc/letsencrypt/live/autorouter.example.com/{fullchain.pem,privkey.pem}`。
- AutoRouter 容器在同机，明文 `127.0.0.1:3331`。

```nginx
# /etc/nginx/conf.d/autorouter.conf
upstream autorouter_app {
  server 127.0.0.1:3331;
  keepalive 32;
}

server {
  listen 80;
  server_name autorouter.example.com;
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl http2;
  server_name autorouter.example.com;

  ssl_certificate     /etc/letsencrypt/live/autorouter.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/autorouter.example.com/privkey.pem;
  ssl_protocols       TLSv1.2 TLSv1.3;

  client_max_body_size 50m;       # 给长上下文聊天请求体留充足上限

  # 通用反代设置
  proxy_http_version 1.1;
  proxy_set_header Host              $host;
  proxy_set_header X-Real-IP         $remote_addr;
  proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;

  # 默认 location：管理后台与管理 API
  location / {
    proxy_pass http://autorouter_app;

    proxy_read_timeout  120s;
    proxy_send_timeout  120s;
  }

  # SSE / 流式：/api/proxy/v1/* 单独关闭缓冲并放宽超时
  location /api/proxy/ {
    proxy_pass http://autorouter_app;

    proxy_buffering off;
    proxy_cache off;
    chunked_transfer_encoding on;

    proxy_read_timeout  600s;     # 长对话流式响应可能持续数分钟
    proxy_send_timeout  600s;
  }
}
```

关键点：

| 配置项                                    | 作用                                             |
| ----------------------------------------- | ------------------------------------------------ |
| `proxy_buffering off` + `proxy_cache off` | 关闭缓冲，让 SSE 分片实时下推给客户端            |
| `proxy_http_version 1.1` + keepalive      | 复用与 AutoRouter 之间的 HTTP 连接，减少握手开销 |
| `proxy_read_timeout 600s`                 | 长流响应需要更长的读超时，否则 Nginx 主动断流    |
| `client_max_body_size 50m`                | 容许较大请求体；按需调整                         |

`proxy_pass` 必须使用 `http://`（明文），不要加 `;` 之外的额外路径，避免破坏 Next.js 路由处理。

### 加 CORS 时

需要从浏览器跨域调 `/api/proxy/v1/*` 或 `/api/admin/*` 时，在对应 `location` 内加：

```nginx
location /api/ {
  proxy_pass http://autorouter_app;

  if ($request_method = OPTIONS) {
    add_header Access-Control-Allow-Origin      "$http_origin" always;
    add_header Access-Control-Allow-Methods     "GET, POST, PUT, DELETE, PATCH, OPTIONS" always;
    add_header Access-Control-Allow-Headers     "Authorization, Content-Type, X-Goog-Api-Key, X-Api-Key" always;
    add_header Access-Control-Allow-Credentials "true" always;
    add_header Access-Control-Max-Age           "600" always;
    return 204;
  }

  add_header Access-Control-Allow-Origin      "$http_origin" always;
  add_header Access-Control-Allow-Credentials "true" always;

  proxy_buffering off;
  proxy_read_timeout 600s;
}
```

把 `$http_origin` 改为白名单回显或具体域名，避免无条件回显任意来源。生产推荐使用 `map` 块做白名单：

```nginx
map $http_origin $cors_allow {
  default                            "";
  ~^https://app\.example\.com$       $http_origin;
  ~^https://staging\.example\.com$   $http_origin;
}
```

随后把 `add_header Access-Control-Allow-Origin "$cors_allow" always;` 替换原有写法。

## Caddy 最小配置

Caddy 自带 ACME，证书申请与续签全自动。最小 `Caddyfile`：

```caddyfile
autorouter.example.com {
  encode zstd gzip

  # 主体反代到 127.0.0.1:3331
  reverse_proxy 127.0.0.1:3331 {
    flush_interval -1            # 关键：关闭响应缓冲，等价于 nginx proxy_buffering off
    transport http {
      read_timeout  600s
      write_timeout 600s
      keepalive     30s
    }
  }

  request_body {
    max_size 50MB              # 长上下文请求体上限
  }
}
```

`flush_interval -1` 让 Caddy 在每次有数据时立刻 flush 到客户端，是 SSE 流式响应必须的配置。其余默认值已经足够。

需要 CORS 时：

```caddyfile
@cors_origin header_regexp Origin ^https://(app|staging)\.example\.com$

handle /api/* {
  header @cors_origin Access-Control-Allow-Origin "{header.Origin}"
  header @cors_origin Access-Control-Allow-Credentials "true"
  header @cors_origin Access-Control-Allow-Headers "Authorization, Content-Type, X-Goog-Api-Key, X-Api-Key"
  header @cors_origin Access-Control-Allow-Methods "GET, POST, PUT, DELETE, PATCH, OPTIONS"

  @preflight method OPTIONS
  respond @preflight 204

  reverse_proxy 127.0.0.1:3331 {
    flush_interval -1
  }
}
```

## 1Panel 与同类面板

1Panel、宝塔、aaPanel 等面板提供基于 Nginx 的可视化反代。共同套路：

1. **建站时选用站点类型 → 反向代理**：目标地址填 `http://127.0.0.1:3331`。
2. **绑定证书**：上传 ACME 证书或让面板自动签发 Let's Encrypt。
3. **进入站点的「反向代理 → 高级」/「自定义配置」面板**，把下列片段贴入站点配置：

   ```nginx
   client_max_body_size 50m;
   proxy_http_version 1.1;
   proxy_set_header Connection "";

   location /api/proxy/ {
     proxy_pass http://127.0.0.1:3331;
     proxy_buffering off;
     proxy_cache off;
     proxy_read_timeout 600s;
     proxy_send_timeout 600s;
     proxy_set_header Host              $host;
     proxy_set_header X-Real-IP         $remote_addr;
     proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
     proxy_set_header X-Forwarded-Proto $scheme;
   }
   ```

   面板的默认 `location /` 通常无需改动，只需为 `/api/proxy/` 单独加一段。

4. **重启 Nginx**：通过面板触发或 `systemctl reload nginx`。

面板自带的 WAF / 速率限制对 SSE 请求可能误判，初次部署若发现流式响应被截断，先把 WAF 对 `/api/proxy/` 路径放白名单再做下一步排障。

## SSE / 流式：常见破口

流式响应被破坏的典型现象：客户端收到首段 chunk 后等了一段时间才收到剩余内容，或者直接收到 HTTP 502 / 504。逐项排查：

| 现象                                                    | 根因                                           | 修复                                                             |
| ------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------- |
| 全部内容一次到达，没有 chunk                            | 反向代理开了 `proxy_buffering`（Nginx 默认开） | 在 `/api/proxy/` 的 location 内 `proxy_buffering off`            |
| 流到一半 502 / 504                                      | `proxy_read_timeout` 默认 60s 不够长           | 提到 `600s`（视模型而定）                                        |
| 客户端立即断流但本地直连容器正常                        | Caddy 默认会等响应完整才发送                   | `reverse_proxy` 块加 `flush_interval -1`                         |
| CDN 把 `Content-Type: text/event-stream` 当静态资源缓存 | CDN 默认会缓存 200 响应                        | 给 `/api/proxy/` 在 CDN 上配 `Cache-Control: no-store` 或 bypass |

## 端口与 CSRF / 跨站

`/api/admin/*` 用 `Authorization: Bearer <ADMIN_TOKEN>` 鉴权，没有基于 cookie 的会话，因此天然不受 CSRF 影响。`/api/proxy/v1/*` 同理用客户端 API Key 走 Header 鉴权。这意味着反向代理层除非有特殊需要，不必引入 CSRF 防护中间件。

管理后台 UI 把 token 保存在浏览器 sessionStorage，离开标签页即丢失。反向代理层不需要为此加任何配套。

## 来源对照

- `docker-compose.yml`：端口映射默认值 `${PORT:-3331}:3000`
- `src/lib/utils/config.ts`：`corsOrigins` 解析逻辑，确认当前没有运行期 CORS 注入
- `src/app/api/proxy/v1/[...path]/route.ts`：`/api/proxy/v1/*` 在 `stream: true` 下走 SSE 路径
- `src/app/api/admin/*` 与 `src/lib/utils/api-auth.ts`：管理 API 用 Bearer Token 鉴权而非 cookie
