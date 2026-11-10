// 第三方统计接入：结构化 ID + 官方模板运行时注入。
// 仅超管在后台「网站设置」填写各厂商标识；前端按本文件模板注入，绝不执行任意自定义脚本（杜绝 XSS）。
// 各厂商域名已在服务端 CSP 的 script-src / connect-src / img-src 白名单中放行。

export type AnalyticsProviderKey = "baidu" | "umeng" | "ga" | "clarity" | "gads"

export interface AnalyticsProvider {
  key: AnalyticsProviderKey
  enabled: boolean
  id: string
  /** 后台可自定义的《隐私说明》条款文案；留空则使用默认模板 */
  notice?: string
}

export const PROVIDER_META: Record<
  AnalyticsProviderKey,
  { label: string; hint: string; placeholder: string }
> = {
  baidu: {
    label: "百度统计",
    hint: "填 hm.js? 后面的 32 位代码（百度统计「代码获取」中复制；不是 8 位数字站点 ID）",
    placeholder: "如 1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d",
  },
  umeng: { label: "友盟+（CNZZ）", hint: "s4.cnzz.com 站点 ID（纯数字）", placeholder: "如 12345678" },
  ga: { label: "Google Analytics", hint: "G- 开头的衡量 ID", placeholder: "如 G-XXXXXXXX" },
  clarity: { label: "Microsoft Clarity", hint: "Clarity 项目 ID", placeholder: "如 a1b2c3d4" },
  gads: { label: "Google Ads", hint: "转化追踪 / 再营销，与 GA4 共用 gtag.js（AW- 开头）", placeholder: "如 AW-123456789" },
}

// 记录已注入的厂商与对应 ID，防止 StrictMode / HMR / 重渲染重复注入；
// 也用于「拒绝」时移除已加载脚本并显式停用 Google 产品。
const injected = new Set<AnalyticsProviderKey>()
const injectedIds: Partial<Record<AnalyticsProviderKey, string>> = {}

function appendScript(src: string, key: AnalyticsProviderKey) {
  const s = document.createElement("script")
  s.async = true
  s.src = src
  s.setAttribute("data-analytics-injected", key)
  document.head.appendChild(s)
}

function appendInline(text: string, key: AnalyticsProviderKey) {
  const s = document.createElement("script")
  s.textContent = text
  s.setAttribute("data-analytics-injected", key)
  document.head.appendChild(s)
}

function injectBaidu(id: string, key: AnalyticsProviderKey) {
  const w = window as unknown as { _hmt?: unknown[] }
  w._hmt = w._hmt || []
  w._hmt.push(["_trackPageview", location.pathname + location.search])
  appendScript(`https://hm.baidu.com/hm.js?${id}`, key)
}

function injectUmeng(id: string, key: AnalyticsProviderKey) {
  const w = window as unknown as { _czc?: unknown[] }
  w._czc = w._czc || []
  w._czc.push(["_setAccount", id])
  w._czc.push(["_trackPageview"])
  appendScript(`https://s4.cnzz.com/z.js?id=${id}`, key)
}

function injectGa(id: string, key: AnalyticsProviderKey) {
  // 重新注入时清除先前的停用标志（拒绝后再接受的情形）
  delete (window as unknown as Record<string, boolean>)[`ga-disable-${id}`]
  appendScript(`https://www.googletagmanager.com/gtag/js?id=${id}`, key)
  appendInline(
    `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}` +
      `gtag('js',new Date());gtag('config','${id}');`,
    key,
  )
}

function injectGads(id: string, key: AnalyticsProviderKey) {
  // 与 GA4 共用 gtag.js：GA 已加载则直接 config；否则自行加载同一脚本（不重复加载）
  const w = window as unknown as { gtag?: (...a: unknown[]) => void }
  // 重新注入时清除先前的停用标志（拒绝后再接受的情形）
  delete (w as unknown as Record<string, boolean>)[`ga-disable-${id}`]
  if (typeof w.gtag === "function") {
    w.gtag("config", id)
    return
  }
  appendScript(`https://www.googletagmanager.com/gtag/js?id=${id}`, key)
  appendInline(
    `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}` +
      `gtag('js',new Date());gtag('config','${id}');`,
    key,
  )
}

function injectClarity(id: string, key: AnalyticsProviderKey) {
  appendInline(
    `(function(c,l,a,r,i,t,g,o,x){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};` +
      `t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;` +
      `o=l.getElementsByTagName(r)[0];o.parentNode.insertBefore(t,o);})` +
      `(window,document,"clarity","script","${id}");`,
    key,
  )
}

/** 按配置注入各启用的统计脚本（已注入的跳过，避免重复）。 */
export function applyAnalytics(config: AnalyticsProvider[]) {
  if (typeof document === "undefined") return
  for (const p of config) {
    if (!p.enabled || !p.id || injected.has(p.key)) continue
    if (p.key === "baidu") injectBaidu(p.id, p.key)
    else if (p.key === "umeng") injectUmeng(p.id, p.key)
    else if (p.key === "ga") injectGa(p.id, p.key)
    else if (p.key === "clarity") injectClarity(p.id, p.key)
    else if (p.key === "gads") injectGads(p.id, p.key)
    injected.add(p.key)
    injectedIds[p.key] = p.id
  }
}

/**
 * 移除已注入的分析脚本（访客拒绝或撤回同意时调用）。
 * 对 Google 产品额外设置 ga-disable 标志，避免移除脚本后仍继续上报。
 */
export function removeAnalytics() {
  if (typeof document === "undefined") return
  document
    .querySelectorAll<HTMLElement>("[data-analytics-injected]")
    .forEach((n) => n.remove())
  for (const [key, id] of Object.entries(injectedIds)) {
    if ((key === "ga" || key === "gads") && id) {
      ;(window as unknown as Record<string, boolean>)[`ga-disable-${id}`] = true
    }
  }
  injected.clear()
  for (const k of Object.keys(injectedIds)) delete injectedIds[k as AnalyticsProviderKey]
}

/** SPA 路由切换时显式上报页面浏览（首屏由注入逻辑负责，这里只处理站内跳转）。 */
export function trackPageview(path: string) {
  const url = path || location.pathname + location.search
  const w = window as unknown as { _hmt?: unknown[]; gtag?: (...a: unknown[]) => void; _czc?: unknown[] }
  if (w._hmt) w._hmt.push(["_trackPageview", url])
  if (typeof w.gtag === "function") w.gtag("event", "page_view", { page_path: url })
  if (w._czc) w._czc.push(["_trackPageview", url])
  // Clarity 通过 History API 自动采集 SPA 路由变化，无需显式调用
}
