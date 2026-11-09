import { useMemo, useState } from "react"
import type { Family, Member } from "@/lib/types"
import { computeRadialLayout, type RadialLayout } from "@/lib/radialLayout"
import { NODE_TYPO_BY_STYLE } from "@/lib/nodeTypography"
import { generationLabel, generationName, lifeSpan } from "@/lib/types"

const PALETTE = {
  ink: "#12303B",
  gold: "#A8863F",
  line: "#D8D2C4",
  ring: "#ECE7DB",
  card: "#FBFAF7",
  cardBorder: "#E2DDD2",
  male: "#2E6E9E",
  female: "#C75B86",
  root: "#12303B",
  extendedFill: "#EFEAE0",
  extendedBorder: "#B9A98C",
}

const CARD_W = 66
const CARD_H = 28

interface Props {
  members: Member[]
  family?: Family | null
}

/**
 * 收集「本人 + 配偶 + 父母 + 祖父母（上溯两代）」的亲属集合，
 * 用于聚焦视图淡出。范围与详情面板展示的亲属保持一致（不含子嗣）。
 */
function collectKinship(
  memberById: Map<number, Member>,
  id: number,
): Set<number> {
  const set = new Set<number>([id])
  const focus = memberById.get(id)
  if (focus?.spouseId != null) set.add(focus.spouseId)
  // 上溯两代（父母 + 祖父母）
  let current = [id]
  for (let level = 0; level < 2; level++) {
    const next: number[] = []
    for (const cid of current) {
      const m = memberById.get(cid)
      if (!m) continue
      for (const pid of [m.fatherId, m.motherId]) {
        if (pid != null && memberById.has(pid)) {
          set.add(pid)
          next.push(pid)
        }
      }
    }
    current = next
  }
  return set
}

/**
 * 扇形（饼图）世系图：
 * - 防重叠：computeRadialLayout 动态外推半径，卡片永不压叠；
 * - 自适应：画布按节点数自动缩放，完整可见；
 * - 交互：悬停高亮该人关系网络并在下方展开详情，移开自动收起；
 *   触屏端以点按节点替代悬停；点击扇形图整体进入世系图（外层 Link 负责）。
 */
export function RadialChart({ members, family }: Props) {
  const layout = useMemo<RadialLayout>(
    () => computeRadialLayout(members),
    [members],
  )
  // hovered = 当前悬停族人：悬停即显详情并高亮关系网络，移开即收起、恢复全图
  const [hovered, setHovered] = useState<number | null>(null)
  // 触屏设备无 hover：以点按节点替代悬停
  const isTouch =
    typeof window !== "undefined" &&
    window.matchMedia("(hover: none)").matches

  const memberById = useMemo(
    () => new Map(members.map((m) => [m.id, m])),
    [members],
  )

  // 外衍标记（与扇形图虚线框同源）
  const extendedById = useMemo(
    () => new Map(layout.nodes.map((n) => [n.id, n.extended])),
    [layout],
  )

  // 聚焦：当前悬停者（移开即收）
  const focusId = hovered

  const related = useMemo(() => {
    if (focusId == null) return null
    return collectKinship(memberById, focusId)
  }, [focusId, memberById])

  const focusMember = focusId != null ? memberById.get(focusId) ?? null : null
  const focusExtended =
    focusId != null ? (extendedById.get(focusId) ?? false) : false

  const kinship = useMemo(() => {
    if (!focusMember) return null
    const father =
      focusMember.fatherId != null ? memberById.get(focusMember.fatherId) ?? null : null
    const mother =
      focusMember.motherId != null ? memberById.get(focusMember.motherId) ?? null : null
    const gpOf = (p: Member | null): [Member | null, Member | null] =>
      p
        ? [
            p.fatherId != null ? memberById.get(p.fatherId) ?? null : null,
            p.motherId != null ? memberById.get(p.motherId) ?? null : null,
          ]
        : [null, null]
    const [pgf, pgm] = gpOf(father)
    const [mgf, mgm] = gpOf(mother)
    const spouse =
      focusMember.spouseId != null ? memberById.get(focusMember.spouseId) ?? null : null
    return { father, mother, pgf, pgm, mgf, mgm, spouse }
  }, [focusMember, memberById])

  // 悬停时仅做亲属聚焦（淡出非亲属），不放大画布
  const nodeOpacity = (id: number) => (related == null ? 1 : related.has(id) ? 1 : 0.12)
  const edgeActive = (from: number, to: number) =>
    related == null ? true : related.has(from) && related.has(to)

  const accentOf = (m: Member, isRoot: boolean) =>
    isRoot ? PALETTE.root : m.gender === "female" ? PALETTE.female : PALETTE.male

  const genderGlyph = (m: Member) => (m.gender === "female" ? "♀" : "♂")

  const extendedBadge = (
    <span className="rounded-full border border-dashed border-[#B9A98C] bg-[#EFEAE0] px-2 py-0.5 text-[11px] tracking-[0.12em] text-[#9C8B6E] dark:border-[#8a7c58] dark:bg-[#241f12] dark:text-[#e7d3a0]">
      外衍
    </span>
  )

  return (
    <div className="w-full">
      {/* 画布：悬停高亮聚焦并展开详情，移开自动收起；点击整体进入世系图 */}
      <div className="mt-2 w-full">
        <svg
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          className="mx-auto block w-full max-w-[860px] font-song"
          role="img"
          aria-label="世系全景（扇形）"
          onMouseLeave={() => setHovered(null)}
          onClick={(e) => {
            // 触屏端：聚焦状态下点空白 = 收起详情、恢复全图；未聚焦时不拦截（跳转世系图）
            if (isTouch && hovered != null) {
              e.stopPropagation()
              setHovered(null)
            }
          }}
        >
          <g>
            {/* 引导弧 */}
            {layout.rings.map((r, i) => (
              <path
                key={i}
                d={describeArc(layout.cx, layout.cy, r)}
                fill="none"
                stroke={PALETTE.ring}
                strokeWidth={1}
              />
            ))}

            {/* 连线 */}
            {layout.edges.map((e, i) => {
              const active = edgeActive(e.from, e.to)
              return (
                <line
                  key={i}
                  x1={e.x1}
                  y1={e.y1}
                  x2={e.x2}
                  y2={e.y2}
                  stroke={active ? PALETTE.gold : PALETTE.line}
                  strokeWidth={active ? 1.4 : 0.9}
                  opacity={related == null ? 0.9 : active ? 0.95 : 0.08}
                  style={{ transition: "opacity 180ms ease, stroke 180ms ease" }}
                />
              )
            })}

            {/* 节点 */}
            {layout.nodes.map((n) => {
              const isRoot = n.depth === 0
              const accent = accentOf(n.member, isRoot)
              const isFocus = related != null && n.id === focusId
              return (
                <g
                  key={n.id}
                  style={{ cursor: "pointer", transition: "opacity 180ms ease" }}
                  opacity={nodeOpacity(n.id)}
                  onMouseEnter={() => setHovered(n.id)}
                  onClick={(e) => {
                    // 触屏端无 hover：点按节点 = 聚焦/切换，再点当前节点 = 收起；
                    // 拦截冒泡避免立即跳转；PC 端不拦截，保持点击整体跳转世系图。
                    if (isTouch) {
                      e.stopPropagation()
                      setHovered(isFocus ? null : n.id)
                    }
                  }}
                >
                  <rect
                    x={n.x - CARD_W / 2}
                    y={n.y - CARD_H / 2}
                    width={CARD_W}
                    height={CARD_H}
                    rx={3}
                    fill={n.extended ? PALETTE.extendedFill : PALETTE.card}
                    stroke={
                      isFocus
                        ? PALETTE.gold
                        : isRoot
                          ? PALETTE.root
                          : n.extended
                            ? PALETTE.extendedBorder
                            : accent
                    }
                    strokeWidth={isFocus ? 2 : isRoot ? 1.4 : 1}
                    strokeDasharray={
                      n.extended && !isFocus ? "3 2" : undefined
                    }
                    style={{ transition: "stroke 180ms ease, stroke-width 180ms ease" }}
                  />
                  <rect
                    x={n.x - CARD_W / 2}
                    y={n.y - CARD_H / 2}
                    width={3}
                    height={CARD_H}
                    rx={1.5}
                    fill={accent}
                  />
                  <text
                    x={n.x + CARD_W / 2 - 7}
                    y={n.y - CARD_H / 2 + 9}
                    fontSize={8}
                    textAnchor="middle"
                    fill={accent}
                  >
                    {genderGlyph(n.member)}
                  </text>
                  <text
                    x={n.x - 2}
                    y={n.y + 4}
                    textAnchor="middle"
                    fontSize={NODE_TYPO_BY_STYLE.radial.fontSize}
                    fontWeight={NODE_TYPO_BY_STYLE.radial.fontWeight}
                    fill={PALETTE.ink}
                  >
                    {n.member.name}
                  </text>
                  {n.extended ? (
                    <text
                      x={n.x - CARD_W / 2 + 4}
                      y={n.y + CARD_H / 2 - 4}
                      fontSize={7}
                      fill="#5f5238"
                    >
                      外
                    </text>
                  ) : null}
                </g>
              )
            })}
          </g>
        </svg>
      </div>

      {/* 图例 */}
      <div className="mx-auto mt-3 flex max-w-[860px] flex-wrap items-center justify-center gap-x-5 gap-y-1 text-[12.5px] tracking-[0.12em] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: PALETTE.male }} /> ♂ 男
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: PALETTE.female }} /> ♀ 女
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: PALETTE.root }} /> 始祖
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block h-2.5 w-2.5 rounded-full border border-dashed border-[#B9A98C] bg-[#EFEAE0] dark:border-[#8a7c58] dark:bg-[#241f12]" /> 外姓 / 外衍
        </span>
      </div>

      {/* 亲属关系视图（详情卡）：悬停展开，移开自动收起 */}
      {focusMember && kinship ? (
        <div className="mx-auto mt-4 max-w-[860px] rounded-sm border border-paper-300 bg-paper-100 p-4 text-[13px] leading-relaxed text-ink-700">
          <div className="flex items-baseline justify-between gap-3">
            <p className="flex items-center gap-2 font-song text-[18px] tracking-[0.12em] text-ink-800">
              <i
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: accentOf(focusMember, false) }}
              />
              {focusMember.name}
              <span className="text-[12.5px] tracking-[0.16em] text-muted-foreground">
                {focusMember.gender === "female" ? "♀ 女" : "♂ 男"}
              </span>
            </p>
            <span className="text-[11.5px] tracking-[0.14em] text-muted-foreground">
              {focusExtended ? extendedBadge : generationLabel(focusMember.generation)}
            </span>
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
            <Detail label="字辈" value={focusExtended ? "—" : generationName(family, focusMember.generation) || "—"} />
            <Detail label="房支" value={focusExtended ? "—" : focusMember.branch || "—"} />
            <Detail label="生卒" value={lifeSpan(focusMember)} />
            <Detail label="配偶" value={kinship.spouse?.name || "—"} />
          </dl>

          <div className="mt-4 border-t border-paper-200 pt-3">
            <p className="text-[11.5px] tracking-[0.2em] text-muted-foreground/80">亲属关系</p>
            <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2 text-[12.5px] sm:grid-cols-4">
              <Detail label="父" value={kinship.father?.name || "—"} />
              <Detail label="母" value={kinship.mother?.name || "—"} />
              <Detail label="祖父" value={kinship.pgf?.name || "—"} />
              <Detail label="祖母" value={kinship.pgm?.name || "—"} />
            </dl>
            {(kinship.mgf || kinship.mgm) && (
              <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2 text-[12.5px] sm:grid-cols-4">
                <Detail label="外祖父" value={kinship.mgf?.name || "—"} />
                <Detail label="外祖母" value={kinship.mgm?.name || "—"} />
                <Detail label="" value="" />
                <Detail label="" value="" />
              </dl>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[12.5px] tracking-[0.14em] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium text-ink-800">{value}</dd>
    </div>
  )
}

function describeArc(cx: number, cy: number, r: number) {
  const span = (150 * Math.PI) / 180
  const x1 = cx + Math.sin(-span / 2) * r
  const y1 = cy + Math.cos(-span / 2) * r
  const x2 = cx + Math.sin(span / 2) * r
  const y2 = cy + Math.cos(span / 2) * r
  return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`
}
