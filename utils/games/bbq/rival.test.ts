import { describe, expect, it } from 'vitest';
import {
    ATTACK_COUNT,
    applyRivalAttack,
    attacksLeft,
    createGame,
    nextAttackAt,
    pickFood,
    pickSpicy,
    placeOnGrill,
    serve,
    skewerState,
    skipRivalAttack,
    timeline,
    tick,
    useItem,
    type BbqState,
    type Order,
} from './engine';
import { localDecide, parseAttackReply, type AttackContext } from './rivalBrain';

const T0 = 1_700_000_000_000;
const even = () => 0.5;

function withGuest(): { s: BbqState; o: Order } {
    let s = createGame({ now: T0, rivalName: '苏利', rand: even });
    s = tick(s, T0 + 600, even);
    return { s, o: s.orders.find((x) => x.status === 'waiting')! };
}

function benchSkewer(s: BbqState, o: Order, at: number) {
    let x = pickFood(s, 'meat', o.meat, at);
    x = pickFood(x, 'veg', o.veg, at);
    x = pickSpicy(x, o.spicy, at);
    return { s: x, k: x.skewers[x.skewers.length - 1] };
}

describe('对手捣乱', () => {
    it('泼水让玩家 6 秒不能上炉', () => {
        const { s, o } = withGuest();
        const { s: withBench, k } = benchSkewer(s, o, T0 + 700);
        const hit = applyRivalAttack(withBench, { item: 'water', line: '我的火！' }, T0 + 1000);
        expect(hit.dousedUntil).toBe(T0 + 7000);
        const blocked = placeOnGrill(hit, k.id, T0 + 3000);
        expect(blocked.slots.every((x) => x === null)).toBe(true);
        const ok = placeOnGrill(hit, k.id, T0 + 7100);
        expect(ok.slots.filter((x) => x !== null).length).toBe(1);
    });

    it('城管在的时候连食材都点不了', () => {
        const { s, o } = withGuest();
        const hit = applyRivalAttack(s, { item: 'raid', line: '又是你叫的吧' }, T0 + 1000);
        expect(hit.raidUntil).toBe(T0 + 9000);
        const after = pickFood(hit, 'meat', o.meat, T0 + 2000);
        expect(after.pick.meat).toBeUndefined();
    });

    it('撒盐让下一单倒赔半价，且不算零失误', () => {
        const { s, o } = withGuest();
        const { s: bench, k } = benchSkewer(s, o, T0 + 700);
        const placed = placeOnGrill(bench, k.id, T0 + 800);
        const flipped = { ...placed, skewers: placed.skewers.map((x) => ({ ...x, flippedAt: T0 + 2850 })) };
        const salty = applyRivalAttack(flipped, { item: 'salt', line: '今天盐有点咸' }, T0 + 2900);
        expect(salty.badNext).toBe(true);
        // 倒赔：这一单不但不给钱，还扣掉半价（至少 5）。18 的半价是 9。
        const done = serve({ ...salty, money: 100 }, k.id, T0 + 5000);
        expect(done.money).toBe(91);
        expect(done.perfect).toBe(0);
        expect(done.badNext).toBe(false);
    });

    it('撒盐倒赔不会把营业额扣成负数', () => {
        const { s, o } = withGuest();
        const { s: bench, k } = benchSkewer(s, o, T0 + 700);
        const placed = placeOnGrill(bench, k.id, T0 + 800);
        const flipped = { ...placed, skewers: placed.skewers.map((x) => ({ ...x, flippedAt: T0 + 2850 })) };
        const salty = applyRivalAttack(flipped, { item: 'salt', line: '今天盐有点咸' }, T0 + 2900);
        const done = serve({ ...salty, money: 3 }, k.id, T0 + 5000);
        expect(done.money).toBe(0);
    });

    it('扇风让下一串的半熟窗口只剩 1.2 秒', () => {
        const { s, o } = withGuest();
        const hit = applyRivalAttack(s, { item: 'fan', line: '火太旺了吧' }, T0 + 900);
        expect(hit.curseNext).toBe(true);
        const { s: bench, k } = benchSkewer(hit, o, T0 + 1000);
        expect(k.cursed).toBe(true);
        const placed = placeOnGrill(bench, k.id, T0 + 1100);
        const skew = placed.skewers.find((x) => x.id === k.id)!;
        expect(skewerState(skew, T0 + 1100 + 1300)).toBe('half');
        expect(skewerState(skew, T0 + 1100 + 2500)).toBe('burnt');
    });

    it('喇叭让在等的客人耐心直接少 10 秒', () => {
        const { s, o } = withGuest();
        const hit = applyRivalAttack(s, { item: 'horn', line: '隔壁更便宜' }, T0 + 700);
        const after = hit.orders.find((x) => x.id === o.id)!;
        expect(after.patience).toBe(o.patience - 10000);
    });

    it('三次用完就不再打', () => {
        let s = createGame({ now: T0, rivalName: '苏利', rand: even });
        for (let i = 0; i < ATTACK_COUNT; i++) {
            s = applyRivalAttack(s, { item: 'water', line: '' }, T0 + 1000 + i * 100);
        }
        expect(s.rival.attacksUsed).toBe(ATTACK_COUNT);
        expect(attacksLeft(s.rival)).toBe(0);
        const again = applyRivalAttack(s, { item: 'raid', line: '' }, T0 + 5000);
        expect(again.rival.attacksUsed).toBe(ATTACK_COUNT);
    });

    it('选择不出手也算用掉一次，并留下记录', () => {
        const s = createGame({ now: T0, rivalName: '苏利', rand: even });
        const after = skipRivalAttack(s, '先让你烤两条', T0 + 1000);
        expect(after.rival.attacksUsed).toBe(1);
        expect(after.events.some((e) => e.actor === 'rival' && e.text.includes('放下了'))).toBe(true);
    });

    it('三次机会的时刻分布在局内，被砸会提前', () => {
        const s = createGame({ now: T0, rivalName: '苏利', rand: even });
        const first = nextAttackAt(s.rival);
        expect(first).toBeGreaterThan(T0 + 45000);
        expect(first).toBeLessThan(T0 + 70000);
        const hit = useItem({ ...s, energy: 5 }, 'horn', T0 + 10000);
        expect(nextAttackAt(hit.rival)).toBe(first - 15000);
    });

    it('被砸一次最多提前到 8 秒后，不会立刻还手', () => {
        let s = createGame({ now: T0, rivalName: '苏利', rand: even });
        s = { ...s, energy: 5, rival: { ...s.rival, attackSlots: [T0 + 9000, T0 + 200000, T0 + 260000] } };
        const hit = useItem(s, 'salt', T0 + 1000);
        expect(nextAttackAt(hit.rival)).toBe(T0 + 9000); // 已经是 8 秒后，不再往前
    });

    it('你这一局也只能丢三次，和他对等', () => {
        let s = createGame({ now: T0, rivalName: '苏利', rand: even });
        s = { ...s, energy: 5 };
        for (let i = 0; i < ATTACK_COUNT; i++) s = useItem(s, 'horn', T0 + 1000 + i * 10);
        expect(s.itemUses).toBe(ATTACK_COUNT);
        const again = useItem({ ...s, energy: 5 }, 'water', T0 + 5000);
        expect(again.itemUses).toBe(ATTACK_COUNT);
        expect(again.rival.frozenUntil).toBe(0); // 没打出去
    });
});

describe('双时间轴', () => {
    it('你俩的动作都进同一条时间轴，按时间排好', () => {
        let s = createGame({ now: T0, rivalName: '苏利', rand: even });
        s = tick(s, T0 + 600, even);
        const o = s.orders.find((x) => x.status === 'waiting')!;
        s = applyRivalAttack(s, { item: 'fan', line: '我帮你扇扇' }, T0 + 2000);
        let t = pickFood(s, 'meat', o.meat, T0 + 2500);
        t = pickFood(t, 'veg', o.veg, T0 + 2500);
        t = pickSpicy(t, o.spicy, T0 + 2500);
        const k = t.skewers[t.skewers.length - 1];
        t = placeOnGrill(t, k.id, T0 + 2600);
        // 对手按自己的节奏出几单
        for (let x = T0 + 12000; x <= T0 + 60000; x += 500) t = tick(t, x, even);

        const lines = timeline(t);
        expect(lines.length).toBeGreaterThan(2);
        const actors = new Set(lines.map((l) => l.who));
        expect(actors.has('你')).toBe(true);
        expect(actors.has('苏利')).toBe(true);
        // 时间递增
        for (let i = 1; i < lines.length; i++) {
            expect(lines[i].time >= lines[i - 1].time).toBe(true);
        }
    });

    it('对手上菜带金额，糊了不带', () => {
        let s = createGame({ now: T0, rivalName: '苏利', rand: even });
        s = tick(s, T0 + 20000, even); // 第一单结算
        const serveEv = s.events.find((e) => e.actor === 'rival' && e.kind === 'serve');
        expect(serveEv).toBeTruthy();
        expect(serveEv!.money).toBeGreaterThan(0);
    });
});
