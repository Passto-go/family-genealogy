import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"

export type ThemeMode = "light" | "dark"

const ThemeModeContext = createContext<ThemeModeValue | null>(null)

interface ThemeModeValue {
  mode: ThemeMode
  resolved: "light" | "dark"
  toggle: () => void
}

/** 按当前时区实际时间判断昼夜：06:00 ≤ 时 < 19:00 为日间（浅色），其余为夜间（深色） */
function timeBasedMode(): ThemeMode {
  const hour = new Date().getHours()
  return hour >= 6 && hour < 19 ? "light" : "dark"
}

/**
 * 主题模式控制（基于当前所在时区的实际时间）：
 * - 默认按本地时间昼夜自动判定（日间=浅色，夜间=深色）；
 * - 用户点击单一切换按钮可临时覆盖当前会话内的显示，刷新后恢复为按时间判定；
 * - 无手动覆盖时，随本地时间推移在阈值处自动切换（仅在跨过昼夜阈值时才更新，避免无谓重渲染）。
 * 在 <html> 上同步 `dark` 类与 `color-scheme`，供 Tailwind dark: 与全局暗色样式使用。
 * 首屏由 index.html 中同规则的内联脚本提前应用，避免挂载前闪白。
 */
export function ThemeModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(timeBasedMode)
  // 用户手动覆盖：非 null 时优先于时间判定；刷新后随组件重建归零
  const overrideRef = useRef<ThemeMode | null>(null)
  // 镜像最新的已提交 mode，供 toggle 读取，避免闭包取到过期值
  const modeRef = useRef<ThemeMode>(mode)
  useEffect(() => {
    modeRef.current = mode
  }, [mode])

  // 绘制前同步切换 DOM 类，保证切换即时生效且不出现浅/深闪烁的一帧
  useLayoutEffect(() => {
    const el = document.documentElement
    const dark = mode === "dark"
    el.classList.toggle("dark", dark)
    el.style.colorScheme = dark ? "dark" : "light"
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute("content", dark ? "#0b1a20" : "#12303B")
  }, [mode])

  // 无手动覆盖时，按本地时间持续校准昼夜；仅在跨阈值时变更 mode
  useEffect(() => {
    const sync = () => {
      if (overrideRef.current != null) return
      const next = timeBasedMode()
      setMode((prev) => (prev === next ? prev : next))
    }
    sync()
    const id = window.setInterval(sync, 30_000)
    return () => window.clearInterval(id)
  }, [])

  const toggle = () => {
    const next: ThemeMode = modeRef.current === "light" ? "dark" : "light"
    overrideRef.current = next
    setMode(next)
  }

  return (
    <ThemeModeContext.Provider value={{ mode, resolved: mode, toggle }}>
      {children}
    </ThemeModeContext.Provider>
  )
}

export function useThemeMode(): ThemeModeValue {
  const ctx = useContext(ThemeModeContext)
  if (!ctx) throw new Error("useThemeMode 必须在 ThemeModeProvider 内使用")
  return ctx
}
