import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { useAuth } from "./admin-context"
import { api } from "./api"
import type { Family, FamilySummary } from "./types"

const STORAGE_KEY = "family-admin-current"

/** 稳定的空列表：避免每次渲染新建数组，导致下游 useMemo 反复失效 */
const NO_FAMILIES: FamilySummary[] = []

interface FamilyContextValue {
  /** 后台当前选中的族谱 */
  family: Family | null
  families: FamilySummary[]
  loading: boolean
  reload: () => Promise<void>
  setFamily: (family: Family) => void
  selectFamily: (id: number) => void
}

const FamilyContext = createContext<FamilyContextValue | null>(null)

function readSelected(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const value = raw ? Number(raw) : NaN
    return Number.isFinite(value) && value > 0 ? value : null
  } catch {
    return null
  }
}

function writeSelected(id: number | null) {
  try {
    if (id == null) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, String(id))
  } catch {
    // 忽略存储不可用的情况
  }
}

export function FamilyProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const [selectedId, setSelectedId] = useState<number | null>(readSelected)

  // 普通管理员的作用域：仅本家族；超级管理员不限制
  const scopeId = user && user.role !== "super" ? (user.familyId ?? null) : null

  // 身份作用域键：身份或作用域一变，旧列表在渲染阶段即失效，不再依赖 effect 同步清空，
  // 从根本上杜绝切号/登录瞬间跨家族串显。
  const scopeKey = authLoading ? "auth-loading" : user ? `admin:${user.id}:${scopeId ?? "all"}` : "anon"

  const [store, setStore] = useState<{
    key: string
    families: FamilySummary[]
    publicFamilies: FamilySummary[]
  }>({ key: "", families: NO_FAMILIES, publicFamilies: NO_FAMILIES })
  const [loadedKey, setLoadedKey] = useState("")

  const families = store.key === scopeKey ? store.families : NO_FAMILIES
  const publicFamilies = store.key === scopeKey ? store.publicFamilies : NO_FAMILIES
  const loading = authLoading || loadedKey !== scopeKey

  const loadFamilies = useCallback(async () => {
    if (!user) {
      // 未登录：公开列表仅供登录页品牌展示，绝不作为后台可选族谱列表
      try {
        const data = await api.listPublicFamilies()
        setStore({ key: scopeKey, families: NO_FAMILIES, publicFamilies: data.families })
      } catch {
        setStore({ key: scopeKey, families: NO_FAMILIES, publicFamilies: NO_FAMILIES })
      }
      return
    }
    try {
      const data = await api.listFamilies()
      // 双保险：即便后端异常返回，也只保留当前用户有权访问的家族
      setStore({
        key: scopeKey,
        families: scopeId == null ? data.families : data.families.filter((f) => f.id === scopeId),
        publicFamilies: NO_FAMILIES,
      })
    } catch {
      setStore({ key: scopeKey, families: NO_FAMILIES, publicFamilies: NO_FAMILIES })
    }
  }, [user, scopeId, scopeKey])

  // 身份变化时重新加载；加载完成才解除 loading（不在 effect 内同步 setState，避免额外渲染）
  useEffect(() => {
    if (authLoading) return
    let alive = true
    // loadFamilies 内全部状态写入均发生在 await 之后；异步 IIFE 划出边界，避免被误判为同步 setState
    void (async () => {
      await loadFamilies()
      if (alive) setLoadedKey(scopeKey)
    })()
    return () => {
      alive = false
    }
  }, [authLoading, loadFamilies, scopeKey])

  // 普通管理员的作用域固定：仅需持久化；选中值在渲染阶段即按 scopeId 收敛，无需回写状态
  useEffect(() => {
    if (scopeId == null) return
    writeSelected(scopeId)
  }, [scopeId])

  // 刷新列表不置全屏 loading，避免保存/手动刷新时整页闪烁
  const reload = useCallback(async () => {
    await loadFamilies()
  }, [loadFamilies])

  const selectFamily = useCallback(
    (id: number) => {
      // 普通管理员不得切换到其他家族
      if (scopeId != null && id !== scopeId) return
      setSelectedId(id)
      writeSelected(id)
    },
    [scopeId],
  )

  const setFamily = useCallback(
    (next: Family) => {
      if (scopeId != null && next.id !== scopeId) return
      setStore((current) => ({
        ...current,
        families: current.families.map((item) =>
          item.id === next.id ? { ...item, ...next, memberCount: item.memberCount } : item,
        ),
      }))
    },
    [scopeId],
  )

  const family = useMemo(() => {
    if (user) {
      if (families.length === 0) return null
      const targetId = scopeId ?? selectedId
      const matched = targetId ? families.find((item) => item.id === targetId) : undefined
      return matched ?? families.find((item) => item.isPrimary) ?? families[0] ?? null
    }
    // 未登录时仅用于品牌展示
    return publicFamilies.find((item) => item.isPrimary) ?? publicFamilies[0] ?? null
  }, [user, families, publicFamilies, selectedId, scopeId])

  const value = useMemo(
    () => ({ family, families, loading: authLoading || loading, reload, setFamily, selectFamily }),
    [family, families, authLoading, loading, reload, setFamily, selectFamily],
  )

  return <FamilyContext.Provider value={value}>{children}</FamilyContext.Provider>
}

export function useFamily(): FamilyContextValue {
  const context = useContext(FamilyContext)
  if (!context) throw new Error("useFamily 必须在 FamilyProvider 内使用")
  return context
}

export function useFamilyTitle(): { name: string; surname: string; hallName: string } {
  const { family } = useFamily()
  return {
    name: family?.name || family?.tag || "家族族谱",
    surname: family?.surname || "族",
    hallName: family?.hallName || "",
  }
}
