/**
 * 密码尝试限流（内存实现，单实例足够）。
 * 规则：同一「租户 + 来源」在窗口内失败达到上限后，锁定一段时间。
 */

const WINDOW_MS = 10 * 60 * 1000 // 统计窗口 10 分钟
const MAX_FAILURES = 5 // 窗口内最多失败 5 次
const LOCK_MS = 10 * 60 * 1000 // 锁定时长 10 分钟

interface Attempt {
  failures: number
  firstAt: number
  lockedUntil: number
}

const attempts = new Map<string, Attempt>()

function sweep(now: number) {
  for (const [key, value] of attempts) {
    if (value.lockedUntil <= now && now - value.firstAt > WINDOW_MS) {
      attempts.delete(key)
    }
  }
}

/** 返回剩余锁定毫秒数，0 表示未锁定 */
export function lockRemaining(key: string): number {
  const now = Date.now()
  const state = attempts.get(key)
  if (!state) return 0
  if (state.lockedUntil > now) return state.lockedUntil - now
  return 0
}

/** 记录一次失败；达到阈值则锁定并返回剩余毫秒。阈值可覆盖（默认沿用全局常量）。 */
export function recordFailure(key: string, maxFailures: number = MAX_FAILURES, lockMs: number = LOCK_MS): number {
  const now = Date.now()
  sweep(now)
  let state = attempts.get(key)
  if (!state || now - state.firstAt > WINDOW_MS) {
    state = { failures: 0, firstAt: now, lockedUntil: 0 }
    attempts.set(key, state)
  }
  state.failures += 1
  if (state.failures >= maxFailures) {
    state.lockedUntil = now + lockMs
    return lockMs
  }
  return 0
}

export function recordSuccess(key: string): void {
  attempts.delete(key)
}

// A014：定时清理过期记录，避免内存无限增长。
// 说明：进程内 Map 在重启时清零、多实例间不共享，属单实例部署的固有限制；
// 生产采用单容器单实例 + SQLite（见 deploy/aliyun.md），无需引入外部存储。
setInterval(() => {
  const now = Date.now()
  for (const [key, value] of attempts) {
    if (value.lockedUntil <= now && now - value.firstAt > WINDOW_MS) attempts.delete(key)
  }
}, WINDOW_MS).unref?.()
