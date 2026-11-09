/** 接口层自有类型（不属于领域模型的那部分） */

/** 证书域名视图（后端 /api/admin/domains 返回） */
export interface DomainView {
  id: number
  domain: string
  /** pending 待签发 / issuing 签发中 / active 已生效 / failed 失败 / renewing 续期中 */
  status: string
  /** 证书到期时间（ISO），签发成功后回填 */
  expiryDate: string
  /** 证书在宿主机 Nginx 上的路径（仅展示） */
  certPath: string
  /** 最近一次失败原因 */
  lastError: string
  createdAt: string
  updatedAt: string
}

/** 批量导入提交的一行：已由前端归一化并推导好世次 / 房支，服务端仍会独立复核 */
export interface MemberImportPayload {
  no: string
  name: string
  gender: "male" | "female"
  generation: number
  courtesyName: string
  branch: string
  fatherNo: string
  motherNo: string
  spouseNo: string
  isMarriedIn: boolean
  isBranchHeir: boolean
  birthYear: string
  deathYear: string
  isAlive: boolean
  burialPlace: string
  title: string
  bio: string
  sortOrder: number
}
