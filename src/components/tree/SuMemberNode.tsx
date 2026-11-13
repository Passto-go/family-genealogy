import { memo } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import { cn } from "@/lib/utils"
import { NODE_TEXT_CLASS, nodeTextStyle } from "@/lib/nodeTypography"
import type { MemberFlowNode } from "./layout"

/**
 * 苏式标准节点：圆点 + 姓名直接落在画布上，无卡片框。
 * 姓名排版统一引用 NODE_TYPO；外衍用「空心圆点」而非灰字区分，
 * 选中/命中态用下划线与边框表达，不改变字体类型、字号、字重或颜色。
 */
function SuMemberNodeInner({ data, selected }: NodeProps<MemberFlowNode>) {
  const { member, dimmed, matched, extended, compact, childCount, collapsed, collapsedLabel, collapsedCount } =
    data

  if (collapsed) {
    return (
      <div className="group relative flex h-full w-full items-center justify-center overflow-hidden border border-dashed border-ink-300/70 bg-transparent transition-colors hover:border-ink-500">
        <Handle type="target" position={Position.Top} />
        <div className="flex flex-col items-center gap-[calc(4px*var(--pf-boost,1))] px-[calc(12px*var(--pf-boost,1))] text-center">
          <span className={NODE_TEXT_CLASS} style={nodeTextStyle("su")}>
            {collapsedLabel}房
          </span>
          <span className="text-[calc(10px*var(--pf-boost,1))] tracking-[0.04em] text-[#9a948a]">
            {collapsedCount} 人 · 点击展开
          </span>
        </div>
        <Handle type="source" position={Position.Bottom} />
      </div>
    )
  }

  return (
    <div
      className={cn(
        "relative flex h-full w-full flex-col items-center justify-center gap-[calc(2px*var(--pf-boost,1))] py-[calc(4px*var(--pf-boost,1))] transition-all",
        dimmed && "opacity-20 saturate-0",
      )}
    >
      <Handle type="target" position={Position.Top} />
      {!compact && childCount ? (
        <span className="shrink-0 text-[calc(9px*var(--pf-boost,1))] leading-none tracking-[0.04em] text-[#9a948a]">
          子{childCount}
        </span>
      ) : null}
      <div className="flex items-center justify-center gap-[calc(6px*var(--pf-boost,1))]">
        <span
          className={cn(
            "shrink-0 rounded-full",
            extended
              ? "size-[calc(6px*var(--pf-boost,1))] border border-[#7c8a90] bg-transparent"
              : compact
                ? "size-[calc(4px*var(--pf-boost,1))]"
                : "size-[calc(6px*var(--pf-boost,1))]",
          )}
          style={extended ? undefined : { background: "var(--dot-blood)" }}
        />
        <span
          className={cn("truncate", NODE_TEXT_CLASS, (selected || matched) && "underline")}
          style={nodeTextStyle("su")}
        >
          {member.name}
        </span>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}

export const SuMemberNode = memo(SuMemberNodeInner)
