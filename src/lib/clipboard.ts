/**
 * 复制文本到剪贴板。
 *
 * 异步剪贴板 API 仅在安全上下文（HTTPS 或 localhost）可用，且在部分场景下会被直接拒绝：
 * 页面处于 iframe 且未授予 clipboard-write、文档焦点在开发者工具、浏览器未授予写权限等。
 * 上述情况下 writeText 会抛错，若只依赖它，用户点击后既没有复制成功也没有任何提示。
 *
 * 因此保留一条基于 execCommand 的降级通路，并把最终结果返回给调用方，由调用方给出提示。
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 继续尝试降级方案
  }
  return legacyCopy(text)
}

/**
 * 降级复制：插入一个隐藏的可编辑容器，选中其内容后执行 copy 命令。
 * 使用 contentEditable 而非 textarea，是因为 iOS Safari 对 textarea 的 select() 不生效。
 */
function legacyCopy(text: string): boolean {
  const holder = document.createElement("div")
  holder.textContent = text
  holder.setAttribute("aria-hidden", "true")
  holder.contentEditable = "true"
  holder.style.cssText =
    "position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;margin:0;" +
    "opacity:0;overflow:hidden;white-space:pre;user-select:text;"
  document.body.appendChild(holder)

  const selection = window.getSelection()
  const previousRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null
  const range = document.createRange()
  range.selectNodeContents(holder)
  selection?.removeAllRanges()
  selection?.addRange(range)

  let ok = false
  try {
    ok = document.execCommand("copy")
  } catch {
    ok = false
  }

  selection?.removeAllRanges()
  if (previousRange) selection?.addRange(previousRange)
  document.body.removeChild(holder)
  return ok
}
