import { useEffect, useState } from "react"
import { Navigate, useNavigate } from "react-router-dom"
import { Loader2, ShieldCheck } from "lucide-react"
import QRCode from "qrcode"
import { Seal } from "@/components/site/Seal"
import { useAuth } from "@/lib/admin-context"
import { useFamily } from "@/lib/family-context"
import { ApiError, api } from "@/lib/api"

/**
 * 登录验证器绑定页（独立于后台布局）。
 * 用于「超级管理员强制启用验证器」场景：尚未绑定的超管被后端拦截后台接口，
 * 只能访问此页完成绑定后方可进入后台。
 */
export default function MfaSetup() {
  const { user, loading, refresh } = useAuth()
  const { family } = useFamily()
  const navigate = useNavigate()

  const [secret, setSecret] = useState("")
  const [qr, setQr] = useState("")
  const [code, setCode] = useState("")
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  if (!loading && !user) return <Navigate to="/admin/login" replace />

  useEffect(() => {
    let active = true
    api
      .mfaSetup()
      .then(async (data) => {
        if (!active) return
        setSecret(data.secret)
        try {
          setQr(await QRCode.toDataURL(data.otpauthUri, { margin: 1, width: 200 }))
        } catch {
          setQr("")
        }
      })
      .catch((err) => {
        if (active) setError(err instanceof ApiError ? err.message : "获取配置失败")
      })
    return () => {
      active = false
    }
  }, [])

  async function handleConfirm(event: React.FormEvent) {
    event.preventDefault()
    setError("")
    setSaving(true)
    try {
      await api.mfaConfirm(code.trim())
      setDone(true)
      await refresh()
      setTimeout(() => navigate("/admin", { replace: true }), 1200)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "绑定失败")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink-800 ink-texture px-5 py-16">
      <div className="relative w-full max-w-[420px] rounded-[14px] border border-paper-300/15 bg-paper-50 px-8 py-10 shadow-float">
        <div className="flex flex-col items-center text-center">
          <Seal char={family?.surname?.[0] ?? "族"} size={44} />
          <h1 className="mt-5 font-song text-[21px] tracking-[0.2em] text-ink-800">
            {done ? "验证器已启用" : "绑定登录验证器"}
          </h1>
          <p className="mt-2 text-[12.5px] tracking-[0.1em] text-muted-foreground">
            {done
              ? "正在进入后台…"
              : "出于安全考虑，管理员登录需额外验证。请先扫码录入，再输入动态码确认。"}
          </p>
        </div>

        {done ? (
          <div className="mt-8 flex items-center justify-center gap-2 border-l-2 border-ink-600 bg-ink-50 px-3 py-2.5 text-[12px] text-ink-700">
            <ShieldCheck className="size-3.5 shrink-0" />
            验证器已生效。
          </div>
        ) : (
          <form onSubmit={handleConfirm} className="mt-8 space-y-5">
            <div className="flex flex-col items-center gap-3">
              {qr ? (
                <img src={qr} alt="验证器二维码" className="h-[180px] w-[180px] rounded-[8px] border border-paper-300" />
              ) : (
                <div className="flex h-[180px] w-[180px] items-center justify-center rounded-[8px] border border-paper-300 bg-paper-100 text-[12.5px] text-muted-foreground">
                  二维码加载中…
                </div>
              )}
              <p className="text-[10.5px] leading-[1.8] text-muted-foreground/80">
                若无法扫码，请手动录入密钥：
                <br />
                <code className="select-all bg-paper-100 px-1.5 py-0.5 text-[12.5px] text-ink-700">
                  {secret}
                </code>
              </p>
            </div>

            <label className="block">
              <span className="text-[12.5px] tracking-[0.2em] text-muted-foreground">
                输入验证器中的 6 位动态码
              </span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                className="mt-2 h-10 w-full rounded-[8px] border border-paper-300 bg-white px-3 text-[13px] tracking-[0.3em] text-ink-800 outline-none transition-colors focus:border-ink-600"
                placeholder="6 位动态码"
                required
              />
            </label>

            {error ? (
              <p className="border-l-2 border-seal-600 bg-seal-100 px-3 py-2 text-[12px] text-seal-700">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={saving || !secret}
              className="rounded-[8px] inline-flex h-10 w-full items-center justify-center gap-2 bg-ink-800 text-[12.5px] tracking-[0.22em] text-paper-50 transition-colors hover:bg-ink-700 disabled:opacity-60"
            >
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
              确认绑定
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
