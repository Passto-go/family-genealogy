#!/usr/bin/env bash
#
# cert-manager.sh — 族谱服务自动 TLS 证书签发/续期（DNS-01 / acme.sh / 阿里云 DNS）
#
# 由 systemd timer 每 6 小时调用一次：轮询后端内部接口 → 调 acme.sh 签发 →
# 部署到 Nginx 证书目录 + 生成站点配置 + reload → 回写状态。
#
# 凭证（INTERNAL_API_TOKEN / Ali_Key / Ali_Secret）一律来自环境变量，绝不写死在脚本里。
#
set -euo pipefail

# ─── 配置（均可经环境变量覆盖） ─────────────────────────────
APP_URL="${APP_URL:-http://127.0.0.1:3001}"
INTERNAL_TOKEN="${INTERNAL_API_TOKEN:-}"
NGINX_CERT_DIR="${NGINX_CERT_DIR:-/etc/nginx/certs}"
NGINX_SITES_DIR="${NGINX_SITES_DIR:-/etc/nginx/sites-enabled}"
NGINX_TEMPLATE="${NGINX_TEMPLATE:-/etc/nginx/genealogy-ssl.template}"
NGINX_TEST_CMD="${NGINX_TEST_CMD:-nginx -t}"
NGINX_RELOAD_CMD="${NGINX_RELOAD_CMD:-nginx -s reload}"
ACME_HOME="${ACME_HOME:-$HOME/.acme.sh}"
CERT_KEY_LENGTH="${CERT_KEY_LENGTH:-4096}"
RENEW_DAYS="${RENEW_DAYS:-30}"
LOG_FILE="${LOG_FILE:-/var/log/cert-manager.log}"

# acme.sh 默认 CA 是 ZeroSSL（需注册邮箱/EAB 凭证），与本项目的 Let's Encrypt 口径不符。
# 正式签发显式指定 letsencrypt；staging 模式下 --staging 本身即指向 LE 测试 CA，不再叠加。
STAGING_FLAG=""
CA_FLAG="--server letsencrypt"
if [[ -n "${STAGING:-}" ]]; then
  STAGING_FLAG="--staging"
  CA_FLAG=""
fi

# 阿里云 DNS API 凭证：供 acme.sh 的 dns_ali 插件读取（仅本脚本/环境可见）
export Ali_Key="${Ali_Key:-}"
export Ali_Secret="${Ali_Secret:-}"

log() { echo "[$(date '+%F %T')] $*" | tee -a "$LOG_FILE"; }

# ─── 前置检查 ───────────────────────────────────────────────
if [[ -z "$INTERNAL_TOKEN" ]]; then log "ERROR: 未设置 INTERNAL_API_TOKEN"; exit 1; fi
if ! command -v acme.sh >/dev/null 2>&1; then log "ERROR: 未找到 acme.sh，请先安装（见 README）"; exit 1; fi
if [[ -z "$Ali_Key" || -z "$Ali_Secret" ]]; then log "ERROR: 未设置 Ali_Key / Ali_Secret"; exit 1; fi
mkdir -p "$(dirname "$LOG_FILE")"

# ─── 与后端通信 ─────────────────────────────────────────────
post_status() {
  local id="$1" status="$2" expiry="$3" cert="$4" err="$5"
  local json
  json=$(python3 - "$id" "$status" "$expiry" "$cert" "$err" <<'PY'
import json, sys
print(json.dumps({
  "status": sys.argv[2],
  "expiryDate": sys.argv[3],
  "certPath": sys.argv[4],
  "lastError": sys.argv[5],
}))
PY
)
  if curl -fsS -X POST "$APP_URL/api/internal/domains/$id/status" \
       -H "Authorization: Bearer $INTERNAL_TOKEN" \
       -H 'Content-Type: application/json' -d "$json" >/dev/null 2>&1; then
    log "  已回写状态: $status"
  else
    log "  WARN: 回写状态失败 (id=$id)"
  fi
}

# ─── 签发 / 续期单个域名 ────────────────────────────────────
issue_domain() {
  local id="$1" domain="$2"
  log "处理域名: $domain (id=$id)"

  # 标记签发中，避免并发/重复处理
  post_status "$id" "issuing" "" "" ""

  local acme_out
  if ! acme_out=$(acme.sh --issue --dns dns_ali -d "$domain" $STAGING_FLAG $CA_FLAG \
        --keylength "$CERT_KEY_LENGTH" --nocron --log 2>&1); then
    log "  acme.sh 签发失败:\n$acme_out"
    post_status "$id" "failed" "" "" "${acme_out:0:500}"
    return 1
  fi
  log "  acme.sh 签发成功"

  local src="$ACME_HOME/$domain"
  local dest="$NGINX_CERT_DIR/$domain"
  mkdir -p "$dest"
  cp "$src/fullchain.cer" "$dest/fullchain.pem"
  cp "$src/$domain.key" "$dest/privkey.pem"

  # 渲染 Nginx 站点配置
  local conf="$NGINX_SITES_DIR/genealogy-$domain.conf"
  sed -e "s#__DOMAIN__#$domain#g" \
      -e "s#__CERT__#$dest/fullchain.pem#g" \
      -e "s#__KEY__#$dest/privkey.pem#g" \
      "$NGINX_TEMPLATE" > "$conf"
  log "  已生成 Nginx 配置: $conf"

  # 新配置已落盘，先做语法预检；失败立即回滚，避免坏配置把生产 Nginx 拖垮
  if ! eval "$NGINX_TEST_CMD" >/dev/null 2>&1; then
    rm -f -- "$conf"
    eval "$NGINX_RELOAD_CMD" >/dev/null 2>&1 || true
    log "  ERROR: 新站点配置未通过 Nginx 语法校验，已回滚该配置"
    post_status "$id" "failed" "" "" "Nginx 配置语法校验失败，已回滚站点配置"
    return 1
  fi

  if ! eval "$NGINX_RELOAD_CMD"; then
    log "  WARN: Nginx reload 失败，请检查配置"
  else
    log "  Nginx 已 reload"
  fi

  # 解析到期时间（ISO 8601 UTC）
  local expiry_iso=""
  if [[ -f "$dest/fullchain.pem" ]]; then
    local enddate
    enddate=$(openssl x509 -in "$dest/fullchain.pem" -noout -enddate | sed 's/notAfter=//')
    expiry_iso=$(date -u -d "$enddate" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null \
      || date -u -j -f "%b %d %H:%M:%S %Y %Z" "$enddate" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null \
      || echo "")
  fi

  post_status "$id" "active" "$expiry_iso" "$dest/fullchain.pem" ""
  log "  完成: $domain 已生效，到期 $expiry_iso"
}

# ─── 主流程 ─────────────────────────────────────────────────
case "${1:-run}" in
  run)
    resp=$(curl -fsS "$APP_URL/api/internal/domains/due" \
      -H "Authorization: Bearer $INTERNAL_TOKEN") \
      || { log "ERROR: 拉取待处理域名失败"; exit 1; }
    # 用 % 格式化而非带转义的 f-string：f-string 表达式中不允许反斜杠（Python < 3.12 会语法错误）
    if ! pairs=$(echo "$resp" | python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
except Exception:
    data = {}
for d in data.get("domains", []):
    print("%s\t%s" % (d["id"], d["domain"]))
'); then
      log "ERROR: 解析待处理域名响应失败"
      exit 1
    fi
    if [[ -z "$pairs" ]]; then log "无待处理域名"; exit 0; fi
    mapfile -t PAIRS <<< "$pairs"
    for line in "${PAIRS[@]}"; do
      IFS=$'\t' read -r id domain <<< "$line"
      issue_domain "$id" "$domain" || true
    done
    ;;
  issue)
    [[ $# -ge 3 ]] || { log "用法: cert-manager.sh issue <domain> <id>"; exit 1; }
    issue_domain "$2" "$3"
    ;;
  *)
    log "用法: cert-manager.sh [run|issue <domain> <id>]"
    exit 1
    ;;
esac
