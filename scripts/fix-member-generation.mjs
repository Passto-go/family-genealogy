#!/usr/bin/env node
/**
 * 一次性维护脚本：核查并校正族人「世次」与父母关系的一致性。
 *
 * 目标：把「子世次 != 父/母世次 + 1」的成员修正为「父/母世次 + 1」。
 * 修正按父子链路自顶向下进行：根成员世次保持不变，其后逐层 +1；
 * 因此父节点被修正后，子节点的目标值也随之更新，避免链式错误。
 *
 * 默认只读：只列出待改项；加 --apply 才写库。
 *
 * 用法：
 *   node scripts/fix-member-generation.mjs                # 只读核查
 *   node scripts/fix-member-generation.mjs --apply        # 执行校正
 *   node scripts/fix-member-generation.mjs --family 2     # 仅处理某一家族
 *
 * 注意：
 *   - 执行 --apply 前建议先备份 server/data/family.db，并尽量停服或避开写入高峰；
 *   - 世界归属与世系图一致：优先随父，父不在集合内再随母；
 *   - 仅改动 generation，不动 updated_at（尽量少改无关字段）。
 */
import fs from "node:fs"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(here, "..")
const dbFile = process.env.DATABASE_FILE ?? path.join(projectRoot, "server", "data", "family.db")

const argv = process.argv.slice(2)
const apply = argv.includes("--apply")
const familyIdx = argv.indexOf("--family")
const familyFilter = familyIdx >= 0 ? Number(argv[familyIdx + 1]) : null
const hasFamilyFilter = familyFilter != null && Number.isFinite(familyFilter)

if (!fs.existsSync(dbFile)) {
  console.error(`未找到数据库：${dbFile}`)
  process.exit(1)
}

const db = new DatabaseSync(dbFile)

const sql = `SELECT id, family_id, name, generation, father_id, mother_id
               FROM member
              ${hasFamilyFilter ? "WHERE family_id = ?" : ""}
              ORDER BY family_id ASC, generation ASC, id ASC`
const rows = hasFamilyFilter ? db.prepare(sql).all(familyFilter) : db.prepare(sql).all()

const byId = new Map(rows.map((row) => [row.id, row]))

// 世系归属与布局一致：优先随父；父不在本集合内时再随母
const resolveParent = (row) => {
  if (row.father_id != null && byId.has(row.father_id)) return row.father_id
  if (row.mother_id != null && byId.has(row.mother_id)) return row.mother_id
  return null
}

const childrenMap = new Map()
const roots = []
const parentOf = new Map()
for (const row of rows) {
  const parentId = resolveParent(row)
  parentOf.set(row.id, parentId)
  if (parentId == null) {
    roots.push(row)
  } else {
    const list = childrenMap.get(parentId) ?? []
    list.push(row)
    childrenMap.set(parentId, list)
  }
}

// 自顶向下计算目标世次：根保持不变，子 = 父 + 1
const expected = new Map()
const visited = new Set()
const stack = roots.map((root) => [root, root.generation])
while (stack.length > 0) {
  const [row, target] = stack.pop()
  if (visited.has(row.id)) continue
  visited.add(row.id)
  expected.set(row.id, target)
  for (const child of childrenMap.get(row.id) ?? []) {
    stack.push([child, target + 1])
  }
}

const anomalies = []
const unreachable = []
for (const row of rows) {
  if (!visited.has(row.id)) {
    unreachable.push(row)
    continue
  }
  const target = expected.get(row.id)
  if (target !== row.generation) {
    const parentId = parentOf.get(row.id)
    const parentGen = parentId != null ? expected.get(parentId) : null
    const type =
      parentGen != null && row.generation <= parentGen
        ? "重叠型（≤ 父/母）"
        : "跳级型（≠ 父/母+1）"
    anomalies.push({ row, target, parentId, type })
  }
}

console.log("========================================")
console.log("族人世次核查")
console.log("----------------------------------------")
console.log(`数据库：${dbFile}`)
if (hasFamilyFilter) console.log(`家族过滤：${familyFilter}`)
console.log(`成员总数：${rows.length}`)
console.log(`根成员：${roots.length}`)
console.log(`已计算：${visited.size}`)
console.log(`不可达（疑似环 / 引用异常，未处理）：${unreachable.length}`)
console.log(`待修正：${anomalies.length}`)
console.log("========================================")

if (unreachable.length > 0) {
  console.log("\n[不可达成员]（父子链接可能成环或父/母不在本集合内，未做改动）")
  for (const row of unreachable) {
    console.log(
      `  #${row.id}  ${row.name}  当前世次=${row.generation}  父=${row.father_id ?? "-"}  母=${row.mother_id ?? "-"}`,
    )
  }
}

if (anomalies.length === 0) {
  console.log("\n未发现需要修正的世次数据。")
} else {
  console.log("\n[待修正清单]")
  console.log("  id | 家族 | 姓名 | 当前世次 | 父/母(id) | 修正为 | 类型")
  for (const { row, target, parentId, type } of anomalies) {
    console.log(
      `  ${row.id} | ${row.family_id} | ${row.name} | ${row.generation} | ${
        parentId != null ? parentId : "-"
      } | ${target} | ${type}`,
    )
  }

  if (!apply) {
    console.log("\n当前为只读模式，未改动任何数据。确认无误后加 --apply 执行校正。")
  } else {
    const stmt = db.prepare("UPDATE member SET generation = ? WHERE id = ?")
    db.exec("BEGIN")
    try {
      for (const { row, target } of anomalies) stmt.run(target, row.id)
      db.exec("COMMIT")
      console.log(`\n已修正 ${anomalies.length} 位成员的世次。`)
    } catch (error) {
      db.exec("ROLLBACK")
      console.error("\n写入失败，已回滚：", error)
      process.exitCode = 1
    }
  }
}

db.close()
