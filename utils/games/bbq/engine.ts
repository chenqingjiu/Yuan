/**
 * 夜市烧烤对决 —— 纯逻辑（不碰 DOM、不碰网络，全部可单测）。
 *
 * 一局的流程：客人来 → 点肉/菜/辣度自动成串 → 上炉 → 半熟时翻面 → 熟时上菜 → 收钱。
 * 4 个炉位并行，5 分钟打烊，比营业额。
 */

export type Spicy = 0 | 1 | 2;
export type SkewerState = 'raw' | 'half' | 'done' | 'burnt';
export type ItemId = 'horn' | 'water' | 'fan' | 'salt' | 'raid';

/** 每个烤制阶段 2 秒：生 → 半熟（该翻面）→ 熟 → 糊 */
export const STAGE_MS = 2000;
/** 炉位数量 */
export const SLOT_COUNT = 4;
/** 待烤区容量 */
export const WAIT_CAP = 3;
/** 同时等待的客人上限 */
export const MAX_GUESTS = 3;
/** 一局时长 */
export const ROUND_MS = 5 * 60 * 1000;

export interface Order {
    id: number;
    /** 顾客立绘索引 0..3 */
    guest: number;
    meat: string;
    veg: string;
    spicy: Spicy;
    bornAt: number;
    patience: number;
    /** waiting = 在等；served = 已上菜；left = 等太久走了 */
    status: 'waiting' | 'served' | 'left';
    paid?: number;
}

export interface Skewer {
    id: number;
    orderId: number;
    meat: string;
    veg: string;
    spicy: Spicy;
    /** -1 = 还在待烤区 */
    slot: number;
    /** 上炉时刻；未上炉为 0 */
    placedAt: number;
    flippedAt: number;
    /** 是否已经糊掉（不可挽回） */
    dead: boolean;
    /** 被对手扇风，下一串必糊 */
    cursed?: boolean;
}

export interface Rival {
    name: string;
    avatar?: string;
    money: number;
    served: number;
    perfect: number;
    burned: number;
    /** 当前这单开始计时 */
    taskStartedAt: number;
    /** 这一单要花多久 */
    taskMs: number;
    /** 熄火到此刻（被泼水/城管） */
    frozenUntil: number;
    /** 客人被喇叭抢走，收入减半到此刻 */
    lureUntil: number;
    /** 下一单必糊 */
    forceBurn: boolean;
    /** 下一单必差评 */
    forceBad: boolean;
    /** 当前台词与出现时刻 */
    line: string;
    lineAt: number;
}

export interface Pick {
    meat?: string;
    veg?: string;
    spicy?: Spicy;
}

export interface BbqState {
    now: number;
    startedAt: number;
    endsAt: number;
    phase: 'playing' | 'over';
    orders: Order[];
    skewers: Skewer[];
    /** 每个炉位上的串 id，null 表示空 */
    slots: (number | null)[];
    pick: Pick;
    money: number;
    served: number;
    perfect: number;
    burnt: number;
    missed: number;
    energy: number;
    seq: number;
    nextGuestAt: number;
    rival: Rival;
    log: string[];
    /** 玩家被打的负面状态：下一串必糊 */
    curseNext: boolean;
    /** 最近一次操作反馈（UI 上飘一下） */
    toast: { text: string; at: number; kind: 'good' | 'bad' | 'info' } | null;
}

export const ITEMS: {
    id: ItemId;
    name: string;
    icon: string;
    cost: number;
    desc: string;
    /** 对手被打时的反应（本地文案） */
    taunt: string;
}[] = [
    { id: 'horn', name: '喇叭', icon: '📢', cost: 1, desc: '循环喊“隔壁更便宜”，抢客 10 秒', taunt: '谁在我门口放这个…' },
    { id: 'water', name: '泼水', icon: '🪣', cost: 2, desc: '浇灭他的炭火，6 秒不能烤', taunt: '我的火！' },
    { id: 'fan', name: '扇风', icon: '🍃', cost: 1, desc: '把他的火扇旺，下一串必糊', taunt: '这火怎么压不住' },
    { id: 'salt', name: '撒盐', icon: '🧂', cost: 1, desc: '他下一单必定差评', taunt: '今天盐怎么这么咸' },
    { id: 'raid', name: '喊城管', icon: '🚨', cost: 3, desc: '他被赶走，8 秒不能出摊', taunt: '又是你叫的吧' },
];

export const itemOf = (id: ItemId) => ITEMS.find((i) => i.id === id)!;

/** 单串价格：肉 12 + 菜 4 + 辣度 0/2/4 */
export const priceOf = (meat: string, veg: string, spicy: Spicy): number =>
    12 + (veg ? 4 : 0) + spicy * 2;

const pickOne = <T,>(arr: T[], rand: () => number): T => arr[Math.floor(rand() * arr.length) % arr.length];

const fmt = (ms: number) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

// ---------------------------------------------------------------- 初始化

export function createGame(opts: {
    now: number;
    rivalName: string;
    rivalAvatar?: string;
    rand?: () => number;
}): BbqState {
    const rand = opts.rand || Math.random;
    return {
        now: opts.now,
        startedAt: opts.now,
        endsAt: opts.now + ROUND_MS,
        phase: 'playing',
        orders: [],
        skewers: [],
        slots: Array(SLOT_COUNT).fill(null),
        pick: {},
        money: 0,
        served: 0,
        perfect: 0,
        burnt: 0,
        missed: 0,
        energy: 1,
        seq: 1,
        nextGuestAt: opts.now + 500,
        rival: {
            name: opts.rivalName,
            avatar: opts.rivalAvatar,
            money: 0,
            served: 0,
            perfect: 0,
            burned: 0,
            taskStartedAt: opts.now,
            taskMs: 11500,
            frozenUntil: 0,
            lureUntil: 0,
            forceBurn: false,
            forceBad: false,
            line: '今晚这街归我',
            lineAt: opts.now,
            },
        log: [],
        curseNext: false,
        toast: null,
    };
}

// ---------------------------------------------------------------- 烤制判定

/** 这串当前是什么状态 */
export function skewerState(s: Skewer, now: number): SkewerState {
    if (s.dead) return 'burnt';
    if (s.slot < 0 || !s.placedAt) return 'raw';
    if (!s.flippedAt) {
        const t = now - s.placedAt;
        if (t < STAGE_MS) return 'raw';
        if (t < STAGE_MS * 2) return 'half';
        return 'burnt';
    }
    const t = now - s.flippedAt;
    if (t < STAGE_MS) return 'half';
    if (t < STAGE_MS * 2) return 'done';
    return 'burnt';
}

/** 现在能不能翻面（只有半熟那一档能翻） */
export function canFlip(s: Skewer, now: number): boolean {
    return !s.dead && !s.flippedAt && s.slot >= 0 && skewerState(s, now) === 'half';
}

/** 现在能不能上菜（熟了就行，夹生也能上但只给一半钱） */
export function canServe(s: Skewer, now: number): boolean {
    if (s.dead || s.slot < 0 || !s.flippedAt) return false;
    const st = skewerState(s, now);
    return st === 'done' || st === 'half';
}

/** 炉位进度 0..1（用于画环形进度条） */
export function cookProgress(s: Skewer, now: number): number {
    if (!s.placedAt) return 0;
    const base = s.flippedAt || s.placedAt;
    const t = now - base;
    return Math.max(0, Math.min(1, t / (STAGE_MS * 2)));
}

// ---------------------------------------------------------------- 状态推进

/** 时间推进：生成客人、把烤糊的串标死、超时的客人赶走、对手出一单 */
export function tick(state: BbqState, now: number, rand: () => number = Math.random): BbqState {
    if (state.phase === 'over') return state;
    const s: BbqState = { ...state, now, orders: [...state.orders], skewers: [...state.skewers] };
    s.log = state.log;

    // 打烊
    if (now >= s.endsAt) {
        s.phase = 'over';
        s.log = [...s.log, `${fmt(s.endsAt - s.startedAt)} 打烊，收工结算`];
        return s;
    }

    // 糊串标死（只标记，不删，玩家要能看到）
    s.skewers = s.skewers.map((k) => {
        if (k.dead || k.slot < 0) return k;
        if (skewerState(k, now) === 'burnt') {
            if (!k.dead) s.burnt += 1;
            return { ...k, dead: true };
        }
        return k;
    });

    // 客人等太久走人
    s.orders = s.orders.map((o) => {
        if (o.status !== 'waiting') return o;
        if (now - o.bornAt > o.patience) {
            s.missed += 1;
            return { ...o, status: 'left' };
        }
        return o;
    });

    // 新客人
    const waiting = s.orders.filter((o) => o.status === 'waiting').length;
    if (now >= s.nextGuestAt && waiting < MAX_GUESTS) {
        const meat = pickOne(['meat-beef', 'meat-lamb', 'meat-wing', 'meat-pork'], rand);
        const veg = pickOne(['veg-pepper', 'veg-onion', 'veg-bean', 'veg-mushroom'], rand);
        const spicy = (Math.floor(rand() * 3) as Spicy);
        s.orders = [...s.orders, {
            id: s.seq++,
            guest: Math.floor(rand() * 4),
            meat, veg, spicy,
            bornAt: now,
            patience: 22000 + Math.floor(rand() * 8000),
            status: 'waiting',
        }];
        s.nextGuestAt = now + 8500 + Math.floor(rand() * 3000);
    }

    // 对手干活
    s.rival = tickRival(s.rival, now, rand);

    // 台词过期清空
    if (s.toast && now - s.toast.at > 1600) s.toast = null;

    return s;
}

/** 对手：按固定节奏出一单，会被 debuff 拖慢或做废 */
function tickRival(r: Rival, now: number, rand: () => number): Rival {
    const n = { ...r };
    if (now < n.frozenUntil) return n;
    if (now - n.taskStartedAt < n.taskMs) return n;

    // 这一单结算
    const base = 18;
    let gain = base;
    let bad = n.forceBad;
    let burn = n.forceBurn;
    if (burn || rand() < 0.08) {
        n.burned += 1;
        gain = 0;
        n.line = pickOne(['……这条不算', '火太大了', '你别看这条'], rand);
        n.lineAt = now;
    } else {
        if (now < n.lureUntil) gain = Math.floor(gain * 0.5);
        if (bad) gain = Math.floor(gain * 0.4);
        n.money += gain;
        n.served += 1;
        if (!bad && now >= n.lureUntil) n.perfect += 1;
        if (bad) {
            n.line = pickOne(['今天这盐不对劲', '谁动我调料了'], rand);
            n.lineAt = now;
        }
    }
    n.forceBad = false;
    n.forceBurn = false;
    n.taskStartedAt = now;
    n.taskMs = 9500 + Math.floor(rand() * 3500);
    return n;
}

// ---------------------------------------------------------------- 玩家操作

/** 点食材：填进备料槽，三样齐了自动成串 */
export function pickFood(state: BbqState, kind: 'meat' | 'veg', id: string, now: number): BbqState {
    if (state.phase === 'over') return state;
    const pick: Pick = { ...state.pick, [kind]: id };
    if (!pick.meat || !pick.veg || pick.spicy === undefined) {
        return { ...state, pick, now };
    }
    // 三样齐了 → 成串
    if (state.skewers.filter((k) => k.slot < 0).length >= WAIT_CAP) {
        return { ...state, now, toast: { text: '待烤区满了，先上炉', at: now, kind: 'bad' } };
    }
    return makeSkewer({ ...state, pick }, now);
}

export function pickSpicy(state: BbqState, spicy: Spicy, now: number): BbqState {
    if (state.phase === 'over') return state;
    const pick: Pick = { ...state.pick, spicy };
    if (!pick.meat || !pick.veg) return { ...state, pick, now };
    if (state.skewers.filter((k) => k.slot < 0).length >= WAIT_CAP) {
        return { ...state, now, toast: { text: '待烤区满了，先上炉', at: now, kind: 'bad' } };
    }
    return makeSkewer({ ...state, pick }, now);
}

/** 成串：找一张匹配的订单（没匹配就是给空气做的，仍然能烤，上菜时没人要） */
function makeSkewer(state: BbqState, now: number): BbqState {
    const { meat, veg, spicy } = state.pick as Required<Pick>;
    const order = state.orders.find(
        (o) => o.status === 'waiting' && o.meat === meat && o.veg === veg && o.spicy === spicy,
    );
    const cursed = state.curseNext;
    const k: Skewer = {
        id: state.seq++,
        orderId: order ? order.id : -1,
        meat, veg, spicy,
        slot: -1,
        placedAt: 0,
        flippedAt: 0,
        dead: false,
        cursed,
    };
    return {
        ...state,
        now,
        pick: {},
        skewers: [...state.skewers, k],
        curseNext: false,
        toast: order
            ? null
            : { text: '这单没人要，先别做', at: now, kind: 'bad' },
    };
}

/** 上炉：放到第一个空炉位 */
export function placeOnGrill(state: BbqState, skewerId: number, now: number): BbqState {
    if (state.phase === 'over') return state;
    const idx = state.slots.findIndex((x) => x === null);
    if (idx < 0) return { ...state, now, toast: { text: '炉子满了', at: now, kind: 'bad' } };
    const slots = [...state.slots];
    slots[idx] = skewerId;
    return {
        ...state,
        now,
        slots,
        skewers: state.skewers.map((k) => (k.id === skewerId ? { ...k, slot: idx, placedAt: now } : k)),
    };
}

/** 翻面 */
export function flip(state: BbqState, skewerId: number, now: number): BbqState {
    const k = state.skewers.find((x) => x.id === skewerId);
    if (!k) return state;
    if (!canFlip(k, now)) {
        return { ...state, now, toast: { text: '现在翻不了，再等等', at: now, kind: 'bad' } };
    }
    return {
        ...state,
        now,
        skewers: state.skewers.map((x) => (x.id === skewerId ? { ...x, flippedAt: now } : x)),
    };
}

/** 上菜：熟了给钱，夹生给一半 */
export function serve(state: BbqState, skewerId: number, now: number): BbqState {
    if (state.phase === 'over') return state;
    const k = state.skewers.find((x) => x.id === skewerId);
    if (!k) return state;
    if (k.dead) return { ...state, now, toast: { text: '糊了，只能扔', at: now, kind: 'bad' } };
    if (!canServe(k, now)) return { ...state, now, toast: { text: '还没熟', at: now, kind: 'bad' } };

    const st = skewerState(k, now);
    const order = state.orders.find((o) => o.id === k.orderId && o.status === 'waiting');
    const price = priceOf(k.meat, k.veg, k.spicy);
    const perfect = st === 'done';

    let gain = 0;
    if (order) gain = perfect ? price : Math.floor(price * 0.5);

    const slots = [...state.slots];
    if (k.slot >= 0) slots[k.slot] = null;

    return {
        ...state,
        now,
        slots,
        skewers: state.skewers.filter((x) => x.id !== skewerId),
        money: state.money + gain,
        served: state.served + (order ? 1 : 0),
        perfect: state.perfect + (order && perfect ? 1 : 0),
        energy: Math.min(5, state.energy + (order && perfect ? 1 : 0)),
        orders: state.orders.map((o) =>
            o.id === k.orderId && o.status === 'waiting'
                ? { ...o, status: 'served' as const, paid: gain }
                : o,
        ),
        log: [...state.log,
            order
                ? `${fmt(now - state.startedAt)} ${foodName(k)} ${perfect ? '上菜 +¥' + gain : '夹生 +¥' + gain}`
                : `${fmt(now - state.startedAt)} 一串没人要的，只能自己吃`,
        ],
        toast: order
            ? { text: perfect ? `+¥${gain}` : `夹生 +¥${gain}`, at: now, kind: perfect ? 'good' : 'bad' }
            : { text: '这串没客人要', at: now, kind: 'bad' },
    };
}

/** 扔掉（糊了/做错的） */
export function discard(state: BbqState, skewerId: number, now: number): BbqState {
    const k = state.skewers.find((x) => x.id === skewerId);
    if (!k) return state;
    const slots = [...state.slots];
    if (k.slot >= 0) slots[k.slot] = null;
    return {
        ...state,
        now,
        slots,
        skewers: state.skewers.filter((x) => x.id !== skewerId),
        toast: { text: '扔了', at: now, kind: 'info' },
    };
}

/** 用道具：能量够就丢出去，对手立刻有反应 */
export function useItem(state: BbqState, id: ItemId, now: number): BbqState {
    if (state.phase === 'over') return state;
    const item = itemOf(id);
    if (state.energy < item.cost) {
        return { ...state, now, toast: { text: '能量不够，多做几单', at: now, kind: 'bad' } };
    }
    const r = { ...state.rival, line: item.taunt, lineAt: now };
    switch (id) {
        case 'horn': r.lureUntil = now + 10000; break;
        case 'water': r.frozenUntil = now + 6000; r.taskStartedAt = r.taskStartedAt - 6000; break;
        case 'fan': r.forceBurn = true; break;
        case 'salt': r.forceBad = true; break;
        case 'raid': r.frozenUntil = now + 8000; r.taskStartedAt = r.taskStartedAt - 8000; break;
    }
    return {
        ...state,
        now,
        energy: state.energy - item.cost,
        rival: r,
        log: [...state.log, `${fmt(now - state.startedAt)} 你丢了个${item.name}，${r.name}：${item.taunt}`],
        toast: { text: `${item.icon} ${item.name}`, at: now, kind: 'good' },
    };
}

const foodName = (k: Skewer): string => {
    const M: Record<string, string> = { 'meat-beef': '牛肉', 'meat-lamb': '羊肉', 'meat-wing': '鸡翅', 'meat-pork': '五花' };
    return M[k.meat] || '肉串';
};

/** 剩余时间 */
export const remainMs = (s: BbqState) => Math.max(0, s.endsAt - s.now);

/** 结算摘要 */
export function summary(s: BbqState) {
    const win = s.money > s.rival.money;
    const diff = Math.abs(s.money - s.rival.money);
    return {
        win,
        draw: s.money === s.rival.money,
        diff,
        money: s.money,
        rivalMoney: s.rival.money,
        served: s.served,
        perfect: s.perfect,
        burnt: s.burnt,
        missed: s.missed,
        rivalServed: s.rival.served,
        rivalBurned: s.rival.burned,
        /** 一行副标题（战报卡用） */
        subtitle: s.money === s.rival.money
            ? `打平 · ¥${s.money} : ¥${s.rival.money}`
            : `${win ? '你赢' : `${s.rival.name} 赢`} ¥${diff} · ¥${s.money} : ¥${s.rival.money}`,
    };
}
