/** 后台接口：家族、成员、反馈审核、管理员、审计日志、证书域名、站点设置 */

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
} from "../types"
import { rawRequest, request } from "./client"
import type { AnalyticsProvider } from "../analytics"
import type { DomainView, MemberImportPayload } from "./types"

export const adminApi = {
  // ── 后台：家族 ──
  listFamilies: () => request<{ families: FamilySummary[] }>("/admin/families"),

  createFamily: (draft: FamilyDraft) =>
    request<{ id: number; accessPassword?: string }>("/admin/families", {
      method: "POST",
      body: JSON.stringify(draft),
    }),

  updateFamily: (id: number, patch: Partial<FamilyDraft> & { branchRenames?: [string, string][] }) =>
    request<{ family: Family; accessPassword?: string }>(`/admin/families/${id}`, {
      method: "PUT",
      body: JSON.stringify(patch),
    }),

  rotateAccessPassword: (id: number) =>
    request<{ accessPassword: string }>(`/admin/families/${id}/rotate-access-password`, {
      method: "POST",
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

  // 批量删除成员：自动解除关联；返回已删/失败/越权/曾为房头的 id 列表
  deleteMembers: (ids: number[], familyId: number) =>
    request<{
      deleted: number[]
      failed: { id: number; reason: string }[]
      rejected: number[]
      branchHeadWarnings: number[]
    }>("/admin/members/batch-delete", {
      method: "POST",
      body: JSON.stringify({ ids, familyId }),
    }),

  // ── 后台：成员头像（文件上传走独立 fetch，避免覆盖 Content-Type） ──
  uploadMemberAvatar: (id: number, formData: FormData) =>
    rawRequest(`/admin/members/${id}/avatar`, { method: "POST", body: formData }, "上传失败").then(
      async (res) => (await res.json()) as { avatarKey: string; url: string },
    ),

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
    return rawRequest(
      `/admin/audit-logs/export${query ? `?${query}` : ""}`,
      {},
      "导出失败",
    ).then((res) => res.text())
  },

  // ── 平台级全局配置写入（analytics 为可选，提供时才更新，避免覆盖其他保存动作写入的值） ──
  putSiteConfig: (
    siteName: string,
    feedbackEnabled?: boolean,
    faviconDataUrl?: string,
    analytics?: AnalyticsProvider[],
  ) =>
    request<{
      siteName: string
      feedbackEnabled: boolean
      faviconDataUrl: string
      analytics: AnalyticsProvider[]
    }>("/admin/site-config", {
      method: "PUT",
      body: JSON.stringify({
        siteName,
        ...(feedbackEnabled !== undefined ? { feedbackEnabled } : {}),
        ...(faviconDataUrl !== undefined ? { faviconDataUrl } : {}),
        ...(analytics !== undefined ? { analytics } : {}),
      }),
    }),

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
