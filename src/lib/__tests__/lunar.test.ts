import { describe, it, expect } from "vitest"
import { solarToLunar, formatLunar } from "@/lib/lunar"

describe("solarToLunar", () => {
  it("2026 春节（2/17）对应农历正月初一", () => {
    const r = solarToLunar(2026, 2, 17)
    expect(r.year).toBe(2026)
    expect(r.month).toBe(1)
    expect(r.day).toBe(1)
  })

  it("返回字段合法", () => {
    const r = solarToLunar(2024, 1, 1)
    expect(r.month).toBeGreaterThanOrEqual(1)
    expect(r.month).toBeLessThanOrEqual(12)
    expect(r.day).toBeGreaterThanOrEqual(1)
    expect(r.day).toBeLessThanOrEqual(30)
    expect(typeof r.isLeap).toBe("boolean")
  })

  it("年末（12/31）仍返回有效月份", () => {
    const r = solarToLunar(2025, 12, 31)
    expect(r.month).toBeGreaterThanOrEqual(1)
    expect(r.month).toBeLessThanOrEqual(12)
  })
})

describe("formatLunar", () => {
  it("输出含「年」的非空字符串", () => {
    const s = formatLunar(2026, 2, 17)
    expect(typeof s).toBe("string")
    expect(s.length).toBeGreaterThan(0)
    expect(s).toContain("年")
  })
})
