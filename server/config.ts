/**
 * 业务层的运行时配置读取单点。
 *
 * Node 入口从环境变量取值，Cloudflare Workers 入口走 env binding。业务代码统一
 * 经此读取，将来切换部署形态时只需改这一处。Workers 下 process 未定义时返回空串，
 * 调用方按「未配置」处理。
 */
export function readEnv(name: string): string {
  if (typeof process === "undefined") return ""
  return process.env?.[name]?.trim() ?? ""
}
