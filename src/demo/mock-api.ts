/**
 * 只读演示用的接口拦截层。
 *
 * 不动业务代码：接管 window.fetch，把 /api 前缀的请求就地答掉，
 * 其余请求（静态资源）原样交给原生 fetch。写操作一律拒绝，
 * 让演示站保持"只能看、不能改"。
 */

import type { DemoPayload } from "./types"

const API_PREFIX = "/api/"

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  })

const DEMO_READONLY = "演示模式：只看不改，提交与登录均已停用"

function resolve(data: DemoPayload, path: string): Response | null {
  if (path === "/public/families") return json({ families: data.families })
  if (path === "/public/site-config") return json(data.siteConfig)
  if (path === "/public/filing") return json(data.filing)
  if (path === "/auth/me") return json({ user: null })
  if (path === "/visitor/ip") return json({ ip: "127.0.0.1" })

  const tenant = path.match(/^\/t\/([^/]+)\/(family|stats|members|access|feedback|submissions)$/)
  if (!tenant) return null

  const slug = decodeURIComponent(tenant[1])
  const entry = data.tenants[slug]
  if (!entry) return json({ error: "此谱在演示数据中不存在" }, 404)

  switch (tenant[2]) {
    case "family":
      return json({ family: entry.family })
    case "stats":
      return json(entry.stats)
    case "members":
      return json({ members: entry.members })
    default:
      return json({ error: DEMO_READONLY }, 403)
  }
}

export function installDemoApi(data: DemoPayload): void {
  const nativeFetch = window.fetch.bind(window)

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    const url = new URL(raw, window.location.origin)

    if (!url.pathname.startsWith(API_PREFIX)) return nativeFetch(input, init)

    /* 未在演示数据里实现的接口（含全部后台写入）统一拒绝，避免误以为能操作 */
    const handled = resolve(data, url.pathname.slice(4))
    return handled ?? json({ error: DEMO_READONLY }, 403)
  }
}
