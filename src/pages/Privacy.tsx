import {
  C,
  Chapter,
  CopyEmail,
  H3,
  LegalDoc,
  Note,
  Table,
  Td,
  UL,
  type TocItem,
} from "@/components/site/LegalDoc"
import { useAnalytics, useFeedbackEnabled } from "@/lib/site-config"
import { PROVIDER_META, type AnalyticsProviderKey } from "@/lib/analytics"
import { DEFAULT_ANALYTICS_NOTICES } from "@/lib/analytics-notices"
import { resetAnalyticsConsent } from "@/lib/analytics-consent"
import { buildDateLabel } from "@/lib/time"
import type { ReactNode } from "react"

const TOC: TocItem[] = [
  { id: "sec-1", label: "一、适用范围与基本原则" },
  { id: "sec-2", label: "二、我们收集的信息" },
  { id: "sec-3", label: "三、信息的使用目的" },
  { id: "sec-4", label: "四、页面溯源水印" },
  { id: "sec-5", label: "五、Cookie 与浏览器本地存储" },
  { id: "sec-6", label: "六、涉及哪些第三方服务" },
  { id: "sec-7", label: "七、统计说明与访客的选择" },
  { id: "sec-8", label: "八、数据保存期限与安全措施" },
  { id: "sec-9", label: "九、您的权利与行使方式" },
  { id: "sec-10", label: "十、跨境传输与未成年人保护" },
  { id: "sec-11", label: "十一、本说明的更新" },
  { id: "sec-12", label: "十二、联系方式" },
]

/** 条目首词的轻量强调（仅用于列表项引导词，不在句中加粗） */
function B({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-ink-800">{children}</strong>
}

const orderedListClass = "list-decimal space-y-2 pl-5 marker:text-muted-foreground/70"

function AnalyticsNoticeItem({ providerKey, notice }: { providerKey: AnalyticsProviderKey; notice?: string }) {
  const meta = PROVIDER_META[providerKey]
  const def = DEFAULT_ANALYTICS_NOTICES[providerKey]
  return (
    <div className="mt-4">
      <p className="font-song text-[14px] tracking-[0.1em] text-ink-800">
        {meta.label}（{def.company}，{def.region}）
      </p>
      {notice ? (
        <p className="mt-3 whitespace-pre-line text-[12px] leading-[1.9] text-muted-foreground">{notice}</p>
      ) : (
        <>
          <Table head={["条款项", "说明"]}>
            <tr>
              <Td className="whitespace-nowrap font-medium text-ink-800">数据收集范围</Td>
              <Td className="text-muted-foreground">{def.scope}</Td>
            </tr>
            <tr>
              <Td className="whitespace-nowrap font-medium text-ink-800">使用目的</Td>
              <Td className="text-muted-foreground">{def.purpose}</Td>
            </tr>
            <tr>
              <Td className="whitespace-nowrap font-medium text-ink-800">Cookie 与本地标识</Td>
              <Td className="text-muted-foreground">{def.cookie}</Td>
            </tr>
            <tr>
              <Td className="whitespace-nowrap font-medium text-ink-800">Cookie 保存期限</Td>
              <Td className="text-muted-foreground">{def.cookieExpiry}</Td>
            </tr>
            <tr>
              <Td className="whitespace-nowrap font-medium text-ink-800">跨境传输</Td>
              <Td className="text-muted-foreground">{def.crossBorder}</Td>
            </tr>
            <tr>
              <Td className="whitespace-nowrap font-medium text-ink-800">您的选择</Td>
              <Td className="text-muted-foreground">{def.choice}</Td>
            </tr>
          </Table>
          <p className="mt-3 text-[12px] leading-[1.9] text-muted-foreground">
            上述期限的起算与续期均以您的浏览器本地时间为准，由对应服务商在您于站点底部提示选择「接受」、统计服务启用后写入并随访问顺延刷新；您清除浏览器数据或屏蔽该服务商域名时，相关
            Cookie 立即失效，不受上述到期日限制。
          </p>
        </>
      )}
    </div>
  )
}

export default function Privacy() {
  const feedbackEnabled = useFeedbackEnabled()
  const analytics = useAnalytics()
  const enabledAnalytics = analytics.filter((a) => a.enabled)
  const hasAnalytics = enabledAnalytics.length > 0
  const hasCrossBorder = enabledAnalytics.some(
    (a) => a.key === "ga" || a.key === "clarity" || a.key === "gads",
  )
  const domesticAnalytics = enabledAnalytics.filter((a) => a.key === "baidu" || a.key === "umeng")
  const overseasAnalytics = enabledAnalytics.filter(
    (a) => a.key === "ga" || a.key === "clarity" || a.key === "gads",
  )
  const shortLabel = (key: AnalyticsProviderKey) =>
    key === "umeng" ? "友盟+" : PROVIDER_META[key].label
  const domesticLabels = domesticAnalytics.map((a) => shortLabel(a.key))
  const overseasLabels = overseasAnalytics.map((a) => shortLabel(a.key))
  const overseasCompanies = Array.from(
    new Set(overseasAnalytics.map((a) => DEFAULT_ANALYTICS_NOTICES[a.key].company)),
  )
  let crossBorderText: string
  if (!hasAnalytics) {
    crossBorderText =
      "本站服务器（阿里云，阿里云计算有限公司）位于中国境内；本站当前未启用任何第三方访问统计服务，不涉及向境外提供您的个人信息。"
  } else if (overseasAnalytics.length === 0) {
    crossBorderText = `本站服务器（阿里云，阿里云计算有限公司）位于中国境内；接入的分析服务（${domesticLabels.join("、")}）也位于中国境内，不涉及向境外提供您的个人信息。`
  } else {
    const domesticPart =
      domesticAnalytics.length > 0 ? `${domesticLabels.join("、")}位于中国境内，` : ""
    crossBorderText = `本站服务器（阿里云，阿里云计算有限公司）位于中国境内；接入的分析服务中，${domesticPart}${overseasLabels.join("、")}由位于美国的提供方（${overseasCompanies.join(" / ")}）运营，相关数据处理涉及传输至美国。各服务的具体跨境情况见第七节对应条款。涉及向境外提供个人信息的，我们依法履行告知义务；您于页面底部选择「接受」统计服务，即视为对包含前述跨境传输（Google Analytics 与 Microsoft Clarity 数据出境至美国）在内的统计处理给予同意。`
  }
  return (
    <LegalDoc eyebrow="隐私" title="隐私说明" updatedAt={buildDateLabel()} toc={TOC}>
      <div className="mb-6 border border-dashed px-4 py-3 text-[13px] leading-relaxed">
        示例文本：本页为开源模板，部署前请自行修改运营方、联系方式与管辖地，并据实调整内容。
      </div>
      <Chapter id="sec-1" title="一、适用范围与基本原则">
        <p>
          本说明适用于通过本网站（以下简称"本服务"）浏览族谱内容的访客与读者，以及使用管理员账户维护族谱内容的管理员。本服务以「一部族谱一个独立空间」的方式组织数据，不同家族之间的数据相互隔离。
        </p>
        <p>我们遵循以下基本原则：</p>
        <UL>
          <li>
            <B>最小必要</B>：仅在实现功能与改善体验所必需的范围内接触您的信息，不收集与族谱展示无关的数据。
          </li>
          <li>
            <B>目的限定</B>：所收集信息仅用于本说明列明的目的，不用于商业营销或用户画像。
          </li>
          <li>
            <B>自主选择</B>：第三方统计服务仅在您主动选择「接受」后才会启用；您拒绝或不予选择，均不影响浏览、检索与打印。
          </li>
          <li>
            <B>不共享原则</B>
            ：我们不会向无关第三方共享、出售或交易您的个人信息；仅在下列情形除外：取得您的明确同意；为遵守适用的法律法规或司法、行政机关的合法要求；为保护本服务、用户或公众的合法权益所必需。
          </li>
        </UL>
      </Chapter>

      <Chapter id="sec-2" title="二、我们收集的信息">
        <p>
          我们遵循最小必要原则，仅在下列情形下接触您的信息。下表逐项列明信息内容、产生场景与保存情况：
        </p>
        <Table head={["信息项", "具体内容", "产生场景", "是否保存"]}>
          {feedbackEnabled ? (
            <tr>
              <Td className="font-medium text-ink-800">
                您提交的反馈
                <br />
                <span className="text-[11.5px] font-normal text-muted-foreground">
                  （信息反馈通道开放时适用）
                </span>
              </Td>
              <Td>
                您在反馈/补录表单中填写的称呼（选填）、补充说明文字，以及族人资料（姓名、性别、世次、字号、房支、功名、父母、配偶、生卒年份、葬地、生平简介）。
              </Td>
              <Td>您主动填写并提交时</Td>
              <Td>保存。存入数据库，经管理员审核通过前不对外公开</Td>
            </tr>
          ) : null}
          <tr>
            <Td className="font-medium text-ink-800">管理员账户</Td>
            <Td>
              管理员用户名；登录密码（以 <C>PBKDF2</C> 加盐哈希存储，不保存明文）；最后登录时间。
            </Td>
            <Td>管理员登录后台时</Td>
            <Td>保存。存入数据库，仅用于后台鉴权</Td>
          </tr>
          <tr>
            <Td className="font-medium text-ink-800">水印文字</Td>
            <Td>
              经脱敏的访客 IP 地址（IPv4 与 IPv6 均只保留前两段，如{" "}
              <C>218.30.*.*</C>、<C>240e:39e:*</C>）、您设备所在时区的当天日期、网站名称。
            </Td>
            <Td>页面打开时即时读取，用于生成水印文字</Td>
            <Td>不单独保存。水印文字仅在浏览器内绘制，不写入数据库；生成水印的请求本身会进入服务器访问日志（见下行）</Td>
          </tr>
          <tr>
            <Td className="font-medium text-ink-800">服务器访问日志</Td>
            <Td>访问时间、来源 IP 地址、请求路径、浏览器类型（User-Agent）、来源页面。</Td>
            <Td>您访问本站任意页面时，由 Web 服务器自动记录</Td>
            <Td>
              保存。依《网络安全法》留存不少于六个月，仅用于安全防护、故障排查与依法配合有权机关调查，到期自动删除
            </Td>
          </tr>
          <tr>
            <Td className="font-medium text-ink-800">内存限流计数</Td>
            <Td>您的 IP 地址。</Td>
            <Td>
              {feedbackEnabled
                ? "①信息反馈通道开放时提交反馈/补录；②为密码保护的族谱输入口令时。用于防止重复提交与口令暴力尝试。"
                : "仅为密码保护的族谱输入口令时短暂使用，用于防止口令暴力尝试。"}
            </Td>
            <Td>
              不落盘。仅存于服务器内存约 10 分钟，服务重启即清空；不写入数据库，该计数本身也不落入访问日志
            </Td>
          </tr>
        </Table>
        <H3>我们明确不收集的信息</H3>
        <UL>
          <li>
            <B>不将访问日志用于画像或营销</B>
            ：服务器访问日志仅用于安全防护、故障排查与依法配合有权机关调查，不用于分析您的浏览偏好，不用于广告投放，也不向第三方出售或提供。系统错误仅在服务器自身控制台输出，不返回给访客。
          </li>
          <li>
            <B>不加载无关第三方组件</B>
            ：{hasAnalytics
              ? `除第六、七节披露的统计/广告服务外，不加载其他第三方统计、广告、社交或分析组件；所接入的服务仅用于了解访问情况，不用于实现本站任何功能。`
              : "页面不加载任何第三方统计、广告、社交或分析组件。"}
          </li>
          <li>
            <B>不采集设备指纹</B>
            ：不读取设备型号、屏幕参数、电池、通讯录、剪贴板等设备信息。
          </li>
          <li>
            <B>不收集敏感个人信息</B>
            ：不收集身份证件号码、生物识别信息、金融账户、行踪轨迹、医疗健康、不满十四周岁未成年人信息等敏感个人信息。
          </li>
          <li>
            <B>不加载网络字体</B>
            ：标题与谱牒正文调用访问设备自带的宋体族字体（思源宋体、宋体等），界面文字调用黑体族字体（思源黑体、苹方等），
            不向任何第三方字体服务发起请求。各家设备预装字体不同，字形与字宽或有差异（Windows 多为宋体，macOS 多为宋体-简），
            但页面依同一套排版规则渲染，内容与结构不受影响。
          </li>
        </UL>
      </Chapter>

      <Chapter id="sec-3" title="三、信息的使用目的">
        <Table head={["信息", "使用目的", "不予使用的情形"]}>
          {feedbackEnabled ? (
            <tr>
              <Td className="font-medium text-ink-800">您提交的反馈</Td>
              <Td>核对并补录族谱内容；必要时依据您留下的说明与您进一步联系</Td>
              <Td>审核通过前不对外公开；不用于商业营销；不向第三方共享或出售</Td>
            </tr>
          ) : null}
          <tr>
            <Td className="font-medium text-ink-800">管理员账户</Td>
            <Td>验证管理员身份，保障后台与数据安全</Td>
            <Td>密码明文不予保存；账户信息不与第三方共享</Td>
          </tr>
          <tr>
            <Td className="font-medium text-ink-800">水印文字</Td>
            <Td>
              族谱内容被整篇搬运或截图外传时，据以判断泄漏来源，作为内容溯源的最低限度保护措施
            </Td>
            <Td>水印文字不写入数据库、不单独存储；生成水印的请求作为普通页面请求进入服务器访问日志，仅作安全与溯源用途</Td>
          </tr>
          <tr>
            <Td className="font-medium text-ink-800">服务器访问日志</Td>
            <Td>记录访问来源与请求情况，用于安全防护、故障排查，以及在内容被搬运或外传时协助溯源</Td>
            <Td>不用于画像或营销，不向第三方提供；具体见第二节「我们明确不收集的信息」第 1 条</Td>
          </tr>
          <tr>
            <Td className="font-medium text-ink-800">内存限流计数</Td>
            <Td>
              {feedbackEnabled
                ? "防止信息反馈被重复提交，防止族谱口令被暴力尝试"
                : "防止族谱口令被暴力尝试"}
            </Td>
            <Td>不写入数据库，不用于用户画像，不用于识别身份</Td>
          </tr>
        </Table>
        <p>
          上述信息的使用均限于本说明列明的目的，不用于商业营销或用户画像（总体原则见第一节）。
        </p>
      </Chapter>

      <Chapter id="sec-4" title="四、页面溯源水印">
        <p>本服务页面叠加有一层低透明度的斜向文字，用作内容溯源标识。</p>
        <UL>
          <li>
            <B>构成</B>：脱敏后的访客 IP、当地日期、网站名称。
            <UL nested>
              <li>
                水印为页面上的一层淡色斜向文字。IPv4 与 IPv6 地址均只保留前两段（如{" "}
                <C>218.30.*.*</C>、<C>240e:39e:*</C>），不显示完整地址。
              </li>
            </UL>
          </li>
          <li>
            <B>目的</B>：在内容被整篇搬运或截图外传时，据以判断泄漏来源。
          </li>
          <li>
            <B>处理限度</B>：水印在页面生成时即时读取访客 IP
            与设备时区，仅用于生成水印文字；水印文字不在浏览器以外存储，不写入数据库，不与您在本站产生的其他数据关联，不向任何第三方提供。该次请求本身进入服务器访问日志（见
            「二、我们收集的信息 · 服务器访问日志」），仅作安全与溯源用途。本站短暂用于限流的内存计数（见
            「二、我们收集的信息 · 内存限流计数」）与水印用途相互独立。
          </li>
          <li>
            <B>可见性</B>：透明度较低，正常阅读时不易察觉，不影响页面的点击与选中操作。
          </li>
          <li>
            <B>您的选择</B>
            ：如不希望显示该水印，可用浏览器扩展或开发者工具隐藏对应页面元素。水印在页面打开时即时绘制，不依赖
            Cookie 与本地存储，因此无痕模式不会使其消失；屏蔽后不影响浏览与检索，本站也不依赖水印实现任何功能。
          </li>
        </UL>
      </Chapter>

      <Chapter id="sec-5" title="五、Cookie 与浏览器本地存储">
        <p>本服务在您的浏览器中写入下表所列数据，此外不写入与本站功能相关的其他 Cookie 或本地存储；统计服务的访客同意偏好以 localStorage 键名 <C>analytics-consent</C> 存储，其写入与清除方式见第七节：</p>
        <Table head={["名称", "类型", "作用", "有效期与清除方式"]}>
          <tr>
            <Td className="font-medium text-ink-800">
              <C>fg_session</C>
            </Td>
            <Td>Cookie（HttpOnly）</Td>
            <Td>管理员登录状态。仅在您登录后台后写入，用于身份鉴权</Td>
            <Td>退出登录即删除；清除浏览器数据可立即失效</Td>
          </tr>
          <tr>
            <Td className="font-medium text-ink-800">
              <C>fg_t_&lt;族谱 slug&gt;</C>
            </Td>
            <Td>Cookie（HttpOnly）</Td>
            <Td>密码访问的族谱在口令验证通过后写入的通行凭据，避免您在同一族谱内反复输入口令</Td>
            <Td>有效期由站点设定，到期自动失效；清除浏览器数据可立即失效</Td>
          </tr>
          <tr>
            <Td className="font-medium text-ink-800">
              <C>family-admin-current</C>
            </Td>
            <Td>浏览器本地存储（localStorage）</Td>
            <Td>后台管理界面记住您当前管理的族谱，属界面偏好设置</Td>
            <Td>清除浏览器数据即可移除</Td>
          </tr>
          <tr>
            <Td className="font-medium text-ink-800">
              <C>site-name-override</C>
            </Td>
            <Td>浏览器本地存储（localStorage）</Td>
            <Td>保存管理员在后台修改的网站名称，使水印与页脚即时同步</Td>
            <Td>清除后恢复默认名称</Td>
          </tr>
          <tr>
            <Td className="font-medium text-ink-800">
              <C>clantree-extended-lineage:&lt;族谱 id&gt;</C>
            </Td>
            <Td>浏览器本地存储（localStorage）</Td>
            <Td>记住您在世系图中是否展示出嫁女子后裔（外衍）的选择，仅存于本机，不影响其他访客</Td>
            <Td>清除后恢复默认（不展示外衍）</Td>
          </tr>
        </Table>
        <Note>
          上述数据均不含业务明文密码，不会上传用于识别个人身份。您可通过浏览器设置随时清除；清除后最多需要重新登录后台或重新输入族谱口令，不影响正常浏览。
        </Note>
        <p>
          本节所列 Cookie 均为实现本站功能所必需；第三方统计服务的分析型 Cookie 与访客同意偏好（键名 <C>analytics-consent</C>）的写入与清除方式见第七节。
        </p>
      </Chapter>

      <Chapter id="sec-6" title="六、涉及哪些第三方服务">
        <p>本服务依赖下列第三方服务；其角色、提供方与数据概况如下：</p>
        <Table head={["服务", "提供方", "用途", "数据跨境概况"]}>
          <tr>
            <Td className="font-medium text-ink-800">云服务器</Td>
            <Td>阿里云（阿里云计算有限公司，境内）</Td>
            <Td>提供运行本站所需的云服务器、网络与存储等基础设施</Td>
            <Td>位于中国境内，不涉及向境外提供</Td>
          </tr>
          {enabledAnalytics.map((a) => (
            <tr key={a.key}>
              <Td className="font-medium text-ink-800">{PROVIDER_META[a.key].label}</Td>
              <Td>
                {DEFAULT_ANALYTICS_NOTICES[a.key].company}（{DEFAULT_ANALYTICS_NOTICES[a.key].region}）
              </Td>
              <Td>访问统计（了解内容访问情况、改善版面）；具体用途见第七节该服务商条款</Td>
              <Td>
                {hasCrossBorder && (a.key === "ga" || a.key === "clarity" || a.key === "gads")
                  ? "涉及传输至美国"
                  : "位于中国境内"}
              </Td>
            </tr>
          ))}
        </Table>
        <p>
          除上述服务外，页面与接口均由本站服务器直接提供，字体由访问设备本地提供；除已披露的统计/广告服务（见第六、七节）外，不加载其他第三方广告、社交组件或字体 CDN。共享与披露的总体原则见第一节；本节所列第三方均为实现功能所必需，我们不向其提供可识别个人身份的本站业务数据。
        </p>
        <p>
          {hasAnalytics
            ? "本说明所列分析服务随后台启用状态自动更新；如停用某服务，其对应条款将不再显示，届时「最后更新」日期同步调整。"
            : "本站当前未启用任何第三方访问统计服务。"}
        </p>
      </Chapter>

      <Chapter id="sec-7" title="七、统计说明与访客的选择">
        <p>
          <B>加载前提（同意机制）</B>
          ：本站接入的分析服务（见第六节名册）仅在您于页面底部提示中选择「接受」后才会启用；您选择「拒绝」或不予选择，相关服务均不会启用，也不影响任何浏览、检索与打印功能。
        </p>
        <p>
          您的「接受」或「拒绝」选择仅保存在您浏览器的本地存储（localStorage，键名{" "}
          <C>analytics-consent</C>
          ）中，不发送至服务器。无痕 / 隐私模式会在窗口关闭后清空该本地存储，清除浏览器数据亦同，因此您可能再次看到底部的统计询问；这并非统计被自动启用，而是需要您重新作出选择。          另需说明：无痕模式仅清除本地痕迹，并不阻止第三方统计脚本的加载与数据上报——一旦您选择「接受」，百度统计、Google Analytics 与 Microsoft Clarity 仍会按您的同意发起请求（其中 Google Analytics 与 Microsoft Clarity 的数据处理涉及传输至美国，详见各服务商条款）。真正让统计不加载的，是您的「拒绝」选择或屏蔽对应域名，而非无痕模式本身。您于页面底部选择「接受」即视为对包含前述跨境传输（Google Analytics、Microsoft Clarity 出境至美国）的统计处理一并给予同意，详见第十节。
        </p>
        {hasAnalytics ? (
          <>
            <H3>各分析服务说明</H3>
            <p className="text-[12px] leading-[1.9] text-muted-foreground">
              下列为第六节名册中各项已启用服务的具体条款说明。
            </p>
            {enabledAnalytics.map((a) => (
              <AnalyticsNoticeItem key={a.key} providerKey={a.key} notice={a.notice} />
            ))}
            <H3>如何更改您的选择</H3>
            <p>
              如需重新选择，可点击下方「重置统计选择」按钮，或清除浏览器本地存储中的统计偏好（键名{" "}
              <C>analytics-consent</C>）后刷新页面；选择「拒绝」后，本站会停止已启用的统计服务。您亦可随时通过浏览器扩展屏蔽下列域名停止对应服务：
            </p>
            <UL>
              {enabledAnalytics.map((a) => (
                <li key={a.key}>
                  <B>{PROVIDER_META[a.key].label}</B>：屏蔽 <C>{DEFAULT_ANALYTICS_NOTICES[a.key].block}</C>。
                </li>
              ))}
            </UL>
            <button
              type="button"
              onClick={() => resetAnalyticsConsent()}
              className="mt-2 rounded-[8px] border border-ink-800/20 px-5 py-2.5 text-[12px] tracking-[0.12em] text-ink-700 transition-colors hover:border-ink-700 hover:bg-paper-100"
            >
              重置统计选择
            </button>
          </>
        ) : (
          <p>本站当前未启用任何第三方访问统计服务，故无上述加载与选择事项。</p>
        )}
        <H3>通用选择</H3>
        <UL>
          <li>
            使用无痕模式访问：本服务全部功能均可在无痕模式下正常使用。无痕可减少本地存储残留，但不影响水印显示（见第四节）；无痕对统计同意的影响（清空本地记录、可能再次出现询问、接受后脚本仍按同意加载）详见本节前述。
          </li>
          <li>随时清除 Cookie 与本地存储：最多需要重新登录后台或重新输入族谱口令；</li>
          <li>
            屏蔽水印元素：本站不依赖水印实现任何功能，屏蔽后不影响浏览与检索（详见第四节）。
          </li>
        </UL>
      </Chapter>

      <Chapter id="sec-8" title="八、数据保存期限与安全措施">
        <p>本服务的运营方及个人信息处理者为 Panda_Q，联系方式见文末。</p>
        <p>
          <B>存储位置与安全措施</B>
          ：本站部署于第三方云服务商阿里云（阿里云计算有限公司）提供的云服务器（位于中国境内，基础设施详见第六节）。机房、网络、供电与存储硬件等基础设施由阿里云（阿里云计算有限公司）按其服务条款负责；
          谱牒与账户数据以数据库文件形式存放于该云服务器上，由运营方自行管理与备份，不另行复制到其他第三方系统。密码采用{" "}
          <C>PBKDF2</C> 加盐哈希存储，服务端不持有明文。我们采取访问控制、传输加密与定期备份等合理措施保护数据安全。互联网环境不存在绝对安全，管理员亦应妥善保管账户与密码。
        </p>
        <p>
          本说明所称「族谱内容」，包含家族文献、成员档案及家族配置信息（例如房支名称设定、指定的房主或先祖成员等）。房支归属可由系统依据族谱血缘结构自动派生，无需在每位族人档案中逐人标注，以降低人工维护成本并减少分散录入带来的不一致。
        </p>
        <p>我们仅在实现收集目的所需的最短期限内保留信息：</p>
        <Table head={["数据", "保存期限"]}>
          <tr>
            <Td className="font-medium text-ink-800">族谱内容与账户数据</Td>
            <Td>保存于部署方自行管理的数据库文件中，保留至管理员删除相应内容或本服务停止运营时止</Td>
          </tr>
          {feedbackEnabled ? (
            <tr>
              <Td className="font-medium text-ink-800">您提交的反馈（含族人资料）</Td>
              <Td>审核通过前不公开、不随谱发布；处理后随族谱内容一并留存，您可随时请求删除</Td>
            </tr>
          ) : null}
          <tr>
            <Td className="font-medium text-ink-800">水印读取的 IP 与日期</Td>
            <Td>仅在生成水印时即时使用，不在浏览器以外存储水印文字；生成与处理限度详见第四节「页面溯源水印」</Td>
          </tr>
          <tr>
            <Td className="font-medium text-ink-800">内存限流中的 IP</Td>
            <Td>仅存于服务器内存约 10 分钟，服务重启即清空，不落盘</Td>
          </tr>
          <tr>
            <Td className="font-medium text-ink-800">服务器访问日志</Td>
            <Td>字段、留存期限与用途见第二节「我们收集的信息 · 服务器访问日志」</Td>
          </tr>
          <tr>
            <Td className="font-medium text-ink-800">Cookie 与本地存储</Td>
            <Td>各见「五、Cookie 与浏览器本地存储」</Td>
          </tr>
          {hasAnalytics ? (
            <tr>
              <Td className="font-medium text-ink-800">各分析服务商采集的数据</Td>
              <Td>
                由对应提供方按其隐私政策保存与删除（见第七节各服务商条款）；本站不另行留存，也不接收可识别个人身份的明细数据
              </Td>
            </tr>
          ) : null}
        </Table>
        <p>
          <B>安全事件通知</B>
          ：如发生或可能发生个人信息泄露、篡改、丢失，我们将立即采取补救措施，并按法律规定向您告知事件情况、可能影响、已采取的处置措施及您可自主采取的防范建议。
        </p>
      </Chapter>

      <Chapter id="sec-9" title="九、您的权利与行使方式">
        <p>在适用法律允许的范围内，您对自己的个人信息享有下列权利：</p>
        <ol className={orderedListClass}>
          <li>
            <B>查阅与复制</B>：您有权查阅、复制我们处理的您的个人信息；
          </li>
          <li>
            <B>更正与补充</B>
            ：发现信息不准确或不完整时，有权请求更正、补充。管理员可通过后台随时更正所维护的族谱内容；
            {feedbackEnabled ? "您提交的反馈在处理前亦可请求修改；" : null}
          </li>
          <li>
            <B>删除</B>
            ：您可请求删除{feedbackEnabled ? "由您提交的反馈或" : ""}
            属于您的个人信息，我们将在合理期限内处理；
          </li>
          <li>
            <B>撤回同意</B>：对于基于同意处理的信息，您可随时撤回，撤回不影响撤回前已进行的处理；
          </li>
          <li>
            <B>转移</B>：在符合法律规定条件时，您可请求将您的个人信息转移至您指定的个人信息处理者；
          </li>
          <li>
            <B>解释说明</B>：您有权要求我们对个人信息处理规则作出解释说明。
          </li>
        </ol>
        <p>
          如需行使上述权利，请通过本说明末尾「十二、联系方式」与我们联系。我们将在核实身份后于合理期限内答复。
        </p>
      </Chapter>

      <Chapter id="sec-10" title="十、跨境传输与未成年人保护">
        <p>
          <B>跨境传输</B>
          ：{crossBorderText}
        </p>
        <p>
          <B>未成年人保护</B>
          ：本服务可能涉及已故先人与在世族人的信息。对于在世自然人的个人信息，尤其是未成年人信息，我们持审慎态度，建议录入方在发布前取得相关权利人同意。不满十四周岁的未成年人，应在其父母或其他监护人同意后使用本服务；如我们获悉相关信息系未经监护人同意而收集，将予以删除。如您发现涉及未成年人且未经适当处理的信息，请及时联系我们删除或匿名化处理。
        </p>
      </Chapter>

      <Chapter id="sec-11" title="十一、本说明的更新">
        <p>
          我们可能不时更新本隐私说明。除法定要求外，重大变更将通过本页面「最后更新」日期标示，并可在页脚入口查阅最新版本；本说明自其「最后更新」日期起生效。您继续使用本服务，即视为接受更新后的说明。
        </p>
      </Chapter>

      <Chapter id="sec-12" title="十二、联系方式">
        <p>
          如对本隐私说明或我们的信息处理实践有任何疑问、意见，或需行使上述权利，请
          {feedbackEnabled ? "通过网站内反馈通道提交，或" : null}发送邮件联系网站管理员。
        </p>
        <p>
          联系邮箱：{" "}
          <a
            href="mailto:admin@example.com"
            className="text-gold-700 underline underline-offset-2 hover:text-gold-800"
          >
            admin@example.com
          </a>
          <CopyEmail email="admin@example.com" />
        </p>
        <Note label="提示">
          未配置邮件客户端的设备，点击邮箱可能无响应；可点邮箱旁的「复制」按钮复制地址，再通过网页邮箱发送。
        </Note>
        <p className="text-[12.5px] text-muted-foreground">
          本说明为中文文本。如提供其他语言版本，以中文版本为准。
        </p>
      </Chapter>
    </LegalDoc>
  )
}
