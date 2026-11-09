import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { ArrowLeft, CheckCircle2, Loader2, Send } from "lucide-react"
import { ApiError, api } from "@/lib/api"
import { useTenantOptional } from "@/lib/tenant-context"
import { useFeedbackEnabled } from "@/lib/site-config"
import { Seal } from "@/components/site/Seal"
import { cn } from "@/lib/utils"
import type { FamilySummary } from "@/lib/types"

const inputClass =
  "mt-2 h-10 w-full border border-paper-300 bg-white px-3 text-[13px] text-ink-800 outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-ink-600"
const textareaClass =
  "mt-2 w-full resize-y border border-paper-300 bg-white px-3 py-2.5 text-[13px] leading-[1.9] text-ink-800 outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-ink-600"
const selectClass =
  "mt-2 h-10 w-full border border-paper-300 bg-white px-2.5 text-[13px] text-ink-800 outline-none transition-colors focus:border-ink-600"

interface FeedbackForm {
  reporterName: string
  message: string
  name: string
  gender: "male" | "female"
  generation: number
  courtesyName: string
  isMarriedIn: boolean
  branch: string
  title: string
  sortOrder: number
  birthYear: string
  deathYear: string
  isAlive: boolean
  burialPlace: string
  bio: string
  fatherName: string
  motherName: string
  spouseName: string
}

const EMPTY: FeedbackForm = {
  reporterName: "",
  message: "",
  name: "",
  gender: "male",
  generation: 1,
  courtesyName: "",
  isMarriedIn: false,
  branch: "",
  title: "",
  sortOrder: 0,
  birthYear: "",
  deathYear: "",
  isAlive: true,
  burialPlace: "",
  bio: "",
  fatherName: "",
  motherName: "",
  spouseName: "",
}

const OTHER_FAMILY = "__other__"

export default function Feedback() {
  const tenant = useTenantOptional()
  const slug = tenant?.slug ?? ""
  const family = tenant?.family ?? null
  // 族内入口（/t/:slug/feedback）与首页直达（/feedback）一致：所属家族均由反馈人自行选择
  const isTenant = Boolean(slug)
  const [form, setForm] = useState<FeedbackForm>(EMPTY)
  const [publicFamilies, setPublicFamilies] = useState<FamilySummary[]>([])
  const [familyChoice, setFamilyChoice] = useState<string>(slug)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [done, setDone] = useState(false)
  const feedbackEnabled = useFeedbackEnabled()

  useEffect(() => {
    api
      .listPublicFamilies()
      .then((data) => setPublicFamilies(data.families))
      .catch(() => setPublicFamilies([]))
  }, [])

  function update<K extends keyof FeedbackForm>(key: K, value: FeedbackForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setError("")
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!form.reporterName.trim()) {
      setError("请填写反馈人姓名")
      return
    }
    if (!form.message.trim() && !form.name.trim()) {
      setError("请填写反馈信息，或至少提供一位族人姓名")
      return
    }
    if (!familyChoice) {
      setError("请选择所属家族")
      return
    }
    setSaving(true)
    setError("")
    try {
      const payload = {
        name: form.name,
        gender: form.gender,
        generation: form.generation,
        courtesyName: form.courtesyName,
        isMarriedIn: form.isMarriedIn,
        // 承祧属族内认定，公开反馈表单不提供该选项，一律按普通配偶处理
        isBranchHeir: false,
        branch: form.branch,
        title: form.title,
        sortOrder: form.sortOrder,
        birthYear: form.birthYear,
        deathYear: form.deathYear,
        isAlive: form.isAlive,
        burialPlace: form.burialPlace,
        bio: form.bio,
        fatherName: form.fatherName,
        motherName: form.motherName,
        spouseName: form.spouseName,
      }
      await api.submitFeedbackPublic({
        familySlug: familyChoice === OTHER_FAMILY ? undefined : familyChoice,
        familyLabel: familyChoice === OTHER_FAMILY ? "其他家族" : undefined,
        reporterName: form.reporterName,
        message: form.message,
        payload,
      })
      setDone(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "提交失败，请稍后再试")
    } finally {
      setSaving(false)
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-[760px] px-6 py-20">
        <div className="flex flex-col items-center gap-4 border border-paper-300 bg-paper-50 px-8 py-16 text-center">
          <CheckCircle2 className="size-9 text-gold-700" />
          <h1 className="font-song text-[24px] tracking-[0.16em] text-ink-800">已收到您的反馈</h1>
          <p className="max-w-md text-[12.5px] leading-relaxed text-muted-foreground">
            感谢您补正族谱。管理员核对后会将信息录入世系，如有疑问可能据此反馈人与您联系。
          </p>
          <Link
            to={isTenant ? `/t/${encodeURIComponent(slug)}` : "/"}
            className="mt-2 inline-flex items-center gap-1.5 text-[11.5px] tracking-[0.2em] text-ink-600 hover:text-ink-800"
          >
            {isTenant ? "返回本族首页" : "返回网站首页"}
          </Link>
        </div>
      </div>
    )
  }

  const branchOptions = family?.branches ?? []

  // 反馈通道关闭：前端隐藏表单，直接展示未开启提示（服务端亦会拒绝提交）
  if (!feedbackEnabled) {
    return (
      <div className="mx-auto max-w-[760px] px-6 py-20">
        <div className="flex flex-col items-center gap-4 border border-paper-300 bg-paper-50 px-8 py-16 text-center">
          <Seal char="封" size={44} tone="gold" />
          <h1 className="font-song text-[24px] tracking-[0.16em] text-ink-800">反馈通道未开启</h1>
          <p className="max-w-md text-[12.5px] leading-relaxed text-muted-foreground">
            本站当前未开放信息反馈通道。如需联系网站管理员，请致信 admin@example.com。
          </p>
          <Link
            to={isTenant ? `/t/${encodeURIComponent(slug)}` : "/"}
            className="mt-2 inline-flex items-center gap-1.5 text-[11.5px] tracking-[0.2em] text-ink-600 hover:text-ink-800"
          >
            {isTenant ? "返回本族首页" : "返回网站首页"}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[760px] px-6 py-16 sm:py-20">
      <Link
        to={isTenant ? `/t/${encodeURIComponent(slug)}` : "/"}
        className="inline-flex items-center gap-1.5 text-[12.5px] tracking-[0.12em] text-muted-foreground transition-colors hover:text-ink-700"
      >
        <ArrowLeft className="size-3.5" />
        {isTenant ? "返回本族首页" : "返回网站首页"}
      </Link>
      <h1 className="mt-4 font-song text-[26px] tracking-[0.14em] text-ink-800">信息反馈</h1>
      <p className="mt-3 text-[12.5px] leading-[2] text-muted-foreground">
        若族中某人信息有误或尚缺载录，请于此提交。所列字段尽量与后台「新增族人」一致，便于管理员核对录入。父、母、配偶请填姓名（非必填），由管理员据谱对应。
      </p>

      {error ? (
        <p className="mt-6 border-l-2 border-seal-600 bg-seal-100 px-3 py-2 text-[12px] text-seal-700">
          {error}
        </p>
      ) : null}

      <form onSubmit={handleSubmit} className="mt-8 space-y-6">
        <section className="border border-paper-300 bg-paper-50">
          <header className="border-b border-paper-200 px-6 py-4">
            <h2 className="font-song text-[15px] tracking-[0.14em] text-ink-800">反馈人信息</h2>
          </header>
          <div className="space-y-5 px-6 py-5">
            <label className="block">
              <span className="text-[12.5px] tracking-[0.18em] text-muted-foreground">所属家族 *</span>
              <select
                value={familyChoice}
                onChange={(e) => {
                  setFamilyChoice(e.target.value)
                  setError("")
                }}
                className={selectClass}
              >
                <option value="">请选择所属家族</option>
                {publicFamilies.map((f) => (
                  <option key={f.slug} value={f.slug}>
                    {f.name || `${f.tag}族谱`}
                  </option>
                ))}
                <option value={OTHER_FAMILY}>其他家族（由总管理员核对归族）</option>
              </select>
            </label>
            <label className="block">
              <span className="text-[12.5px] tracking-[0.18em] text-muted-foreground">反馈人姓名 *</span>
              <input
                value={form.reporterName}
                onChange={(e) => update("reporterName", e.target.value)}
                className={inputClass}
                placeholder="您的称呼"
              />
            </label>
            <label className="block">
              <span className="text-[12.5px] tracking-[0.18em] text-muted-foreground">反馈信息 *</span>
              <textarea
                value={form.message}
                onChange={(e) => update("message", e.target.value)}
                rows={4}
                className={textareaClass}
                placeholder="请说明需更正或补充的内容"
              />
            </label>
          </div>
        </section>

        <section className="border border-paper-300 bg-paper-50">
          <header className="border-b border-paper-200 px-6 py-4">
            <h2 className="font-song text-[15px] tracking-[0.14em] text-ink-800">族人资料</h2>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
              仅填写您要补正的那位族人即可；无该项则留空。
            </p>
          </header>
          <div className="space-y-5 px-6 py-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block">
                <span className="text-[12.5px] tracking-[0.18em] text-muted-foreground">姓名 *</span>
                <input
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                  className={inputClass}
                  placeholder="如：陈昭文"
                />
              </label>
              <label className="block">
                <span className="text-[12.5px] tracking-[0.18em] text-muted-foreground">性别</span>
                <select
                  value={form.gender}
                  onChange={(e) => update("gender", e.target.value as FeedbackForm["gender"])}
                  className={selectClass}
                >
                  <option value="male">男</option>
                  <option value="female">女</option>
                </select>
              </label>
              <label className="block">
                <span className="text-[12.5px] tracking-[0.18em] text-muted-foreground">世次 *</span>
                <input
                  type="number"
                  min={1}
                  value={form.generation}
                  onChange={(e) => update("generation", Number(e.target.value) || 1)}
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className="text-[12.5px] tracking-[0.18em] text-muted-foreground">字号</span>
                <input
                  value={form.courtesyName}
                  onChange={(e) => update("courtesyName", e.target.value)}
                  className={inputClass}
                  placeholder="如：明之"
                />
              </label>
              <label className="block">
                <span className="text-[12.5px] tracking-[0.18em] text-muted-foreground">房支</span>
                <input
                  value={form.branch}
                  onChange={(e) => update("branch", e.target.value)}
                  className={inputClass}
                  placeholder="如：长房"
                  list="feedback-branches"
                />
                {branchOptions.length > 0 ? (
                  <datalist id="feedback-branches">
                    {branchOptions.map((b) => (
                      <option key={b} value={b} />
                    ))}
                  </datalist>
                ) : null}
              </label>
              <label className="block">
                <span className="text-[12.5px] tracking-[0.18em] text-muted-foreground">身份 / 功名 / 职业</span>
                <input
                  value={form.title}
                  onChange={(e) => update("title", e.target.value)}
                  className={inputClass}
                  placeholder="如：邑庠生"
                />
              </label>
              <label className="block">
                <span className="text-[12.5px] tracking-[0.18em] text-muted-foreground">父（姓名）</span>
                <input
                  value={form.fatherName}
                  onChange={(e) => update("fatherName", e.target.value)}
                  className={inputClass}
                  placeholder="填姓名，非必填"
                />
              </label>
              <label className="block">
                <span className="text-[12.5px] tracking-[0.18em] text-muted-foreground">母（姓名）</span>
                <input
                  value={form.motherName}
                  onChange={(e) => update("motherName", e.target.value)}
                  className={inputClass}
                  placeholder="填姓名，非必填"
                />
              </label>
              <label className="block">
                <span className="text-[12.5px] tracking-[0.18em] text-muted-foreground">配偶（姓名）</span>
                <input
                  value={form.spouseName}
                  onChange={(e) => update("spouseName", e.target.value)}
                  className={inputClass}
                  placeholder="填姓名，非必填"
                />
              </label>
            </div>

            <label className="flex items-start gap-2.5 pt-1">
              <input
                type="checkbox"
                checked={form.isMarriedIn}
                onChange={(e) => update("isMarriedIn", e.target.checked)}
                className="mt-0.5 size-4 accent-ink-800"
              />
              <span className="text-[12px] leading-relaxed text-ink-700">
                外姓配偶
                <span className="mt-0.5 block text-[10.5px] text-muted-foreground">
                  勾选后此人附于配偶节点之侧，不单独占据世系主干
                </span>
              </span>
            </label>

            <div className="grid gap-5 sm:grid-cols-3">
              <label className="block">
                <span className="text-[12.5px] tracking-[0.18em] text-muted-foreground">生年</span>
                <input
                  value={form.birthYear}
                  onChange={(e) => update("birthYear", e.target.value)}
                  className={inputClass}
                  placeholder="如：1568"
                />
              </label>
              <label className="block">
                <span className="text-[12.5px] tracking-[0.18em] text-muted-foreground">卒年</span>
                <input
                  value={form.deathYear}
                  onChange={(e) => update("deathYear", e.target.value)}
                  className={inputClass}
                  placeholder="如：1636"
                />
              </label>
              <label className="flex items-start gap-2.5 pt-6">
                <input
                  type="checkbox"
                  checked={form.isAlive}
                  onChange={(e) => update("isAlive", e.target.checked)}
                  className="mt-0.5 size-4 accent-ink-800"
                />
                <span className="text-[12px] text-ink-700">在世</span>
              </label>
            </div>

            <label className="block">
              <span className="text-[12.5px] tracking-[0.18em] text-muted-foreground">葬地</span>
              <input
                value={form.burialPlace}
                onChange={(e) => update("burialPlace", e.target.value)}
                className={inputClass}
                placeholder="如：晋江二十四都梅溪山"
              />
            </label>

            <label className="block">
              <span className="text-[12.5px] tracking-[0.18em] text-muted-foreground">行实 / 生平</span>
              <textarea
                value={form.bio}
                rows={5}
                onChange={(e) => update("bio", e.target.value)}
                className={textareaClass}
                placeholder="记述生平事略、德行功业"
              />
            </label>
          </div>
        </section>

        <div className={cn("flex justify-end gap-2")}>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 bg-ink-800 px-6 py-2.5 text-[12px] tracking-[0.12em] text-paper-50 transition-colors hover:bg-ink-700 disabled:opacity-60"
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
            提交反馈
          </button>
        </div>
      </form>
    </div>
  )
}
