/**
 * 构建期校验：index.html 的内联脚本哈希必须与 server/app.ts 的 CSP 声明一致。
 *
 * 背景：首屏主题初始化脚本以内联形式存在，CSP 用 sha256 精确授权（不使用 unsafe-inline）。
 * 一旦脚本内容（含注释与空白）改动而哈希未同步，浏览器会静默拦截该脚本，
 * 构建与 lint 都不会报错，只在生产环境的控制台出现 CSP 违规。
 *
 * 本脚本在 prebuild 阶段运行：不一致则中止构建，并给出可直接粘贴的哈希值。
 */

import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const htmlPath = path.join(root, "index.html")
const appPath = path.join(root, "server", "app.ts")

const html = readFileSync(htmlPath, "utf8")
const app = readFileSync(appPath, "utf8")

const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(
  (match) => match[1],
)

const declared = new Set(
  [...app.matchAll(/'sha256-([A-Za-z0-9+/=]+)'/g)].map((match) => match[1]),
)

if (inlineScripts.length === 0) {
  console.error("[csp] index.html 未找到内联脚本；若已外置，请同步移除 CSP 中的 sha256 声明。")
  process.exit(1)
}

const computed = new Set()
const missing = []
for (const body of inlineScripts) {
  const hash = createHash("sha256").update(body, "utf8").digest("base64")
  computed.add(hash)
  if (!declared.has(hash)) missing.push(hash)
}

if (missing.length > 0) {
  console.error("[csp] CSP 哈希与 index.html 内联脚本不一致，构建中止。")
  console.error(`[csp] 脚本位置：${path.relative(root, htmlPath)}`)
  console.error(`[csp] 实际哈希：${missing.map((hash) => `'sha256-${hash}'`).join(" ")}`)
  console.error(`[csp] 已声明  ：${[...declared].map((hash) => `'sha256-${hash}'`).join(" ")}`)
  console.error(`[csp] 处理方式：更新 ${path.relative(root, appPath)} 中 script-src 的 sha256 值。`)
  process.exit(1)
}

const stale = [...declared].filter((hash) => !computed.has(hash))
if (stale.length > 0) {
  console.warn(
    `[csp] 提示：CSP 中声明了 ${stale.length} 个未对应任何内联脚本的哈希，可考虑清理。`,
  )
}

console.log(
  `[csp] 校验通过：${inlineScripts.length} 段内联脚本，哈希 ${[...declared].join(", ")}`,
)
