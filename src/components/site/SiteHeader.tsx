import { Fragment, useState } from "react"
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom"
import { BookOpen, Home, Info, Lock, LogIn, Moon, Printer, Sun, type LucideIcon } from "lucide-react"
import { useTenantOptional } from "@/lib/tenant-context"
import { useThemeMode } from "../ThemeModeProvider"
import { cn } from "@/lib/utils"
import { api } from "@/lib/api"
import type { FamilySummary } from "@/lib/types"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Seal } from "./Seal"

export type SiteHeaderVariant = "portal" | "family"

type NavEntry = {
  key: string
  label: string
  icon: LucideIcon
  to?: string
  end?: boolean
  onClick?: () => void
}

/** 「族谱」入口：在门户内滚动到族谱网格，否则先回门户再滚动 */
function useDirectoryNav() {
  const navigate = useNavigate()
  const location = useLocation()
  return () => {
    if (location.pathname === "/") {
      document.getElementById("directory")?.scrollIntoView({ behavior: "smooth" })
    } else {
      navigate("/", { state: { scrollTo: "directory" } })
    }
  }
}

function NavEntry({ entry, itemClass }: { entry: NavEntry; itemClass: string }) {
  if (entry.to) {
    return (
      <NavLink
        to={entry.to}
        end={entry.end}
        className={({ isActive }) =>
          cn(
            itemClass,
            isActive
              ? "text-paper-50 after:absolute after:inset-x-2 after:bottom-0 after:h-[2px] after:bg-gold-600"
              : "text-paper-50/85 hover:text-paper-50",
          )
        }
      >
        {entry.label}
      </NavLink>
    )
  }
  return (
    <button
      type="button"
      onClick={entry.onClick}
      className={cn(itemClass, "text-paper-50/85 hover:text-paper-50")}
    >
      {entry.label}
    </button>
  )
}

/** 世系图入口的无族上下文形态：点击展开族谱列表，选中即直达该族世系图（门禁自动接管） */
function LineageMenu({ itemClass }: { itemClass: string }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [families, setFamilies] = useState<FamilySummary[] | null>(null)

  const ensureLoaded = () => {
    if (families) return
    api
      .listPublicFamilies()
      .then((data) => setFamilies(data.families))
      .catch(() => setFamilies([]))
  }

  const openGenealogy = (slug: string) => {
    setOpen(false)
    navigate(`/t/${encodeURIComponent(slug)}/genealogy`)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) ensureLoaded()
      }}
    >
      <PopoverTrigger asChild>
        <button type="button" className={cn(itemClass, "text-paper-50/85 hover:text-paper-50")}>
          世系图
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={10} className="w-64 p-2">
        {families == null ? (
          <p className="px-3 py-8 text-center text-[12px] tracking-[0.08em] text-muted-foreground">
            读取中…
          </p>
        ) : families.length === 0 ? (
          <p className="px-3 py-8 text-center text-[12px] tracking-[0.08em] text-muted-foreground">
            暂无已收录族谱
          </p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {families.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => openGenealogy(item.slug)}
                className="flex items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-paper-100"
              >
                <Seal char={item.surname?.[0] ?? "族"} size={30} tone="gold" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-song text-[14px] tracking-[0.08em] text-ink-800">
                    {item.name || `${item.tag}族谱`}
                  </span>
                  <span className="truncate text-[11px] tracking-[0.12em] text-muted-foreground">
                    {[item.hallName, item.county].filter(Boolean).join("　·　") || "堂号未录"}
                  </span>
                </span>
                {item.hasPassword ? (
                  <Lock
                    className="size-3.5 shrink-0 text-gold-600"
                    strokeWidth={1.8}
                    aria-label="设访问口令"
                  />
                ) : null}
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

export function SiteHeader({ variant = "portal" }: { variant?: SiteHeaderVariant }) {
  const tenant = useTenantOptional()
  const family = tenant?.family ?? null
  const goDirectory = useDirectoryNav()
  const { mode, toggle } = useThemeMode()
  const isFamily = variant === "family"
  // 谱页入口只在族谱上下文出现；手机导航整条隐藏，故手机端改用右侧图标区入口
  const printPath = isFamily ? (tenant?.path("print") ?? null) : null
  // 世系图：族内直达当前族，门户/无族上下文则下拉选族（列表懒加载）
  const lineagePath = isFamily ? (tenant?.path("genealogy") ?? null) : null
  // 图标表示「点击后切换到的模式」：日间显示月亮（可切夜间），夜间显示太阳（可切日间）
  const themeLabel = mode === "light" ? "切换至夜间模式" : "切换至日间模式"

  // 设计稿尺寸：门户 64px/38px 印章/14px 链接；单族 60px/36px 印章/13px 链接
  const navH = isFamily ? "h-[60px]" : "h-16"
  const sealSize = isFamily ? 36 : 38
  const linkPad = isFamily ? "px-[13px]" : "px-3.5"
  const itemClass = cn(
    "relative inline-flex items-center whitespace-nowrap py-2 text-[13px] tracking-[0.12em] transition-colors",
    linkPad,
  )

  const entries: NavEntry[] = [
    { key: "home", label: "首页", icon: Home, to: "/", end: true },
    { key: "genealogy", label: "族谱", icon: BookOpen, onClick: goDirectory },
    { key: "about", label: "关于", icon: Info, to: "/about" },
  ]

  const brand = family ? (
    <Link to={tenant!.path()} className="group flex min-w-0 items-center text-paper-50">
      <Seal char={family.surname || "族"} size={sealSize} tone="gold" />
    </Link>
  ) : (
    <Link to="/" className="group flex min-w-0 items-center text-paper-50">
      <Seal char="谱" size={sealSize} tone="gold" />
    </Link>
  )

  // 设计稿 nav-ic：两个 32px 圆形按钮，均为 16px 细线图标（尺寸、线宽一致）
  const iconBtnClass =
    "inline-flex size-8 items-center justify-center rounded-full text-paper-50/75 transition-colors hover:bg-white/10 hover:text-paper-50"

  return (
    <header className="site-header sticky top-0 z-40 border-b border-white/10 bg-ink-800">
      <div className={cn("mx-auto flex max-w-[1280px] items-center gap-4 px-7", navH)}>
        {brand}

        {/* 导航入口统一靠右，紧邻日间/夜间模式与后台登录按钮左侧 */}
        <div className="ml-auto flex items-center gap-2.5">
          <nav className="hidden items-center gap-1 md:flex">
            {entries.map((entry) => (
              <Fragment key={entry.key}>
                <NavEntry entry={entry} itemClass={itemClass} />
                {entry.key === "genealogy" ? (
                  lineagePath ? (
                    <NavLink
                      to={lineagePath}
                      className={({ isActive }) =>
                        cn(
                          itemClass,
                          isActive
                            ? "text-paper-50 after:absolute after:inset-x-2 after:bottom-0 after:h-[2px] after:bg-gold-600"
                            : "text-paper-50/85 hover:text-paper-50",
                        )
                      }
                    >
                      世系图
                    </NavLink>
                  ) : (
                    <LineageMenu itemClass={itemClass} />
                  )
                ) : null}
              </Fragment>
            ))}
            {printPath ? (
              // 用 Link 而不是裸 <a>：换部署前缀时裸 href 会丢掉 base
              <Link
                to={printPath}
                target="_blank"
                rel="noopener noreferrer"
                title="谱页（新标签打开，可另存为 PDF）"
                className={cn(itemClass, "text-paper-50/85 hover:text-paper-50")}
              >
                谱页
              </Link>
            ) : null}
          </nav>

          <div className="flex shrink-0 items-center gap-1.5">
            {printPath ? (
              <Link
                to={printPath}
                target="_blank"
                rel="noopener noreferrer"
                title="谱页（另存为 PDF）"
                aria-label="谱页"
                className={cn(iconBtnClass, "md:hidden")}
              >
                <Printer className="size-4" strokeWidth={1.6} />
              </Link>
            ) : null}
            <button
              type="button"
              onClick={toggle}
              title={themeLabel}
              aria-label={themeLabel}
              className={iconBtnClass}
            >
              {mode === "light" ? (
                <Moon className="size-4" strokeWidth={1.6} />
              ) : (
                <Sun className="size-4" strokeWidth={1.6} />
              )}
            </button>
            {/* 只读演示站不提供后台入口：无凭证可登录，暴露入口只会误导访客 */}
            {__DEMO__ ? null : (
              <Link
                to="/admin/login"
                title="管理后台登录"
                aria-label="管理后台登录"
                className={iconBtnClass}
              >
                <LogIn className="size-4" strokeWidth={1.6} />
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
