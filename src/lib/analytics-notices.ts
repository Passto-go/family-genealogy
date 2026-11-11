// 各统计服务商在《隐私说明》中的默认条款模板。
// 管理员可在后台「访问统计接入」为每家自定义说明文案（notice），未自定义时显示下列默认内容。
// 文本为纯展示用，前端以文本（whitespace-pre-line）渲染，不做 HTML 注入，故无 XSS 风险。

import type { AnalyticsProviderKey } from "./analytics"

export interface AnalyticsNotice {
  /** 提供方公司名 */
  company: string
  /** 服务器/主体所在地 */
  region: string
  /** 数据收集范围 */
  scope: string
  /** 使用目的 */
  purpose: string
  /** Cookie 与本地标识 */
  cookie: string
  /** Cookie 保存期限（具体时长/到期规则、起算与生效条件） */
  cookieExpiry: string
  /** 跨境传输 */
  crossBorder: string
  /** 您的选择（如何拒绝/屏蔽） */
  choice: string
  /** 用于「如何关闭 / 您的选择」的屏蔽域名说明 */
  block: string
}

export const DEFAULT_ANALYTICS_NOTICES: Record<AnalyticsProviderKey, AnalyticsNotice> = {
  baidu: {
    company: "百度网讯科技有限公司",
    region: "中国大陆",
    scope:
      "您访问的页面地址（URL）、访问时间与来源页面/来源类型、浏览器与操作系统等环境信息、基于 IP 推断的省级或城市级粗略位置，以及页面互动的聚合数据。百度统计亦可能采集上述范围之外的信息，具体以其最新隐私政策为准。",
    purpose:
      "统计页面浏览量与访问来源，了解哪些族谱内容被查阅，据以改善版面与内容组织。本站不接收其明细数据用于识别个人身份，也不依赖该服务实现任何网站功能。",
    cookie:
      "百度统计会在您的浏览器中写入其自身 Cookie 或同类标识（如 _hm_ 系列），用于区分访客与去重。具体名称、有效期与清除方式由百度按隐私政策管理；您清除浏览器数据或拦截 hm.baidu.com 域名即可去除。",
    cookieExpiry:
      "百度统计写入的主要 Cookie 包括 _hm_lvt_<站点ID> 与 _hm_lpvt_<站点ID>。其中 _hm_lvt_* 保存期约 13 个月（按首次访问日计算，每次访问顺延刷新）；_hm_lpvt_* 为会话级标识，浏览器关闭即失效。具体名称与有效期以百度隐私政策最新说明为准。",
    crossBorder: "服务器位于中国境内，不涉及向境外提供您的个人信息。",
    choice: "在浏览器或扩展中屏蔽 hm.baidu.com 域名即停止对应统计服务，不影响浏览、检索与打印。",
    block: "hm.baidu.com",
  },
  umeng: {
    company: "友盟同欣（北京）科技有限公司",
    region: "中国大陆",
    scope: "页面访问地址与来源、访问时间、浏览器、操作系统、设备类型与网络环境等，具体以其隐私政策为准。",
    purpose: "统计站点访问趋势与设备分布，辅助评估内容可达性。本站不依赖该服务实现任何功能。",
    cookie:
      "友盟会在浏览器中写入其自身标识（如 CNZZ 相关 Cookie），用于访客去重与会话识别；清除浏览器数据或拦截相应域名即可去除。",
    cookieExpiry:
      "友盟写入的标识主要为 cnzz_eid 与 um_uuid 等。cnzz_eid 保存期约 6 个月、um_uuid 保存期约 1 年（均自写入/访问日起算，重复访问顺延）；会话级标识浏览器关闭即失效。具体以友盟+隐私政策为准。",
    crossBorder: "服务器位于中国境内，不涉及向境外提供您的个人信息。",
    choice: "通过浏览器扩展或追踪拦截工具屏蔽 s4.cnzz.com 等友盟域名即停止其加载，不影响浏览功能。",
    block: "s4.cnzz.com",
  },
  ga: {
    company: "Google LLC",
    region: "美国",
    scope:
      "页面路径与标题、引荐来源、浏览器与操作系统、设备类型与更详细的设备信息、基于 IP 推断的城市级大致地理位置、会话与互动事件等。Google 可能采集上述之外的信息，具体以其隐私政策与 Google 服务条款为准。",
    purpose: "了解访客行为与内容访问情况，用于优化网站结构与内容呈现。本站不接收其明细数据用于识别个人身份。",
    cookie:
      "会写入 _ga、_ga_<容器ID> 等 Cookie 并设置 gtag 相关标识，用于区分访客与归因；具体由 Google 管理，您可清除浏览器数据、启用“拒绝追踪”（Do Not Track）或使用 Google 提供的退出插件去除。",
    cookieExpiry:
      "GA4 写入 _ga、_ga_<容器ID> 等 Cookie，默认保存期均为 2 年（约 24 个月，自最近一次访问日起算，重复访问顺延刷新）；若启用 _gid 则为 1 天。具体以 Google 隐私政策与 GA4 配置为准。",
    crossBorder:
      "由位于美国的 Google LLC 提供，您访问本站时相关访问数据将传输至美国境内服务器处理。该跨境提供因您主动访问本站而发生；如不愿数据出境，可按下述“您的选择”关闭。",
    choice:
      "屏蔽 www.googletagmanager.com 与 www.google-analytics.com 域名，或安装 Google Analytics 退出插件（Opt-out Browser Add-on），亦可启用“拒绝追踪”；关闭后不影响本站任何浏览功能。",
    block: "www.googletagmanager.com 与 www.google-analytics.com",
  },
  clarity: {
    company: "Microsoft Corporation",
    region: "美国",
    scope:
      "页面交互的热力图与录屏信息（点击、滚动、鼠标移动等聚合或脱敏后的行为数据）、设备与浏览器信息、会话标识、访问页面与来源等，具体以其隐私政策为准。",
    purpose: "通过热力图与会话回放了解页面布局可用性，据以改善浏览体验。本站不接收其明细数据用于识别个人身份。",
    cookie:
      "会写入 _clck、_clsk 等 Cookie 与本地标识，用于会话识别与去重；清除浏览器数据或使用浏览器追踪防护即可去除。",
    cookieExpiry:
      "Clarity 写入 _clck 与 _clsk 等 Cookie。_clck 保存期约 1 年、_clsk 保存期约 1 天（均自写入/访问日起算，重复访问顺延）；会话级标识浏览器关闭即失效。具体以 Microsoft 隐私政策为准。",
    crossBorder: "由位于美国的 Microsoft Corporation 提供，相关数据处理涉及传输至美国。如不愿数据出境，可按下述“您的选择”关闭。",
    choice: "屏蔽 clarity.ms 与 bat.bing.com 域名，或使用支持追踪防护的浏览器/扩展；关闭后不影响本站任何浏览功能。",
    block: "clarity.ms 与 bat.bing.com",
  },
  gads: {
    company: "Google LLC",
    region: "美国",
    scope:
      "与广告相关的数据，包括广告点击标识（如 _gcl_au）、转化事件、再营销受众信号，以及设备与浏览器信息、会话标识等；具体以 Google 广告政策与隐私政策为准。",
    purpose: "衡量广告效果（转化追踪）并支持再营销，据以优化广告投放。本站不接收其明细数据用于识别个人身份。",
    cookie:
      "会写入 _gcl_au 等 Cookie 与同类标识，用于广告转化归因与再营销；具体由 Google 管理，您可清除浏览器数据、启用“拒绝追踪”或使用 Google 提供的广告设置/退出工具去除。",
    cookieExpiry:
      "Google Ads 写入 _gcl_au 等转化/再营销 Cookie，默认保存期约 90 天（自写入/点击/访问日起算，重复访问顺延）；会话级标识浏览器关闭即失效。具体以 Google 广告政策与隐私政策为准。",
    crossBorder: "由位于美国的 Google LLC 提供，相关数据处理涉及传输至美国。如不愿数据出境，可按下述“您的选择”关闭。",
    choice:
      "屏蔽 www.googleadservices.com 与 *.doubleclick.net 域名，或在 Google 广告设置中关闭个性化广告；关闭后不影响本站任何浏览功能。",
    block: "www.googleadservices.com 与 *.doubleclick.net",
  },
}
