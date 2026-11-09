-- 家族族谱 · 数据库结构（Node 本地 SQLite 与 Cloudflare D1 共用同一份）
-- 多租户：family 为租户注册表，member.family_id 关联所属族谱

CREATE TABLE IF NOT EXISTS family (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  slug                  TEXT NOT NULL UNIQUE,
  tag                   TEXT NOT NULL UNIQUE,
  domain                TEXT NOT NULL DEFAULT '',
  visibility            TEXT NOT NULL DEFAULT 'password',
  access_password_hash  TEXT NOT NULL DEFAULT '',
  is_primary            INTEGER NOT NULL DEFAULT 0,
  theme                 TEXT NOT NULL DEFAULT '',
  surname               TEXT NOT NULL DEFAULT '',
  name                  TEXT NOT NULL DEFAULT '',
  hall_name             TEXT NOT NULL DEFAULT '',
  county                TEXT NOT NULL DEFAULT '',
  origin_place          TEXT NOT NULL DEFAULT '',
  founder_name          TEXT NOT NULL DEFAULT '',
  founded_year          TEXT NOT NULL DEFAULT '',
  intro                 TEXT NOT NULL DEFAULT '',
  motto                 TEXT NOT NULL DEFAULT '',
  rules                 TEXT NOT NULL DEFAULT '',
  preface               TEXT NOT NULL DEFAULT '',
  generation_poem       TEXT NOT NULL DEFAULT '',
  generation_poem_start INTEGER NOT NULL DEFAULT 1,
  branches              TEXT NOT NULL DEFAULT '[]',
  branch_heads          TEXT NOT NULL DEFAULT '{}',
  cover_image           TEXT NOT NULL DEFAULT '',
  footer_text           TEXT NOT NULL DEFAULT '',
  icp_number            TEXT NOT NULL DEFAULT '',
  police_number         TEXT NOT NULL DEFAULT '',
  show_extended_lineage INTEGER NOT NULL DEFAULT 0,
  -- 是否在前台公开展示：关闭后门户不列出、直接访问按不存在处理（仅超级管理员可改）
  is_published          INTEGER NOT NULL DEFAULT 1,
  -- 谱页是否排入出嫁女子后裔（两层，至孙辈，与世系图口径一致）：默认不含，仅超级管理员可改
  print_include_extended INTEGER NOT NULL DEFAULT 0,
  created_by            INTEGER REFERENCES admin_user(id) ON DELETE SET NULL,
  updated_by            INTEGER REFERENCES admin_user(id) ON DELETE SET NULL,
  created_at            TEXT NOT NULL DEFAULT '',
  updated_at            TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS member (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id     INTEGER NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  gender        TEXT NOT NULL DEFAULT 'male',
  generation    INTEGER NOT NULL DEFAULT 1,
  courtesy_name TEXT NOT NULL DEFAULT '',
  father_id     INTEGER REFERENCES member(id) ON DELETE SET NULL,
  mother_id     INTEGER REFERENCES member(id) ON DELETE SET NULL,
  spouse_id     INTEGER REFERENCES member(id) ON DELETE SET NULL,
  is_married_in INTEGER NOT NULL DEFAULT 0,
  is_branch_heir INTEGER NOT NULL DEFAULT 0,
  branch        TEXT NOT NULL DEFAULT '',
  birth_year    TEXT NOT NULL DEFAULT '',
  death_year    TEXT NOT NULL DEFAULT '',
  is_alive      INTEGER NOT NULL DEFAULT 1,
  burial_place  TEXT NOT NULL DEFAULT '',
  title         TEXT NOT NULL DEFAULT '',
  bio           TEXT NOT NULL DEFAULT '',
  sort_order    INTEGER NOT NULL DEFAULT 0,
  avatar_key    TEXT NOT NULL DEFAULT '',
  created_by    INTEGER REFERENCES admin_user(id) ON DELETE SET NULL,
  updated_by    INTEGER REFERENCES admin_user(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT '',
  updated_at    TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_member_family ON member (family_id);
CREATE INDEX IF NOT EXISTS idx_member_father ON member (father_id);
CREATE INDEX IF NOT EXISTS idx_member_mother ON member (mother_id);
CREATE INDEX IF NOT EXISTS idx_member_spouse ON member (spouse_id);
CREATE INDEX IF NOT EXISTS idx_member_generation ON member (generation);

-- 亲属提交的信息更新反馈（公开提交，后台审核）
-- family_id 可空：选「其他家族」时留空，由超级管理员分配；family_label 记录自选/未匹配家族名
CREATE TABLE IF NOT EXISTS member_submission (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id     INTEGER REFERENCES family(id) ON DELETE SET NULL,
  reporter_name TEXT NOT NULL DEFAULT '',
  message       TEXT NOT NULL DEFAULT '',
  payload       TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'pending',
  family_label  TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_submission_family ON member_submission (family_id);
CREATE INDEX IF NOT EXISTS idx_submission_status ON member_submission (status);

CREATE TABLE IF NOT EXISTS admin_user (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'super',
  is_disabled   INTEGER NOT NULL DEFAULT 0,
  last_login_at TEXT NOT NULL DEFAULT '',
  -- 普通管理员所属家族；超级管理员为 NULL（可管理全部家族）
  family_id     INTEGER REFERENCES family(id) ON DELETE SET NULL,
  -- 首次登录 / 密码被重置后必须修改密码，未修改前不得访问任何后台数据接口
  must_change_password INTEGER NOT NULL DEFAULT 0,
  -- 登录二次验证（验证器 / TOTP）：none 表示未启用；totp 表示已绑定
  mfa_type      TEXT NOT NULL DEFAULT 'none',
  -- 加密存储的 TOTP 密钥（AES-GCM），未启用时为空串
  mfa_secret    TEXT NOT NULL DEFAULT ''
);

-- 管理员操作审计日志（仅超级管理员可见；管理员被删除后日志保留，actor_id 置空但 actor_name 快照留存）
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id    INTEGER REFERENCES admin_user(id) ON DELETE SET NULL,
  actor_name  TEXT NOT NULL DEFAULT '',
  actor_role  TEXT NOT NULL DEFAULT '',
  action      TEXT NOT NULL,
  target_type TEXT NOT NULL DEFAULT '',
  target_id   TEXT NOT NULL DEFAULT '',
  detail      TEXT NOT NULL DEFAULT '',
  prev_hash   TEXT NOT NULL DEFAULT '',
  hash        TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT ''
);

-- 已登出的会话令牌黑名单：jti 为会话唯一标识，expires_at 为会话到期时间（毫秒）
CREATE TABLE IF NOT EXISTS revoked_session (
  jti         TEXT PRIMARY KEY,
  expires_at  INTEGER NOT NULL
);

-- 平台级全局配置（键值对）：如网站名称（标签页标题 / 水印 / 页脚品牌等）
CREATE TABLE IF NOT EXISTS system_setting (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

-- 自动 TLS 证书域名：超级管理员在后台绑定后写入待签发状态（pending），
-- 宿主机 cert-manager 轮询并通过 acme.sh（DNS-01 / 阿里云 DNS）签发/续期，回写状态与到期时间。
CREATE TABLE IF NOT EXISTS domains (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  domain       TEXT NOT NULL UNIQUE,
  status       TEXT NOT NULL DEFAULT 'pending',
  expiry_date  TEXT NOT NULL DEFAULT '',
  cert_path    TEXT NOT NULL DEFAULT '',
  last_error   TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL DEFAULT '',
  updated_at   TEXT NOT NULL DEFAULT ''
);
