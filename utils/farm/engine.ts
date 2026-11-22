/**
 * 一块田 · 引擎。
 *
 * 一条硬原则：**生长按绝对时间戳推算，不靠计时器推进。**
 * 页面关掉、切到后台、第二天再打开，只要时间过了就该熟——这样「挂着网页」和
 * 「关掉网页」结果一致。计时器只负责让界面重新读一次 now。
 *
 * 所有函数都是纯函数：传进旧状态，返回新状态，不碰存储、不发请求。
 */

import {
    CROPS,
    HOUSE_STAGES,
    LEVEL_EXP,
    MAX_LEVEL,
    PLOT_COUNT,
    TUTORIAL_GROW_MS,
    type CropId,
    type HouseStage,
} from './crops';

export interface PlotState {
    crop: CropId | null;
    plantedAt: number | null;
    /** 最后一次浇透水的时刻。null = 播下了但还没浇水，生长不会开始。 */
    wateredAt: number | null;
    /** 新手引导地块：这块地用一分钟成熟，只此一次。 */
    tutorial?: boolean;
}

export interface FarmState {
    coins: number;
    /** 累计经验，收割一次 +1。等级由它推出来，不单独存。 */
    exp: number;
    plots: PlotState[];
    /** 新手引导是否已经用掉（含已收割或已种下）。 */
    tutorialUsed: boolean;
    /** 现在摆出来的房子阶段 1..4 */
    houseStage: HouseStage;
    /** 已经买下的阶段，随时可以切回去看 */
    ownedHouses: HouseStage[];
    updatedAt: number;
}

export type ActionResult = { ok: true; state: FarmState } | { ok: false; reason: string };

const emptyPlot = (): PlotState => ({ crop: null, plantedAt: null, wateredAt: null });

export function createFarm(now: number = Date.now()): FarmState {
    return {
        coins: 20,
        exp: 0,
        plots: Array.from({ length: PLOT_COUNT }, emptyPlot),
        tutorialUsed: false,
        houseStage: 1,
        ownedHouses: [1],
        updatedAt: now,
    };
}

/** 等级从经验推，不单独存——避免两份数据打架。 */
export function levelOf(state: FarmState): number {
    let level = 1;
    for (let n = 2; n <= MAX_LEVEL; n++) {
        if (state.exp >= LEVEL_EXP[n]) level = n;
    }
    return level;
}

/** 当前等级内的经验进度，面板上用来画进度条。 */
export function levelProgress(state: FarmState): { level: number; into: number; need: number } {
    const level = levelOf(state);
    if (level >= MAX_LEVEL) return { level, into: 1, need: 1 };
    const base = LEVEL_EXP[level];
    const next = LEVEL_EXP[level + 1];
    return { level, into: state.exp - base, need: next - base };
}

/** 这块地当前该长什么样：0 空地、1 破土、2 幼苗、3 长成、4 可收。 */
export function stageOf(plot: PlotState, now: number): 0 | 1 | 2 | 3 | 4 {
    if (!plot.crop) return 0;
    // 播下但没浇水：显示破土的小芽，提示要浇水，但不会继续长。
    if (plot.wateredAt === null) return 1;
    const growMs = plot.tutorial ? TUTORIAL_GROW_MS : CROPS[plot.crop].growMs;
    const ratio = (now - plot.wateredAt) / growMs;
    if (ratio >= 1) return 4;
    return (1 + Math.min(2, Math.floor(ratio * 3))) as 1 | 2 | 3;
}

export function isRipe(plot: PlotState, now: number): boolean {
    return stageOf(plot, now) === 4;
}

/** 还需要多久成熟；已熟或空地返回 0。 */
export function remainingMs(plot: PlotState, now: number): number {
    if (!plot.crop || plot.wateredAt === null) return 0;
    const growMs = plot.tutorial ? TUTORIAL_GROW_MS : CROPS[plot.crop].growMs;
    return Math.max(0, plot.wateredAt + growMs - now);
}

/** 这块地需要浇水：有作物、还没浇过。 */
export function needsWater(plot: PlotState): boolean {
    return plot.crop !== null && plot.wateredAt === null;
}

export function canPlant(state: FarmState, cropId: CropId): { ok: boolean; reason: string } {
    const def = CROPS[cropId];
    if (levelOf(state) < def.level) return { ok: false, reason: `${def.name}要 ${def.level} 级才能种` };
    if (state.coins < def.seedCost) return { ok: false, reason: `金币不够，${def.name}种子要 ${def.seedCost}` };
    return { ok: true, reason: '' };
}

export function plant(state: FarmState, plotId: number, cropId: CropId, now: number): ActionResult {
    const plot = state.plots[plotId];
    if (!plot) return { ok: false, reason: '没有这块地' };
    if (plot.crop) return { ok: false, reason: '这块地已经种着了' };
    const check = canPlant(state, cropId);
    if (!check.ok) return { ok: false, reason: check.reason };

    // 新手引导：第一块地、第一次种麦子，用一分钟的快生长。
    const tutorial = !state.tutorialUsed && cropId === 'wheat';
    const plots = state.plots.map((p, i) =>
        i === plotId ? { crop: cropId, plantedAt: now, wateredAt: null, tutorial } : p,
    );
    return {
        ok: true,
        state: {
            ...state,
            coins: state.coins - CROPS[cropId].seedCost,
            plots,
            tutorialUsed: state.tutorialUsed || tutorial,
            updatedAt: now,
        },
    };
}

export function water(state: FarmState, plotId: number, now: number): ActionResult {
    const plot = state.plots[plotId];
    if (!plot) return { ok: false, reason: '没有这块地' };
    if (!plot.crop) return { ok: false, reason: '这块地还没种东西' };
    if (plot.wateredAt !== null) return { ok: false, reason: '已经浇过了' };
    const plots = state.plots.map((p, i) => (i === plotId ? { ...p, wateredAt: now } : p));
    return { ok: true, state: { ...state, plots, updatedAt: now } };
}

export function harvest(state: FarmState, plotId: number, now: number): ActionResult & { gained?: number } {
    const plot = state.plots[plotId];
    if (!plot) return { ok: false, reason: '没有这块地' };
    if (!plot.crop) return { ok: false, reason: '这块地是空的' };
    if (!isRipe(plot, now)) return { ok: false, reason: '还没熟' };

    const def = CROPS[plot.crop];
    const gained = def.price;
    const plots = state.plots.map((p, i) => (i === plotId ? emptyPlot() : p));
    return {
        ok: true,
        gained,
        state: {
            ...state,
            coins: state.coins + gained,
            exp: state.exp + def.exp,
            plots,
            updatedAt: now,
        },
    };
}

/**
 * 离线日报：你不在的时候田里发生了什么。
 *
 * 只报「有行动价值」的事——熟了要收、干了要浇。空地不报，长得好好的不报，
 * 否则一句话里能把四块地念两遍，反而没人看。
 */
export function offlineReport(state: FarmState, now: number): string[] {
    const out: string[] = [];
    state.plots.forEach((plot, i) => {
        const name = plot.crop ? CROPS[plot.crop].name : '';
        const no = `${i + 1} 号地`;
        if (!plot.crop) return;
        if (needsWater(plot)) {
            out.push(`${no}的${name}还没浇水，一直没长`);
            return;
        }
        if (isRipe(plot, now)) {
            out.push(`${no}的${name}熟了`);
        }
    });
    return out;
}

/** 某个房子阶段能不能买：等级够、钱够、还没买过。 */
export function canBuyHouse(state: FarmState, stage: HouseStage): { ok: boolean; reason: string } {
    const def = HOUSE_STAGES.find((h) => h.stage === stage);
    if (!def) return { ok: false, reason: '没有这个阶段' };
    if (state.ownedHouses.includes(stage)) return { ok: false, reason: '已经买过了' };
    if (levelOf(state) < def.level) return { ok: false, reason: `要 ${def.level} 级才能买` };
    if (state.coins < def.cost) return { ok: false, reason: `还差 ${def.cost - state.coins} 币` };
    return { ok: true, reason: '' };
}

/** 买下某个阶段的房子，并立刻换上。 */
export function buyHouse(state: FarmState, stage: HouseStage, now: number): ActionResult {
    const check = canBuyHouse(state, stage);
    if (!check.ok) return { ok: false, reason: check.reason };
    const def = HOUSE_STAGES.find((h) => h.stage === stage)!;
    return {
        ok: true,
        state: {
            ...state,
            coins: state.coins - def.cost,
            ownedHouses: [...state.ownedHouses, stage].sort((a, b) => a - b) as HouseStage[],
            houseStage: stage,
            updatedAt: now,
        },
    };
}

/** 在已买下的阶段之间切换外观，不花钱——「重新粉刷」随时能切回去看看旧样子。 */
export function setHouseStage(state: FarmState, stage: HouseStage, now: number): ActionResult {
    if (!state.ownedHouses.includes(stage)) return { ok: false, reason: '这个阶段还没买' };
    return { ok: true, state: { ...state, houseStage: stage, updatedAt: now } };
}

/** 全部地块的状态摘要，给界面画一圈小字用。 */
export function plotSummary(plot: PlotState, now: number): string {
    if (!plot.crop) return '空地';
    const def = CROPS[plot.crop];
    if (needsWater(plot)) return `${def.name} · 待浇水`;
    if (isRipe(plot, now)) return `${def.name} · 可收`;
    const left = remainingMs(plot, now);
    const min = Math.ceil(left / 60_000);
    return `${def.name} · ${min} 分后熟`;
}
