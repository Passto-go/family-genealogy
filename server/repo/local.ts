import fs from "node:fs"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"
import { fileURLToPath } from "node:url"
import {
  nowIso,
  rowToAdmin,
  rowToFamily,
  rowToMember,
  rowToMemberSubmission,
  rowToAuditLog,
  auditLogWhere,
  type AdminUser,
  type Family,
  type FamilyInput,
  type Member,
  type MemberInput,
  type MemberSubmission,
  type MemberSubmissionInput,
  type AuditLog,
  type AuditLogEntry,
  type Domain,
  type Repo,
  type SubmissionStatus,
  rowToDomain,
} from "./types.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SCHEMA_PATH = path.join(__dirname, "..", "schema.sql")

type Row = Record<string, unknown>
type SqlValue = string | number | null

function bind(value: unknown): SqlValue {
  if (value === undefined || value === null) return null
  if (typeof value === "boolean") return value ? 1 : 0
  return value as SqlValue
}

const FAMILY_COLUMNS: Record<keyof FamilyInput, string> = {
  slug: "slug",
  tag: "tag",
  domain: "domain",
  visibility: "visibility",
  accessPasswordHash: "access_password_hash",
  isPrimary: "is_primary",
  theme: "theme",
  surname: "surname",
  name: "name",
  hallName: "hall_name",
  county: "county",
  originPlace: "origin_place",
  founderName: "founder_name",
  foundedYear: "founded_year",
  intro: "intro",
  motto: "motto",
  rules: "rules",
  preface: "preface",
  generationPoem: "generation_poem",
  generationPoemStart: "generation_poem_start",
  branches: "branches",
  branchHeads: "branch_heads",
  coverImage: "cover_image",
  footerText: "footer_text",
  icpNumber: "icp_number",
  policeNumber: "police_number",
  showExtendedLineage: "show_extended_lineage",
  isPublished: "is_published",
  printIncludeExtended: "print_include_extended",
}

function familyValue(key: keyof FamilyInput, raw: unknown): SqlValue {
  if (key === "branches") return JSON.stringify(Array.isArray(raw) ? raw : [])
  if (key === "branchHeads")
    return JSON.stringify(raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {})
  if (key === "isPrimary" || key === "isPublished" || key === "printIncludeExtended")
    return raw ? 1 : 0
  return bind(raw)
}

export function createLocalRepo(dbFile: string): Repo {
  fs.mkdirSync(path.dirname(dbFile), { recursive: true })

  const db = new DatabaseSync(dbFile)
  db.exec("PRAGMA journal_mode = WAL")
  db.exec("PRAGMA foreign_keys = ON")

  const all = (sql: string, ...params: SqlValue[]): Row[] =>
    db.prepare(sql).all(...params) as unknown as Row[]
  const one = (sql: string, ...params: SqlValue[]): Row | undefined =>
    db.prepare(sql).get(...params) as unknown as Row | undefined
  const run = (sql: string, ...params: SqlValue[]) => db.prepare(sql).run(...params)

  const tableColumns = (table: string): string[] =>
    (db.prepare(`PRAGMA table_info(${table})`).all() as unknown as Row[]).map((row) =>
      String(row.name),
    )
  const hasTable = (table: string): boolean =>
    Boolean(
      one("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", table),
    )

  // ── 旧库迁移：family 单例 → 多租户；member 增加 family_id ──
  if (hasTable("family")) {
    const columns = tableColumns("family")
    if (!columns.includes("slug")) {
      const branchesExpr = columns.includes("branches") ? "COALESCE(branches, '[]')" : "'[]'"
      run("PRAGMA foreign_keys = OFF")
      run(`CREATE TABLE family_v2 (
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
        cover_image           TEXT NOT NULL DEFAULT '',
        footer_text           TEXT NOT NULL DEFAULT '',
        updated_at            TEXT NOT NULL DEFAULT ''
      )`)
      run(
        `INSERT INTO family_v2
          (id, slug, tag, domain, visibility, access_password_hash, is_primary, theme,
           surname, name, hall_name, county, origin_place, founder_name, founded_year,
           intro, motto, rules, preface, generation_poem, branches, cover_image, footer_text, updated_at)
         SELECT id, 'example', '', '', 'password', '', 1, '',
           surname, name, hall_name, county, origin_place, founder_name, founded_year,
           intro, motto, rules, preface, generation_poem, ${branchesExpr}, cover_image, footer_text, updated_at
         FROM family`,
      )
      run("DROP TABLE family")
      run("ALTER TABLE family_v2 RENAME TO family")
      run("PRAGMA foreign_keys = ON")
    }
  }

  if (hasTable("member")) {
    const columns = tableColumns("member")
    if (!columns.includes("family_id")) {
      run("ALTER TABLE member ADD COLUMN family_id INTEGER NOT NULL DEFAULT 1")
    }
  }

  // 旧库迁移：family 增加字辈起始世次（仅对缺列者执行，不影响新库）
  if (hasTable("family") && !tableColumns("family").includes("generation_poem_start")) {
    run("ALTER TABLE family ADD COLUMN generation_poem_start INTEGER NOT NULL DEFAULT 1")
  }
  // 旧库迁移：family 增加「延伸展示出嫁女子后裔」开关（仅对缺列者执行，不影响新库）
  if (hasTable("family") && !tableColumns("family").includes("show_extended_lineage")) {
    run("ALTER TABLE family ADD COLUMN show_extended_lineage INTEGER NOT NULL DEFAULT 0")
  }
  // 旧库迁移：family 增加「是否在前台公开展示」（旧库一律按开启处理，避免族谱突然从前台消失）
  if (hasTable("family") && !tableColumns("family").includes("is_published")) {
    run("ALTER TABLE family ADD COLUMN is_published INTEGER NOT NULL DEFAULT 1")
  }
  // 旧库迁移：family 增加「谱页是否含外衍（两层，至孙辈）」（默认不含）
  if (hasTable("family") && !tableColumns("family").includes("print_include_extended")) {
    run("ALTER TABLE family ADD COLUMN print_include_extended INTEGER NOT NULL DEFAULT 0")
  }

  // 旧库迁移：family 增加备案号（仅对缺列者执行，不影响新库）
  if (hasTable("family") && !tableColumns("family").includes("icp_number")) {
    run("ALTER TABLE family ADD COLUMN icp_number TEXT NOT NULL DEFAULT ''")
  }
  if (hasTable("family") && !tableColumns("family").includes("police_number")) {
    run("ALTER TABLE family ADD COLUMN police_number TEXT NOT NULL DEFAULT ''")
  }
  // 旧库迁移：family 增加结构性房支房主映射（仅对缺列者执行，不影响新库）
  if (hasTable("family") && !tableColumns("family").includes("branch_heads")) {
    run("ALTER TABLE family ADD COLUMN branch_heads TEXT NOT NULL DEFAULT '{}'")
  }

  // 旧库迁移：admin_user 增加角色与停用标记（仅对缺列者执行，不影响新库）
  if (hasTable("admin_user")) {
    const cols = tableColumns("admin_user")
    if (!cols.includes("role")) {
      run("ALTER TABLE admin_user ADD COLUMN role TEXT NOT NULL DEFAULT 'super'")
    }
    if (!cols.includes("is_disabled")) {
      run("ALTER TABLE admin_user ADD COLUMN is_disabled INTEGER NOT NULL DEFAULT 0")
    }
    if (!cols.includes("family_id")) {
      run("ALTER TABLE admin_user ADD COLUMN family_id INTEGER REFERENCES family(id) ON DELETE SET NULL")
    }
    if (!cols.includes("must_change_password")) {
      run("ALTER TABLE admin_user ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0")
    }
    if (!cols.includes("mfa_type")) {
      run("ALTER TABLE admin_user ADD COLUMN mfa_type TEXT NOT NULL DEFAULT 'none'")
    }
    if (!cols.includes("mfa_secret")) {
      run("ALTER TABLE admin_user ADD COLUMN mfa_secret TEXT NOT NULL DEFAULT ''")
    }
  }
  // H4：会话撤销黑名单（幂等建表，旧库与新库均适用）
  run("CREATE TABLE IF NOT EXISTS revoked_session (jti TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)")
  // M-9：「登出所有设备」的账号级会话失效时间（幂等建表）
  run("CREATE TABLE IF NOT EXISTS session_invalidation (uid INTEGER PRIMARY KEY, invalidated_at INTEGER NOT NULL)")

  // 旧库迁移：family / member 增加维护人留痕字段（created_by / updated_by / created_at）
  if (hasTable("family")) {
    const cols = tableColumns("family")
    if (!cols.includes("created_by")) {
      run("ALTER TABLE family ADD COLUMN created_by INTEGER REFERENCES admin_user(id) ON DELETE SET NULL")
    }
    if (!cols.includes("updated_by")) {
      run("ALTER TABLE family ADD COLUMN updated_by INTEGER REFERENCES admin_user(id) ON DELETE SET NULL")
    }
    if (!cols.includes("created_at")) {
      run("ALTER TABLE family ADD COLUMN created_at TEXT NOT NULL DEFAULT ''")
    }
  }
  if (hasTable("member")) {
    const cols = tableColumns("member")
    if (!cols.includes("created_by")) {
      run("ALTER TABLE member ADD COLUMN created_by INTEGER REFERENCES admin_user(id) ON DELETE SET NULL")
    }
    if (!cols.includes("updated_by")) {
      run("ALTER TABLE member ADD COLUMN updated_by INTEGER REFERENCES admin_user(id) ON DELETE SET NULL")
    }
    if (!cols.includes("avatar_key")) {
      run("ALTER TABLE member ADD COLUMN avatar_key TEXT NOT NULL DEFAULT ''")
    }
    if (!cols.includes("is_branch_heir")) {
      run("ALTER TABLE member ADD COLUMN is_branch_heir INTEGER NOT NULL DEFAULT 0")
    }
  }

  // 旧库迁移：member_submission 增加 family_label 并允许 family_id 为空（「其他家族」）
  if (hasTable("member_submission") && !tableColumns("member_submission").includes("family_label")) {
    run("PRAGMA foreign_keys = OFF")
    run(`CREATE TABLE member_submission_v2 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      family_id INTEGER REFERENCES family(id) ON DELETE SET NULL,
      reporter_name TEXT NOT NULL DEFAULT '',
      message TEXT NOT NULL DEFAULT '',
      payload TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT ''
    )`)
    run(
      `INSERT INTO member_submission_v2 (id, family_id, reporter_name, message, payload, status, created_at)
       SELECT id, family_id, reporter_name, message, payload, status, created_at FROM member_submission`,
    )
    run("DROP TABLE member_submission")
    run("ALTER TABLE member_submission_v2 ADD COLUMN family_label TEXT NOT NULL DEFAULT ''")
    run("CREATE INDEX IF NOT EXISTS idx_submission_family ON member_submission (family_id)")
    run("CREATE INDEX IF NOT EXISTS idx_submission_status ON member_submission (status)")
    run("PRAGMA foreign_keys = ON")
  }

  db.exec(fs.readFileSync(SCHEMA_PATH, "utf8"))

  // A017：审计日志哈希链——为 admin_audit_log 增加 prev_hash / hash，确保日志不可篡改
  if (hasTable("admin_audit_log")) {
    const auditCols = tableColumns("admin_audit_log")
    if (!auditCols.includes("prev_hash")) {
      run("ALTER TABLE admin_audit_log ADD COLUMN prev_hash TEXT NOT NULL DEFAULT ''")
    }
    if (!auditCols.includes("hash")) {
      run("ALTER TABLE admin_audit_log ADD COLUMN hash TEXT NOT NULL DEFAULT ''")
    }
  }

  // 联表取维护人姓名（创建人 / 最近修改人），管理员被删后姓名快照仍存在
  const FAMILY_SELECT = `SELECT f.*, cu.username AS created_by_name, uu.username AS updated_by_name
    FROM family f
    LEFT JOIN admin_user cu ON cu.id = f.created_by
    LEFT JOIN admin_user uu ON uu.id = f.updated_by`
  const MEMBER_SELECT = `SELECT m.*, cu.username AS created_by_name, uu.username AS updated_by_name
    FROM member m
    LEFT JOIN admin_user cu ON cu.id = m.created_by
    LEFT JOIN admin_user uu ON uu.id = m.updated_by`

  const insertFamily = (input: FamilyInput, actorId: number | null): number => {
    const keys = Object.keys(FAMILY_COLUMNS) as (keyof FamilyInput)[]
    const columns = keys.map((key) => FAMILY_COLUMNS[key])
    const placeholders = keys.map(() => "?")
    const values = keys.map((key) => familyValue(key, input[key]))
    const stamp = nowIso()
    const result = run(
      `INSERT INTO family (${columns.join(", ")}, created_by, updated_by, created_at, updated_at)
       VALUES (${placeholders.join(", ")}, ?, ?, ?, ?)`,
      ...values,
      actorId,
      actorId,
      stamp,
      stamp,
    )
    return Number(result.lastInsertRowid)
  }

  return {
    async getFamilyById(id): Promise<Family | null> {
      const row = one(`${FAMILY_SELECT} WHERE f.id = ?`, id)
      return row ? rowToFamily(row) : null
    },

    async getFamilyBySlug(slug): Promise<Family | null> {
      const row = one(`${FAMILY_SELECT} WHERE f.slug = ?`, slug)
      return row ? rowToFamily(row) : null
    },

    async getPrimaryFamily(): Promise<Family | null> {
      const row = one(`${FAMILY_SELECT} ORDER BY f.is_primary DESC, f.id ASC LIMIT 1`)
      return row ? rowToFamily(row) : null
    },

    async getSetting(key): Promise<string> {
      const row = one("SELECT value FROM system_setting WHERE key = ?", key)
      return row ? String(row.value ?? "") : ""
    },

    async setSetting(key, value): Promise<void> {
      run(
        "INSERT INTO system_setting (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        key,
        value,
      )
    },

    async listDomains(): Promise<Domain[]> {
      return all("SELECT * FROM domains ORDER BY created_at DESC, id DESC").map(rowToDomain)
    },

    async getDomain(id): Promise<Domain | null> {
      const row = one("SELECT * FROM domains WHERE id = ?", id)
      return row ? rowToDomain(row) : null
    },

    async createDomain(domain, actorId): Promise<number> {
      void actorId
      const stamp = nowIso()
      const result = run(
        "INSERT INTO domains (domain, status, created_at, updated_at) VALUES (?, 'pending', ?, ?)",
        domain,
        stamp,
        stamp,
      )
      return Number(result.lastInsertRowid)
    },

    async updateDomainStatus(id, status, opts = {}): Promise<void> {
      const sets: string[] = ["status = ?", "updated_at = ?"]
      const values: SqlValue[] = [status, nowIso()]
      if (opts.expiry !== undefined) {
        sets.push("expiry_date = ?")
        values.push(opts.expiry)
      }
      if (opts.certPath !== undefined) {
        sets.push("cert_path = ?")
        values.push(opts.certPath)
      }
      if (opts.error !== undefined) {
        sets.push("last_error = ?")
        values.push(opts.error)
      }
      values.push(id)
      run(`UPDATE domains SET ${sets.join(", ")} WHERE id = ?`, ...values)
    },

    async deleteDomain(id): Promise<void> {
      run("DELETE FROM domains WHERE id = ?", id)
    },

    async listFamilies(): Promise<Family[]> {
      return all(`${FAMILY_SELECT} ORDER BY f.is_primary DESC, f.id ASC`).map(rowToFamily)
    },

    async createFamily(input, actorId): Promise<number> {
      return insertFamily(input, actorId)
    },

    async updateFamily(id, patch, actorId): Promise<Family> {
      const sets: string[] = []
      const values: SqlValue[] = []
      for (const [key, column] of Object.entries(FAMILY_COLUMNS) as [
        keyof FamilyInput,
        string,
      ][]) {
        if (key in patch) {
          sets.push(`${column} = ?`)
          values.push(familyValue(key, (patch as Record<string, unknown>)[key]))
        }
      }
      sets.push("updated_by = ?")
      sets.push("updated_at = ?")
      values.push(actorId)
      values.push(nowIso())
      run(`UPDATE family SET ${sets.join(", ")} WHERE id = ?`, ...values, id)
      const row = one(`${FAMILY_SELECT} WHERE f.id = ?`, id)
      if (!row) throw new Error("家族信息不存在")
      return rowToFamily(row)
    },

    async listMembers(familyId): Promise<Member[]> {
      return all(
        `${MEMBER_SELECT} WHERE m.family_id = ? ORDER BY m.generation ASC, m.sort_order ASC, m.id ASC`,
        familyId,
      ).map(rowToMember)
    },

    async getMember(id): Promise<Member | null> {
      const row = one(`${MEMBER_SELECT} WHERE m.id = ?`, id)
      return row ? rowToMember(row) : null
    },

    async createMember(input: MemberInput, actorId): Promise<number> {
      // 自动代入父/母信息：世次 = 父/母世次 + 1（父亲优先）；房支为空时继承父/母房支（不论房主）；
      // 父母互为配偶：填了父亲、母亲为空时，自动代入父亲的配偶作为母亲（反之亦然）
      let memberGeneration = input.generation
      let memberBranch = input.branch
      let memberFatherId = input.fatherId
      let memberMotherId = input.motherId
      if (memberFatherId != null) {
        const parentRow = one(`${MEMBER_SELECT} WHERE m.id = ?`, memberFatherId)
        if (parentRow) {
          const parent = rowToMember(parentRow)
          memberGeneration = parent.generation + 1
          if (!memberBranch && parent.branch) memberBranch = parent.branch
          if (memberMotherId == null && parent.spouseId != null && parent.spouseId !== memberFatherId) {
            memberMotherId = parent.spouseId
          }
        }
      } else if (memberMotherId != null) {
        const parentRow = one(`${MEMBER_SELECT} WHERE m.id = ?`, memberMotherId)
        if (parentRow) {
          const parent = rowToMember(parentRow)
          memberGeneration = parent.generation + 1
          if (!memberBranch && parent.branch) memberBranch = parent.branch
          if (memberFatherId == null && parent.spouseId != null && parent.spouseId !== memberMotherId) {
            memberFatherId = parent.spouseId
          }
        }
      }
      const stamp = nowIso()
      const result = run(
        `INSERT INTO member (family_id, name, gender, generation, courtesy_name, father_id, mother_id, spouse_id,
          is_married_in, is_branch_heir, branch, birth_year, death_year, is_alive, burial_place, title, bio, sort_order,
          created_by, updated_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        bind(input.familyId),
        bind(input.name),
        bind(input.gender),
        bind(memberGeneration),
        bind(input.courtesyName),
        bind(memberFatherId),
        bind(memberMotherId),
        bind(input.spouseId),
        input.isMarriedIn ? 1 : 0,
        input.isBranchHeir ? 1 : 0,
        bind(memberBranch),
        bind(input.birthYear),
        bind(input.deathYear),
        input.isAlive ? 1 : 0,
        bind(input.burialPlace),
        bind(input.title),
        bind(input.bio),
        bind(input.sortOrder),
        actorId,
        actorId,
        stamp,
        stamp,
      )
      return Number(result.lastInsertRowid)
    },

    async bulkCreateMembers(familyId, rows, actorId): Promise<number[]> {
      // 批内亲属用「表内编号」引用：普通编号指向同批已插入的行，@数字 指向库内已有成员。
      // rows 已由调用方按世次升序排好，父辈一定先于子辈插入，因此边插边解析即可。
      const idByNo = new Map<string, number>()
      const idOf = (no: string): number | null => {
        if (!no) return null
        if (no.startsWith("@")) {
          const id = Number(no.slice(1))
          return Number.isFinite(id) && id > 0 ? id : null
        }
        return idByNo.get(no) ?? null
      }

      // node:sqlite 为同步驱动，事务体内不会让出到其他请求的宏任务，可安全使用 BEGIN。
      run("BEGIN")
      try {
        const ids: number[] = []
        for (const row of rows) {
          const fatherId = idOf(row.fatherNo)
          if (row.fatherNo && fatherId == null) throw new Error(`第 ${row.no} 行的父辈编号不存在`)
          const motherId = idOf(row.motherNo)
          if (row.motherNo && motherId == null) throw new Error(`第 ${row.no} 行的母辈编号不存在`)

          const id = await this.createMember(
            {
              familyId,
              name: row.name,
              gender: row.gender,
              generation: row.generation,
              courtesyName: row.courtesyName,
              fatherId,
              motherId,
              // 配偶统一在插入完成后双向绑定，避免指向尚未产生的 id
              spouseId: null,
              isMarriedIn: row.isMarriedIn,
              isBranchHeir: row.isBranchHeir,
              branch: row.branch,
              birthYear: row.birthYear,
              deathYear: row.deathYear,
              isAlive: row.isAlive,
              burialPlace: row.burialPlace,
              title: row.title,
              bio: row.bio,
              sortOrder: row.sortOrder,
              avatarKey: row.avatarKey,
            },
            actorId,
          )
          idByNo.set(row.no, id)
          ids.push(id)
        }

        for (const row of rows) {
          if (!row.spouseNo) continue
          const selfId = idByNo.get(row.no)
          const otherId = idOf(row.spouseNo)
          if (!selfId || !otherId || selfId === otherId) continue
          // 双向绑定：配偶一侧若已有别的指向，以本次导入为准
          await this.setSpouseId(selfId, otherId)
          await this.setSpouseId(otherId, selfId)
        }

        run("COMMIT")
        return ids
      } catch (error) {
        try {
          run("ROLLBACK")
        } catch {
          // 回滚失败时保留原始错误，避免掩盖真实原因
        }
        throw error
      }
    },

    async updateMember(id, input, actorId): Promise<void> {
      // 自动代入父/母信息：世次 = 父/母世次 + 1（父亲优先）；房支为空时继承父/母房支（不论房主）；
      // 父母互为配偶：填了父亲、母亲为空时，自动代入父亲的配偶作为母亲（反之亦然）
      let memberGeneration = input.generation
      let memberBranch = input.branch
      let memberFatherId = input.fatherId
      let memberMotherId = input.motherId
      if (memberFatherId != null) {
        const parentRow = one(`${MEMBER_SELECT} WHERE m.id = ?`, memberFatherId)
        if (parentRow) {
          const parent = rowToMember(parentRow)
          memberGeneration = parent.generation + 1
          if (!memberBranch && parent.branch) memberBranch = parent.branch
          if (memberMotherId == null && parent.spouseId != null && parent.spouseId !== memberFatherId) {
            memberMotherId = parent.spouseId
          }
        }
      } else if (memberMotherId != null) {
        const parentRow = one(`${MEMBER_SELECT} WHERE m.id = ?`, memberMotherId)
        if (parentRow) {
          const parent = rowToMember(parentRow)
          memberGeneration = parent.generation + 1
          if (!memberBranch && parent.branch) memberBranch = parent.branch
          if (memberFatherId == null && parent.spouseId != null && parent.spouseId !== memberMotherId) {
            memberFatherId = parent.spouseId
          }
        }
      }
      run(
        `UPDATE member SET family_id = ?, name = ?, gender = ?, generation = ?, courtesy_name = ?, father_id = ?,
          mother_id = ?, spouse_id = ?, is_married_in = ?, is_branch_heir = ?, branch = ?, birth_year = ?, death_year = ?,
          is_alive = ?, burial_place = ?, title = ?, bio = ?, sort_order = ?, avatar_key = ?, updated_by = ?, updated_at = ?
         WHERE id = ?`,
        bind(input.familyId),
        bind(input.name),
        bind(input.gender),
        bind(memberGeneration),
        bind(input.courtesyName),
        bind(memberFatherId),
        bind(memberMotherId),
        bind(input.spouseId),
        input.isMarriedIn ? 1 : 0,
        input.isBranchHeir ? 1 : 0,
        bind(memberBranch),
        bind(input.birthYear),
        bind(input.deathYear),
        input.isAlive ? 1 : 0,
        bind(input.burialPlace),
        bind(input.title),
        bind(input.bio),
        bind(input.sortOrder),
        bind(input.avatarKey),
        actorId,
        nowIso(),
        id,
      )
    },

    async deleteMember(id): Promise<void> {
      run("UPDATE member SET spouse_id = NULL WHERE spouse_id = ?", id)
      run("DELETE FROM member WHERE id = ?", id)
    },

    async countReferences(id): Promise<number> {
      const row = one(
        `SELECT COUNT(*) AS n FROM member
         WHERE father_id = ? OR mother_id = ? OR spouse_id = ?`,
        id,
        id,
        id,
      )
      return Number(row?.n ?? 0)
    },

    async getDescendantIds(id): Promise<number[]> {
      const rows = all(
        `WITH RECURSIVE sub(id) AS (
           SELECT id FROM member WHERE father_id = ? OR mother_id = ?
           UNION
           SELECT m.id FROM member m
             JOIN sub ON m.father_id = sub.id OR m.mother_id = sub.id
         )
         SELECT id FROM sub`,
        id,
        id,
      )
      return rows.map((row) => Number(row.id))
    },

    async clearSpouse(spouseId): Promise<void> {
      run("UPDATE member SET spouse_id = NULL WHERE spouse_id = ?", spouseId)
    },

    async setSpouseId(id, spouseId): Promise<void> {
      run("UPDATE member SET spouse_id = ?, updated_at = ? WHERE id = ?", bind(spouseId), nowIso(), id)
    },

    async renameBranch(familyId, from, to, actorId): Promise<void> {
      run(
        "UPDATE member SET branch = ?, updated_by = ?, updated_at = ? WHERE family_id = ? AND branch = ?",
        to,
        actorId,
        nowIso(),
        familyId,
        from,
      )
    },

    async countMembers(familyId?): Promise<number> {
      if (familyId === undefined) {
        const row = one("SELECT COUNT(*) AS n FROM member")
        return Number(row?.n ?? 0)
      }
      const row = one("SELECT COUNT(*) AS n FROM member WHERE family_id = ?", familyId)
      return Number(row?.n ?? 0)
    },

    async getAdminByUsername(username): Promise<AdminUser | null> {
      const row = one("SELECT * FROM admin_user WHERE username = ?", username)
      return row ? rowToAdmin(row) : null
    },

    async countAdmins(): Promise<number> {
      const row = one("SELECT COUNT(*) AS n FROM admin_user")
      return Number(row?.n ?? 0)
    },

    async createAdmin(username, passwordHash, role = "super", familyId = null): Promise<void> {
      run(
        "INSERT INTO admin_user (username, password_hash, role, is_disabled, last_login_at, family_id, must_change_password, mfa_type, mfa_secret) VALUES (?, ?, ?, 0, '', ?, 1, 'none', '')",
        username,
        passwordHash,
        role,
        familyId,
      )
    },

    async getAdminById(id): Promise<AdminUser | null> {
      const row = one("SELECT * FROM admin_user WHERE id = ?", id)
      return row ? rowToAdmin(row) : null
    },

    async listAdmins(): Promise<AdminUser[]> {
      return all("SELECT * FROM admin_user ORDER BY id ASC").map(rowToAdmin)
    },

    async updateAdminRole(id, role): Promise<void> {
      run("UPDATE admin_user SET role = ? WHERE id = ?", role, id)
    },

    async setAdminFamily(id, familyId): Promise<void> {
      run("UPDATE admin_user SET family_id = ? WHERE id = ?", familyId, id)
    },

    async setAdminDisabled(id, disabled): Promise<void> {
      run("UPDATE admin_user SET is_disabled = ? WHERE id = ?", disabled ? 1 : 0, id)
    },

    async deleteAdmin(id): Promise<void> {
      run("DELETE FROM admin_user WHERE id = ?", id)
    },

    async updateAdminPassword(id, passwordHash): Promise<void> {
      run("UPDATE admin_user SET password_hash = ? WHERE id = ?", passwordHash, id)
    },

    async touchAdminLogin(id): Promise<void> {
      run("UPDATE admin_user SET last_login_at = ? WHERE id = ?", nowIso(), id)
    },

    async setMustChangePassword(id, required): Promise<void> {
      run("UPDATE admin_user SET must_change_password = ? WHERE id = ?", required ? 1 : 0, id)
    },

    async enableMfa(id, encryptedSecret): Promise<void> {
      run("UPDATE admin_user SET mfa_secret = ?, mfa_type = 'totp' WHERE id = ?", encryptedSecret, id)
    },

    async disableMfa(id): Promise<void> {
      run("UPDATE admin_user SET mfa_secret = '', mfa_type = 'none' WHERE id = ?", id)
    },

    async revokeSession(jti, expiresAt): Promise<void> {
      run("DELETE FROM revoked_session WHERE expires_at <= ?", Date.now())
      run("INSERT OR REPLACE INTO revoked_session (jti, expires_at) VALUES (?, ?)", jti, expiresAt)
    },

    async isSessionRevoked(jti): Promise<boolean> {
      const row = one(
        "SELECT 1 AS hit FROM revoked_session WHERE jti = ? AND expires_at > ?",
        jti,
        Date.now(),
      )
      return Boolean(row)
    },

    async revokeAllSessions(uid): Promise<void> {
      run(
        "INSERT OR REPLACE INTO session_invalidation (uid, invalidated_at) VALUES (?, ?)",
        uid,
        Date.now(),
      )
    },

    async sessionInvalidatedAt(uid): Promise<number> {
      const row = one(
        "SELECT invalidated_at FROM session_invalidation WHERE uid = ?",
        uid,
      ) as { invalidated_at: number } | null
      return row ? row.invalidated_at : 0
    },

    async createSubmission(input: MemberSubmissionInput): Promise<number> {
      const stamp = nowIso()
      const result = run(
        `INSERT INTO member_submission (family_id, reporter_name, message, payload, status, family_label, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        bind(input.familyId === 0 ? null : input.familyId),
        bind(input.reporterName),
        bind(input.message),
        bind(input.payload),
        bind(input.status),
        bind(input.familyLabel ?? ""),
        stamp,
      )
      return Number(result.lastInsertRowid)
    },

    async listSubmissions(familyId?: number | null, status?: string): Promise<MemberSubmission[]> {
      const where: string[] = []
      const params: SqlValue[] = []
      if (familyId === null) {
        where.push("family_id IS NULL")
      } else if (familyId !== undefined) {
        where.push("family_id = ?")
        params.push(familyId)
      }
      if (status) {
        where.push("status = ?")
        params.push(status)
      }
      const sql =
        "SELECT * FROM member_submission" +
        (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
        " ORDER BY created_at DESC, id DESC"
      return all(sql, ...params).map(rowToMemberSubmission)
    },

    async getSubmission(id): Promise<MemberSubmission | null> {
      const row = one("SELECT * FROM member_submission WHERE id = ?", id)
      return row ? rowToMemberSubmission(row) : null
    },

    async setSubmissionStatus(id, status: SubmissionStatus): Promise<void> {
      run("UPDATE member_submission SET status = ? WHERE id = ?", bind(status), id)
    },

    async deleteSubmissions(ids: number[]): Promise<number> {
      const clean = [...new Set(ids.filter((n) => Number.isInteger(n) && n > 0))]
      if (clean.length === 0) return 0
      const placeholders = clean.map(() => "?").join(", ")
      const result = run(
        `DELETE FROM member_submission WHERE id IN (${placeholders})`,
        ...clean,
      )
      return Number((result as { changes?: number }).changes ?? 0)
    },

    async appendAuditLog(entry: AuditLogEntry): Promise<void> {
      const createdAt = nowIso()
      // A017：每条日志记载上一条的 hash，形成不可篡改的链式结构
      const prevRow = one("SELECT hash FROM admin_audit_log ORDER BY id DESC LIMIT 1")
      const prevHash = (prevRow?.hash ? String(prevRow.hash) : "GENESIS") as string
      const chainInput =
        `${prevHash}|${entry.actorId}|${entry.actorName}|${entry.actorRole}|` +
        `${entry.action}|${entry.targetType}|${entry.targetId}|${entry.detail}|${createdAt}`
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(chainInput) as unknown as BufferSource,
      )
      const hash = Buffer.from(new Uint8Array(digest)).toString("hex")
      run(
        `INSERT INTO admin_audit_log
           (actor_id, actor_name, actor_role, action, target_type, target_id, detail, prev_hash, hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        bind(entry.actorId),
        bind(entry.actorName),
        bind(entry.actorRole),
        bind(entry.action),
        bind(entry.targetType),
        bind(entry.targetId),
        bind(entry.detail),
        prevHash,
        hash,
        createdAt,
      )
    },

    async listAuditLogs(
      limit = 200,
      offset = 0,
      action?: string,
      actor?: string,
      year?: number,
      month?: number,
    ): Promise<AuditLog[]> {
      const { clause, params } = auditLogWhere({ action, actor, year, month })
      const rows = all(
        `SELECT * FROM admin_audit_log ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`,
        ...params,
        limit,
        offset,
      )
      return rows.map(rowToAuditLog)
    },

    async countAuditLogs(
      action?: string,
      actor?: string,
      year?: number,
      month?: number,
    ): Promise<number> {
      const { clause, params } = auditLogWhere({ action, actor, year, month })
      const row = one(`SELECT COUNT(*) AS n FROM admin_audit_log ${clause}`, ...params)
      return Number(row?.n ?? 0)
    },
  }
}
