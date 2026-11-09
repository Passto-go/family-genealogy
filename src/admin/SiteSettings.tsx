import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { ArrowUpRight, Globe, ImageIcon, Landmark, Loader2, ShieldCheck } from "lucide-react"
import { ApiError, api, type DomainView } from "@/lib/api"
import { useAuth } from "@/lib/admin-context"
import { useFamily } from "@/lib/family-context"
import { usePrimaryFiling } from "@/lib/filing"
import {
  setSiteName as setGlobalSiteName,
  setFeedbackEnabled,
  applyFavicon,
  DEFAULT_SITE_NAME,
} from "@/lib/site-config"
import { cn } from "@/lib/utils"

const cardClass =
  "rounded-[14px] border border-ink-800/10 bg-paper-50 shadow-[0_1px_2px_rgba(12,33,41,0.04),0_8px_24px_-16px_rgba(12,33,41,0.16)]"

const inputClass =
  "mt-2 h-10 w-full rounded-[8px] border border-paper-300 bg-white px-3 text-[13px] text-ink-800 outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-ink-600"

const labelClass = "text-[12.5px] tracking-[0.18em] text-muted-foreground"

const STATUS_LABEL: Record<string, string> = {
  pending: "待签发",
  issuing: "签发中",
  active: "已生效",
  failed: "失败",
  renewing: "续期中",
}

type Message = { tone: "ok" | "error"; text: string }

function MessageBar({ message }: { message: Message }) {
  return (
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
  )
}

/** 系统栏目 · 网站设置（仅超级管理员）：网站名称、当前证书域名、备案信息 */
export default function SiteSettings() {
  const { user } = useAuth()
  const isSuper = user?.role === "super"
  const { families, family, setFamily } = useFamily()
  const filing = usePrimaryFiling()

  const [siteName, setSiteNameInput] = useState("")
  const [savingName, setSavingName] = useState(false)
  const [nameMessage, setNameMessage] = useState<Message | null>(null)

  const [feedbackEnabled, setFeedbackEnabledState] = useState(false)
  const [savingFeedback, setSavingFeedback] = useState(false)
  const [feedbackMessage, setFeedbackMessage] = useState<Message | null>(null)

  const [domains, setDomains] = useState<DomainView[]>([])
  const [domainsLoaded, setDomainsLoaded] = useState(false)

  const [icp, setIcp] = useState("")
  const [police, setPolice] = useState("")
  const [savingFiling, setSavingFiling] = useState(false)
  const [filingMessage, setFilingMessage] = useState<Message | null>(null)

  const [faviconDraft, setFaviconDraft] = useState("")
  const [faviconMessage, setFaviconMessage] = useState<Message | null>(null)
  const [savingFavicon, setSavingFavicon] = useState(false)

  useEffect(() => {
    if (!isSuper) return
    let active = true
    api
      .getSiteConfig()
      .then((data) => {
        if (active) {
          setSiteNameInput(data.siteName)
          setFeedbackEnabledState(data.feedbackEnabled ?? false)
          const fav = data.faviconDataUrl ?? ""
          setFaviconDraft(fav)
        }
      })
      .catch(() => {})
    api
      .listDomains()
      .then((data) => {
        if (active) setDomains(data.domains)
      })
      .catch(() => {})
      .finally(() => {
        if (active) setDomainsLoaded(true)
      })
    return () => {
      active = false
    }
  }, [isSuper])

  // 备案号以主谱为准（与前台公开页脚 /api/public/filing 同源）
  useEffect(() => {
    setIcp(filing.icpNumber)
    setPolice(filing.policeNumber)
  }, [filing.icpNumber, filing.policeNumber])

  async function saveSiteName(event: React.FormEvent) {
    event.preventDefault()
    const name = siteName.trim()
    if (!name) {
      setNameMessage({ tone: "error", text: "网站名称不能为空" })
      return
    }
    setSavingName(true)
    setNameMessage(null)
    try {
      const data = await api.putSiteConfig(name)
      setSiteNameInput(data.siteName)
      setGlobalSiteName(data.siteName)
      setNameMessage({ tone: "ok", text: "已保存，全站标签页标题与水印即时更新" })
    } catch (error) {
      setNameMessage({
        tone: "error",
        text: error instanceof ApiError ? error.message : "保存失败",
      })
    } finally {
      setSavingName(false)
    }
  }

  async function saveFiling(event: React.FormEvent) {
    event.preventDefault()
    const primary = families.find((item) => item.isPrimary) ?? family
    if (!primary) {
      setFilingMessage({ tone: "error", text: "未找到主谱，无法保存备案信息" })
      return
    }
    setSavingFiling(true)
    setFilingMessage(null)
    try {
      const updated = await api.updateFamily(primary.id, {
        icpNumber: icp.trim(),
        policeNumber: police.trim(),
      })
      // 仅当主谱恰为当前选中族谱时同步上下文，避免串改其他族谱缓存
      if (family?.id === primary.id) setFamily(updated.family)
      setFilingMessage({ tone: "ok", text: "已保存，前台页脚刷新后同步展示" })
    } catch (error) {
      setFilingMessage({
        tone: "error",
        text: error instanceof ApiError ? error.message : "保存失败",
      })
    } finally {
      setSavingFiling(false)
    }
  }

  async function saveFeedbackToggle(event: React.FormEvent) {
    event.preventDefault()
    setSavingFeedback(true)
    setFeedbackMessage(null)
    try {
      const name = siteName.trim() || DEFAULT_SITE_NAME
      const data = await api.putSiteConfig(name, feedbackEnabled)
      setFeedbackEnabledState(data.feedbackEnabled)
      setFeedbackEnabled(data.feedbackEnabled)
      setFeedbackMessage({
        tone: "ok",
        text: data.feedbackEnabled ? "已开启，全站反馈入口即时恢复" : "已关闭，全站反馈入口即时隐藏",
      })
    } catch (error) {
      setFeedbackMessage({
        tone: "error",
        text: error instanceof ApiError ? error.message : "保存失败",
      })
    } finally {
      setSavingFeedback(false)
    }
  }

  function onFaviconPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith("image/")) {
      setFaviconMessage({ tone: "error", text: "请选择图片文件（PNG/JPEG/WebP/ICO/SVG）" })
      return
    }
    if (file.size > 256 * 1024) {
      setFaviconMessage({ tone: "error", text: "图标体积过大（上限 256KB）" })
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result ?? "")
      if (result.startsWith("data:")) setFaviconDraft(result)
    }
    reader.readAsDataURL(file)
  }

  async function saveFavicon(event: React.FormEvent) {
    event.preventDefault()
    setSavingFavicon(true)
    setFaviconMessage(null)
    try {
      const data = await api.putSiteConfig(
        siteName.trim() || DEFAULT_SITE_NAME,
        feedbackEnabled,
        faviconDraft,
      )
      setFaviconDraft(data.faviconDataUrl)
      applyFavicon(data.faviconDataUrl)
      setFaviconMessage({
        tone: "ok",
        text: data.faviconDataUrl
          ? "已更新站点图标，浏览器标签页即时生效"
          : "已清除自定义图标，恢复默认",
      })
    } catch (error) {
      setFaviconMessage({
        tone: "error",
        text: error instanceof ApiError ? error.message : "保存失败",
      })
    } finally {
      setSavingFavicon(false)
    }
  }

  const heading = (
    <div className="border-b border-paper-300 pb-[22px]">
      <p className="text-[10.5px] tracking-[0.3em] text-gold-600">系统 / 网站设置</p>
      <h1 className="mt-2 font-song text-[28px] tracking-[0.12em] text-ink-800 sm:text-[32px]">网站设置</h1>
      <p className="mt-2 text-[12px] tracking-[0.06em] text-muted-foreground">
        站点级配置：名称、域名证书与备案信息，仅超级管理员可调整。
      </p>
    </div>
  )

  if (!isSuper) {
    return (
      <div className="space-y-6">
        {heading}
        <section className={cn(cardClass, "px-6 py-8")}>
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-ink-600" />
            <div className="space-y-2">
              <p className="text-[13px] text-ink-700">网站设置仅超级管理员可访问。</p>
              <p className="text-[12px] leading-[1.9] text-muted-foreground">
                修改本人登录密码或管理验证器，请前往「安全设置」。
              </p>
              <Link
                to="/admin/account"
                className="inline-flex items-center gap-1.5 pt-1 text-[12px] tracking-[0.12em] text-ink-600 transition-colors hover:text-gold-600"
              >
                前往安全设置
                <ArrowUpRight className="size-3.5" />
              </Link>
            </div>
          </div>
        </section>
      </div>
    )
  }

  const currentHost = window.location.host

  return (
    <div className="space-y-6">
      {heading}

      <div className="grid gap-[18px] lg:grid-cols-2">
        <section className={cn(cardClass, "flex flex-col")}>
          <header className="flex items-center gap-2.5 border-b border-paper-200 px-6 py-4">
            <Landmark className="size-4 text-ink-600" />
            <h2 className="font-song text-[15px] tracking-[0.14em] text-ink-800">网站名称</h2>
          </header>
          <form onSubmit={saveSiteName} className="flex flex-1 flex-col gap-5 px-6 py-5">
            <p className="text-[11.5px] leading-[1.9] text-muted-foreground">
              平台全局名称，显示于浏览器标签页标题与前台背景水印，保存后全站即时同步。
            </p>
            <label className="block">
              <span className={labelClass}>名称</span>
              <input
                value={siteName}
                onChange={(event) => setSiteNameInput(event.target.value)}
                className={inputClass}
                placeholder="如：时光家谱"
                maxLength={40}
              />
            </label>
            {nameMessage ? <MessageBar message={nameMessage} /> : null}
            <button
              type="submit"
              disabled={savingName}
              className="rounded-[8px] mt-auto inline-flex w-fit items-center gap-1.5 bg-ink-800 px-5 py-2.5 text-[12px] tracking-[0.12em] text-paper-50 transition-colors hover:bg-ink-700 disabled:opacity-60"
            >
              {savingName ? <Loader2 className="size-3.5 animate-spin" /> : null}
              保存名称
            </button>
          </form>
        </section>

        <section className={cn(cardClass, "flex flex-col")}>
          <header className="flex items-center gap-2.5 border-b border-paper-200 px-6 py-4">
            <ShieldCheck className="size-4 text-ink-600" />
            <h2 className="font-song text-[15px] tracking-[0.14em] text-ink-800">信息反馈通道</h2>
          </header>
          <form onSubmit={saveFeedbackToggle} className="flex flex-1 flex-col gap-5 px-6 py-5">
            <p className="text-[11.5px] leading-[1.9] text-muted-foreground">
              关闭后，全站反馈入口（页脚、族内导航）即时隐藏，且服务端拒绝接收任何反馈提交，可作为备案所需的「非交互式」状态。开启后全站反馈入口恢复，且《隐私说明》将自动向访客披露反馈数据的收集与保存，无需手动维护文案。
            </p>
            <label className="flex items-center justify-between gap-4">
              <span className={labelClass}>开启信息反馈</span>
              <input
                type="checkbox"
                checked={feedbackEnabled}
                onChange={(event) => setFeedbackEnabledState(event.target.checked)}
                className="size-4 accent-ink-800"
              />
            </label>
            {feedbackMessage ? <MessageBar message={feedbackMessage} /> : null}
            <button
              type="submit"
              disabled={savingFeedback}
              className="rounded-[8px] mt-auto inline-flex w-fit items-center gap-1.5 bg-ink-800 px-5 py-2.5 text-[12px] tracking-[0.12em] text-paper-50 transition-colors hover:bg-ink-700 disabled:opacity-60"
            >
              {savingFeedback ? <Loader2 className="size-3.5 animate-spin" /> : null}
              保存设置
            </button>
          </form>
        </section>

        <section className={cn(cardClass, "flex flex-col")}>
          <header className="flex items-center gap-2.5 border-b border-paper-200 px-6 py-4">
            <Globe className="size-4 text-ink-600" />
            <h2 className="font-song text-[15px] tracking-[0.14em] text-ink-800">网站域名</h2>
          </header>
          <div className="flex flex-1 flex-col gap-5 px-6 py-5">
            <div>
              <p className={labelClass}>当前访问域名</p>
              <p className="mt-2 break-all font-song text-[20px] tracking-[0.06em] text-ink-800">
                {currentHost}
              </p>
            </div>

            <div className="border-t border-paper-200 pt-4">
              <p className={labelClass}>当前证书域名</p>
              {!domainsLoaded ? (
                <div className="mt-3 flex items-center gap-2 text-[12px] text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  加载中…
                </div>
              ) : domains.length === 0 ? (
                <p className="mt-3 text-[12px] leading-[1.9] text-muted-foreground">
                  尚未绑定证书域名。绑定后由宿主机自动签发与续期 TLS 证书。
                </p>
              ) : (
                <ul className="mt-3 divide-y divide-paper-200">
                  {domains.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="min-w-0 truncate text-[13px] text-ink-700">{item.domain}</span>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2.5 py-0.5 text-[11px]",
                          item.status === "active"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-paper-200 text-ink-600",
                        )}
                      >
                        {STATUS_LABEL[item.status] ?? item.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <Link
              to="/admin/domains"
              className="mt-auto inline-flex w-fit items-center gap-1.5 rounded-[8px] border border-paper-300 px-4 py-2.5 text-[12px] tracking-[0.12em] text-ink-700 transition-colors hover:border-ink-400"
            >
              管理证书域名
              <ArrowUpRight className="size-3.5" />
            </Link>
          </div>
        </section>

        <section className={cn(cardClass, "flex flex-col")}>
          <header className="flex items-center gap-2.5 border-b border-paper-200 px-6 py-4">
            <ImageIcon className="size-4 text-ink-600" />
            <h2 className="font-song text-[15px] tracking-[0.14em] text-ink-800">站点图标</h2>
          </header>
          <form onSubmit={saveFavicon} className="flex flex-1 flex-col gap-5 px-6 py-5">
            <p className="text-[11.5px] leading-[1.9] text-muted-foreground">
              上传一张方形图片（建议 32×32 或 48×48、含透明背景的 PNG；亦支持 ICO/SVG/WebP），保存后将即时替换浏览器标签页左侧图标。留空并保存即清除、恢复默认。
            </p>
            <div className="flex items-center gap-4">
              <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-paper-300 bg-white">
                {faviconDraft ? (
                  <img src={faviconDraft} alt="站点图标预览" className="size-12 object-contain" />
                ) : (
                  <span className="text-[11px] text-muted-foreground">默认</span>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <label className="inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-[8px] border border-paper-300 px-3 py-1.5 text-[12px] text-ink-700 transition-colors hover:border-ink-400">
                  选择图片
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/x-icon,image/vnd.microsoft.icon,image/svg+xml"
                    className="hidden"
                    onChange={onFaviconPick}
                  />
                </label>
                {faviconDraft ? (
                  <button
                    type="button"
                    onClick={() => setFaviconDraft("")}
                    className="w-fit text-[11.5px] text-muted-foreground underline transition-colors hover:text-seal-600"
                  >
                    清除图标
                  </button>
                ) : null}
              </div>
            </div>
            {faviconMessage ? <MessageBar message={faviconMessage} /> : null}
            <button
              type="submit"
              disabled={savingFavicon}
              className="rounded-[8px] mt-auto inline-flex w-fit items-center gap-1.5 bg-ink-800 px-5 py-2.5 text-[12px] tracking-[0.12em] text-paper-50 transition-colors hover:bg-ink-700 disabled:opacity-60"
            >
              {savingFavicon ? <Loader2 className="size-3.5 animate-spin" /> : null}
              保存图标
            </button>
          </form>
        </section>

        <section className={cn(cardClass, "lg:col-span-2")}>
          <header className="flex items-center gap-2.5 border-b border-paper-200 px-6 py-4">
            <ShieldCheck className="size-4 text-ink-600" />
            <h2 className="font-song text-[15px] tracking-[0.14em] text-ink-800">备案信息</h2>
          </header>
          <form onSubmit={saveFiling} className="space-y-5 px-6 py-5">
            <p className="text-[11.5px] leading-[1.9] text-muted-foreground">
              备案号归属主谱，展示于全站前台页脚并链接至对应查询入口；留空则不展示。
            </p>
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block">
                <span className={labelClass}>工信部备案号</span>
                <input
                  value={icp}
                  onChange={(event) => setIcp(event.target.value)}
                  className={inputClass}
                  placeholder="如 京ICP备XXXXXXXX号-1"
                />
              </label>
              <label className="block">
                <span className={labelClass}>公安备案号</span>
                <input
                  value={police}
                  onChange={(event) => setPolice(event.target.value)}
                  className={inputClass}
                  placeholder="如 京公网安备XXXXXXXXXXXX号"
                />
              </label>
            </div>
            {filingMessage ? <MessageBar message={filingMessage} /> : null}
            <button
              type="submit"
              disabled={savingFiling}
              className="rounded-[8px] inline-flex items-center gap-1.5 bg-ink-800 px-5 py-2.5 text-[12px] tracking-[0.12em] text-paper-50 transition-colors hover:bg-ink-700 disabled:opacity-60"
            >
              {savingFiling ? <Loader2 className="size-3.5 animate-spin" /> : null}
              保存备案信息
            </button>
          </form>
        </section>
      </div>
    </div>
  )
}
