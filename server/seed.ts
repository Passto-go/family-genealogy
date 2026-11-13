import { hashPassword, verifyPassword } from "./auth.js"
import type { FamilyInput, MemberInput, Repo } from "./repo/types.js"

// H1：不再内置固定默认口令；历史库中若仍存在该口令，启动时自动轮换为一次性随机串
const LEGACY_DEFAULT_USERNAME = "admin"
const LEGACY_DEFAULT_PASSWORD = "family2026"

const FAMILY: FamilyInput = {
  slug: "chen",
  tag: "陈氏",
  domain: "",
  visibility: "public",
  accessPasswordHash: "",
  isPrimary: true,
  theme: "",
  surname: "陈",
  name: "颍川陈氏",
  hallName: "德星堂",
  county: "颍川",
  originPlace: "福建泉州府晋江县梅溪乡",
  founderName: "陈德元",
  foundedYear: "明嘉靖年间",
  generationPoem: "德维昭宪 · 文章华国 · 忠厚传家 · 诗书继世",
  generationPoemStart: 1,
  branches: ["大宗", "长房", "二房", "三房"],
  coverImage: "",
  footerText: "颍川陈氏德星堂 · 家族族谱",
  intro:
    "吾族系出颍川，自汉太丘长寔公以来，世以德义相承。明嘉靖间，始迁祖德元公自莆田徙居晋江梅溪，垦土筑室，耕读传家，遂开一族之基。\n\n" +
    "四百余年，子孙繁衍，分长、二、三房，绵延七世。族人或以耕稼守业，或以诗书起家，皆以孝悌为先、忠厚为本，未敢有坠先人之志。\n\n" +
    "今重辑谱牒，考世系、序昭穆、录行实，使后之子孙知所自出，知所当继。谱之所载，非独名讳生卒，实一族血脉与家风之所寄也。",
  motto:
    "孝悌为本，耕读传家。\n敦亲睦族，恤孤济贫。\n立身以诚，处世以和。\n勤勉勿惰，俭朴勿奢。",
  rules:
    "一、凡我族人，当时存孝悌之心，事亲以敬，事长以顺，毋得悖逆。\n" +
    "二、子弟年及七岁，须入塾读书，虽贫不废；不能读者，亦当识文断字、明理知耻。\n" +
    "三、族中婚丧，各房当协力相帮，毋得推诿坐视。\n" +
    "四、凡有争执，先诉于房长，房长不能决，则集族众于祠堂公议，毋得擅兴词讼。\n" +
    "五、族人不得以强凌弱、以富欺贫；鳏寡孤独，族中共赡之。\n" +
    "六、祠堂祭田所入，专供祭祀、修谱、助学之用，毋得侵渔。\n" +
    "七、凡入谱者，须实录其名讳、字号、生卒、葬所、配偶、子女，不得虚美隐恶。\n" +
    "八、谱牒三十年一修，遇有迁徙、继嗣、改姓者，随时报知族长，以备采录。",
  preface:
    "夫族之有谱，犹国之有史。史以纪一代之治乱，谱以序一族之昭穆。谱不修，则世远而支分，支分而情疏，甚至同宗相遇而不知所自出，此谱之所以不可废也。\n\n" +
    "吾族自德元公始迁梅溪，迄今七世。旧谱创于康熙初年，继修于乾隆、道光两朝，兵燹之后，简牍散佚，仅存残本。\n\n" +
    "今合各房所藏，参以墓碑、神主、契券，重加考订。其有不可考者，阙之，不敢妄附；其有可征者，详之，不敢或略。\n\n" +
    "后之览者，知水源木本之义，则谱之修，庶几不虚矣。",
  branchHeads: {},
  icpNumber: "",
  policeNumber: "",
  showExtendedLineage: false,
  isPublished: true,
}

interface SeedNode {
  key: string
  name: string
  gender: "male" | "female"
  generation: number
  courtesyName?: string
  father?: string
  mother?: string
  spouse?: string
  marriedIn?: boolean
  /** 入赘承祧 / 过继取得房分（示例数据未使用） */
  branchHeir?: boolean
  branch?: string
  birthYear?: string
  deathYear?: string
  burialPlace?: string
  title?: string
  bio?: string
}

/** 示例世系：七世四十人，取自典型的闽南宗族谱牒行实 */
const NODES: SeedNode[] = [
  // ── 第一世 ──
  {
    key: "deyuan",
    name: "陈德元",
    gender: "male",
    generation: 1,
    courtesyName: "元甫",
    title: "邑庠生",
    branch: "大宗",
    birthYear: "1512",
    deathYear: "1586",
    burialPlace: "晋江二十四都梅溪山",
    spouse: "deyuan_w",
    bio: "公讳德元，字元甫，号静庵。明正德七年生。少负志节，读书不事章句，以孝友闻于乡里。嘉靖间携家自莆田徙居晋江梅溪，垦田筑室，遂为吾族始迁之祖。晚年筑静庵以居，日课子孙读书，年七十四卒。",
  },
  {
    key: "deyuan_w",
    name: "林淑贞",
    gender: "female",
    generation: 1,
    marriedIn: true,
    birthYear: "1518",
    deathYear: "1590",
    title: "德元公元配",
    spouse: "deyuan",
    bio: "孺人林氏，莆田林氏女。归德元公时，家徒四壁，躬操井臼，佐夫立业。性慈俭，乡邻有急，辄解衣推食。",
  },

  // ── 第二世 ──
  {
    key: "weiyue",
    name: "陈维岳",
    gender: "male",
    generation: 2,
    courtesyName: "季高",
    title: "太学生",
    branch: "长房",
    birthYear: "1540",
    deathYear: "1612",
    burialPlace: "梅溪祖山之阳",
    father: "deyuan",
    mother: "deyuan_w",
    spouse: "weiyue_w",
    bio: "公讳维岳，字季高。少颖悟，年十九补邑诸生，后入太学。居家以礼法自持，族人有过，必婉言规劝。万历间倡建祠堂，置祭田二十亩。",
  },
  {
    key: "weiyue_w",
    name: "蔡玉娘",
    gender: "female",
    generation: 2,
    marriedIn: true,
    birthYear: "1543",
    deathYear: "1608",
    title: "维岳公元配",
    spouse: "weiyue",
  },
  {
    key: "weisong",
    name: "陈维嵩",
    gender: "male",
    generation: 2,
    courtesyName: "仲高",
    branch: "二房",
    birthYear: "1544",
    deathYear: "1609",
    burialPlace: "梅溪西陇",
    father: "deyuan",
    mother: "deyuan_w",
    spouse: "weisong_w",
    bio: "公讳维嵩，字仲高。性沉毅，善治生产，拓田三百余亩。尝岁饥，出粟平粜，全活乡人百余家。",
  },
  {
    key: "weisong_w",
    name: "黄婉贞",
    gender: "female",
    generation: 2,
    marriedIn: true,
    birthYear: "1547",
    deathYear: "1605",
    title: "维嵩公元配",
    spouse: "weisong",
  },
  {
    key: "weisun",
    name: "陈维崧",
    gender: "male",
    generation: 2,
    courtesyName: "叔高",
    title: "乡饮宾",
    branch: "三房",
    birthYear: "1548",
    deathYear: "1621",
    burialPlace: "梅溪东麓",
    father: "deyuan",
    mother: "deyuan_w",
    spouse: "weisun_w",
    bio: "公讳维崧，字叔高。少孤力学，屡试不第，遂弃举业，教授乡里四十余年，门下多知名士。年七十有四，举乡饮宾。",
  },
  {
    key: "weisun_w",
    name: "王素娥",
    gender: "female",
    generation: 2,
    marriedIn: true,
    birthYear: "1552",
    deathYear: "1618",
    title: "维崧公元配",
    spouse: "weisun",
  },

  // ── 第三世 ──
  {
    key: "zhaowen",
    name: "陈昭文",
    gender: "male",
    generation: 3,
    courtesyName: "明之",
    title: "岁贡生",
    branch: "长房",
    birthYear: "1568",
    deathYear: "1636",
    father: "weiyue",
    mother: "weiyue_w",
    spouse: "zhaowen_w",
    bio: "公讳昭文，字明之。万历间岁贡，任广东徐闻县训导，兴学教士，士林称之。归里后主修族谱初稿。",
  },
  {
    key: "zhaowen_w",
    name: "苏惠兰",
    gender: "female",
    generation: 3,
    marriedIn: true,
    birthYear: "1571",
    deathYear: "1630",
    title: "昭文公元配",
    spouse: "zhaowen",
  },
  {
    key: "zhaowu",
    name: "陈昭武",
    gender: "male",
    generation: 3,
    courtesyName: "毅之",
    branch: "长房",
    birthYear: "1572",
    deathYear: "1644",
    father: "weiyue",
    mother: "weiyue_w",
    spouse: "zhaowu_w",
    bio: "公讳昭武，字毅之。崇祯间海氛不靖，率族人筑寨自守，乡里赖以安堵。",
  },
  {
    key: "zhaowu_w",
    name: "吴静宜",
    gender: "female",
    generation: 3,
    marriedIn: true,
    birthYear: "1576",
    deathYear: "1638",
    title: "昭武公元配",
    spouse: "zhaowu",
  },
  {
    key: "zhaoming",
    name: "陈昭明",
    gender: "male",
    generation: 3,
    courtesyName: "亮之",
    branch: "二房",
    birthYear: "1570",
    deathYear: "1631",
    father: "weisong",
    mother: "weisong_w",
    spouse: "zhaoming_w",
    bio: "公讳昭明，字亮之。善治家，续置祭田，族人婚丧不给者，多赖以济。",
  },
  {
    key: "zhaoming_w",
    name: "郑淑仪",
    gender: "female",
    generation: 3,
    marriedIn: true,
    birthYear: "1573",
    deathYear: "1635",
    title: "昭明公元配",
    spouse: "zhaoming",
  },
  {
    key: "zhaoyuan",
    name: "陈昭远",
    gender: "male",
    generation: 3,
    courtesyName: "宏之",
    branch: "二房",
    birthYear: "1576",
    deathYear: "1652",
    father: "weisong",
    mother: "weisong_w",
    spouse: "zhaoyuan_w",
    bio: "公讳昭远，字宏之。国变之后不仕，隐居梅溪，以诗酒自娱，有《溪居草》一卷。",
  },
  {
    key: "zhaoyuan_w",
    name: "何秀英",
    gender: "female",
    generation: 3,
    marriedIn: true,
    birthYear: "1580",
    deathYear: "1646",
    title: "昭远公元配",
    spouse: "zhaoyuan",
  },
  {
    key: "zhaolie",
    name: "陈昭烈",
    gender: "male",
    generation: 3,
    courtesyName: "承之",
    branch: "三房",
    birthYear: "1575",
    deathYear: "1642",
    father: "weisun",
    mother: "weisun_w",
    spouse: "zhaolie_w",
    bio: "公讳昭烈，字承之。习医，尤精伤寒，行医四十年，不受贫者之酬。",
  },
  {
    key: "zhaolie_w",
    name: "许慈云",
    gender: "female",
    generation: 3,
    marriedIn: true,
    birthYear: "1578",
    deathYear: "1648",
    title: "昭烈公元配",
    spouse: "zhaolie",
  },
  {
    key: "zhaoran",
    name: "陈昭然",
    gender: "male",
    generation: 3,
    courtesyName: "顺之",
    branch: "三房",
    birthYear: "1580",
    deathYear: "1639",
    father: "weisun",
    mother: "weisun_w",
    spouse: "zhaoran_w",
    bio: "公讳昭然，字顺之。崇祯间由岁贡授浙江兰溪县主簿，清介自守，去任之日，行李萧然。",
  },
  {
    key: "zhaoran_w",
    name: "周月娥",
    gender: "female",
    generation: 3,
    marriedIn: true,
    birthYear: "1584",
    deathYear: "1645",
    title: "昭然公元配",
    spouse: "zhaoran",
  },

  // ── 第四世 ──
  {
    key: "xianbang",
    name: "陈宪邦",
    gender: "male",
    generation: 4,
    courtesyName: "维翰",
    branch: "长房",
    birthYear: "1594",
    deathYear: "1668",
    father: "zhaowen",
    mother: "zhaowen_w",
    bio: "公讳宪邦，字维翰。承父志，续修族谱，手录世系三卷，今谱之底本也。",
  },
  {
    key: "xianzhang",
    name: "陈宪章",
    gender: "male",
    generation: 4,
    courtesyName: "维文",
    branch: "长房",
    birthYear: "1600",
    deathYear: "1671",
    father: "zhaowen",
    mother: "zhaowen_w",
    bio: "公讳宪章，字维文。工书法，尤长楷隶，祠堂楹联多出其手。",
  },
  {
    key: "xianke",
    name: "陈宪可",
    gender: "male",
    generation: 4,
    courtesyName: "维允",
    branch: "长房",
    birthYear: "1602",
    deathYear: "1675",
    father: "zhaowu",
    mother: "zhaowu_w",
    bio: "公讳宪可，字维允。从军漳州，积功至把总，鼎革后归里务农，不复言兵。",
  },
  {
    key: "xianqing",
    name: "陈宪清",
    gender: "male",
    generation: 4,
    courtesyName: "维则",
    branch: "二房",
    birthYear: "1598",
    deathYear: "1663",
    father: "zhaoming",
    mother: "zhaoming_w",
    bio: "公讳宪清，字维则。性严正，为族长二十三年，族中争讼多所平断。",
  },
  {
    key: "xianchun",
    name: "陈宪淳",
    gender: "male",
    generation: 4,
    courtesyName: "维厚",
    branch: "二房",
    birthYear: "1605",
    deathYear: "1680",
    father: "zhaoming",
    mother: "zhaoming_w",
    bio: "公讳宪淳，字维厚。经商于泉郡，家稍裕，捐资置义塾，族中子弟贫者得就学。",
  },
  {
    key: "xianzhi",
    name: "陈宪治",
    gender: "male",
    generation: 4,
    courtesyName: "维平",
    branch: "二房",
    birthYear: "1608",
    deathYear: "1682",
    father: "zhaoyuan",
    mother: "zhaoyuan_w",
    bio: "公讳宪治，字维平。工诗，与郡中诸子结社唱和，有《梅溪杂咏》。",
  },
  {
    key: "xianming",
    name: "陈宪明",
    gender: "male",
    generation: 4,
    courtesyName: "维昭",
    branch: "三房",
    birthYear: "1603",
    deathYear: "1672",
    father: "zhaolie",
    mother: "zhaolie_w",
    bio: "公讳宪明，字维昭。绍父医业，尤善小儿科，活人无算，乡人称之为「昭公」。",
  },
  {
    key: "xianshi",
    name: "陈宪时",
    gender: "male",
    generation: 4,
    courtesyName: "维中",
    branch: "三房",
    birthYear: "1610",
    deathYear: "1685",
    father: "zhaoran",
    mother: "zhaoran_w",
    bio: "公讳宪时，字维中。康熙初年重辑谱牒，访求各房残本，考订讹误，用力最勤。",
  },

  // ── 第五世 ──
  {
    key: "wenyu",
    name: "陈文煜",
    gender: "male",
    generation: 5,
    courtesyName: "子辉",
    branch: "长房",
    birthYear: "1622",
    deathYear: "1690",
    father: "xianbang",
    bio: "公讳文煜，字子辉。康熙间监生，董修祠堂，规制至今仍之。",
  },
  {
    key: "wenhuan",
    name: "陈文焕",
    gender: "male",
    generation: 5,
    courtesyName: "子章",
    branch: "长房",
    birthYear: "1628",
    deathYear: "1695",
    father: "xianbang",
    bio: "公讳文焕，字子章。善画山水，性疏放，不事生产，晚岁以卖画自给。",
  },
  {
    key: "wencan",
    name: "陈文灿",
    gender: "male",
    generation: 5,
    courtesyName: "子昭",
    branch: "长房",
    birthYear: "1630",
    deathYear: "1698",
    father: "xianzhang",
    bio: "公讳文灿，字子昭。康熙间武举，授千总，守海澄有功。",
  },
  {
    key: "wenbing",
    name: "陈文炳",
    gender: "male",
    generation: 5,
    courtesyName: "子蔚",
    branch: "二房",
    birthYear: "1626",
    deathYear: "1692",
    father: "xianqing",
    bio: "公讳文炳，字子蔚。康熙间重修族谱，增立凡例十条，谱法始备。",
  },
  {
    key: "wenzhuo",
    name: "陈文焯",
    gender: "male",
    generation: 5,
    courtesyName: "子朗",
    branch: "三房",
    birthYear: "1632",
    deathYear: "1700",
    father: "xianming",
    bio: "公讳文焯，字子朗。继祖业行医，辑《家传方》一卷，藏于祠堂。",
  },
  {
    key: "wenzhao",
    name: "陈文炤",
    gender: "male",
    generation: 5,
    courtesyName: "子远",
    branch: "三房",
    birthYear: "1638",
    deathYear: "1705",
    father: "xianshi",
    bio: "公讳文炤，字子远。迁居郡城，开设书肆，族人赴试者多寓其家。",
  },

  // ── 第六世 ──
  {
    key: "zhangfu",
    name: "陈章甫",
    gender: "male",
    generation: 6,
    courtesyName: "冠卿",
    branch: "长房",
    birthYear: "1650",
    deathYear: "1718",
    father: "wenyu",
    bio: "公讳章甫，字冠卿。康熙间岁贡，任汀州府学训导，教士有方。",
  },
  {
    key: "zhangyou",
    name: "陈章佑",
    gender: "male",
    generation: 6,
    courtesyName: "启卿",
    branch: "长房",
    birthYear: "1656",
    deathYear: "1722",
    father: "wenhuan",
    bio: "公讳章佑，字启卿。承父画业，兼工篆刻，有《梅溪印存》。",
  },
  {
    key: "zhangyun",
    name: "陈章允",
    gender: "male",
    generation: 6,
    courtesyName: "信卿",
    branch: "二房",
    birthYear: "1655",
    deathYear: "1720",
    father: "wenbing",
    bio: "公讳章允，字信卿。守祭田，勤于祀事，四十年如一日。",
  },
  {
    key: "zhangyan",
    name: "陈章彦",
    gender: "male",
    generation: 6,
    courtesyName: "俊卿",
    branch: "三房",
    birthYear: "1660",
    deathYear: "1725",
    father: "wenzhuo",
    bio: "公讳章彦，字俊卿。乾隆初举孝廉方正，辞不就，教授于乡。",
  },

  // ── 第七世 ──
  {
    key: "huafeng",
    name: "陈华封",
    gender: "male",
    generation: 7,
    courtesyName: "祝三",
    branch: "长房",
    birthYear: "1680",
    deathYear: "1745",
    father: "zhangfu",
    bio: "公讳华封，字祝三。雍正间副贡，主讲梅溪书院，门下多成材者。",
  },
  {
    key: "huagun",
    name: "陈华衮",
    gender: "male",
    generation: 7,
    courtesyName: "锡三",
    branch: "二房",
    birthYear: "1685",
    deathYear: "1750",
    father: "zhangyun",
    bio: "公讳华衮，字锡三。增置祭田五十亩，立规条以垂后世。",
  },
]

function toInput(
  node: SeedNode,
  ids: Map<string, number>,
  order: number,
  familyId: number,
): MemberInput {
  return {
    familyId,
    name: node.name,
    gender: node.gender,
    generation: node.generation,
    courtesyName: node.courtesyName ?? "",
    fatherId: node.father ? (ids.get(node.father) ?? null) : null,
    motherId: node.mother ? (ids.get(node.mother) ?? null) : null,
    spouseId: null,
    isMarriedIn: Boolean(node.marriedIn),
    isBranchHeir: Boolean(node.branchHeir),
    branch: node.branch ?? "",
    birthYear: node.birthYear ?? "",
    deathYear: node.deathYear ?? "",
    isAlive: false,
    burialPlace: node.burialPlace ?? "",
    title: node.title ?? "",
    bio: node.bio ?? "",
    sortOrder: order,
    avatarKey: "",
  }
}

export async function ensureSeed(repo: Repo, initialAdminPassword?: string): Promise<void> {
  let family = await repo.getPrimaryFamily()
  if (!family) {
    const id = await repo.createFamily(FAMILY, null)
    family = await repo.getFamilyById(id)
  }

  if (family && (await repo.countMembers(family.id)) === 0) {
    const ids = new Map<string, number>()
    const inputs = new Map<string, MemberInput>()
    const orderByGeneration = new Map<number, number>()

    for (const node of NODES) {
      const order = orderByGeneration.get(node.generation) ?? 0
      orderByGeneration.set(node.generation, order + 1)
      const input = toInput(node, ids, order, family.id)
      const id = await repo.createMember(input, null)
      ids.set(node.key, id)
      inputs.set(node.key, input)
    }

    for (const node of NODES) {
      if (!node.spouse) continue
      const selfId = ids.get(node.key)
      const spouseId = ids.get(node.spouse)
      const selfInput = inputs.get(node.key)
      const spouseInput = inputs.get(node.spouse)
      if (!selfId || !spouseId || !selfInput || !spouseInput) continue
      await repo.updateMember(selfId, { ...selfInput, spouseId }, null)
      await repo.updateMember(spouseId, { ...spouseInput, spouseId: selfId }, null)
    }
  }

  if ((await repo.countAdmins()) === 0) {
    // 空库时生成一次性随机强口令，仅在此次启动日志中显示，不写入代码或文档
    const password = initialAdminPassword?.trim() || `${crypto.randomUUID()}${crypto.randomUUID()}`
    await repo.createAdmin(LEGACY_DEFAULT_USERNAME, await hashPassword(password), "super")
    if (!initialAdminPassword?.trim()) {
      console.warn(
        `[初始化] 已创建管理员 ${LEGACY_DEFAULT_USERNAME}，一次性初始密码：${password}（仅显示一次，请立即保存并修改）`,
      )
    }
    return
  }

  // 历史库：轮换掉曾内置的固定默认口令，避免公网上被直接接管
  const legacy = await repo.getAdminByUsername(LEGACY_DEFAULT_USERNAME)
  if (legacy && (await verifyPassword(LEGACY_DEFAULT_PASSWORD, legacy.passwordHash))) {
    const rotated = `${crypto.randomUUID()}${crypto.randomUUID()}`
    await repo.updateAdminPassword(legacy.id, await hashPassword(rotated))
    // H1：一次性口令仅用于首次登录，登录后必须立即自行改密
    await repo.setMustChangePassword(legacy.id, true)
    console.warn(
      `[安全] 检测到内置默认口令，已自动重置 ${LEGACY_DEFAULT_USERNAME} 密码：${rotated}（仅显示一次，请立即保存并修改）`,
    )
  }

  // 平台级全局配置：首次启动时写入默认网站名称（已存在则不覆盖）
  if (!(await repo.getSetting("siteName"))) {
    await repo.setSetting("siteName", "时光家谱")
  }
}
