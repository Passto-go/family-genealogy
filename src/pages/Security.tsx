import { ShieldCheck } from "lucide-react"
import { Seal } from "@/components/site/Seal"
import {
  generatedAt,
  securityAudits,
  type AuditSeverity,
  type SecurityAudit,
} from "@/data/security-audits"
import { cn } from "@/lib/utils"

const SEVERITY_BADGE: Record<AuditSeverity, string> = {
  高: "border-seal-600/30 bg-seal-100 text-seal-700",
  中: "border-gold-600/30 bg-paper-100 text-gold-700",
  低: "border-paper-300 bg-paper-100 text-muted-foreground",
}

function progressOf(audit: SecurityAudit): number {
  if (audit.found.total === 0) return audit.isFullyFixed ? 100 : 0
  return Math.min(100, Math.round((audit.fixedCount / audit.found.total) * 100))
}

function statusBadge(fixed: boolean) {
  return cn(
    "border px-2 py-1 text-[10.5px] tracking-[0.12em]",
    fixed
      ? "border-ink-600/25 bg-paper-50 text-ink-700"
      : "border-gold-600/30 bg-paper-50 text-gold-700",
  )
}

/** 最近一次审计的完整明细 */
function AuditCard({ audit }: { audit: SecurityAudit }) {
  const progress = progressOf(audit)
  const figures = [
    { label: "发现合计", value: audit.found.total, tone: "text-ink-800" },
    { label: "高危", value: audit.found.high, tone: "text-seal-700" },
    { label: "中危", value: audit.found.medium, tone: "text-gold-700" },
    { label: "低危", value: audit.found.low, tone: "text-muted-foreground" },
  ]

  return (
    <article className="border border-paper-300 bg-paper-50">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-paper-200 bg-paper-100 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="size-4 text-ink-600" />
          <h2 className="font-song text-[16px] tracking-[0.12em] text-ink-800">
            {audit.date} 代码安全审计
          </h2>
        </div>
        <span className={statusBadge(audit.isFullyFixed)}>{audit.status}</span>
      </header>

      <div className="space-y-5 px-5 py-5">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {figures.map((item) => (
            <div key={item.label} className="border border-paper-300 bg-paper-50 px-3 py-3 text-center">
              <p className="text-[10.5px] tracking-[0.16em] text-muted-foreground">{item.label}</p>
              <p className={cn("mt-1 font-song text-[22px] leading-none tabular-nums", item.tone)}>
                {item.value}
              </p>
            </div>
          ))}
        </div>

        <div className="border border-paper-300 bg-paper-50 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-ink-700">
            <span>本批次已完成整改</span>
            <span className="tabular-nums">
              {audit.fixedCount} / {audit.found.total} 项
            </span>
          </div>
          <div className="mt-2.5 h-1.5 w-full bg-paper-200">
            <div className="h-full bg-gold-600" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-2.5 text-[12.5px] leading-[1.9] text-muted-foreground">
            {audit.isFullyFixed
              ? "本批次问题已全部整改完毕，计入 1 次「已完成整改」。"
              : "尚未全部完成，本批次不计入「已完成整改」次数（部分完成不计次）。"}
          </p>
        </div>

        {audit.scope ? (
          <p className="text-[11.5px] leading-[1.9] text-muted-foreground">
            审计范围：{audit.scope}
          </p>
        ) : null}

        <div>
          <h3 className="text-[12.5px] tracking-[0.2em] text-ink-700">漏洞类别明细</h3>
          <ul className="mt-2 divide-y divide-paper-200 border-y border-paper-200">
            {audit.categories.map((category) => (
              <li key={category.name} className="flex items-start justify-between gap-3 py-2.5">
                <div className="flex min-w-0 items-start gap-2">
                  <span
                    className={cn(
                      "mt-0.5 shrink-0 border px-1.5 py-0.5 text-[10px] tracking-[0.1em]",
                      SEVERITY_BADGE[category.severity],
                    )}
                  >
                    {category.severity}
                  </span>
                  <span className="text-[12px] leading-[1.8] text-ink-700">{category.name}</span>
                </div>
                <span className="shrink-0 text-[11.5px] tabular-nums text-muted-foreground">
                  {category.count} 项
                </span>
              </li>
            ))}
          </ul>
        </div>

        <dl className="grid gap-3 sm:grid-cols-3">
          <div className="border border-paper-300 bg-paper-50 px-4 py-3">
            <dt className="text-[10.5px] tracking-[0.18em] text-muted-foreground">预计修复日期</dt>
            <dd className="mt-1 font-song text-[14px] tracking-[0.08em] text-ink-800">
              {audit.plannedFixDate}
            </dd>
          </div>
          <div className="border border-paper-300 bg-paper-50 px-4 py-3">
            <dt className="text-[10.5px] tracking-[0.18em] text-muted-foreground">实际修复日期</dt>
            <dd
              className={cn(
                "mt-1 font-song text-[14px] tracking-[0.08em]",
                audit.actualFixDate ? "text-ink-800" : "text-muted-foreground",
              )}
            >
              {audit.actualFixDate ?? "待修复"}
            </dd>
          </div>
          <div className="border border-paper-300 bg-paper-50 px-4 py-3">
            <dt className="text-[10.5px] tracking-[0.18em] text-muted-foreground">修复时长</dt>
            <dd
              className={cn(
                "mt-1 font-song text-[14px] tracking-[0.08em]",
                audit.isFullyFixed ? "text-ink-800" : "text-muted-foreground",
              )}
            >
              {audit.isFullyFixed ? `${audit.repairDays} 天` : "整改中"}
            </dd>
          </div>
        </dl>

        {audit.note ? (
          <p className="border-l-2 border-paper-300 pl-3 text-[11.5px] leading-[1.9] text-muted-foreground">
            {audit.note}
          </p>
        ) : null}
      </div>
    </article>
  )
}

function Cell({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div>
      <p className="text-[10.5px] tracking-[0.14em] text-muted-foreground sm:hidden">{label}</p>
      <p className={cn("text-[12.5px] tabular-nums", muted ? "text-muted-foreground" : "text-ink-700")}>
        {value}
      </p>
    </div>
  )
}

function HistoryRow({ audit }: { audit: SecurityAudit }) {
  const progress = progressOf(audit)
  return (
    <div className="border-t border-paper-200 px-4 py-4 first:border-t-0 sm:py-3.5">
      <div className="grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-6 sm:items-center">
        <Cell label="审计日期" value={audit.date} />
        <Cell label="发现问题" value={`${audit.found.total} 项`} />
        <Cell label="已完成整改" value={`${audit.fixedCount} 项`} />
        <Cell
          label="实际修复日期"
          value={audit.actualFixDate ?? "待修复"}
          muted={!audit.actualFixDate}
        />
        <Cell
          label="修复时长"
          value={audit.isFullyFixed ? `${audit.repairDays} 天` : "整改中"}
          muted={!audit.isFullyFixed}
        />
        <div>
          <p className="text-[10.5px] tracking-[0.14em] text-muted-foreground sm:hidden">状态</p>
          <span className={statusBadge(audit.isFullyFixed)}>{audit.status}</span>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <div className="h-1 flex-1 bg-paper-200">
          <div className="h-full bg-gold-600" style={{ width: `${progress}%` }} />
        </div>
        <span className="shrink-0 text-[10.5px] tabular-nums text-muted-foreground">
          {audit.fixedCount}/{audit.found.total} · {progress}%
        </span>
      </div>
    </div>
  )
}

/** 历史审计记录：按次追加、倒序展示、保留全部批次 */
function HistorySection({ audits }: { audits: SecurityAudit[] }) {
  const ordered = [...audits].sort((a, b) => b.date.localeCompare(a.date))
  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-song text-[19px] tracking-[0.14em] text-ink-800">历史审计记录</h2>
        <span className="text-[12.5px] tracking-[0.08em] text-muted-foreground">
          共 {ordered.length} 次 · 按审计日期倒序
        </span>
      </div>
      <p className="mt-2 text-[11.5px] leading-[1.9] text-muted-foreground">
        每次审计独立成一条记录追加保存，修复完成后仅回填该条记录，不覆盖历史批次；「已完成整改次数」以批次是否全部完成为准，部分完成不计次。修复时长按「实际修复日期 − 审计日期」的日历日差计算（天，不含起始日、含结束日），未闭环批次显示「整改中」。
      </p>
      <div className="mt-4 border border-paper-300 bg-paper-50">
        <div className="hidden grid-cols-6 gap-3 border-b border-paper-200 bg-paper-100 px-4 py-2.5 text-[10.5px] tracking-[0.14em] text-muted-foreground sm:grid">
          <span>审计日期</span>
          <span>发现问题</span>
          <span>已完成整改</span>
          <span>实际修复日期</span>
          <span>修复时长</span>
          <span>状态</span>
        </div>
        {ordered.length === 0 ? (
          <p className="px-4 py-8 text-center text-[12px] text-muted-foreground">
            暂无历史审计记录
          </p>
        ) : (
          ordered.map((audit) => <HistoryRow key={audit.date} audit={audit} />)
        )}
      </div>
    </section>
  )
}

export default function Security() {
  const totalIssues = securityAudits.reduce((sum, audit) => sum + audit.found.total, 0)
  // 整改次数以「批次是否全部完成」判定：本批次 34/34 已全部闭环，计 1 次「已完成整改」
  const fixedBatches = securityAudits.filter((audit) => audit.isFullyFixed).length
  const lastSync = generatedAt ? generatedAt.slice(0, 10) : "—"
  const latest = securityAudits[0]

  return (
    <div className="mx-auto max-w-[920px] px-6 py-16 sm:py-24">
      <div className="flex items-center gap-3">
        <Seal char="安" size={40} tone="gold" />
        <div>
          <p className="text-[10.5px] tracking-[0.34em] text-gold-600">安全检查</p>
          <h1 className="mt-1 font-song text-[28px] tracking-[0.14em] text-ink-800">
            代码安全审计记录
          </h1>
        </div>
      </div>

      <p className="mt-7 text-[13px] leading-[2.1] text-ink-700/90">
        本站定期开展代码安全审查，并在此公开每次审查的日期、发现的问题数量与类别、整改项数，以及预计与实际修复日期与修复时长，便于了解安全状况与整改进度。
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        {[
          { label: "累计审计", value: `${securityAudits.length} 次` },
          { label: "累计发现问题", value: `${totalIssues} 项` },
          { label: "已完成整改", value: `${fixedBatches} 次` },
        ].map((item) => (
          <div key={item.label} className="border border-paper-300 bg-paper-100 px-4 py-4">
            <p className="text-[10.5px] tracking-[0.18em] text-muted-foreground">{item.label}</p>
            <p className="mt-1.5 font-song text-[20px] text-ink-800">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6">
        {latest ? (
          <AuditCard audit={latest} />
        ) : (
          <p className="border border-paper-300 bg-paper-50 px-5 py-10 text-center text-[12.5px] text-muted-foreground">
            暂无代码安全审计记录
          </p>
        )}
      </div>

      <HistorySection audits={securityAudits} />

      <p className="mt-8 border-l-2 border-gold-600 bg-paper-100 px-4 py-3 text-[11.5px] leading-[2] text-muted-foreground">
        本页记录由结构化代码安全审查结果自动同步生成：每次审查新增一条独立记录，修复闭环后回填该条记录的实际修复日期与整改项数，历史批次全部保留、不覆盖，站点下次构建即自动呈现。记录按审计日期由近及远排列，最后同步：{lastSync}。
      </p>
    </div>
  )
}
