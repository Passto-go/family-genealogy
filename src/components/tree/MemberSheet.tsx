import { useMemo } from "react"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { MemberAvatar } from "@/components/MemberAvatar"
import { generationLabel, lifeSpan, type Member } from "@/lib/types"

interface MemberSheetProps {
  member: Member | null
  members: Member[]
  onOpenChange: (open: boolean) => void
  onNavigate: (member: Member) => void
}

function InfoRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null
  return (
    <div className="flex items-start justify-between gap-6 border-b border-paper-200 py-2.5 last:border-0">
      <span className="shrink-0 text-[12.5px] tracking-[0.2em] text-muted-foreground">{label}</span>
      <span className="text-right text-[12.5px] leading-relaxed text-ink-800">{value}</span>
    </div>
  )
}

function RelationRow({
  label,
  name,
  meta,
  onClick,
  items,
}: {
  label: string
  name?: string
  meta?: string
  onClick?: () => void
  /** 多值关系（如子嗣）逐项渲染为独立可点条目，与单值关系区分操作入口 */
  items?: { name: string; meta?: string; onClick?: () => void }[]
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-paper-200 py-2.5 last:border-0">
      <span className="shrink-0 text-[12.5px] tracking-[0.2em] text-muted-foreground">{label}</span>
      {items && items.length > 0 ? (
        <div className="flex flex-wrap justify-end gap-x-3 gap-y-1 text-right">
          {items.map((item, index) => (
            <button
              key={index}
              type="button"
              onClick={item.onClick}
              className="group inline-flex items-baseline gap-1 underline-offset-4 hover:text-gold-700 hover:underline"
            >
              <span className="text-[13px] text-ink-800">{item.name}</span>
              {item.meta ? (
                <span className="text-[10px] text-muted-foreground">{item.meta}</span>
              ) : null}
            </button>
          ))}
        </div>
      ) : onClick ? (
        <button type="button" onClick={onClick} className="group flex items-baseline gap-2 text-right">
          <span className="text-[13px] text-ink-800 underline-offset-4 group-hover:text-gold-700 group-hover:underline">
            {name}
          </span>
          {meta ? <span className="text-[10px] text-muted-foreground">{meta}</span> : null}
        </button>
      ) : (
        <span className="text-[13px] text-ink-400">{name}</span>
      )}
    </div>
  )
}

export function MemberSheet({ member, members, onOpenChange, onNavigate }: MemberSheetProps) {
  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])

  const relations = useMemo(() => {
    if (!member) return { father: null, mother: null, spouse: null, children: [] as Member[] }
    return {
      father: member.fatherId ? (byId.get(member.fatherId) ?? null) : null,
      mother: member.motherId ? (byId.get(member.motherId) ?? null) : null,
      // 配偶、子嗣始终完整展示，不受「出嫁女子后裔」开关影响；
      // 该开关只控制画布页面层的节点展示，不得改动详情内容。
      spouse: member.spouseId ? (byId.get(member.spouseId) ?? null) : null,
      children: members
        .filter((m) => m.fatherId === member.id || m.motherId === member.id)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id),
    }
  }, [member, members, byId])

  return (
    <Sheet open={Boolean(member)} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 border-l-paper-300 p-0 sm:max-w-[430px] [&>button]:text-paper-50/60 [&>button:hover]:text-paper-50"
      >
        {member ? (
          <div className="flex h-full flex-col overflow-hidden">
            <div className="relative shrink-0 bg-ink-800 ink-texture px-5 pb-6 pt-8 text-paper-50 sm:px-7">
              <SheetTitle asChild>
                <div className="flex items-center gap-5">
                  <MemberAvatar member={member} size={84} className="shrink-0" />
                  <div className="min-w-0 flex-1">
                    <SheetDescription className="text-[10px] tracking-[0.3em] text-paper-50/45">
                      {generationLabel(member.generation)}
                      {member.branch ? "　·　" + member.branch : ""}
                    </SheetDescription>
                    <h2 className="mt-2 truncate font-song text-[30px] leading-tight tracking-[0.1em] text-paper-50">
                      {member.name}
                    </h2>
                  </div>
                </div>
              </SheetTitle>
              <p className="mt-5 border-t border-paper-50/10 pt-3.5 text-[12px] leading-relaxed tracking-[0.06em] text-paper-50/55">
                {[
                  member.courtesyName ? `字 ${member.courtesyName}` : "",
                  member.title,
                  lifeSpan(member),
                  member.isAlive ? "在世" : "",
                ]
                  .filter(Boolean)
                  .join("　·　")}
              </p>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-7">
              <section>
                <h3 className="text-[12.5px] tracking-[0.28em] text-gold-700">行实</h3>
                <div className="mt-3">
                  <InfoRow label="别　名" value={member.courtesyName} />
                  <InfoRow label="性　别" value={member.gender === "female" ? "女" : "男"} />
                  <InfoRow label="生　卒" value={lifeSpan(member)} />
                  <InfoRow label="房　支" value={member.branch} />
                  <InfoRow label="身　份" value={member.title} />
                  <InfoRow label="葬　地" value={member.burialPlace} />
                </div>
              </section>

              <section className="mt-8">
                <h3 className="text-[12.5px] tracking-[0.28em] text-gold-700">亲属</h3>
                <div className="mt-3">
                  <RelationRow
                    label="父"
                    name={relations.father?.name ?? "—"}
                    meta={relations.father ? generationLabel(relations.father.generation) : undefined}
                    onClick={relations.father ? () => onNavigate(relations.father!) : undefined}
                  />
                  <RelationRow
                    label="母"
                    name={relations.mother?.name ?? "—"}
                    meta={relations.mother ? generationLabel(relations.mother.generation) : undefined}
                    onClick={relations.mother ? () => onNavigate(relations.mother!) : undefined}
                  />
                  <RelationRow
                    label={member.gender === "female" ? "夫" : "配"}
                    name={relations.spouse?.name ?? "—"}
                    onClick={relations.spouse ? () => onNavigate(relations.spouse!) : undefined}
                  />
                  <RelationRow
                    label="子　嗣"
                    items={relations.children.map((child) => ({
                      name: child.name,
                      meta: generationLabel(child.generation),
                      onClick: () => onNavigate(child),
                    }))}
                  />
                </div>
              </section>

              {member.bio ? (
                <section className="mt-8">
                  <h3 className="text-[12.5px] tracking-[0.28em] text-gold-700">生平</h3>
                  <p className="mt-3 whitespace-pre-line text-[13px] leading-[2.05] text-ink-700">
                    {member.bio}
                  </p>
                </section>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="p-7">
            <SheetTitle className="sr-only">族人档案</SheetTitle>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
