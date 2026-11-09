import type { Member } from "./types"

/**
 * 谱序：以房支为经、长幼为纬，按父系深度优先排出全族次序。
 *
 * `sortOrder` 只是「同一父之下」的排行，直接按它排一个世代，排出来是
 * 「各房老大 → 各房老二」，同房的人被别房隔开。按父系走一遍深度优先，
 * 同一房支的人就连续，房内仍是长幼。
 *
 * 父不在册（入赘、外来）时改随母，外衍因此归到出嫁女所在的房。
 */
export function lineageOrder(members: Member[], branches: string[] = []): Member[] {
  if (members.length === 0) return []
  const byId = new Map(members.map((m) => [m.id, m]))
  const branchRank = new Map(branches.map((b, i) => [b, i]))
  const byBirth = (a: Member, b: Member) =>
    (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
    (branchRank.get(a.branch ?? "") ?? 999) - (branchRank.get(b.branch ?? "") ?? 999) ||
    a.id - b.id

  const parentOf = (m: Member): number | null => {
    if (m.fatherId != null && byId.has(m.fatherId)) return m.fatherId
    if (m.motherId != null && byId.has(m.motherId)) return m.motherId
    return null
  }

  const kids = new Map<number, Member[]>()
  for (const m of members) {
    const pid = parentOf(m)
    if (pid == null) continue
    const arr = kids.get(pid)
    if (arr) arr.push(m)
    else kids.set(pid, [m])
  }
  for (const arr of kids.values()) arr.sort(byBirth)
  const roots = members.filter((m) => parentOf(m) == null).sort(byBirth)

  const rank = new Map<number, number>()
  let next = 0
  const walk = (m: Member) => {
    rank.set(m.id, next++)
    for (const kid of kids.get(m.id) ?? []) walk(kid)
  }
  roots.forEach(walk)
  /* 兜底：因数据缺口没挂上树的，按长幼接在最后，避免整册少人 */
  members
    .filter((m) => !rank.has(m.id))
    .sort(byBirth)
    .forEach(walk)

  return members.slice().sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0))
}

/** 谱序名次表，供「父子居中」这类按父索子的排版用 */
export function lineageRank(members: Member[], branches: string[] = []): Map<number, number> {
  return new Map(lineageOrder(members, branches).map((m, i) => [m.id, i]))
}
