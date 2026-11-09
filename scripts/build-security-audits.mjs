/**
 * 安全检查页数据同步脚本。
 *
 * 输入：docs/audits/*.json —— 每次代码安全审查产出的独立结构化记录
 * 输出：src/data/security-audits.ts —— 前端页面直接 import 的 TS 数据模块
 *
 * 由 predev / prebuild 自动触发，也可手动执行 npm run audit:sync。
 *
 * 「追加而非覆盖」：每个 JSON 文件以 date 为唯一键代表一次审计批次；新一次审查新建文件，
 * 修复闭环时只回填该文件的 fixedCount / actualFixDate，历史文件永不删除或覆写，
 * 聚合结果始终保留全部批次，页面据此展示可追溯的历史记录。
 *
 * 整改次数口径：批次必须全部完成（fixedCount === found.total）且已回填 actualFixDate，
 * 才计为 1 次「已完成整改」；部分完成一律不计次。status / repairDays 均由脚本派生，
 * 不接受手填，避免口径漂移。
 *
 * 幂等：审计数据未变化时不改写输出文件。
 */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const sourceDir = path.join(root, "docs", "audits")
const outputFile = path.join(root, "src", "data", "security-audits.ts")

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const SEVERITIES = new Set(["高", "中", "低"])

/** 修复时长 = 实际修复日期 − 审计日期 的日历日差（单位：天，不含起始日、含结束日） */
function dayDiff(from, to) {
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${to}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  return Math.round((b - a) / 86_400_000)
}

function normalize(raw, file) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${file}: 根节点必须是对象`)
  }
  if (!DATE_RE.test(raw.date ?? "")) throw new Error(`${file}: date 必须为 YYYY-MM-DD`)

  const found = raw.found ?? {}
  for (const key of ["total", "high", "medium", "low"]) {
    if (!Number.isInteger(found[key]) || found[key] < 0) {
      throw new Error(`${file}: found.${key} 必须为非负整数`)
    }
  }
  if (found.high + found.medium + found.low !== found.total) {
    throw new Error(`${file}: 高/中/低数量之和与 found.total 不一致`)
  }

  // 本批次已整改的问题项数；整改次数以「批次是否全部完成」判定，不看中间进度
  const fixedCount = raw.fixedCount ?? 0
  if (!Number.isInteger(fixedCount) || fixedCount < 0 || fixedCount > found.total) {
    throw new Error(`${file}: fixedCount 必须是 0 ~ found.total 之间的整数`)
  }

  if (!Array.isArray(raw.categories)) throw new Error(`${file}: categories 必须为数组`)
  const categories = raw.categories.map((item, index) => {
    const label = `${file}: categories[${index}]`
    if (!item || typeof item !== "object") throw new Error(`${label} 必须为对象`)
    if (typeof item.name !== "string" || !item.name.trim()) {
      throw new Error(`${label}.name 不能为空`)
    }
    if (!SEVERITIES.has(item.severity)) {
      throw new Error(`${label}.severity 必须为 高/中/低`)
    }
    if (!Number.isInteger(item.count) || item.count < 1) {
      throw new Error(`${label}.count 必须为正整数`)
    }
    return { name: item.name.trim(), severity: item.severity, count: item.count }
  })
  const categorySum = categories.reduce((sum, item) => sum + item.count, 0)
  if (categorySum !== found.total) {
    throw new Error(`${file}: 各类别 count 之和 ${categorySum} 与 found.total ${found.total} 不一致`)
  }
  const severitySum = { 高: 0, 中: 0, 低: 0 }
  for (const item of categories) severitySum[item.severity] += item.count
  if (
    severitySum["高"] !== found.high ||
    severitySum["中"] !== found.medium ||
    severitySum["低"] !== found.low
  ) {
    throw new Error(`${file}: 类别严重程度分布与 found 中高/中/低数量不一致`)
  }

  const plannedFixDate = raw.plannedFixDate ?? ""
  if (!DATE_RE.test(plannedFixDate)) {
    throw new Error(`${file}: plannedFixDate 必须为 YYYY-MM-DD`)
  }
  const actualFixDate = raw.actualFixDate ? String(raw.actualFixDate) : null
  if (actualFixDate && !DATE_RE.test(actualFixDate)) {
    throw new Error(`${file}: actualFixDate 必须为 YYYY-MM-DD 或 null`)
  }
  // 关键规则：只完成一部分（如 20/26）不得回填实际修复日期，也不得计入已完成整改次数
  if (actualFixDate && fixedCount !== found.total) {
    throw new Error(
      `${file}: 批次仅完成 ${fixedCount}/${found.total} 项，未全部完成，不允许回填 actualFixDate`,
    )
  }
  const repairDays = actualFixDate ? dayDiff(raw.date, actualFixDate) : null
  if (repairDays != null && repairDays < 0) {
    throw new Error(`${file}: actualFixDate 不得早于审计日期`)
  }

  const isFullyFixed = fixedCount === found.total && Boolean(actualFixDate)
  return {
    date: raw.date,
    scope: String(raw.scope ?? ""),
    found: {
      total: found.total,
      high: found.high,
      medium: found.medium,
      low: found.low,
    },
    fixedCount,
    isFullyFixed,
    categories,
    plannedFixDate,
    actualFixDate,
    repairDays,
    status: isFullyFixed ? "已修复" : "整改中",
    note: String(raw.note ?? ""),
  }
}

async function main() {
  let files = []
  try {
    files = (await readdir(sourceDir)).filter((name) => name.endsWith(".json")).sort()
  } catch {
    files = []
  }

  const audits = []
  const seen = new Set()
  for (const file of files) {
    try {
      const raw = JSON.parse(await readFile(path.join(sourceDir, file), "utf8"))
      const audit = normalize(raw, file)
      // 历史记录追加保存：同一审计日期出现重复文件时跳过，绝不覆盖已有批次
      if (seen.has(audit.date)) {
        console.warn(`[security-audits] 跳过 ${file}: 审计日期 ${audit.date} 重复，历史记录不可覆盖`)
        continue
      }
      seen.add(audit.date)
      audits.push(audit)
    } catch (error) {
      // 单条记录出错不应阻断构建，但必须显式告警，避免"悄悄漏更新"
      console.warn(`[security-audits] 跳过 ${file}: ${error.message}`)
    }
  }
  // 按审计日期倒序（最新在前）；日期相同时以文件名保证稳定顺序
  audits.sort((a, b) => b.date.localeCompare(a.date))

  const serialized = JSON.stringify(audits, null, 2)
  const declaration = `export const securityAudits: SecurityAudit[] = ${serialized}`
  const header = `// 本文件由 scripts/build-security-audits.mjs 自动生成，请勿手工编辑。
// 数据来源：docs/audits/*.json，每次审计一个独立文件，追加保存、不覆盖历史。
export type AuditSeverity = "高" | "中" | "低"

export interface SecurityAuditCategory {
  name: string
  severity: AuditSeverity
  count: number
}

export interface SecurityAudit {
  date: string
  scope: string
  found: { total: number; high: number; medium: number; low: number }
  /** 本批次已完成整改的问题项数 */
  fixedCount: number
  /** 批次是否全部完成：fixedCount === found.total 且已回填实际修复日期 */
  isFullyFixed: boolean
  categories: SecurityAuditCategory[]
  plannedFixDate: string
  actualFixDate: string | null
  /** 修复时长（日历日差，天）；批次未全部完成时为 null */
  repairDays: number | null
  status: "已修复" | "整改中"
  note: string
}

`
  let current = ""
  try {
    current = await readFile(outputFile, "utf8")
  } catch {
    current = ""
  }
  if (current.includes(declaration)) {
    const fixed = audits.filter((a) => a.isFullyFixed).length
    console.log(`[security-audits] ${audits.length} 条记录无变化，跳过写入（已完成整改 ${fixed} 次）`)
    return
  }

  const generatedAt = new Date().toISOString()
  const content = `${header}${declaration}\n\nexport const generatedAt = ${JSON.stringify(generatedAt)}\n`
  await mkdir(path.dirname(outputFile), { recursive: true })
  await writeFile(outputFile, content, "utf8")
  const fixed = audits.filter((a) => a.isFullyFixed).length
  console.log(
    `[security-audits] 已同步 ${audits.length} 条审计记录 → src/data/security-audits.ts（已完成整改 ${fixed} 次）`,
  )
}

main().catch((error) => {
  console.error(`[security-audits] 同步失败: ${error.message}`)
  process.exit(1)
})
