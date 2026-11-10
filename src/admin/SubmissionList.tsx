import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Download, Inbox, Loader2, MessageSquare, Trash2, XCircle } from "lucide-react"
import { ApiError, api } from "@/lib/api"
import { useAuth } from "@/lib/admin-context"
import { cn } from "@/lib/utils"
import { formatBeijing } from "@/lib/time"
import type { MemberSubmission, SubmissionStatus } from "@/lib/types"

type Tab = "pending" | "accepted" | "rejected" | "all"

export default function SubmissionList() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isSuper = user?.role === "super"
  const [subs, setSubs] = useState<MemberSubmission[]>([])
  const [families, setFamilies] = useState<{ id: number; name: string }[]>([])
  const [tab, setTab] = useState<Tab>("pending")
  const [familyFilter, setFamilyFilter] = useState<number | "all" | "unassigned">("all")
  const [busy, setBusy] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState("")
  const [loaded, setLoaded] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [feedback, setFeedback] = useState<{ tone: "ok" | "error"; text: string } | null>(null)

  useEffect(() => {
    void load()
  }, [])

  // 切换筛选条件时清空已选，避免跨筛选误操作
  useEffect(() => {
    setSelected(new Set())
  }, [familyFilter, tab])

  async function load() {
    try {
      const [data, fam] = await Promise.all([api.listSubmissions(), api.listFamilies()])
      setSubs(data.submissions)
      setFamilies(fam.families.map((f) => ({ id: f.id, name: f.name || f.tag })))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "加载失败")
    } finally {
      setLoaded(true)
    }
  }

  const familyName = (id: number) =>
    id === 0 ? "未分配" : families.find((f) => f.id === id)?.name ?? `族#${id}`
  /** 列表/导出用的归属名：未分配（其他家族）展示自选标签 */
  const ownerLabel = (s: MemberSubmission) =>
    s.familyId === 0 ? s.familyLabel || "未分配" : familyName(s.familyId)

  const statusMeta: Record<SubmissionStatus, { label: string; cls: string }> = {
    pending: { label: "待审", cls: "bg-amber-100 text-amber-700" },
    accepted: { label: "已采纳", cls: "bg-emerald-100 text-emerald-700" },
    rejected: { label: "已驳回", cls: "bg-paper-300 text-ink-500" },
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "pending", label: "待审" },
    { key: "accepted", label: "已采纳" },
    { key: "rejected", label: "已驳回" },
    { key: "all", label: "全部" },
  ]

  const shown = useMemo(() => {
    const list =
      familyFilter === "all"
        ? subs
        : familyFilter === "unassigned"
          ? subs.filter((s) => s.familyId === 0)
          : subs.filter((s) => s.familyId === familyFilter)
    const filtered = tab === "all" ? list : list.filter((s) => s.status === tab)
    return [...filtered].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  }, [subs, tab, familyFilter])

  const allSelected = shown.length > 0 && shown.every((s) => selected.has(s.id))

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected((prev) => {
      if (shown.length > 0 && shown.every((s) => prev.has(s.id))) return new Set()
      return new Set(shown.map((s) => s.id))
    })
  }

  async function reject(id: number) {
    setBusy(id)
    setError("")
    try {
      await api.updateSubmission(id, "rejected")
      setSubs((prev) => prev.map((s) => (s.id === id ? { ...s, status: "rejected" } : s)))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "操作失败")
    } finally {
      setBusy(null)
    }
  }

  async function accept(id: number) {
    setBusy(id)
    setError("")
    const sub = subs.find((s) => s.id === id)
    try {
      await api.updateSubmission(id, "accepted")
      setSubs((prev) => prev.map((s) => (s.id === id ? { ...s, status: "accepted" } : s)))
      if (sub) {
        let payload: Record<string, unknown> = {}
        try {
          payload = JSON.parse(sub.payload || "{}")
        } catch {
          payload = {}
        }
        navigate("/admin/members/new", {
          state: {
            prefill: {
              member: {
                name: String(payload.name ?? ""),
                gender: payload.gender === "female" ? "female" : "male",
                generation: Number(payload.generation ?? 1),
                courtesyName: String(payload.courtesyName ?? ""),
                isMarriedIn: Boolean(payload.isMarriedIn),
                isBranchHeir: Boolean(payload.isBranchHeir),
                branch: String(payload.branch ?? ""),
                title: String(payload.title ?? ""),
                sortOrder: Number(payload.sortOrder ?? 0),
                birthYear: String(payload.birthYear ?? ""),
                deathYear: String(payload.deathYear ?? ""),
                isAlive: payload.isAlive !== false,
                burialPlace: String(payload.burialPlace ?? ""),
                bio: String(payload.bio ?? ""),
              },
              note: `来自反馈 #${sub.id} · 反馈人：${sub.reporterName}\n${sub.message}`,
            },
          },
        })
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "操作失败")
    } finally {
      setBusy(null)
    }
  }

  /** 构造 CSV：带 UTF-8 BOM，Excel 可直接打开；字段含基础信息 + 族人资料逐项 + 原始 JSON */
  function buildCsv(rows: MemberSubmission[]): string {
    const headers = [
      "编号", "所属族谱", "提交时间", "状态", "反馈人", "说明",
      "姓名", "性别", "世次", "字号", "房支", "功名", "父", "母", "配偶",
      "生年", "卒年", "葬地", "简介", "原始资料(JSON)",
    ]
    // H6：中和公式注入，访客可控字段不得在电子表格中被执行
    const esc = (v: unknown) => {
      const text = String(v ?? "")
      const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
      return `"${safe.replace(/"/g, '""')}"`
    }
    const lines = [headers.map(esc).join(",")]
    for (const s of rows) {
      let p: Record<string, unknown> = {}
      try {
        p = JSON.parse(s.payload || "{}")
      } catch {
        p = {}
      }
      const gender = p.gender === "female" ? "女" : "男"
      lines.push(
        [
          s.id, ownerLabel(s), formatBeijing(s.createdAt), statusMeta[s.status].label, s.reporterName,
          s.message, p.name ?? "", gender, p.generation ?? "", p.courtesyName ?? "",
          p.branch ?? "", p.title ?? "", p.fatherName ?? "", p.motherName ?? "",
          p.spouseName ?? "", p.birthYear ?? "", p.deathYear ?? "", p.burialPlace ?? "",
          p.bio ?? "", s.payload,
        ]
          .map((v) => esc(v))
          .join(","),
      )
    }
    return "﻿" + lines.join("\r\n")
  }

  function downloadFile(filename: string, content: string) {
    const blob = new Blob([content], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  function fileStamp() {
    return formatBeijing(new Date().toISOString()).replace(/[-: ]/g, "")
  }

  async function exportRows(rows: MemberSubmission[], label: string) {
    if (rows.length === 0) {
      setFeedback({ tone: "error", text: "没有可导出的记录" })
      return
    }
    downloadFile(`反馈记录-${fileStamp()}.csv`, buildCsv(rows))
    setFeedback({ tone: "ok", text: `已导出 ${rows.length} 条${label}（CSV）` })
    // 导出动作由前端发起、服务端不可直接感知，故单独埋点审计
    try {
      await api.appendAuditLog({
        action: "SUBMISSION_EXPORT",
        targetType: "submission",
        targetId: rows.map((r) => r.id).join(","),
        detail: JSON.stringify({ count: rows.length, scope: label }),
      })
    } catch {
      // 文件已生成，审计埋点失败不影响下载
    }
  }

  async function confirmDelete() {
    const ids = [...selected]
    setConfirmOpen(false)
    setDeleting(true)
    setError("")
    try {
      const res = await api.batchDeleteSubmissions(ids)
      setSubs((prev) => prev.filter((s) => !ids.includes(s.id)))
      setSelected(new Set())
      setFeedback({ tone: "ok", text: `已删除 ${res.deleted} 条反馈记录` })
    } catch (err) {
      setFeedback({ tone: "error", text: err instanceof ApiError ? err.message : "删除失败" })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-song text-[22px] tracking-[0.14em] text-ink-800">反馈审核</h1>
          <p className="mt-1.5 text-[12px] text-muted-foreground">
            亲属提交的族人信息更正与补录，核对后采纳或驳回。
          </p>
        </div>
        <div className="flex gap-1 rounded-[14px] border border-paper-300">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={
                tab === t.key
                  ? "bg-ink-800 px-3 py-1.5 text-[11.5px] tracking-[0.1em] text-paper-50"
                  : "px-3 py-1.5 text-[11.5px] tracking-[0.1em] text-ink-600 hover:bg-paper-100"
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      {/* 族谱筛选 + 导出当前筛选 */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
          族谱
          <select
            value={familyFilter}
            onChange={(event) => {
              const v = event.target.value
              setFamilyFilter(v === "all" || v === "unassigned" ? v : Number(v))
            }}
            className="rounded-[8px] border border-paper-300 bg-paper-50 px-2 py-1.5 text-[12px] text-ink-700 outline-none"
          >
            <option value="all">全部族谱</option>
            {isSuper ? <option value="unassigned">未分配（其他家族）</option> : null}
            {families.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => void exportRows(shown, "当前筛选")}
          className="ml-auto inline-flex items-center gap-1.5 rounded-[8px] border border-paper-300 px-3 py-1.5 text-[11.5px] tracking-[0.08em] text-ink-600 transition-colors hover:border-ink-400 hover:text-ink-800"
        >
          <Download className="size-3.5" />
          导出当前筛选（{shown.length}）
        </button>
      </div>

      {/* 批量操作工具条 */}
      {selected.size > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[14px] border border-paper-300 bg-paper-100 px-4 py-2.5">
          <label className="flex items-center gap-2 text-[12px] text-ink-700">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="size-4 accent-ink-700"
            />
            全选当前（{shown.length}）
          </label>
          <span className="text-[12px] text-muted-foreground">已选 {selected.size} 条</span>
          <button
            type="button"
            onClick={() => void exportRows(shown.filter((s) => selected.has(s.id)), "所选")}
            className="inline-flex items-center gap-1.5 rounded-[8px] border border-paper-300 px-3 py-1.5 text-[11.5px] tracking-[0.08em] text-ink-600 transition-colors hover:border-ink-400 hover:text-ink-800"
          >
            <Download className="size-3.5" />
            导出所选
          </button>
          <button
            type="button"
            disabled={deleting}
            onClick={() => setConfirmOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-[8px] border border-seal-600 px-3 py-1.5 text-[11.5px] tracking-[0.08em] text-seal-700 transition-colors hover:bg-seal-50 disabled:opacity-60"
          >
            <Trash2 className="size-3.5" />
            删除所选
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="ml-auto text-[11.5px] text-muted-foreground transition-colors hover:text-ink-600"
          >
            清除选择
          </button>
        </div>
      ) : null}

      {feedback ? (
        <p
          className={cn(
            "mt-3 border-l-2 px-3 py-2 text-[12px]",
            feedback.tone === "ok"
              ? "border-ink-600 bg-ink-50 text-ink-700"
              : "border-seal-600 bg-seal-100 text-seal-700",
          )}
        >
          {feedback.text}
        </p>
      ) : null}

      {error ? (
        <p className="mt-4 border-l-2 border-seal-600 bg-seal-100 px-3 py-2 text-[12px] text-seal-700">
          {error}
        </p>
      ) : null}

      {!loaded ? (
        <div className="mt-10 flex justify-center">
          <Loader2 className="size-5 animate-spin text-ink-400" />
        </div>
      ) : shown.length === 0 ? (
        <div className="mt-10 flex flex-col items-center gap-2 text-muted-foreground">
          <Inbox className="size-7 text-ink-300" />
          <p className="text-[12.5px]">暂无{tabs.find((t) => t.key === tab)?.label}反馈</p>
        </div>
      ) : (
        <ul className="mt-6 space-y-4">
          {shown.map((s) => {
            const meta = statusMeta[s.status]
            let payload: Record<string, unknown> = {}
            try {
              payload = JSON.parse(s.payload || "{}")
            } catch {
              payload = {}
            }
            return (
              <li key={s.id} className="rounded-[14px] border border-paper-300 bg-paper-50">
                <div className="flex flex-wrap items-center gap-3 border-b border-paper-200 px-5 py-3">
                  <input
                    type="checkbox"
                    checked={selected.has(s.id)}
                    onChange={() => toggle(s.id)}
                    className="size-4 accent-ink-700"
                    aria-label={`选择反馈 ${s.id}`}
                  />
                  <span className="font-song text-[14px] text-ink-800">{ownerLabel(s)}</span>
                  <span className="text-[11.5px] text-muted-foreground">反馈人 {s.reporterName || "—"}</span>
                  <span className="text-[11.5px] text-muted-foreground">{formatBeijing(s.createdAt)}</span>
                  <span className={`ml-auto rounded-full px-2.5 py-0.5 text-[12.5px] ${meta.cls}`}>
                    {meta.label}
                  </span>
                </div>
                <div className="px-5 py-4">
                  {s.message ? (
                    <p className="text-[12.5px] leading-[1.9] text-ink-700">{s.message}</p>
                  ) : null}
                  <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-[12px] sm:grid-cols-3">
                    {payload.name ? <Field label="姓名" value={String(payload.name)} /> : null}
                    <Field label="性别" value={payload.gender === "female" ? "女" : "男"} />
                    {payload.generation ? <Field label="世次" value={String(payload.generation)} /> : null}
                    {payload.courtesyName ? <Field label="字号" value={String(payload.courtesyName)} /> : null}
                    {payload.branch ? <Field label="房支" value={String(payload.branch)} /> : null}
                    {payload.title ? <Field label="功名" value={String(payload.title)} /> : null}
                    {payload.fatherName ? <Field label="父" value={String(payload.fatherName)} /> : null}
                    {payload.motherName ? <Field label="母" value={String(payload.motherName)} /> : null}
                    {payload.spouseName ? <Field label="配偶" value={String(payload.spouseName)} /> : null}
                    {payload.birthYear ? <Field label="生年" value={String(payload.birthYear)} /> : null}
                    {payload.deathYear ? <Field label="卒年" value={String(payload.deathYear)} /> : null}
                    {payload.burialPlace ? <Field label="葬地" value={String(payload.burialPlace)} /> : null}
                  </dl>
                  {payload.bio ? (
                    <p className="mt-3 text-[12px] leading-[1.9] text-ink-600">{String(payload.bio)}</p>
                  ) : null}
                  {s.status === "pending" ? (
                    <div className="mt-4 flex gap-2">
                      <button
                        type="button"
                        disabled={busy === s.id}
                        onClick={() => void accept(s.id)}
                        className="rounded-[8px] inline-flex items-center gap-1.5 bg-ink-800 px-4 py-1.5 text-[11.5px] tracking-[0.08em] text-paper-50 transition-colors hover:bg-ink-700 disabled:opacity-60"
                      >
                        {busy === s.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <MessageSquare className="size-3.5" />
                        )}
                        采纳并补录
                      </button>
                      <button
                        type="button"
                        disabled={busy === s.id}
                        onClick={() => void reject(s.id)}
                        className="inline-flex items-center gap-1.5 rounded-[8px] border border-paper-300 px-4 py-1.5 text-[11.5px] tracking-[0.08em] text-ink-600 transition-colors hover:border-seal-600 hover:text-seal-700 disabled:opacity-60"
                      >
                        <XCircle className="size-3.5" />
                        驳回
                      </button>
                    </div>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {/* 删除确认弹窗 */}
      {confirmOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4"
          onClick={() => setConfirmOpen(false)}
        >
          <div
            className="w-full max-w-[380px] rounded-[14px] border border-paper-300 bg-paper-50 p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="font-song text-[16px] tracking-[0.1em] text-ink-800">确认删除</h3>
            <p className="mt-3 text-[12.5px] leading-[1.9] text-ink-700">
              将永久删除选中的 <span className="font-semibold">{selected.size}</span>{" "}
              条反馈记录，此操作不可恢复。
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="rounded-[8px] border border-paper-300 px-4 py-2 text-[12px] tracking-[0.08em] text-ink-600 transition-colors hover:border-ink-400"
              >
                取消
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void confirmDelete()}
                className="rounded-[8px] bg-seal-700 px-4 py-2 text-[12px] tracking-[0.08em] text-paper-50 transition-colors hover:bg-seal-800 disabled:opacity-60"
              >
                {deleting ? <Loader2 className="size-3.5 animate-spin" /> : "确认删除"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="text-ink-700">{value || "—"}</dd>
    </div>
  )
}
