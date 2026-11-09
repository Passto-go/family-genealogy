import { useCallback, useEffect, useState } from "react"

/**
 * 访客侧的「出嫁女子后裔（外衍）是否随谱展示」偏好。
 *
 * 该选择属于个人查阅习惯，不写入数据库、不影响他人：仅存于本机 localStorage，
 * 按族谱 id 分别记忆（同一浏览器查阅多部族谱互不干扰），默认不展示。
 * 世系图、首页扇形全景与族人档案共用同一份取值，切换后同页即时联动。
 */

const STORAGE_PREFIX = "clantree-extended-lineage"
const SYNC_EVENT = "clantree:extended-lineage"

function storageKey(familyId: number | null | undefined): string | null {
  return familyId == null ? null : `${STORAGE_PREFIX}:${familyId}`
}

/** 读取某族谱的本地偏好；读取失败（隐私模式 / 存储被禁用）时按默认「不展示」处理 */
export function readExtendedLineage(familyId: number | null | undefined): boolean {
  const key = storageKey(familyId)
  if (!key) return false
  try {
    return localStorage.getItem(key) === "1"
  } catch {
    return false
  }
}

/** 订阅式读取：返回 [是否展示外衍, 切换函数]，切换结果写入 localStorage 并广播给同页其它组件 */
export function useExtendedLineage(familyId: number | null | undefined) {
  const [showExtended, setShowExtended] = useState(() => readExtendedLineage(familyId))

  // 族谱 id 首帧可能为空（门面信息未到位），到位后按该族谱的偏好重新取值
  useEffect(() => {
    setShowExtended(readExtendedLineage(familyId))
  }, [familyId])

  useEffect(() => {
    const sync = () => setShowExtended(readExtendedLineage(familyId))
    window.addEventListener(SYNC_EVENT, sync)
    window.addEventListener("storage", sync)
    return () => {
      window.removeEventListener(SYNC_EVENT, sync)
      window.removeEventListener("storage", sync)
    }
  }, [familyId])

  const update = useCallback(
    (next: boolean) => {
      setShowExtended(next)
      const key = storageKey(familyId)
      if (!key) return
      try {
        localStorage.setItem(key, next ? "1" : "0")
      } catch {
        // 存储不可用时仅保留本次会话内的选择
      }
      window.dispatchEvent(new Event(SYNC_EVENT))
    },
    [familyId],
  )

  return [showExtended, update] as const
}
