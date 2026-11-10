import { useSyncExternalStore } from "react"
import type { AnalyticsProvider } from "./analytics"

/**
 * 网站名称：全站唯一数据源，供浏览器标签页标题与背景水印共用。
 *
 * 取值来源（优先级从高到低）：
 *   1. 服务端全局配置（/api/public/site-config，由超级管理员在后台修改并持久化，全站同步）；
 *   2. 浏览器本地覆盖（localStorage，随 setSiteName 持久化，作为离线/加载前的缓存）；
 *   3. 构建期环境变量 VITE_SITE_NAME 覆盖；
 *   4. 兜底默认值 DEFAULT_SITE_NAME。
 *
 * 生效方式：
 *   应用启动时调用 fetchSiteName() 从服务端拉取全局配置并写入本 store；
 *   标签页标题与背景水印均通过 useSiteName()（基于 useSyncExternalStore）订阅该值，
 *   一旦 setSiteName() 被调用，所有订阅组件会立即重渲染、同步更新，无需刷新页面。
 */
export const DEFAULT_SITE_NAME = "时光家谱"

const STORAGE_KEY = "site-name-override"

/** 初始站名：本地覆盖优先，其次 VITE_SITE_NAME，最后兜底默认值 */
function initialSiteName(): string {
  if (typeof localStorage !== "undefined") {
    const stored = localStorage.getItem(STORAGE_KEY)?.trim()
    if (stored) return stored
  }
  return (import.meta.env.VITE_SITE_NAME as string | undefined)?.trim() || DEFAULT_SITE_NAME
}

let siteName: string = initialSiteName()

const listeners = new Set<() => void>()

export function getSiteName(): string {
  return siteName
}

/**
 * 改写站名：即时同步到水印与页脚（useSiteName 订阅者），并持久化到本地。
 * 传入空值或仅空白时回退为默认站名，并清除本地覆盖。
 */
export function setSiteName(name: string): void {
  const next = (name || "").trim() || DEFAULT_SITE_NAME
  if (next === siteName) return
  siteName = next
  if (typeof localStorage !== "undefined") {
    if (next === DEFAULT_SITE_NAME) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, next)
  }
  listeners.forEach((listener) => listener())
}

export function subscribeSiteName(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * 将图标应用到浏览器标签页（<link rel="icon">）。
 * dataUrl 为空时移除自定义图标，回退到浏览器默认（/favicon.ico 或内置图标）。
 * 仅作 DOM 副作用，不进入 React 渲染树，故即便 data URL 较大也不会触发组件重渲染。
 */
export function applyFavicon(dataUrl: string | null | undefined): void {
  if (typeof document === "undefined") return
  const selector = 'link[rel="icon"][data-custom="1"]'
  if (!dataUrl) {
    const existing = document.querySelector<HTMLLinkElement>(selector)
    if (existing) existing.remove()
    return
  }
  let link = document.querySelector<HTMLLinkElement>(selector)
  if (!link) {
    link = document.createElement("link")
    link.rel = "icon"
    link.setAttribute("data-custom", "1")
    document.head.appendChild(link)
  }
  if (link.href !== dataUrl) link.href = dataUrl
}

/** 从服务端拉取全局配置并写入本 store（服务端为权威来源，覆盖本地缓存）。网络异常时沿用本地 / 默认值，不阻断渲染。 */
export async function fetchSiteName(): Promise<void> {
  try {
    const res = await fetch("/api/public/site-config", { credentials: "include" })
    if (!res.ok) return
    const data = (await res.json()) as {
      siteName?: string
      feedbackEnabled?: boolean
      faviconDataUrl?: string
      analytics?: AnalyticsProvider[]
    }
    if (data.siteName) setSiteName(data.siteName)
    if (typeof data.feedbackEnabled === "boolean") setFeedbackEnabled(data.feedbackEnabled)
    if (typeof data.faviconDataUrl === "string") applyFavicon(data.faviconDataUrl)
    if (Array.isArray(data.analytics)) setAnalytics(data.analytics)
  } catch {
    // 网络异常时静默降级，沿用本地 / 默认值
  }
}

// 信息反馈通道开关（站点级，默认关闭）。后台「网站设置」可切换；前端据此显隐反馈入口，
// 服务端在反馈提交接口处同样强制校验——前端隐藏仅为体验，服务端拒绝才是安全边界。
let feedbackEnabled = false
const feedbackListeners = new Set<() => void>()

export function getFeedbackEnabled(): boolean {
  return feedbackEnabled
}

export function setFeedbackEnabled(value: boolean): void {
  if (value === feedbackEnabled) return
  feedbackEnabled = value
  feedbackListeners.forEach((listener) => listener())
}

export function subscribeFeedbackEnabled(listener: () => void): () => void {
  feedbackListeners.add(listener)
  return () => {
    feedbackListeners.delete(listener)
  }
}

export function useFeedbackEnabled(): boolean {
  return useSyncExternalStore(subscribeFeedbackEnabled, getFeedbackEnabled, getFeedbackEnabled)
}

// 访问统计接入配置（平台级，与普通访客页/前台同源；超管在后台写入，前端据此注入脚本）。
let analytics: AnalyticsProvider[] = []
const analyticsListeners = new Set<() => void>()

export function getAnalytics(): AnalyticsProvider[] {
  return analytics
}

export function setAnalytics(value: AnalyticsProvider[]): void {
  analytics = Array.isArray(value) ? value : []
  analyticsListeners.forEach((listener) => listener())
}

export function subscribeAnalytics(listener: () => void): () => void {
  analyticsListeners.add(listener)
  return () => {
    analyticsListeners.delete(listener)
  }
}

export function useAnalytics(): AnalyticsProvider[] {
  return useSyncExternalStore(subscribeAnalytics, getAnalytics, getAnalytics)
}

export function useSiteName(): string {
  return useSyncExternalStore(subscribeSiteName, getSiteName, getSiteName)
}
