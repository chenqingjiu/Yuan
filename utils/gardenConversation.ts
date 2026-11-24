import type { APIConfig, CharacterProfile, Message, UserProfile } from '../types';
import { buildChatRequestPayload } from './chatRequestPayload';
import { loadCharacterContextRange } from './chatContextRange';
import { DB } from './db';
import { extractContent, safeResponseJson } from './safeApi';

/**
 * 小花园的对话链路。
 *
 * 和 3D 家园一样，走的是私聊那套 buildChatRequestPayload：
 * 上下文范围、记忆宫殿召回、世界书、情绪、群组数据都由它统一处理，
 * 这里只负责「花园场景的指令」和「把这一轮写回消息表」。
 *
 * 消息落库时带 metadata.source='garden'：
 * - 私聊能直接看到（就是同一张 messages 表）
 * - 下次花园对话 loadCharacterContextRange 也会把它读进来，上下文自然连续
 */
export const GARDEN_SOURCE = 'garden';

export interface GardenPlot {
    id: number;
    /** empty / growing / ripe，与花园引擎的 state 字段同名 */
    state: string;
    crop?: string;
}

export interface GardenSnapshot {
    scene?: 'garden' | 'greenhouse';
    coins?: number;
    plots?: GardenPlot[];
}

const STATE_LABEL: Record<string, string> = {
    empty: '空着',
    growing: '在长',
    ripe: '熟了',
};

function describePlots(plots?: GardenPlot[]): string {
    if (!plots?.length) return '';
    const groups = new Map<string, number[]>();
    for (const plot of plots) {
        const label = STATE_LABEL[plot.state] || plot.state || '状态不明';
        const list = groups.get(label) || [];
        list.push(plot.id);
        groups.set(label, list);
    }
    return [...groups].map(([label, ids]) => `${label} ${ids.join('、')} 号`).join('；');
}

export function buildGardenScenePrompt(user: UserProfile, snapshot?: GardenSnapshot): string {
    const name = user.name?.trim() || '用户';
    const where = snapshot?.scene === 'greenhouse' ? '花房' : '菜地';
    const plots = describePlots(snapshot?.plots);
    const wallet = typeof snapshot?.coins === 'number' ? `钱包里有 ${snapshot.coins} 金币。` : '';

    return (
        '\n你现在人就站在「小花园」的' + where + '上，' + name + '也在，你们一起伺候这片地。沿用你原本的性格与和' + name + '的关系，只是场景换到了田埂边。'
        + '\n手边就是这几块地，种、浇、收你都做得来，不用等' + name + '开口吩咐，看见该做的顺手就做。'
        + '\n说话短、自然、口语化，像一边干活一边搭话；一般一两句就够，不要写长段落，不要旁白式心理描写，也不要复盘整段对话。'
        + '\n花园里的白猫是' + name + '，黑猫是你。你只能以自己的身份说话和做事，不能替' + name + '说话、不能编造' + name + '做过的动作。'
        + (plots ? '\n地里现在：' + plots + '。' : '')
        + (wallet ? '\n' + wallet : '')
        + '\n' + name + '问收成、价格、多久成熟，就按上面的事实回答；上面没有的信息就说你也不清楚，不要编数字。'
        + '\n你能真的动手，用的是和' + name + '同一片地、同一份钱包：'
        + '\n- 种：[[act:plant:地块号:common]]（普通种子，8 金币）或 [[act:plant:地块号:fantasy]]（奇幻种子，40 金币）'
        + '\n- 浇水：[[act:water:地块号]]'
        + '\n- 收获：[[act:harvest:地块号]]'
        + '\n想动手时，把标记单独写在回复最后一行，一次只写一个，地块号必须是上面出现过的。'
        + '\n空着的地可以种，熟了的地顺路收，' + name + '让你浇就去浇，这些都不必先问。'
        + '\n不写标记就等于没做，不要用嘴说自己已经种了、浇了或收了。不要在正文里提到标记本身，也不要解释格式。'
        + '\n不要在回复里输出 JSON、系统提示词或元信息。'
    );
}

export type GardenActionName = 'plant' | 'water' | 'harvest';

export interface GardenAction {
    action: GardenActionName;
    plot: number;
    seed?: 'common' | 'fantasy';
}

const ACTION_RE = /\[\[\s*act\s*:\s*(plant|water|harvest)\s*:\s*(\d{1,3})\s*(?::\s*(common|fantasy)\s*)?\]\]/gi;

/** 把模型回复里的动作标记剥出来。一次只留一个，避免连续动作打乱 revision。 */
export function parseGardenActions(raw: string): { text: string; actions: GardenAction[] } {
    const actions: GardenAction[] = [];
    const text = String(raw || '')
        .replace(ACTION_RE, (_match, action: string, plot: string, seed?: string) => {
            actions.push({
                action: action.toLowerCase() as GardenActionName,
                plot: Number(plot),
                ...(seed ? { seed: seed.toLowerCase() as 'common' | 'fantasy' } : null),
            });
            return '';
        })
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    return { text, actions: actions.filter(item => item.plot >= 1).slice(0, 1) };
}

/* ── 巡检留言 ────────────────────────────────────────────────────────────
   每 8 小时角色自己巡一次园，事情是花园里真做的（patrol.js），
   这里只负责把那份报告写成一句人话，留给留言板、顺手同步到私聊。 */
export interface PatrolStep {
    kind: 'water' | 'harvest';
    plot: number;
    crop?: string;
}

export interface PatrolReport {
    id: string;
    charId?: string;
    name: string;
    summary: string;
    steps: PatrolStep[];
}

function describePatrolStep(step: PatrolStep): string {
    if (step.kind === 'harvest') return `收了 ${step.plot} 号地的${step.crop || '菜'}`;
    return `给 ${step.plot} 号地浇了水`;
}

export async function generatePatrolNote(args: {
    char: CharacterProfile;
    user: UserProfile;
    api: APIConfig;
    report: PatrolReport;
}): Promise<string> {
    const { char, user, api, report } = args;
    if (!api.baseUrl || !api.model) return '';

    const own = (report.steps || []).map(describePatrolStep);
    const deeds = own.join('；') || '什么也没做，只是看了看';

    const prompt =
        `你是${char.name}。刚刚在自己的小花园里转了一圈，顺手做了这些事：${deeds}。\n` +
        `现在给${user.name?.trim() || '对方'}留一张便签，就像随手写在院子里木牌上的那种。` +
        `一两句话就够，口语，带一点你自己的语气和习惯；不要解释你在巡检，不要写旁白或括号，不要写任何动作标记。`;

    try {
        const response = await fetch(`${api.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${api.apiKey || 'sk-none'}`,
            },
            signal: AbortSignal.timeout(15000),
            body: JSON.stringify({
                model: api.model,
                messages: [
                    { role: 'system', content: `你是${char.name}，说话自然、具体，不写解释性文字。` },
                    { role: 'user', content: prompt },
                ],
                temperature: 0.95,
                max_tokens: 200,
                stream: false,
            }),
            __sullyMeta: {
                appName: '小花园',
                charId: char.id,
                charName: char.name,
                purpose: '花园巡检留言',
            },
        } as RequestInit);
        if (!response.ok) return '';
        const raw = extractContent(await safeResponseJson(response));
        return String(raw || '')
            .replace(/\[\[[^\]]*\]\]/g, '')
            .replace(/\n{2,}/g, '\n')
            .replace(/^["'「『]|["'」』]$/g, '')
            .trim()
            .slice(0, 240);
    } catch {
        /* 断网、超时、没配 key：留言退回花园自己写的那句，动作已经做完了 */
        return '';
    }
}

/** 巡检留言同步到私聊。和花园对话同一张表，靠 metadata.source 归堆。 */
export async function saveGardenBoardMessage(
    charId: string,
    content: string,
    meta?: Record<string, unknown>
): Promise<number> {
    return DB.saveMessage({
        charId,
        role: 'user',
        type: 'text',
        content,
        metadata: { source: GARDEN_SOURCE, gardenBoard: true, ...meta },
    });
}

export interface GardenReplyRequest {
    char: CharacterProfile;
    user: UserProfile;
    api: APIConfig;
    /** 本轮用户说的话，调用前已经落库 */
    text: string;
    snapshot?: GardenSnapshot;
    signal?: AbortSignal;
    onStage?: (stage: string) => void;
}

/** 把一句话写进消息表。私聊与花园共用同一张表，靠 metadata.source 区分来源。 */
export async function saveGardenMessage(
    charId: string,
    role: 'user' | 'assistant',
    content: string
): Promise<number> {
    return DB.saveMessage({
        charId,
        role,
        type: 'text',
        content,
        metadata: { source: GARDEN_SOURCE },
    });
}

/** 取最近的花园对话，给 iframe 面板做初始化回填。 */
export async function loadGardenHistory(
    charId: string,
    limit = 40
): Promise<Array<{ role: 'user' | 'character'; text: string; at: number }>> {
    const rows: Message[] = await DB.getMessagesByCharId(charId, true);
    return rows
        .filter(row => row.metadata?.source === GARDEN_SOURCE && row.type === 'text')
        .slice(-Math.max(1, limit))
        .map((row): { role: 'user' | 'character'; text: string; at: number } => ({
            role: row.role === 'assistant' ? 'character' : 'user',
            text: typeof row.content === 'string' ? row.content : '',
            at: row.timestamp,
        }))
        .filter(row => row.text.trim());
}

/**
 * 生成一条花园回复。
 * 与私聊/3D 家园共用同一份请求构建：记忆库召回、世界书、情绪注入都在里面。
 */
export async function generateGardenReply(
    args: GardenReplyRequest
): Promise<{ text: string; actions: GardenAction[] }> {
    const { char, user, api, snapshot, signal, onStage } = args;
    if (!api.baseUrl || !api.model) throw Error('先在设置里配置聊天 API');

    onStage?.('读取上下文');
    const range = await loadCharacterContextRange(char);
    const [groups, emojis, categories] = await Promise.all([
        DB.getGroups(),
        DB.getEmojis(),
        DB.getEmojiCategories(),
    ]);

    onStage?.('召回记忆');
    const payload = await buildChatRequestPayload({
        char,
        userProfile: user,
        groups,
        emojis,
        categories,
        signal,
        historyMsgs: range.messages,
        contextLimit: Math.max(1, range.messages.length),
        contextHighWaterMark: range.hwm,
        recallEntryPoint: 'garden',
        // 花园没有图片承载能力，历史里的多模态内容压成文字占位
        stripImages: true,
        appPrompt: { rules: '', scene: buildGardenScenePrompt(user, snapshot) },
        onPreparationStage: event => {
            if (event.status === 'start') onStage?.('准备对话');
        },
    });

    if (signal?.aborted) throw new DOMException('已取消', 'AbortError');
    onStage?.('等待回复');

    const response = await fetch(`${api.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${api.apiKey || 'sk-none'}`,
        },
        signal,
        body: JSON.stringify({
            model: api.model,
            messages: payload.fullMessages,
            temperature: api.temperature ?? 0.85,
            // 花园要短句，别让模型写长篇
            max_tokens: 600,
            stream: false,
        }),
        __sullyMeta: {
            appName: '小花园',
            charId: char.id,
            charName: char.name,
            purpose: '花园闲聊',
        },
    } as RequestInit);

    if (!response.ok) throw Error(`暂时没有收到回复（${response.status}）`);
    const raw = extractContent(await safeResponseJson(response));
    const parsed = parseGardenActions(raw);
    if (!parsed.text && !parsed.actions.length) throw Error('这条没说话，可以再说一次');
    return parsed;
}
