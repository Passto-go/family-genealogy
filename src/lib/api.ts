/**
 * 接口层入口。
 *
 * 具体实现按域拆在 `./api/` 下（public / auth / admin + 公共 client），
 * 这里聚合成原来的 `api` 对象，调用方 `import { api } from "@/lib/api"` 无需改动。
 */

import { adminApi } from "./api/admin"
import { authApi } from "./api/auth"
import { publicApi } from "./api/public"

export { ApiError } from "./api/client"
export type { DomainView, MemberImportPayload } from "./api/types"

export const api = {
  ...publicApi,
  ...authApi,
  ...adminApi,
}
