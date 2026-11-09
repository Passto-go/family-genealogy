import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { useAuth } from "./admin-context"
import { api } from "./api"
import type { Family, FamilySummary } from "./types"

const STORAGE_KEY = "family-admin-current"

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
  const [families, setFamilies] = useState<FamilySummary[]>([])
  const [publicFamilies, setPublicFamilies] = useState<FamilySummary[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(readSelected)
  const [loading, setLoading] = useState(true)

  // 普通管理员的作用域：仅本家族；超级管理员不限制
  const scopeId = user && user.role !== "super" ? (user.familyId ?? null) : null

  const loadFamilies = useCallback(async () => {
    if (!user) {
      // 未登录：公开列表仅供登录页品牌展示，绝不作为后台可选族谱列表，
      // 否则未登录时缓存的「全量家族」会被带到登录后，造成跨家族串显。
      try {
        const data = await api.listPublicFamilies()
        setPublicFamilies(data.families)
      } catch {
        setPublicFamilies([])
      }
      setFamilies([])
      return
    }
    try {
      const data = await api.listFamilies()
      // 双保险：即便后端异常返回，也只保留当前用户有权访问的家族
      setFamilies(scopeId == null ? data.families : data.families.filter((f) => f.id === scopeId))
    } catch {
      setFamilies([])
    }
  }, [user, scopeId])

  // 身份变化时重新加载；先同步清空旧数据并置 loading，避免切号/登录瞬间串显与闪烁
  useEffect(() => {
    if (authLoading) return
    let alive = true
    setLoading(true)
    setFamilies([])
    void loadFamilies().finally(() => {
      if (alive) setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [authLoading, loadFamilies])

  // 收敛本地缓存的选中项：普通管理员强制指向本家族，清除跨家族残留
  useEffect(() => {
    if (scopeId == null) return
    if (selectedId !== scopeId) {
      setSelectedId(scopeId)
      writeSelected(scopeId)
    }
  }, [scopeId, selectedId])

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
      setFamilies((current) =>
        current.map((item) =>
          item.id === next.id ? { ...item, ...next, memberCount: item.memberCount } : item,
        ),
      )
    },
    [scopeId],
  )

  const family = useMemo(() => {
    if (user) {
      if (families.length === 0) return null
      const matched = selectedId ? families.find((item) => item.id === selectedId) : undefined
      return matched ?? families.find((item) => item.isPrimary) ?? families[0] ?? null
    }
    // 未登录时仅用于品牌展示
    return publicFamilies.find((item) => item.isPrimary) ?? publicFamilies[0] ?? null
  }, [user, families, publicFamilies, selectedId])

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
