/** 公开接口：门户、单部族谱、访客溯源、信息反馈、站点配置读取 */

import type { Family, FamilySummary, Member, Stats } from "../types"
import type { AnalyticsProvider } from "../analytics"
import { request } from "./client"

export const publicApi = {
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

  // ── 平台级全局配置（网站名称 / 反馈开关 / 站点图标 / 统计接入） ──
  getSiteConfig: () =>
    request<{
      siteName: string
      feedbackEnabled?: boolean
      faviconDataUrl?: string
      analytics?: AnalyticsProvider[]
    }>("/public/site-config"),
}
