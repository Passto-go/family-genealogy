import { useLayoutEffect, useMemo } from "react"
import { useTenant } from "@/lib/tenant-context"

interface ChapterProps {
  id: string
  eyebrow: string
  title: string
  children: React.ReactNode
}

function Chapter({ id, eyebrow, title, children }: ChapterProps) {
  return (
    <section
      id={id}
      className="scroll-mt-24 border-t border-paper-300 pt-12 first:border-t-0 first:pt-0"
    >
      <div className="flex items-center gap-3">
        <span className="h-px w-5 bg-gold-600" />
        <span className="text-[12.5px] tracking-[0.34em] text-gold-700">{eyebrow}</span>
      </div>
      <h2 className="mt-4 font-song text-[25px] tracking-[0.16em] text-ink-800 sm:text-[28px]">
        {title}
      </h2>
      <div className="mt-7 space-y-5 text-[14.5px] leading-[2.15] text-ink-700">{children}</div>
    </section>
  )
}

const CHAPTERS = [
  { id: "preface", eyebrow: "序", title: "谱序" },
  { id: "origin", eyebrow: "源", title: "家族源流" },
  { id: "motto", eyebrow: "训", title: "家训" },
  { id: "rules", eyebrow: "规", title: "家规" },
  { id: "generation", eyebrow: "辈", title: "字辈派语" },
]

export default function Literature() {
  // 进入页面复位到顶部，避免从底部页脚点入时保留上一页滚动位置（法律/关于页同此处理）
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" })
  }, [])

  const { family, stats } = useTenant()

  const prefaceParagraphs = useMemo(
    () => (family?.preface ?? "").split("\n").filter((p) => p.trim()),
    [family?.preface],
  )
  const introParagraphs = useMemo(
    () => (family?.intro ?? "").split("\n").filter((p) => p.trim()),
    [family?.intro],
  )
  const mottoLines = useMemo(
    () => (family?.motto ?? "").split("\n").filter((p) => p.trim()),
    [family?.motto],
  )
  const ruleLines = useMemo(
    () => (family?.rules ?? "").split("\n").filter((p) => p.trim()),
    [family?.rules],
  )
  const poem = useMemo(
    () => Array.from((family?.generationPoem ?? "").replace(/[·•、，,\s]/g, "")),
    [family?.generationPoem],
  )

  const maxGeneration = stats?.generationCount ?? 0

  return (
    <div>
      <section className="relative overflow-hidden bg-ink-800 ink-texture py-16 text-paper-50 sm:py-20">
        <span
          aria-hidden
          className="pointer-events-none absolute -right-4 -top-10 select-none font-song text-[180px] leading-none text-white/[0.03]"
        >
          文
        </span>
        <div className="relative mx-auto max-w-[1320px] px-6">
          <div className="flex items-center gap-3 text-[12.5px] tracking-[0.5em] text-paper-50/45">
            <span className="h-px w-8 bg-gold-600/60" />
            文献
          </div>
          <h1 className="mt-6 font-song text-[32px] tracking-[0.2em] sm:text-[42px]">家族文献</h1>
          <p className="mt-4 text-[11.5px] tracking-[0.2em] text-paper-50/45">
            谱序　·　源流　·　家训　·　家规　·　字辈
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-[1320px] px-6 py-16 sm:py-20">
        <div className="grid gap-12 lg:grid-cols-[200px_1fr] lg:gap-20">
          <aside className="lg:sticky lg:top-28 lg:self-start">
            <p className="text-[12.5px] tracking-[0.3em] text-muted-foreground">目录</p>
            <nav className="mt-5 space-y-0.5">
              {CHAPTERS.map((chapter) => (
                <a
                  key={chapter.id}
                  href={`#${chapter.id}`}
                  className="block border-l border-paper-300 py-2 pl-4 text-[12.5px] tracking-[0.14em] text-muted-foreground transition-colors hover:border-gold-600 hover:text-ink-800"
                >
                  {chapter.title}
                </a>
              ))}
            </nav>
          </aside>

          <div className="max-w-[720px] space-y-14">
            <Chapter id="preface" eyebrow="序" title="谱序">
              {prefaceParagraphs.length > 0 ? (
                prefaceParagraphs.map((paragraph, index) => (
                  <p key={index} className="indent-8 text-justify">
                    {paragraph}
                  </p>
                ))
              ) : (
                <p className="text-muted-foreground">尚未录入谱序。</p>
              )}
              <p className="pt-4 text-right text-[12px] tracking-[0.16em] text-muted-foreground">
                嗣孙谨识
              </p>
            </Chapter>

            <Chapter id="origin" eyebrow="源" title="家族源流">
              {introParagraphs.length > 0 ? (
                introParagraphs.map((paragraph, index) => (
                  <p key={index} className="indent-8 text-justify">
                    {paragraph}
                  </p>
                ))
              ) : (
                <p className="text-muted-foreground">尚未录入家族源流。</p>
              )}

              <dl className="grid grid-cols-2 gap-px border border-paper-300 bg-paper-300 text-[12.5px] sm:grid-cols-3">
                {[
                  ["郡望", family?.county],
                  ["堂号", family?.hallName],
                  ["祖籍", family?.originPlace],
                  ["始迁祖", family?.founderName],
                  ["始迁", family?.foundedYear],
                  ["世系", maxGeneration ? `至今 ${maxGeneration} 世` : "—"],
                ].map(([label, value]) => (
                  <div key={String(label)} className="bg-paper-50 px-4 py-4">
                    <dt className="text-[10.5px] tracking-[0.24em] text-muted-foreground">
                      {label}
                    </dt>
                    <dd className="mt-2 font-song text-[14px] tracking-[0.06em] text-ink-800">
                      {value || "—"}
                    </dd>
                  </div>
                ))}
              </dl>
            </Chapter>

            <Chapter id="motto" eyebrow="训" title="家训">
              {mottoLines.length > 0 ? (
                <div className="space-y-4 border-l-2 border-gold-600/40 py-2 pl-6">
                  {mottoLines.map((line, index) => (
                    <p
                      key={index}
                      className="font-song text-[19px] leading-[1.9] tracking-[0.16em] text-ink-800 sm:text-[21px]"
                    >
                      {line}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">尚未录入家训。</p>
              )}
            </Chapter>

            <Chapter id="rules" eyebrow="规" title="家规">
              {ruleLines.length > 0 ? (
                <ol className="space-y-4">
                  {ruleLines.map((line, index) => (
                    <li key={index} className="text-justify leading-[2.1]">
                      {line}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-muted-foreground">尚未录入家规。</p>
              )}
            </Chapter>

            <Chapter id="generation" eyebrow="辈" title="字辈派语">
              {poem.length > 0 ? (
                <>
                  <p className="text-[13px] leading-[2.1] text-muted-foreground">
                    取名用字，依派语次第而下，不可紊乱。凡我族人，名讳当避祖上讳字，以示敬慎。
                  </p>
                  <div className="grid grid-cols-2 gap-px border border-paper-300 bg-paper-300 sm:grid-cols-4">
                    {poem.map((phrase, index) => (
                      <div
                        key={`${phrase}-${index}`}
                        className="flex items-center justify-center gap-1.5 bg-paper-50 px-3 py-6 sm:gap-2.5"
                      >
                        {phrase.split("").map((char, charIndex) => (
                          <span
                            key={charIndex}
                            className="font-song text-[20px] leading-none text-ink-800 sm:text-[24px]"
                          >
                            {char}
                          </span>
                        ))}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-muted-foreground">尚未录入字辈派语。</p>
              )}
            </Chapter>
          </div>
        </div>
      </div>
    </div>
  )
}
