/**
 * 牌桌聊天的纯逻辑（不依赖 React，便于单测）。
 *
 * 设计要点：
 * - 聊天记录不进 DdzState。牌局是纯函数状态机，聊天是旁路数据，
 *   混进去会污染战报/回放，也会让 rules.ts 的测试变脆。
 * - 回私聊时必须「原封不动」：一条不删、一句不改，只加说话人标注。
 */

export interface TableLine {
    id: string;
    speakerId: string;
    speakerName: string;
    role: 'user' | 'char';
    text: string;
    ts: number;
}

export interface ChatCandidate {
    id: string;
    name: string;
}

const norm = (s: string) => s.replace(/\s+/g, '');

/** 造一条对话记录（id 只要当 key 用，不需要全局唯一）。 */
export function makeLine(
    speakerId: string,
    speakerName: string,
    role: 'user' | 'char',
    text: string,
    now = Date.now(),
): TableLine {
    return {
        id: `${now}-${Math.random().toString(36).slice(2, 7)}`,
        speakerId,
        speakerName,
        role,
        text,
        ts: now,
    };
}

/** 把最近 N 句压成给模型看的上下文；保留原话，不概括、不改写。 */
export function buildHistoryBlock(lines: TableLine[], limit = 5): string {
    if (!lines.length) return '';
    return lines
        .slice(-limit)
        .map((l) => `${l.speakerName}：${l.text}`)
        .join('\n');
}

/**
 * 谁来回这句话：先看有没有点名，其次轮到谁，最后随便找一个（尽量不连续同一人）。
 */
export function pickResponder(
    text: string,
    candidates: ChatCandidate[],
    preferId?: string | null,
    lastSpeakerId?: string | null,
): string | null {
    if (!candidates.length) return null;

    // 1) 点名优先。取匹配到的最长名字，避免「小美」被「美」误伤。
    const t = norm(text);
    let named: ChatCandidate | null = null;
    for (const c of candidates) {
        const n = norm(c.name);
        if (n.length < 2) continue; // 单字名太容易误伤，交给下面的规则
        if (!t.includes(n)) continue;
        if (!named || n.length > norm(named.name).length) named = c;
    }
    if (named) return named.id;

    // 2) 轮到谁谁说
    if (preferId && candidates.some((c) => c.id === preferId)) return preferId;

    // 3) 别让同一个人连着接话
    const others = candidates.filter((c) => c.id !== lastSpeakerId);
    const pool = others.length ? others : candidates;
    return pool[Math.floor(Math.random() * pool.length)].id;
}

/** 战报里的对话原文（一条不删、一句不改，只做「谁：说了什么」的排版）。 */
export function formatChatForReport(lines: TableLine[]): string {
    if (!lines.length) return '';
    return lines.map((l) => `${l.speakerName}：${l.text}`).join('\n');
}

/** 转私聊的卡片数据：保留说话人、顺序、原文。 */
export function toReportChat(lines: TableLine[]): { speaker: string; role: 'user' | 'char'; text: string; ts: number }[] {
    return lines.map((l) => ({ speaker: l.speakerName, role: l.role, text: l.text, ts: l.ts }));
}
