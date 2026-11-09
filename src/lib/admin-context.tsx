import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { ApiError, api } from "./api"
import type { AdminUser } from "./types"

interface AuthContextValue {
  user: AdminUser | null
  loading: boolean
  login: (
    username: string,
    password: string,
  ) => Promise<{
    user: AdminUser
    mfaRequired?: boolean
    mfaType?: "totp"
    preAuthToken?: string
  }>
  logout: () => Promise<void>
  logoutAll: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const data = await api.me()
      setUser(data.user)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // 返回登录响应，供登录页判断是否进入验证器第二步或强制改密
  const login = useCallback(
    async (username: string, password: string) => {
      const data = await api.login(username, password)
      setUser(data.user)
      return data
    },
    [],
  )

  const logout = useCallback(async () => {
    try {
      await api.logout()
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
    }
    setUser(null)
  }, [])

  // M-9：登出所有设备的当前会话（后端已使该账号全部会话失效），然后清本地状态
  const logoutAll = useCallback(async () => {
    try {
      await api.logoutAll()
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
    }
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({ user, loading, login, logout, logoutAll, refresh }),
    [user, loading, login, logout, logoutAll, refresh],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth 必须在 AuthProvider 内使用")
  return context
}
