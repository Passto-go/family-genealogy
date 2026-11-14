# 家族族谱

本地优先的多租户家族族谱系统。前台以族谱为单位展示世系图与家族文献，后台维护多部族谱、族人与亲属关系。数据存储于单个 SQLite 文件，无需额外的数据库服务。

技术栈：React 19 + TypeScript + Vite + Tailwind CSS · Hono + SQLite（`node:sqlite`）。

## 功能概览

前台：

- 族谱总目：列出全部可公开访问的族谱
- 单部族谱：首页、世系图、家族文献
- 信息反馈：访客或族人提交纠错与补充，进入后台审核
- 访问统计：默认不加载任何统计脚本；后台配置服务商与标识后，仅在访客于页面底部选择「接受」时加载，拒绝或不作选择均不影响浏览、检索与打印

后台：

- 家族管理：新建与编辑族谱、路径标识、访问方式与口令、主谱标记、名号源流家训
- 成员管理：按族谱隔离，支持检索、按世次与房支筛选，绑定父/母/配偶（防跨谱与成环），Excel 模板导入导出
- 反馈审核：查看、处理、批量删除族人提交的信息
- 域名管理：为族谱绑定自有域名，仅超级管理员可见
- 站点设置、管理员账号、操作日志
- 登录安全：PBKDF2 口令哈希、TOTP 双因素认证、登录限流

后台操作的完整步骤见 [后台操作手册](docs/admin-manual.md)。

## 环境要求

- Node.js 24 及以上（依赖内置 `node:sqlite`）
- npm 11

## 快速开始

```bash
npm install
npm run dev
```

`dev` 同时启动接口（3001）与前端（5173）。启动完成后可访问以下入口：

| 入口 | 地址 |
| --- | --- |
| 族谱总目 | http://localhost:5173 |
| 单部族谱 | http://localhost:5173/t/:slug，首次建库后访问 `/t/chen` |
| 后台 | http://localhost:5173/admin |
| 健康检查 | http://localhost:3001/api/health |

`/api/health` 仅返回 `{"ok":true}`，不读取数据库，也不涉及个人数据。

首次启动时自动建库，写入示例族谱（颍川陈氏 · 七世四十人），并创建管理员 `admin`。初始密码随机生成并打印在启动日志中，也可通过 `INITIAL_ADMIN_PASSWORD` 指定。首次登录须修改密码；超级管理员还须绑定 TOTP 验证器。后台仅能从 `/admin` 直接进入，前台不设管理入口。

删除 `server/data/family.db` 后重启，即可恢复为初始示例数据。

## 访问控制

| 访问方式 | 首页 / 家族文献 | 世系图 | 门户列表 |
| --- | --- | --- | --- |
| 公开 `public` | 可读 | 可读 | 展示 |
| 密码 `password` | 可读 | 需访问口令（按 IP + 族谱限流） | 展示 |
| 私密 `private` | 管理员登录后可读 | 管理员可读 | 不展示，非管理员访问按「不存在」处理 |

口令以 PBKDF2 哈希存储，访问凭证与管理员会话相互独立；访问凭证绑定当前口令指纹，管理员改密后旧凭证立即失效。族谱访问口令由后台随机生成，明文仅在生成时展示一次。世系数据按需请求，浏览首页与家族文献不触发口令校验。

## 环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `SESSION_SECRET` | 开发环境自动生成并存到 `server/data/.session-secret` | 会话签名密钥，至少 32 位。生产环境必须显式提供，缺失时拒绝启动 |
| `INITIAL_ADMIN_PASSWORD` | 随机生成并打印 | 首次建库时的管理员初始密码 |
| `PORT` | `3001` | 服务端口 |
| `DATABASE_FILE` | `server/data/family.db` | SQLite 文件路径 |
| `SESSION_COOKIE_NAME` | `fg_session` | 会话 Cookie 名 |
| `INTERNAL_API_TOKEN` | 空 | 宿主机证书脚本回写 TLS 状态所用的共享令牌；未配置时该组接口返回 403 |

访问统计不再通过构建期变量注入，改由后台「站点设置 → 访问统计接入」配置，保存后即时生效，无需重新构建。

## 生产部署

```bash
npm ci
npm run build
SESSION_SECRET=<32 位以上随机串> npm start
```

`npm start` 以生产模式运行，仅监听一个端口（默认 3001），同时托管 `dist/` 静态文件与 `/api`。

生产环境需满足以下条件：

- `SESSION_SECRET` 必须显式配置，且不得为占位符；缺失或不合规时进程拒绝启动
- 不存在 `dist/` 时，静态页面全部返回 404，因此必须先完成构建
- 建议前置 Nginx 完成 TLS 终止与反向代理

反向代理配置有两点要求：

- 由反向代理写入 `X-Real-IP` 与 `X-Forwarded-Proto`。应用仅采信这两个头，用于限流分桶与 Cookie `Secure` 判断
- 清除客户端自带的同名头，避免伪造头部绕过限流或 TLS 判断

进程守护用 systemd 即可。证书可以用 acme 客户端配合 DNS 接口自动续期，应用侧通过 `INTERNAL_API_TOKEN` 暴露的状态接口回写结果。

## 只读演示站

在线演示：<https://passto-go.github.io/family-genealogy/>（示例数据，只能查看，不能编辑；本演示不含纸面谱页导出功能）。

对外展示用的静态版，独立入口与独立产物，不影响主应用的构建。本地跑开发预览与构建：

```bash
npm run dev:demo      # 开发预览：http://localhost:5174/family-genealogy/
npm run build:demo    # 构建到 dist-demo/，按子路径 /family-genealogy/ 部署
```

细节见 `docs/demo-site.md`。

## 部署常见问题

部署里容易踩的先后顺序、依赖与必要条件，见 [部署常见问题与注意事项](docs/deployment-faq.md)。

## 数据与备份

- 全部族谱数据位于 `server/data/family.db` 单文件，使用 WAL 模式
- 备份应先停止服务，或连同 `family.db-wal`、`family.db-shm` 一并复制，避免得到不一致的快照
- 会话密钥位于 `server/data/.session-secret`，生产环境应改用 `SESSION_SECRET` 环境变量

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 前端与接口同时启动 |
| `npm run dev:api` | 仅启动接口（tsx watch） |
| `npm run dev:web` | 仅启动前端（Vite） |
| `npm run build` | 生产构建（前置执行审计数据生成与 CSP 哈希校验） |
| `npm start` | 以生产模式运行 |
| `npm run lint` | ESLint 检查 |
| `npm run preview` | 预览构建产物 |
| `npm test` | 运行 vitest 单元测试 |
| `npm run verify:csp` | 校验 `index.html` 内联脚本哈希与 CSP 声明是否一致 |
| `npm run audit:sync` | 由 `docs/audits/*.json` 重新生成前台安全检查数据 |
| `npm run audit:generation` | 批量校正族人世次（`scripts/fix-member-generation.mjs`） |

## 测试与持续集成

- 单元测试：`npm test`（vitest）。覆盖农历转换、世系排序、导入校验（含父母成环检测）、径向布局等纯逻辑，以及认证层：PBKDF2 校验、三类令牌的类型隔离与过期、会话撤销、TOTP 与密钥加解密
- 持续集成：`.github/workflows/ci.yml` 在推送到 `main` 与 PR 时运行 ESLint、生产构建（含类型检查）与单元测试，并以 `npm audit` 执行依赖漏洞审计（高危级，不阻断流水线）

## 目录结构

```
server/            后端：路由、鉴权、限流、SQLite 数据层、示例数据
  repo/            数据访问抽象与实现（local.ts + d1.ts + shared.ts + types.ts）
src/pages/         前台：族谱总目 / 首页 / 世系图 / 家族文献 / 法务
src/admin/         后台：家族、成员、反馈、域名、站点、管理员、操作日志
src/lib/           接口封装、租户上下文、访问门禁、导入导出
src/components/    UI 组件、世系树节点与布局算法
deploy/            自托管相关脚本：证书签发与续期、源码打包、管理员密码重置
  cert-manager/    ACME 证书签发、续期与 Nginx 443 模板
docs/              后台操作手册、二期功能文档、审计报告、维护日志与静态原型（数据为虚构）
docs/prototypes/   世系图版式的静态原型
scripts/           构建期工具：审计数据生成、CSP 哈希校验、世次校正、公开仓导出
```

## 开发说明

**共享数据层模块**：`server/repo/shared.ts` 是 `local.ts` 与 `d1.ts` 共用的字段常量（`FAMILY_COLUMNS`、`FAMILY_SELECT`、`MEMBER_SELECT`）与值映射（`familyValue`），属于普通源码，必须随仓库提交。

- 从仓库克隆后，`npm ci && npm run build` 应能直接完成编译
- 若构建报 `Cannot find module './shared.js'`，说明该文件未被跟踪或未提交。执行 `git add server/repo/shared.ts` 后重新提交即可，这属于配置错误，而非预期行为
- 公开仓导出基于 `git ls-files` 收集文件，新增文件必须先提交，否则导出产物会缺少文件并导致持续集成失败

**CSP 哈希**：首屏主题初始化脚本以 `index.html` 内联形式存在，CSP 使用 sha256 精确授权，未启用 `unsafe-inline`。修改该脚本（包括其中的注释与空白）后，必须同步更新 `server/app.ts` 中 `script-src` 的哈希值。`npm run build` 会在 `prebuild` 阶段自动校验，不一致时中止构建；也可单独执行 `npm run verify:csp`。若未同步，浏览器会拦截该脚本，表现为首屏主题闪烁，且控制台出现 CSP 违规记录。

## 安全与审计

- 审计报告：`docs/security-audit-report.md`（危害分级、已修复项、复测建议）
- 维护记录：`docs/maintenance-log.md`
- 复测数据：`docs/audits/*.json`，执行 `npm run audit:sync` 同步到前台「安全检查」页

## 二期规划

以下能力属于二期，当前版本尚未包含，或只具备基础能力。条目记录范围与方向，不代表已排期。

| 功能 | 当前状态 | 二期范围 |
| --- | --- | --- |
| 家族通知消息 | 未开发，代码中无相关实现 | 族人进入具体家族页（`/t/:slug`）时，以网页浮窗查看管理员发布的通知，可主动关闭；单向告知，不设回执、已读与回复。需求条目见 [家族通知消息（二期）](docs/family-notification-plan.md) |
| 访问统计 | 接入能力已具备：后台「站点设置 → 访问统计接入」可配置百度统计、友盟+、Google Analytics、Microsoft Clarity、Google Ads，访客在页面底部选择「接受」后才加载，默认不加载任何脚本 | 方向待定。当前缺口是站内没有数据视图，只能到各服务商后台查看，二期评估是否需要站内汇总页 |
| 第三方客户端接入 | 未开发。管理员接口目前仅支持 Cookie 会话，`Authorization: Bearer` 只用于宿主机证书脚本的内部接口 | 开放 Bearer 令牌鉴权，供第三方客户端只读访问（客户端实现不在本仓维护） |
| 世系图版式 | 可用，仍在调整 | 定稿后替换现有版式；`docs/prototypes/` 下为用于对比的静态原型（`lineage-proto`、`combo-redesign`），数据为虚构。纸面谱页导出功能已于 v2.0.0 移除 |

## 参与方式

欢迎通过 Issue 提出功能需求、改进建议与问题反馈。本项目目前由维护者本人负责开发与维护，暂未开放外部代码贡献（Pull Request）的合并通道；不过你的每一条建议与反馈都会被认真阅读，并作为后续迭代的参考。

## 许可证

GNU Affero General Public License v3.0，署名 Panda_Q。全文见 `LICENSE`。

AGPL 允许商业使用，但修改后通过网络向他人提供服务时，也必须以同样许可公开源代码。
