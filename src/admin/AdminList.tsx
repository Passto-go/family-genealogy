import { useEffect, useState } from "react"
import { Loader2, UserCog } from "lucide-react"
import { ApiError, api } from "@/lib/api"
import { useAuth } from "@/lib/admin-context"
import { formatBeijing } from "@/lib/time"
import type { AdminUser } from "@/lib/types"

const ROLE_LABEL: Record<string, string> = {
  super: "超级管理员",
  editor: "普通管理员",
}

export default function AdminList() {
  const { user } = useAuth()
  const [admins, setAdmins] = useState<AdminUser[]>([])
  const [families, setFamilies] = useState<{ id: number; name: string }[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState("")
  const [feedback, setFeedback] = useState<{ tone: "ok" | "error"; text: string } | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null)

  async function load() {
    try {
      const [data, fam] = await Promise.all([api.listAdmins(), api.listFamilies()])
      setAdmins(data.admins)
      setFamilies(fam.families.map((f) => ({ id: f.id, name: f.name || f.tag })))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "加载失败")
    } finally {
      setLoaded(true)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function handleRoleChange(target: AdminUser, role: string) {
    if (role === target.role) return
    if (role === "editor" && !target.familyId) {
      setFeedback({ tone: "error", text: "请先为该账号选择所属家族，再设为普通管理员" })
      return
    }
    setBusyId(target.id)
    setError("")
    try {
      await api.updateAdmin(target.id, { role })
      setAdmins((prev) => prev.map((a) => (a.id === target.id ? { ...a, role } : a)))
      setFeedback({ tone: "ok", text: `已将「${target.username}」角色设为${ROLE_LABEL[role]}` })
    } catch (err) {
      setFeedback({ tone: "error", text: err instanceof ApiError ? err.message : "操作失败" })
    } finally {
      setBusyId(null)
    }
  }

  async function handleFamilyChange(target: AdminUser, familyId: number | null) {
    setBusyId(target.id)
    setError("")
    try {
      await api.updateAdmin(target.id, { familyId })
      setAdmins((prev) => prev.map((a) => (a.id === target.id ? { ...a, familyId } : a)))
      setFeedback({ tone: "ok", text: `已更新「${target.username}」的所属家族` })
    } catch (err) {
      setFeedback({ tone: "error", text: err instanceof ApiError ? err.message : "操作失败" })
    } finally {
      setBusyId(null)
    }
  }

  async function handleToggleDisabled(target: AdminUser) {
    setBusyId(target.id)
    setError("")
    try {
      await api.updateAdmin(target.id, { isDisabled: !target.isDisabled })
      setAdmins((prev) =>
        prev.map((a) => (a.id === target.id ? { ...a, isDisabled: !a.isDisabled } : a)),
      )
      setFeedback({
        tone: "ok",
        text: target.isDisabled
          ? `已启用「${target.username}」`
          : `已停用「${target.username}」`,
      })
    } catch (err) {
      setFeedback({ tone: "error", text: err instanceof ApiError ? err.message : "操作失败" })
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(target: AdminUser) {
    setDeleteTarget(null)
    setBusyId(target.id)
    setError("")
    try {
      await api.deleteAdmin(target.id)
      setAdmins((prev) => prev.filter((a) => a.id !== target.id))
      setFeedback({ tone: "ok", text: `已删除管理员「${target.username}」` })
    } catch (err) {
      setFeedback({ tone: "error", text: err instanceof ApiError ? err.message : "删除失败" })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-song text-[22px] tracking-[0.14em] text-ink-800">管理员</h1>
          <p className="mt-1.5 text-[12px] text-muted-foreground">
            超级管理员可创建与赋权普通管理员；普通管理员负责族人信息维护，不可查看本页与操作日志。
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="rounded-[8px] inline-flex items-center gap-1.5 bg-ink-800 px-4 py-2 text-[12px] tracking-[0.08em] text-paper-50 transition-colors hover:bg-ink-700"
        >
          <UserCog className="size-4" />
          新建管理员
        </button>
      </header>

      {feedback ? (
        <p
          className={
            "mt-4 border-l-2 px-3 py-2 text-[12px] " +
            (feedback.tone === "ok"
              ? "border-ink-600 bg-ink-50 text-ink-700"
              : "border-seal-600 bg-seal-100 text-seal-700")
          }
        >
          {feedback.text}
        </p>
      ) : null}

      {error ? (
        <p className="mt-4 border-l-2 border-seal-600 bg-seal-100 px-3 py-2 text-[12px] text-seal-700">
          {error}
        </p>
      ) : null}

      {!loaded ? (
        <div className="mt-10 flex justify-center">
          <Loader2 className="size-5 animate-spin text-ink-400" />
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-[14px] border border-paper-300">
          <table className="w-full min-w-[640px] text-left text-[12.5px]">
            <thead className="bg-paper-100 text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-normal tracking-[0.08em]">账号</th>
                <th className="px-4 py-2.5 font-normal tracking-[0.08em]">角色</th>
                <th className="px-4 py-2.5 font-normal tracking-[0.08em]">所属家族</th>
                <th className="px-4 py-2.5 font-normal tracking-[0.08em]">状态</th>
                <th className="px-4 py-2.5 font-normal tracking-[0.08em]">最后登录</th>
                <th className="px-4 py-2.5 font-normal tracking-[0.08em]">操作</th>
              </tr>
            </thead>
            <tbody>
              {admins.map((a) => {
                const isSelf = a.id === user?.id
                const isBusy = busyId === a.id
                return (
                  <tr key={a.id} className="border-t border-paper-200">
                    <td className="px-4 py-3 text-ink-800">
                      {a.username}
                      {isSelf ? (
                        <span className="ml-2 text-[12.5px] text-muted-foreground">（当前账号）</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={a.role}
                        disabled={isSelf || isBusy}
                        onChange={(event) => void handleRoleChange(a, event.target.value)}
                        className="rounded-[8px] border border-paper-300 bg-paper-50 px-2 py-1 text-[12px] text-ink-700 outline-none disabled:opacity-60"
                      >
                        <option value="super">超级管理员</option>
                        <option value="editor">普通管理员</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      {a.role === "super" ? (
                        <span className="text-muted-foreground">全部家族</span>
                      ) : (
                        <select
                          value={a.familyId ?? ""}
                          disabled={isBusy}
                          onChange={(event) =>
                            void handleFamilyChange(
                              a,
                              event.target.value ? Number(event.target.value) : null,
                            )
                          }
                          className="rounded-[8px] border border-paper-300 bg-paper-50 px-2 py-1 text-[12px] text-ink-700 outline-none disabled:opacity-60"
                        >
                          <option value="">请选择家族</option>
                          {families.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {a.isDisabled ? (
                        <span className="rounded-full bg-paper-300 px-2.5 py-0.5 text-[12.5px] text-ink-500">
                          已停用
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[12.5px] text-emerald-700">
                          启用中
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{formatBeijing(a.lastLoginAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => setResetTarget(a)}
                          className="rounded-[8px] border border-paper-300 px-2.5 py-1 text-[11.5px] text-ink-600 transition-colors hover:border-ink-400 hover:text-ink-800 disabled:opacity-60"
                        >
                          重置密码
                        </button>
                        {!isSelf ? (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleToggleDisabled(a)}
                            className="rounded-[8px] border border-paper-300 px-2.5 py-1 text-[11.5px] text-ink-600 transition-colors hover:border-ink-400 hover:text-ink-800 disabled:opacity-60"
                          >
                            {a.isDisabled ? "启用" : "停用"}
                          </button>
                        ) : null}
                        {!isSelf ? (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => setDeleteTarget(a)}
                            className="rounded-[8px] border border-seal-600 px-2.5 py-1 text-[11.5px] text-seal-700 transition-colors hover:bg-seal-50 disabled:opacity-60"
                          >
                            删除
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {createOpen ? (
        <CreateModal
          families={families}
          onClose={() => setCreateOpen(false)}
          onCreated={async (text) => {
            setCreateOpen(false)
            setFeedback({ tone: "ok", text })
            await load()
          }}
          onError={(text) => setFeedback({ tone: "error", text })}
        />
      ) : null}

      {resetTarget ? (
        <ResetModal
          target={resetTarget}
          onClose={() => setResetTarget(null)}
          onDone={async (text) => {
            setResetTarget(null)
            setFeedback({ tone: "ok", text })
            await load()
          }}
          onError={(text) => setFeedback({ tone: "error", text })}
        />
      ) : null}

      {deleteTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="w-full max-w-[380px] rounded-[14px] border border-paper-300 bg-paper-50 p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="font-song text-[16px] tracking-[0.1em] text-ink-800">确认删除</h3>
            <p className="mt-3 text-[12.5px] leading-[1.9] text-ink-700">
              将删除管理员「{deleteTarget.username}」，其操作日志仍会保留。此操作不可恢复。
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-[8px] border border-paper-300 px-4 py-2 text-[12px] tracking-[0.08em] text-ink-600 transition-colors hover:border-ink-400"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleDelete(deleteTarget)}
                className="rounded-[8px] bg-seal-700 px-4 py-2 text-[12px] tracking-[0.08em] text-paper-50 transition-colors hover:bg-seal-800"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function CreateModal({
  families,
  onClose,
  onCreated,
  onError,
}: {
  families: { id: number; name: string }[]
  onClose: () => void
  onCreated: (text: string) => void
  onError: (text: string) => void
}) {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState("editor")
  const [familyId, setFamilyId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!username.trim()) return onError("账号不能为空")
    if (password.length < 6) return onError("密码至少 6 位")
    if (role === "editor" && !familyId) return onError("请为普通管理员选择所属家族")
    setBusy(true)
    try {
      await api.createAdmin({
        username: username.trim(),
        password,
        role,
        familyId: role === "editor" ? familyId : null,
      })
      onCreated(`已创建管理员「${username.trim()}」（${ROLE_LABEL[role]}）`)
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "创建失败")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-[400px] rounded-[14px] border border-paper-300 bg-paper-50 p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="font-song text-[16px] tracking-[0.1em] text-ink-800">新建管理员</h3>
        <label className="mt-4 block text-[11.5px] tracking-[0.08em] text-muted-foreground">
          账号
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className="mt-1 w-full rounded-[8px] border border-paper-300 bg-paper-50 px-3 py-2 text-[13px] text-ink-800 outline-none"
          />
        </label>
        <label className="mt-3 block text-[11.5px] tracking-[0.08em] text-muted-foreground">
          初始密码（至少 6 位）
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 w-full rounded-[8px] border border-paper-300 bg-paper-50 px-3 py-2 text-[13px] text-ink-800 outline-none"
          />
        </label>
        <label className="mt-3 block text-[11.5px] tracking-[0.08em] text-muted-foreground">
          角色
          <select
            value={role}
            onChange={(event) => setRole(event.target.value)}
            className="mt-1 w-full rounded-[8px] border border-paper-300 bg-paper-50 px-3 py-2 text-[13px] text-ink-800 outline-none"
          >
            <option value="editor">普通管理员（维护族人/反馈）</option>
            <option value="super">超级管理员（账号治理/审计）</option>
          </select>
        </label>
        {role === "editor" ? (
          <label className="mt-3 block text-[11.5px] tracking-[0.08em] text-muted-foreground">
            所属家族（限本族维护）
            <select
              value={familyId ?? ""}
              onChange={(event) => setFamilyId(event.target.value ? Number(event.target.value) : null)}
              className="mt-1 w-full rounded-[8px] border border-paper-300 bg-paper-50 px-3 py-2 text-[13px] text-ink-800 outline-none"
            >
              <option value="">请选择家族</option>
              {families.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[8px] border border-paper-300 px-4 py-2 text-[12px] tracking-[0.08em] text-ink-600 transition-colors hover:border-ink-400"
          >
            取消
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="rounded-[8px] bg-ink-800 px-4 py-2 text-[12px] tracking-[0.08em] text-paper-50 transition-colors hover:bg-ink-700 disabled:opacity-60"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : "创建"}
          </button>
        </div>
      </div>
    </div>
  )
}

function ResetModal({
  target,
  onClose,
  onDone,
  onError,
}: {
  target: AdminUser
  onClose: () => void
  onDone: (text: string) => void
  onError: (text: string) => void
}) {
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (password.length < 6) return onError("新密码至少 6 位")
    setBusy(true)
    try {
      await api.resetAdminPassword(target.id, password)
      onDone(`已重置「${target.username}」的密码`)
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "重置失败")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-[380px] rounded-[14px] border border-paper-300 bg-paper-50 p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="font-song text-[16px] tracking-[0.1em] text-ink-800">重置密码</h3>
        <p className="mt-2 text-[12.5px] leading-[1.9] text-ink-700">
          为「{target.username}」设置新密码，原密码立即失效。
        </p>
        <label className="mt-3 block text-[11.5px] tracking-[0.08em] text-muted-foreground">
          新密码（至少 6 位）
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 w-full rounded-[8px] border border-paper-300 bg-paper-50 px-3 py-2 text-[13px] text-ink-800 outline-none"
          />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[8px] border border-paper-300 px-4 py-2 text-[12px] tracking-[0.08em] text-ink-600 transition-colors hover:border-ink-400"
          >
            取消
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="rounded-[8px] bg-ink-800 px-4 py-2 text-[12px] tracking-[0.08em] text-paper-50 transition-colors hover:bg-ink-700 disabled:opacity-60"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : "确认重置"}
          </button>
        </div>
      </div>
    </div>
  )
}
