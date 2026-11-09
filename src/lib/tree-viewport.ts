const VIEW_PADDING = { top: 150, right: 70, bottom: 60, left: 70 } as const
export const MIN_ZOOM = 0.08
const MAX_ZOOM = 1.8

/** 依据已知的布局尺寸直接计算视口变换，避免依赖画布内部测量时序 */
export function computeFitViewport(
  bounds: { width: number; height: number },
  container: { width: number; height: number },
) {
  const availWidth = Math.max(160, container.width - VIEW_PADDING.left - VIEW_PADDING.right)
  const availHeight = Math.max(160, container.height - VIEW_PADDING.top - VIEW_PADDING.bottom)
  const zoom = Math.min(
    MAX_ZOOM,
    Math.max(MIN_ZOOM, Math.min(availWidth / bounds.width, availHeight / bounds.height)),
  )
  return {
    x: VIEW_PADDING.left + (availWidth - bounds.width * zoom) / 2,
    y: VIEW_PADDING.top + (availHeight - bounds.height * zoom) / 2,
    zoom,
  }
}
