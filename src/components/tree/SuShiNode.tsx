import { memo } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import { cn } from "@/lib/utils"
import { toChineseNumber } from "@/lib/types"
import type { MemberFlowNode } from "./layout"

/**
 * 苏式节点（苏式谱档）：传统谱牒「牌位」——
 * 顶部黑底白字世次条，中间竖排姓名，底部双行小字行传（生卒、配氏、子嗣、葬地）。
 * 与垂丝谱的「圆点 + 平排姓名」明确区分；外衍以虚线框区分。
 * 兼顾传统竖排观感与现代屏幕/打印的可读性（较大字号、墨线框、纸色底）。
 */
function SuShiNodeInner({ data }: NodeProps<MemberFlowNode>) {
  const { member, extended, collapsed, collapsedLabel, collapsedCount, memo: memoText } = data

  if (collapsed) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 border border-dashed border-[#8a8378] bg-[#fffdf7] text-center text-[#1c1c1c]">
        <Handle type="target" position={Position.Top} />
        <span className="font-song text-[12px] tracking-[0.08em]">{collapsedLabel}房</span>
        <span className="text-[9px] tracking-[0.02em] text-[#8a8378]">{collapsedCount} 人</span>
        <Handle type="source" position={Position.Bottom} />
      </div>
    )
  }

  const gen = Math.max(1, member.generation ?? 1)
  return (
    <div
      className={cn(
        "relative flex h-full w-full flex-col overflow-hidden bg-[#fffdf7] text-[#1c1c1c]",
        extended ? "border border-dashed border-[#8a8378]" : "border border-[#2b2b2b]",
      )}
    >
      <Handle type="target" position={Position.Top} />
      {/* 世次：黑底白字竖条 */}
      <div className="shrink-0 bg-[#1c1c1c] py-[2px] text-center font-song text-[9px] leading-none tracking-[0.24em] text-[#f5efe2]">
        {toChineseNumber(gen)}世
      </div>
      {/* 姓名：竖排 */}
      <div className="flex min-h-0 flex-1 items-center justify-center py-1">
        <span
          className="font-song text-[15px] font-semibold leading-none tracking-[0.12em]"
          style={{ writingMode: "vertical-rl", textOrientation: "upright" }}
        >
          {member.name}
        </span>
      </div>
      {/* 行传：双行小字 */}
      <p className="h-[20px] shrink-0 overflow-hidden border-t border-[#c9c2b2] px-1 pt-[1px] text-[6.5px] leading-[1.4] tracking-[0.01em] text-[#4a453d]">
        {memoText ?? ""}
      </p>
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}

export const SuShiNode = memo(SuShiNodeInner)
