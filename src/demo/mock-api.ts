/**
 * 只读演示用的接口拦截层。
 *
 * 不动业务代码：接管 window.fetch，把 /api 前缀的请求就地答掉，
 * 其余请求（静态资源）原样交给原生 fetch。
 *
 * 后台部分只开放「看一眼」：登录对任意账号密码放行，进入后各列表返回示例数据，
 * 审核 / 管理员 / 日志 / 证书等页返回空集，所有写操作一律 403。
 */

import type { DemoPayload } from "./types"

const API_PREFIX = "/api/"
const SESSION_KEY = "demo-admin-session"
const READONLY = "演示模式：只看不改，写入与上传均已停用"

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  })

/** 演示管理员：免改密、已绑定验证器，避免被强制跳到改密或绑定页 */
const demoUser = {
  id: 1,
  username: "demo",
  role: "super",
  isDisabled: false,
  lastLoginAt: new Date().toISOString(),
  familyId: null as number | null,
  mustChangePassword: false,
  mfaType: "totp",
}

function readSession(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === "1"
  } catch {
    return false
  }
}

function writeSession(value: boolean): void {
  try {
    if (value) sessionStorage.setItem(SESSION_KEY, "1")
    else sessionStorage.removeItem(SESSION_KEY)
  } catch {
    // 隐私模式等无法写入时，仅当前页面内有效
  }
}

function resolve(
  data: DemoPayload,
  pathname: string,
  method: string,
  isSignedIn: boolean,
  setSignedIn: (value: boolean) => void,
): Response | null {
  const isGet = method === "GET" || method === "HEAD"

  // ── 公开读接口 ──
  if (isGet) {
    if (pathname === "/public/families") return json({ families: data.families })
    if (pathname === "/public/site-config") return json(data.siteConfig)
    if (pathname === "/public/filing") return json(data.filing)
    if (pathname === "/visitor/ip") return json({ ip: "127.0.0.1" })
    if (pathname === "/auth/me") return json({ user: isSignedIn ? demoUser : null })
  }

  // ── 演示登录：任意账号密码都放行，只用于浏览后台 ──
  if (method === "POST" && pathname === "/auth/login") {
    setSignedIn(true)
    return json({ user: demoUser })
  }
  if (method === "POST" && (pathname === "/auth/logout" || pathname === "/auth/logout-all")) {
    setSignedIn(false)
    return json({ ok: true })
  }

  // ── 后台只读：示例族谱的数据，够列表与概览正常渲染 ──
  const tenant = Object.values(data.tenants)[0]
  if (isGet) {
    if (pathname === "/admin/families") return json({ families: data.families })
    if (pathname === "/admin/members") return json({ members: tenant?.members ?? [] })
    if (pathname === "/admin/stats") {
      return json(
        tenant?.stats ?? {
          memberCount: 0,
          lineageCount: 0,
          generationCount: 0,
          branches: [],
          generations: [],
          updatedAt: new Date().toISOString(),
        },
      )
    }
    // 以下几页只展示结构与空状态，不接数据
    if (pathname === "/admin/submissions") return json({ submissions: [] })
    if (pathname === "/admin/admins") return json({ admins: [demoUser] })
    if (pathname === "/admin/audit-logs") return json({ logs: [], total: 0 })
    if (pathname === "/admin/domains") return json({ domains: [] })
  }

  // ── 单部族谱的公开读接口 ──
  const publicTenant = pathname.match(/^\/t\/([^/]+)\/(family|stats|members)$/)
  if (publicTenant) {
    if (!isGet) return json({ error: READONLY }, 403)
    const slug = decodeURIComponent(publicTenant[1])
    const entry = data.tenants[slug]
    if (!entry) return json({ error: "此谱在演示数据中不存在" }, 404)
    switch (publicTenant[2]) {
      case "family":
        return json({ family: entry.family })
      case "stats":
        return json(entry.stats)
      default:
        return json({ members: entry.members })
    }
  }

  return null
}

export function installDemoApi(data: DemoPayload): void {
  const nativeFetch = window.fetch.bind(window)
  let signedIn = readSession()

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    const url = new URL(raw, window.location.origin)

    if (!url.pathname.startsWith(API_PREFIX)) return nativeFetch(input, init)

    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase()
    const handled = resolve(
      data,
      url.pathname.slice(4),
      method,
      signedIn,
      (value) => {
        signedIn = value
        writeSession(value)
      },
    )
    /* 未在演示数据里实现的接口（含全部后台写入）统一拒绝，避免误以为能操作 */
    return handled ?? json({ error: READONLY }, 403)
  }
}
