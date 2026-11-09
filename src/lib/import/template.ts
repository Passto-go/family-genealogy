/**
 * 族人批量导入：模板生成。
 *
 * 只出 xlsx：Excel、WPS、Numbers、LibreOffice 都能直接打开，无需另设 csv 模板。
 */
import { IMPORT_COLUMNS } from "./parse"

const TEMPLATE_BASENAME = "族人导入模板"

/** 示例行：父子 + 配偶，演示编号互相引用的写法 */
const SAMPLE_ROWS: string[][] = [
  ["A1", "陈德昭", "男", "1", "字明远", "", "", "", "A2", "", "", "", "1765", "1832", "否", "村东祖山", "太学生", "长", "始迁祖，康熙年间自江西迁入"],
  ["A2", "王氏", "女", "", "", "", "", "", "A1", "是", "否", "", "1770", "1841", "否", "合葬祖山", "", "一", ""],
  ["A3", "陈守仁", "男", "", "字怀之", "", "A1", "A2", "", "", "", "", "1792", "1856", "否", "祖山南麓", "", "长", ""],
]

const GUIDE_LINES: string[][] = [
  ["族人批量导入 · 填写说明"],
  [""],
  ["1. 只有「编号」和「姓名」「性别」必填，其余留空即按规则自动推导，不确定的可以先不填。"],
  ["2. 编号在本表内唯一，只用于互相引用，不会写进系统；导入后可另行编辑。"],
  ["3. 父编号 / 母编号 / 配偶编号填本表的编号（如 A3），即表示引用同批的另一行。"],
  ["4. 若要挂到系统里已有的族人下面，用 @成员ID 的写法，例如 @12。成员ID 见族人列表。"],
  ["5. 世次可留空：填了父编号就按父辈 +1，填了母编号就按母辈 +1；与父母冲突时以父母为准。"],
  ["6. 房支可留空：血脉成员随父（父空则随母）；外姓配偶不取房支；勾了入赘承祧的随配偶。"],
  ["7. 「男 / 女」为必填，系统不猜性别——性别会影响配偶方向与外衍判定。"],
  ["8. 是 / 否列可填：是、否、1、0、TRUE、FALSE。「在世」留空按「否」处理。"],
  ["9. 入赘承祧必须先标外姓配偶，否则该行会被判为不合格。"],
  ["10. 任何一行不合格，整批都不会写入；请在预览页修好后重新导入。"],
  ["11. 单次最多 500 行；超过请拆成多个文件分批导入。"],
  ["12. 请勿另存为 2003 版 .xls；上传还支持 csv 与 json，但模板只提供本 xlsx。"],
  [""],
  ["示例行仅作格式演示，导入前请删除。"],
]

/** 下载 xlsx 模板（数据页 + 填写说明页） */
export async function downloadImportTemplate() {
  const XLSX = await import("@e965/xlsx")
  const header = IMPORT_COLUMNS.map((column) => column.label)
  const sheet = XLSX.utils.aoa_to_sheet([header, ...SAMPLE_ROWS])
  sheet["!cols"] = IMPORT_COLUMNS.map((column) => ({ wch: column.key === "bio" ? 40 : 12 }))

  const guide = XLSX.utils.aoa_to_sheet(GUIDE_LINES)
  guide["!cols"] = [{ wch: 96 }]

  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, "族人数据")
  XLSX.utils.book_append_sheet(book, guide, "填写说明")
  XLSX.writeFile(book, `${TEMPLATE_BASENAME}.xlsx`)
}
