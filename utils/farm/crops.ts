/**
 * 一块田 · 数据定义。
 *
 * 只放常量和类型，不放逻辑——引擎和界面都从这里取，避免两边各写一份数值。
 */

export type CropId = 'wheat' | 'corn' | 'carrot';

export interface CropDef {
    id: CropId;
    name: string;
    /** 解锁所需等级 */
    level: number;
    /** 浇透水后到成熟要多久 */
    growMs: number;
    /** 收割售价 */
    price: number;
    /** 种子价 */
    seedCost: number;
    /** 收一次给多少经验。按价值给，不是一刀切 +1 */
    exp: number;
    /** 一句话说明，鼠标长按或面板里显示 */
    note: string;
}

/**
 * 定价值得解释一下：单位时间收益随等级递增（40 → 50 → 60 金币/小时），
 * 这样升级才有意义，而不是永远种麦子。麦子的价值是「三分钟就能收一次」，
 * 适合「打开网页想干点什么」的碎片时间。
 */
export const CROPS: Record<CropId, CropDef> = {
    wheat: {
        id: 'wheat',
        name: '麦子',
        level: 1,
        growMs: 3 * 60_000,
        price: 2,
        seedCost: 1,
        exp: 2,
        note: '三分钟一茬，随手种',
    },
    corn: {
        id: 'corn',
        name: '玉米',
        level: 2,
        growMs: 30 * 60_000,
        price: 25,
        seedCost: 8,
        exp: 6,
        note: '半小时，挂机一轮',
    },
    carrot: {
        id: 'carrot',
        name: '胡萝卜',
        level: 3,
        growMs: 120 * 60_000,
        price: 120,
        seedCost: 30,
        exp: 16,
        note: '两小时，半天看一次',
    },
};

/** 六块地，两行三列，横屏一屏放得下。 */
export const PLOT_COUNT = 6;

/** 新手引导：第一块地第一次种麦子，浇水后一分钟就熟。 */
export const TUTORIAL_GROW_MS = 60_000;

export const MAX_LEVEL = 10;

/**
 * 升到第 n 级所需的累计经验（下标就是等级）。
 *
 * 一期只开 10 级：三种作物撑不到 50 级，硬拉长就变成机械刷。
 * 二/三期内容补齐后换这张表（Lv.20/35/50 解锁房子），机制不用动。
 *
 * 按每次收割 6 点经验、每天 18 次估算，满级约 5~7 天。
 */
export const LEVEL_EXP: number[] = [0, 0, 10, 25, 47, 79, 125, 190, 280, 405, 575];

/** 房子四个阶段：解锁等级 + 购买价。Lv.1 的废墟是白送的。 */
export const HOUSE_STAGES = [
    { stage: 1, level: 1, cost: 0, name: '废墟' },
    { stage: 2, level: 4, cost: 150, name: '能住人' },
    { stage: 3, level: 7, cost: 400, name: '像个家' },
    { stage: 4, level: 10, cost: 800, name: '精致' },
] as const;

export type HouseStage = 1 | 2 | 3 | 4;

/** 地块共四个阶段：1 破土、2 幼苗、3 长成、4 可收。 */
export const STAGE_COUNT = 4;
