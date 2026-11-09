import { useEffect, useState } from "react"
import { formatLunar } from "@/lib/lunar"

interface ShanghaiParts {
  year: number
  month: number
  day: number
  hour: string
  minute: string
  second: string
  weekday: string
}

function getShanghaiParts(date: Date): ShanghaiParts {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "long",
    hour12: false,
  }).formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ""
  let hour = get("hour")
  if (hour === "24") hour = "00" // 个别环境午夜返回 24
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour,
    minute: get("minute"),
    second: get("second"),
    weekday: get("weekday"),
  }
}

/** 页脚：UTC+8、公历日期与农历日期，实时更新；移动端居中、桌面端右对齐 */
export function BeiJingClock() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const p = getShanghaiParts(now)
  const time = `${p.hour}:${p.minute}:${p.second}`
  const gregorian = `${p.year}年${p.month}月${p.day}日 ${p.weekday}`
  const lunar = formatLunar(p.year, p.month, p.day)

  return (
    <div className="shrink-0 text-center sm:text-right">
      <p className="text-[11.5px] tracking-[0.16em] text-muted-foreground">
        UTC+8
      </p>
      <p className="mt-1.5 font-semibold text-[18px] leading-none tabular-nums tracking-[0.02em] text-ink-900 sm:text-[19px]">
        {time}
      </p>
      <div className="mt-2.5 space-y-0.5 text-[11.5px] leading-relaxed text-muted-foreground">
        <p>{gregorian}</p>
        <p>{lunar}</p>
      </div>
    </div>
  )
}
