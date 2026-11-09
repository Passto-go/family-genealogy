import { useState } from "react"
import { KeyRound, Loader2, Lock } from "lucide-react"
import { ApiError } from "@/lib/api"
import { useTenant } from "@/lib/tenant-context"
import { Seal } from "./Seal"

/**
 * 世系图访问口令面板。
 * 族谱的其它页面（首页、家族文献）无需口令，此面板只出现在世系图。
 */
export function UnlockPanel() {
  const { family, membersState, unlock } = useTenant()
  const [password, setPassword] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const privateOnly = membersState === "private"
  const surname = family?.surname?.[0] ?? "族"

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (privateOnly) return
    if (!password) {
      setMessage("请输入访问密码")
      return
    }
    setSubmitting(true)
    setMessage(null)
    try {
      await unlock(password)
      setPassword("")
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "访问密码校验失败")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center bg-paper-100 px-6 py-16">
      <div className="w-full max-w-[440px] border border-paper-300 bg-paper-50 px-8 py-12 shadow-card">
        <div className="flex flex-col items-center text-center">
          <Seal char={surname} size={56} />
          <div className="mt-6 flex items-center gap-2 text-[10.5px] tracking-[0.34em] text-gold-700">
            {privateOnly ? (
              <Lock className="size-4 text-seal-600" />
            ) : (
              <KeyRound className="size-4 text-gold-700" />
            )}
            世系图门禁
          </div>
          <h1 className="mt-4 font-song text-[24px] tracking-[0.18em] text-ink-800">
            {family?.name || family?.tag || "家族族谱"}
          </h1>
          <p className="mt-4 text-[12.5px] leading-[2] text-muted-foreground">
            {privateOnly
              ? "此谱世系仅限管理员查阅，首页与家族文献仍可浏览。"
              : "查阅世系图需输入家族授予的访问口令。首页与家族文献无需口令。"}
          </p>
        </div>

        {privateOnly ? null : (
          <form onSubmit={handleSubmit} className="mt-9 flex flex-col items-center space-y-3">
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="访问密码"
              autoFocus
              className="h-11 w-full border border-paper-300 bg-white px-3 text-center text-[13px] tracking-[0.2em] text-ink-800 outline-none transition-colors placeholder:tracking-[0.1em] placeholder:text-muted-foreground/60 focus:border-ink-600"
            />
            {message ? <p className="text-center text-[11.5px] text-seal-600">{message}</p> : null}
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-11 w-full items-center justify-center gap-2 bg-ink-800 text-[12.5px] tracking-[0.2em] text-paper-50 transition-colors hover:bg-ink-700 disabled:opacity-60"
            >
              {submitting ? <Loader2 className="size-3.5 animate-spin" /> : null}
              启 阅
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
