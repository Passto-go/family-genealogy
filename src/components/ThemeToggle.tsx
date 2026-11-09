import { Moon, Sun } from "lucide-react"
import { useThemeMode } from "./ThemeModeProvider"
import { cn } from "@/lib/utils"

/**
 * 单一切换按钮：按当前时区昼夜判定显示「切换到另一模式」的图标。
 * 日间 → 显示夜间（月亮）按钮；夜间 → 显示日间（太阳）按钮。
 * variant="dark" 用于深色背景（公开页头 / 后台侧栏），variant="light" 用于浅色背景（后台移动端头）。
 */
export function ThemeToggle({ variant = "dark", className }: { variant?: "dark" | "light"; className?: string }) {
  const { mode, toggle } = useThemeMode()

  // 当前为日间则显示「去夜间」的月亮；当前为夜间则显示「去日间」的太阳
  const Icon = mode === "light" ? Moon : Sun
  const label = mode === "light" ? "切换至夜间模式" : "切换至日间模式"

  const triggerTone =
    variant === "light"
      ? "text-ink-600 hover:bg-paper-100 hover:text-ink-800"
      : "text-paper-50/55 hover:bg-white/10 hover:text-paper-50"

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={toggle}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-full transition-colors",
        triggerTone,
        className,
      )}
    >
      <Icon className="size-4" strokeWidth={1.6} />
    </button>
  )
}
