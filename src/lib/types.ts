import { formatBeijing } from "./time"

export type Gender = "male" | "female"
export type Visibility = "public" | "password" | "private"

export interface Family {
  id: number
  slug: string
  tag: string
  domain: string
  visibility: Visibility
  isPrimary: boolean
  theme: string
  hasPassword: boolean
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
  /** 结构性房支：房名 → 房主（先祖）成员 id；有房主时按血统子树自动派生，免逐人标注 */
  branchHeads: Record<string, number>
  coverImage: string
  footerText: string
  icpNumber: string
  policeNumber: string
  /** 是否在前台公开展示：关闭后门户不列出、直接访问按不存在处理（仅超级管理员可改） */
  isPublished: boolean
  /** 谱页是否排入出嫁女子后裔（两层，至孙辈，与世系图口径一致）：默认不含，仅超级管理员可改 */
  printIncludeExtended: boolean
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
}

/** 门户列表中的族谱条目 */
export type FamilySummary = Family & { memberCount: number }

/** 后台提交的族谱表单（维护人字段由服务端填充；访问口令由后台自动生成，表单不携带） */
export type FamilyDraft = Omit<
  Family,
  "id" | "updatedAt" | "createdAt" | "createdBy" | "updatedBy" | "hasPassword"
>

export const EMPTY_FAMILY: FamilyDraft = {
  slug: "",
  tag: "",
  domain: "",
  visibility: "password",
  isPrimary: false,
  theme: "",
  surname: "",
  name: "",
  hallName: "",
  county: "",
  originPlace: "",
  founderName: "",
  foundedYear: "",
  intro: "",
  motto: "",
  rules: "",
  preface: "",
  generationPoem: "",
  generationPoemStart: 1,
  branches: [],
  branchHeads: {},
  coverImage: "",
  footerText: "",
  icpNumber: "",
  policeNumber: "",
  isPublished: true,
  printIncludeExtended: false,
}

export const VISIBILITY_LABEL: Record<Visibility, string> = {
  public: "公开",
  password: "密码访问",
  private: "仅管理员",
}

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
  /**
   * 入赘承祧 / 过继取得本族房分者：本人非本族血脉（不计族人、不作房支种子），
   * 但可取字辈、可持房支；其子女经本族母亲上溯归入血脉。
   */
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

export type MemberDraft = Omit<
  Member,
  "id" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy"
>

export interface Stats {
  memberCount: number
  lineageCount: number
  generationCount: number
  branches: { name: string; count: number }[]
  generations: { generation: number; count: number }[]
  updatedAt: string
}

export interface AdminUser {
  id: number
  username: string
  role: string
  isDisabled: boolean
  lastLoginAt: string
  /** 所属家族；超级管理员为 null（可管理全部家族） */
  familyId: number | null
  /** 首次登录或密码被重置后，必须先修改密码 */
  mustChangePassword: boolean
  /** 登录二次验证类型：none 未启用 / totp 已绑定验证器 */
  mfaType: "none" | "totp"
}

export type SubmissionStatus = "pending" | "accepted" | "rejected"

/** 管理员操作审计日志（仅超级管理员可见） */
export interface AuditLog {
  id: number
  actorId: number
  actorName: string
  actorRole: string
  action: string
  targetType: string
  targetId: string
  detail: string
  createdAt: string
}

/** 亲属公开提交的信息更新反馈 */
export interface MemberSubmission {
  id: number
  familyId: number
  reporterName: string
  message: string
  payload: string
  status: SubmissionStatus
  /** 自选/未匹配的家族名；familyId 为 0（未分配）时用于展示 */
  familyLabel: string
  createdAt: string
}

export const EMPTY_MEMBER: MemberDraft = {
  familyId: 0,
  name: "",
  gender: "male",
  generation: 1,
  courtesyName: "",
  fatherId: null,
  motherId: null,
  spouseId: null,
  isMarriedIn: false,
  isBranchHeir: false,
  branch: "",
  birthYear: "",
  deathYear: "",
  isAlive: false,
  burialPlace: "",
  title: "",
  bio: "",
  sortOrder: 0,
  avatarKey: "",
}

const CN_NUMERALS = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"]

/** 1 → 一，12 → 十二，23 → 二十三，100 → 一百 */
export function toChineseNumber(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "零"
  if (value < 10) return CN_NUMERALS[value]
  if (value < 20) return `十${value % 10 === 0 ? "" : CN_NUMERALS[value % 10]}`
  if (value < 100) {
    const tens = Math.floor(value / 10)
    const ones = value % 10
    return `${CN_NUMERALS[tens]}十${ones === 0 ? "" : CN_NUMERALS[ones]}`
  }
  if (value < 1000) {
    const hundreds = Math.floor(value / 100)
    const rest = value % 100
    if (rest === 0) return `${CN_NUMERALS[hundreds]}百`
    if (rest < 10) return `${CN_NUMERALS[hundreds]}百零${CN_NUMERALS[rest]}`
    return `${CN_NUMERALS[hundreds]}百${toChineseNumber(rest)}`
  }
  return String(value)
}

export function generationLabel(generation: number): string {
  return `第${toChineseNumber(generation)}世`
}

/**
 * 依据家族字辈诗与「字辈起始世次」，按代数推导该世代的字辈用字。
 *
 * 字辈诗按「一世代一字」处理：先剔除装饰性分隔符（·•、，, 及空格，仅用于把若干
 * 字辈成组便于阅读，不改变逐字对应关系），再逐字拆开取对应世代的单字。这样无论
 * 录入时是否带分组符号，都能正确取到每一世代的字辈。缺省起始世次为第 1 世。
 */
export function generationName(
  family: Pick<Family, "generationPoem" | "generationPoemStart"> | null | undefined,
  generation: number,
): string {
  if (!family) return ""
  const raw = (family.generationPoem ?? "").trim()
  if (!raw) return ""
  const start = family.generationPoemStart ?? 1
  const index = generation - start
  if (index < 0) return ""
  const tokens = Array.from(raw.replace(/[·•、，,\s]/g, ""))
  return index < tokens.length ? tokens[index] : ""
}

/**
 * 计算「本族父系血脉」成员集合：从始祖（最小世次的根）沿 fatherId 向下传递。
 *
 * 用途：决定房支 / 字辈归属与世系主干成员，区分三类人——
 *   1. 本族血脉：父系本族后裔（有房支 + 字辈）；
 *   2. 配偶：嫁入 / 入赘，靠 spouseId 挂在族人节点旁（无房支 / 字辈）；
 *   3. 出嫁子女：本族女儿的子女，父在夫家、不姓本姓、亦非配偶（无房支 / 字辈）。
 *
 * 关键：不再以「是否勾选外姓配偶」来判定字辈——出嫁子女即便未勾选，也会因
 * 其父不在本族血脉内而被自动排除，从而得到正确的「不取本族字辈」结果。
 */
export function computeClanBloodIds(members: Member[]): Set<number> {
  // 关键：始祖（最小世次之根）必须按「族谱」各自确定。
  // 各族谱的录入起点世次不同（如甲谱自第四世记起、乙谱自第三世记起），
  // 若把多谱成员混在一起取全局最小世次，他谱的起点会把本谱的根判为
  // 「非最小世次」，导致整谱被误判为非血脉（字辈全体置灰）。
  const byFamily = new Map<number, Member[]>()
  for (const m of members) {
    const list = byFamily.get(m.familyId) ?? []
    list.push(m)
    byFamily.set(m.familyId, list)
  }
  const blood = new Set<number>()
  for (const list of byFamily.values()) {
    for (const id of computeFamilyBloodIds(list)) blood.add(id)
  }
  return blood
}

/** 判定房支 / 字辈只依赖这两个身份位，MemberDraft 亦可传入 */
type LineageIdentity = Pick<Member, "isMarriedIn" | "isBranchHeir">

/**
 * 可否持有本族房支：本族血脉，或入赘承祧 / 过继取得房分者。
 * 普通外姓配偶一律不持房支——房支只随父系血缘，不随婚姻取得。
 */
export function canHoldBranch(member: LineageIdentity): boolean {
  return !member.isMarriedIn || member.isBranchHeir
}

/** 可否取本族字辈：与房支同一口径（承祧者随配偶世次，故可取） */
export function hasGenerationName(member: LineageIdentity): boolean {
  return !member.isMarriedIn || member.isBranchHeir
}

/** 单一族谱内的父系血脉推导（成员 id 全局唯一，跨谱合并结果安全） */
function computeFamilyBloodIds(members: Member[]): Set<number> {
  const byId = new Map(members.map((m) => [m.id, m]))
  const minGen =
    members.reduce((min, m) => Math.min(min, m.generation), Infinity) || 1
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
    // 父不在本集合内时（如按房支筛选后，房根之父属其他房支），该成员即视为本集合的根，
    // 按其世次是否为集合内最小来判定血脉，避免整支被误判为非血脉而整体丢失。
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
 * 世系图 / 全景图应「展示」的成员集合：在父系血脉之上，额外包含
 * 「血脉成员的直接非血脉子女」——即本族女儿出嫁后所育子女（其父在夫家、
 * 不姓本姓）。用于把出嫁女儿的小家庭（本人 + 配偶 + 子女）呈现出来，但
 * 不再深入夫家后续世代（子女之子女不展示，因其已属夫家宗族）。
 *
 * 与 computeClanBloodIds 的区别：后者只定「字辈 / 房支 / 族人计数」，
 * 此处放宽一层用于可视化展示，二者互不影响。
 */
/**
 * 世系图 / 全景图应「展示」的成员集合：在父系血脉之上，额外包含
 * 「血脉成员的直接非血脉子女」与其所育下一代——
 *   - 第 1 层外衍：本族女儿出嫁后所育子女（其父在夫家、不姓本姓）；
 *   - 第 2 层外衍：上述子女婚配所生（第八世），基本已不含本族血脉。
 * 两层外衍仅作「展示并区分」之用，不再深入夫家后续世代。
 *
 * 与 computeClanBloodIds 的区别：后者只定「字辈 / 房支 / 族人计数」，
 * 此处放宽两层用于可视化展示，二者互不影响。
 */
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
  // 第 1 层外衍：血脉成员的非血脉子女
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
  // 第 2 层外衍：上述外衍成员所育（如第七世婚配所生第八世）
  for (const id of layer1) {
    for (const childId of childrenMap.get(id) ?? []) {
      if (!ids.has(childId)) ids.add(childId)
    }
  }
  return ids
}

/**
 * 返回展示集合中「非本族血脉」的外衍成员（第 1、2 层外衍），用于在世系图中
 * 与真正的本族血脉做出视觉区分（如虚线边框 / 浅色标识）。
 */
export function computeExtendedLineageIds(members: Member[]): Set<number> {
  const ids = computeDisplayLineageIds(members)
  const blood = computeClanBloodIds(members)
  const extended = new Set<number>()
  for (const id of ids) {
    if (!blood.has(id)) extended.add(id)
  }
  return extended
}

/**
 * 可见成员集合：依据「延伸展示出嫁女子后裔」开关决定展示范围。
 *   - 关：仅本族父系血脉（computeClanBloodIds）；
 *   - 开：血脉 + 两层外衍（computeDisplayLineageIds，与站点默认一致）。
 * 注意：配偶（外姓）是否展示由 showExtended 决定，调用方据此裁剪传入布局/扇形的成员。
 */
export function computeVisibleLineageIds(members: Member[], showExtended: boolean): Set<number> {
  return showExtended ? computeDisplayLineageIds(members) : computeClanBloodIds(members)
}

/**
 * 房支子树派生：从一组「种子」成员出发，返回其全部后代（仅向下展开）以及每位成员
 * 与其后代的配偶（媳妇 / 女婿）。用于结构性房支——以房主为种子，自动得到整支。
 */
export function expandDescendantsAndSpouses(
  members: Member[],
  seedIds: Iterable<number>,
): Set<number> {
  const childrenIndex = new Map<number, number[]>()
  const spouseOf = new Map<number, number>()
  for (const m of members) {
    for (const pid of [m.fatherId, m.motherId]) {
      if (pid == null) continue
      const list = childrenIndex.get(pid) ?? []
      list.push(m.id)
      childrenIndex.set(pid, list)
    }
    if (m.spouseId != null) spouseOf.set(m.id, m.spouseId)
  }
  const ids = new Set<number>(seedIds)
  const stack = [...ids]
  while (stack.length) {
    const id = stack.pop()!
    const sp = spouseOf.get(id)
    if (sp != null && !ids.has(sp)) ids.add(sp)
    for (const cid of childrenIndex.get(id) ?? []) {
      if (!ids.has(cid)) {
        ids.add(cid)
        stack.push(cid)
      }
    }
  }
  return ids
}

export function lifeSpan(member: Member): string {
  if (member.birthYear && member.deathYear) return `${member.birthYear}—${member.deathYear}`
  if (member.birthYear) return `生于 ${member.birthYear}`
  if (member.deathYear) return `卒于 ${member.deathYear}`
  return "生卒未详"
}

export function displayName(member: Member): string {
  return member.name || "佚名"
}

export function spouseLabel(member: Member): string {
  return member.gender === "female" ? "配" : "适"
}

export function formatDate(iso: string): string {
  return formatBeijing(iso, false)
}
