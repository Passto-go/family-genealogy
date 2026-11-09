import { useEffect, useState } from "react"
import { Link, useLocation } from "react-router-dom"
import { ArrowRight, Loader2, Users } from "lucide-react"
import { Seal } from "@/components/site/Seal"
import { Watermark } from "@/components/site/Watermark"
import { SiteFooter } from "@/components/site/SiteFooter"
import { SiteHeader } from "@/components/site/SiteHeader"
import { Reveal } from "@/components/site/Reveal"
import { api } from "@/lib/api"
import { usePrimaryFiling } from "@/lib/filing"
import { type FamilySummary } from "@/lib/types"

export default function Portal() {
  const [families, setFamilies] = useState<FamilySummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const location = useLocation()
  const { icpNumber, policeNumber } = usePrimaryFiling()

  useEffect(() => {
    api
      .listPublicFamilies()
      .then((data) => setFamilies(data.families))
      .catch(() => setError("族谱总目读取失败，请稍后再试"))
      .finally(() => setLoading(false))
  }, [])

  // 从其他页面通过「族谱」入口回门户时，滚动到族谱网格
  useEffect(() => {
    if ((location.state as { scrollTo?: string } | null)?.scrollTo === "directory") {
      document.getElementById("directory")?.scrollIntoView({ behavior: "smooth" })
    }
  }, [location.state])

  return (
    <div className="min-h-screen bg-paper-50">
      <SiteHeader variant="portal" />
      <Watermark />

      {/* ── Hero：min-height 86vh + 顶部暖光 + 右下暗角 + 可见水印 ── */}
      <section className="relative flex min-h-[86vh] items-center overflow-hidden bg-ink-800 text-paper-50">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_-10%,rgba(201,162,39,0.18),transparent_55%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_60%_at_85%_110%,rgba(18,48,59,0.55),transparent_60%)]"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -right-6 top-1/2 -translate-y-1/2 select-none font-song text-[clamp(300px,42vw,560px)] leading-none text-white/[0.055]"
        >
          谱
        </span>

        <div className="relative mx-auto flex w-full max-w-[1280px] flex-col items-center px-7 py-24">
          <div className="flex items-center gap-3.5 text-[13px] tracking-[0.5em] text-paper-50/50">
            <span className="h-px w-[34px] bg-gold-600" />
            宗族
            <span className="h-px w-[34px] bg-gold-600" />
          </div>

          <h1 className="mt-7 text-center font-song text-[clamp(46px,7.2vw,92px)] leading-[1.05] tracking-[0.14em]">
            族谱总目
          </h1>

          <p className="mt-[26px] max-w-[620px] text-center text-[15px] leading-[2.1] tracking-[0.1em] text-paper-50/60">
            一族一谱，各自成帙。择谱而入，世系凭家族授予的口令启阅。
          </p>

          <div className="mt-10 flex flex-col items-stretch gap-3.5 sm:flex-row sm:items-center sm:justify-center">
            <a
              href="#directory"
              className="rounded-[8px] group inline-flex items-center justify-center gap-2 bg-gold-600 px-[30px] py-[13px] text-[13px] tracking-[0.2em] text-ink-900 transition-colors hover:bg-gold-500"
            >
              浏览族谱
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
            </a>
            <Link
              to="/about"
              className="rounded-[8px] inline-flex items-center justify-center gap-2 border border-paper-50/30 px-[30px] py-[13px] text-[13px] tracking-[0.2em] text-paper-50/90 transition-colors hover:border-paper-50 hover:bg-white/[0.06]"
            >
              了解更多
            </Link>
          </div>
        </div>
      </section>

      {/* ── 族谱网格 ── */}
      <section id="directory" className="mx-auto max-w-[1280px] px-7 py-24">
        <Reveal>
          <div className="flex items-end justify-between border-b border-paper-300 pb-[18px]">
            <div>
              <p className="text-[12px] tracking-[0.36em] text-gold-600">谱牒</p>
              <h2 className="mt-2 font-song text-[30px] tracking-[0.14em] text-ink-800">已收录族谱</h2>
            </div>
            <span className="text-[13px] tracking-[0.12em] text-muted-foreground">
              {loading ? "读取中" : `共 ${families.length} 部`}
            </span>
          </div>
        </Reveal>

        {loading ? (
          <div className="flex justify-center py-24">
            <Loader2 className="size-5 animate-spin text-ink-400" />
          </div>
        ) : error ? (
          <p className="py-20 text-center text-[12.5px] text-seal-600">{error}</p>
        ) : families.length === 0 ? (
          <div className="py-20 text-center">
            <p className="font-song text-[18px] tracking-[0.14em] text-ink-700">尚未建立族谱</p>
            <p className="mt-3 text-[12px] tracking-[0.08em] text-muted-foreground">
              请族谱管理员于后台建立第一部族谱。
            </p>
          </div>
        ) : (
          <Reveal className="mt-[40px] grid gap-[22px] sm:grid-cols-2 lg:grid-cols-3">
            {families.map((family) => {
              const summary = family.intro.split("\n").find((line) => line.trim()) ?? ""
              return (
                <Link
                  key={family.id}
                  to={`/t/${encodeURIComponent(family.slug)}`}
                  className="group flex flex-col gap-4 rounded-[14px] border border-[rgba(18,48,59,0.08)] bg-paper-50 p-7 shadow-[0_1px_2px_rgba(12,33,41,0.04),0_8px_24px_-16px_rgba(12,33,41,0.18)] transition-all duration-300 hover:-translate-y-1.5 hover:border-[rgba(201,162,39,0.5)] hover:shadow-[0_1px_2px_rgba(12,33,41,0.05),0_22px_44px_-20px_rgba(12,33,41,0.32)]"
                >
                  <div className="flex items-start gap-3.5">
                    <Seal char={family.surname?.[0] ?? "族"} size={38} tone="gold" />
                    <div className="min-w-0">
                      <p className="truncate font-song text-[22px] tracking-[0.12em] text-ink-800">
                        {family.name || `${family.tag}族谱`}
                      </p>
                      <p className="mt-1 truncate text-[11px] tracking-[0.2em] text-muted-foreground">
                        {[family.hallName, family.county].filter(Boolean).join("　·　") || "堂号未录"}
                      </p>
                    </div>
                  </div>

                  <p className="line-clamp-2 min-h-[3.4em] text-[13px] leading-[1.9] text-muted-foreground">
                    {summary || "家族源流尚未录入。"}
                  </p>

                  <div className="mt-auto flex items-center justify-between border-t border-paper-200 pt-4 text-[12px] tracking-[0.08em] text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <Users className="size-3" />
                      {family.memberCount} 人
                    </span>
                    <span className="inline-flex items-center gap-1.5 tracking-[0.18em] text-ink-600 transition-colors group-hover:text-gold-500">
                      启阅
                      <ArrowRight className="size-3 transition-transform group-hover:translate-x-1" />
                    </span>
                  </div>
                </Link>
              )
            })}
          </Reveal>
        )}
      </section>

      <SiteFooter icpNumber={icpNumber} policeNumber={policeNumber} />
    </div>
  )
}
