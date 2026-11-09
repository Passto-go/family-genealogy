import { useEffect, useMemo, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { ArrowRight, BookOpen, Loader2, ScrollText, Users } from "lucide-react"
import { SectionHeading } from "@/components/site/SectionHeading"
import { Reveal } from "@/components/site/Reveal"
import { useExtendedLineage } from "@/lib/lineage-preference"
import { useTenant } from "@/lib/tenant-context"
import { api } from "@/lib/api"
import { RadialChart } from "@/components/tree/RadialChart"
import { computeVisibleLineageIds, toChineseNumber, type Member } from "@/lib/types"

export default function Home() {
  const { slug = "" } = useParams<{ slug: string }>()
  const { family, stats, path } = useTenant()

  // 首页全景仅需「名号」，单独按需拉取；密码族谱会 401，静默转为占位，不影响首页其它内容
  const [panorama, setPanorama] = useState<{
    state: "idle" | "ready" | "locked"
    members: Member[]
  }>({ state: "idle", members: [] })
  useEffect(() => {
    let cancelled = false
    setPanorama({ state: "idle", members: [] })
    api
      .getTenantMembers(slug)
      .then((data) => {
        if (!cancelled) setPanorama({ state: "ready", members: data.members })
      })
      .catch(() => {
        if (!cancelled) setPanorama({ state: "locked", members: [] })
      })
    return () => {
      cancelled = true
    }
  }, [slug])

  // 与世系图共用访客侧的展示范围选择（本地记忆）
  const [showExtended] = useExtendedLineage(family?.id)
  // 扇形全景仅展示当前可见集合（关闭时仅本族血脉；开启时血脉 + 两层外衍）
  const visiblePanoramaMembers = useMemo(
    () =>
      panorama.members.filter((m) =>
        computeVisibleLineageIds(panorama.members, showExtended).has(m.id),
      ),
    [panorama.members, showExtended],
  )

  const surname = family?.surname?.[0] ?? "族"
  const introParagraphs = (family?.intro ?? "").split("\n").filter((p) => p.trim())
  const mottoLines = (family?.motto ?? "").split("\n").filter((p) => p.trim())
  const poem = Array.from((family?.generationPoem ?? "").replace(/[·•、，,\s]/g, ""))
  const poemCharCount = poem.join("").length

  // 人数口径与扇形全景同源：开启外衍后一并计入，避免与图中人数不一致
  const memberCount =
    panorama.state === "ready" ? visiblePanoramaMembers.length : (stats?.memberCount ?? null)

  const metrics = [
    { value: stats ? String(stats.generationCount) : "—", unit: "世", label: "世系相承" },
    { value: memberCount != null ? String(memberCount) : "—", unit: "人", label: "收录族人" },
    { value: poemCharCount > 0 ? String(poemCharCount) : "—", unit: "派", label: "字辈派别" },
    { value: family?.foundedYear || "—", unit: "", label: "始迁立谱" },
  ]

  return (
    <div>
      {/* ── Hero ── */}
      <section className="relative flex min-h-[78vh] items-center overflow-hidden bg-ink-800 text-paper-50">
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
          className="pointer-events-none absolute right-[-2%] top-1/2 -translate-y-1/2 select-none font-song text-[clamp(280px,40vw,520px)] leading-[0.8] text-white/[0.055]"
        >
          {surname}
        </span>

        <div className="relative mx-auto flex w-full max-w-[1280px] flex-col items-center px-6 py-28">
          <div className="flex items-center gap-3.5 text-[13px] tracking-[0.5em] text-paper-50/50">
            <span className="h-px w-[34px] bg-gold-600" />
            谱牒
            <span className="h-px w-[34px] bg-gold-600" />
          </div>

          <h1 className="mt-[26px] text-center font-song text-[clamp(44px,6.5vw,84px)] leading-[1.05] tracking-[0.12em]">
            {family?.name || "家族族谱"}
          </h1>

          {family?.hallName ? (
            <div className="mt-[22px] flex items-center gap-4">
              <span className="h-px w-10 bg-gold-600/50" />
              <span className="font-song text-[clamp(15px,1.6vw,19px)] tracking-[0.42em] text-gold-600">
                {family.hallName}
              </span>
              <span className="h-px w-10 bg-gold-600/50" />
            </div>
          ) : null}

          <p className="mt-[18px] max-w-2xl text-center text-[14px] leading-[2.1] tracking-[0.16em] text-paper-50/50">
            {[
              family?.county ? `郡望 ${family.county}` : "",
              family?.originPlace ? `世居 ${family.originPlace}` : "",
              family?.foundedYear ? `始迁 ${family.foundedYear}` : "",
            ]
              .filter(Boolean)
              .join("　·　")}
          </p>

          <div className="mt-[38px] flex flex-col items-stretch gap-3.5 sm:flex-row sm:items-center">
            <Link
              to={path("/genealogy")}
              className="rounded-[8px] group inline-flex items-center justify-center gap-2 bg-gold-600 px-[30px] py-[13px] text-[13px] tracking-[0.2em] text-ink-900 transition-colors hover:bg-gold-500"
            >
              查阅世系
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              to={path("/literature")}
              className="rounded-[8px] inline-flex items-center justify-center gap-2 border border-paper-50/30 px-[30px] py-[13px] text-[13px] tracking-[0.2em] text-paper-50/90 transition-colors hover:border-paper-50 hover:bg-white/[0.06]"
            >
              家族源流
            </Link>
          </div>
        </div>
      </section>

      {/* ── 数据条 ── */}
      <section className="bg-paper-300">
        <Reveal className="mx-auto grid max-w-[1280px] grid-cols-2 gap-px border border-paper-300 bg-paper-300 md:grid-cols-4">
          {metrics.map((metric) => (
            <div
              key={metric.label}
              className="flex flex-col items-center gap-2 bg-paper-50 px-5 py-9"
            >
              <div className="flex items-baseline gap-1.5">
                <span className="font-song text-[clamp(34px,4vw,46px)] leading-none tracking-[0.04em] text-ink-800">
                  {metric.value}
                </span>
                {metric.unit ? (
                  <span className="text-[13px] tracking-[0.1em] text-muted-foreground">{metric.unit}</span>
                ) : null}
              </div>
              <span className="mt-3 text-[12.5px] tracking-[0.24em] text-muted-foreground">{metric.label}</span>
            </div>
          ))}
        </Reveal>
      </section>

      {/* ── 世家源流 ── */}
      <section className="mx-auto max-w-[1280px] px-6 py-20 sm:py-28">
        <div className="grid gap-7 lg:grid-cols-[240px_1fr] lg:gap-[56px]">
          <div className="lg:sticky lg:top-[90px] lg:self-start">
            <SectionHeading eyebrow="源流" title="世家源流" />
            {family?.founderName ? (
              <div className="mt-7 border-l-2 border-gold-600/40 pl-4">
                <p className="text-[12.5px] tracking-[0.24em] text-muted-foreground">始迁祖</p>
                <p className="mt-2 font-song text-[18px] tracking-[0.12em] text-ink-800">
                  {family.founderName}
                </p>
              </div>
            ) : null}
          </div>

          <div className="space-y-6 text-[14.5px] leading-[2.15] text-ink-700 sm:text-[15px]">
            {introParagraphs.length > 0 ? (
              introParagraphs.map((paragraph, index) => (
                <p key={index} className="indent-8 text-justify">
                  {paragraph}
                </p>
              ))
            ) : (
              <p className="text-muted-foreground">
                尚未录入家族简介。可于后台「家族信息」中补充源流、郡望与迁徙始末。
              </p>
            )}

            <div className="flex flex-wrap gap-x-8 gap-y-3 border-t border-paper-300 pt-8 text-[12px] tracking-[0.1em] text-muted-foreground">
              <span>郡望　{family?.county || "—"}</span>
              <span>祖籍　{family?.originPlace || "—"}</span>
              <span>堂号　{family?.hallName || "—"}</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── 家训 ── */}
      {mottoLines.length > 0 ? (
        <section className="relative overflow-hidden bg-ink-800 text-paper-50">
          <Reveal className="mx-auto max-w-[1280px] px-6 py-20 sm:py-28">
            <div className="flex flex-col items-center">
              <SectionHeading align="center" tone="light" eyebrow="家训" />
              <div className="mt-10 space-y-5 text-center sm:space-y-6">
                {mottoLines.slice(0, 4).map((line, index) => (
                  <p
                    key={index}
                    className="font-song text-[18px] leading-[1.9] tracking-[0.18em] text-paper-50/90 sm:text-[23px] sm:tracking-[0.22em]"
                  >
                    {line}
                  </p>
                ))}
              </div>
              <div className="mt-12 h-px w-16 bg-gold-600/40" />
              <Link
                to={path("/literature")}
                className="mt-6 inline-flex items-center gap-1.5 text-[12px] tracking-[0.2em] text-paper-50/45 transition-colors hover:text-gold-500"
              >
                恭读家规全文
                <ArrowRight className="size-3" />
              </Link>
            </div>
          </Reveal>
        </section>
      ) : null}

      {/* ── 世系概览 ── */}
      <section className="mx-auto max-w-[1280px] px-6 py-20 sm:py-28">
        <SectionHeading
          align="center"
          eyebrow="世系"
          title="昭穆有序"
          description="自始迁祖以下，世次相承。点击任一世代，可于世系图中定位查阅。"
        />

        <Reveal className="mt-12 grid grid-cols-2 gap-[18px] lg:grid-cols-4">
          {(stats?.generations ?? []).map((entry) => (
            <Link
              key={entry.generation}
              to={path(`/genealogy?generation=${entry.generation}`)}
              className="group flex items-center justify-between rounded-[14px] border border-[rgba(18,48,59,0.08)] bg-paper-50 px-6 py-[26px] transition-all hover:-translate-y-1.5 hover:border-gold-600/40 hover:shadow-[0_22px_44px_-20px_rgba(12,33,41,0.32)]"
            >
              <div>
                <p className="font-song text-[20px] tracking-[0.12em] text-ink-800">
                  第{toChineseNumber(entry.generation)}世
                </p>
                <p className="mt-1.5 text-[13px] tracking-[0.14em] text-muted-foreground">
                  {entry.count} 人
                </p>
              </div>
              <ArrowRight className="size-4 -translate-x-1 text-ink-300 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
            </Link>
          ))}
        </Reveal>

        {poem.length > 0 ? (
          <Reveal className="mt-16 border border-paper-300 bg-paper-100 px-9 py-9">
            <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-center sm:gap-10">
              <div className="flex items-center gap-2.5">
                <ScrollText className="size-3.5 text-gold-700" />
                <span className="text-[12.5px] tracking-[0.3em] text-gold-700">字辈派语</span>
              </div>
              <div className="flex flex-wrap justify-center gap-x-6 gap-y-3">
                {poem.map((word, index) => (
                  <span
                    key={`${word}-${index}`}
                    className="font-song text-[17px] tracking-[0.14em] text-ink-700"
                  >
                    {word}
                  </span>
                ))}
              </div>
            </div>
          </Reveal>
        ) : null}
      </section>

      {/* ── 世系全景 ── */}
      <section className="mx-auto max-w-[1280px] px-6 py-20 sm:py-28">
        <SectionHeading
          align="center"
          eyebrow="全景"
          title="世系如环"
          description="全族结构一览，名号环列如星。点击进入完整世系图查阅生平、婚配与子嗣。"
        />

        <Reveal className="mt-12">
          {panorama.state === "ready" && panorama.members.length > 0 ? (
            <Link
              to={path("/genealogy")}
              className="mx-auto block w-full max-w-[640px] rounded-lg bg-paper-50/60 p-4 transition-colors hover:shadow-card"
            >
              <RadialChart members={visiblePanoramaMembers} family={family} />
            </Link>
          ) : panorama.state === "locked" ? (
            <div className="mx-auto flex max-w-[640px] flex-col items-center gap-3 rounded-lg border border-dashed border-paper-400 bg-paper-50/60 px-6 py-16 text-center">
              <p className="font-song text-[17px] tracking-[0.14em] text-ink-700">此谱设有访问口令</p>
              <p className="text-[12.5px] leading-relaxed text-muted-foreground">解锁后可于此查看世系全景。</p>
              <Link
                to={path("/genealogy")}
                className="mt-2 inline-flex items-center gap-1.5 text-[11.5px] tracking-[0.2em] text-ink-600 hover:text-ink-800"
              >
                前往解锁
                <ArrowRight className="size-3" />
              </Link>
            </div>
          ) : (
            <div className="mx-auto flex max-w-[640px] items-center justify-center rounded-lg border border-paper-300 bg-paper-50/60 px-6 py-20">
              <Loader2 className="size-4 animate-spin text-ink-400" />
            </div>
          )}
        </Reveal>
      </section>

      {/* ── 入口 ── */}
      <section className="bg-paper-300">
        <Reveal className="mx-auto grid max-w-[1280px] grid-cols-1 gap-px border border-paper-300 bg-paper-300 sm:grid-cols-2">
          <Link
            to={path("/genealogy")}
            className="group flex flex-col gap-3.5 bg-paper-100 px-12 py-12 transition-colors hover:bg-paper-50"
          >
            <span className="inline-flex size-[34px] items-center justify-center rounded-[6px] bg-[rgba(18,48,59,0.08)] text-ink-600">
              <Users className="size-[18px]" />
            </span>
            <span className="font-song text-[22px] tracking-[0.14em] text-ink-800">世系图谱</span>
            <span className="text-[13px] leading-relaxed text-muted-foreground">
              缩放查阅七世族系，点选族人可见生平、婚配与子嗣。
            </span>
            <span className="mt-2 inline-flex items-center gap-1.5 text-[12px] tracking-[0.2em] text-ink-600 transition-all group-hover:text-gold-500 group-hover:tracking-[0.26em]">
              进入
              <ArrowRight className="size-3 transition-transform group-hover:translate-x-1" />
            </span>
          </Link>

          <Link
            to={path("/literature")}
            className="group flex flex-col gap-3.5 bg-paper-100 px-12 py-12 transition-colors hover:bg-paper-50"
          >
            <span className="inline-flex size-[34px] items-center justify-center rounded-[6px] bg-[rgba(18,48,59,0.08)] text-ink-600">
              <BookOpen className="size-[18px]" />
            </span>
            <span className="font-song text-[22px] tracking-[0.14em] text-ink-800">家族文献</span>
            <span className="text-[13px] leading-relaxed text-muted-foreground">
              谱序、家训、家规与字辈派语，一族精神所系。
            </span>
            <span className="mt-2 inline-flex items-center gap-1.5 text-[12px] tracking-[0.2em] text-ink-600 transition-all group-hover:text-gold-500 group-hover:tracking-[0.26em]">
              阅读
              <ArrowRight className="size-3 transition-transform group-hover:translate-x-1" />
            </span>
          </Link>
        </Reveal>
      </section>
    </div>
  )
}
