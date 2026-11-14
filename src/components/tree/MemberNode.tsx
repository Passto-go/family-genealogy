import { memo } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import { cn } from "@/lib/utils"
import { generationLabel, lifeSpan } from "@/lib/types"
import { NODE_WIDTH, type MemberFlowNode } from "./layout"
import { MemberAvatar } from "@/components/MemberAvatar"
import { NODE_TEXT_CLASS, nodeTextStyle } from "@/lib/nodeTypography"

/* 卡片宽度只认 layout.ts 的 NODE_WIDTH：谱页会把整套度量乘 --pf-boost 放大到浏览器
   最小字号之上，再由画布缩放收回视觉尺寸；世系图未设该变量，calc 退回 1。 */
const CARD_WIDTH = `calc(${NODE_WIDTH}px * var(--pf-boost, 1))`

/* 固定列宽：头像列 48 承载 40 的头像（原来 40/36 偏窄，左侧空、右侧首行又留白）；
   配偶竖排单字 + 「配/外」标签 36 足够；其余宽度留给正文列（姓名、字号最容易被截）。 */
const AVATAR_COL = `calc(48px * var(--pf-boost, 1))`
const AVATAR_SIZE = 40
const SPOUSE_COL = `calc(36px * var(--pf-boost, 1))`
const BODY_PAD_X = `calc(10px * var(--pf-boost, 1))`
const BODY_PAD_Y = `calc(10px * var(--pf-boost, 1))`

function MemberNodeInner({ data, selected }: NodeProps<MemberFlowNode>) {
  const { member, spouse, dimmed, matched, ziBei, extended, collapsed, collapsedLabel, collapsedCount } = data

  // 整房支折叠后的占位节点
  if (collapsed) {
    return (
      <div
        className="group relative flex h-full items-center justify-center overflow-hidden rounded-[calc(8px*var(--pf-boost,1))] border border-dashed border-ink-300 bg-paper-100/70 transition-colors hover:border-ink-500"
        style={{ width: CARD_WIDTH }}
      >
        <Handle type="target" position={Position.Top} />
        <div className="flex flex-col items-center gap-[calc(4px*var(--pf-boost,1))] px-[calc(12px*var(--pf-boost,1))] text-center">
          <span className={NODE_TEXT_CLASS} style={nodeTextStyle("card")}>
            {collapsedLabel}房
          </span>
          <span className="text-[calc(10px*var(--pf-boost,1))] tracking-[0.04em] text-muted-foreground">
            {collapsedCount} 人 · 点击展开
          </span>
        </div>
        <Handle type="source" position={Position.Bottom} />
      </div>
    )
  }

  const marriedInSpouse = Boolean(spouse?.isMarriedIn)

  return (
    <div
      className={cn(
        "group relative flex h-full items-stretch overflow-hidden rounded-[calc(8px*var(--pf-boost,1))] border transition-all duration-200",
        extended
          ? "border-dashed border-ink-400 bg-paper-50"
          : "border-paper-300 bg-paper-100 shadow-xs hover:border-ink-400 hover:shadow-card",
        selected && "border-ink-700 shadow-float ring-1 ring-ink-700/15",
        matched && !selected && "border-gold-600 ring-1 ring-gold-600/25",
        dimmed && "opacity-20 saturate-0",
      )}
      style={{ width: CARD_WIDTH }}
    >
      <Handle type="target" position={Position.Top} />

      <div
        className="flex shrink-0 items-center justify-center border-r border-paper-200 bg-paper-100"
        style={{ width: AVATAR_COL }}
      >
        <MemberAvatar member={member} size={AVATAR_SIZE} className="n-avatar" />
      </div>

      <div
        className="flex min-w-0 flex-1 flex-col justify-center"
        style={{ paddingLeft: BODY_PAD_X, paddingRight: BODY_PAD_X, paddingTop: BODY_PAD_Y, paddingBottom: BODY_PAD_Y }}
      >
        <div className="flex min-w-0 items-center gap-[calc(6px*var(--pf-boost,1))]">
          <span className="shrink-0 text-[calc(9px*var(--pf-boost,1))] tracking-[0.18em] text-ink-400">
            {generationLabel(member.generation)}
          </span>
          {ziBei && !member.isMarriedIn ? (
            <span className="min-w-0 truncate rounded-[calc(2px*var(--pf-boost,1))] bg-gold-50 px-[calc(4px*var(--pf-boost,1))] text-[calc(8.5px*var(--pf-boost,1))] tracking-[0.06em] text-gold-700">
              {ziBei}字辈
            </span>
          ) : null}
          {extended ? (
            <span className="min-w-0 shrink-0 truncate rounded-[calc(2px*var(--pf-boost,1))] bg-ink-100 px-[calc(4px*var(--pf-boost,1))] text-[calc(8.5px*var(--pf-boost,1))] tracking-[0.06em] text-ink-500">
              外衍
            </span>
          ) : null}
          {/* 身份/职业/功名（member.title）不在卡片上展示，点开族人详情页查看 */}
        </div>

        <div
          className={cn("mt-[calc(4px*var(--pf-boost,1))] truncate", NODE_TEXT_CLASS)}
          style={nodeTextStyle("card")}
        >
          {member.name}
        </div>

        {member.courtesyName ? (
          <div className="mt-[calc(4px*var(--pf-boost,1))] truncate text-[calc(9.5px*var(--pf-boost,1))] tracking-[0.04em] text-muted-foreground">
            字 {member.courtesyName}
          </div>
        ) : null}

        <div className="mt-[calc(2px*var(--pf-boost,1))] truncate text-[calc(9.5px*var(--pf-boost,1))] tracking-[0.02em] text-muted-foreground/80">
          {lifeSpan(member)}
        </div>
      </div>

      {spouse ? (
        <div
          className={cn(
            "flex shrink-0 flex-col items-center justify-center gap-[calc(4px*var(--pf-boost,1))] border-l bg-paper-100",
            marriedInSpouse ? "border-dashed border-paper-400" : "border-paper-200",
          )}
          style={{ width: SPOUSE_COL }}
        >
          <span className="text-[calc(8.5px*var(--pf-boost,1))] tracking-[0.1em] text-ink-300">
            {marriedInSpouse ? "外" : "配"}
          </span>
          <span className="vertical-rl font-song text-[calc(12.5px*var(--pf-boost,1))] leading-none tracking-[0.08em] text-ink-800">
            {spouse.name}
          </span>
        </div>
      ) : null}

      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}

export const MemberNode = memo(MemberNodeInner)
