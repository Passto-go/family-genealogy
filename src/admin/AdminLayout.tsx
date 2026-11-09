import { NavLink, Navigate, Outlet, useNavigate } from "react-router-dom"
import {
  Globe,
  Home,
  Inbox,
  Landmark,
  LayoutDashboard,
  Loader2,
  Lock,
  LogOut,
  ScrollText,
  ShieldCheck,
  UserCog,
  Users,
} from "lucide-react"
import { Seal } from "@/components/site/Seal"
import { ThemeToggle } from "@/components/ThemeToggle"
import { useAuth } from "@/lib/admin-context"
import { useFamily } from "@/lib/family-context"
import { cn } from "@/lib/utils"

const BASE_NAV = [
  { to: "/admin", label: "概览", icon: LayoutDashboard, end: true },
  { to: "/admin/families", label: "家族管理", icon: Landmark, end: false },
  { to: "/admin/members", label: "成员管理", icon: Users, end: false },
  { to: "/admin/submissions", label: "反馈审核", icon: Inbox, end: false },
]

// 系统栏目基类：账号安全（改密 / 验证器）对所有管理员开放，权限不因栏目调整而变化
const SYSTEM_COMMON_NAV = [
  { to: "/admin/account", label: "安全设置", icon: ShieldCheck, end: false },
]

// 系统栏目超管专属：站点级配置与账号治理 / 安全审计
const SYSTEM_SUPER_NAV = [
  { to: "/admin/site", label: "网站设置", icon: Globe, end: false },
  { to: "/admin/admins", label: "管理员", icon: UserCog, end: false },
  { to: "/admin/audit", label: "操作日志", icon: ScrollText, end: false },
  { to: "/admin/domains", label: "证书域名", icon: Lock, end: false },
]

export default function AdminLayout() {
  const { user, loading: authLoading, logout, logoutAll } = useAuth()
  const { family, families, loading: familyLoading, selectFamily } = useFamily()
  const navigate = useNavigate()
  const frontPath = family ? `/t/${encodeURIComponent(family.slug)}` : "/"
  const isSuper = user?.role === "super"
  const SYSTEM_NAV = isSuper ? [...SYSTEM_COMMON_NAV, ...SYSTEM_SUPER_NAV] : SYSTEM_COMMON_NAV
  const NAV = [...BASE_NAV, ...SYSTEM_NAV]

  // 统一门禁：认证与族谱数据均就绪前不渲染子页面，避免先显示空/错族数据再跳变的闪烁
  if (authLoading || familyLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper-100">
        <Loader2 className="size-5 animate-spin text-ink-400" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/admin/login" replace />
  }

  // H1：未修改初始密码前不得进入任何后台页面（后端 /api/admin/* 同步强制）
  if (user.mustChangePassword) {
    return <Navigate to="/admin/change-password" replace />
  }

  // 超管未绑定验证器时，强制前往绑定页（后端 /api/admin/* 同步强制）
  if (user.role === "super" && user.mfaType !== "totp") {
    return <Navigate to="/admin/mfa-setup" replace />
  }

  async function handleLogout() {
    await logout()
    navigate("/admin/login", { replace: true })
  }

  return (
    <div className="flex min-h-screen bg-paper-100">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-white/5 bg-ink-800 text-paper-50 lg:flex">
        <div className="flex items-center gap-3 border-b border-white/8 px-5 py-5">
          <Seal char={family?.surname?.[0] ?? "族"} size={34} tone="gold" />
          <div className="min-w-0">
            <p className="truncate font-song text-[14px] tracking-[0.14em]">
              {family?.name || "家族族谱"}
            </p>
            <p className="mt-0.5 text-[9.5px] tracking-[0.24em] text-paper-50/45">管理后台</p>
          </div>
        </div>

        {user.role === "super" && families.length > 1 ? (
          <div className="border-b border-white/8 px-5 py-3">
            <p className="mb-1.5 text-[9.5px] tracking-[0.22em] text-paper-50/35">当前族谱</p>
            <select
              value={family?.id ?? ""}
              onChange={(event) => selectFamily(Number(event.target.value))}
              className="w-full rounded-[8px] border border-white/15 bg-ink-800 px-2 py-1.5 text-[11.5px] tracking-[0.06em] text-paper-50/85 outline-none"
            >
              {families.map((item) => (
                <option key={item.id} value={item.id} className="bg-paper-50 text-ink-800">
                  {item.name || item.tag}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <nav className="flex-1 space-y-4 px-3 py-5">
          <div>
            <p className="px-3 pb-2 pt-3.5 text-[10px] tracking-[0.3em] text-paper-50/40">管理</p>
            {BASE_NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "group flex items-center gap-3 rounded-[9px] px-3 py-2.5 text-[12.5px] tracking-[0.1em] transition-colors",
                    isActive
                      ? "bg-gold-600/15 text-gold-600"
                      : "text-paper-50/62 hover:bg-white/[0.06] hover:text-paper-50",
                  )
                }
              >
                <item.icon className="size-4 opacity-80" />
                {item.label}
              </NavLink>
            ))}
          </div>
          <div>
            <p className="px-3 pb-2 pt-3.5 text-[10px] tracking-[0.3em] text-paper-50/40">系统</p>
            {SYSTEM_NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "group flex items-center gap-3 rounded-[9px] px-3 py-2.5 text-[12.5px] tracking-[0.1em] transition-colors",
                    isActive
                      ? "bg-gold-600/15 text-gold-600"
                      : "text-paper-50/62 hover:bg-white/[0.06] hover:text-paper-50",
                  )
                }
              >
                <item.icon className="size-4 opacity-80" />
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>

        <div className="border-t border-white/8 px-3 py-4">
          <div className="mb-2 flex items-center justify-between px-3">
            <p className="text-[10px] tracking-[0.16em] text-paper-50/30">{user.username}</p>
            <ThemeToggle />
          </div>
          <a
            href={frontPath}
            target="_blank"
            rel="noopener noreferrer"
            title="在新标签页打开前台"
            className="flex items-center gap-3 px-3 py-2 text-[12px] tracking-[0.1em] text-paper-50/50 transition-colors hover:text-paper-50/85"
          >
            <Home className="size-4 opacity-80" />
            返回前台
          </a>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="flex w-full items-center gap-3 px-3 py-2 text-[12px] tracking-[0.1em] text-paper-50/50 transition-colors hover:text-seal-600"
          >
            <LogOut className="size-4 opacity-80" />
            退出登录
          </button>
          <button
            type="button"
            onClick={async () => {
              if (!confirm("将强制下线该账号在所有设备上的会话，确定继续？")) return
              await logoutAll()
              navigate("/admin/login", { replace: true })
            }}
            className="flex w-full items-center gap-3 px-3 py-2 text-[12px] tracking-[0.1em] text-paper-50/50 transition-colors hover:text-seal-600"
          >
            <ShieldCheck className="size-4 opacity-80" />
            退出所有设备
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-paper-300 bg-paper-50/95 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2.5">
              <Seal char={family?.surname?.[0] ?? "族"} size={26} />
              <span className="font-song text-[13px] tracking-[0.14em] text-ink-800">
                管理后台
              </span>
            </div>
            <div className="flex items-center gap-3">
              <a
                href={frontPath}
                target="_blank"
                rel="noopener noreferrer"
                title="在新标签页打开前台"
                className="text-[12.5px] text-muted-foreground"
              >
                前台
              </a>
              <ThemeToggle variant="light" />
              <button
                type="button"
                onClick={() => void handleLogout()}
                className="text-[12.5px] text-muted-foreground"
              >
                退出
              </button>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto border-t border-paper-200 px-3 py-2">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "shrink-0 rounded-[8px] px-3 py-1.5 text-[11.5px] tracking-[0.08em]",
                    isActive ? "bg-ink-800 text-paper-50" : "text-ink-600",
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </header>

        <main className="flex-1 px-4 py-7 sm:px-8 sm:py-9">
          <div className="mx-auto w-full max-w-[1080px]">
            {__DEMO__ ? (
              <p className="mb-5 border border-dashed border-gold-600/40 bg-gold-500/5 px-4 py-2.5 text-[12px] leading-relaxed tracking-[0.04em] text-ink-600">
                只读演示：数据为示例族谱，所有修改操作都会被拒绝。反馈审核、管理员、操作日志、证书域名等页只展示结构与空状态。
              </p>
            ) : null}
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
