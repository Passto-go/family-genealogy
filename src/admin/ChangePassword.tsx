import { useState } from "react"
import { Navigate, useNavigate } from "react-router-dom"
import { KeyRound, Loader2, Lock, ShieldCheck } from "lucide-react"
import { Seal } from "@/components/site/Seal"
import { useAuth } from "@/lib/admin-context"
import { useFamily } from "@/lib/family-context"
import { ApiError, api } from "@/lib/api"
import { validatePassword } from "@/lib/password"

const inputClass =
  "h-10 w-full rounded-[8px] border border-paper-300 bg-white px-3 text-[13px] text-ink-800 outline-none transition-colors focus:border-ink-600"

/** H1：首次登录 / 密码被重置后的强制改密页，独立于后台布局，无法从导航绕过 */
export default function ChangePassword() {
  const { family } = useFamily()
  const { user, loading, logout } = useAuth()
  const navigate = useNavigate()

  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  if (!loading && !user) return <Navigate to="/admin/login" replace />
  if (!loading && user && !user.mustChangePassword) return <Navigate to="/admin" replace />

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError("")
    if (next !== confirm) {
      setError("两次输入的新密码不一致")
      return
    }
    const invalid = validatePassword(next, current, user?.username)
    if (invalid) {
      setError(invalid)
      return
    }
    setSaving(true)
    try {
      await api.changePassword(current, next)
      setDone(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "修改失败，请稍后重试")
    } finally {
      setSaving(false)
    }
  }

  async function goRelogin() {
    await logout()
    navigate("/admin/login", { replace: true })
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink-800 ink-texture px-5 py-16">
      <span
        aria-hidden
        className="pointer-events-none absolute -right-10 top-1/2 -translate-y-1/2 select-none font-song text-[420px] leading-none text-white/[0.025]"
      >
        {family?.surname?.[0] ?? "族"}
      </span>

      <div className="relative w-full max-w-[400px] rounded-[14px] border border-paper-300/15 bg-paper-50 px-8 py-10 shadow-float">
        <div className="flex flex-col items-center text-center">
          <Seal char={family?.surname?.[0] ?? "族"} size={44} />
          <h1 className="mt-5 font-song text-[21px] tracking-[0.2em] text-ink-800">
            {done ? "密码已更新" : "设置新密码"}
          </h1>
          <p className="mt-2 text-[12.5px] tracking-[0.1em] text-muted-foreground">
            {done ? "请使用新密码重新登录" : "首次登录需设置新密码后方可进入后台"}
          </p>
        </div>

        {done ? (
          <div className="mt-8 space-y-5">
            <p className="flex items-center gap-2 border-l-2 border-ink-600 bg-ink-50 px-3 py-2.5 text-[12px] text-ink-700">
              <ShieldCheck className="size-3.5 shrink-0" />
              出于安全考虑，旧登录状态已失效。
            </p>
            <button
              type="button"
              onClick={() => void goRelogin()}
              className="inline-flex h-10 w-full items-center justify-center gap-2 bg-ink-800 text-[12.5px] tracking-[0.16em] text-paper-50 transition-colors hover:bg-ink-700"
            >
              <KeyRound className="size-3.5" />
              使用新密码重新登录
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <label className="block">
              <span className="text-[12.5px] tracking-[0.2em] text-muted-foreground">当前密码</span>
              <div className="relative mt-2">
                <Lock className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/70" />
                <input
                  type="password"
                  value={current}
                  onChange={(event) => setCurrent(event.target.value)}
                  autoComplete="current-password"
                  className={`${inputClass} pl-9`}
                  required
                />
              </div>
            </label>

            <label className="block">
              <span className="text-[12.5px] tracking-[0.2em] text-muted-foreground">新密码</span>
              <div className="relative mt-2">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/70" />
                <input
                  type="password"
                  value={next}
                  onChange={(event) => setNext(event.target.value)}
                  autoComplete="new-password"
                  placeholder="至少 8 位"
                  className={`${inputClass} pl-9`}
                  required
                />
              </div>
              <span className="mt-1.5 block text-[10.5px] leading-[1.8] text-muted-foreground/80">
                至少 8 位，且包含大写字母、小写字母、数字、特殊符号中的至少 3 类；不得与当前密码相同（允许包含账号名）。
              </span>
            </label>

            <label className="block">
              <span className="text-[12.5px] tracking-[0.2em] text-muted-foreground">确认新密码</span>
              <div className="relative mt-2">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/70" />
                <input
                  type="password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  autoComplete="new-password"
                  className={`${inputClass} pl-9`}
                  required
                />
              </div>
            </label>

            {error ? (
              <p className="border-l-2 border-seal-600 bg-seal-100 px-3 py-2 text-[12px] text-seal-700">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={saving}
              className="rounded-[8px] inline-flex h-10 w-full items-center justify-center gap-2 bg-ink-800 text-[12.5px] tracking-[0.22em] text-paper-50 transition-colors hover:bg-ink-700 disabled:opacity-60"
            >
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
              确认修改
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
