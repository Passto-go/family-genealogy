import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { ArrowRight, GitBranch, Heart, Landmark, Network, Plus, Users } from "lucide-react"
import { Reveal } from "@/components/site/Reveal"
import { api } from "@/lib/api"
import { useFamily } from "@/lib/family-context"
import { formatDate, toChineseNumber, type Stats } from "@/lib/types"

export default function Dashboard() {
  const { family } = useFamily()
  const familyId = family?.id ?? 0
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    if (!familyId) return
    api
      .getStats(familyId)
      .then(setStats)
      .catch(() => setStats(null))
  }, [familyId])

  const spouseCount = stats ? Math.max(0, stats.memberCount - stats.lineageCount) : 0

  const cards = [
    { key: "members", label: "收录族人", value: stats?.memberCount ?? 0, unit: "人", icon: Users },
    { key: "generations", label: "世系世代", value: stats?.generationCount ?? 0, unit: "世", icon: GitBranch },
    { key: "branches", label: "房支", value: stats?.branches.length ?? 0, unit: "房", icon: Network },
    { key: "spouses", label: "配偶记载", value: spouseCount, unit: "位", icon: Heart },
  ]

  const maxBranch = Math.max(1, ...(stats?.branches.map((b) => b.count) ?? [1]))
  const maxGeneration = Math.max(1, ...(stats?.generations.map((g) => g.count) ?? [1]))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-paper-300 pb-[22px]">
        <div>
          <p className="text-[10.5px] tracking-[0.3em] text-gold-600">概览</p>
          <h1 className="mt-2 font-song text-[28px] tracking-[0.12em] text-ink-800 sm:text-[32px]">
            {family?.name || "家族族谱"}
          </h1>
          <p className="mt-2 text-[12px] tracking-[0.06em] text-muted-foreground">
            {[family?.hallName, family?.county, family?.originPlace].filter(Boolean).join("　·　")}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/admin/members/new"
            className="rounded-[8px] inline-flex items-center gap-1.5 bg-gold-600 px-5 py-3 text-[12.5px] tracking-[0.12em] text-ink-900 transition-colors hover:bg-gold-500"
          >
            <Plus className="size-3.5" />
            新增族人
          </Link>
          <Link
            to={`/admin/families/${familyId}`}
            className="inline-flex items-center justify-center gap-1.5 rounded-[8px] border border-paper-300 bg-paper-50 px-5 py-3 text-[12.5px] tracking-[0.12em] text-ink-700 transition-colors hover:border-ink-400 hover:bg-white"
          >
            <Landmark className="size-3.5" />
            家族信息
          </Link>
        </div>
      </div>

      <Reveal className="grid grid-cols-1 gap-[18px] sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon
          return (
            <div
              key={card.key}
              className="flex items-center justify-between gap-3 rounded-[14px] border border-ink-800/10 bg-paper-50 p-[22px] shadow-[0_1px_2px_rgba(12,33,41,0.04),0_8px_24px_-16px_rgba(12,33,41,0.18)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_22px_44px_-20px_rgba(12,33,41,0.3)]"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="inline-flex size-[32px] shrink-0 items-center justify-center rounded-[8px] bg-ink-800/10 text-ink-600">
                  <Icon className="size-4" />
                </span>
                <span className="truncate text-[12.5px] tracking-[0.14em] text-muted-foreground">
                  {card.label}
                </span>
              </div>
              <div className="flex shrink-0 items-baseline gap-1 text-right">
                <span className="font-song text-[clamp(26px,3vw,34px)] leading-none tabular-nums text-ink-800">
                  {card.value}
                </span>
                <span className="text-[13px] text-muted-foreground">{card.unit}</span>
              </div>
            </div>
          )
        })}
      </Reveal>

      <div className="grid gap-[18px] lg:grid-cols-2">
        <Reveal className="rounded-[14px] border border-ink-800/10 bg-paper-50 p-6 shadow-[0_1px_2px_rgba(12,33,41,0.04),0_8px_24px_-16px_rgba(12,33,41,0.16)]">
          <h2 className="text-[13px] tracking-[0.2em] text-ink-700">房支分布</h2>
          <div className="mt-4 space-y-3.5">
            {(stats?.branches ?? []).length === 0 ? (
              <p className="text-[12px] text-muted-foreground">暂无数据</p>
            ) : (
              stats?.branches.map((branch) => (
                <div key={branch.name}>
                  <div className="flex items-baseline justify-between text-[12px]">
                    <span className="tracking-[0.08em] text-ink-700">{branch.name}</span>
                    <span className="text-muted-foreground">{branch.count} 人</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-paper-200">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-ink-600 to-ink-700 dark:from-ink-300 dark:to-ink-400"
                      style={{ width: `${(branch.count / maxBranch) * 100}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </Reveal>

        <Reveal className="rounded-[14px] border border-ink-800/10 bg-paper-50 p-6 shadow-[0_1px_2px_rgba(12,33,41,0.04),0_8px_24px_-16px_rgba(12,33,41,0.16)]">
          <h2 className="text-[13px] tracking-[0.2em] text-ink-700">各世人数</h2>
          {(stats?.generations ?? []).length === 0 ? (
            <p className="mt-4 text-[12px] text-muted-foreground">暂无数据</p>
          ) : (
            <div className="mt-5 flex h-[168px] flex-col">
              {/* 柱高用固定像素，避免百分比在 auto 高度父元素中塌缩为 0 */}
              <div className="flex flex-1 items-end justify-between gap-2 border-b border-paper-200 px-1">
                {stats?.generations.map((generation) => {
                  const barHeight = Math.max(8, Math.round((generation.count / maxGeneration) * 96))
                  return (
                    <div
                      key={generation.generation}
                      className="group flex h-full flex-1 flex-col items-center justify-end gap-1.5"
                    >
                      <span className="text-[10px] tabular-nums text-ink-600">{generation.count}</span>
                      <div
                        className="w-full max-w-[34px] rounded-t-[3px] bg-gradient-to-t from-ink-700 to-ink-600 transition-colors duration-300 group-hover:from-gold-600 group-hover:to-gold-500 dark:from-ink-400 dark:to-ink-300"
                        style={{ height: `${barHeight}px` }}
                      />
                    </div>
                  )
                })}
              </div>
              <div className="mt-2 flex justify-between gap-2 px-1">
                {stats?.generations.map((generation) => (
                  <span
                    key={generation.generation}
                    className="flex-1 text-center text-[9.5px] tracking-[0.06em] text-muted-foreground"
                  >
                    {toChineseNumber(generation.generation)}世
                  </span>
                ))}
              </div>
            </div>
          )}
        </Reveal>
      </div>

      <div className="grid gap-[18px] lg:grid-cols-[1fr_280px]">
        <Reveal className="rounded-[14px] border border-ink-800/10 bg-paper-50 p-6 shadow-[0_1px_2px_rgba(12,33,41,0.04),0_8px_24px_-16px_rgba(12,33,41,0.16)]">
          <h2 className="text-[13px] tracking-[0.2em] text-ink-700">快捷操作</h2>
          <div className="mt-4 divide-y divide-paper-200">
            {[
              { to: "/admin/members", label: "浏览与检索全部族人", icon: Users },
              { to: "/admin/members/new", label: "新增一位族人并绑定亲属", icon: Plus },
              { to: `/admin/families/${familyId}`, label: "修订家族名号、源流与家训", icon: Landmark },
              { to: "/admin/families", label: "管理全部族谱与访问方式", icon: Landmark },
            ].map((item) => {
              const ItemIcon = item.icon
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className="group flex items-center justify-between py-3.5 transition-colors hover:text-ink-800"
                >
                  <span className="flex items-center gap-3 text-[13px] text-ink-700">
                    <span className="inline-flex size-7 items-center justify-center rounded-[7px] bg-ink-800/10 text-muted-foreground">
                      <ItemIcon className="size-3.5" />
                    </span>
                    {item.label}
                  </span>
                  <ArrowRight className="size-3.5 text-muted-foreground transition-all group-hover:translate-x-1 group-hover:text-gold-600" />
                </Link>
              )
            })}
          </div>
        </Reveal>

        <Reveal className="rounded-[14px] border border-ink-800/10 bg-paper-50 p-6 shadow-[0_1px_2px_rgba(12,33,41,0.04),0_8px_24px_-16px_rgba(12,33,41,0.16)]">
          <h2 className="text-[13px] tracking-[0.2em] text-ink-700">谱牒信息</h2>
          <dl className="mt-4 divide-y divide-paper-200 text-[12px]">
            <div className="flex justify-between gap-3 py-2.5">
              <dt className="text-muted-foreground">始迁祖</dt>
              <dd className="text-ink-800">{family?.founderName || "—"}</dd>
            </div>
            <div className="flex justify-between gap-3 py-2.5">
              <dt className="text-muted-foreground">始迁年代</dt>
              <dd className="text-ink-800">{family?.foundedYear || "—"}</dd>
            </div>
            <div className="flex justify-between gap-3 py-2.5">
              <dt className="text-muted-foreground">最近更新</dt>
              <dd className="text-ink-800">{formatDate(stats?.updatedAt ?? "")}</dd>
            </div>
          </dl>
          <a
            href={family ? `/t/${encodeURIComponent(family.slug)}/genealogy` : "/"}
            target="_blank"
            rel="noopener noreferrer"
            title="在新标签页打开前台世系图"
            className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-[8px] border border-paper-300 bg-paper-50 py-2.5 text-[11.5px] tracking-[0.14em] text-ink-700 transition-colors hover:border-ink-400 hover:bg-white"
          >
            查看前台世系图
            <ArrowRight className="size-3" />
          </a>
        </Reveal>
      </div>
    </div>
  )
}
