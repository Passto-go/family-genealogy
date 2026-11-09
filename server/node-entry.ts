import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { serve } from "@hono/node-server"
import { serveStatic } from "@hono/node-server/serve-static"
import { createApp } from "./app.js"
import { resolveSecret } from "./auth.js"
import { createLocalRepo } from "./repo/local.js"
import { ensureSeed } from "./seed.js"

const here = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(here, "..")
const dataDir = path.join(projectRoot, "server", "data")
const distDir = path.join(projectRoot, "dist")

fs.mkdirSync(dataDir, { recursive: true })

function loadSecret(): string {
  const env = process.env.SESSION_SECRET?.trim()
  if (env && env.length >= 32 && !/REPLACE|dev-secret|example|changeme|placeholder/i.test(env)) {
    return env
  }
  const secretFile = path.join(dataDir, ".session-secret")
  if (fs.existsSync(secretFile)) {
    const saved = fs.readFileSync(secretFile, "utf8").trim()
    if (saved.length >= 32) return saved
  }
  // 开发环境：生成并持久化到 .session-secret 文件，跨重启保持稳定（本地盘 / 持久卷场景）。
  // 生产环境：禁止静默生成随机密钥——否则容器重启即换密钥，已签发会话全部失效、且令牌可被用新密钥重签。
  // 因此生产必须在环境变量显式配置 SESSION_SECRET（≥32 位、非占位符），缺失则直接拒绝启动。
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "生产环境未配置 SESSION_SECRET：请在环境变量中提供 ≥32 位随机串（容器/Workers 密钥或 wrangler secret），已拒绝启动以避免重启换密钥导致会话失效与令牌可被重签。",
    )
  }
  const generated = `${crypto.randomUUID()}${crypto.randomUUID()}`
  fs.writeFileSync(secretFile, generated, { mode: 0o600 })
  return generated
}

const dbFile = process.env.DATABASE_FILE ?? path.join(dataDir, "family.db")
const repo = createLocalRepo(dbFile)
await ensureSeed(repo, process.env.INITIAL_ADMIN_PASSWORD)

const app = createApp(repo, resolveSecret(loadSecret()))

const isProduction = process.env.NODE_ENV === "production"
if (isProduction && fs.existsSync(distDir)) {
  app.use("/*", serveStatic({ root: distDir }))
  app.get("*", serveStatic({ root: distDir, path: "index.html" }))
}

const port = Number(process.env.PORT ?? 3001)

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`\n  家族族谱 · 服务已启动`)
  console.log(`  接口  http://localhost:${info.port}/api/health`)
  if (isProduction) {
    console.log(`  站点  http://localhost:${info.port}`)
  } else {
    console.log(`  前端  http://localhost:5173  (由 Vite 提供)`)
  }
  console.log(`  数据  ${dbFile}\n`)
})
