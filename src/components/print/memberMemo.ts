import { canHoldBranch, type Member } from "@/lib/types"

/** 与组件文件分开，避免 PaperSheets.tsx 混入非组件导出导致 Fast Refresh 失效 */

const CN_DIGITS = ["〇", "一", "二", "三", "四", "五", "六", "七", "八", "九"]

/** 年份逐位转中文数字，与纸面原型一致（1905 → 一九〇五） */
export function cnYear(value: string | undefined): string {
  return (value ?? "").replace(/\d/g, (digit) => CN_DIGITS[Number(digit)])
}

/**
 * 取年份数值，仅接受纯数字（去掉首尾空白）。
 * 用于享寿计算等算数场景：空串、非数字、超出四位一律返回 null，避免 Number("") = 0 被当成有效年份。
 */
export function yearValue(value: string | undefined): number | null {
  const text = (value ?? "").trim()
  if (!/^\d{1,4}$/.test(text)) return null
  const year = Number(text)
  return year > 0 ? year : null
}

/**
 * 移动端流式预览、欧苏谱共用的简版小传。
 *
 * 子女一律按**全量谱系**统计（调用方传 allChildrenOf），不按当前可见集合：
 * 本族女子出嫁后所育子女属外衍，关闭外衍时其子女不在谱内条目中，
 * 但她确实有后代，不能因此写成「无嗣」。
 */
export function buildMemberMemo(
  member: Member,
  byId: Map<number, Member>,
  childrenOf: (id: number) => Member[],
): string {
  const parts: string[] = []
  // 房支只随父系血缘：普通外姓配偶不写「居X房」，入赘承祧者例外
  if (member.branch && canHoldBranch(member)) {
    parts.push(member.branch.endsWith("房") ? `居${member.branch}` : `居${member.branch}房`)
  }
  // 本族女子外嫁记「适某」，本族男丁娶妻记「配某」；嫁入本族的媳妇本身即以夫为纲，不再重复写配偶
  if (member.spouseId != null && !member.isMarriedIn) {
    const spouse = byId.get(member.spouseId)
    if (spouse) parts.push(member.gender === "female" ? `适${spouse.name}` : `配${spouse.name}`)
  }
  const birth = cnYear(member.birthYear)
  const death = cnYear(member.deathYear)
  if (birth) parts.push(`生于${birth}`)
  if (death) parts.push(`卒于${death}`)
  const kids = childrenOf(member.id)
  if (kids.length === 0) {
    parts.push("无嗣")
  } else {
    const sons = kids.filter((k) => k.gender === "male")
    const daughters = kids.filter((k) => k.gender === "female")
    if (sons.length) parts.push(`子${sons.map((k) => k.name).join("、")}`)
    if (daughters.length) parts.push(`女${daughters.map((k) => k.name).join("、")}`)
  }
  return parts.join("　")
}
