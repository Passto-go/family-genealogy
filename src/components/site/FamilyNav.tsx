import { NavLink } from "react-router-dom"
import { BookOpen, FileText, Home, type LucideIcon } from "lucide-react"
import { useTenant } from "@/lib/tenant-context"
import { cn } from "@/lib/utils"

type FamilyEntry = {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

/** 族内子导航（方案 A）：主头部下方常驻的浅色二级导航，承载本族四项入口 */
export function FamilyNav() {
  const { path } = useTenant()
  const items: FamilyEntry[] = [
    { to: path(), label: "本族首页", icon: Home, end: true },
    { to: path("/genealogy"), label: "世系图", icon: BookOpen },
    { to: path("/literature"), label: "家族文献", icon: FileText },
  ]

  return (
    <nav className="sticky top-16 z-30 border-b border-paper-300 bg-paper-50/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1320px] items-center gap-0.5 overflow-x-auto px-4 sm:gap-1 sm:px-8">
        {items.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "relative inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap px-2 py-3 text-[12px] tracking-[0.06em] transition-colors sm:px-4 sm:text-[13px] sm:tracking-[0.12em]",
                  isActive
                    ? "text-ink-800 after:absolute after:inset-x-2 after:bottom-0 after:h-[2px] after:bg-gold-600"
                    : "text-ink-600 hover:text-ink-800",
                )
              }
            >
              <Icon className="size-3.5" />
              {item.label}
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
