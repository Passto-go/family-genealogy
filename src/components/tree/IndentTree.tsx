import { useMemo, useState } from "react"
import { cn } from "@/lib/utils"
import { generationLabel, type Member } from "@/lib/types"
import { NODE_TEXT_CLASS, nodeTextStyle } from "@/lib/nodeTypography"

interface IndentTreeProps {
  /** 当前可见成员（已含房支筛选，可能含外姓配偶） */
  members: Member[]
  /** 血脉 + 外衍（不含配偶），用于滤除配偶 */
  visibleIds: Set<number>
  /** 本族血脉，用于区分外衍（浅灰） */
  bloodIds: Set<number>
  /** 紧凑排版（当前无入口，保留以备用） */
  compact?: boolean
  /** 谱页打印：强制展开全部分支，不受折叠状态影响 */
  forceExpand?: boolean
  selectedId?: number | null
  onSelect: (member: Member) => void
}

interface RowInfo {
  member: Member
  depth: number
  flags: boolean[]
  isLast: boolean
  hasKids: boolean
}

/** 紧凑档人形图标（蓝，不代表真实头像） */
function PersonIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden>
      <circle cx="8" cy="8" r="7.2" fill="#4a90d9" />
      <circle cx="8" cy="5.9" r="2.5" fill="#fff" />
      <path d="M3.4 13.4c.5-2.5 2.3-3.8 4.6-3.8s4.1 1.3 4.6 3.8z" fill="#fff" />
    </svg>
  )
}

export function IndentTree({ members, visibleIds, bloodIds, compact = false, forceExpand = false, selectedId, onSelect }: IndentTreeProps) {
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())

  // 实际渲染集合：房支筛选后的成员 ∩（血脉 + 外衍），滤掉外姓配偶
  const rendered = useMemo(() => members.filter((m) => visibleIds.has(m.id)), [members, visibleIds])
  const renderedIdSet = useMemo(() => new Set(rendered.map((m) => m.id)), [rendered])

  const childrenMap = useMemo(() => {
    const map = new Map<number, Member[]>()
    for (const m of rendered) {
      const pid =
        m.fatherId != null && renderedIdSet.has(m.fatherId)
          ? m.fatherId
          : m.motherId != null && renderedIdSet.has(m.motherId)
            ? m.motherId
            : null
      if (pid == null) continue
      const arr = map.get(pid) ?? []
      arr.push(m)
      map.set(pid, arr)
    }
    for (const arr of map.values()) arr.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
    return map
  }, [rendered, renderedIdSet])

  const roots = useMemo(
    () =>
      rendered
        .filter((m) => {
          const hasFather = m.fatherId != null && renderedIdSet.has(m.fatherId)
          const hasMother = m.motherId != null && renderedIdSet.has(m.motherId)
          return !hasFather && !hasMother
        })
        .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id),
    [rendered, renderedIdSet],
  )

  // 扁平化成行（含折叠状态）
  const rows = useMemo(() => {
    const out: RowInfo[] = []
    const walk = (m: Member, depth: number, flags: boolean[], isLast: boolean) => {
      const kids = childrenMap.get(m.id) ?? []
      out.push({ member: m, depth, flags, isLast, hasKids: kids.length > 0 })
      if (kids.length && (forceExpand || !collapsed.has(m.id))) {
        kids.forEach((k, idx) => walk(k, depth + 1, flags.concat([!isLast]), idx === kids.length - 1))
      }
    }
    roots.forEach((r, i) => walk(r, 0, [], i === roots.length - 1))
    return out
  }, [roots, childrenMap, collapsed, forceExpand])

  const toggle = (id: number) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const STEP = compact ? 18 : 26
  const ROW_H = compact ? 22 : 30
  const MID = compact ? 11 : 15
  const lineColor = "var(--tree-guide)"

  return (
    <div className={cn("h-full overflow-auto bg-white", compact ? "px-4 py-3" : "px-5 py-4")}>
      <div className="min-w-max">
        {rows.map(({ member, depth, flags, isLast, hasKids }) => {
          const extended = !bloodIds.has(member.id)
          const isCollapsed = collapsed.has(member.id)
          const selected = selectedId === member.id
          return (
            <div key={member.id} className="relative flex items-center" style={{ height: ROW_H }}>
              {/* 缩进引导线 */}
              <span className="relative shrink-0 self-stretch" style={{ width: depth * STEP }}>
                {Array.from({ length: depth }).map((_, i) => {
                  const x = i * STEP + STEP / 2 - 0.5
                  if (i < depth - 1) {
                    if (!flags[i]) return null
                    return (
                      <i
                        key={`v${i}`}
                        className="absolute top-0 h-full border-l"
                        style={{ left: x, borderColor: lineColor }}
                      />
                    )
                  }
                  return (
                    <span key={`l${i}`}>
                      <i
                        className="absolute top-0 border-l"
                        style={{ left: x, height: isLast ? MID : "100%", borderColor: lineColor }}
                      />
                      <i
                        className="absolute border-t"
                        style={{ top: MID, left: x, width: STEP / 2, borderColor: lineColor }}
                      />
                    </span>
                  )
                })}
              </span>

              {compact ? (
                <span className="flex items-center gap-1 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={(e) => {
                      if (!hasKids) return
                      e.stopPropagation()
                      toggle(member.id)
                    }}
                    className={cn(
                      "relative flex size-[11px] shrink-0 items-center justify-center rounded-full border",
                      hasKids ? "cursor-pointer border-[#4a90d9] dark:border-[#7fa8cc] bg-white" : "cursor-default border-[#d5dde5] dark:border-[#2c4a55]",
                    )}
                    title={hasKids ? (isCollapsed ? "展开" : "收起") : "无嗣"}
                  >
                    {hasKids ? (
                      <>
                        <i className="absolute left-[2px] right-[2px] top-1/2 h-px -translate-y-1/2 bg-[#4a90d9] dark:bg-[#7fa8cc]" />
                        {!isCollapsed ? (
                          <i className="absolute bottom-[2px] left-1/2 top-[2px] w-px -translate-x-1/2 bg-[#4a90d9] dark:bg-[#7fa8cc]" />
                        ) : null}
                      </>
                    ) : null}
                  </button>
                  <PersonIcon className="size-[15px] shrink-0" />
                  <button
                    type="button"
                    onClick={() => onSelect(member)}
                    className={cn(
                      NODE_TEXT_CLASS,
                      // 外衍仅用虚线区分，不改字体
                      extended && "border-b border-dashed border-[#7c8a90] dark:border-[#527d8d]",
                      selected && "underline",
                    )}
                    style={nodeTextStyle(compact ? "treeCompact" : "tree")}
                  >
                    {member.name}
                  </button>
                </span>
              ) : (
                <span className="flex items-center gap-1 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={(e) => {
                      if (!hasKids) return
                      e.stopPropagation()
                      toggle(member.id)
                    }}
                    className={cn(
                      "flex size-[15px] shrink-0 items-center justify-center rounded-full text-[12px] leading-none",
                      hasKids ? "cursor-pointer bg-[#1a3a5c] text-white" : "cursor-default bg-[#8fa3b5] text-white dark:bg-[#3f5f73]",
                    )}
                    title={hasKids ? (isCollapsed ? "展开" : "收起") : "无嗣"}
                  >
                    {hasKids ? (isCollapsed ? "＋" : "－") : "·"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelect(member)}
                    className={cn(
                      "rounded-[5px] border bg-white px-2 py-[1px] text-left",
                      NODE_TEXT_CLASS,
                      extended
                        ? "border-dashed border-[#7c8a90] dark:border-[#527d8d]"
                        : "border-[#c9d6e2] dark:border-[#34535f]",
                      selected && "border-[#1a5fb4] dark:border-[#7fa8cc]",
                    )}
                    style={nodeTextStyle(compact ? "treeCompact" : "tree")}
                  >
                    {member.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelect(member)}
                    className="text-[12px] text-[#1a5fb4] hover:underline dark:text-[#9ec8ec]"
                  >
                    详细
                  </button>
                  <span className="text-[12px]" style={{ color: "var(--dot-blood)" }}>
                    {generationLabel(member.generation)}
                  </span>
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
