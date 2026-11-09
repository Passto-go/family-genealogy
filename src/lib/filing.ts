import { useEffect, useState } from "react"

export interface FilingInfo {
  icpNumber: string
  policeNumber: string
}

/**
 * 站点备案信息（工信部备案号 / 公安备案号）。
 *
 * 取自「主谱（primary family）」的公开接口 `/api/public/filing`。每次组件挂载即拉取最新值，
 * 后台（系统 · 网站设置）更新备案号后，前台任意页面重新加载即自动同步展示，无需重新部署代码。
 * 与租户页脚（按当前家族）不同，全局页脚统一展示主谱的备案号。
 */
export function usePrimaryFiling(): FilingInfo {
  const [info, setInfo] = useState<FilingInfo>({ icpNumber: "", policeNumber: "" })

  useEffect(() => {
    let active = true
    fetch("/api/public/filing", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active || !data) return
        setInfo({
          icpNumber: typeof data.icpNumber === "string" ? data.icpNumber : "",
          policeNumber: typeof data.policeNumber === "string" ? data.policeNumber : "",
        })
      })
      .catch(() => {
        /* 网络异常时静默保留空值，不影响页脚其余内容 */
      })
    return () => {
      active = false
    }
  }, [])

  return info
}
