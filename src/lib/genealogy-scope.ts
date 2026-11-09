import { useMemo } from "react"
import {
  computeClanBloodIds,
  computeVisibleLineageIds,
  expandDescendantsAndSpouses,
  type Family,
  type Member,
} from "@/lib/types"

type ScopeInput = {
  members: Member[]
  family: Family | null
  showExtended: boolean
  selectedBranches: string[]
}

/**
 * 世系图可见范围：展示范围（血脉 / 外衍 + 配偶）与房支筛选的叠加，
 * 以及与画布同源的血脉集合、房支清单和房支人数。
 */
export function useGenealogyScope({ members, family, showExtended, selectedBranches }: ScopeInput) {
  const visibleIds = useMemo(
    () => computeVisibleLineageIds(members, showExtended),
    [members, showExtended],
  )

  // displayIds 在可见成员之外再并入「开启时的配偶」——配偶为外姓，关闭时一并隐藏。
  const displayIds = useMemo(() => {
    const ids = new Set<number>()
    for (const m of members) {
      if (visibleIds.has(m.id)) {
        ids.add(m.id)
        if (showExtended && m.spouseId != null) ids.add(m.spouseId)
      }
    }
    return ids
  }, [members, visibleIds, showExtended])

  // 房支筛选（多选）：默认（空选）显示全部；选中若干房支时，并集展示这些房支的成员
  // 「及其全部后代」，不再上溯祖先——其余房支整体收起隐藏，不再占用展示区域。
  // 结构性房支：若某房在 family.branchHeads 中指定了房主（先祖）成员 id，
  // 则以房主为种子按血统子树自动派生（免逐人标注）；否则回退到按 member.branch 标签匹配。
  const visibleMembers = useMemo(() => {
    // 先按展示范围裁剪（血脉 / 外衍 + 配偶），再叠加房支筛选
    const scoped = members.filter((m) => displayIds.has(m.id))
    if (selectedBranches.length === 0) return scoped
    const headMap = family?.branchHeads ?? {}
    const byId = new Map(members.map((m) => [m.id, m]))
    const seed = new Set<number>()
    for (const name of selectedBranches) {
      const headId = headMap[name]
      if (typeof headId === "number" && byId.has(headId)) {
        seed.add(headId)
      } else {
        for (const m of scoped) if (m.branch === name) seed.add(m.id)
      }
    }
    const ids = expandDescendantsAndSpouses(members, seed)
    // 最终再次按展示范围裁剪：关闭时即使房支展开带出配偶也一并滤除
    return members.filter((m) => ids.has(m.id) && displayIds.has(m.id))
  }, [members, displayIds, selectedBranches, family?.branchHeads])

  // 血脉始终基于完整族谱计算，供字辈与房支派生使用
  const bloodIds = useMemo(() => computeClanBloodIds(members), [members])

  // 房支清单 = 家族配置 ∪ 族人实际标签（血脉成员）
  const branches = useMemo(() => {
    const seen: string[] = []
    for (const name of family?.branches ?? []) {
      if (name && !seen.includes(name)) seen.push(name)
    }
    for (const member of members) {
      if (member.branch && bloodIds.has(member.id) && !seen.includes(member.branch)) {
        seen.push(member.branch)
      }
    }
    return seen
  }, [members, family?.branches, bloodIds])

  const branchCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    const headMap = family?.branchHeads ?? {}
    const byId = new Map(members.map((m) => [m.id, m]))
    for (const name of branches) {
      const headId = headMap[name]
      let ids: Set<number>
      if (typeof headId === "number" && byId.has(headId)) {
        ids = expandDescendantsAndSpouses(members, [headId])
      } else {
        ids = new Set(members.filter((m) => m.branch === name).map((m) => m.id))
      }
      counts[name] = [...ids].filter((id) => bloodIds.has(id)).length
    }
    return counts
  }, [members, bloodIds, family?.branchHeads, branches])

  return { visibleIds, displayIds, visibleMembers, bloodIds, branches, branchCounts }
}
