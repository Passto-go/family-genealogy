import { cn } from "@/lib/utils"

interface SectionHeadingProps {
  eyebrow?: string
  title?: string
  description?: string
  align?: "left" | "center"
  tone?: "dark" | "light"
  className?: string
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  tone = "dark",
  className,
}: SectionHeadingProps) {
  const centered = align === "center"

  return (
    <div className={cn(centered && "flex flex-col items-center text-center", className)}>
      {eyebrow ? (
        <div className="flex items-center gap-2.5">
          <span
            className={cn("h-px w-6", tone === "light" ? "bg-gold-500/60" : "bg-gold-600")}
          />
          <span
            className={cn(
              "text-[12.5px] tracking-[0.38em]",
              tone === "light" ? "text-gold-500" : "text-gold-700",
            )}
          >
            {eyebrow}
          </span>
          {centered ? (
            <span
              className={cn("h-px w-6", tone === "light" ? "bg-gold-500/60" : "bg-gold-600")}
            />
          ) : null}
        </div>
      ) : null}

      {title ? (
        <h2
          className={cn(
            "mt-4 font-song text-[26px] tracking-[0.14em] sm:text-[32px]",
            tone === "light" ? "text-paper-50" : "text-ink-800",
          )}
        >
          {title}
        </h2>
      ) : null}

      {description ? (
        <p
          className={cn(
            "mt-4 max-w-2xl text-[13.5px] leading-[2] tracking-[0.02em]",
            tone === "light" ? "text-paper-50/60" : "text-muted-foreground",
          )}
        >
          {description}
        </p>
      ) : null}
    </div>
  )
}
