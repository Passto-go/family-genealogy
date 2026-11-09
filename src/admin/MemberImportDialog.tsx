import { useCallback, useRef, useState } from "react"
import { Download, Loader2, Upload } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ApiError, api, type MemberImportPayload } from "@/lib/api"
import type { Family, Member } from "@/lib/types"
import { cn } from "@/lib/utils"
import { parseImportFile } from "@/lib/import/parse"
import { downloadImportTemplate } from "@/lib/import/template"
import { parseFlag, validateImportRows, type ImportPlan } from "@/lib/import/validate"

interface MemberImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  family: Family | null
  /** 本族现有成员，用于解析 @编号 引用与推导世次 */
  members: Member[]
  onImported: () => void
}

const MAX_PREVIEW_ROWS = 200

export function MemberImportDialog({
  open,
  onOpenChange,
  family,
  members,
  onImported,
}: MemberImportDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState("")
  const [parsing, setParsing] = useState(false)
  const [plan, setPlan] = useState<ImportPlan | null>(null)
  const [fatal, setFatal] = useState("")
  const [importing, setImporting] = useState(false)
  const [created, setCreated] = useState<number | null>(null)
  const [submitError, setSubmitError] = useState("")

  const reset = useCallback(() => {
    setFileName("")
    setPlan(null)
    setFatal("")
    setCreated(null)
    setSubmitError("")
    setParsing(false)
    setImporting(false)
    if (inputRef.current) inputRef.current.value = ""
  }, [])

  const handleOpenChange = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
  }

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    reset()
    setFileName(file.name)
    setParsing(true)
    try {
      const parsed = await parseImportFile(file)
      const nextPlan = validateImportRows(parsed.rows, family, members)
      setPlan({ ...nextPlan, notices: [...parsed.notices, ...nextPlan.notices] })
    } catch (error) {
      setFatal(error instanceof Error ? error.message : "文件解析失败")
    } finally {
      setParsing(false)
    }
  }

  const handleSubmit = async () => {
    if (!plan?.ok || !family) return
    setImporting(true)
    setSubmitError("")
    const rows: MemberImportPayload[] = plan.rows.map(({ source, generation, branch }) => ({
      no: source.no,
      name: source.name,
      gender: source.gender.trim() === "男" || source.gender.trim() === "male" ? "male" : "female",
      generation,
      courtesyName: source.courtesyName,
      branch,
      fatherNo: source.fatherNo,
      motherNo: source.motherNo,
      spouseNo: source.spouseNo,
      isMarriedIn: parseFlag(source.isMarriedIn),
      isBranchHeir: parseFlag(source.isBranchHeir),
      birthYear: source.birthYear,
      deathYear: source.deathYear,
      isAlive: parseFlag(source.isAlive),
      burialPlace: source.burialPlace,
      title: source.title,
      bio: source.bio,
      sortOrder: source.sortOrder ?? 0,
    }))

    try {
      const result = await api.importMembers(family.id, rows)
      setCreated(result.created)
      onImported()
    } catch (error) {
      if (error instanceof ApiError) {
        const issues = (error.details as { issues?: { no: string; field: string; message: string }[] } | undefined)
          ?.issues
        if (issues?.length) {
          setPlan((prev) => (prev ? { ...prev, ok: false, issues } : prev))
        }
        setSubmitError(error.message)
      } else {
        setSubmitError("导入失败，未写入任何行")
      }
    } finally {
      setImporting(false)
    }
  }

  const warnings = plan?.rows.reduce((sum, row) => sum + (row.warnings.length ? 1 : 0), 0) ?? 0
  const previewRows = plan?.rows.slice(0, MAX_PREVIEW_ROWS) ?? []

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-4xl overflow-hidden rounded-sm border-paper-300">
        <DialogHeader>
          <DialogTitle className="font-song text-[17px] tracking-[0.08em]">导入族人</DialogTitle>
          <DialogDescription className="text-[12px] leading-relaxed">
            支持 xlsx、csv、json。为确保数据准确，请先下载模板填写后再上传；任何一行不合格，整批都不会写入，请在预览里修好再导入。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.csv,.json"
              onChange={(event) => void handleFile(event.target.files?.[0])}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="rounded-[8px] inline-flex items-center gap-1.5 border border-paper-300 bg-white px-4 py-2 text-[12px] text-ink-700 transition-colors hover:border-ink-600"
            >
              <Upload className="size-3.5" />
              选择文件
            </button>
            <button
              type="button"
              onClick={() => void downloadImportTemplate()}
              className="rounded-[8px] inline-flex items-center gap-1.5 border border-paper-300 bg-white px-4 py-2 text-[12px] text-ink-700 transition-colors hover:border-ink-600"
            >
              <Download className="size-3.5" />
              下载模板
            </button>
            {fileName ? (
              <span className="text-[11.5px] text-muted-foreground">已选：{fileName}</span>
            ) : null}
          </div>

          {parsing ? (
            <p className="flex items-center gap-2 text-[12px] text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              正在解析…
            </p>
          ) : null}

          {fatal ? (
            <p className="border-l-2 border-seal-600 bg-seal-100 px-3 py-2 text-[12px] text-seal-700">{fatal}</p>
          ) : null}

          {submitError ? (
            <p className="border-l-2 border-seal-600 bg-seal-100 px-3 py-2 text-[12px] text-seal-700">
              {submitError}
            </p>
          ) : null}

          {created != null ? (
            <p className="border-l-2 border-ink-600 bg-ink-50 px-3 py-2 text-[12px] text-ink-700">
              已导入 {created} 位族人。
            </p>
          ) : null}

          {plan?.notices.length ? (
            <ul className="space-y-1 text-[11.5px] leading-relaxed text-muted-foreground">
              {plan.notices.map((notice) => (
                <li key={notice}>· {notice}</li>
              ))}
            </ul>
          ) : null}

          {plan?.issues.length ? (
            <div className="rounded-[8px] border border-seal-600/40 bg-seal-100/60 p-3">
              <p className="text-[12px] text-seal-700">
                有 {plan.issues.length} 处问题，整批不会写入：
              </p>
              <ul className="mt-1.5 max-h-40 space-y-1 overflow-y-auto text-[11.5px] leading-relaxed text-seal-700">
                {plan.issues.slice(0, 60).map((issue, index) => (
                  <li key={`${issue.no}-${issue.field}-${index}`}>
                    第 {issue.no} 行 · {issue.field}：{issue.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {plan?.ok && previewRows.length ? (
            <div className="space-y-2">
              <p className="text-[12px] text-ink-700">
                可导入 {plan.rows.length} 行
                {warnings ? `，其中 ${warnings} 行有自动修正` : ""}。核对无误后点「确认导入」。
              </p>
              <div className="max-h-72 overflow-auto rounded-[8px] border border-paper-300">
                <table className="w-full border-collapse text-[11.5px]">
                  <thead className="sticky top-0 bg-paper-100 text-[11px] text-muted-foreground">
                    <tr>
                      {["编号", "姓名", "性别", "世次", "房支", "父", "母", "配偶", "备注"].map((label) => (
                        <th key={label} className="whitespace-nowrap px-2 py-1.5 text-left font-normal">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row) => (
                      <tr key={row.source.no} className="border-t border-paper-200">
                        <td className="whitespace-nowrap px-2 py-1.5 text-ink-700">{row.source.no}</td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-ink-800">{row.source.name}</td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-ink-600">
                          {row.source.gender.trim() === "男" || row.source.gender.trim() === "male" ? "男" : "女"}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-gold-700">{row.generation}</td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-ink-600">{row.branch || "—"}</td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-ink-600">{row.source.fatherNo || "—"}</td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-ink-600">{row.source.motherNo || "—"}</td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-ink-600">{row.source.spouseNo || "—"}</td>
                        <td
                          className={cn(
                            "px-2 py-1.5",
                            row.warnings.length ? "text-gold-700" : "text-muted-foreground",
                          )}
                        >
                          {row.warnings.join("；") || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {plan.rows.length > MAX_PREVIEW_ROWS ? (
                <p className="text-[11px] text-muted-foreground">
                  仅显示前 {MAX_PREVIEW_ROWS} 行，实际提交 {plan.rows.length} 行。
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter className="gap-2">
          <button
            type="button"
            onClick={() => handleOpenChange(false)}
            className="rounded-[8px] inline-flex h-9 items-center justify-center border border-paper-300 bg-white px-5 text-[12px] text-ink-700 transition-colors hover:border-ink-600"
          >
            {created != null ? "关闭" : "取消"}
          </button>
          {created == null ? (
            <button
              type="button"
              disabled={!plan?.ok || importing || parsing}
              onClick={() => void handleSubmit()}
              className="rounded-[8px] inline-flex h-9 items-center justify-center gap-1.5 bg-ink-800 px-5 text-[12px] text-paper-50 transition-colors hover:bg-ink-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {importing ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {importing ? "导入中…" : plan?.ok ? `确认导入 ${plan.rows.length} 行` : "确认导入"}
            </button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
