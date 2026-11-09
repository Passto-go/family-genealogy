import type { Member } from "./types"
import { computeDisplayLineageIds, computeExtendedLineageIds } from "./types"

const CARD_W = 66
const CARD_H = 28
const TANGENT_PAD = 14 // 卡片两侧留白（沿切线方向），避免名号相互压字
const OUTER_MARGIN = 34 // 画布外缘留白，防止边缘卡片被截断

export interface RadialNode {
  id: number
  x: number
  y: number
  depth: number
  member: Member
  extended: boolean
}

export interface RadialLayout {
  nodes: RadialNode[]
  edges: { from: number; to: number; x1: number; y1: number; x2: number; y2: number }[]
  width: number
  height: number
  /** 布局原点（扇形顶点 / 同心圆圆心），已平移至正坐标 */
  cx: number
  cy: number
  /** 各世代半径，用于绘制引导圈 / 弧 */
  rings: number[]
  parentOf: Map<number, number | null>
  childrenOf: Map<number, Member[]>
}

interface Opts {
  base?: number
  step?: number
  span?: number
}

interface RadialUnit {
  member: Member
  children: RadialUnit[]
}

/**
 * 扇形（饼图）世系布局：解决「节点重叠」与「画布截断」两件事。
 *
 * 1. 角度：叶子按数量均分 2π（保证子树宽度与后代规模成正比，祖先可读），内部节点取子节点角度均值。
 * 2. 防重叠（动态角间距外扩）：统计每一世代节点数 N_d，求一个统一缩放系数 s，
 *    使最密一环的圆弧长足以容纳 N_d 张卡片（含切线留白）。半径随之外推，
 *    卡片永不沿切线方向相互压叠；径向留白亦由 s 一并保证。
 * 3. 自适应包围盒：按全部节点（含卡片半幅 + 外缘留白）计算最小矩形，整体平移为正坐标，
 *    无论家族多大都完整可见（整体缩放保可读）。
 */
export function computeRadialLayout(members: Member[], opts: Opts = {}): RadialLayout {
  const { base = 46, step = 54, span = (150 * Math.PI) / 180 } = opts
  const lineageIds = computeDisplayLineageIds(members)
  const lineage = members.filter((m) => lineageIds.has(m.id))

  const childrenMap = new Map<number, Member[]>()
  const roots: Member[] = []
  const resolveParent = (m: Member): number | null =>
    m.fatherId != null && lineageIds.has(m.fatherId)
      ? m.fatherId
      : m.motherId != null && lineageIds.has(m.motherId)
        ? m.motherId
        : null

  for (const m of lineage) {
    const p = resolveParent(m)
    if (p) {
      const list = childrenMap.get(p) ?? []
      list.push(m)
      childrenMap.set(p, list)
    } else {
      roots.push(m)
    }
  }

  const tree = (m: Member): RadialUnit => ({
    member: m,
    children: (childrenMap.get(m.id) ?? []).map(tree),
  })
  const trees = roots.map(tree)

  const leaves: Member[] = []
  const walk = (u: RadialUnit) => {
    if (u.children.length === 0) leaves.push(u.member)
    else u.children.forEach(walk)
  }
  trees.forEach(walk)

  // 角度：叶子均分 2π，内部取子节点角度均值
  const angle = new Map<number, number>()
  leaves.forEach((l, i) => angle.set(l.id, ((i + 0.5) / Math.max(1, leaves.length)) * Math.PI * 2))
  const setAngle = (u: RadialUnit) => {
    if (u.children.length > 0) {
      u.children.forEach(setAngle)
      angle.set(
        u.member.id,
        (angle.get(u.children[0].member.id)! + angle.get(u.children[u.children.length - 1].member.id)!) / 2,
      )
    }
  }
  trees.forEach(setAngle)

  // 各世代深度与节点数
  const depthOf = new Map<number, number>()
  let maxDepth = 0
  const tagDepth = (u: RadialUnit, d: number) => {
    depthOf.set(u.member.id, d)
    maxDepth = Math.max(maxDepth, d)
    u.children.forEach((c) => tagDepth(c, d + 1))
  }
  trees.forEach((t) => tagDepth(t, 0))

  const countByDepth = new Map<number, number>()
  for (const id of depthOf.keys()) {
    const d = depthOf.get(id)!
    countByDepth.set(d, (countByDepth.get(d) ?? 0) + 1)
  }

  const sweep = span

  // 扇形：全局缩放系数，使最密一环的圆弧长足以容纳该世全部卡片（含切线留白），
  // 卡片永不沿切线方向相互压叠；径向留白亦由 scale 一并保证。
  const radiusArr: number[] = []
  let scale = 1
  for (let d = 0; d <= maxDepth; d++) {
    const n = countByDepth.get(d) ?? 0
    if (n <= 1) continue
    const r = base + d * step
    scale = Math.max(scale, (n * (CARD_W + TANGENT_PAD)) / (sweep * r))
  }
  scale = Math.max(scale, (CARD_H + TANGENT_PAD) / step)
  for (let d = 0; d <= maxDepth; d++) radiusArr[d] = (base + d * step) * scale

  const radiusOf = (d: number) => radiusArr[d]

  const pos = new Map<number, { x: number; y: number }>()
  const place = (u: RadialUnit, d: number) => {
    const a = angle.get(u.member.id) ?? 0
    const r = radiusOf(d)
    // 扇形：顶点在下，向上张开 span
    const theta = (a / (Math.PI * 2) - 0.5) * span
    const x = Math.sin(theta) * r
    const y = Math.cos(theta) * r
    pos.set(u.member.id, { x, y })
    u.children.forEach((c) => place(c, d + 1))
  }
  trees.forEach((t) => place(t, 0))

  const edgeList: { from: number; to: number }[] = []
  const edge = (u: RadialUnit) => {
    u.children.forEach((c) => {
      edgeList.push({ from: u.member.id, to: c.member.id })
      edge(c)
    })
  }
  trees.forEach(edge)

  // 包围盒（含卡片半幅 + 外缘留白），整体平移至正坐标
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of pos.values()) {
    minX = Math.min(minX, p.x - CARD_W / 2)
    maxX = Math.max(maxX, p.x + CARD_W / 2)
    minY = Math.min(minY, p.y - CARD_H / 2)
    maxY = Math.max(maxY, p.y + CARD_H / 2)
  }
  const shiftX = -minX + OUTER_MARGIN
  const shiftY = -minY + OUTER_MARGIN
  const width = maxX - minX + OUTER_MARGIN * 2
  const height = maxY - minY + OUTER_MARGIN * 2

  const byId = new Map(members.map((m) => [m.id, m]))
  const extendedIds = computeExtendedLineageIds(members)
  const nodes: RadialNode[] = [...pos.entries()].map(([id, p]) => ({
    id,
    x: p.x + shiftX,
    y: p.y + shiftY,
    depth: depthOf.get(id)!,
    member: byId.get(id)!,
    extended: extendedIds.has(id),
  }))
  const edges = edgeList.map((e) => {
    const a = pos.get(e.from)!, b = pos.get(e.to)!
    return {
      from: e.from,
      to: e.to,
      x1: a.x + shiftX,
      y1: a.y + shiftY,
      x2: b.x + shiftX,
      y2: b.y + shiftY,
    }
  })

  const rings = Array.from({ length: maxDepth + 1 }, (_, d) => radiusOf(d))
  // 原点即扇形顶点 / 同心圆圆心，已平移至正坐标
  const cx = shiftX
  const cy = shiftY

  const parentOf = new Map<number, number | null>()
  for (const m of lineage) parentOf.set(m.id, resolveParent(m))

  return { nodes, edges, width, height, cx, cy, rings, parentOf, childrenOf: childrenMap }
}
