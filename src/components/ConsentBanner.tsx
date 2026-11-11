import { Link } from "react-router-dom"
import { useAnalytics } from "@/lib/site-config"
import { setAnalyticsConsent, useAnalyticsConsent } from "@/lib/analytics-consent"

/**
 * 底部分析同意提示：仅在存在已启用分析服务、且访客尚未作出选择时显示。
 * 「接受」后加载分析脚本；「拒绝」或不作选择均不加载，不影响浏览。
 */
export function ConsentBanner() {
  const analytics = useAnalytics()
  const consent = useAnalyticsConsent()
  const enabledCount = analytics.filter((a) => a.enabled).length
  if (consent !== null || enabledCount === 0) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-paper-200 bg-paper-50/95 px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-6">
        <p className="min-w-0 flex-1 text-[12px] leading-[1.9] text-muted-foreground">
          我们计划启用访问统计，以了解内容访问情况、改善版面与阅读体验。该统计仅在您选择「接受」后才会生效；选择「拒绝」或不予选择，均不影响浏览、检索与打印。详见
          <Link
            to="/privacy"
            className="text-gold-700 underline underline-offset-2 hover:text-gold-800"
          >
            《隐私说明》
          </Link>
          。
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => setAnalyticsConsent("denied")}
            className="rounded-[8px] border border-ink-800/20 px-5 py-2.5 text-[12px] tracking-[0.12em] text-ink-700 transition-colors hover:border-ink-700 hover:bg-paper-100"
          >
            拒绝
          </button>
          <button
            type="button"
            onClick={() => setAnalyticsConsent("granted")}
            className="rounded-[8px] bg-ink-800 px-5 py-2.5 text-[12px] tracking-[0.12em] text-paper-50 transition-colors hover:bg-ink-700"
          >
            接受
          </button>
        </div>
      </div>
    </div>
  )
}
