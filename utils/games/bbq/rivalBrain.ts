/**
 * 对手的脑子 —— 只负责「要不要捣乱、用什么、说句什么」。
 *
 * 一局只问 3 次（对应三张攻击牌），提前 15 秒预取，到点执行。
 * 超时/解析失败一律降级本地判断，绝不卡住游戏。
 *
 * 纯逻辑（拼 prompt、解析、兜底）与网络无关，便于单测；
 * 真正的请求由调用方用 callGameApi 发。
 */

import { ATTACK_COUNT, type ItemId } from './engine';

export interface AttackContext {
    rivalName: string;
    /** 角色人设（systemPrompt 前几十字） */
    persona?: string;
    /** 打到第几分钟了 */
    minute: number;
    /** 双方营业额 */
    myMoney: number;
    rivalMoney: number;
    /** 玩家这边：几位客人在等、炉子满没满、上了几单 */
    myWaiting: number;
    myGrillFull: boolean;
    myServed: number;
    rivalServed: number;
    /** 还有几次机会没用 */
    attacksLeft: number;
    /** 玩家已经砸过他哪些道具 */
    hitBy: string[];
    /** 你手上还剩哪些道具名 */
    myItems: string[];
}

/** 合法的攻击道具（不含「不用」） */
export const ATTACK_ITEMS: ItemId[] = ['horn', 'water', 'fan', 'salt', 'raid'];

const CN_ALIAS: Record<string, ItemId> = {
    喇叭: 'horn', 抢客: 'horn', 喊话: 'horn',
    泼水: 'water', 浇火: 'water', 浇水: 'water', 灭火: 'water',
    扇风: 'fan', 扇火: 'fan',
    撒盐: 'salt', 加盐: 'salt',
    城管: 'raid', 喊城管: 'raid', 举报: 'raid',
};

const ITEM_CN: Record<ItemId, string> = {
    horn: '喇叭（抢客，你客人心浮）',
    water: '泼水（浇灭你的火，6 秒不能烤）',
    fan: '扇风（你下一串火更旺，容易糊）',
    salt: '撒盐（你下一单差评，只给四成钱）',
    raid: '喊城管（你 8 秒不能动手）',
};

export function buildAttackPrompt(ctx: AttackContext): { system: string; user: string } {
    const lead = ctx.rivalMoney - ctx.myMoney;
    const system = [
        `你在夜市摆烧烤摊，跟用户是对门的两家，正在比五分钟谁卖得多。你是「${ctx.rivalName}」。`,
        ctx.persona ? `你的人设：${ctx.persona}` : '',
        '',
        '你手上有几张「捣乱牌」，一局只能打三次，打出去能让对面难受一小会儿：',
        ...ATTACK_ITEMS.map((id) => `- ${id}：${ITEM_CN[id]}`),
        '',
        '现在要决定：这一张牌打不打、打哪张、顺口说句什么。',
        '规则：',
        '1. 你只能输出一行，格式是「道具id|台词」，例如：fan|火太旺了吧，我帮你扇扇',
        '2. 也可以选择不出手，输出：no|台词（这句台词是你在观望时说的话）',
        '3. 台词要像夜市摊主随口说的，15 字以内，可以嘴硬、可以阴阳，不要旁白、不要引号',
        '4. 要按局面挑牌：对面炉子满了用扇风最阴；对面客人多、在等的时候用喇叭最伤；',
        '   对面正忙不过来就用泼水或城管；对面马上要赢，就挑最能拖慢他的',
        '5. 别每次都用同一张牌，也别把三次用完——后面还要留着',
    ].filter(Boolean).join('\n');

    const user = [
        `现在是第 ${ctx.minute} 分钟（一局五分钟）。`,
        `营业额：你 ¥${ctx.rivalMoney}，对面 ¥${ctx.myMoney}，${lead > 0 ? `你领先 ¥${lead}` : lead < 0 ? `你落后 ¥${-lead}` : '打平'}。`,
        `对面摊上：${ctx.myWaiting} 位客人正在等${ctx.myGrillFull ? '，四个炉位全满' : ''}，已经上了 ${ctx.myServed} 单。`,
        `你自己：上了 ${ctx.rivalServed} 单。`,
        `你还剩 ${ctx.attacksLeft} 次捣乱机会（总共 ${ATTACK_COUNT} 次）。`,
        ctx.hitBy.length ? `对面已经砸过你：${ctx.hitBy.join('、')}。` : '对面还没动过手。',
        ctx.myItems.length ? `对面手上还有：${ctx.myItems.join('、')}。` : '',
        '',
        '这一张，打不打？',
    ].filter(Boolean).join('\n');

    return { system, user };
}

/** 解析模型回包；解析不出来返回 null，交给本地兜底 */
export function parseAttackReply(
    text: string,
    attacksLeft: number,
): { use: boolean; item: ItemId | null; line: string } | null {
    if (!text) return null;

    // 模型爱多写解释：只取第一行，再砍掉两个空格之后的内容
    const firstLine = text.split(/\r?\n/).map((x) => x.trim()).filter(Boolean)[0] || '';
    const first = firstLine.split(/\s{2,}/)[0].trim();
    const m = first.match(/([a-zA-Z\u4e00-\u9fa5]+)\s*[|｜:：]\s*(.*)$/);
    if (!m) return null;

    const head = m[1].trim().toLowerCase();
    let line = m[2].replace(/^[「『“"']+|[」』”"']+$/g, '').trim();
    if (line.length > 40) line = line.slice(0, 40);

    if (head === 'no' || head === '不用' || head === 'none' || head === '不') {
        return { use: false, item: null, line: line || '先看看' };
    }
    if (attacksLeft <= 0) return null;

    const id = (ATTACK_ITEMS as string[]).includes(head)
        ? (head as ItemId)
        : CN_ALIAS[head] ?? CN_ALIAS[head.slice(0, 2)];
    if (!id) return null;

    return { use: true, item: id, line: line || '' };
}

/** 本地兜底台词 */
const LOCAL_LINES = [
    '今天不跟你客气了',
    '你这火候，我看不下去了',
    '隔壁都没人了，你还烤呢',
    '让你也忙一忙',
    '别怪我啊，做生意嘛',
];

const LOCAL_REFUSE = [
    '这波我先看看',
    '先让你烤两条',
    '不急，留着',
];

/**
 * 模型没回应时的本地决定：六成出手，四成观望。
 * 挑牌有偏好（炉子满 → 扇风；客人多 → 喇叭），但会带随机，别让人觉得机械。
 */
export function localDecide(
    ctx: AttackContext,
    rand: () => number = Math.random,
): { use: boolean; item: ItemId | null; line: string } {
    const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length) % arr.length];

    if (ctx.attacksLeft <= 0) return { use: false, item: null, line: pick(LOCAL_REFUSE) };
    // 落后才更想动手；领先时惜牌
    const behind = ctx.myMoney - ctx.rivalMoney;
    const eager = behind > 0 ? 0.72 : 0.45;
    if (rand() > eager) {
        return { use: false, item: null, line: pick(LOCAL_REFUSE) };
    }

    const pool: ItemId[] = [];
    if (ctx.myGrillFull) pool.push('fan', 'fan', 'salt');
    if (ctx.myWaiting >= 2) pool.push('horn', 'horn', 'raid');
    if (behind > 40) pool.push('water', 'raid', 'salt');
    if (!pool.length) pool.push('water', 'salt', 'fan');

    return { use: true, item: pick(pool), line: pick(LOCAL_LINES) };
}
