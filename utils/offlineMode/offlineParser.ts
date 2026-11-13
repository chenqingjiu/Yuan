/**
 * 线下模式行级解析器。
 *
 * 核心思路（方案 v1）：只做「行首是不是引号」这一件事，不做任何语义判断。
 * - 行首引号 → 台词（dialogue）
 * - 否则 → 旁白（narration）
 * - 相邻同类合并成一段；台词段「未闭合」（有开引号没闭引号）时，后续旁白行继续并入，
 *   直到出现闭合引号或新台词行——这样模型把台词折行时不会中途被打断。
 * - 残留的 [emotion] 立绘标签（模型偶尔从 VN 风格里带出来）在旁白行行首清掉。
 *
 * 最坏情况永远是「可读的错位」，不会把格式炸掉。
 */

export interface OfflineSegment {
    type: 'narration' | 'dialogue';
    text: string;
}

/** 行首开引号（含 ASCII 半角双引号，模型很常用） */
const OPEN_QUOTE_RE = /^["「『"]/u;
/** 段尾闭引号 */
const CLOSE_QUOTE_RE = /["」』"]$/u;
/** 行首 [emotion] 立绘标签，如 [normal] [shy] [angry] */
const EMOTION_TAG_RE = /^\[[a-zA-Z_]+\]\s*/;
/** 成对引号整体剥掉（首尾都是引号时） */
const PAIRED_QUOTE_RE = /^["「『"]([\s\S]*?)["」』"]$/;

export const isQuoteStartLine = (line: string): boolean => OPEN_QUOTE_RE.test(line.trim());

const stripOuterQuotes = (text: string): string => {
    const t = text.trim();
    const paired = PAIRED_QUOTE_RE.exec(t);
    const inner = paired ? paired[1] : t.replace(OPEN_QUOTE_RE, '');
    // 多行台词合并后，行内残留的成对引号（每行各包一组的场景）一并清掉
    return inner.replace(/["」』"]/g, '').trim();
};

/** 台词段是否已闭合（以闭引号收尾） */
const isDialogueClosed = (text: string): boolean => CLOSE_QUOTE_RE.test(text.trim());

/**
 * 把线下模式原始文本解析成分段列表。
 * 段落按渲染类型合并：连续旁白/连续台词各自合并成一段；
 * 台词段未闭合时吸收后续旁白行（台词折行容错）。
 */
export const parseOfflineMessage = (text: string): OfflineSegment[] => {
    if (!text) return [];
    const lines = String(text).split('\n');
    const segs: OfflineSegment[] = [];
    let pendingType: 'narration' | 'dialogue' | null = null;
    let pending = '';

    const flush = () => {
        if (!pending) return;
        if (pendingType === 'dialogue') {
            segs.push({ type: 'dialogue', text: stripOuterQuotes(pending) });
        } else {
            segs.push({ type: 'narration', text: pending.trim() });
        }
        pending = '';
        pendingType = null;
    };

    for (const raw of lines) {
        const line = raw.trim();
        if (!line) {
            flush();
            continue;
        }
        let type: 'narration' | 'dialogue' = OPEN_QUOTE_RE.test(line) ? 'dialogue' : 'narration';

        // 台词折行容错：当前是旁白行，但上一段是未闭合台词 → 继续并入台词
        if (type === 'narration' && pendingType === 'dialogue' && !isDialogueClosed(pending)) {
            pending += '\n' + line;
            continue;
        }

        if (pendingType && type !== pendingType) flush();
        pendingType = type;
        pending += (pending ? '\n' : '') + (type === 'narration' ? line.replace(EMOTION_TAG_RE, '') : line);
    }
    flush();
    return segs;
};

/** 是否「含台词」（决定主动消息要不要打扰通知）：解析后存在 dialogue 段即算。 */
export const hasDialogue = (segs: OfflineSegment[]): boolean =>
    segs.some((s) => s.type === 'dialogue');

/**
 * 格式失效诊断：解析后全是旁白、零台词，但文本里明显有对话特征时，返回一句原因。
 *
 * 解析器的设计原则是「最坏情况只错位、不炸格式」，副作用就是失效时完全静默：
 * 用户只看到「台词变成了旁白」，看不出是模型没加引号（prompt 问题）还是解析错了（代码问题）。
 * 这里只做判定，不打日志——调用方自己决定在 dev 下 console.warn，生产不受影响。
 */
export const detectOfflineFormatBreak = (raw: string, segs: OfflineSegment[]): string | null => {
    if (!raw || segs.length === 0) return null;
    if (hasDialogue(segs)) return null;
    const text = String(raw);
    const hasQuoteChar = /["「」『』“”]/.test(text);
    const hasQuestion = /[?？]/.test(text);
    if (hasQuoteChar) return '文本里有引号，但没有一行以引号开头（引号写在行中或包了整段）';
    if (hasQuestion) return '出现问句却完全没有引号：模型大概率没给台词加引号';
    return null;
};

/**
 * 历史消息渲染专用：把时间写成「夜里 03:12」。
 * 线下模式已下线，这里只为让旧消息里的时间锚点还能正常显示。
 */
export const describeOfflineClock = (date: Date = new Date()): string => {
    const h = date.getHours();
    const period = h < 5 ? '凌晨' : h < 8 ? '清晨' : h < 11 ? '上午' : h < 13 ? '中午'
        : h < 17 ? '下午' : h < 19 ? '傍晚' : h < 23 ? '夜里' : '深夜';
    return `${period} ${h.toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
};
