#!/bin/sh
# CLIProxyAPI 受管 sidecar 容器入口脚本。
#
# 读取 CLIPROXY_* 环境变量，将配置模板渲染为实际的 config.yaml，
# 再以工作目录下的 CLIProxyAPI 二进制启动服务。
#
# 模板与本脚本均以只读方式挂入容器，渲染结果写入容器可写层。

set -eu

TEMPLATE="${CLIPROXY_CONFIG_TEMPLATE:-/cliproxy/config.yaml.template}"
TARGET="${CLIPROXY_CONFIG_TARGET:-/CLIProxyAPI/config.yaml}"

# 校验必填凭据。缺失时输出可理解的错误并终止启动。
if [ -z "${CLIPROXY_CLIENT_API_KEY:-}" ]; then
  echo "[cliproxy-entrypoint] 缺少环境变量 CLIPROXY_CLIENT_API_KEY，无法生成 CLIProxyAPI 配置。" >&2
  echo "[cliproxy-entrypoint] 请在 .env 中设置该变量后重新启动。" >&2
  exit 1
fi
if [ -z "${CLIPROXY_MANAGEMENT_KEY:-}" ]; then
  echo "[cliproxy-entrypoint] 缺少环境变量 CLIPROXY_MANAGEMENT_KEY，无法生成 CLIProxyAPI 配置。" >&2
  echo "[cliproxy-entrypoint] 请在 .env 中设置该变量后重新启动。" >&2
  exit 1
fi

if [ ! -f "$TEMPLATE" ]; then
  echo "[cliproxy-entrypoint] 配置模板不存在：$TEMPLATE" >&2
  exit 1
fi

# 带默认值的可选变量。
export CLIPROXY_PORT="${CLIPROXY_PORT:-8317}"
export CLIPROXY_ALLOW_REMOTE="${CLIPROXY_ALLOW_REMOTE:-true}"
export CLIPROXY_PROXY_URL="${CLIPROXY_PROXY_URL:-}"
export CLIPROXY_CLIENT_API_KEY
export CLIPROXY_MANAGEMENT_KEY

# 仅替换本模板使用的占位符，避免误伤模板中其他 $ 字面量。
PLACEHOLDERS='${CLIPROXY_PORT} ${CLIPROXY_ALLOW_REMOTE} ${CLIPROXY_PROXY_URL} ${CLIPROXY_CLIENT_API_KEY} ${CLIPROXY_MANAGEMENT_KEY}'

# 优先使用 envsubst 渲染；alpine 基础镜像默认不含 envsubst，尝试安装 gettext。
if ! command -v envsubst >/dev/null 2>&1; then
  apk add --no-cache gettext >/dev/null 2>&1 || true
fi

if command -v envsubst >/dev/null 2>&1; then
  envsubst "$PLACEHOLDERS" < "$TEMPLATE" > "$TARGET"
  echo "[cliproxy-entrypoint] 已使用 envsubst 渲染配置：$TARGET"
else
  # 回退到 sed 逐个替换占位符。
  sed \
    -e "s|\${CLIPROXY_PORT}|${CLIPROXY_PORT}|g" \
    -e "s|\${CLIPROXY_ALLOW_REMOTE}|${CLIPROXY_ALLOW_REMOTE}|g" \
    -e "s|\${CLIPROXY_PROXY_URL}|${CLIPROXY_PROXY_URL}|g" \
    -e "s|\${CLIPROXY_CLIENT_API_KEY}|${CLIPROXY_CLIENT_API_KEY}|g" \
    -e "s|\${CLIPROXY_MANAGEMENT_KEY}|${CLIPROXY_MANAGEMENT_KEY}|g" \
    "$TEMPLATE" > "$TARGET"
  echo "[cliproxy-entrypoint] 已使用 sed 渲染配置：$TARGET"
fi

# CLIProxyAPI 镜像的工作目录为 /CLIProxyAPI，二进制名为 CLIProxyAPI。
exec ./CLIProxyAPI --config "$TARGET"
