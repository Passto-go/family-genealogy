import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { useParams } from "react-router-dom"
import { ApiError, api } from "./api"
import type { Family, Member, Stats } from "./types"

/** 族谱元信息读取状态 */
export type TenantStatus = "loading" | "loaded" | "missing"

/**
 * 世系数据的读取状态（仅查看世系图时才需要）：
 * - idle     尚未请求
 * - loading  读取中
 * - ready    已解锁
 * - locked   需要该族谱的访问密码
 * - private  仅管理员可阅
 */
export type MembersState = "idle" | "loading" | "ready" | "locked" | "private"

interface TenantContextValue {
  slug: string
  family: Family | null
  stats: Stats | null
  members: Member[]
  status: TenantStatus
  membersState: MembersState
  error: string | null
  /** 校验访问密码并载入世系 */
  unlock: (password: string) => Promise<void>
  /** 首次进入世系图时按需载入世系 */
  ensureMembers: () => Promise<void>
  reload: () => Promise<void>
  /** 生成当前族谱下的站内路径 */
  path: (to?: string) => string
}

const TenantContext = createContext<TenantContextValue | null>(null)

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const { slug = "" } = useParams<{ slug: string }>()
  // 切换族谱时整体重建，避免残留上一部族谱的内容
  return (
    <TenantSession key={slug} slug={slug}>
      {children}
    </TenantSession>
  )
}

function TenantSession({ slug, children }: { slug: string; children: React.ReactNode }) {
  const [family, setFamily] = useState<Family | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [status, setStatus] = useState<TenantStatus>("loading")
  const [membersState, setMembersState] = useState<MembersState>("idle")
  const [error, setError] = useState<string | null>(null)

  const loadMembers = useCallback(async () => {
    setMembersState("loading")
    try {
      const data = await api.getTenantMembers(slug)
      setMembers(data.members)
      setMembersState("ready")
    } catch (err) {
      setMembers([])
      if (err instanceof ApiError && err.status === 403) {
        setMembersState("private")
      } else {
        setMembersState("locked")
      }
    }
  }, [slug])

  const ensureMembers = useCallback(async () => {
    if (membersState !== "idle") return
    await loadMembers()
  }, [membersState, loadMembers])

  const reload = useCallback(async () => {
    // 家族门面（/family）对外公开，先独立加载；只有它 404 才代表「谱不存在」。
    try {
      const familyResult = await api.getTenantFamily(slug)
      setFamily(familyResult.family)
      setStatus("loaded")
      setError(null)
    } catch (err) {
      setFamily(null)
      setStats(null)
      setStatus("missing")
      setError(err instanceof ApiError ? err.message : "族谱读取失败")
      return
    }
    // 聚合统计（/stats）受访问密码保护（A019）：无凭证时返回 401，属正常，
    // 静默转为占位（首页/文献页已做 null 安全处理），不得将整部族谱判为「不存在」。
    try {
      const statsResult = await api.getTenantStats(slug)
      setStats(statsResult)
    } catch {
      setStats(null)
    }
  }, [slug])

  useEffect(() => {
    void reload()
  }, [reload])

  const unlock = useCallback(
    async (password: string) => {
      await api.unlockTenant(slug, password)
      await loadMembers()
    },
    [slug, loadMembers],
  )

  const path = useCallback(
    (to = "") => {
      const suffix = to.startsWith("/") ? to : to ? `/${to}` : ""
      return `/t/${encodeURIComponent(slug)}${suffix}`
    },
    [slug],
  )

  const value = useMemo(
    () => ({
      slug,
      family,
      stats,
      members,
      status,
      membersState,
      error,
      unlock,
      ensureMembers,
      reload,
      path,
    }),
    [slug, family, stats, members, status, membersState, error, unlock, ensureMembers, reload, path],
  )

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>
}

export function useTenant(): TenantContextValue {
  const context = useContext(TenantContext)
  if (!context) throw new Error("useTenant 必须在 TenantProvider 内使用")
  return context
}

/** 在 TenantProvider 之外（如首页直达的反馈页）安全读取；无租户上下文时返回 null */
export function useTenantOptional(): TenantContextValue | null {
  return useContext(TenantContext)
}
