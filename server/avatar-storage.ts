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

/**
 * 按文件魔数（而非客户端声明的 Content-Type）判定真实图片格式。
 * 用于上传校验与落盘扩展名——杜绝伪造 Content-Type 把非图片字节入库，
 * 并保证扩展名与实际编码一致（否则在 X-Content-Type-Options: nosniff 下图片无法解码）。
 */
export function imageExtFromBytes(data: Buffer): "jpg" | "png" | "webp" | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return "jpg"
  }
  if (
    data.length >= 4 &&
    data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47
  ) {
    return "png"
  }
  if (
    data.length >= 12 &&
    data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46 &&
    data[8] === 0x57 && data[9] === 0x45 && data[10] === 0x42 && data[11] === 0x50
  ) {
    return "webp"
  }
  return null
}

export const avatarStorage = {
  /**
   * 保存头像，返回逻辑 key（文件名）。
   * key 携带毫秒时间戳：每次上传生成新 URL，配合 /avatars 路由的
   * Cache-Control: immutable 实现「内容不变缓存永久、内容更新即刻生效」，
   * 避免同 key 覆盖后被浏览器旧缓存遮挡（表现为裁剪/换图不生效）。
   * 扩展名由魔数判定的真实格式决定（JPG / PNG / WebP），不再固定 .webp。
   */
  async save(memberId: number, data: Buffer): Promise<string> {
    const ext = imageExtFromBytes(data) ?? "webp"
    const key = `${memberId}-${Date.now()}.${ext}`
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
