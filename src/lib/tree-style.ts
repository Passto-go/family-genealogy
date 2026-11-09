import { useCallback, useEffect, useState } from "react"

/**
 * 世系图展示模式：卡片谱 / 树形谱 / 垂丝谱。
 * 欧式谱、欧苏谱、苏式谱只存在于谱页（纸面），不进入本切换，故不在此类型内。
 */
export type TreeStyle = "card" | "tree" | "su"

/** 切换入口平铺顺序（不显示类别层） */
export const TREE_STYLE_ORDER: TreeStyle[] = ["card", "tree", "su"]

export const TREE_STYLE_LABELS: Record<TreeStyle, string> = {
  card: "卡片谱",
  tree: "树形谱",
  su: "垂丝谱",
}

/** 已下线的紧凑档：本地存过旧值的，回落到对应的标准档，不留死选项 */
const LEGACY_STYLES: Record<string, TreeStyle> = {
  "tree-compact": "tree",
  "su-compact": "su",
}

const STORAGE_PREFIX = "clantree-tree-style"
const SYNC_EVENT = "clantree:tree-style"

function storageKey(familyId: number | null | undefined): string | null {
  return familyId == null ? null : `${STORAGE_PREFIX}:${familyId}`
}

export function readTreeStyle(familyId: number | null | undefined): TreeStyle {
  const key = storageKey(familyId)
  if (!key) return "card"
  try {
    const v = localStorage.getItem(key) ?? ""
    if ((TREE_STYLE_ORDER as string[]).includes(v)) return v as TreeStyle
    return LEGACY_STYLES[v] ?? "card"
  } catch {
    return "card"
  }
}

/** 展示样式偏好：按族谱分别记忆，默认「世系卡片」 */
export function useTreeStyle(familyId: number | null | undefined) {
  const [style, setStyleState] = useState<TreeStyle>(() => readTreeStyle(familyId))

  useEffect(() => {
    setStyleState(readTreeStyle(familyId))
  }, [familyId])

  useEffect(() => {
    const sync = () => setStyleState(readTreeStyle(familyId))
    window.addEventListener(SYNC_EVENT, sync)
    window.addEventListener("storage", sync)
    return () => {
      window.removeEventListener(SYNC_EVENT, sync)
      window.removeEventListener("storage", sync)
    }
  }, [familyId])

  const setStyle = useCallback(
    (next: TreeStyle) => {
      setStyleState(next)
      const key = storageKey(familyId)
      if (!key) return
      try {
        localStorage.setItem(key, next)
      } catch {
        // 存储不可用时仅保留本次会话内的选择
      }
      window.dispatchEvent(new Event(SYNC_EVENT))
    },
    [familyId],
  )

  return [style, setStyle] as const
}
