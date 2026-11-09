import { Component, type ErrorInfo, type ReactNode } from "react"

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * 全局渲染兜底：任何页面抛错时给一个可操作的提示页，而不是整屏白屏。
 *
 * 只做呈现，不吞错：错误仍会打到控制台，便于排查。
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("页面渲染失败", error, info.componentStack)
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex min-h-screen items-center justify-center bg-paper-100 px-6">
        <div className="w-full max-w-[420px] border border-ink-800/12 bg-paper-50 px-8 py-10 text-center shadow-float">
          <p className="font-song text-[22px] tracking-[0.18em] text-ink-800">页面暂时无法显示</p>
          <p className="mt-3 text-[12.5px] leading-relaxed tracking-[0.04em] text-muted-foreground">
            可能是当前页面数据异常或版本已更新。可以先刷新；若仍不行，回到族谱总目重新进入。
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="border border-ink-800 bg-ink-800 px-4 py-2 text-[12.5px] tracking-[0.08em] text-paper-50 transition-opacity hover:opacity-90"
            >
              刷新页面
            </button>
            <a
              href="/"
              className="border border-ink-800/25 px-4 py-2 text-[12.5px] tracking-[0.08em] text-ink-700 transition-colors hover:border-ink-800/50"
            >
              返回总目
            </a>
          </div>
        </div>
      </div>
    )
  }
}
