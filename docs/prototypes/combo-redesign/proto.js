/* 欧苏谱两种版面原型共用的数据整理与渲染逻辑
   数据来自 docs/prototypes/combo-redesign/data.js（虚构沈氏谱 73 人导出） */

const CN = ["〇", "一", "二", "三", "四", "五", "六", "七", "八", "九"]

const cnNum = (n) => {
  if (n < 10) return CN[n]
  if (n === 10) return "十"
  if (n < 20) return "十" + CN[n % 10]
  return CN[Math.floor(n / 10)] + "十" + (n % 10 ? CN[n % 10] : "")
}
const cnYear = (v) => String(v ?? "").replace(/\d/g, (d) => CN[Number(d)])
const genLabel = (g) => cnNum(g) + "世"

const ctx = (() => {
  const members = window.PROTO.members
  const byId = new Map(members.map((m) => [m.id, m]))
  const kidsOf = (id) =>
    members
      .filter((m) => m.fatherId === id || m.motherId === id)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)

  /* 父系血脉：父在谱内则随父，否则以最小世次者为根 */
  const minGen = members.reduce((m, x) => Math.min(m, x.generation), Infinity)
  const blood = new Set()
  const visiting = new Set()
  const isBlood = (id) => {
    if (blood.has(id)) return true
    if (visiting.has(id)) return false
    const m = byId.get(id)
    if (!m) return false
    if (m.isMarriedIn) return false
    visiting.add(id)
    const f = m.fatherId
    const r = f != null && byId.has(f) ? isBlood(f) : m.generation === minGen
    visiting.delete(id)
    if (r) blood.add(id)
    return r
  }
  members.forEach((m) => isBlood(m.id))

  return { members, byId, kidsOf, blood, family: window.PROTO.family }
})()

/* 小传：本族女记「适」，本族男记「配」，子女按全量谱系分「子 / 女」 */
function memoOf(m) {
  const { byId, kidsOf } = ctx
  const parts = []
  if (m.branch) parts.push(m.branch.endsWith("房") ? `居${m.branch}` : `居${m.branch}房`)
  if (m.spouseId != null && !m.isMarriedIn) {
    const s = byId.get(m.spouseId)
    if (s) parts.push(m.gender === "female" ? `适${s.name}` : `配${s.name}`)
  }
  if (m.birthYear) parts.push(`生于${cnYear(m.birthYear)}`)
  if (m.deathYear) parts.push(`卒于${cnYear(m.deathYear)}`)
  const kids = kidsOf(m.id)
  const sons = kids.filter((k) => k.gender === "male")
  const girls = kids.filter((k) => k.gender === "female")
  if (sons.length) parts.push(`子${sons.map((k) => k.name).join("、")}`)
  if (girls.length) parts.push(`女${girls.map((k) => k.name).join("、")}`)
  return parts.join("　")
}

/* 按世代切成每卷最多 5 世 */
function volumesOf(maxGen = 5) {
  const gens = [...new Set(ctx.members.map((m) => m.generation))].sort((a, b) => a - b)
  const out = []
  for (let i = 0; i < gens.length; i += maxGen) out.push(gens.slice(i, i + maxGen))
  return out
}

/* 谱序：以房支为经、长幼为纬，按父系深度优先排出全族次序。
   同一世代按此序排，同房支的人连续，不会夹进别房的兄弟。 */
function lineageOrder(people, branches) {
  const byId = new Map(people.map((m) => [m.id, m]))
  const branchRank = new Map((branches ?? []).map((b, i) => [b, i]))
  const byBirth = (a, b) =>
    (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
    (branchRank.get(a.branch) ?? 999) - (branchRank.get(b.branch) ?? 999) ||
    a.id - b.id

  /* 父在谱内随父，父不在谱内（入赘、外来）改随母 */
  const parentOf = (m) => {
    if (m.fatherId != null && byId.has(m.fatherId)) return m.fatherId
    if (m.motherId != null && byId.has(m.motherId)) return m.motherId
    return null
  }

  const kids = new Map()
  for (const m of people) {
    const pid = parentOf(m)
    if (pid == null) continue
    const arr = kids.get(pid) ?? []
    arr.push(m)
    kids.set(pid, arr)
  }
  for (const arr of kids.values()) arr.sort(byBirth)
  const roots = people.filter((m) => parentOf(m) == null).sort(byBirth)

  const rank = new Map()
  let n = 0
  const walk = (m) => {
    rank.set(m.id, n++)
    for (const k of kids.get(m.id) ?? []) walk(k)
  }
  roots.forEach(walk)
  /* 兜底：因数据缺口没挂上树的，按长幼接在最后 */
  people
    .filter((m) => !rank.has(m.id))
    .sort(byBirth)
    .forEach(walk)

  return people.slice().sort((a, b) => rank.get(a.id) - rank.get(b.id))
}

/* 世系图布局：父子居中的递归宽度算法，返回节点坐标与连线路径 */
function layoutChart(people, opts) {
  const { nodeH = 22, gapX = 16, gapY = 48, font = 12, padX = 12 } = opts ?? {}
  const byId = new Map(people.map((m) => [m.id, m]))
  const measure = (s) => Math.max(44, Array.from(s).length * font * 1.06 + padX * 2)

  /* 父在图内随父，父不在图内改认母（外衍挂到出嫁女名下） */
  const parentOf = (m) => {
    if (m.fatherId != null && byId.has(m.fatherId)) return m.fatherId
    if (m.motherId != null && byId.has(m.motherId)) return m.motherId
    return null
  }

  const kidsMap = new Map()
  for (const m of people) {
    const pid = parentOf(m)
    if (pid == null) continue
    const arr = kidsMap.get(pid) ?? []
    arr.push(m)
    kidsMap.set(pid, arr)
  }
  for (const arr of kidsMap.values()) arr.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)

  const gens = [...new Set(people.map((m) => m.generation))].sort((a, b) => a - b)
  const roots = people
    .filter((m) => parentOf(m) == null)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)

  const pos = new Map()
  const widthOf = new Map()
  const spanOf = (m) => {
    if (widthOf.has(m.id)) return widthOf.get(m.id)
    const kids = kidsMap.get(m.id) ?? []
    const own = measure(m.name)
    const kidsW = kids.reduce((s, k, i) => s + spanOf(k) + (i ? gapX : 0), 0)
    const w = Math.max(own, kidsW)
    widthOf.set(m.id, w)
    return w
  }
  const place = (m, left, depth) => {
    const w = widthOf.get(m.id) ?? measure(m.name)
    pos.set(m.id, { x: left + w / 2, y: depth * gapY + nodeH / 2, w: measure(m.name) })
    const kids = kidsMap.get(m.id) ?? []
    if (!kids.length) return
    const kidsW = kids.reduce((s, k, i) => s + (widthOf.get(k.id) ?? 0) + (i ? gapX : 0), 0)
    let cursor = left + (w - kidsW) / 2
    for (const k of kids) {
      const kw = widthOf.get(k.id) ?? 0
      place(k, cursor, depth + 1)
      cursor += kw + gapX
    }
  }
  let cursor = 0
  for (const r of roots) {
    const rw = spanOf(r)
    place(r, cursor, 0)
    cursor += rw + gapX * 2
  }

  const xs = [...pos.values()]
  const maxRight = Math.max(...xs.map((p) => p.x + p.w / 2), 0)
  const maxBottom = Math.max(0, gens.length - 1) * gapY + nodeH

  const paths = []
  for (const m of people) {
    const pid = parentOf(m)
    if (pid == null) continue
    const from = pos.get(pid)
    const to = pos.get(m.id)
    if (!from || !to) continue
    const y0 = from.y + nodeH / 2
    const midY = (y0 + (to.y - nodeH / 2)) / 2
    paths.push(`M ${from.x} ${y0} V ${midY} H ${to.x} V ${to.y - nodeH / 2}`)
  }

  return { pos, paths, gens, roots, width: maxRight + 24, height: maxBottom + 12, nodeH }
}

function svgChart(people, opts) {
  const o = Object.assign({ nodeH: 22, gapY: 48, font: 12, rowLabels: true, labelW: 26 }, opts ?? {})
  const laid = layoutChart(people, o)
  const { pos, paths, gens } = laid
  const blood = ctx.blood
  const parts = []
  for (const d of paths) {
    parts.push(`<path d="${d}" fill="none" stroke="#c9c4b8" stroke-width="1"/>`)
  }
  for (const m of people) {
    const p = pos.get(m.id)
    if (!p) continue
    const isBlood = blood.has(m.id)
    const cy = p.y
    parts.push(
      `<g class="${isBlood ? "" : "ext"}">` +
        `<circle cx="${p.x - p.w / 2 + 3.5}" cy="${cy}" r="2.6" fill="${isBlood ? "#b3261e" : "none"}" stroke="${isBlood ? "#b3261e" : "#8f8a80"}" stroke-width="1"/>` +
        `<text x="${p.x + 2}" y="${cy + o.font * 0.36}" text-anchor="middle" font-size="${o.font}" fill="#1c1c1c">${m.name}</text>` +
        `</g>`,
    )
  }
  const shift = o.rowLabels ? o.labelW : 0
  const labels = o.rowLabels
    ? gens
        .map(
          (g, i) =>
            `<text x="0" y="${i * o.gapY + o.nodeH / 2 + o.font * 0.36}" font-size="${o.font - 1}" fill="#8f7134" letter-spacing="1">${genLabel(g)}</text>`,
        )
        .join("")
    : ""
  const W = Math.ceil(laid.width + shift)
  const H = Math.ceil(laid.height)
  return (
    `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMinYMin meet" style="max-width:100%;height:auto">` +
    labels +
    `<g transform="translate(${shift},0)">${parts.join("")}</g>` +
    `</svg>`
  )
}

/* 纸面按原尺寸排版，屏幕放不下时整体等比收进一屏（不做重排，保住版式） */
function fitSheets() {
  document.querySelectorAll(".sheet-fit").forEach((box) => {
    const sheet = box.querySelector(".sheet")
    if (!sheet) return
    sheet.style.transform = ""
    box.style.height = ""
    const boxW = box.clientWidth
    const avail = boxW - 48
    const w = sheet.offsetWidth
    const s = avail / w
    if (s < 1) {
      sheet.style.transform = `translateX(${(boxW - w * s) / 2}px) scale(${s})`
      box.style.height = `${sheet.offsetHeight * s + 26}px`
    }
  })
}

window.addEventListener("resize", fitSheets)
window.addEventListener("load", fitSheets)

window.PROTO_CTX = ctx
window.PROTO_UTIL = { memoOf, genLabel, volumesOf, svgChart, cnNum, cnYear, fitSheets, lineageOrder }
