import { useMemo, useRef, useState } from "react"
import type { CSSProperties } from "react"
import { cn } from "@/lib/utils"
import { detectFontBoost } from "@/lib/minFontSize"
import { lineageOrder, lineageRank } from "@/lib/lineageOrder"
import {
  canHoldBranch,
  generationLabel,
  toChineseNumber,
  type Family,
  type Member,
} from "@/lib/types"
import { buildMemberMemo, cnYear } from "./memberMemo"

/**
 * 谱页两种纸面版面。
 * 欧式：五世一表；一表输出右页、左页两张 A4 竖排，合起来是 A3 横排跨页。
 *       列宽与带高由小传内容量计算，避免文字溢格与横线穿字。
 * 欧苏结合：沿用按列宽分卷的版面。
 *
 * 类名遵循 print.css 的 BEM 约定；尺寸 token 与 print.css 的 --euro-* 对应。
 */

/** 下列常量与 print.css 的 --euro-band-h / --euro-font-memo 保持联动 */
const COL_UNIT = 15
/** 姓名、功名牌、编号、gap、padding 的固定宽度之和 */
const PERSON_FIXED_W = 60
const MEMO_CHARS_PER_COLUMN = 9
const MIN_COL_W = 140
const MAX_COL_W = 260

const MAX_MEMO_LEN = 40

/** 欧苏结合按累计列宽分卷用：预算取 A3 横排后左半幅小传的真实可用宽度。
 *  旧值 1360 远超纸面，超出的部分会被 overflow 裁掉（表现为末世代整列不见） */
const MAX_BIO_WIDTH = 820
/** 单栏宽度，与 print.css 的 .combo-person width 联动 */
const BIO_COL_W = 28
/** 世代表头栏宽度，与 print.css 的 .combo-col__head 联动 */
const BIO_HEAD_W = 20
const NODE_H = 22

/** 卷内图：名宽按字数估，父子居中递归排版 */
const CHART_FONT = 12.5
const CHART_PAD_X = 7
const CHART_GAP_X = 14
const CHART_ROW_H = 92
/** 单行可用宽度，超出即整块换行 */
const CHART_MAX_W = 620
/** 行与行之间留白 */
const CHART_ROW_GAP = 26

export type PaperLayout = "euro" | "combo"


interface Props {
  members: Member[]
  allMembers: Member[]
  /** 版式基准集合：含外衍的可见范围。分卷与列宽按它算，与外衍开关无关 */
  frameMembers: Member[]
  family: Family
  bloodIds: Set<number>
  layout: PaperLayout
}

const genOf = (m: Member) => Math.max(1, m.generation)
const shorten = (s: string) => (s.length > MAX_MEMO_LEN ? `${s.slice(0, MAX_MEMO_LEN)}…` : s)

interface MemoLine {
  text: string
  /** 截断前的全文，用于 title 兜底 */
  full?: string
  bold?: boolean
}

interface EuroMemo {
  honor: string
  /** 父辈信息：字、生卒、配、生子计数等，各占一列，从带顶起排 */
  lines: MemoLine[]
  /** 子嗣姓名与编号：下沉一层显示，不与父辈信息平级 */
  children: { name: string; id: number }[]
}

/** 欧式小传：配与生子计数加粗；子嗣单独成下沉层，编号横排 */
function buildEuroMemo(
  member: Member,
  byId: Map<number, Member>,
  childrenOf: (id: number) => Member[],
): EuroMemo {
  const lines: MemoLine[] = []
  const push = (text: string, bold = false) => {
    const textShown = shorten(text)
    lines.push({
      text: textShown,
      full: textShown === text ? undefined : text,
      bold,
    })
  }
  if (member.courtesyName) push(`字${member.courtesyName}`)
  const birth = cnYear(member.birthYear)
  const death = cnYear(member.deathYear)
  if (birth) push(`生于${birth}年`)
  if (death) push(`卒于${death}年`)
  if (birth && death) {
    const span = Number(member.deathYear) - Number(member.birthYear)
    if (Number.isFinite(span) && span > 0) push(`享寿${toChineseNumber(span)}岁`)
  }
  if (member.burialPlace) push(`葬${member.burialPlace}`)
  if (member.spouseId != null) {
    const spouse = byId.get(member.spouseId)
    if (spouse) {
      const marriedOut = member.gender === "female" && !member.isMarriedIn
      push(marriedOut ? `适${spouse.name.charAt(0)}氏` : `配${spouse.name}`, true)
    }
  }
  if (member.fatherId != null) {
    const father = byId.get(member.fatherId)
    if (father) push(`父${father.name}`)
  }
  const kids = childrenOf(member.id)
  if (kids.length) push(`生子${toChineseNumber(kids.length)}`, true)
  else push("（止）")
  // 房支只随父系血缘：普通外姓配偶不写「居X房」，入赘承祧者例外
  if (member.branch && canHoldBranch(member)) {
    push(member.branch.endsWith("房") ? `居${member.branch}` : `居${member.branch}房`)
  }
  if (member.bio) push(member.bio)
  return {
    honor: member.title ?? "",
    lines,
    children: kids.map((k) => ({ name: k.name, id: k.id })),
  }
}

/** 按小传项数估算一个人物单元需要的竖列数 */
function personColumns(
  member: Member,
  byId: Map<number, Member>,
  childrenOf: (id: number) => Member[],
): number {
  const { honor, lines, children } = buildEuroMemo(member, byId, childrenOf)
  // 姓名约 2 单元、功名 1、编号 2；父信息层与子嗣下沉层上下排布，
  // 宽度取两层中较宽者，不累加。
  let mainCols = 2 + (honor ? 1 : 0) + 2
  for (const line of lines) {
    mainCols += Math.max(1, Math.ceil(line.text.length / MEMO_CHARS_PER_COLUMN))
  }
  return Math.max(mainCols, children.length)
}

const personWidth = (
  member: Member,
  byId: Map<number, Member>,
  childrenOf: (id: number) => Member[],
) => personColumns(member, byId, childrenOf) * COL_UNIT + PERSON_FIXED_W

/* ── 欧式：五世一表、列位对齐、A4 双页 ── */

interface EuroSlot {
  member: Member
  /** 0 为最右列，数值越大越靠左；父子同 slot 即上下对齐 */
  slot: number
}

interface EuroBand {
  gen: number
  /** 该世有人占据的列位（升序；列位 0 为最右） */
  slots: number[]
  /** 与 slots 一一对应的列宽，按该世该人自身的小传量自适应 */
  widths: number[]
}

interface EuroChart {
  index: number
  gens: number[]
  people: EuroSlot[]
  /** 每一世各占的列与列宽 */
  bands: EuroBand[]
}

interface EuroLayout {
  /** 每张图作为一条独立长卷输出，不分页 */
  charts: EuroChart[]
}

function useEuroLayout(
  members: Member[],
  family: Family,
  byId: Map<number, Member>,
  childrenOf: (id: number) => Member[],
): EuroLayout {
  return useMemo(() => {
    const all = [...new Set(members.map(genOf))].sort((a, b) => a - b)
    if (all.length === 0) return { charts: [] }
    const maxGen = all[all.length - 1]

    // 第 1 图 1–5 世、第 2 图 5–9 世、第 3 图 9–13 世；相邻图共享一世
    const charts: { index: number; gens: number[] }[] = []
    let start = all[0]
    while (start < maxGen) {
      const end = start + 4
      charts.push({ index: charts.length + 1, gens: all.filter((g) => g >= start && g <= end) })
      if (end >= maxGen) break
      start = end
    }
    if (charts.length === 0) charts.push({ index: 1, gens: all })

    // 与行传、卷内图同一份谱序：房支优先、房内长幼
    const rank = lineageRank(members, family.branches)
    const cmp = (a: Member, b: Member) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0)

    const result: EuroChart[] = []

    for (const chart of charts) {
      const genSet = new Set(chart.gens)
      const chartPeople = members.filter((m) => genSet.has(genOf(m)))

      // 子树列段预留：自底向上算各子树所需列数，自顶向下分配互不重叠的列区间。
      // 父与长子同列，其余子按各自子树宽度依次向左，不同父的区间不重叠。
      interface TreeNode {
        m: Member
        kids: TreeNode[]
        span: number
        slot: number
      }
      const nodeOf = new Map<number, TreeNode>()
      for (const m of chartPeople) nodeOf.set(m.id, { m, kids: [], span: 1, slot: 0 })
      const roots: TreeNode[] = []
      for (const m of chartPeople) {
        // 父在本图内方认父；父不在（如外衍子女之父在夫家）则改认母，避免整支误成无根之木
        const p =
          m.fatherId != null && nodeOf.has(m.fatherId)
            ? m.fatherId
            : m.motherId != null && nodeOf.has(m.motherId)
              ? m.motherId
              : null
        const parent = p != null ? nodeOf.get(p) : undefined
        const self = nodeOf.get(m.id)!
        if (parent && genOf(parent.m) < genOf(m)) parent.kids.push(self)
        else roots.push(self)
      }
      const spanOf = (n: TreeNode): number => {
        n.kids.sort((a, b) => cmp(a.m, b.m))
        n.span = Math.max(1, n.kids.reduce((sum, k) => sum + spanOf(k), 0))
        return n.span
      }
      roots.sort((a, b) => cmp(a.m, b.m)).forEach(spanOf)

      let cursor = 0
      for (const root of roots) {
        const assign = (n: TreeNode, start: number) => {
          n.slot = start
          let next = start
          for (const k of n.kids) {
            assign(k, next)
            next += k.span
          }
        }
        assign(root, cursor)
        cursor += root.span
      }
      const slots: EuroSlot[] = chartPeople.map((m) => ({ member: m, slot: nodeOf.get(m.id)!.slot }))
      // 每一世单独起排：该世有人的列位才占宽，列宽按该人自身的小传量自适应。
      // 旧法按列位跨世代取最宽，某世空格也照占整列，纸面右侧便空出一大段，
      // 且相邻两列紧贴无间距；改为逐世成行后，右侧贴齐、行内留白一致。
      const bands: EuroBand[] = chart.gens.map((gen) => {
        // slot 降序：grid 从左到右，小 slot 落在最右，符合自右向左长幼
        const inGen = slots
          .filter((s) => genOf(s.member) === gen)
          .sort((a, b) => b.slot - a.slot)
        return {
          gen,
          slots: inGen.map((s) => s.slot),
          widths: inGen.map((s) =>
            Math.min(MAX_COL_W, Math.max(MIN_COL_W, personWidth(s.member, byId, childrenOf))),
          ),
        }
      })
      result.push({ index: chart.index, gens: chart.gens, people: slots, bands })
    }
    return { charts: result }
  }, [members, family, byId, childrenOf])
}

function EuroEntry({
  item,
  byId,
  childrenOf,
}: {
  item: EuroSlot
  byId: Map<number, Member>
  childrenOf: (id: number) => Member[]
}) {
  const m = item.member
  const { honor, lines, children } = buildEuroMemo(m, byId, childrenOf)
  return (
    <div className="euro-person">
      {honor ? <div className="euro-person__honor">{honor}</div> : null}
      <div className="euro-person__name" title={m.name}>{m.name}</div>
      <div className="euro-memo">
        <div className="euro-memo__main">
          {lines.map((line, i) => (
            <span
              className={cn("euro-memo__item", line.bold && "euro-memo__item--strong")}
              title={line.full ?? line.text}
              key={i}
            >
              {line.text}
            </span>
          ))}
        </div>
        {children.length > 0 ? (
          <div className="euro-memo__children">
            {children.map((k) => (
              <div className="euro-memo__child" key={k.id}>
                <span className="euro-memo__child-name" title={k.name}>{k.name}</span>
                <span className="euro-memo__child-no">({k.id})</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <span className="euro-person__no">({m.id})</span>
    </div>
  )
}

function EuroChartSection({
  chart,
  family,
  byId,
  childrenOf,
  bloodIds,
}: {
  chart: EuroChart
  family: Family
  byId: Map<number, Member>
  childrenOf: (id: number) => Member[]
  bloodIds: Set<number>
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const first = chart.gens[0]
  const last = chart.gens[chart.gens.length - 1]
  return (
    <section className="euro-chart">
      <header className="euro-chart__head">
        <b>{family.name}</b>
        <span>第{toChineseNumber(chart.index)}图 · {generationLabel(first)}至{generationLabel(last)}</span>
      </header>
      {/* 左右两列：左侧长卷独立横向滚动，右侧世次面板固定不随滚动 */}
      <div className="euro-chart__body">
        <div className="euro-scroll" ref={scrollRef}>
          <div className="euro-bands">
            {chart.bands.map((band) => (
              <div
                className="euro-band"
                key={band.gen}
                style={{ gridTemplateColumns: band.widths.map((w) => `${w}px`).join(" ") }}
              >
                {band.slots.map((slot) => {
                  const item = chart.people.find(
                    (x) => x.slot === slot && genOf(x.member) === band.gen,
                  )
                  return (
                    <div
                      className={cn(
                        "euro-cell",
                        item && !bloodIds.has(item.member.id) && "euro-cell--extended",
                      )}
                      key={slot}
                    >
                      {item ? <EuroEntry item={item} byId={byId} childrenOf={childrenOf} /> : null}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
        {/* 世次牌：独立固定列，不参与左侧滚动 */}
        <div className="euro-ruler">
          {chart.gens.map((gen) => (
            <span className="euro-ruler__tag" key={gen}>
              {toChineseNumber(gen)}世
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

function EuroScroll({
  euro,
  family,
  byId,
  childrenOf,
  bloodIds,
}: {
  euro: EuroLayout
  family: Family
  byId: Map<number, Member>
  childrenOf: (id: number) => Member[]
  bloodIds: Set<number>
}) {
  /* 行传里的编号、配偶、子嗣是 7–9px 小字，落在定宽格子里；
     浏览器最小字号会把它们撑出格子，这里把格子内小字同比放大再由 zoom 收回 */
  const [boost] = useState(() => detectFontBoost())

  return (
    <div
      className="euro-scroll-wrap"
      style={{ "--pf-boost": boost, "--pf-zoom": 1 / boost } as CSSProperties}
    >
      {euro.charts.map((chart) => (
        <EuroChartSection
          key={chart.index}
          chart={chart}
          family={family}
          byId={byId}
          childrenOf={childrenOf}
          bloodIds={bloodIds}
        />
      ))}
    </div>
  )
}

/* ── 欧苏结合：沿用原版面 ── */

interface Volume {
  index: number
  gens: number[]
  people: Member[]
}

function useVolumes(members: Member[], frameMembers: Member[]): Volume[] {
  return useMemo(() => {
    /* 分卷、世代归卷与列宽一律按「含外衍」的结构集合计算：
       外衍开关只决定各列里是否列出这些人，不改变卷数与版式骨架，
       否则每切一次开关整册都会重新分卷跳版。 */
    const frames = frameMembers.length > 0 ? frameMembers : members
    const gens = [...new Set(frames.map(genOf))].sort((a, b) => a - b)
    const volumes: Volume[] = []
    let current: number[] = []
    let used = 0
    const flush = () => {
      if (current.length === 0) return
      const set = new Set(current)
      volumes.push({
        index: volumes.length + 1,
        gens: current,
        people: members.filter((m) => set.has(genOf(m))),
      })
      current = []
      used = 0
    }
    for (const gen of gens) {
      /* 一代的宽度 = 人数 × 单栏宽 + 表头栏宽；超纸面即另起一卷 */
      const count = frames.filter((m) => genOf(m) === gen).length
      const colWidth = count * BIO_COL_W + BIO_HEAD_W
      if (current.length > 0 && used + colWidth > MAX_BIO_WIDTH) flush()
      current.push(gen)
      used += colWidth
    }
    flush()
    return volumes
  }, [members, frameMembers])
}

function SheetHead({ family, volume, total }: { family: Family; volume: Volume; total: number }) {
  const first = volume.gens[0]
  const last = volume.gens[volume.gens.length - 1]
  return (
    <header className="print-sheet-head">
      <span className="font-song text-[15px] tracking-[0.18em]">{family.name} · 欧苏谱</span>
      <span className="text-[10px] tracking-[0.16em]">
        第{toChineseNumber(volume.index)}卷 / 共{toChineseNumber(total)}卷 · {generationLabel(first)}
        {last !== first ? `—${generationLabel(last)}` : ""}
      </span>
    </header>
  )
}

function SheetFoot({ volume, total }: { volume: Volume; total: number }) {
  return (
    <footer className="print-sheet-foot">
      <span>世代自右向左，一人一栏，栏首朱点为名；空心点为外衍。</span>
      <span>第 {volume.index} / {total} 页</span>
    </footer>
  )
}

function BioColumns({
  gens,
  people,
  bloodIds,
  byId,
  childrenOf,
}: {
  gens: number[]
  /** 已按谱序（房支优先、房内长幼）排好，过滤即保留顺序 */
  people: Member[]
  bloodIds: Set<number>
  byId: Map<number, Member>
  childrenOf: (id: number) => Member[]
}) {
  return (
    <div className="combo-cols">
      {gens.map((gen) => {
        const list = people.filter((m) => genOf(m) === gen)
        return (
          <div className="combo-col" key={gen}>
            <div className="combo-col__head">{generationLabel(gen)}</div>
            {list.map((m) => (
              <div
                className={cn("combo-person", !bloodIds.has(m.id) && "combo-person--extended")}
                key={m.id}
              >
                <span className="combo-person__name">{m.name}</span>
                <span className="combo-person__memo">{buildMemberMemo(m, byId, childrenOf)}</span>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

const measureName = (name: string) =>
  Math.max(44, Array.from(name).length * CHART_FONT * 1.06 + CHART_PAD_X * 2)

/**
 * 卷内吊线图：父子居中的递归宽度算法，并按纸宽分行。
 * 子树宽度自底向上累加，父落在子辈区间的正中，同一房支的兄弟排在一起；
 * 因此吊线不会斜穿别人的支，房支在图上也是连续的。
 * 一行放不下时整块换行：块内不拆，父子不跨行，行数尽量均分。
 */
function useVolumeChart(volume: Volume) {
  return useMemo(() => {
    const people = volume.people
    const byId = new Map(people.map((m) => [m.id, m]))
    /* 父在本卷内随父，父不在（外衍之父在夫家）改随母 */
    const parentOf = (m: Member): number | null => {
      if (m.fatherId != null && byId.has(m.fatherId)) return m.fatherId
      if (m.motherId != null && byId.has(m.motherId)) return m.motherId
      return null
    }

    /* people 已按谱序排过，按序收集即得「房支连续、房内长幼」的兄弟次序 */
    const kidsMap = new Map<number, Member[]>()
    for (const m of people) {
      const pid = parentOf(m)
      if (pid == null) continue
      const arr = kidsMap.get(pid)
      if (arr) arr.push(m)
      else kidsMap.set(pid, [m])
    }
    const roots = people.filter((m) => parentOf(m) == null)

    interface ChartNode {
      id: number
      x: number
      y: number
    }
    /** 线段：竖线或横线，坐标为块内相对值 */
    interface Seg {
      x1: number
      y1: number
      x2: number
      y2: number
    }
    /** 一棵子树排好后的整块：宽高、根的位置、节点坐标、连线 */
    interface Block {
      w: number
      h: number
      /** 块根相对块左缘的 x */
      rootX: number
      nodes: ChartNode[]
      verticals: Seg[]
      horizontals: Seg[]
    }

    /** 子块按可用宽装箱成若干行 */
    const packRows = (blocks: Block[]): Block[][] => {
      const rows: Block[][] = []
      let row: Block[] = []
      let rowW = 0
      for (const b of blocks) {
        const add = (row.length ? CHART_GAP_X : 0) + b.w
        if (row.length > 0 && rowW + add > CHART_MAX_W) {
          rows.push(row)
          row = [b]
          rowW = b.w
        } else {
          row.push(b)
          rowW += add
        }
      }
      if (row.length > 0) rows.push(row)
      return rows
    }

    const rowWidth = (row: Block[]) =>
      row.reduce((sum, b, i) => sum + b.w + (i ? CHART_GAP_X : 0), 0)

    const blocks = new Map<number, Block>()
    const build = (m: Member): Block => {
      const cached = blocks.get(m.id)
      if (cached) return cached
      const selfW = measureName(m.name)
      const kids = kidsMap.get(m.id) ?? []
      if (kids.length === 0) {
        const leaf: Block = {
          w: selfW,
          h: NODE_H,
          rootX: selfW / 2,
          nodes: [{ id: m.id, x: selfW / 2, y: 0 }],
          verticals: [],
          horizontals: [],
        }
        blocks.set(m.id, leaf)
        return leaf
      }

      const kidBlocks = kids.map(build)
      const kidRows = packRows(kidBlocks)
      const rowWidths = kidRows.map(rowWidth)
      /* 块宽取父子二者宽的较大者，父落在子女区间正中 */
      const w = Math.max(selfW, ...rowWidths)
      const nodes: ChartNode[] = [{ id: m.id, x: w / 2, y: 0 }]
      const verticals: Seg[] = []
      const horizontals: Seg[] = []

      /* 子块逐行落位：每行一条族线横贯块宽，竖线只落在族线与块缘，不穿字 */
      let rowTop = CHART_ROW_H
      let prevLeft: number | null = null
      let prevRight = 0
      let prevLineY = 0
      for (const [ri, row] of kidRows.entries()) {
        const rw = rowWidths[ri]
        const rowH = Math.max(...row.map((b) => b.h))
        const lineY = rowTop - 35
        const left = (w - rw) / 2
        let cursor = left
        for (const b of row) {
          for (const n of b.nodes) nodes.push({ id: n.id, x: cursor + n.x, y: rowTop + n.y })
          for (const v of b.verticals) {
            verticals.push({
              x1: cursor + v.x1,
              y1: rowTop + v.y1,
              x2: cursor + v.x2,
              y2: rowTop + v.y2,
            })
          }
          for (const h of b.horizontals) {
            horizontals.push({
              x1: cursor + h.x1,
              y1: rowTop + h.y1,
              x2: cursor + h.x2,
              y2: rowTop + h.y2,
            })
          }
          /* 子块根自本行族线垂下 */
          verticals.push({ x1: cursor + b.rootX, y1: lineY, x2: cursor + b.rootX, y2: rowTop })
          cursor += b.w + CHART_GAP_X
        }
        /* 族线覆盖本行诸子；换行时由上一行族线的端点续下来 */
        const lineL = left
        const lineR = left + rw
        let linkX: number | null = null
        if (prevLeft != null) {
          const lo = Math.max(prevLeft, lineL)
          const hi = Math.min(prevRight, lineR)
          linkX = lo <= hi ? lo : lineL
        }
        const segL = linkX == null ? lineL : Math.min(lineL, linkX)
        const segR = linkX == null ? lineR : Math.max(lineR, linkX)
        horizontals.push({ x1: segL, y1: lineY, x2: segR, y2: lineY })
        if (linkX == null) {
          /* 首行：父自姓名下端正中垂到族线 */
          verticals.push({ x1: w / 2, y1: NODE_H, x2: w / 2, y2: lineY })
        } else {
          verticals.push({ x1: linkX, y1: prevLineY, x2: linkX, y2: lineY })
        }
        prevLeft = segL
        prevRight = segR
        prevLineY = lineY
        rowTop += rowH + CHART_ROW_GAP
      }

      const h = rowTop - CHART_ROW_GAP
      const block: Block = { w, h, rootX: w / 2, nodes, verticals, horizontals }
      blocks.set(m.id, block)
      return block
    }

    const rootBlocks = roots.map(build)
    /* 顶层按可用宽逐块装箱：宽子树自带一整行，图的总体宽度不超纸面 */
    const rows = packRows(rootBlocks)
    const rowWidths = rows.map(rowWidth)
    const width = Math.max(320, Math.ceil(Math.max(0, ...rowWidths) + 24))

    const pos = new Map<number, { x: number; y: number }>()
    const verticals: Seg[] = []
    const horizontals: Seg[] = []
    let y = 0
    for (const row of rows) {
      const rw = rowWidth(row)
      const rowH = Math.max(...row.map((b) => b.h))
      let cursor = (width - 24 - rw) / 2
      for (const b of row) {
        for (const n of b.nodes) pos.set(n.id, { x: cursor + n.x, y: y + n.y })
        for (const v of b.verticals) {
          verticals.push({ x1: cursor + v.x1, y1: y + v.y1, x2: cursor + v.x2, y2: y + v.y2 })
        }
        for (const h of b.horizontals) {
          horizontals.push({ x1: cursor + h.x1, y1: y + h.y1, x2: cursor + h.x2, y2: y + h.y2 })
        }
        cursor += b.w + CHART_GAP_X
      }
      y += rowH + CHART_ROW_GAP
    }

    const height = Math.max(180, y - CHART_ROW_GAP + 12)

    const paths: string[] = []
    for (const v of verticals) paths.push(`M ${v.x1} ${v.y1} V ${v.y2}`)
    for (const h of horizontals) paths.push(`M ${h.x1} ${h.y1} H ${h.x2}`)

    return { people, pos, paths, width, height }
  }, [volume])
}

function ComboChart({ volume, bloodIds }: { volume: Volume; bloodIds: Set<number> }) {
  const { people, pos, paths, width, height } = useVolumeChart(volume)
  return (
    <svg className="combo-frame__chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="卷内吊线图">
      {paths.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="#c9c4b8" strokeWidth="1" />
      ))}
      {people.map((m) => {
        const p = pos.get(m.id)
        if (!p) return null
        const blood = bloodIds.has(m.id)
        const cy = p.y + NODE_H / 2
        const nameW = measureName(m.name) - CHART_PAD_X * 2
        return (
          <g key={m.id} className={blood ? undefined : "ext"}>
            <circle
              cx={p.x - nameW / 2 + 3.5}
              cy={cy}
              r="2.6"
              fill={blood ? "#b3261e" : "none"}
              stroke={blood ? "#b3261e" : "#8f8a80"}
              strokeWidth="1"
            />
            <text x={p.x + 2} y={cy + 4.5} textAnchor="middle" fontSize={CHART_FONT} fill="#1c1c1c">
              {m.name}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export function PaperSheets({ members, allMembers, frameMembers, family, bloodIds, layout }: Props) {
  /* 谱序：房支优先、房内长幼。行传与卷内图都吃这一份顺序 */
  const ordered = useMemo(
    () => lineageOrder(members, family.branches),
    [members, family.branches],
  )
  const volumes = useVolumes(ordered, frameMembers)
  const { allById, allChildrenOf } = useMemo(() => {
    const map = new Map(allMembers.map((m) => [m.id, m]))
    return {
      allById: map,
      allChildrenOf: (id: number) =>
        allMembers
          .filter((m) => m.fatherId === id || m.motherId === id)
          .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id),
    }
  }, [allMembers])
  const euro = useEuroLayout(members, family, allById, allChildrenOf)

  if (layout === "euro") {
    if (euro.charts.length === 0) return <p className="print-empty">此谱暂无可排入的成员。</p>
    return (
      <EuroScroll
        euro={euro}
        family={family}
        byId={allById}
        childrenOf={allChildrenOf}
        bloodIds={bloodIds}
      />
    )
  }

  if (volumes.length === 0) {
    return <p className="print-empty">此谱暂无可排入的成员。</p>
  }

  return (
    <>
      {volumes.map((volume) => (
        <section className="print-sheet print-sheet--combo" key={volume.index}>
          <SheetHead family={family} volume={volume} total={volumes.length} />
          <div className="combo-frame">
            <div className="combo-frame__bio">
              <BioColumns
                gens={volume.gens}
                people={volume.people}
                bloodIds={bloodIds}
                byId={allById}
                childrenOf={allChildrenOf}
              />
            </div>
            <div className="combo-frame__spine">
              <b>{family.name}宗谱</b>
              {/* 年月与干支之间用全角空格断开，竖排里正好留一格；写成转义避免 lint 报不规则空白 */}
              <i>{`公元二〇二六年\u3000岁次丙午`}</i>
            </div>
            <div className="combo-frame__chart-wrap">
              <ComboChart volume={volume} bloodIds={bloodIds} />
            </div>
          </div>
          <SheetFoot volume={volume} total={volumes.length} />
        </section>
      ))}
    </>
  )
}
