import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useLocation, useSearchParams } from "react-router-dom"
import { Download, Loader2, Pencil, Plus, Search, Trash2, Upload, X } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { MemberImportDialog } from "./MemberImportDialog"
import { Pagination } from "./Pagination"
import { downloadMembersExport } from "@/lib/import/export"
import { ApiError, api } from "@/lib/api"
import { useAuth } from "@/lib/admin-context"
import { useFamily } from "@/lib/family-context"
import { cn } from "@/lib/utils"
import {
  canHoldBranch,
  computeClanBloodIds,
  expandDescendantsAndSpouses,
  generationLabel,
  generationName,
  lifeSpan,
  toChineseNumber,
  type Member,
} from "@/lib/types"

const PAGE_SIZE = 20

/** 旧版把筛选与页码存在会话存储里，现改由地址栏承载，仅留作清理 */
const LEGACY_FILTER_STORAGE_KEY = "family-admin-member-filters"

const selectClass =
  "h-9 rounded-[8px] border border-paper-300 bg-white px-2.5 text-[12px] text-ink-700 outline-none transition-colors focus:border-ink-600"

export default function MemberList() {
  const { family, families, selectFamily } = useFamily()
  const { user } = useAuth()
  const familyId = family?.id ?? 0
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [pendingDelete, setPendingDelete] = useState<Member | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [pendingBatchDelete, setPendingBatchDelete] = useState(false)
  const [batchDeleting, setBatchDeleting] = useState(false)

  /* 分页与筛选的单一真源是地址栏：刷新、后退、分享链接都能复原；
     从编辑页按来源返回时，也不必依赖组件重挂载与副作用执行时序。
     每页条数固定 PAGE_SIZE，暂无可调控件，故不进 URL。 */
  const query = searchParams.get("q") ?? ""
  const generation = searchParams.get("gen") ?? "全部"
  const branch = searchParams.get("branch") ?? "全部"
  const pageParam = Number(searchParams.get("page") ?? "")
  const page = Number.isFinite(pageParam) && pageParam >= 1 ? Math.floor(pageParam) : 1

  /* 统一改写查询串：筛选变化时一并清掉 page，回到第一页 */
  const applyParams = useCallback(
    (patch: Record<string, string | null>, resetPage = false) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const [key, value] of Object.entries(patch)) {
            if (!value || value === "全部") next.delete(key)
            else next.set(key, value)
          }
          if (resetPage) next.delete("page")
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  /* 旧版会话存储里的筛选已无人读取，挂载时清掉，避免两份真源并存 */
  useEffect(() => {
    try {
      sessionStorage.removeItem(LEGACY_FILTER_STORAGE_KEY)
    } catch {
      // 忽略存储不可用的情况
    }
  }, [])

  const bloodIds = useMemo(() => computeClanBloodIds(members), [members])

  const queryFamilyId = Number(searchParams.get("familyId") ?? "")
  // 普通管理员通过 URL 指定其他家族 id 时判定越权：不切换作用域、不发起请求
  const scopeId = user && user.role !== "super" ? (user.familyId ?? null) : null
  const crossFamily =
    scopeId != null &&
    Number.isFinite(queryFamilyId) &&
    queryFamilyId > 0 &&
    queryFamilyId !== scopeId

  useEffect(() => {
    if (crossFamily) return
    if (Number.isFinite(queryFamilyId) && queryFamilyId > 0 && queryFamilyId !== familyId) {
      selectFamily(queryFamilyId)
    }
  }, [queryFamilyId, familyId, selectFamily, crossFamily])

  const load = useCallback(async () => {
    if (crossFamily) {
      setMembers([])
      setLoading(false)
      return
    }
    if (!familyId) {
      setLoading(false)
      return
    }
    try {
      const data = await api.getMembers(familyId)
      setMembers(data.members)
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof ApiError ? error.message : "读取族人失败",
      })
    } finally {
      setLoading(false)
    }
  }, [familyId, crossFamily])

  useEffect(() => {
    setLoading(true)
    void load()
  }, [load])

  /* 筛选条件（搜索 / 世次 / 房支）变化时清空多选：避免批量删掉视野外的人 */
  useEffect(() => {
    setSelected(new Set())
  }, [query, generation, branch])

  /* 切换族谱（超管）时清空多选：id 跨族会撞、语义也乱 */
  useEffect(() => {
    setSelected(new Set())
  }, [familyId])

  const generationOptions = useMemo(() => {
    const set = new Set(members.map((m) => m.generation))
    return [...set].sort((a, b) => a - b)
  }, [members])

  // 房支清单与匹配口径与前台世系图保持一致：
  // 清单 = 家族配置的派系 ∪ 族人档案中的房支标签；
  // 匹配 = 有房主的房按血统子树自动派生，否则按标签。家族设置改动后此处即时联动。
  const branchOptions = useMemo(() => {
    const seen: string[] = []
    for (const name of family?.branches ?? []) {
      if (name && !seen.includes(name)) seen.push(name)
    }
    for (const member of members) {
      if (member.branch && canHoldBranch(member) && !seen.includes(member.branch)) {
        seen.push(member.branch)
      }
    }
    return seen.sort((a, b) => a.localeCompare(b, "zh"))
  }, [family?.branches, members])

  const branchMemberIds = useMemo(() => {
    const headMap = family?.branchHeads ?? {}
    const byId = new Map(members.map((m) => [m.id, m]))
    const map = new Map<string, Set<number>>()
    for (const name of branchOptions) {
      const headId = headMap[name]
      map.set(
        name,
        typeof headId === "number" && byId.has(headId)
          ? expandDescendantsAndSpouses(members, [headId])
          : new Set(members.filter((m) => m.branch === name && canHoldBranch(m)).map((m) => m.id)),
      )
    }
    return map
  }, [branchOptions, members, family?.branchHeads])

  // 地址栏里的房支指向已删除 / 改名的房支时，回落到「全部」，避免静默筛出空列表
  useEffect(() => {
    if (loading || branch === "全部") return
    if (branchOptions.length > 0 && !branchOptions.includes(branch)) {
      applyParams({ branch: null }, true)
    }
  }, [loading, branch, branchOptions, applyParams])

  const filtered = useMemo(() => {
    const keyword = query.trim()
    return members.filter((member) => {
      const matchQuery =
        !keyword || member.name.includes(keyword) || member.courtesyName.includes(keyword)
      const matchGeneration =
        generation === "全部" || member.generation === Number(generation)
      const matchBranch =
        branch === "全部" || (branchMemberIds.get(branch)?.has(member.id) ?? false)
      return matchQuery && matchGeneration && matchBranch
    })
  }, [members, query, generation, branch, branchMemberIds])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  /* 多选：以"已选集合是否为空"为开关；全选只填当前页，手动勾选可跨页累积 */
  const pageIds = pageItems.map((m) => m.id)
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id))
  const somePageSelected = pageIds.some((id) => selected.has(id))
  const headerRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (headerRef.current) headerRef.current.indeterminate = somePageSelected && !allPageSelected
  }, [somePageSelected, allPageSelected])

  /* 编辑 / 删除后数据变少，原页码可能超出范围：钳制到最后一页，
     并提示「原页已无记录」。加载完成前不判断，避免空列表误触。 */
  useEffect(() => {
    if (loading) return
    if (page <= totalPages) return
    setMessage({ tone: "ok", text: `原页已无记录，已回到第 ${totalPages} 页` })
    applyParams({ page: totalPages > 1 ? String(totalPages) : null })
  }, [loading, page, totalPages, applyParams])

  /* 当前列表页地址（含筛选与页码），作编辑 / 新增的来源，保存后按此返回 */
  const from = `${location.pathname}${location.search}`

  const parentName = (id: number | null) => {
    if (!id) return "—"
    return members.find((m) => m.id === id)?.name ?? "—"
  }

  async function handleDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      await api.deleteMember(pendingDelete.id)
      setMessage({ tone: "ok", text: `已删除「${pendingDelete.name}」` })
      setPendingDelete(null)
      await load()
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof ApiError ? error.message : "删除失败",
      })
      setPendingDelete(null)
    } finally {
      setDeleting(false)
    }
  }

  /* 导出当前筛选结果：超管可切换家族导出任意一族，普通管理员列表本就锁定在本家族 */
  async function handleExport() {
    if (!filtered.length) {
      setMessage({ tone: "error", text: "当前筛选下没有可导出的族人" })
      return
    }
    setExporting(true)
    try {
      await downloadMembersExport(filtered, family?.name || family?.tag || "")
    } finally {
      setExporting(false)
    }
  }

  function toggleOne(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function togglePageAll() {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allPageSelected) pageIds.forEach((id) => next.delete(id))
      else pageIds.forEach((id) => next.add(id))
      return next
    })
  }

  async function handleBatchDelete() {
    if (selected.size === 0) return
    setBatchDeleting(true)
    try {
      const res = await api.deleteMembers([...selected], familyId)
      const okCount = res.deleted.length
      const failCount = res.failed.length + res.rejected.length
      let text = `已删除 ${okCount} 位族人`
      if (res.branchHeadWarnings.length) {
        text += `；${res.branchHeadWarnings.length} 位曾设为房头，请到家族设置重设`
      }
      if (failCount) text += `，${failCount} 位未能删除`
      setMessage({ tone: okCount > 0 ? "ok" : "error", text })
      setSelected(new Set())
      setPendingBatchDelete(false)
      await load()
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof ApiError ? error.message : "批量删除失败",
      })
      setPendingBatchDelete(false)
    } finally {
      setBatchDeleting(false)
    }
  }

  if (crossFamily) {
    return (
      <div className="space-y-6">
        <div>
          <p className="text-[10.5px] tracking-[0.3em] text-gold-700">成员管理</p>
          <h1 className="mt-2 font-song text-[26px] tracking-[0.12em] text-ink-800">族人名录</h1>
        </div>
        <p className="border-l-2 border-seal-600 bg-seal-100 px-3 py-2 text-[12px] text-seal-700">
          无权限访问或操作其他家族的数据
        </p>
        <Link
          to="/admin/members"
          className="inline-flex items-center gap-1.5 rounded-[8px] border border-paper-300 px-4 py-2 text-[12px] text-ink-700"
        >
          返回本族族人名录
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10.5px] tracking-[0.3em] text-gold-700">成员管理</p>
          <h1 className="mt-2 font-song text-[26px] tracking-[0.12em] text-ink-800">族人名录</h1>
          <p className="mt-2 text-[12px] text-muted-foreground">
            {family?.name || family?.tag || "—"} · 共收录 {members.length} 位族人，其中主干{" "}
            {members.filter((m) => !m.isMarriedIn && !m.isBranchHeir).length} 位。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="rounded-[8px] inline-flex items-center gap-1.5 border border-paper-300 bg-white px-3 py-2 text-[11.5px] tracking-[0.1em] text-ink-700 transition-colors hover:border-ink-600"
          >
            <Upload className="size-3" />
            导入族人
          </button>
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={exporting}
            className="rounded-[8px] inline-flex items-center gap-1.5 border border-paper-300 bg-white px-3 py-2 text-[11.5px] tracking-[0.1em] text-ink-700 transition-colors hover:border-ink-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {exporting ? <Loader2 className="size-3 animate-spin" /> : <Download className="size-3" />}
            导出族人
          </button>
          <Link
            to="/admin/members/new"
            state={{ from }}
            className="rounded-[8px] inline-flex items-center gap-1.5 bg-ink-800 px-3 py-2 text-[11.5px] tracking-[0.1em] text-paper-50 transition-colors hover:bg-ink-700"
          >
            <Plus className="size-3" />
            新增族人
          </Link>
        </div>
      </div>

      {message ? (
        <p
          className={cn(
            "flex items-start justify-between gap-4 border-l-2 px-3 py-2 text-[12px]",
            message.tone === "ok"
              ? "border-ink-600 bg-ink-50 text-ink-700"
              : "border-seal-600 bg-seal-100 text-seal-700",
          )}
        >
          <span>{message.text}</span>
          <button type="button" onClick={() => setMessage(null)} aria-label="关闭提示">
            <X className="size-3.5" />
          </button>
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 rounded-[14px] border border-paper-300 bg-paper-50 p-3">
        {families.length > 1 ? (
          <select
            value={familyId}
            onChange={(event) => selectFamily(Number(event.target.value))}
            className={selectClass}
            aria-label="选择族谱"
          >
            {families.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name || item.tag}
              </option>
            ))}
          </select>
        ) : null}

        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => applyParams({ q: event.target.value }, true)}
            placeholder="搜索姓名或字号"
            className="h-9 w-full rounded-[8px] border border-paper-300 bg-white pl-8 pr-3 text-[12.5px] text-ink-800 outline-none transition-colors focus:border-ink-600"
          />
        </div>

        <select
          value={generation}
          onChange={(event) =>
            applyParams({ gen: event.target.value === "全部" ? null : event.target.value }, true)
          }
          className={selectClass}
        >
          <option value="全部">全部世次</option>
          {generationOptions.map((value) => (
            <option key={value} value={value}>
              第{toChineseNumber(value)}世
            </option>
          ))}
        </select>

        <select
          value={branch}
          onChange={(event) =>
            applyParams({ branch: event.target.value === "全部" ? null : event.target.value }, true)
          }
          className={selectClass}
        >
          <option value="全部">全部房支</option>
          {branchOptions.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>

        <span className="ml-auto text-[12.5px] text-muted-foreground">
          筛选出 {filtered.length} 位
        </span>
      </div>

      {selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-[14px] border border-seal-600 bg-seal-100 px-4 py-2.5">
          <span className="text-[12px] text-seal-700">已选 {selected.size} 位</span>
          <button
            type="button"
            onClick={() => setPendingBatchDelete(true)}
            className="inline-flex items-center gap-1.5 rounded-[8px] bg-seal-600 px-3 py-1.5 text-[11.5px] tracking-[0.1em] text-white transition-colors hover:bg-seal-700"
          >
            <Trash2 className="size-3" />
            批量删除
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="rounded-[8px] border border-paper-300 bg-white px-3 py-1.5 text-[11.5px] text-ink-700 transition-colors hover:border-ink-600"
          >
            取消选择
          </button>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-[14px] border border-paper-300 bg-paper-50">
        <table className="w-full min-w-[800px] border-collapse">
          <thead>
            <tr className="border-b border-paper-300 bg-paper-100/60">
              <th className="w-10 px-3 py-2.5">
                <input
                  ref={headerRef}
                  type="checkbox"
                  className="size-3.5 cursor-pointer accent-seal-600"
                  checked={allPageSelected}
                  disabled={pageIds.length === 0}
                  onChange={togglePageAll}
                  aria-label="全选本页"
                />
              </th>
              {["世次", "姓名", "字号", "性别", "字辈", "房支", "生卒", "父", "配偶", ""].map((head) => (
                <th
                  key={head}
                  className="px-3 py-2.5 text-left text-[10.5px] font-normal tracking-[0.16em] text-muted-foreground"
                >
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center">
                  <Loader2 className="mx-auto size-4 animate-spin text-ink-400" />
                </td>
              </tr>
            ) : pageItems.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-12 text-center text-[12px] text-muted-foreground">
                  没有符合条件的族人
                </td>
              </tr>
            ) : (
              pageItems.map((member) => (
                <tr
                  key={member.id}
                  className="border-b border-paper-200 last:border-0 transition-colors hover:bg-paper-100/60"
                >
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <input
                      type="checkbox"
                      className="size-3.5 cursor-pointer accent-seal-600"
                      checked={selected.has(member.id)}
                      onChange={() => toggleOne(member.id)}
                      aria-label={`选择 ${member.name}`}
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[12.5px] text-muted-foreground">
                    {generationLabel(member.generation)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <span className="font-song text-[13.5px] tracking-[0.06em] text-ink-900">
                      {member.name}
                    </span>
                    {member.isMarriedIn ? (
                      <span className="ml-1.5 rounded-[8px] border border-paper-300 px-1 py-0.5 text-[9px] text-muted-foreground">
                        {member.isBranchHeir ? "祧" : "配"}
                      </span>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[12px] text-ink-600">
                    {member.courtesyName || "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[12px] text-ink-600">
                    {member.gender === "female" ? "女" : "男"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[12px] text-gold-700">
                    {bloodIds.has(member.id) || member.isBranchHeir
                      ? generationName(family, member.generation) || "—"
                      : "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[12px] text-ink-600">
                    {member.branch && canHoldBranch(member) ? member.branch : "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[11.5px] text-muted-foreground">
                    {lifeSpan(member)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[12px] text-ink-600">
                    {parentName(member.fatherId)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[12px] text-ink-600">
                    {member.spouseId ? parentName(member.spouseId) : "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        to={`/admin/members/${member.id}`}
                        state={{ from }}
                        className="rounded-[8px] flex size-7 items-center justify-center text-ink-500 transition-colors hover:bg-paper-200 hover:text-ink-800"
                        aria-label="编辑"
                      >
                        <Pencil className="size-3.5" />
                      </Link>
                      <button
                        type="button"
                        onClick={() => setPendingDelete(member)}
                        className="rounded-[8px] flex size-7 items-center justify-center text-ink-500 transition-colors hover:bg-seal-100 hover:text-seal-600"
                        aria-label="删除"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 只留上一页 / 下一页与页码跳转：页码列表在族人众多时排不下，
          统一交给通用分页条，翻到指定页用「跳转」一步到位 */}
      <Pagination
        page={currentPage}
        totalPages={totalPages}
        disabled={loading}
        onPageChange={(next) => applyParams({ page: next === 1 ? null : String(next) })}
      />

      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent className="rounded-sm border-paper-300">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-song text-[17px] tracking-[0.08em]">
              删除族人
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[12.5px] leading-relaxed">
              确定删除「{pendingDelete?.name}」吗？此操作不可撤销。删除后会自动解除关联。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-[8px]">取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault()
                void handleDelete()
              }}
              className="rounded-[8px] bg-seal-600 text-white hover:bg-seal-700"
            >
              {deleting ? <Loader2 className="size-3.5 animate-spin" /> : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingBatchDelete}
        onOpenChange={(open) => !open && setPendingBatchDelete(false)}
      >
        <AlertDialogContent className="rounded-sm border-paper-300">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-song text-[17px] tracking-[0.08em]">
              批量删除族人
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[12.5px] leading-relaxed">
              确定删除选中的 {selected.size} 位族人吗？此操作不可撤销。删除后会自动解除关联。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-[8px]">取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={batchDeleting}
              onClick={(event) => {
                event.preventDefault()
                void handleBatchDelete()
              }}
              className="rounded-[8px] bg-seal-600 text-white hover:bg-seal-700"
            >
              {batchDeleting ? <Loader2 className="size-3.5 animate-spin" /> : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <MemberImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        family={family}
        members={members}
        onImported={() => {
          setMessage({ tone: "ok", text: "族人导入完成，名录已刷新" })
          void load()
        }}
      />
    </div>
  )
}
