import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useViewport,
  type NodeMouseHandler,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { Loader2 } from "lucide-react"
import { UnlockPanel } from "@/components/site/UnlockPanel"
import { MemberNode } from "@/components/tree/MemberNode"
import { MemberSheet } from "@/components/tree/MemberSheet"
import { SuMemberNode } from "@/components/tree/SuMemberNode"
import { GenealogyToolbar } from "@/components/tree/GenealogyToolbar"
import { InitialView } from "@/components/tree/InitialView"
import { NODE_HEIGHT, NODE_WIDTH, buildLayout } from "@/components/tree/layout"
import { useExtendedLineage } from "@/lib/lineage-preference"
import { useGenealogyScope } from "@/lib/genealogy-scope"
import { useTenant } from "@/lib/tenant-context"
import { useTreeStyle } from "@/lib/tree-style"
import { MIN_ZOOM } from "@/lib/tree-viewport"
import { computeVisibleLineageIds, generationName, type Member } from "@/lib/types"
import { SpectrumView, type PrintLayout } from "@/components/print/SpectrumView"
import { ZoomShell } from "@/components/print/ZoomShell"
import { ZoomBar } from "@/components/print/ZoomBar"

const NODE_TYPES = { member: MemberNode, su: SuMemberNode }

/** 画布档（卡片/垂丝）的缩放条：与纸面档共用 ZoomBar，保证 6 档外观一致 */
function FlowZoomBar() {
  const { zoom } = useViewport()
  const flow = useReactFlow()
  return (
    <ZoomBar
      className="zoom-shell__bar--inline"
      percent={zoom}
      onZoomOut={() => flow.zoomOut({ duration: 180 })}
      onZoomIn={() => flow.zoomIn({ duration: 180 })}
      onReset={() => flow.fitView({ padding: 0.16, duration: 300 })}
      resetTitle="适应窗口"
    />
  )
}

function GenealogyCanvas() {
  const [selected, setSelected] = useState<Member | null>(null)
  const [query, setQuery] = useState("")
  const [searchParams] = useSearchParams()

  const { fitView, setCenter } = useReactFlow()
  const { family, members, membersState } = useTenant()
  const loading = membersState === "loading"

  // 多选房支筛选：空数组表示「全部房支」。
  // 记下选择时所属的族谱，切换族谱后旧选择自然失效，避免沿用上一部的房支名。
  const familyKey = family?.id ?? null
  const [branchSelection, setBranchSelection] = useState<{
    family: number | null
    branches: string[]
  }>({ family: familyKey, branches: [] })
  // 用 useMemo 固定引用：避免下游 useMemo 的依赖每次渲染都变（触发多余重算）
  const selectedBranches = useMemo(
    () => (branchSelection.family === familyKey ? branchSelection.branches : []),
    [branchSelection, familyKey],
  )
  const setSelectedBranches = useCallback(
    (next: string[]) => setBranchSelection({ family: familyKey, branches: next }),
    [familyKey],
  )

  // 房支筛选变化时用于强制重适配视口
  const filterKey = selectedBranches.length > 0 ? selectedBranches.join("|") : ""

  // 展示样式（卡片谱 / 树形谱 / 垂丝谱），按族谱记忆于本机
  const [style, setStyle] = useTreeStyle(family?.id)
  const isTree = style === "tree"
  const isSu = style === "vertical"
  const isPaper = style === "euro" || style === "su-shi" || style === "combo"
  /** 欧式/苏式小传已含配氏，按约定不列外衍：数据只取本族血脉，外衍开关禁用 */
  const extendedDisabled = style === "euro" || style === "su-shi"
  const isCombo = style === "combo"
  /* 纸面档的缩放倍率：按钮在工具栏，纸面由 ZoomShell 套用该值 */
  const [paperScale, setPaperScale] = useState(1)
  const nodeTypeKey: "member" | "su" = style === "card" ? "member" : "su"

  // 展示范围由访客自选（本地记忆）：关闭时仅本族父系血脉；开启时血脉 + 两层外衍。
  const [showExtended, setShowExtended] = useExtendedLineage(family?.id)
  const { visibleIds, visibleMembers, bloodIds, branches, branchCounts } = useGenealogyScope({
    members,
    family,
    showExtended,
    selectedBranches,
  })

  /* 纸面档的版式基准集合（恒含外衍）：分卷与列宽按它计算，
     切换外衍开关只增减列内条目，不会整册重排。无房支筛选时取全量展示集；
     有房支筛选时退回当前可见集合，避免重复实现房支派生逻辑。 */
  const frameMembers = useMemo(() => {
    if (!isPaper) return visibleMembers
    if (selectedBranches.length > 0) return visibleMembers
    const ids = computeVisibleLineageIds(members, true)
    // 欧苏谱同样不把外姓配偶计入版式基准，否则分卷与列宽会被配偶占位撑开
    return members.filter((m) => ids.has(m.id) && (!isCombo || !m.isMarriedIn))
  }, [isPaper, isCombo, members, visibleMembers, selectedBranches])

  /* 卡片谱的配偶解析：用「全量成员」建索引，即使外衍开关关闭、配偶不在可见集合内，
     卡片右侧的配偶列也始终能解析出来并展示。 */
  const spouseIndex = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])

  // 各档节点尺寸 / 间距：吊线档窄而高
  const layoutOptions = useMemo(() => {
    switch (style) {
      case "tree":
        return { nodeSize: { width: 170, height: 58 }, gaps: { h: 26, v: 46 } }
      case "vertical":
        return { nodeSize: { width: 92, height: 56 }, gaps: { h: 20, v: 52 } }
      case "card":
        // 卡片谱：配偶始终在卡片内展示（不受外衍开关影响）
        return { spouseIndex }
      default:
        return {}
    }
  }, [style, spouseIndex])

  /* 卡片谱的节点集合：剔除外姓配偶。
     配偶已在卡片内单列展示，若再单独成节点，开启外衍时会多出一批无连线的孤立节点；
     外衍开关因此只影响「外衍成员」的增删，不影响配偶的呈现。其余档保持原样。 */
  const flowMembers = useMemo(
    () => (style === "card" ? visibleMembers.filter((m) => !m.isMarriedIn) : visibleMembers),
    [style, visibleMembers],
  )

  /** 送入谱页的成员集合：
   *  - 欧式/苏式：只取本族血脉（小传已含配氏，不列外衍）；
   *  - 欧苏谱：剔除"外姓配偶"这一类成员——配偶信息由小传的「配…／适…」承载，
   *    不单独成节点（否则开启外衍后配偶会变成一堆没有吊线的孤立点）；
   *  - 其余档：按外衍开关原样传入。 */
  const spectrumMembers = useMemo(() => {
    const base = extendedDisabled ? visibleMembers.filter((m) => bloodIds.has(m.id)) : visibleMembers
    return isCombo ? base.filter((m) => !m.isMarriedIn) : base
  }, [extendedDisabled, isCombo, visibleMembers, bloodIds])

  const layout = useMemo(
    () => buildLayout(flowMembers, { branchCounts, ...layoutOptions }),
    [flowMembers, branchCounts, layoutOptions],
  )
  // 计数与画布同源：buildLayout 已按当前可见范围（含房支筛选）标注每个节点是否外衍，
  // 展示集合 = 血脉 + 外衍，故两项之和恒等于画布节点数，切换房支不会另换一套算法。
  const shownCounts = useMemo(() => {
    if (extendedDisabled) return { blood: spectrumMembers.length, extended: 0 }
    const extended = layout.nodes.filter((node) => node.data.extended).length
    return { blood: layout.nodes.length - extended, extended }
  }, [layout.nodes, extendedDisabled, spectrumMembers])
  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])

  // 子嗣数量（吊线节点显示「子 X」）
  const childCounts = useMemo(() => {
    const map = new Map<number, number>()
    for (const m of members) {
      for (const pid of [m.fatherId, m.motherId]) {
        if (pid == null) continue
        map.set(pid, (map.get(pid) ?? 0) + 1)
      }
    }
    return map
  }, [members])

  const keyword = query.trim()

  // 外衍开关的说明：桌面端并入左列（图例下方），移动端仍在开关之后
  const extendedHint = showExtended
    ? "已含出嫁女子后裔（外衍，含其配偶）；更远的夫家后裔不入此谱，可随时关闭。"
    : "默认仅示本族血脉；开启可查阅出嫁女子后裔（外衍，含其配偶），选择仅记于本机。"

  const nodes = useMemo(
    () =>
      layout.nodes.map((node) => {
        const member = node.data.member
        const queryOk =
          !keyword || member.name.includes(keyword) || member.courtesyName.includes(keyword)
        return {
          ...node,
          type: nodeTypeKey,
          data: {
            ...node.data,
            childCount: childCounts.get(member.id) ?? 0,
            ziBei: bloodIds.has(member.id) ? generationName(family, member.generation) : undefined,
            dimmed: Boolean(keyword) && !queryOk,
            matched: Boolean(keyword) && queryOk,
          },
        }
      }),
    [layout.nodes, keyword, nodeTypeKey, childCounts, family, bloodIds],
  )

  const edges = useMemo(
    () =>
      layout.edges.map((edge) => ({
        ...edge,
        // 苏式均为直角吊线：父底竖直向下 → 中间高度横贯子女 → 各自落到子顶。
        // step 的多条父子边共享同一水平中线，叠加后即为参考图中贯通的一条横线。
        type: isSu ? "step" : "smoothstep",
        style: {
          // 保留 layout.ts 为外衍标注的 strokeDasharray，避免苏式档丢失虚实线区分
          ...edge.style,
          ...(isSu ? { stroke: "var(--tree-line-soft)", strokeWidth: 1 } : {}),
        },
      })),
    [layout.edges, isSu],
  )

  /* 搜索命中集合：供纸面/树形档做文字高亮（画布档用节点的 matched 标记） */
  const matchedIds = useMemo(() => {
    const ids = new Set<number>()
    if (!keyword) return ids
    for (const m of visibleMembers) {
      if (m.name.includes(keyword) || m.courtesyName.includes(keyword)) ids.add(m.id)
    }
    return ids
  }, [keyword, visibleMembers])

  const suggestions = useMemo(() => {
    if (!keyword) return []
    return members
      .filter(
        (m) =>
          visibleIds.has(m.id) &&
          (m.name.includes(keyword) || m.courtesyName.includes(keyword)),
      )
      .slice(0, 6)
  }, [members, keyword, visibleIds])

  const focusMember = useCallback(
    (member: Member, zoom = 0.95) => {
      // 纸面/树形档没有 React Flow 视口，避免对未挂载的画布调用 setCenter
      if (style !== "card" && style !== "vertical") return
      const node = layout.nodes.find((item) => item.id === String(member.id))
      if (!node) return
      setCenter(node.position.x + NODE_WIDTH / 2, node.position.y + NODE_HEIGHT / 2, {
        zoom,
        duration: 600,
      })
    },
    [layout.nodes, setCenter, style],
  )

  const onNodeClick: NodeMouseHandler = useCallback(
    (_, node) => {
      const member = byId.get(Number(node.id))
      if (member) setSelected(member)
    },
    [byId],
  )

  const handleNavigate = useCallback(
    (member: Member) => {
      setSelected(member)
      focusMember(member, 1)
    },
    [focusMember],
  )

  const handlePickSuggestion = useCallback(
    (member: Member) => {
      setSelected(member)
      focusMember(member)
      setQuery("")
    },
    [focusMember],
  )

  const flowEl = (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      onNodeClick={style === "card" ? onNodeClick : undefined}
      onPaneClick={() => setSelected(null)}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      minZoom={0.06}
      maxZoom={1.8}
      proOptions={{ hideAttribution: true }}
      className="bg-[#f4f1ea]"
    >
      {!isSu ? <Background variant={BackgroundVariant.Dots} gap={26} size={1} color="#cfc6b4" /> : null}
      <InitialView
        key={filterKey}
        nodes={layout.nodes}
        bounds={layout.bounds}
        searchParams={searchParams}
      />
      {/* 缩放按钮统一移到顶部工具栏，画布内不再悬浮控件 */}
      {/* 缩略图再收至 96×64（默认 200×150），半透明减弱存在感，不压住世系节点 */}
      <MiniMap
        pannable
        zoomable
        position="bottom-right"
        nodeColor={() => "#c3d4da"}
        nodeStrokeColor={() => "#9fb6c0"}
        maskColor="rgba(246, 243, 236, 0.55)"
        style={{ width: 96, height: 64, borderRadius: 5, opacity: 0.92 }}
        className="!bottom-2 !right-2 !hidden sm:!bottom-3 sm:!right-3 sm:!block"
      />
    </ReactFlow>
  )

  return (
    <div
      className="relative flex w-full flex-col overflow-hidden bg-white"
      style={{ height: "calc(100vh - 4rem)" }}
    >
      {/* 画布区：工具栏置于顶部正常流，画布占剩余高度，互不遮挡 */}
      <div className="paper-flow relative order-2 min-h-0 flex-1 overflow-hidden bg-[#f4f1ea]">
        {isPaper || isTree ? (
          family ? (
            <ZoomShell scale={paperScale}>
              <div className="print-page print-page--embed">
                <SpectrumView
                  layout={isTree ? "tree" : (style as PrintLayout)}
                  family={family}
                  members={spectrumMembers}
                  allMembers={members}
                  frameMembers={frameMembers}
                  visibleIds={visibleIds}
                  bloodIds={bloodIds}
                  matchedIds={matchedIds}
                />
              </div>
            </ZoomShell>
          ) : null
        ) : isSu ? (
          <div className="flex h-full items-stretch justify-center bg-[#f4f1ea] p-2 sm:p-4">
            <div
              className="flex h-full w-full max-w-[1240px] border border-[#1c1c1c] bg-white"
              style={{ outline: "3px solid var(--su-frame-line)", outlineOffset: "4px" }}
            >
              <div
                className="flex w-10 shrink-0 items-center justify-center border-r border-[#1c1c1c] py-3 font-song text-[16px] tracking-[0.38em] text-[#1c1c1c] sm:w-16 sm:text-[20px] sm:tracking-[0.5em]"
                style={{ writingMode: "vertical-rl", textOrientation: "upright" }}
              >
                {family?.name ?? ""}宗谱
              </div>
              <div className="relative h-full min-w-0 flex-1">{flowEl}</div>
              <div
                className="flex w-10 shrink-0 items-center justify-center border-l border-[#1c1c1c] py-3 font-song text-[9px] tracking-[0.2em] text-[#3a3a3a] sm:w-16 sm:text-[12.5px] sm:tracking-[0.28em]"
                style={{ writingMode: "vertical-rl", textOrientation: "upright" }}
              >
                公元二〇二六年 岁次丙午
              </div>
            </div>
          </div>
        ) : (
          flowEl
        )}
      </div>

      <GenealogyToolbar
        query={query}
        onQueryChange={setQuery}
        suggestions={suggestions}
        onPickSuggestion={handlePickSuggestion}
        style={style}
        onStyleChange={setStyle}
        branches={branches}
        branchCounts={branchCounts}
        selectedBranches={selectedBranches}
        onBranchesChange={setSelectedBranches}
        shownCounts={shownCounts}
        extendedDisabled={extendedDisabled}
        zoomControls={
          isPaper || isTree ? (
            <ZoomBar
              className="zoom-shell__bar--inline"
              percent={paperScale}
              onZoomOut={() =>
                setPaperScale((v) => Math.max(0.4, Math.round((v - 0.15) * 100) / 100))
              }
              onZoomIn={() =>
                setPaperScale((v) => Math.min(2.4, Math.round((v + 0.15) * 100) / 100))
              }
              onReset={() => setPaperScale(1)}
            />
          ) : (
            <FlowZoomBar />
          )
        }
        showExtended={showExtended}
        onShowExtendedChange={setShowExtended}
        extendedHint={extendedHint}
      />

      {loading ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-paper-100/80">
          <div className="flex items-center gap-2 text-[12px] tracking-[0.16em] text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            正在展卷
          </div>
        </div>
      ) : null}

      {!loading && visibleMembers.length === 0 ? (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-paper-100">
          {selectedBranches.length > 0 ? (
            <>
              <p className="font-song text-[18px] tracking-[0.16em] text-ink-700">所选房支暂无族人</p>
              <p className="text-[12px] text-muted-foreground">
                所选房支下都没有可展示的族人（可能未在族人档案中标注相应房支）
              </p>
              <button
                type="button"
                onClick={() => {
                  setSelectedBranches([])
                  setSelected(null)
                  // 仅画布档需要重适配视口；纸面/树形档无 React Flow 视口
                  if (style === "card" || style === "vertical") {
                    void fitView({ padding: 0.16, duration: 500, minZoom: MIN_ZOOM })
                  }
                }}
                className="mt-1 inline-flex items-center gap-1.5 rounded-[8px] border border-ink-700 bg-ink-800 px-3 py-1.5 text-[12px] tracking-[0.1em] text-paper-50 transition-colors hover:bg-ink-700"
              >
                恢复完整世系（全部房支）
              </button>
            </>
          ) : (
            <>
              <p className="font-song text-[18px] tracking-[0.16em] text-ink-700">谱中尚无族人</p>
              <p className="text-[12px] text-muted-foreground">请前往后台添加首位族人</p>
            </>
          )}
        </div>
      ) : null}

      <MemberSheet
        member={selected}
        members={members}
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
        onNavigate={handleNavigate}
      />
    </div>
  )
}

export default function Genealogy() {
  const { membersState, ensureMembers } = useTenant()

  // 只有进入世系图才请求世系数据，首页与家族文献无需口令
  useEffect(() => {
    void ensureMembers()
  }, [ensureMembers])

  // SPA 客户端跳转（pushState）会沿用上一页的 scrollY：首页是长文档，从下方
  // 扇形图进入时残留滚动被钳到本页最大滚动量，令 absolute 定位的顶部工具条
  // 被 sticky 导航（z-40）完全遮住；刷新则因滚动归零而正常。绘制前复位可避免
  // 闪一帧被遮挡的画面，数据就绪/文档高度变化后再兜底一次。
  // 仅作用于本路由，不做全局 ScrollToTop，以免打断 Portal 的 scrollTo: "directory"。
  // behavior: "instant" 不可省：既要绕开 index.css 的 scroll-behavior: smooth，
  // 也要中止上一页尚未结束的平滑滚动动画，否则动画会在复位后把页面再次推走。
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" })
  }, [membersState])

  if (membersState === "locked" || membersState === "private") {
    return <UnlockPanel />
  }

  if (membersState !== "ready") {
    return (
      <div className="flex min-h-[70vh] items-center justify-center bg-paper-100">
        <div className="flex items-center gap-2 text-[12px] tracking-[0.16em] text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          正在展卷
        </div>
      </div>
    )
  }

  return (
    <ReactFlowProvider>
      <GenealogyCanvas />
    </ReactFlowProvider>
  )
}
