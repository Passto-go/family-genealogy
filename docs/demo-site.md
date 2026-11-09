# 只读演示站

对外展示用的静态站：示例数据、只能查看、不能编辑。复用主站的页面组件与样式，但有独立入口、独立配置文件与独立产物目录，主站构建不受影响。

## 组成

| 文件 | 作用 |
| --- | --- |
| `demo.html` | 演示站入口，首屏主题脚本与主站一致 |
| `src/demo/main.tsx` | 挂载应用，接管接口后渲染；history 路由，basename 取构建 base |
| `src/demo/mock-api.ts` | 拦截 `window.fetch` 的 `/api` 请求，读接口返回静态数据，写接口与登录一律 403 |
| `src/demo/data.ts` | 示例数据，由 `scripts/gen-demo-data.mts` 从 `server/seed.ts` 的虚构族谱导出 |
| `src/demo/DemoBadge.tsx` | 底部「只读演示」标识，并在标签页标题补后缀 |

## 只读的范围

- 世系、族谱信息、站点配置、备案号：正常展示。
- 后台：页头保留登录入口，任意账号与密码都能进入；概览、家族管理、成员管理读取示例族谱的只读数据；反馈审核、管理员、操作日志、证书域名只渲染空状态；顶部有「只读演示」提示条。
- 后台的其他写操作、口令解锁、信息反馈：接口一律 403，提示「演示模式：只看不改」；反馈入口随 `siteConfig.feedbackEnabled=false` 关闭。

## 命令

```bash
npm run gen:demo      # 重新导出示例数据到 src/demo/data.ts（会覆盖）
npm run dev:demo      # 开发预览，http://localhost:5174/family-genealogy/
npm run build:demo    # 构建到 dist-demo/，入口改名为 index.html
npm run preview:demo  # 预览构建产物，http://localhost:4175/family-genealogy/
```

`npm run gen:demo` 在系统临时目录建一次性数据库跑种子数据，导出后自动删除。

## 部署

演示站按子路径部署，构建期 `base` 为 `/family-genealogy/`，所有静态资源都带此前缀。

GitHub Pages 步骤：

1. 执行 `npm run build:demo`，得到 `dist-demo/`（含 `index.html` 与内容相同的 `404.html`）。
2. 把 `dist-demo/` 里的内容推到发布仓的 `gh-pages` 分支（或 `docs/` 目录）。
3. 仓库名若不是 `family-genealogy`，用 `DEMO_BASE` 改成实际的子路径再构建：

```bash
DEMO_BASE=/<仓库名>/ npm run build:demo
```

地址形如 `https://<用户名>.github.io/family-genealogy/`。路由是 history 模式，深链（如 `/family-genealogy/t/chen/genealogy`）与刷新由 GitHub Pages 的 `404.html` 兜底；换其他静态托管时，同样需要有「找不到就返回 index.html」的规则，否则只能从首页进入。

## 发布到 gh-pages

演示站与源码分支分开：产物单独推到 `gh-pages`，源码留在 `main`。

```bash
npm ci && npm run build:demo

rm -rf /tmp/fg-pages
cp -R dist-demo /tmp/fg-pages
cd /tmp/fg-pages
touch .nojekyll            # 关掉 Jekyll，避免静态目录被额外处理

git init -b gh-pages
git add -A
git commit -m "demo site"
git remote add origin <仓库地址>
git push -f origin gh-pages
```

再到仓库 Settings → Pages，Source 选 `gh-pages` / `(root)`。之后每次更新重复上面步骤即可，`-f` 只作用于 `gh-pages`。

本仓库的演示站：`https://passto-go.github.io/family-genealogy/`。

## 与主站的关系

演示站用独立的 `vite.demo.config.ts`，`npm run build` / `npm run dev` 仍走 `vite.config.ts`，行为与产物不变。两者唯一的交叉是一个构建期常量：主站构建把它固定为 `false`，演示站为 `true`，用于在页头隐藏后台登录入口。
