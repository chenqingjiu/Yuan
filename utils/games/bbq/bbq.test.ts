import { describe, expect, it } from 'vitest';
import {
    ITEMS,
    ROUND_MS,
    SLOT_COUNT,
    STAGE_MS,
    canFlip,
    canServe,
    createGame,
    discard,
    flip,
    pickFood,
    pickSpicy,
    placeOnGrill,
    serve,
    skewerState,
    summary,
    tick,
    useItem,
    type BbqState,
    type Order,
    type Skewer,
} from './engine';

const T0 = 1_700_000_000_000;
const even = () => 0.5;

/** 造一局，并让第一位客人出现 */
function startWithGuest(): { s: BbqState; o: Order } {
    let s = createGame({ now: T0, rivalName: '苏利', rand: even });
    s = tick(s, T0 + 600, even);
    const o = s.orders.find((x) => x.status === 'waiting')!;
    return { s, o };
}

/** 按订单做一串并上炉 */
function cookFor(s: BbqState, o: Order, at: number): { s: BbqState; k: Skewer } {
    s = pickFood(s, 'meat', o.meat, at);
    s = pickFood(s, 'veg', o.veg, at);
    s = pickSpicy(s, o.spicy, at);
    const k = s.skewers.filter((x) => x.slot < 0).pop()!;
    s = placeOnGrill(s, k.id, at);
    return { s, k: s.skewers.find((x) => x.id === k.id)! };
}

describe('成串', () => {
    it('三样齐了自动成串，并绑到对应订单', () => {
        const { s: base, o } = startWithGuest();
        let s = pickFood(base, 'meat', o.meat, T0 + 700);
        expect(s.skewers.length).toBe(0);
        s = pickFood(s, 'veg', o.veg, T0 + 700);
        expect(s.skewers.length).toBe(0);
        s = pickSpicy(s, o.spicy, T0 + 700);
        expect(s.skewers.length).toBe(1);
        expect(s.skewers[0].orderId).toBe(o.id);
        expect(s.pick).toEqual({});
    });

    it('点错了可以改，只有凑齐才成串', () => {
        const { s: base, o } = startWithGuest();
        let s = pickFood(base, 'meat', 'meat-beef', T0 + 700);
        s = pickFood(s, 'meat', o.meat, T0 + 700); // 覆盖
        s = pickFood(s, 'veg', o.veg, T0 + 700);
        s = pickSpicy(s, o.spicy, T0 + 700);
        expect(s.skewers[0].meat).toBe(o.meat);
    });

    it('待烤区满了会拒绝成串', () => {
        const { s: base, o } = startWithGuest();
        let s = base;
        for (let i = 0; i < 3; i++) {
            s = pickFood(s, 'meat', o.meat, T0 + 700);
            s = pickFood(s, 'veg', o.veg, T0 + 700);
            s = pickSpicy(s, o.spicy, T0 + 700);
        }
        expect(s.skewers.length).toBe(3);
        s = pickFood(s, 'meat', o.meat, T0 + 800);
        s = pickFood(s, 'veg', o.veg, T0 + 800);
        s = pickSpicy(s, o.spicy, T0 + 800);
        expect(s.skewers.length).toBe(3); // 没加进去
    });
});

describe('烤制', () => {
    it('生 → 半熟 → 熟，翻面后才可能熟', () => {
        const { s: base, o } = startWithGuest();
        const { s, k } = cookFor(base, o, T0 + 1000);
        expect(skewerState(k, T0 + 1500)).toBe('raw');
        expect(skewerState(k, T0 + 3200)).toBe('half');
        expect(canFlip(k, T0 + 3200)).toBe(true);
        expect(canServe(k, T0 + 3200)).toBe(false);

        const flipped = flip(s, k.id, T0 + 3200);
        const k2 = flipped.skewers.find((x) => x.id === k.id)!;
        expect(k2.flippedAt).toBe(T0 + 3200);
        expect(skewerState(k2, T0 + 4000)).toBe('half');
        expect(skewerState(k2, T0 + 5500)).toBe('done');
        expect(canServe(k2, T0 + 5500)).toBe(true);
        expect(skewerState(k2, T0 + 7500)).toBe('burnt');
    });

    it('不翻面会烤糊', () => {
        const { s: base, o } = startWithGuest();
        const { k } = cookFor(base, o, T0 + 1000);
        expect(skewerState(k, T0 + 1000 + STAGE_MS * 2 - 1)).toBe('half');
        expect(skewerState(k, T0 + 1000 + STAGE_MS * 2 + 1)).toBe('burnt');
    });

    it('生的时候翻不了', () => {
        const { s: base, o } = startWithGuest();
        const { s, k } = cookFor(base, o, T0 + 1000);
        expect(canFlip(k, T0 + 1500)).toBe(false);
        const after = flip(s, k.id, T0 + 1500);
        expect(after.skewers.find((x) => x.id === k.id)!.flippedAt).toBe(0);
    });
});

describe('上菜', () => {
    it('熟了上菜给全价，能量 +1', () => {
        const { s: base, o } = startWithGuest();
        const { s, k } = cookFor(base, o, T0 + 1000);
        const f = flip(s, k.id, T0 + 3200);
        const done = serve(f, k.id, T0 + 5600);
        expect(done.money).toBe(18); // 12 + 4 + 1*2（微辣）
        expect(done.served).toBe(1);
        expect(done.perfect).toBe(1);
        expect(done.slots.every((x) => x === null)).toBe(true);
    });

    it('夹生只能拿一半', () => {
        const { s: base, o } = startWithGuest();
        const { s, k } = cookFor(base, o, T0 + 1000);
        const f = flip(s, k.id, T0 + 3200);
        const early = serve(f, k.id, T0 + 4200); // 刚翻面，还是 half
        expect(early.money).toBe(9);
        expect(early.perfect).toBe(0);
        expect(early.served).toBe(1);
    });

    it('糊了不能上菜，只能扔', () => {
        const { s: base, o } = startWithGuest();
        const { s, k } = cookFor(base, o, T0 + 1000);
        const burnt = tick(s, T0 + 5200, even); // 没翻面，过 4 秒
        const bad = serve(burnt, k.id, T0 + 5200);
        expect(bad.money).toBe(0);
        const thrown = discard(bad, k.id, T0 + 5200);
        expect(thrown.skewers.length).toBe(0);
    });

    it('没人要的串上不了菜也不给钱', () => {
        const base = createGame({ now: T0, rivalName: '苏利', rand: even });
        let s = pickFood(base, 'meat', 'meat-beef', T0 + 100);
        s = pickFood(s, 'veg', 'veg-onion', T0 + 100);
        s = pickSpicy(s, 2, T0 + 100);
        const k = s.skewers[0];
        s = placeOnGrill(s, k.id, T0 + 200);
        s = flip(s, k.id, T0 + 2300);
        const after = serve(s, k.id, T0 + 4600);
        expect(after.money).toBe(0);
        expect(after.served).toBe(0);
    });
});

describe('客人', () => {
    it('等太久会走，并计入 missed', () => {
        const { s, o } = startWithGuest();
        const late = tick(s, o.bornAt + o.patience + 100, even);
        expect(late.orders.find((x) => x.id === o.id)!.status).toBe('left');
        expect(late.missed).toBe(1);
    });

    it('同时最多三个客人', () => {
        let s = createGame({ now: T0, rivalName: '苏利', rand: even });
        for (let t = 0; t < 60000; t += 200) s = tick(s, T0 + t, even);
        const waiting = s.orders.filter((x) => x.status === 'waiting').length;
        expect(waiting).toBeLessThanOrEqual(3);
        expect(waiting).toBe(3);
    });
});

describe('道具', () => {
    it('能量不够时丢不出去', () => {
        const s = createGame({ now: T0, rivalName: '苏利', rand: even });
        const after = useItem(s, 'raid', T0 + 100); // 需要 3 格，只有 1
        expect(after.energy).toBe(1);
        expect(after.rival.frozenUntil).toBe(0);
    });

    it('泼水让对手停 6 秒', () => {
        let s = createGame({ now: T0, rivalName: '苏利', rand: even });
        s = { ...s, energy: 5 };
        const after = useItem(s, 'water', T0 + 100);
        expect(after.energy).toBe(3);
        expect(after.rival.frozenUntil).toBe(T0 + 6100);
    });

    it('喇叭让对手十秒内收入减半', () => {
        let s = createGame({ now: T0, rivalName: '苏利', rand: even });
        s = { ...s, energy: 5 };
        const after = useItem(s, 'horn', T0 + 100);
        expect(after.rival.lureUntil).toBe(T0 + 10100);
    });

    it('每个道具都有名字、消耗和台词', () => {
        for (const it of ITEMS) {
            expect(it.cost).toBeGreaterThan(0);
            expect(it.taunt.length).toBeGreaterThan(0);
            expect(it.name.length).toBeGreaterThan(0);
        }
    });
});

describe('整局', () => {
    it('五分钟能跑完，不死循环，玩家按规则操作能赚到钱', () => {
        let s = createGame({ now: T0, rivalName: '苏利', rand: Math.random });
        const STEP = 120;
        let guard = 0;

        while (s.phase === 'playing' && guard++ < 5000) {
            const now = s.now + STEP;
            s = tick(s, now, Math.random);

            // 自动玩家：有空炉就上，半熟就翻，熟了立刻上菜
            for (const k of s.skewers) {
                const st = skewerState(k, now);
                if (st === 'burnt') { s = discard(s, k.id, now); continue; }
                if (k.slot < 0) {
                    const wait = s.orders.some(
                        (o) => o.status === 'waiting' && o.id === k.orderId,
                    );
                    if (wait) s = placeOnGrill(s, k.id, now);
                    else s = discard(s, k.id, now);
                    continue;
                }
                if (canFlip(k, now)) s = flip(s, k.id, now);
                else if (st === 'done') s = serve(s, k.id, now);
            }

            // 有空炉就补一串
            const free = s.slots.filter((x) => x === null).length;
            if (free > 0) {
                const o = s.orders.find(
                    (x) => x.status === 'waiting'
                        && !s.skewers.some((k) => k.orderId === x.id),
                );
                if (o) {
                    s = pickFood(s, 'meat', o.meat, now);
                    s = pickFood(s, 'veg', o.veg, now);
                    s = pickSpicy(s, o.spicy, now);
                }
            }
        }

        expect(s.phase).toBe('over');
        expect(guard).toBeLessThan(5000);
        expect(s.served).toBeGreaterThan(10);
        expect(s.money).toBeGreaterThan(100);
        expect(s.slots.every((x) => x === null || s.skewers.some((k) => k.id === x))).toBe(true);
        expect(summary(s).subtitle).toContain(':');
    });

    it('时间一到就结束，之后的操作不再生效', () => {
        let s = createGame({ now: T0, rivalName: '苏利', rand: even });
        s = tick(s, T0 + ROUND_MS + 1, even);
        expect(s.phase).toBe('over');
        const after = pickFood(s, 'meat', 'meat-beef', T0 + ROUND_MS + 100);
        expect(after.skewers.length).toBe(0);
    });

    it('炉位永远不会超', () => {
        const { s: base, o } = startWithGuest();
        let s = base;
        for (let i = 0; i < 8; i++) {
            s = pickFood(s, 'meat', o.meat, T0 + 700 + i);
            s = pickFood(s, 'veg', o.veg, T0 + 700 + i);
            s = pickSpicy(s, o.spicy, T0 + 700 + i);
            const free = s.skewers.filter((k) => k.slot < 0);
            if (free.length) s = placeOnGrill(s, free[0].id, T0 + 700 + i);
        }
        expect(s.slots.filter((x) => x !== null).length).toBe(SLOT_COUNT);
    });
});
