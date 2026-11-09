import type { Family, Member, Stats } from "../lib/types"

/** 公开接口返回的族谱信息不含维护人留痕字段，与 server/app.ts 的 publicFamily 一致 */
export type DemoFamily = Omit<Family, "createdBy" | "updatedBy" | "createdAt">

/** 门户列表条目：公开接口同样剔除留痕字段 */
export type DemoFamilySummary = DemoFamily & { memberCount: number }

export interface DemoSiteConfig {
  siteName: string
  feedbackEnabled: boolean
  faviconDataUrl: string
}

export interface DemoTenant {
  family: DemoFamily
  stats: Stats
  members: Member[]
}

export interface DemoPayload {
  generatedAt: string
  siteConfig: DemoSiteConfig
  filing: { icpNumber: string; policeNumber: string }
  families: DemoFamilySummary[]
  tenants: Record<string, DemoTenant>
}
