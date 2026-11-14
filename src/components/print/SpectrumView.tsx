import { useMemo, useState, type CSSProperties } from "react"
import { ReactFlow, type Node } from "@xyflow/react"
/* 卡片/垂丝档复用 React Flow 渲染，需带上定位样式，否则节点会溢出纸面 */
import "@xyflow/react/dist/style.css"
import { MemberNode } from "@/components/tree/MemberNode"
import { SuMemberNode } from "@/components/tree/SuMemberNode"
import { IndentTree } from "@/components/tree/IndentTree"
import { H_GAP, NODE_HEIGHT, NODE_WIDTH, V_GAP, buildLayout, type LayoutOptions } from "@/components/tree/layout"
import { detectFontBoost } from "@/lib/minFontSize"
import { PaperSheets, type PaperLayout } from "@/components/print/PaperSheets"
import { SuShiSheet } from "@/components/print/SuShiSheet"
import { toChineseNumber, type Family, type Member } from "@/lib/types"

/**
 * 谱面渲染器：世系图页面 6 档切换的展示层（原独立谱页已并入世系图页面）。
 *
 * 六档按产出方式分三类；key 与 URL（?v=）已重定：欧式 oushi→euro、垂丝 chuisi→vertical（key 同步），旧 slug 经兼容映射仍可用：
 * - 纸面分卷：欧式谱 euro / 欧苏谱 combo / 苏式谱 su-shi（SuShiSheet，五世一图垂珠体）
 * - 树形分页：树形谱 tree（IndentTree 全展开，按块分页）
 * - 屏幕画布：卡片谱 card / 垂丝谱 vertical（整族缩进一张纸，人多时只宜屏幕预览）
 *
 * vertical 是「垂丝谱」（SuMemberNode），su-shi 是「苏式谱」（SuShiNode + SuShiSheet），
 * 只差后缀但实现完全不同。新增档位一律用下面的显式类型守卫收窄，
 * 不要用 includes 之后仍沿用未收窄的 PrintLayout，否则会静默走错渲染器。
 *
 * 打印走浏览器「另存为 PDF」，页面不提供打印按钮；档位切换等控件打印时隐藏。
 */

const LAYOUTS = [
  { key: "euro", label: "欧式谱", slug: "euro" },
  { key: "su-shi", label: "苏式谱", slug: "su-shi" },
  { key: "combo", label: "欧苏谱", slug: "combo" },
  { key: "tree", label: "树形谱", slug: "tree" },
  { key: "card", label: "卡片谱", slug: "card" },
  { key: "vertical", label: "垂丝谱", slug: "vertical" },
] as const

export type PrintLayout = (typeof LAYOUTS)[number]["key"]

/** 屏幕画布档：整族缩放一页，不参与纸面分卷 */
const FLOW_LAYOUTS = ["card", "vertical"] as const
type FlowLayout = (typeof FLOW_LAYOUTS)[number]
const isFlowLayout = (value: PrintLayout): value is FlowLayout =>
  (FLOW_LAYOUTS as readonly string[]).includes(value)

/** 树形档：IndentTree 全展开，按块分页 */
const TREE_LAYOUTS = ["tree"] as const
type TreeLayout = (typeof TREE_LAYOUTS)[number]
const isTreeLayout = (value: PrintLayout): value is TreeLayout =>
  (TREE_LAYOUTS as readonly string[]).includes(value)

/** 画布档的节点渲染器：卡片谱走 member、垂丝谱走 vertical，苏式谱已由 SuShiSheet 独立出页 */
const NODE_TYPES = { member: MemberNode, vertical: SuMemberNode }

const CHINESE_DIGITS = "〇一二三四五六七八九"
const HEAVENLY_STEMS = "甲乙丙丁戊己庚辛壬癸"
const EARTHLY_BRANCHES = "子丑寅卯辰巳午未申酉戌亥"

/** 吊线装帧的谱名：地名 + 堂号 + 姓氏 + 宗谱，缺项自动省略 */
function sheetTitle(family: Family): string {
  const prefix = [family.county, family.hallName].filter(Boolean).join("")
  const base = family.surname || family.name.replace(/氏$/, "")
  return `${prefix}${base ? `${base}氏` : ""}宗谱`
}

/** 右侧落款：公元年份逐位转中文数字，配干支（落款用，不做节气分界） */
function imprintOf(year: number): { year: string; ganzhi: string } {
  const digits = String(year)
    .split("")
    .map((d) => CHINESE_DIGITS[Number(d)])
    .join("")
  return {
    year: `公元${digits}年`,
    ganzhi: `岁次${HEAVENLY_STEMS[(year - 4) % 10]}${EARTHLY_BRANCHES[(year - 4) % 12]}`,
  }
}

/** 屏幕画布档：复用世系图节点与布局，只读、不带控件。只服务卡片谱与垂丝谱两档 */
function PrintFlow({
  layout,
  people,
  allMembers,
  family,
}: {
  layout: FlowLayout
  people: Member[]
  /** 全量成员：卡片谱据此解析配偶（配偶不入图，只作卡片内的一列） */
  allMembers: Member[]
  family: Family
}) {
  /* 垂丝谱另走纸面装帧：左竖排谱名、世次标尺、右纪年落款 */
  const isChuisi = layout === "vertical"
  /* 浏览器最小字号把 7–9px 小字强行放大，节点内文字会被卡片框裁掉。
     整张画布的度量（节点、间距、字号）同比放大到下限之上，再由 --flow-scale 收回。 */
  const [boost] = useState(() => detectFontBoost())
  const spouseIndex = useMemo(() => new Map(allMembers.map((m) => [m.id, m])), [allMembers])
  const built = useMemo(() => {
    const options: LayoutOptions = isChuisi
      ? {
          nodeSize: { width: 92 * boost, height: 56 * boost },
          gaps: { h: 20 * boost, v: 52 * boost },
        }
      : {
          nodeSize: { width: NODE_WIDTH * boost, height: NODE_HEIGHT * boost },
          gaps: { h: H_GAP * boost, v: V_GAP * boost },
          // 卡片谱：始终解析配偶并在卡片内单列展示，不受外衍开关影响
          spouseIndex,
        }
    return buildLayout(people, options)
  }, [people, isChuisi, boost, spouseIndex])
  const nodeType = isChuisi ? "vertical" : "member"

  const nodes = useMemo<Node[]>(
    () => built.nodes.map((node) => ({ ...node, type: nodeType })),
    [built.nodes, nodeType],
  )
  const edges = useMemo(
    () =>
      built.edges.map((edge) => ({
        ...edge,
        type: isChuisi ? "step" : "smoothstep",
        style: {
          /* 保留 layout.ts 为外衍标注的 strokeDasharray；垂丝走纸面细线，比卡片档更浅 */
          ...edge.style,
          stroke: isChuisi ? "#b3aea5" : "#8d887d",
          strokeWidth: 1,
        },
      })),
    [built.edges, isChuisi],
  )

  const width = Math.max(1, built.bounds.width)
  const height = Math.max(1, built.bounds.height)
  /* 垂丝谱打印时按整框缩放，先扣掉左右装帧栏（谱名 64 + 标尺 30 + 间隙 18 + 落款 40） */
  const designScale = Math.min(1, (isChuisi ? 1208 : 1360) / (width / boost), 880 / (height / boost))
  /* 画布坐标已按 boost 放大，纸面缩放要再除回去，成品尺寸与设计稿一致 */
  const scale = designScale / boost

  /* 世次标尺要贴在画布左边并与各世行心对齐，位置随 ReactFlow 视口（平移 + 缩放）换算 */
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 })
  const gens = useMemo(
    () => [...new Set(people.map((m) => Math.max(1, m.generation)))].sort((a, b) => a - b),
    [people],
  )
  const rowCenter = useMemo(() => {
    const map = new Map<number, number>()
    if (!isChuisi) return map
    for (const node of built.nodes) {
      const gen = Math.max(1, node.data.member.generation)
      const center = node.position.y + (node.height ?? 56) / 2
      const prev = map.get(gen)
      if (prev === undefined || center < prev) map.set(gen, center)
    }
    return map
  }, [built.nodes, isChuisi])
  const imprint = useMemo(() => imprintOf(new Date().getFullYear()), [])

  const stage = (
    <div
      className="print-flow-stage"
      style={
        {
          "--flow-w": `${width}px`,
          "--flow-h": `${height}px`,
          "--flow-scale": scale,
          "--pf-boost": boost,
          "--pf-zoom": 1 / boost,
        } as CSSProperties
      }
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        fitView
        /* 垂丝谱贴住装帧框内缘，留白比卡片档更小；画布已放大 boost 倍，上下限同比收。
           minZoom 必须跟着降：默认 0.5 会把 fitView 卡在 0.5，画布收回不足而溢出容器 */
        fitViewOptions={{ padding: isChuisi ? 0.012 : 0.04, maxZoom: 2 / boost, minZoom: 0.5 / boost }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        proOptions={{ hideAttribution: true }}
        onInit={(instance) => {
          const sync = () => setViewport(instance.getViewport())
          sync()
          // fitView 在首帧之后才落定，补一拍让标尺与世行对齐
          requestAnimationFrame(sync)
        }}
        onMove={(_, next) => setViewport(next)}
      />
    </div>
  )

  return (
    <section className="print-sheet print-flow-sheet">
      <header className="print-sheet-head">
        <span className="font-song text-[15px] tracking-[0.18em]">
          {LAYOUTS.find((item) => item.key === layout)?.label}
        </span>
        <span className="text-[10px] tracking-[0.16em]">全图一页</span>
      </header>
      {isChuisi ? (
        <div
          className="su-frame"
          style={
            {
              "--flow-w": `${width}px`,
              "--flow-h": `${height}px`,
              "--flow-scale": scale,
              "--pf-boost": boost,
              "--pf-zoom": 1 / boost,
            } as CSSProperties
          }
        >
          <div className="su-frame__title">
            <span>{sheetTitle(family)}</span>
          </div>
          <div className="su-frame__ruler" aria-hidden>
            {gens.map((gen) => {
              const center = rowCenter.get(gen) ?? 0
              return (
                <span
                  key={gen}
                  style={
                    {
                      "--ruler-top": `${viewport.y + center * viewport.zoom}px`,
                      "--ruler-top-print": `${center}px`,
                    } as CSSProperties
                  }
                >
                  {/* 世次取成员的 generation 字段（与数据库一致），故谱从四世起就是四世起 */}
                  {toChineseNumber(gen)}世
                </span>
              )
            })}
          </div>
          <div className="su-frame__canvas">{stage}</div>
          <div className="su-frame__imprint">
            <span>{imprint.year}</span>
            <span>{imprint.ganzhi}</span>
          </div>
        </div>
      ) : (
        stage
      )}
      <footer className="print-sheet-foot">
        <span>实线为本族血脉，虚线为外衍。</span>
        <span>第 1 / 1 页</span>
      </footer>
    </section>
  )
}
export function SpectrumView({
  layout,
  family,
  members,
  allMembers,
  frameMembers,
  visibleIds,
  bloodIds,
  matchedIds,
  onSelect,
}: {
  layout: PrintLayout
  family: Family
  members: Member[]
  allMembers: Member[]
  /** 版式基准集合（恒含外衍），用于分卷与列宽，避免切换开关时整册跳版 */
  frameMembers: Member[]
  visibleIds: Set<number>
  bloodIds: Set<number>
  /** 搜索命中成员：纸面/树形档据此给姓名加高亮 */
  matchedIds?: Set<number>
  /** 树形档点击回调；不传即只读 */
  onSelect?: (member: Member) => void
}) {
  const isPaper = layout === "euro" || layout === "combo"
  return (
    <div className="print-body">
      {layout === "su-shi" ? (
        <SuShiSheet
          people={members}
          family={family}
          allMembers={allMembers}
          bloodIds={bloodIds}
          matchedIds={matchedIds}
        />
      ) : isPaper ? (
        <PaperSheets
          members={members}
          allMembers={allMembers}
          frameMembers={frameMembers}
          family={family}
          bloodIds={bloodIds}
          layout={layout as PaperLayout}
          matchedIds={matchedIds}
        />
      ) : isFlowLayout(layout) ? (
        <PrintFlow layout={layout} people={members} allMembers={allMembers} family={family} />
      ) : isTreeLayout(layout) ? (
        <section className="print-sheet print-tree">
          <header className="print-sheet-head">
            <span className="font-song text-[15px] tracking-[0.18em]">
              {LAYOUTS.find((item) => item.key === layout)?.label}
            </span>
            <span className="text-[10px] tracking-[0.16em]">全部展开</span>
          </header>
          <div className="print-tree-body">
            <IndentTree
              members={members}
              visibleIds={visibleIds}
              bloodIds={bloodIds}
              forceExpand
              hideDetail
              selectedId={null}
              matchedIds={matchedIds}
              onSelect={onSelect ?? (() => {})}
            />
          </div>
          <footer className="print-sheet-foot">
            <span>缩进为世代，虚线为外衍。</span>
            <span>第 1 / 1 页</span>
          </footer>
        </section>
      ) : null}
    </div>
  )
}
