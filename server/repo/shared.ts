/**
 * 数据访问共享层：local（node:sqlite）与 d1（Cloudflare D1）共用的列映射、
 * 值转换与联表查询常量。抽到此处可消除「改一边忘另一边」的 schema/列映射漂移：
 * 给 family 新增列时，只需在此更新 FAMILY_COLUMNS，两种运行时自动同步。
 */
import type { FamilyInput } from "./types.js"

export const FAMILY_COLUMNS: Record<keyof FamilyInput, string> = {
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
}

export function familyValue(
  key: keyof FamilyInput,
  raw: unknown,
): string | number | null {
  if (key === "branches") return JSON.stringify(Array.isArray(raw) ? raw : [])
  if (key === "branchHeads")
    return JSON.stringify(
      raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {},
    )
  if (key === "isPrimary" || key === "isPublished") return raw ? 1 : 0
  if (raw === undefined || raw === null) return null
  if (typeof raw === "boolean") return raw ? 1 : 0
  return raw as string | number
}

// 联表取维护人姓名（创建人 / 最近修改人），管理员被删后姓名快照仍存在
export const FAMILY_SELECT = `SELECT f.*, cu.username AS created_by_name, uu.username AS updated_by_name
  FROM family f
  LEFT JOIN admin_user cu ON cu.id = f.created_by
  LEFT JOIN admin_user uu ON uu.id = f.updated_by`

export const MEMBER_SELECT = `SELECT m.*, cu.username AS created_by_name, uu.username AS updated_by_name
  FROM member m
  LEFT JOIN admin_user cu ON cu.id = m.created_by
  LEFT JOIN admin_user uu ON uu.id = m.updated_by`
