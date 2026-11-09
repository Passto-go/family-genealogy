import { useState } from "react"
import { cn } from "@/lib/utils"

/**
 * 后台通用分页条：左下角「第 X / Y 页」，右侧「上一页 / 下一页 / 页码输入 / 跳转」。
 *
 * 拆成独立组件而非各页各写一份，是为了让族人管理、操作日志以及后续新增的
 * 管理员、家族管理、反馈审核等列表页共用同一套版式与交互，避免逐页复制后走样。
 * 页码跳转只在点击「跳转」时生效：输入过程中不做任何请求，否则边输边跳会
 * 在输入两位数时先请求一次个位数页。
 */
export function Pagination({
  page,
  totalPages,
  onPageChange,
  disabled = false,
  className,
}: {
  /** 当前页码，从 1 开始 */
  page: number
  /** 总页数；调用方按 total/pageSize 自行取整 */
  totalPages: number
  onPageChange: (page: number) => void
  /** 数据加载中：置灰按钮，避免连点发起重复请求 */
  disabled?: boolean
  className?: string
}) {
  const [draft, setDraft] = useState("")

  /* 只有一页时不占版面，列表底部不再多出一条无意义的控件 */
  if (totalPages <= 1) return null

  const buttonClass =
    "rounded-[8px] border border-paper-300 bg-paper-50 px-3 py-1.5 text-[11.5px] text-ink-600 transition-colors hover:bg-paper-100 disabled:opacity-40"
  const canJump = draft !== "" && !disabled
  /* 翻页动作一律经此入口，顺带清空输入框，避免上一次的页码残留成新指令 */
  const goTo = (target: number) => {
    setDraft("")
    if (target === page) return
    onPageChange(target)
  }

  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <span className="text-[12.5px] text-muted-foreground">
        第 {page} / {totalPages} 页
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={disabled || page <= 1}
          onClick={() => goTo(page - 1)}
          className={buttonClass}
        >
          上一页
        </button>
        <button
          type="button"
          disabled={disabled || page >= totalPages}
          onClick={() => goTo(page + 1)}
          className={buttonClass}
        >
          下一页
        </button>
        <input
          type="text"
          inputMode="numeric"
          value={draft}
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value.replace(/\D/g, ""))}
          aria-label="页码"
          placeholder="页码"
          title={`输入 1–${totalPages} 之间的页码`}
          className="h-[30px] w-14 rounded-[8px] border border-paper-300 bg-white text-center text-[11.5px] text-ink-700 outline-none transition-colors focus:border-ink-600 disabled:opacity-40"
        />
        <button
          type="button"
          disabled={!canJump}
          onClick={() => {
            const target = Number(draft)
            if (!Number.isFinite(target) || target < 1) return
            goTo(Math.min(totalPages, target))
          }}
          className={buttonClass}
        >
          跳转
        </button>
      </div>
    </div>
  )
}
