#!/usr/bin/env node
/* 演示站构建收尾：demo.html 改名为 index.html，并复制一份 404.html。
 *
 * 演示构建以 demo.html 作入口（不碰主应用的 index.html），但子路径静态托管
 * （GitHub Pages 等）默认只认目录下的 index.html，故构建后改名；
 * 应用用 history 路由，深链与刷新需要托管方回退到 404.html，故再复制一份。
 *
 * 用法：node scripts/finalize-demo-build.mjs
 */

import { copyFileSync, existsSync, renameSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const OUT = join(ROOT, "dist-demo")
const FROM = join(OUT, "demo.html")
const INDEX = join(OUT, "index.html")
const FALLBACK = join(OUT, "404.html")

if (!existsSync(FROM)) {
  console.error(`未找到 ${FROM}，请先执行演示构建`)
  process.exit(1)
}

renameSync(FROM, INDEX)
copyFileSync(INDEX, FALLBACK)
console.log(`已生成 ${INDEX}`)
console.log(`已生成 ${FALLBACK}`)
