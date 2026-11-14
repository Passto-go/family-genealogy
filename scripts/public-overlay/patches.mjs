/* 公开仓专用改动：只对既有文件做小范围替换。
 *
 * 这些内容（演示站入口、部署 FAQ 链接）只属于公开仓，本地仓不保留。
 * 每条补丁必须能命中唯一位点，命中不了直接中止导出，避免静默漂移。
 */

export const PATCHES = [
  {
    id: "package-scripts",
    file: "package.json",
    find: '    "build": "tsc -b && vite build",\n',
    replace:
      '    "build": "tsc -b && vite build",\n' +
      '    "dev:demo": "vite --config vite.demo.config.ts",\n' +
      '    "build:demo": "vite build --config vite.demo.config.ts && node scripts/finalize-demo-build.mjs",\n' +
      '    "preview:demo": "vite preview --config vite.demo.config.ts --outDir dist-demo",\n' +
      '    "gen:demo": "tsx scripts/gen-demo-data.mts",\n',
  },
  {
    id: "vite-env-demo-flag",
    file: "src/vite-env.d.ts",
    find: '/// <reference types="vite/client" />\n',
    replace:
      '/// <reference types="vite/client" />\n' +
      "\n/** 构建期常量：只读演示站构建为 true（见 vite.demo.config.ts） */\n" +
      "declare const __DEMO__: boolean\n",
  },
  {
    id: "login-demo-hint",
    file: "src/admin/Login.tsx",
    find: `            <p className="mt-2 text-[12.5px] tracking-[0.16em] text-muted-foreground">
              {family?.name || "家族族谱"}　·　{family?.hallName || "谱牒管理"}
            </p>
          </div>
`,
    replace: `            <p className="mt-2 text-[12.5px] tracking-[0.16em] text-muted-foreground">
              {family?.name || "家族族谱"}　·　{family?.hallName || "谱牒管理"}
            </p>
            {__DEMO__ ? (
              <p className="mt-3 border border-dashed border-gold-600/40 px-3 py-2 text-[11.5px] leading-relaxed tracking-[0.04em] text-ink-600">
                只读演示：任意账号与密码均可登录，进入后只能查看，所有修改都会被拒绝。
              </p>
            ) : null}
          </div>
`,
  },
  {
    id: "admin-readonly-banner",
    file: "src/admin/AdminLayout.tsx",
    find: `        <main className="flex-1 px-4 py-7 sm:px-8 sm:py-9">
          <div className="mx-auto w-full max-w-[1080px]">
            <Outlet />
`,
    replace: `        <main className="flex-1 px-4 py-7 sm:px-8 sm:py-9">
          <div className="mx-auto w-full max-w-[1080px]">
            {__DEMO__ ? (
              <p className="mb-5 border border-dashed border-gold-600/40 bg-gold-500/5 px-4 py-2.5 text-[12px] leading-relaxed tracking-[0.04em] text-ink-600">
                只读演示：数据为示例族谱，所有修改操作都会被拒绝。反馈审核、管理员、操作日志、证书域名等页只展示结构与空状态。
              </p>
            ) : null}
            <Outlet />
`,
  },
  {
    id: "readme-demo-and-faq",
    file: "README.md",
    find: `进程守护用 systemd 即可。证书可以用 acme 客户端配合 DNS 接口自动续期，应用侧通过 \`INTERNAL_API_TOKEN\` 暴露的状态接口回写结果。

## 数据与备份
`,
    replace: `进程守护用 systemd 即可。证书可以用 acme 客户端配合 DNS 接口自动续期，应用侧通过 \`INTERNAL_API_TOKEN\` 暴露的状态接口回写结果。

## 只读演示站

在线演示：<https://passto-go.github.io/family-genealogy/>（示例数据，只能查看，不能编辑；本演示不含纸面谱页导出功能）。

对外展示用的静态版，独立入口与独立产物，不影响主应用的构建。本地跑开发预览与构建：

\`\`\`bash
npm run dev:demo      # 开发预览：http://localhost:5174/family-genealogy/
npm run build:demo    # 构建到 dist-demo/，按子路径 /family-genealogy/ 部署
\`\`\`

细节见 \`docs/demo-site.md\`。

## 部署常见问题

部署里容易踩的先后顺序、依赖与必要条件，见 [部署常见问题与注意事项](docs/deployment-faq.md)。

## 数据与备份
`,
  },
  {
    id: "gitignore-demo-dist",
    file: ".gitignore",
    find: "# 编辑器/助手本地配置，不入库\n.codebuddy/\n",
    replace:
      "# 编辑器/助手本地配置，不入库\n.codebuddy/\n\n# 只读演示站构建产物\ndist-demo/\n",
  },
]
