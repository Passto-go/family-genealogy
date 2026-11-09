#!/usr/bin/env node
/* 生成 docs/prototypes 下两套版式原型的虚构族谱数据。
 *
 * 两套原型的 data.js schema 完全不同，所以各自生成：
 *   docs/prototypes/combo-redesign/data.js   window.PROTO   （世次四至八，73 人）
 *   docs/prototypes/lineage-proto/data.js    window.LINEAGE （七世，40 人，含占位）
 *
 * 脚本只持有谱系骨架（id / 世次 / 父 / 配 / 房支 / 占位），不含任何真实姓名；
 * 名字由字辈与姓名池按固定顺序分配，因此每次执行结果一致。
 *
 * 用法：node scripts/gen-prototype-data.mjs
 */

import { writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")

/* ── 共用的虚构姓氏 ───────────────────────────────────────── */

const FAMILY_SURNAME = "沈"
const FAMILY_FULL = "清溪沈氏"

/* 姻亲（嫁入 / 娶入）用的外姓，避免与本族同姓 */
const INLAW_SURNAMES = [
  "顾", "陆", "苏", "温", "裴", "卫", "岑", "白", "邵", "洪",
  "章", "鲍", "屈", "封", "施", "宋", "唐", "郁", "祝", "路",
]

const MALE_GIVEN_INLAW = [
  "立诚", "守谦", "承宇", "景元", "明远", "书翰", "仲清", "望舒",
  "亦朗", "泽安", "修文", "慕白", "之涣", "沐辰", "问渠", "观澜",
  "季白", "子昂", "仲昭", "秉文", "敬之", "允初", "穆清", "致遥",
]

const FEMALE_GIVEN_INLAW = [
  "淑宁", "惠兰", "婉清", "秀珍", "雅琴", "如月", "小满", "仪静",
  "佩兰", "静宜", "婉柔", "素娥", "玉琴", "令姜", "和风", "甘棠",
  "疏桐", "青禾", "珠玉", "锦心", "秀云", "月娥", "翠微", "曼青",
  "问秋", "知微", "白露", "清和", "宛之", "秋棠",
]

/* ── 取名器：同一池内不重名，跨池也避开完全同名的组合 ─────── */

function createNamer() {
  const used = new Set()
  const cursor = new Map()
  return function next(key, pool, build, offset = 0) {
    const start = cursor.get(key) ?? offset % pool.length
    for (let i = 0; i < pool.length; i++) {
      const idx = (start + i) % pool.length
      const name = build(pool[idx])
      if (!used.has(name)) {
        used.add(name)
        cursor.set(key, (idx + 1) % pool.length)
        return name
      }
    }
    throw new Error(`姓名池已用尽：${key}，请扩充对应池`)
  }
}

function createSurnamePicker() {
  let i = 0
  return () => INLAW_SURNAMES[i++ % INLAW_SURNAMES.length]
}

/* ══ 一、combo-redesign ═════════════════════════════════════
 * 骨架：[id, 性别, 世次, 父, 母, 配, 娶入/嫁入, 房支, 生, 卒, 行序]
 */

const COMBO_ROWS = [
  // 第四世
  [113, "male", 4, null, null, 114, false, "", "", "", 0],
  [114, "female", 4, null, null, 113, true, "", "", "", 0],

  // 第五世 —— 四房兄弟及其配
  [43, "female", 5, null, null, 42, true, "", "1936", "", 0],
  [82, "female", 5, null, null, 81, true, "", "", "", 0],
  [96, "female", 5, null, null, 44, true, "", "", "", 0],
  [107, "female", 5, null, null, 106, true, "", "", "", 0],
  [42, "male", 5, 113, 114, 43, false, "长房", "1932", "", 1],
  [81, "male", 5, 113, 114, 82, false, "二房", "", "", 2],
  [44, "male", 5, 113, 114, 96, false, "三房", "", "", 3],
  [106, "male", 5, 113, 114, 107, false, "四房", "", "", 4],

  // 第六世 —— 姻亲
  [48, "male", 6, null, null, 46, true, "", "", "", 0],
  [49, "male", 6, null, null, 47, true, "", "", "", 0],
  [51, "female", 6, null, null, 50, true, "", "", "", 0],
  [53, "female", 6, null, null, 52, true, "", "1970", "", 0],
  [75, "male", 6, null, null, 45, true, "", "", "", 0],
  [84, "female", 6, null, null, 83, true, "", "", "", 0],
  [89, "male", 6, null, null, 88, true, "", "", "", 0],
  [92, "male", 6, null, null, 91, true, "", "", "", 0],
  [95, "male", 6, null, null, 94, true, "", "", "", 0],
  [98, "female", 6, null, null, 97, true, "", "", "", 0],
  [101, "female", 6, null, null, 100, true, "", "", "", 0],
  [104, "male", 6, null, null, 54, true, "", "", "", 0],
  [109, "male", 6, null, null, 108, true, "", "", "", 0],
  [111, "female", 6, null, null, 110, true, "", "", "", 0],

  // 第六世 —— 本支
  [45, "female", 6, 42, 43, 75, false, "长房", "", "2026", 1],
  [83, "male", 6, 81, 82, 84, false, "二房", "", "", 1],
  [100, "female", 6, 44, 96, 101, false, "三房", "", "", 1],
  [108, "female", 6, 106, 107, 109, false, "四房", "", "", 1],
  [46, "female", 6, 42, 43, 48, false, "长房", "", "", 2],
  [88, "female", 6, 81, 82, 89, false, "二房", "", "", 2],
  [97, "male", 6, 44, 96, 98, false, "三房", "", "", 2],
  [110, "male", 6, 106, 107, 111, false, "四房", "", "", 2],
  [47, "female", 6, 42, 43, 49, false, "长房", "", "", 3],
  [91, "female", 6, 81, 82, 92, false, "二房", "", "", 3],
  [50, "male", 6, 42, 43, 51, false, "长房", "", "", 4],
  [94, "female", 6, 81, 82, 95, false, "二房", "", "", 4],
  [52, "male", 6, 42, 43, 53, false, "长房", "1969", "2000", 5],
  [54, "female", 6, 42, 43, 104, false, "长房", "", "", 6],

  // 第七世 —— 姻亲
  [57, "male", 7, null, null, 55, true, "", "", "", 0],
  [59, "male", 7, null, null, 58, true, "", "", "", 0],
  [61, "male", 7, null, null, 60, true, "", "", "", 0],
  [64, "male", 7, null, null, 62, true, "", "", "", 0],
  [65, "male", 7, null, null, 63, true, "", "", "", 0],
  [67, "male", 7, null, null, 66, true, "", "", "", 0],
  [69, "female", 7, null, null, 68, true, "", "", "", 0],
  [86, "female", 7, null, null, 85, true, "", "", "", 0],

  // 第七世 —— 本支与出嫁女所出
  [90, "female", 7, 89, 88, null, false, "", "", "", 0],
  [93, "female", 7, 92, 91, null, false, "", "", "", 0],
  [99, "male", 7, 97, 98, null, false, "三房", "", "", 0],
  [102, "female", 7, 101, 100, 103, false, "", "", "", 0],
  [103, "female", 7, null, null, 102, true, "", "", "", 0],
  [105, "female", 7, 95, 94, null, false, "", "", "", 0],
  [55, "female", 7, 75, 45, 57, false, "", "", "", 1],
  [56, "male", 7, 75, 45, null, false, "", "", "", 1],
  [58, "female", 7, 48, 46, 59, false, "", "", "", 1],
  [62, "female", 7, 49, 47, 64, false, "", "", "", 1],
  [66, "female", 7, 50, 51, 67, false, "长房", "1988", "", 1],
  [70, "male", 7, 52, 53, null, false, "长房", "1993", "", 1],
  [71, "male", 7, 104, 54, null, false, "长房", "2000", "", 1],
  [85, "male", 7, 83, 84, 86, false, "二房", "", "", 1],
  [60, "female", 7, 48, 46, 61, false, "", "1988", "", 2],
  [63, "female", 7, 49, 47, 65, false, "", "", "", 2],
  [68, "male", 7, 50, 51, 69, false, "长房", "1995", "", 2],

  // 第八世
  [72, "female", 8, 57, 55, null, false, "", "", "", 0],
  [76, "male", 8, 64, 62, null, false, "", "", "", 0],
  [77, "female", 8, 65, 63, null, false, "", "", "", 0],
  [78, "female", 8, 68, 69, null, false, "长房", "", "", 0],
  [79, "female", 8, 68, 69, null, false, "长房", "", "", 0],
  [80, "male", 8, 67, 66, null, false, "", "", "", 0],
  [87, "male", 8, 85, 86, null, false, "二房", "", "", 0],
  [112, "male", 8, 61, 60, null, false, "", "", "", 0],
  [73, "female", 8, 59, 58, null, false, "", "", "", 1],
  [74, "female", 8, 59, 58, null, false, "", "", "", 1],
]

/* 本族字辈：第五、六世用双字谱名，第七、八世单字为名 */
const COMBO_ZI = { 5: "继", 6: "体", 7: "", 8: "" }

const COMBO_MALE_GIVEN = {
  4: ["棠", "棨", "榕"],
  5: ["桓", "炜", "燮", "煜", "曜"],
  6: ["钧", "柘", "楷", "桢", "枥", "樾"],
  7: ["珩", "骏", "屿", "澈", "琰"],
  8: ["晏", "煦", "琛", "砚"],
}

const COMBO_FEMALE_GIVEN = [
  "芷芳", "芸芳", "玉涓", "艳珊", "令仪", "婉如", "清妍", "素心",
  "静姝", "云舒", "漱玉", "疏影", "听雪", "照月", "临溪", "含章",
]

function buildCombo() {
  const next = createNamer()
  const nextSurname = createSurnamePicker()
  const surnameOf = new Map()
  const members = []

  for (const row of COMBO_ROWS) {
    const [id, gender, generation, fatherId, motherId, spouseId, isMarriedIn, branch, birthYear, deathYear, sortOrder] = row

    let surname
    if (isMarriedIn) surname = nextSurname()
    else if (fatherId != null) surname = surnameOf.get(fatherId) ?? FAMILY_SURNAME
    else surname = FAMILY_SURNAME
    surnameOf.set(id, surname)

    let name
    if (surname === FAMILY_SURNAME) {
      if (gender === "male") {
        const zi = COMBO_ZI[generation] ?? ""
        name = next(`沈男${generation}`, COMBO_MALE_GIVEN[generation], (ch) => FAMILY_SURNAME + zi + ch, generation * 3)
      } else {
        name = next("沈女", COMBO_FEMALE_GIVEN, (ch) => FAMILY_SURNAME + ch)
      }
    } else {
      const pool = gender === "male" ? MALE_GIVEN_INLAW : FEMALE_GIVEN_INLAW
      name = next(`外姓${gender}`, pool, (ch) => surname + ch)
    }

    members.push({
      id,
      name,
      gender,
      generation,
      fatherId,
      motherId,
      spouseId,
      isMarriedIn,
      branch,
      birthYear,
      deathYear,
      sortOrder,
    })
  }

  return {
    family: {
      name: FAMILY_FULL,
      surname: FAMILY_SURNAME,
      hallName: "务本堂",
      county: "清溪",
      branches: ["长房", "二房", "三房", "四房"],
      printIncludeExtended: true,
    },
    members,
  }
}

/* ══ 二、lineage-proto ══════════════════════════════════════
 * 骨架：[id, 世次, 父, 房支, 占位, 生, 卒, 配偶性别("" 为无配)]
 */

const LINEAGE_ROWS = [
  [1, 1, null, "", false, "1905", "1978", "f"],
  [2, 1, null, "", false, "1910", "1985", ""],

  [3, 2, 1, "长房", false, "1932", "2005", "f"],
  [4, 2, 1, "二房", false, "1936", "2012", "f"],
  [5, 2, 2, "", false, "1940", "", ""],

  [6, 3, 3, "长房", false, "1958", "", "f"],
  [7, 3, 4, "二房", false, "1960", "", "f"],
  [8, 3, 4, "", false, "1968", "", "m"],

  [9, 4, 6, "长房", false, "1962", "", "f"],
  [10, 4, 6, "长房", false, "1985", "", "f"],
  [11, 4, 6, "长房", false, "1988", "", "f"],
  [12, 4, 6, "", false, "1990", "", "m"],
  [13, 4, 7, "二房", false, "1986", "", "f"],
  [14, 4, 7, "", false, "1989", "", "m"],
  [15, 4, 9, "长房", true, "", "", ""],

  [16, 5, 10, "长房", false, "2015", "", ""],
  [17, 5, 10, "长房", true, "", "", ""],
  [18, 5, 11, "长房", false, "2018", "", ""],
  [19, 5, 11, "长房", true, "", "", ""],
  [20, 5, 13, "二房", true, "", "", ""],
  [21, 5, 15, "长房", true, "", "", ""],
  [22, 5, 13, "二房", true, "", "", ""],

  [23, 6, 16, "长房", true, "", "", ""],
  [24, 6, 16, "长房", true, "", "", ""],
  [25, 6, 17, "长房", true, "", "", ""],
  [26, 6, 18, "长房", true, "", "", ""],
  [27, 6, 19, "长房", true, "", "", ""],
  [28, 6, 20, "二房", true, "", "", ""],
  [29, 6, 21, "长房", true, "", "", ""],
  [30, 6, 22, "二房", true, "", "", ""],
  [39, 6, 21, "长房", true, "", "", ""],

  [31, 7, 23, "长房", true, "", "", ""],
  [32, 7, 23, "长房", true, "", "", ""],
  [33, 7, 24, "长房", true, "", "", ""],
  [34, 7, 25, "长房", true, "", "", ""],
  [35, 7, 26, "长房", true, "", "", ""],
  [36, 7, 27, "长房", true, "", "", ""],
  [37, 7, 23, "长房", true, "", "", ""],
  [38, 7, 25, "长房", true, "", "", ""],
  [40, 7, 28, "二房", true, "", "", ""],
]

/* 本支女（出嫁）——其余皆为男 */
const LINEAGE_FEMALE_IDS = new Set([5, 8, 12, 14])

const LINEAGE_ZI = { 1: "承", 2: "启", 3: "允", 4: "昭", 5: "毓", 6: "绍", 7: "世" }

const LINEAGE_MALE_GIVEN = [
  "基", "业", "明", "远", "昌", "隆", "安", "和", "清", "宁", "丰", "泰", "舜", "尧",
]

const LINEAGE_FEMALE_GIVEN = [
  "芷芳", "芸芳", "玉涓", "艳珊", "令仪", "婉如", "清妍", "素心",
  "静姝", "云舒", "漱玉", "疏影",
]

function buildLineage() {
  const next = createNamer()
  const nextSurname = createSurnamePicker()
  const people = []

  for (const [id, g, f, br, ph, b, d, spouseGender] of LINEAGE_ROWS) {
    const isFemale = LINEAGE_FEMALE_IDS.has(id)
    const zi = LINEAGE_ZI[g] ?? ""

    const name = isFemale
      ? next("沈女", LINEAGE_FEMALE_GIVEN, (ch) => FAMILY_SURNAME + ch)
      : next(`沈男${g}`, LINEAGE_MALE_GIVEN, (ch) => FAMILY_SURNAME + zi + ch, g * 3)

    /* 先定姻亲姓氏，再配名，避免探名时重复消耗姓氏游标 */
    const spouseSurname = spouseGender ? nextSurname() : ""
    const spouse = spouseGender
      ? next(`外姓${spouseGender}`, spouseGender === "m" ? MALE_GIVEN_INLAW : FEMALE_GIVEN_INLAW, (ch) => spouseSurname + ch)
      : ""

    people.push({ id, n: name, g, f, s: spouse, b, d, br, ph })
  }

  return {
    family: FAMILY_FULL,
    surname: FAMILY_SURNAME,
    note: "第 1–5 世为本支族人，第 6–7 世为占位族人，仅用于观察版式密度；人物与地名均为虚构",
    people,
  }
}

/* ══ 输出 ═══════════════════════════════════════════════════ */

function emitCombo(data) {
  return `/* 清溪沈氏 · 虚构谱数据，仅用于版式原型 */\nwindow.PROTO = ${JSON.stringify(data, null, 1)}\n`
}

function emitLineage(data) {
  const rows = data.people.map((p) => {
    const s = p.s ? `"${p.s}"` : '""'
    const f = p.f === null ? "null" : p.f
    const ph = p.ph ? ", ph: true" : ""
    return `    { id: ${p.id}, n: "${p.n}", g: ${p.g}, f: ${f}, s: ${s}, b: "${p.b}", d: "${p.d}", br: "${p.br}"${ph} }`
  })

  return [
    "/* 清溪沈氏 · 世系图版式原型数据（虚构）",
    " * 第 1–5 世：本支族人，长房 / 二房",
    " * 第 6–7 世、部分第 5 世：按房支补足的占位族人（ph:true），仅用于观察版式密度",
    " * 人物、生卒与地名均为虚构，与任何真实宗族无关",
    " */",
    "window.LINEAGE = {",
    `  family: ${JSON.stringify(data.family)},`,
    `  surname: ${JSON.stringify(data.surname)},`,
    `  note: ${JSON.stringify(data.note)},`,
    "  /* id, 名, 世次, 父, 配, 生, 卒, 房支, 占位 */",
    "  people: [",
    rows.join(",\n"),
    "  ]",
    "};",
    "",
    "/* —— 通用小工具：父子关系、兄弟排序、谱名简称 —— */",
    "window.LINEAGE_UTIL = {",
    "  byId: function () {",
    "    var map = {};",
    "    window.LINEAGE.people.forEach(function (p) { map[p.id] = p; });",
    "    return map;",
    "  },",
    "  children: function (id) {",
    "    return window.LINEAGE.people.filter(function (p) { return p.f === id; });",
    "  },",
    "  roots: function () {",
    "    return window.LINEAGE.people.filter(function (p) { return p.f === null; });",
    "  },",
    "  short: function (name) {",
    "    var s = window.LINEAGE.surname || \"\";",
    "    return s && name.indexOf(s) === 0 ? name.slice(s.length) : name;",
    "  },",
    "  /* 生卒：1905—1978 / 1958— */",
    "  life: function (p) {",
    "    if (!p.b && !p.d) return \"\";",
    "    return (p.b || \"？\") + \"—\" + (p.d || \"\");",
    "  },",
    "  /* 欧式小传：配某氏、生子某某、生女某某 */",
    "  memo: function (p) {",
    "    var kids = window.LINEAGE_UTIL.children(p.id);",
    "    var s = window.LINEAGE.surname || \"\";",
    "    var sons = kids.filter(function (k) { return s && k.n.indexOf(s) === 0 && !k.br.match(/^$/); });",
    "    var parts = [];",
    "    if (p.br) parts.push(\"居\" + p.br);",
    "    if (p.s) parts.push(\"配\" + p.s);",
    "    if (p.b || p.d) parts.push(window.LINEAGE_UTIL.life(p));",
    "    if (kids.length) {",
    "      parts.push(\"生子\" + kids.map(function (k) { return window.LINEAGE_UTIL.short(k.n); }).join(\"、\"));",
    "    } else {",
    "      parts.push(\"无嗣\");",
    "    }",
    "    return parts.join(\"，\");",
    "  }",
    "};",
    "",
  ].join("\n")
}

const comboPath = join(ROOT, "docs/prototypes/combo-redesign/data.js")
const lineagePath = join(ROOT, "docs/prototypes/lineage-proto/data.js")

const combo = buildCombo()
const lineage = buildLineage()

writeFileSync(comboPath, emitCombo(combo), "utf8")
writeFileSync(lineagePath, emitLineage(lineage), "utf8")

console.log(`combo-redesign: ${combo.members.length} 人 → ${comboPath}`)
console.log(`lineage-proto : ${lineage.people.length} 人 → ${lineagePath}`)
