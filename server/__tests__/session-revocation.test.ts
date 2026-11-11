import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createSessionToken, readSessionToken } from "../auth"
import { createLocalRepo } from "../repo/local"
import type { Repo } from "../repo/types"

const SECRET = "unit-test-session-secret-0123456789abcdef"

let dir: string
let repo: Repo

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "fg-revoke-"))
  repo = createLocalRepo(join(dir, "test.db"))
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe("会话撤销（jti）", () => {
  it("登出后该 jti 立即失效，其他会话不受影响", async () => {
    const a = await createSessionToken({ id: 1, username: "admin" }, SECRET, "hash")
    const b = await createSessionToken({ id: 1, username: "admin" }, SECRET, "hash")
    const pa = await readSessionToken(a.token, SECRET)
    const pb = await readSessionToken(b.token, SECRET)

    expect(pa?.jti).toBeTruthy()
    expect(pb?.jti).toBeTruthy()
    await expect(repo.isSessionRevoked(pa!.jti)).resolves.toBe(false)

    await repo.revokeSession(pa!.jti, pa!.exp)

    await expect(repo.isSessionRevoked(pa!.jti)).resolves.toBe(true)
    await expect(repo.isSessionRevoked(pb!.jti)).resolves.toBe(false)
  })

  it("已过期的撤销记录不再命中", async () => {
    await repo.revokeSession("expired-jti", Date.now() - 1)
    await expect(repo.isSessionRevoked("expired-jti")).resolves.toBe(false)
  })

  it("未知 jti 视为未撤销", async () => {
    await expect(repo.isSessionRevoked("never-issued")).resolves.toBe(false)
  })
})

describe("全端登出（按 uid 失效）", () => {
  it("记录失效时间，且只影响该账号", async () => {
    const before = await repo.sessionInvalidatedAt(42)
    expect(before).toBe(0)

    await repo.revokeAllSessions(42)

    const after = await repo.sessionInvalidatedAt(42)
    expect(after).toBeGreaterThan(0)
    expect(after).toBeLessThanOrEqual(Date.now())
    await expect(repo.sessionInvalidatedAt(43)).resolves.toBe(0)
  })

  it("重复调用更新时间戳", async () => {
    await repo.revokeAllSessions(44)
    const first = await repo.sessionInvalidatedAt(44)
    await new Promise((resolve) => setTimeout(resolve, 5))
    await repo.revokeAllSessions(44)
    const second = await repo.sessionInvalidatedAt(44)
    expect(second).toBeGreaterThanOrEqual(first)
  })
})
