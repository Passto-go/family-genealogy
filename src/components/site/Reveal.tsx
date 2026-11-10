import { useEffect, useRef, useState, type ReactNode } from "react"

/**
 * 入场动效容器：进入视口时淡入上移。
 * 用于精修方案的滚动入场，纯展示、无副作用；SSR/无 IO 环境自动显示。
 */
export function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode
  className?: string
  delay?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  // 无 IntersectionObserver 的环境（老浏览器 / 预渲染）直接按已显示处理，避免首次绘制前多跑一轮渲染
  const [shown, setShown] = useState(() => typeof IntersectionObserver === "undefined")

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === "undefined") return
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setShown(true)
            io.disconnect()
          }
        })
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${
        shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"
      } ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  )
}
