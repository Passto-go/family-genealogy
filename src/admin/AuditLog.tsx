import { useCallback, useState } from "react"
import { Download, Loader2, ScrollText } from "lucide-react"
import { Pagination } from "./Pagination"
import { ApiError, api } from "@/lib/api"
import type { AuditLog } from "@/lib/types"
import { formatBeijing } from "@/lib/time"

const ACTION_LABEL: Record<string, string> = {
  SUBMISSION_DELETE: "删除反馈",
  SUBMISSION_EXPORT: "导出反馈",
  SUBMISSION_REVIEW: "审核反馈",
  ADMIN_CREATE: "创建管理员",
  ADMIN_UPDATE: "变更管理员",
  ADMIN_DELETE: "删除管理员",
  ADMIN_PASSWORD_RESET: "重置密码",
  FAMILY_CREATE: "创建族谱",
  FAMILY_UPDATE: "更新族谱",
  MEMBER_CREATE: "创建族人",
  MEMBER_UPDATE: "更新族人",
  MEMBER_DELETE: "删除族人",
  MEMBER_IMPORT: "导入族人",
  LOGIN: "登录",
  AUDIT_EXPORT: "导出审计日志",
}

const ACTION_OPTIONS = [
  "",
  "SUBMISSION_REVIEW",
  "SUBMISSION_DELETE",
  "SUBMISSION_EXPORT",
  "FAMILY_CREATE",
  "FAMILY_UPDATE",
  "MEMBER_CREATE",
  "MEMBER_UPDATE",
  "MEMBER_DELETE",
  "ADMIN_CREATE",
  "ADMIN_UPDATE",
  "ADMIN_DELETE",
  "ADMIN_PASSWORD_RESET",
  "AUDIT_EXPORT",
]

const ROLE_LABEL: Record<string, string> = {
  super: "超级管理员",
  editor: "普通管理员",
}

const PAGE_SIZE = 50

export default function AuditLog() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(false)
  // 结果区仅在用户点击「查询」后显示；未查询 / 清除后保持隐藏
  const [queried, setQueried] = useState(false)
  const [error, setError] = useState("")
  const [action, setAction] = useState("")
  const [actor, setActor] = useState("")
  const [offset, setOffset] = useState(0)
  /* 与当前筛选一致的总条数，用于算总页数；后端未返回时按已取条数兜底 */
  const [total, setTotal] = useState(0)
  const [exporting, setExporting] = useState(false)
  // 时间字段：查询与导出共用；不同范围对应后端独立导出权限
  const [timeScope, setTimeScope] = useState<"all" | "year" | "month">("all")
  const [timeYear, setTimeYear] = useState("")
  const [timeMonth, setTimeMonth] = useState("")

  const load = useCallback(
    async (nextOffset: number) => {
      setLoading(true)
      const year = timeScope !== "all" && timeYear.trim() ? Number(timeYear) : undefined
      const month = timeScope === "month" && timeMonth ? Number(timeMonth) : undefined
      try {
        const data = await api.listAuditLogs(
          PAGE_SIZE,
          nextOffset,
          action || undefined,
          actor.trim() || undefined,
          year,
          month,
        )
        const full = data.logs.length >= PAGE_SIZE
        setLogs(data.logs)
        setOffset(nextOffset)
        /* 旧后端未回 total 时，至少保证「还有下一页」能体现出来 */
        setTotal(
          typeof data.total === "number" ? data.total : nextOffset + data.logs.length + (full ? 1 : 0),
        )
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "加载失败")
        setLogs([])
        setTotal(0)
      } finally {
        setLoading(false)
      }
    },
    [action, actor, timeScope, timeYear, timeMonth],
  )

  function handleQuery() {
    if (timeScope !== "all" && !timeYear.trim()) {
      setError("请先填写查询年份")
      return
    }
    setError("")
    setQueried(true)
    void load(0)
  }

  function handleReset() {
    setAction("")
    setActor("")
    setTimeScope("all")
    setTimeYear("")
    setTimeMonth("")
    setLogs([])
    setOffset(0)
    setTotal(0)
    setError("")
    setQueried(false)
  }

  async function handleExport() {
    if (timeScope !== "all" && !timeYear.trim()) {
      setError("请先填写导出年份")
      return
    }
    const year = timeScope !== "all" && timeYear.trim() ? Number(timeYear) : undefined
    const month = timeScope === "month" && timeMonth ? Number(timeMonth) : undefined
    setExporting(true)
    try {
      const csv = await api.exportAuditLogs({
        action: action || undefined,
        actor: actor.trim() || undefined,
        year,
        month,
      })
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `audit-logs-${formatBeijing(new Date().toISOString(), false)}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "导出失败")
    } finally {
      setExporting(false)
    }
  }

  /* 接口按 offset 翻页，页码由 offset 换算；总页数取总数与当前页的较大值，
     兜底旧后端无 total 时不会显示出「第 2 / 1 页」这种矛盾结果 */
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1
  const totalPages = Math.max(currentPage, Math.ceil(total / PAGE_SIZE))

  return (
    <div>
      <header>
        <h1 className="font-song text-[22px] tracking-[0.14em] text-ink-800">操作日志</h1>
        <p className="mt-1.5 text-[12px] text-muted-foreground">
          仅超级管理员可访问。日志为追加写入、不可篡改或删除。分为「查询」与「导出」两部分：设定动作 / 操作人账号 / 时间后点击「查询」查看结果，点击「导出」按同一条件导出 CSV；不支持任何删除操作。管理员被删除后，其历史记录仍保留（按名称追溯）。
        </p>
      </header>

      <div
        className="mt-4 flex flex-wrap items-center gap-2 rounded-[14px] border border-paper-300 bg-paper-50 p-3"
        aria-label="查询与导出"
      >
        {/* 查询区：动作 / 操作人账号 / 时间，随后为查询与清除 */}
        <select
          value={action}
          onChange={(event) => setAction(event.target.value)}
          className="h-9 rounded-[8px] border border-paper-300 bg-white px-2.5 text-[12px] text-ink-700 outline-none"
          aria-label="查询动作"
        >
          {ACTION_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {value ? ACTION_LABEL[value] ?? value : "全部动作"}
            </option>
          ))}
        </select>
        <input
          value={actor}
          onChange={(event) => setActor(event.target.value)}
          placeholder="操作人账号"
          className="h-9 w-[160px] rounded-[8px] border border-paper-300 bg-white px-3 text-[12px] text-ink-800 outline-none"
          aria-label="查询操作人账号"
        />
        <select
          value={timeScope}
          onChange={(event) => setTimeScope(event.target.value as "all" | "year" | "month")}
          className="h-9 rounded-[8px] border border-paper-300 bg-white px-2.5 text-[12px] text-ink-700 outline-none"
          aria-label="查询时间"
          title="时间条件：全部 / 按年份 / 按年月（同时作用于查询与导出）"
        >
          <option value="all">全部时间</option>
          <option value="year">按年份</option>
          <option value="month">按年月</option>
        </select>
        {timeScope !== "all" ? (
          <input
            type="number"
            value={timeYear}
            onChange={(event) => setTimeYear(event.target.value)}
            placeholder="年份"
            className="h-9 w-[88px] rounded-[8px] border border-paper-300 bg-white px-2.5 text-[12px] text-ink-800 outline-none focus:border-ink-600"
            aria-label="时间年份"
          />
        ) : null}
        {timeScope === "month" ? (
          <select
            value={timeMonth}
            onChange={(event) => setTimeMonth(event.target.value)}
            className="h-9 rounded-[8px] border border-paper-300 bg-white px-2.5 text-[12px] text-ink-700 outline-none"
            aria-label="时间月份"
          >
            <option value="">月份</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={String(m)}>
                {m} 月
              </option>
            ))}
          </select>
        ) : null}
        <button
          type="button"
          onClick={handleQuery}
          disabled={loading}
          title="按当前条件查询操作日志"
          className="inline-flex items-center gap-1.5 rounded-[8px] border border-seal-600 bg-transparent px-3 py-2 text-[12px] text-seal-700 transition-colors hover:bg-seal-600/10 disabled:opacity-60 dark:border-seal-400/70 dark:text-seal-300 dark:hover:bg-seal-400/10"
        >
          {loading ? <Loader2 className="size-3.5 animate-spin" /> : null}
          查询
        </button>
        <button
          type="button"
          onClick={handleReset}
          title="清空查询条件并隐藏结果"
          className="inline-flex items-center gap-1.5 rounded-[8px] border border-azure-600 bg-transparent px-3 py-2 text-[12px] text-azure-700 transition-colors hover:bg-azure-600/10 disabled:opacity-60 dark:border-azure-400/70 dark:text-azure-300 dark:hover:bg-azure-400/10"
        >
          清除
        </button>

        {/* 导出区：位置保持在工具条最右 */}
        <span className="mx-1 hidden h-5 w-px bg-paper-300 sm:inline-block" />
        <button
          type="button"
          onClick={() => void handleExport()}
          disabled={exporting}
          title="按当前条件导出 CSV"
          className="ml-auto inline-flex items-center gap-1.5 rounded-[8px] border border-ink-800 bg-ink-800 px-3 py-2 text-[12px] tracking-[0.08em] text-paper-50 transition-colors hover:bg-ink-700 disabled:opacity-60 dark:border-ink-400 dark:bg-ink-400 dark:text-ink-900 dark:hover:bg-ink-300"
        >
          {exporting ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
          导出
        </button>
      </div>

      {error ? (
        <p className="mt-4 border-l-2 border-seal-600 bg-seal-100 px-3 py-2 text-[12px] text-seal-700">
          {error}
        </p>
      ) : null}

      {/* 仅点击「查询」后展示结果；未查询 / 清除后整块隐藏 */}
      {!queried ? null : loading ? (
        <div className="mt-10 flex justify-center">
          <Loader2 className="size-5 animate-spin text-ink-400" />
        </div>
      ) : logs.length === 0 ? (
        <div className="mt-10 flex flex-col items-center gap-2 text-muted-foreground">
          <ScrollText className="size-7 text-ink-300" />
          <p className="text-[12.5px]">暂无操作记录</p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-[14px] border border-paper-300">
          <table className="w-full min-w-[820px] text-left text-[12.5px]">
            <thead className="bg-paper-100 text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-normal tracking-[0.08em]">时间</th>
                <th className="px-4 py-2.5 font-normal tracking-[0.08em]">操作人</th>
                <th className="px-4 py-2.5 font-normal tracking-[0.08em]">角色</th>
                <th className="px-4 py-2.5 font-normal tracking-[0.08em]">动作</th>
                <th className="px-4 py-2.5 font-normal tracking-[0.08em]">目标</th>
                <th className="px-4 py-2.5 font-normal tracking-[0.08em]">明细</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-t border-paper-200 align-top">
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {formatBeijing(log.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-ink-800">{log.actorName || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {ROLE_LABEL[log.actorRole] ?? log.actorRole}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-ink-700">
                    {ACTION_LABEL[log.action] ?? log.action}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {log.targetType}
                    {log.targetId ? ` · ${log.targetId}` : ""}
                  </td>
                  <td className="px-4 py-3">
                    <pre className="max-w-[320px] whitespace-pre-wrap break-all text-[11.5px] leading-[1.7] text-ink-600">
                      {log.detail || "—"}
                    </pre>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {queried && logs.length > 0 ? (
        <Pagination
          className="mt-4"
          page={currentPage}
          totalPages={totalPages}
          disabled={loading}
          onPageChange={(next) => void load((next - 1) * PAGE_SIZE)}
        />
      ) : null}
    </div>
  )
}
