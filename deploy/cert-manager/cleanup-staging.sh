#!/usr/bin/env bash
#
# cleanup-staging.sh — 清理 cert-manager 在 staging 验证后留下的产物，或完全卸载 cert-manager
#
# 用法：
#   cleanup-staging.sh <测试域名> [更多域名...]   只清指定域名的验证残留（保留 cert-manager 本体）
#   cleanup-staging.sh --uninstall                完全卸载 cert-manager（回到未安装状态）
#
# 按域名清理范围：
#   - /etc/nginx/sites-enabled/genealogy-<domain>.conf  （必须删：staging 证书不受浏览器信任）
#   - /etc/nginx/certs/<domain>/
#   - ~/.acme.sh/<domain>/（优先 acme.sh --remove）
#   - 统一做一次 nginx -t + reload
#
# 刻意不做（需手工，见脚本结束时的提示）：
#   - 后台「证书域名」里的记录 —— 不删会被 timer 当作待签发重新签回来
#   - 阿里云云解析中可能残留的 _acme-challenge TXT 记录
#
set -euo pipefail

NGINX_CERT_DIR="${NGINX_CERT_DIR:-/etc/nginx/certs}"
NGINX_SITES_DIR="${NGINX_SITES_DIR:-/etc/nginx/sites-enabled}"
NGINX_TEST_CMD="${NGINX_TEST_CMD:-nginx -t}"
NGINX_RELOAD_CMD="${NGINX_RELOAD_CMD:-nginx -s reload}"
ACME_HOME="${ACME_HOME:-$HOME/.acme.sh}"
ENV_FILE="${ENV_FILE:-/etc/cert-manager/env}"
BIN="${BIN:-/usr/local/bin/cert-manager.sh}"
TEMPLATE="${TEMPLATE:-/etc/nginx/genealogy-ssl.template}"

log() { echo "[cleanup] $*"; }
warn() { echo "[cleanup] WARN: $*" >&2; }

# 暂停 timer，避免清理过程中定时任务把刚删的域名重新签回来；退出时自动恢复
TIMER_STOPPED=0
resume_timer() {
  if [[ "$TIMER_STOPPED" == "1" ]]; then
    systemctl start cert-manager.timer >/dev/null 2>&1 || warn "恢复 cert-manager.timer 失败，请手工执行 systemctl start"
    log "已恢复 cert-manager.timer"
  fi
}
trap resume_timer EXIT

pause_timer() {
  if command -v systemctl >/dev/null 2>&1 && \
     systemctl is-active --quiet cert-manager.timer 2>/dev/null; then
    systemctl stop cert-manager.timer >/dev/null 2>&1 || { warn "暂停 timer 失败"; return; }
    TIMER_STOPPED=1
    log "已暂停 cert-manager.timer"
  fi
}

# 先语法校验再 reload，避免坏配置把生产 Nginx 拖垮
nginx_validate_and_reload() {
  if ! eval "$NGINX_TEST_CMD" >/dev/null 2>&1; then
    warn "Nginx 配置校验未通过（$NGINX_TEST_CMD），未执行 reload，请手工检查"
    return 1
  fi
  if ! eval "$NGINX_RELOAD_CMD" >/dev/null 2>&1; then
    warn "Nginx reload 失败，请手工执行 $NGINX_RELOAD_CMD"
    return 1
  fi
  log "Nginx 配置校验通过并已 reload"
}

# 域名格式校验：防止参数被拼接进路径造成误删
valid_domain() {
  [[ "$1" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$ ]]
}

clean_domain() {
  local domain="$1"
  if ! valid_domain "$domain"; then
    warn "跳过非法域名: $domain"
    return 1
  fi
  log "清理域名: $domain"

  local conf="$NGINX_SITES_DIR/genealogy-$domain.conf"
  if [[ -f "$conf" ]]; then rm -f -- "$conf"; log "  已删除 $conf"; fi

  local dest="$NGINX_CERT_DIR/$domain"
  if [[ -d "$dest" ]]; then rm -rf -- "$dest"; log "  已删除 $dest"; fi

  if command -v acme.sh >/dev/null 2>&1 && acme.sh --remove -d "$domain" >/dev/null 2>&1; then
    log "  已移除 acme.sh 中的 $domain 证书与续期配置"
  elif [[ -d "$ACME_HOME/$domain" ]]; then
    rm -rf -- "$ACME_HOME/$domain"
    log "  已删除 $ACME_HOME/$domain"
  fi
  # --remove 只移除本地证书与续期配置，不向 CA 撤销；staging 证书本就无需撤销
}

uninstall() {
  log "完全卸载 cert-manager"
  if command -v systemctl >/dev/null 2>&1; then
    systemctl disable --now cert-manager.timer >/dev/null 2>&1 || true
    rm -f /etc/systemd/system/cert-manager.service /etc/systemd/system/cert-manager.timer
    systemctl daemon-reload >/dev/null 2>&1 || true
    log "  已移除 systemd 单元"
  fi

  # 只删本工具生成的固定前缀配置，不碰用户自有 Nginx 站点
  shopt -s nullglob
  local confs=("$NGINX_SITES_DIR"/genealogy-*.conf)
  shopt -u nullglob
  for conf in "${confs[@]}"; do
    rm -f -- "$conf"
    log "  已删除 $conf"
  done
  nginx_validate_and_reload || true

  rm -f -- "$BIN" "$TEMPLATE" "$ENV_FILE"
  log "  已删除 $BIN / $TEMPLATE / $ENV_FILE（含其中的密钥）"
  log "  保留未动：acme.sh 本体、$NGINX_CERT_DIR 中其它证书、应用容器与数据库"
}

main() {
  if [[ $# -eq 0 ]]; then
    echo "用法: $0 <测试域名> [更多域名...]   # 只清验证残留" >&2
    echo "      $0 --uninstall               # 完全卸载 cert-manager" >&2
    exit 1
  fi

  if [[ "${1:-}" == "--uninstall" ]]; then
    uninstall
    echo ""
    echo "后续手工项："
    echo "  1) 后台「证书域名」删除验证用的域名记录"
    echo "  2) 阿里云云解析检查并删除残留的 _acme-challenge TXT 记录"
    echo "  3) 轮换 AccessKey（若 Secret 曾出现在对话/终端记录中）"
    exit 0
  fi

  pause_timer
  for d in "$@"; do clean_domain "$d" || true; done
  nginx_validate_and_reload || true

  echo ""
  echo "后续手工项（重要）："
  echo "  1) 立刻到后台「证书域名」删除这些域名记录 —— 否则 timer 会把它们当作待签发重新签回来"
  echo "  2) 阿里云云解析检查 _acme-challenge TXT 是否有残留（acme.sh 正常会自动删）"
  echo "  3) 编辑 $ENV_FILE 关闭 STAGING=1；正式域名请在清理完成后重新绑定，切勿直接续用 staging 记录"
  echo "  4) 若 Secret 曾出现在对话/终端记录中，验证通过后轮换 AccessKey"
}

main "$@"
