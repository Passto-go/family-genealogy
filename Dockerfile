# syntax=docker/dockerfile:1

# 状态（2026-11-07）：主线部署为阿里云 ECS 上「宿主机 Node 24 直跑 + systemd + nginx」，
# 不使用容器。本文件仅作其他环境部署参考，见 deploy/aliyun.md 的实际部署偏离说明。

# ── 构建阶段：装依赖 + 类型检查 + 前端构建 ──
FROM node:24-slim AS builder
WORKDIR /app

# 优先拷贝依赖清单以利用 Docker 层缓存
COPY package.json package-lock.json ./
RUN npm ci

# 拷贝源码并构建（prebuild 生成安全审计 JSON，随后 vite 构建前端到 dist/）
COPY . .
RUN npm run build

# ── 运行阶段：复用 Node + node:sqlite，数据库落挂载卷 ──
FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

# 运行仅需：node_modules（含 tsx / cross-env）、package.json、server 源码、前端构建产物
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/server ./server
COPY --from=builder /app/dist ./dist

# 数据目录（family.db 与会话密钥 .session-secret）挂到云盘卷以实现持久化
VOLUME ["/app/server/data"]
EXPOSE 3001

# 等价于本地 `npm start`：NODE_ENV=production 下 node-entry 直接托管 dist/
CMD ["npm", "start"]
