import { useRef, type ReactNode } from "react"

/**
 * 纸面档（欧式/苏式/欧苏/树形）的缩放与拖拽外壳。
 * - 缩放由外部传入（按钮放在工具栏，与外衍提示同一行），这里只负责套用 `zoom`；
 * - 平移：拖拽改容器的 scrollLeft/scrollTop（比 transform 稳，不糊字）；
 * - 打印：`@media print` 强制复位为 100%（见 print.css），避免放大后的版面进入 PDF。
 */
export function ZoomShell({
  scale,
  children,
}: {
  scale: number
  children: ReactNode
}) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null)

  return (
    <div className="zoom-shell">
      <div
        ref={viewportRef}
        className="zoom-shell__viewport"
        onPointerDown={(event) => {
          if (event.button !== 0) return
          const el = viewportRef.current
          if (!el) return
          dragRef.current = {
            x: event.clientX,
            y: event.clientY,
            left: el.scrollLeft,
            top: el.scrollTop,
          }
          el.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current
          const el = viewportRef.current
          if (!drag || !el) return
          el.scrollLeft = drag.left - (event.clientX - drag.x)
          el.scrollTop = drag.top - (event.clientY - drag.y)
        }}
        onPointerUp={() => {
          dragRef.current = null
        }}
        onPointerCancel={() => {
          dragRef.current = null
        }}
      >
        <div className="zoom-shell__inner" style={{ zoom: scale }}>
          {children}
        </div>
      </div>
    </div>
  )
}
