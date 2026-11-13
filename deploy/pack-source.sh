#!/usr/bin/env bash
# 打包源码用于 ECS 部署。集中维护排除项，避免手工敲 tar 时漏项。
#
# 用法：bash deploy/pack-source.sh [输出路径]
# 默认输出：/tmp/genealogy-src.tar.gz
#
# 排除原则：
#   - 依赖 / 构建产物：node_modules、dist（ECS 上自行 npm ci + npm run build）
#   - 版本库与本地数据：.git、server/data、*.db*、.session-secret、.env*
#   - 本地工具与编辑器残留：.codebuddy、.workbench-bin、._*、.DS_Store
#     （2026-11-09 首次部署时曾把这些打进包，迁移后需额外清理）
#   - 公开仓导出目录：.publish（脱敏副本，与线上部署无关）
#   - 微信小程序：miniprogram（独立项目，源码不随网页部署上传 ECS）
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${1:-/tmp/genealogy-src.tar.gz}"

cd "$ROOT"
tar czf "$OUT" \
  --exclude='./node_modules' \
  --exclude='./dist' \
  --exclude='./.git' \
  --exclude='./server/data' \
  --exclude='./.env*' \
  --exclude='*.db*' \
  --exclude='.session-secret' \
  --exclude='./.codebuddy' \
  --exclude='./.workbench-bin' \
  --exclude='./.publish' \
  --exclude='./miniprogram' \
  --exclude='._*' \
  --exclude='.DS_Store' \
  -C . .

echo "已打包: $OUT ($(du -h "$OUT" | cut -f1))"
echo "上传示例:"
echo "  workbench upload $OUT /tmp/genealogy-src.tar.gz -i <instance-id> -r cn-shanghai --force"
echo "ECS 解压后建议执行（GNU tar 对 macOS 扩展属性头只告警、不影响结果）："
echo "  find . -name '._*' -delete && find . -name '.DS_Store' -delete"
