import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

/** 构建时注入的「最后更新」标签（北京时间，固定 UTC+8、无夏令时）。 */
function buildDateLabelForDefine(): string {
  const bj = new Date(Date.now() + 8 * 3600 * 1000)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${bj.getUTCFullYear()} 年 ${pad(bj.getUTCMonth() + 1)} 月 ${pad(bj.getUTCDate())} 日`
}

export default defineConfig({
  /** 主应用构建恒为 false，只读演示站（vite.demo.config.ts）才置 true */
  define: { __DEMO__: "false" },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    __APP_BUILD_TIME__: JSON.stringify(buildDateLabelForDefine()),
  },
  server: {
    port: 5174,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Access-Control-Allow-Origin": "*",
    },
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
      "/avatars": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // React 全家桶单独成包：升级业务代码时这部分哈希不变，可长期走缓存
        manualChunks(id) {
          if (!id.includes("node_modules")) return
          if (id.includes("react-router")) return "vendor-react"
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return "vendor-react"
        },
      },
    },
  },
  preview: {
    port:4175,
    // M-10：预览服务器不为 /api 注入通配 CORS（/api 经同源代理，无需通配；避免误用 preview 承载生产时削弱同源假设）
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
      "/avatars": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
})
