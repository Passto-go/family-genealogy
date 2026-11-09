import { useEffect, useState } from "react"
import { Loader2, Plus, RefreshCw, Trash2 } from "lucide-react"
import { ApiError, api, type DomainView } from "@/lib/api"
import { formatDate } from "@/lib/types"
import { cn } from "@/lib/utils"

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending: { label: "待签发", cls: "bg-amber-100 text-amber-700" },
  issuing: { label: "签发中", cls: "bg-sky-100 text-sky-700" },
  active: { label: "已生效", cls: "bg-emerald-100 text-emerald-700" },
  failed: { label: "失败", cls: "bg-seal-100 text-seal-700" },
  renewing: { label: "续期中", cls: "bg-sky-100 text-sky-700" },
}

export default function Domains() {
  const [domains, setDomains] = useState<DomainView[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState<number | null>(null)
  const [error, setError] = useState("")
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState("")
  const [saving, setSaving] = useState(false)
  const [confirmId, setConfirmId] = useState<number | null>(null)

  async function load() {
    try {
      const data = await api.listDomains()
      setDomains(data.domains)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "加载失败")
    } finally {
      setLoaded(true)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function addDomain() {
    const domain = draft.trim().toLowerCase()
    if (!domain) return
    setSaving(true)
    setError("")
    try {
      await api.createDomain(domain)
      setDraft("")
      setAdding(false)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "添加失败")
    } finally {
      setSaving(false)
    }
  }

  async function renew(id: number) {
    setBusy(id)
    setError("")
    try {
      await api.renewDomain(id)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "操作失败")
    } finally {
      setBusy(null)
    }
  }

  async function remove(id: number) {
    setConfirmId(null)
    setBusy(id)
    setError("")
    try {
      await api.deleteDomain(id)
      setDomains((prev) => prev.filter((d) => d.id !== id))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "删除失败")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10.5px] tracking-[0.3em] text-gold-700">安全</p>
          <h1 className="mt-2 font-song text-[26px] tracking-[0.12em] text-ink-800">证书域名</h1>
          <p className="mt-2 text-[12px] tracking-[0.06em] text-muted-foreground">
            绑定域名后，证书将由宿主机自动签发与续期（DNS-01 / Let's Encrypt），无需人工干预。
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="rounded-[8px] inline-flex items-center gap-1.5 bg-ink-800 px-4 py-2.5 text-[12px] tracking-[0.12em] text-paper-50 transition-colors hover:bg-ink-700"
        >
          <Plus className="size-3.5" />
          绑定域名
        </button>
      </div>

      {error ? (
        <p className="border-l-2 border-seal-600 bg-seal-100 px-3 py-2 text-[12px] text-seal-700">
          {error}
        </p>
      ) : null}

      {adding ? (
        <div className="flex flex-wrap items-center gap-2 rounded-[14px] border border-paper-300 bg-paper-50 px-4 py-3">
          <input
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void addDomain()
            }}
            placeholder="例如 genealogy.example.com"
            className="min-w-[260px] flex-1 rounded-[8px] border border-paper-300 px-3 py-2 text-[12.5px] text-ink-700 outline-none focus:border-ink-500"
          />
          <button
            type="button"
            disabled={saving}
            onClick={() => void addDomain()}
            className="rounded-[8px] bg-ink-800 px-4 py-2 text-[12px] tracking-[0.08em] text-paper-50 transition-colors hover:bg-ink-700 disabled:opacity-60"
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : "确认绑定"}
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(false)
              setDraft("")
            }}
            className="rounded-[8px] border border-paper-300 px-4 py-2 text-[12px] tracking-[0.08em] text-ink-600 transition-colors hover:border-ink-400"
          >
            取消
          </button>
        </div>
      ) : null}

      {!loaded ? (
        <div className="flex justify-center py-24">
          <Loader2 className="size-5 animate-spin text-ink-400" />
        </div>
      ) : domains.length === 0 ? (
        <div className="rounded-[14px] border border-paper-300 bg-paper-50 px-6 py-16 text-center">
          <p className="font-song text-[17px] tracking-[0.12em] text-ink-700">尚未绑定域名</p>
          <p className="mt-3 text-[12px] text-muted-foreground">
            点击「绑定域名」添加需要自动签发证书的域名。
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {domains.map((d) => {
            const meta =
              STATUS_META[d.status] ?? { label: d.status, cls: "bg-paper-300 text-ink-500" }
            return (
              <article
                key={d.id}
                className="flex flex-wrap items-start justify-between gap-5 rounded-[14px] border border-paper-300 bg-paper-50 px-6 py-5 transition-colors hover:border-ink-400/50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate font-song text-[18px] tracking-[0.08em] text-ink-800">
                      {d.domain}
                    </h2>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px]",
                        meta.cls,
                      )}
                    >
                      {meta.label}
                    </span>
                  </div>
                  <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-[12px] sm:grid-cols-2">
                    <Field label="到期时间" value={d.expiryDate ? formatDate(d.expiryDate) : "—"} />
                    <Field label="证书路径" value={d.certPath || "—"} />
                    {d.lastError ? (
                      <div className="sm:col-span-2 flex gap-2">
                        <dt className="shrink-0 text-seal-600">失败原因</dt>
                        <dd className="text-seal-700">{d.lastError}</dd>
                      </div>
                    ) : null}
                  </dl>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    disabled={busy === d.id}
                    onClick={() => void renew(d.id)}
                    className="inline-flex items-center gap-1.5 rounded-[8px] border border-paper-300 px-3 py-2 text-[11.5px] tracking-[0.1em] text-ink-700 transition-colors hover:border-ink-400 disabled:opacity-60"
                  >
                    {busy === d.id ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <RefreshCw className="size-3" />
                    )}
                    立即续期
                  </button>
                  <button
                    type="button"
                    disabled={busy === d.id}
                    onClick={() => setConfirmId(d.id)}
                    className="inline-flex items-center gap-1.5 rounded-[8px] border border-seal-600 px-3 py-2 text-[11.5px] tracking-[0.1em] text-seal-700 transition-colors hover:bg-seal-50 disabled:opacity-60"
                  >
                    <Trash2 className="size-3" />
                    删除
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {confirmId != null ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4"
          onClick={() => setConfirmId(null)}
        >
          <div
            className="w-full max-w-[380px] rounded-[14px] border border-paper-300 bg-paper-50 p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="font-song text-[16px] tracking-[0.1em] text-ink-800">确认删除</h3>
            <p className="mt-3 text-[12.5px] leading-[1.9] text-ink-700">
              将删除域名{" "}
              <span className="font-semibold">
                {domains.find((d) => d.id === confirmId)?.domain}
              </span>
              ，证书将不再自动续期（Nginx 配置需手动清理）。
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmId(null)}
                className="rounded-[8px] border border-paper-300 px-4 py-2 text-[12px] tracking-[0.08em] text-ink-600 transition-colors hover:border-ink-400"
              >
                取消
              </button>
              <button
                type="button"
                disabled={busy === confirmId}
                onClick={() => void remove(confirmId)}
                className="rounded-[8px] bg-seal-700 px-4 py-2 text-[12px] tracking-[0.08em] text-paper-50 transition-colors hover:bg-seal-800 disabled:opacity-60"
              >
                {busy === confirmId ? <Loader2 className="size-3.5 animate-spin" /> : "确认删除"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="break-all text-ink-700">{value || "—"}</dd>
    </div>
  )
}
