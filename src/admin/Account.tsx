import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { KeyRound, Loader2, ShieldCheck } from "lucide-react"
import QRCode from "qrcode"
import { ApiError, api } from "@/lib/api"
import { useAuth } from "@/lib/admin-context"
import { validatePassword } from "@/lib/password"
import { cn } from "@/lib/utils"

const cardClass =
  "rounded-[14px] border border-ink-800/10 bg-paper-50 shadow-[0_1px_2px_rgba(12,33,41,0.04),0_8px_24px_-16px_rgba(12,33,41,0.16)]"

const inputClass =
  "mt-2 h-10 w-full rounded-[8px] border border-paper-300 bg-white px-3 text-[13px] text-ink-800 outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-ink-600"

/** 系统栏目 · 安全设置：仅包含修改密码与登录验证器，账号能力对所有管理员开放 */
export default function Account() {
  const { user, logout, refresh } = useAuth()
  const isSuper = user?.role === "super"
  const navigate = useNavigate()

  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const [savingPwd, setSavingPwd] = useState(false)
  const [pwdMessage, setPwdMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null)

  // 登录验证器（TOTP）管理
  const [mfaQr, setMfaQr] = useState("")
  const [mfaSecret, setMfaSecret] = useState("")
  const [mfaCode, setMfaCode] = useState("")
  const [mfaDisablePwd, setMfaDisablePwd] = useState("")
  const [mfaBusy, setMfaBusy] = useState(false)
  const [mfaMessage, setMfaMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null)

  async function startMfaBind() {
    setMfaMessage(null)
    try {
      const data = await api.mfaSetup()
      setMfaSecret(data.secret)
      setMfaQr(await QRCode.toDataURL(data.otpauthUri, { margin: 1, width: 200 }))
    } catch (error) {
      setMfaMessage({
        tone: "error",
        text: error instanceof ApiError ? error.message : "获取配置失败",
      })
    }
  }

  async function confirmMfaBind(event: React.FormEvent) {
    event.preventDefault()
    setMfaMessage(null)
    setMfaBusy(true)
    try {
      await api.mfaConfirm(mfaCode.trim())
      setMfaMessage({ tone: "ok", text: "验证器已启用" })
      await refresh()
      setMfaSecret("")
      setMfaQr("")
      setMfaCode("")
    } catch (error) {
      setMfaMessage({
        tone: "error",
        text: error instanceof ApiError ? error.message : "绑定失败",
      })
    } finally {
      setMfaBusy(false)
    }
  }

  async function disableMfa(event: React.FormEvent) {
    event.preventDefault()
    setMfaMessage(null)
    setMfaBusy(true)
    try {
      await api.mfaDisable({ password: mfaDisablePwd })
      setMfaMessage({ tone: "ok", text: "验证器已关闭" })
      await refresh()
      setMfaDisablePwd("")
    } catch (error) {
      setMfaMessage({
        tone: "error",
        text: error instanceof ApiError ? error.message : "关闭失败",
      })
    } finally {
      setMfaBusy(false)
    }
  }

  async function handlePassword(event: React.FormEvent) {
    event.preventDefault()
    setPwdMessage(null)

    if (next !== confirm) {
      setPwdMessage({ tone: "error", text: "两次输入的新密码不一致" })
      return
    }
    const invalid = validatePassword(next, current, user?.username)
    if (invalid) {
      setPwdMessage({ tone: "error", text: invalid })
      return
    }

    setSavingPwd(true)
    try {
      await api.changePassword(current, next)
      // H4：改密后旧会话立即失效，退出并重新登录
      await logout()
      navigate("/admin/login", { replace: true })
    } catch (error) {
      setPwdMessage({
        tone: "error",
        text: error instanceof ApiError ? error.message : "修改失败",
      })
      setSavingPwd(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-paper-300 pb-[22px]">
        <p className="text-[10.5px] tracking-[0.3em] text-gold-600">系统 / 安全设置</p>
        <h1 className="mt-2 font-song text-[28px] tracking-[0.12em] text-ink-800 sm:text-[32px]">安全设置</h1>
        <p className="mt-2 text-[12px] tracking-[0.06em] text-muted-foreground">
          当前账号：{user?.username}。密码以 PBKDF2 哈希存储，不保存明文。
        </p>
      </div>

      <div className="grid gap-[18px] lg:grid-cols-2 lg:items-start">
        <section className={cardClass}>
          <header className="flex items-center gap-2.5 border-b border-paper-200 px-6 py-4">
            <KeyRound className="size-4 text-ink-600" />
            <h2 className="font-song text-[15px] tracking-[0.14em] text-ink-800">修改密码</h2>
          </header>

          <form onSubmit={handlePassword} className="space-y-5 px-6 py-5">
            <label className="block">
              <span className="text-[12.5px] tracking-[0.18em] text-muted-foreground">当前密码</span>
              <input
                type="password"
                value={current}
                onChange={(event) => setCurrent(event.target.value)}
                className={inputClass}
                autoComplete="current-password"
                required
              />
            </label>

            <label className="block">
              <span className="text-[12.5px] tracking-[0.18em] text-muted-foreground">新密码</span>
              <input
                type="password"
                value={next}
                onChange={(event) => setNext(event.target.value)}
                className={inputClass}
                autoComplete="new-password"
                placeholder="至少 8 位"
                required
              />
              <span className="mt-1.5 block text-[10.5px] leading-[1.8] text-muted-foreground/80">
                至少 8 位，且包含大写字母、小写字母、数字、特殊符号中的至少 3 类；不得与当前密码相同（允许包含账号名）。
              </span>
            </label>

            <label className="block">
              <span className="text-[12.5px] tracking-[0.18em] text-muted-foreground">确认新密码</span>
              <input
                type="password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                className={inputClass}
                autoComplete="new-password"
                required
              />
            </label>

            {pwdMessage ? (
              <p
                className={cn(
                  "border-l-2 px-3 py-2 text-[12px]",
                  pwdMessage.tone === "ok"
                    ? "border-ink-600 bg-ink-50 text-ink-700"
                    : "border-seal-600 bg-seal-100 text-seal-700",
                )}
              >
                {pwdMessage.text}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={savingPwd}
              className="rounded-[8px] inline-flex items-center gap-1.5 bg-ink-800 px-5 py-2.5 text-[12px] tracking-[0.12em] text-paper-50 transition-colors hover:bg-ink-700 disabled:opacity-60"
            >
              {savingPwd ? <Loader2 className="size-3.5 animate-spin" /> : null}
              更新密码
            </button>
          </form>
        </section>

        <section className={cardClass}>
          <header className="flex items-center gap-2.5 border-b border-paper-200 px-6 py-4">
            <ShieldCheck className="size-4 text-ink-600" />
            <h2 className="font-song text-[15px] tracking-[0.14em] text-ink-800">登录验证器</h2>
          </header>

          <div className="space-y-5 px-6 py-5">
            {user?.mfaType === "totp" ? (
              <p className="flex items-center gap-2 border-l-2 border-ink-600 bg-ink-50 px-3 py-2.5 text-[12px] text-ink-700">
                <ShieldCheck className="size-3.5 shrink-0" />
                已启用基于时间的一次性密码（TOTP），登录需额外输入动态码。
              </p>
            ) : (
              <p className="text-[11.5px] leading-[1.9] text-muted-foreground">
                启用后，登录除密码外还需输入验证器 App（如 Google Authenticator、1Password）中的
                6 位动态码，可显著提升账号安全性。{isSuper ? "超级管理员必须启用。" : "你可自行选择是否启用。"}
              </p>
            )}

            {user?.mfaType !== "totp" && mfaQr ? (
              <form onSubmit={confirmMfaBind} className="space-y-4">
                <div className="flex flex-col items-center gap-3">
                  <img src={mfaQr} alt="验证器二维码" className="h-[180px] w-[180px] rounded-[8px] border border-paper-300" />
                  <p className="text-center text-[10.5px] leading-[1.8] text-muted-foreground/80">
                    无法扫码？请手动录入密钥：
                    <br />
                    <code className="select-all bg-paper-100 px-1.5 py-0.5 text-[12.5px] text-ink-700">
                      {mfaSecret}
                    </code>
                  </p>
                </div>
                <label className="block">
                  <span className="text-[12.5px] tracking-[0.18em] text-muted-foreground">动态码</span>
                  <input
                    value={mfaCode}
                    onChange={(event) => setMfaCode(event.target.value)}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    className={inputClass}
                    placeholder="6 位动态码"
                    required
                  />
                </label>
                <button
                  type="submit"
                  disabled={mfaBusy}
                  className="rounded-[8px] inline-flex items-center gap-1.5 bg-ink-800 px-5 py-2.5 text-[12px] tracking-[0.12em] text-paper-50 transition-colors hover:bg-ink-700 disabled:opacity-60"
                >
                  {mfaBusy ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  确认启用
                </button>
              </form>
            ) : null}

            {user?.mfaType !== "totp" && !mfaQr ? (
              <button
                type="button"
                onClick={() => void startMfaBind()}
                className="rounded-[8px] inline-flex items-center gap-1.5 bg-ink-800 px-5 py-2.5 text-[12px] tracking-[0.12em] text-paper-50 transition-colors hover:bg-ink-700"
              >
                启用验证器
              </button>
            ) : null}

            {user?.mfaType === "totp" && !isSuper ? (
              <form onSubmit={disableMfa} className="space-y-4">
                <label className="block">
                  <span className="text-[12.5px] tracking-[0.18em] text-muted-foreground">
                    输入当前登录密码以关闭验证器
                  </span>
                  <input
                    type="password"
                    value={mfaDisablePwd}
                    onChange={(event) => setMfaDisablePwd(event.target.value)}
                    autoComplete="current-password"
                    className={inputClass}
                    placeholder="当前密码"
                    required
                  />
                </label>
                <button
                  type="submit"
                  disabled={mfaBusy}
                  className="inline-flex items-center gap-1.5 rounded-[8px] border border-seal-600 px-5 py-2.5 text-[12px] tracking-[0.12em] text-seal-700 transition-colors hover:bg-seal-50 disabled:opacity-60"
                >
                  {mfaBusy ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  关闭验证器
                </button>
              </form>
            ) : null}

            {mfaMessage ? (
              <p
                className={cn(
                  "border-l-2 px-3 py-2 text-[12px]",
                  mfaMessage.tone === "ok"
                    ? "border-ink-600 bg-ink-50 text-ink-700"
                    : "border-seal-600 bg-seal-100 text-seal-700",
                )}
              >
                {mfaMessage.text}
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  )
}
