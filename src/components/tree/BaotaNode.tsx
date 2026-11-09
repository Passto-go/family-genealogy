import { memo } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import { cn } from "@/lib/utils"
import { NODE_TEXT_CLASS, nodeTextStyle } from "@/lib/nodeTypography"
import type { MemberFlowNode } from "./layout"

/**
 * 苏式紧凑（宝塔样式）节点：小圆角矩形细框 + 姓名，白底、无圆点、无「子X」。
 * 姓名排版统一引用 NODE_TYPO；血脉/外衍只用边框线型区分，不改字体。
 * 节点宽度由 computeBaotaLayout 按姓名内容全局测算，故不会截断姓名。
 */
function BaotaNodeInner({ data, selected }: NodeProps<MemberFlowNode>) {
  const { member, dimmed, matched, extended, collapsed, collapsedLabel, collapsedCount } = data

  if (collapsed) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 rounded-[5px] border border-dashed border-[#7c8a90] bg-white text-center dark:border-[#527d8d]">
        <Handle type="target" position={Position.Top} />
        <span className={NODE_TEXT_CLASS} style={nodeTextStyle("suCompact")}>
          {collapsedLabel}房
        </span>
        <span className="text-[9px] text-[#9a948a] dark:text-[#9fb2ba]">{collapsedCount}人</span>
        <Handle type="source" position={Position.Bottom} />
      </div>
    )
  }

  return (
    <div
      className={cn(
        "relative flex h-full w-full items-center justify-center rounded-[5px] border bg-white px-1 transition-all",
        extended
          ? "border-dashed border-[#7c8a90] dark:border-[#527d8d]"
          : "border-[#e0e0e0] dark:border-[#34535f]",
        matched && !selected && "border-[#b3261e] dark:border-[#e7a99c]",
        selected && "border-[#8a8478] dark:border-[#8fb0bb]",
        dimmed && "opacity-20 saturate-0",
      )}
    >
      <Handle type="target" position={Position.Top} />
      <span
        className={cn("truncate", NODE_TEXT_CLASS, selected && "underline")}
        style={nodeTextStyle("suCompact")}
        title={member.name}
      >
        {member.name}
      </span>
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}

export const BaotaNode = memo(BaotaNodeInner)
