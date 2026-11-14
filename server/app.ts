import { Hono, type Context, type MiddlewareHandler } from "hono"
import { timingSafeEqual } from "node:crypto"
import { deleteCookie, getCookie, setCookie } from "hono/cookie"
import { HTTPException } from "hono/http-exception"
import {
  SESSION_COOKIE,
  TENANT_TTL_MS,
  TENANT_TTL_MP_MS,
  createSessionToken,
  createTenantToken,
  createPreAuthToken,
  readPreAuthToken,
  generateTotpSecret,
  generateAccessPassword,
  buildOtpauthUri,
  verifyTotp,
  encryptSecret,
  decryptSecret,
  hashPassword,
  passwordFingerprint,
  readSessionToken,
  readTenantToken,
  tenantCookieName,
  verifyPassword,
  DUMMY_HASH,
  type SessionPayload,
} from "./auth.js"
import { readEnv } from "./config.js"
import { lockRemaining, recordFailure, recordSuccess } from "./rate-limit.js"
import { formatBeijing } from "./time.js"
import { avatarStorage, imageExtFromBytes } from "./avatar-storage.js"
import type {
  AdminUser,
  Family,
  FamilyInput,
  Member,
  MemberImportRow,
  MemberInput,
  MemberSubmission,
  Repo,
  Visibility,
} from "./repo/types.js"
import { canHoldBranch, computeVisibleLineageIds } from "./repo/types.js"

type AppEnv = {
  Variables: {
    repo: Repo
    secret: string
    session: SessionPayload | null
    family: Family
    member?: Member
    submission?: MemberSubmission
  }
}

const RESERVED_SLUGS = new Set(["admin", "api", "assets", "static", "public", "t", "favicon.ico"])
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,31}$/

/**
 * H4：私密族谱的可见范围。
 * 超级管理员（familyId 为 null）可阅全部；普通管理员只可阅本族谱。
 * 账号不存在或已停用时一律无权，避免已签发但未注销的 Cookie 继续生效。
 */
function canReadPrivateFamily(admin: AdminUser | null, family: Family): boolean {
  if (!admin || admin.isDisabled) return false
  return admin.role === "super" || (admin.familyId ?? 0) === family.id
}

/** H1/M-8：强制改密流程的新密码复杂度（与前端 src/lib/password.ts 保持一致） */
function validateNewPassword(next: string, current: string, username: string): string | null {
  // 规则：至少 8 位、至多 128 位；大小写字母、数字、特殊符号四类里至少含三类；不得与当前密码相同；不得包含用户名。
  if (next.length < 8) return "新密码至少 8 位"
  if (next.length > 128) return "新密码不能超过 128 位" // A015：上限防止超大口令拖慢 PBKDF2
  const classes = [/[A-Z]/, /[a-z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(next)).length
  if (classes < 3) {
    return "新密码需包含大写字母、小写字母、数字、特殊符号中的至少 3 类"
  }
  // M-8：不得等于或包含用户名
  if (username && next.toLowerCase().includes(username.toLowerCase())) {
    return "新密码不得包含账号名"
  }
  // A015/M-8：常见弱口令黑名单（与 str() 静默 trim 无关，独立校验）
  const COMMON_PASSWORDS = new Set([
    "password", "12345678", "123456789", "qwerty123", "abcdefgh", "11111111",
    "admin1234", "family2026", "huang2026", "zhongguo", "changeme", "iloveyou",
    "password1", "1234567890", "qwertyui", "letmein", "passw0rd", "p@ssw0rd",
    "123123123", "00000000", "admin8888", "root12345", "test1234", "zhangwei",
    "wang12345", "li123456", "woaini1314", "5201314", "1234abcd", "a12345678",
  ])
  if (COMMON_PASSWORDS.has(next.toLowerCase())) return "该密码过于常见，请更换"
  if (next === current) return "新密码不得与当前密码相同"
  return null
}

function str(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback
  return String(value).trim()
}

function intOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null
}

function parseIntStrict(value: unknown, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) ? Math.trunc(n) : fallback
}

function asVisibility(value: unknown, fallback: Visibility = "password"): Visibility {
  return value === "public" || value === "password" || value === "private" ? value : fallback
}

// A023：封面图仅允许 http(s) 或同源相对路径，拒绝 javascript: 等非常规协议，防止存储型 XSS / 钓鱼
function safeImageUrl(value: unknown): string {
  const url = str(value)
  if (!url) return ""
  if (/^https?:\/\//i.test(url)) return url
  if (url.startsWith("/")) return url
  return ""
}

/** 仅采信由可信反向代理强制覆盖的 X-Real-IP；绝不读取客户端可伪造的 X-Forwarded-For / CF-Connecting-IP */
function clientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  return c.req.header("x-real-ip")?.trim() || "unknown"
}

/**
 * 判定是否应按 HTTPS 处理（Cookie Secure 属性与 HSTS）。
 * 生产 TLS 在 nginx 终止、回源为明文 HTTP，故不能只看 c.req.url 的协议。
 * 仅在存在可信代理注入的 X-Real-IP 时采信 X-Forwarded-Proto（nginx 以 $scheme 强制覆盖）；
 * 直连应用端口时不采信客户端自带的协议头，避免伪造头诱导下发 HSTS。
 */
function isHttpsRequest(c: { req: { header: (name: string) => string | undefined; url: string } }): boolean {
  const proto = c.req.header("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase()
  if (c.req.header("x-real-ip")) {
    if (proto === "https") return true
    if (proto === "http") return false
  }
  return new URL(c.req.url).protocol === "https:"
}

/**
 * 超管未绑定验证器时，判定该后台接口是否应被拦截。
 * 允许绑定验证器自身的两个接口（setup/confirm），否则超管永远无法完成绑定；
 * 认证类 /api/auth/* 不在 /api/admin/ 前缀下，天然放行。
 */
// ── 第三方统计接入：结构化 ID 校验（拒绝任意脚本/HTML，仅允许厂商标识） ──
type AnalyticsProviderKey = "baidu" | "umeng" | "ga" | "clarity" | "gads"
interface AnalyticsProvider {
  key: AnalyticsProviderKey
  enabled: boolean
  id: string
  notice?: string
}
const ANALYTICS_KEYS: AnalyticsProviderKey[] = ["baidu", "umeng", "ga", "clarity", "gads"]
// 厂商标识仅允许字母/数字/下划线/连字符，长度 4–64，足以排除 <>"'/` 等注入字符
const ANALYTICS_ID_PATTERN = /^[\w-]{4,64}$/

function parseAnalyticsConfig(input: unknown): AnalyticsProvider[] | null {
  if (!Array.isArray(input)) return null
  const out: AnalyticsProvider[] = []
  for (const item of input) {
    if (!item || typeof item !== "object") return null
    const rec = item as Record<string, unknown>
    const key = rec.key
    if (typeof key !== "string" || !ANALYTICS_KEYS.includes(key as AnalyticsProviderKey)) return null
    const enabled = rec.enabled === true
    const id = typeof rec.id === "string" ? rec.id.trim() : ""
    // 启用时必须填写合法标识；未启用时允许留空，但已填写仍须合法并原样保留（不清空）
    if (enabled && !ANALYTICS_ID_PATTERN.test(id)) return null
    if (id && !ANALYTICS_ID_PATTERN.test(id)) return null
    const notice = typeof rec.notice === "string" ? rec.notice.slice(0, 2000) : ""
    out.push({ key: key as AnalyticsProviderKey, enabled, id, notice })
  }
  return out
}

function isAdminBlockedWithoutMfa(pathname: string): boolean {
  if (!pathname.startsWith("/api/admin/")) return false
  if (pathname === "/api/admin/mfa/setup" || pathname === "/api/admin/mfa/confirm") {
    return false
  }
  return true
}

/** 全站安全响应头；Workers 静态资源分支由 worker-entry.ts 复用 */
export const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  // 第三方统计域名按厂商放行：百度（hm/hmcdn）、友盟 CNZZ（cnzz/mmstat）、
  // Google（gtag/google-analytics/googleadservices/doubleclick/googlesyndication/www.google.com）、
  // Clarity（含 scripts/c/r 子域）与 Bing 信标。
  // script-src 的 sha256 对应 index.html 首屏内联主题初始化脚本（防 React 挂载闪烁）；
  // 已用哈希精确授权该脚本，故不再使用 'unsafe-inline'。若修改该脚本须同步更新此哈希。
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' 'sha256-r3xv7ITWxIWGC4HC2tSoxs0+G+XQvxm4vy9Qc/WAQkQ=' https://hm.baidu.com https://hmcdn.baidu.com https://*.googletagmanager.com https://*.google-analytics.com https://*.clarity.ms https://bat.bing.com https://*.cnzz.com https://*.googleadservices.com https://*.doubleclick.net; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://hm.baidu.com https://hmcdn.baidu.com https://*.google-analytics.com https://*.googlesyndication.com https://*.clarity.ms https://*.cnzz.com https://*.mmstat.com https://*.googleadservices.com https://*.doubleclick.net https://www.google.com https://bat.bing.com; font-src 'self' data:; connect-src 'self' https://hm.baidu.com https://hmcdn.baidu.com https://*.google-analytics.com https://*.googletagmanager.com https://*.googlesyndication.com https://*.clarity.ms https://bat.bing.com https://*.cnzz.com https://*.mmstat.com https://*.googleadservices.com https://*.doubleclick.net https://www.google.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
}

export function securityHeaderEntries(isHttps: boolean): [string, string][] {
  const entries: [string, string][] = Object.entries(SECURITY_HEADERS)
  if (isHttps) {
    entries.push(["Strict-Transport-Security", "max-age=31536000; includeSubDomains"])
  }
  return entries
}

// 反馈提交的轻量限流：同一来源 10 分钟内最多 20 次
const feedbackBuckets = new Map<string, { count: number; resetAt: number }>()
function feedbackLimited(ip: string): boolean {
  const now = Date.now()
  const bucket = feedbackBuckets.get(ip)
  if (!bucket || now > bucket.resetAt) {
    feedbackBuckets.set(ip, { count: 1, resetAt: now + 10 * 60 * 1000 })
    return false
  }
  bucket.count += 1
  return bucket.count > 20
}

function normalizeMember(body: Record<string, unknown>, fallbackFamilyId: number | null): MemberInput {
  const name = str(body.name)
  if (!name) throw new HTTPException(400, { message: "姓名不能为空" })

  const familyId = intOrNull(body.familyId) ?? fallbackFamilyId
  if (!familyId) throw new HTTPException(400, { message: "缺少家族标签" })

  const generation = parseIntStrict(body.generation, 1)
  if (generation < 1 || generation > 99) {
    throw new HTTPException(400, { message: "世次需在 1 至 99 之间" })
  }

  return {
    familyId,
    name,
    gender: body.gender === "female" ? "female" : "male",
    generation,
    courtesyName: str(body.courtesyName),
    fatherId: intOrNull(body.fatherId),
    motherId: intOrNull(body.motherId),
    spouseId: intOrNull(body.spouseId),
    isMarriedIn: Boolean(body.isMarriedIn),
    isBranchHeir: Boolean(body.isBranchHeir),
    branch: str(body.branch),
    birthYear: str(body.birthYear),
    deathYear: str(body.deathYear),
    isAlive: body.isAlive === undefined ? false : Boolean(body.isAlive),
    burialPlace: str(body.burialPlace),
    title: str(body.title),
    bio: str(body.bio),
    sortOrder: parseIntStrict(body.sortOrder, 0),
    avatarKey: str(body.avatarKey),
  }
}

async function assertSameFamily(repo: Repo, familyId: number, ids: (number | null)[]) {
  for (const id of ids) {
    if (!id) continue
    const member = await repo.getMember(id)
    if (!member) throw new HTTPException(400, { message: "关联的族人不存在" })
    if (member.familyId !== familyId) {
      throw new HTTPException(400, { message: "关联的族人须与本人同属一个族谱" })
    }
  }
}

// ── 族人批量导入：归一化、校验、世次推导 ──

/**
 * 单次导入上限。本地 SQLite 逐条插入毫无压力，但 D1 每次插入都是一次网络往返，
 * 受 Worker 请求时长约束，故取一个两侧都安全的保守值。
 */
const MAX_IMPORT_ROWS = 500
// M-4：导入请求体上限（5MB），防止超大 JSON 拖垮 DB/CPU（配合 MAX_IMPORT_ROWS 行数上限）
const MAX_IMPORT_BODY_BYTES = 5 * 1024 * 1024

interface ImportIssue {
  no: string
  field: string
  message: string
}

interface ImportCandidate {
  no: string
  name: string
  gender: "male" | "female"
  generationInput: number | null
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

/** 表内编号：字母数字与 -_，`@` 前缀表示引用库内已有成员的 id */
const IMPORT_REF_PATTERN = /^@?\d*[A-Za-z0-9_-]{0,32}$/

/** 「是 / 否」列的宽容解析：是、否、TRUE、FALSE、1、0 均接受 */
function importFlag(value: unknown, fallback = false): boolean {
  if (value === undefined || value === null || value === "") return fallback
  if (typeof value === "boolean") return value
  const text = String(value).trim().toLowerCase()
  if (["是", "true", "1", "y", "yes", "在世", "有"].includes(text)) return true
  if (["否", "false", "0", "n", "no", "已故", "无"].includes(text)) return false
  return fallback
}

/**
 * 把请求体里的原始行归一化成候选行，只做「不依赖其他行」的校验：
 * 编号唯一性、姓名、性别、房支白名单。依赖关系（引用是否存在、是否成环）留给 planImport。
 */
function normalizeImportRows(
  rawRows: unknown[],
  branches: string[],
): { candidates: ImportCandidate[]; issues: ImportIssue[] } {
  const issues: ImportIssue[] = []
  const candidates: ImportCandidate[] = []
  const seen = new Set<string>()
  const branchSet = new Set(branches)

  rawRows.forEach((raw, index) => {
    const row = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
    const no = str(row.no) || `第${index + 1}行`
    if (!IMPORT_REF_PATTERN.test(no)) {
      issues.push({ no, field: "编号", message: "编号只能包含字母、数字、下划线或短横线" })
      return
    }
    if (seen.has(no)) {
      issues.push({ no, field: "编号", message: "编号重复，同一批内必须唯一" })
      return
    }
    seen.add(no)

    const name = str(row.name)
    if (!name) {
      issues.push({ no, field: "姓名", message: "姓名不能为空" })
      return
    }

    const genderText = str(row.gender)
    const gender =
      genderText === "male" || genderText === "男"
        ? "male"
        : genderText === "female" || genderText === "女"
          ? "female"
          : null
    if (!gender) {
      issues.push({ no, field: "性别", message: "性别须填「男」或「女」，不提供默认值" })
      return
    }

    const branch = str(row.branch)
    if (branch && !branchSet.has(branch)) {
      issues.push({ no, field: "房支", message: `房支「${branch}」不在本族房支清单内` })
      return
    }

    const isMarriedIn = importFlag(row.isMarriedIn)
    const isBranchHeir = importFlag(row.isBranchHeir)
    if (isBranchHeir && !isMarriedIn) {
      issues.push({ no, field: "入赘承祧", message: "勾选入赘承祧前，须先标为外姓配偶" })
      return
    }

    const generationValue = intOrNull(row.generation)
    candidates.push({
      no,
      name,
      gender,
      generationInput: generationValue,
      courtesyName: str(row.courtesyName),
      branch,
      fatherNo: str(row.fatherNo),
      motherNo: str(row.motherNo),
      spouseNo: str(row.spouseNo),
      isMarriedIn,
      isBranchHeir,
      birthYear: str(row.birthYear),
      deathYear: str(row.deathYear),
      isAlive: importFlag(row.isAlive),
      burialPlace: str(row.burialPlace),
      title: str(row.title),
      bio: str(row.bio),
      sortOrder: parseIntStrict(row.sortOrder, 0),
      avatarKey: "",
    })
  })

  return { candidates, issues }
}

/**
 * 依赖关系校验 + 世次推导，产出可直接落库的行（按世次升序，父辈先于子辈）。
 *
 * 世次优先级：父 +1 > 母 +1 > 承祧者随配偶 > 填写的世次 > 1。
 * 与 repo.createMember 的推导口径一致，服务端这里先算一遍只是为了排序与预览对齐。
 */
function planImport(
  candidates: ImportCandidate[],
  existing: Map<number, Member>,
): { rows: MemberImportRow[]; issues: ImportIssue[] } {
  const issues: ImportIssue[] = []
  const byNo = new Map(candidates.map((cand) => [cand.no, cand]))

  /** 引用解析：`@id` 取库内成员，其余取同批行；解析不到即报错（含跨族引用） */
  const refExists = (ref: string): boolean => {
    if (!ref) return true
    if (ref.startsWith("@")) return existing.has(Number(ref.slice(1)))
    return byNo.has(ref)
  }

  for (const cand of candidates) {
    for (const [field, ref] of [
      ["父编号", cand.fatherNo],
      ["母编号", cand.motherNo],
      ["配偶编号", cand.spouseNo],
    ] as const) {
      if (!refExists(ref)) {
        issues.push({ no: cand.no, field, message: `编号「${ref}」在本批与本族中都找不到` })
      }
      if (ref && ref === cand.no) {
        issues.push({ no: cand.no, field, message: "不能引用自己" })
      }
    }
    if (cand.fatherNo && cand.motherNo && cand.fatherNo === cand.motherNo) {
      issues.push({ no: cand.no, field: "父母", message: "父与母不能是同一位族人" })
    }
  }
  if (issues.length) return { rows: [], issues }

  // 环检测只看父 / 母边：配偶是互指关系，不能计入环
  const detecting = new Set<string>()
  const checked = new Set<string>()
  const hasCycle = (no: string): boolean => {
    if (checked.has(no)) return false
    if (detecting.has(no)) return true
    detecting.add(no)
    const cand = byNo.get(no)!
    for (const ref of [cand.fatherNo, cand.motherNo]) {
      if (ref && !ref.startsWith("@") && byNo.has(ref) && hasCycle(ref)) return true
    }
    detecting.delete(no)
    checked.add(no)
    return false
  }
  for (const cand of candidates) {
    if (hasCycle(cand.no)) {
      issues.push({ no: cand.no, field: "亲属", message: "父母关系成环，请检查父辈编号" })
      break
    }
  }
  if (issues.length) return { rows: [], issues }

  const genCache = new Map<string, number>()
  const resolving = new Set<string>()
  const refGen = (ref: string): number | null => {
    if (!ref) return null
    if (ref.startsWith("@")) return existing.get(Number(ref.slice(1)))?.generation ?? null
    const cand = byNo.get(ref)
    return cand ? resolveGen(cand) : null
  }
  const refBranch = (ref: string): string => {
    if (!ref) return ""
    if (ref.startsWith("@")) return existing.get(Number(ref.slice(1)))?.branch ?? ""
    return byNo.get(ref)?.branch ?? ""
  }
  function resolveGen(cand: ImportCandidate): number {
    const cached = genCache.get(cand.no)
    if (cached != null) return cached
    if (resolving.has(cand.no)) {
      // 正常数据不会到这里（父母成环已在上面拦下），只为防止配偶链自引用导致死循环
      return cand.generationInput ?? 1
    }
    resolving.add(cand.no)
    const fatherGen = refGen(cand.fatherNo)
    const motherGen = fatherGen == null ? refGen(cand.motherNo) : null
    let gen: number
    if (fatherGen != null) gen = fatherGen + 1
    else if (motherGen != null) gen = motherGen + 1
    // 外姓配偶（含入赘承祧）无父母可依，谱上与配偶同世
    else if (cand.isMarriedIn || cand.isBranchHeir) gen = refGen(cand.spouseNo) ?? cand.generationInput ?? 1
    else gen = cand.generationInput ?? 1
    if (gen < 1) gen = 1
    if (gen > 99) gen = 99
    resolving.delete(cand.no)
    genCache.set(cand.no, gen)
    return gen
  }

  for (const cand of candidates) {
    resolveGen(cand)
    // 承祧者取配偶房支：repo 的房支继承只认父 / 母，这里先补齐
    if (!cand.branch && cand.isBranchHeir) cand.branch = refBranch(cand.spouseNo)
  }

  // 按世次升序稳定排序，保证父辈先于子辈插入
  const sorted = [...candidates].sort(
    (a, b) => (genCache.get(a.no) ?? 1) - (genCache.get(b.no) ?? 1),
  )

  const rows: MemberImportRow[] = sorted.map((cand) => ({
    no: cand.no,
    name: cand.name,
    gender: cand.gender,
    generation: genCache.get(cand.no) ?? 1,
    courtesyName: cand.courtesyName,
    branch: cand.branch,
    fatherNo: cand.fatherNo,
    motherNo: cand.motherNo,
    spouseNo: cand.spouseNo,
    isMarriedIn: cand.isMarriedIn,
    isBranchHeir: cand.isBranchHeir,
    birthYear: cand.birthYear,
    deathYear: cand.deathYear,
    isAlive: cand.isAlive,
    burialPlace: cand.burialPlace,
    title: cand.title,
    bio: cand.bio,
    sortOrder: cand.sortOrder,
    avatarKey: cand.avatarKey,
  }))

  return { rows, issues: [] }
}

function computeStats(members: Member[], updatedAt: string) {
  // 统计口径固定按「本族父系血脉」：外衍是否展示已改为访客侧偏好（仅影响世系图 / 全景的
  // 呈现范围，不写入服务端），故此处不再随该偏好浮动，避免同一族谱的人数因人而异。
  const visible = computeVisibleLineageIds(members, false)
  const generations = new Map<number, number>()
  const branches = new Map<string, number>()
  let lineageCount = 0

  for (const member of members) {
    if (!visible.has(member.id)) continue
    generations.set(member.generation, (generations.get(member.generation) ?? 0) + 1)
    if (member.branch && canHoldBranch(member)) {
      branches.set(member.branch, (branches.get(member.branch) ?? 0) + 1)
    }
    if (!member.isMarriedIn && !member.isBranchHeir) lineageCount += 1
  }

  return {
    memberCount: visible.size,
    lineageCount,
    generationCount: members.reduce(
      (max, member) => (visible.has(member.id) ? Math.max(max, member.generation) : max),
      0,
    ),
    branches: [...branches.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    generations: [...generations.entries()]
      .map(([generation, count]) => ({ generation, count }))
      .sort((a, b) => a.generation - b.generation),
    updatedAt,
  }
}

/** 对外公开的族谱信息（绝不包含密码哈希） */
function publicFamily(family: Family) {
  return {
    id: family.id,
    slug: family.slug,
    tag: family.tag,
    domain: family.domain,
    visibility: family.visibility,
    isPrimary: family.isPrimary,
    theme: family.theme,
    hasPassword: Boolean(family.accessPasswordHash),
    surname: family.surname,
    name: family.name,
    hallName: family.hallName,
    county: family.county,
    originPlace: family.originPlace,
    founderName: family.founderName,
    foundedYear: family.foundedYear,
    intro: family.intro,
    motto: family.motto,
    rules: family.rules,
    preface: family.preface,
    generationPoem: family.generationPoem,
    generationPoemStart: family.generationPoemStart,
    branches: family.branches,
    branchHeads: family.branchHeads ?? {},
    coverImage: family.coverImage,
    footerText: family.footerText,
    icpNumber: family.icpNumber,
    policeNumber: family.policeNumber,
    isPublished: family.isPublished,
    updatedAt: family.updatedAt,
  }
}

/** 后台使用的族谱信息：保留维护人留痕，剔除密码哈希但显式给出「是否已设口令」标志 */
function adminFamily(family: Family) {
  const { accessPasswordHash: _omit, ...rest } = family
  return { ...rest, hasPassword: Boolean(family.accessPasswordHash) }
}

const FAMILY_TEXT_FIELDS = [
  "domain",
  "surname",
  "name",
  "hallName",
  "county",
  "originPlace",
  "founderName",
  "foundedYear",
  "intro",
  "motto",
  "rules",
  "preface",
  "generationPoem",
  "coverImage",
  "footerText",
  "icpNumber",
  "policeNumber",
] as const

// 仅超级管理员可改的家族敏感字段：前台展示 / 主谱 / 派系房支 / 备案号 / 站点主题
// 注：标识与访问栏目（slug / tag / 访问方式）已开放给普通管理员（editor），故不在此列；
// 访问方式中的「仅管理员」仍由下面的 visibility 专用守卫限定为超管可设；
// 字辈起始世次（generationPoemStart）也已放开给普通管理员。
const SENSITIVE_FAMILY_KEYS = [
  "isPrimary",
  "isPublished",
  "branches",
  "branchHeads",
  "theme",
  "domain",
  "icpNumber",
  "policeNumber",
] as const

// 比较请求字段与当前值是否一致；普通管理员保存时会带全量字段，
// 故仅当敏感字段「被改动」时才拦截，未改动则随正文一并提交而不受影响。
function isFamilyFieldUnchanged(key: string, value: unknown, current: Family): boolean {
  if (key === "branches") {
    return (
      JSON.stringify(current.branches ?? []) ===
      JSON.stringify(Array.isArray(value) ? value : [])
    )
  }
  if (key === "branchHeads") {
    // 归一化（去空白 / 仅保留有效数字键 / 键序无关）后比较，普通管理员未改房主时可正常保存
    const stable = (record: Record<string, number>) =>
      JSON.stringify(Object.keys(record).sort().map((k) => [k, record[k]]))
    return stable(parseBranchHeads(value)) === stable(current.branchHeads ?? {})
  }
  if (key === "isPrimary" || key === "isPublished") {
    return Boolean((current as unknown as Record<string, unknown>)[key]) === Boolean(value)
  }
  return String((current as unknown as Record<string, unknown>)[key] ?? "") === String(value ?? "")
}

/** 派系改名映射（[旧名, 新名]）。随族谱保存提交，服务端据此把成员档案中的旧房名标签一并覆盖为新名 */
function parseBranchRenames(value: unknown): [string, string][] {
  if (!Array.isArray(value)) return []
  const result: [string, string][] = []
  for (const item of value) {
    if (!Array.isArray(item) || item.length !== 2) continue
    const from = str(item[0]).trim()
    const to = str(item[1]).trim()
    if (from && to && from !== to) result.push([from, to])
  }
  return result.slice(0, 100)
}

/**
 * 房支房主映射（房名 → 房主成员 id）。创建与更新共用同一套归一化规则：
 * 房名去首尾空白后非空、房主 id 为有效正整数，非法项直接丢弃。
 */
function parseBranchHeads(value: unknown): Record<string, number> {
  const heads: Record<string, number> = {}
  if (!value || typeof value !== "object" || Array.isArray(value)) return heads
  for (const [name, raw] of Object.entries(value as Record<string, unknown>)) {
    const num = Number(raw)
    const trimmed = name.trim()
    if (trimmed && Number.isFinite(num) && num > 0) heads[trimmed] = Math.floor(num)
  }
  return heads
}

function baseFamilyInput(body: Record<string, unknown>): FamilyInput {
  const slug = str(body.slug).toLowerCase()
  const tag = str(body.tag)
  if (!SLUG_PATTERN.test(slug)) {
    throw new HTTPException(400, { message: "slug 需为 2–32 位小写字母、数字或连字符" })
  }
  if (RESERVED_SLUGS.has(slug)) {
    throw new HTTPException(400, { message: "该 slug 为系统保留字，请更换" })
  }
  if (!tag) throw new HTTPException(400, { message: "家族标签不能为空" })

  const input: FamilyInput = {
    slug,
    tag,
    domain: str(body.domain),
    visibility: asVisibility(body.visibility),
    accessPasswordHash: "",
    isPrimary: Boolean(body.isPrimary),
    theme: str(body.theme),
    surname: str(body.surname),
    name: str(body.name),
    hallName: str(body.hallName),
    county: str(body.county),
    originPlace: str(body.originPlace),
    founderName: str(body.founderName),
    foundedYear: str(body.foundedYear),
    intro: str(body.intro),
    motto: str(body.motto),
    rules: str(body.rules),
    preface: str(body.preface),
    generationPoem: str(body.generationPoem),
    generationPoemStart: Number(body.generationPoemStart) || 1,
    branches: Array.isArray(body.branches)
      ? body.branches.filter((item): item is string => typeof item === "string")
      : [],
    branchHeads: parseBranchHeads(body.branchHeads),
    coverImage: safeImageUrl(body.coverImage),
    footerText: str(body.footerText),
    icpNumber: str(body.icpNumber),
    policeNumber: str(body.policeNumber),
    // 外衍展示已改为访客侧偏好，不再接受服务端配置写入（旧字段保留默认值兼容旧库）
    showExtendedLineage: false,
    // 新建族谱默认在前台展示；关闭需由超级管理员显式操作
    isPublished: body.isPublished !== false,
  }
  return input
}

/** 主谱唯一：设置新的主谱时，清除其它族谱的主谱标记 */
async function ensureSinglePrimary(repo: Repo, primaryId: number): Promise<void> {
  const families = await repo.listFamilies()
  await Promise.all(
    families
      .filter((family) => family.id !== primaryId && family.isPrimary)
      .map((family) => repo.updateFamily(family.id, { isPrimary: false }, null)),
  )
}

export function createApp(repo: Repo, secret: string) {
  const app = new Hono<AppEnv>()

  // H9：全站安全响应头（含 Node 生产模式下由 serveStatic 提供的前端资源）
  app.use("*", async (c, next) => {
    for (const [name, value] of securityHeaderEntries(isHttpsRequest(c))) c.header(name, value)
    await next()
  })

  app.use("*", async (c, next) => {
    c.set("repo", repo)
    c.set("secret", secret)

    // H9：同源校验，阻断跨站携带管理员 Cookie 的状态变更请求
    if (["POST", "PUT", "PATCH", "DELETE"].includes(c.req.method)) {
      // 现代浏览器对跨站请求必然带 Sec-Fetch-Site，优先据此拦截；
      // 该头由浏览器设置、客户端脚本无法伪造。缺失时（如回环脚本调用）继续走 Origin 校验。
      const fetchSite = c.req.header("sec-fetch-site")?.trim().toLowerCase()
      if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
        return c.json({ error: "请求来源不被允许" }, 403)
      }
      const origin = c.req.header("origin")
      if (origin) {
        let sameOrigin = false
        try {
          const originHost = new URL(origin).host
          const originHostname = new URL(origin).hostname
          // 只比对可信的 Host 头；X-Forwarded-Host 由客户端可控，绝不能作为同源依据。
          const reqHost = c.req.header("host") ?? ""
          const reqHostname = reqHost.split(":")[0]
          // 归一化：localhost / 127.0.0.1 / ::1 在开发期视为同一主机，
          // 避免 vite 代理（target=localhost:3001，changeOrigin 改写 Host）与前端（127.0.0.1:5173）主机名不一致时误判跨站。
          // 仅归一化回环地址，外部域名仍按原主机名严格比对，不放宽真实跨站防护。
          const norm = (h: string): string => {
            const t = h.toLowerCase().trim()
            return t === "localhost" || t === "127.0.0.1" || t === "::1" || t === "0:0:0:0:0:0:0:1"
              ? "127.0.0.1"
              : t
          }
          const ohn = norm(originHostname)
          const rhn = norm(reqHostname)
          sameOrigin = norm(originHost) === norm(reqHost) || ohn === rhn
        } catch {
          sameOrigin = false
        }
        if (!sameOrigin) return c.json({ error: "请求来源不被允许" }, 403)
      }
    }

    // H4：会话绑定口令指纹 + 登出撤销黑名单；H1：未改密不得访问后台数据；MFA：超管未绑验证器不得访问后台
    let session = await readSessionToken(getCookie(c, SESSION_COOKIE), secret)
    if (session) {
      const admin = await repo.getAdminById(session.uid)
      const revoked = await repo.isSessionRevoked(session.jti)
      const invalidatedAt = await repo.sessionInvalidatedAt(session.uid)
      if (
        !admin ||
        admin.isDisabled ||
        revoked ||
        (invalidatedAt > 0 && (session.iat ?? 0) < invalidatedAt) ||
        session.pwd !== (await passwordFingerprint(admin.passwordHash))
      ) {
        session = null
      } else if (
        admin.mustChangePassword &&
        new URL(c.req.url).pathname.startsWith("/api/admin/")
      ) {
        // 服务端强制，前端跳转仅作体验；仅放行认证相关接口（/api/auth/*）
        return c.json({ error: "请先修改密码后再访问后台" }, 403)
      } else if (
        // 超管强制启用验证器：未绑定前阻断后台数据接口，仅放行绑定相关接口与认证接口
        admin.role === "super" &&
        admin.mfaType !== "totp" &&
        isAdminBlockedWithoutMfa(new URL(c.req.url).pathname)
      ) {
        return c.json({ error: "请先绑定登录验证器后再访问后台" }, 403)
      }
    }
    c.set("session", session)
    await next()
  })

  // H10：全局请求体大小上限（防御超大 JSON 耗尽内存；nginx 另有 client_max_body_size 10m 兜底）。
  // 仅按 Content-Length 预检；无该头的分块请求由 nginx / 各接口既有上限（导入 5MB、头像 5MB）兜底。
  const MAX_BODY_BYTES = 10 * 1024 * 1024
  app.use("*", async (c, next) => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(c.req.method)) {
      const len = Number(c.req.header("content-length") || 0)
      if (len > MAX_BODY_BYTES) return c.json({ error: "请求体过大" }, 413)
    }
    await next()
  })

  // 统一的越权提示文案，避免各接口措辞不一致
  const CROSS_FAMILY_DENIED = "无权限访问或操作其他家族的数据"

  // 登录后返回给前端的账号视图（含 MFA 状态，供前端判断是否进入第二步）
  function userView(admin: AdminUser) {
    return {
      id: admin.id,
      username: admin.username,
      role: admin.role,
      familyId: admin.familyId,
      isDisabled: admin.isDisabled,
      lastLoginAt: admin.lastLoginAt,
      mustChangePassword: admin.mustChangePassword,
      mfaType: admin.mfaType,
    }
  }

  // 绑定验证器前的临时密钥（按会话 uid 暂存，确认后落库并清除）
  const pendingMfaSecrets = new Map<number, string>()
  // MFA 第二步失败计数（按账号 uid）。
  // 旧实现按 preAuthToken 计数：攻击者已知口令后反复登录即可换令牌重置计数，
  // 且 429 时清零，等同无限爆破。改为按账号计数并锁定，成功验证才清零。
  const MFA_MAX_ATTEMPTS = 5
  const MFA_WINDOW_MS = 10 * 60 * 1000
  const MFA_LOCK_MS = 10 * 60 * 1000
  const mfaAttempts = new Map<number, { count: number; firstAt: number; lockedUntil: number }>()
  function mfaAttemptLimited(uid: number): boolean {
    const now = Date.now()
    // 惰性清理过期记录，避免 Map 无限增长
    for (const [key, value] of mfaAttempts) {
      if (value.lockedUntil <= now && now - value.firstAt > MFA_WINDOW_MS) mfaAttempts.delete(key)
    }
    let state = mfaAttempts.get(uid)
    if (!state || (state.lockedUntil <= now && now - state.firstAt > MFA_WINDOW_MS)) {
      state = { count: 0, firstAt: now, lockedUntil: 0 }
    }
    if (state.lockedUntil > now) return true
    state.count += 1
    if (state.count > MFA_MAX_ATTEMPTS) state.lockedUntil = now + MFA_LOCK_MS
    mfaAttempts.set(uid, state)
    return state.lockedUntil > now
  }
  function clearMfaAttempts(uid: number): void {
    mfaAttempts.delete(uid)
  }

  const authGuard: MiddlewareHandler<AppEnv> = async (c, next) => {
    const session = c.get("session")
    if (!session) return c.json({ error: "UNAUTHORIZED" }, 401)
    // 账号被停用或删除后，已签发的 Cookie 不应继续访问后台接口
    const admin = await repo.getAdminById(session.uid)
    if (!admin || admin.isDisabled) return c.json({ error: "UNAUTHORIZED" }, 401)
    await next()
  }

  // ── 角色 → 能力映射（能力型 RBAC，便于后续扩展） ──
  // super：账号治理 + 全量数据维护（族人 / 家族 / 反馈审核处理）+ 安全审计（查看 + 按范围导出审计日志，不可删除）
  // editor：族人 / 反馈内容维护（无账号治理、无审计权限）
  // 审计日志导出按范围划分独立能力：全部 / 年份 / 年月 各有独立权限，仅持对应能力方可导出该范围
  const ROLE_CAPS: Record<string, string[]> = {
    super: [
      "manage_admin",
      "audit_log",
      "audit_export_all",
      "audit_export_year",
      "audit_export_month",
      "edit_genealogy",
      "review_feedback",
    ],
    editor: ["edit_genealogy", "review_feedback"],
  }

  // 仅允许持有指定能力之一的管理员通过；UI 隐藏仅作体验，此处为后端强制
  const requireCapability = (caps: string[]): MiddlewareHandler<AppEnv> => async (c, next) => {
    const session = c.get("session")
    if (!session) return c.json({ error: "UNAUTHORIZED" }, 401)
    const admin = await repo.getAdminById(session.uid)
    if (!admin || admin.isDisabled) return c.json({ error: "UNAUTHORIZED" }, 401)
    const allowed = ROLE_CAPS[admin.role] ?? []
    if (!caps.some((cap) => allowed.includes(cap))) {
      throw new HTTPException(403, { message: "无权限执行此操作" })
    }
    await next()
  }

  // 仅超级管理员可通过（家族设置、管理员治理等配置类操作）
  const requireSuper: MiddlewareHandler<AppEnv> = async (c, next) => {
    const session = c.get("session")
    if (!session) return c.json({ error: "UNAUTHORIZED" }, 401)
    const admin = await repo.getAdminById(session.uid)
    if (!admin || admin.isDisabled || admin.role !== "super") {
      // error 字段是前端 ApiError 展示的文案，须给出明确中文提示
      return c.json({ error: "仅超级管理员可执行此操作" }, 403)
    }
    await next()
  }

  // 族级作用域：普通管理员仅能操作本家族数据，越权则拒绝
  function denyIfCrossFamily(admin: AdminUser, familyId: number): void {
    if (admin.role !== "super" && (admin.familyId ?? 0) !== familyId) {
      throw new HTTPException(403, { message: CROSS_FAMILY_DENIED })
    }
  }

  // ── 统一租户隔离中间件（A020）：取代各 handler 手工调用 denyIfCrossFamily ──
  // 路由只需声明「从哪个资源解析 familyId」，中间件统一完成鉴权 + 越权拦截，
  // 彻底消除「新增接口漏写隔离逻辑」的风险；资源同时存入 c.var，handler 直接复用，避免重复查询。
  const requireFamilyScope = (
    resolve: (c: Context<AppEnv>, admin: AdminUser) => number | Promise<number>,
  ): MiddlewareHandler<AppEnv> => async (c, next) => {
    const session = c.get("session")
    if (!session) return c.json({ error: "UNAUTHORIZED" }, 401)
    const admin = await repo.getAdminById(session.uid)
    if (!admin || admin.isDisabled) return c.json({ error: "UNAUTHORIZED" }, 401)
    const familyId = await resolve(c, admin)
    denyIfCrossFamily(admin, familyId)
    await next()
  }

  // 资源解析器：按路径 :id 取资源、校验存在性、回填 c.var，并返回其 familyId
  const resolveFamilyByParam = async (c: Context<AppEnv>): Promise<number> => {
    const id = Number(c.req.param("id"))
    if (!Number.isFinite(id)) throw new HTTPException(400, { message: "家族编号无效" })
    const family = await repo.getFamilyById(id)
    if (!family) throw new HTTPException(404, { message: "家族不存在" })
    c.set("family", family)
    return family.id
  }

  const resolveMemberByParam = async (c: Context<AppEnv>): Promise<number> => {
    const id = Number(c.req.param("id"))
    if (!Number.isFinite(id)) throw new HTTPException(400, { message: "成员编号无效" })
    const member = await repo.getMember(id)
    if (!member) throw new HTTPException(404, { message: "成员不存在" })
    c.set("member", member)
    return member.familyId
  }

  const resolveSubmissionByParam = async (c: Context<AppEnv>): Promise<number> => {
    const id = Number(c.req.param("id"))
    if (!Number.isFinite(id)) throw new HTTPException(400, { message: "编号无效" })
    const submission = await repo.getSubmission(id)
    if (!submission) throw new HTTPException(404, { message: "反馈不存在" })
    c.set("submission", submission)
    return submission.familyId
  }

  // 创建成员：familyId 来自请求体，需与「家族不存在即 400」的既有行为保持一致——
  // 仅当该 familyId 对应真实家族时才做跨族校验，缺失/非法交由 handler 的 getFamilyById 返回 400。
  const resolveFamilyFromBody = async (c: Context<AppEnv>, admin: AdminUser): Promise<number> => {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
    const fid = Number(body.familyId)
    if (Number.isFinite(fid) && fid > 0) {
      const family = await repo.getFamilyById(fid)
      if (family) denyIfCrossFamily(admin, fid)
    }
    return fid
  }

  // ── 按路径解析租户：/api/t/:slug/* ──
  app.use("/api/t/:slug/*", async (c, next) => {
    const slug = (c.req.param("slug") ?? "").toLowerCase()
    const family = await repo.getFamilyBySlug(slug)
    if (!family) throw new HTTPException(404, { message: "族谱不存在" })
    // 未开启前台展示的族谱：整部从前台隐藏（门户不列出、地址访问按不存在处理），
    // 后台仍可正常管理。与「私密」不同，此处不区分是否登录，避免前台出现任何入口。
    if (!family.isPublished) throw new HTTPException(404, { message: "族谱不存在" })
    // 私密族谱向外完全隐藏：非本族管理员一律按「不存在」处理，避免探测。
    // 作用域校验放在租户中间件，覆盖所有 /api/t/:slug/* 路由（含未调用 requireTenantAccess 的）。
    if (family.visibility === "private") {
      const session = c.get("session")
      const admin = session ? await repo.getAdminById(session.uid) : null
      if (!canReadPrivateFamily(admin, family)) {
        throw new HTTPException(404, { message: "族谱不存在" })
      }
    }
    c.set("family", family)
    await next()
  })

  async function requireTenantAccess(c: {
    get: (key: "session" | "secret") => unknown
    req: unknown
  }): Promise<void> {
    const family = (c as unknown as { get: (key: "family") => Family }).get("family")
    const session = (c as unknown as { get: (key: "session") => SessionPayload | null }).get("session")

    if (family.visibility === "public") return

    if (family.visibility === "private") {
      // 私密族谱不设口令，仅本族管理员或超级管理员可阅。
      // 租户中间件已按同一规则拦截，此处保留为纵深校验，避免新增路由漏挂中间件。
      const admin = session ? await repo.getAdminById(session.uid) : null
      if (canReadPrivateFamily(admin, family)) return
      throw new HTTPException(404, { message: "族谱不存在" })
    }

    // 未设置访问密码时，门禁无从校验，按公开处理，避免永久锁死族谱
    if (!family.accessPasswordHash) return

    // 浏览器端走 Cookie；小程序（wx.request）不自动管理 Cookie，回退读 Authorization: Bearer。
    // 两条通道解出的是同一种 tenant 令牌，口令指纹校验一视同仁。
    let token = getCookie(
      c as unknown as Parameters<typeof getCookie>[0],
      tenantCookieName(family.slug),
    )
    if (!token) {
      const raw =
        (c.req as { header?: (name: string) => string | undefined }).header?.("Authorization") ?? ""
      const matched = /^Bearer\s+(\S+)$/i.exec(raw.trim())
      token = matched ? matched[1] : undefined
    }
    const payload = await readTenantToken(token, secret)
    // 管理员登录不等于持有族谱口令：口令校验对所有人一视同仁，
    // 并以口令指纹兜底，确保改密后旧凭证立即失效。
    if (
      !payload ||
      payload.fid !== family.id ||
      payload.pwd !== (await passwordFingerprint(family.accessPasswordHash))
    ) {
      throw new HTTPException(401, { message: "TENANT_LOCKED" })
    }
  }

  /**
   * 公开端点族人字段裁剪：在世者只留姓名、世次、房支等身份信息，
   * 隐去生年、卒年、生平、葬地与头像。裁剪必须在服务端完成——下发全量再由客户端隐藏，
   * 抓包即可还原，等于没做。网页端世系图与小程序脱敏口径保持一致。
   */
  function maskLivingMember(member: Member): Member {
    if (!member.isAlive) return member
    return {
      ...member,
      birthYear: "",
      deathYear: "",
      bio: "",
      burialPlace: "",
      avatarKey: "",
    }
  }

  // ── 健康检查 ──
  app.get("/api/health", (c) => c.json({ ok: true }))

  // ── 访客溯源：仅返回脱敏 IP 用于水印，不下发完整地址、不存储 ──
  app.get("/api/visitor/ip", (c) => {
    let ip = clientIp(c)
    if (ip.startsWith("::ffff:")) ip = ip.slice(7)
    if (ip === "unknown") return c.json({ ip: "" })
    // H8：IPv4 保留前两段、IPv6 保留前两段，其余以通配替代
    const masked = ip.includes(".")
      ? `${ip.split(".").slice(0, 2).join(".")}.*.*`
      : `${ip.split(":").slice(0, 2).join(":")}:*`
    return c.json({ ip: masked })
  })

  // ── 门户：公开族谱列表（未开启前台展示的一律不列出；私密族谱仅本族管理员/超管可见） ──
  app.get("/api/public/families", async (c) => {
    const session = c.get("session")
    const admin = session ? await repo.getAdminById(session.uid) : null
    const families = (await repo.listFamilies()).filter(
      (family) =>
        family.isPublished &&
        (family.visibility !== "private" || canReadPrivateFamily(admin, family)),
    )
    const list = await Promise.all(
      families.map(async (family) => ({
        ...publicFamily(family),
        memberCount: await repo.countMembers(family.id),
        generationCount: await repo.countGenerations(family.id),
      })),
    )
    return c.json({ families: list })
  })

  // ── 门户：主谱备案号（页脚展示，公开、无需鉴权） ──
  // 供全局页脚（条款 / 隐私 / 信息反馈 / 门户）在每次加载时读取，
  // 后台（系统 · 网站设置）更新备案号后，前台任意页面重新加载即自动同步，无需重新部署。
  app.get("/api/public/filing", async (c) => {
    const family = await repo.getPrimaryFamily()
    return c.json({
      icpNumber: family?.icpNumber ?? "",
      policeNumber: family?.policeNumber ?? "",
    })
  })

  // 平台级全局配置：当前网站名称（供前端初始化标签页标题 / 水印 / 页脚品牌）。
  // 后台（超级管理员）修改后，前台任意页面重新加载即自动同步，无需重新部署。
  app.get("/api/public/site-config", async (c) => {
    const siteName = (await repo.getSetting("siteName")) || "时光家谱"
    const feedbackEnabled = (await repo.getSetting("feedbackEnabled")) === "1"
    const faviconDataUrl = (await repo.getSetting("favicon")) || ""
    const analyticsRaw = await repo.getSetting("analytics")
    let analytics: AnalyticsProvider[] = []
    if (analyticsRaw) {
      try {
        const parsed = JSON.parse(analyticsRaw)
        if (Array.isArray(parsed)) analytics = parsed as AnalyticsProvider[]
      } catch {
        analytics = []
      }
    }
    return c.json({ siteName, feedbackEnabled, faviconDataUrl, analytics })
  })

  // 超级管理员修改网站名称（平台级全局配置，修改后全站同步）。
  app.put("/api/admin/site-config", requireSuper, async (c) => {
    const session = c.get("session")!
    const admin = (await repo.getAdminById(session.uid))!
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
    const siteName = str(body.siteName).trim().slice(0, 40)
    if (!siteName) {
      throw new HTTPException(400, { message: "网站名称不能为空" })
    }
    await repo.setSetting("siteName", siteName)
    if (typeof body.feedbackEnabled === "boolean") {
      await repo.setSetting("feedbackEnabled", body.feedbackEnabled ? "1" : "0")
    }
    // 站点图标：以 data URL 形式持久化于 system_setting；传空串即清除，恢复默认。
    const faviconRaw = body.faviconDataUrl
    if (typeof faviconRaw === "string") {
      const favicon = faviconRaw.trim()
      if (!favicon) {
        await repo.setSetting("favicon", "")
      } else {
        const match =
          /^data:(image\/(png|jpeg|webp|x-icon|vnd\.microsoft\.icon|svg\+xml));base64,(.+)$/i.exec(favicon)
        if (!match) {
          throw new HTTPException(400, { message: "图标需为 PNG/JPEG/WebP/ICO/SVG 的 data URL" })
        }
        const bytes = Math.ceil((match[2].length * 3) / 4)
        if (bytes > 256 * 1024) {
          throw new HTTPException(400, { message: "图标体积过大（上限 256KB）" })
        }
        await repo.setSetting("favicon", favicon.slice(0, 300 * 1024))
      }
    }
    // 统计接入：仅当请求携带 analytics 才更新（其余保存动作不覆盖已有配置）。
    let analytics: AnalyticsProvider[] = []
    if (Array.isArray(body.analytics)) {
      const parsed = parseAnalyticsConfig(body.analytics)
      if (!parsed) throw new HTTPException(400, { message: "统计配置格式不正确" })
      analytics = parsed
      await repo.setSetting("analytics", JSON.stringify(parsed))
      await repo.appendAuditLog({
        actorId: session.uid,
        actorName: session.username,
        actorRole: admin.role,
        action: "ANALYTICS_UPDATE",
        targetType: "site",
        targetId: "analytics",
        detail: JSON.stringify({ count: parsed.length }),
      })
    } else {
      const existing = await repo.getSetting("analytics")
      if (existing) {
        try {
          const parsed = JSON.parse(existing)
          if (Array.isArray(parsed)) analytics = parsed as AnalyticsProvider[]
        } catch {
          analytics = []
        }
      }
    }
    const feedbackEnabled = (await repo.getSetting("feedbackEnabled")) === "1"
    const faviconDataUrl = (await repo.getSetting("favicon")) || ""
    return c.json({ siteName, feedbackEnabled, faviconDataUrl, analytics })
  })

  // ── 证书域名：超级管理员后台绑定 / 续期 / 删除（自动 TLS 前置） ──
  app.get("/api/admin/domains", requireSuper, async (c) => {
    const domains = await repo.listDomains()
    return c.json({ domains })
  })

  app.post("/api/admin/domains", requireSuper, async (c) => {
    const session = c.get("session")!
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
    const domain = str(body.domain).trim().toLowerCase()
    if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(domain)) {
      throw new HTTPException(400, { message: "域名格式不正确" })
    }
    let id: number
    try {
      id = await repo.createDomain(domain, session.uid)
    } catch {
      throw new HTTPException(409, { message: "该域名已存在" })
    }
    await repo.appendAuditLog({
      actorId: session.uid,
      actorName: session.username,
      actorRole: (await repo.getAdminById(session.uid))?.role ?? "super",
      action: "DOMAIN_BIND",
      targetType: "domain",
      targetId: String(id),
      detail: domain,
    })
    return c.json({ id }, 201)
  })

  app.post("/api/admin/domains/:id/renew", requireSuper, async (c) => {
    const session = c.get("session")!
    const id = Number(c.req.param("id"))
    if (!Number.isFinite(id)) throw new HTTPException(400, { message: "编号无效" })
    await repo.updateDomainStatus(id, "pending", {})
    await repo.appendAuditLog({
      actorId: session.uid,
      actorName: session.username,
      actorRole: (await repo.getAdminById(session.uid))?.role ?? "super",
      action: "DOMAIN_RENEW",
      targetType: "domain",
      targetId: String(id),
      detail: "",
    })
    return c.json({ ok: true })
  })

  app.delete("/api/admin/domains/:id", requireSuper, async (c) => {
    const session = c.get("session")!
    const id = Number(c.req.param("id"))
    if (!Number.isFinite(id)) throw new HTTPException(400, { message: "编号无效" })
    await repo.deleteDomain(id)
    await repo.appendAuditLog({
      actorId: session.uid,
      actorName: session.username,
      actorRole: (await repo.getAdminById(session.uid))?.role ?? "super",
      action: "DOMAIN_DELETE",
      targetType: "domain",
      targetId: String(id),
      detail: "",
    })
    return c.json({ ok: true })
  })

  // ── 内部接口：宿主机 cert-manager 轮询 / 回写状态（共享令牌，不对外暴露） ──
  const requireInternal: MiddlewareHandler<AppEnv> = async (c, next) => {
    const expected = readEnv("INTERNAL_API_TOKEN")
    if (!expected) return c.json({ error: "FORBIDDEN" }, 403)
    // M-3：令牌仅经 Authorization: Bearer 头传递，禁止放入 URL（避免落访问日志 / Referer / 浏览器历史）。
    // 恒定时间比较，避免计时侧信道。
    const auth = c.req.header("Authorization") || ""
    const token = auth.replace(/^Bearer\s+/i, "")
    const a = new TextEncoder().encode(token)
    const b = new TextEncoder().encode(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return c.json({ error: "FORBIDDEN" }, 403)
    }
    await next()
  }

  app.get("/api/internal/domains/due", requireInternal, async (c) => {
    const domains = await repo.listDomains()
    const now = Date.now()
    const due = domains.filter((d) => {
      if (d.status === "pending" || d.status === "issuing") return true
      if (d.status === "active" && d.expiryDate) {
        const exp = new Date(d.expiryDate).getTime()
        return !Number.isNaN(exp) && exp - now < 30 * 86400000
      }
      return false
    })
    return c.json({ domains: due })
  })

  app.post("/api/internal/domains/:id/status", requireInternal, async (c) => {
    const id = Number(c.req.param("id"))
    if (!Number.isFinite(id)) throw new HTTPException(400, { message: "编号无效" })
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
    const status = str(body.status)
    const allowed = ["pending", "issuing", "active", "failed", "renewing"]
    if (!allowed.includes(status)) throw new HTTPException(400, { message: "无效状态" })
    await repo.updateDomainStatus(id, status, {
      expiry: str(body.expiryDate),
      certPath: str(body.certPath),
      error: str(body.lastError),
    })
    return c.json({ ok: true })
  })

  // ── 租户公开信息 ──
  app.get("/api/t/:slug/family", (c) => {
    return c.json({ family: publicFamily(c.get("family")) })
  })

  app.get("/api/t/:slug/stats", async (c) => {
    await requireTenantAccess(c as never) // A019：受保护族谱的聚合统计须凭访问密码 / 管理员身份
    const family = c.get("family")
    const members = await repo.listMembers(family.id)
    return c.json(computeStats(members, family.updatedAt))
  })

  // ── 世系图数据：需该族谱访问密码（管理员直通） ──
  app.get("/api/t/:slug/members", async (c) => {
    await requireTenantAccess(c as never)
    const family = c.get("family")
    const members = await repo.listMembers(family.id)
    // 在世成员脱敏（与小程序一致）：网页端世系图同样只暴露在世者的姓名/世次/房支等，
    // 不泄露生年、生平、葬地与头像，避免公开谱泄露在世族人敏感个人信息。
    return c.json({ members: members.map(maskLivingMember) })
  })

  // ── 亲属信息反馈（公开提交，后台审核；含限流） ──
  app.post("/api/t/:slug/feedback", async (c) => {
    if (feedbackLimited(clientIp(c))) {
      throw new HTTPException(429, { message: "提交过于频繁，请稍后再试" })
    }
    if ((await repo.getSetting("feedbackEnabled")) !== "1") {
      throw new HTTPException(403, { message: "反馈通道未开启" })
    }
    const family = c.get("family")
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
    const reporterName = str(body.reporterName)
    const message = str(body.message)
    const payloadRaw = body.payload
    if (!reporterName) throw new HTTPException(400, { message: "请填写反馈人姓名" })
    if (reporterName.length > 50) throw new HTTPException(400, { message: "反馈人姓名过长" })
    if (!message && !(payloadRaw && typeof payloadRaw === "object")) {
      throw new HTTPException(400, { message: "请填写反馈信息或族人资料" })
    }
    if (message.length > 2000) throw new HTTPException(400, { message: "反馈信息过长" })
    let payload = "{}"
    try {
      payload = JSON.stringify(payloadRaw ?? {})
    } catch {
      payload = "{}"
    }
    if (payload.length > 20000) throw new HTTPException(400, { message: "提交的资料过大" })
    const id = await repo.createSubmission({
      familyId: family.id,
      reporterName,
      message,
      payload,
      status: "pending",
      familyLabel: "",
    })
    return c.json({ id }, 201)
  })

  // ── 反馈：首页直达入口（无族内上下文，需自选家族；可选「其他家族」） ──
  app.post("/api/feedback", async (c) => {
    if (feedbackLimited(clientIp(c))) {
      throw new HTTPException(429, { message: "提交过于频繁，请稍后再试" })
    }
    if ((await repo.getSetting("feedbackEnabled")) !== "1") {
      throw new HTTPException(403, { message: "反馈通道未开启" })
    }
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
    const reporterName = str(body.reporterName)
    const message = str(body.message)
    const payloadRaw = body.payload
    if (!reporterName) throw new HTTPException(400, { message: "请填写反馈人姓名" })
    if (reporterName.length > 50) throw new HTTPException(400, { message: "反馈人姓名过长" })
    if (!message && !(payloadRaw && typeof payloadRaw === "object")) {
      throw new HTTPException(400, { message: "请填写反馈信息或族人资料" })
    }
    if (message.length > 2000) throw new HTTPException(400, { message: "反馈信息过长" })
    let payload = "{}"
    try {
      payload = JSON.stringify(payloadRaw ?? {})
    } catch {
      payload = "{}"
    }
    if (payload.length > 20000) throw new HTTPException(400, { message: "提交的资料过大" })

    // 家族归属：优先按 slug 归族；无匹配（「其他家族」）则 familyId 置空，由超级管理员分配
    const slug = str(body.familySlug).toLowerCase()
    let familyId = 0
    let familyLabel = str(body.familyLabel).slice(0, 40)
    if (slug) {
      const family = await repo.getFamilyBySlug(slug)
      if (!family) throw new HTTPException(400, { message: "所选家族不存在" })
      familyId = family.id
      familyLabel = family.tag
    } else if (!familyLabel) {
      familyLabel = "其他家族"
    }

    const id = await repo.createSubmission({
      familyId,
      reporterName,
      message,
      payload,
      status: "pending",
      familyLabel,
    })
    return c.json({ id }, 201)
  })

  // ── 校验族谱访问密码（含失败限流） ──
  app.post("/api/t/:slug/access", async (c) => {
    const family = c.get("family")
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
    const password = str(body.password)
    if (!password) throw new HTTPException(400, { message: "请输入访问密码" })

    const key = `${family.slug}:${clientIp(c)}`
    const locked = lockRemaining(key)
    if (locked > 0) {
      throw new HTTPException(429, {
        message: `尝试过于频繁，请 ${Math.ceil(locked / 60000)} 分钟后再试`,
      })
    }

    const ok = Boolean(family.accessPasswordHash) && (await verifyPassword(password, family.accessPasswordHash))
    if (!ok) {
      const lockedFor = recordFailure(key)
      if (lockedFor > 0) {
        throw new HTTPException(429, {
          message: `密码错误次数过多，请 ${Math.ceil(lockedFor / 60000)} 分钟后再试`,
        })
      }
      throw new HTTPException(401, { message: "访问密码不正确" })
    }

    recordSuccess(key)
    // 小程序渠道：Cookie 对 wx.request 无用，改为 JSON 下发令牌并延长至 7 天。
    // 网页端维持 Cookie + 1 天，且不回传令牌，避免多一条可被脚本读取的出口。
    const isMiniProgram = str(body.channel) === "mp"
    const ttlMs = isMiniProgram ? TENANT_TTL_MP_MS : TENANT_TTL_MS
    const { token, maxAge, expiresAt } = await createTenantToken(family, secret, ttlMs)
    setCookie(c, tenantCookieName(family.slug), token, {
      httpOnly: true,
      sameSite: "Lax",
      secure: isHttpsRequest(c),
      path: "/",
      maxAge,
    })
    if (isMiniProgram) return c.json({ ok: true, token, expiresAt })
    return c.json({ ok: true })
  })

  // ── 鉴权 ──
  app.post("/api/auth/login", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
    const username = str(body.username)
    const password = str(body.password)
    if (!username || !password) {
      throw new HTTPException(400, { message: "请输入账号与密码" })
    }

    // H1：登录失败限流，按「账号 + 来源」双键，阻断在线口令爆破
    const loginKey = `login:${username.toLowerCase()}:${clientIp(c)}`
    const locked = lockRemaining(loginKey)
    if (locked > 0) {
      throw new HTTPException(429, {
        message: `尝试过于频繁，请 ${Math.ceil(locked / 60000)} 分钟后再试`,
      })
    }

    const admin = await repo.getAdminByUsername(username)
    // A026：不存在/停用的账号也走一次常量 PBKDF2，使响应耗时与正常账号一致，缓解时序侧信道
    const candidateHash = admin?.passwordHash ?? DUMMY_HASH
    // H5：停用账号不得重新登录；失败提示保持统一，不泄露账号状态
    if (!admin || admin.isDisabled || !(await verifyPassword(password, candidateHash))) {
      const lockedFor = recordFailure(loginKey)
      // A016：登录失败审计（未知账号 actorId 记 null，避免外键冲突）
      await repo.appendAuditLog({
        actorId: admin?.id ?? null,
        actorName: username,
        actorRole: admin?.role ?? "unknown",
        action: "LOGIN_FAIL",
        targetType: "admin",
        targetId: String(admin?.id ?? ""),
        detail: "",
      })
      if (lockedFor > 0) {
        throw new HTTPException(429, {
          message: `密码错误次数过多，请 ${Math.ceil(lockedFor / 60000)} 分钟后再试`,
        })
      }
      throw new HTTPException(401, { message: "账号或密码有误" })
    }
    recordSuccess(loginKey)
    // A016：登录成功审计（覆盖首登改密 / MFA / 正式会话三种成功路径）
    await repo.appendAuditLog({
      actorId: admin.id,
      actorName: admin.username,
      actorRole: admin.role,
      action: "LOGIN_OK",
      targetType: "admin",
      targetId: String(admin.id),
      detail: "",
    })

    // 首登强制改密优先：先改密，再谈 MFA（前端据此跳转改密页）
    if (admin.mustChangePassword) {
      // 必须下发会话：/api/auth/password 受 authGuard 保护，且 /api/auth/me 需要据此识别用户，
      // 否则改密请求返回 UNAUTHORIZED、前端被弹回登录页，强制改密链路无法完成。
      // 中间件仅放行 /api/auth/*，后台数据接口 /api/admin/* 在改密前仍一律 403。
      const { token, maxAge } = await createSessionToken(
        { id: admin.id, username: admin.username },
        secret,
        admin.passwordHash,
      )
      setCookie(c, SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: "Lax",
        secure: isHttpsRequest(c),
        path: "/",
        maxAge,
      })
      await repo.touchAdminLogin(admin.id)
      return c.json({ user: userView(admin) })
    }

    // 已启用验证器：不发正式会话，改用短期预授权令牌，前端进入第二步
    if (admin.mfaType === "totp") {
      const preAuthToken = await createPreAuthToken(admin.id, admin.username, secret)
      await repo.touchAdminLogin(admin.id)
      return c.json({
        mfaRequired: true,
        mfaType: "totp",
        preAuthToken,
        user: userView(admin),
      })
    }

    const { token, maxAge } = await createSessionToken(
      { id: admin.id, username: admin.username },
      secret,
      admin.passwordHash,
    )
    setCookie(c, SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "Lax",
      secure: isHttpsRequest(c),
      path: "/",
      maxAge,
    })
    await repo.touchAdminLogin(admin.id)
    return c.json({ user: userView(admin) })
  })

  app.post("/api/auth/logout", async (c) => {
    const session = c.get("session")
    // H4：服务端撤销当前会话，已泄露的旧 Cookie 在登出后立即失效
    if (session) await repo.revokeSession(session.jti, session.exp)
    const isHttps = isHttpsRequest(c)
    deleteCookie(c, SESSION_COOKIE, { path: "/", secure: isHttps })
    // A028：清除本族谱的租户访问 Cookie（fg_t_<slug>），避免登出后仍以旧凭证查看族谱
    const families = await repo.listFamilies()
    for (const family of families) {
      deleteCookie(c, tenantCookieName(family.slug), { path: "/", secure: isHttps })
    }
    return c.json({ ok: true })
  })

  app.post("/api/auth/logout-all", authGuard, async (c) => {
    const session = c.get("session")!
    // M-9：使该账号所有会话（含其它设备）立即失效；旧会话的 iat 早于失效时间，被会话中间件拒绝。
    await repo.revokeAllSessions(session.uid)
    // 同时吊销当前 jti，避免竞态下本会话仍短暂可用
    await repo.revokeSession(session.jti, session.exp)
    const isHttps = isHttpsRequest(c)
    deleteCookie(c, SESSION_COOKIE, { path: "/", secure: isHttps })
    const families = await repo.listFamilies()
    for (const family of families) {
      deleteCookie(c, tenantCookieName(family.slug), { path: "/", secure: isHttps })
    }
    return c.json({ ok: true })
  })

  app.get("/api/auth/me", async (c) => {
    const session = c.get("session")
    if (!session) return c.json({ user: null })
    const admin = await repo.getAdminById(session.uid)
    // fail-closed：账号被删除或停用后立即失效，不再默认回退为超级管理员
    if (!admin || admin.isDisabled) return c.json({ user: null })
    return c.json({ user: userView(admin) })
  })

  app.post("/api/auth/password", authGuard, async (c) => {
    const session = c.get("session")!
    // M-2：改密接口按账号限流，防止会话令牌泄露/共享设备后被暴力破解当前口令
    const pwdKey = `pwd-change:${session.uid}`
    const remaining = lockRemaining(pwdKey)
    if (remaining > 0) {
      throw new HTTPException(429, {
        message: `当前密码尝试过于频繁，请 ${Math.ceil(remaining / 60000)} 分钟后再试`,
      })
    }
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
    const current = str(body.currentPassword)
    const next = str(body.newPassword)

    const admin = await repo.getAdminByUsername(session.username)
    if (!admin || !(await verifyPassword(current, admin.passwordHash))) {
      recordFailure(pwdKey)
      throw new HTTPException(400, { message: "当前密码不正确" })
    }
    // H1：新密码复杂度校验
    const invalid = validateNewPassword(next, current, admin.username)
    if (invalid) throw new HTTPException(400, { message: invalid })

    await repo.updateAdminPassword(admin.id, await hashPassword(next))
    recordSuccess(pwdKey)
    await repo.setMustChangePassword(admin.id, false)
    // 改密后当前会话立即作废：口令指纹已变化，同时加入撤销黑名单
    await repo.revokeSession(session.jti, session.exp)
    await repo.appendAuditLog({
      actorId: admin.id,
      actorName: admin.username,
      actorRole: admin.role,
      action: "PASSWORD_CHANGE",
      targetType: "admin",
      targetId: String(admin.id),
      detail: "",
    })
    return c.json({ ok: true })
  })

  // ── 登录二次验证（验证器 / TOTP） ──
  // 第二步：凭预授权令牌 + 动态码换取正式会话（不要求已登录）
  app.post("/api/auth/mfa/verify", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
    const preAuthToken = str(body.preAuthToken)
    const code = str(body.code)
    const preAuth = await readPreAuthToken(preAuthToken || undefined, secret)
    if (!preAuth) throw new HTTPException(401, { message: "登录状态已失效，请重新登录" })
    const admin = await repo.getAdminById(preAuth.uid)
    if (!admin || admin.isDisabled || admin.mfaType !== "totp") {
      throw new HTTPException(401, { message: "登录状态已失效，请重新登录" })
    }
    if (mfaAttemptLimited(preAuth.uid)) {
      throw new HTTPException(429, { message: "验证失败次数过多，请重新登录" })
    }
    const ok = await verifyTotp(await decryptSecret(admin.mfaSecret, secret), code)
    if (!ok) {
      await repo.appendAuditLog({
        actorId: admin.id,
        actorName: admin.username,
        actorRole: admin.role,
        action: "MFA_VERIFY_FAIL",
        targetType: "admin",
        targetId: String(admin.id),
        detail: "",
      })
      throw new HTTPException(400, { message: "动态码不正确" })
    }
    clearMfaAttempts(preAuth.uid)
    const { token, maxAge } = await createSessionToken(
      { id: admin.id, username: admin.username },
      secret,
      admin.passwordHash,
    )
    setCookie(c, SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "Lax",
      secure: isHttpsRequest(c),
      path: "/",
      maxAge,
    })
    await repo.appendAuditLog({
      actorId: admin.id,
      actorName: admin.username,
      actorRole: admin.role,
      action: "MFA_VERIFY_OK",
      targetType: "admin",
      targetId: String(admin.id),
      detail: "",
    })
    return c.json({ user: userView(admin) })
  })

  // 获取绑定配置：生成临时 TOTP 密钥与 otpauth URI（确认前不落库）
  app.get("/api/admin/mfa/setup", authGuard, async (c) => {
    const session = c.get("session")!
    const admin = (await repo.getAdminById(session.uid))!
    const secret = generateTotpSecret()
    pendingMfaSecrets.set(admin.id, secret)
    return c.json({
      secret,
      otpauthUri: buildOtpauthUri(secret, admin.username, "族谱管理"),
    })
  })

  // 确认绑定：校验动态码后写入加密密钥并启用
  app.post("/api/admin/mfa/confirm", authGuard, async (c) => {
    const session = c.get("session")!
    const admin = (await repo.getAdminById(session.uid))!
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
    const code = str(body.code)
    const pending = pendingMfaSecrets.get(admin.id)
    if (!pending) throw new HTTPException(400, { message: "请先获取配置再确认" })
    if (!(await verifyTotp(pending, code))) {
      throw new HTTPException(400, { message: "动态码不正确，请确认设备时间同步后重试" })
    }
    const encrypted = await encryptSecret(pending, secret)
    await repo.enableMfa(admin.id, encrypted)
    pendingMfaSecrets.delete(admin.id)
    await repo.appendAuditLog({
      actorId: admin.id,
      actorName: admin.username,
      actorRole: admin.role,
      action: "MFA_BIND",
      targetType: "admin",
      targetId: String(admin.id),
      detail: JSON.stringify({ username: admin.username }),
    })
    return c.json({ ok: true, mfaType: "totp" as const })
  })

  // 关闭验证器（仅编辑员；超级管理员强制启用，禁止关闭）
  app.post("/api/admin/mfa/disable", authGuard, async (c) => {
    const session = c.get("session")!
    const admin = (await repo.getAdminById(session.uid))!
    if (admin.role === "super") {
      throw new HTTPException(403, { message: "超级管理员必须启用登录验证器，不可关闭" })
    }
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
    const code = str(body.code)
    const password = str(body.password)
    let allowed = false
    if (code && admin.mfaType === "totp") {
      allowed = await verifyTotp(await decryptSecret(admin.mfaSecret, secret), code)
    }
    if (!allowed && password) {
      allowed = await verifyPassword(password, admin.passwordHash)
    }
    if (!allowed) throw new HTTPException(400, { message: "密码或动态码验证失败" })
    await repo.disableMfa(admin.id)
    await repo.appendAuditLog({
      actorId: admin.id,
      actorName: admin.username,
      actorRole: admin.role,
      action: "MFA_UNBIND",
      targetType: "admin",
      targetId: String(admin.id),
      detail: JSON.stringify({ username: admin.username }),
    })
    return c.json({ ok: true, mfaType: "none" as const })
  })

  // 超级管理员重置某编辑员的验证器（编辑员丢失设备时的兜底，超管不可被重置）
  app.post("/api/admin/admins/:id/reset-mfa", requireSuper, async (c) => {
    const session = c.get("session")!
    const id = Number(c.req.param("id"))
    if (!Number.isFinite(id)) throw new HTTPException(400, { message: "编号无效" })
    const target = await repo.getAdminById(id)
    if (!target) throw new HTTPException(404, { message: "管理员不存在" })
    if (target.role === "super") {
      throw new HTTPException(400, { message: "不可重置超级管理员的验证器" })
    }
    await repo.disableMfa(id)
    await repo.appendAuditLog({
      actorId: session.uid,
      actorName: session.username,
      actorRole: (await repo.getAdminById(session.uid))?.role ?? "super",
      action: "MFA_RESET",
      targetType: "admin",
      targetId: String(id),
      detail: JSON.stringify({ username: target.username }),
    })
    return c.json({ ok: true })
  })

  // ── 后台：家族（租户）管理 ──
  app.get("/api/admin/families", authGuard, async (c) => {
    const session = c.get("session")!
    const admin = (await repo.getAdminById(session.uid))!
    let families = await repo.listFamilies()
    if (admin.role !== "super") {
      families = families.filter((f) => f.id === (admin.familyId ?? 0))
    }
    const list = await Promise.all(
      families.map(async (family) => ({
        ...adminFamily(family),
        memberCount: await repo.countMembers(family.id),
      })),
    )
    return c.json({ families: list })
  })

  // 创建族谱 = 配置类操作，仅超级管理员
  app.post("/api/admin/families", requireSuper, async (c) => {
    const session = c.get("session")!
    const admin = (await repo.getAdminById(session.uid))!
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
    const input = baseFamilyInput(body)

    if (await repo.getFamilyBySlug(input.slug)) {
      throw new HTTPException(400, { message: "该 slug 已被占用" })
    }
    const existing = await repo.listFamilies()
    if (existing.some((family) => family.tag === input.tag)) {
      throw new HTTPException(400, { message: "该家族标签已存在" })
    }

    // 访问口令一律由后台自动生成（不支持手动设置）；仅「密码访问」模式需要口令，
    // 生成后哈希落库、明文仅当次返回给超管分发，杜绝自设弱口令被在线爆破。
    let accessPassword: string | null = null
    if (input.visibility === "password") {
      accessPassword = generateAccessPassword()
      input.accessPasswordHash = await hashPassword(accessPassword)
    }
    if (existing.length === 0) input.isPrimary = true

    const id = await repo.createFamily(input, session.uid)
    if (input.isPrimary) await ensureSinglePrimary(repo, id)
    await repo.appendAuditLog({
      actorId: session.uid,
      actorName: session.username,
      actorRole: admin.role,
      action: "FAMILY_CREATE",
      targetType: "family",
      targetId: String(id),
      detail: JSON.stringify({ slug: input.slug, tag: input.tag, visibility: input.visibility }),
    })
    return c.json({ id, ...(accessPassword ? { accessPassword } : {}) }, 201)
  })

  // 家族写入：超级管理员（可改标识/访问/房支等配置）或具备族人维护能力者（仅可改正文）均可通过
  const familyWriteGuard: MiddlewareHandler<AppEnv> = async (c, next) => {
    const session = c.get("session")
    if (!session) return c.json({ error: "UNAUTHORIZED" }, 401)
    const admin = await repo.getAdminById(session.uid)
    if (!admin || admin.isDisabled) return c.json({ error: "UNAUTHORIZED" }, 401)
    const caps = ROLE_CAPS[admin.role] ?? []
    if (admin.role !== "super" && !caps.includes("edit_genealogy")) {
      return c.json({ error: "无权限执行此操作" }, 403)
    }
    await next()
  }

  app.put("/api/admin/families/:id", familyWriteGuard, requireFamilyScope(resolveFamilyByParam), async (c) => {
    const session = c.get("session")!
    const admin = (await repo.getAdminById(session.uid))!
    const id = Number(c.req.param("id"))
    if (!Number.isFinite(id)) throw new HTTPException(400, { message: "家族编号无效" })

    const current = c.get("family")!

    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
    // 前台展示 / 主谱 / 派系房支 / 备案号：仅超级管理员可修改。
    // 普通管理员每次保存都会带全量字段，因此仅拦截「被改动」的敏感字段，
    // 未改动的敏感字段随正文一起提交也不会被拒绝（保证普通管理员可正常保存正文）。
    if (admin.role !== "super") {
      const changedSensitive = SENSITIVE_FAMILY_KEYS.filter(
        (key) => key in body && !isFamilyFieldUnchanged(key, body[key], current),
      )
      if (changedSensitive.length > 0) {
        throw new HTTPException(403, {
          message: "前台展示、主谱与派系房支仅超级管理员可修改",
        })
      }
    }

    const patch: Record<string, unknown> = {}
    // 访问口令自动生成：仅当最终访问方式为「密码访问」且当前无口令时，由后台随机生成。
    // 明文当次返回给超管分发（不落审计、不支持手动设置），杜绝自设弱口令被在线爆破。
    let generatedAccessPassword: string | null = null

    if ("slug" in body) {
      const slug = str(body.slug).toLowerCase()
      if (!SLUG_PATTERN.test(slug)) {
        throw new HTTPException(400, { message: "slug 需为 2–32 位小写字母、数字或连字符" })
      }
      if (RESERVED_SLUGS.has(slug)) {
        throw new HTTPException(400, { message: "该 slug 为系统保留字，请更换" })
      }
      const other = await repo.getFamilyBySlug(slug)
      if (other && other.id !== id) throw new HTTPException(400, { message: "该 slug 已被占用" })
      patch.slug = slug
    }

    if ("tag" in body) {
      const tag = str(body.tag)
      if (!tag) throw new HTTPException(400, { message: "家族标签不能为空" })
      const families = await repo.listFamilies()
      if (families.some((family) => family.tag === tag && family.id !== id)) {
        throw new HTTPException(400, { message: "该家族标签已存在" })
      }
      patch.tag = tag
    }

    for (const field of FAMILY_TEXT_FIELDS) {
      if (field in body) patch[field] = str(body[field])
    }
    // A023：封面图协议白名单（覆盖上面的通用文本赋值）
    if ("coverImage" in body) patch.coverImage = safeImageUrl(body.coverImage)
    if ("visibility" in body) {
      patch.visibility = asVisibility(body.visibility, current.visibility)
      // 「仅管理员」访问方式仅超管可设：普通管理员不得切到或切离「仅管理员」
      if (
        admin.role !== "super" &&
        patch.visibility !== current.visibility &&
        (patch.visibility === "private" || current.visibility === "private")
      ) {
        throw new HTTPException(403, { message: "「仅管理员」访问方式仅超级管理员可设置" })
      }
    }
    if (patch.visibility === "password" && !current.accessPasswordHash) {
      generatedAccessPassword = generateAccessPassword()
      patch.accessPasswordHash = await hashPassword(generatedAccessPassword)
    }
    if ("isPrimary" in body) patch.isPrimary = Boolean(body.isPrimary)
    if ("branches" in body) {
      patch.branches = Array.isArray(body.branches)
        ? body.branches.filter((item): item is string => typeof item === "string")
        : []
    }
    // 结构性房支的房主映射（房名 → 房主成员 id）：此前从未接收，导致房主设置无法落库
    if ("branchHeads" in body) patch.branchHeads = parseBranchHeads(body.branchHeads)
    if ("generationPoemStart" in body) {
      const value = Number(body.generationPoemStart)
      patch.generationPoemStart = Number.isFinite(value) && value > 0 ? Math.floor(value) : 1
    }
    // 前台展示开关：关闭后门户不列出、地址访问按不存在处理（仅超级管理员，见敏感字段拦截）
    if ("isPublished" in body) patch.isPublished = Boolean(body.isPublished)
    if ("theme" in body) patch.theme = str(body.theme)

    const family = await repo.updateFamily(id, patch, session.uid)
    if (patch.isPrimary === true) await ensureSinglePrimary(repo, id)
    // 派系改名传播：族谱落库成功后，把成员档案中沿用旧房名的标签一并覆盖为新名，
    // 保证改名是「覆盖」而非「新旧并存」。派系属敏感字段，仅超级管理员可触发。
    const branchRenames = admin.role === "super" ? parseBranchRenames(body.branchRenames) : []
    for (const [from, to] of branchRenames) {
      await repo.renameBranch(id, from, to, session.uid)
    }
    // 历史改名调和（按房主）：更新前某房的房主 id 与更新后新房名的房主 id 相同、
    // 且旧房名已不在新派系列表中 → 推断该房被改名，把沿用旧名的成员标签一并迁移。
    // 用于兼容显式改名映射缺失的历史场景（旧版本改名、删除后重建同房主等）。
    const branchReconciles: [string, string][] = []
    if (admin.role === "super") {
      const nextBranches = (patch.branches as string[] | undefined) ?? current.branches ?? []
      const nextHeads =
        (patch.branchHeads as Record<string, number> | undefined) ?? current.branchHeads ?? {}
      const headToNewName = new Map<number, string>()
      for (const [name, headId] of Object.entries(nextHeads)) {
        if (Number.isFinite(headId) && headId > 0 && nextBranches.includes(name)) {
          headToNewName.set(headId, name)
        }
      }
      for (const [oldName, headId] of Object.entries(current.branchHeads ?? {})) {
        const newName = headToNewName.get(headId)
        if (newName && newName !== oldName && !nextBranches.includes(oldName)) {
          await repo.renameBranch(id, oldName, newName, session.uid)
          branchReconciles.push([oldName, newName])
        }
      }
    }
    // 历史残留一键自愈（仅单房谱）：家族仅剩一个派系时，仍有成员沿用已不在派系列表中的
    // 旧标签 → 统一归并到唯一派系，避免「更名后筛选无结果」。多房谱不臆测迁移。
    if (admin.role === "super") {
      const finalBranches = (patch.branches as string[] | undefined) ?? current.branches ?? []
      if (finalBranches.length === 1) {
        const only = finalBranches[0]
        const members = await repo.listMembers(id)
        const orphans = new Set<string>()
        for (const member of members) {
          if (member.branch && !finalBranches.includes(member.branch)) orphans.add(member.branch)
        }
        for (const label of orphans) {
          await repo.renameBranch(id, label, only, session.uid)
          branchReconciles.push([label, only])
        }
      }
    }
    await repo.appendAuditLog({
      actorId: session.uid,
      actorName: session.username,
      actorRole: admin.role,
      action: "FAMILY_UPDATE",
      targetType: "family",
      targetId: String(id),
      detail: JSON.stringify({
        slug: family.slug,
        tag: family.tag,
        fields: Object.keys(patch),
        ...(branchRenames.length > 0 ? { branchRenames } : {}),
        ...(branchReconciles.length > 0 ? { branchReconciles } : {}),
      }),
    })
    return c.json({
      family: adminFamily(family),
      ...(generatedAccessPassword ? { accessPassword: generatedAccessPassword } : {}),
    })
  })

  // 重新生成族谱访问口令：口令为后台随机生成、不可手动设置，
  // 泄露 / 需轮换时触发，返回新口令明文一次，旧口令随即失效。
  // 权限同「家族写入」：普通管理员仅能轮换本族口令（requireFamilyScope 拦截越权）。
  app.post(
    "/api/admin/families/:id/rotate-access-password",
    familyWriteGuard,
    requireFamilyScope(resolveFamilyByParam),
    async (c) => {
      const session = c.get("session")!
      const admin = (await repo.getAdminById(session.uid))!
      const id = Number(c.req.param("id"))
      if (!Number.isFinite(id)) throw new HTTPException(400, { message: "家族编号无效" })
      const family = await repo.getFamilyById(id)
      if (!family) throw new HTTPException(404, { message: "家族不存在" })

      const accessPassword = generateAccessPassword()
      const accessPasswordHash = await hashPassword(accessPassword)
      await repo.updateFamily(id, { accessPasswordHash }, session.uid)
      await repo.appendAuditLog({
        actorId: session.uid,
        actorName: session.username,
        actorRole: admin.role,
        action: "FAMILY_PASSWORD_ROTATE",
        targetType: "family",
        targetId: String(id),
        detail: JSON.stringify({ slug: family.slug, tag: family.tag }),
      })
      return c.json({ accessPassword })
    },
  )

  // ── 后台：成员（可跨族谱，按 familyId 归属） ──
  app.get("/api/admin/members", authGuard, async (c) => {
    const session = c.get("session")!
    const admin = (await repo.getAdminById(session.uid))!
    const requested = intOrNull(c.req.query("familyId"))
    if (admin.role !== "super") {
      const familyId = admin.familyId ?? 0
      if (requested && requested !== familyId) {
        throw new HTTPException(403, { message: CROSS_FAMILY_DENIED })
      }
      const family = await repo.getFamilyById(familyId)
      if (!family) return c.json({ members: [] })
      return c.json({ members: await repo.listMembers(familyId) })
    }
    if (requested) {
      const family = await repo.getFamilyById(requested)
      if (!family) throw new HTTPException(404, { message: "家族不存在" })
      return c.json({ members: await repo.listMembers(requested) })
    }
    const families = await repo.listFamilies()
    const groups = await Promise.all(families.map((family) => repo.listMembers(family.id)))
    return c.json({ members: groups.flat() })
  })

  // 批量导入：任何一行不合格即整批不写，返回逐行问题供前端定位
  app.post(
    "/api/admin/members/import",
    requireCapability(["edit_genealogy"]),
    requireFamilyScope(resolveFamilyFromBody),
    async (c) => {
      const session = c.get("session")!
      const admin = (await repo.getAdminById(session.uid))!
      // M-4：每管理员导入频率限流（窗口内最多 10 次），防止高频批量写入拖垮服务
      const importKey = `import:${session.uid}`
      const importRemaining = lockRemaining(importKey)
      if (importRemaining > 0) {
        throw new HTTPException(429, {
          message: `导入操作过于频繁，请 ${Math.ceil(importRemaining / 60000)} 分钟后再试`,
        })
      }
      // M-4：每次尝试都计入频率（含校验失败），避免以失败请求绕过限流进行 DoS
      recordFailure(importKey, 10)
      // M-4：请求体大小上限，避免超大 JSON 耗尽内存/CPU
      const contentLength = Number(c.req.header("content-length") || 0)
      if (contentLength > MAX_IMPORT_BODY_BYTES) {
        throw new HTTPException(413, { message: "导入数据过大，请减少单次提交量后重试" })
      }
      const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
      // M-4：兜底体积校验。生产链路由 nginx 注入 Content-Length，上面的预检已足够；
      // 但流式/无 Content-Length 请求（如测试或直连）测不到 header，这里按实际解析后的体积再拦一次。
      if (JSON.stringify(body).length > MAX_IMPORT_BODY_BYTES) {
        throw new HTTPException(413, { message: "导入数据过大，请减少单次提交量后重试" })
      }
      const familyId = intOrNull(body.familyId)
      if (!familyId) throw new HTTPException(400, { message: "缺少家族标签" })
      const family = await repo.getFamilyById(familyId)
      if (!family) throw new HTTPException(400, { message: "家族标签无效" })

      const rawRows = Array.isArray(body.rows) ? body.rows : []
      if (!rawRows.length) throw new HTTPException(400, { message: "没有可导入的行" })
      if (rawRows.length > MAX_IMPORT_ROWS) {
        throw new HTTPException(400, {
          message: `单次最多导入 ${MAX_IMPORT_ROWS} 行，请分批处理后重试`,
        })
      }

      const { candidates, issues } = normalizeImportRows(rawRows, family.branches)
      if (issues.length) {
        return c.json({ error: "导入数据未通过校验，未写入任何行", issues }, 400)
      }

      // 只装载本族成员：跨族编号自然查不到，等于顺带挡住跨谱关联
      const members = await repo.listMembers(familyId)
      const plan = planImport(candidates, new Map(members.map((m) => [m.id, m])))
      if (plan.issues.length) {
        return c.json({ error: "导入数据未通过校验，未写入任何行", issues: plan.issues }, 400)
      }

      let ids: number[]
      try {
        ids = await repo.bulkCreateMembers(familyId, plan.rows, session.uid)
      } catch (error) {
        // M-7：不向客户端回显底层异常细节（可能含表结构/约束名），原始错误仅落服务端日志
        console.error("[import] bulkCreateMembers failed:", error)
        throw new HTTPException(400, { message: "导入失败，请检查数据后重试" })
      }

      await repo.appendAuditLog({
        actorId: session.uid,
        actorName: session.username,
        actorRole: admin.role,
        action: "MEMBER_IMPORT",
        targetType: "family",
        targetId: String(familyId),
        detail: JSON.stringify({ familyId, rowCount: plan.rows.length, created: ids.length }),
      })
      return c.json({ created: ids.length, ids }, 201)
    },
  )

  app.post("/api/admin/members", requireCapability(["edit_genealogy"]), requireFamilyScope(resolveFamilyFromBody), async (c) => {
    const session = c.get("session")!
    const admin = (await repo.getAdminById(session.uid))!
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
    const input = normalizeMember(body, null)

    const family = await repo.getFamilyById(input.familyId)
    if (!family) throw new HTTPException(400, { message: "家族标签无效" })

    await assertSameFamily(repo, input.familyId, [input.fatherId, input.motherId, input.spouseId])
    if (input.fatherId && input.motherId && input.fatherId === input.motherId) {
      throw new HTTPException(400, { message: "父与母不能是同一位族人" })
    }

    const id = await repo.createMember(input, session.uid)
    if (input.spouseId) await repo.setSpouseId(input.spouseId, id)
    await repo.appendAuditLog({
      actorId: session.uid,
      actorName: session.username,
      actorRole: admin.role,
      action: "MEMBER_CREATE",
      targetType: "member",
      targetId: String(id),
      detail: JSON.stringify({ familyId: input.familyId, name: input.name }),
    })
    return c.json({ id }, 201)
  })

  app.put("/api/admin/members/:id", requireCapability(["edit_genealogy"]), requireFamilyScope(resolveMemberByParam), async (c) => {
    const session = c.get("session")!
    const admin = (await repo.getAdminById(session.uid))!
    const id = Number(c.req.param("id"))
    if (!Number.isFinite(id)) throw new HTTPException(400, { message: "成员编号无效" })

    const existing = c.get("member")!

    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
    const input = normalizeMember(body, existing.familyId)
    denyIfCrossFamily(admin, input.familyId)

    const family = await repo.getFamilyById(input.familyId)
    if (!family) throw new HTTPException(400, { message: "家族标签无效" })

    if (input.fatherId === id || input.motherId === id || input.spouseId === id) {
      throw new HTTPException(400, { message: "关系不可指向本人" })
    }

    await assertSameFamily(repo, input.familyId, [input.fatherId, input.motherId, input.spouseId])

    if (input.fatherId || input.motherId) {
      const descendants = await repo.getDescendantIds(id)
      if (
        (input.fatherId && descendants.includes(input.fatherId)) ||
        (input.motherId && descendants.includes(input.motherId))
      ) {
        throw new HTTPException(400, { message: "父母不可选择本人的后代" })
      }
    }

    if (existing.spouseId && existing.spouseId !== input.spouseId) {
      await repo.setSpouseId(existing.spouseId, null)
    }

    await repo.updateMember(id, input, session.uid)

    if (input.spouseId) {
      await repo.setSpouseId(input.spouseId, id)
    }

    await repo.appendAuditLog({
      actorId: session.uid,
      actorName: session.username,
      actorRole: admin.role,
      action: "MEMBER_UPDATE",
      targetType: "member",
      targetId: String(id),
      detail: JSON.stringify({ familyId: input.familyId, name: input.name }),
    })
    return c.json({ ok: true })
  })

  app.delete("/api/admin/members/:id", requireCapability(["edit_genealogy"]), requireFamilyScope(resolveMemberByParam), async (c) => {
    const session = c.get("session")!
    const admin = (await repo.getAdminById(session.uid))!
    const id = Number(c.req.param("id"))
    if (!Number.isFinite(id)) throw new HTTPException(400, { message: "成员编号无效" })

    const existing = c.get("member")!

    // 不再以"被引用"拦截删除：deleteMember 会在删除时自动解除父母/配偶关联。
    await repo.deleteMember(id)
    await repo.appendAuditLog({
      actorId: session.uid,
      actorName: session.username,
      actorRole: admin.role,
      action: "MEMBER_DELETE",
      targetType: "member",
      targetId: String(id),
      detail: JSON.stringify({ name: existing.name }),
    })
    return c.json({ ok: true })
  })

  // ── 后台：批量删除成员（POST 以兼容前端 DELETE 带 body 被代理层丢弃的情形；
  //     自动解除关联；普通管理员限本族；越权/不存在的 id 归入 rejected） ──
  app.post("/api/admin/members/batch-delete", requireCapability(["edit_genealogy"]), async (c) => {
    const session = c.get("session")!
    const admin = (await repo.getAdminById(session.uid))!
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
    const rawIds = Array.isArray(body.ids) ? (body.ids as unknown[]) : []
    const ids = rawIds.map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0)
    const familyId = Number(body.familyId)
    if (!ids.length) throw new HTTPException(400, { message: "未提供有效的成员编号" })
    if (!Number.isFinite(familyId) || familyId <= 0) {
      throw new HTTPException(400, { message: "未指定族谱" })
    }
    if (admin.role !== "super" && admin.familyId !== familyId) {
      throw new HTTPException(403, { message: "无权限操作该族谱的成员" })
    }
    const owned = new Set((await repo.listMembers(familyId)).map((m) => m.id))
    const targetIds = ids.filter((id) => owned.has(id))
    const rejected = ids.filter((id) => !owned.has(id))
    const deleted: number[] = []
    const failed: { id: number; reason: string }[] = []
    for (const id of targetIds) {
      try {
        await repo.deleteMember(id)
        deleted.push(id)
      } catch (error) {
        failed.push({ id, reason: error instanceof Error ? error.message : "删除失败" })
      }
    }
    const family = await repo.getFamilyById(familyId)
    const headIds = family?.branchHeads ? Object.values(family.branchHeads) : []
    const branchHeadWarnings = deleted.filter((id) => headIds.includes(id))
    for (const id of deleted) {
      await repo.appendAuditLog({
        actorId: session.uid,
        actorName: session.username,
        actorRole: admin.role,
        action: "MEMBER_DELETE",
        targetType: "member",
        targetId: String(id),
        detail: JSON.stringify({ batch: true }),
      })
    }
    return c.json({ deleted, failed, rejected, branchHeadWarnings })
  })

  // ── 头像静态服务（ECS 本地盘；CF 迁移时由 R2 公共 URL 取代） ──
  app.get("/avatars/:key", async (c) => {
    const key = c.req.param("key")
    if (!/^[A-Za-z0-9._-]+$/.test(key)) return c.json({ error: "INVALID_KEY" }, 400)
    if (!avatarStorage.exists(key)) return c.json({ error: "NOT_FOUND" }, 404)

    // M-1：私密谱 / 口令谱的头像同样受租户可见性约束，避免绕过访问控制直接拉取当事人照片。
    // 公开谱维持原行为（无额外查询、无新增限制）。
    const memberId = Number(key.split("-")[0])
    if (Number.isInteger(memberId) && memberId > 0) {
      const member = await repo.getMember(memberId)
      if (member) {
        const family = await repo.getFamilyById(member.familyId)
        if (family && family.visibility !== "public") {
          const session = c.get("session")
          if (family.visibility === "private") {
            const admin = session ? await repo.getAdminById(session.uid) : null
            if (!canReadPrivateFamily(admin, family)) return c.json({ error: "NOT_FOUND" }, 404)
          } else {
            // 口令保护谱：校验租户访问 Cookie（与 requireTenantAccess 同口径）
            const token = getCookie(c, tenantCookieName(family.slug))
            const payload = await readTenantToken(token, secret)
            const ok =
              !!payload &&
              payload.fid === family.id &&
              payload.pwd === (await passwordFingerprint(family.accessPasswordHash))
            if (!ok) return c.json({ error: "NOT_FOUND" }, 404)
          }
        }
      }
    }

    const data = avatarStorage.read(key)
    const bytes = new Uint8Array(data)
    return c.body(new Blob([bytes], { type: avatarStorage.contentType(key) }), 200, {
      "Cache-Control": "public, max-age=31536000, immutable",
    })
  })

  // ── 后台：成员头像上传（本地盘落盘；权限同编辑族谱） ──
  app.post("/api/admin/members/:id/avatar", requireCapability(["edit_genealogy"]), requireFamilyScope(resolveMemberByParam), async (c) => {
    const session = c.get("session")!
    const admin = (await repo.getAdminById(session.uid))!
    // M-5：每管理员头像上传频率限流（窗口内最多 20 次），防止持续上传耗尽本地磁盘
    const avatarKey = `avatar:${session.uid}`
    const avatarRemaining = lockRemaining(avatarKey)
    if (avatarRemaining > 0) {
      throw new HTTPException(429, {
        message: `头像上传过于频繁，请 ${Math.ceil(avatarRemaining / 60000)} 分钟后再试`,
      })
    }
    // M-5：每次尝试都计入频率（含失败），避免以失败请求绕过限流耗尽磁盘
    recordFailure(avatarKey, 20)
    const id = Number(c.req.param("id"))
    if (!Number.isFinite(id)) throw new HTTPException(400, { message: "成员编号无效" })

    const existing = c.get("member")!

    const body = await c.req.parseBody({ all: true })
    const raw = body["file"]
    const file = Array.isArray(raw) ? raw[0] : raw
    if (!file || typeof (file as { arrayBuffer?: unknown }).arrayBuffer !== "function" || (file as { size?: number }).size === 0) {
      throw new HTTPException(400, { message: "未收到头像文件" })
    }
    const upload = file as { arrayBuffer: () => Promise<ArrayBuffer>; size: number; type: string }
    const MAX_BYTES = 5 * 1024 * 1024
    if (upload.size > MAX_BYTES) throw new HTTPException(413, { message: "头像文件过大（上限 5MB）" })

    const buffer = Buffer.from(await upload.arrayBuffer())
    // M-2：按文件魔数（而非客户端自报的 Content-Type）校验真实图片格式，
    // 杜绝伪造 Content-Type 把非图片字节入库；落盘扩展名由真实格式决定（见 avatarStorage.save）。
    if (!imageExtFromBytes(buffer)) {
      throw new HTTPException(415, { message: "仅支持 JPG / PNG / WebP 格式" })
    }
    if (existing.avatarKey) await avatarStorage.remove(existing.avatarKey)
    const key = await avatarStorage.save(id, buffer)
    await repo.updateMember(id, { ...existing, avatarKey: key } as MemberInput, session.uid)
    await repo.appendAuditLog({
      actorId: session.uid,
      actorName: session.username,
      actorRole: admin.role,
      action: "MEMBER_AVATAR_UPLOAD",
      targetType: "member",
      targetId: String(id),
      detail: JSON.stringify({ key }),
    })
    return c.json({ avatarKey: key, url: avatarStorage.resolveUrl(key) })
  })

  app.delete("/api/admin/members/:id/avatar", requireCapability(["edit_genealogy"]), requireFamilyScope(resolveMemberByParam), async (c) => {
    const session = c.get("session")!
    const admin = (await repo.getAdminById(session.uid))!
    const id = Number(c.req.param("id"))
    if (!Number.isFinite(id)) throw new HTTPException(400, { message: "成员编号无效" })

    const existing = c.get("member")!

    if (existing.avatarKey) await avatarStorage.remove(existing.avatarKey)
    await repo.updateMember(id, { ...existing, avatarKey: "" } as MemberInput, session.uid)
    await repo.appendAuditLog({
      actorId: session.uid,
      actorName: session.username,
      actorRole: admin.role,
      action: "MEMBER_AVATAR_REMOVE",
      targetType: "member",
      targetId: String(id),
      detail: "",
    })
    return c.json({ ok: true })
  })

  app.get("/api/admin/stats", authGuard, async (c) => {
    const session = c.get("session")!
    const admin = (await repo.getAdminById(session.uid))!
    const requested = intOrNull(c.req.query("familyId"))
    if (admin.role !== "super") {
      const familyId = admin.familyId ?? 0
      if (requested && requested !== familyId) {
        throw new HTTPException(403, { message: CROSS_FAMILY_DENIED })
      }
      const family = await repo.getFamilyById(familyId)
      if (!family) return c.json(computeStats([], ""))
      return c.json(computeStats(await repo.listMembers(familyId), family.updatedAt))
    }
    if (!requested) {
      const families = await repo.listFamilies()
      const groups = await Promise.all(families.map((family) => repo.listMembers(family.id)))
      const family = await repo.getPrimaryFamily()
      return c.json(computeStats(groups.flat(), family?.updatedAt ?? ""))
    }
    const family = await repo.getFamilyById(requested)
    if (!family) throw new HTTPException(404, { message: "家族不存在" })
    return c.json(computeStats(await repo.listMembers(requested), family.updatedAt))
  })

  // ── 后台：信息反馈审核 ──
  app.get("/api/admin/submissions", authGuard, async (c) => {
    const session = c.get("session")!
    const admin = (await repo.getAdminById(session.uid))!
    const status = str(c.req.query("status")) || undefined
    if (admin.role !== "super") {
      const list = await repo.listSubmissions(admin.familyId ?? 0, status)
      return c.json({ submissions: list })
    }
    const unassigned = c.req.query("unassigned") === "1"
    const familyId = intOrNull(c.req.query("familyId"))
    const list = await repo.listSubmissions(unassigned ? null : familyId ?? undefined, status)
    return c.json({ submissions: list })
  })

  app.put("/api/admin/submissions/:id", requireCapability(["review_feedback"]), requireFamilyScope(resolveSubmissionByParam), async (c) => {
    const session = c.get("session")!
    const admin = (await repo.getAdminById(session.uid))!
    const id = Number(c.req.param("id"))
    if (!Number.isFinite(id)) throw new HTTPException(400, { message: "编号无效" })
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
    const status = str(body.status)
    if (status !== "accepted" && status !== "rejected") {
      throw new HTTPException(400, { message: "状态无效" })
    }
    await repo.setSubmissionStatus(id, status)
    await repo.appendAuditLog({
      actorId: session.uid,
      actorName: session.username,
      actorRole: admin.role,
      action: "SUBMISSION_REVIEW",
      targetType: "submission",
      targetId: String(id),
      detail: JSON.stringify({ status }),
    })
    return c.json({ ok: true })
  })

  // 批量删除反馈记录（操作审计由服务端写入，操作人取自会话）
  app.post("/api/admin/submissions/batch-delete", requireCapability(["review_feedback"]), async (c) => {
    const session = c.get("session")!
    const admin = (await repo.getAdminById(session.uid))!
    const actorRole = admin.role
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
    const rawIds = Array.isArray(body.ids) ? body.ids : []
    const ids = [
      ...new Set(rawIds.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0)),
    ]
    if (ids.length === 0) throw new HTTPException(400, { message: "未选择要删除的记录" })
    if (ids.length > 500) throw new HTTPException(400, { message: "单次删除不可超过 500 条" })

    // 作用域：普通管理员仅能删除本家族的反馈
    if (admin.role !== "super") {
      const own = admin.familyId ?? 0
      const targets = await Promise.all(ids.map((id) => repo.getSubmission(id)))
      if (targets.some((t) => !t || t.familyId !== own)) {
        throw new HTTPException(403, { message: "无权限删除其他家族的反馈" })
      }
    }

    const deleted = await repo.deleteSubmissions(ids)
    await repo.appendAuditLog({
      actorId: session.uid,
      actorName: session.username,
      actorRole,
      action: "SUBMISSION_DELETE",
      targetType: "submission",
      targetId: ids.join(","),
      detail: JSON.stringify({ requested: ids.length, deleted }),
    })
    return c.json({ deleted, ids })
  })

  // 通用审计埋点（仅记录“由前端发起、服务端不可直接感知”的动作，如导出）；
  // 操作人由服务端会话填充，客户端仅可指定受限的 action，防止伪造审计内容。
  app.post("/api/admin/audit-logs", requireCapability(["review_feedback"]), async (c) => {
    const session = c.get("session")!
    const admin = (await repo.getAdminById(session.uid))!
    const actorRole = admin.role
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
    const action = str(body.action)
    const ALLOWED = new Set(["SUBMISSION_EXPORT", "AUDIT_EXPORT"])
    if (!ALLOWED.has(action)) throw new HTTPException(400, { message: "不支持的审计动作" })
    await repo.appendAuditLog({
      actorId: session.uid,
      actorName: session.username,
      actorRole,
      action,
      targetType: str(body.targetType),
      targetId: str(body.targetId),
      detail: str(body.detail).slice(0, 500), // A018：限制审计明细长度，避免伪造超长内容
    })
    return c.json({ ok: true })
  })

  // ── 后台：管理员账号治理（仅超级管理员） ──
  app.get("/api/admin/admins", requireCapability(["manage_admin"]), async (c) => {
    const admins = (await repo.listAdmins()).map((a) => ({
      id: a.id,
      username: a.username,
      role: a.role,
      isDisabled: a.isDisabled,
      lastLoginAt: a.lastLoginAt,
      familyId: a.familyId,
    }))
    return c.json({ admins })
  })

  app.post("/api/admin/admins", requireCapability(["manage_admin"]), async (c) => {
    const session = c.get("session")!
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
    const username = str(body.username)
    const password = str(body.password)
    const role = str(body.role)
    if (!username) throw new HTTPException(400, { message: "账号不能为空" })
    const invalid = validateNewPassword(password, "", username)
    if (invalid) throw new HTTPException(400, { message: invalid })
    const safeRole = role === "super" ? "super" : "editor"
    if (await repo.getAdminByUsername(username)) {
      throw new HTTPException(400, { message: "该账号已存在" })
    }
    // 普通管理员必须绑定所属家族；超级管理员不绑定
    let familyId: number | null = null
    if (safeRole === "editor") {
      familyId = intOrNull(body.familyId)
      if (!familyId) throw new HTTPException(400, { message: "请为普通管理员选择所属家族" })
      const family = await repo.getFamilyById(familyId)
      if (!family) throw new HTTPException(400, { message: "所属家族不存在" })
    }
    await repo.createAdmin(username, await hashPassword(password), safeRole, familyId)
    const created = await repo.getAdminByUsername(username)
    await repo.appendAuditLog({
      actorId: session.uid,
      actorName: session.username,
      actorRole: (await repo.getAdminById(session.uid))?.role ?? "super",
      action: "ADMIN_CREATE",
      targetType: "admin",
      targetId: String(created?.id ?? ""),
      detail: JSON.stringify({ username, role: safeRole }),
    })
    return c.json({ ok: true }, 201)
  })

  app.patch("/api/admin/admins/:id", requireCapability(["manage_admin"]), async (c) => {
    const session = c.get("session")!
    const id = Number(c.req.param("id"))
    if (!Number.isFinite(id)) throw new HTTPException(400, { message: "编号无效" })
    const target = await repo.getAdminById(id)
    if (!target) throw new HTTPException(404, { message: "管理员不存在" })
    if (id === session.uid) throw new HTTPException(400, { message: "不可修改自身角色或状态" })

    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
    const changes: string[] = []

    if ("role" in body) {
      const newRole = str(body.role)
      if (newRole !== "super" && newRole !== "editor") {
        throw new HTTPException(400, { message: "角色无效" })
      }
      if (newRole !== target.role) {
        // 防止将最后一名超级管理员降级为普通管理员
        if (target.role === "super") {
          const remaining = (await repo.listAdmins()).filter(
            (a) => a.role === "super" && a.id !== target.id,
          )
          if (remaining.length === 0) {
            throw new HTTPException(400, { message: "至少保留一名超级管理员" })
          }
        }
        await repo.updateAdminRole(id, newRole)
        changes.push("role")
      }
    }

    if ("isDisabled" in body) {
      const disabled = Boolean(body.isDisabled)
      if (disabled !== target.isDisabled) {
        if (target.role === "super") {
          throw new HTTPException(400, { message: "不可停用超级管理员" })
        }
        await repo.setAdminDisabled(id, disabled)
        changes.push("isDisabled")
      }
    }

    if ("familyId" in body) {
      const familyId = intOrNull(body.familyId)
      const nextRole = "role" in body ? str(body.role) : target.role
      if (nextRole === "super") {
        if (familyId !== null) {
          throw new HTTPException(400, { message: "超级管理员不绑定家族" })
        }
      } else {
        if (!familyId) throw new HTTPException(400, { message: "请为普通管理员选择所属家族" })
        const family = await repo.getFamilyById(familyId)
        if (!family) throw new HTTPException(400, { message: "所属家族不存在" })
      }
      if (familyId !== target.familyId) {
        await repo.setAdminFamily(id, familyId)
        changes.push("familyId")
      }
    }

    // 角色为普通管理员时必须已绑定所属家族
    const finalRole = "role" in body ? str(body.role) : target.role
    if (finalRole === "editor") {
      const finalFamilyId = "familyId" in body ? intOrNull(body.familyId) : target.familyId
      if (!finalFamilyId) {
        throw new HTTPException(400, { message: "普通管理员必须绑定所属家族" })
      }
    }

    if (changes.length === 0) return c.json({ ok: true })

    await repo.appendAuditLog({
      actorId: session.uid,
      actorName: session.username,
      actorRole: (await repo.getAdminById(session.uid))?.role ?? "super",
      action: "ADMIN_UPDATE",
      targetType: "admin",
      targetId: String(id),
      detail: JSON.stringify({ username: target.username, changes }),
    })
    return c.json({ ok: true })
  })

  app.post("/api/admin/admins/:id/reset-password", requireCapability(["manage_admin"]), async (c) => {
    const session = c.get("session")!
    const id = Number(c.req.param("id"))
    if (!Number.isFinite(id)) throw new HTTPException(400, { message: "编号无效" })
    const target = await repo.getAdminById(id)
    if (!target) throw new HTTPException(404, { message: "管理员不存在" })
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
    const password = str(body.password)
    const invalid = validateNewPassword(password, "", target.username)
    if (invalid) throw new HTTPException(400, { message: invalid })
    await repo.updateAdminPassword(id, await hashPassword(password))
    // H1：密码被重置后，该管理员下次登录必须自行改密
    await repo.setMustChangePassword(id, true)
    await repo.appendAuditLog({
      actorId: session.uid,
      actorName: session.username,
      actorRole: (await repo.getAdminById(session.uid))?.role ?? "super",
      action: "ADMIN_PASSWORD_RESET",
      targetType: "admin",
      targetId: String(id),
      detail: JSON.stringify({ username: target.username }),
    })
    return c.json({ ok: true })
  })

  app.delete("/api/admin/admins/:id", requireCapability(["manage_admin"]), async (c) => {
    const session = c.get("session")!
    const id = Number(c.req.param("id"))
    if (!Number.isFinite(id)) throw new HTTPException(400, { message: "编号无效" })
    if (id === session.uid) throw new HTTPException(400, { message: "不可删除自身" })
    const target = await repo.getAdminById(id)
    if (!target) throw new HTTPException(404, { message: "管理员不存在" })
    if (target.role === "super") throw new HTTPException(400, { message: "不可删除超级管理员" })
    await repo.deleteAdmin(id)
    await repo.appendAuditLog({
      actorId: session.uid,
      actorName: session.username,
      actorRole: (await repo.getAdminById(session.uid))?.role ?? "super",
      action: "ADMIN_DELETE",
      targetType: "admin",
      targetId: String(id),
      detail: JSON.stringify({ username: target.username }),
    })
    return c.json({ ok: true })
  })

  // ── 后台：审计日志（仅超级管理员可见、只读） ──
  app.get("/api/admin/audit-logs", requireCapability(["audit_log"]), async (c) => {
    const limit = Math.min(parseIntStrict(c.req.query("limit"), 50), 200)
    const offset = Math.max(parseIntStrict(c.req.query("offset"), 0), 0)
    const action = str(c.req.query("action"))
    const actor = str(c.req.query("actor"))
    const yearRaw = intOrNull(c.req.query("year"))
    const monthRaw = intOrNull(c.req.query("month"))
    if (monthRaw != null && (monthRaw < 1 || monthRaw > 12)) {
      return c.json({ error: "月份需在 1–12 之间" }, 400)
    }
    const [logs, total] = await Promise.all([
      repo.listAuditLogs(
        limit,
        offset,
        action || undefined,
        actor || undefined,
        yearRaw ?? undefined,
        monthRaw ?? undefined,
      ),
      repo.countAuditLogs(
        action || undefined,
        actor || undefined,
        yearRaw ?? undefined,
        monthRaw ?? undefined,
      ),
    ])
    // total 与 logs 用同一套筛选，前端据此算总页数；多返回一个字段不影响旧客户端
    return c.json({ logs, total })
  })

  // ── 审计日志批量导出（仅超级管理员）：日志不可删除，仅支持查看与导出 ──
  const AUDIT_ROLE_LABEL: Record<string, string> = { super: "超级管理员", editor: "普通管理员" }
  const AUDIT_ACTION_LABEL: Record<string, string> = {
    SUBMISSION_DELETE: "删除反馈",
    SUBMISSION_EXPORT: "导出反馈",
    SUBMISSION_REVIEW: "审核反馈",
    ADMIN_CREATE: "创建管理员",
    ADMIN_UPDATE: "变更管理员",
    ADMIN_DELETE: "删除管理员",
    ADMIN_PASSWORD_RESET: "重置密码",
    FAMILY_CREATE: "创建族谱",
    FAMILY_UPDATE: "更新族谱",
    MEMBER_CREATE: "创建族人",
    MEMBER_UPDATE: "更新族人",
    MEMBER_DELETE: "删除族人",
    MEMBER_IMPORT: "导入族人",
    LOGIN: "登录",
    AUDIT_EXPORT: "导出审计日志",
  }
  app.get("/api/admin/audit-logs/export", requireCapability(["audit_log"]), async (c) => {
    const session = c.get("session")!
    const admin = (await repo.getAdminById(session.uid))!
    const action = str(c.req.query("action"))
    const actor = str(c.req.query("actor"))
    const yearRaw = intOrNull(c.req.query("year"))
    const monthRaw = intOrNull(c.req.query("month"))

    // 解析导出范围：year+month → 年月；仅 year → 年份；均无 → 全部
    if (monthRaw != null && (monthRaw < 1 || monthRaw > 12)) {
      return c.json({ error: "月份需在 1–12 之间" }, 400)
    }
    const month = monthRaw ?? undefined
    const year = yearRaw ?? undefined
    const isMonthScope = year != null && month != null
    const isYearScope = year != null && month == null
    const scope: "all" | "year" | "month" = isMonthScope ? "month" : isYearScope ? "year" : "all"
    const scopeLabel =
      isMonthScope ? `${year} 年 ${month} 月` : isYearScope ? `${year} 年` : "全部时间"
    const requiredCap =
      scope === "month" ? "audit_export_month" : scope === "year" ? "audit_export_year" : "audit_export_all"

    // 按范围独立权限校验：除查看权限 audit_log 外，还需持有对应范围的导出能力
    if (!(ROLE_CAPS[admin.role] ?? []).includes(requiredCap)) {
      return c.json(
        { error: `无「${scopeLabel}」范围的审计日志导出权限，无法执行该范围导出` },
        403,
      )
    }

    const logs = await repo.listAuditLogs(
      100000,
      0,
      action || undefined,
      actor || undefined,
      year,
      month,
    )
    // H6：中和公式注入，防止访客可控内容在 Excel/WPS 打开导出时执行
    const escapeCsv = (value: string) => {
      const text = String(value ?? "")
      const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
      return `"${safe.replace(/"/g, '""')}"`
    }
    const header = ["时间", "操作人", "角色", "动作", "目标", "明细"]
    const lines = logs.map((log) =>
      [
        formatBeijing(log.createdAt),
        log.actorName || "",
        AUDIT_ROLE_LABEL[log.actorRole] ?? log.actorRole,
        AUDIT_ACTION_LABEL[log.action] ?? log.action,
        `${log.targetType}${log.targetId ? ` · ${log.targetId}` : ""}`,
        log.detail || "",
      ]
        .map((cell) => escapeCsv(cell))
        .join(","),
    )
    const csv = "﻿" + [header.map(escapeCsv).join(","), ...lines].join("\r\n")
    const scopeSuffix = isMonthScope
      ? `${year}-${String(month).padStart(2, "0")}`
      : isYearScope
        ? String(year)
        : "all"
    await repo.appendAuditLog({
      actorId: session.uid,
      actorName: session.username,
      actorRole: admin.role,
      action: "AUDIT_EXPORT",
      targetType: "audit",
      targetId: "",
      detail: JSON.stringify({
        count: logs.length,
        action,
        actor,
        scope,
        year: year ?? null,
        month: month ?? null,
      }),
    })
    return c.body(csv, 200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit-logs-${scopeSuffix}-${formatBeijing(new Date().toISOString(), false)}.csv"`,
    })
  })

  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return c.json({ error: err.message }, err.status)
    }
    console.error("[api error]", err)
    return c.json({ error: "服务器内部错误" }, 500)
  })

  return app
}
