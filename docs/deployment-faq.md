# 部署常见问题与注意事项

面向自托管部署。按「先做什么、后做什么」排列，遇到报错先对照这里，再翻 `deploy/` 下的具体脚本说明。

## 一、开工前必须满足的条件

- Node.js 24 及以上、npm 11。应用依赖内置 `node:sqlite`，低版本直接起不来。装完自检：
  `node -e 'const {DatabaseSync}=require("node:sqlite");console.log(typeof DatabaseSync)'`
- 生产环境必须显式提供 `SESSION_SECRET`，至少 32 位、不能是占位符。缺了不是告警，是**拒绝启动**。
- 数据库所在目录必须存在且进程可写，SQLite 还要能在同目录建 `-wal` 与 `-shm`。
- 必须先有 `dist/` 才能提供页面。生产模式只在 `dist` 存在时挂静态托管，否则 `/api/health` 正常而页面全 404。
- 应用默认监听 `3001`，由反向代理转到 `127.0.0.1:3001`。
- 境内主机对公网提供网站服务前，需要先完成域名 ICP 备案。

## 二、顺序：先构建，再启动

- 前端改动，以及任何 `VITE_` 开头的变量（例如统计站点标识），都在**构建期**写进产物。改完必须重新 `npm run build`，只重启进程不生效。
- `npm run build` 会先跑 `prebuild` 审计脚本，构建失败先看它，不要先怀疑 TypeScript。
- macOS 打包会带 `._*` 与 `.DS_Store`，上传后先删：`find . -name '._*' -delete && find . -name '.DS_Store' -delete`。
- 源码包用 `deploy/pack-source.sh` 生成，不要手敲 tar。手工打容易把编辑器配置、本地数据库一起带上去。
- npm 11 会拦 `esbuild` 的 postinstall 并告警，实测不影响 `vite build`。

## 三、反向代理的四件必做事项

1. 下发 `X-Real-IP` 与 `X-Forwarded-Proto`。应用只信这两个头，用于限流分桶、水印来源 IP 与 Cookie `Secure`/HSTS 判断。
2. 清空客户端自带的 `CF-Connecting-IP` 与 `X-Forwarded-Host`。不清就能伪造来源 IP 绕过限流、伪造水印来源，或绕过 CSRF 同源校验。
3. `client_max_body_size` 至少 `10m`。nginx 默认 1m，会先把 5MB 的头像与批量导入挡掉，前端只看到 413。
4. 改完先 `nginx -t`，再 reload。443 站点模板由证书脚本生成，不要手改那一份。

## 四、HTTPS 与证书：依赖关系最强的一段

- **域名先解析到本机，再签证书**。脚本走阿里云 DNS API（DNS-01），不依赖 80 端口，但 DNS 凭证无效就签不下来。
- `INTERNAL_API_TOKEN` 在应用环境变量与证书脚本环境变量里必须**完全一致**。不一致时证书可能签下来，但状态回写一律 403，后台永远显示「签发中」。
- `STAGING` 只用于联调，正式签发不能带。staging 证书浏览器不信任，验完必须清理，不能留在 443 上。
- 证书签发成功后 443 模板才生效。HSTS 有效期一年，续期一旦失败，已访问过的浏览器无法降级回 HTTP，所以续期健康度要当作线上可用性的一部分。
- 脚本上传后权限会被重置为 `0644`，必须 `chmod 0755`，否则 systemd 报 `203/EXEC`；env 文件确认回到 `0600`。
- 手动执行证书脚本不会自动加载环境变量（systemd 才注入），先 `set -a; . <env 文件>; set +a`。
- 定时器每 6 小时检查一次，改动 Nginx 前先备份 `/etc/nginx`。

## 五、首次启动与账号

- 首次启动自动建库、写入示例族谱，管理员 `admin` 的初始密码打印在启动日志里，也可用 `INITIAL_ADMIN_PASSWORD` 指定。
- **上线前必须清理示例数据**，否则对外展示的是演示族谱。
- 超管首次登录强制改密并绑定 TOTP。TOTP 密钥用 `SESSION_SECRET` 派生加密后落库，**换 `SESSION_SECRET` 会让已绑定的验证器解不开**，只能重置后重新绑定；换密钥同时让所有会话失效，务必放在维护窗口做。
- 忘记密码用 `deploy/reset-admin-password.sh` 直接改库，改完重启进程生效。

## 六、数据与备份

- 单文件 SQLite + WAL。备份要么停服务，要么把主库、`-wal`、`-shm` 三个文件一起复制，否则可能拿到不一致的快照。
- 恢复时三个文件一起放回，并确认目录与文件属主可写，否则进程启动即退出。
- 改 `DATABASE_FILE` 后记得迁移旧库，应用不会自动搬运。

## 七、访问控制相关的排查提示

- `private` 族谱对非管理员按「不存在」处理，前台看不到不一定是路由坏了。
- `password` 族谱只配 Nginx 白名单没用，世系数据仍要口令凭证；只读首页与家族文献不触发口令校验，别据此判断口令没生效。
- 后台没有前台入口，只能直接访问 `/admin`，不是部署漏了。

## 八、常见报错对照

| 现象 | 常见原因 | 处理 |
| --- | --- | --- |
| 进程秒退，日志提示 `SESSION_SECRET` 未安全配置 | 未设置、短于 32 位或仍是占位符 | 配好再启动 |
| 页面 404，`/api/health` 却正常 | 没有 `dist/` 或路径不对 | 先 `npm run build`，确认产物目录 |
| 登录后很快掉线 | `SESSION_SECRET` 每次启动都变（没固定，或用了开发态的自动生成值） | 固定环境变量，重启间保持不变 |
| 上传头像或导入报 413 | Nginx 请求体上限 | `client_max_body_size 10m` 后 reload |
| 后台证书一直是「签发中」 | `INTERNAL_API_TOKEN` 不一致、DNS 凭证失效、域名未解析 | 逐项核对后重跑脚本 |
| acme 报 `No EAB credentials found for ZeroSSL` | 用了 acme.sh 默认 CA | 正式签发显式 `--server letsencrypt`，清理误建的 ZeroSSL 账号后重试 |
| 限流误伤、水印显示别人 IP | 反代头没按第三节配置，客户端伪造头没清 | 修 Nginx 后 reload |
| 提交反馈或登录返回 403 | CSRF 同源判定失败，常见于多级代理改了 Host | 保留 `Host $host`，检查代理链 |

> 应用按站点根路径部署。要放在子路径下，需要同时改前端构建的 `base` 与静态托管路径，只改 Nginx 前缀会白屏。只读演示站（`docs/demo-site.md`）就是一个独立 `base` 的例子。
