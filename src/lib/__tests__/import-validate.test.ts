import { describe, it, expect } from "vitest"
import { validateImportRows, parseFlag } from "@/lib/import/validate"
import type { Family } from "@/lib/types"
import type { ImportRow } from "@/lib/import/parse"

const family = { branches: ["长房"] } as unknown as Family

function row(partial: Partial<ImportRow> & Pick<ImportRow, "no" | "name" | "gender">): ImportRow {
  return {
    generation: null,
    courtesyName: "",
    branch: "",
    fatherNo: "",
    motherNo: "",
    spouseNo: "",
    isMarriedIn: "",
    isBranchHeir: "",
    birthYear: "",
    deathYear: "",
    isAlive: "",
    burialPlace: "",
    title: "",
    bio: "",
    sortOrder: null,
    ...partial,
  }
}

describe("parseFlag", () => {
  it("中文 是/否", () => {
    expect(parseFlag("是")).toBe(true)
    expect(parseFlag("否")).toBe(false)
  })
  it("英文与数字宽容解析", () => {
    expect(parseFlag("true")).toBe(true)
    expect(parseFlag("0")).toBe(false)
    expect(parseFlag("yes")).toBe(true)
    expect(parseFlag("已故")).toBe(false)
  })
  it("空与未知回退 fallback", () => {
    expect(parseFlag("")).toBe(false)
    expect(parseFlag("", true)).toBe(true)
    expect(parseFlag("乱码")).toBe(false)
  })
})

describe("validateImportRows", () => {
  it("空数据行报错", () => {
    const plan = validateImportRows([], family, [])
    expect(plan.ok).toBe(false)
    expect(plan.notices.some((n) => n.includes("没有可导入"))).toBe(true)
  })

  it("编号重复", () => {
    const rows = [
      row({ no: "1", name: "甲", gender: "男" }),
      row({ no: "1", name: "乙", gender: "男" }),
    ]
    const plan = validateImportRows(rows, family, [])
    expect(plan.ok).toBe(false)
    expect(plan.issues.some((i) => i.field === "编号" && i.message.includes("重复"))).toBe(true)
  })

  it("性别非法", () => {
    const rows = [row({ no: "1", name: "甲", gender: "不男不女" })]
    const plan = validateImportRows(rows, family, [])
    expect(plan.issues.some((i) => i.field === "性别")).toBe(true)
  })

  it("父母边成环被检出", () => {
    const rows = [
      row({ no: "1", name: "甲", gender: "男", fatherNo: "2" }),
      row({ no: "2", name: "乙", gender: "男", fatherNo: "1" }),
    ]
    const plan = validateImportRows(rows, family, [])
    expect(plan.ok).toBe(false)
    expect(plan.issues.some((i) => i.message.includes("成环"))).toBe(true)
  })

  it("两代世次推导：子代 = 父代 + 1", () => {
    const rows = [
      row({ no: "1", name: "甲", gender: "男", generation: 1 }),
      row({ no: "2", name: "乙", gender: "男", generation: null, fatherNo: "1" }),
    ]
    const plan = validateImportRows(rows, family, [])
    expect(plan.ok).toBe(true)
    const child = plan.rows.find((r) => r.source.no === "2")!
    expect(child.generation).toBe(2)
  })

  it("房支不在本族清单内报错", () => {
    const rows = [row({ no: "1", name: "甲", gender: "男", branch: "不存在的房" })]
    const plan = validateImportRows(rows, family, [])
    expect(plan.issues.some((i) => i.field === "房支")).toBe(true)
  })
})
