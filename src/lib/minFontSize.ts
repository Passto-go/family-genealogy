/**
 * 浏览器「最小字号」探测与谱页放大倍率。
 *
 * 浏览器设置里有「最小字号」（常见 12px），低于它的 font-size 会被强制放大，
 * 而容器尺寸是按设计字号算的，于是纵向小字横向裁字、竖排小传被截断。
 * 谱页的处理办法：先用运行时探到的下限把整套度量同比放大到下限之上，
 * 再用 zoom 把视觉尺寸收回原样——zoom 不改变 computed font-size，
 * 收回后不会被再次放大。浏览器没设下限时倍率为 1，一切按设计基准。
 *
 * 苏式谱、欧式谱、卡片谱、垂丝谱共用这一份基准，倍率相同才能保证六档字级一致。
 */

/** 谱页设计稿里的最小字号（行实小字 7px），倍率以它为基准 */
export const DESIGN_MIN_FONT = 7

let cache: number | null = null

/**
 * 探测浏览器会把多小的字号抬到多少 px。
 * 用 1px 探针读 computed font-size：读到多少就是下限，没设下限时为 1。
 * 结果缓存，同一次会话只测一次。
 */
export function detectMinFontSize(): number {
  if (cache !== null) return cache
  if (typeof document === "undefined" || !document.body) {
    cache = 1
    return cache
  }
  let value = 1
  try {
    const probe = document.createElement("span")
    probe.textContent = "国"
    probe.style.cssText =
      "position:absolute;left:-9999px;top:0;font-size:1px;line-height:1;visibility:hidden;white-space:pre"
    document.body.appendChild(probe)
    value = parseFloat(getComputedStyle(probe).fontSize) || 1
    probe.remove()
  } catch {
    value = 1
  }
  cache = value > 1 ? value : 1
  return cache
}

/** 谱页放大倍率：最小字号 ÷ 设计最小字号，未设最小字号时为 1 */
export function detectFontBoost(designMinFont: number = DESIGN_MIN_FONT): number {
  return Math.max(1, detectMinFontSize() / designMinFont)
}
