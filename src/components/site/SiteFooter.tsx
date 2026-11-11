import { useState } from "react"
import { Link } from "react-router-dom"
import { useFeedbackEnabled } from "@/lib/site-config"
import { BeiJingClock } from "./BeiJingClock"

// 公安备案图标：官方图标已下载至 public/ 本地托管（/gongan-badge.png）
const POLICE_ICON_SRC = "/gongan-badge.png"

interface SiteFooterProps {
  icpNumber?: string
  policeNumber?: string
}

/** 从公安备案号中提取纯数字，作为查询页 recordcode 参数 */
function policeRecordCode(policeNumber: string): string {
  return policeNumber.replace(/\D/g, "")
}

export function SiteFooter({ icpNumber, policeNumber }: SiteFooterProps) {
  const [iconFailed, setIconFailed] = useState(false)
  const feedbackEnabled = useFeedbackEnabled()
  const recordCode = policeNumber ? policeRecordCode(policeNumber) : ""

  return (
    <footer className="border-t border-paper-300 bg-paper-100">
      <div className="mx-auto flex max-w-[1320px] flex-col gap-8 px-6 py-10 sm:flex-row sm:items-end sm:justify-between">
        {/* 左侧：版权（版权归 Panda_Q 所有）· 许可声明/隐私说明 · 备案号 */}
        <div className="flex flex-col gap-3">
          <p className="text-[12px] tracking-[0.12em] text-ink-600">
            Copyright© 2026 Panda_Q
          </p>

          {/* 单行紧凑书写：各字段间仅以「·」连接，不插入任何空格；信息反馈不带图标 */}
          <div className="flex flex-wrap items-center text-[12px] tracking-[0.1em] text-muted-foreground">
            <Link to="/terms" className="transition-colors hover:text-ink-600">许可声明</Link>
            <span aria-hidden className="text-muted-foreground/60">·</span>
            <Link to="/privacy" className="transition-colors hover:text-ink-600">隐私说明</Link>
            {feedbackEnabled ? (
              <>
                <span aria-hidden className="text-muted-foreground/60">·</span>
                <Link to="/feedback" className="text-ink-600 transition-colors hover:text-gold-600">信息反馈</Link>
              </>
            ) : null}
          </div>

          {icpNumber ? (
            <a
              href="https://beian.miit.gov.cn/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11.5px] tracking-[0.06em] text-muted-foreground/80 transition-colors hover:text-ink-600"
            >
              {icpNumber}
            </a>
          ) : null}

          {policeNumber ? (
            <a
              href={
                recordCode
                  ? `https://www.beian.gov.cn/portal/registerSystemInfo?recordcode=${recordCode}`
                  : "https://www.beian.gov.cn/"
              }
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[11.5px] tracking-[0.06em] text-muted-foreground/80 transition-colors hover:text-ink-600"
            >
              {!iconFailed ? (
                <img
                  src={POLICE_ICON_SRC}
                  alt="公安备案图标"
                  width={14}
                  height={14}
                  loading="lazy"
                  onError={() => setIconFailed(true)}
                  className="h-[14px] w-[14px]"
                />
              ) : null}
              {policeNumber}
            </a>
          ) : null}
        </div>

        {/* 右侧底部：UTC+8 · 公历 · 农历（移动端居中，桌面端右对齐） */}
        <BeiJingClock />
      </div>
    </footer>
  )
}
