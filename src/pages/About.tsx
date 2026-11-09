import { Link } from "react-router-dom"
import { BookOpen, FileText, Share2, Users } from "lucide-react"
import { Note } from "@/components/site/LegalDoc"

function SubSection({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="mt-14 border-t border-paper-300 pt-10">
      <div className="flex items-center gap-3">
        <span className="h-px w-5 bg-gold-600" />
        <span className="text-[12px] tracking-[0.32em] text-gold-700">{eyebrow}</span>
      </div>
      <h2 className="mt-4 font-song text-[21px] tracking-[0.14em] text-ink-800 sm:text-[23px]">
        {title}
      </h2>
      <div className="mt-5 space-y-4 text-[13.5px] leading-[2.1] text-ink-700/90">{children}</div>
    </section>
  )
}

const FEATURES = [
  {
    icon: Users,
    title: "世系图谱",
    desc: "缩放查阅历代族系，可按房支筛选、按名号搜索定位；点选任一族人，即见其生平、婚配与子嗣。",
  },
  {
    icon: Share2,
    title: "扇形全景",
    desc: "以始迁祖为心，族人名号环列如星，一图览尽全族结构，悬停展开其亲属关系。",
  },
  {
    icon: BookOpen,
    title: "家族文献",
    desc: "谱序、源流、家训、家规与字辈派语，集于一处，是一族精神与礼法之所系。",
  },
  {
    icon: FileText,
    title: "族人共修",
    desc: "族谱内容由运营方与族人共同维护；如发现讹误或缺漏，可发送邮件（本页底部）联系网站管理员予以补正。",
  },
]

export default function About() {
  return (
    <div className="mx-auto max-w-[860px] px-6 py-16 sm:py-24">
      <div>
        <p className="text-[10.5px] tracking-[0.34em] text-gold-600">关于</p>
        <h1 className="mt-1 font-song text-[28px] tracking-[0.14em] text-ink-800">修谱宗旨</h1>
      </div>

      {/* 缘起 */}
      <div className="mt-10 space-y-5 text-[13.5px] leading-[2.2] text-ink-700/90">
        <p>
          一族一谱，各自成帙。本站以数字之方式，为各宗族保存世系源流、族人行述与家族文献，
          使谱牒免于水火虫蛀、兵燹迁徙之失，后人得以循脉而归。
        </p>
        <p>
          昔时纸谱，藏之一室，迁播则散；族人星居四方，欲一窥全族世次，往往求之不得。
          今以网络为帙，世系可跨越山海而相聚，生卒、婚配、房支、字辈，皆有条理可寻——
          此即本站立意之所在：让修谱不再是少数人之事，而是一家一族共守的记忆。
        </p>
      </div>

      {/* 一部族谱，一方天地 */}
      <SubSection eyebrow="格局" title="一部族谱，一方天地">
        <p>
          每一族谱，皆为独立之空间。不同家族之间，数据相互隔离，各守其界；
          其世系、文献与配置，不相混杂，亦不为他族所见。
        </p>
        <p>
          门户总目收录已立之族谱，访客可于此纵览诸族，择谱而入。
          设有访问口令之族谱，须凭家族所授口令启封，以示尊崇，亦护族中私隐。
        </p>
      </SubSection>

      {/* 我们提供 */}
      <SubSection eyebrow="所能" title="我们提供什么">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {FEATURES.map((feature) => {
            const Icon = feature.icon
            return (
              <div
                key={feature.title}
                className="rounded-[12px] border border-paper-300 bg-paper-50 p-6 transition-colors hover:border-gold-600/40"
              >
                <span className="inline-flex size-9 items-center justify-center rounded-[7px] bg-[rgba(18,48,59,0.06)] text-ink-700">
                  <Icon className="size-[18px]" strokeWidth={1.6} />
                </span>
                <h3 className="mt-4 font-song text-[17px] tracking-[0.1em] text-ink-800">
                  {feature.title}
                </h3>
                <p className="mt-2 text-[12.5px] leading-[1.95] text-muted-foreground">
                  {feature.desc}
                </p>
              </div>
            )
          })}
        </div>
      </SubSection>

      {/* 访问与守护 */}
      <SubSection eyebrow="守护" title="访问与守护">
        <p>
          族谱所载，多涉先人隐事与在世族人信息。故本站以「最小必要」为纲：
          仅在管理员登录、口令核验等情形下接触信息，且逐项明示具体内容与去留。
        </p>
        <ul className="space-y-2.5 text-[13px] leading-[1.95] text-ink-700/90">
          <li className="flex gap-2.5">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gold-600" />
            <span>
              不接入任何统计、广告或第三方脚本，页面与字体等静态资源皆自托管，浏览不经第三方。
            </span>
          </li>
          <li className="flex gap-2.5">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gold-600" />
            <span>
              溯源水印由访客 IP、当地日期与站名即时拼出，仅用于内容外泄时辨其来源，
              不写入数据库、不落日志。
            </span>
          </li>
          <li className="flex gap-2.5">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gold-600" />
            <span>登录密码以 PBKDF2 加盐哈希存储，服务端不持有明文。</span>
          </li>
        </ul>
        <p className="text-[12.5px] leading-[2] text-muted-foreground">
          详尽的收集范围、Cookie 与保存期限，见
          <Link
            to="/privacy"
            className="mx-1 text-gold-700 underline underline-offset-2 hover:text-gold-800"
          >
            隐私说明
          </Link>
          。
        </p>
      </SubSection>

      {/* 多端随行 */}
      <SubSection eyebrow="随行" title="多端随行">
        <p>
          页面自桌面至移动端皆自适应呈现，世系图谱可缩放、可平移，旅途中亦能翻阅本族世次。
          并备日间与夜间两种模式，依所处环境择宜而用，久读不倦。
        </p>
      </SubSection>

      {/* 联系 / 邮箱 */}
      <section className="mt-14 border-t border-paper-300 pt-10">
        <div className="flex flex-col items-start gap-5 rounded-[14px] border border-paper-300 bg-paper-50 px-7 py-8">
          <p className="text-[13.5px] leading-[2] text-ink-700/90">
            如发现族谱内容有讹误、缺漏，或需更新信息，请发送邮件联系网站管理员，我们收到后将尽快核校补正。共修一谱，端赖众力。
          </p>
          <p className="text-[13.5px] leading-[2] text-ink-700/90">
            联系邮箱：{" "}
            <a
              href="mailto:admin@example.com"
              className="text-gold-700 underline underline-offset-2 hover:text-gold-800"
            >
              admin@example.com
            </a>
          </p>
          <Note label="提示">
            点击邮箱地址会调起你系统里默认的邮件应用。若没有反应，说明设备上未设置默认邮件客户端，可先复制地址再从网页版邮箱发送。
          </Note>
        </div>
      </section>
    </div>
  )
}
