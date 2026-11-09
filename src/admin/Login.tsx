import { useState } from "react"
import { Navigate, useNavigate } from "react-router-dom"
import { ArrowLeft, Loader2, Lock, User } from "lucide-react"
import { Seal } from "@/components/site/Seal"
import { useAuth } from "@/lib/admin-context"
import { useFamily } from "@/lib/family-context"
import { ApiError, api } from "@/lib/api"

export default function Login() {
  const { family } = useFamily()
  const { user, loading, login, refresh } = useAuth()
  const navigate = useNavigate()

  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")

  // 登录第二步：验证器动态码
  const [mfaStep, setMfaStep] = useState(false)
  const [preAuthToken, setPreAuthToken] = useState("")
  const [code, setCode] = useState("")
  const [mfaError, setMfaError] = useState("")

  const [submitting, setSubmitting] = useState(false)

  if (!loading && user && !mfaStep) {
    return <Navigate to={user.mustChangePassword ? "/admin/change-password" : "/admin"} replace />
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError("")
    setSubmitting(true)
    try {
      const logged = await login(username.trim(), password)
      if (logged.mfaRequired && logged.preAuthToken) {
        setPreAuthToken(logged.preAuthToken)
        setMfaStep(true)
      } else {
        navigate(logged.user.mustChangePassword ? "/admin/change-password" : "/admin", {
          replace: true,
        })
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "登录失败，请稍后重试")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleVerify(event: React.FormEvent) {
    event.preventDefault()
    setMfaError("")
    setSubmitting(true)
    try {
      await api.verifyMfa(preAuthToken, code.trim())
      await refresh()
      navigate("/admin", { replace: true })
    } catch (err) {
      setMfaError(err instanceof ApiError ? err.message : "验证失败，请稍后重试")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink-800 ink-texture px-5 py-16">
      <span
        aria-hidden
        className="pointer-events-none absolute -right-10 top-1/2 -translate-y-1/2 select-none font-song text-[420px] leading-none text-white/[0.025]"
      >
        {family?.surname?.[0] ?? "族"}
      </span>

      <div className="relative w-full max-w-[380px]">
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          title="在新标签页打开前台"
          className="mb-8 inline-flex items-center gap-1.5 text-[11.5px] tracking-[0.16em] text-paper-50/45 transition-colors hover:text-paper-50/80"
        >
          <ArrowLeft className="size-3.5" />
          返回前台
        </a>

        <div className="border rounded-[14px] border-paper-300/15 bg-paper-50 px-8 py-10 shadow-float">
          <div className="flex flex-col items-center text-center">
            <Seal char={family?.surname?.[0] ?? "族"} size={44} />
            <h1 className="mt-5 font-song text-[21px] tracking-[0.2em] text-ink-800">管理登录</h1>
            <p className="mt-2 text-[12.5px] tracking-[0.16em] text-muted-foreground">
              {family?.name || "家族族谱"}　·　{family?.hallName || "谱牒管理"}
            </p>
            {__DEMO__ ? (
              <p className="mt-3 border border-dashed border-gold-600/40 px-3 py-2 text-[11.5px] leading-relaxed tracking-[0.04em] text-ink-600">
                只读演示：任意账号与密码均可登录，进入后只能查看，所有修改都会被拒绝。
              </p>
            ) : null}
          </div>

          {mfaStep ? (
            <form onSubmit={handleVerify} className="mt-8 space-y-4">
              <p className="text-[12.5px] tracking-[0.16em] text-muted-foreground">
                请输入身份验证器中的 6 位动态码
              </p>
              <label className="block">
                <span className="text-[12.5px] tracking-[0.2em] text-muted-foreground">动态码</span>
                <input
                  id="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  className="h-10 w-full rounded-[8px] border border-paper-300 bg-white px-3 text-[13px] tracking-[0.3em] text-ink-800 outline-none focus:border-ink-600"
                  placeholder="6 位动态码"
                  required
                />
              </label>
              {mfaError ? (
                <p className="border-l-2 border-seal-600 bg-seal-100 px-3 py-2 text-[12px] text-seal-700">
                  {mfaError}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={submitting}
                className="rounded-[8px] inline-flex h-10 w-full items-center justify-center gap-2 bg-ink-800 text-[12.5px] tracking-[0.22em] text-paper-50 transition-colors hover:bg-ink-700 disabled:opacity-60"
              >
                {submitting ? <Loader2 className="size-3.5 animate-spin" /> : null}
                验 证
              </button>
            </form>
          ) : (
          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div>
              <label
                htmlFor="username"
                className="text-[12.5px] tracking-[0.2em] text-muted-foreground"
              >
                账号
              </label>
              <div className="relative mt-2">
                <User className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/70" />
                <input
                  id="username"
                  autoComplete="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  className="h-10 w-full rounded-[8px] border border-paper-300 bg-white pl-9 pr-3 text-[13px] text-ink-800 outline-none transition-colors focus:border-ink-600"
                  placeholder="请输入账号"
                  required
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password"
                className="text-[12.5px] tracking-[0.2em] text-muted-foreground"
              >
                密码
              </label>
              <div className="relative mt-2">
                <Lock className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/70" />
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="h-10 w-full rounded-[8px] border border-paper-300 bg-white pl-9 pr-3 text-[13px] text-ink-800 outline-none transition-colors focus:border-ink-600"
                  placeholder="请输入密码"
                  required
                />
              </div>
            </div>

            {error ? (
              <p className="border-l-2 border-seal-600 bg-seal-100 px-3 py-2 text-[12px] text-seal-700">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              className="rounded-[8px] inline-flex h-10 w-full items-center justify-center gap-2 bg-ink-800 text-[12.5px] tracking-[0.22em] text-paper-50 transition-colors hover:bg-ink-700 disabled:opacity-60"
            >
              {submitting ? <Loader2 className="size-3.5 animate-spin" /> : null}
              登 录
            </button>
          </form>
          )}
        </div>
      </div>
    </div>
  )
}
