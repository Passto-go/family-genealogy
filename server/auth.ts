/**
 * 鉴权工具：PBKDF2 密码哈希 + HMAC 签名 Cookie。
 * 全部基于 Web Crypto，Node 与 Cloudflare Workers 均可直接运行，无需 bcrypt。
 */

import { readEnv } from "./config.js"

const encoder = new TextEncoder()
const ITERATIONS = 150_000
// A026：对「账号不存在」的登录也执行一次常量 PBKDF2，使响应耗时与真实账号趋于一致，
// 缓解账号存在性时序侧信道。该哈希格式合法但内容随机，验证必失败。
export const DUMMY_HASH = `pbkdf2$${ITERATIONS}$${bytesToB64url(
  crypto.getRandomValues(new Uint8Array(16)),
)}$${bytesToB64url(crypto.getRandomValues(new Uint8Array(32)))}`
const SESSION_TTL_MS = 1000 * 60 * 60 * 12 // 12 小时

// A032：会话 Cookie 名可由环境变量 SESSION_COOKIE_NAME 覆盖（默认值保持不变），
// 降低被攻击者按固定名称定向探测的成本。
export const SESSION_COOKIE = readEnv("SESSION_COOKIE_NAME") || "fg_session"

export interface SessionPayload {
  uid: number
  username: string
  /** 令牌用途：区分管理员会话与租户口令令牌，防止类型混淆 */
  typ: "session"
  /** 签发时的口令哈希指纹：改密/重置后旧会话立即失效 */
  pwd: string
  /** 会话唯一标识，用于登出后服务端撤销 */
  jti: string
  /** M-9：签发时间（毫秒），用于「登出所有设备」后使旧会话失效 */
  iat: number
  exp: number
}

function bytesToB64url(bytes: Uint8Array): string {
  let binary = ""
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function b64urlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/")
  const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4))
  const binary = atob(normalized + pad)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, [
    "deriveBits",
  ])
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as unknown as BufferSource, iterations, hash: "SHA-256" },
    key,
    256,
  )
  return new Uint8Array(bits)
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await derive(password, salt, ITERATIONS)
  return `pbkdf2$${ITERATIONS}$${bytesToB64url(salt)}$${bytesToB64url(hash)}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$")
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false
  const iterations = Number(parts[1])
  // A027：拒绝异常高的迭代次数，防止攻击者注入超大 PBKDF2 计算量造成 CPU DoS
  if (!Number.isFinite(iterations) || iterations <= 0 || iterations > 1_000_000) return false
  try {
    const salt = b64urlToBytes(parts[2])
    const expected = b64urlToBytes(parts[3])
    const actual = await derive(password, salt, iterations)
    if (actual.length !== expected.length) return false
    let diff = 0
    for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i]
    return diff === 0
  } catch {
    return false
  }
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** 不同用途使用不同派生密钥，任一用途的令牌都无法被另一用途验签通过 */
async function sign(data: string, secret: string, scope: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(`${secret}|${scope}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data))
  return bytesToB64url(new Uint8Array(signature))
}

/** 由口令哈希派生短指纹，用于让密码变更后旧 Cookie 失效 */
export async function passwordFingerprint(hash: string): Promise<string> {
  if (!hash) return ""
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(hash))
  return bytesToB64url(new Uint8Array(digest)).slice(0, 22)
}

export async function createSessionToken(
  user: { id: number; username: string },
  secret: string,
  passwordHash: string,
): Promise<{ token: string; maxAge: number }> {
  const payload: SessionPayload = {
    uid: user.id,
    username: user.username,
    typ: "session",
    pwd: await passwordFingerprint(passwordHash),
    jti: crypto.randomUUID(),
    iat: Date.now(),
    exp: Date.now() + SESSION_TTL_MS,
  }
  const body = bytesToB64url(encoder.encode(JSON.stringify(payload)))
  const signature = await sign(body, secret, "session")
  return { token: `${body}.${signature}`, maxAge: Math.floor(SESSION_TTL_MS / 1000) }
}

export async function readSessionToken(
  token: string | undefined,
  secret: string,
): Promise<SessionPayload | null> {
  if (!token) return null
  const dot = token.lastIndexOf(".")
  if (dot <= 0) return null
  const body = token.slice(0, dot)
  const signature = token.slice(dot + 1)
  const expected = await sign(body, secret, "session")
  if (!safeEqual(signature, expected)) return null
  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(body))) as SessionPayload
    if (
      !payload ||
      payload.typ !== "session" ||
      typeof payload.uid !== "number" ||
      typeof payload.username !== "string" ||
      typeof payload.pwd !== "string" ||
      typeof payload.jti !== "string" ||
      typeof payload.exp !== "number" ||
      payload.exp < Date.now()
    ) {
      return null
    }
    return payload
  } catch {
    return null
  }
}

// ── 租户（族谱）访问凭证：与管理员会话完全分离 ──
export const TENANT_TTL_MS = 1000 * 60 * 60 * 24 // 1 天
/** 小程序端凭证有效期：小程序无 Cookie 自动管理，令牌存本机，故放宽为 7 天 */
export const TENANT_TTL_MP_MS = TENANT_TTL_MS * 7

export interface TenantPayload {
  fid: number
  slug: string
  /** 令牌用途：区分管理员会话与租户口令令牌 */
  typ: "tenant"
  /** 口令指纹：访问密码变更后，旧凭证立即失效 */
  pwd: string
  exp: number
}

export function tenantCookieName(slug: string): string {
  return `fg_t_${slug}`
}

export async function createTenantToken(
  family: { id: number; slug: string; accessPasswordHash: string },
  secret: string,
  ttlMs: number = TENANT_TTL_MS,
): Promise<{ token: string; maxAge: number; expiresAt: number }> {
  const expiresAt = Date.now() + ttlMs
  const payload: TenantPayload = {
    fid: family.id,
    slug: family.slug,
    typ: "tenant",
    pwd: await passwordFingerprint(family.accessPasswordHash),
    exp: expiresAt,
  }
  const body = bytesToB64url(encoder.encode(JSON.stringify(payload)))
  const signature = await sign(body, secret, "tenant")
  return { token: `${body}.${signature}`, maxAge: Math.floor(ttlMs / 1000), expiresAt }
}

export async function readTenantToken(
  token: string | undefined,
  secret: string,
): Promise<TenantPayload | null> {
  if (!token) return null
  const dot = token.lastIndexOf(".")
  if (dot <= 0) return null
  const body = token.slice(0, dot)
  const signature = token.slice(dot + 1)
  const expected = await sign(body, secret, "tenant")
  if (!safeEqual(signature, expected)) return null
  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(body))) as TenantPayload
    if (
      !payload ||
      payload.typ !== "tenant" ||
      typeof payload.fid !== "number" ||
      typeof payload.slug !== "string" ||
      typeof payload.pwd !== "string" ||
      typeof payload.exp !== "number" ||
      payload.exp < Date.now()
    ) {
      return null
    }
    return payload
  } catch {
    return null
  }
}

// ── 登录二次验证（TOTP / 验证器，RFC 6238） ──
// 全部基于 Web Crypto，Node 与 Cloudflare Workers 均可运行。

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

function base32Encode(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let output = ""
  for (const b of bytes) {
    value = (value << 8) | b
    bits += 8
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  return output
}

function base32Decode(input: string): Uint8Array {
  const clean = input.toUpperCase().replace(/=+$/, "").replace(/\s/g, "")
  let bits = 0
  let value = 0
  const output: number[] = []
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch)
    if (idx < 0) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return new Uint8Array(output)
}

/** 生成 160 位 TOTP 密钥（base32，无填充） */
export function generateTotpSecret(): string {
  return base32Encode(crypto.getRandomValues(new Uint8Array(20)))
}

/**
 * 生成族谱前台「访问口令」：一律由后台随机生成、经哈希后落库，明文仅当次返回给超管分发。
 * 不支持手动设置，避免族人自设弱口令被在线爆破。字母表已剔除易混淆字符（0/O、1/l/I）。
 */
const ACCESS_PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"
export function generateAccessPassword(length = 16): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let out = ""
  for (let i = 0; i < length; i++) out += ACCESS_PASSWORD_ALPHABET[bytes[i] % ACCESS_PASSWORD_ALPHABET.length]
  return out
}

/** 构造 otpauth:// URI，供验证器 App 扫码录入 */
export function buildOtpauthUri(secret: string, account: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`)
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  })
  return `otpauth://totp/${label}?${params.toString()}`
}

async function hmacSha1(keyBytes: Uint8Array, msg: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes as unknown as BufferSource,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  )
  const sig = await crypto.subtle.sign("HMAC", key, msg as unknown as BufferSource)
  return new Uint8Array(sig)
}

/** 校验 TOTP 动态码，允许 ±drift 个时间步（默认 ±1 步 = ±30s）时钟漂移 */
export async function verifyTotp(secret: string, code: string, drift = 1): Promise<boolean> {
  const keyBytes = base32Decode(secret)
  if (keyBytes.length === 0) return false
  const cleaned = code.trim()
  if (!/^\d{6}$/.test(cleaned)) return false
  const counter = Math.floor(Date.now() / 30_000)
  for (let offset = -drift; offset <= drift; offset++) {
    const c = counter + offset
    const buf = new Uint8Array(8)
    let v = c
    for (let i = 7; i >= 0; i--) {
      buf[i] = v & 0xff
      v = Math.floor(v / 256)
    }
    const mac = await hmacSha1(keyBytes, buf)
    const pos = mac[mac.length - 1] & 0x0f
    const binary =
      ((mac[pos] & 0x7f) << 24) |
      ((mac[pos + 1] & 0xff) << 16) |
      ((mac[pos + 2] & 0xff) << 8) |
      (mac[pos + 3] & 0xff)
    if ((binary % 1_000_000).toString().padStart(6, "0") === cleaned) return true
  }
  return false
}

/** 用 SESSION_SECRET 派生的 AES-GCM 密钥加密 TOTP 密钥（落库前调用） */
export async function encryptSecret(plain: string, secret: string): Promise<string> {
  const key = await deriveAesKey(secret)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as unknown as BufferSource },
    key,
    encoder.encode(plain) as unknown as BufferSource,
  )
  const combined = new Uint8Array(iv.length + ct.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(ct), iv.length)
  return bytesToB64url(combined)
}

/** 解密 TOTP 密钥（校验动态码时调用） */
export async function decryptSecret(cipher: string, secret: string): Promise<string> {
  const key = await deriveAesKey(secret)
  const combined = b64urlToBytes(cipher)
  const iv = combined.slice(0, 12)
  const ct = combined.slice(12)
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as unknown as BufferSource },
    key,
    ct as unknown as BufferSource,
  )
  return new TextDecoder().decode(pt)
}

async function deriveAesKey(secret: string): Promise<CryptoKey> {
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(secret))
  return crypto.subtle.importKey(
    "raw",
    hash as unknown as BufferSource,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  )
}

// ── 登录二次验证用的短期预授权令牌（mfa_pending） ──
export interface PreAuthPayload {
  uid: number
  username: string
  typ: "mfa"
  exp: number
}

/** 密码校验通过后、MFA 校验前签发的 5 分钟短期令牌（不发放正式会话） */
export async function createPreAuthToken(
  uid: number,
  username: string,
  secret: string,
): Promise<string> {
  const payload: PreAuthPayload = {
    uid,
    username,
    typ: "mfa",
    exp: Date.now() + 5 * 60 * 1000,
  }
  const body = bytesToB64url(encoder.encode(JSON.stringify(payload)))
  const signature = await sign(body, secret, "mfa")
  return `${body}.${signature}`
}

export async function readPreAuthToken(
  token: string | undefined,
  secret: string,
): Promise<PreAuthPayload | null> {
  if (!token) return null
  const dot = token.lastIndexOf(".")
  if (dot <= 0) return null
  const body = token.slice(0, dot)
  const signature = token.slice(dot + 1)
  const expected = await sign(body, secret, "mfa")
  if (!safeEqual(signature, expected)) return null
  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(body))) as PreAuthPayload
    if (
      !payload ||
      payload.typ !== "mfa" ||
      typeof payload.uid !== "number" ||
      typeof payload.username !== "string" ||
      typeof payload.exp !== "number" ||
      payload.exp < Date.now()
    ) {
      return null
    }
    return payload
  } catch {
    return null
  }
}

/** 签名密钥必须显式、安全地提供；禁止静默回退到源码中的公开常量 */
export function resolveSecret(envSecret?: string): string {
  const value = (envSecret ?? "").trim()
  if (value.length < 32 || /REPLACE|dev-secret|example|changeme|placeholder/i.test(value)) {
    throw new Error("SESSION_SECRET 未安全配置：需 ≥32 位随机串，且不得为占位符")
  }
  return value
}
