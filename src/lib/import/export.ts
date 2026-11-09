/**
 * 族人批量导出：把当前筛选结果落成 xlsx。
 *
 * 字段对齐导入模板（IMPORT_COLUMNS），并前置一列「成员ID」作为系统内唯一标识；
 * 「编号」列与亲属列（父/母/配偶编号）都直接填成员 ID，彼此自洽，
 * 便于识别每个成员，也便于后续按 @成员ID 引用或改后再导入。
 */
import { IMPORT_COLUMNS } from "./parse"
import type { Member } from "@/lib/types"

const FLAG_YES = "是"
const FLAG_NO = "否"

export async function downloadMembersExport(members: Member[], familyName: string) {
  const XLSX = await import("@e965/xlsx")

  const header = ["成员ID", ...IMPORT_COLUMNS.map((column) => column.label)]
  const rows = members.map((member) => [
    String(member.id), // 成员ID
    String(member.id), // 编号（表内引用编号，与成员ID一致）
    member.name,
    member.gender === "female" ? "女" : "男",
    String(member.generation),
    member.courtesyName,
    member.branch,
    member.fatherId != null ? String(member.fatherId) : "",
    member.motherId != null ? String(member.motherId) : "",
    member.spouseId != null ? String(member.spouseId) : "",
    member.isMarriedIn ? FLAG_YES : FLAG_NO,
    member.isBranchHeir ? FLAG_YES : FLAG_NO,
    member.birthYear,
    member.deathYear,
    member.isAlive ? FLAG_YES : FLAG_NO,
    member.burialPlace,
    member.title,
    String(member.sortOrder),
    member.bio,
  ])

  const sheet = XLSX.utils.aoa_to_sheet([header, ...rows])
  sheet["!cols"] = [
    { wch: 10 }, // 成员ID
    ...IMPORT_COLUMNS.map((column) => ({ wch: column.key === "bio" ? 40 : 12 })),
  ]

  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, "族人名录")
  const base = familyName ? `${familyName}-` : ""
  XLSX.writeFile(book, `${base}族人名录.xlsx`)
}
