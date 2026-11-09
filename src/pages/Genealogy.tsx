import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStore,
  type NodeMouseHandler,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import {
  Check,
  ChevronDown,
  LayoutGrid,
  Loader2,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { UnlockPanel } from "@/components/site/UnlockPanel"
import { MemberNode } from "@/components/tree/MemberNode"
import { MemberSheet } from "@/components/tree/MemberSheet"
import { IndentTree } from "@/components/tree/IndentTree"
import { SuMemberNode } from "@/components/tree/SuMemberNode"
import { NODE_HEIGHT, NODE_WIDTH, buildLayout, type MemberFlowNode } from "@/components/tree/layout"
import { useExtendedLineage } from "@/lib/lineage-preference"
import { useTenant } from "@/lib/tenant-context"
import {
  useTreeStyle,
  TREE_STYLE_LABELS,
  TREE_STYLE_ORDER,
} from "@/lib/tree-style"
import { cn } from "@/lib/utils"
import {
  computeClanBloodIds,
  computeVisibleLineageIds,
  expandDescendantsAndSpouses,
  generationLabel,
  generationName,
  type Member,
} from "@/lib/types"

const NODE_TYPES = { member: MemberNode, su: SuMemberNode }

const VIEW_PADDING = { top: 150, right: 70, bottom: 60, left: 70 } as const
const MIN_ZOOM = 0.08
const MAX_ZOOM = 1.8

/** 依据已知的布局尺寸直接计算视口变换，避免依赖画布内部测量时序 */
export function computeFitViewport(
  bounds: { width: number; height: number },
  container: { width: number; height: number },
) {
  const availWidth = Math.max(160, container.width - VIEW_PADDING.left - VIEW_PADDING.right)
  const availHeight = Math.max(160, container.height - VIEW_PADDING.top - VIEW_PADDING.bottom)
  const zoom = Math.min(
    MAX_ZOOM,
    Math.max(MIN_ZOOM, Math.min(availWidth / bounds.width, availHeight / bounds.height)),
  )
  return {
    x: VIEW_PADDING.left + (availWidth - bounds.width * zoom) / 2,
    y: VIEW_PADDING.top + (availHeight - bounds.height * zoom) / 2,
    zoom,
  }
}

/**
 * 首次进入时全览族谱；URL 带 generation 参数时定位到对应世代。
 * 容器尺寸就绪后自行计算视口，不依赖 React Flow 的 fitView 内部时序。
 */
function InitialView({
  nodes,
  bounds,
  searchParams,
}: {
  nodes: MemberFlowNode[]
  bounds: { width: number; height: number }
  searchParams: URLSearchParams
}) {
  const width = useStore((state) => state.width)
  const height = useStore((state) => state.height)
  const { setViewport } = useReactFlow()
  const done = useRef(false)

  useEffect(() => {
    if (done.current || width === 0 || height === 0 || nodes.length === 0) return
    done.current = true

    const target = Number(searchParams.get("generation"))
    const first =
      Number.isFinite(target) && target > 0
        ? nodes.find((node) => node.data.member.generation === target)
        : undefined

    const narrow = width < 640

    if (first) {
      const zoom = narrow ? 0.6 : 0.85
      void setViewport({
        x: width / 2 - (first.position.x + NODE_WIDTH / 2) * zoom,
        y: height / 2 - (first.position.y + NODE_HEIGHT / 2) * zoom,
        zoom,
      })
      return
    }

    // 小屏：整树全览会被压缩，改为可读缩放并定位到顶层起点，供手势平移查阅
    if (narrow && bounds.height > 0) {
      const topNode = nodes.reduce((best, node) =>
        node.position.y < best.position.y ||
        (node.position.y === best.position.y && node.position.x < best.position.x)
          ? node
          : best,
      )
      const zoom = 0.6
      void setViewport({
        x: width / 2 - (topNode.position.x + NODE_WIDTH / 2) * zoom,
        y: 150 - topNode.position.y * zoom,
        zoom,
      })
      return
    }

    void setViewport(computeFitViewport(bounds, { width, height }))
  }, [width, height, nodes, bounds, searchParams, setViewport])

  return null
}

function GenealogyCanvas() {
  const [selected, setSelected] = useState<Member | null>(null)
  const [query, setQuery] = useState("")
  // 多选房支筛选：空数组表示「全部房支」
  const [selectedBranches, setSelectedBranches] = useState<string[]>([])
  const [searchParams] = useSearchParams()

  // 房支筛选变化时用于强制重适配视口
  const filterKey = selectedBranches.length > 0 ? selectedBranches.join("|") : ""

  const { fitView, setCenter } = useReactFlow()
  const { family, members, membersState } = useTenant()
  const loading = membersState === "loading"

  // 展示样式（卡片谱 / 树形谱 / 垂丝谱），按族谱记忆于本机
  const [style, setStyle] = useTreeStyle(family?.id)
  const isTree = style === "tree"
  const isSu = style === "su"
  const nodeTypeKey: "member" | "su" = style === "card" ? "member" : "su"

  // 切换族谱时清空房支筛选，避免沿用上一部的房支名
  useEffect(() => {
    setSelectedBranches([])
  }, [family?.id])

  // 展示范围由访客自选（本地记忆）：关闭时仅本族父系血脉；开启时血脉 + 两层外衍。
  // displayIds 在可见成员之外再并入「开启时的配偶」——配偶为外姓，关闭时一并隐藏。
  const [showExtended, setShowExtended] = useExtendedLineage(family?.id)
  const visibleIds = useMemo(() => computeVisibleLineageIds(members, showExtended), [members, showExtended])
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

  const branchCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    const headMap = family?.branchHeads ?? {}
    const byId = new Map(members.map((m) => [m.id, m]))
    // 房支清单 = 家族配置 ∪ 族人实际标签（与下方 branches 一致，此处内联避免前向引用）
    const seen: string[] = []
    for (const name of family?.branches ?? []) {
      if (name && !seen.includes(name)) seen.push(name)
    }
    for (const member of members) {
      if (member.branch && bloodIds.has(member.id) && !seen.includes(member.branch)) {
        seen.push(member.branch)
      }
    }
    for (const name of seen) {
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
  }, [members, bloodIds, family?.branchHeads])

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

      {/* 工具栏 */}
      <div className="order-1 shrink-0 border-b border-paper-200 bg-paper-50 px-2 py-2 sm:px-3">
        <div className="mx-auto flex max-w-[1080px] flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索族人姓名或字号"
                className="h-8 w-full rounded-[8px] border border-paper-300 bg-white/70 pl-8 pr-8 text-[12.5px] tracking-[0.04em] text-ink-800 outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-ink-500"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-ink-700"
                  aria-label="清除搜索"
                >
                  <X className="size-3.5" />
                </button>
              ) : null}

              {keyword && suggestions.length > 0 ? (
                <ul className="absolute left-0 top-10 z-20 w-full rounded-[8px] border border-paper-300 bg-paper-50 shadow-float">
                  {suggestions.map((member) => (
                    <li key={member.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(member)
                          focusMember(member)
                          setQuery("")
                        }}
                        className="flex w-full items-baseline justify-between px-3 py-2 text-left transition-colors hover:bg-paper-100"
                      >
                        <span className="font-song text-[13px] tracking-[0.06em] text-ink-800">
                          {member.name}
                        </span>
                        <span className="text-[10px] tracking-[0.1em] text-muted-foreground">
                          {generationLabel(member.generation)}
                          {member.branch ? ` · ${member.branch}` : ""}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

          </div>

          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-[8px] border px-2 py-[3px] text-[11px] tracking-[0.06em] transition-colors",
                    "border-paper-300 text-ink-600 hover:border-ink-400",
                  )}
                >
                  <LayoutGrid className="size-3" />
                  展示样式
                  <span className="text-ink-800">{TREE_STYLE_LABELS[style]}</span>
                  <ChevronDown className="size-3 opacity-70" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                sideOffset={6}
                className="w-[200px] rounded-[8px] border-paper-300 bg-paper-50 p-0 shadow-float"
              >
                <div className="flex flex-col p-1">
                  {TREE_STYLE_ORDER.map((s) => (
                    <button
                      key={s}
                      type="button"
                      role="radio"
                      aria-checked={style === s}
                      onClick={() => setStyle(s)}
                      className={cn(
                        "flex items-center gap-2 px-2 py-1.5 text-left text-[12px] tracking-[0.04em] transition-colors hover:bg-paper-100",
                        style === s && "bg-paper-100 text-ink-800",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-3.5 shrink-0 items-center justify-center border",
                          style === s ? "border-ink-700 bg-ink-800 text-paper-50" : "border-ink-400/50",
                        )}
                      >
                        {style === s ? <Check className="size-2.5" strokeWidth={3} /> : null}
                      </span>
                      {TREE_STYLE_LABELS[s]}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-[8px] border px-2 py-[3px] text-[11px] tracking-[0.06em] transition-colors",
                    selectedBranches.length > 0
                      ? "border-ink-700 bg-ink-800 text-paper-50"
                      : "border-paper-300 text-ink-600 hover:border-ink-400",
                  )}
                >
                  <SlidersHorizontal className="size-3" />
                  房支筛选
                  {selectedBranches.length > 0 ? (
                    <span className="inline-flex min-w-[15px] items-center justify-center bg-paper-50/20 px-1 text-[9.5px] leading-[15px]">
                      {selectedBranches.length}
                    </span>
                  ) : null}
                  <ChevronDown className="size-3 opacity-70" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                sideOffset={6}
                className="w-[248px] rounded-[8px] border-paper-300 bg-paper-50 p-0 shadow-float"
              >
                <div className="flex items-center justify-between border-b border-paper-200 px-2.5 py-2">
                  <span className="text-[10px] tracking-[0.16em] text-muted-foreground">按房支查看</span>
                  <button
                    type="button"
                    onClick={() => setSelectedBranches([])}
                    disabled={selectedBranches.length === 0}
                    className="text-[10px] tracking-[0.08em] text-ink-600 transition-colors hover:text-ink-800 disabled:cursor-not-allowed disabled:text-muted-foreground/40"
                  >
                    全部房支
                  </button>
                </div>
                <div className="max-h-[248px] overflow-y-auto p-1">
                  {branches.length === 0 ? (
                    <p className="px-2 py-3 text-[11px] text-muted-foreground">尚未登记房支</p>
                  ) : null}
                  {branches.map((item) => {
                    const isSelected = selectedBranches.includes(item)
                    return (
                      <button
                        key={item}
                        type="button"
                        role="checkbox"
                        aria-checked={isSelected}
                        onClick={() =>
                          setSelectedBranches((prev) =>
                            prev.includes(item) ? prev.filter((b) => b !== item) : [...prev, item],
                          )
                        }
                        className={cn(
                          "flex w-full items-center gap-2 px-2 py-1.5 text-left transition-colors hover:bg-paper-100",
                          isSelected && "bg-paper-100",
                        )}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            "flex size-3.5 shrink-0 items-center justify-center border",
                            isSelected
                              ? "border-ink-700 bg-ink-800 text-paper-50"
                              : "border-ink-400/50",
                          )}
                        >
                          {isSelected ? <Check className="size-2.5" strokeWidth={3} /> : null}
                        </span>
                        <span className="flex-1 truncate text-[12px] tracking-[0.04em] text-ink-800">
                          {item}
                        </span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {branchCounts[item] ?? 0} 人
                        </span>
                      </button>
                    )
                  })}
                </div>
                <p className="border-t border-paper-200 px-2.5 py-1.5 text-[10px] leading-relaxed text-muted-foreground/80">
                  可多选，取并集；未选任何房支即显示完整世系。
                </p>
              </PopoverContent>
            </Popover>

            <span className="ml-auto hidden shrink-0 text-[10px] tracking-[0.1em] text-muted-foreground sm:block">
              {selectedBranches.length > 0
                ? `已选 ${selectedBranches.length} 个房支 · 血脉 ${shownCounts.blood} 位 · 外衍 ${shownCounts.extended} 位`
                : `血脉 ${shownCounts.blood} 位 · 外衍 ${shownCounts.extended} 位 / 点击查看档案`}
            </span>
          </div>
          {/*
            图例 + 外衍开关：桌面端左右两列，右侧控件组相对整个方框垂直居中；
            移动端沿用原来的弹性排列（图例与开关同排两端对齐、说明整行在下），不做调整。
          */}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-t border-paper-200 pt-1.5 sm:gap-4">
            <div className="min-w-0 sm:flex-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] tracking-[0.06em] text-muted-foreground/80">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-0 w-5 border-t-2 border-solid border-ink-400" />
                  本族血脉
                </span>
                <span className="flex items-center gap-1.5" title="出嫁女子之后裔">
                  <span className="inline-block h-0 w-5 border-t-2 border-dashed border-ink-400" />
                  外衍
                </span>
              </div>
              <p className="mt-1 hidden text-[10px] leading-[1.55] tracking-[0.03em] text-muted-foreground/80 sm:block">
                {extendedHint}
              </p>
            </div>

            <div className="flex items-center gap-2 sm:shrink-0">
              <span className="text-[10.5px] tracking-[0.06em] text-ink-700">出嫁女子后裔</span>
              <button
                type="button"
                role="switch"
                aria-checked={showExtended}
                aria-label="出嫁女子后裔（外衍）是否随谱展示"
                onClick={() => setShowExtended(!showExtended)}
                className={cn(
                  // after 伪元素把可点区域扩到约 44×32，视觉尺寸缩小后触控仍好按
                  "relative h-[16px] w-[28px] shrink-0 rounded-full border transition-colors duration-200 after:absolute after:-inset-2 after:content-['']",
                  showExtended
                    ? "border-ink-700 bg-ink-800"
                    : "border-paper-400 bg-paper-200 hover:border-ink-400",
                )}
              >
                <span
                  className={cn(
                    "absolute top-1/2 size-[10px] -translate-y-1/2 rounded-full bg-paper-50 shadow-sm transition-all duration-200",
                    showExtended ? "left-[14px]" : "left-[2px]",
                  )}
                />
              </button>
              <span
                className={cn(
                  "text-[10px] tracking-[0.1em]",
                  showExtended ? "text-gold-700" : "text-muted-foreground",
                )}
              >
                {showExtended ? "随谱展示" : "暂不展示"}
              </span>
            </div>

            {/* 移动端说明：整行独占，位置与调整前一致（开关之后），桌面端说明在左列 */}
            <p className="w-full text-[10px] leading-[1.55] tracking-[0.03em] text-muted-foreground/80 sm:hidden">
              {extendedHint}
            </p>
          </div>
        </div>
      </div>

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
