import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type NodeMouseHandler,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { Loader2 } from "lucide-react"
import { UnlockPanel } from "@/components/site/UnlockPanel"
import { MemberNode } from "@/components/tree/MemberNode"
import { MemberSheet } from "@/components/tree/MemberSheet"
import { IndentTree } from "@/components/tree/IndentTree"
import { SuMemberNode } from "@/components/tree/SuMemberNode"
import { GenealogyToolbar } from "@/components/tree/GenealogyToolbar"
import { InitialView } from "@/components/tree/InitialView"
import { NODE_HEIGHT, NODE_WIDTH, buildLayout } from "@/components/tree/layout"
import { useExtendedLineage } from "@/lib/lineage-preference"
import { useGenealogyScope } from "@/lib/genealogy-scope"
import { useTenant } from "@/lib/tenant-context"
import { useTreeStyle } from "@/lib/tree-style"
import { MIN_ZOOM } from "@/lib/tree-viewport"
import { generationName, type Member } from "@/lib/types"

const NODE_TYPES = { member: MemberNode, su: SuMemberNode }

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
  const selectedBranches = branchSelection.family === familyKey ? branchSelection.branches : []
  const setSelectedBranches = useCallback(
    (next: string[]) => setBranchSelection({ family: familyKey, branches: next }),
    [familyKey],
  )

  // 房支筛选变化时用于强制重适配视口
  const filterKey = selectedBranches.length > 0 ? selectedBranches.join("|") : ""

  // 展示样式（卡片谱 / 树形谱 / 垂丝谱），按族谱记忆于本机
  const [style, setStyle] = useTreeStyle(family?.id)
  const isTree = style === "tree"
  const isSu = style === "su"
  const nodeTypeKey: "member" | "su" = style === "card" ? "member" : "su"

  // 展示范围由访客自选（本地记忆）：关闭时仅本族父系血脉；开启时血脉 + 两层外衍。
  const [showExtended, setShowExtended] = useExtendedLineage(family?.id)
  const { visibleIds, visibleMembers, bloodIds, branches, branchCounts } = useGenealogyScope({
    members,
    family,
    showExtended,
    selectedBranches,
  })

  // 各档节点尺寸 / 间距：吊线档窄而高
  const layoutOptions = useMemo(() => {
    switch (style) {
      case "tree":
        return { nodeSize: { width: 170, height: 58 }, gaps: { h: 26, v: 46 } }
      case "su":
        return { nodeSize: { width: 92, height: 56 }, gaps: { h: 20, v: 52 } }
      default:
        return {}
    }
  }, [style])

  const layout = useMemo(
    () => buildLayout(visibleMembers, { branchCounts, ...layoutOptions }),
    [visibleMembers, branchCounts, layoutOptions],
  )
  // 计数与画布同源：buildLayout 已按当前可见范围（含房支筛选）标注每个节点是否外衍，
  // 展示集合 = 血脉 + 外衍，故两项之和恒等于画布节点数，切换房支不会另换一套算法。
  const shownCounts = useMemo(() => {
    const extended = layout.nodes.filter((node) => node.data.extended).length
    return { blood: layout.nodes.length - extended, extended }
  }, [layout.nodes])
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
    ? "已含出嫁女子之子女、孙辈与外姓配偶；更远的夫家后裔不入此谱，可随时关闭。"
    : "仅示父系血脉；开启可查阅出嫁女子之子女、孙辈与外姓配偶（选择仅记于本机）。"

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
      const node = layout.nodes.find((item) => item.id === String(member.id))
      if (!node) return
      setCenter(node.position.x + NODE_WIDTH / 2, node.position.y + NODE_HEIGHT / 2, {
        zoom,
        duration: 600,
      })
    },
    [layout.nodes, setCenter],
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
      onNodeClick={onNodeClick}
      onPaneClick={() => setSelected(null)}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      minZoom={0.06}
      maxZoom={1.8}
      proOptions={{ hideAttribution: true }}
      className="bg-white"
    >
      {!isSu ? <Background variant={BackgroundVariant.Dots} gap={26} size={1} color="var(--tree-dot)" /> : null}
      <InitialView
        key={filterKey}
        nodes={layout.nodes}
        bounds={layout.bounds}
        searchParams={searchParams}
      />
      <Controls showInteractive={false} position="bottom-left" />
      {/* 缩略图收至 124×84（默认 200×150）：小屏与桌面放大视图时不再压住世系节点 */}
      <MiniMap
        pannable
        zoomable
        position="bottom-right"
        nodeColor={() => "#c3d4da"}
        nodeStrokeColor={() => "#9fb6c0"}
        maskColor="rgba(246, 243, 236, 0.72)"
        style={{ width: 124, height: 84, borderRadius: 6 }}
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
      <div className="relative order-2 min-h-0 flex-1 overflow-hidden bg-white">
        {isSu ? (
          <div className="flex h-full items-stretch justify-center bg-[#f4f1ea] p-2 dark:bg-[#0b1a20] sm:p-4">
            <div
              className="flex h-full w-full max-w-[1240px] border border-[#1c1c1c] bg-white dark:border-[#3a5b67]"
              style={{ outline: "3px solid var(--su-frame-line)", outlineOffset: "4px" }}
            >
              <div
                className="flex w-10 shrink-0 items-center justify-center border-r border-[#1c1c1c] py-3 font-song text-[16px] tracking-[0.38em] text-[#1c1c1c] dark:border-[#3a5b67] dark:text-[#e7eef1] sm:w-16 sm:text-[20px] sm:tracking-[0.5em]"
                style={{ writingMode: "vertical-rl", textOrientation: "upright" }}
              >
                {family?.name ?? ""}宗谱
              </div>
              <div className="relative h-full min-w-0 flex-1">{flowEl}</div>
              <div
                className="flex w-10 shrink-0 items-center justify-center border-l border-[#1c1c1c] py-3 font-song text-[9px] tracking-[0.2em] text-[#3a3a3a] dark:border-[#3a5b67] dark:text-[#a8bcc4] sm:w-16 sm:text-[12.5px] sm:tracking-[0.28em]"
                style={{ writingMode: "vertical-rl", textOrientation: "upright" }}
              >
                公元二〇二六年 岁次丙午
              </div>
            </div>
          </div>
        ) : isTree ? (
          <IndentTree
            members={visibleMembers}
            visibleIds={visibleIds}
            bloodIds={bloodIds}
            selectedId={selected?.id}
            onSelect={(m) => setSelected(m)}
          />
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
                  void fitView({ padding: 0.16, duration: 500, minZoom: MIN_ZOOM })
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
        showExtended={showExtended}
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
