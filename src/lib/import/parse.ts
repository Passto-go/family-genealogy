/**
 * 族人批量导入：文件解析层。
 *
 * 只负责「把任意支持的格式读成一组原始行」，不做任何业务校验；
 * 字段归一化与推导见 validate.ts。
 */

/** 表内一行（已是归一化后的字符串字段，数值列留空表示未填） */
export interface ImportRow {
  no: string
  name: string
  gender: string
  generation: number | null
  courtesyName: string
  branch: string
  fatherNo: string
  motherNo: string
  spouseNo: string
  isMarriedIn: string
  isBranchHeir: string
  birthYear: string
  deathYear: string
  isAlive: string
  burialPlace: string
  title: string
  bio: string
  sortOrder: number | null
}

/** 列定义：中文表头 ←→ 内部字段；顺序即模板列顺序 */
export const IMPORT_COLUMNS: { key: keyof ImportRow; label: string; required?: boolean; hint?: string }[] = [
  { key: "no", label: "编号", required: true, hint: "本表内唯一，亲属用编号互相引用；@12 表示引用系统内已有成员" },
  { key: "name", label: "姓名", required: true },
  { key: "gender", label: "性别", hint: "男 / 女，必填" },
  { key: "generation", label: "世次", hint: "可留空，按父辈自动推算" },
  { key: "courtesyName", label: "字号" },
  { key: "branch", label: "房支", hint: "须在本族房支清单内，可留空" },
  { key: "fatherNo", label: "父编号" },
  { key: "motherNo", label: "母编号" },
  { key: "spouseNo", label: "配偶编号" },
  { key: "isMarriedIn", label: "外姓配偶", hint: "是 / 否" },
  { key: "isBranchHeir", label: "入赘承祧", hint: "是 / 否，须先勾外姓配偶" },
  { key: "birthYear", label: "生年" },
  { key: "deathYear", label: "卒年" },
  { key: "isAlive", label: "在世", hint: "是 / 否" },
  { key: "burialPlace", label: "葬地" },
  { key: "title", label: "功名" },
  { key: "sortOrder", label: "排行" },
  { key: "bio", label: "简介" },
]

/** 表头别名：允许旧表沿用常见写法 */
const HEADER_ALIAS: Record<string, keyof ImportRow> = {
  序号: "no",
  编号: "no",
  姓名: "name",
  名字: "name",
  性别: "gender",
  世次: "generation",
  世代: "generation",
  字号: "courtesyName",
  房支: "branch",
  房份: "branch",
  父编号: "fatherNo",
  父亲: "fatherNo",
  父: "fatherNo",
  母编号: "motherNo",
  母亲: "motherNo",
  母: "motherNo",
  配偶编号: "spouseNo",
  配偶: "spouseNo",
  妻: "spouseNo",
  夫: "spouseNo",
  外姓配偶: "isMarriedIn",
  入赘承祧: "isBranchHeir",
  承祧: "isBranchHeir",
  生年: "birthYear",
  卒年: "deathYear",
  在世: "isAlive",
  葬地: "burialPlace",
  功名: "title",
  排行: "sortOrder",
  简介: "bio",
}

/** 解析结果：行 + 非致命提示（例如 csv 疑似 GBK 乱码） */
export interface ParseResult {
  rows: ImportRow[]
  notices: string[]
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value).trim()
}

function cellNumber(value: unknown): number | null {
  const text = cellText(value)
  if (!text) return null
  const num = Number(text)
  return Number.isFinite(num) ? Math.trunc(num) : null
}

/** 把「中文表头 → 任意值」的记录映射成 ImportRow */
function mapRecord(record: Record<string, unknown>): ImportRow | null {
  const row: Record<string, string> = {}
  const nums: Record<string, number | null> = {}
  let touched = false

  for (const [rawHeader, rawValue] of Object.entries(record)) {
    const header = rawHeader.trim()
    const key = HEADER_ALIAS[header]
    if (!key) continue
    touched = true
    if (key === "generation" || key === "sortOrder") {
      nums[key] = cellNumber(rawValue)
    } else {
      row[key] = cellText(rawValue)
    }
  }

  // 整行空白（Excel 常在末尾带出空行）直接丢弃
  const hasContent = Object.values(row).some((value) => value !== "")
  if (!touched || !hasContent) return null

  return {
    no: row.no ?? "",
    name: row.name ?? "",
    gender: row.gender ?? "",
    generation: nums.generation ?? null,
    courtesyName: row.courtesyName ?? "",
    branch: row.branch ?? "",
    fatherNo: row.fatherNo ?? "",
    motherNo: row.motherNo ?? "",
    spouseNo: row.spouseNo ?? "",
    isMarriedIn: row.isMarriedIn ?? "",
    isBranchHeir: row.isBranchHeir ?? "",
    birthYear: row.birthYear ?? "",
    deathYear: row.deathYear ?? "",
    isAlive: row.isAlive ?? "",
    burialPlace: row.burialPlace ?? "",
    title: row.title ?? "",
    bio: row.bio ?? "",
    sortOrder: nums.sortOrder ?? null,
  }
}

/** RFC4180 风格的 CSV 解析：支持引号包裹、字段内逗号与换行、"" 转义 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let field = ""
  let row: string[] = []
  let quoted = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          quoted = false
        }
      } else {
        field += char
      }
      continue
    }
    if (char === '"') {
      quoted = true
    } else if (char === ",") {
      row.push(field)
      field = ""
    } else if (char === "\n") {
      row.push(field)
      rows.push(row)
      row = []
      field = ""
    } else if (char !== "\r") {
      field += char
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

function looksGarbled(text: string): boolean {
  // UTF-8 解码失败时会产生大量 U+FFFD；GBK 文本还会出现连续高位噪声
  const bad = (text.match(/\uFFFD/g) ?? []).length
  return bad > 3
}

function rowsFromMatrix(matrix: string[][]): ParseResult {
  const notices: string[] = []
  if (!matrix.length) return { rows: [], notices: ["文件里没有内容"] }

  const headers = matrix[0].map((cell) => cell.trim())
  const unknown = headers.filter((header) => header && !HEADER_ALIAS[header])
  if (unknown.length) {
    notices.push(`以下列无法识别，已忽略：${unknown.join("、")}`)
  }

  const rows: ImportRow[] = []
  for (const line of matrix.slice(1)) {
    const record: Record<string, unknown> = {}
    headers.forEach((header, index) => {
      record[header] = line[index] ?? ""
    })
    const mapped = mapRecord(record)
    if (mapped) rows.push(mapped)
  }
  return { rows, notices }
}

/** JSON：数组，字段名用后台字段名（no / name / gender / fatherNo ...） */
function parseJson(text: string): ParseResult {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error("JSON 格式有误，无法解析")
  }
  const list = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as { rows?: unknown }).rows)
      ? ((data as { rows: unknown[] }).rows)
      : null
  if (!list) throw new Error("JSON 需为数组，或形如 { rows: [...] } 的对象")

  const rows: ImportRow[] = []
  for (const item of list) {
    if (!item || typeof item !== "object") continue
    const record = item as Record<string, unknown>
    // JSON 同时接受英文字段与中文表头
    const normalized: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(record)) {
      const mappedKey = HEADER_ALIAS[key] ?? (key as keyof ImportRow)
      normalized[mappedKey] = value
    }
    const mapped = mapRecord(normalized)
    if (mapped) rows.push(mapped)
  }
  return { rows, notices: [] }
}

/** 读取并解析用户选择的文件；抛出的错误文案可直接展示 */
export async function parseImportFile(file: File): Promise<ParseResult> {
  const name = file.name.toLowerCase()
  if (name.endsWith(".xls")) {
    throw new Error("不再支持 2003 版 .xls，请用 Excel 另存为 .xlsx 或 .csv 后重试")
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error("文件超过 8MB，请拆分后再导入")
  }

  if (name.endsWith(".json")) {
    return parseJson(await file.text())
  }

  if (name.endsWith(".csv")) {
    const text = await file.text()
    if (looksGarbled(text)) {
      throw new Error("文件编码无法识别，请用 Excel 另存为「CSV UTF-8」后重试")
    }
    const clean = text.replace(/^\uFEFF/, "")
    return rowsFromMatrix(parseCsv(clean))
  }

  if (name.endsWith(".xlsx")) {
    // 动态引入：xlsx 体积较大，避免进入首屏包
    const XLSX = await import("@e965/xlsx")
    const buffer = await file.arrayBuffer()
    const book = XLSX.read(buffer, { type: "array" })
    const sheet = book.Sheets[book.SheetNames[0]]
    if (!sheet) throw new Error("表格里没有工作表")
    const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, {
      header: 1,
      raw: false,
      blankrows: false,
      defval: "",
    })
    return rowsFromMatrix(
      matrix.map((line) => (Array.isArray(line) ? line.map((cell) => String(cell ?? "")) : [])),
    )
  }

  throw new Error("仅支持 .xlsx、.csv、.json 三种格式")
}
