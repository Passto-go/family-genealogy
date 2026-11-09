/* 清溪沈氏 · 世系图版式原型数据（虚构）
 * 第 1–5 世：本支族人，长房 / 二房
 * 第 6–7 世、部分第 5 世：按房支补足的占位族人（ph:true），仅用于观察版式密度
 * 人物、生卒与地名均为虚构，与任何真实宗族无关
 */
window.LINEAGE = {
  family: "清溪沈氏",
  surname: "沈",
  note: "第 1–5 世为本支族人，第 6–7 世为占位族人，仅用于观察版式密度；人物与地名均为虚构",
  /* id, 名, 世次, 父, 配, 生, 卒, 房支, 占位 */
  people: [
    { id: 1, n: "沈承远", g: 1, f: null, s: "顾淑宁", b: "1905", d: "1978", br: "" },
    { id: 2, n: "沈承昌", g: 1, f: null, s: "", b: "1910", d: "1985", br: "" },
    { id: 3, n: "沈启安", g: 2, f: 1, s: "陆惠兰", b: "1932", d: "2005", br: "长房" },
    { id: 4, n: "沈启和", g: 2, f: 1, s: "苏婉清", b: "1936", d: "2012", br: "二房" },
    { id: 5, n: "沈芷芳", g: 2, f: 2, s: "", b: "1940", d: "", br: "" },
    { id: 6, n: "沈允宁", g: 3, f: 3, s: "温秀珍", b: "1958", d: "", br: "长房" },
    { id: 7, n: "沈允丰", g: 3, f: 4, s: "裴雅琴", b: "1960", d: "", br: "二房" },
    { id: 8, n: "沈芸芳", g: 3, f: 4, s: "卫立诚", b: "1968", d: "", br: "" },
    { id: 9, n: "沈昭舜", g: 4, f: 6, s: "岑如月", b: "1962", d: "", br: "长房" },
    { id: 10, n: "沈昭尧", g: 4, f: 6, s: "白小满", b: "1985", d: "", br: "长房" },
    { id: 11, n: "沈昭基", g: 4, f: 6, s: "邵仪静", b: "1988", d: "", br: "长房" },
    { id: 12, n: "沈玉涓", g: 4, f: 6, s: "洪守谦", b: "1990", d: "", br: "" },
    { id: 13, n: "沈昭业", g: 4, f: 7, s: "章佩兰", b: "1986", d: "", br: "二房" },
    { id: 14, n: "沈艳珊", g: 4, f: 7, s: "鲍承宇", b: "1989", d: "", br: "" },
    { id: 15, n: "沈昭明", g: 4, f: 9, s: "", b: "", d: "", br: "长房", ph: true },
    { id: 16, n: "沈毓业", g: 5, f: 10, s: "", b: "2015", d: "", br: "长房" },
    { id: 17, n: "沈毓明", g: 5, f: 10, s: "", b: "", d: "", br: "长房", ph: true },
    { id: 18, n: "沈毓远", g: 5, f: 11, s: "", b: "2018", d: "", br: "长房" },
    { id: 19, n: "沈毓昌", g: 5, f: 11, s: "", b: "", d: "", br: "长房", ph: true },
    { id: 20, n: "沈毓隆", g: 5, f: 13, s: "", b: "", d: "", br: "二房", ph: true },
    { id: 21, n: "沈毓安", g: 5, f: 15, s: "", b: "", d: "", br: "长房", ph: true },
    { id: 22, n: "沈毓和", g: 5, f: 13, s: "", b: "", d: "", br: "二房", ph: true },
    { id: 23, n: "沈绍昌", g: 6, f: 16, s: "", b: "", d: "", br: "长房", ph: true },
    { id: 24, n: "沈绍隆", g: 6, f: 16, s: "", b: "", d: "", br: "长房", ph: true },
    { id: 25, n: "沈绍安", g: 6, f: 17, s: "", b: "", d: "", br: "长房", ph: true },
    { id: 26, n: "沈绍和", g: 6, f: 18, s: "", b: "", d: "", br: "长房", ph: true },
    { id: 27, n: "沈绍清", g: 6, f: 19, s: "", b: "", d: "", br: "长房", ph: true },
    { id: 28, n: "沈绍宁", g: 6, f: 20, s: "", b: "", d: "", br: "二房", ph: true },
    { id: 29, n: "沈绍丰", g: 6, f: 21, s: "", b: "", d: "", br: "长房", ph: true },
    { id: 30, n: "沈绍泰", g: 6, f: 22, s: "", b: "", d: "", br: "二房", ph: true },
    { id: 39, n: "沈绍舜", g: 6, f: 21, s: "", b: "", d: "", br: "长房", ph: true },
    { id: 31, n: "沈世和", g: 7, f: 23, s: "", b: "", d: "", br: "长房", ph: true },
    { id: 32, n: "沈世清", g: 7, f: 23, s: "", b: "", d: "", br: "长房", ph: true },
    { id: 33, n: "沈世宁", g: 7, f: 24, s: "", b: "", d: "", br: "长房", ph: true },
    { id: 34, n: "沈世丰", g: 7, f: 25, s: "", b: "", d: "", br: "长房", ph: true },
    { id: 35, n: "沈世泰", g: 7, f: 26, s: "", b: "", d: "", br: "长房", ph: true },
    { id: 36, n: "沈世舜", g: 7, f: 27, s: "", b: "", d: "", br: "长房", ph: true },
    { id: 37, n: "沈世尧", g: 7, f: 23, s: "", b: "", d: "", br: "长房", ph: true },
    { id: 38, n: "沈世基", g: 7, f: 25, s: "", b: "", d: "", br: "长房", ph: true },
    { id: 40, n: "沈世业", g: 7, f: 28, s: "", b: "", d: "", br: "二房", ph: true }
  ]
};

/* —— 通用小工具：父子关系、兄弟排序、谱名简称 —— */
window.LINEAGE_UTIL = {
  byId: function () {
    var map = {};
    window.LINEAGE.people.forEach(function (p) { map[p.id] = p; });
    return map;
  },
  children: function (id) {
    return window.LINEAGE.people.filter(function (p) { return p.f === id; });
  },
  roots: function () {
    return window.LINEAGE.people.filter(function (p) { return p.f === null; });
  },
  short: function (name) {
    var s = window.LINEAGE.surname || "";
    return s && name.indexOf(s) === 0 ? name.slice(s.length) : name;
  },
  /* 生卒：1905—1978 / 1958— */
  life: function (p) {
    if (!p.b && !p.d) return "";
    return (p.b || "？") + "—" + (p.d || "");
  },
  /* 欧式小传：配某氏、生子某某、生女某某 */
  memo: function (p) {
    var kids = window.LINEAGE_UTIL.children(p.id);
    var s = window.LINEAGE.surname || "";
    var sons = kids.filter(function (k) { return s && k.n.indexOf(s) === 0 && !k.br.match(/^$/); });
    var parts = [];
    if (p.br) parts.push("居" + p.br);
    if (p.s) parts.push("配" + p.s);
    if (p.b || p.d) parts.push(window.LINEAGE_UTIL.life(p));
    if (kids.length) {
      parts.push("生子" + kids.map(function (k) { return window.LINEAGE_UTIL.short(k.n); }).join("、"));
    } else {
      parts.push("无嗣");
    }
    return parts.join("，");
  }
};
