import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"

/**
 * 只读演示站的独立构建配置。
 *
 * 公开仓用它产出 dist-demo，主应用的 vite.config.ts 完全不动；
 * 演示站只依赖本地静态数据，故不配置 /api 代理，接口由 src/demo/mock-api.ts 接管。
 */

/** 开发态只认演示站入口：根路径与前端路由都落到 demo.html，避免误开主应用的 index.html */
function demoEntryPlugin(): Plugin {
  return {
    name: "demo-entry",
    configureServer(server) {
      const base = server.config.base
      server.middlewares.use((req, _res, next) => {
        if (!req.url || (req.method && req.method !== "GET")) return next()
        const [pathname] = req.url.split("?")
        // 模块请求、静态资源放行；其余（含 / 与 /t/:slug/...）统一交给演示入口
        const passthrough =
          pathname.startsWith("/@") ||
          pathname.startsWith("/node_modules/") ||
          /\.[a-z0-9]+$/i.test(pathname)
        const isMainEntry = pathname === "/index.html" || pathname === `${base}index.html`
        if (isMainEntry || !passthrough) req.url = `${base}demo.html`
        next()
      })
    },
  }
}

export default defineConfig(() => {
  // 部署子路径，默认 /family-genealogy/；换托管位置用 DEMO_BASE 覆盖（须以 / 开头与结尾）
  const base = process.env.DEMO_BASE || "/family-genealogy/"

  return {
    base,
    /** 演示站据此隐藏后台登录入口；主应用构建不定义该常量 */
    define: { __DEMO__: "true" },
    plugins: [react(), demoEntryPlugin()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: { port: 5174 },
    preview: { port: 4175 },
    build: {
      outDir: "dist-demo",
      rollupOptions: {
        input: { demo: path.resolve(__dirname, "demo.html") },
      },
    },
  }
})
