/** 登录、会话与二次验证 */

import type { AdminUser } from "../types"
import { request } from "./client"

export const authApi = {
  login: (username: string, password: string) =>
    request<{
      user: AdminUser
      mfaRequired?: boolean
      mfaType?: "totp"
      preAuthToken?: string
    }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),

  /** 登录第二步：凭预授权令牌 + 动态码换取正式会话 */
  verifyMfa: (preAuthToken: string, code: string) =>
    request<{ user: AdminUser }>("/auth/mfa/verify", {
      method: "POST",
      body: JSON.stringify({ preAuthToken, code }),
    }),

  logout: () => request<{ ok: true }>("/auth/logout", { method: "POST" }),

  logoutAll: () => request<{ ok: true }>("/auth/logout-all", { method: "POST" }),

  me: () => request<{ user: AdminUser | null }>("/auth/me"),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: true }>("/auth/password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  // ── 登录二次验证（验证器 / TOTP） ──
  mfaSetup: () => request<{ secret: string; otpauthUri: string }>("/admin/mfa/setup"),

  mfaConfirm: (code: string) =>
    request<{ ok: true; mfaType: "totp" }>("/admin/mfa/confirm", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),

  mfaDisable: (input: { code?: string; password?: string }) =>
    request<{ ok: true; mfaType: "none" }>("/admin/mfa/disable", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  resetAdminMfa: (id: number) =>
    request<{ ok: true }>(`/admin/admins/${id}/reset-mfa`, { method: "POST" }),
}
