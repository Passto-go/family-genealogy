#!/usr/bin/env bash
# 更新 cert-manager 的阿里云 DNS AccessKey。
# AccessKey Secret 由操作者在交互终端键盘输入，不回显、不进命令历史、不进日志、不进对话。
# 用法：bash set-cert-key.sh [env 文件路径]
set -euo pipefail

ENV_FILE="${1:-/srv/family-genealogy/secrets/cert-manager.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "错误：找不到 $ENV_FILE" >&2
  exit 1
fi

read -r -p "新 AccessKey ID: " K
read -r -s -p "新 AccessKey Secret（输入不回显）: " S
echo

if [[ -z "$K" || -z "$S" ]]; then
  echo "错误：ID 或 Secret 为空，未做任何修改" >&2
  exit 1
fi

K="$K" S="$S" ENV_FILE="$ENV_FILE" python3 <<'PY'
import os, re

p = os.environ["ENV_FILE"]
s = open(p, encoding="utf-8").read()

def clean(value):
    # 终端「括号粘贴」等控制序列（如 \x1b[200~ ... \x1b[201~）会被 read 一并读入，
    # 写入 env 后 systemd 会静默丢弃含控制字符的整行，导致 acme.sh 报「未设置 Ali_Key」。
    value = re.sub(r"\x1b\[[0-9;]*[A-Za-z~]", "", value)
    return value.replace("\x1b", "").strip()

def upsert(text, key, value):
    pattern = r"(?m)^" + re.escape(key) + r"=.*$"
    if re.search(pattern, text):
        return re.sub(pattern, lambda _: key + "=" + value, text)
    return text.rstrip("\n") + "\n" + key + "=" + value + "\n"

s = upsert(s, "Ali_Key", clean(os.environ["K"]))
s = upsert(s, "Ali_Secret", clean(os.environ["S"]))
with open(p, "w", encoding="utf-8") as f:
    f.write(s)
os.chmod(p, 0o600)
PY

unset K S
echo "已更新 $ENV_FILE 的 Ali_Key / Ali_Secret，权限 600（未打印任何值）"
