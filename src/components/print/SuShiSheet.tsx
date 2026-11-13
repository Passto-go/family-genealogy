import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { cn } from "@/lib/utils"
import { detectFontBoost } from "@/lib/minFontSize"
import {
  computeClanBloodIds,
  generationLabel,
  toChineseNumber,
  type Family,
  type Member,
} from "@/lib/types"

/* ── 苏式（垂珠体）度量 ────────────────────────────────────────────────
   一格定栏：谱名一栏（大字），其左只有配氏与子嗣两栏（小字）。
   各栏位置全谱统一——某人不记配氏或子嗣，就空着那一栏，绝不把后一栏前移。
   栏内竖排自上而下，一栏写满 colSafe 向左续栏，故长文不截断、不压邻人。

   字号下限：浏览器「最小字号」设置会把低于阈值的 font-size 强制放大，而栏宽
   按字号算，一旦被放大就横向裁字、纵向截断（7px 的小字最容易中招）。故页面上
   先用运行时探测到的下限把整套度量同比放大，再由画布的 zoom（--sushi-fit）
   整体收回原视觉尺寸——zoom 不改 computed font-size，不会被二次放大。
   浏览器没有设下限时 boost = 1，直接按设计基准排。 */
const DESIGN = {
  nameFs: 13, // 谱名字号
  memoFs: 7, // 行实小字字号
  nameLh: 1.1, // 谱名竖排栏宽 / 字距基准
  memoLh: 1.35,
  colGutter: 2, // 栏与栏之间的净空
  colH: 124, // 单栏竖排可得高度
  tailPad: 4, // 末字余量：栏高须比内容多一点，否则最后一字的下半截被切
  cellGap: 12,
  branchGap: 26, // 房与房之间的空档
  rowGap: 44,
  pad: 22,
  cellPadR: 3,
} as const

type Metrics = {
  nameFs: number
  memoFs: number
  nameLh: number
  memoLh: number
  nameColW: number
  nameAdv: number
  memoColW: number
  memoAdv: number
  colGutter: number
  colH: number
  colSafe: number
  cellGap: number
  branchGap: number
  rowGap: number
  pad: number
  cellPadR: number
}

function metricsFor(boost: number): Metrics {
  const nameFs = DESIGN.nameFs * boost
  const memoFs = DESIGN.memoFs * boost
  const colH = DESIGN.colH * boost
  const tailPad = DESIGN.tailPad * boost
  return {
    nameFs,
    memoFs,
    nameLh: DESIGN.nameLh,
    memoLh: DESIGN.memoLh,
    nameColW: nameFs * DESIGN.nameLh,
    nameAdv: nameFs + nameFs * 0.1,
    memoColW: memoFs * DESIGN.memoLh,
    memoAdv: memoFs + memoFs * 0.05,
    colGutter: DESIGN.colGutter * boost,
    colH,
    colSafe: colH - tailPad,
    cellGap: DESIGN.cellGap * boost,
    branchGap: DESIGN.branchGap * boost,
    rowGap: DESIGN.rowGap * boost,
    pad: DESIGN.pad * boost,
    cellPadR: DESIGN.cellPadR * boost,
  }
}

/** 行实字段，自谱名向左侧依次排列：先配氏、后子嗣，缺项只在左侧留空 */
const FIELDS = ["spouse", "offspring"] as const
type Field = (typeof FIELDS)[number]
type CellValues = Record<Field, string>

type CellInfo = {
  values: CellValues
  h: number
}

type LaidNode = {
  id: string
  member: Member
  info: CellInfo
  extended: boolean
  gen: number
  x: number
  y: number
}

/** 一栏能容几列：内容超出一列可写高度即左移续栏 */
const colsOf = (m: Metrics, text: string) =>
  text ? Math.max(1, Math.ceil((text.length * m.memoAdv) / m.colSafe)) : 0
/** 该栏内容高度（不含末字余量） */
const heightOf = (m: Metrics, text: string) => Math.min(m.colSafe, text.length * m.memoAdv)

/** 一格：右端谱名，左端按固定栏位排布行实，缺项留空栏 */
function SuShiCell({
  member,
  info,
  cellW,
  nameLeft,
  fields,
  slotLeft,
  slotW,
  extended,
  matched,
  m,
}: {
  member: Member
  info: CellInfo
  cellW: number
  nameLeft: number
  fields: Field[]
  slotLeft: Record<string, number>
  slotW: Record<string, number>
  extended: boolean
  /** 搜索命中：姓名标橙 */
  matched?: boolean
  m: Metrics
}) {
  const colBase = {
    position: "absolute" as const,
    top: 0,
    writingMode: "vertical-rl" as const,
    textOrientation: "upright" as const,
    overflow: "hidden" as const,
  }
  return (
    <div
      className={cn(extended && "sushi-cell--extended")}
      style={{ position: "relative", width: cellW, height: info.h }}
    >
      <div
        className={cn(
          "font-song font-semibold",
          extended ? "text-[#7a7066]" : "text-[#1c1c1c]",
          matched && "print-hit",
        )}
        style={{
          ...colBase,
          left: nameLeft,
          width: m.nameColW,
          height: info.h,
          fontSize: m.nameFs,
          lineHeight: m.nameLh,
          letterSpacing: "0.1em",
        }}
      >
        {member.name}
      </div>
      {fields.map((field) => {
        const text = info.values[field]
        if (!text) return null
        return (
          <div
            key={field}
            className={cn("font-song", extended ? "text-[#8f887c]" : "text-[#3a352e]")}
            style={{
              ...colBase,
              left: slotLeft[field],
              width: slotW[field],
              height: info.h,
              fontSize: m.memoFs,
              lineHeight: m.memoLh,
              letterSpacing: "0.05em",
            }}
          >
            {text}
          </div>
        )
      })}
    </div>
  )
}

/**
 * 苏式纸面版（垂珠体）：
 *   一、世代自上而下，同一世代共一行，行顶对齐；
 *   二、同一房支（父系子树）连续占列，不与他房交错；房与房之间另留空档；
 *   三、长子与父同列，直下贯串；余子按长幼自右向左逐列排开；
 *   四、祖房（根）与各房均按长幼自右向左排列——竖排文字自右读起，故长者在右；
 *   五、父子之间：父名末垂竖线 → 横线连诸子 → 各子名首垂竖线，实线相接不断；
 *   六、世次图幅最右一条竖栏，圆牌样式与欧式一致，逐世一牌，纵向对齐行心；
 *   七、一格定栏：谱名、配氏、子嗣各占一栏，栏位全谱统一，缺项留空。
 */
export function SuShiSheet({
  people,
  family,
  allMembers,
  bloodIds,
  matchedIds,
}: {
  people: Member[]
  family: Family
  /** 全量成员，仅用于解析配氏姓名（配偶本身不入图） */
  allMembers?: Member[]
  /** 本族父系血脉集合；不在其中的即为外衍（展示外衍与不展示外衍两种范围都适用） */
  bloodIds?: Set<number>
  /** 搜索命中成员集合 */
  matchedIds?: Set<number>
}) {
  // 字号放大倍数：随浏览器最小字号走；没设下限时为 1，按设计基准排
  const [boost] = useState(() => detectFontBoost(DESIGN.memoFs))
  const m = useMemo(() => metricsFor(boost), [boost])

  const laid = useMemo(() => {
    const allById = new Map((allMembers ?? people).map((x) => [x.id, x]))
    const blood = bloodIds ?? computeClanBloodIds(people)
    const extendedIds = new Set(people.filter((x) => !blood.has(x.id)).map((x) => x.id))

    const idSet = new Set(people.map((x) => x.id))
    const childrenMap = new Map<number, Member[]>()
    const roots: Member[] = []
    const parentOf = new Map<number, number | null>()
    for (const person of people) {
      const pid =
        person.fatherId != null && idSet.has(person.fatherId)
          ? person.fatherId
          : person.motherId != null && idSet.has(person.motherId)
            ? person.motherId
            : null
      parentOf.set(person.id, pid)
      if (pid != null) {
        const list = childrenMap.get(pid) ?? []
        list.push(person)
        childrenMap.set(pid, list)
      } else {
        roots.push(person)
      }
    }
    const cmp = (a: Member, b: Member) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id
    for (const list of childrenMap.values()) list.sort(cmp)
    roots.sort(cmp)

    // 房支占列数：叶一列，父为诸子列数之和——保证同房支连续成组
    const widthCache = new Map<number, number>()
    const widthOf = (person: Member): number => {
      const cached = widthCache.get(person.id)
      if (cached !== undefined) return cached
      const kids = childrenMap.get(person.id) ?? []
      const w = kids.length ? kids.reduce((s, k) => s + widthOf(k), 0) : 1
      widthCache.set(person.id, w)
      return w
    }

    // 长子在父列直下，余子按长幼依次向左；根房支从右向左连续排开
    const colOf = new Map<number, number>()
    const place = (person: Member, rightCol: number) => {
      colOf.set(person.id, rightCol)
      let offset = 0
      for (const kid of childrenMap.get(person.id) ?? []) {
        place(kid, rightCol - offset)
        offset += widthOf(kid)
      }
    }
    let cursor = 0
    for (const root of roots) {
      place(root, cursor)
      cursor -= widthOf(root)
    }

    // 房分：祖之诸子各领一房，房与房之间另留空档，使房界一眼可辨
    const houses: { right: number; left: number }[] = []
    for (const root of roots) {
      const seeds = childrenMap.get(root.id) ?? []
      for (const seed of seeds.length ? seeds : [root]) {
        const right = colOf.get(seed.id) ?? 0
        houses.push({ right, left: right - widthOf(seed) + 1 })
      }
    }
    houses.sort((a, b) => b.right - a.right)
    /** 房序自右向左递增，故左侧之房再向左让出空档 */
    const houseInset = (col: number) => {
      const index = houses.findIndex((h) => col <= h.right && col >= h.left)
      return index > 0 ? -index * m.branchGap : 0
    }

    // 行实只记配氏与子嗣两项，逐项成栏（无则不占位，栏位另由全谱统一给出）
    const info = new Map<number, CellInfo>()
    for (const person of people) {
      const spouseMember = person.spouseId != null ? allById.get(person.spouseId) : null
      const kids = childrenMap.get(person.id) ?? []
      const sons = kids.filter((k) => k.gender === "male").length
      const daughters = kids.length - sons
      const values: CellValues = {
        // 男曰配，女曰适
        spouse: spouseMember ? `${person.gender === "female" ? "适" : "配"}${spouseMember.name}` : "",
        offspring: kids.length
          ? [sons ? `子${toChineseNumber(sons)}` : "", daughters ? `女${toChineseNumber(daughters)}` : ""]
              .filter(Boolean)
              .join("")
          : person.isAlive
            ? ""
            : "无嗣",
      }
      const nameH = Math.min(m.colH, person.name.length * m.nameAdv)
      const needH = Math.max(nameH, ...FIELDS.map((field) => heightOf(m, values[field] as string)))
      // 留出末字余量，字符不足一栏时也不切最后一字
      info.set(person.id, { values, h: Math.min(m.colH, Math.max(needH, m.nameAdv) + (m.colH - m.colSafe)) })
    }

    // 全谱统一栏位：某一项全谱都无，则不设此栏；否则每格都留出该栏
    const fields = FIELDS.filter((field) => people.some((p) => Boolean(info.get(p.id)?.values[field])))
    const slotW: Record<string, number> = {}
    for (const field of fields) {
      const maxCols = Math.max(1, ...people.map((p) => colsOf(m, info.get(p.id)?.values[field] ?? "")))
      slotW[field] = maxCols * m.memoColW
    }
    // 谱名右侧留 cellPadR，谱名与各栏、栏与栏之间各留 colGutter；
    // 左端不再额外留白（最左一栏紧贴格子的左边界），故格子总宽不能再多算一个净空。
    const cellW = Math.ceil(
      m.cellPadR +
        m.nameColW +
        fields.reduce((sum, field) => sum + m.colGutter + slotW[field], 0),
    )
    // 自谱名栏向左依次定位，缺项只留空位，不使后栏前移
    const nameLeft = cellW - m.cellPadR - m.nameColW
    const slotLeft: Record<string, number> = {}
    let slotCursor = nameLeft - m.colGutter
    for (const field of fields) {
      slotCursor -= slotW[field]
      slotLeft[field] = slotCursor
      slotCursor -= m.colGutter
    }

    const genOf = (person: Member) => Math.max(1, person.generation)
    const perGenH = new Map<number, number>()
    for (const person of people) {
      const g = genOf(person)
      perGenH.set(g, Math.max(perGenH.get(g) ?? 0, info.get(person.id)?.h ?? 0))
    }
    // 各世次行高统一：取全谱最高一格为唯一行高，所有世代共用，
    // 保证四世至八世格式一致、不会因末世（叶节点）内容短而整行压扁。
    const uniformH = Math.max(0, ...perGenH.values())
    const rowH = new Map<number, number>()
    for (const g of perGenH.keys()) rowH.set(g, uniformH)
    const rows = [...rowH.keys()].sort((a, b) => a - b)
    const rowTop = new Map<number, number>()
    let acc = 0
    for (const g of rows) {
      rowTop.set(g, acc)
      acc += (rowH.get(g) ?? 0) + m.rowGap
    }

    const cols = [...colOf.values()]
    const minCol = cols.length ? Math.min(...cols) : 0
    const strideW = cellW + m.cellGap

    const rawX = people.map((person) => {
      const col = colOf.get(person.id) ?? 0
      return (col - minCol) * strideW + houseInset(col)
    })
    const minX = rawX.length ? Math.min(...rawX) : 0

    const nodes: LaidNode[] = people.map((person, i) => {
      const g = genOf(person)
      return {
        id: String(person.id),
        member: person,
        info: info.get(person.id) ?? { values: {} as CellValues, h: m.colH },
        extended: extendedIds.has(person.id),
        gen: g,
        x: rawX[i] - minX,
        y: rowTop.get(g) ?? 0,
      }
    })

    const edges = people
      .map((person) => {
        const pid = parentOf.get(person.id) ?? null
        if (pid == null) return null
        return { id: `e-${pid}-${person.id}`, source: String(pid), target: String(person.id) }
      })
      .filter((e): e is NonNullable<typeof e> => e !== null)

    const minGen = rows[0] ?? 1
    const maxGen = rows[rows.length - 1] ?? 1
    return {
      nodes,
      edges,
      rows,
      rowH,
      rowTop,
      cellW,
      nameLeft,
      fields,
      slotLeft,
      slotW,
      minGen,
      maxGen,
      width: Math.max(0, ...nodes.map((n) => n.x)) + cellW,
      height: Math.max(0, acc - m.rowGap),
      hasExtended: nodes.some((n) => n.extended),
    }
  }, [people, allMembers, bloodIds, m])

  const nodeById = new Map(laid.nodes.map((n) => [n.id, n]))
  const canvasW = laid.width + m.pad * 2
  const canvasH = laid.height + m.pad * 2
  // 谱名一栏的中心，垂线由此下落
  const nameCx = laid.nameLeft + m.nameColW / 2
  // 世次牌宽度（与 print.css 的 --euro-ruler-w 保持一致），适宽缩放须一并计入
  const RULER_W = 40

  // 屏幕适宽：画布按纸面可用宽度（扣去世次牌）等比缩小，
  // 使最左的配氏、子嗣栏与最右的世次牌一屏皆在，不被滚动视口切掉。
  const sheetRef = useRef<HTMLElement | null>(null)
  const [fitZoom, setFitZoom] = useState(1)
  useLayoutEffect(() => {
    const el = sheetRef.current
    if (!el) return
    // 上限取 1/boost：度量已按 boost 放大，缩回这个比例才是原来的视觉尺寸
    const maxZoom = 1 / boost
    const apply = (innerW: number) => {
      const avail = innerW - RULER_W
      const next = avail > 0 ? Math.min(maxZoom, avail / canvasW) : maxZoom
      setFitZoom((prev) => (Math.abs(prev - next) < 0.002 ? prev : next))
    }
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) apply(entry.contentRect.width)
    })
    ro.observe(el)
    apply(el.getBoundingClientRect().width - parseFloat(getComputedStyle(el).paddingLeft) - parseFloat(getComputedStyle(el).paddingRight))
    return () => ro.disconnect()
  }, [canvasW, boost])

  return (
    <section ref={sheetRef} className="print-sheet sushi-sheet">
      <header className="sushi-head">
        <div className="sushi-title">
          <span style={{ writingMode: "vertical-rl", textOrientation: "upright" }}>
            {family.surname || family.name}氏家谱
          </span>
        </div>
        <div className="sushi-sub">
          {generationLabel(laid.minGen)}至{generationLabel(laid.maxGen)} · {toChineseNumber(laid.rows.length)}世一图 · 垂珠体
        </div>
      </header>

      {/* 左：长卷；右：世次牌固定不随滚动（与欧式同式）。
          画布按容器宽度收进（.sushi-canvas 的 zoom），世次牌不缩只跟着算高度。 */}
      <div className="sushi-body" style={{ "--sushi-fit": fitZoom } as CSSProperties}>
        <div className="sushi-scroll">
          <div
            className="sushi-canvas"
            style={{
              position: "relative",
              width: canvasW,
              height: canvasH,
            }}
          >
            <svg width={canvasW} height={canvasH} style={{ position: "absolute", inset: 0 }} aria-hidden>
              {(() => {
                const groups = new Map<string, { s: LaidNode; cs: LaidNode[] }>()
                for (const e of laid.edges) {
                  const s = nodeById.get(e.source)
                  const c = nodeById.get(e.target)
                  if (!s || !c) continue
                  const g = groups.get(e.source) ?? { s, cs: [] }
                  g.cs.push(c)
                  groups.set(e.source, g)
                }
                return [...groups.entries()].map(([src, { s, cs }]) => {
                  const sx = s.x + m.pad + nameCx
                  const sy = s.y + m.pad + s.info.h // 竖线起于父名之末，不留空档
                  const childTop = Math.min(...cs.map((c) => c.y + m.pad))
                  const my = sy + Math.max(10, (childTop - sy) * 0.5)
                  const xs = cs.map((c) => c.x + m.pad + nameCx)
                  const minX = Math.min(sx, ...xs)
                  const maxX = Math.max(sx, ...xs)
                  return (
                    <g key={src} stroke="#3f3a33" strokeWidth={1.1} strokeLinecap="square">
                      <line x1={sx} y1={sy} x2={sx} y2={my} />
                      <line x1={minX} y1={my} x2={maxX} y2={my} />
                      {xs.map((x, i) => (
                        <line key={i} x1={x} y1={my} x2={x} y2={childTop} />
                      ))}
                    </g>
                  )
                })
              })()}
            </svg>

            {laid.nodes.map((n) => (
              <div
                key={n.id}
                style={{
                  position: "absolute",
                  left: n.x + m.pad,
                  top: n.y + m.pad,
                  width: laid.cellW,
                  height: n.info.h,
                }}
              >
                <SuShiCell
                  member={n.member}
                  info={n.info}
                  cellW={laid.cellW}
                  nameLeft={laid.nameLeft}
                  fields={laid.fields}
                  slotLeft={laid.slotLeft}
                  slotW={laid.slotW}
                  extended={n.extended}
                  matched={matchedIds?.has(n.member.id)}
                  m={m}
                />
              </div>
            ))}
          </div>
        </div>

        {/* 世次牌：与欧式同款圆牌，纵向对齐各世行心。
            画布按 fitZoom 收进容器，这里不缩放，高度与牌位按同一比例折算，故仍与各世对齐。 */}
        <div className="sushi-ruler" style={{ height: canvasH * fitZoom }}>
          {laid.rows.map((g) => (
            <span
              className="euro-ruler__tag sushi-ruler__tag"
              key={g}
              style={{ top: (m.pad + (laid.rowTop.get(g) ?? 0) + (laid.rowH.get(g) ?? 0) / 2) * fitZoom }}
            >
              {toChineseNumber(g)}世
            </span>
          ))}
        </div>
      </div>

      <footer className="sushi-foot">
        <span>
          同一房支连续成列，长幼自右向左；竖线为父子相承；缺项留空栏。
          {laid.hasExtended ? "虚线框或浅色者为外衍。" : ""}
        </span>
        <span>世系图 · 第 1 / 1 页</span>
      </footer>
    </section>
  )
}
