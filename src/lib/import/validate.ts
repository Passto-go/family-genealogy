/**
 * 族人批量导入：校验与推导层。
 *
 * 与服务端 server/app.ts 的 planImport 保持同一口径——这里是为了让用户在
 * 点「导入」之前就看清问题，服务端仍会独立复核一遍（前端数据不可信）。
 */
import type { Family, Member } from "@/lib/types"
import type { ImportRow } from "./parse"

export interface ImportIssue {
  no: string
  field: string
  message: string
}

export interface ImportPlanRow {
  source: ImportRow
  /** 推导后的世次（有父辈则以父辈为准） */
  generation: number
  /** 推导后的房支 */
  branch: string
  /** 不阻断导入、但值得提醒的修正 */
  warnings: string[]
}

export interface ImportPlan {
  ok: boolean
  rows: ImportPlanRow[]
  issues: ImportIssue[]
  /** 全局提示，与具体行无关 */
  notices: string[]
}

/** 单次导入上限，与服务端 MAX_IMPORT_ROWS 一致 */
export const MAX_IMPORT_ROWS = 500

/** 「是 / 否」列的宽容解析 */
export function parseFlag(value: string, fallback = false): boolean {
  const text = value.trim().toLowerCase()
  if (!text) return fallback
  if (["是", "true", "1", "y", "yes", "在世", "有"].includes(text)) return true
  if (["否", "false", "0", "n", "no", "已故", "无"].includes(text)) return false
  return fallback
}

/** 检出「已存在的族人」引用：@12 → 12 */
function parseRefId(ref: string): number | null {
  if (!ref.startsWith("@")) return null
  const id = Number(ref.slice(1))
  return Number.isFinite(id) && id > 0 ? Math.trunc(id) : null
}

export function validateImportRows(
  rows: ImportRow[],
  family: Family | null,
  members: Member[],
): ImportPlan {
  const issues: ImportIssue[] = []
  const notices: string[] = []
  if (!rows.length) {
    return { ok: false, rows: [], issues: [], notices: ["文件里没有可导入的数据行"] }
  }
  if (!family) {
    return { ok: false, rows: [], issues: [], notices: ["尚未选定族谱，无法校验房支与世系"] }
  }
  if (rows.length > MAX_IMPORT_ROWS) {
    return {
      ok: false,
      rows: [],
      issues: [],
      notices: [`共 ${rows.length} 行，超过单次上限 ${MAX_IMPORT_ROWS} 行，请分批导入`],
    }
  }

  const branchSet = new Set(family.branches ?? [])
  const existing = new Map(members.map((member) => [member.id, member]))

  // ── 第一轮：与「其他行无关」的字段校验 ──
  const seen = new Set<string>()
  rows.forEach((row, index) => {
    const no = row.no || `第${index + 1}行`
    if (!row.no) {
      issues.push({ no, field: "编号", message: "编号不能为空" })
    } else if (seen.has(row.no)) {
      issues.push({ no, field: "编号", message: "编号重复，同一批内必须唯一" })
    } else {
      seen.add(row.no)
    }
    if (!row.name) issues.push({ no, field: "姓名", message: "姓名不能为空" })

    if (!["男", "女", "male", "female"].includes(row.gender.trim())) {
      issues.push({ no, field: "性别", message: "性别须填「男」或「女」，不提供默认值" })
    }
    if (row.branch && !branchSet.has(row.branch)) {
      issues.push({ no, field: "房支", message: `房支「${row.branch}」不在本族房支清单内` })
    }
    if (row.generation != null && (row.generation < 1 || row.generation > 99)) {
      issues.push({ no, field: "世次", message: "世次需在 1 至 99 之间" })
    }
  })
  // 编号缺失或重复会让后续引用解析失真，必须立刻停；其余字段错误可以继续收集，一起报给用户
  if (issues.some((issue) => issue.field === "编号")) {
    return { ok: false, rows: [], issues, notices }
  }

  const byNo = new Map(rows.map((row) => [row.no, row]))
  const refExists = (ref: string): boolean => {
    if (!ref) return true
    const id = parseRefId(ref)
    if (id != null) return existing.has(id)
    return byNo.has(ref)
  }

  // ── 第二轮：引用与基本关系校验 ──
  for (const row of rows) {
    const refs: [string, string][] = [
      ["父编号", row.fatherNo],
      ["母编号", row.motherNo],
      ["配偶编号", row.spouseNo],
    ]
    for (const [field, ref] of refs) {
      if (!ref) continue
      if (ref === row.no) {
        issues.push({ no: row.no, field, message: "不能引用自己" })
        continue
      }
      if (!refExists(ref)) {
        issues.push({ no: row.no, field, message: `编号「${ref}」在本批与本族中都找不到` })
      }
    }
    if (row.fatherNo && row.motherNo && row.fatherNo === row.motherNo) {
      issues.push({ no: row.no, field: "父母", message: "父与母不能是同一位族人" })
    }
    if (parseFlag(row.isBranchHeir) && !parseFlag(row.isMarriedIn)) {
      issues.push({ no: row.no, field: "入赘承祧", message: "勾选入赘承祧前，须先标为外姓配偶" })
    }
  }

  // ── 环检测：只看父母边，配偶是互指关系不能计入 ──
  const detecting = new Set<string>()
  const checked = new Set<string>()
  const hasCycle = (no: string): boolean => {
    if (checked.has(no)) return false
    if (detecting.has(no)) return true
    detecting.add(no)
    const row = byNo.get(no)!
    for (const ref of [row.fatherNo, row.motherNo]) {
      if (ref && !ref.startsWith("@") && byNo.has(ref) && hasCycle(ref)) return true
    }
    detecting.delete(no)
    checked.add(no)
    return false
  }
  for (const row of rows) {
    if (hasCycle(row.no)) {
      issues.push({ no: row.no, field: "亲属", message: "父母关系成环，请检查父辈编号" })
      break
    }
  }
  if (issues.length) return { ok: false, rows: [], issues, notices }

  // ── 世次推导：父 +1 > 母 +1 > 配偶同世（配偶无父母时） > 填写值 > 1 ──
  const genCache = new Map<string, number>()
  const resolvingGen = new Set<string>()
  const refGen = (ref: string): number | null => {
    if (!ref) return null
    const id = parseRefId(ref)
    if (id != null) return existing.get(id)?.generation ?? null
    const target = byNo.get(ref)
    return target ? resolveGeneration(target) : null
  }
  function resolveGeneration(row: ImportRow): number {
    const cached = genCache.get(row.no)
    if (cached != null) return cached
    if (resolvingGen.has(row.no)) return row.generation ?? 1
    resolvingGen.add(row.no)
    const fatherGen = refGen(row.fatherNo)
    const motherGen = fatherGen == null ? refGen(row.motherNo) : null
    let generation: number
    if (fatherGen != null) generation = fatherGen + 1
    else if (motherGen != null) generation = motherGen + 1
    // 外姓配偶（含入赘承祧）本身无父母可依，谱上与配偶同世，否则会被排到一世
    else if (parseFlag(row.isMarriedIn) || parseFlag(row.isBranchHeir)) {
      generation = refGen(row.spouseNo) ?? row.generation ?? 1
    }
    else generation = row.generation ?? 1
    generation = Math.min(99, Math.max(1, generation))
    resolvingGen.delete(row.no)
    genCache.set(row.no, generation)
    return generation
  }

  // ── 房支推导：承祧者随配偶；血脉成员随父（父空随母）；普通配偶不取房支 ──
  const branchCache = new Map<string, string>()
  const resolvingBranch = new Set<string>()
  const refBranch = (ref: string): string => {
    if (!ref) return ""
    const id = parseRefId(ref)
    if (id != null) return existing.get(id)?.branch || ""
    const target = byNo.get(ref)
    return target ? resolveBranch(target) : ""
  }
  function resolveBranch(row: ImportRow): string {
    const cached = branchCache.get(row.no)
    if (cached !== undefined) return cached
    if (resolvingBranch.has(row.no)) return row.branch
    resolvingBranch.add(row.no)
    let branch = row.branch
    if (!branch && parseFlag(row.isBranchHeir)) branch = refBranch(row.spouseNo)
    if (!branch && !parseFlag(row.isMarriedIn)) {
      branch = refBranch(row.fatherNo) || refBranch(row.motherNo)
    }
    resolvingBranch.delete(row.no)
    branchCache.set(row.no, branch)
    return branch
  }

  const planRows: ImportPlanRow[] = []
  for (const row of rows) {
    const generation = resolveGeneration(row)
    const branch = resolveBranch(row)
    const warnings: string[] = []
    if (row.generation != null && row.generation !== generation) {
      warnings.push(`原填世次 ${row.generation} 与父母推算的 ${generation} 冲突，已按父母改写`)
    }
    if (!row.branch && branch) {
      warnings.push(
        parseFlag(row.isBranchHeir) ? `房支按配偶补为「${branch}」` : `房支按父辈补为「${branch}」`,
      )
    }
    planRows.push({ source: row, generation, branch, warnings })
  }

  // 按世次升序，父辈先于子辈（提交给服务端的顺序保持一致）
  planRows.sort((a, b) => a.generation - b.generation)

  return { ok: true, rows: planRows, issues: [], notices }
}
