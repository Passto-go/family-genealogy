/**
 * 北京时间（UTC+8，无夏令时）统一格式化。
 *
 * 采用「UTC 时间 + 8 小时后再取 UTC 分量」的写法，而非依赖 Intl 的 timeZone，
 * 以规避部分 Node/浏览器环境 ICU 数据不全导致时区失效的风险；北京时间为固定
 * UTC+8 且无夏令时，该转换确定性等价于 Asia/Shanghai。
 *
 * @param iso  ISO 8601 时间字符串（存储统一为 UTC）
 * @param withTime  是否带时分秒；false 仅返回 YYYY-MM-DD
 */
export function formatBeijing(iso: string, withTime = true): string {
  if (!iso) return "—"
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "—"
  const bj = new Date(date.getTime() + 8 * 3600 * 1000)
  const pad = (n: number) => String(n).padStart(2, "0")
  const dateStr = `${bj.getUTCFullYear()}-${pad(bj.getUTCMonth() + 1)}-${pad(bj.getUTCDate())}`
  if (!withTime) return dateStr
  return `${dateStr} ${pad(bj.getUTCHours())}:${pad(bj.getUTCMinutes())}:${pad(bj.getUTCSeconds())}`
}

declare const __APP_BUILD_TIME__: string | undefined

/**
 * 文档「最后更新」标签：优先取构建时注入的北京时间（见 vite.config 的 define），
 * 未注入时（如 dev / 直接 node 执行）回退到当前北京时间。避免条款改动后
 * 忘记手改硬编码日期，导致「最后更新」失真。
 */
export function buildDateLabel(): string {
  const raw =
    typeof __APP_BUILD_TIME__ !== "undefined" ? __APP_BUILD_TIME__ : new Date().toISOString()
  if (raw.includes("年")) return raw // vite define 注入的已是目标格式
  // fallback：ISO(UTC) → 北京时间 YYYY 年 MM 月 DD 日
  const bj = new Date(new Date(raw).getTime() + 8 * 3600 * 1000)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${bj.getUTCFullYear()} 年 ${pad(bj.getUTCMonth() + 1)} 月 ${pad(bj.getUTCDate())} 日`
}
