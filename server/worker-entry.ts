/**
 * Cloudflare Workers 入口。
 *
 * 与 node-entry.ts 共用同一份 app.ts 路由代码，仅替换数据访问实现为 D1。
 * 启用步骤见 deploy/wrangler.toml 与 README。
 *
 * 当前主线为阿里云 ECS，本入口保留供未来 Cloudflare 迁移参考，不删。
 * 尚未经 wrangler dev 端到端验证，勿视为可直接部署的现成资产；
 * 复核清单见 docs/cloud-adaptation-feasibility.md 第 8 节。
 */

import { createApp, securityHeaderEntries } from "./app.js"
import { createD1Repo, type D1Like } from "./repo/d1.js"
import type { Repo } from "./repo/types.js"
import { ensureSeed } from "./seed.js"

interface Env {
  DB: D1Like
  SESSION_SECRET: string
  INITIAL_ADMIN_PASSWORD?: string
  ASSETS: { fetch(request: Request): Promise<Response> }
}

let seedTask: Promise<void> | null = null

/** 补列迁移：D1 无 ADD COLUMN IF NOT EXISTS，列已存在时按幂等处理 */
async function addColumnIfMissing(env: Env, statement: string): Promise<void> {
  try {
    await env.DB.exec(statement)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!/duplicate column|already exists/i.test(message)) throw error
  }
}

function bootstrap(repo: Repo, env: Env): Promise<void> {
  if (!seedTask) {
    seedTask = (async () => {
      // H4：D1 旧库补齐会话撤销表（新库由 schema.sql 创建）
      await env.DB.exec(
        "CREATE TABLE IF NOT EXISTS revoked_session (jti TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)",
      )
      // 平台级全局配置表（新库由 schema.sql 创建；此处为既有 D1 旧库补齐）
      await env.DB.exec(
        "CREATE TABLE IF NOT EXISTS system_setting (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '')",
      )
      // H1：D1 旧库补齐强制改密列
      await addColumnIfMissing(
        env,
        "ALTER TABLE admin_user ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0",
      )
      // MFA：D1 旧库补齐 TOTP 类型与加密密钥列
      await addColumnIfMissing(
        env,
        "ALTER TABLE admin_user ADD COLUMN mfa_type TEXT NOT NULL DEFAULT 'none'",
      )
      await addColumnIfMissing(
        env,
        "ALTER TABLE admin_user ADD COLUMN mfa_secret TEXT NOT NULL DEFAULT ''",
      )
      // F001：D1 旧库补齐结构性房支房主映射列，避免上云后房支失效
      await addColumnIfMissing(
        env,
        "ALTER TABLE family ADD COLUMN branch_heads TEXT NOT NULL DEFAULT '{}'",
      )
      // 出嫁女子后裔展示开关（默认关）
      await addColumnIfMissing(
        env,
        "ALTER TABLE family ADD COLUMN show_extended_lineage INTEGER NOT NULL DEFAULT 0",
      )
      // 是否在前台公开展示（旧库一律按开启处理，避免族谱突然从前台消失）
      await addColumnIfMissing(
        env,
        "ALTER TABLE family ADD COLUMN is_published INTEGER NOT NULL DEFAULT 1",
      )
      // 谱页是否排入外衍（默认关）
      await addColumnIfMissing(
        env,
        "ALTER TABLE family ADD COLUMN print_include_extended INTEGER NOT NULL DEFAULT 0",
      )
      // 入赘承祧 / 过继取得房分：旧库补齐，默认 0 表示不改变既有口径
      await addColumnIfMissing(
        env,
        "ALTER TABLE member ADD COLUMN is_branch_heir INTEGER NOT NULL DEFAULT 0",
      )
      await ensureSeed(repo, env.INITIAL_ADMIN_PASSWORD)
    })().catch((error) => {
      seedTask = null
      throw error
    })
  }
  return seedTask
}

/** H2：密钥必须显式、安全地提供，拒绝短密钥与占位符，绝不降级 */
function assertSecret(value: string | undefined): string {
  const secret = (value ?? "").trim()
  if (secret.length < 32 || /REPLACE|dev-secret|example|changeme|placeholder/i.test(secret)) {
    throw new Error("SESSION_SECRET 未安全配置")
  }
  return secret
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (!url.pathname.startsWith("/api/")) {
      const response = await env.ASSETS.fetch(request)
      const headers = new Headers(response.headers)
      // H9：静态资源分支绕过 Hono 中间件，需在此单独注入安全响应头
      for (const [name, value] of securityHeaderEntries(url.protocol === "https:")) {
        headers.set(name, value)
      }
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      })
    }

    let secret: string
    try {
      secret = assertSecret(env.SESSION_SECRET)
    } catch {
      return Response.json({ error: "SESSION_SECRET 未安全配置" }, { status: 500 })
    }

    const repo = createD1Repo(env.DB)
    await bootstrap(repo, env)

    const app = createApp(repo, secret)
    return app.fetch(request, env)
  },
}
