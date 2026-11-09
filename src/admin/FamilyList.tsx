import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { ExternalLink, EyeOff, Loader2, Lock, Pencil, Plus, Users } from "lucide-react"
import { Seal } from "@/components/site/Seal"
import { useAuth } from "@/lib/admin-context"
import { useFamily } from "@/lib/family-context"
import { formatDate, VISIBILITY_LABEL, type FamilySummary } from "@/lib/types"
import { cn } from "@/lib/utils"

export default function FamilyList() {
  const { families, loading, reload, selectFamily } = useFamily()
  const { user } = useAuth()
  const isSuper = user?.role === "super"
  const [rows, setRows] = useState<FamilySummary[]>([])

  useEffect(() => {
    setRows(families)
  }, [families])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10.5px] tracking-[0.3em] text-gold-700">家族</p>
          <h1 className="mt-2 font-song text-[26px] tracking-[0.12em] text-ink-800">家族管理</h1>
          <p className="mt-2 text-[12px] tracking-[0.06em] text-muted-foreground">
            每一部族谱独立成帙，成员、源流与访问口令互不相通。
          </p>
        </div>
        {isSuper ? (
          <Link
            to="/admin/families/new"
            className="rounded-[8px] inline-flex items-center gap-1.5 bg-ink-800 px-4 py-2.5 text-[12px] tracking-[0.12em] text-paper-50 transition-colors hover:bg-ink-700"
          >
            <Plus className="size-3.5" />
            新建族谱
          </Link>
        ) : null}
      </div>

      {loading ? (
        <div className="flex justify-center py-24">
          <Loader2 className="size-5 animate-spin text-ink-400" />
        </div>
      ) : rows.length === 0 ? (
        <div className="border rounded-[14px] border-paper-300 bg-paper-50 px-6 py-16 text-center">
          <p className="font-song text-[17px] tracking-[0.12em] text-ink-700">尚无族谱</p>
          <p className="mt-3 text-[12px] text-muted-foreground">
            新建第一部族谱后，即可录入族人与源流。
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {rows.map((family) => (
            <article
              key={family.id}
              className="flex flex-wrap items-start justify-between gap-5 rounded-[14px] border border-paper-300 bg-paper-50 px-6 py-5 transition-colors hover:border-ink-400/50"
            >
              <div className="flex min-w-0 flex-1 items-start gap-4">
                <Seal char={family.surname?.[0] ?? "族"} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate font-song text-[19px] tracking-[0.12em] text-ink-800">
                      {family.name || `${family.tag}族谱`}
                    </h2>
                    {family.isPrimary ? (
                      <span className="rounded-[8px] border border-gold-600/40 px-1.5 py-0.5 text-[10px] tracking-[0.1em] text-gold-700">
                        主谱
                      </span>
                    ) : null}
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 border px-1.5 py-0.5 text-[10px] tracking-[0.1em]",
                        family.visibility === "public"
                          ? "border-ink-800/15 text-ink-600"
                          : "border-seal-600/30 text-seal-600",
                      )}
                    >
                      {family.visibility !== "public" ? <Lock className="size-2.5" /> : null}
                      {VISIBILITY_LABEL[family.visibility]}
                      {family.visibility === "password" && !family.hasPassword ? "（未设口令）" : ""}
                    </span>
                    {!family.isPublished ? (
                      <span className="inline-flex items-center gap-1 border border-ink-400/40 px-1.5 py-0.5 text-[10px] tracking-[0.1em] text-muted-foreground">
                        <EyeOff className="size-2.5" />
                        前台关闭
                      </span>
                    ) : null}
                  </div>

                  <p className="mt-2 text-[11.5px] tracking-[0.08em] text-muted-foreground">
                    /t/{family.slug}
                    <span className="px-2 text-paper-400">|</span>
                    {family.tag}
                    {family.hallName ? ` · ${family.hallName}` : ""}
                    {family.county ? ` · ${family.county}` : ""}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[12.5px] tracking-[0.08em] text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <Users className="size-3" />
                      {family.memberCount} 人
                    </span>
                    <span>{formatDate(family.updatedAt)} 修</span>
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {family.isPublished ? (
                  <a
                    href={`/t/${encodeURIComponent(family.slug)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="在新标签页打开前台"
                    className="inline-flex items-center gap-1.5 rounded-[8px] border border-paper-300 px-3 py-2 text-[11.5px] tracking-[0.1em] text-ink-700 transition-colors hover:border-ink-400"
                  >
                    <ExternalLink className="size-3" />
                    前台
                  </a>
                ) : (
                  <span
                    title="前台展示已关闭：门户不列出，地址访问按不存在处理"
                    className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-[8px] border border-paper-200 px-3 py-2 text-[11.5px] tracking-[0.1em] text-muted-foreground/60"
                  >
                    <EyeOff className="size-3" />
                    前台隐藏
                  </span>
                )}
                <Link
                  to={`/admin/members?familyId=${family.id}`}
                  onClick={() => selectFamily(family.id)}
                  className="inline-flex items-center gap-1.5 rounded-[8px] border border-paper-300 px-3 py-2 text-[11.5px] tracking-[0.1em] text-ink-700 transition-colors hover:border-ink-400"
                >
                  <Users className="size-3" />
                  族人
                </Link>
                <Link
                  to={`/admin/families/${family.id}`}
                  className="rounded-[8px] inline-flex items-center gap-1.5 bg-ink-800 px-3 py-2 text-[11.5px] tracking-[0.1em] text-paper-50 transition-colors hover:bg-ink-700"
                >
                  <Pencil className="size-3" />
                  编辑
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => void reload()}
        className="text-[11.5px] tracking-[0.14em] text-muted-foreground transition-colors hover:text-ink-700"
      >
        刷新列表
      </button>
    </div>
  )
}
