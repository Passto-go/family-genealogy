import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { Link } from "react-router-dom"
import { Check, Copy, List, X } from "lucide-react"
import { cn } from "@/lib/utils"

/** 目录条目 */
export interface TocItem {
  id: string
  label: string
}

/** 页面滚动期间返回 true，停止滚动约 180ms 后恢复，用于悬浮按钮的滚动淡出 */
function useScrollingFlag(delay = 180) {
  const [scrolling, setScrolling] = useState(false)

  useEffect(() => {
    let timer: number | undefined
    const onScroll = () => {
      setScrolling(true)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setScrolling(false), delay)
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      window.removeEventListener("scroll", onScroll)
      window.clearTimeout(timer)
    }
  }, [delay])

  return scrolling
}

/** 依据章节相对视口顶部的位置，返回当前正在阅读的章节 id */
function useActiveSection(ids: string[], enabled: boolean) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const key = ids.join("|")

  useEffect(() => {
    if (!enabled || !key) return
    const list = key.split("|")
    const compute = () => {
      // sticky 顶栏约 64px，留余量后判定「已读到此章节」
      const threshold = 120
      let current = list[0]
      try {
        for (const id of list) {
          const el = document.getElementById(id)
          if (!el) continue
          if (el.getBoundingClientRect().top <= threshold) current = id
          else break
        }
        setActiveId(current)
      } catch {
        // 元素在读取瞬间被卸载等 DOM 异常：保持上一次结果，不冒泡成未捕获错误
      }
    }
    compute()
    window.addEventListener("scroll", compute, { passive: true })
    window.addEventListener("resize", compute)
    return () => {
      window.removeEventListener("scroll", compute)
      window.removeEventListener("resize", compute)
    }
  }, [key, enabled])

  return activeId
}

/** 目录条目；activeId 在展开时高亮为当前章节 */
function TocList({
  items,
  activeId,
  onNavigate,
}: {
  items: TocItem[]
  activeId: string | null
  onNavigate: (id: string) => void
}) {
  return (
    <ol className="space-y-1">
      {items.map((item) => {
        const active = item.id === activeId
        return (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              aria-current={active ? "location" : undefined}
              onClick={(event: MouseEvent<HTMLAnchorElement>) => {
                event.preventDefault()
                onNavigate(item.id)
              }}
              className={cn(
                "block border-l-2 py-1.5 pl-2.5 text-[12.5px] leading-[1.7] transition-colors",
                active
                  ? "border-gold-600 bg-gold-100 font-medium text-ink-800"
                  : "border-transparent text-muted-foreground hover:border-ink-300 hover:text-ink-700",
              )}
            >
              {item.label}
            </a>
          </li>
        )
      })}
    </ol>
  )
}

/**
 * 章节标题（如「一、适用范围」）。
 * badge 为 true 时在标题右侧追加「新增」小徽标，用于标示后补章节。
 */
export function Chapter({
  id,
  title,
  badge,
  children,
}: {
  id?: string
  title: string
  badge?: boolean
  children: ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-8">
      <h2 className="flex flex-wrap items-center gap-2.5 text-[19px] font-semibold tracking-[0.03em] text-ink-900">
        {title}
        {badge ? (
          <span className="rounded-sm border border-gold-600/40 bg-gold-50 px-1.5 py-0.5 text-[10.5px] font-normal tracking-[0.14em] text-gold-700">
            新增
          </span>
        ) : null}
      </h2>
      <div className="mt-4 space-y-3.5 text-[13.5px] leading-[1.95] text-ink-700">{children}</div>
    </section>
  )
}

/** 小节标题（如「1. 你主动提供的」） */
export function H3({ children }: { children: ReactNode }) {
  return <h3 className="pt-3 text-[15px] font-semibold tracking-[0.02em] text-ink-800">{children}</h3>
}

/** 无序列表；嵌套列表再包一层 UL 并加缩进样式 */
export function UL({ children, nested }: { children: ReactNode; nested?: boolean }) {
  return (
    <ul
      className={cn(
        "space-y-2 marker:text-muted-foreground/70",
        nested ? "list-[circle] pl-5 pt-1" : "list-disc pl-5",
      )}
    >
      {children}
    </ul>
  )
}

/** 数据表格：表头浅灰底、行间细分割线，横向可滚动以适配窄屏 */
export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto pt-1">
      <table className="w-full min-w-[540px] border-collapse text-[13px] leading-[1.8]">
        <thead>
          <tr className="bg-paper-100 text-left">
            {head.map((h) => (
              <th
                key={h}
                className="whitespace-nowrap border-b border-paper-300 px-4 py-3 text-[12.5px] font-medium tracking-[0.04em] text-ink-700"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-paper-200 align-top">{children}</tbody>
      </table>
    </div>
  )
}

/** 表格单元格；首列可传 className="font-medium text-ink-800" 加重 */
export function Td({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cn("px-4 py-3.5 text-ink-700", className)}>{children}</td>
}

/** 说明 / 提示框（浅灰底） */
export function Note({ label = "说明", children }: { label?: string; children: ReactNode }) {
  return (
    <div className="bg-paper-100 px-4 py-3 text-[12.5px] leading-[1.9] text-ink-600">
      <span className="font-medium text-ink-700">{label}：</span>
      {children}
    </div>
  )
}

/** 行内代码 / 标识名（等宽字体 + 浅灰底） */
export function C({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-paper-100 px-1.5 py-0.5 font-mono text-[12px] text-ink-700">
      {children}
    </code>
  )
}

/**
 * 邮箱复制按钮：紧跟邮箱地址的小按钮，点击后复制到剪贴板并短暂提示「邮箱已复制」。
 * 针对手机端多数设备未配置邮件客户端、点 mailto 无响应的情况，提供更可靠的取址方式。
 */
export function CopyEmail({ email }: { email: string }) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timerRef.current), [])

  async function handleCopy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(email)
      } else {
        // 非安全上下文（如备案期 HTTP 入口）降级到 execCommand
        const ta = document.createElement("textarea")
        ta.value = email
        ta.style.position = "fixed"
        ta.style.opacity = "0"
        document.body.appendChild(ta)
        ta.select()
        document.execCommand("copy")
        document.body.removeChild(ta)
      }
    } catch {
      // 复制失败也不打断阅读；反馈仍给出，极端环境可长按邮箱手动复制
    }
    setCopied(true)
    window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      aria-label="复制邮箱地址"
      title="复制邮箱地址"
      className={cn(
        "ml-2 inline-flex h-7 items-center gap-1.5 rounded-[7px] border px-2.5 align-middle text-[12px] tracking-[0.02em] transition-colors",
        copied
          ? "border-emerald-600/40 bg-emerald-50 text-emerald-700"
          : "border-paper-300 text-ink-600 hover:border-ink-400 hover:text-ink-800",
      )}
    >
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      {copied ? "邮箱已复制" : "复制"}
    </button>
  )
}

/**
 * 法律文档页外壳：页头 + 目录悬浮层 + 正文 + 返回链接。
 * 顶部导航常驻，不再单独提供返回顶部按钮。
 *
 * 目录交互规则：
 *   - 目录按钮、遮罩、面板通过 createPortal 挂到 body；面板是贴右边缘的全高抽屉，
 *     桌面固定 320px、移动端占 86vw，顶部为「目录」标题与关闭按钮，展开时覆盖页面；
 *     桌面端按钮是贴右边缘、仅左侧两角带圆弧的竖排「目录」标签（右侧直角、无右边框）；
 *     移动端是离右边缘留间距的正圆形图标按钮，不显示文字；位置由 useLayoutEffect
 *     按 visualViewport.height 算出 67% 的像素值写入内联样式（距底 33%），
 *     index.css 的 .legal-toc-anchor 仅作 JS 未就绪时的兜底；桌面端维持居中下移 56px；
 *   - 展开时 #root 置为 inert + aria-hidden，锁定 html/body 滚动并显示半透明遮罩，
 *     阻断底层页面的点击、滚动与键盘聚焦；焦点限制在目录按钮与面板之间；
 *     关闭时按原值恢复 inert、aria-hidden、滚动与滚动位置，焦点交还目录按钮；
 *   - 再次点击按钮、点击遮罩或按 Esc 收起；按钮随状态切换图标与配色，滚动时自动变浅；
 *   - 面板高亮当前阅读章节（aria-current="location"），点击条目后收起并平滑滚动到该章节；
 *   - 折叠状态不做持久化：每次进入页面（含刷新与站内切换）都回到默认隐藏状态。
 */
export function LegalDoc({
  eyebrow,
  title,
  updatedAt,
  toc,
  children,
}: {
  eyebrow: string
  title: string
  updatedAt: string
  toc?: TocItem[]
  children: ReactNode
}) {
  const [tocOpen, setTocOpen] = useState(false)
  const hasToc = Boolean(toc && toc.length > 0)
  const scrolling = useScrollingFlag()
  const tocIds = useMemo(() => (toc ?? []).map((item) => item.id), [toc])
  const activeId = useActiveSection(tocIds, tocOpen)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const pendingScrollRef = useRef<string | null>(null)
  const wasOpenRef = useRef(false)

  // 进入文档页复位到顶部：从站内底部页脚点入时，浏览器会保留上一页滚动位置，
  // 否则页面会打开在中间而非开头。behavior:"instant" 绕开 index.css 的 smooth，
  // 并中止上一页尚未结束的平滑滚动。
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" })
  }, [])

  // 移动端目录按钮：直接按当前可视高度算像素 top。
  // % 与 svh 在部分移动浏览器（含 Safari 设备模拟）里会解析出远大于可视高度的位置，
  // 让按钮贴底甚至出界；这里绕开 CSS 相对单位，桌面端清空内联样式交回 Tailwind 类。
  useLayoutEffect(() => {
    const update = () => {
      const btn = toggleRef.current
      if (!btn) return
      if (window.innerWidth >= 640) {
        btn.style.top = ""
        btn.style.marginTop = ""
        return
      }
      const h = window.visualViewport?.height ?? window.innerHeight
      btn.style.top = `${Math.round(h * 0.67)}px`
      btn.style.marginTop = "0px"
    }
    update()
    // 设备模拟/浏览器首帧视口可能尚未稳定，下一帧再校准一次
    const frame = window.requestAnimationFrame(update)
    window.addEventListener("resize", update)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener("resize", update)
    }
  }, [hasToc])

  // 展开期间：底层页面整体 inert + 锁滚动，仅 body 上的目录层可交互
  useEffect(() => {
    if (!tocOpen) return
    const root = document.getElementById("root")
    if (!root) return
    const html = document.documentElement
    const body = document.body
    const hadInert = root.hasAttribute("inert")
    const prevAriaHidden = root.getAttribute("aria-hidden")
    const prevHtmlOverflow = html.style.overflow
    const prevBodyOverflow = body.style.overflow
    const prevScrollBehavior = html.style.scrollBehavior
    const scrollY = window.scrollY

    root.setAttribute("inert", "")
    root.setAttribute("aria-hidden", "true")
    html.style.overflow = "hidden"
    body.style.overflow = "hidden"

    const frame = window.requestAnimationFrame(() => panelRef.current?.focus())
    return () => {
      window.cancelAnimationFrame(frame)
      if (!hadInert) root.removeAttribute("inert")
      if (prevAriaHidden == null) root.removeAttribute("aria-hidden")
      else root.setAttribute("aria-hidden", prevAriaHidden)
      html.style.overflow = prevHtmlOverflow
      body.style.overflow = prevBodyOverflow
      html.style.scrollBehavior = "auto"
      if (window.scrollY !== scrollY) window.scrollTo(0, scrollY)
      html.style.scrollBehavior = prevScrollBehavior
    }
  }, [tocOpen])

  // Esc 收起；Tab 焦点限制在目录按钮与面板之间
  useEffect(() => {
    if (!tocOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setTocOpen(false)
        return
      }
      if (event.key !== "Tab") return
      const panel = panelRef.current
      if (!panel) return
      const focusables = Array.from(
        panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
      )
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [tocOpen])

  // 收起后交还焦点；有待跳转章节时，等滚动锁解除再平滑滚动
  useEffect(() => {
    if (tocOpen) {
      wasOpenRef.current = true
      return
    }
    if (!wasOpenRef.current) return
    toggleRef.current?.focus({ preventScroll: true })
    const id = pendingScrollRef.current
    if (!id) return
    pendingScrollRef.current = null
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [tocOpen])

  const handleNavigate = (id: string) => {
    pendingScrollRef.current = id
    setTocOpen(false)
  }

  return (
    <>
      <div className="mx-auto max-w-[760px] px-6 py-14">
        <header className="border-b border-paper-200 pb-8">
          <div className="flex items-center gap-3">
            <span className="h-px w-5 bg-gold-600" />
            <span className="text-[12.5px] tracking-[0.34em] text-gold-700">{eyebrow}</span>
          </div>
          <h1 className="mt-4 font-song text-[28px] tracking-[0.14em] text-ink-800">{title}</h1>
          <p className="mt-3 text-[12px] tracking-[0.08em] text-muted-foreground">
            最后更新：{updatedAt}
          </p>
        </header>

        <div className="mt-10 space-y-12">{children}</div>

        <div className="mt-12 border-t border-paper-200 pt-6">
          <Link
            to="/"
            className="text-[12px] tracking-[0.1em] text-muted-foreground transition-colors hover:text-ink-600"
          >
            ← 返回网站首页
          </Link>
        </div>
      </div>

      {hasToc && typeof document !== "undefined"
        ? createPortal(
            <>
              {/* 全屏遮罩：覆盖底层页面，阻断点击与触摸滚动 */}
              <div
                aria-hidden
                onClick={() => setTocOpen(false)}
                style={{ touchAction: "none", overscrollBehavior: "contain" }}
                className={cn(
                  "fixed inset-0 z-[10000] bg-black/45 transition-opacity duration-300 ease-out",
                  tocOpen ? "opacity-100" : "pointer-events-none opacity-0",
                )}
              />

              {/* 右侧悬浮按钮：移动端正圆图标，桌面端左侧弧形竖排标签；滚动时自动变浅 */}
              <button
                ref={toggleRef}
                type="button"
                id="legal-toc-toggle"
                aria-label={tocOpen ? "收起目录" : "打开目录"}
                aria-controls="legal-toc-panel"
                aria-expanded={tocOpen}
                tabIndex={tocOpen ? -1 : 0}
                onClick={() => setTocOpen((open) => !open)}
                className={cn(
                  "legal-toc-anchor fixed top-1/2 z-[10001] mt-14 flex -translate-y-1/2 items-center justify-center border shadow-sm backdrop-blur transition-all duration-300 touch-manipulation",
                  "right-4 size-11 rounded-full sm:right-0 sm:h-auto sm:w-auto sm:flex-col sm:gap-1.5 sm:rounded-[8px_0_0_8px] sm:border-r-0 sm:px-1.5 sm:py-2.5",
                  tocOpen
                    ? "border-ink-500 bg-ink-800 text-paper-50"
                    : scrolling
                      ? "border-paper-200 bg-paper-100/70 text-ink-400"
                      : "border-paper-300 bg-paper-50/95 text-ink-600 hover:border-ink-400 hover:text-ink-800",
                  scrolling ? "opacity-75" : "opacity-100",
                )}
              >
                {tocOpen ? <X className="size-4" /> : <List className="size-4" />}
                <span className="hidden text-[12.5px] tracking-[0.2em] sm:block" style={{ writingMode: "vertical-rl" }}>
                  目录
                </span>
              </button>

              {/* 目录抽屉：贴右边缘全高，桌面固定宽、移动端占大部分屏宽 */}
              <nav
                ref={panelRef}
                id="legal-toc-panel"
                aria-label="目录"
                aria-hidden={!tocOpen}
                tabIndex={-1}
                className={cn(
                  "fixed right-0 top-0 z-[10001] flex h-full w-[86vw] flex-col border-l border-paper-300 bg-paper-50 shadow-lg outline-none transition-all duration-300 ease-out sm:w-[320px]",
                  tocOpen
                    ? "visible pointer-events-auto translate-x-0 opacity-100"
                    : "invisible pointer-events-none translate-x-full opacity-0",
                )}
              >
                <div className="flex shrink-0 items-center justify-between border-b border-paper-200 px-5 py-4">
                  <p className="text-[12.5px] tracking-[0.3em] text-muted-foreground">目录</p>
                  <button
                    type="button"
                    aria-label="关闭目录"
                    onClick={() => setTocOpen(false)}
                    className="flex size-7 items-center justify-center rounded-md border border-paper-300 text-ink-500 transition-colors hover:border-ink-400 hover:text-ink-800"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
                <div className="flex-1 overflow-auto px-5 py-5">
                  <TocList items={toc!} activeId={tocOpen ? activeId : null} onNavigate={handleNavigate} />
                </div>
              </nav>
            </>,
            document.body,
          )
        : null}
    </>
  )
}
