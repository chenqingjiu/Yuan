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
        note: '三分钟一茬，随手种',
    },
    corn: {
        id: 'corn',
        name: '玉米',
        level: 2,
        growMs: 30 * 60_000,
        price: 25,
        seedCost: 8,
        note: '半小时，挂机一轮',
    },
    carrot: {
        id: 'carrot',
        name: '胡萝卜',
        level: 3,
        growMs: 120 * 60_000,
        price: 120,
        seedCost: 30,
        note: '两小时，半天看一次',
    },
};

/** 第一期固定四块地，不跟等级绑定——布局稳定，永远摆得下。 */
export const PLOT_COUNT = 4;

/** 新手引导：第一块地第一次种麦子，浇水后一分钟就熟。 */
export const TUTORIAL_GROW_MS = 60_000;

export const MAX_LEVEL = 3;

/**
 * 升到第 n 级所需的累计经验。
 * 经验来源只有一个：收割一次 +1。
 * 所以 lv2 要收 5 次，lv3 要再收 9 次（累计 14）。
 */
export const LEVEL_EXP: number[] = [0, 0, 5, 14];

/** 地块共四个阶段：1 破土、2 幼苗、3 长成、4 可收。 */
export const STAGE_COUNT = 4;
