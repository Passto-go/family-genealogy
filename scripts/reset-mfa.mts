/**
 * 本地紧急重置：清除指定管理员的登录验证器（MFA）。
 *
 * 方案 B（无恢复码）下，「超级管理员自己丢失验证器设备」的唯一退路就是本机直接改库，
 * 因此本脚本故意只作为命令行工具存在，**绝不暴露为 HTTP 接口**，以免成为绕过 MFA 的攻击面。
 *
 * 用法：
 *   tsx scripts/reset-mfa.mts --user <用户名>
 *   # 或指定数据库文件（与 server/node-entry.ts 的默认值一致）：
 *   DATABASE_FILE=/path/to/family.db tsx scripts/reset-mfa.mts --user admin
 *
 * 执行等价 SQL：
 *   UPDATE admin_user SET mfa_type='none', mfa_secret='' WHERE username=?
 *
 * 注意：重置后该管理员下次登录只需账号密码，请尽快重新绑定验证器。
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createLocalRepo } from "../server/repo/local.js"

function parseUser(argv: string[]): string | null {
  const i = argv.indexOf("--user")
  if (i >= 0 && argv[i + 1]) return argv[i + 1]
  const eq = argv.find((a) => a.startsWith("--user="))
  return eq ? eq.slice("--user=".length) : null
}

async function main() {
  const username = parseUser(process.argv.slice(2))
  if (!username) {
    console.error("用法: tsx scripts/reset-mfa.mts --user <用户名>")
    process.exit(2)
  }

  const here = path.dirname(fileURLToPath(import.meta.url))
  const projectRoot = path.resolve(here, "..")
  const dataDir = path.join(projectRoot, "server", "data")
  const dbFile = process.env.DATABASE_FILE ?? path.join(dataDir, "family.db")

  if (!fs.existsSync(dbFile)) {
    console.error(`数据库文件不存在: ${dbFile}`)
    process.exit(1)
  }

  const repo = createLocalRepo(dbFile)
  const admin = await repo.getAdminByUsername(username)
  if (!admin) {
    console.error(`管理员不存在: ${username}`)
    process.exit(1)
  }

  await repo.disableMfa(admin.id)
  console.log(`已清除 ${username}（id=${admin.id}）的登录验证器。该账号下次登录仅需账号密码，请尽快重新绑定。`)
  process.exit(0)
}

main().catch((err) => {
  console.error("重置失败:", err instanceof Error ? err.message : err)
  process.exit(1)
})
