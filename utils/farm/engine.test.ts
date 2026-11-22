import { describe, expect, it } from 'vitest';
import {
    createFarm,
    harvest,
    isRipe,
    levelOf,
    needsWater,
    offlineReport,
    plant,
    remainingMs,
    stageOf,
    water,
} from './engine';
import { CROPS, TUTORIAL_GROW_MS } from './crops';

const MIN = 60_000;

describe('一块田 · 播种与浇水', () => {
    it('新农场有四块空地和一点启动金币', () => {
        const farm = createFarm(0);
        expect(farm.plots).toHaveLength(4);
        expect(farm.plots.every(p => p.crop === null)).toBe(true);
        expect(farm.coins).toBeGreaterThan(0);
    });

    it('种下后显示破土，但没浇水不会继续长', () => {
        let farm = createFarm(0);
        const r = plant(farm, 0, 'wheat', 0);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        farm = r.state;

        const plot = farm.plots[0];
        expect(stageOf(plot, 0)).toBe(1);
        // 十分钟过去，还是 1——因为没浇水
        expect(stageOf(plot, 10 * MIN)).toBe(1);
        expect(needsWater(plot)).toBe(true);
        expect(remainingMs(plot, 10 * MIN)).toBe(0);
    });

    it('浇水之后才开始倒计时，到点变四阶段', () => {
        // 跳过新手引导，验证常规三分钟的生长曲线
        let farm = { ...createFarm(0), tutorialUsed: true };
        farm = (plant(farm, 0, 'wheat', 0) as { ok: true; state: typeof farm }).state;
        farm = (water(farm, 0, 0) as { ok: true; state: typeof farm }).state;

        const grow = CROPS.wheat.growMs;
        expect(stageOf(farm.plots[0], 0)).toBe(1);
        expect(stageOf(farm.plots[0], grow * 0.4)).toBe(2);
        expect(stageOf(farm.plots[0], grow * 0.75)).toBe(3);
        expect(stageOf(farm.plots[0], grow)).toBe(4);
        expect(isRipe(farm.plots[0], grow - 1)).toBe(false);
        expect(isRipe(farm.plots[0], grow)).toBe(true);
    });

    it('重复浇水会被拒绝，不会刷新成熟时间', () => {
        let farm = createFarm(0);
        farm = (plant(farm, 0, 'wheat', 0) as { ok: true; state: typeof farm }).state;
        farm = (water(farm, 0, 0) as { ok: true; state: typeof farm }).state;
        const again = water(farm, 0, 1000);
        expect(again.ok).toBe(false);
    });
});

describe('一块田 · 新手引导', () => {
    it('第一块地第一次种麦子走一分钟快生长', () => {
        let farm = createFarm(0);
        farm = (plant(farm, 0, 'wheat', 0) as { ok: true; state: typeof farm }).state;
        expect(farm.plots[0].tutorial).toBe(true);
        farm = (water(farm, 0, 0) as { ok: true; state: typeof farm }).state;

        expect(isRipe(farm.plots[0], TUTORIAL_GROW_MS - 1)).toBe(false);
        expect(isRipe(farm.plots[0], TUTORIAL_GROW_MS)).toBe(true);
    });

    it('引导只用一次，第二块地恢复三分钟', () => {
        let farm = createFarm(0);
        farm = (plant(farm, 0, 'wheat', 0) as { ok: true; state: typeof farm }).state;
        farm = (water(farm, 0, 0) as { ok: true; state: typeof farm }).state;
        farm = (harvest(farm, 0, TUTORIAL_GROW_MS) as { ok: true; state: typeof farm }).state;

        farm = (plant(farm, 1, 'wheat', 0) as { ok: true; state: typeof farm }).state;
        expect(farm.plots[1].tutorial).toBe(false);
        farm = (water(farm, 1, 0) as { ok: true; state: typeof farm }).state;
        expect(isRipe(farm.plots[1], TUTORIAL_GROW_MS)).toBe(false);
        expect(isRipe(farm.plots[1], CROPS.wheat.growMs)).toBe(true);
    });
});

describe('一块田 · 收割与升级', () => {
    it('收割给金币和经验，地块清空', () => {
        let farm = createFarm(0);
        const before = farm.coins;
        farm = (plant(farm, 0, 'wheat', 0) as { ok: true; state: typeof farm }).state;
        farm = (water(farm, 0, 0) as { ok: true; state: typeof farm }).state;

        const r = harvest(farm, 0, TUTORIAL_GROW_MS);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.gained).toBe(CROPS.wheat.price);
        expect(r.state.coins).toBe(before - CROPS.wheat.seedCost + CROPS.wheat.price);
        expect(r.state.exp).toBe(1);
        expect(r.state.plots[0].crop).toBeNull();
    });

    it('没熟不能收', () => {
        let farm = createFarm(0);
        farm = (plant(farm, 0, 'wheat', 0) as { ok: true; state: typeof farm }).state;
        farm = (water(farm, 0, 0) as { ok: true; state: typeof farm }).state;
        expect(harvest(farm, 0, 1000).ok).toBe(false);
    });

    it('等级由经验推出：收 5 次升到 2 级', () => {
        const farm = { ...createFarm(0), exp: 4 };
        expect(levelOf(farm)).toBe(1);
        expect(levelOf({ ...farm, exp: 5 })).toBe(2);
        expect(levelOf({ ...farm, exp: 14 })).toBe(3);
        expect(levelOf({ ...farm, exp: 999 })).toBe(3);
    });

    it('等级不够买不了高等级作物', () => {
        const farm = createFarm(0);
        const r = plant(farm, 0, 'corn', 0);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toContain('2 级');
    });

    it('金币不够买不了种子', () => {
        const farm = { ...createFarm(0), exp: 14, coins: 0 };
        const r = plant(farm, 0, 'carrot', 0);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toContain('金币不够');
    });
});

describe('一块田 · 离线日报', () => {
    it('只报需要处理的事：熟了、干了', () => {
        let farm = createFarm(0);
        farm = (plant(farm, 0, 'wheat', 0) as { ok: true; state: typeof farm }).state;
        farm = (water(farm, 0, 0) as { ok: true; state: typeof farm }).state;
        farm = (plant(farm, 1, 'wheat', 0) as { ok: true; state: typeof farm }).state;
        // 2 号地空着，不该出现在日报里

        const lines = offlineReport(farm, TUTORIAL_GROW_MS + 10 * MIN);
        expect(lines.some(l => l.includes('1 号地') && l.includes('熟了'))).toBe(true);
        expect(lines.some(l => l.includes('2 号地') && l.includes('没浇水'))).toBe(true);
        expect(lines).toHaveLength(2);
    });

    it('全部正常时不报任何东西', () => {
        const farm = createFarm(0);
        expect(offlineReport(farm, 999999999)).toEqual([]);
    });
});
