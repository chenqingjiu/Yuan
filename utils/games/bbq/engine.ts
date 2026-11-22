/**
 * 夜市烧烤对决 —— 纯逻辑（不碰 DOM、不碰网络，全部可单测）。
 *
 * 一局的流程：客人来 → 点肉/菜/辣度自动成串 → 上炉 → 半熟时翻面 → 熟时上菜 → 收钱。
 * 4 个炉位并行，一局 4 分钟打烊，比营业额。
 *
 * 对手：自己按节奏出单（本地规则算，不花 token），但有 3 次捣乱机会，
 * 什么时候用、用什么、说句什么，由外部（rivalBrain）决定后调 applyRivalAttack 落地。
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
export const ROUND_MS = 4 * 60 * 1000;
/** 一局多少分钟，给文案用（避免各处再写一遍「五分钟」） */
export const ROUND_MIN = ROUND_MS / 60000;
/** 顾客耐心：30 秒。不跟着局时一起缩 */
export const PATIENCE_MS = 30000;
/** 没有上菜时的兜底来客间隔 */
const GUEST_GAP_MIN = 6000;
const GUEST_GAP_MAX = 9000;
/** 上完一单，隔多久下一位到 */
const SERVE_GAP_MIN = 3000;
const SERVE_GAP_MAX = 8000;
/** 对手一局的捣乱次数 */
export const ATTACK_COUNT = 3;
/** 被砸一次，下一次攻击提前多少 */
const ATTACK_HURRY_MS = 15000;
/**
 * 三张牌分别落在局时的 17% / 53% / 83% 附近。
 * 必须按比例算，不能写死秒数——原来写的是 50/160/248 秒，
 * 局时改成 4 分钟后第三张 248 秒已经超过 240 秒，永远打不出来。
 */
const ATTACK_AT = [0.167, 0.533, 0.827];
const ATTACK_JITTER = [0.04, 0.05, 0.04];

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
    /** 被对手扇风，这条烤得更快，半熟窗口只有 1.2 秒 */
    cursed?: boolean;
}

/** 一句话的时间轴条目：战报按这个渲染 */
export interface BbqEvent {
    /** 绝对时间戳 */
    at: number;
    actor: 'you' | 'rival';
    kind: 'serve' | 'burn' | 'item' | 'waste' | 'miss';
    /** 正文，不含名字和时间 */
    text: string;
    money?: number;
}

export interface RivalDish {
    meat: string;
    veg: string;
    spicy: Spicy;
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
    /** 正在烤的这单内容（战报里要写清楚他烤了什么） */
    dish: RivalDish;
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
    /** 三次捣乱机会的绝对时刻（会被你砸他的次数往前拽） */
    attackSlots: number[];
    /** 已经用掉几次 */
    attacksUsed: number;
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
    /** 你这一局已经丢出去几次道具（和对手一样，最多 3 次） */
    itemUses: number;
    seq: number;
    nextGuestAt: number;
    rival: Rival;
    /** 双时间轴事件（你我混在一起，按 at 排序） */
    events: BbqEvent[];
    /** 玩家被打的负面状态：下一串必糊 */
    curseNext: boolean;
    /** 玩家被打的负面状态：下一单差评 */
    badNext: boolean;
    /** 玩家炭火被浇灭到此刻，这之前不能上炉 */
    dousedUntil: number;
    /** 玩家被城管赶走到此刻，这之前什么都不能做 */
    raidUntil: number;
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
    /** 打到你身上时，你看到的描述 */
    hit: string;
}[] = [
    { id: 'horn', name: '喇叭', icon: '📢', cost: 1, desc: '循环喊“隔壁更便宜”，抢客 10 秒', taunt: '谁在我门口放这个…', hit: '拿喇叭喊“隔壁更便宜”，你的客人开始坐不住' },
    { id: 'water', name: '泼水', icon: '🪣', cost: 2, desc: '浇灭他的炭火，6 秒不能烤', taunt: '我的火！', hit: '一盆水浇上来，你的炭火灭了' },
    { id: 'fan', name: '扇风', icon: '🍃', cost: 1, desc: '把他的火扇旺，下一串必糊', taunt: '这火怎么压不住', hit: '拿扇子把你的火扇旺了' },
    { id: 'salt', name: '撒盐', icon: '🧂', cost: 1, desc: '他下一单必定差评', taunt: '今天盐怎么这么咸', hit: '往你的调料里又撒了一把盐' },
    { id: 'raid', name: '喊城管', icon: '🚨', cost: 3, desc: '他被赶走，8 秒不能出摊', taunt: '又是你叫的吧', hit: '把城管喊来了，你只能先躲一躲' },
];

export const itemOf = (id: ItemId) => ITEMS.find((i) => i.id === id)!;

/** 单串价格：肉 12 + 菜 4 + 辣度 0/2/4 */
export const priceOf = (meat: string, veg: string, spicy: Spicy): number =>
    12 + (veg ? 4 : 0) + spicy * 2;

const MEAT_NAME: Record<string, string> = {
    'meat-beef': '牛肉', 'meat-lamb': '羊肉', 'meat-wing': '鸡翅', 'meat-pork': '五花',
};
const VEG_NAME: Record<string, string> = {
    'veg-pepper': '青椒', 'veg-onion': '洋葱', 'veg-bean': '豆角', 'veg-mushroom': '香菇',
};
const MEATS = ['meat-beef', 'meat-lamb', 'meat-wing', 'meat-pork'];
const VEGS = ['veg-pepper', 'veg-onion', 'veg-bean', 'veg-mushroom'];

export const meatName = (id: string) => MEAT_NAME[id] || '肉串';
export const vegName = (id: string) => VEG_NAME[id] || '配菜';

const pickOne = <T,>(arr: T[], rand: () => number): T => arr[Math.floor(rand() * arr.length) % arr.length];

export const fmt = (ms: number) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

const makeDish = (rand: () => number): RivalDish => ({
    meat: pickOne(MEATS, rand),
    veg: pickOne(VEGS, rand),
    spicy: (Math.floor(rand() * 3) as Spicy),
});

/** 对手下一次准备动手的时刻（0 表示没机会了） */
export const nextAttackAt = (r: Rival): number => r.attackSlots[r.attacksUsed] ?? 0;
/** 对手还剩几次捣乱 */
export const attacksLeft = (r: Rival): number => Math.max(0, ATTACK_COUNT - r.attacksUsed);

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
        itemUses: 0,
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
            dish: makeDish(rand),
            frozenUntil: 0,
            lureUntil: 0,
            forceBurn: false,
            forceBad: false,
            line: '今晚这街归我',
            lineAt: opts.now,
            attackSlots: ATTACK_AT.map((p, i) =>
                opts.now + Math.floor(ROUND_MS * (p + rand() * ATTACK_JITTER[i])),
            ),
            attacksUsed: 0,
        },
        events: [],
        curseNext: false,
        badNext: false,
        dousedUntil: 0,
        raidUntil: 0,
        toast: null,
    };
}

// ---------------------------------------------------------------- 烤制判定

/** 被扇风的那串火更旺，一个阶段只有 1.2 秒 */
const stageOf = (s: Skewer) => (s.cursed ? Math.round(STAGE_MS * 0.6) : STAGE_MS);

/** 这串当前是什么状态 */
export function skewerState(s: Skewer, now: number): SkewerState {
    if (s.dead) return 'burnt';
    if (s.slot < 0 || !s.placedAt) return 'raw';
    const st = stageOf(s);
    if (!s.flippedAt) {
        const t = now - s.placedAt;
        if (t < st) return 'raw';
        if (t < st * 2) return 'half';
        return 'burnt';
    }
    const t = now - s.flippedAt;
    if (t < st) return 'half';
    if (t < st * 2) return 'done';
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
    return Math.max(0, Math.min(1, t / (stageOf(s) * 2)));
}

// ---------------------------------------------------------------- 状态推进

/** 时间推进：生成客人、把烤糊的串标死、超时的客人赶走、对手出一单 */
export function tick(state: BbqState, now: number, rand: () => number = Math.random): BbqState {
    if (state.phase === 'over') return state;
    const s: BbqState = { ...state, now, orders: [...state.orders], skewers: [...state.skewers] };

    // 打烊
    if (now >= s.endsAt) {
        s.phase = 'over';
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
            s.events = [...s.events, {
                at: now, actor: 'you', kind: 'miss',
                text: `一位客人等不及走了（${meatName(o.meat)} ${vegName(o.veg)}）`,
            }];
            return { ...o, status: 'left' };
        }
        return o;
    });

    // 新客人
    const waiting = s.orders.filter((o) => o.status === 'waiting').length;
    if (now >= s.nextGuestAt && waiting < MAX_GUESTS) {
        const meat = pickOne(MEATS, rand);
        const veg = pickOne(VEGS, rand);
        const spicy = (Math.floor(rand() * 3) as Spicy);
        s.orders = [...s.orders, {
            id: s.seq++,
            guest: Math.floor(rand() * 4),
            meat, veg, spicy,
            bornAt: now,
            patience: PATIENCE_MS,
            status: 'waiting',
        }];
        s.nextGuestAt = now + GUEST_GAP_MIN + Math.floor(rand() * (GUEST_GAP_MAX - GUEST_GAP_MIN));
    }

    // 对手干活
    const r = tickRival(s.rival, now, rand);
    s.rival = r.rival;
    if (r.events.length) s.events = [...s.events, ...r.events];

    // toast 过期
    if (s.toast && now - s.toast.at > 1600) s.toast = null;

    return s;
}

/** 对手：按固定节奏出一单，会被 debuff 拖慢或做废 */
function tickRival(r: Rival, now: number, rand: () => number): { rival: Rival; events: BbqEvent[] } {
    const n = { ...r };
    const events: BbqEvent[] = [];
    if (now < n.frozenUntil) return { rival: n, events };
    if (now - n.taskStartedAt < n.taskMs) return { rival: n, events };

    // 这一单结算
    const base = 18;
    let gain = base;
    const bad = n.forceBad;
    const burn = n.forceBurn;
    const dish = n.dish;
    const label = `${meatName(dish.meat)}${vegName(dish.veg)}`;

    if (burn || rand() < 0.08) {
        n.burned += 1;
        gain = 0;
        n.line = pickOne(['……这条不算', '火太大了', '你别看这条'], rand);
        n.lineAt = now;
        events.push({ at: now, actor: 'rival', kind: 'burn', text: `${label} 糊了，扔了` });
    } else {
        if (now < n.lureUntil) gain = Math.floor(gain * 0.5);
        if (bad) gain = Math.floor(gain * 0.4);
        n.money += gain;
        n.served += 1;
        if (!bad && now >= n.lureUntil) n.perfect += 1;
        events.push({
            at: now, actor: 'rival', kind: 'serve',
            text: `${label}${bad ? '（差评）' : ''} 上菜`, money: gain,
        });
        if (bad) {
            n.line = pickOne(['今天这盐不对劲', '谁动我调料了'], rand);
            n.lineAt = now;
        }
    }
    n.forceBad = false;
    n.forceBurn = false;
    n.dish = makeDish(rand);
    n.taskStartedAt = now;
    n.taskMs = 9500 + Math.floor(rand() * 3500);
    return { rival: n, events };
}

// ---------------------------------------------------------------- 玩家操作

/** 被城管赶走时，什么都做不了 */
const blocked = (s: BbqState, now: number): BbqState | null =>
    now < s.raidUntil
        ? { ...s, now, toast: { text: `城管还在，${Math.ceil((s.raidUntil - now) / 1000)} 秒`, at: now, kind: 'bad' } }
        : null;

/** 点食材：填进备料槽，三样齐了自动成串 */
export function pickFood(state: BbqState, kind: 'meat' | 'veg', id: string, now: number): BbqState {
    if (state.phase === 'over') return state;
    const stop = blocked(state, now);
    if (stop) return stop;
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
    const stop = blocked(state, now);
    if (stop) return stop;
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
            ? cursed
                ? { text: '这串火被人扇旺了，烤快点', at: now, kind: 'bad' }
                : null
            : { text: '这单没人要，先别做', at: now, kind: 'bad' },
    };
}

/** 上炉：放到第一个空炉位 */
export function placeOnGrill(state: BbqState, skewerId: number, now: number): BbqState {
    if (state.phase === 'over') return state;
    const stop = blocked(state, now);
    if (stop) return stop;
    if (now < state.dousedUntil) {
        return {
            ...state, now,
            toast: { text: `火灭了，${Math.ceil((state.dousedUntil - now) / 1000)} 秒`, at: now, kind: 'bad' },
        };
    }
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
    const stop = blocked(state, now);
    if (stop) return stop;
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

/** 上菜：熟了给钱，夹生给一半；被撒盐的那一单要倒赔 */
export function serve(state: BbqState, skewerId: number, now: number, rand: () => number = Math.random): BbqState {
    if (state.phase === 'over') return state;
    const stop = blocked(state, now);
    if (stop) return stop;
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
    const salty = !!order && state.badNext;
    if (salty) {
        // 撒盐不是打折，是倒赔：这一单白干，还要赔掉半价（至少 5 块）。
        // 只有真的疼，捣乱牌才有意义。
        gain = -Math.max(5, Math.floor(price * 0.5));
    }

    const slots = [...state.slots];
    if (k.slot >= 0) slots[k.slot] = null;

    const label = `${meatName(k.meat)}${vegName(k.veg)}`;
    const event: BbqEvent = order
        ? {
            at: now, actor: 'you', kind: 'serve',
            text: `${label}${salty ? '（被撒盐·赔钱）' : perfect ? ' 上菜' : ' 夹生'}`,
            money: gain,
        }
        : { at: now, actor: 'you', kind: 'waste', text: `${label} 没人要，自己吃了` };

    return {
        ...state,
        now,
        slots,
        skewers: state.skewers.filter((x) => x.id !== skewerId),
        money: Math.max(0, state.money + gain),
        nextGuestAt: order
            ? Math.min(state.nextGuestAt, now + SERVE_GAP_MIN + Math.floor(rand() * (SERVE_GAP_MAX - SERVE_GAP_MIN)))
            : state.nextGuestAt,
        served: state.served + (order ? 1 : 0),
        perfect: state.perfect + (order && perfect && !salty ? 1 : 0),
        energy: Math.min(5, state.energy + (order && perfect && !salty ? 1 : 0)),
        badNext: salty ? false : state.badNext,
        orders: state.orders.map((o) =>
            o.id === k.orderId && o.status === 'waiting'
                ? { ...o, status: 'served' as const, paid: gain }
                : o,
        ),
        events: [...state.events, event],
        toast: order
            ? { text: salty ? `差评 -¥${-gain}` : perfect ? `+¥${gain}` : `夹生 +¥${gain}`, at: now, kind: perfect && !salty ? 'good' : 'bad' }
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

/** 用道具：能量够、次数还没用完才丢得出去；砸得他越狠，他还手越早 */
export function useItem(state: BbqState, id: ItemId, now: number): BbqState {
    if (state.phase === 'over') return state;
    const stop = blocked(state, now);
    if (stop) return stop;
    const item = itemOf(id);
    if (state.itemUses >= ATTACK_COUNT) {
        return { ...state, now, toast: { text: `这一局的 ${ATTACK_COUNT} 次都用完了`, at: now, kind: 'bad' } };
    }
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
    // 你砸他一次，他下一次动手提前 15 秒（但至少留 8 秒喘息）
    const slots = [...r.attackSlots];
    if (r.attacksUsed < slots.length) {
        slots[r.attacksUsed] = Math.max(now + 8000, slots[r.attacksUsed] - ATTACK_HURRY_MS);
    }
    r.attackSlots = slots;
    return {
        ...state,
        now,
        energy: state.energy - item.cost,
        itemUses: state.itemUses + 1,
        rival: r,
        events: [...state.events, {
            at: now, actor: 'you', kind: 'item',
            text: `${item.name} → ${r.name}：${item.taunt}`,
        }],
        toast: { text: `${item.icon} ${item.name}`, at: now, kind: 'good' },
    };
}

// ---------------------------------------------------------------- 对手还手

export interface RivalAttack {
    item: ItemId;
    /** 他当场说的那句话（模型生成或本地兜底） */
    line: string;
}

/**
 * 对手的捣乱落地。由外部决定「用不用、用什么、说什么」，
 * 这里只负责生效 + 记账，保持纯函数。
 */
export function applyRivalAttack(state: BbqState, attack: RivalAttack, now: number): BbqState {
    if (state.phase === 'over') return state;
    if (state.rival.attacksUsed >= ATTACK_COUNT) return state;

    const item = itemOf(attack.item);
    const r: Rival = {
        ...state.rival,
        attacksUsed: state.rival.attacksUsed + 1,
        line: attack.line || item.taunt,
        lineAt: now,
    };

    let next: BbqState = { ...state, now, rival: r };
    switch (attack.item) {
        case 'horn':
            // 客人心浮了，耐心直接少 10 秒
            next = {
                ...next,
                orders: next.orders.map((o) =>
                    o.status === 'waiting' ? { ...o, patience: o.patience - 10000 } : o,
                ),
            };
            break;
        case 'water':
            next = { ...next, dousedUntil: now + 6000 };
            break;
        case 'fan':
            next = { ...next, curseNext: true };
            break;
        case 'salt':
            next = { ...next, badNext: true };
            break;
        case 'raid':
            next = { ...next, raidUntil: now + 8000 };
            break;
    }

    return {
        ...next,
        events: [...next.events, {
            at: now, actor: 'rival', kind: 'item',
            text: `${item.name} → ${attack.line || item.taunt}`,
        }],
        toast: { text: `${item.icon} ${item.hit}`, at: now, kind: 'bad' },
    };
}

/**
 * 对手这次选择不出手：记一笔「收了手」，机会照样算用掉。
 * 允许他惜牌，但不能无限拖着不打。
 */
export function skipRivalAttack(state: BbqState, line: string, now: number): BbqState {
    if (state.phase === 'over') return state;
    if (state.rival.attacksUsed >= ATTACK_COUNT) return state;
    return {
        ...state,
        now,
        rival: {
            ...state.rival,
            attacksUsed: state.rival.attacksUsed + 1,
            line: line || '先不动他',
            lineAt: now,
        },
        events: [...state.events, {
            at: now, actor: 'rival', kind: 'item',
            text: `手停在半空，又放下了${line ? ` —— ${line}` : ''}`,
        }],
    };
}

/** 剩余时间 */
export const remainMs = (s: BbqState) => Math.max(0, s.endsAt - s.now);

/** 战报时间轴（已排好序，带 00:23 这种相对时间） */
export function timeline(s: BbqState) {
    return s.events
        .slice()
        .sort((a, b) => a.at - b.at)
        .map((e) => ({
            time: fmt(e.at - s.startedAt),
            who: e.actor === 'you' ? '你' : s.rival.name,
            text: e.text,
            money: e.money,
            kind: e.kind,
        }));
}

/** 纯文本时间轴（转发到私聊用） */
export function timelineText(s: BbqState): string {
    return timeline(s)
        .map((l) => `${l.time} ${l.who} ${l.text}${l.money != null ? ` +¥${l.money}` : ''}`)
        .join('\n');
}

/** 结算摘要 */
export function summary(s: BbqState) {
    const win = s.money > s.rival.money;
    const diff = Math.abs(s.money - s.rival.money);
    const you = `你 ¥${s.money}`;
    const him = `${s.rival.name} ¥${s.rival.money}`;
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
        rivalAttacks: s.rival.attacksUsed,
        /** 一行副标题（战报卡用） */
        subtitle: s.money === s.rival.money
            ? `打平 · ${you} : ${him}`
            : `${win ? '你赢' : `${s.rival.name} 赢`} ¥${diff} · ${you} : ${him}`,
    };
}
