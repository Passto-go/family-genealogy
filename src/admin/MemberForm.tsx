import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useLocation, useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, Loader2, Save, Upload, Trash2 } from "lucide-react"
import { ApiError, api } from "@/lib/api"
import { useFamily } from "@/lib/family-context"
import { cn } from "@/lib/utils"
import { MemberAvatar } from "@/components/MemberAvatar"
import { AvatarCropper } from "./AvatarCropper"
import { formatBeijing } from "@/lib/time"
import {
  EMPTY_MEMBER,
  canHoldBranch,
  computeClanBloodIds,
  generationName,
  hasGenerationName,
  toChineseNumber,
  type Member,
  type MemberDraft,
} from "@/lib/types"

const inputClass =
  "mt-2 h-10 w-full rounded-[8px] border border-paper-300 bg-white px-3 text-[13px] text-ink-800 outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-ink-600"
const textareaClass =
  "mt-2 w-full rounded-[8px] resize-y border border-paper-300 bg-white px-3 py-2.5 text-[13px] leading-[1.9] text-ink-800 outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-ink-600"
const selectClass =
  "mt-2 h-10 w-full rounded-[8px] border border-paper-300 bg-white px-2.5 text-[13px] text-ink-800 outline-none transition-colors focus:border-ink-600"

function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-[12.5px] tracking-[0.18em] text-muted-foreground">{children}</span>
}

function Group({
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

function descendantIdsOf(rootId: number, members: Member[]): Set<number> {
  const children = new Map<number, number[]>()
  for (const member of members) {
    for (const parentId of [member.fatherId, member.motherId]) {
      if (!parentId) continue
      const list = children.get(parentId) ?? []
      list.push(member.id)
      children.set(parentId, list)
    }
  }
  const result = new Set<number>()
  const stack = [rootId]
  while (stack.length > 0) {
    const current = stack.pop()!
    for (const child of children.get(current) ?? []) {
      if (!result.has(child)) {
        result.add(child)
        stack.push(child)
      }
    }
  }
  return result
}

export default function MemberForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const editingId = id ? Number(id) : null
  const { family, selectFamily } = useFamily()
  const familyId = family?.id ?? 0
  const location = useLocation()
  const state = location.state as
    | { prefill?: { member?: Partial<MemberDraft>; note?: string }; from?: unknown }
    | null
  const prefill = state?.prefill ?? null
  /* 返回去向：优先回列表来源页（带回页码与筛选），否则回列表首页 */
  const backTo =
    typeof state?.from === "string" && state.from.startsWith("/admin/members")
      ? state.from
      : "/admin/members"

  const [members, setMembers] = useState<Member[]>([])
  const [draft, setDraft] = useState<MemberDraft>(EMPTY_MEMBER)
  const bloodIds = useMemo(() => computeClanBloodIds(members), [members])
  // 能否取本族字辈（决定下方「字辈」一栏是显示推算值还是说明文字）；
  // 承祧者随配偶世次取名，与族内血脉同待遇
  const draftHasZiBei =
    editingId != null
      ? bloodIds.has(editingId) || hasGenerationName(draft)
      : hasGenerationName(draft) && (draft.fatherId == null || bloodIds.has(draft.fatherId))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [prefillNote, setPrefillNote] = useState<string | null>(null)
  // 父母「条件同步」提示：当对方已被有意设为非配偶者时，仅提示、不覆盖，由用户一键同步
  const [parentSyncHint, setParentSyncHint] = useState<{
    target: "father" | "mother"
    suggestedId: number
  } | null>(null)
  const [meta, setMeta] = useState<{
    createdBy: string
    updatedBy: string
    createdAt: string
    updatedAt: string
  } | null>(null)
  const [avatarKey, setAvatarKey] = useState("")
  const [avatarError, setAvatarError] = useState("")
  const [cropFile, setCropFile] = useState<File | null>(null)

  const load = useCallback(async () => {
    try {
      // 修订时先取全部族人，据成员自身归属定位族谱，避免跨谱误改；
      // 但父母 / 配偶下拉仅展示该成员所属家族，故定位后按 familyId 收敛成员列表
      const data = await api.getMembers(editingId ? undefined : familyId || undefined)
      const allMembers = data.members

      if (editingId) {
        const found = allMembers.find((member) => member.id === editingId)
        if (!found) {
          setError("未找到该族人，或您无权访问其他家族的数据")
        } else {
          if (found.familyId !== familyId) selectFamily(found.familyId)
          setMembers(allMembers.filter((member) => member.familyId === found.familyId))
          setDraft({
            familyId: found.familyId,
            name: found.name,
            gender: found.gender,
            generation: found.generation,
            courtesyName: found.courtesyName,
            fatherId: found.fatherId,
            motherId: found.motherId,
            spouseId: found.spouseId,
            isMarriedIn: found.isMarriedIn,
            isBranchHeir: found.isBranchHeir,
            branch: found.branch,
            birthYear: found.birthYear,
            deathYear: found.deathYear,
            isAlive: found.isAlive,
            burialPlace: found.burialPlace,
            title: found.title || "",
            bio: found.bio,
            sortOrder: found.sortOrder,
            avatarKey: found.avatarKey ?? "",
          })
          setMeta({
            createdBy: found.createdBy,
            updatedBy: found.updatedBy,
            createdAt: found.createdAt,
            updatedAt: found.updatedAt,
          })
          setAvatarKey(found.avatarKey ?? "")
        }
      } else {
        setMembers(allMembers)
        const maxGeneration = allMembers.reduce(
          (max, member) => Math.max(max, member.generation),
          1,
        )
        if (prefill?.member) {
          setDraft({
            ...EMPTY_MEMBER,
            familyId,
            ...prefill.member,
            generation: Number(prefill.member.generation ?? maxGeneration),
          })
          setPrefillNote(prefill.note ?? null)
        } else {
          setDraft((prev) => ({ ...prev, familyId, generation: maxGeneration }))
        }
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "读取数据失败")
    } finally {
      setLoading(false)
    }
  }, [editingId, familyId, selectFamily, prefill])

  useEffect(() => {
    void load()
  }, [load])

  const excluded = useMemo(() => {
    if (!editingId) return new Set<number>()
    const set = descendantIdsOf(editingId, members)
    set.add(editingId)
    return set
  }, [editingId, members])

  const groupedOptions = useMemo(() => {
    const map = new Map<number, Member[]>()
    for (const member of members) {
      if (excluded.has(member.id)) continue
      const list = map.get(member.generation) ?? []
      list.push(member)
      map.set(member.generation, list)
    }
    return [...map.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([generation, list]) => ({
        generation,
        members: list.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id),
      }))
  }, [members, excluded])

  const branchOptions = useMemo(() => {
    const set = new Set<string>(family?.branches ?? [])
    if (draft.branch) set.add(draft.branch)
    return [...set].sort()
  }, [family?.branches, draft.branch])

  const generationOptions = useMemo(() => {
    const max = members.reduce((value, member) => Math.max(value, member.generation), 1)
    return Array.from({ length: Math.max(max + 1, 3) }, (_, index) => index + 1)
  }, [members])

  function update<K extends keyof MemberDraft>(key: K, value: MemberDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }))
    setError("")
  }

  // 勾选 / 取消「外姓配偶」：普通配偶不持本族房支，故一并清空房支；承祧者例外
  function setMarriedIn(checked: boolean) {
    setDraft((prev) => ({
      ...prev,
      isMarriedIn: checked,
      // 取消配偶身份即回到族人语义，承祧位随之失效
      isBranchHeir: checked ? prev.isBranchHeir : false,
      branch: checked && !prev.isBranchHeir ? "" : prev.branch,
    }))
    setError("")
  }

  // 勾选「入赘承祧」：取得房分与字辈，房支为空时随配偶（本族那一方）带入
  function setBranchHeir(checked: boolean) {
    setDraft((prev) => {
      const spouse =
        prev.spouseId != null ? members.find((member) => member.id === prev.spouseId) : null
      return {
        ...prev,
        isBranchHeir: checked,
        branch: checked ? prev.branch || spouse?.branch || "" : "",
        // 入赘者随本族配偶同世：否则子女世次会按其默认世次推算而错位
        generation: checked && spouse ? spouse.generation : prev.generation,
      }
    })
    setError("")
  }

  // 选择父 / 母后即时预览：世次 = 父/母世次 + 1（父亲优先）；房支为空时继承父/母房支。
  // 配偶联动采用「条件同步」：
  //   对方为空 → 直接补入；
  //   此前父母本是一对（母亲即原父亲的配偶）→ 改父亲后同步为新父亲的配偶；
  //   此前并非一对（如庶母 / 继室等有意指定）→ 不覆盖，仅提示用户一键同步。
  function applyParentAutoFill(parentId: number | null, side: "father" | "mother") {
    const previousFather =
      draft.fatherId != null ? members.find((member) => member.id === draft.fatherId) : null
    const previousMother =
      draft.motherId != null ? members.find((member) => member.id === draft.motherId) : null
    // 改动前父母是否互为配偶：是则视为「此前由自动带入形成的一致配对」，可安全跟随更新
    const pairWasConsistent =
      side === "father"
        ? previousFather?.spouseId != null && previousFather.spouseId === draft.motherId
        : previousMother?.spouseId != null && previousMother.spouseId === draft.fatherId

    const next = { ...draft }
    if (side === "father") next.fatherId = parentId
    else next.motherId = parentId
    setParentSyncHint(null)

    if (parentId != null) {
      const parent = members.find((member) => member.id === parentId)
      if (parent) {
        if (side === "father" || next.fatherId == null) {
          next.generation = parent.generation + 1
        }
        // 普通外姓配偶不继承房支；入赘承祧者与血脉成员才随父/母代入
        if (!next.branch && parent.branch && canHoldBranch(next)) next.branch = parent.branch

        const spouseId = parent.spouseId
        if (spouseId != null && spouseId !== parentId) {
          const otherValue = side === "father" ? next.motherId : next.fatherId
          if (otherValue === spouseId) {
            // 已经一致，无需处理
          } else if (otherValue == null || pairWasConsistent) {
            // 空值补入，或此前本是一对 → 跟随同步
            if (side === "father") next.motherId = spouseId
            else next.fatherId = spouseId
          } else {
            // 对方为用户有意指定的非配偶者 → 不覆盖，仅提示一键同步
            setParentSyncHint({
              target: side === "father" ? "mother" : "father",
              suggestedId: spouseId,
            })
          }
        }
      }
    }

    setDraft(next)
    setError("")
  }

  function applyParentSync() {
    if (!parentSyncHint) return
    setDraft((prev) => {
      const next = { ...prev }
      if (parentSyncHint.target === "father") next.fatherId = parentSyncHint.suggestedId
      else next.motherId = parentSyncHint.suggestedId
      return next
    })
    setParentSyncHint(null)
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!draft.name.trim()) {
      setError("请填写姓名")
      return
    }
    setSaving(true)
    setError("")
    // 统一收口：普通外姓配偶不持房支，即便旧数据残留也在此清空，避免印谱出现「居X房」
    const payload = canHoldBranch(draft) ? draft : { ...draft, branch: "" }
    try {
      if (editingId) {
        await api.updateMember(editingId, payload)
      } else {
        await api.createMember(payload)
      }
      navigate(backTo)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "保存失败")
    } finally {
      setSaving(false)
    }
  }

  async function uploadAvatarBlob(blob: Blob) {
    if (!editingId) return
    setAvatarError("")
    try {
      const fd = new FormData()
      fd.append("file", blob, "avatar.webp")
      const res = await api.uploadMemberAvatar(editingId, fd)
      setAvatarKey(res.avatarKey)
      // 同步草稿的 avatarKey，避免后续「保存」经 updateMember 把陈旧 key 写回、覆盖本次上传
      setDraft((prev) => ({ ...prev, avatarKey: res.avatarKey }))
    } catch (err) {
      setAvatarError(err instanceof ApiError ? err.message : "头像上传失败")
    }
  }

  function handleAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file || !editingId) return
    if (file.size > 5 * 1024 * 1024) {
      setAvatarError("图片过大（上限 5MB）")
      return
    }
    setCropFile(file)
  }

  function handleCropped(blob: Blob) {
    setCropFile(null)
    void uploadAvatarBlob(blob)
  }

  async function handleAvatarRemove() {
    if (!editingId) return
    setAvatarError("")
    try {
      await api.deleteMemberAvatar(editingId)
      setAvatarKey("")
      // 同步草稿的 avatarKey，避免后续「保存」经 updateMember 把陈旧 key 写回、使移除失效
      setDraft((prev) => ({ ...prev, avatarKey: "" }))
    } catch (err) {
      setAvatarError(err instanceof ApiError ? err.message : "移除失败")
    }
  }

  function renderOptions(placeholder: string) {
    return (
      <>
        <option value="">{placeholder}</option>
        {groupedOptions.map((group) => (
          <optgroup key={group.generation} label={`第${toChineseNumber(group.generation)}世`}>
            {group.members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
                {member.courtesyName ? `（字${member.courtesyName}）` : ""}
                {member.branch && canHoldBranch(member) ? ` · ${member.branch}` : ""}
              </option>
            ))}
          </optgroup>
        ))}
      </>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> 正在读取族谱
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            to={backTo}
            className="inline-flex items-center gap-1.5 text-[12.5px] tracking-[0.12em] text-muted-foreground transition-colors hover:text-ink-700"
          >
            <ArrowLeft className="size-3.5" />
            返回名录
          </Link>
          <h1 className="mt-2 font-song text-[25px] tracking-[0.12em] text-ink-800">
            {editingId ? "修订族人" : "新增族人"}
          </h1>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="rounded-[8px] inline-flex items-center gap-1.5 bg-ink-800 px-5 py-2.5 text-[12px] tracking-[0.12em] text-paper-50 transition-colors hover:bg-ink-700 disabled:opacity-60"
        >
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
          保存
        </button>
      </div>

      {error ? (
        <p className="border-l-2 border-seal-600 bg-seal-100 px-3 py-2 text-[12px] text-seal-700">
          {error}
        </p>
      ) : null}

      {prefillNote ? (
        <div className="whitespace-pre-line rounded-[8px] border border-gold-600/30 bg-gold-50 px-3.5 py-2.5 text-[12px] leading-[1.9] text-ink-700">
          {prefillNote}
        </div>
      ) : null}

      {editingId ? (
        <Group
          title="头像"
          description="微信式圆角方形；无头像时自动以姓名末字占位。选择图片后可自由裁剪区域与比例（正方形建议 1:1），自动压缩为 WebP（≤5MB）"
        >
          <div className="flex items-center gap-4">
            <MemberAvatar member={{ name: draft.name, avatarKey }} size={88} />
            <div className="flex flex-col gap-2">
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-[8px] bg-ink-800 px-4 py-2 text-[12px] tracking-[0.12em] text-paper-50 transition-colors hover:bg-ink-700">
                <Upload className="size-3.5" />
                选择图片
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
              </label>
              {avatarKey ? (
                <button
                  type="button"
                  onClick={handleAvatarRemove}
                  className="rounded-[8px] inline-flex items-center gap-1.5 border border-paper-300 bg-paper-50 px-4 py-2 text-[12px] tracking-[0.12em] text-ink-600 transition-colors hover:border-ink-400"
                >
                  <Trash2 className="size-3.5" />
                  移除
                </button>
              ) : null}
              {avatarError ? (
                <span className="text-[11px] text-seal-700">{avatarError}</span>
              ) : null}
            </div>
          </div>
        </Group>
      ) : null}

      {cropFile ? (
        <AvatarCropper
          file={cropFile}
          onCancel={() => setCropFile(null)}
          onConfirm={handleCropped}
        />
      ) : null}

      <Group title="基本信息" description="姓名与世次为必填项">
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block">
            <Label>姓名 *</Label>
            <input
              value={draft.name}
              onChange={(event) => update("name", event.target.value)}
              className={inputClass}
              placeholder="如：陈昭文"
              required
            />
          </label>

          <label className="block">
            <Label>性别</Label>
            <select
              value={draft.gender}
              onChange={(event) => update("gender", event.target.value as MemberDraft["gender"])}
              className={selectClass}
            >
              <option value="male">男</option>
              <option value="female">女</option>
            </select>
          </label>

          <label className="block">
            <Label>世次 *</Label>
            <select
              value={draft.generation}
              onChange={(event) => update("generation", Number(event.target.value))}
              className={selectClass}
            >
              {generationOptions.map((value) => (
                <option key={value} value={value}>
                  第{toChineseNumber(value)}世
                </option>
              ))}
            </select>
          </label>

          <div className="block">
            <Label>字辈</Label>
            {draftHasZiBei ? (
              <div className="mt-2 flex h-10 items-center gap-2 rounded-[8px] border border-paper-300 bg-paper-100 px-3 text-[13px] text-ink-700">
                {generationName(family, draft.generation) || "—"}
                <span className="text-[10.5px] text-muted-foreground">
                  依字辈诗与第{toChineseNumber(draft.generation)}世自动推算
                </span>
              </div>
            ) : (
              <div className="mt-2 flex h-10 items-center rounded-[8px] border border-paper-300 bg-paper-100 px-3 text-[12px] text-muted-foreground">
                {draft.isMarriedIn
                  ? `外姓配偶：随配偶入第${toChineseNumber(draft.generation)}世，不取本族字辈`
                  : "非本族血脉，不取本族字辈"}
              </div>
            )}
          </div>

          <label className="block">
            <Label>字号</Label>
            <input
              value={draft.courtesyName}
              onChange={(event) => update("courtesyName", event.target.value)}
              className={inputClass}
              placeholder="如：明之"
            />
          </label>

          <label className="block">
            <Label>房支 / 派系</Label>
            <select
              value={draft.branch}
              onChange={(event) => update("branch", event.target.value)}
              disabled={!canHoldBranch(draft)}
              className={cn(selectClass, !canHoldBranch(draft) && "cursor-not-allowed opacity-60")}
            >
              <option value="">未记载</option>
              {branchOptions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            {!canHoldBranch(draft) ? (
              <span className="mt-1.5 block text-[10.5px] leading-relaxed text-muted-foreground/80">
                外姓配偶不取本族房支。若其入赘承顶房分，请勾选「入赘承祧」
              </span>
            ) : branchOptions.length === 0 ? (
              <span className="mt-1.5 block text-[10.5px] text-muted-foreground/80">
                派系列表尚未维护，请先到「家族信息」登记各派
              </span>
            ) : null}
          </label>

          <label className="block">
            <Label>身份 / 功名 / 职业</Label>
            <input
              value={draft.title}
              onChange={(event) => update("title", event.target.value)}
              className={inputClass}
              placeholder="如：邑庠生"
            />
          </label>

          <label className="block">
            <Label>同辈排行（长幼次序）</Label>
            <input
              type="number"
              value={draft.sortOrder}
              onChange={(event) => update("sortOrder", Number(event.target.value) || 0)}
              className={inputClass}
              placeholder="0"
            />
            <span className="mt-1.5 block text-[10.5px] leading-relaxed text-muted-foreground/80">
              同一父母所生子女中的长幼序号，1 为长（老大）、2 次之；决定世系图中兄弟的左右排列
            </span>
          </label>

          <label className="flex items-start gap-2.5 pt-6">
            <input
              type="checkbox"
              checked={draft.isMarriedIn}
              onChange={(event) => setMarriedIn(event.target.checked)}
              className="mt-0.5 size-4 accent-ink-800"
            />
            <span className="text-[12px] leading-relaxed text-ink-700">
              外姓配偶（本族成员的夫 / 妻）
              <span className="mt-0.5 block text-[10.5px] leading-relaxed text-muted-foreground">
                勾选后此人以配偶身份附于族人节点旁，不取本族字辈与房支。族人女儿出嫁所生子女属外姓但不属「配偶」，请勿勾选。
              </span>
            </span>
          </label>

          <label
            className={cn(
              "flex items-start gap-2.5 pt-6",
              !draft.isMarriedIn && "cursor-not-allowed opacity-60",
            )}
          >
            <input
              type="checkbox"
              checked={draft.isBranchHeir}
              disabled={!draft.isMarriedIn}
              onChange={(event) => setBranchHeir(event.target.checked)}
              className="mt-0.5 size-4 accent-ink-800 disabled:cursor-not-allowed"
            />
            <span className="text-[12px] leading-relaxed text-ink-700">
              入赘承祧（取得本族房分）
              <span className="mt-0.5 block text-[10.5px] leading-relaxed text-muted-foreground">
                赘婿承顶女方房分、过继入族者勾选：本人仍不计入族人血脉，但可取本族字辈、可持房支，其与族人所生子女经母系归入本族。
              </span>
            </span>
          </label>
        </div>
      </Group>

      <Group title="生卒与葬地">
        <div className="grid gap-5 sm:grid-cols-3">
          <label className="block">
            <Label>生年</Label>
            <input
              value={draft.birthYear}
              onChange={(event) => update("birthYear", event.target.value)}
              className={inputClass}
              placeholder="如：1568"
            />
          </label>
          <label className="block">
            <Label>卒年</Label>
            <input
              value={draft.deathYear}
              onChange={(event) => update("deathYear", event.target.value)}
              className={inputClass}
              placeholder="如：1636"
            />
          </label>
          <label className="flex items-start gap-2.5 pt-6">
            <input
              type="checkbox"
              checked={draft.isAlive}
              onChange={(event) => update("isAlive", event.target.checked)}
              className="mt-0.5 size-4 accent-ink-800"
            />
            <span className="text-[12px] text-ink-700">在世</span>
          </label>
        </div>

        <label className="block">
          <Label>葬地</Label>
          <input
            value={draft.burialPlace}
            onChange={(event) => update("burialPlace", event.target.value)}
            className={inputClass}
            placeholder="如：晋江二十四都梅溪山"
          />
        </label>
      </Group>

      <Group title="亲属关系" description="父辈与配偶的选择不可指向本人或其后代">
        <div className="grid gap-5 sm:grid-cols-3">
          <label className="block">
            <Label>父</Label>
            <select
              value={draft.fatherId ?? ""}
              onChange={(event) =>
                applyParentAutoFill(event.target.value ? Number(event.target.value) : null, "father")
              }
              className={selectClass}
            >
              {renderOptions("未记载")}
            </select>
          </label>

          <label className="block">
            <Label>母</Label>
            <select
              value={draft.motherId ?? ""}
              onChange={(event) =>
                applyParentAutoFill(event.target.value ? Number(event.target.value) : null, "mother")
              }
              className={selectClass}
            >
              {renderOptions("未记载")}
            </select>
          </label>

          <label className="block">
            <Label>配偶</Label>
            <select
              value={draft.spouseId ?? ""}
              onChange={(event) =>
                update("spouseId", event.target.value ? Number(event.target.value) : null)
              }
              className={selectClass}
            >
              {renderOptions("未记载")}
            </select>
          </label>
        </div>

        {parentSyncHint ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-l-2 border-gold-600 bg-gold-50 px-3 py-2 text-[11.5px] leading-relaxed text-ink-700">
            <span>
              {parentSyncHint.target === "mother"
                ? "母亲与所选父亲不是配偶关系，是否将母亲同步为父亲的配偶？"
                : "父亲与所选母亲不是配偶关系，是否将父亲同步为母亲的配偶？"}
            </span>
            <button
              type="button"
              onClick={applyParentSync}
              className="rounded-[6px] border border-gold-600/50 px-2 py-0.5 text-[11.5px] tracking-[0.04em] text-gold-700 transition-colors hover:border-gold-600 hover:text-ink-800"
            >
              {parentSyncHint.target === "mother" ? "同步为父亲的配偶" : "同步为母亲的配偶"}
            </button>
            <button
              type="button"
              onClick={() => setParentSyncHint(null)}
              className="text-[11.5px] text-muted-foreground transition-colors hover:text-ink-600"
            >
              保留原值
            </button>
          </div>
        ) : null}
      </Group>

      <Group title="生平">
        <label className="block">
          <Label>行实 / 生平</Label>
          <textarea
            value={draft.bio}
            rows={7}
            onChange={(event) => update("bio", event.target.value)}
            className={textareaClass}
            placeholder="记述生平事略、德行功业"
          />
        </label>
      </Group>

      {meta ? (
        <p className="text-[11.5px] tracking-[0.06em] text-muted-foreground">
          创建人：{meta.createdBy || "—"}
          {meta.createdAt ? `（${formatBeijing(meta.createdAt)}）` : ""} · 最近维护：
          {meta.updatedBy || "—"}
          {meta.updatedAt ? `（${formatBeijing(meta.updatedAt)}）` : ""}
        </p>
      ) : null}

      <div className={cn("flex justify-end gap-2 pb-4")}>
        <Link
          to={backTo}
          className="inline-flex items-center rounded-[8px] border border-paper-300 bg-paper-50 px-5 py-2.5 text-[12px] tracking-[0.12em] text-ink-600 transition-colors hover:border-ink-400"
        >
          取消
        </Link>
        <button
          type="submit"
          disabled={saving}
          className="rounded-[8px] inline-flex items-center gap-1.5 bg-ink-800 px-6 py-2.5 text-[12px] tracking-[0.12em] text-paper-50 transition-colors hover:bg-ink-700 disabled:opacity-60"
        >
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
          保存
        </button>
      </div>
    </form>
  )
}
