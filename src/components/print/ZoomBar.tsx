import { Minus, Plus, RotateCcw } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * 统一的缩放按钮条：纸面档（ZoomShell 内）与 React Flow 档（Panel 内）共用，
 * 保证 6 档的缩放控件外观一致（同尺寸按钮、同百分比显示、同复位图标）。
 */
export function ZoomBar({
  percent,
  onZoomOut,
  onZoomIn,
  onReset,
  resetTitle = "复位 100%",
  className,
}: {
  percent: number
  onZoomOut: () => void
  onZoomIn: () => void
  onReset: () => void
  resetTitle?: string
  className?: string
}) {
  return (
    <div className={cn("zoom-shell__bar", className)} role="toolbar" aria-label="缩放">
      <button type="button" onClick={onZoomOut} aria-label="缩小" title="缩小">
        <Minus className="size-3.5" />
      </button>
      <span className="zoom-shell__value">{Math.round(percent * 100)}%</span>
      <button type="button" onClick={onZoomIn} aria-label="放大" title="放大">
        <Plus className="size-3.5" />
      </button>
      <button type="button" onClick={onReset} aria-label="复位" title={resetTitle}>
        <RotateCcw className="size-3.5" />
      </button>
    </div>
  )
}
