import { Check, ChevronDown, LayoutGrid, Search, SlidersHorizontal, X } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { TREE_STYLE_LABELS, TREE_STYLE_ORDER, type TreeStyle } from "@/lib/tree-style"
import { generationLabel, type Member } from "@/lib/types"
import { cn } from "@/lib/utils"

type GenealogyToolbarProps = {
  query: string
  onQueryChange: (value: string) => void
  suggestions: Member[]
  onPickSuggestion: (member: Member) => void
  style: TreeStyle
  onStyleChange: (style: TreeStyle) => void
  branches: string[]
  branchCounts: Record<string, number>
  selectedBranches: string[]
  onBranchesChange: (branches: string[]) => void
  shownCounts: { blood: number; extended: number }
  showExtended: boolean
  onShowExtendedChange: (showExtended: boolean) => void
  extendedHint: string
}

export function GenealogyToolbar({
  query,
  onQueryChange,
  suggestions,
  onPickSuggestion,
  style,
  onStyleChange,
  branches,
  branchCounts,
  selectedBranches,
  onBranchesChange,
  shownCounts,
  showExtended,
  onShowExtendedChange,
  extendedHint,
}: GenealogyToolbarProps) {
  const keyword = query.trim()

  return (
    <div className="order-1 shrink-0 border-b border-paper-200 bg-paper-50 px-2 py-2 sm:px-3">
      <div className="mx-auto flex max-w-[1080px] flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="搜索族人姓名或字号"
              className="h-8 w-full rounded-[8px] border border-paper-300 bg-white/70 pl-8 pr-8 text-[12.5px] tracking-[0.04em] text-ink-800 outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-ink-500"
            />
            {query ? (
              <button
                type="button"
                onClick={() => onQueryChange("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-ink-700"
                aria-label="清除搜索"
              >
                <X className="size-3.5" />
              </button>
            ) : null}

            {keyword && suggestions.length > 0 ? (
              <ul className="absolute left-0 top-10 z-20 w-full rounded-[8px] border border-paper-300 bg-paper-50 shadow-float">
                {suggestions.map((member) => (
                  <li key={member.id}>
                    <button
                      type="button"
                      onClick={() => onPickSuggestion(member)}
                      className="flex w-full items-baseline justify-between px-3 py-2 text-left transition-colors hover:bg-paper-100"
                    >
                      <span className="font-song text-[13px] tracking-[0.06em] text-ink-800">
                        {member.name}
                      </span>
                      <span className="text-[10px] tracking-[0.1em] text-muted-foreground">
                        {generationLabel(member.generation)}
                        {member.branch ? ` · ${member.branch}` : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-[8px] border px-2 py-[3px] text-[11px] tracking-[0.06em] transition-colors",
                  "border-paper-300 text-ink-600 hover:border-ink-400",
                )}
              >
                <LayoutGrid className="size-3" />
                展示样式
                <span className="text-ink-800">{TREE_STYLE_LABELS[style]}</span>
                <ChevronDown className="size-3 opacity-70" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              sideOffset={6}
              className="w-[200px] rounded-[8px] border-paper-300 bg-paper-50 p-0 shadow-float"
            >
              <div className="flex flex-col p-1">
                {TREE_STYLE_ORDER.map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={style === s}
                    onClick={() => onStyleChange(s)}
                    className={cn(
                      "flex items-center gap-2 px-2 py-1.5 text-left text-[12px] tracking-[0.04em] transition-colors hover:bg-paper-100",
                      style === s && "bg-paper-100 text-ink-800",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-3.5 shrink-0 items-center justify-center border",
                        style === s ? "border-ink-700 bg-ink-800 text-paper-50" : "border-ink-400/50",
                      )}
                    >
                      {style === s ? <Check className="size-2.5" strokeWidth={3} /> : null}
                    </span>
                    {TREE_STYLE_LABELS[s]}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-[8px] border px-2 py-[3px] text-[11px] tracking-[0.06em] transition-colors",
                  selectedBranches.length > 0
                    ? "border-ink-700 bg-ink-800 text-paper-50"
                    : "border-paper-300 text-ink-600 hover:border-ink-400",
                )}
              >
                <SlidersHorizontal className="size-3" />
                房支筛选
                {selectedBranches.length > 0 ? (
                  <span className="inline-flex min-w-[15px] items-center justify-center bg-paper-50/20 px-1 text-[9.5px] leading-[15px]">
                    {selectedBranches.length}
                  </span>
                ) : null}
                <ChevronDown className="size-3 opacity-70" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              sideOffset={6}
              className="w-[248px] rounded-[8px] border-paper-300 bg-paper-50 p-0 shadow-float"
            >
              <div className="flex items-center justify-between border-b border-paper-200 px-2.5 py-2">
                <span className="text-[10px] tracking-[0.16em] text-muted-foreground">按房支查看</span>
                <button
                  type="button"
                  onClick={() => onBranchesChange([])}
                  disabled={selectedBranches.length === 0}
                  className="text-[10px] tracking-[0.08em] text-ink-600 transition-colors hover:text-ink-800 disabled:cursor-not-allowed disabled:text-muted-foreground/40"
                >
                  全部房支
                </button>
              </div>
              <div className="max-h-[248px] overflow-y-auto p-1">
                {branches.length === 0 ? (
                  <p className="px-2 py-3 text-[11px] text-muted-foreground">尚未登记房支</p>
                ) : null}
                {branches.map((item) => {
                  const isSelected = selectedBranches.includes(item)
                  return (
                    <button
                      key={item}
                      type="button"
                      role="checkbox"
                      aria-checked={isSelected}
                      onClick={() =>
                        onBranchesChange(
                          isSelected
                            ? selectedBranches.filter((b) => b !== item)
                            : [...selectedBranches, item],
                        )
                      }
                      className={cn(
                        "flex w-full items-center gap-2 px-2 py-1.5 text-left transition-colors hover:bg-paper-100",
                        isSelected && "bg-paper-100",
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "flex size-3.5 shrink-0 items-center justify-center border",
                          isSelected ? "border-ink-700 bg-ink-800 text-paper-50" : "border-ink-400/50",
                        )}
                      >
                        {isSelected ? <Check className="size-2.5" strokeWidth={3} /> : null}
                      </span>
                      <span className="flex-1 truncate text-[12px] tracking-[0.04em] text-ink-800">
                        {item}
                      </span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {branchCounts[item] ?? 0} 人
                      </span>
                    </button>
                  )
                })}
              </div>
              <p className="border-t border-paper-200 px-2.5 py-1.5 text-[10px] leading-relaxed text-muted-foreground/80">
                可多选，取并集；未选任何房支即显示完整世系。
              </p>
            </PopoverContent>
          </Popover>

          <span className="ml-auto hidden shrink-0 text-[10px] tracking-[0.1em] text-muted-foreground sm:block">
            {selectedBranches.length > 0
              ? `已选 ${selectedBranches.length} 个房支 · 血脉 ${shownCounts.blood} 位 · 外衍 ${shownCounts.extended} 位`
              : `血脉 ${shownCounts.blood} 位 · 外衍 ${shownCounts.extended} 位 / 点击查看档案`}
          </span>
        </div>
        {/*
          图例 + 外衍开关：桌面端左右两列，右侧控件组相对整个方框垂直居中；
          移动端沿用原来的弹性排列（图例与开关同排两端对齐、说明整行在下），不做调整。
        */}
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5 border-t border-paper-200 pt-1.5 sm:gap-4">
          <div className="min-w-0 sm:flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] tracking-[0.06em] text-muted-foreground/80">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-0 w-5 border-t-2 border-solid border-ink-400" />
                本族血脉
              </span>
              <span className="flex items-center gap-1.5" title="出嫁女子之后裔">
                <span className="inline-block h-0 w-5 border-t-2 border-dashed border-ink-400" />
                外衍
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-1 sm:shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-[10.5px] tracking-[0.06em] text-ink-700">出嫁女子后裔</span>
              <button
                type="button"
                role="switch"
                aria-checked={showExtended}
                aria-label="出嫁女子后裔（外衍）是否随谱展示"
                onClick={() => onShowExtendedChange(!showExtended)}
                className={cn(
                  // after 伪元素把可点区域扩到约 44×32，视觉尺寸缩小后触控仍好按
                  "relative h-[16px] w-[28px] shrink-0 rounded-full border transition-colors duration-200 after:absolute after:-inset-2 after:content-['']",
                  showExtended
                    ? "border-ink-700 bg-ink-800"
                    : "border-paper-400 bg-paper-200 hover:border-ink-400",
                )}
              >
                <span
                  className={cn(
                    "absolute top-1/2 size-[10px] -translate-y-1/2 rounded-full bg-paper-50 shadow-sm transition-all duration-200",
                    showExtended ? "left-[14px]" : "left-[2px]",
                  )}
                />
              </button>
              <span
                className={cn(
                  "text-[10px] tracking-[0.1em]",
                  showExtended ? "text-gold-700" : "text-muted-foreground",
                )}
              >
                {showExtended ? "随谱展示" : "未随谱"}
              </span>
            </div>
            <p className="text-[10px] leading-[1.55] tracking-[0.03em] text-muted-foreground/80 sm:max-w-[300px]">
              {extendedHint}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
