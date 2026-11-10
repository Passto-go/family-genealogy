// 第三方分析服务的访客同意状态（纯前端、localStorage 持久化）。
// 站点底部提示询问「接受 / 拒绝」；仅当状态为 granted 时才加载分析脚本（见 AnalyticsLoader）。

export type AnalyticsConsent = "granted" | "denied" | null

const KEY = "analytics-consent"

function read(): AnalyticsConsent {
  if (typeof window === "undefined") return null
  const v = window.localStorage.getItem(KEY)
  return v === "granted" || v === "denied" ? v : null
}

export function getAnalyticsConsent(): AnalyticsConsent {
  return read()
}

export function setAnalyticsConsent(value: "granted" | "denied"): void {
  if (typeof window === "undefined") return
  window.localStorage.setItem(KEY, value)
  window.dispatchEvent(new Event("analytics-consent-changed"))
}

export function resetAnalyticsConsent(): void {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(KEY)
  window.dispatchEvent(new Event("analytics-consent-changed"))
}

export function subscribeAnalyticsConsent(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {}
  const handler = () => cb()
  window.addEventListener("analytics-consent-changed", handler)
  window.addEventListener("storage", handler)
  return () => {
    window.removeEventListener("analytics-consent-changed", handler)
    window.removeEventListener("storage", handler)
  }
}

import { useEffect, useState } from "react"

export function useAnalyticsConsent(): AnalyticsConsent {
  const [value, setValue] = useState<AnalyticsConsent>(getAnalyticsConsent())
  useEffect(
    () => subscribeAnalyticsConsent(() => setValue(getAnalyticsConsent())),
    [],
  )
  return value
}
