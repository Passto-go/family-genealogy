import { useEffect, useRef, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, Copy, Loader2, RefreshCw, Save } from "lucide-react"
import { ApiError, api } from "@/lib/api"
import { useAuth } from "@/lib/admin-context"
import { useFamily } from "@/lib/family-context"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { copyText } from "@/lib/clipboard"
import { formatBeijing } from "@/lib/time"
import {
  EMPTY_FAMILY,
  VISIBILITY_LABEL,
  type Family,
  type FamilyDraft,
  type Visibility,
} from "@/lib/types"

type DraftKey = keyof FamilyDraft

function TextField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  disabled,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  hint?: string
  disabled?: boolean
}) {
  return (
    <label className="block">
      <span className="text-[12.5px] tracking-[0.18em] text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="mt-2 h-10 w-full rounded-[8px] border border-paper-300 bg-white px-3 text-[13px] text-ink-800 outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-ink-600 disabled:cursor-not-allowed disabled:bg-paper-100 disabled:text-muted-foreground/70"
      />
      {hint ? <span className="mt-1.5 block text-[10.5px] text-muted-foreground/80">{hint}</span> : null}
    </label>
  )
}

function TextAreaField({
  label,
  value,
  onChange,
  rows = 5,
  placeholder,
  hint,
  disabled,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  rows?: number
  placeholder?: string
  hint?: string
  disabled?: boolean
}) {
  return (
    <label className="block">
      <span className="text-[12.5px] tracking-[0.18em] text-muted-foreground">{label}</span>
      <textarea
        value={value}
        rows={rows}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="mt-2 w-full rounded-[8px] resize-y border border-paper-300 bg-white px-3 py-2.5 text-[13px] leading-[1.9] text-ink-800 outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-ink-600 disabled:cursor-not-allowed disabled:bg-paper-100 disabled:text-muted-foreground/70"
      />
      {hint ? <span className="mt-1.5 block text-[10.5px] text-muted-foreground/80">{hint}</span> : null}
    </label>
  )
}

function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-[14px] border border-paper-300 bg-paper-50">
      <header className="border-b border-paper-200 px-6 py-4">
        <h2 className="font-song text-[15px] tracking-[0.14em] text-ink-800">{title}</h2>
        {description ? (
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </header>
      <div className="space-y-5 px-6 py-5">{children}</div>
    </section>
  )
}

/** 统一开关行：标题 + 状态徽标 + 说明 + 右侧开关，供「展示与主谱」「标识与访问」等栏目复用 */
function ToggleRow({
  title,
  statusOn,
  statusOff,
  description,
  checked,
  disabled,
  disabledHint,
  onToggle,
}: {
  title: string
  statusOn: string
  statusOff: string
  description: string
  checked: boolean
  disabled?: boolean
  disabledHint?: string
  onToggle: () => void
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="flex flex-wrap items-baseline gap-x-2 text-[12.5px] tracking-[0.05em] text-ink-800">
          <span>{title}</span>
          <span
            className={cn(
              "text-[10.5px] tracking-[0.14em]",
              checked ? "text-gold-700" : "text-seal-600",
            )}
          >
            {checked ? statusOn : statusOff}
          </span>
        </p>
        <p className="mt-1.5 text-[10.5px] leading-relaxed text-muted-foreground/80">{description}</p>
        {disabled && disabledHint ? (
          <p className="mt-1.5 text-[10.5px] text-muted-foreground/70">{disabledHint}</p>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        disabled={disabled}
        onClick={onToggle}
        className={cn(
          "relative mt-0.5 h-[20px] w-[36px] shrink-0 rounded-full border transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-40",
          checked ? "border-ink-700 bg-ink-800" : "border-paper-300 bg-paper-200",
        )}
      >
        <span
          className={cn(
            "absolute top-1/2 size-[14px] -translate-y-1/2 rounded-full bg-paper-50 shadow-sm transition-all duration-200",
            checked ? "left-[18px]" : "left-[2px]",
          )}
        />
      </button>
    </div>
  )
}

function BranchEditor({
  branches,
  heads,
  onHeads,
  onRename,
  members,
  disabled,
}: {
  branches: string[]
  heads: Record<string, number>
  onHeads: (names: string[], heads: Record<string, number>) => void
  onRename: (from: string, to: string) => void
  members: { id: number; name: string; generation: number }[]
  disabled?: boolean
}) {
  // 改名捕获：记录输入框聚焦时的旧名，失焦时若名称已变则上报一对 [旧名, 新名]，
  // 供保存时由服务端把成员档案中的旧房名标签一并覆盖（受控输入逐键触发 onChange，不能按键 diff）。
  const renameOrigin = useRef<{ index: number; name: string } | null>(null)
  const suppressRename = useRef(false)
  type Entry = { name: string; headId: number | null }
  function current(): Entry[] {
    return branches.map((name) => ({ name, headId: heads[name] ?? null }))
  }
  function commit(entries: Entry[]) {
    const names = entries.map((e) => e.name)
    const nextHeads: Record<string, number> = {}
    for (const e of entries) if (e.headId != null && e.name.trim()) nextHeads[e.name] = e.headId
    onHeads(names, nextHeads)
  }
  function setAt(index: number, patch: Partial<Entry>) {
    const entries = current()
    entries[index] = { ...entries[index], ...patch }
    commit(entries)
  }
  function removeAt(index: number) {
    const entries = current()
    entries.splice(index, 1)
    commit(entries)
  }
  function append() {
    commit([...current(), { name: "", headId: null }])
  }
  const inputCls =
    "h-9 rounded-[8px] border border-paper-300 bg-white px-2.5 text-[12.5px] text-ink-800 outline-none focus:border-ink-600 disabled:cursor-not-allowed disabled:bg-paper-100 disabled:text-muted-foreground/70"
  return (
    <div className="space-y-2.5">
      {branches.length === 0 ? (
        <p className="text-[11.5px] text-muted-foreground">
          尚未登记派系。点击下方「添加派系」逐条录入，例如「长房」「二房」「三房」等；录入后可为每房指定一位「房主」（先祖），系统将按血统自动派生其全部后裔，无需逐人标注房支。
        </p>
      ) : null}
      {current().map((entry, index) => (
        <div key={index} className="flex flex-wrap items-center gap-2">
          <span className="w-8 shrink-0 text-center text-[12.5px] text-muted-foreground">
            {index + 1}
          </span>
          <input
            value={entry.name}
            onChange={(event) => setAt(index, { name: event.target.value })}
            onFocus={(event) => {
              suppressRename.current = false
              renameOrigin.current = { index, name: event.target.value }
            }}
            onBlur={(event) => {
              const origin = renameOrigin.current
              renameOrigin.current = null
              if (suppressRename.current || !origin || origin.index !== index) return
              const next = event.target.value.trim()
              const prev = origin.name.trim()
              if (prev && next && prev !== next) onRename(prev, next)
            }}
            placeholder="如：长房"
            disabled={disabled}
            className={`${inputCls} w-28`}
          />
          <select
            value={entry.headId != null ? String(entry.headId) : ""}
            onChange={(event) =>
              setAt(index, { headId: event.target.value ? Number(event.target.value) : null })
            }
            disabled={disabled || members.length === 0}
            className={`${inputCls} flex-1`}
            title="指定房主（先祖）：系统将自动展示其全部后裔"
          >
            <option value="">（未指定房主 · 按标签匹配）</option>
            {members.map((m) => (
              <option key={m.id} value={String(m.id)}>
                {`第 ${m.generation} 世 · ${m.name}`}
              </option>
            ))}
          </select>
          <button
            type="button"
            onMouseDown={() => {
              // 删除不是改名：按下即抑制随后的失焦误报
              suppressRename.current = true
            }}
            onClick={() => removeAt(index)}
            disabled={disabled}
            className="shrink-0 rounded-[8px] border border-paper-300 px-2.5 py-1.5 text-[12.5px] tracking-[0.08em] text-muted-foreground transition-colors hover:border-seal-600 hover:text-seal-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            删除
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={append}
        disabled={disabled}
        className="mt-1 inline-flex items-center rounded-[8px] border border-paper-300 bg-paper-50 px-3 py-1.5 text-[12.5px] tracking-[0.1em] text-ink-600 transition-colors hover:border-ink-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        + 添加派系
      </button>
    </div>
  )
}

function toDraft(family: Family): FamilyDraft {
  return {
    slug: family.slug,
    tag: family.tag,
    domain: family.domain,
    visibility: family.visibility,
    isPrimary: family.isPrimary,
    theme: family.theme,
    surname: family.surname,
    name: family.name,
    hallName: family.hallName,
    county: family.county,
    originPlace: family.originPlace,
    founderName: family.founderName,
    foundedYear: family.foundedYear,
    intro: family.intro,
    motto: family.motto,
    rules: family.rules,
    preface: family.preface,
    generationPoem: family.generationPoem,
    generationPoemStart: family.generationPoemStart,
    branches: family.branches,
    branchHeads: family.branchHeads ?? {},
    coverImage: family.coverImage,
    footerText: family.footerText,
    icpNumber: family.icpNumber,
    policeNumber: family.policeNumber,
    isPublished: family.isPublished,
    printIncludeExtended: family.printIncludeExtended,
  }
}

const VISIBILITY_HINTS: Record<Visibility, string> = {
  public: "任何人可直接查阅此谱世系。",
  password: "访客需输入访问口令后方可查阅世系；口令由系统随机生成，仅生成时展示一次明文。",
  private: "仅登录的管理员可于后台查阅，前台不展示世系（仅超级管理员可设置）。",
}

export default function FamilyForm() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isSuper = user?.role === "super"
  // 普通管理员：前台展示 / 主谱 / 派系房支 仅可查看，不可修改（标识与访问已放开给普通管理员）
  const lockSensitive = !isSuper
  const { families, loading, reload, setFamily, selectFamily } = useFamily()

  const familyId = id ? Number(id) : null
  const isNew = !familyId
  // 普通管理员仅可编辑本家族；新建族谱同样属于越权
  const scopeId = user && !isSuper ? (user.familyId ?? null) : null
  const crossFamily = scopeId != null && (isNew || (familyId != null && familyId !== scopeId))
  const existing = familyId ? families.find((item) => item.id === familyId) ?? null : null

  const [draft, setDraft] = useState<FamilyDraft | null>(isNew ? { ...EMPTY_FAMILY } : null)
  const [hasPassword, setHasPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null)
  // 访问口令由后台自动生成，明文仅当次展示：生成/轮换后弹窗让超管抄存（新建时确认后跳转）
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null)
  const [showGenerated, setShowGenerated] = useState(false)
  const [afterGeneratedNav, setAfterGeneratedNav] = useState<string | null>(null)
  const [rotating, setRotating] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  // 房主（先祖）下拉所需的族人列表（仅编辑已有族谱时加载）
  const [memberOptions, setMemberOptions] = useState<{ id: number; name: string; generation: number }[]>(
    [],
  )
  // 房支标签对齐（修复历史遗留）：把不在当前房支清单内的旧标签批量映射到目标房支
  const [showAlign, setShowAlign] = useState(false)
  const [alignRows, setAlignRows] = useState<{ label: string; count: number; target: string }[]>([])
  const [alignLoading, setAlignLoading] = useState(false)
  const [alignSaving, setAlignSaving] = useState(false)

  // 派系改名映射（[旧名, 新名]）：保存时随表单上报，由服务端把成员档案中沿用旧房名的
  // 标签一并覆盖，避免新旧名称并存。存放于 ref，保存时直接读取，避免 setState 异步与
  // 组件重挂载 / 刷新丢失改名意图。
  const branchRenamesRef = useRef<[string, string][]>([])
  // 表单加载时的派系列表快照：保存时与其当前值做差集，确定性推导改名，
  // 不依赖焦点捕获，重挂载 / 刷新也不丢改名意图。
  const formLoadBranchesRef = useRef<string[]>([])

  useEffect(() => {
    if (isNew || !existing || crossFamily) return
    // 深链 /admin/families/:id 进入时，列表页的 selectFamily 不会被触发，
    // 需在此显式对齐全局选中族谱，否则保存后成员管理等页面读到的仍是旧选中谱的派系。
    selectFamily(familyId as number)
    setDraft(toDraft(existing))
    setHasPassword(existing.hasPassword)
    formLoadBranchesRef.current = existing.branches ?? []
    branchRenamesRef.current = []
  }, [existing, isNew, crossFamily, selectFamily, familyId])

  useEffect(() => {
    if (!familyId || crossFamily) {
      setMemberOptions([])
      return
    }
    let alive = true
    api
      .getMembers(familyId)
      .then(({ members }) => {
        if (!alive) return
        setMemberOptions(
          members
            .map((m) => ({ id: m.id, name: m.name, generation: m.generation }))
            .sort((a, b) => a.generation - b.generation || a.name.localeCompare(b.name)),
        )
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [familyId, crossFamily])

  function update<K extends DraftKey>(key: K, value: FamilyDraft[K]) {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev))
    setMessage(null)
  }

  function handleBranchRename(from: string, to: string) {
    // 链式改名（A→B 后又把该房改成 C）合并为 A→C，避免服务端按中间名多轮覆盖
    const prev = branchRenamesRef.current
    const next: [string, string][] = []
    let chained = false
    for (const [f, t] of prev) {
      if (t === from) {
        if (f !== to) next.push([f, to])
        chained = true
      } else {
        next.push([f, t])
      }
    }
    if (!chained && from !== to) next.push([from, to])
    branchRenamesRef.current = next
  }

  // 检测族人档案中「不在当前房支清单内」的旧标签（如已改名的旧房名）及其人数
  async function openAlign() {
    if (!familyId) return
    setShowAlign(true)
    setAlignLoading(true)
    try {
      const { members } = await api.getMembers(familyId)
      const current = new Set(draft?.branches ?? [])
      const counts = new Map<string, number>()
      for (const member of members) {
        const label = (member.branch ?? "").trim()
        if (label && !current.has(label)) counts.set(label, (counts.get(label) ?? 0) + 1)
      }
      setAlignRows([...counts.entries()].map(([label, count]) => ({ label, count, target: "" })))
    } finally {
      setAlignLoading(false)
    }
  }

  // 将勾选的旧标签批量改写为目标房支，使成员档案标签与家族房支清单重新一致
  async function applyAlign() {
    if (!familyId) return
    const renames: [string, string][] = alignRows
      .filter((row) => row.target && row.target !== row.label)
      .map((row) => [row.label, row.target])
    if (renames.length === 0) return
    setAlignSaving(true)
    try {
      await api.updateFamily(familyId, { branchRenames: renames })
      setAlignRows((prev) => prev.filter((row) => !(row.target && row.target !== row.label)))
      await reload()
      setMessage({ tone: "ok", text: `已将对 ${renames.length} 个旧标签对齐到目标房支` })
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof ApiError ? error.message : "对齐失败" })
    } finally {
      setAlignSaving(false)
    }
  }

  async function handleSave() {
    if (!draft) return
    if (!/^[a-z0-9][a-z0-9-]{1,31}$/.test(draft.slug)) {
      setMessage({ tone: "error", text: "slug 需为 2–32 位小写字母、数字或连字符" })
      return
    }
    if (!draft.tag.trim()) {
      setMessage({ tone: "error", text: "家族标签不能为空" })
      return
    }
    setSaving(true)
    setMessage(null)
    try {
      if (isNew) {
        const { id: newId, accessPassword } = await api.createFamily(draft)
        await reload()
        // 密码访问模式下后台已自动生成访问口令：先弹窗让超管抄存，确认后再跳转到编辑页
        if (accessPassword) {
          setGeneratedPassword(accessPassword)
          setShowGenerated(true)
          setAfterGeneratedNav(`/admin/families/${newId}`)
        } else {
          navigate(`/admin/families/${newId}`, { replace: true })
        }
        setMessage({ tone: "ok", text: "族谱已建立，可继续录入族人" })
      } else if (familyId) {
        // 派生改名映射：优先采用焦点捕获的显式改名；若无，则按「表单加载快照 ↔ 当前派系」
        // 的一对一差集推断（删一旧名、加一新名即视为改名）。该推导不依赖焦点捕获，
        // 重挂载 / 刷新也不会丢失改名意图，确保未指定房主、按标签匹配时，更名也能可靠
        // 同步到成员档案，使更名后的名称可在成员管理与前台正常匹配、显示。
        const baseBranches = formLoadBranchesRef.current
        const nowBranches = draft.branches ?? []
        const inferred: [string, string][] = []
        if (branchRenamesRef.current.length === 0) {
          const removed = baseBranches.filter((b) => !nowBranches.includes(b))
          const added = nowBranches.filter((b) => !baseBranches.includes(b))
          if (removed.length === 1 && added.length === 1) inferred.push([removed[0], added[0]])
        }
        const finalRenames: [string, string][] = []
        const seenFrom = new Set<string>()
        for (const [f, t] of [...branchRenamesRef.current, ...inferred]) {
          if (seenFrom.has(f)) continue
          seenFrom.add(f)
          finalRenames.push([f, t])
        }
        const result = await api.updateFamily(familyId, {
          ...draft,
          ...(finalRenames.length > 0 ? { branchRenames: finalRenames } : {}),
        })
        setFamily(result.family)
        setHasPassword(result.family.hasPassword)
        branchRenamesRef.current = []
        await reload()
        if (result.accessPassword) {
          setGeneratedPassword(result.accessPassword)
          setShowGenerated(true)
        }
        const reusedPassword = draft.visibility === "password" && !result.accessPassword
        setMessage({
          tone: "ok",
          text: result.accessPassword
            ? "已保存，访问口令已自动生成"
            : reusedPassword
              ? "已保存，沿用原访问口令；如已遗失请点「重新生成」"
              : "已保存，前台即时生效",
        })
      }
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof ApiError ? error.message : "保存失败",
      })
    } finally {
      setSaving(false)
    }
  }

  async function handleRotatePassword() {
    if (!familyId) return
    setRotating(true)
    setMessage(null)
    try {
      const { accessPassword } = await api.rotateAccessPassword(familyId)
      setHasPassword(true)
      setGeneratedPassword(accessPassword)
      setShowGenerated(true)
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof ApiError ? error.message : "口令生成失败" })
    } finally {
      setRotating(false)
    }
  }

  async function handleCopyPassword() {
    if (!generatedPassword) return
    const ok = await copyText(generatedPassword)
    setCopyFailed(!ok)
    setCopied(ok)
    if (ok) setTimeout(() => setCopied(false), 2000)
  }

  function closeGenerated() {
    setShowGenerated(false)
    setGeneratedPassword(null)
    setCopied(false)
    setCopyFailed(false)
    const nav = afterGeneratedNav
    setAfterGeneratedNav(null)
    if (nav) navigate(nav, { replace: true })
  }

  if (crossFamily) {
    return (
      <div className="space-y-4 rounded-[14px] border border-paper-300 bg-paper-50 px-6 py-14 text-center">
        <p className="font-song text-[17px] tracking-[0.12em] text-ink-700">
          无权限访问或操作其他家族的数据
        </p>
        <p className="text-[12px] text-muted-foreground">您只能查看与维护所属家族的资料。</p>
        <Link
          to={scopeId ? `/admin/families/${scopeId}` : "/admin"}
          className="inline-flex items-center gap-1.5 rounded-[8px] border border-paper-300 px-4 py-2 text-[12px] text-ink-700"
        >
          <ArrowLeft className="size-3.5" />
          返回本族家族信息
        </Link>
      </div>
    )
  }

  if (!isNew && loading && !existing) {
    return (
      <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> 正在读取家族信息
      </div>
    )
  }

  if (!draft) {
    return (
      <div className="space-y-4 rounded-[14px] border border-paper-300 bg-paper-50 px-6 py-14 text-center">
        <p className="font-song text-[17px] tracking-[0.12em] text-ink-700">未找到该族谱</p>
        <Link
          to="/admin/families"
          className="inline-flex items-center gap-2 rounded-[8px] border border-ink-800/20 px-5 py-2.5 text-[12px] tracking-[0.14em] text-ink-700 hover:border-ink-700"
        >
          <ArrowLeft className="size-3.5" />
          返回家族管理
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            to="/admin/families"
            className="inline-flex items-center gap-1.5 text-[12.5px] tracking-[0.16em] text-muted-foreground transition-colors hover:text-ink-700"
          >
            <ArrowLeft className="size-3" />
            家族管理
          </Link>
          <h1 className="mt-3 font-song text-[26px] tracking-[0.12em] text-ink-800">
            {isNew ? "新建族谱" : draft.name || draft.tag || "家族信息"}
          </h1>
          <p className="mt-2 text-[12px] text-muted-foreground">
            此处所填内容将直接呈现于前台首页、文献页与页脚。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="rounded-[8px] inline-flex items-center gap-1.5 bg-ink-800 px-5 py-2.5 text-[12px] tracking-[0.12em] text-paper-50 transition-colors hover:bg-ink-700 disabled:opacity-60"
        >
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
          {isNew ? "建立族谱" : "保存修改"}
        </button>
      </div>

      {lockSensitive ? (
        <p className="border-l-2 border-gold-600 bg-paper-100 px-3 py-2 text-[12px] text-ink-600">
          普通管理员可维护标识、访问方式、名号、源流、文献与页脚等内容；「前台展示 / 主谱」与「派系 / 房支」仅超级管理员可修改。
        </p>
      ) : (
        <p className="border-l-2 border-ink-600 bg-paper-100 px-3 py-2 text-[12px] text-ink-600">
          超级管理员可修改全部字段，含前台展示、主谱、标识、访问信息与派系房支。
        </p>
      )}

      {message ? (
        <p
          className={cn(
            "border-l-2 px-3 py-2 text-[12px]",
            message.tone === "ok"
              ? "border-ink-600 bg-ink-50 text-ink-700"
              : "border-seal-600 bg-seal-100 text-seal-700",
          )}
        >
          {message.text}
        </p>
      ) : null}

      <Section
        title="展示与主谱"
        description="控制族谱在前台的可见性，以及门户 / 登录页的优先展示（仅超级管理员可设置）"
      >
        <div className="space-y-4">
          <ToggleRow
            title="在门户公开展示此族谱"
            statusOn="已开启"
            statusOff="已关闭"
            description="开启：门户列出，按访问方式查阅；关闭：整部从前台隐藏，后台不受影响。"
            checked={draft.isPublished}
            disabled={lockSensitive}
            disabledHint={lockSensitive ? "此项仅超级管理员可修改。" : undefined}
            onToggle={() => update("isPublished", !draft.isPublished)}
          />
          <ToggleRow
            title="设为主谱"
            statusOn="已设为主谱"
            statusOff="未设为主谱"
            description="门户与登录页优先展示这部族谱；全站仅一部主谱。"
            checked={draft.isPrimary}
            disabled={lockSensitive}
            disabledHint={lockSensitive ? "主谱唯一，仅超级管理员可设置。" : undefined}
            onToggle={() => update("isPrimary", !draft.isPrimary)}
          />
        </div>
      </Section>

      <Section title="标识与访问" description="slug 决定前台地址；访问方式决定谁能查阅世系">
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            label="家族标签"
            value={draft.tag}
            onChange={(value) => update("tag", value)}
            placeholder="如：陈氏"
            hint="用于区分族谱，全站唯一"
          />
          <TextField
            label="路径标识 slug"
            value={draft.slug}
            onChange={(value) => update("slug", value.toLowerCase())}
            placeholder="如：chen"
            hint={`前台地址：/t/${draft.slug || "slug"}`}
          />
          <label className="block">
            <span className="text-[12.5px] tracking-[0.18em] text-muted-foreground">访问方式</span>
            <select
              value={draft.visibility}
              onChange={(event) => update("visibility", event.target.value as Visibility)}
              disabled={!isSuper && draft.visibility === "private"}
              className="mt-2 h-10 w-full rounded-[8px] border border-paper-300 bg-white px-3 text-[13px] text-ink-800 outline-none focus:border-ink-600 disabled:cursor-not-allowed disabled:bg-paper-100 disabled:text-muted-foreground/70"
            >
              {(isSuper
                ? (["public", "password", "private"] as Visibility[])
                : (["public", "password"] as Visibility[])
              ).map((value) => (
                <option key={value} value={value}>
                  {VISIBILITY_LABEL[value]}
                </option>
              ))}
              {!isSuper && draft.visibility === "private" ? (
                <option value="private">{VISIBILITY_LABEL.private}</option>
              ) : null}
            </select>
            <span className="mt-1.5 block text-[10.5px] text-muted-foreground/80">
              {VISIBILITY_HINTS[draft.visibility]}
            </span>
          </label>
          <label className="block">
            <span className="text-[12.5px] tracking-[0.18em] text-muted-foreground">访问口令</span>
            {draft.visibility === "password" ? (
              hasPassword ? (
                <div className="mt-2 flex h-10 items-center justify-between gap-3 rounded-[8px] border border-paper-300 bg-white px-3">
                  <span className="text-[13px] text-ink-800">已设置（口令由后台随机生成）</span>
                  <button
                    type="button"
                    onClick={() => void handleRotatePassword()}
                    disabled={rotating}
                    className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-[6px] border border-paper-300 px-2.5 text-[12px] text-ink-700 transition-colors hover:border-ink-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {rotating ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                    重新生成
                  </button>
                </div>
              ) : (
                <div className="mt-2 flex h-10 items-center rounded-[8px] border border-paper-300 bg-white px-3 text-[13px] text-muted-foreground">
                  保存时系统会自动生成访问口令。
                </div>
              )
            ) : (
              <div className="mt-2 flex h-10 items-center rounded-[8px] border border-paper-300 bg-white px-3 text-[13px] text-muted-foreground">
                {draft.visibility === "private" ? "仅管理员可阅，无需口令。" : "公开访问，无需口令。"}
              </div>
            )}
            {draft.visibility === "password" ? (
              <span className="mt-1.5 block text-[10.5px] text-muted-foreground/80">
                口令由系统随机生成，仅生成时展示一次明文；轮换后旧口令即时失效。切回「密码访问」时沿用现有口令，如已遗失请点「重新生成」。
              </span>
            ) : null}
          </label>
        </div>

        <ToggleRow
          title="排入出嫁女子后裔（外衍）"
          statusOn="已排入"
          statusOff="不排入"
          description="开启：出嫁女子的后裔续排子女、孙辈两层，纳入世系图与谱页；关闭：仅收录本族血脉，出嫁女子只记本人。"
          checked={draft.printIncludeExtended}
          onToggle={() => update("printIncludeExtended", !draft.printIncludeExtended)}
        />
      </Section>

      <Section title="名号" description="用于导航、标题与题识">
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            label="姓氏"
            value={draft.surname}
            onChange={(value) => update("surname", value)}
            placeholder="如：陈"
            hint="取首字作为方印标识"
          />
          <TextField
            label="家族名号"
            value={draft.name}
            onChange={(value) => update("name", value)}
            placeholder="如：颍川陈氏"
          />
          <TextField
            label="堂号"
            value={draft.hallName}
            onChange={(value) => update("hallName", value)}
            placeholder="如：德星堂"
          />
          <TextField
            label="郡望"
            value={draft.county}
            onChange={(value) => update("county", value)}
            placeholder="如：颍川"
          />
        </div>
      </Section>

      <Section title="源流" description="始迁与世居信息，显示于首页题识">
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            label="祖籍地 / 世居地"
            value={draft.originPlace}
            onChange={(value) => update("originPlace", value)}
            placeholder="如：福建泉州府晋江县梅溪乡"
          />
          <TextField
            label="始迁祖"
            value={draft.founderName}
            onChange={(value) => update("founderName", value)}
            placeholder="如：陈德元"
          />
          <TextField
            label="始迁 / 立谱年代"
            value={draft.foundedYear}
            onChange={(value) => update("foundedYear", value)}
            placeholder="如：明嘉靖年间"
            hint="支持「明万历三年」这类文本"
          />
          <TextField
            label="字辈派语"
            value={draft.generationPoem}
            onChange={(value) => update("generationPoem", value)}
            placeholder="以空格或「·」分隔，如：德维昭宪 · 文章华国"
          />
          <label className="block">
            <span className="text-[12.5px] tracking-[0.18em] text-muted-foreground">字辈起始世次</span>
            <input
              type="number"
              min={1}
              value={draft.generationPoemStart}
              onChange={(event) =>
                update("generationPoemStart", Number(event.target.value) || 1)
              }
              className="mt-2 h-10 w-full rounded-[8px] border border-paper-300 bg-white px-3 text-[13px] text-ink-800 outline-none focus:border-ink-600"
            />
            <p className="mt-1.5 text-[10.5px] leading-relaxed text-muted-foreground">
              字辈诗第一个字对应的世代（如「德」为第 1 世）。
            </p>
          </label>
        </div>
      </Section>

      <Section
        title="派系 / 房支"
        description="在此集中维护家族各派。为每房指定一位「房主」（先祖）后，前台世系图将按其血统子树自动展示该房全部后裔（含媳妇 / 女婿），无需逐人标注房支；未指定房主时仍按族人档案中的房支标签匹配。"
      >
        <BranchEditor
          branches={draft.branches ?? []}
          heads={draft.branchHeads ?? {}}
          onHeads={(names, nextHeads) => {
            update("branches", names)
            update("branchHeads", nextHeads)
          }}
          onRename={handleBranchRename}
          members={memberOptions}
          disabled={lockSensitive}
        />
        {!isNew && !lockSensitive ? (
          <div className="mt-4 rounded-[10px] border border-paper-300 bg-paper-50 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[12px] font-medium tracking-[0.04em] text-ink-700">
                对齐族人标签（修复历史遗留）
              </p>
              {!showAlign ? (
                <button
                  type="button"
                  onClick={openAlign}
                  className="shrink-0 rounded-[8px] border border-paper-300 px-3 py-1.5 text-[12px] text-ink-700 transition-colors hover:border-seal-600 hover:text-seal-600"
                >
                  检测旧标签
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setShowAlign(false)
                    setAlignRows([])
                  }}
                  className="shrink-0 rounded-[8px] border border-paper-300 px-3 py-1.5 text-[12px] text-muted-foreground transition-colors hover:border-ink-600 hover:text-ink-700"
                >
                  收起
                </button>
              )}
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
              列出族人档案中「不在当前房支清单内」的旧标签（如已改名的旧房名）。为每个旧标签选择目标房，点「应用对齐」即可批量把对应族人的房支标签改写为目标房，使成员管理与前台按新名正常匹配。
            </p>
            {showAlign && alignLoading ? (
              <p className="mt-2 text-[11.5px] text-muted-foreground">正在检测…</p>
            ) : null}
            {showAlign && !alignLoading && alignRows.length === 0 ? (
              <p className="mt-2 text-[11.5px] text-emerald-700">
                未发现需要对齐的旧标签，成员标签与房支清单已一致。
              </p>
            ) : null}
            {showAlign && !alignLoading && alignRows.length > 0 ? (
              <div className="mt-3 space-y-2.5">
                {alignRows.map((row) => (
                  <div key={row.label} className="flex flex-wrap items-center gap-2">
                    <span className="w-32 shrink-0 truncate text-[12px] text-ink-700" title={row.label}>
                      {row.label}
                    </span>
                    <span className="text-[11px] text-muted-foreground">（{row.count} 人）</span>
                    <span className="text-[11px] text-muted-foreground">→</span>
                    <select
                      value={row.target}
                      onChange={(event) =>
                        setAlignRows((prev) =>
                          prev.map((item) =>
                            item.label === row.label ? { ...item, target: event.target.value } : item,
                          ),
                        )
                      }
                      className="h-9 flex-1 rounded-[8px] border border-paper-300 bg-white px-2.5 text-[12.5px] text-ink-800 outline-none focus:border-ink-600"
                    >
                      <option value="">选择目标房支</option>
                      {(draft?.branches ?? []).map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={applyAlign}
                  disabled={alignSaving}
                  className="rounded-[8px] bg-seal-600 px-3.5 py-1.5 text-[12px] tracking-[0.04em] text-white transition-colors hover:bg-seal-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {alignSaving ? "对齐中…" : "应用对齐"}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </Section>

      <Section title="文献" description="首页与「家族文献」页的正文">
        <TextAreaField
          label="家族简介 / 源流"
          value={draft.intro}
          onChange={(value) => update("intro", value)}
          rows={7}
          hint="分段请直接换行，前台按段呈现"
        />
        <TextAreaField
          label="家训"
          value={draft.motto}
          onChange={(value) => update("motto", value)}
          rows={5}
          hint="每行一句"
        />
        <TextAreaField label="家规" value={draft.rules} onChange={(value) => update("rules", value)} rows={9} />
        <TextAreaField
          label="谱序"
          value={draft.preface}
          onChange={(value) => update("preface", value)}
          rows={9}
        />
      </Section>

      <Section title="站点" description="页脚与题识文字">
        <TextField
          label="页脚文字"
          value={draft.footerText}
          onChange={(value) => update("footerText", value)}
          placeholder="如：颍川陈氏德星堂 · 家族族谱"
        />
      </Section>

      {!isNew && existing ? (
        <p className="text-[11.5px] tracking-[0.06em] text-muted-foreground">
          创建人：{existing.createdBy || "—"}
          {existing.createdAt ? `（${formatBeijing(existing.createdAt)}）` : ""} · 最近维护：
          {existing.updatedBy || "—"}
          {existing.updatedAt ? `（${formatBeijing(existing.updatedAt)}）` : ""}
        </p>
      ) : null}

      <div className="flex justify-end pb-4">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="rounded-[8px] inline-flex items-center gap-1.5 bg-ink-800 px-6 py-2.5 text-[12px] tracking-[0.12em] text-paper-50 transition-colors hover:bg-ink-700 disabled:opacity-60"
        >
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
          {isNew ? "建立族谱" : "保存修改"}
        </button>
      </div>

      <Dialog open={showGenerated} onOpenChange={(open) => { if (!open) closeGenerated() }}>
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-song text-[17px] tracking-[0.12em] text-ink-800">
              访问口令已生成
            </DialogTitle>
            <DialogDescription className="text-[12px] leading-relaxed">
              请立即抄存并转发给族人。此口令仅本次显示，关闭后无法再次查看；忘记可「重新生成」。
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-between gap-3 rounded-[8px] border border-paper-300 bg-paper-100 px-4 py-3">
            <code className="select-all break-all font-mono text-[16px] tracking-[0.08em] text-ink-800">
              {generatedPassword}
            </code>
            <button
              type="button"
              onClick={() => void handleCopyPassword()}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-[8px] border px-3 py-1.5 text-[12px] transition-colors",
                copied
                  ? "border-emerald-600/40 bg-emerald-50 text-emerald-700"
                  : "border-paper-300 text-ink-700 hover:border-ink-400",
              )}
            >
              <Copy className="size-3.5" />
              {copied ? "已复制" : "复制"}
            </button>
          </div>
          {copyFailed ? (
            <p role="status" className="text-[12px] leading-relaxed text-red-600">
              当前环境不允许自动复制，请长按上方口令全选后手动复制。
            </p>
          ) : null}
          <DialogFooter>
            <button
              type="button"
              onClick={closeGenerated}
              className="rounded-[8px] inline-flex items-center gap-1.5 bg-ink-800 px-5 py-2.5 text-[12px] tracking-[0.12em] text-paper-50 transition-colors hover:bg-ink-700"
            >
              我已保存
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
