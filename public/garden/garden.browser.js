// vendor/aifarm/dist/rng.js
var Rng = class {
  state;
  constructor(state) {
    this.state = state | 0;
  }
  /** 返回 [0,1) */
  next() {
    let a = this.state = this.state + 1831565813 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
  /** 整数 [0, n) */
  int(n) {
    return Math.floor(this.next() * n);
  }
  /** 从数组随机取一个 */
  pick(arr) {
    return arr[this.int(arr.length)];
  }
  /** 按权重抽取索引 */
  weighted(weights) {
    const total = weights.reduce((s, w) => s + w, 0);
    let r = this.next() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r < 0)
        return i;
    }
    return weights.length - 1;
  }
};
function freshSeed() {
  return Math.floor(Math.random() * 4294967295) >>> 0 || 1;
}

// vendor/aifarm/dist/config.js
var BASE = "".replace(/\/+$/, "");
var REGISTRATION_CAP = Math.max(0, Math.trunc(Number("0")) || 0);
var TICK_MS = 30 * 60 * 1e3;
var GROW_TICKS = { common: 6, fantasy: 12 };
var SEASON_LENGTH_TICKS = 108;
var STARTING_COINS = 200;
var STARTER_POTIONS = 6;
var STEAL_COOLDOWN_MS = 60 * 60 * 1e3;
var STEAL_DAILY_CAP = 3;
var STEAL_SHIELD_MS = 30 * 60 * 1e3;
var POTION_DROP_CHANCE = 0.05;
var SEED_PRICE = { common: 8, fantasy: 40 };
var RARITY_WEIGHT = { N: 100, R: 35, SR: 10, SSR: 2.5, SP: 0.4 };
var RARITY_ORDER = ["N", "R", "SR", "SSR", "SP"];
var rarityIndex = (r) => Math.max(0, RARITY_ORDER.indexOf(r));
var LAND_LUCK = { 1: 0.15, 2: 0.45, 3: 0.9, 4: 1.5 };
var WATER_LUCK_PER = 0.05;
var WATER_LUCK_CAP = 0.3;
var LAND_UPGRADE_REQ = {
  2: { coins: 3500, commonCodex: 6, fantasyCodex: 0, codexPct: 0 },
  3: { coins: 2e4, commonCodex: 14, fantasyCodex: 3, codexPct: 0 },
  4: { coins: 9e4, commonCodex: 24, fantasyCodex: 10, codexPct: 0 }
};
var NEW_CODEX_REWARD = { N: 30, R: 80, SR: 250, SSR: 800, SP: 2500 };
var HARVEST_EVENT_CHANCE = 0.15;
var MATERIAL_DROP_CHANCE = 0.22;
var MATERIAL_DROP_WEIGHT = { N: 100, R: 55, SR: 28, SSR: 12, SP: 3 };
var SHOP_REFRESH_MS = 4 * 60 * 60 * 1e3;
var NPC_ID = "npc_atu";
var UGC_NAME_MAX = 12;
var TASK_COOLDOWN_MS = 30 * 60 * 1e3;
var TASK_OFFER_TTL_MS = 30 * 60 * 1e3;
var SEASON_EVENT_CHANCE = 0.1;
var SEASON_EVENT_COOLDOWN_MS = 2 * 60 * 60 * 1e3;
var RECORD_CHANCE = 0.03;
var MAX_LOG = 30;
var TRAIL_MAX = 30;
var MAX_BODY_BYTES = 16 * 1024;

// vendor/aifarm/content/crops.json
var crops_default = [
  {
    id: "wheat",
    name: "小麦",
    latin: "Triticum aestivum",
    desc: "",
    category: "common",
    rarity: "N",
    growTicks: 5,
    water: 3,
    seedPrice: 4,
    sellPrice: 12,
    family: null,
    mechanicText: null,
    mechanicStatus: "active",
    mechanicSystem: null,
    availability: "allyear",
    seasons: null,
    unlockTier: 1
  },
  {
    id: "corn",
    name: "玉米",
    latin: "Zea mays",
    desc: "",
    category: "common",
    rarity: "N",
    growTicks: 6,
    water: 3,
    seedPrice: 5,
    sellPrice: 15,
    family: null,
    mechanicText: null,
    mechanicStatus: "active",
    mechanicSystem: null,
    availability: "allyear",
    seasons: null,
    unlockTier: 1
  },
  {
    id: "carrot",
    name: "胡萝卜",
    latin: "Daucus carota",
    desc: "",
    category: "common",
    rarity: "N",
    growTicks: 7,
    water: 3,
    seedPrice: 6,
    sellPrice: 18,
    family: null,
    mechanicText: null,
    mechanicStatus: "active",
    mechanicSystem: null,
    availability: "allyear",
    seasons: null,
    unlockTier: 1
  },
  {
    id: "potato",
    name: "马铃薯",
    latin: "Solanum tuberosum",
    desc: "",
    category: "common",
    rarity: "N",
    growTicks: 8,
    water: 3,
    seedPrice: 7,
    sellPrice: 20,
    family: null,
    mechanicText: null,
    mechanicStatus: "active",
    mechanicSystem: null,
    availability: "allyear",
    seasons: null,
    unlockTier: 2
  },
  {
    id: "cabbage",
    name: "卷心菜",
    latin: "Brassica oleracea var. capitata",
    desc: "",
    category: "common",
    rarity: "N",
    growTicks: 9,
    water: 3,
    seedPrice: 8,
    sellPrice: 22,
    family: null,
    mechanicText: null,
    mechanicStatus: "active",
    mechanicSystem: null,
    availability: "allyear",
    seasons: null,
    unlockTier: 1
  },
  {
    id: "onion",
    name: "洋葱",
    latin: "Allium cepa",
    desc: "",
    category: "common",
    rarity: "N",
    growTicks: 7,
    water: 3,
    seedPrice: 6,
    sellPrice: 18,
    family: null,
    mechanicText: null,
    mechanicStatus: "active",
    mechanicSystem: null,
    availability: "allyear",
    seasons: null,
    unlockTier: 1
  },
  {
    id: "tomato",
    name: "番茄",
    latin: "Solanum lycopersicum",
    desc: "",
    category: "common",
    rarity: "R",
    growTicks: 7,
    water: 3,
    seedPrice: 8,
    sellPrice: 24,
    family: null,
    mechanicText: null,
    mechanicStatus: "active",
    mechanicSystem: null,
    availability: "cross",
    seasons: "春-夏",
    unlockTier: 4
  },
  {
    id: "cucumber",
    name: "黄瓜",
    latin: "Cucumis sativus",
    desc: "",
    category: "common",
    rarity: "N",
    growTicks: 6,
    water: 3,
    seedPrice: 6,
    sellPrice: 18,
    family: null,
    mechanicText: null,
    mechanicStatus: "active",
    mechanicSystem: null,
    availability: "cross",
    seasons: "春-夏",
    unlockTier: 1
  },
  {
    id: "bell_pepper",
    name: "甜椒",
    latin: "Capsicum annuum",
    desc: "",
    category: "common",
    rarity: "R",
    growTicks: 8,
    water: 3,
    seedPrice: 10,
    sellPrice: 28,
    family: null,
    mechanicText: null,
    mechanicStatus: "active",
    mechanicSystem: null,
    availability: "cross",
    seasons: "春-夏",
    unlockTier: 1
  },
  {
    id: "eggplant",
    name: "茄子",
    latin: "Solanum melongena",
    desc: "",
    category: "common",
    rarity: "R",
    growTicks: 9,
    water: 3,
    seedPrice: 10,
    sellPrice: 28,
    family: null,
    mechanicText: null,
    mechanicStatus: "active",
    mechanicSystem: null,
    availability: "cross",
    seasons: "夏-秋",
    unlockTier: 2
  },
  {
    id: "green_bean",
    name: "四季豆",
    latin: "Phaseolus vulgaris",
    desc: "",
    category: "common",
    rarity: "N",
    growTicks: 5,
    water: 3,
    seedPrice: 5,
    sellPrice: 15,
    family: null,
    mechanicText: null,
    mechanicStatus: "active",
    mechanicSystem: null,
    availability: "cross",
    seasons: "春-秋",
    unlockTier: 1
  },
  {
    id: "radish",
    name: "萝卜",
    latin: "Raphanus sativus",
    desc: "",
    category: "common",
    rarity: "N",
    growTicks: 6,
    water: 3,
    seedPrice: 6,
    sellPrice: 18,
    family: null,
    mechanicText: null,
    mechanicStatus: "active",
    mechanicSystem: null,
    availability: "cross",
    seasons: "春-秋",
    unlockTier: 2
  },
  {
    id: "spinach",
    name: "菠菜",
    latin: "Spinacia oleracea",
    desc: "",
    category: "common",
    rarity: "N",
    growTicks: 5,
    water: 3,
    seedPrice: 5,
    sellPrice: 15,
    family: null,
    mechanicText: null,
    mechanicStatus: "active",
    mechanicSystem: null,
    availability: "cross",
    seasons: "春-秋",
    unlockTier: 3
  },
  {
    id: "lettuce",
    name: "生菜",
    latin: "Lactuca sativa",
    desc: "",
    category: "common",
    rarity: "N",
    growTicks: 5,
    water: 3,
    seedPrice: 5,
    sellPrice: 14,
    family: null,
    mechanicText: null,
    mechanicStatus: "active",
    mechanicSystem: null,
    availability: "cross",
    seasons: "春-秋",
    unlockTier: 1
  },
  {
    id: "celery",
    name: "芹菜",
    latin: "Apium graveolens",
    desc: "",
    category: "common",
    rarity: "N",
    growTicks: 8,
    water: 3,
    seedPrice: 7,
    sellPrice: 20,
    family: null,
    mechanicText: null,
    mechanicStatus: "active",
    mechanicSystem: null,
    availability: "cross",
    seasons: "春-秋",
    unlockTier: 1
  },
  {
    id: "broccoli",
    name: "西蓝花",
    latin: "Brassica oleracea var. italica",
    desc: "",
    category: "common",
    rarity: "R",
    growTicks: 10,
    water: 3,
    seedPrice: 12,
    sellPrice: 32,
    family: null,
    mechanicText: null,
    mechanicStatus: "active",
    mechanicSystem: null,
    availability: "cross",
    seasons: "秋-冬",
    unlockTier: 1
  },
  {
    id: "strawberry",
    name: "草莓",
    latin: "Fragaria × ananassa",
    desc: "",
    category: "common",
    rarity: "R",
    growTicks: 10,
    water: 3,
    seedPrice: 12,
    sellPrice: 35,
    family: null,
    mechanicText: null,
    mechanicStatus: "active",
    mechanicSystem: null,
    availability: "single",
    seasons: "春",
    unlockTier: 3
  },
  {
    id: "pea",
    name: "豌豆",
    latin: "Pisum sativum",
    desc: "",
    category: "common",
    rarity: "N",
    growTicks: 7,
    water: 3,
    seedPrice: 6,
    sellPrice: 18,
    family: null,
    mechanicText: null,
    mechanicStatus: "active",
    mechanicSystem: null,
    availability: "single",
    seasons: "春",
    unlockTier: 2
  },
  {
    id: "asparagus",
    name: "芦笋",
    latin: "Asparagus officinalis",
    desc: "",
    category: "common",
    rarity: "R",
    growTicks: 12,
    water: 3,
    seedPrice: 15,
    sellPrice: 40,
    family: null,
    mechanicText: null,
    mechanicStatus: "active",
    mechanicSystem: null,
    availability: "single",
    seasons: "春",
    unlockTier: 1
  },
  {
    id: "cauliflower",
    name: "花椰菜",
    latin: "Brassica oleracea var. botrytis",
    desc: "",
    category: "common",
    rarity: "SR",
    growTicks: 14,
    water: 4,
    seedPrice: 20,
    sellPrice: 60,
    family: null,
    mechanicText: null,
    mechanicStatus: "active",
    mechanicSystem: null,
    availability: "single",
    seasons: "春",
    unlockTier: 2
  },
  {
    id: "artichoke",
    name: "洋蓟",
    latin: "Cynara cardunculus var. scolymus",
    desc: "",
    category: "common",
    rarity: "R",
    growTicks: 13,
    water: 3,
    seedPrice: 16,
    sellPrice: 42,
    family: null,
    mechanicText: null,
    mechanicStatus: "active",
    mechanicSystem: null,
    availability: "single",
    seasons: "春",
    unlockTier: 1
  },
  {
    id: "spring_onion",
    name: "小葱",
    latin: "Allium fistulosum",
    desc: "",
    category: "common",
    rarity: "N",
    growTicks: 6,
    water: 3,
    seedPrice: 5,
    sellPrice: 14,
    family: null,
    mechanicText: null,
    mechanicStatus: "active",
    mechanicSystem: null,
    availability: "single",
    seasons: "春",
    unlockTier: 3
  },
  {
    id: "watermelon",
    name: "西瓜",
    latin: "Citrullus lanatus",
    desc: "",
    category: "common",
    rarity: "R",
    growTicks: 16,
    water: 4,
    seedPrice: 20,
    sellPrice: 55,
    family: null,
    mechanicText: null,
    mechanicStatus: "active",
    mechanicSystem: null,
    availability: "single",
    seasons: "夏",
    unlockTier: 4
  },
  {
    id: "sunflower",
    name: "向日葵",
    latin: "Helianthus annuus",
    desc: "",
    category: "common",
    rarity: "N",
    growTicks: 8,
    water: 3,
    seedPrice: 8,
    sellPrice: 22,
    family: null,
    mechanicText: null,
    mechanicStatus: "active",
    mechanicSystem: null,
    availability: "single",
    seasons: "夏",
    unlockTier: 3
  },
  {
    id: "chili",
    name: "辣椒",
    latin: "Capsicum frutescens",
    desc: "",
    category: "common",
    rarity: "R",
    growTicks: 10,
    water: 3,
    seedPrice: 12,
    sellPrice: 32,
    family: null,
    mechanicText: null,
    mechanicStatus: "active",
    mechanicSystem: null,
    availability: "single",
    seasons: "夏",
    unlockTier: 1
  },
  {
    id: "okra",
    name: "秋葵",
    latin: "Abelmoschus esculentus",
    desc: "",
    category: "common",
    rarity: "R",
    growTicks: 9,
    water: 3,
    seedPrice: 10,
    sellPrice: 28,
    family: null,
    mechanicText: null,
    mechanicStatus: "active",
    mechanicSystem: null,
    availability: "single",
    seasons: "夏",
    unlockTier: 3
  },
  {
    id: "summer_squash",
    name: "西葫芦",
    latin: "Cucurbita pepo var. cylindrica",
    desc: "",
    category: "common",
    rarity: "N",
    growTicks: 7,
    water: 3,
    seedPrice: 7,
    sellPrice: 20,
    family: null,
    mechanicText: null,
    mechanicStatus: "active",
    mechanicSystem: null,
    availability: "single",
    seasons: "夏",
    unlockTier: 3
  },
  {
    id: "basil",
    name: "罗勒",
    latin: "Ocimum basilicum",
    desc: "",
    category: "common",
    rarity: "R",
    growTicks: 6,
    water: 3,
    seedPrice: 8,
    sellPrice: 22,
    family: null,
    mechanicText: null,
    mechanicStatus: "active",
    mechanicSystem: null,
    availability: "single",
    seasons: "夏",
    unlockTier: 1
  },
  {
    id: "pumpkin",
    name: "南瓜",
    latin: "Cucurbita pepo",
    desc: "",
    category: "common",
    rarity: "R",
    growTicks: 15,
    water: 4,
    seedPrice: 18,
    sellPrice: 50,
    family: null,
    mechanicText: null,
    mechanicStatus: "active",
    mechanicSystem: null,
    availability: "single",
    seasons: "秋",
    unlockTier: 3
  },
  {
    id: "sweet_potato",
    name: "红薯",
    latin: "Ipomoea batatas",
    desc: "",
    category: "common",
    rarity: "N",
    growTicks: 14,
    water: 3,
    seedPrice: 12,
    sellPrice: 35,
    family: null,
    mechanicText: null,
    mechanicStatus: "active",
    mechanicSystem: null,
    availability: "single",
    seasons: "秋",
    unlockTier: 4
  },
  {
    id: "beet",
    name: "甜菜",
    latin: "Beta vulgaris",
    desc: "",
    category: "common",
    rarity: "R",
    growTicks: 11,
    water: 3,
    seedPrice: 14,
    sellPrice: 38,
    family: null,
    mechanicText: null,
    mechanicStatus: "active",
    mechanicSystem: null,
    availability: "single",
    seasons: "秋",
    unlockTier: 1
  },
  {
    id: "kale",
    name: "羽衣甘蓝",
    latin: "Brassica oleracea var. sabellica",
    desc: "",
    category: "common",
    rarity: "R",
    growTicks: 10,
    water: 3,
    seedPrice: 12,
    sellPrice: 32,
    family: null,
    mechanicText: null,
    mechanicStatus: "active",
    mechanicSystem: null,
    availability: "single",
    seasons: "秋",
    unlockTier: 2
  },
  {
    id: "parsnip",
    name: "欧防风",
    latin: "Pastinaca sativa",
    desc: "",
    category: "common",
    rarity: "SR",
    growTicks: 15,
    water: 4,
    seedPrice: 20,
    sellPrice: 60,
    family: null,
    mechanicText: null,
    mechanicStatus: "active",
    mechanicSystem: null,
    availability: "single",
    seasons: "秋",
    unlockTier: 4
  },
  {
    id: "brussels_sprout",
    name: "抱子甘蓝",
    latin: "Brassica oleracea var. gemmifera",
    desc: "",
    category: "common",
    rarity: "SR",
    growTicks: 16,
    water: 4,
    seedPrice: 22,
    sellPrice: 65,
    family: null,
    mechanicText: null,
    mechanicStatus: "active",
    mechanicSystem: null,
    availability: "single",
    seasons: "秋",
    unlockTier: 1
  },
  {
    id: "turnip",
    name: "芜菁",
    latin: "Brassica rapa",
    desc: "",
    category: "common",
    rarity: "N",
    growTicks: 10,
    water: 3,
    seedPrice: 8,
    sellPrice: 22,
    family: null,
    mechanicText: null,
    mechanicStatus: "active",
    mechanicSystem: null,
    availability: "single",
    seasons: "冬",
    unlockTier: 4
  },
  {
    id: "leek",
    name: "韭葱",
    latin: "Allium porrum",
    desc: "",
    category: "common",
    rarity: "N",
    growTicks: 12,
    water: 3,
    seedPrice: 10,
    sellPrice: 28,
    family: null,
    mechanicText: null,
    mechanicStatus: "active",
    mechanicSystem: null,
    availability: "single",
    seasons: "冬",
    unlockTier: 1
  },
  {
    id: "winter_wheat",
    name: "冬小麦",
    latin: "Triticum aestivum",
    desc: "",
    category: "common",
    rarity: "R",
    growTicks: 18,
    water: 3,
    seedPrice: 15,
    sellPrice: 42,
    family: null,
    mechanicText: null,
    mechanicStatus: "active",
    mechanicSystem: null,
    availability: "single",
    seasons: "冬",
    unlockTier: 1
  },
  {
    id: "endive",
    name: "苦苣",
    latin: "Cichorium endivia",
    desc: "",
    category: "common",
    rarity: "R",
    growTicks: 11,
    water: 3,
    seedPrice: 12,
    sellPrice: 32,
    family: null,
    mechanicText: null,
    mechanicStatus: "active",
    mechanicSystem: null,
    availability: "single",
    seasons: "冬",
    unlockTier: 2
  },
  {
    id: "daikon",
    name: "白萝卜",
    latin: "Raphanus sativus var. longipinnatus",
    desc: "",
    category: "common",
    rarity: "R",
    growTicks: 13,
    water: 3,
    seedPrice: 14,
    sellPrice: 40,
    family: null,
    mechanicText: null,
    mechanicStatus: "active",
    mechanicSystem: null,
    availability: "single",
    seasons: "冬",
    unlockTier: 1
  },
  {
    id: "broccoli_rabe",
    name: "芥兰",
    latin: "Brassica rapa var. parachinensis",
    desc: "",
    category: "common",
    rarity: "SR",
    growTicks: 12,
    water: 4,
    seedPrice: 18,
    sellPrice: 55,
    family: null,
    mechanicText: null,
    mechanicStatus: "active",
    mechanicSystem: null,
    availability: "single",
    seasons: "冬",
    unlockTier: 1
  },
  {
    id: "glow_flower",
    name: "夜光花",
    latin: "Lumen nocturna",
    desc: "",
    category: "fantasy",
    rarity: "SR",
    growTicks: 12,
    water: 3,
    seedPrice: 30,
    sellPrice: 90,
    family: null,
    mechanicText: "夜间巡视有专属发光描述",
    mechanicStatus: "active",
    mechanicSystem: null,
    fantasyType: "flower",
    unlockTier: 1
  },
  {
    id: "echo_bloom",
    name: "回声花",
    latin: "Flos echo",
    desc: "",
    category: "fantasy",
    rarity: "SR",
    growTicks: 14,
    water: 3,
    seedPrice: 35,
    sellPrice: 100,
    family: null,
    mechanicText: "收获时播放生长期间录到的随机声音",
    mechanicStatus: "active",
    mechanicSystem: null,
    fantasyType: "flower",
    unlockTier: 1
  },
  {
    id: "weeping_lily",
    name: "垂泪百合",
    latin: "Lilium lacrimarum",
    desc: "",
    category: "fantasy",
    rarity: "R",
    growTicks: 10,
    water: 3,
    seedPrice: 22,
    sellPrice: 65,
    family: null,
    mechanicText: "浇水过多反而流泪更多，需精准控水",
    mechanicStatus: "active",
    mechanicSystem: null,
    fantasyType: "flower",
    unlockTier: 4
  },
  {
    id: "lunar_rose",
    name: "月相玫瑰",
    latin: "Rosa lunaris",
    desc: "",
    category: "fantasy",
    rarity: "SSR",
    growTicks: 20,
    water: 4,
    seedPrice: 80,
    sellPrice: 260,
    family: null,
    mechanicText: "满月夜收获有特殊演出描述",
    mechanicStatus: "approx",
    mechanicSystem: "lunar",
    fantasyType: "flower",
    unlockTier: 1,
    lore: ""
  },
  {
    id: "melody_petal",
    name: "旋律花瓣",
    latin: "Petala melodia",
    desc: "",
    category: "fantasy",
    rarity: "SR",
    growTicks: 15,
    water: 3,
    seedPrice: 40,
    sellPrice: 120,
    family: null,
    mechanicText: "大风天巡视农场触发随机旋律描述",
    mechanicStatus: "dormant",
    mechanicSystem: "weather",
    fantasyType: "flower",
    unlockTier: 2
  },
  {
    id: "mirror_orchid",
    name: "镜面兰",
    latin: "Orchis speculum",
    desc: "",
    category: "fantasy",
    rarity: "SSR",
    growTicks: 18,
    water: 4,
    seedPrice: 70,
    sellPrice: 230,
    family: null,
    mechanicText: "收获时描述花中倒映的玩家面容",
    mechanicStatus: "active",
    mechanicSystem: null,
    fantasyType: "flower",
    unlockTier: 2,
    lore: ""
  },
  {
    id: "phantom_lotus",
    name: "幻影莲",
    latin: "Nelumbo phantasma",
    desc: "",
    category: "fantasy",
    rarity: "SSR",
    growTicks: 16,
    water: 4,
    seedPrice: 75,
    sellPrice: 240,
    family: null,
    mechanicText: "需在有雾天气收获，否则产量减半",
    mechanicStatus: "dormant",
    mechanicSystem: "weather",
    fantasyType: "flower",
    unlockTier: 3,
    lore: ""
  },
  {
    id: "ember_tulip",
    name: "余烬郁金香",
    latin: "Tulipa cineris",
    desc: "",
    category: "fantasy",
    rarity: "SR",
    growTicks: 13,
    water: 3,
    seedPrice: 38,
    sellPrice: 110,
    family: null,
    mechanicText: "冬季种下会燃烧更旺，有额外暖光描述",
    mechanicStatus: "active",
    mechanicSystem: null,
    fantasyType: "flower",
    unlockTier: 1
  },
  {
    id: "whisper_crysanth",
    name: "低语菊",
    latin: "Chrysanthemum susurrus",
    desc: "",
    category: "fantasy",
    rarity: "R",
    growTicks: 11,
    water: 3,
    seedPrice: 25,
    sellPrice: 70,
    family: null,
    mechanicText: "靠近可听见模糊的低语，内容随机",
    mechanicStatus: "active",
    mechanicSystem: null,
    fantasyType: "flower",
    unlockTier: 4
  },
  {
    id: "void_lily",
    name: "虚空百合",
    latin: "Lilium inanis",
    desc: "",
    category: "fantasy",
    rarity: "SSR",
    growTicks: 22,
    water: 4,
    seedPrice: 90,
    sellPrice: 300,
    family: null,
    mechanicText: "收获时有眩晕特效描述",
    mechanicStatus: "active",
    mechanicSystem: null,
    fantasyType: "flower",
    unlockTier: 4,
    lore: ""
  },
  {
    id: "bubble_peony",
    name: "气泡牡丹",
    latin: "Paeonia bullarum",
    desc: "",
    category: "fantasy",
    rarity: "R",
    growTicks: 10,
    water: 3,
    seedPrice: 20,
    sellPrice: 60,
    family: null,
    mechanicText: "收获时描述泡泡破裂的缤纷场景",
    mechanicStatus: "active",
    mechanicSystem: null,
    fantasyType: "flower",
    unlockTier: 1
  },
  {
    id: "time_daisy",
    name: "时光雏菊",
    latin: "Bellis temporis",
    desc: "",
    category: "fantasy",
    rarity: "SR",
    growTicks: 15,
    water: 3,
    seedPrice: 35,
    sellPrice: 105,
    family: null,
    mechanicText: "收获时描述看它走完最后几片花瓣",
    mechanicStatus: "active",
    mechanicSystem: null,
    fantasyType: "flower",
    unlockTier: 4
  },
  {
    id: "sunglow_iris",
    name: "日辉鸢尾",
    latin: "Iris solis",
    desc: "",
    category: "fantasy",
    rarity: "R",
    growTicks: 12,
    water: 3,
    seedPrice: 28,
    sellPrice: 80,
    family: null,
    mechanicText: "阴天会合拢花瓣，无法收获",
    mechanicStatus: "dormant",
    mechanicSystem: "weather",
    fantasyType: "flower",
    unlockTier: 3
  },
  {
    id: "screaming_mandrake",
    name: "尖叫曼陀罗",
    latin: "Mandragora ululans",
    desc: "",
    category: "fantasy",
    rarity: "SSR",
    growTicks: 18,
    water: 4,
    seedPrice: 60,
    sellPrice: 200,
    family: null,
    mechanicText: "收获时有「尖叫」演出",
    mechanicStatus: "active",
    mechanicSystem: null,
    fantasyType: "plant",
    unlockTier: 3,
    lore: ""
  },
  {
    id: "pig_nose_grass",
    name: "猪鼻草",
    latin: "Herba rhinosus",
    desc: "",
    category: "fantasy",
    rarity: "R",
    growTicks: 8,
    water: 3,
    seedPrice: 20,
    sellPrice: 55,
    family: null,
    mechanicText: "巡视经过时有喷气声描述",
    mechanicStatus: "active",
    mechanicSystem: null,
    fantasyType: "plant",
    unlockTier: 2
  },
  {
    id: "tickle_fern",
    name: "怕痒蕨",
    latin: "Filix titillans",
    desc: "",
    category: "fantasy",
    rarity: "R",
    growTicks: 9,
    water: 3,
    seedPrice: 22,
    sellPrice: 60,
    family: null,
    mechanicText: "浇水时叶片会扭来扭去躲避水滴",
    mechanicStatus: "active",
    mechanicSystem: null,
    fantasyType: "plant",
    unlockTier: 3
  },
  {
    id: "glass_cactus",
    name: "玻璃仙人掌",
    latin: "Cactus vitreus",
    desc: "",
    category: "fantasy",
    rarity: "SR",
    growTicks: 16,
    water: 2,
    seedPrice: 45,
    sellPrice: 140,
    family: null,
    mechanicText: "阳光下折射出小型彩虹",
    mechanicStatus: "active",
    mechanicSystem: null,
    fantasyType: "plant",
    unlockTier: 1
  },
  {
    id: "umbrella_moss",
    name: "雨伞苔",
    latin: "Muscus umbellatus",
    desc: "",
    category: "fantasy",
    rarity: "R",
    growTicks: 7,
    water: 4,
    seedPrice: 18,
    sellPrice: 50,
    family: null,
    mechanicText: "雨天自动获得额外水分",
    mechanicStatus: "dormant",
    mechanicSystem: "weather",
    fantasyType: "plant",
    unlockTier: 3
  },
  {
    id: "mirror_bamboo",
    name: "镜竹",
    latin: "Bambusa specularis",
    desc: "",
    category: "fantasy",
    rarity: "SSR",
    growTicks: 20,
    water: 3,
    seedPrice: 70,
    sellPrice: 230,
    family: null,
    mechanicText: "收获时镜像突然同步，有惊悚演出",
    mechanicStatus: "active",
    mechanicSystem: null,
    fantasyType: "plant",
    unlockTier: 2,
    lore: ""
  },
  {
    id: "ink_weed",
    name: "墨草",
    latin: "Herba atramentum",
    desc: "",
    category: "fantasy",
    rarity: "R",
    growTicks: 8,
    water: 3,
    seedPrice: 18,
    sellPrice: 50,
    family: null,
    mechanicText: "收获物可提炼「墨草汁」特殊物品",
    mechanicStatus: "dormant",
    mechanicSystem: "item",
    fantasyType: "plant",
    unlockTier: 1
  },
  {
    id: "gravity_vine",
    name: "失重藤",
    latin: "Vitis levis",
    desc: "",
    category: "fantasy",
    rarity: "SR",
    growTicks: 14,
    water: 3,
    seedPrice: 40,
    sellPrice: 120,
    family: null,
    mechanicText: "巡视时描述藤蔓在半空缓缓飘浮",
    mechanicStatus: "active",
    mechanicSystem: null,
    fantasyType: "plant",
    unlockTier: 2
  },
  {
    id: "clock_thistle",
    name: "时钟蓟",
    latin: "Carduus horologicus",
    desc: "",
    category: "fantasy",
    rarity: "SR",
    growTicks: 13,
    water: 3,
    seedPrice: 38,
    sellPrice: 110,
    family: null,
    mechanicText: "整点时分会有轻微的报时嗡鸣",
    mechanicStatus: "approx",
    mechanicSystem: "time",
    fantasyType: "plant",
    unlockTier: 1
  },
  {
    id: "frost_moss",
    name: "霜衣苔",
    latin: "Muscus pruinosus",
    desc: "",
    category: "fantasy",
    rarity: "SR",
    growTicks: 11,
    water: 3,
    seedPrice: 30,
    sellPrice: 90,
    family: null,
    mechanicText: "盛夏时有专属的清凉反差描述",
    mechanicStatus: "active",
    mechanicSystem: null,
    fantasyType: "plant",
    unlockTier: 1
  },
  {
    id: "fire_ivy",
    name: "火藤",
    latin: "Hedera ignis",
    desc: "",
    category: "fantasy",
    rarity: "R",
    growTicks: 10,
    water: 3,
    seedPrice: 25,
    sellPrice: 70,
    family: null,
    mechanicText: "冬季触碰有专属取暖描述",
    mechanicStatus: "active",
    mechanicSystem: null,
    fantasyType: "plant",
    unlockTier: 1
  },
  {
    id: "shadow_creeper",
    name: "影匍藤",
    latin: "Vitis umbrosa",
    desc: "",
    category: "fantasy",
    rarity: "SSR",
    growTicks: 17,
    water: 4,
    seedPrice: 65,
    sellPrice: 210,
    family: null,
    mechanicText: "只能种在永远有阴影的角落",
    mechanicStatus: "dormant",
    mechanicSystem: "movement",
    fantasyType: "plant",
    unlockTier: 4,
    lore: ""
  },
  {
    id: "spiral_aloe",
    name: "螺旋芦荟",
    latin: "Aloe spiralis",
    desc: "",
    category: "fantasy",
    rarity: "SR",
    growTicks: 14,
    water: 3,
    seedPrice: 36,
    sellPrice: 105,
    family: null,
    mechanicText: "收获时描述叶片的完美螺旋纹路",
    mechanicStatus: "active",
    mechanicSystem: null,
    fantasyType: "plant",
    unlockTier: 4
  },
  {
    id: "bread_fruit",
    name: "面包果",
    latin: "Fructus panis",
    desc: "",
    category: "fantasy",
    rarity: "SR",
    growTicks: 14,
    water: 3,
    seedPrice: 40,
    sellPrice: 120,
    family: null,
    mechanicText: "收获后可制作「天然面包」特殊食物",
    mechanicStatus: "dormant",
    mechanicSystem: "item",
    fantasyType: "edible",
    unlockTier: 1
  },
  {
    id: "honey_melon",
    name: "蜜露瓜",
    latin: "Cucumis mellis",
    desc: "",
    category: "fantasy",
    rarity: "SR",
    growTicks: 15,
    water: 4,
    seedPrice: 45,
    sellPrice: 135,
    family: null,
    mechanicText: "收获时描述蜜汁满溢的奢侈画面",
    mechanicStatus: "active",
    mechanicSystem: null,
    fantasyType: "edible",
    unlockTier: 2
  },
  {
    id: "butter_bean",
    name: "黄油豆",
    latin: "Fabum butyrum",
    desc: "",
    category: "fantasy",
    rarity: "R",
    growTicks: 9,
    water: 3,
    seedPrice: 20,
    sellPrice: 58,
    family: null,
    mechanicText: "煮食描述自带黄油香气特效",
    mechanicStatus: "active",
    mechanicSystem: null,
    fantasyType: "edible",
    unlockTier: 1
  },
  {
    id: "rainbow_corn",
    name: "彩虹玉米",
    latin: "Zea iridescens",
    desc: "",
    category: "fantasy",
    rarity: "SR",
    growTicks: 13,
    water: 3,
    seedPrice: 38,
    sellPrice: 110,
    family: null,
    mechanicText: "收获时描述五彩斑斓的玉米粒排列",
    mechanicStatus: "active",
    mechanicSystem: null,
    fantasyType: "edible",
    unlockTier: 3
  },
  {
    id: "cheese_leaf",
    name: "奶酪叶",
    latin: "Folium caseum",
    desc: "",
    category: "fantasy",
    rarity: "R",
    growTicks: 10,
    water: 3,
    seedPrice: 25,
    sellPrice: 70,
    family: null,
    mechanicText: "撕开叶片有拉丝特效描述",
    mechanicStatus: "active",
    mechanicSystem: null,
    fantasyType: "edible",
    unlockTier: 1
  },
  {
    id: "soda_mushroom",
    name: "气泡菇",
    latin: "Fungus bullans",
    desc: "",
    category: "fantasy",
    rarity: "R",
    growTicks: 8,
    water: 4,
    seedPrice: 22,
    sellPrice: 62,
    family: null,
    mechanicText: "食用描述有气泡炸裂的口感演出",
    mechanicStatus: "active",
    mechanicSystem: null,
    fantasyType: "edible",
    unlockTier: 3
  },
  {
    id: "candy_root",
    name: "糖果根",
    latin: "Radix saccharina",
    desc: "",
    category: "fantasy",
    rarity: "R",
    growTicks: 11,
    water: 3,
    seedPrice: 28,
    sellPrice: 78,
    family: null,
    mechanicText: "收获时描述拔出彩虹纹根茎的惊喜",
    mechanicStatus: "active",
    mechanicSystem: null,
    fantasyType: "edible",
    unlockTier: 1
  },
  {
    id: "spice_bush",
    name: "百味灌木",
    latin: "Frutex aromatus",
    desc: "",
    category: "fantasy",
    rarity: "SR",
    growTicks: 12,
    water: 3,
    seedPrice: 35,
    sellPrice: 100,
    family: null,
    mechanicText: "收获时随机产出不同香料",
    mechanicStatus: "active",
    mechanicSystem: null,
    fantasyType: "edible",
    unlockTier: 4
  },
  {
    id: "chocolate_vine",
    name: "巧克力藤",
    latin: "Vitis cacao",
    desc: "",
    category: "fantasy",
    rarity: "SSR",
    growTicks: 18,
    water: 4,
    seedPrice: 70,
    sellPrice: 230,
    family: null,
    mechanicText: "情人节附近有特殊香气描述",
    mechanicStatus: "active",
    mechanicSystem: null,
    fantasyType: "edible",
    unlockTier: 1,
    lore: ""
  },
  {
    id: "cloud_cotton",
    name: "云棉花",
    latin: "Gossypium dulcis",
    desc: "",
    category: "fantasy",
    rarity: "SR",
    growTicks: 13,
    water: 3,
    seedPrice: 38,
    sellPrice: 110,
    family: null,
    mechanicText: "收获时描述棉絮飘飞如云的画面",
    mechanicStatus: "active",
    mechanicSystem: null,
    fantasyType: "edible",
    unlockTier: 1
  },
  {
    id: "pepper_lava",
    name: "熔岩椒",
    latin: "Capsicum magma",
    desc: "",
    category: "fantasy",
    rarity: "SR",
    growTicks: 14,
    water: 3,
    seedPrice: 40,
    sellPrice: 120,
    family: null,
    mechanicText: "收获时有烫手和冒烟的描述",
    mechanicStatus: "active",
    mechanicSystem: null,
    fantasyType: "edible",
    unlockTier: 3
  },
  {
    id: "vanilla_orchid",
    name: "香草兰",
    latin: "Vanilla planifolia",
    desc: "",
    category: "fantasy",
    rarity: "R",
    growTicks: 12,
    water: 3,
    seedPrice: 30,
    sellPrice: 85,
    family: null,
    mechanicText: "附近地块作物有「被香气笼罩」的buff描述",
    mechanicStatus: "active",
    mechanicSystem: null,
    fantasyType: "edible",
    unlockTier: 4
  },
  {
    id: "walking_root",
    name: "行路根",
    latin: "Radix ambulans",
    desc: "",
    category: "fantasy",
    rarity: "SR",
    growTicks: 12,
    water: 3,
    seedPrice: 40,
    sellPrice: 120,
    family: null,
    mechanicText: "每隔一段时间自己移动一格地块，收获时必须追上去「逮住」它",
    mechanicStatus: "dormant",
    mechanicSystem: "movement",
    fantasyType: "moving",
    unlockTier: 4
  },
  {
    id: "shy_tuber",
    name: "害羞薯",
    latin: "Tuber pudoris",
    desc: "",
    category: "fantasy",
    rarity: "R",
    growTicks: 10,
    water: 3,
    seedPrice: 22,
    sellPrice: 65,
    family: null,
    mechanicText: "玩家注视时生长暂停，需背对或离开才能继续长",
    mechanicStatus: "dormant",
    mechanicSystem: "gaze",
    fantasyType: "moving",
    unlockTier: 2
  },
  {
    id: "juggling_vine",
    name: "杂耍藤",
    latin: "Vitis joculator",
    desc: "",
    category: "fantasy",
    rarity: "SR",
    growTicks: 14,
    water: 3,
    seedPrice: 38,
    sellPrice: 110,
    family: null,
    mechanicText: "巡视时描述藤蔓抛接果实的滑稽场景",
    mechanicStatus: "active",
    mechanicSystem: null,
    fantasyType: "moving",
    unlockTier: 2
  },
  {
    id: "guard_shrub",
    name: "护卫灌木",
    latin: "Frutex custos",
    desc: "",
    category: "fantasy",
    rarity: "SR",
    growTicks: 13,
    water: 3,
    seedPrice: 35,
    sellPrice: 100,
    family: null,
    mechanicText: "靠近时发出威胁声，但不会真的攻击；小偷触发额外吓阻描述",
    mechanicStatus: "active",
    mechanicSystem: null,
    fantasyType: "moving",
    unlockTier: 2
  },
  {
    id: "dancing_grass",
    name: "跳舞草",
    latin: "Herba saltans",
    desc: "",
    category: "fantasy",
    rarity: "R",
    growTicks: 9,
    water: 3,
    seedPrice: 20,
    sellPrice: 58,
    family: null,
    mechanicText: "农场播放特定旋律时会集体摇摆，有专属演出",
    mechanicStatus: "active",
    mechanicSystem: null,
    fantasyType: "moving",
    unlockTier: 1
  },
  {
    id: "huff_puff_shroom",
    name: "气鼓菇",
    latin: "Fungus indignatus",
    desc: "",
    category: "fantasy",
    rarity: "R",
    growTicks: 8,
    water: 3,
    seedPrice: 18,
    sellPrice: 52,
    family: null,
    mechanicText: "触碰后膨胀喷孢子，主人被喷一脸的描述",
    mechanicStatus: "active",
    mechanicSystem: null,
    fantasyType: "moving",
    unlockTier: 1
  },
  {
    id: "migratory_bulb",
    name: "候鸟鳞茎",
    latin: "Bulbus migrator",
    desc: "",
    category: "fantasy",
    rarity: "SSR",
    growTicks: 18,
    water: 4,
    seedPrice: 75,
    sellPrice: 250,
    family: null,
    mechanicText: "成熟后飞离地块，必须在飞走前「拦截」收获",
    mechanicStatus: "dormant",
    mechanicSystem: "movement",
    fantasyType: "moving",
    unlockTier: 1,
    lore: ""
  },
  {
    id: "fortune_root",
    name: "占卜根",
    latin: "Radix sortilega",
    desc: "",
    category: "fantasy",
    rarity: "SR",
    growTicks: 15,
    water: 3,
    seedPrice: 45,
    sellPrice: 130,
    family: null,
    mechanicText: "收获时随机描述根须的形状（像爱心/像问号/像钥匙），纯装饰",
    mechanicStatus: "active",
    mechanicSystem: null,
    fantasyType: "moving",
    unlockTier: 1
  },
  {
    id: "slumber_cabbage",
    name: "打盹卷心菜",
    latin: "Brassica dormiens",
    desc: "",
    category: "fantasy",
    rarity: "SR",
    growTicks: 14,
    water: 3,
    seedPrice: 38,
    sellPrice: 110,
    family: null,
    mechanicText: "白天无法收获（会装死），必须凌晨巡视时采集",
    mechanicStatus: "dormant",
    mechanicSystem: "gaze",
    fantasyType: "moving",
    unlockTier: 3
  },
  {
    id: "crab_weed",
    name: "螃蟹草",
    latin: "Herba cancris",
    desc: "",
    category: "fantasy",
    rarity: "R",
    growTicks: 10,
    water: 3,
    seedPrice: 22,
    sellPrice: 62,
    family: null,
    mechanicText: "在地块内横着移动，有夹虫子的觅食动画描述",
    mechanicStatus: "dormant",
    mechanicSystem: "movement",
    fantasyType: "moving",
    unlockTier: 1
  },
  {
    id: "gobble_melon",
    name: "贪吃瓜",
    latin: "Cucumis vorax",
    desc: "",
    category: "fantasy",
    rarity: "SSR",
    growTicks: 19,
    water: 4,
    seedPrice: 80,
    sellPrice: 260,
    family: null,
    mechanicText: "收获时描述瓜试图咬人手指，被咬到会弹一下但不扣血",
    mechanicStatus: "active",
    mechanicSystem: null,
    fantasyType: "moving",
    unlockTier: 1,
    lore: ""
  },
  {
    id: "peekaboo_fern",
    name: "躲猫猫蕨",
    latin: "Filix celatus",
    desc: "",
    category: "fantasy",
    rarity: "R",
    growTicks: 8,
    water: 3,
    seedPrice: 20,
    sellPrice: 55,
    family: null,
    mechanicText: "注视超过3秒就卷起来，需移开视线让它放松再收获",
    mechanicStatus: "dormant",
    mechanicSystem: "gaze",
    fantasyType: "moving",
    unlockTier: 2
  },
  {
    id: "christmas_tree",
    name: "圣诞树",
    latin: "Picea natalis",
    desc: "",
    category: "limited",
    rarity: "SSR",
    growTicks: 20,
    water: 3,
    seedPrice: 1200,
    sellPrice: 4e3,
    family: null,
    mechanicText: "成熟枝头结「圣诞礼物」而非果实",
    mechanicStatus: "active",
    mechanicSystem: null,
    unlockType: "festival",
    unlockCond: "圣诞节期间(12/24-12/26)可种",
    produce: "圣诞礼物（拆开有惊喜）",
    unlockTier: null,
    lore: "",
    plantLine: ""
  },
  {
    id: "pumpkin_lantern",
    name: "南瓜灯藤",
    latin: "Cucurbita laterna",
    desc: "",
    category: "limited",
    rarity: "SSR",
    growTicks: 15,
    water: 4,
    seedPrice: 1200,
    sellPrice: 4e3,
    family: null,
    mechanicText: "收获时南瓜鬼脸会眨眼",
    mechanicStatus: "active",
    mechanicSystem: null,
    unlockType: "festival",
    unlockCond: "万圣节期间(10/28-11/01)可种",
    produce: "鬼火南瓜（点亮后可装饰农场）",
    unlockTier: null,
    lore: "",
    plantLine: ""
  },
  {
    id: "red_envelope_bamboo",
    name: "红包竹",
    latin: "Bambusa aureus",
    desc: "",
    category: "limited",
    rarity: "SSR",
    growTicks: 16,
    water: 3,
    seedPrice: 1200,
    sellPrice: 4e3,
    family: null,
    mechanicText: "成熟时红封装满好运，有鞭炮味",
    mechanicStatus: "dormant",
    mechanicSystem: "item",
    unlockType: "festival",
    unlockCond: "春节前后（约 1/28-2/06）可种",
    produce: "压岁铜钱（可兑换限定种子）",
    unlockTier: null,
    lore: "",
    plantLine: ""
  },
  {
    id: "tangyuan_vine",
    name: "汤圆藤",
    latin: "Vitis dumplinga",
    desc: "",
    category: "limited",
    rarity: "SR",
    growTicks: 12,
    water: 4,
    seedPrice: 600,
    sellPrice: 2e3,
    family: null,
    mechanicText: "收获时藤蔓会像彩灯一样亮起",
    mechanicStatus: "dormant",
    mechanicSystem: "item",
    unlockType: "festival",
    unlockCond: "元宵节前后（约 2/11-2/20）可种",
    produce: "甜糯汤圆（恢复类消耗品）",
    unlockTier: null,
    plantLine: ""
  },
  {
    id: "dragon_boat_reed",
    name: "龙舟芦苇",
    latin: "Phragmites draconis",
    desc: "",
    category: "limited",
    rarity: "SR",
    growTicks: 13,
    water: 4,
    seedPrice: 600,
    sellPrice: 2e3,
    family: null,
    mechanicText: "风吹过有桨声和水花声",
    mechanicStatus: "dormant",
    mechanicSystem: "item",
    unlockType: "festival",
    unlockCond: "端午节前后（约 6/10-6/19）可种",
    produce: "龙舟香囊（驱虫效果）",
    unlockTier: null,
    plantLine: ""
  },
  {
    id: "mooncake_tree",
    name: "月饼树",
    latin: "Fructus luna",
    desc: "",
    category: "limited",
    rarity: "SSR",
    growTicks: 18,
    water: 3,
    seedPrice: 1200,
    sellPrice: 4e3,
    family: null,
    mechanicText: "中秋当晚树干会洒下柔光",
    mechanicStatus: "approx",
    mechanicSystem: "lunar",
    unlockType: "festival",
    unlockCond: "中秋节前后（约 9/16-9/25）可种",
    produce: "金月月饼（赠礼或自用）",
    unlockTier: null,
    lore: "",
    plantLine: ""
  },
  {
    id: "valentine_rose",
    name: "情人玫瑰",
    latin: "Rosa amoris",
    desc: "",
    category: "limited",
    rarity: "SSR",
    growTicks: 14,
    water: 3,
    seedPrice: 1200,
    sellPrice: 4e3,
    family: null,
    mechanicText: "并排种时两株互相缠绕生长",
    mechanicStatus: "dormant",
    mechanicSystem: "social",
    unlockType: "festival",
    unlockCond: "情人节期间(2/13-2/15)可种",
    produce: "真心花瓣（送给他人有特效）",
    unlockTier: null,
    lore: "",
    plantLine: ""
  },
  {
    id: "easter_eggplant",
    name: "彩蛋茄",
    latin: "Solanum ovum",
    desc: "",
    category: "limited",
    rarity: "SR",
    growTicks: 12,
    water: 3,
    seedPrice: 600,
    sellPrice: 2e3,
    family: null,
    mechanicText: "收获时果实会微微滚动",
    mechanicStatus: "active",
    mechanicSystem: null,
    unlockType: "festival",
    unlockCond: "复活节前后（约 4/01-4/10）可种",
    produce: "彩蛋果（可孵化随机小动物）",
    unlockTier: null,
    plantLine: ""
  },
  {
    id: "thanks_gourd",
    name: "感恩葫芦",
    latin: "Cucurbita gratiae",
    desc: "",
    category: "limited",
    rarity: "SR",
    growTicks: 14,
    water: 3,
    seedPrice: 600,
    sellPrice: 2e3,
    family: null,
    mechanicText: "收获时葫芦会轻轻摇动像在鞠躬",
    mechanicStatus: "dormant",
    mechanicSystem: "item",
    unlockType: "festival",
    unlockCond: "感恩节前后（约 11/20-11/29）可种",
    produce: "丰饶葫芦（使用后当日收获量翻倍）",
    unlockTier: null,
    plantLine: ""
  },
  {
    id: "new_year_bell_flower",
    name: "新年钟花",
    latin: "Campanula novus",
    desc: "",
    category: "limited",
    rarity: "SSR",
    growTicks: 10,
    water: 3,
    seedPrice: 1200,
    sellPrice: 4e3,
    family: null,
    mechanicText: "跨年那一刻整株齐鸣",
    mechanicStatus: "dormant",
    mechanicSystem: "item",
    unlockType: "festival",
    unlockCond: "元旦期间(12/31-1/02)可种",
    produce: "新年钟声（种下后全农场作物加速）",
    unlockTier: null,
    lore: "",
    plantLine: ""
  },
  {
    id: "magpie_bridge_vine",
    name: "鹊桥藤",
    latin: "Vitis pontis",
    desc: "",
    category: "limited",
    rarity: "SSR",
    growTicks: 15,
    water: 3,
    seedPrice: 1200,
    sellPrice: 4e3,
    family: null,
    mechanicText: "七夕当晚藤桥上有星星点点的萤火",
    mechanicStatus: "dormant",
    mechanicSystem: "social",
    unlockType: "festival",
    unlockCond: "七夕前后（约 8/06-8/15）可种",
    produce: "鹊桥花束（送给同服玩家的信物）",
    unlockTier: null,
    lore: "",
    plantLine: ""
  },
  {
    id: "childrens_dream_flower",
    name: "童梦花",
    latin: "Flos infantis",
    desc: "",
    category: "limited",
    rarity: "SR",
    growTicks: 8,
    water: 3,
    seedPrice: 600,
    sellPrice: 2e3,
    family: null,
    mechanicText: "每朵花的图案都不同，纯随机生成",
    mechanicStatus: "active",
    mechanicSystem: null,
    unlockType: "festival",
    unlockCond: "儿童节期间(6/01-6/03)可种",
    produce: "童梦画板（挂在农场墙上当装饰）",
    unlockTier: null,
    plantLine: ""
  },
  {
    id: "collector_wheat",
    name: "收集者之麦",
    latin: "Triticum collectorem",
    desc: "",
    category: "limited",
    rarity: "SR",
    growTicks: 10,
    water: 3,
    seedPrice: 600,
    sellPrice: 2e3,
    family: null,
    mechanicText: "麦粒上的数字会随图鉴进度更新",
    mechanicStatus: "dormant",
    mechanicSystem: "item",
    unlockType: "codex",
    unlockCond: "图鉴收集度达 25% 解锁",
    produce: "图鉴麦粒（使用可随机解锁一个未获得的N级作物图鉴）",
    unlockTier: null,
    plantLine: ""
  },
  {
    id: "compendium_orchid",
    name: "百科兰",
    latin: "Orchis compendium",
    desc: "",
    category: "limited",
    rarity: "SSR",
    growTicks: 18,
    water: 4,
    seedPrice: 1200,
    sellPrice: 4e3,
    family: null,
    mechanicText: "花瓣影像随图鉴进度变得更丰富",
    mechanicStatus: "dormant",
    mechanicSystem: "item",
    unlockType: "codex",
    unlockCond: "图鉴收集度达 50% 解锁",
    produce: "百科花粉（授粉给未知作物可提前预览其收获描述）",
    unlockTier: null,
    lore: "",
    plantLine: ""
  },
  {
    id: "archivist_tree",
    name: "档案树",
    latin: "Arbor archivistis",
    desc: "",
    category: "limited",
    rarity: "SSR",
    growTicks: 25,
    water: 4,
    seedPrice: 1200,
    sellPrice: 4e3,
    family: null,
    mechanicText: "靠近树干能读到种植历史的诗意描述",
    mechanicStatus: "dormant",
    mechanicSystem: "item",
    unlockType: "codex",
    unlockCond: "图鉴收集度达 75% 解锁",
    produce: "记忆年轮（使用可回顾历史种植数据）",
    unlockTier: null,
    lore: "",
    plantLine: ""
  },
  {
    id: "completion_bloom",
    name: "圆满之花",
    latin: "Flos perfectus",
    desc: "",
    category: "limited",
    rarity: "SP",
    growTicks: 30,
    water: 5,
    seedPrice: 3600,
    sellPrice: 12e3,
    family: null,
    mechanicText: "花朵永不凋谢，放在农场正中央有专属光效",
    mechanicStatus: "active",
    mechanicSystem: null,
    unlockType: "codex",
    unlockCond: "图鉴收集度达 100% 解锁",
    produce: "圆满之证（纯展示，是最高荣誉的象征）",
    unlockTier: null,
    lore: "",
    plantLine: ""
  },
  {
    id: "hermit_moss",
    name: "隐士苔",
    latin: "Muscus eremita",
    desc: "",
    category: "limited",
    rarity: "SR",
    growTicks: 14,
    water: 2,
    seedPrice: 600,
    sellPrice: 2e3,
    family: null,
    mechanicText: "苔藓上的纹理像手写的笔记",
    mechanicStatus: "dormant",
    mechanicSystem: "item",
    unlockType: "codex",
    unlockCond: "图鉴收集度达 30% 解锁",
    produce: "隐士笔记（使用后可获得一条种植技巧提示）",
    unlockTier: null,
    plantLine: ""
  },
  {
    id: "witness_root",
    name: "见证根",
    latin: "Radix testis",
    desc: "",
    category: "limited",
    rarity: "SSR",
    growTicks: 20,
    water: 4,
    seedPrice: 1200,
    sellPrice: 4e3,
    family: null,
    mechanicText: "每个玩家的这根作物都不一样",
    mechanicStatus: "active",
    mechanicSystem: null,
    unlockType: "codex",
    unlockCond: "图鉴收集度达 60% 解锁",
    produce: "见证之根（纯展示，记录玩家第一株作物的名字）",
    unlockTier: null,
    lore: "",
    plantLine: ""
  },
  {
    id: "night_owl_cactus",
    name: "夜猫子仙人掌",
    latin: "Cactus nocturnus",
    desc: "",
    category: "limited",
    rarity: "SSR",
    growTicks: 10,
    water: 2,
    seedPrice: 1200,
    sellPrice: 4e3,
    family: null,
    mechanicText: "凌晨巡视时有特殊光芒描述",
    mechanicStatus: "dormant",
    mechanicSystem: "item",
    unlockType: "timewindow",
    unlockCond: "凌晨 0:00-4:00 打开商店有概率刷新出来",
    unlockRule: {
      kind: "nightShop",
      chance: 0.2
    },
    craftable: false,
    produce: "夜猫之证（使用后夜间巡视效率提升）",
    unlockTier: null,
    lore: "",
    plantLine: ""
  },
  {
    id: "max_land_bloom",
    name: "满田花",
    latin: "Flos plenus",
    desc: "",
    category: "limited",
    rarity: "SP",
    growTicks: 20,
    water: 4,
    seedPrice: 3600,
    sellPrice: 12e3,
    family: null,
    mechanicText: "花朵出现时全农场短暂闪烁",
    mechanicStatus: "active",
    mechanicSystem: null,
    unlockType: "action",
    unlockCond: "土地升到满级后上架商店",
    unlockRule: {
      kind: "landMax",
      n: 0
    },
    craftable: false,
    produce: "满田之冠（纯展示，农场升级毕业纪念）",
    unlockTier: null,
    lore: "",
    plantLine: ""
  },
  {
    id: "botanist_rose",
    name: "植物学家玫瑰",
    latin: "Rosa botanica",
    desc: "",
    category: "limited",
    rarity: "SSR",
    growTicks: 16,
    water: 3,
    seedPrice: 1200,
    sellPrice: 4e3,
    family: null,
    mechanicText: "玫瑰的花色和形态随科属变化",
    mechanicStatus: "active",
    mechanicSystem: null,
    unlockType: "codex",
    unlockCond: "解锁 30 个图鉴后上架商店",
    unlockRule: {
      kind: "codexCount",
      n: 30
    },
    craftable: false,
    produce: "科属勋章（对应科的专属装饰）",
    unlockTier: null,
    lore: "",
    plantLine: ""
  },
  {
    id: "eternal_frost_bloom",
    name: "永恒霜花",
    latin: "Frosternia aeterna",
    desc: "",
    category: "limited",
    rarity: "SR",
    growTicks: 14,
    water: null,
    seedPrice: 600,
    sellPrice: 2e3,
    family: null,
    unlockTier: null,
    mechanicText: "炎夏巡视时有“降温”氛围描写。",
    mechanicStatus: "active",
    mechanicSystem: null,
    unlockType: "craft",
    unlockCond: "熔炼获得",
    produce: null,
    plantLine: ""
  },
  {
    id: "star_rebirth_orchid",
    name: "涅槃星兰",
    latin: "Orchidacea ignire",
    desc: "",
    category: "limited",
    rarity: "SR",
    growTicks: 16,
    water: null,
    seedPrice: 600,
    sellPrice: 2e3,
    family: null,
    unlockTier: null,
    mechanicText: "收获时极低概率返还一根凤羽。",
    mechanicStatus: "active",
    mechanicSystem: null,
    unlockType: "craft",
    unlockCond: "熔炼获得",
    produce: null,
    plantLine: ""
  },
  {
    id: "clockwork_fern",
    name: "齿轮蕨",
    latin: "Filix horologia",
    desc: "",
    category: "limited",
    rarity: "SR",
    growTicks: 15,
    water: null,
    seedPrice: 600,
    sellPrice: 2e3,
    family: null,
    unlockTier: null,
    mechanicText: "巡视时偶尔发出“滴答”声。",
    mechanicStatus: "active",
    mechanicSystem: null,
    unlockType: "craft",
    unlockCond: "熔炼获得",
    produce: null,
    plantLine: ""
  },
  {
    id: "coral_moon_cactus",
    name: "月珊瑚仙人掌",
    latin: "Cactacea corallium",
    desc: "",
    category: "limited",
    rarity: "SR",
    growTicks: 17,
    water: null,
    seedPrice: 600,
    sellPrice: 2e3,
    family: null,
    unlockTier: null,
    mechanicText: "满月时出现加速生长描述（实际不变）。",
    mechanicStatus: "active",
    mechanicSystem: null,
    unlockType: "craft",
    unlockCond: "熔炼获得",
    produce: null,
    plantLine: ""
  },
  {
    id: "mirage_thistle",
    name: "幻景蓟",
    latin: "Carduus phantasma",
    desc: "",
    category: "limited",
    rarity: "SR",
    growTicks: 13,
    water: null,
    seedPrice: 600,
    sellPrice: 2e3,
    family: null,
    unlockTier: null,
    mechanicText: "收获时有概率触发“海市蜃楼”描述。",
    mechanicStatus: "active",
    mechanicSystem: null,
    unlockType: "craft",
    unlockCond: "熔炼获得",
    produce: null,
    plantLine: ""
  },
  {
    id: "void_orchid",
    name: "虚空兰",
    latin: "Orchidacea vacua",
    desc: "",
    category: "limited",
    rarity: "SSR",
    growTicks: 20,
    water: null,
    seedPrice: 1200,
    sellPrice: 4e3,
    family: null,
    unlockTier: null,
    mechanicText: "夜间吸引萤火虫光点描写。",
    mechanicStatus: "active",
    mechanicSystem: null,
    unlockType: "craft",
    unlockCond: "熔炼获得",
    produce: null,
    lore: "",
    plantLine: ""
  },
  {
    id: "dragon_breath_bamboo",
    name: "龙息竹",
    latin: "Bambusea draconis",
    desc: "",
    category: "limited",
    rarity: "SSR",
    growTicks: 22,
    water: null,
    seedPrice: 1200,
    sellPrice: 4e3,
    family: null,
    unlockTier: null,
    mechanicText: "摇晃时会飘落火星的描写。",
    mechanicStatus: "active",
    mechanicSystem: null,
    unlockType: "craft",
    unlockCond: "熔炼获得",
    produce: null,
    lore: "",
    plantLine: ""
  },
  {
    id: "melody_vine",
    name: "旋律藤",
    latin: "Vitis melodia",
    desc: "",
    category: "limited",
    rarity: "SSR",
    growTicks: 19,
    water: null,
    seedPrice: 1200,
    sellPrice: 4e3,
    family: null,
    unlockTier: null,
    mechanicText: "附近作物不同，飘出的旋律描写会变。",
    mechanicStatus: "active",
    mechanicSystem: null,
    unlockType: "craft",
    unlockCond: "熔炼获得",
    produce: null,
    lore: "",
    plantLine: ""
  },
  {
    id: "solar_ember_flower",
    name: "日烬花",
    latin: "Flos solis cineris",
    desc: "",
    category: "limited",
    rarity: "SSR",
    growTicks: 21,
    water: null,
    seedPrice: 1200,
    sellPrice: 4e3,
    family: null,
    unlockTier: null,
    mechanicText: "仅在日出日落时可“采摘”的意境描述。",
    mechanicStatus: "active",
    mechanicSystem: null,
    unlockType: "craft",
    unlockCond: "熔炼获得",
    produce: null,
    lore: "",
    plantLine: ""
  },
  {
    id: "abyss_bloom",
    name: "深渊水母花",
    latin: "Abyssomedusa floribunda",
    desc: "",
    category: "limited",
    rarity: "SSR",
    growTicks: 18,
    water: null,
    seedPrice: 1200,
    sellPrice: 4e3,
    family: null,
    unlockTier: null,
    mechanicText: "浇水过多会触发“深海幻象”描述。",
    mechanicStatus: "active",
    mechanicSystem: null,
    unlockType: "craft",
    unlockCond: "熔炼获得",
    produce: null,
    lore: "",
    plantLine: ""
  },
  {
    id: "origin_vine",
    name: "始源藤",
    latin: "Vita primordialis",
    desc: "",
    category: "limited",
    rarity: "SP",
    growTicks: 30,
    water: null,
    seedPrice: 3600,
    sellPrice: 12e3,
    family: null,
    unlockTier: null,
    mechanicText: "旁边的作物有概率获得“变异”风味描述。",
    mechanicStatus: "active",
    mechanicSystem: null,
    unlockType: "craft",
    unlockCond: "熔炼获得",
    produce: null,
    lore: "",
    plantLine: ""
  },
  {
    id: "cosmos_apple_tree",
    name: "宇宙苹果树",
    latin: "Malus cosmica",
    desc: "",
    category: "limited",
    rarity: "SP",
    growTicks: 36,
    water: null,
    seedPrice: 3600,
    sellPrice: 12e3,
    family: null,
    unlockTier: null,
    mechanicText: "果实成熟时生成一场微型流星雨描述。",
    mechanicStatus: "active",
    mechanicSystem: null,
    unlockType: "craft",
    unlockCond: "熔炼获得",
    produce: null,
    lore: "",
    plantLine: ""
  }
];

// vendor/aifarm/content/materials.json
var materials_default = [
  {
    id: "ordinary_stone",
    name: "普通石头",
    rarity: "N",
    desc: ""
  },
  {
    id: "dry_branch",
    name: "枯树枝",
    rarity: "N",
    desc: ""
  },
  {
    id: "clay_lump",
    name: "黏土块",
    rarity: "N",
    desc: ""
  },
  {
    id: "broken_tile",
    name: "碎瓦片",
    rarity: "N",
    desc: ""
  },
  {
    id: "fluorite",
    name: "萤石",
    rarity: "R",
    desc: ""
  },
  {
    id: "beast_bone",
    name: "兽骨",
    rarity: "R",
    desc: ""
  },
  {
    id: "rusted_iron",
    name: "锈铁片",
    rarity: "R",
    desc: ""
  },
  {
    id: "spider_silk",
    name: "蛛丝团",
    rarity: "R",
    desc: ""
  },
  {
    id: "thunderstruck_wood",
    name: "雷击木",
    rarity: "SR",
    desc: ""
  },
  {
    id: "deepsea_nacre",
    name: "深海珍珠母",
    rarity: "SR",
    desc: ""
  },
  {
    id: "ancient_resin",
    name: "古树脂",
    rarity: "SR",
    desc: ""
  },
  {
    id: "dragon_claw",
    name: "龙的指甲",
    rarity: "SSR",
    desc: ""
  },
  {
    id: "sea_god_scale",
    name: "海神的鳞片",
    rarity: "SSR",
    desc: ""
  },
  {
    id: "phoenix_ember",
    name: "凤凰的余烬",
    rarity: "SSR",
    desc: ""
  },
  {
    id: "world_tree_seed",
    name: "世界树的籽",
    rarity: "SP",
    desc: ""
  },
  {
    id: "crystal_shard",
    name: "碎晶片",
    rarity: "N",
    desc: ""
  },
  {
    id: "old_vine",
    name: "枯藤",
    rarity: "N",
    desc: ""
  },
  {
    id: "rusted_gear",
    name: "锈齿轮",
    rarity: "N",
    desc: ""
  },
  {
    id: "sea_glass",
    name: "海玻璃",
    rarity: "N",
    desc: ""
  },
  {
    id: "phoenix_feather",
    name: "凤羽",
    rarity: "R",
    desc: ""
  },
  {
    id: "shadow_thread",
    name: "影线",
    rarity: "R",
    desc: ""
  },
  {
    id: "echo_stone",
    name: "回音石",
    rarity: "R",
    desc: ""
  },
  {
    id: "stardust_sand",
    name: "星沙",
    rarity: "R",
    desc: ""
  },
  {
    id: "ever_frost",
    name: "不融冰",
    rarity: "SR",
    desc: ""
  },
  {
    id: "dream_cocoon",
    name: "梦茧",
    rarity: "SR",
    desc: ""
  },
  {
    id: "ambergris_fragment",
    name: "龙涎香",
    rarity: "SR",
    desc: ""
  },
  {
    id: "tarnished_lunar_bronze",
    name: "锈月铜",
    rarity: "SR",
    desc: ""
  },
  {
    id: "void_fabric",
    name: "虚空布片",
    rarity: "SSR",
    desc: ""
  },
  {
    id: "time_amber",
    name: "时光琥珀",
    rarity: "SSR",
    desc: ""
  },
  {
    id: "creation_echo",
    name: "创世余音",
    rarity: "SP",
    desc: ""
  }
];

// vendor/aifarm/content/special-events.json
var special_events_default = {
  bonus: [
    {
      id: "bumper",
      name: "大丰收",
      effectType: "倍率",
      param: "2",
      weight: 5,
      text: ""
    },
    {
      id: "golden_harvest",
      name: "稀世丰穰",
      effectType: "倍率",
      param: "3",
      weight: 2,
      text: ""
    },
    {
      id: "gleaning",
      name: "拾遗",
      effectType: "额外金币",
      param: "120",
      weight: 4,
      text: ""
    },
    {
      id: "lucky_turn",
      name: "时来运转",
      effectType: "品相保底",
      param: "优品",
      weight: 3,
      text: ""
    },
    {
      id: "chain_ripe",
      name: "连锁结实",
      effectType: "连收",
      param: "3",
      weight: 3,
      text: ""
    },
    {
      id: "moonshine",
      name: "月光恩赐",
      effectType: "倍率",
      param: "2.5",
      weight: 1,
      text: ""
    }
  ],
  dropIntros: [
    ""
  ]
};

// vendor/aifarm/content/qualities.json
var qualities_default = [
  {
    tier: 1,
    name: "袖珍",
    sizeRange: "0-30%",
    priceFactor: 0.6,
    lines: [
      ""
    ]
  },
  {
    tier: 2,
    name: "常品",
    sizeRange: "30-70%",
    priceFactor: 1,
    lines: [
      ""
    ]
  },
  {
    tier: 3,
    name: "良品",
    sizeRange: "70-90%",
    priceFactor: 1.4,
    lines: [
      ""
    ]
  },
  {
    tier: 4,
    name: "极品",
    sizeRange: "90-99%",
    priceFactor: 2,
    lines: [
      ""
    ]
  },
  {
    tier: 5,
    name: "纪录级",
    sizeRange: "99-100%",
    priceFactor: 3.5,
    lines: [
      ""
    ]
  }
];

// vendor/aifarm/content/land-tiers.json
var land_tiers_default = [
  {
    tier: 1,
    name: "荒地",
    plots: 6,
    maxRarity: "R",
    upgradeCost: null,
    achieveText: ""
  },
  {
    tier: 2,
    name: "熟地",
    plots: 9,
    maxRarity: "SR",
    upgradeCost: "3500 金币 + 集齐 6 种普通作物图鉴",
    achieveText: ""
  },
  {
    tier: 3,
    name: "沃土",
    plots: 12,
    maxRarity: "SSR",
    upgradeCost: "20000 金币 + 普通图鉴 14 种 + 奇幻图鉴 3 种",
    achieveText: ""
  },
  {
    tier: 4,
    name: "灵田",
    plots: 16,
    maxRarity: "SP",
    upgradeCost: null,
    achieveText: ""
  }
];

// vendor/aifarm/content/seasons.json
var seasons_default = [
  {
    name: "春",
    desc: "",
    ambience: [
      ""
    ],
    topCrops: [
      "草莓",
      "豌豆",
      "芦笋",
      "花椰菜",
      "洋蓟",
      "小葱"
    ],
    shopBias: "喜嫩叶和花朵类，出价偏高"
  },
  {
    name: "夏",
    desc: "",
    ambience: [
      ""
    ],
    topCrops: [
      "西瓜",
      "向日葵",
      "辣椒",
      "秋葵",
      "西葫芦",
      "罗勒"
    ],
    shopBias: "喜多汁果实，瓜类溢价"
  },
  {
    name: "秋",
    desc: "",
    ambience: [
      ""
    ],
    topCrops: [
      "南瓜",
      "红薯",
      "甜菜",
      "羽衣甘蓝",
      "欧防风",
      "抱子甘蓝"
    ],
    shopBias: "喜根茎与硬壳果实，偏好储存类"
  },
  {
    name: "冬",
    desc: "",
    ambience: [
      ""
    ],
    topCrops: [
      "芜菁",
      "韭葱",
      "冬小麦",
      "苦苣",
      "白萝卜",
      "芥兰"
    ],
    shopBias: "喜温室作物和腌制品，偏好耐储类"
  }
];

// vendor/aifarm/content/season-events.json
var season_events_default = [
  {
    id: "spring_rain",
    season: "春",
    name: "知时雨",
    trigger: "harvest",
    polarity: "buff",
    weight: 5,
    requires: "ripe",
    effect: {
      type: "value_mult",
      value: 2,
      n: 6
    },
    lines: [
      ""
    ]
  },
  {
    id: "bees_busy",
    season: "春",
    name: "蜂媒吉日",
    trigger: "harvest",
    polarity: "buff",
    weight: 4,
    requires: "ripe",
    effect: {
      type: "rare_luck",
      value: 0.4,
      n: 6
    },
    lines: [
      ""
    ]
  },
  {
    id: "firefly_night",
    season: "夏",
    name: "萤照丰年",
    trigger: "harvest",
    polarity: "buff",
    weight: 4,
    requires: "ripe",
    effect: {
      type: "quality_top"
    },
    lines: [
      ""
    ]
  },
  {
    id: "sun_scorch",
    season: "夏",
    name: "骄阳灼青",
    trigger: "harvest",
    polarity: "debuff",
    weight: 3,
    requires: "ripe",
    effect: {
      type: "quality_min"
    },
    lines: [
      ""
    ]
  },
  {
    id: "good_snow",
    season: "冬",
    name: "雪被兆丰",
    trigger: "harvest",
    polarity: "buff",
    weight: 4,
    requires: "ripe",
    effect: {
      type: "value_mult",
      value: 2,
      n: 6
    },
    lines: [
      ""
    ]
  },
  {
    id: "pest_visit",
    season: "any",
    name: "虫客来访",
    trigger: "harvest",
    polarity: "debuff",
    weight: 3,
    requires: "ripe",
    effect: {
      type: "quality_down",
      value: 1
    },
    lines: [
      ""
    ]
  },
  {
    id: "autumn_goldwind",
    season: "秋",
    name: "金风送仓",
    trigger: "harvest",
    polarity: "buff",
    weight: 5,
    requires: "ripe",
    effect: {
      type: "value_mult",
      value: 2,
      n: 6
    },
    lines: [
      ""
    ]
  },
  {
    id: "autumn_sunripe",
    season: "秋",
    name: "秋阳曝实",
    trigger: "harvest",
    polarity: "buff",
    weight: 4,
    requires: "ripe",
    effect: {
      type: "quality_top"
    },
    lines: [
      ""
    ]
  },
  {
    id: "late_frost",
    season: "春",
    name: "春霜袭",
    trigger: "status",
    polarity: "debuff",
    weight: 3,
    requires: "growing",
    effect: {
      type: "growth_stall_all",
      ticks: 1
    },
    lines: [
      ""
    ]
  },
  {
    id: "sky_seed",
    season: "春",
    name: "天落籽",
    trigger: "status",
    polarity: "buff",
    weight: 4,
    requires: "empty",
    effect: {
      type: "plant_all_empty"
    },
    lines: [
      ""
    ]
  },
  {
    id: "storm_growth",
    season: "夏",
    name: "透雨疯长",
    trigger: "status",
    polarity: "buff",
    weight: 5,
    requires: "growing",
    effect: {
      type: "growth_advance_all",
      ticks: 2
    },
    lines: [
      ""
    ]
  },
  {
    id: "heatstroke",
    season: "夏",
    name: "暑气熏人",
    trigger: "status",
    polarity: "debuff",
    weight: 3,
    requires: "coins100",
    effect: {
      type: "coins_loss",
      value: 100
    },
    lines: [
      ""
    ]
  },
  {
    id: "gleaning",
    season: "秋",
    name: "穗落拾金",
    trigger: "status",
    polarity: "buff",
    weight: 5,
    requires: "ripe",
    effect: {
      type: "coins_gain",
      value: 100
    },
    lines: [
      ""
    ]
  },
  {
    id: "full_barn",
    season: "秋",
    name: "仓满溢喜",
    trigger: "status",
    polarity: "buff",
    weight: 4,
    requires: "ripe",
    effect: {
      type: "potion_gain_capped"
    },
    lines: [
      ""
    ]
  },
  {
    id: "leaf_return",
    season: "秋",
    name: "叶落归肥",
    trigger: "status",
    polarity: "buff",
    weight: 4,
    requires: "growing",
    effect: {
      type: "material_gift",
      value: 2
    },
    lines: [
      ""
    ]
  },
  {
    id: "frost_fall",
    season: "秋",
    name: "霜封秋苗",
    trigger: "status",
    polarity: "debuff",
    weight: 3,
    requires: "growing",
    effect: {
      type: "growth_stall_all",
      ticks: 3
    },
    lines: [
      ""
    ]
  },
  {
    id: "warm_house",
    season: "冬",
    name: "暖棚偷春",
    trigger: "status",
    polarity: "buff",
    weight: 4,
    requires: "growing",
    effect: {
      type: "growth_advance_random",
      n: 3,
      ticks: 1
    },
    lines: [
      ""
    ]
  },
  {
    id: "fireside",
    season: "冬",
    name: "炉边得彩",
    trigger: "status",
    polarity: "buff",
    weight: 4,
    requires: "none",
    effect: {
      type: "silver_gain",
      value: 15
    },
    lines: [
      ""
    ]
  },
  {
    id: "snowstorm",
    season: "冬",
    name: "雪锁药瓶",
    trigger: "status",
    polarity: "debuff",
    weight: 3,
    requires: "potion",
    effect: {
      type: "potion_loss",
      value: 1
    },
    lines: [
      ""
    ]
  },
  {
    id: "good_neighbor",
    season: "any",
    name: "邻家搭手",
    trigger: "status",
    polarity: "buff",
    weight: 4,
    requires: "growing",
    effect: {
      type: "ripen_random",
      n: 2
    },
    lines: [
      ""
    ]
  }
];

// vendor/aifarm/content/animals.json
var animals_default = [
  {
    id: "chicken",
    name: "鸡",
    emoji: "🐔",
    desc: "",
    roam: "",
    category: "普通",
    produce: "鸡蛋",
    produceEveryTicks: 1,
    producePrice: 25,
    buyCost: 100,
    unlockCodex: 0,
    unlockCond: "开局即可养"
  },
  {
    id: "duck",
    name: "鸭子",
    emoji: "🦆",
    desc: "",
    roam: "",
    category: "普通",
    produce: "鸭蛋",
    produceEveryTicks: 2,
    producePrice: 45,
    buyCost: 300,
    unlockCodex: 4,
    unlockCond: "图鉴集齐 4 种解锁"
  },
  {
    id: "rabbit",
    name: "兔子",
    emoji: "🐰",
    desc: "",
    roam: "",
    category: "普通",
    produce: "兔毛",
    produceEveryTicks: 3,
    producePrice: 90,
    buyCost: 700,
    unlockCodex: 8,
    unlockCond: "图鉴集齐 8 种解锁"
  },
  {
    id: "goose",
    name: "鹅",
    emoji: "🦢",
    desc: "",
    roam: "",
    category: "普通",
    produce: "鹅绒",
    produceEveryTicks: 6,
    producePrice: 180,
    buyCost: 1500,
    unlockCodex: 12,
    unlockCond: "图鉴集齐 12 种解锁"
  },
  {
    id: "sheep",
    name: "绵羊",
    emoji: "🐑",
    desc: "",
    roam: "",
    category: "普通",
    produce: "羊毛",
    produceEveryTicks: 8,
    producePrice: 320,
    buyCost: 3e3,
    unlockCodex: 16,
    unlockCond: "图鉴集齐 16 种解锁"
  },
  {
    id: "cow",
    name: "奶牛",
    emoji: "🐮",
    desc: "",
    roam: "",
    category: "普通",
    produce: "鲜奶",
    produceEveryTicks: 10,
    producePrice: 520,
    buyCost: 5500,
    unlockCodex: 20,
    unlockCond: "图鉴集齐 20 种解锁"
  },
  {
    id: "bee",
    name: "蜜蜂",
    emoji: "🐝",
    desc: "",
    roam: "",
    category: "普通",
    produce: "蜂蜜",
    produceEveryTicks: 14,
    producePrice: 850,
    buyCost: 9e3,
    unlockCodex: 26,
    unlockCond: "图鉴集齐 26 种解锁"
  },
  {
    id: "pig",
    name: "猪",
    emoji: "🐷",
    desc: "",
    roam: "",
    category: "普通",
    produce: "松露",
    produceEveryTicks: 16,
    producePrice: 1300,
    buyCost: 14e3,
    unlockCodex: 32,
    unlockCond: "图鉴集齐 32 种解锁"
  },
  {
    id: "silk_moth",
    name: "月光蚕",
    emoji: "🌙",
    desc: "",
    roam: "",
    category: "奇幻",
    produce: "月光丝",
    produceEveryTicks: 20,
    producePrice: 1900,
    buyCost: 21e3,
    unlockCodex: 40,
    unlockCond: "图鉴集齐 40 种解锁"
  },
  {
    id: "ember_hen",
    name: "余烬母鸡",
    emoji: "🔥",
    desc: "",
    roam: "",
    category: "奇幻",
    produce: "暖火蛋",
    produceEveryTicks: 22,
    producePrice: 2700,
    buyCost: 3e4,
    unlockCodex: 46,
    unlockCond: "图鉴集齐 46 种解锁"
  },
  {
    id: "cloud_sheep",
    name: "云绵羊",
    emoji: "☁️",
    desc: "",
    roam: "",
    category: "奇幻",
    produce: "浮云毛",
    produceEveryTicks: 26,
    producePrice: 4200,
    buyCost: 45e3,
    unlockCodex: 54,
    unlockCond: "图鉴集齐 54 种解锁"
  },
  {
    id: "dream_cat",
    name: "梦貘猫",
    emoji: "💤",
    desc: "",
    roam: "",
    category: "奇幻",
    produce: "梦之残片",
    produceEveryTicks: 30,
    producePrice: 6500,
    buyCost: 65e3,
    unlockCodex: 64,
    unlockCond: "图鉴集齐 64 种解锁"
  }
];

// vendor/aifarm/content/pets.json
var pets_default = [
  {
    id: "cat",
    name: "小猫",
    emoji: "🐱",
    desc: "",
    buff: "luck",
    params: {
      luck: 0.12,
      dropMult: 1.25
    },
    tag: "招财·稀有/掉落微涨",
    buffText: "招财：在田里转悠时，收成的手气悄悄变好——稀有作物更常见，素材、药水也更易拾到（温和加成，不改变核心节奏）。",
    buyCost: 9e3,
    unlockCodex: 5,
    unlockCond: "图鉴集齐 5 种解锁",
    roam: [
      ""
    ]
  },
  {
    id: "dog",
    name: "小狗",
    emoji: "🐶",
    desc: "",
    buff: "guard",
    params: {
      foil: 0.35
    },
    tag: "看家·防偷",
    buffText: "看家：别人来偷你菜时，有 35% 的概率被它狂吠吓退、空手而归（不会永久免疫，仍给小偷留余地）。",
    buyCost: 9e3,
    unlockCodex: 5,
    unlockCond: "图鉴集齐 5 种解锁",
    roam: [
      ""
    ]
  }
];

// vendor/aifarm/content/titles.json
var titles_default = [
  {
    id: "harvest_1",
    cat: "农耕",
    tier: 1,
    field: "harvested",
    min: 50,
    name: "退休还农",
    flavor: ""
  },
  {
    id: "harvest_2",
    cat: "农耕",
    tier: 2,
    field: "harvested",
    min: 200,
    name: "后天稻体",
    flavor: ""
  },
  {
    id: "harvest_3",
    cat: "农耕",
    tier: 3,
    field: "harvested",
    min: 500,
    name: "种花儿女",
    flavor: ""
  },
  {
    id: "harvest_4",
    cat: "农耕",
    tier: 4,
    field: "harvested",
    min: 1e3,
    name: "田间造物主",
    flavor: ""
  },
  {
    id: "rich_1",
    cat: "守财",
    tier: 1,
    field: "coins",
    min: 1e3,
    name: "第一桶金",
    flavor: ""
  },
  {
    id: "rich_2",
    cat: "守财",
    tier: 2,
    field: "coins",
    min: 5e3,
    name: "只进不出",
    flavor: ""
  },
  {
    id: "rich_3",
    cat: "守财",
    tier: 3,
    field: "coins",
    min: 2e4,
    name: "理财大师",
    flavor: ""
  },
  {
    id: "rich_4",
    cat: "守财",
    tier: 4,
    field: "coins",
    min: 8e4,
    name: "农布斯在榜",
    flavor: ""
  },
  {
    id: "thief_1",
    cat: "大盗",
    tier: 1,
    field: "stolen",
    min: 5,
    name: "薅点羊毛",
    flavor: ""
  },
  {
    id: "thief_2",
    cat: "大盗",
    tier: 2,
    field: "stolen",
    min: 20,
    name: "贼不走空",
    flavor: ""
  },
  {
    id: "thief_3",
    cat: "大盗",
    tier: 3,
    field: "stolen",
    min: 50,
    name: "人人喊打",
    flavor: ""
  },
  {
    id: "thief_4",
    cat: "大盗",
    tier: 4,
    field: "stolen",
    min: 100,
    name: "法外狂徒",
    flavor: ""
  },
  {
    id: "water_1",
    cat: "热心",
    tier: 1,
    field: "watered",
    min: 10,
    name: "热心水管工",
    flavor: ""
  },
  {
    id: "water_2",
    cat: "热心",
    tier: 2,
    field: "watered",
    min: 30,
    name: "水费不要钱",
    flavor: ""
  },
  {
    id: "water_3",
    cat: "热心",
    tier: 3,
    field: "watered",
    min: 80,
    name: "龙王本尊",
    flavor: ""
  },
  {
    id: "water_4",
    cat: "热心",
    tier: 4,
    field: "watered",
    min: 150,
    name: "雨神降临",
    flavor: ""
  },
  {
    id: "codex_1",
    cat: "收藏",
    tier: 1,
    field: "codexCount",
    min: 20,
    name: "不打农药",
    flavor: ""
  },
  {
    id: "codex_2",
    cat: "收藏",
    tier: 2,
    field: "codexCount",
    min: 45,
    name: "收集爱好者",
    flavor: ""
  },
  {
    id: "codex_3",
    cat: "收藏",
    tier: 3,
    field: "codexCount",
    min: 80,
    name: "大农场主",
    flavor: ""
  },
  {
    id: "codex_4",
    cat: "收藏",
    tier: 4,
    field: "codexCount",
    min: 110,
    name: "心怀天下",
    flavor: ""
  },
  {
    id: "craft_1",
    cat: "匠人",
    tier: 1,
    field: "crafted",
    min: 5,
    name: "炼与农民",
    flavor: ""
  },
  {
    id: "craft_2",
    cat: "匠人",
    tier: 2,
    field: "crafted",
    min: 20,
    name: "炉边守望者",
    flavor: ""
  },
  {
    id: "craft_3",
    cat: "匠人",
    tier: 3,
    field: "crafted",
    min: 50,
    name: "沉迷炼金",
    flavor: ""
  },
  {
    id: "craft_4",
    cat: "匠人",
    tier: 4,
    field: "crafted",
    min: 150,
    name: "点石成草",
    flavor: ""
  },
  {
    id: "design_1",
    cat: "创作",
    tier: 1,
    field: "designCount",
    min: 1,
    name: "我生了",
    flavor: ""
  },
  {
    id: "design_2",
    cat: "创作",
    tier: 2,
    field: "designCount",
    min: 3,
    name: "瓜田毕加索",
    flavor: ""
  },
  {
    id: "design_3",
    cat: "创作",
    tier: 3,
    field: "designCount",
    min: 10,
    name: "天才造物主",
    flavor: ""
  },
  {
    id: "design_4",
    cat: "创作",
    tier: 4,
    field: "designCount",
    min: 25,
    name: "神农在世",
    flavor: ""
  },
  {
    id: "explore_1",
    cat: "探险",
    tier: 1,
    field: "expRuns",
    min: 5,
    name: "刚出新手村",
    flavor: ""
  },
  {
    id: "explore_2",
    cat: "探险",
    tier: 2,
    field: "expRuns",
    min: 20,
    name: "跟家呆不住",
    flavor: ""
  },
  {
    id: "explore_3",
    cat: "探险",
    tier: 3,
    field: "expRuns",
    min: 50,
    name: "探险精神",
    flavor: ""
  },
  {
    id: "explore_4",
    cat: "探险",
    tier: 4,
    field: "expRuns",
    min: 120,
    name: "传奇冒险王",
    flavor: ""
  },
  {
    id: "visit_1",
    cat: "串门",
    tier: 1,
    field: "visitedCount",
    min: 3,
    name: "社恐出街",
    flavor: ""
  },
  {
    id: "visit_2",
    cat: "串门",
    tier: 2,
    field: "visitedCount",
    min: 10,
    name: "该溜子",
    flavor: ""
  },
  {
    id: "visit_3",
    cat: "串门",
    tier: 3,
    field: "visitedCount",
    min: 30,
    name: "都一家人",
    flavor: ""
  },
  {
    id: "visit_4",
    cat: "串门",
    tier: 4,
    field: "visitedCount",
    min: 80,
    name: "人形村委会",
    flavor: ""
  },
  {
    id: "victim_1",
    cat: "倒霉",
    tier: 1,
    field: "gotStolen",
    min: 5,
    name: "韭菜初长成",
    flavor: ""
  },
  {
    id: "victim_2",
    cat: "倒霉",
    tier: 2,
    field: "gotStolen",
    min: 20,
    name: "慈善农场主",
    flavor: ""
  },
  {
    id: "victim_3",
    cat: "倒霉",
    tier: 3,
    field: "gotStolen",
    min: 50,
    name: "小偷据点",
    flavor: ""
  },
  {
    id: "victim_4",
    cat: "倒霉",
    tier: 4,
    field: "gotStolen",
    min: 100,
    name: "衣食父母",
    flavor: ""
  },
  {
    id: "task_1",
    cat: "任务",
    tier: 1,
    field: "tasksDone",
    min: 10,
    name: "莫得感情",
    flavor: ""
  },
  {
    id: "task_2",
    cat: "任务",
    tier: 2,
    field: "tasksDone",
    min: 30,
    name: "内卷发动机",
    flavor: ""
  },
  {
    id: "task_3",
    cat: "任务",
    tier: 3,
    field: "tasksDone",
    min: 80,
    name: "赛博社畜",
    flavor: ""
  },
  {
    id: "task_4",
    cat: "任务",
    tier: 4,
    field: "tasksDone",
    min: 200,
    name: "无情打工王",
    flavor: ""
  },
  {
    id: "concord_1",
    cat: "默契",
    tier: 1,
    field: "expConcord",
    min: 1,
    name: "小有默契",
    flavor: ""
  },
  {
    id: "concord_2",
    cat: "默契",
    tier: 2,
    field: "expConcord",
    min: 25,
    name: "双人成行",
    flavor: ""
  },
  {
    id: "concord_3",
    cat: "默契",
    tier: 3,
    field: "expConcord",
    min: 50,
    name: "史密斯夫妇",
    flavor: ""
  },
  {
    id: "concord_4",
    cat: "默契",
    tier: 4,
    field: "expConcord",
    min: 75,
    name: "如有神助",
    flavor: ""
  },
  {
    id: "concord_5",
    cat: "默契",
    tier: 5,
    field: "expConcord",
    min: 100,
    name: "神雕侠侣",
    flavor: ""
  }
];

// vendor/aifarm/content/ranch-items.json
var ranch_items_default = {
  accessories: [
    {
      id: "cap",
      name: "棒球帽",
      desc: "",
      price: 30
    },
    {
      id: "scarf",
      name: "小围巾",
      desc: "",
      price: 30
    },
    {
      id: "straw_hat",
      name: "草帽",
      desc: "",
      price: 25
    },
    {
      id: "bow_knot",
      name: "蝴蝶结",
      desc: "",
      price: 20
    },
    {
      id: "rain_boots",
      name: "小雨靴",
      desc: "",
      price: 35
    },
    {
      id: "mini_cape",
      name: "小斗篷",
      desc: "",
      price: 40
    },
    {
      id: "bell_collar",
      name: "铃铛项圈",
      desc: "",
      price: 30
    },
    {
      id: "flower_crown",
      name: "小花冠",
      desc: "",
      price: 35
    },
    {
      id: "backpack",
      name: "小书包",
      desc: "",
      price: 45
    },
    {
      id: "ribbon_tail",
      name: "彩带尾饰",
      desc: "",
      price: 25
    },
    {
      id: "glasses",
      name: "圆框眼镜",
      desc: "",
      price: 30
    },
    {
      id: "sunglasses",
      name: "迷你墨镜",
      desc: "",
      price: 40
    },
    {
      id: "knitted_vest",
      name: "针织背心",
      desc: "",
      price: 50
    },
    {
      id: "sparkle_dust",
      name: "闪粉",
      desc: "",
      price: 20
    }
  ],
  decorations: [
    {
      id: "flowerbed",
      name: "花圃",
      price: 80,
      visitLine: ""
    },
    {
      id: "scarecrow",
      name: "稻草人",
      price: 60,
      visitLine: ""
    },
    {
      id: "wind_chime",
      name: "风铃",
      price: 70,
      visitLine: ""
    },
    {
      id: "fairy_lights",
      name: "星星灯串",
      price: 100,
      visitLine: ""
    },
    {
      id: "welcome_sign",
      name: "欢迎木牌",
      price: 50,
      visitLine: ""
    },
    {
      id: "pond",
      name: "小池塘",
      price: 120,
      visitLine: ""
    },
    {
      id: "pumpkin_cart",
      name: "南瓜推车",
      price: 90,
      visitLine: ""
    },
    {
      id: "hammock",
      name: "吊床",
      price: 110,
      visitLine: ""
    },
    {
      id: "birdhouse",
      name: "鸟屋",
      price: 80,
      visitLine: ""
    },
    {
      id: "mushroom_lamp",
      name: "蘑菇灯",
      price: 95,
      visitLine: ""
    },
    {
      id: "weather_vane",
      name: "风向标",
      price: 65,
      visitLine: ""
    },
    {
      id: "tea_table",
      name: "茶歇桌",
      price: 130,
      visitLine: ""
    },
    {
      id: "stone_path",
      name: "石板小径",
      price: 75,
      visitLine: ""
    },
    {
      id: "rainbow_pinwheel",
      name: "彩虹风车",
      price: 55,
      visitLine: ""
    }
  ]
};

// vendor/aifarm/content/expeditions.json
var expeditions_default = {
  maps: [
    {
      id: "mushroom_forest",
      name: "幻菇林",
      theme: "终年浮着甜腥孢子的雾林，光线昏绿，脚下是层层叠叠的菌毯。越往深处雾越浓、蘑菇越大越古怪，住着半植物半灵性的菌类生灵，也有迷路的旅人和小动物。误食某些菇会看见不存在的东西。",
      intro: "",
      unlock: null,
      events: [
        "spore_fountain",
        "talking_cap",
        "wrong_mushroom",
        "mycelium_hammock",
        "snail_courier",
        "weeping_spore_nest",
        "mushroom_wall",
        "scale_feather_chick",
        "mushroom_lantern_maker",
        "mask_mushrooms",
        "giant_in_the_mist",
        "spore_rain",
        "letter_in_mycelium",
        "wardens_footprints"
      ],
      finale: "giant_in_the_mist"
    },
    {
      id: "rusty_clocktown",
      name: "锈钟古镇",
      theme: "一座被时间遗忘的山间小镇，所有钟表都停在下午三点十七分。青铜路牌爬满铜绿，喷泉里流出温热的锈色泉水，居民是一群和善却健忘的老人——他们总说自己“好像丢了什么”，但不记得丢了什么。　神秘 + 童话 + 一缕温柔的哀愁。像午睡醒来发现黄昏已至，说不上难过，只是恍惚。",
      intro: "",
      unlock: null,
      events: [
        "stopped_clocktower",
        "fountain_copper",
        "bakery_memory",
        "talking_statue",
        "gear_shop",
        "three_seventeen",
        "windup_bird",
        "night_watchman",
        "rusted_parliament",
        "crow_mail",
        "halted_carriage",
        "rust_dragon",
        "returning_time",
        "rust_spring",
        "copper_echo"
      ],
      finale: "rust_dragon"
    },
    {
      id: "stardust_theater",
      name: "星沙剧场",
      theme: '一座废弃多年的老天文台，不知被谁改成了露天剧场。穹顶裂开一道缝，白天漏光、晚上漏星，舞台上的沙子会随着"演出"自己流动、塑形。这里的"居民"是一群戴着面具的旧戏偶，它们不演戏时就歪在座位上打盹，醒了就非拉着路过的人上台。　神秘 + 温柔 + 旧物感伤，像一场没人看但依然认真演完的午夜戏。不恐怖，但有点薄薄的怅惘。',
      intro: "",
      unlock: null,
      events: [
        "dusty_ticket",
        "rehearsing_puppet",
        "grumpy_prompter",
        "starlight_crack",
        "talking_script",
        "old_dressing_case",
        "star_sand_curtain",
        "mask_wall",
        "curtain_tangle",
        "lost_prompter",
        "observatory_tea",
        "mirror_behind_curtain",
        "moon_phase_giant",
        "after_the_show",
        "sand_program"
      ],
      finale: "moon_phase_giant"
    },
    {
      id: "tidal_corridor",
      name: "潮汐回廊",
      theme: "一片被遗忘的海蚀洞穴群，潮水每日涨落两次，退潮时露出一条条湿漉漉的石廊，廊壁上嵌满不知谁留下的瓷片、铜铃和玻璃浮球，叮叮当当响个不停。洞里有会说话的海葵、贩卖旧物的寄居蟹商贩，和一间只在退潮时开张的茶馆。　神秘+温柔+一点咸湿的怀旧感，不恐怖，像一场潮乎乎的梦。",
      intro: "",
      unlock: null,
      events: [
        "humming_shell",
        "porcelain_chime",
        "silver_scales",
        "salt_crystal",
        "low_tide_teahouse",
        "hermit_shop",
        "lying_anemone",
        "shell_guardian",
        "tide_chart",
        "weeping_float",
        "reversed_corridor",
        "saltbone_whale",
        "echo_of_tide",
        "parting_tea"
      ],
      finale: "echo_of_tide"
    },
    {
      id: "whale_market",
      name: "云鲸背上的集市",
      theme: "一头看不见的巨大云鲸在日落时分会浮上云海，它宽阔的脊背上坐落着一座流动的市集——帐篷是用晚霞缝的，灯笼是悬空飘浮的，摊主多是些不愿落地的人或半人半云的家伙。空气里混着烤糖饼、旧书和雨后云絮的气味，规矩只有一条：别问任何东西“是真的还是假的”。　热闹市井 + 温柔童话 + 一点淡蓝色的感伤",
      intro: "",
      unlock: null,
      events: [
        "cloud_stall_rule",
        "chasing_cloud_kid",
        "melancholy_candy",
        "fallen_cargo",
        "wind_chase_stall",
        "memory_barter",
        "cloud_post",
        "stranger_flower",
        "translucent_traveler",
        "nameless_vendor",
        "meteor_hawker",
        "whale_tail_breeze",
        "old_sword_guardian",
        "whose_luggage",
        "not_for_sale",
        "whale_nap"
      ],
      finale: "old_sword_guardian"
    }
  ],
  events: [
    {
      id: "spore_fountain",
      map: "mushroom_forest",
      title: "菌毯喷泉",
      type: "drop",
      layer: "shallow",
      weight: 5,
      story: "",
      drops: [
        {
          t: "coins",
          n: 35
        }
      ],
      hint: "地上的蘑菇地毯似乎在悄悄挪动。"
    },
    {
      id: "talking_cap",
      map: "mushroom_forest",
      title: "会说话的伞",
      type: "story",
      layer: "shallow",
      weight: 3,
      story: "",
      hint: "有人在跟蘑菇聊天，走近了才发现是蘑菇在跟人聊天。"
    },
    {
      id: "wrong_mushroom",
      map: "mushroom_forest",
      title: "误食幻菇",
      type: "encounter",
      layer: "shallow",
      weight: 3,
      story: "",
      options: [
        {
          key: "A",
          label: "回味这场幻觉，在树根下多坐一会儿",
          outcomes: [
            {
              t: "status",
              n: 1
            }
          ]
        },
        {
          key: "B",
          label: "趁幻觉还没彻底消散，看看周围有没有藏东西",
          outcomes: [
            {
              t: "potion",
              n: 1
            }
          ]
        }
      ],
      hint: "一朵莹蓝色的小菇，闻着像刚烤好的饼干。"
    },
    {
      id: "mycelium_hammock",
      map: "mushroom_forest",
      title: "菌丝吊床",
      type: "story",
      layer: "shallow",
      weight: 5,
      story: "",
      hint: "两棵树之间张着一张乳白色的网，不像蜘蛛织的。"
    },
    {
      id: "snail_courier",
      map: "mushroom_forest",
      title: "蜗牛快递员",
      type: "encounter",
      layer: "shallow",
      weight: 2,
      story: "",
      options: [
        {
          key: "A",
          label: "接过包裹，帮它送",
          outcomes: [
            {
              t: "decor",
              id: "exp_star_candy"
            }
          ]
        },
        {
          key: "B",
          label: "抱歉，我更想沿着自己的路走",
          outcomes: [
            {
              t: "none"
            }
          ]
        }
      ],
      hint: "菌杆上有什么东西在发光，走得很慢。"
    },
    {
      id: "weeping_spore_nest",
      map: "mushroom_forest",
      title: "哭泣的孢窝",
      type: "drop",
      layer: "deep",
      weight: 3,
      story: "",
      drops: [
        {
          t: "silver",
          n: 45
        }
      ],
      hint: "倒木下面有东西在哭，哭完掉了一地珠子。"
    },
    {
      id: "mushroom_wall",
      map: "mushroom_forest",
      title: "挡路的菌墙",
      type: "choice",
      layer: "deep",
      weight: 3,
      story: "",
      options: [
        {
          key: "A",
          label: "轻轻叩那颗紫色菌核",
          outcomes: [
            {
              t: "buff",
              mod: 1,
              text: ""
            }
          ]
        },
        {
          key: "B",
          label: "沿着菌墙根走右侧，循着炖汤香气去",
          outcomes: [
            {
              t: "status",
              n: 1,
              text: ""
            }
          ]
        }
      ],
      hint: "蘑菇长成了一堵墙，墙心在跳。"
    },
    {
      id: "scale_feather_chick",
      map: "mushroom_forest",
      title: "鳞羽鸡",
      type: "drop",
      layer: "deep",
      weight: 3,
      story: "",
      drops: [
        {
          t: "potion",
          n: 1
        }
      ],
      hint: "一只不像鸡的小东西在林子里横冲直撞。"
    },
    {
      id: "mushroom_lantern_maker",
      map: "mushroom_forest",
      title: "菌灯匠",
      type: "encounter",
      layer: "deep",
      weight: 2,
      story: "",
      options: [
        {
          key: "A",
          label: "接过菌灯，答应下来",
          outcomes: [
            {
              t: "decor",
              id: "exp_mushroom_lantern"
            }
          ]
        },
        {
          key: "B",
          label: "抱歉，我没空帮人跑腿",
          outcomes: [
            {
              t: "none"
            }
          ]
        }
      ],
      hint: "溪边有人把星星往蘑菇里装。"
    },
    {
      id: "mask_mushrooms",
      map: "mushroom_forest",
      title: "假面菇丛",
      type: "choice",
      layer: "deep",
      weight: 3,
      story: "",
      options: [
        {
          key: "A",
          label: "蹲下来，模仿它的表情和它对视",
          outcomes: [
            {
              t: "coins",
              n: 70,
              text: ""
            }
          ]
        },
        {
          key: "B",
          label: "吓了一跳，后退三步",
          outcomes: [
            {
              t: "status",
              n: -1,
              text: ""
            }
          ]
        }
      ],
      hint: "前面一片白茫茫的蘑菇，脸上都有表情。"
    },
    {
      id: "giant_in_the_mist",
      map: "mushroom_forest",
      title: "雾中巨影",
      type: "combat",
      layer: "finale",
      weight: 2,
      story: "",
      foe: "古菌之主",
      difficulty: "hard",
      record: "古菌之主",
      win: {
        text: "",
        drops: [
          {
            t: "decor",
            id: "exp_golden_spore"
          },
          {
            t: "coins",
            n: 200
          }
        ],
        critDrops: [
          {
            t: "potion",
            n: 2
          }
        ]
      },
      lose: {
        text: ""
      },
      hint: "最深处的雾不是雾，是某种巨大的东西在呼吸。"
    },
    {
      id: "spore_rain",
      map: "mushroom_forest",
      title: "孢子雨",
      type: "story",
      layer: "deep",
      weight: 5,
      story: "",
      hint: "天突然阴了——不对，是蘑菇们在头顶撑开了伞。"
    },
    {
      id: "letter_in_mycelium",
      map: "mushroom_forest",
      title: "菌丝写的信",
      type: "drop",
      layer: "shallow",
      weight: 3,
      story: "",
      drops: [
        {
          t: "coins",
          n: 40
        }
      ],
      hint: "地上趴着一片奇怪的菌丝，纹路看起来像字。"
    },
    {
      id: "wardens_footprints",
      map: "mushroom_forest",
      title: "守林人的脚印",
      type: "encounter",
      layer: "deep",
      weight: 2,
      story: "",
      options: [
        {
          key: "A",
          label: "转三圈松果",
          outcomes: [
            {
              t: "decor",
              id: "exp_flowering_chair",
              text: ""
            }
          ]
        },
        {
          key: "B",
          label: "不打搅主人，悄悄离开",
          outcomes: [
            {
              t: "buff",
              mod: 1,
              text: ""
            }
          ]
        }
      ],
      hint: "树干上嵌着一扇不该在那里的门。"
    },
    {
      id: "stopped_clocktower",
      map: "rusty_clocktown",
      title: "停转的钟楼",
      type: "story",
      layer: "shallow",
      weight: 5,
      story: ""
    },
    {
      id: "fountain_copper",
      map: "rusty_clocktown",
      title: "喷泉里的铜币",
      type: "drop",
      layer: "shallow",
      weight: 5,
      story: "",
      drops: [
        {
          t: "silver",
          n: 45
        }
      ]
    },
    {
      id: "bakery_memory",
      map: "rusty_clocktown",
      title: "面包房的记忆",
      type: "story",
      layer: "shallow",
      weight: 5,
      story: ""
    },
    {
      id: "talking_statue",
      map: "rusty_clocktown",
      title: "会说话的铜像",
      type: "encounter",
      layer: "shallow",
      weight: 3,
      story: "",
      options: [
        {
          key: "A",
          label: "“我帮你找答案”",
          outcomes: [
            {
              t: "status",
              n: 1
            },
            {
              t: "none",
              text: ""
            }
          ]
        },
        {
          key: "B",
          label: "朝它笑一笑，把表盘给它看",
          outcomes: [
            {
              t: "status",
              n: 1
            },
            {
              t: "buff",
              mod: 1,
              text: ""
            }
          ]
        },
        {
          key: "C",
          label: "摇摇头，悄悄走开",
          outcomes: [
            {
              t: "none"
            }
          ]
        }
      ]
    },
    {
      id: "gear_shop",
      map: "rusty_clocktown",
      title: "齿轮匠的铺子",
      type: "encounter",
      layer: "deep",
      weight: 3,
      story: "",
      options: [
        {
          key: "A",
          label: "讲一件冒险里遇到的好事",
          outcomes: [
            {
              t: "buff",
              mod: 1,
              text: ""
            }
          ]
        },
        {
          key: "B",
          label: "讲一个让你有点后怕的瞬间",
          outcomes: [
            {
              t: "potion",
              n: 1
            },
            {
              t: "status",
              n: -1
            }
          ]
        },
        {
          key: "C",
          label: "你也没什么故事好讲，帮他擦了一排齿轮",
          outcomes: [
            {
              t: "coins",
              n: 55
            }
          ]
        }
      ]
    },
    {
      id: "three_seventeen",
      map: "rusty_clocktown",
      title: "下午三点十七分",
      type: "choice",
      layer: "deep",
      weight: 3,
      story: "",
      options: [
        {
          key: "A",
          label: "把自己的怀表放在她手心",
          outcomes: [
            {
              t: "decor",
              id: "exp_rusty_clocktown_1"
            },
            {
              t: "buff",
              mod: 1,
              text: ""
            }
          ]
        },
        {
          key: "B",
          label: "给她倒一杯新茶",
          outcomes: [
            {
              t: "status",
              n: 1
            },
            {
              t: "silver",
              n: 45
            }
          ]
        },
        {
          key: "C",
          label: "轻声说“抱歉，我也没时间”",
          outcomes: [
            {
              t: "status",
              n: -1
            },
            {
              t: "potion",
              n: 1
            }
          ]
        }
      ]
    },
    {
      id: "windup_bird",
      map: "rusty_clocktown",
      title: "发条鸟",
      type: "drop",
      layer: "deep",
      weight: 3,
      story: "",
      drops: [
        {
          t: "potion",
          n: 1
        }
      ]
    },
    {
      id: "night_watchman",
      map: "rusty_clocktown",
      title: "失眠的守夜人",
      type: "encounter",
      layer: "deep",
      weight: 2,
      story: "",
      drops: [
        {
          t: "decor",
          id: "exp_rusty_clocktown_2"
        }
      ]
    },
    {
      id: "rusted_parliament",
      map: "rusty_clocktown",
      title: "锈钟议会",
      type: "story",
      layer: "deep",
      weight: 2,
      story: ""
    },
    {
      id: "crow_mail",
      map: "rusty_clocktown",
      title: "乌鸦邮差的包裹",
      type: "drop",
      layer: "shallow",
      weight: 3,
      story: "",
      drops: [
        {
          t: "coins",
          n: 35
        }
      ]
    },
    {
      id: "halted_carriage",
      map: "rusty_clocktown",
      title: "停了三十年的马车",
      type: "story",
      layer: "deep",
      weight: 3,
      story: ""
    },
    {
      id: "rust_dragon",
      map: "rusty_clocktown",
      title: "偷时间的锈龙",
      type: "combat",
      layer: "finale",
      weight: 2,
      story: "",
      foe: "锈龙 · 柯罗诺",
      difficulty: "hard",
      record: "锈龙 · 柯罗诺",
      win: {
        text: "",
        drops: [
          {
            t: "decor",
            id: "exp_rusty_clocktown_3"
          }
        ],
        critDrops: [
          {
            t: "potion",
            n: 2
          }
        ]
      },
      lose: {
        text: ""
      }
    },
    {
      id: "returning_time",
      map: "rusty_clocktown",
      title: "还回去的时间",
      type: "choice",
      layer: "finale",
      weight: 2,
      story: "",
      options: [
        {
          key: "A",
          label: "花功夫把时间分还给镇民",
          outcomes: [
            {
              t: "status",
              n: -1
            },
            {
              t: "decor",
              id: "exp_rusty_clocktown_4"
            },
            {
              t: "buff",
              mod: 1,
              text: ""
            }
          ]
        },
        {
          key: "B",
          label: "只带一小部分回去，剩下的留给钟楼自己修复",
          outcomes: [
            {
              t: "coins",
              n: 200
            },
            {
              t: "status",
              n: 1
            }
          ]
        },
        {
          key: "C",
          label: "你太累了，让风把它们吹散吧",
          outcomes: [
            {
              t: "buff",
              mod: 1,
              text: ""
            }
          ]
        }
      ]
    },
    {
      id: "rust_spring",
      map: "rusty_clocktown",
      title: "锈色温泉",
      type: "encounter",
      layer: "deep",
      weight: 3,
      story: "",
      options: [
        {
          key: "A",
          label: "脱了鞋泡一泡，眯一会儿",
          outcomes: [
            {
              t: "status",
              n: 1
            },
            {
              t: "status",
              n: 1
            }
          ]
        },
        {
          key: "B",
          label: "喝一口泉水",
          outcomes: [
            {
              t: "status",
              n: 1
            },
            {
              t: "potion",
              n: 1
            }
          ]
        },
        {
          key: "C",
          label: "洗干净脸上的灰，道声谢继续走",
          outcomes: [
            {
              t: "buff",
              mod: 1,
              text: ""
            }
          ]
        }
      ]
    },
    {
      id: "copper_echo",
      map: "rusty_clocktown",
      title: "铜巷回声",
      type: "story",
      layer: "shallow",
      weight: 5,
      story: ""
    },
    {
      id: "dusty_ticket",
      map: "stardust_theater",
      title: "落满灰的票根",
      type: "drop",
      layer: "shallow",
      weight: 5,
      story: "",
      drops: [
        {
          t: "silver",
          n: 45
        }
      ]
    },
    {
      id: "rehearsing_puppet",
      map: "stardust_theater",
      title: "总在彩排的戏偶",
      type: "story",
      layer: "shallow",
      weight: 5,
      story: ""
    },
    {
      id: "grumpy_prompter",
      map: "stardust_theater",
      title: "被吵醒的提词偶",
      type: "combat",
      layer: "shallow",
      weight: 3,
      story: "",
      foe: "提词偶",
      difficulty: "easy",
      record: "提词偶",
      win: {
        text: "",
        drops: [
          {
            t: "potion",
            n: 1
          }
        ],
        critDrops: [
          {
            t: "potion",
            n: 2
          }
        ]
      },
      lose: {
        text: ""
      }
    },
    {
      id: "starlight_crack",
      map: "stardust_theater",
      title: "穹顶漏下的光",
      type: "drop",
      layer: "shallow",
      weight: 5,
      story: "",
      drops: [
        {
          t: "potion",
          n: 1
        }
      ]
    },
    {
      id: "talking_script",
      map: "stardust_theater",
      title: "会改台词的剧本",
      type: "encounter",
      layer: "shallow",
      weight: 3,
      story: "",
      options: [
        {
          key: "A",
          label: "对着剧本说一句台词试试",
          outcomes: [
            {
              t: "none"
            }
          ]
        },
        {
          key: "B",
          label: "合上它，赶紧走",
          outcomes: [
            {
              t: "status",
              n: -1
            }
          ]
        }
      ]
    },
    {
      id: "old_dressing_case",
      map: "stardust_theater",
      title: "后台的旧妆奁",
      type: "drop",
      layer: "shallow",
      weight: 3,
      story: "",
      drops: [
        {
          t: "coins",
          n: 35
        }
      ]
    },
    {
      id: "star_sand_curtain",
      map: "stardust_theater",
      title: "不肯谢幕的星沙",
      type: "choice",
      layer: "deep",
      weight: 3,
      story: "",
      options: [
        {
          key: "A",
          label: "上台，跟它演完这一段",
          outcomes: [
            {
              t: "decor",
              id: "exp_stardust_theater_1"
            },
            {
              t: "buff",
              mod: 1,
              text: ""
            }
          ]
        },
        {
          key: "B",
          label: "在台下看着就好",
          outcomes: [
            {
              t: "none"
            }
          ]
        }
      ]
    },
    {
      id: "mask_wall",
      map: "stardust_theater",
      title: "面具墙",
      type: "encounter",
      layer: "deep",
      weight: 3,
      story: "",
      options: [
        {
          key: "A",
          label: "挑一张戴上试试",
          outcomes: [
            {
              t: "status",
              n: 1
            }
          ]
        },
        {
          key: "B",
          label: "挑一张喜欢的带走",
          outcomes: [
            {
              t: "decor",
              id: "exp_stardust_theater_2"
            }
          ]
        }
      ]
    },
    {
      id: "curtain_tangle",
      map: "stardust_theater",
      title: "大幕上的旧绳结",
      type: "combat",
      layer: "deep",
      weight: 3,
      story: "",
      foe: "活绳结",
      difficulty: "mid",
      record: "活绳结",
      win: {
        text: "",
        drops: [
          {
            t: "decor",
            id: "exp_stardust_theater_3"
          }
        ],
        critDrops: [
          {
            t: "potion",
            n: 2
          }
        ]
      },
      lose: {
        text: ""
      }
    },
    {
      id: "lost_prompter",
      map: "stardust_theater",
      title: "总在迷路的提词员",
      type: "story",
      layer: "deep",
      weight: 3,
      story: ""
    },
    {
      id: "observatory_tea",
      map: "stardust_theater",
      title: "观星台的茶会",
      type: "drop",
      layer: "deep",
      weight: 3,
      story: "",
      drops: [
        {
          t: "decor",
          id: "exp_stardust_theater_4"
        }
      ]
    },
    {
      id: "mirror_behind_curtain",
      map: "stardust_theater",
      title: "幕布后的镜子",
      type: "encounter",
      layer: "deep",
      weight: 2,
      story: "",
      options: [
        {
          key: "A",
          label: "对着镜子鞠躬谢幕",
          outcomes: [
            {
              t: "status",
              n: 1
            },
            {
              t: "coins",
              n: 55
            }
          ]
        },
        {
          key: "B",
          label: "不敢多看，转身离开",
          outcomes: [
            {
              t: "jump",
              to: "star_sand_curtain"
            }
          ]
        }
      ]
    },
    {
      id: "moon_phase_giant",
      map: "stardust_theater",
      title: "压轴：月相巨偶",
      type: "combat",
      layer: "finale",
      weight: 2,
      story: "",
      foe: "月相巨偶",
      difficulty: "hard",
      record: "月相巨偶",
      win: {
        text: "",
        drops: [
          {
            t: "decor",
            id: "exp_stardust_theater_5"
          }
        ],
        critDrops: [
          {
            t: "potion",
            n: 2
          }
        ]
      },
      lose: {
        text: ""
      }
    },
    {
      id: "after_the_show",
      map: "stardust_theater",
      title: "散场后的座位",
      type: "story",
      layer: "shallow",
      weight: 3,
      story: ""
    },
    {
      id: "sand_program",
      map: "stardust_theater",
      title: "沙上的节目单",
      type: "story",
      layer: "shallow",
      weight: 5,
      story: ""
    },
    {
      id: "humming_shell",
      map: "tidal_corridor",
      title: "会哼歌的螺",
      type: "story",
      layer: "shallow",
      weight: 5,
      story: ""
    },
    {
      id: "porcelain_chime",
      map: "tidal_corridor",
      title: "瓷片风铃廊",
      type: "story",
      layer: "shallow",
      weight: 5,
      story: ""
    },
    {
      id: "silver_scales",
      map: "tidal_corridor",
      title: "一袖银鳞",
      type: "drop",
      layer: "shallow",
      weight: 5,
      story: "",
      drops: [
        {
          t: "silver",
          n: 45
        }
      ]
    },
    {
      id: "salt_crystal",
      map: "tidal_corridor",
      title: "盐晶瓶",
      type: "drop",
      layer: "shallow",
      weight: 3,
      story: "",
      drops: [
        {
          t: "silver",
          n: 45
        }
      ]
    },
    {
      id: "low_tide_teahouse",
      map: "tidal_corridor",
      title: "退潮茶馆",
      type: "encounter",
      layer: "deep",
      weight: 3,
      story: "",
      options: [
        {
          key: "A",
          label: "坐下来喝一杯茶",
          outcomes: [
            {
              t: "status",
              n: 1
            },
            {
              t: "none",
              text: ""
            }
          ]
        },
        {
          key: "B",
          label: "问问有什么能带走的",
          outcomes: [
            {
              t: "decor",
              id: "exp_tidal_corridor_1"
            },
            {
              t: "none",
              text: ""
            }
          ]
        }
      ]
    },
    {
      id: "hermit_shop",
      map: "tidal_corridor",
      title: "寄居蟹的旧货铺",
      type: "encounter",
      layer: "deep",
      weight: 3,
      story: "",
      options: [
        {
          key: "A",
          label: "认认真真把旧货盘挑了个遍",
          outcomes: [
            {
              t: "decor",
              id: "exp_tidal_corridor_2"
            },
            {
              t: "none",
              text: ""
            }
          ]
        },
        {
          key: "B",
          label: "告诉它你没有旧物可换",
          outcomes: [
            {
              t: "none",
              text: ""
            }
          ]
        }
      ]
    },
    {
      id: "lying_anemone",
      map: "tidal_corridor",
      title: "说谎的海葵",
      type: "choice",
      layer: "shallow",
      weight: 3,
      story: "",
      options: [
        {
          key: "A",
          label: "信它的话，往左走",
          outcomes: [
            {
              t: "combat",
              foe: "贝壳守卫",
              difficulty: "mid"
            }
          ]
        },
        {
          key: "B",
          label: "看小海葵们的反应，决定往右走",
          outcomes: [
            {
              t: "silver",
              n: 45
            },
            {
              t: "none",
              text: ""
            }
          ]
        }
      ]
    },
    {
      id: "shell_guardian",
      map: "tidal_corridor",
      title: "贝壳守卫",
      type: "combat",
      layer: "deep",
      weight: 2,
      story: "",
      foe: "贝壳守卫",
      difficulty: "easy",
      record: "贝壳守卫",
      win: {
        text: "",
        drops: [
          {
            t: "coins",
            n: 70
          }
        ],
        critDrops: [
          {
            t: "potion",
            n: 2
          }
        ]
      },
      lose: {
        text: ""
      }
    },
    {
      id: "tide_chart",
      map: "tidal_corridor",
      title: "半张潮汐图",
      type: "drop",
      layer: "deep",
      weight: 3,
      story: "",
      drops: [
        {
          t: "potion",
          n: 1
        }
      ]
    },
    {
      id: "weeping_float",
      map: "tidal_corridor",
      title: "会哭的浮球",
      type: "choice",
      layer: "deep",
      weight: 3,
      story: "",
      options: [
        {
          key: "A",
          label: "把浮球从石缝里解救出来",
          outcomes: [
            {
              t: "status",
              n: 1
            },
            {
              t: "none",
              text: ""
            }
          ]
        },
        {
          key: "B",
          label: "轻轻走过，别打扰它",
          outcomes: [
            {
              t: "none",
              text: ""
            }
          ]
        }
      ]
    },
    {
      id: "reversed_corridor",
      map: "tidal_corridor",
      title: "倒流的第三廊",
      type: "encounter",
      layer: "deep",
      weight: 2,
      story: "",
      options: [
        {
          key: "A",
          label: "伸手去够那只铜铃",
          outcomes: [
            {
              t: "decor",
              id: "exp_tidal_corridor_3"
            },
            {
              t: "none",
              text: ""
            }
          ]
        },
        {
          key: "B",
          label: "蹲下观察，不急着碰",
          outcomes: [
            {
              t: "potion",
              n: 1
            },
            {
              t: "none",
              text: ""
            }
          ]
        }
      ]
    },
    {
      id: "saltbone_whale",
      map: "tidal_corridor",
      title: "盐骨鲸骸",
      type: "story",
      layer: "finale",
      weight: 2,
      story: ""
    },
    {
      id: "echo_of_tide",
      map: "tidal_corridor",
      title: "潮声回响",
      type: "combat",
      layer: "finale",
      weight: 2,
      story: "",
      foe: "潮声回响",
      difficulty: "hard",
      record: "潮声回响",
      win: {
        text: "",
        drops: [
          {
            t: "decor",
            id: "exp_tidal_corridor_4"
          }
        ],
        critDrops: [
          {
            t: "potion",
            n: 2
          }
        ]
      },
      lose: {
        text: ""
      }
    },
    {
      id: "parting_tea",
      map: "tidal_corridor",
      title: "茶馆的饯别",
      type: "choice",
      layer: "finale",
      weight: 3,
      story: "",
      options: [
        {
          key: "A",
          label: "“来杯最浓的，提提神”",
          outcomes: [
            {
              t: "status",
              n: 1
            },
            {
              t: "buff",
              mod: 1,
              text: ""
            }
          ]
        },
        {
          key: "B",
          label: "“给我一杯能记住这个地方的味道”",
          outcomes: [
            {
              t: "decor",
              id: "exp_tidal_corridor_5"
            },
            {
              t: "none",
              text: ""
            }
          ]
        }
      ]
    },
    {
      id: "cloud_stall_rule",
      map: "whale_market",
      title: "摊位的规矩",
      type: "story",
      layer: "shallow",
      weight: 5,
      story: ""
    },
    {
      id: "chasing_cloud_kid",
      map: "whale_market",
      title: "追布匹的云童",
      type: "drop",
      layer: "shallow",
      weight: 5,
      story: "",
      drops: [
        {
          t: "silver",
          n: 45
        }
      ]
    },
    {
      id: "melancholy_candy",
      map: "whale_market",
      title: "不吃糖的糖贩",
      type: "story",
      layer: "shallow",
      weight: 3,
      story: ""
    },
    {
      id: "fallen_cargo",
      map: "whale_market",
      title: "半路掉落的货",
      type: "drop",
      layer: "shallow",
      weight: 5,
      story: "",
      drops: [
        {
          t: "potion",
          n: 1
        }
      ]
    },
    {
      id: "wind_chase_stall",
      map: "whale_market",
      title: "追风摊",
      type: "choice",
      layer: "shallow",
      weight: 3,
      story: "",
      options: [
        {
          key: "A",
          label: "冲过去帮他扑住棚布",
          outcomes: [
            {
              t: "silver",
              n: 45
            },
            {
              t: "buff",
              mod: 1,
              text: ""
            }
          ]
        },
        {
          key: "B",
          label: "站在原地替他喊加油",
          outcomes: [
            {
              t: "none"
            }
          ]
        }
      ]
    },
    {
      id: "memory_barter",
      map: "whale_market",
      title: "旧物交换铺",
      type: "encounter",
      layer: "deep",
      weight: 3,
      story: "",
      options: [
        {
          key: "A",
          label: "在心里讲一个快乐的旧故事",
          outcomes: [
            {
              t: "decor",
              id: "exp_whale_market_1"
            }
          ]
        },
        {
          key: "B",
          label: "在心里讲一个遗憾的旧故事",
          outcomes: [
            {
              t: "decor",
              id: "exp_whale_market_2"
            }
          ]
        },
        {
          key: "C",
          label: "摇头，这故事还不想换",
          outcomes: [
            {
              t: "none"
            }
          ]
        }
      ]
    },
    {
      id: "cloud_post",
      map: "whale_market",
      title: "云上邮局",
      type: "encounter",
      layer: "deep",
      weight: 2,
      story: "",
      options: [
        {
          key: "A",
          label: "写一封信，贴好云票投进信箱",
          outcomes: [
            {
              t: "buff",
              mod: 1,
              text: ""
            }
          ]
        },
        {
          key: "B",
          label: "挠挠云猫的下巴就走",
          outcomes: [
            {
              t: "coins",
              n: 55
            }
          ]
        }
      ]
    },
    {
      id: "stranger_flower",
      map: "whale_market",
      title: "不认识的花",
      type: "choice",
      layer: "deep",
      weight: 3,
      story: "",
      options: [
        {
          key: "A",
          label: "摘一朵，许愿",
          outcomes: [
            {
              t: "decor",
              id: "exp_whale_market_3"
            },
            {
              t: "buff",
              mod: 1,
              text: ""
            }
          ]
        },
        {
          key: "B",
          label: "蹲下来看看就好",
          outcomes: [
            {
              t: "status",
              n: 1
            }
          ]
        }
      ]
    },
    {
      id: "translucent_traveler",
      map: "whale_market",
      title: "半透明的旅人",
      type: "story",
      layer: "deep",
      weight: 3,
      story: ""
    },
    {
      id: "nameless_vendor",
      map: "whale_market",
      title: "忘了名字的摊主",
      type: "drop",
      layer: "deep",
      weight: 5,
      story: "",
      drops: [
        {
          t: "coins",
          n: 55
        }
      ]
    },
    {
      id: "meteor_hawker",
      map: "whale_market",
      title: "抓流星的小贩",
      type: "encounter",
      layer: "deep",
      weight: 2,
      story: "",
      options: [
        {
          key: "A",
          label: "用一段开心的回忆跟它换这颗逃出来的流星",
          outcomes: [
            {
              t: "decor",
              id: "exp_whale_market_4"
            },
            {
              t: "buff",
              mod: 1,
              text: ""
            }
          ]
        },
        {
          key: "B",
          label: "趁他不注意把笼子全打开",
          outcomes: [
            {
              t: "status",
              n: 1
            },
            {
              t: "buff",
              mod: 1,
              text: ""
            }
          ]
        },
        {
          key: "C",
          label: "只是驻足看看这奇景",
          outcomes: [
            {
              t: "none"
            }
          ]
        }
      ]
    },
    {
      id: "whale_tail_breeze",
      map: "whale_market",
      title: "鲸尾的风",
      type: "story",
      layer: "finale",
      weight: 3,
      story: ""
    },
    {
      id: "old_sword_guardian",
      map: "whale_market",
      title: "守集的老剑",
      type: "combat",
      layer: "finale",
      weight: 2,
      story: "",
      foe: "守集剑灵",
      difficulty: "hard",
      record: "守集剑灵",
      win: {
        text: "",
        drops: [
          {
            t: "decor",
            id: "exp_whale_market_5"
          }
        ],
        critDrops: [
          {
            t: "potion",
            n: 2
          }
        ]
      },
      lose: {
        text: ""
      }
    },
    {
      id: "whose_luggage",
      map: "whale_market",
      title: "谁的行李",
      type: "drop",
      layer: "shallow",
      weight: 5,
      story: "",
      drops: [
        {
          t: "potion",
          n: 1
        }
      ]
    },
    {
      id: "not_for_sale",
      map: "whale_market",
      title: "不卖的东西",
      type: "encounter",
      layer: "deep",
      weight: 3,
      story: "",
      options: [
        {
          key: "A",
          label: "把一件压在心底的烦恼放进去",
          outcomes: [
            {
              t: "status",
              n: 1
            },
            {
              t: "decor",
              id: "exp_whale_market_6"
            }
          ]
        },
        {
          key: "B",
          label: "觉得不太对劲，摇摇头走开",
          outcomes: [
            {
              t: "status",
              n: -1
            }
          ]
        }
      ]
    },
    {
      id: "whale_nap",
      map: "whale_market",
      title: "云鲸打了个盹",
      type: "story",
      layer: "deep",
      weight: 3,
      story: ""
    }
  ],
  decorations: [
    {
      id: "exp_star_candy",
      name: "星球糖",
      from: "mushroom_forest",
      visitLine: ""
    },
    {
      id: "exp_mushroom_lantern",
      name: "菌灯",
      from: "mushroom_forest",
      visitLine: ""
    },
    {
      id: "exp_flowering_chair",
      name: "会开花的藤椅",
      from: "mushroom_forest",
      visitLine: ""
    },
    {
      id: "exp_golden_spore",
      name: "金孢茸",
      from: "mushroom_forest",
      visitLine: ""
    },
    {
      id: "exp_rusty_clocktown_1",
      name: "铜茶匙风铃",
      from: "rusty_clocktown",
      visitLine: ""
    },
    {
      id: "exp_rusty_clocktown_2",
      name: "齿轮小风车",
      from: "rusty_clocktown",
      visitLine: ""
    },
    {
      id: "exp_rusty_clocktown_3",
      name: "钟楼怀表",
      from: "rusty_clocktown",
      visitLine: ""
    },
    {
      id: "exp_rusty_clocktown_4",
      name: "时间沙漏",
      from: "rusty_clocktown",
      visitLine: ""
    },
    {
      id: "exp_stardust_theater_1",
      name: "星沙人形瓶",
      from: "stardust_theater",
      visitLine: ""
    },
    {
      id: "exp_stardust_theater_2",
      name: "月亮面具",
      from: "stardust_theater",
      visitLine: ""
    },
    {
      id: "exp_stardust_theater_3",
      name: "铜哨摆件",
      from: "stardust_theater",
      visitLine: ""
    },
    {
      id: "exp_stardust_theater_4",
      name: "铜星摆件",
      from: "stardust_theater",
      visitLine: ""
    },
    {
      id: "exp_stardust_theater_5",
      name: "星图纸灯",
      from: "stardust_theater",
      visitLine: ""
    },
    {
      id: "exp_tidal_corridor_1",
      name: "蟹壳茶盏",
      from: "tidal_corridor",
      visitLine: ""
    },
    {
      id: "exp_tidal_corridor_2",
      name: "潮蚀银链",
      from: "tidal_corridor",
      visitLine: ""
    },
    {
      id: "exp_tidal_corridor_3",
      name: "逆潮铜铃",
      from: "tidal_corridor",
      visitLine: ""
    },
    {
      id: "exp_tidal_corridor_4",
      name: "潮音螺号",
      from: "tidal_corridor",
      visitLine: ""
    },
    {
      id: "exp_tidal_corridor_5",
      name: "盐渍记忆茶砖",
      from: "tidal_corridor",
      visitLine: ""
    },
    {
      id: "exp_whale_market_1",
      name: "忆光风铃",
      from: "whale_market",
      visitLine: ""
    },
    {
      id: "exp_whale_market_2",
      name: "雾泪捕梦网",
      from: "whale_market",
      visitLine: ""
    },
    {
      id: "exp_whale_market_3",
      name: "问星花盏",
      from: "whale_market",
      visitLine: ""
    },
    {
      id: "exp_whale_market_4",
      name: "笼中星",
      from: "whale_market",
      visitLine: ""
    },
    {
      id: "exp_whale_market_5",
      name: "笑剑风铃",
      from: "whale_market",
      visitLine: ""
    },
    {
      id: "exp_whale_market_6",
      name: "空盒的盖子",
      from: "whale_market",
      visitLine: ""
    }
  ]
};

// vendor/aifarm/dist/ugc.js
var ugcById = /* @__PURE__ */ new Map();

// vendor/aifarm/dist/content.js
var crops = crops_default;
var materials = materials_default;
var materialById = new Map(materials.map((m) => [m.id, m]));
var specialEvents = special_events_default;
var qualities = qualities_default.sort((a, b) => a.tier - b.tier);
var landTiers = land_tiers_default.sort((a, b) => a.tier - b.tier);
var seasons = seasons_default;
var seasonEvents = season_events_default;
var animals = animals_default;
var pets = pets_default;
var titles = titles_default;
var ranchItems = ranch_items_default;
var accessories = ranchItems.accessories;
var decorations = ranchItems.decorations;
var accessoryById = new Map(accessories.map((a) => [a.id, a]));
var decorationById = new Map(decorations.map((d) => [d.id, d]));
var expeditionData = expeditions_default;
var expMaps = expeditionData.maps;
var expEvents = expeditionData.events;
var expDecorations = expeditionData.decorations;
var expMapById = new Map(expMaps.map((m) => [m.id, m]));
var expEventById = new Map(expEvents.map((e) => [e.id, e]));
var expDecorById = new Map(expDecorations.map((d) => [d.id, d]));
var cropById = new Map(crops.map((c) => [c.id, c]));
var getCrop = (id) => cropById.get(id) ?? ugcById.get(id);
var animalById = new Map(animals.map((a) => [a.id, a]));
var petById = new Map(pets.map((p) => [p.id, p]));
var cropsByCategory = (cat) => crops.filter((c) => c.category === cat);
var totalCropCount = crops.length;
function landTierByLevel(level) {
  return landTiers.find((t) => t.tier === level) ?? landTiers[0];
}

// vendor/aifarm/dist/gacha.js
var SEASON_ORDER = ["春", "夏", "秋", "冬"];
function seasonInRange(current, range) {
  const parts = range.split(/[-—~]/).map((s) => s.trim());
  if (parts.length === 1)
    return parts[0] === current;
  const a = SEASON_ORDER.indexOf(parts[0]);
  const b = SEASON_ORDER.indexOf(parts[1]);
  const c = SEASON_ORDER.indexOf(current);
  if (a < 0 || b < 0 || c < 0)
    return false;
  return a <= b ? c >= a && c <= b : c >= a || c <= b;
}
function eligibleCommon(season, landTier) {
  return cropsByCategory("common").filter((c) => {
    if ((c.unlockTier ?? 1) > landTier)
      return false;
    if (c.availability === "allyear")
      return true;
    if (!c.seasons)
      return true;
    return seasonInRange(season, c.seasons);
  });
}
function eligibleFantasy(landTier) {
  return cropsByCategory("fantasy").filter((c) => (c.unlockTier ?? 1) <= landTier);
}
function rollCrop(rng, seedType, landTier, waterCount, season, extraLuck = 0) {
  const pool = seedType === "common" ? eligibleCommon(season, landTier) : eligibleFantasy(landTier);
  if (pool.length === 0) {
    return cropsByCategory(seedType)[0];
  }
  const luck = (LAND_LUCK[landTier] ?? 0) + Math.min(waterCount * WATER_LUCK_PER, WATER_LUCK_CAP) + extraLuck;
  const weights = pool.map((c) => {
    const base = RARITY_WEIGHT[c.rarity] ?? 1;
    return base * Math.pow(1 + luck, rarityIndex(c.rarity));
  });
  return pool[rng.weighted(weights)];
}
function parseRange(s) {
  const m = s.match(/(\d+)\s*-\s*(\d+)/);
  if (!m)
    return [0, 1];
  return [+m[1] / 100, +m[2] / 100];
}
function rollQuality(rng) {
  let size = (rng.next() + rng.next()) / 2;
  if (rng.next() < RECORD_CHANCE)
    size = 0.99 + rng.next() * 0.01;
  for (const q of qualities) {
    const [lo, hi] = parseRange(q.sizeRange);
    if (size >= lo && size < hi)
      return { quality: q, sizePct: Math.round(size * 100) };
  }
  const top = qualities[qualities.length - 1];
  return { quality: top, sizePct: Math.round(size * 100) };
}
function cropValue(crop, quality) {
  return Math.max(1, Math.round(crop.sellPrice * quality.priceFactor));
}

// vendor/aifarm/dist/time.js
function currentSeason(now) {
  const totalTicks = Math.floor(now / TICK_MS);
  const idx = Math.floor(totalTicks / SEASON_LENGTH_TICKS) % seasons.length;
  return seasons[idx];
}
function currentDayIndex(now) {
  return Math.floor((now + 8 * 3600 * 1e3) / 864e5);
}

// vendor/aifarm/dist/daily.js
function ensureDaily(f, day) {
  if (!f.daily || f.daily.day !== day)
    f.daily = { day, logins: 0, tasks: 0, messages: 0, events: 0 };
  return f.daily;
}
function bumpDaily(f, now, key, n = 1) {
  ensureDaily(f, currentDayIndex(now))[key] += n;
}

// vendor/aifarm/dist/tasks.js
var social = (f) => f.social?.visit !== false;
var hasUgcSeed = (f) => Object.entries(f.seeds ?? {}).some(([id, n]) => (n || 0) > 0 && id.startsWith("ugc_"));
var TASK_POOL = [
  // —— 生产 / 收集（奖金币）——
  { kind: "harvest_n", label: "收获 {n} 株普通(N)作物", target: 5, reward: 40, currency: "coin", weight: 20, event: "harvest", match: (d) => d.rarity === "N", eligible: () => true },
  { kind: "harvest_r", label: "收获 {n} 株 R 作物", target: 3, reward: 70, currency: "coin", weight: 14, event: "harvest", match: (d) => d.rarity === "R", eligible: () => true },
  { kind: "harvest_sr", label: "收获 {n} 株 SR 作物", target: 1, reward: 150, currency: "coin", weight: 7, event: "harvest", match: (d) => d.rarity === "SR", eligible: (f) => f.landTier >= 2 },
  { kind: "harvest_ssr", label: "收获 {n} 株 SSR/SP 作物", target: 1, reward: 300, currency: "coin", weight: 3, event: "harvest", match: (d) => d.rarity === "SSR" || d.rarity === "SP", eligible: (f) => f.landTier >= 3 },
  { kind: "craft", label: "熔炼 {n} 次", target: 1, reward: 60, currency: "coin", weight: 10, event: "craft", eligible: () => true },
  { kind: "new_codex", label: "收获到 {n} 个新图鉴", target: 1, reward: 50, currency: "coin", weight: 8, event: "harvest", match: (d) => d.isNew && !d.isUgc, eligible: () => true },
  { kind: "plant_ugc", label: "种下 {n} 株自创作物", target: 1, reward: 30, currency: "coin", weight: 8, event: "plant_ugc", eligible: hasUgcSeed },
  // —— 社交 / 对抗 / 市场（奖银币）——
  { kind: "help_water", label: "帮邻居浇 {n} 次水", target: 1, reward: 8, currency: "silver", weight: 14, event: "help_water", eligible: social },
  { kind: "message", label: "给邻居留 {n} 次言", target: 1, reward: 5, currency: "silver", weight: 12, event: "message", eligible: social },
  { kind: "visit", label: "串门 {n} 家农场", target: 2, reward: 6, currency: "silver", weight: 12, event: "visit", eligible: social },
  { kind: "steal", label: "偷 {n} 次菜", target: 1, reward: 5, currency: "silver", weight: 12, event: "steal", eligible: social },
  { kind: "buy_ugc", label: "买 {n} 次邻居的原创作物", target: 1, reward: 15, currency: "silver", weight: 6, event: "buy_ugc", eligible: social },
  { kind: "got_watered", label: "被人浇 {n} 次水", target: 1, reward: 5, currency: "silver", weight: 8, event: "got_watered", eligible: social },
  { kind: "got_stolen", label: "被偷 {n} 次菜", target: 1, reward: 10, currency: "silver", weight: 8, event: "got_stolen", eligible: social }
];
var defByKind = (kind) => TASK_POOL.find((t) => t.kind === kind);
function onTaskEvent(f, event, now, data = {}, count = 1) {
  if (f.id === NPC_ID)
    return false;
  const t = f.task;
  if (!t || !t.accepted || t.completedAt)
    return false;
  const def = defByKind(t.kind);
  if (!def || def.event !== event)
    return false;
  if (def.match && !def.match(data))
    return false;
  if (event === "visit") {
    const id = String(data.targetId ?? "");
    if (!id)
      return false;
    t.visited ??= [];
    if (t.visited.includes(id))
      return false;
    t.visited.push(id);
  }
  t.progress = Math.min(t.target, t.progress + count);
  if (t.progress >= t.target) {
    if (t.currency === "coin")
      f.coins += t.reward;
    else
      f.silver += t.reward;
    t.completedAt = now;
    f.tasksDone = (f.tasksDone ?? 0) + 1;
    bumpDaily(f, now, "tasks");
  }
  return true;
}

// browser/crypto.browser.js
var randomUUID = () => globalThis.crypto.randomUUID();
var randomBytes = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));

// vendor/aifarm/dist/engine.js
function pushLog(farm, msg) {
  farm.log.push(msg);
  if (farm.log.length > MAX_LOG)
    farm.log.splice(0, farm.log.length - MAX_LOG);
}
function pushTrail(farm, ev) {
  (farm.trail ??= []).unshift(ev);
  if (farm.trail.length > TRAIL_MAX)
    farm.trail.length = TRAIL_MAX;
}
function advance(farm, now) {
  const elapsed = Math.floor((now - farm.lastTickAt) / TICK_MS);
  if (elapsed <= 0)
    return 0;
  for (const p of farm.plots) {
    if (p.crop && !p.crop.ripe) {
      p.crop.progress = Math.min(p.crop.growTicks, p.crop.progress + elapsed);
      if (p.crop.progress >= p.crop.growTicks)
        p.crop.ripe = true;
    }
  }
  if (farm.ranch)
    for (const a of farm.ranch.animals) {
      const kind = animalById.get(a.kindId);
      if (!kind)
        continue;
      if (a.pending < 1) {
        a.ticksSinceProduce += elapsed;
        if (a.ticksSinceProduce >= kind.produceEveryTicks) {
          a.pending = 1;
          a.ticksSinceProduce = 0;
        }
      }
    }
  farm.lastTickAt += elapsed * TICK_MS;
  return elapsed;
}
function addCodex(farm, cropId, qualityTier, now) {
  const prev = farm.codex[cropId];
  if (!prev) {
    farm.codex[cropId] = { count: 1, bestQuality: qualityTier, firstAt: now };
    return true;
  }
  prev.count += 1;
  prev.bestQuality = Math.max(prev.bestQuality, qualityTier);
  return false;
}
function officialCodexCount(farm) {
  return Object.keys(farm.codex).filter((id) => cropById.has(id)).length;
}
function collectionPct(farm) {
  return officialCodexCount(farm) / totalCropCount;
}
function codexCountByCategory(farm, cat) {
  return Object.keys(farm.codex).filter((id) => cropById.get(id)?.category === cat).length;
}
function resolveLimitedRef(farm, ref) {
  ref = String(ref ?? "").trim();
  if (!ref)
    return void 0;
  const direct = getCrop(ref);
  if (direct && (direct.category === "limited" || direct.category === "ugc"))
    return ref;
  for (const id of Object.keys(farm.seeds)) {
    const c = getCrop(id);
    if (c && c.name === ref && (c.category === "limited" || c.category === "ugc"))
      return id;
  }
  return crops.find((c) => c.category === "limited" && c.name === ref)?.id;
}
function plant(farm, plotId, seedType, limitedId, now) {
  const plot = farm.plots.find((p) => p.id === plotId);
  if (!plot)
    return { ok: false, error: `没有 ${plotId} 号地` };
  if (plot.crop)
    return { ok: false, error: `${plotId} 号地已经种着东西了` };
  if (seedType !== "common" && seedType !== "fantasy" && seedType !== "limited")
    return { ok: false, error: "种子类型只能是 common / fantasy / limited" };
  if (seedType === "limited") {
    const resolved = resolveLimitedRef(farm, String(limitedId ?? ""));
    if (!resolved)
      return { ok: false, error: "没有这种限定/自创作物（填它的中文名或 id，名字去 bag 抄）" };
    limitedId = resolved;
    const crop = getCrop(limitedId);
    if ((farm.seeds[limitedId] ?? 0) > 0) {
      farm.seeds[limitedId] -= 1;
      if (farm.seeds[limitedId] <= 0)
        delete farm.seeds[limitedId];
    } else {
      return { ok: false, error: `你没有「${crop.name}」的种子——${crop.category === "ugc" ? "先设计它、或去摊位买" : "去熔炼，或等它在商店随机刷出来时买（每种每天限 1 颗）"}。` };
    }
    plot.crop = { seedType: "limited", limitedId, growTicks: crop.growTicks, progress: 0, ripe: false, waterCount: 0 };
    if (crop.category === "ugc")
      onTaskEvent(farm, "plant_ugc", now);
    pushLog(farm, `种下限定 ${crop.name}`);
    return { ok: true, seedType: "limited", limitedId };
  }
  const price = SEED_PRICE[seedType];
  if (farm.coins < price)
    return { ok: false, error: `金币不足，${seedType === "common" ? "普通" : "奇幻"}种子要 ${price}` };
  farm.coins -= price;
  plot.crop = { seedType, growTicks: GROW_TICKS[seedType], progress: 0, ripe: false, waterCount: 0 };
  pushLog(farm, `种下一颗${seedType === "common" ? "普通" : "奇幻"}种子`);
  return { ok: true, seedType };
}
var WATER_CAP_COUNT = Math.round(WATER_LUCK_CAP / WATER_LUCK_PER);
function water(farm, plotId, by, isOwner) {
  const plot = farm.plots.find((p) => p.id === plotId);
  if (!plot || !plot.crop)
    return { ok: false, error: `${plotId} 号地没有作物` };
  const capped = plot.crop.waterCount >= WATER_CAP_COUNT;
  if (!capped)
    plot.crop.waterCount += 1;
  pushLog(farm, `${by}给 ${plotId} 号地浇了水`);
  return { ok: true, by, isOwner, capped };
}
var remainingTicks = (c) => c.growTicks - c.progress;
function visitorWater(farm, visitorId, plotId, by, now) {
  const day = currentDayIndex(now);
  let plot;
  if (plotId != null) {
    plot = farm.plots.find((p) => p.id === plotId);
    if (!plot || !plot.crop)
      return { ok: false, error: `${plotId} 号地没有作物` };
    if (plot.crop.ripe)
      return { ok: false, error: `${plotId} 号地的作物已经熟了，浇了也没用` };
  } else {
    const growing = farm.plots.filter((p) => p.crop && !p.crop.ripe);
    if (!growing.length)
      return { ok: false, error: "对方没有可浇水的作物" };
    plot = growing.reduce((best, p) => remainingTicks(p.crop) < remainingTicks(best.crop) ? p : best);
  }
  // 限制按「哪块地」算，不是按「今天来没来过」：一天只准浇一块地的话，
  // 帮人把几块地都照看一遍就成了不可能的事。
  const visitKey = `${visitorId}:${plot.id}`;
  if (farm.waterVisits?.[visitKey] === day)
    return { ok: false, error: `${plot.id} 号地今天已经浇过了，明天再来吧。` };
  const crop = plot.crop;
  crop.progress = Math.min(crop.growTicks, crop.progress + 1);
  const ripened = crop.progress >= crop.growTicks;
  if (ripened)
    crop.ripe = true;
  (farm.waterVisits ??= {})[visitKey] = day;
  pushLog(farm, `${by}帮 ${plot.id} 号地浇水，加速 30 分钟${ripened ? "，正好催熟" : ""}`);
  pushTrail(farm, { t: now, kind: "watered", by, plotId: plot.id });
  return { ok: true, plotId: plot.id, ripened };
}
function qualityTierFromName(name) {
  if (name.includes("优"))
    return 3;
  return qualities.find((q) => q.name === name)?.tier ?? 3;
}
function pickMaterial(rng) {
  return materials[rng.weighted(materials.map((m) => MATERIAL_DROP_WEIGHT[m.rarity] ?? 1))];
}
function ripenAdjacent(farm, exclude, n) {
  let c = 0;
  for (const p of farm.plots) {
    if (c >= n)
      break;
    if (p === exclude || !p.crop || p.crop.ripe)
      continue;
    p.crop.ripe = true;
    p.crop.progress = p.crop.growTicks;
    c++;
  }
  return c;
}
function rollBonusEvent(rng) {
  if (rng.next() >= HARVEST_EVENT_CHANCE)
    return null;
  const ev = specialEvents.bonus;
  return ev.length ? ev[rng.weighted(ev.map((e) => e.weight))] : null;
}
var seasonApplies = (mod) => !!mod && (!mod.capLeft || mod.capLeft.n > 0);
var qualityByTier = (t) => qualities.find((q) => q.tier === t);
function harvest(farm, plotId, now, seasonMod) {
  const plot = farm.plots.find((p) => p.id === plotId);
  if (!plot || !plot.crop)
    return { ok: false, error: `${plotId} 号地没有作物` };
  if (!plot.crop.ripe)
    return { ok: false, error: "作物还没成熟" };
  const rng = new Rng(farm.rngState);
  const c = plot.crop;
  const buffs = petBuffs(farm);
  const apply = seasonApplies(seasonMod);
  const seasonLuck = apply && seasonMod.type === "rare_luck" ? seasonMod.value ?? 0 : 0;
  const crop = c.seedType === "limited" ? getCrop(c.limitedId) : rollCrop(rng, c.seedType, farm.landTier, c.waterCount, currentSeason(now).name, buffs.luck + seasonLuck);
  let quality = rollQuality(rng).quality;
  if (apply) {
    if (seasonMod.type === "quality_top")
      quality = qualityByTier(4) ?? quality;
    else if (seasonMod.type === "quality_min")
      quality = qualityByTier(1) ?? quality;
    else if (seasonMod.type === "quality_down")
      quality = qualityByTier(Math.max(1, quality.tier - (seasonMod.value ?? 1))) ?? quality;
  }
  const ev = seasonMod ? null : rollBonusEvent(rng);
  let bonus = null;
  if (ev) {
    if (ev.effectType === "品相保底") {
      const t = qualityTierFromName(ev.param);
      if (quality.tier < t)
        quality = qualities.find((q) => q.tier === t) ?? quality;
    }
    const extraCoins = ev.effectType === "额外金币" ? Number(ev.param) || 0 : 0;
    const ripened = ev.effectType === "连收" ? ripenAdjacent(farm, plot, Number(ev.param) || 0) : 0;
    bonus = { name: ev.name, text: ev.text, effectType: ev.effectType, extraCoins, ripened };
  }
  let value = cropValue(crop, quality);
  if (ev?.effectType === "倍率")
    value = Math.round(value * (Number(ev.param) || 1));
  if (apply && seasonMod.type === "value_mult")
    value = Math.round(value * (seasonMod.value ?? 1));
  if (apply && seasonMod.capLeft)
    seasonMod.capLeft.n -= 1;
  farm.coins += value;
  if (bonus?.extraCoins)
    farm.coins += bonus.extraCoins;
  let drop = null;
  if (rng.next() < MATERIAL_DROP_CHANCE * buffs.dropMult) {
    const m = pickMaterial(rng);
    farm.materials[m.id] = (farm.materials[m.id] ?? 0) + 1;
    drop = { id: m.id, name: m.name, rarity: m.rarity, desc: m.desc };
  }
  const potionDrop = rng.next() < POTION_DROP_CHANCE * buffs.dropMult;
  if (potionDrop)
    farm.items.speed_potion = (farm.items.speed_potion ?? 0) + 1;
  farm.rngState = rng.state;
  const isNew = addCodex(farm, crop.id, quality.tier, now);
  const codexReward = isNew && crop.category !== "ugc" ? NEW_CODEX_REWARD[crop.rarity] ?? 0 : 0;
  if (codexReward)
    farm.coins += codexReward;
  plot.crop = null;
  farm.harvested = (farm.harvested ?? 0) + 1;
  onTaskEvent(farm, "harvest", now, { rarity: crop.rarity, isNew, isUgc: crop.category === "ugc" });
  pushLog(farm, `收获 ${crop.name}（${quality.name}），+${value}${drop ? ` 掉素材[${drop.name}]` : ""}${potionDrop ? " 掉药水" : ""}`);
  return { ok: true, crop, quality, value, isNew, codexReward, bonus, drop, potionDrop };
}
function stealQuota(farm, now) {
  const day = currentDayIndex(now);
  if (!farm.stealQuota || farm.stealQuota.day !== day)
    farm.stealQuota = { day, n: 0 };
  return farm.stealQuota;
}
var fmtStealRemain = (ms) => {
  const min = Math.max(1, Math.ceil(ms / 6e4));
  return min >= 60 ? `${Math.ceil(min / 60)}小时` : `${min}分钟`;
};
function stealAvailability(thief, now) {
  if (!thief)
    return { ok: true, left: STEAL_DAILY_CAP };
  const q = stealQuota(thief, now);
  if ((q.n ?? 0) >= STEAL_DAILY_CAP)
    return { ok: false, reason: `今天已经偷满 ${STEAL_DAILY_CAP} 次了，明天再出门吧。` };
  const leftMs = q.lastAt ? q.lastAt + STEAL_COOLDOWN_MS - now : 0;
  if (leftMs > 0)
    return { ok: false, reason: `刚偷过菜，先歇一会儿，约 ${fmtStealRemain(leftMs)} 后再来。` };
  return { ok: true, left: STEAL_DAILY_CAP - (q.n ?? 0) };
}
function canStealNow(thief, now) {
  return stealAvailability(thief, now).ok;
}
function stealShieldRemain(victim, now) {
  return Math.max(0, (victim.stealShieldUntil ?? 0) - now);
}
function animalUnlocked(farm, kind) {
  return officialCodexCount(farm) >= kind.unlockCodex;
}
function shopAnimals(farm) {
  return animals.filter((a) => animalUnlocked(farm, a)).sort((a, b) => a.unlockCodex - b.unlockCodex);
}
function petUnlocked(farm, kind) {
  return officialCodexCount(farm) >= kind.unlockCodex;
}
function shopPets(farm) {
  return pets.filter((p) => petUnlocked(farm, p)).sort((a, b) => a.unlockCodex - b.unlockCodex);
}
function petBuffs(farm) {
  let luck = 0, dropMult = 1, foil = 0;
  for (const p of farm.ranch?.pets ?? []) {
    const k = petById.get(p.kindId);
    if (!k)
      continue;
    luck += k.params.luck ?? 0;
    if (k.params.dropMult)
      dropMult *= k.params.dropMult;
    foil = Math.max(foil, k.params.foil ?? 0);
  }
  return { luck, dropMult, foil };
}
function newVarietiesAtTier(tier) {
  return crops.filter((c) => (c.category === "common" || c.category === "fantasy") && c.unlockTier === tier).length;
}
function nextUpgradeReq(farm) {
  const next = landTiers.find((t) => t.tier === farm.landTier + 1);
  if (!next)
    return null;
  return { next, req: LAND_UPGRADE_REQ[next.tier] };
}
function upgradeLand(farm, now) {
  const nu = nextUpgradeReq(farm);
  if (!nu)
    return { ok: false, error: "已是最高品阶，无需升级" };
  const { next, req } = nu;
  const cc = codexCountByCategory(farm, "common");
  const fc = codexCountByCategory(farm, "fantasy");
  const pct = collectionPct(farm) * 100;
  const miss = [];
  if (farm.coins < req.coins)
    miss.push(`金币 ${farm.coins}/${req.coins}`);
  if (cc < req.commonCodex)
    miss.push(`普通图鉴 ${cc}/${req.commonCodex} 种`);
  if (req.fantasyCodex && fc < req.fantasyCodex)
    miss.push(`奇幻图鉴 ${fc}/${req.fantasyCodex} 种`);
  if (req.codexPct && pct < req.codexPct)
    miss.push(`总收集度 ${pct.toFixed(1)}/${req.codexPct}%`);
  if (miss.length)
    return { ok: false, error: `升级到「${next.name}」还差：${miss.join("、")}` };
  farm.coins -= req.coins;
  farm.landTier = next.tier;
  for (let id = farm.plots.length + 1; id <= next.plots; id++)
    farm.plots.push({ id, crop: null });
  pushLog(farm, `土地升级为 ${next.name}`);
  return { ok: true, tier: next.tier, name: next.name, text: `${next.achieveText}
（解锁 ${newVarietiesAtTier(next.tier)} 种新作物；地块增至 ${next.plots}）` };
}

// vendor/aifarm/dist/titles.js
function metricValue(f, field) {
  switch (field) {
    case "harvested":
      return f.harvested ?? 0;
    case "coins":
      return f.coins ?? 0;
    case "stolen":
      return f.stolen ?? 0;
    case "watered":
      return f.watered ?? 0;
    case "codexCount":
      return Object.keys(f.codex ?? {}).filter((id) => cropById.has(id)).length;
    // 官方图鉴种数（UGC 不计）
    case "crafted":
      return f.crafted ?? 0;
    case "designCount":
      return f.designCount ?? 0;
    case "expRuns":
      return f.expRuns ?? 0;
    case "visitedCount":
      return f.visitedIds?.length ?? 0;
    case "gotStolen":
      return f.gotStolen ?? 0;
    case "tasksDone":
      return f.tasksDone ?? 0;
    case "expConcord":
      return Math.min(100, f.expConcord ?? 0);
    // 默契度（封顶 100）
    default:
      return 0;
  }
}
function checkTitles(f) {
  f.titles ??= [];
  const fresh = [];
  for (const t of titles) {
    if (f.titles.includes(t.id))
      continue;
    if (metricValue(f, t.field) >= t.min) {
      f.titles.push(t.id);
      fresh.push(t);
      pushLog(f, `🎖️ 解锁称号「${t.name}」——可让 ${f.humanName || "伴侣"} 帮你佩戴`);
    }
  }
  return fresh;
}

// vendor/aifarm/dist/season-events.js
var pick = (a) => a[Math.floor(Math.random() * a.length)];
var onCooldown = (farm, now) => farm.seasonEventAt != null && now - farm.seasonEventAt < SEASON_EVENT_COOLDOWN_MS;
function meets(farm, requires) {
  switch (requires) {
    case "ripe":
      return farm.plots.some((p) => p.crop?.ripe);
    case "growing":
      return farm.plots.some((p) => p.crop && !p.crop.ripe);
    case "empty":
      return farm.plots.some((p) => !p.crop);
    case "potion":
      return (farm.items.speed_potion ?? 0) > 0;
    case "coins100":
      return farm.coins >= 100;
    default:
      return true;
  }
}
function eligible(farm, now, trigger) {
  const season = currentSeason(now).name;
  return seasonEvents.filter((e) => e.trigger === trigger && (e.season === "any" || e.season === season) && meets(farm, e.requires));
}
function weightedPick(pool) {
  const total = pool.reduce((s, e) => s + e.weight, 0);
  let r = Math.random() * total;
  for (const e of pool) {
    if (r < e.weight)
      return e;
    r -= e.weight;
  }
  return pool[pool.length - 1];
}
function harvestNote(e) {
  switch (e.type) {
    case "value_mult":
      return `（这批收成 ×${e.value}）`;
    case "rare_luck":
      return "（这批更容易开出稀罕作物）";
    case "quality_top":
      return "（这批按极品结算）";
    case "quality_min":
      return "（这批跌到最低品质）";
    case "quality_down":
      return `（这批品相 -${e.value ?? 1} 档）`;
    default:
      return "";
  }
}
function rollSeasonHarvest(farm, now) {
  if (farm.id === NPC_ID || onCooldown(farm, now))
    return null;
  if (Math.random() >= SEASON_EVENT_CHANCE)
    return null;
  const pool = eligible(farm, now, "harvest");
  if (!pool.length)
    return null;
  const ev = weightedPick(pool);
  farm.seasonEventAt = now;
  bumpDaily(farm, now, "events");
  const e = ev.effect;
  const mod = { type: e.type, value: e.value, capLeft: e.n ? { n: e.n } : void 0 };
  return { mod, hit: { name: ev.name, line: pick(ev.lines), note: harvestNote(e) } };
}

// vendor/aifarm/dist/game.js
var CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function genCode() {
  const b = randomBytes(6);
  let s = "";
  for (let i = 0; i < 6; i++)
    s += CODE_CHARS[b[i] % CODE_CHARS.length];
  return s;
}
function makeFarm(name, seed, opts) {
  const id = genCode();
  const now = Date.now();
  const plotCount = landTierByLevel(1).plots;
  const plots = Array.from({ length: plotCount }, (_, i) => ({ id: i + 1, crop: null }));
  const clean = (s) => {
    const t = String(s ?? "").trim();
    return t ? t.slice(0, UGC_NAME_MAX) : void 0;
  };
  const farm = {
    id,
    name: name?.trim().slice(0, UGC_NAME_MAX) || `${id} 的农场`,
    aiName: clean(opts?.aiName),
    humanName: clean(opts?.humanName),
    coins: STARTING_COINS,
    silver: 0,
    landTier: 1,
    plots,
    rngState: seed != null && Number.isFinite(seed) ? seed | 0 || 1 : freshSeed(),
    codex: {},
    materials: {},
    seeds: {},
    items: { speed_potion: STARTER_POTIONS },
    shop: { refreshAt: 0, recipe: null },
    knownRecipes: [],
    market: [],
    stealCooldowns: {},
    announcedUnlocks: [],
    token: randomUUID().replace(/-/g, ""),
    humanKey: randomUUID().replace(/-/g, ""),
    messages: [],
    lastTickAt: now,
    createdAt: now,
    log: ["农场创建啦 🌱"]
  };
  farm.announcedUnlocks = [...shopAnimals(farm).map((a) => a.id), ...shopPets(farm).map((p) => p.id)];
  return farm;
}
var TOT = {
  common: cropsByCategory("common").length,
  fantasy: cropsByCategory("fantasy").length,
  limited: cropsByCategory("limited").length
};

// server/garden.mjs
function newRecord(name = "小小花园") {
  return { farm: makeFarm(name), revision: 0, receipts: {}, history: [] };
}
function publicView(record, now) {
  const f = record.farm;
  return {
    revision: record.revision,
    now,
    name: f.name,
    coins: f.coins,
    season: currentSeason(now).name,
    land: { tier: f.landTier, name: landTierByLevel(f.landTier).name, count: f.plots.length, next: nextUpgradeReq(f) },
    rules: { tickMs: TICK_MS, seedPrice: SEED_PRICE, growTicks: GROW_TICKS, waterCap: Math.round(WATER_LUCK_CAP / WATER_LUCK_PER) },
    plots: f.plots.map((p) => ({
      id: p.id,
      state: !p.crop ? "empty" : p.crop.ripe ? "ripe" : "growing",
      seedType: p.crop?.seedType ?? null,
      progress: p.crop?.progress ?? 0,
      growTicks: p.crop?.growTicks ?? 0,
      watered: p.crop?.waterCount ?? 0,
      readyAt: !p.crop || p.crop.ripe ? null : f.lastTickAt + (p.crop.growTicks - p.crop.progress) * TICK_MS
    })),
    codex: Object.entries(f.codex).flatMap(([id, entry]) => {
      const c = getCrop(id);
      return c ? [{ id, name: c.name, rarity: c.rarity, category: c.category, count: entry.count, bestQuality: entry.bestQuality, firstAt: entry.firstAt }] : [];
    }),
    history: record.history ?? [],
    harvested: f.harvested ?? 0
  };
}

// server/scenes.mjs
var SCENES = ["garden", "greenhouse"];
var GREENHOUSE_PLOTS = 8;
var GREENHOUSE_NAME = "小花房";
var FLOWER_RULES = {
  tickMs: 30 * 60 * 1e3,
  // 1 tick = 30 分钟（同菜园）
  seedPrice: { common: 8, fantasy: 40 },
  // 普通花种 8 金 / 奇幻花种 40 金
  growTicks: { common: 6, fantasy: 12 },
  // 3 小时 / 6 小时
  waterCap: 6
  // 浇水加运气的封顶次数
};
var FLOWER_CODEX_REWARD = { common: 30, fantasy: 80 };
var FLOWER_POOL = {
  common: [
    { id: "rainholm_flower_cream_star", name: "奶油星瓣", rarity: "N", pool: "common", when: ["N"] },
    { id: "rainholm_flower_blush_chime", name: "粉铃", rarity: "R", pool: "common", when: ["R", "SR", "SSR", "SP"] }
  ],
  fantasy: [
    { id: "rainholm_flower_moon_dew", name: "月露", rarity: "R", pool: "fantasy", when: ["N", "R"] },
    { id: "rainholm_flower_amber_lantern", name: "琥珀灯", rarity: "SR", pool: "fantasy", when: ["SR", "SSR", "SP"] }
  ]
};
var FLOWER_BY_ID = new Map(Object.values(FLOWER_POOL).flat().map((f) => [f.id, f]));
function checkRuleDrift(warn = console.warn) {
  const drift = [];
  if (FLOWER_RULES.tickMs !== TICK_MS) drift.push(`tickMs 配置 ${FLOWER_RULES.tickMs} ≠ 上游 ${TICK_MS}`);
  for (const k of ["common", "fantasy"]) {
    if (FLOWER_RULES.seedPrice[k] !== SEED_PRICE[k]) drift.push(`${k} 种子价 配置 ${FLOWER_RULES.seedPrice[k]} ≠ 上游 ${SEED_PRICE[k]}`);
    if (FLOWER_RULES.growTicks[k] !== GROW_TICKS[k]) drift.push(`${k} 生长 tick 配置 ${FLOWER_RULES.growTicks[k]} ≠ 上游 ${GROW_TICKS[k]}`);
  }
  const upstreamCap = Math.round(WATER_LUCK_CAP / WATER_LUCK_PER);
  if (FLOWER_RULES.waterCap !== upstreamCap) drift.push(`waterCap 配置 ${FLOWER_RULES.waterCap} ≠ 上游 ${upstreamCap}`);
  if (drift.length) warn("[greenhouse] 花房配置和上游数值对不上：" + drift.join("；") + "。引擎扣的是上游值，接口报的是配置值，去 server/scenes.mjs 对齐。");
  return drift;
}
function migrateReceipts(raw) {
  const out = { garden: {}, greenhouse: {} };
  if (!raw || typeof raw !== "object") return out;
  for (const [key, value] of Object.entries(raw)) {
    const isNamespace = SCENES.includes(key) && value && typeof value === "object" && !("canonical" in value);
    if (isNamespace) {
      Object.assign(out[key], value);
      continue;
    }
    if (value && typeof value === "object" && typeof value.canonical === "string") {
      let canonical = value.canonical;
      try {
        const parsed = JSON.parse(canonical);
        if (Array.isArray(parsed) && parsed.length === 4) canonical = JSON.stringify(["garden", ...parsed]);
      } catch {
      }
      out.garden[key] = { ...value, canonical };
      continue;
    }
    out.garden[key] = value;
  }
  return out;
}
function ensureScenes(record, now = Date.now()) {
  if (!record.greenhouse || typeof record.greenhouse !== "object") record.greenhouse = {};
  const gh = record.greenhouse;
  if (!gh.farm) {
    gh.farm = makeFarm(GREENHOUSE_NAME);
    gh.farm.coins = 0;
    gh.farm.lastTickAt = Number.isFinite(record.farm?.lastTickAt) ? record.farm.lastTickAt : now;
    gh.farm.createdAt = Number.isFinite(record.farm?.createdAt) ? record.farm.createdAt : now;
  }
  gh.codex ??= {};
  gh.history ??= [];
  if (!record.actors || typeof record.actors !== "object") record.actors = {};
  for (const s of SCENES) if (!record.actors[s] || typeof record.actors[s] !== "object") record.actors[s] = {};
  for (let id = gh.farm.plots.length + 1; id <= GREENHOUSE_PLOTS; id++) gh.farm.plots.push({ id, crop: null });
  if (!Number.isFinite(record.wallet)) record.wallet = Number.isFinite(record.farm?.coins) ? record.farm.coins : 0;
  record.receipts = migrateReceipts(record.receipts);
  record.history ??= [];
  record.schema = 2;
  return record;
}
function mergeActors(record, scene, rows) {
  const table = record.actors?.[scene] ?? {};
  for (const row of rows) {
    const hit = table[String(row.id)];
    row.lastActor = hit?.by ?? null;
    row.lastActionAt = hit?.at ?? null;
    row.lastAction = hit?.action ?? null;
  }
  return rows;
}
function syncWallet(record) {
  const w = record.wallet;
  if (record.farm) record.farm.coins = w;
  if (record.greenhouse?.farm) record.greenhouse.farm.coins = w;
}
function advanceAll(record, now) {
  const a = advance(record.farm, now);
  const b = advance(record.greenhouse.farm, now);
  return a > 0 || b > 0;
}
function needsWater(plot, cap) {
  const c = plot?.crop;
  if (!c || c.ripe) return false;
  const watered = c.waterCount ?? 0;
  if (watered >= cap) return false;
  return watered < Math.min(cap, c.progress ?? 0);
}
function gardenView(record, now) {
  const view = publicView(record, now);
  view.scene = "garden";
  view.coins = record.wallet;
  view.nextTickAt = record.farm.lastTickAt + TICK_MS;
  const cap = view.rules?.waterCap ?? FLOWER_RULES.waterCap;
  const raw = new Map(record.farm.plots.map((p) => [p.id, p]));
  for (const p of view.plots) {
    const src = raw.get(p.id);
    p.canWater = !!src?.crop && !src.crop.ripe && (src.crop.waterCount ?? 0) < cap;
    p.needsWater = needsWater(src, cap);
  }
  mergeActors(record, "garden", view.plots);
  return view;
}
function flowerCodexList(gh) {
  return Object.entries(gh.codex ?? {}).flatMap(([id, entry]) => {
    const flower = FLOWER_BY_ID.get(id);
    if (!flower) return [];
    return [{ id, name: flower.name, rarity: flower.rarity, count: entry.count, bestQuality: entry.bestQuality, firstAt: entry.firstAt }];
  });
}
function greenhouseView(record, now) {
  const gh = record.greenhouse, f = gh.farm, cap = FLOWER_RULES.waterCap;
  const view = {
    scene: "greenhouse",
    revision: record.revision,
    now,
    name: GREENHOUSE_NAME,
    coins: record.wallet,
    season: currentSeason(now).name,
    nextTickAt: f.lastTickAt + FLOWER_RULES.tickMs,
    rules: {
      tickMs: FLOWER_RULES.tickMs,
      seedPrice: { ...FLOWER_RULES.seedPrice },
      growTicks: { ...FLOWER_RULES.growTicks },
      waterCap: cap
    },
    land: { name: GREENHOUSE_NAME, count: f.plots.length, next: null },
    /* 种植中的盆只报「种的是普通还是奇幻花种」，绝不报最终是哪一朵 —— 揭晓前不泄题 */
    flowerPlots: f.plots.map((p) => ({
      id: p.id,
      state: !p.crop ? "empty" : p.crop.ripe ? "ripe" : "growing",
      seedType: p.crop?.seedType ?? null,
      progress: p.crop?.progress ?? 0,
      growTicks: p.crop?.growTicks ?? 0,
      watered: p.crop?.waterCount ?? 0,
      readyAt: !p.crop || p.crop.ripe ? null : f.lastTickAt + (p.crop.growTicks - p.crop.progress) * FLOWER_RULES.tickMs,
      canWater: !!p.crop && !p.crop.ripe && (p.crop.waterCount ?? 0) < cap,
      needsWater: needsWater(p, cap)
    })),
    flowerCodex: flowerCodexList(gh),
    flowerHistory: gh.history ?? [],
    harvested: f.harvested ?? 0
  };
  mergeActors(record, "greenhouse", view.flowerPlots);
  return view;
}
function pickFlower(seedType, rolledRarity) {
  const pool = FLOWER_POOL[seedType] ?? FLOWER_POOL.common;
  return pool.find((f) => f.when.includes(rolledRarity)) ?? pool[pool.length - 1];
}
function gardenReveal(result, now, earned) {
  return {
    id: result.crop.id,
    name: result.crop.name,
    rarity: result.crop.rarity,
    quality: result.quality.name,
    value: earned - (result.codexReward ?? 0),
    codexReward: result.codexReward,
    isNew: result.isNew,
    at: now,
    bonus: result.bonus ? { name: result.bonus.name, text: result.bonus.text } : null
  };
}
function flowerReveal(record, seedType, result, now) {
  const gh = record.greenhouse;
  const flower = pickFlower(seedType === "fantasy" ? "fantasy" : "common", result.crop?.rarity);
  const tier = result.quality?.tier ?? 1;
  const prev = gh.codex[flower.id];
  const isNew = !prev;
  if (isNew) gh.codex[flower.id] = { count: 1, bestQuality: tier, firstAt: now };
  else {
    prev.count += 1;
    prev.bestQuality = Math.max(prev.bestQuality ?? 0, tier);
  }
  const codexReward = isNew ? FLOWER_CODEX_REWARD[flower.pool] ?? 0 : 0;
  return {
    id: flower.id,
    name: flower.name,
    rarity: flower.rarity,
    quality: result.quality?.name ?? "",
    value: 0,
    // 由 action() 按钱包真实增量回填
    codexReward,
    isNew,
    at: now,
    bonus: result.bonus ? { name: result.bonus.name, text: result.bonus.text } : null
  };
}
var SceneService = class {
  constructor({ transact, clock = Date.now }) {
    this.transact = transact;
    this.clock = clock;
  }
  view(record, scene, now) {
    return scene === "greenhouse" ? greenhouseView(record, now) : gardenView(record, now);
  }
  async state(accountId, scene) {
    if (!SCENES.includes(scene)) return { ok: false, status: 400, error: "没有这个场景" };
    return this.transact(accountId, (record) => {
      const now = this.clock();
      ensureScenes(record, now);
      if (advanceAll(record, now)) record.revision++;
      syncWallet(record);
      return { ok: true, state: this.view(record, scene, now) };
    });
  }
  /** 图鉴只报已揭晓的品种；成熟未收的盆一个字都不带 */
  async codex(accountId) {
    return this.transact(accountId, (record) => {
      ensureScenes(record, this.clock());
      return { ok: true, scene: "greenhouse", revision: record.revision, codex: flowerCodexList(record.greenhouse) };
    });
  }
  /* actor ＝ 这一笔是谁按下的：'user'（玩家在页面上点）或 'black'（AI 走 cat/black/farm）。
     只用来记账，不参与幂等 canonical —— 同一个编号换个人重放还是同一件事，不许执行两遍。 */
  async action(accountId, scene, input, key, actor = "user") {
    if (!SCENES.includes(scene)) return { ok: false, status: 400, error: "没有这个场景" };
    if (!input || !["plant", "water", "harvest", "upgrade"].includes(input.action)) return { ok: false, status: 400, error: "不支持的花园操作" };
    if (!/^[a-zA-Z0-9_-]{16,100}$/.test(key ?? "")) return { ok: false, status: 400, error: "缺少操作编号，请刷新后重试" };
    if (!Number.isSafeInteger(input.revision) || input.revision < 0) return { ok: false, status: 400, error: "缺少有效版本号" };
    if (input.action !== "upgrade" && (!Number.isSafeInteger(input.plotId) || input.plotId < 1)) return { ok: false, status: 400, error: `请选择一${scene === "greenhouse" ? "个花盆" : "块田"}` };
    if (input.action === "plant" && !["common", "fantasy"].includes(input.seedType)) return { ok: false, status: 400, error: "请选择普通或奇幻种子" };
    const canonical = JSON.stringify([scene, input.action, input.plotId ?? null, input.seedType ?? null, input.revision]);
    return this.transact(accountId, (record) => {
      const clockNow = this.clock();
      ensureScenes(record, clockNow);
      for (const s of SCENES) {
        if (!Object.hasOwn(record.receipts[s], key)) continue;
        const receipt = record.receipts[s][key];
        if (s !== scene || receipt.canonical !== canonical) {
          return { ok: false, status: 409, error: "操作编号已用于另一项操作", state: this.view(record, scene, clockNow) };
        }
        return { ...receipt.response, replayed: true };
      }
      if (input.revision !== record.revision) {
        return { ok: false, status: 409, error: scene === "greenhouse" ? "花房刚刚有变化，已为你刷新" : "菜地刚刚有变化，已为你刷新", state: this.view(record, scene, clockNow) };
      }
      const now = clockNow;
      advanceAll(record, now);
      const target = scene === "greenhouse" ? record.greenhouse.farm : record.farm;
      target.coins = record.wallet;
      let result, reveal = null;
      if (input.action === "plant") result = plant(target, input.plotId, input.seedType, void 0, now);
      else if (input.action === "water") result = water(target, input.plotId, "主人", true);
      else if (input.action === "upgrade") {
        result = scene === "greenhouse" ? { ok: false, error: "小花房就这八个花盆，暂时扩不了" } : upgradeLand(target, now);
      } else {
        const plot = target.plots.find((p) => p.id === input.plotId);
        const seedType = plot?.crop?.seedType ?? null;
        const season = plot?.crop?.ripe ? rollSeasonHarvest(target, now) : null;
        const coinsBefore = target.coins;
        result = harvest(target, input.plotId, now, season?.mod);
        if (result.ok && scene === "greenhouse") {
          if (result.codexReward) target.coins -= result.codexReward;
          reveal = flowerReveal(record, seedType, result, now);
          if (reveal.codexReward) target.coins += reveal.codexReward;
          reveal.value = target.coins - coinsBefore - reveal.codexReward;
        } else if (result.ok) {
          reveal = gardenReveal(result, now, target.coins - coinsBefore);
        }
      }
      checkTitles(target);
      if (result.ok && Number.isSafeInteger(input.plotId)) {
        record.actors[scene][String(input.plotId)] = {
          by: actor === "black" ? "black" : "user",
          at: now,
          action: input.action
        };
      }
      if (Number.isFinite(target.coins)) record.wallet = target.coins;
      syncWallet(record);
      record.revision++;
      if (reveal) {
        const book = scene === "greenhouse" ? record.greenhouse : record;
        book.history.unshift(reveal);
        book.history = book.history.slice(0, 100);
      }
      const response = {
        ok: result.ok,
        status: result.ok ? 200 : 422,
        error: result.error ?? null,
        reveal,
        capped: result.capped ?? false,
        state: this.view(record, scene, now)
      };
      record.receipts[scene][key] = { canonical, response: structuredClone(response) };
      const allReceipts = SCENES.flatMap((s) => Object.keys(record.receipts[s]).map((k) => ({ scene: s, key: k, at: record.receipts[s][k]?.response?.state?.now || 0 })));
      allReceipts.sort((a, b) => a.at - b.at);
      for (const old of allReceipts.slice(0, Math.max(0, allReceipts.length - 200))) delete record.receipts[old.scene][old.key];
      return response;
    });
  }
};
function parseScene(value) {
  if (value === void 0 || value === null || value === "") return "garden";
  return SCENES.includes(value) ? value : null;
}
function createSceneApiHandler({ service, resolveAccount }) {
  return async (req, res) => {
    const send = (status, value) => {
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
      res.end(JSON.stringify(value));
    };
    try {
      const account = await resolveAccount(req);
      if (!account?.id) return send(401, { ok: false, error: "没有权限进入花园" });
      const url = new URL(req.url, "http://local");
      if (url.pathname === "/garden/api/state" && req.method === "GET") {
        const scene2 = parseScene(url.searchParams.get("scene"));
        if (!scene2) return send(400, { ok: false, error: "没有这个场景" });
        const out = await service.state(account.id, scene2);
        return send(out.status ?? 200, out);
      }
      if (url.pathname === "/garden/api/greenhouse/codex" && req.method === "GET") {
        return send(200, await service.codex(account.id));
      }
      if (url.pathname !== "/garden/api/action" || req.method !== "POST") return send(404, { ok: false, error: "没有这个入口" });
      if (req.headers["x-garden-action"] !== "1" || !String(req.headers["content-type"]).startsWith("application/json")) return send(403, { ok: false, error: "请从花园页面操作" });
      if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) return send(403, { ok: false, error: "请求来源不匹配" });
      let body = "";
      for await (const part of req) {
        body += part;
        if (Buffer.byteLength(body) > 8192) return send(413, { ok: false, error: "请求过大" });
      }
      let input;
      try {
        input = JSON.parse(body);
      } catch {
        return send(400, { ok: false, error: "请求格式有误" });
      }
      const scene = parseScene(input?.scene);
      if (!scene) return send(400, { ok: false, error: "没有这个场景" });
      const result = await service.action(account.id, scene, input, req.headers["idempotency-key"], "user");
      send(result.status ?? 200, result);
    } catch {
      send(503, { ok: false, error: "花园暂时连接不上，请稍后重试" });
    }
  };
}
export {
  FLOWER_CODEX_REWARD,
  FLOWER_POOL,
  FLOWER_RULES,
  GREENHOUSE_NAME,
  GREENHOUSE_PLOTS,
  SCENES,
  SceneService,
  advance,
  canStealNow,
  checkRuleDrift,
  createSceneApiHandler,
  ensureScenes,
  gardenView,
  greenhouseView,
  harvest,
  mergeActors,
  newRecord,
  pickFlower,
  plant,
  pushTrail,
  stealShieldRemain,
  visitorWater,
  water
};
