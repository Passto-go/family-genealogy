import { describe, it, expect } from "vitest"
import { computeRadialLayout } from "@/lib/radialLayout"
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

describe("computeRadialLayout", () => {
  it("小家族布局：节点数=谱系成员数、坐标有限、边数=父子边", () => {
    const members = [
      M({ id: 1, name: "A", generation: 1 }),
      M({ id: 2, name: "B", generation: 2, fatherId: 1 }),
      M({ id: 3, name: "C", generation: 2, fatherId: 1 }),
    ]
    const layout = computeRadialLayout(members)
    expect(layout.nodes.length).toBe(3)
    expect(layout.width).toBeGreaterThan(0)
    expect(layout.height).toBeGreaterThan(0)
    for (const n of layout.nodes) {
      expect(Number.isFinite(n.x)).toBe(true)
      expect(Number.isFinite(n.y)).toBe(true)
    }
    expect(layout.edges.length).toBe(2)
  })

  it("单根无边", () => {
    const layout = computeRadialLayout([M({ id: 1, name: "A", generation: 1 })])
    expect(layout.nodes.length).toBe(1)
    expect(layout.edges.length).toBe(0)
  })

  it("多层深度生成递增的环半径", () => {
    const members = [
      M({ id: 1, name: "A", generation: 1 }),
      M({ id: 2, name: "B", generation: 2, fatherId: 1 }),
      M({ id: 3, name: "C", generation: 3, fatherId: 2 }),
    ]
    const layout = computeRadialLayout(members)
    expect(layout.rings.length).toBe(3)
    expect(layout.rings[2]).toBeGreaterThan(layout.rings[0])
  })
})
