import type { Edge, Node } from "@xyflow/react"
import type { Member } from "@/lib/types"
import { computeDisplayLineageIds, computeExtendedLineageIds } from "@/lib/types"

/* 卡片宽 216：200 的基准下「头像 44 + 配偶列 46 + 内边距 24」只剩 84px 给正文，
   姓名/字号较长时被截；216 配 40/36/20 后正文列 118px，与谱页卡片谱大致齐平。 */
export const NODE_WIDTH = 216
/* 110：容纳「世代 + 姓名 + 字 + 生卒」四行（最小字号 12px 时约需 108px） */
export const NODE_HEIGHT = 110
export const H_GAP = 22
export const V_GAP = 62

export interface MemberNodeData extends Record<string, unknown> {
  member: Member
  spouse: Member | null
  dimmed: boolean
  matched: boolean
  /** 该成员所属世代推导出的字辈用字 */
  ziBei?: string
  /** 该成员为本族血脉之外的「外衍」成员（出嫁子女所育之后裔），需视觉区分 */
  extended?: boolean
  /** 该节点为「整房支折叠」后的占位节点 */
  collapsed?: boolean
  collapsedLabel?: string
  collapsedCount?: number
  /** 紧凑档（谱系树·紧凑 / 吊线·紧凑） */
  compact?: boolean
  /** 子嗣数量（吊线节点显示「子 X」） */
  childCount?: number
  /** 苏式行传：生卒、配氏、子嗣、葬地等简传（仅苏式谱使用） */
  memo?: string
}

export type MemberFlowNode = Node<MemberNodeData, "member">

export interface LayoutResult {
  nodes: MemberFlowNode[]
  edges: Edge[]
  bounds: { width: number; height: number }
}

export interface LayoutOptions {
  /** 布局方向：竖向（默认，父上子下）或横向（父左子右） */
  orientation?: "vertical" | "horizontal"
  /** 已折叠（收起）的房支名称集合 */
  foldedBranches?: Set<string>
  /** 各房支人数，用于折叠占位节点的「N 人」标注 */
  branchCounts?: Record<string, number>
  /** 节点尺寸（紧凑档传更小值）；省略则沿用默认卡片尺寸 */
  nodeSize?: { width: number; height: number }
  /** 同辈间距与世代间距（紧凑档传更小值）；省略则沿用默认 */
  gaps?: { h: number; v: number }
}

/**
 * 世系布局：父在上、子在下（竖向）或父在左、子在右（横向），同辈横向/纵向排列。
 * 采用「子树宽度」递归测量，保证父节点始终居中于其子嗣之上且不与其兄弟重叠。
 *
 * 折叠：被折叠的房支仅保留其「房根」节点，渲染为虚线占位框，其余成员与其后代一并隐藏；
 * 未传 foldedBranches 时行为与改造前完全一致。
 */
export function buildLayout(
  members: Member[],
  options: LayoutOptions = {},
): LayoutResult {
  const orientation = options.orientation ?? "vertical"
  const folded = options.foldedBranches ?? new Set<string>()
  const branchCounts = options.branchCounts ?? {}

  // 节点尺寸与间距：紧凑档可覆盖为更小值
  const nw = options.nodeSize?.width ?? NODE_WIDTH
  const nh = options.nodeSize?.height ?? NODE_HEIGHT
  const hGap = options.gaps?.h ?? H_GAP
  const vGap = options.gaps?.v ?? V_GAP

  // 方向相关常量：竖向以 nw 占横向、nh 占纵向；横向反之
  const siblingNodeSize = orientation === "vertical" ? nw : nh
  const siblingGap = orientation === "vertical" ? hGap : vGap
  const genStride = orientation === "vertical" ? nh + vGap : nw + hGap

  const byId = new Map(members.map((m) => [m.id, m]))
  const lineageIds = computeDisplayLineageIds(members)
  const extendedIds = computeExtendedLineageIds(members)
  const lineage = members.filter((m) => lineageIds.has(m.id))

  const childrenMap = new Map<number, Member[]>()
  const roots: Member[] = []
  const parentOf = new Map<number, number | null>()

  // 世系归属：优先随父；若父为外姓配偶/入赘（不在世系主干），则改随本族母亲
  const resolveParent = (member: Member): number | null => {
    if (member.fatherId && lineageIds.has(member.fatherId)) return member.fatherId
    if (member.motherId && lineageIds.has(member.motherId)) return member.motherId
    return null
  }

  // 折叠房支的「房根」：本房中辈分最高、且父辈不属于同一房支的成员。
  // 配偶（含入赘承祧者）永不作房根：房根须由本族那一方承担，否则每个承祧者
  // 都会多生成一个「X房」占位框。
  const isFoldedBranchRoot = (member: Member): boolean => {
    if (member.isMarriedIn) return false
    if (!member.branch || !folded.has(member.branch)) return false
    const parentId = resolveParent(member)
    const parent = parentId ? byId.get(parentId) : null
    return !parent || parent.branch !== member.branch
  }
  const keepMember = (member: Member): boolean => {
    if (member.branch && folded.has(member.branch)) return isFoldedBranchRoot(member)
    return true
  }

  const visibleLineage = lineage.filter(keepMember)
  // 仅纳入可见集合内的父节点：父节点被筛除（如按房支过滤后其父属其他房支）时，
  // 该成员自动成为顶层根，避免悬空连线与错位布局。
  const visibleSet = new Set(visibleLineage.map((m) => m.id))

  for (const member of visibleLineage) {
    const rawParentId = resolveParent(member)
    const parentId = rawParentId != null && visibleSet.has(rawParentId) ? rawParentId : null
    parentOf.set(member.id, parentId)
    if (parentId) {
      const list = childrenMap.get(parentId) ?? []
      list.push(member)
      childrenMap.set(parentId, list)
    } else {
      roots.push(member)
    }
  }

  const compare = (a: Member, b: Member) => a.sortOrder - b.sortOrder || a.id - b.id
  for (const list of childrenMap.values()) list.sort(compare)
  roots.sort(compare)

  // 层级：以树深度为约束，保证「子层级 > 父层级」。此前直接按世次定位，
  // 若新增族人沿用当前最大世次、恰与父亲同世次，父子会被摆到同一行且父节点
  // 水平居中于子节点正上方，二者坐标完全重合而产生「节点重叠」；世次一致时
  // level === generation，布局与改造前完全相同。
  const levelOf = new Map<number, number>()
  const assignLevel = (member: Member, parentLevel: number | null) => {
    if (levelOf.has(member.id)) return
    const generation = Math.max(1, member.generation)
    const level = parentLevel == null ? generation : Math.max(generation, parentLevel + 1)
    levelOf.set(member.id, level)
    for (const kid of childrenMap.get(member.id) ?? []) assignLevel(kid, level)
  }
  for (const root of roots) assignLevel(root, null)

  const widthCache = new Map<number, number>()

  const measure = (member: Member, path: Set<number>): number => {
    const cached = widthCache.get(member.id)
    if (cached !== undefined) return cached
    if (path.has(member.id)) return siblingNodeSize + siblingGap

    path.add(member.id)
    const kids = childrenMap.get(member.id) ?? []
    let width = siblingNodeSize + siblingGap
    if (kids.length > 0) {
      const total = kids.reduce((sum, kid) => sum + measure(kid, path), 0)
      width = Math.max(width, total)
    }
    path.delete(member.id)

    widthCache.set(member.id, width)
    return width
  }

  const positions = new Map<number, { x: number; y: number }>()

  const place = (member: Member, left: number, path: Set<number>): number => {
    const width = measure(member, new Set())
    const level = levelOf.get(member.id) ?? Math.max(1, member.generation)
    const genPos = (level - 1) * genStride
    const kids = path.has(member.id) ? [] : (childrenMap.get(member.id) ?? [])

    let siblingPos: number
    if (kids.length === 0) {
      siblingPos = left + (width - siblingNodeSize) / 2
    } else {
      path.add(member.id)
      const childTotal = kids.reduce((sum, kid) => sum + measure(kid, new Set()), 0)
      let cursor = left + (width - childTotal) / 2
      const centers: number[] = []
      for (const kid of kids) {
        centers.push(place(kid, cursor, path))
        cursor += measure(kid, new Set())
      }
      path.delete(member.id)
      siblingPos = (centers[0] + centers[centers.length - 1]) / 2
    }

    const x = orientation === "vertical" ? siblingPos : genPos
    const y = orientation === "vertical" ? genPos : siblingPos
    positions.set(member.id, { x: x - nw / 2, y: y - nh / 2 })
    return siblingPos
  }

  let left = 0
  for (const root of roots) {
    place(root, left, new Set())
    left += measure(root, new Set())
  }

  const nodes: MemberFlowNode[] = visibleLineage.map((member) => {
    const position = positions.get(member.id) ?? { x: 0, y: 0 }
    const isCollapsed = Boolean(member.branch && folded.has(member.branch))
    const spouse = member.spouseId ? (byId.get(member.spouseId) ?? null) : null
    return {
      id: String(member.id),
      type: "member",
      position,
      width: nw,
      height: nh,
      draggable: false,
      connectable: false,
      data: {
        member,
        spouse,
        dimmed: false,
        matched: false,
        extended: extendedIds.has(member.id),
        collapsed: isCollapsed,
        collapsedLabel: isCollapsed ? member.branch : undefined,
        collapsedCount: isCollapsed ? (branchCounts[member.branch] ?? 0) : undefined,
      },
    }
  })

  const EDGE_COLOR = "var(--tree-line)"
  const edges: Edge[] = []
  for (const member of visibleLineage) {
    const parentId = parentOf.get(member.id) ?? null
    if (!parentId) continue
    // 目标成员为「外衍」（出嫁子女之后裔）时以虚线区分；其余为本族血脉实线
    const dashed = extendedIds.has(member.id)
    edges.push({
      id: `e-${parentId}-${member.id}`,
      source: String(parentId),
      target: String(member.id),
      type: "smoothstep",
      style: {
        stroke: EDGE_COLOR,
        strokeWidth: 1.5,
        ...(dashed ? { strokeDasharray: "6 4" } : {}),
      },
    })
  }

  let maxX = 0
  let maxY = 0
  for (const point of positions.values()) {
    maxX = Math.max(maxX, point.x + nw)
    maxY = Math.max(maxY, point.y + nh)
  }

  return { nodes, edges, bounds: { width: maxX, height: maxY } }
}
