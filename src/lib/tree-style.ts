import { useCallback, useEffect, useState } from "react"

/**
 * 展示模式（与谱页档位合并后统一为 6 档）：
 * 卡片谱 card（可交互）、树形谱 tree、垂丝谱 vertical、欧式谱 euro、苏式谱 su-shi、欧苏谱 combo。
 * 注意：vertical 是「垂丝谱」，su-shi 是「苏式谱」，两者实现完全不同，勿混用。
 */
export type TreeStyle = "card" | "tree" | "vertical" | "euro" | "su-shi" | "combo"

/** 切换入口平铺顺序（不显示类别层） */
export const TREE_STYLE_ORDER: TreeStyle[] = [
  "card",
  "tree",
  "vertical",
  "euro",
  "su-shi",
  "combo",
]

export const TREE_STYLE_LABELS: Record<TreeStyle, string> = {
  card: "卡片谱",
  tree: "树形谱",
  vertical: "垂丝谱",
  euro: "欧式谱",
  "su-shi": "苏式谱",
  combo: "欧苏谱",
}

/** 旧值映射：合并前 `su` 是垂丝谱；谱页旧 slug 也一并兼容，避免读到死选项回落到默认 */
const LEGACY_STYLES: Record<string, TreeStyle> = {
  su: "vertical",
  "tree-compact": "tree",
  "su-compact": "vertical",
  chuisi: "vertical",
  oushi: "euro",
}

const STORAGE_PREFIX = "clantree-tree-style"
const SYNC_EVENT = "clantree:tree-style"

function storageKey(familyId: number | null | undefined): string | null {
  return familyId == null ? null : `${STORAGE_PREFIX}:${familyId}`
}

/** 默认档：窄屏默认「树形谱」（纸面档在手机上不可用），桌面默认「卡片谱」 */
function defaultStyle(): TreeStyle {
  if (typeof window !== "undefined" && window.matchMedia?.("(max-width: 640px)").matches) {
    return "tree"
  }
  return "card"
}

export function readTreeStyle(familyId: number | null | undefined): TreeStyle {
  const key = storageKey(familyId)
  if (!key) return defaultStyle()
  try {
    const v = localStorage.getItem(key) ?? ""
    if ((TREE_STYLE_ORDER as string[]).includes(v)) return v as TreeStyle
    return LEGACY_STYLES[v] ?? defaultStyle()
  } catch {
    return defaultStyle()
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
