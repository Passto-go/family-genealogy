import { useEffect } from "react"

const TITLE_SUFFIX = " · 只读演示"

/**
 * 只读演示标识：固定在页面底部中间，避开左下角缩放控件与右下角缩略图。
 * 同时给标签页标题补上「只读演示」，避免访客误以为是正式站点。
 */
export function DemoBadge() {
  useEffect(() => {
    const apply = () => {
      if (document.title.endsWith(TITLE_SUFFIX)) return
      document.title = `${document.title}${TITLE_SUFFIX}`
    }
    apply()
    // 站名由接口异步刷新，标题会被重写，此处跟随补齐
    const observer = new MutationObserver(apply)
    observer.observe(document.head, { childList: true, subtree: true, characterData: true })
    return () => observer.disconnect()
  }, [])

  return (
    <div className="pointer-events-none fixed bottom-2 left-1/2 z-50 -translate-x-1/2 select-none">
      <span className="inline-flex items-center gap-1.5 border border-gold-600/40 bg-ink-800/90 px-2.5 py-1 text-[10.5px] tracking-[0.14em] text-paper-50/90 shadow-float">
        只读演示
        <span aria-hidden className="h-2.5 w-px bg-paper-50/25" />
        示例数据，不可编辑
      </span>
    </div>
  )
}
