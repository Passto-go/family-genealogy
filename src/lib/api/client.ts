/** 接口层公共部分：统一请求封装与错误类型。按域拆分的模块都只依赖这里。 */

export class ApiError extends Error {
  status: number
  /** 服务端随错误返回的结构化明细，例如批量导入的逐行问题 */
  details: unknown

  constructor(message: string, status: number, details?: unknown) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.details = details
  }
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) }
  if (init.body) headers["Content-Type"] = "application/json"

  const response = await fetch(`/api${path}`, {
    credentials: "include",
    ...init,
    headers,
  })

  const text = await response.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }
  }

  if (!response.ok) {
    // 5xx 多为框架或运行时异常，原文可能带内部路径与堆栈，前端统一成通用提示；4xx 保留业务文案
    if (response.status >= 500) {
      throw new ApiError("服务暂时不可用，请稍后重试", response.status, data)
    }
    let message = `请求失败（${response.status}）`
    if (data && typeof data === "object" && "error" in data) {
      const raw = (data as { error: unknown }).error
      if (typeof raw === "string" && raw) message = raw
    }
    throw new ApiError(message, response.status, data)
  }

  return data as T
}

/** 非 JSON 的接口（文件上传、CSV 下载）共用：失败时同样抛 ApiError，成功返回原始响应 */
export async function rawRequest(path: string, init: RequestInit = {}, fallback: string): Promise<Response> {
  const response = await fetch(`/api${path}`, { credentials: "include", ...init })
  if (response.ok) return response

  let message = `${fallback}（${response.status}）`
  try {
    const data = (await response.json()) as { error?: string }
    if (data?.error) message = data.error
  } catch {
    // 忽略响应体解析失败，沿用默认提示
  }
  throw new ApiError(message, response.status)
}
