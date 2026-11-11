import { describe, it, expect } from "vitest"
import { lineageOrder, lineageRank } from "@/lib/lineageOrder"
import type { Gender, Member } from "@/lib/types"

function mk(
  partial: Partial<Member> & Pick<Member, "id" | "name" | "gender" | "generation">,
): Member {
  return {
    familyId: 1,
    courtesyName: "",
    fatherId: null,
    motherId: null,
    spouseId: null,
    isMarriedIn: false,
    isBranchHeir: false,
    branch: "",
    birthYear: "",
    deathYear: "",
    isAlive: false,
    burialPlace: "",
    title: "",
    bio: "",
    sortOrder: 0,
    avatarKey: "",
    createdBy: "",
    updatedBy: "",
    createdAt: "",
    updatedAt: "",
    ...partial,
  } as Member
}

const M = (over: Partial<Member> & { id: number; name: string; generation: number }): Member =>
  mk({ gender: "male" as Gender, ...over })

describe("lineageOrder", () => {
  it("父系深度优先，同房连续并按长幼", () => {
    const members = [
      M({ id: 1, name: "A", generation: 1 }),
      M({ id:2, name: "B", generation: 2, fatherId: 1, sortOrder: 2 }),
      M({ id:3, name: "C", generation: 2, fatherId: 1, sortOrder: 1 }),
      M({ id:4, name: "D", generation: 3, fatherId: 2, sortOrder: 0 }),
    ]
    expect(lineageOrder(members).map((m) => m.id)).toEqual([1, 3, 2, 4])
  })

  it("空数组返回空", () => {
    expect(lineageOrder([])).toEqual([])
  })

  it("多个无父 root 按长幼排序", () => {
    const members = [
      M({ id: 2, name: "B", generation: 1, sortOrder: 2 }),
      M({ id: 1, name: "A", generation: 1, sortOrder: 1 }),
    ]
    expect(lineageOrder(members).map((m) => m.id)).toEqual([1, 2])
  })

  it("父不在册的成员作为 root 兜底排在末尾", () => {
    const members = [
      M({ id: 1, name: "A", generation: 1 }),
      M({ id: 2, name: "B", generation: 2, fatherId: 99 }), // 父 99 不在册
    ]
    const ordered = lineageOrder(members).map((m) => m.id)
    expect(ordered[ordered.length - 1]).toBe(2)
  })
})

describe("lineageRank", () => {
  it("返回名次 map（父先于子）", () => {
    const members = [
      M({ id: 1, name: "A", generation: 1 }),
      M({ id: 2, name: "B", generation: 2, fatherId: 1 }),
    ]
    const rank = lineageRank(members)
    expect(rank.get(1)).toBe(0)
    expect(rank.get(2)).toBe(1)
  })
})
