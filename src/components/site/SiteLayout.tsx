import { Link, Outlet } from "react-router-dom"
import { ArrowLeft, Loader2, ShieldAlert } from "lucide-react"
import { useTenant } from "@/lib/tenant-context"
import { Watermark } from "./Watermark"
import { SiteFooter } from "./SiteFooter"
import { SiteHeader } from "./SiteHeader"

/** 族谱不存在时的提示页面 */
function MissingFamily() {
  const { slug, error } = useTenant()

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper-100 px-6 py-16">
      <div className="w-full max-w-[440px] border border-paper-300 bg-paper-50 px-8 py-12 text-center shadow-card">
        <ShieldAlert className="mx-auto size-6 text-seal-600" />
        <h1 className="mt-5 font-song text-[24px] tracking-[0.18em] text-ink-800">此谱未见</h1>
        <p className="mt-4 text-[12.5px] leading-[2] text-muted-foreground">
          {error ?? `未找到「${slug}」这一族谱，可能已更名或尚未建立。`}
        </p>
        <Link
          to="/"
          className="mt-8 inline-flex items-center gap-2 border border-ink-800/20 px-5 py-2.5 text-[12px] tracking-[0.16em] text-ink-700 transition-colors hover:border-ink-700 hover:bg-paper-100"
        >
          <ArrowLeft className="size-3.5" />
          返回网站首页
        </Link>
      </div>
    </div>
  )
}

export function SiteLayout() {
  const { status, family } = useTenant()

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper-100">
        <Loader2 className="size-5 animate-spin text-ink-400" />
      </div>
    )
  }

  if (status === "missing") {
    return <MissingFamily />
  }

  return (
    <div className="flex min-h-screen flex-col bg-paper-50">
      <Watermark />
      <SiteHeader variant="family" />
      <main className="flex-1">
        <Outlet />
      </main>
      <SiteFooter
        icpNumber={family?.icpNumber}
        policeNumber={family?.policeNumber}
      />
    </div>
  )
}
