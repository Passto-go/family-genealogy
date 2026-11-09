import type {
  AdminUser,
  AuditLog,
  Family,
  FamilyDraft,
  FamilySummary,
  Member,
  MemberDraft,
  MemberSubmission,
  Stats,
  SubmissionStatus,
} from "./types"

/** 证书域名视图（后端 /api/admin/domains 返回） */
export interface DomainView {
  id: number
  domain: string
  /** pending 待签发 / issuing 签发中 / active 已生效 / failed 失败 / renewing 续期中 */
  status: string
  /** 证书到期时间（ISO），签发成功后回填 */
  expiryDate: string
  /** 证书在宿主机 Nginx 上的路径（仅展示） */
  certPath: string
  /** 最近一次失败原因 */
  lastError: string
  createdAt: string
  updatedAt: string
}

/** 批量导入提交的一行：已由前端归一化并推导好世次 / 房支，服务端仍会独立复核 */
export interface MemberImportPayload {
  no: string
  name: string
  gender: "male" | "female"
  generation: number
  courtesyName: string
  branch: string
  fatherNo: string
  motherNo: string
  spouseNo: string
  isMarriedIn: boolean
  isBranchHeir: boolean
  birthYear: string
  deathYear: string
  isAlive: boolean
  burialPlace: string
  title: string
  bio: string
  sortOrder: number
}

export class ApiError extends Error {
  status: number
  /** 服务端随错误返回的结构化明细，例如批量导入的逐行问题 */
  details: unknown

  constructor(message: string, status: number, details?: unknown) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.details = details
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) }
  if (init.body) headers["Content-Type"] = "application/json"

  const response = await fetch(`/api${path}`, {
    credentials: "include",
    ...init,
    headers,
  })

  const text = await response.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }
  }

  if (!response.ok) {
    let message = `请求失败（${response.status}）`
    if (data && typeof data === "object" && "error" in data) {
      const raw = (data as { error: unknown }).error
      if (typeof raw === "string" && raw) message = raw
    }
    throw new ApiError(message, response.status, data)
  }

  return data as T
}

export const api = {
  // ── 门户与族谱（按 slug 访问） ──
  listPublicFamilies: () => request<{ families: FamilySummary[] }>("/public/families"),

  getTenantFamily: (slug: string) =>
    request<{ family: Family }>(`/t/${encodeURIComponent(slug)}/family`),

  getTenantStats: (slug: string) => request<Stats>(`/t/${encodeURIComponent(slug)}/stats`),

  getTenantMembers: (slug: string) =>
    request<{ members: Member[] }>(`/t/${encodeURIComponent(slug)}/members`),

  unlockTenant: (slug: string, password: string) =>
    request<{ ok: true }>(`/t/${encodeURIComponent(slug)}/access`, {
      method: "POST",
      body: JSON.stringify({ password }),
    }),

  // ── 访客溯源：获取客户端 IP 用于水印（不存储） ──
  getVisitorIp: () => request<{ ip: string }>("/visitor/ip"),

  // ── 信息反馈（公开提交） ──
  submitFeedback: (
    slug: string,
    body: { reporterName: string; message: string; payload: unknown },
  ) =>
    request<{ id: number }>(`/t/${encodeURIComponent(slug)}/feedback`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  /** 反馈：首页直达（无族内上下文），需自选家族；选「其他家族」时不传 slug、传 familyLabel */
  submitFeedbackPublic: (body: {
    familySlug?: string
    familyLabel?: string
    reporterName: string
    message: string
    payload: unknown
  }) =>
    request<{ id: number }>("/feedback", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // ── 鉴权 ──
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
  mfaSetup: () =>
    request<{ secret: string; otpauthUri: string }>("/admin/mfa/setup"),

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

  // ── 后台：家族 ──
  listFamilies: () => request<{ families: FamilySummary[] }>("/admin/families"),

  createFamily: (draft: FamilyDraft) =>
    request<{ id: number }>("/admin/families", {
      method: "POST",
      body: JSON.stringify(draft),
    }),

  updateFamily: (id: number, patch: Partial<FamilyDraft> & { branchRenames?: [string, string][] }) =>
    request<{ family: Family }>(`/admin/families/${id}`, {
      method: "PUT",
      body: JSON.stringify(patch),
    }),

  // ── 后台：成员 ──
  getMembers: (familyId?: number) =>
    request<{ members: Member[] }>(
      familyId ? `/admin/members?familyId=${familyId}` : "/admin/members",
    ),

  getStats: (familyId?: number) =>
    request<Stats>(familyId ? `/admin/stats?familyId=${familyId}` : "/admin/stats"),

  createMember: (draft: MemberDraft) =>
    request<{ id: number }>("/admin/members", {
      method: "POST",
      body: JSON.stringify(draft),
    }),

  importMembers: (familyId: number, rows: MemberImportPayload[]) =>
    request<{ created: number; ids: number[] }>("/admin/members/import", {
      method: "POST",
      body: JSON.stringify({ familyId, rows }),
    }),

  updateMember: (id: number, draft: MemberDraft) =>
    request<{ ok: true }>(`/admin/members/${id}`, {
      method: "PUT",
      body: JSON.stringify(draft),
    }),

  deleteMember: (id: number) =>
    request<{ ok: true }>(`/admin/members/${id}`, {
      method: "DELETE",
    }),

  // ── 后台：成员头像（文件上传走独立 fetch，避免覆盖 Content-Type） ──
  uploadMemberAvatar: (id: number, formData: FormData) =>
    fetch(`/api/admin/members/${id}/avatar`, {
      method: "POST",
      body: formData,
      credentials: "include",
    }).then(async (res) => {
      if (!res.ok) {
        let message = `上传失败（${res.status}）`
        try {
          const data = (await res.json()) as { error?: string }
          if (data?.error) message = data.error
        } catch {
          // 忽略响应体解析失败，沿用默认提示
        }
        throw new ApiError(message, res.status)
      }
      return (await res.json()) as { avatarKey: string; url: string }
    }),

  deleteMemberAvatar: (id: number) =>
    request<{ ok: true }>(`/admin/members/${id}/avatar`, { method: "DELETE" }),

  // ── 后台：信息反馈审核 ──
  listSubmissions: (familyId?: number, status?: string) =>
    request<{ submissions: MemberSubmission[] }>(
      `/admin/submissions${
        familyId ? `?familyId=${familyId}` : ""
      }${status ? `${familyId ? "&" : "?"}status=${status}` : ""}`,
    ),

  updateSubmission: (id: number, status: SubmissionStatus) =>
    request<{ ok: true }>(`/admin/submissions/${id}`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    }),

  batchDeleteSubmissions: (ids: number[]) =>
    request<{ deleted: number; ids: number[] }>("/admin/submissions/batch-delete", {
      method: "POST",
      body: JSON.stringify({ ids }),
    }),

  appendAuditLog: (input: {
    action: string
    targetType: string
    targetId: string
    detail: string
  }) =>
    request<{ ok: true }>("/admin/audit-logs", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  // ── 后台：管理员账号治理（仅超级管理员） ──
  listAdmins: () => request<{ admins: AdminUser[] }>("/admin/admins"),

  createAdmin: (input: {
    username: string
    password: string
    role: string
    familyId?: number | null
  }) =>
    request<{ ok: true }>("/admin/admins", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  updateAdmin: (id: number, patch: { role?: string; isDisabled?: boolean; familyId?: number | null }) =>
    request<{ ok: true }>(`/admin/admins/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  resetAdminPassword: (id: number, password: string) =>
    request<{ ok: true }>(`/admin/admins/${id}/reset-password`, {
      method: "POST",
      body: JSON.stringify({ password }),
    }),

  deleteAdmin: (id: number) =>
    request<{ ok: true }>(`/admin/admins/${id}`, { method: "DELETE" }),

  // ── 后台：审计日志（仅超级管理员可见） ──
  listAuditLogs: (
    limit = 200,
    offset = 0,
    action?: string,
    actor?: string,
    year?: number,
    month?: number,
  ) => {
    const params = new URLSearchParams()
    params.set("limit", String(Math.min(limit, 200)))
    params.set("offset", String(Math.max(offset, 0)))
    if (action) params.set("action", action)
    if (actor) params.set("actor", actor)
    if (year != null) params.set("year", String(year))
    if (month != null) params.set("month", String(month))
    // total 为与本次筛选一致的总条数；旧后端未返回时前端按 hasMore 兜底
    return request<{ logs: AuditLog[]; total?: number }>(`/admin/audit-logs?${params.toString()}`)
  },

  // 批量导出审计日志为 CSV（仅超级管理员）；后端强制不可删除，仅支持查看与导出。
  // 可按「全部 / 年份 / 年月」范围筛选，不同范围需对应导出权限，无权限时后端返回明确提示。
  exportAuditLogs: (opts: {
    action?: string
    actor?: string
    year?: number
    month?: number
  } = {}) => {
    const params = new URLSearchParams()
    if (opts.action) params.set("action", opts.action)
    if (opts.actor) params.set("actor", opts.actor)
    if (opts.year != null) params.set("year", String(opts.year))
    if (opts.month != null) params.set("month", String(opts.month))
    const query = params.toString()
    return fetch(`/api/admin/audit-logs/export${query ? `?${query}` : ""}`, {
      credentials: "include",
    }).then(async (res) => {
      if (!res.ok) {
        let message = `导出失败（${res.status}）`
        try {
          const data = (await res.json()) as { error?: string }
          if (data?.error) message = data.error
        } catch {
          // 忽略响应体解析失败，沿用默认提示
        }
        throw new ApiError(message, res.status)
      }
      return res.text()
    })
  },

  // ── 平台级全局配置（网站名称 / 反馈开关 / 站点图标） ──
  getSiteConfig: () =>
    request<{ siteName: string; feedbackEnabled?: boolean; faviconDataUrl?: string }>(
      "/public/site-config",
    ),

  putSiteConfig: (siteName: string, feedbackEnabled?: boolean, faviconDataUrl?: string) =>
    request<{ siteName: string; feedbackEnabled: boolean; faviconDataUrl: string }>(
      "/admin/site-config",
      {
        method: "PUT",
        body: JSON.stringify({
          siteName,
          ...(feedbackEnabled !== undefined ? { feedbackEnabled } : {}),
          ...(faviconDataUrl !== undefined ? { faviconDataUrl } : {}),
        }),
      },
    ),

  // ── 后台：证书域名（自动 TLS 签发/续期） ──
  listDomains: () => request<{ domains: DomainView[] }>("/admin/domains"),

  createDomain: (domain: string) =>
    request<{ id: number }>("/admin/domains", {
      method: "POST",
      body: JSON.stringify({ domain }),
    }),

  deleteDomain: (id: number) =>
    request<{ ok: true }>(`/admin/domains/${id}`, { method: "DELETE" }),

  renewDomain: (id: number) =>
    request<{ ok: true }>(`/admin/domains/${id}/renew`, { method: "POST" }),
}
