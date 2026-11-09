# 家族族谱

本地优先的多租户家族族谱系统。前台以族谱为单位展示世系图与家族文献，后台维护多部族谱、族人与亲属关系。数据默认存在单个 SQLite 文件里，不需要另装数据库服务。

技术栈：React 19 + TypeScript + Vite + Tailwind CSS · Hono + SQLite（`node:sqlite`）。

## 环境要求

- Node.js 24 及以上（依赖内置 `node:sqlite`）
- npm 11

## 本地运行

```bash
npm install
npm run dev
```

`dev` 同时启动接口（3001）与前端（5173）。

| 入口 | 地址 |
| --- | --- |
| 族谱总目 | http://localhost:5173 |
| 单部族谱 | http://localhost:5173/t/:slug ，首次建库后访问 `/t/chen` |
| 后台 | http://localhost:5173/admin |
| 健康检查 | http://localhost:3001/api/health |

`/api/health` 只返回 `{"ok":true}`，不读数据库、不涉及个人数据。

首次启动会自动建库，写入示例族谱（颍川陈氏 · 七世四十人），并创建管理员 `admin`，一次性初始密码打印在启动日志里。也可以用 `INITIAL_ADMIN_PASSWORD` 指定初始密码。登录后请立即改密；后台只能从 `/admin` 直接进入，前台不设管理入口。

删除 `server/data/family.db` 再重启，即恢复为初始示例数据。

## 功能

前台：

- 族谱总目：列出全部可公开访问的族谱
- 单部族谱：首页、世系图、家族文献
- 谱页：`/t/:slug/print` 独立纸面视图，打印交给浏览器
- 信息反馈：访客或族人提交纠错与补充，进后台审核

后台：

- 家族管理：新建与编辑族谱、slug、访问方式与口令、主谱标记、名号源流家训
- 成员管理：按族谱隔离，搜索、按世次与房支筛选，绑定父/母/配偶（防跨谱与成环），Excel 模板导入导出
- 反馈审核：查看、处理、批量删除族人提交的信息
- 域名管理：为族谱绑定自有域名，仅超级管理员可见
- 站点设置、管理员账号、审计日志
- 登录安全：PBKDF2 口令哈希、TOTP 双因素、登录限流

## 访问控制

| 访问方式 | 首页 / 家族文献 | 世系图 | 门户列表 |
| --- | --- | --- | --- |
| 公开 `public` | 可读 | 可读 | 展示 |
| 密码 `password` | 可读 | 需访问口令（按 IP + 族谱限流） | 展示 |
| 私密 `private` | 管理员登录后可读 | 管理员可读 | 不展示，非管理员访问按「不存在」处理 |

口令以 PBKDF2 哈希存储，会话凭证与管理员会话相互独立；口令凭证绑定当前口令指纹，管理员改密后旧凭证立即失效。世系数据按需请求，浏览首页与家族文献不触发口令校验。

## 环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `SESSION_SECRET` | 开发环境自动生成并存到 `server/data/.session-secret` | 会话签名密钥，至少 32 位。生产环境必须显式提供，缺失拒绝启动 |
| `INITIAL_ADMIN_PASSWORD` | 随机生成并打印 | 首次建库时的管理员初始密码 |
| `PORT` | `3001` | 服务端口 |
| `DATABASE_FILE` | `server/data/family.db` | SQLite 文件路径 |
| `SESSION_COOKIE_NAME` | `fg_session` | 会话 Cookie 名 |
| `INTERNAL_API_TOKEN` | 空 | 宿主机证书脚本回写 TLS 状态用的共享令牌；不配置则该组接口返回 403 |
| `VITE_BAIDU_ANALYTICS_ID` | 空 | 访问统计站点标识，构建时写入前端；留空则不加载任何统计脚本 |

## 生产部署

```bash
npm install
npm run build
SESSION_SECRET=<32 位以上随机串> npm start
```

`npm start` 以生产模式运行，只监听一个端口（默认 3001），同时托管 `dist/` 静态文件与 `/api`。

建议前置 Nginx 做 TLS 终止与反向代理，注意两点：

- 由反代写入 `X-Real-IP` 与 `X-Forwarded-Proto`，应用只采信这两个头，用于限流分桶与 Cookie `Secure` 判断
- 清除客户端自带的同名头，避免伪造绕过限流或 TLS 判断

进程守护用 systemd 即可。证书可以用 acme 客户端配合 DNS 接口自动续期，应用侧通过 `INTERNAL_API_TOKEN` 暴露的状态接口回写结果。

## 只读演示站

在线演示：<https://passto-go.github.io/family-genealogy/>（示例数据，只能查看，不能编辑）。

对外展示用的静态版，独立入口与独立产物，不影响主应用的构建。本地跑开发预览与构建：

```bash
npm run dev:demo      # 开发预览：http://localhost:5174/family-genealogy/
npm run build:demo    # 构建到 dist-demo/，按子路径 /family-genealogy/ 部署
```

细节见 `docs/demo-site.md`。

## 部署常见问题

部署里容易踩的先后顺序、依赖与必要条件，见 [部署常见问题与注意事项](docs/deployment-faq.md)。

## 数据与备份

- 全部族谱数据在 `server/data/family.db` 单文件里，WAL 模式
- 备份建议先停服务，或连同 `family.db-wal`、`family.db-shm` 一起复制
- 会话密钥在 `server/data/.session-secret`，生产环境请改用 `SESSION_SECRET` 环境变量

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 前端与接口同时启动 |
| `npm run build` | 生产构建 |
| `npm start` | 生产模式运行 |
| `npm run lint` | ESLint 检查 |
| `npm run preview` | 预览构建产物 |

## 目录结构

```
server/            后端：路由、鉴权、限流、SQLite 数据层、示例数据
  repo/            数据访问抽象与实现（local.ts + types.ts）
src/pages/         前台：族谱总目 / 首页 / 世系图 / 家族文献 / 谱页 / 法务
src/admin/         后台：家族、成员、反馈、域名、站点、管理员、审计日志
src/lib/           接口封装、租户上下文、访问门禁、导入导出
src/components/    UI 组件、世系树节点与布局算法
deploy/            自托管相关脚本：证书签发与续期、源码打包、管理员密码重置
docs/prototypes/   世系图与谱页的静态版式原型（数据为虚构）
```

## 路线图

以下能力尚未实现，仅记录方向：

- 访问统计：当前不采集任何访问数据。计划接入境内统计服务，默认关闭，由部署者自行开启
- 小程序与第三方客户端：接口侧计划支持 Bearer 令牌鉴权
- 世系图与谱页版式：仍在调整，`docs/prototypes/` 下是用于对比的静态原型

## 参与方式

只接受需求、建议与问题反馈（issue），不接受代码 PR，所有代码由维护者本人实现。

## 许可证

GNU Affero General Public License v3.0，署名 Clantree Contributors。全文见 `LICENSE`。

AGPL 允许商业使用，但修改后通过网络向他人提供服务时，也必须以同样许可公开源代码。
