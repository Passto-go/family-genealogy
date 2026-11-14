import { useLayoutEffect, useMemo, useRef, useState } from "react"
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
import { buildMemberMemo, cnYear, yearValue } from "./memberMemo"

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
 *  分卷规则＝「按左侧文字量贪心装箱」：把相邻世代依次放进当前卷，
 *  直到再加入下一代就超出本宽为止；故某一世填不满时，下一代只要整体放得下就并到同一卷。
 *  该值同时决定小传区的固定宽度（见下方 +40 余量）：所有分页因此等宽。 */
const MAX_BIO_WIDTH = 780
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
/** 卷内图左侧留给世次标尺的宽度（与 ComboChart 内的标签定位联动） */
const CHART_RULER_W = 56

export type PaperLayout = "euro" | "combo"


interface Props {
  members: Member[]
  allMembers: Member[]
  /** 版式基准集合：含外衍的可见范围。分卷与列宽按它算，与外衍开关无关 */
  frameMembers: Member[]
  family: Family
  bloodIds: Set<number>
  layout: PaperLayout
  /** 搜索命中的成员：姓名加深色强调 */
  matchedIds?: Set<number>
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
    const birthYear = yearValue(member.birthYear)
    const deathYear = yearValue(member.deathYear)
    const span = birthYear != null && deathYear != null ? deathYear - birthYear : null
    if (span != null && span > 0) push(`享寿${toChineseNumber(span)}岁`)
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

interface EuroChart {
  index: number
  gens: number[]
  people: EuroSlot[]
  /** 全图共用的列位宽度（下标即 slot，0 为最右列）：各世共享，故父子同 slot 上下对齐 */
  columns: number[]
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
      // 全图共用一套列位网格：同一 slot 在各世代落在同一横坐标，
      // 故父与长子（同 slot）上下严格对齐；该世此列无人时留空，不把后列前移。
      // 列宽取该 slot 上所有人小传量的最大值，保证各世共用时都不溢出。
      const maxSlot = slots.reduce((mx, s) => Math.max(mx, s.slot), 0)
      const columns: number[] = new Array(Math.max(0, maxSlot) + 1).fill(MIN_COL_W)
      for (const s of slots) {
        const w = Math.min(MAX_COL_W, Math.max(MIN_COL_W, personWidth(s.member, byId, childrenOf)))
        columns[s.slot] = Math.max(columns[s.slot], w)
      }
      result.push({ index: chart.index, gens: chart.gens, people: slots, columns })
    }
    return { charts: result }
  }, [members, family, byId, childrenOf])
}

function EuroEntry({
  item,
  byId,
  childrenOf,
  matched,
}: {
  item: EuroSlot
  byId: Map<number, Member>
  childrenOf: (id: number) => Member[]
  matched?: boolean
}) {
  const m = item.member
  const { honor, lines, children } = buildEuroMemo(m, byId, childrenOf)
  return (
    <div className="euro-person">
      {honor ? <div className="euro-person__honor">{honor}</div> : null}
      <div className="euro-person__idcol">
        <div className={cn("euro-person__name", matched && "print-hit")} title={m.name}>{m.name}</div>
        <span className="euro-person__no">({m.id})</span>
      </div>
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
    </div>
  )
}

function EuroChartSection({
  chart,
  family,
  byId,
  childrenOf,
  bloodIds,
  matchedIds,
}: {
  chart: EuroChart
  family: Family
  byId: Map<number, Member>
  childrenOf: (id: number) => Member[]
  bloodIds: Set<number>
  matchedIds?: Set<number>
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
            {chart.gens.map((gen) => (
              <div
                className="euro-band"
                key={gen}
                style={{
                  gridTemplateColumns: [...chart.columns]
                    .reverse()
                    .map((w) => `${w}px`)
                    .join(" "),
                }}
              >
                {chart.columns.map((_, i) => {
                  // 列位 0 在最右：grid 从左到右，故 slot 由大到小排布；无人处留空格
                  const slot = chart.columns.length - 1 - i
                  const item = chart.people.find(
                    (x) => x.slot === slot && genOf(x.member) === gen,
                  )
                  return (
                    <div
                      className={cn(
                        "euro-cell",
                        item && !bloodIds.has(item.member.id) && "euro-cell--extended",
                      )}
                      key={slot}
                    >
                      {item ? (
                        <EuroEntry
                          item={item}
                          byId={byId}
                          childrenOf={childrenOf}
                          matched={matchedIds?.has(item.member.id)}
                        />
                      ) : null}
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
  matchedIds,
}: {
  euro: EuroLayout
  family: Family
  byId: Map<number, Member>
  childrenOf: (id: number) => Member[]
  bloodIds: Set<number>
  matchedIds?: Set<number>
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
          matchedIds={matchedIds}
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
  matchedIds,
}: {
  gens: number[]
  /** 已按谱序（房支优先、房内长幼）排好，过滤即保留顺序 */
  people: Member[]
  bloodIds: Set<number>
  byId: Map<number, Member>
  childrenOf: (id: number) => Member[]
  matchedIds?: Set<number>
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
                <span className={cn("combo-person__name", matchedIds?.has(m.id) && "print-hit")}>
                  {m.name}
                </span>
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
 * 卷内吊线图：世代锁定在固定行（第 N 世恒在第 N 行），父子一律竖线相连，
 * 横线只在两世之间的空档里横走，绝不穿过任何姓名；横向按「父居中于诸子树正上方」
 * 递归排布，同一房支的兄弟相邻、房支连续。
 *
 * 旧法把子块按纸宽折行堆叠：折行后 lineY = rowTop - 35 而 rowGap = 26，族线会落进
 * 上一行的姓名区（压线）；折行也让同一世代散落在不同 y（世次乱序）。现按世代定行，
 * 两种问题一并消除；卷宽由分卷控制，超宽时由 SVG 等比缩放。
 */
function buildVolumeChart(volume: Volume) {
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

  /* 子树宽：叶取名宽，父取「自身名宽」与「诸子树宽之和（含兄弟间距）」的较大者 */
  const widthOf = new Map<number, number>()
  const measure = (m: Member): number => {
    const cached = widthOf.get(m.id)
    if (cached !== undefined) return cached
    const self = measureName(m.name)
    const kids = kidsMap.get(m.id) ?? []
    const kidsW = kids.length
      ? kids.reduce((sum, k) => sum + measure(k), 0) + (kids.length - 1) * CHART_GAP_X
      : 0
    const w = Math.max(self, kidsW)
    widthOf.set(m.id, w)
    return w
  }

  /* 水平位置：父恒居中于诸子树区间中点；无子者落在自身列宽中点 */
  const xOf = new Map<number, number>()
  const place = (m: Member, left: number) => {
    const w = measure(m)
    xOf.set(m.id, left + w / 2)
    const kids = kidsMap.get(m.id) ?? []
    if (kids.length === 0) return
    const kidsTotal =
      kids.reduce((sum, k) => sum + measure(k), 0) + (kids.length - 1) * CHART_GAP_X
    let cursor = left + (w - kidsTotal) / 2
    for (const k of kids) {
      place(k, cursor)
      cursor += measure(k) + CHART_GAP_X
    }
  }
  let cursor = 0
  for (const root of roots) {
    place(root, cursor)
    cursor += measure(root) + CHART_GAP_X
  }

  /* 纵向：第 N 世恒在第 N 行，行距取固定 CHART_ROW_H，世代因此永远对齐 */
  const gens = people.map(genOf)
  const minGen = gens.length ? Math.min(...gens) : 1
  const maxGen = gens.length ? Math.max(...gens) : 1
  const pos = new Map<number, { x: number; y: number }>()
  for (const m of people) {
    pos.set(m.id, { x: xOf.get(m.id) ?? 0, y: (genOf(m) - minGen) * CHART_ROW_H })
  }

  /* 归一化横向坐标：按「字形实宽」而非布局盒宽取边界。
     布局盒为防重叠留了较大余量（measureName 含 44px 下限与内边距），
     照盒宽定视图会让四周空出一大圈、整图被缩小；改用约 1em/字的实宽，
     图便能贴近内容边界，从而在同等图区内把字号放到最大。 */
  let minX = Infinity
  let maxX = -Infinity
  for (const m of people) {
    const p = pos.get(m.id)!
    const half = (Array.from(m.name).length * CHART_FONT) / 2
    // 左侧另让出朱点（圆心在文字左缘外约 3.6px，半径 2.6px）
    minX = Math.min(minX, p.x - half - 6)
    maxX = Math.max(maxX, p.x + half)
  }
  if (!Number.isFinite(minX)) {
    minX = 0
    maxX = 0
  }
  const shift = 12 - minX
  for (const p of pos.values()) p.x += shift

  /* 连线：父名底垂竖线到「父世与子世之间的空档」中点，横线只在空档里横走，
     再自此处竖线落到各子名顶——横线恒在上一世姓名之下、下一世姓名之上，绝不压字 */
  const paths: string[] = []
  for (const m of people) {
    const kids = kidsMap.get(m.id) ?? []
    if (kids.length === 0) continue
    const p = pos.get(m.id)!
    const py = p.y + NODE_H
    const midY = p.y + NODE_H + (CHART_ROW_H - NODE_H) / 2
    const xs = kids.map((k) => pos.get(k.id)!.x)
    const lo = Math.min(p.x, ...xs)
    const hi = Math.max(p.x, ...xs)
    paths.push(`M ${p.x} ${py} V ${midY}`)
    paths.push(`M ${lo} ${midY} H ${hi}`)
    for (const k of kids) {
      const kp = pos.get(k.id)!
      paths.push(`M ${kp.x} ${midY} V ${kp.y}`)
    }
  }

  const width = Math.max(240, Math.ceil(maxX - minX + 16))
  const height = Math.max(180, (maxGen - minGen) * CHART_ROW_H + NODE_H + 12)

  return { people, pos, paths, width, height }
}

type VolumeChart = ReturnType<typeof buildVolumeChart>

function ComboChart({
  chart,
  bloodIds,
  matchedIds,
}: {
  chart: VolumeChart
  bloodIds: Set<number>
  matchedIds?: Set<number>
}) {
  const { people, pos, paths, width, height } = chart
  /* 视图宽 = 本卷内容实宽 + 左侧世次标尺：每卷按自身内容贴合图区，
     字号随内容自动放大，两侧不留空 */
  const viewW = width + CHART_RULER_W
  /* 外衍开启后单代人数骤增（图宽可达 2000+ 单位），一味等比缩小会把姓名压到 3~4px。
     给一个 1:1 上限（最多 1400px）：窄图仍按容器自适应，超宽图则横向滚动，
     保证开/关外衍两种状态下字号都不会小到不可读；打印时由 @media print 复位。 */
  /* 世次标尺：与吊线图的世代行一一对齐（行距恒为 CHART_ROW_H） */
  const gens = [...new Set(people.map((m) => genOf(m)))].sort((a, b) => a - b)
  const minGen = gens.length ? gens[0] : 1
  return (
    <svg
      className="combo-frame__chart"
      viewBox={`0 0 ${viewW} ${height}`}
      style={{ minWidth: viewW > 1200 ? 1280 : undefined }}
      role="img"
      aria-label="卷内吊线图"
    >
      {/* 左侧留出世次标尺的固定宽度，内容紧接标尺铺开，不额外留白 */}
      <g transform={`translate(${CHART_RULER_W} 0)`}>
        {paths.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="#c9c4b8" strokeWidth="1" />
        ))}
        {people.map((m) => {
          const p = pos.get(m.id)
          if (!p) return null
          const blood = bloodIds.has(m.id)
          const cy = p.y + NODE_H / 2
          const nameW = measureName(m.name) - CHART_PAD_X * 2
          /* 朱点圆心：姓名文字左缘约在 p.x + 2 - nameW/2（textAnchor=middle）。
             旧值 +3.5 落在文字左缘右侧 1.5px，5px 的朱点直接压住首字；
             改到左缘外 3px（再让出半径 2.6），朱点与姓名之间留 3px 空隙，
             且圆心仍在块左 padding 内，不会越界压到相邻支。 */
          const dotX = p.x - nameW / 2 - 3.6
          return (
            <g key={m.id} className={blood ? undefined : "ext"}>
              <circle
                cx={dotX}
                cy={cy}
                r="2.6"
                fill={blood ? "#b3261e" : "none"}
                stroke={blood ? "#b3261e" : "#8f8a80"}
                strokeWidth="1"
              />
              <text
                x={p.x + 2}
                y={cy + 4.5}
                textAnchor="middle"
                fontSize={CHART_FONT}
                fill={matchedIds?.has(m.id) ? "#c2410c" : "#1c1c1c"}
                fontWeight={matchedIds?.has(m.id) ? 700 : undefined}
              >
                {m.name}
              </text>
            </g>
          )
        })}
      </g>
      {/* 左侧世次标尺：每世一枚，纵向对齐该世行心 */}
      <g className="combo-chart-ruler">
        {gens.map((gen) => (
          <text
            key={gen}
            x={8}
            y={(gen - minGen) * CHART_ROW_H + NODE_H / 2 + 4.5}
            textAnchor="start"
            fontSize={9.5}
            fill="#8f7134"
            letterSpacing="0.14em"
          >
            {toChineseNumber(gen)}世
          </text>
        ))}
      </g>
    </svg>
  )
}

export function PaperSheets({ members, allMembers, frameMembers, family, bloodIds, layout, matchedIds }: Props) {
  /* 谱序：房支优先、房内长幼。行传与卷内图都吃这一份顺序 */
  const ordered = useMemo(
    () => lineageOrder(members, family.branches),
    [members, family.branches],
  )
  const volumes = useVolumes(ordered, frameMembers)
  /* 各卷图共用同一视图宽：末卷人数少、内容窄，若按自身宽铺满图区，
     字会被放得比首页大一圈（表现为第二页字体过大）。基准取全册最宽卷，
     首卷通常就是最宽者，故首页排版不变。 */
  const charts = useMemo(() => volumes.map(buildVolumeChart), [volumes])
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

  /* 各分页等高：量出所有 .combo-frame 的自然高度，取最大值回写为 min-height，
     使第 2 页起与第 1 页高度完全对齐（宽度已由固定 --combo-bio-w 保证一致）。 */
  const comboRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const root = comboRef.current
    if (!root) return
    const apply = () => {
      const frames = Array.from(root.querySelectorAll<HTMLElement>(".combo-frame"))
      if (frames.length === 0) return
      for (const f of frames) f.style.minHeight = ""
      const max = Math.max(...frames.map((f) => f.offsetHeight))
      if (max > 0) for (const f of frames) f.style.minHeight = `${max}px`
    }
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(root)
    return () => ro.disconnect()
  }, [volumes, charts])

  if (layout === "euro") {
    if (euro.charts.length === 0) return <p className="print-empty">此谱暂无可排入的成员。</p>
    return (
      <EuroScroll
        euro={euro}
        family={family}
        byId={allById}
        childrenOf={allChildrenOf}
        bloodIds={bloodIds}
        matchedIds={matchedIds}
      />
    )
  }

  if (volumes.length === 0) {
    return <p className="print-empty">此谱暂无可排入的成员。</p>
  }

  return (
    <div ref={comboRef} className="combo-volumes">
      {volumes.map((volume, vi) => (
        <section className="print-sheet print-sheet--combo" key={volume.index}>
          <SheetHead family={family} volume={volume} total={volumes.length} />
          <div
            className="combo-frame"
            /* 小传区定宽取「分卷预算 + 表头余量」这个常量（不是本卷实际内容宽），
               保证图区宽度恒定，右图大小不随左栏列数多少变化 */
            style={{ "--combo-bio-w": `${MAX_BIO_WIDTH + 40}px` } as CSSProperties}
          >
            <div className="combo-frame__bio">
              <BioColumns
                gens={volume.gens}
                people={volume.people}
                bloodIds={bloodIds}
                byId={allById}
                childrenOf={allChildrenOf}
                matchedIds={matchedIds}
              />
            </div>
            <div className="combo-frame__spine">
              <b>{family.name}宗谱</b>
              {/* 年月与干支之间用全角空格断开，竖排里正好留一格；写成转义避免 lint 报不规则空白 */}
              <i>{`公元二〇二六年\u3000岁次丙午`}</i>
            </div>
            <div className="combo-frame__chart-wrap">
              <ComboChart chart={charts[vi]} bloodIds={bloodIds} matchedIds={matchedIds} />
            </div>
          </div>
          <SheetFoot volume={volume} total={volumes.length} />
        </section>
      ))}
    </div>
  )
}
