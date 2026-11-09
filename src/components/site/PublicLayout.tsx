import type { ReactNode } from "react"
import { Watermark } from "./Watermark"
import { SiteFooter } from "./SiteFooter"
import { SiteHeader } from "./SiteHeader"
import { usePrimaryFiling } from "@/lib/filing"

/**
 * 非租户的公共页面外壳：统一站点头部 + 水印 + 内容 + 页脚。
 * 用于「关于 / 隐私说明 / 许可声明 / 信息反馈」等顶层公开页面，确保导航在所有页面一致。
 */
export function PublicLayout({ children }: { children: ReactNode }) {
  const { icpNumber, policeNumber } = usePrimaryFiling()
  return (
    <div className="flex min-h-screen flex-col bg-paper-50">
      <Watermark />
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter icpNumber={icpNumber} policeNumber={policeNumber} />
    </div>
  )
}
