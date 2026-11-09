/**
 * H1：新密码复杂度规则。
 * 必须与后端 server/app.ts 的 validateNewPassword 保持一致，避免前端放行、后端拒绝。
 */
export function validatePassword(next: string, current: string, username?: string): string | null {
  // 必须与后端 server/app.ts 的 validateNewPassword 保持一致：至少 8 位；
  // 大小写字母、数字、特殊符号四类至少含三类；不得与当前密码相同；不得包含账号名。
  if (next.length < 8) return "新密码至少 8 位"
  const classes = [/[A-Z]/, /[a-z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(next)).length
  if (classes < 3) {
    return "新密码需包含大写字母、小写字母、数字、特殊符号中的至少 3 类"
  }
  if (username && next.toLowerCase().includes(username.toLowerCase())) {
    return "新密码不得包含账号名"
  }
  if (next === current) return "新密码不得与当前密码相同"
  return null
}
