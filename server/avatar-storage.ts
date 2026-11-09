/**
 * 头像存储抽象层。
 *
 * 当前实现（ECS 本地盘）：文件落 `server/data/avatars/{memberId}-{时间戳}.webp`，
 * 通过 `/avatars/:key` 公开访问（见 app.ts）。字段只存逻辑 key（文件名），
 * 前端 / 业务层不感知物理路径——符合上云报告「只存相对 key」约定。
 *
 * Cloudflare 迁移留位：届时新增 R2 实现（从 env 取 R2 binding），把 save/remove
 * 改为写 R2、resolveUrl 改为返回 R2 公共访问 URL 或经 Worker 签名的临时 URL；
 * 业务层与前端无需改动（详见 memory 中的 CF 迁移说明）。
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const AVATARS_DIR = path.join(HERE, "data", "avatars")

fs.mkdirSync(AVATARS_DIR, { recursive: true })

function safeKey(key: string): string {
  const base = path.basename(key)
  if (!/^[A-Za-z0-9._-]+$/.test(base)) throw new Error("INVALID_AVATAR_KEY")
  return base
}

function detectContentType(key: string): string {
  const ext = path.extname(key).toLowerCase()
  if (ext === ".webp") return "image/webp"
  if (ext === ".png") return "image/png"
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg"
  return "application/octet-stream"
}

export const avatarStorage = {
  /**
   * 保存头像，返回逻辑 key（文件名）。
   * key 携带毫秒时间戳：每次上传生成新 URL，配合 /avatars 路由的
   * Cache-Control: immutable 实现「内容不变缓存永久、内容更新即刻生效」，
   * 避免同 key 覆盖后被浏览器旧缓存遮挡（表现为裁剪/换图不生效）。
   */
  async save(memberId: number, data: Buffer): Promise<string> {
    const key = `${memberId}-${Date.now()}.webp`
    fs.writeFileSync(path.join(AVATARS_DIR, key), data)
    return key
  },

  /** 删除指定 key 的头像文件（忽略不存在）。 */
  async remove(key: string): Promise<void> {
    try {
      fs.unlinkSync(path.join(AVATARS_DIR, safeKey(key)))
    } catch {
      // 文件不存在时静默忽略
    }
  },

  /** 读取头像文件内容（供 app.ts 静态服务使用）。 */
  read(key: string): Buffer {
    return fs.readFileSync(path.join(AVATARS_DIR, safeKey(key)))
  },

  exists(key: string): boolean {
    try {
      return fs.existsSync(path.join(AVATARS_DIR, safeKey(key)))
    } catch {
      return false
    }
  },

  /** 解析为前端可访问的 URL。CF 迁移时改为 R2 公共 URL。 */
  resolveUrl(key: string): string {
    return `/avatars/${encodeURIComponent(safeKey(key))}`
  },

  contentType(key: string): string {
    return detectContentType(key)
  },

  dir: AVATARS_DIR,
}
