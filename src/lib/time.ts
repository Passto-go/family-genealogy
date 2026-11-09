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
