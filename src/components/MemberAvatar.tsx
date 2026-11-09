import { cn } from "@/lib/utils"
import type { Member } from "@/lib/types"

interface MemberAvatarProps {
  /** 只需姓名与头像 key；传完整 Member 亦可（结构兼容） */
  member: Pick<Member, "name" | "avatarKey">
  size?: number
  className?: string
}

/**
 * 圆角方形头像（微信个人头像风格）：有头像显图，无头像显姓名末字。
 * 视觉规格由用户指定（非正圆、非直角），统一用于资料页 / 世系图节点 / 后台表单。
 */
export function MemberAvatar({ member, size = 72, className }: MemberAvatarProps) {
  const key = member.avatarKey
  const name = member.name || ""
  const lastChar = name ? Array.from(name).slice(-1)[0] : "族"

  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-[12px] bg-paper-200",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {key ? (
        <img
          src={`/avatars/${encodeURIComponent(key)}`}
          alt={name}
          className="h-full w-full object-contain"
        />
      ) : (
        <span className="font-song text-ink-500" style={{ fontSize: Math.round(size * 0.42) }}>
          {lastChar}
        </span>
      )}
    </div>
  )
}
