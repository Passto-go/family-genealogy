import { cn } from "@/lib/utils"

interface SealProps {
  char: string
  size?: number
  tone?: "solid" | "light" | "outline" | "gold"
  className?: string
}

/** 方印式标识：单线外框、6px 圆角、单字居中 —— 对齐设计稿 .seal（无内框） */
export function Seal({ char, size = 40, tone = "solid", className }: SealProps) {
  const len = [...char].length
  const font =
    len <= 1 ? Math.round(size * 0.52) : len === 2 ? Math.round(size * 0.36) : Math.round(size * 0.26)

  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-[6px]",
        tone === "solid" && "bg-ink-800 text-paper-50",
        tone === "light" && "bg-paper-50 text-ink-800",
        tone === "outline" && "border border-ink-800/60 text-ink-800",
        tone === "gold" && "border-[1.5px] border-gold-600 text-gold-600",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <span
        className="font-song leading-none"
        style={{ fontSize: font, letterSpacing: 0, transform: "translateY(-0.02em)" }}
      >
        {char}
      </span>
    </span>
  )
}
