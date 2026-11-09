#!/usr/bin/env node
/* 生成只读 demo 用的静态数据。
 *
 * 做法：在临时库里跑一次示例数据初始化，把前台需要的几类响应导出成 JSON，
 * 供 src/demo 的拦截层直接返回。数据全部来自 server/seed.ts 的虚构示例族谱，
 * 不读取也不包含任何真实族谱内容。
 *
 * 用法：npx tsx scripts/gen-demo-data.mts
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createLocalRepo } from "../server/repo/local.js"
import { ensureSeed } from "../server/seed.js"
import { computeVisibleLineageIds } from "../src/lib/types.js"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
// 临时库放系统临时目录，跑完即删，不污染工作区与发布仓
const DB = join(tmpdir(), `clantree-demo-seed-${process.pid}.db`)
const OUT = join(ROOT, "src", "demo", "data.ts")

for (const file of [DB, `${DB}-wal`, `${DB}-shm`]) {
  if (existsSync(file)) rmSync(file)
}

const repo = createLocalRepo(DB)
await ensureSeed(repo, "demo-placeholder-not-used")

/** 与 server/app.ts 的 publicFamily 保持同一份字段，剔除任何凭据相关字段 */
const publicFamily = (f: Awaited<ReturnType<typeof repo.getFamilyBySlug>>) => {
  if (!f) throw new Error("族谱读取失败")
  return {
    id: f.id,
    slug: f.slug,
    tag: f.tag,
    domain: f.domain,
    visibility: f.visibility,
    isPrimary: f.isPrimary,
    theme: f.theme,
    hasPassword: Boolean(f.accessPasswordHash),
    surname: f.surname,
    name: f.name,
    hallName: f.hallName,
    county: f.county,
    originPlace: f.originPlace,
    founderName: f.founderName,
    foundedYear: f.foundedYear,
    intro: f.intro,
    motto: f.motto,
    rules: f.rules,
    preface: f.preface,
    generationPoem: f.generationPoem,
    generationPoemStart: f.generationPoemStart,
    branches: f.branches,
    branchHeads: f.branchHeads ?? {},
    coverImage: f.coverImage,
    footerText: f.footerText,
    icpNumber: f.icpNumber,
    policeNumber: f.policeNumber,
    isPublished: f.isPublished,
    printIncludeExtended: f.printIncludeExtended,
    updatedAt: f.updatedAt,
  }
}

const families = await repo.listFamilies()
if (!families.length) throw new Error("示例数据没有生成出族谱")

const tenants: Record<string, unknown> = {}
const summaries: unknown[] = []

for (const family of families) {
  const members = await repo.listMembers(family.id)
  const visible = computeVisibleLineageIds(members, false)

  const generations = new Map<number, number>()
  const branches = new Map<string, number>()
  let lineageCount = 0

  for (const m of members) {
    if (!visible.has(m.id)) continue
    generations.set(m.generation, (generations.get(m.generation) ?? 0) + 1)
    if (m.branch && !m.isMarriedIn && !m.isBranchHeir) {
      branches.set(m.branch, (branches.get(m.branch) ?? 0) + 1)
    }
    if (!m.isMarriedIn && !m.isBranchHeir) lineageCount += 1
  }

  const stats = {
    memberCount: visible.size,
    lineageCount,
    generationCount: [...generations.keys()].reduce((a, b) => Math.max(a, b), 0),
    branches: [...branches.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    generations: [...generations.entries()]
      .map(([generation, count]) => ({ generation, count }))
      .sort((a, b) => a.generation - b.generation),
    updatedAt: family.updatedAt,
  }

  const pub = publicFamily(family)
  summaries.push({ ...pub, memberCount: visible.size })
  tenants[family.slug] = { family: pub, stats, members }
}

const primary = families.find((f) => f.isPrimary) ?? families[0]

const payload = {
  generatedAt: new Date().toISOString(),
  siteConfig: { siteName: "时光家谱", feedbackEnabled: false, faviconDataUrl: "" },
  filing: { icpNumber: primary.icpNumber ?? "", policeNumber: primary.policeNumber ?? "" },
  families: summaries,
  tenants,
}

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(
  OUT,
  [
    "/* 自动生成，请勿手改。重新生成：npx tsx scripts/gen-demo-data.mts */",
    'import type { DemoPayload } from "./types"',
    "",
    `export const demoData: DemoPayload = ${JSON.stringify(payload, null, 1)}`,
    "",
  ].join("\n"),
  "utf8",
)

for (const file of [DB, `${DB}-wal`, `${DB}-shm`]) {
  if (existsSync(file)) rmSync(file, { force: true })
}

console.log(`已生成 ${OUT}`)
console.log(`族谱 ${families.length} 部，成员 ${Object.values(tenants).reduce((n, t) => n + (t as { members: unknown[] }).members.length, 0)} 人`)
