export type Gender = "male" | "female"
export type Visibility = "public" | "password" | "private"

export interface Family {
  id: number
  slug: string
  tag: string
  domain: string
  visibility: Visibility
  accessPasswordHash: string
  isPrimary: boolean
  theme: string
  surname: string
  name: string
  hallName: string
  county: string
  originPlace: string
  founderName: string
  foundedYear: string
  intro: string
  motto: string
  rules: string
  preface: string
  generationPoem: string
  generationPoemStart: number
  branches: string[]
  /** 结构性房支：房名 → 房主（先祖）成员 id；有房主时按血统子树自动派生 */
  branchHeads: Record<string, number>
  coverImage: string
  footerText: string
  icpNumber: string
  policeNumber: string
  /** 是否延伸展示出嫁女子后裔（外衍）：关=仅本族血脉；开=血脉+两层外衍（已由访客侧偏好取代，仅保留字段兼容旧库） */
  showExtendedLineage: boolean
  /** 是否在前台公开展示：关闭后门户不列出、直接访问按不存在处理 */
  isPublished: boolean
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
}

export type FamilyInput = Omit<Family, "id" | "updatedAt" | "createdAt" | "createdBy" | "updatedBy">
export type FamilyPatch = Partial<FamilyInput>

export interface Member {
  id: number
  familyId: number
  name: string
  gender: Gender
  generation: number
  courtesyName: string
  fatherId: number | null
  motherId: number | null
  spouseId: number | null
  isMarriedIn: boolean
  /** 入赘承祧 / 过继取得本族房分者：非血脉，但可取字辈、可持房支 */
  isBranchHeir: boolean
  branch: string
  birthYear: string
  deathYear: string
  isAlive: boolean
  burialPlace: string
  title: string
  bio: string
  sortOrder: number
  avatarKey: string
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
}

export type MemberInput = Omit<Member, "id" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy">

/**
 * 批量导入的一行（已由调用方归一化、校验并排好序）。
 * 亲属一律用「表内编号」引用：`A1` 指向同批另一行，`@123` 指向库内已有成员。
 */
export interface MemberImportRow {
  no: string
  name: string
  gender: Gender
  /** 已由调用方推导出的最终世次 */
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
  avatarKey: string
}

export interface AdminUser {
  id: number
  username: string
  passwordHash: string
  role: string
  isDisabled: boolean
  lastLoginAt: string
  /** 所属家族；超级管理员为 null（可管理全部家族） */
  familyId: number | null
  /** 首次登录或密码被重置后，必须修改密码才能访问后台数据 */
  mustChangePassword: boolean
  /** 登录二次验证类型：none 未启用 / totp 已绑定验证器 */
  mfaType: "none" | "totp"
  /** 加密存储的 TOTP 密钥（AES-GCM）；未启用时为空串。仅服务端内部使用，绝不返回前端 */
  mfaSecret: string
}

export type SubmissionStatus = "pending" | "accepted" | "rejected"

/** 亲属公开提交的信息更新反馈 */
export interface MemberSubmission {
  id: number
  familyId: number
  reporterName: string
  message: string
  payload: string
  status: SubmissionStatus
  familyLabel: string
  createdAt: string
}

export type MemberSubmissionInput = Omit<MemberSubmission, "id" | "createdAt">

/** 管理员操作审计日志条目（写入时由服务端填充操作人） */
export interface AuditLogEntry {
  actorId: number | null
  actorName: string
  actorRole: string
  action: string
  targetType: string
  targetId: string
  detail: string
}

/** 审计日志（含自增主键与写入时间，用于查询展示） */
export interface AuditLog extends AuditLogEntry {
  id: number
  createdAt: string
}

/** 自动 TLS 证书域名（超级管理员后台绑定，宿主机 cert-manager 经 acme.sh DNS-01 签发/续期） */
export interface Domain {
  id: number
  domain: string
  /** pending 待签发 / issuing 签发中 / active 已生效 / failed 失败 / renewing 续期中 */
  status: string
  /** 证书到期时间（ISO），签发成功后回填 */
  expiryDate: string
  /** 证书在宿主机 Nginx 上的路径（仅展示用） */
  certPath: string
  /** 最近一次失败原因 */
  lastError: string
  createdAt: string
  updatedAt: string
}

/**
 * 数据访问抽象层。
 * 本地实现基于 node:sqlite，Cloudflare 实现基于 D1；
 * 全部返回 Promise，使两种运行时可以用同一套路由代码。
 *
 * 多租户约定：所有成员相关方法都显式接收 familyId，阻止遗漏过滤导致串谱。
 */
export interface Repo {
  getFamilyById(id: number): Promise<Family | null>
  getFamilyBySlug(slug: string): Promise<Family | null>
  getPrimaryFamily(): Promise<Family | null>
  listFamilies(): Promise<Family[]>
  createFamily(input: FamilyInput, actorId: number | null): Promise<number>
  updateFamily(id: number, patch: FamilyPatch, actorId: number | null): Promise<Family>

  listMembers(familyId: number): Promise<Member[]>
  getMember(id: number): Promise<Member | null>
  createMember(input: MemberInput, actorId: number | null): Promise<number>
  updateMember(id: number, input: MemberInput, actorId: number | null): Promise<void>
  /** 派系改名传播：把某族谱下沿用旧房名的成员标签一并覆盖为新名 */
  renameBranch(familyId: number, from: string, to: string, actorId: number | null): Promise<void>
  deleteMember(id: number): Promise<void>
  countReferences(id: number): Promise<number>
  getDescendantIds(id: number): Promise<number[]>
  clearSpouse(spouseId: number): Promise<void>
  setSpouseId(id: number, spouseId: number | null): Promise<void>
  countMembers(familyId?: number): Promise<number>
  /** 世次数：该谱出现过的 generation 去重计数，供总目列表显示「N 人 / M 世」 */
  countGenerations(familyId: number): Promise<number>

  /**
   * 批量导入：按传入顺序逐条插入，批内亲属按「表内编号」解析成真实 id。
   * 全部成功才提交，任一条失败整体回滚（调用方需保证 rows 已按世次升序，父辈先于子辈）。
   * 返回与 rows 同序的新建 id。
   */
  bulkCreateMembers(familyId: number, rows: MemberImportRow[], actorId: number | null): Promise<number[]>

  getAdminByUsername(username: string): Promise<AdminUser | null>
  getAdminById(id: number): Promise<AdminUser | null>
  listAdmins(): Promise<AdminUser[]>
  countAdmins(): Promise<number>
  createAdmin(username: string, passwordHash: string, role?: string, familyId?: number | null): Promise<void>
  updateAdminPassword(id: number, passwordHash: string): Promise<void>
  updateAdminRole(id: number, role: string): Promise<void>
  setAdminFamily(id: number, familyId: number | null): Promise<void>
  setAdminDisabled(id: number, disabled: boolean): Promise<void>
  deleteAdmin(id: number): Promise<void>
  touchAdminLogin(id: number): Promise<void>

  createSubmission(input: MemberSubmissionInput): Promise<number>
  listSubmissions(familyId?: number | null, status?: string): Promise<MemberSubmission[]>
  getSubmission(id: number): Promise<MemberSubmission | null>
  setSubmissionStatus(id: number, status: SubmissionStatus): Promise<void>
  deleteSubmissions(ids: number[]): Promise<number>
  appendAuditLog(entry: AuditLogEntry): Promise<void>
  listAuditLogs(
    limit?: number,
    offset?: number,
    action?: string,
    actor?: string,
    year?: number,
    month?: number,
  ): Promise<AuditLog[]>
  /** 与 listAuditLogs 同筛选项的总条数，供后台分页显示总页数 */
  countAuditLogs(action?: string, actor?: string, year?: number, month?: number): Promise<number>

  /** H1：设置/清除「必须修改密码」标记 */
  setMustChangePassword(id: number, required: boolean): Promise<void>
  /** 启用 TOTP：写入加密后的密钥并将类型置为 totp */
  enableMfa(id: number, encryptedSecret: string): Promise<void>
  /** 关闭 TOTP：清空密钥与类型（恢复为 none） */
  disableMfa(id: number): Promise<void>
  /** H4：将已登出的会话 jti 加入黑名单，并顺带清理过期记录 */
  revokeSession(jti: string, expiresAt: number): Promise<void>
  /** H4：判断会话是否已被撤销 */
  isSessionRevoked(jti: string): Promise<boolean>
  /** M-9：「登出所有设备」：记录该账号的全局会话失效时间，旧会话随后被中间件拒绝 */
  revokeAllSessions(uid: number): Promise<void>
  /** M-9：返回该账号最近一次「登出所有设备」的时间戳（毫秒），无记录返回 0 */
  sessionInvalidatedAt(uid: number): Promise<number>

  /** 平台级全局配置读取（键值对）；键不存在时返回空串 */
  getSetting(key: string): Promise<string>
  /** 平台级全局配置写入（键值对，存在则更新） */
  setSetting(key: string, value: string): Promise<void>

  /** 自动 TLS 证书域名列表（按创建时间倒序） */
  listDomains(): Promise<Domain[]>
  /** 按 id 获取单个域名证书记录 */
  getDomain(id: number): Promise<Domain | null>
  /** 超级管理员后台绑定域名，写入待签发状态；域名重复时抛出冲突错误 */
  createDomain(domain: string, actorId: number | null): Promise<number>
  /** 更新域名证书状态与元信息（由宿主机 cert-manager 回写） */
  updateDomainStatus(
    id: number,
    status: string,
    opts?: { expiry?: string; certPath?: string; error?: string },
  ): Promise<void>
  /** 删除域名证书记录 */
  deleteDomain(id: number): Promise<void>
}

export function parseBranches(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string")
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === "string")
      }
    } catch {
      // 旧数据可能以纯文本存储，按分隔符拆分
      return value
        .split(/[、,，;；]/)
        .map((item) => item.trim())
        .filter(Boolean)
    }
  }
  return []
}

export function parseBranchHeads(value: unknown): Record<string, number> {
  const result: Record<string, number> = {}
  const source =
    typeof value === "string" && value.trim()
      ? (() => {
          try {
            return JSON.parse(value)
          } catch {
            return null
          }
        })()
      : value
  if (source && typeof source === "object" && !Array.isArray(source)) {
    for (const [key, val] of Object.entries(source)) {
      if (typeof key === "string" && typeof val === "number") result[key] = val
    }
  }
  return result
}

function asVisibility(value: unknown): Visibility {
  return value === "public" || value === "private" ? value : "password"
}

export function rowToFamily(row: Record<string, unknown>): Family {
  return {
    id: Number(row.id),
    slug: String(row.slug ?? ""),
    tag: String(row.tag ?? ""),
    domain: String(row.domain ?? ""),
    visibility: asVisibility(row.visibility),
    accessPasswordHash: String(row.access_password_hash ?? ""),
    isPrimary: Number(row.is_primary ?? 0) === 1,
    theme: String(row.theme ?? ""),
    surname: String(row.surname ?? ""),
    name: String(row.name ?? ""),
    hallName: String(row.hall_name ?? ""),
    county: String(row.county ?? ""),
    originPlace: String(row.origin_place ?? ""),
    founderName: String(row.founder_name ?? ""),
    foundedYear: String(row.founded_year ?? ""),
    intro: String(row.intro ?? ""),
    motto: String(row.motto ?? ""),
    rules: String(row.rules ?? ""),
    preface: String(row.preface ?? ""),
    generationPoem: String(row.generation_poem ?? ""),
    generationPoemStart: Number(row.generation_poem_start ?? 1),
    branches: parseBranches(row.branches),
    branchHeads: parseBranchHeads(row.branch_heads),
    coverImage: String(row.cover_image ?? ""),
    footerText: String(row.footer_text ?? ""),
    icpNumber: String(row.icp_number ?? ""),
    policeNumber: String(row.police_number ?? ""),
    showExtendedLineage: Number(row.show_extended_lineage ?? 0) === 1,
    isPublished: Number(row.is_published ?? 1) === 1,
    createdBy: String(row.created_by_name ?? ""),
    updatedBy: String(row.updated_by_name ?? ""),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  }
}

export function rowToMember(row: Record<string, unknown>): Member {
  return {
    id: Number(row.id),
    familyId: Number(row.family_id ?? 1),
    name: String(row.name ?? ""),
    gender: row.gender === "female" ? "female" : "male",
    generation: Number(row.generation ?? 1),
    courtesyName: String(row.courtesy_name ?? ""),
    fatherId: row.father_id == null ? null : Number(row.father_id),
    motherId: row.mother_id == null ? null : Number(row.mother_id),
    spouseId: row.spouse_id == null ? null : Number(row.spouse_id),
    isMarriedIn: Number(row.is_married_in ?? 0) === 1,
    isBranchHeir: Number(row.is_branch_heir ?? 0) === 1,
    branch: String(row.branch ?? ""),
    birthYear: String(row.birth_year ?? ""),
    deathYear: String(row.death_year ?? ""),
    isAlive: Number(row.is_alive ?? 1) === 1,
    burialPlace: String(row.burial_place ?? ""),
    title: String(row.title ?? ""),
    bio: String(row.bio ?? ""),
    sortOrder: Number(row.sort_order ?? 0),
    avatarKey: String(row.avatar_key ?? ""),
    createdBy: String(row.created_by_name ?? ""),
    updatedBy: String(row.updated_by_name ?? ""),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  }
}

export function rowToAdmin(row: Record<string, unknown>): AdminUser {
  return {
    id: Number(row.id),
    username: String(row.username ?? ""),
    passwordHash: String(row.password_hash ?? ""),
    role: String(row.role ?? "super"),
    isDisabled: Number(row.is_disabled ?? 0) === 1,
    lastLoginAt: String(row.last_login_at ?? ""),
    familyId: row.family_id === null || row.family_id === undefined ? null : Number(row.family_id),
    mustChangePassword: Number(row.must_change_password ?? 0) === 1,
    mfaType: row.mfa_type === "totp" ? "totp" : "none",
    mfaSecret: String(row.mfa_secret ?? ""),
  }
}

/**
 * 审计日志的筛选条件：列表、计数、导出三处共用一份，避免 D1 与本地库
 * 各写一套 WHERE 后条件悄悄走偏，出现「列表有、总数没有」这类对不上的分页。
 */
export function auditLogWhere(filter: {
  action?: string
  actor?: string
  year?: number
  month?: number
}): { clause: string; params: string[] } {
  const where: string[] = []
  const params: string[] = []
  if (filter.action) {
    where.push("action = ?")
    params.push(filter.action)
  }
  if (filter.actor) {
    where.push("actor_name LIKE ?")
    params.push(`%${filter.actor}%`)
  }
  if (filter.year != null) {
    where.push("strftime('%Y', created_at) = ?")
    params.push(String(filter.year))
  }
  if (filter.month != null) {
    where.push("strftime('%m', created_at) = ?")
    params.push(String(filter.month).padStart(2, "0"))
  }
  return { clause: where.length ? `WHERE ${where.join(" AND ")}` : "", params }
}

export function rowToAuditLog(row: Record<string, unknown>): AuditLog {
  return {
    id: Number(row.id),
    actorId: Number(row.actor_id ?? 0),
    actorName: String(row.actor_name ?? ""),
    actorRole: String(row.actor_role ?? ""),
    action: String(row.action ?? ""),
    targetType: String(row.target_type ?? ""),
    targetId: String(row.target_id ?? ""),
    detail: String(row.detail ?? ""),
    createdAt: String(row.created_at ?? ""),
  }
}

export function rowToDomain(row: Record<string, unknown>): Domain {
  return {
    id: Number(row.id),
    domain: String(row.domain ?? ""),
    status: String(row.status ?? "pending"),
    expiryDate: String(row.expiry_date ?? ""),
    certPath: String(row.cert_path ?? ""),
    lastError: String(row.last_error ?? ""),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  }
}

export function rowToMemberSubmission(row: Record<string, unknown>): MemberSubmission {
  const raw = String(row.status ?? "pending")
  const status: SubmissionStatus =
    raw === "accepted" || raw === "rejected" ? raw : "pending"
  return {
    id: Number(row.id),
    familyId: Number(row.family_id ?? 0),
    reporterName: String(row.reporter_name ?? ""),
    message: String(row.message ?? ""),
    payload: String(row.payload ?? "{}"),
    status,
    familyLabel: String(row.family_label ?? ""),
    createdAt: String(row.created_at ?? ""),
  }
}

export function nowIso(): string {
  return new Date().toISOString()
}

/**
 * 服务端复刻前端（src/lib/types.ts）的血脉 / 外衍推导，使统计口径与展示开关一致。
 * 仅按父系判定本族血脉；出嫁女子之后裔（外衍）按两层放宽展示。
 */
export function computeClanBloodIds(members: Member[]): Set<number> {
  const byId = new Map(members.map((m) => [m.id, m]))
  const minGen = members.reduce((min, m) => Math.min(min, m.generation), Infinity) || 1
  const blood = new Set<number>()
  const visiting = new Set<number>()
  const isBlood = (id: number): boolean => {
    if (blood.has(id)) return true
    if (visiting.has(id)) return false
    const m = byId.get(id)
    if (!m) return false
    // 外姓配偶（含入赘承祧者本人）不算血脉：前者靠配偶关系附属，后者靠婚姻取得房分
    if (m.isMarriedIn) return false
    visiting.add(id)
    const fatherId = m.fatherId
    const fatherInSet = fatherId != null && byId.has(fatherId)
    // 父为入赘承祧者时改由本族母亲上溯：赘婿子女承母系房分，外嫁女之子女仍判为非血脉
    const fatherIsHeir = fatherInSet ? byId.get(fatherId as number)?.isBranchHeir === true : false
    const motherInSet = m.motherId != null && byId.has(m.motherId)
    const result = fatherInSet
      ? isBlood(fatherId as number) ||
        (fatherIsHeir && motherInSet && isBlood(m.motherId as number))
      : m.generation === minGen
    visiting.delete(id)
    if (result) blood.add(id)
    return result
  }
  for (const m of members) isBlood(m.id)
  return blood
}

/**
 * 可否持有本族房支：本族血脉，或入赘承祧 / 过继取得房分者。
 * 普通外姓配偶一律不持房支——房支只随父系血缘，不随婚姻取得。
 */
export function canHoldBranch(member: Member): boolean {
  return !member.isMarriedIn || member.isBranchHeir
}

/** 可否取本族字辈：与房支同一口径（承祧者随配偶世次，故可取） */
export function hasGenerationName(member: Member): boolean {
  return !member.isMarriedIn || member.isBranchHeir
}

export function computeDisplayLineageIds(members: Member[]): Set<number> {
  const blood = computeClanBloodIds(members)
  const ids = new Set(blood)
  const childrenMap = new Map<number, number[]>()
  for (const m of members) {
    for (const pid of [m.fatherId, m.motherId]) {
      if (pid == null) continue
      const list = childrenMap.get(pid) ?? []
      list.push(m.id)
      childrenMap.set(pid, list)
    }
  }
  const layer1 = new Set<number>()
  for (const m of members) {
    if (ids.has(m.id)) continue
    const parentIsBlood =
      (m.fatherId != null && blood.has(m.fatherId)) ||
      (m.motherId != null && blood.has(m.motherId))
    if (parentIsBlood) {
      ids.add(m.id)
      layer1.add(m.id)
    }
  }
  for (const id of layer1) {
    for (const childId of childrenMap.get(id) ?? []) {
      if (!ids.has(childId)) ids.add(childId)
    }
  }
  return ids
}

export function computeVisibleLineageIds(members: Member[], showExtended: boolean): Set<number> {
  return showExtended ? computeDisplayLineageIds(members) : computeClanBloodIds(members)
}
