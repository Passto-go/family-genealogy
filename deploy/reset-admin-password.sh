#!/usr/bin/env bash
# 重置 admin 超管密码：read -s 不回显输入，PBKDF2-SHA256 生成哈希后直接更新数据库。
# 与 server/auth.ts 的 hashPassword 算法一致（150000 次迭代，b64url 编码）。
# 用法：bash reset-admin-password.sh [数据库路径]
set -euo pipefail
DB="${1:-/srv/family-genealogy/data/family.db}"

if [[ -n "${ADMIN_NEW_PASSWORD:-}" ]]; then
  # 非交互模式：由运维通道注入，仅用于临时口令重置
  P="$ADMIN_NEW_PASSWORD"
else
  read -r -s -p "输入 admin 新密码（至少 8 位）: " P
  echo
  read -r -s -p "再输入一次确认: " P2
  echo
  if [[ "$P" != "$P2" ]]; then
    echo "错误：两次输入不一致"
    exit 1
  fi
fi
if [[ ${#P} -lt 8 ]]; then
  echo "错误：密码至少 8 位"
  exit 1
fi

P="$P" DB="$DB" node --input-type=module <<'NODE'
import { DatabaseSync } from "node:sqlite";

const pwd = process.env.P;
const dbFile = process.env.DB;
const enc = new TextEncoder();

const salt = crypto.getRandomValues(new Uint8Array(16));
const key = await crypto.subtle.importKey("raw", enc.encode(pwd), "PBKDF2", false, ["deriveBits"]);
const bits = await crypto.subtle.deriveBits(
  { name: "PBKDF2", salt, iterations: 150000, hash: "SHA-256" },
  key,
  256,
);
const b64 = (b) => Buffer.from(b).toString("base64url");
const hash = `pbkdf2$${150000}$${b64(salt)}$${b64(new Uint8Array(bits))}`;

const db = new DatabaseSync(dbFile);
const r = db
  .prepare("UPDATE admin_user SET password_hash = ?, must_change_password = 1 WHERE username = ?")
  .run(hash, "admin");
console.log(`已重置 admin 密码（影响 ${r.changes} 行），登录后请立即修改密码。`);
NODE

unset P P2
