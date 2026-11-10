import { useEffect, useRef } from "react"
import { useLocation } from "react-router-dom"
import { applyAnalytics, removeAnalytics, trackPageview } from "@/lib/analytics"
import { useAnalytics } from "@/lib/site-config"
import { useAnalyticsConsent } from "@/lib/analytics-consent"

/**
 * 全局挂载一次：按后台配置的统计接入注入各厂商脚本，并在 SPA 路由切换时上报页面浏览。
 * 配置来自 /api/public/site-config（异步拉取），拉取完成后通过 useAnalytics 触发注入。
 * 注入受访客同意状态门控：仅当 consent === "granted" 才加载；拒绝或尚未选择则不加载，
 * 若此前已加载则在拒绝时移除已注入脚本。
 */
export function AnalyticsLoader() {
  const analytics = useAnalytics()
  const consent = useAnalyticsConsent()
  const location = useLocation()
  const firstRender = useRef(true)

  useEffect(() => {
    if (consent === "granted") {
      applyAnalytics(analytics)
    } else {
      // 非同意状态：确保未注入（拒绝或撤销时移除已加载脚本）
      removeAnalytics()
    }
  }, [analytics, consent])

  useEffect(() => {
    // 首屏页面浏览由注入逻辑负责，这里只处理后续站内路由切换
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    if (consent === "granted") trackPageview(location.pathname + location.search)
  }, [location, consent])

  return null
}
