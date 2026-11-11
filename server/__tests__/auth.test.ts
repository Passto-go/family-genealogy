import { afterEach, describe, expect, it, vi } from "vitest"
import {
  DUMMY_HASH,
  TENANT_TTL_MS,
  buildOtpauthUri,
  createPreAuthToken,
  createSessionToken,
  createTenantToken,
  decryptSecret,
  encryptSecret,
  generateAccessPassword,
  generateTotpSecret,
  hashPassword,
  passwordFingerprint,
  readPreAuthToken,
  readSessionToken,
  readTenantToken,
  resolveSecret,
  tenantCookieName,
  verifyPassword,
  verifyTotp,
} from "../auth"

const SECRET = "unit-test-session-secret-0123456789abcdef"
const AES_SECRET = "unit-test-aes-secret-0123456789abcdef"

afterEach(() => {
  vi.useRealTimers()
})

describe("口令哈希（PBKDF2）", () => {
  it("正确口令通过、错误口令拒绝", async () => {
    const hash = await hashPassword("correct horse battery")
    await expect(verifyPassword("correct horse battery", hash)).resolves.toBe(true)
    await expect(verifyPassword("wrong horse battery", hash)).resolves.toBe(false)
  })

  it("每次哈希使用独立盐值", async () => {
    const a = await hashPassword("same-password")
    const b = await hashPassword("same-password")
    expect(a).not.toBe(b)
    expect(a.split("$")[0]).toBe("pbkdf2")
  })

  it("拒绝格式非法的存储值", async () => {
    const malformed = [
      "",
      "plain-text",
      "bcrypt$10$c2FsdA$aGFzaA",
      "pbkdf2$not-a-number$c2FsdA$aGFzaA",
      "pbkdf2$0$c2FsdA$aGFzaA",
      "pbkdf2$2000000$c2FsdA$aGFzaA",
      "pbkdf2$150000$***$***",
    ]
    for (const stored of malformed) {
      await expect(verifyPassword("anything", stored)).resolves.toBe(false)
    }
  })

  it("DUMMY_HASH 格式合法但永不通过", async () => {
    expect(DUMMY_HASH).toMatch(/^pbkdf2\$150000\$[\w-]+\$[\w-]+$/)
    await expect(verifyPassword("", DUMMY_HASH)).resolves.toBe(false)
    await expect(verifyPassword("admin", DUMMY_HASH)).resolves.toBe(false)
  })
})

describe("口令指纹", () => {
  it("空哈希返回空串", async () => {
    await expect(passwordFingerprint("")).resolves.toBe("")
  })

  it("同一哈希稳定、不同哈希相异", async () => {
    const first = await hashPassword("password-a")
    const second = await hashPassword("password-b")
    const fp1 = await passwordFingerprint(first)
    const fp2 = await passwordFingerprint(first)
    const fp3 = await passwordFingerprint(second)
    expect(fp1).toBe(fp2)
    expect(fp1).not.toBe(fp3)
    expect(fp1).toHaveLength(22)
  })
})

describe("管理员会话令牌", () => {
  it("签发后可读回且字段完整", async () => {
    const { token, maxAge } = await createSessionToken(
      { id: 7, username: "admin" },
      SECRET,
      "hash-a",
    )
    expect(maxAge).toBe(12 * 60 * 60)
    const payload = await readSessionToken(token, SECRET)
    expect(payload).toMatchObject({ uid: 7, username: "admin", typ: "session" })
    expect(payload?.jti).toMatch(/^[0-9a-f-]{36}$/)
    expect(typeof payload?.iat).toBe("number")
  })

  it("每次登录产生不同 jti", async () => {
    const a = await createSessionToken({ id: 1, username: "admin" }, SECRET, "hash")
    const b = await createSessionToken({ id: 1, username: "admin" }, SECRET, "hash")
    const pa = await readSessionToken(a.token, SECRET)
    const pb = await readSessionToken(b.token, SECRET)
    expect(pa?.jti).not.toBe(pb?.jti)
  })

  it("密钥不符、正文被篡改、格式错误均拒绝", async () => {
    const { token } = await createSessionToken({ id: 1, username: "admin" }, SECRET, "hash")
    const [body, signature] = token.split(".")
    const tamperedBody = (body[0] === "A" ? "B" : "A") + body.slice(1)
    const tamperedSignature = signature.slice(0, -1) + (signature.endsWith("A") ? "B" : "A")

    await expect(readSessionToken(token, `${SECRET}-other`)).resolves.toBeNull()
    await expect(readSessionToken(`${tamperedBody}.${signature}`, SECRET)).resolves.toBeNull()
    await expect(readSessionToken(`${body}.${tamperedSignature}`, SECRET)).resolves.toBeNull()
    await expect(readSessionToken("", SECRET)).resolves.toBeNull()
    await expect(readSessionToken(undefined, SECRET)).resolves.toBeNull()
    await expect(readSessionToken("no-dot", SECRET)).resolves.toBeNull()
    await expect(readSessionToken(".signature-only", SECRET)).resolves.toBeNull()
  })

  it("超过 12 小时后失效", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    const { token } = await createSessionToken({ id: 1, username: "admin" }, SECRET, "hash")
    vi.setSystemTime(Date.now() + 12 * 60 * 60 * 1000 + 1)
    await expect(readSessionToken(token, SECRET)).resolves.toBeNull()
  })

  it("改密后指纹随之变化（旧会话不再匹配）", async () => {
    const before = await passwordFingerprint(await hashPassword("old-password"))
    const after = await passwordFingerprint(await hashPassword("new-password"))
    expect(before).not.toBe(after)
  })
})

describe("租户访问令牌", () => {
  const family = { id: 3, slug: "chen", accessPasswordHash: "hash-tenant" }

  it("签发后可读回，Cookie 名按 slug 生成", async () => {
    const { token, maxAge } = await createTenantToken(family, SECRET)
    expect(maxAge).toBe(Math.floor(TENANT_TTL_MS / 1000))
    expect(tenantCookieName("chen")).toBe("fg_t_chen")
    await expect(readTenantToken(token, SECRET)).resolves.toMatchObject({
      fid: 3,
      slug: "chen",
      typ: "tenant",
    })
  })

  it("超过 24 小时后失效", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    const { token } = await createTenantToken(family, SECRET)
    vi.setSystemTime(Date.now() + TENANT_TTL_MS + 1)
    await expect(readTenantToken(token, SECRET)).resolves.toBeNull()
  })

  it("换口令后指纹不同（旧凭证失效）", async () => {
    const oldToken = await createTenantToken(family, SECRET)
    const rotated = await createTenantToken(
      { ...family, accessPasswordHash: "hash-rotated" },
      SECRET,
    )
    const p1 = await readTenantToken(oldToken.token, SECRET)
    const p2 = await readTenantToken(rotated.token, SECRET)
    expect(p1?.pwd).not.toBe(p2?.pwd)
  })
})

describe("令牌类型隔离", () => {
  it("三类令牌互不通用", async () => {
    const session = await createSessionToken({ id: 1, username: "admin" }, SECRET, "hash")
    const tenant = await createTenantToken({ id: 2, slug: "li", accessPasswordHash: "h" }, SECRET)
    const preAuth = await createPreAuthToken(1, "admin", SECRET)

    await expect(readSessionToken(tenant.token, SECRET)).resolves.toBeNull()
    await expect(readSessionToken(preAuth, SECRET)).resolves.toBeNull()
    await expect(readTenantToken(session.token, SECRET)).resolves.toBeNull()
    await expect(readTenantToken(preAuth, SECRET)).resolves.toBeNull()
    await expect(readPreAuthToken(session.token, SECRET)).resolves.toBeNull()
    await expect(readPreAuthToken(tenant.token, SECRET)).resolves.toBeNull()
  })
})

describe("MFA 预授权令牌", () => {
  it("签发后可读回", async () => {
    const token = await createPreAuthToken(9, "super", SECRET)
    await expect(readPreAuthToken(token, SECRET)).resolves.toMatchObject({
      uid: 9,
      username: "super",
      typ: "mfa",
    })
  })

  it("超过 5 分钟后失效", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    const token = await createPreAuthToken(9, "super", SECRET)
    vi.setSystemTime(Date.now() + 5 * 60 * 1000 + 1)
    await expect(readPreAuthToken(token, SECRET)).resolves.toBeNull()
  })
})

describe("TOTP", () => {
  // RFC 6238 附录 B 的种子 "12345678901234567890"（base32）
  const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"

  it("T=59s 时接受 RFC 向量，拒绝错误码", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(59_000)
    await expect(verifyTotp(RFC_SECRET, "287082", 0)).resolves.toBe(true)
    await expect(verifyTotp(RFC_SECRET, "755224", 0)).resolves.toBe(false)
    await expect(verifyTotp(RFC_SECRET, "359152", 0)).resolves.toBe(false)
  })

  it("允许 ±1 步时钟漂移", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(59_000)
    await expect(verifyTotp(RFC_SECRET, "755224", 1)).resolves.toBe(true)
    await expect(verifyTotp(RFC_SECRET, "287082", 1)).resolves.toBe(true)
  })

  it("拒绝非 6 位数字与空密钥", async () => {
    await expect(verifyTotp(RFC_SECRET, "12345")).resolves.toBe(false)
    await expect(verifyTotp(RFC_SECRET, "abcdef")).resolves.toBe(false)
    await expect(verifyTotp("", "123456")).resolves.toBe(false)
  })

  it("生成的密钥为 32 位 base32", () => {
    const secret = generateTotpSecret()
    expect(secret).toHaveLength(32)
    expect(secret).toMatch(/^[A-Z2-7]+$/)
    expect(generateTotpSecret()).not.toBe(secret)
  })

  it("otpauth URI 参数完整", () => {
    const uri = buildOtpauthUri(RFC_SECRET, "admin@example.com", "时光家谱")
    expect(uri.startsWith("otpauth://totp/")).toBe(true)
    const params = new URL(uri).searchParams
    expect(params.get("secret")).toBe(RFC_SECRET)
    expect(params.get("issuer")).toBe("时光家谱")
    expect(params.get("digits")).toBe("6")
    expect(params.get("period")).toBe("30")
    expect(params.get("algorithm")).toBe("SHA1")
  })
})

describe("TOTP 密钥加密（AES-GCM）", () => {
  it("加解密往返一致", async () => {
    const cipher = await encryptSecret("JBSWY3DPEHPK3PXP", AES_SECRET)
    await expect(decryptSecret(cipher, AES_SECRET)).resolves.toBe("JBSWY3DPEHPK3PXP")
  })

  it("同明文两次加密结果不同（随机 IV）", async () => {
    const a = await encryptSecret("same", AES_SECRET)
    const b = await encryptSecret("same", AES_SECRET)
    expect(a).not.toBe(b)
  })

  it("密钥不符或密文被篡改时解密失败", async () => {
    const cipher = await encryptSecret("JBSWY3DPEHPK3PXP", AES_SECRET)
    await expect(decryptSecret(cipher, `${AES_SECRET}-other`)).rejects.toThrow()
    const flipped = cipher.slice(0, 10) + (cipher[10] === "A" ? "B" : "A") + cipher.slice(11)
    await expect(decryptSecret(flipped, AES_SECRET)).rejects.toThrow()
  })
})

describe("访问口令生成", () => {
  it("默认 16 位且剔除易混淆字符", () => {
    const password = generateAccessPassword()
    expect(password).toHaveLength(16)
    expect(password).toMatch(/^[A-HJ-NP-Za-km-z2-9]+$/)
    expect(generateAccessPassword()).not.toBe(password)
  })

  it("支持自定义长度", () => {
    expect(generateAccessPassword(8)).toHaveLength(8)
  })
})

describe("签名密钥校验", () => {
  it("接受合规密钥", () => {
    expect(resolveSecret("a".repeat(32))).toBe("a".repeat(32))
    expect(resolveSecret(`  ${"b".repeat(40)}  `)).toBe("b".repeat(40))
  })

  it("拒绝过短、空值与占位符", () => {
    expect(() => resolveSecret("short")).toThrow()
    expect(() => resolveSecret("   ")).toThrow()
    expect(() => resolveSecret(undefined)).toThrow()
    expect(() => resolveSecret(`dev-secret-${"x".repeat(30)}`)).toThrow()
    expect(() => resolveSecret(`REPLACE_ME_${"x".repeat(30)}`)).toThrow()
  })
})
