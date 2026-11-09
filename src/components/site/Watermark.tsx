import { useEffect, useMemo, useState } from "react"
import { api } from "@/lib/api"
import { useSiteName } from "@/lib/site-config"

/** 水印 IP 一律脱敏：仅保留网段前缀，完整地址不下发到浏览器也不写入 DOM */
function normalizeIp(raw: string): string {
  let ip = (raw || "").trim()
  if (!ip) return "本地访问"
  if (ip.startsWith("::ffff:")) ip = ip.slice(7)
  if (ip.includes(".")) {
    const parts = ip.split(".")
    return parts.slice(0, 2).join(".") + (parts.length > 2 ? ".*.*" : "")
  }
  return ip.split(":").slice(0, 2).join(":") + ":*"
}

function escapeXml(s: string): string {
  // A031：补充引号转义，避免水印文字含 ' 或 " 时破坏 SVG 文本节点
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

/**
 * 背景水印：自动生成、用于内容溯源，不存储任何数据，视觉低调（极低透明度平铺），
 * 不阻挡交互、不影响阅读。
 *
 * 显示构成与格式：
 *   排列顺序：访客 IP → 当地日期 → 网站名称；
 *   分隔符：各元素之间以「 · 」（两侧各一个半角空格、中间一个圆点）分隔；
 *   示例：192.168.*.* · 2026/11/04 · 家族族谱（IP 已脱敏，仅保留网段前缀）
 *
 * 网站名称来源：见 @/lib/site-config（默认「家族族谱」，可由 VITE_SITE_NAME 或后台「网站设置」调用 setSiteName 改写）。
 * 刷新时机：水印通过 useSiteName() 订阅全局站名，setSiteName() 变更后自动同步重渲染，无需手动干预。
 */
export function Watermark() {
  const [ip, setIp] = useState("")
  const siteName = useSiteName()

  useEffect(() => {
    let cancelled = false
    api
      .getVisitorIp()
      .then((d) => {
        if (!cancelled) setIp(d.ip)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const date = useMemo(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || undefined
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: tz,
    }).format(new Date())
  }, [])

  const text = `${normalizeIp(ip)} · ${date} · ${siteName}`

  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='360' height='150'><text x='8' y='94' font-family='ui-sans-serif,system-ui,"PingFang SC","Microsoft YaHei",sans-serif' font-size='14' letter-spacing='1' fill='rgba(108,112,114,0.06)'>${escapeXml(text)}</text></svg>`
  const backgroundImage = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[9999] overflow-hidden"
    >
      <div
        className="absolute left-1/2 top-1/2 h-[200%] w-[200%] -translate-x-1/2 -translate-y-1/2 -rotate-[24deg]"
        style={{ backgroundImage, backgroundRepeat: "repeat", backgroundSize: "360px 160px" }}
      />
    </div>
  )
}
