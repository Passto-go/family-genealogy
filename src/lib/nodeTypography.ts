import type { CSSProperties } from "react"
import type { Member } from "@/lib/types"

/**
 * 世系图「成员节点」排版的唯一配置源。
 *
 * 一致性规则：
 * - 字体类型、字重、字色（含日/夜）全局共享，不因树层级、房支、血脉/外衍、
 *   选中或搜索命中而改变；这些状态一律用边框线型、圆点空心、徽章、下划线表达。
 * - 字号按「展示样式档」各自配置即可，不要求各档一致（卡片谱可大、宝塔可小）；
 *   但同一档内所有节点读同一份配置，不会出现层级/分支之间的字体差异。
 *
 * 与布局测算共用同一组数值：调整某档 fontSize 后，computeBaotaLayout 会重新量算
 * 姓名宽度，整张吊线图的节点宽度与间距同步重排，全图所有姓名一致生效。
 */
export interface NodeTypography {
  /** 该展示样式档的姓名号（px），各档允许不同 */
  fontSize: number
  /** 以下四项全局共享，保证同一张图内所有节点外观一致 */
  fontFamily: string
  fontWeight: number
  letterSpacingEm: number
  color: string
}

const SHARED = {
  fontFamily: "var(--node-font)",
  fontWeight: 400,
  letterSpacingEm: 0.04,
  color: "var(--node-ink)",
} as const

/**
 * 按展示样式档配置；如需某档单独换字体，改这里对应的 fontFamily 即可。
 * 只覆盖屏幕档与世系图节点。纸面三档（欧式谱、欧苏谱、苏式谱）的字号由
 * print.css / sushi.css 的 --euro-* 令牌决定，不经过此表，故此处不设 euro 项。
 */
export const NODE_TYPO_BY_STYLE = {
  card: { ...SHARED, fontSize: 16 },
  tree: { ...SHARED, fontSize: 13.5 },
  treeCompact: { ...SHARED, fontSize: 12 },
  su: { ...SHARED, fontSize: 13 },
  suCompact: { ...SHARED, fontSize: 12 },
  radial: { ...SHARED, fontSize: 12 },
} as const

export type NodeStyleKey = keyof typeof NODE_TYPO_BY_STYLE

/** 节点姓名统一类名：作为 JS 未加载时的兜底，字体族与字色均由主题变量提供 */
export const NODE_TEXT_CLASS = "font-song text-ink-800"

/** 生成该档节点的 inline 排版，所有层级/分支共用同一份 */
export function nodeTextStyle(styleKey: NodeStyleKey): CSSProperties {
  const t = NODE_TYPO_BY_STYLE[styleKey]
  return {
    fontFamily: t.fontFamily,
    /* 字号乘 --pf-boost：谱页画布整套度量放大到浏览器最小字号之上，再由缩放收回视觉尺寸。
       世系图等未设该变量的地方退回 1，渲染与原先一致。 */
    fontSize: `calc(${t.fontSize}px * var(--pf-boost, 1))`,
    fontWeight: t.fontWeight,
    letterSpacing: `${t.letterSpacingEm}em`,
    color: t.color,
  }
}

/** CJK / 全角字符按一个字号计宽，ASCII 与半角按 0.56 字号估算 */
function glyphWidth(ch: string, fontSize: number): number {
  const code = ch.codePointAt(0) ?? 0
  const wide =
    (code >= 0x1100 && code <= 0x115f) ||
    code === 0x2329 ||
    code === 0x232a ||
    (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe10 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x20000 && code <= 0x3fffd)
  return wide ? fontSize : fontSize * 0.56
}

/** 估算一段标签在指定字号下的像素宽度（含该档字距） */
export function measureLabelWidth(
  label: string,
  fontSize: number = NODE_TYPO_BY_STYLE.suCompact.fontSize,
  letterSpacingEm: number = NODE_TYPO_BY_STYLE.suCompact.letterSpacingEm,
): number {
  const chars = Array.from(label)
  if (chars.length === 0) return 0
  const glyphs = chars.reduce((sum, ch) => sum + glyphWidth(ch, fontSize), 0)
  return glyphs + (chars.length - 1) * fontSize * letterSpacingEm
}

/** 吊线·紧凑（宝塔）节点盒模型，与 BaotaNode 的 px-1 / 1px 边框严格对应 */
export const BAOTA_BOX = {
  /** 单侧水平内边距（px-1 = 4px） */
  paddingX: 4,
  /** 左右边框合计（1px × 2） */
  borderX: 2,
  /** 短姓名时保持参考图的紧凑基准宽度 */
  minWidth: 44,
  height: 22,
  /** 同辈最小间隙；姓名变宽时按比例同步放大 */
  hGap: 16,
  vGap: 50,
} as const

export interface BaotaLayoutOptions {
  nodeSize: { width: number; height: number }
  gaps: { h: number; v: number }
}

/**
 * 依据当前可见成员的姓名内容，计算「全局统一」的节点宽度与间距。
 * 以最宽标签（含折叠房支的「X房」占位名）为基准，所有节点等宽且能完整显示姓名；
 * 任一姓名变长、字号调整、展示范围或房支筛选变化，都会让整张图同步重排。
 */
export function computeBaotaLayout(members: Member[]): BaotaLayoutOptions {
  const { fontSize, letterSpacingEm } = NODE_TYPO_BY_STYLE.suCompact
  let maxText = 0
  const consider = (label: string) => {
    maxText = Math.max(maxText, measureLabelWidth(label, fontSize, letterSpacingEm))
  }
  for (const member of members) {
    consider(member.name)
    if (member.branch) consider(`${member.branch}房`)
  }

  const width = Math.max(
    BAOTA_BOX.minWidth,
    Math.ceil(maxText + BAOTA_BOX.paddingX * 2 + BAOTA_BOX.borderX),
  )
  const extra = width - BAOTA_BOX.minWidth
  return {
    nodeSize: { width, height: BAOTA_BOX.height },
    gaps: { h: BAOTA_BOX.hGap + extra * 0.5, v: BAOTA_BOX.vGap },
  }
}
