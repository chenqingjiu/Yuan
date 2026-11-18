import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useOS } from '../../context/OSContext';
import { DB } from '../../utils/db';
import { callGameApi, type ApiEndpoint } from '../../utils/games/gameApi';
import { createNpcs } from '../../utils/games/npcPool';
import { chooseBid, choosePlay, suggestPlay } from '../../utils/games/doudizhu/ai';
import type { Card, DdzState } from '../../utils/games/doudizhu/rules';
import {
    RANKS,
    SUIT_SYMBOL,
    applyBid,
    applyPlay,
    canBeat,
    cardRank,
    classifyCards,
    createGame,
    sortCards,
} from '../../utils/games/doudizhu/rules';
import {
    buildHistoryBlock,
    formatChatForReport,
    makeLine,
    pickResponder,
    toReportChat,
    type TableLine,
} from '../../utils/games/doudizhu/tableChat';

interface Props {
    onBack: () => void;
}

interface Seat {
    id: string;
    name: string;
    avatar?: string;
    persona?: string;
    hue?: number;
    charId?: string;
    isUser?: boolean;
}

const AI_DELAY = 750;
const BID_DELAY = 600;
const MAX_LINES = 14;

// ---------------------------------------------------------------- 角色台词 API

/** 角色台词专属 API（按 charId 存 localStorage，不污染角色的聊天配置）。 */
interface SpeechApiConfig { baseUrl: string; apiKey: string; model: string }
const SPEECH_API_KEY = 'ddz_speech_apis';

function loadSpeechApis(): Record<string, SpeechApiConfig> {
    try {
        const raw = localStorage.getItem(SPEECH_API_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
}

function saveSpeechApi(charId: string, cfg: SpeechApiConfig | null): void {
    try {
        const all = loadSpeechApis();
        if (cfg && cfg.baseUrl && cfg.apiKey && cfg.model) all[charId] = cfg;
        else delete all[charId];
        localStorage.setItem(SPEECH_API_KEY, JSON.stringify(all));
    } catch { /* ignore */ }
}

// ---------------------------------------------------------------- 牌面

function CardFace({ card, size = 'md', raised }: { card: Card; size?: 'xs' | 'sm' | 'md' | 'lg'; raised?: boolean }) {
    const isJoker = card === 'BJ' || card === 'RJ';
    const rank = isJoker ? (card === 'RJ' ? '大' : '小') : card.slice(0, -1);
    const suit = isJoker ? '王' : SUIT_SYMBOL[card.slice(-1)] || '';
    const red = isJoker ? card === 'RJ' : card.slice(-1) === 'H' || card.slice(-1) === 'D';
    const box = {
        xs: 'w-5 h-7 rounded-[3px] text-[8px]',
        sm: 'w-6 h-8 rounded-[3px] text-[9px]',
        md: 'w-8 h-11 rounded-md text-[11px]',
        lg: 'w-9 h-[52px] rounded-md text-[12px]',
    }[size];

    return (
        <div className={`${box} bg-white border border-slate-200 shadow-sm flex flex-col items-center justify-center leading-none select-none ${raised ? 'border-amber-400' : ''}`}>
            <span className={`font-black ${red ? 'text-red-500' : 'text-slate-800'}`}>{rank}</span>
            {suit && <span className={`mt-0.5 ${red ? 'text-red-400' : 'text-slate-500'}`}>{suit}</span>}
        </div>
    );
}

function CardBack({ size = 'md', dim }: { size?: 'sm' | 'md'; dim?: boolean }) {
    const box = size === 'sm' ? 'w-6 h-8 rounded-[3px]' : 'w-8 h-11 rounded-md';
    return <div className={`${box} bg-gradient-to-br from-indigo-500 via-indigo-600 to-indigo-800 border border-white/30 shadow-sm ${dim ? 'opacity-40' : ''}`} />;
}

/** 桌面上的牌：超过 12 张自动重叠。 */
function CardRow({ cards }: { cards: Card[] }) {
    return (
        <div className="flex items-end justify-center">
            {cards.slice(0, 12).map((c, i) => (
                <div key={c} style={{ marginLeft: i === 0 ? 0 : -6 }}>
                    <CardFace card={c} size="md" />
                </div>
            ))}
        </div>
    );
}

// ---------------------------------------------------------------- 主组件

export default function DoudizhuApp({ onBack }: Props) {
    const { characters, userProfile, apiConfig, addToast } = useOS();

    const [view, setView] = useState<'setup' | 'play'>('setup');
    const [picked, setPicked] = useState<string[]>(() => characters.slice(0, 2).map((c) => c.id));
    const [seats, setSeats] = useState<Seat[]>([]);
    const [state, setState] = useState<DdzState | null>(null);
    const [selected, setSelected] = useState<Card[]>([]);
    const [speech, setSpeech] = useState<Record<string, string>>({});
    const [ended, setEnded] = useState(false);
    const [showReport, setShowReport] = useState(false);
    /** 台词气泡展开的角色座位（手机上显示不全时点开看全文）。 */
    const [expandedSeat, setExpandedSeat] = useState<string | null>(null);
    /** 台词 API 设置面板展开的角色 id。 */
    const [apiPanelChar, setApiPanelChar] = useState<string | null>(null);
    /** 台词 API 草稿（编辑中，未保存）。 */
    const [apiDraft, setApiDraft] = useState<Record<string, SpeechApiConfig>>({});
    /** 已保存的角色台词 API（charId → 配置）。 */
    const [speechApis, setSpeechApis] = useState<Record<string, SpeechApiConfig>>(() => loadSpeechApis());

    /** 牌桌聊天记录（不进 DdzState，纯旁路数据）。 */
    const [tableChat, setTableChat] = useState<TableLine[]>([]);
    const [chatDraft, setChatDraft] = useState('');
    /** 聊天记录区是否展开（收起时只留输入框，省地方）。 */
    const [chatOpen, setChatOpen] = useState(true);
    /** 正在打字回话的角色 id。 */
    const [chatBusyId, setChatBusyId] = useState<string | null>(null);
    /** 输入框聚焦时暂停整桌，焦点离开就恢复。 */
    const [paused, setPaused] = useState(false);

    const stateRef = useRef<DdzState | null>(null);
    const seatsRef = useRef<Seat[]>([]);
    const spokenRef = useRef(0);
    /** 本局出牌过程记录（战报用）。 */
    const playLogRef = useRef<string[]>([]);
    /** 聊天记录的同步副本（异步回调里读，避免闭包拿到旧值）。 */
    const chatRef = useRef<TableLine[]>([]);
    /** 上一次接话的角色，避免同一个人连着说。 */
    const lastChatterRef = useRef<string | null>(null);
    /** 已经提示过「没配 API」的角色，别反复弹。 */
    const chatWarnedRef = useRef<Set<string>>(new Set());
    const pausedRef = useRef(false);
    /** 串行回复：连着发两句时，第二句等第一句回完，不会抢话。 */
    const chatQueueRef = useRef<Promise<void>>(Promise.resolve());

    useEffect(() => { stateRef.current = state; }, [state]);
    useEffect(() => { seatsRef.current = seats; }, [seats]);
    useEffect(() => { pausedRef.current = paused; }, [paused]);

    const mainApi: ApiEndpoint = useMemo(
        () => ({ baseUrl: apiConfig.baseUrl, apiKey: apiConfig.apiKey, model: apiConfig.model }),
        [apiConfig],
    );
    const apiRef = useRef({ mainApi, characters, speechApis });
    useEffect(() => { apiRef.current = { mainApi, characters, speechApis }; }, [mainApi, characters, speechApis]);

    // ---- 开局（keepSeats=true 时沿用同一批对手，只有换桌才重新挑人）

    const startGame = (keepSeats = false) => {
        let list: Seat[];
        if (keepSeats && seatsRef.current.length === 3) {
            list = seatsRef.current;
        } else {
            const chosen = picked
                .map((id) => characters.find((c) => c.id === id))
                .filter((c): c is NonNullable<typeof c> => !!c)
                .slice(0, 2);

            list = [{ id: 'user', name: userProfile.name || '你', isUser: true, avatar: userProfile.avatar }];
            for (const c of chosen) {
                list.push({ id: `ai${list.length}`, name: c.name, avatar: c.avatar, persona: c.systemPrompt?.slice(0, 160), charId: c.id });
            }
            if (list.length < 3) {
                const npcs = createNpcs(3 - list.length, list.map((s) => s.name));
                for (const n of npcs) {
                    list.push({ id: `ai${list.length}`, name: n.name, persona: n.persona, hue: n.hue });
                }
            }
        }

        setSeats(list);
        seatsRef.current = list;
        setState(createGame(list.map((s) => s.id)));
        setSelected([]);
        setSpeech({});
        setEnded(false);
        setShowReport(false);
        setExpandedSeat(null);
        spokenRef.current = 0;
        playLogRef.current = [];
        // 新的一局，牌桌上的话也重新开始
        setTableChat([]);
        chatRef.current = [];
        setChatDraft('');
        setChatOpen(true);
        setChatBusyId(null);
        setPaused(false);
        lastChatterRef.current = null;
        setView('play');
    };

    // ---- AI 台词（用角色人设现编一句，失败就用规则兜底文案）

    const describeSituation = (s: DdzState, pid: string): string => {
        const role = s.landlord === pid ? '地主' : '农民';
        const mine = (s.hands[pid] || []).length;
        const others = s.order
            .filter((p) => p !== pid)
            .map((p) => `${seatsRef.current.find((x) => x.id === p)?.name || p} 剩 ${(s.hands[p] || []).length} 张`)
            .join('，');
        const last = s.lastPlay
            ? `${seatsRef.current.find((x) => x.id === s.lastPlay!.player)?.name || s.lastPlay.player} 刚出了 ${s.lastPlay.cards.length} 张`
            : '这轮由你出牌';
        return `你是${role}，手里 ${mine} 张；${others}；${last}`;
    };

    /**
     * 台词 API 优先级：角色在游戏里单独设置的 API → 角色自带的专属对话 API
     * （CharacterProfile.dialogueApi，聊天设置里配过的）→ 主 API。不走副 API。
     */
    const resolveSpeechEndpoint = (seat: Seat): ApiEndpoint | null => {
        const { mainApi: main, characters: chars, speechApis: saved } = apiRef.current;
        const custom = seat.charId ? saved[seat.charId] : null;
        if (custom?.baseUrl && custom.apiKey && custom.model) return custom;
        const char = seat.charId ? chars.find((c) => c.id === seat.charId) : null;
        const d = char?.dialogueApi;
        if (d?.baseUrl && d.apiKey && d.model) return { baseUrl: d.baseUrl, apiKey: d.apiKey, model: d.model };
        if (main.baseUrl && main.apiKey && main.model) return main;
        return null;
    };

    /** 记一笔对局过程（战报 transcript）。 */
    const logLine = (nameOf: (id: string) => string, s: DdzState, pid: string, what: string) => {
        playLogRef.current.push(`第${playLogRef.current.length + 1}手 ${nameOf(pid)}：${what}`);
        void s;
    };

    const maybeSpeak = async (pid: string, s: DdzState, fallback: string) => {
        if (!pid || !fallback) return;
        if (spokenRef.current >= MAX_LINES) return;
        if (Math.random() > 0.35) return;
        const seat = seatsRef.current.find((x) => x.id === pid);
        if (!seat || seat.isUser) return;
        const endpoint = resolveSpeechEndpoint(seat);
        if (!endpoint) return;
        spokenRef.current += 1;
        try {
            // 牌桌上刚聊过什么，让它接得上话，别自说自话。
            const history = buildHistoryBlock(chatRef.current, 5);
            const res = await callGameApi(endpoint, endpoint, false, {
                system: [
                    `你正在和用户一起打斗地主，你是「${seat.name}」。`,
                    seat.persona ? `你的人设：${seat.persona}` : '',
                    '用一句话（不超过18个字）说出此刻的反应或吐槽。',
                    history ? '如果牌桌上刚聊过什么，可以顺着那句接，但别复读别人说过的话。' : '',
                    '只输出这一句话：不要引号、不要动作描写、不要旁白、不要解释你在做什么。',
                ].filter(Boolean).join('\n'),
                messages: [{
                    role: 'user',
                    content: [
                        `局面：${describeSituation(s, pid)}。你刚才：${fallback}`,
                        history ? `\n最近牌桌上的话：\n${history}` : '',
                    ].join(''),
                }],
                temperature: 0.95,
                maxTokens: 48,
                purpose: '斗地主台词',
            });
            if (!res.ok || !res.text) return;
            const line = res.text
                .replace(/[\r\n]+/g, ' ')
                .replace(/^[「『“"']+|[」』”"']+$/g, '')
                .trim()
                .slice(0, 40);
            if (line) setSpeech((prev) => ({ ...prev, [pid]: line }));
        } catch {
            /* 台词只是点缀，失败保留规则文案 */
        }
    };

    // ---- AI 回合驱动

    useEffect(() => {
        // 你在打字 → 整桌停下等你（不打字时照常自动接牌）
        if (!state || paused || state.phase === 'over' || state.currentPlayer === 'user') return;
        const pid = state.currentPlayer;
        let cancelled = false;

        const timer = setTimeout(() => {
            if (cancelled) return;
            const prev = stateRef.current;
            if (!prev || prev.currentPlayer !== pid || prev.phase === 'over') return;

            let next: DdzState | null = null;
            let line = '';
            let logWhat = '';
            try {
                if (prev.phase === 'bidding') {
                    const bid = chooseBid(prev.hands[pid] || [], prev.currentBid, prev.bidTurns >= 2);
                    next = applyBid(prev, pid, bid);
                    line = bid === 0 ? '不叫。' : `我叫 ${bid} 分。`;
                    logWhat = bid === 0 ? '不叫' : `叫 ${bid} 分`;
                } else {
                    const decision = choosePlay(prev, pid);
                    next = applyPlay(prev, pid, decision.action, decision.cards);
                    line = decision.speech;
                    logWhat = decision.action === 'pass' ? '不出' : `出 ${decision.cards.join(' ')}`;
                }
            } catch {
                try {
                    next = applyPlay(prev, pid, 'pass', []);
                    line = '这手先不要。';
                    logWhat = '不出';
                } catch {
                    next = null;
                }
            }
            if (!next) return;
            setState(next);
            stateRef.current = next;
            const nameOf = (id: string) => seatsRef.current.find((x) => x.id === id)?.name || id;
            logLine(nameOf, next, pid, logWhat);
            if (line) setSpeech((s) => ({ ...s, [pid]: line }));
            void maybeSpeak(pid, next, line);
        }, state.phase === 'bidding' ? BID_DELAY : AI_DELAY);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state, paused]);

    // ---- 结算

    useEffect(() => {
        if (state?.phase !== 'over' || ended) return;
        setEnded(true);
        const winnerSeat = seats.find((s) => s.id === state.winner);
        const farmerWon = state.winner !== state.landlord;
        const iWon = state.winner === 'user' || (state.landlord !== 'user' && farmerWon);
        addToast(
            iWon ? `你赢了！${winnerSeat?.name || ''}先走完` : `${winnerSeat?.name || '对方'}先走完，这局输了`,
            iWon ? 'success' : 'info',
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state?.phase, state?.winner, ended]);

    // ---- 玩家操作

    const isMyTurn = !!state && state.currentPlayer === 'user' && state.phase !== 'over';

    const toggleCard = (card: Card) => {
        if (!isMyTurn || state?.phase !== 'playing') return;
        setSelected((prev) => (prev.includes(card) ? prev.filter((c) => c !== card) : [...prev, card]));
    };

    const selectedType = selected.length ? classifyCards(selected) : null;
    const canSubmit =
        !!state &&
        !!selectedType &&
        (!state.lastPlay || state.lastPlay.player === 'user' || canBeat(selectedType, state.lastPlay));

    const submitPlay = () => {
        if (!state || !canSubmit) return;
        try {
            const next = applyPlay(state, 'user', 'play', selected);
            setState(next);
            stateRef.current = next;
            playLogRef.current.push(`第${playLogRef.current.length + 1}手 ${meName()}：出 ${selected.join(' ')}`);
            setSelected([]);
        } catch (e: any) {
            addToast(e?.message || '这手牌出不了', 'error');
        }
    };

    const submitPass = () => {
        if (!state) return;
        try {
            const next = applyPlay(state, 'user', 'pass', []);
            setState(next);
            stateRef.current = next;
            playLogRef.current.push(`第${playLogRef.current.length + 1}手 ${meName()}：不出`);
            setSelected([]);
        } catch (e: any) {
            addToast(e?.message || '现在不能不出', 'error');
        }
    };

    const submitBid = (bid: number) => {
        if (!state || state.currentPlayer !== 'user' || state.phase !== 'bidding') return;
        const next = applyBid(state, 'user', bid);
        setState(next);
        stateRef.current = next;
        playLogRef.current.push(`第${playLogRef.current.length + 1}手 ${meName()}：${bid === 0 ? '不叫' : `叫 ${bid} 分`}`);
        setSelected([]);
    };

    /** 我的座位名（战报里用昵称）。 */
    const meName = () => seatsRef.current.find((s) => s.id === 'user')?.name || '我';

    const hint = () => {
        if (!state) return;
        const d = suggestPlay(state, 'user');
        if (d.action === 'pass') {
            setSelected([]);
            addToast('这手建议不出', 'info');
        } else {
            setSelected(d.cards);
        }
    };

    // ---- 牌桌聊天

    const pushChat = (line: TableLine) => {
        const next = [...chatRef.current, line];
        chatRef.current = next;
        setTableChat(next);
    };

    /** 某个角色当场接一句。失败静默，绝不打断牌局。 */
    const replyChat = async (seat: Seat, text: string) => {
        // 用最新局面（发送时可能已经过了几手）
        const s = stateRef.current;
        const endpoint = resolveSpeechEndpoint(seat);
        if (!endpoint) {
            if (!chatWarnedRef.current.has(seat.id)) {
                chatWarnedRef.current.add(seat.id);
                addToast(`${seat.name} 还没配台词 API，现在只能听你说`, 'info');
            }
            return;
        }
        setChatBusyId(seat.id);
        try {
            const history = buildHistoryBlock(chatRef.current, 5);
            const res = await callGameApi(endpoint, endpoint, false, {
                system: [
                    `你正在和用户一起打斗地主，你是「${seat.name}」，就坐在牌桌上。`,
                    seat.persona ? `你的人设：${seat.persona}` : '',
                    `此刻的局面：${s ? describeSituation(s, seat.id) : '刚开局'}。`,
                    '用户在牌桌上跟你说话，你要当场接一句：',
                    '- 像真人坐在牌桌上随口回话，不超过 30 字',
                    '- 先接住对方的话头，再带一点自己的处境或情绪，别答非所问',
                    '- 不要旁白、不要动作描写、不要引号、不要解释你在做什么',
                    '- 不要报具体手牌，但可以拿牌好牌差说事',
                ].filter(Boolean).join('\n'),
                messages: [{
                    role: 'user',
                    content: [
                        history ? `刚才牌桌上的话：\n${history}\n\n` : '',
                        `用户对你说：${text}`,
                    ].join(''),
                }],
                temperature: 0.95,
                maxTokens: 96,
                purpose: '斗地主牌桌聊天',
            });
            if (!res.ok || !res.text) return;
            const line = res.text
                .replace(/[\r\n]+/g, ' ')
                .replace(/^[「『“"']+|[」』”"']+$/g, '')
                .trim()
                .slice(0, 120);
            if (!line) return;
            pushChat(makeLine(seat.id, seat.name, 'char', line));
            lastChatterRef.current = seat.id;
        } catch {
            /* 说话失败不影响打牌 */
        } finally {
            setChatBusyId(null);
        }
    };

    /** 串行回复：连着发两句时，第二句等第一句回完，不会抢话。 */
    const sendChat = () => {
        const text = chatDraft.trim();
        const s = stateRef.current;
        if (!text || !s) return;
        setChatDraft('');
        pushChat(makeLine('user', meName(), 'user', text));
        setChatOpen(true);

        const rivals = seatsRef.current.filter((x) => !x.isUser);
        if (!rivals.length) return;
        const targetId = pickResponder(
            text,
            rivals.map((r) => ({ id: r.id, name: r.name })),
            s.currentPlayer,
            lastChatterRef.current,
        );
        const seat = rivals.find((r) => r.id === targetId);
        if (!seat) return;
        chatQueueRef.current = chatQueueRef.current.then(() => replyChat(seat, text)).catch(() => { });
    };

    // ---- 战报

    const reportText = useMemo(() => {
        if (!state || state.phase !== 'over') return '';
        const nameOf = (id: string | null) => seats.find((s) => s.id === id)?.name || '未知';
        const landlordWon = state.winner === state.landlord;
        const rest = state.order
            .filter((p) => p !== state.winner)
            .map((p) => `${nameOf(p)} 剩 ${(state.hands[p] || []).length} 张`)
            .join('，');
        return [
            '【斗地主战报】',
            `${landlordWon ? '地主方获胜' : '农民方获胜'} · ${nameOf(state.winner)}先出完`,
            `地主：${nameOf(state.landlord)}`,
            `剩余：${rest || '无'}`,
            `底牌：${state.bottom.join(' ')}`,
        ].join('\n');
    }, [state, seats]);

    /** 卡片副标题（一行概括，聊天里不展开也能看到）。 */
    const reportSubtitle = useMemo(() => {
        if (!state || state.phase !== 'over') return '';
        const nameOf = (id: string | null) => seats.find((s) => s.id === id)?.name || '未知';
        const landlordWon = state.winner === state.landlord;
        return `${landlordWon ? '地主方胜' : '农民方胜'} · ${nameOf(state.winner)}先出完 · 炸弹 ${bombs(state)} 次 · ${playLogRef.current.length} 手`;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state, seats]);

    const forwardReport = async () => {
        if (!state || state.phase !== 'over') return;
        const targets = seats.filter((s) => s.charId);
        if (!targets.length) {
            addToast('本局没有角色参与，无处可转', 'info');
            return;
        }
        const ts = Date.now();
        const transcript = playLogRef.current.join('\n');
        const nameOf = (id: string | null) => seats.find((s) => s.id === id)?.name || '未知';
        // 牌桌上的话原封不动带回去：一条不删、一句不改，只加说话人。
        const chatText = formatChatForReport(chatRef.current);
        const chatItems = toReportChat(chatRef.current);
        // 内容给模型看：战报 + 过程 + 对话原文，让角色明确「刚和用户打了一局、还聊了这些」。
        const fullContent = [
            reportText,
            transcript ? `\n\n对局过程（你我同桌）：\n${transcript}` : '',
            chatText ? `\n\n牌桌上的对话（原话）：\n${chatText}` : '',
        ].join('');
        for (const seat of targets) {
            await DB.saveMessage({
                charId: seat.charId!,
                role: 'user',
                type: 'game_replay',
                content: fullContent,
                metadata: {
                    game: '斗地主',
                    subtitle: reportSubtitle,
                    rounds: playLogRef.current.length,
                    playerCount: seats.length,
                    mvp: nameOf(state.winner),
                    transcript,
                    chat: chatItems,
                    summary: reportText,
                    myRole: state.landlord === seat.id ? '地主' : '农民',
                    landlordName: nameOf(state.landlord),
                    winnerName: nameOf(state.winner),
                    charIds: targets.map((t) => t.charId),
                    charNames: targets.map((t) => t.name),
                    ts,
                },
            });
        }
        addToast(`已转发到 ${targets.length} 位角色的聊天`, 'success');
    };

    const togglePick = (id: string) => {
        setPicked((prev) => {
            if (prev.includes(id)) return prev.filter((x) => x !== id);
            if (prev.length >= 2) return [...prev.slice(1), id];
            return [...prev, id];
        });
    };

    /** 打开某角色的台词 API 面板：预填已保存的 → 角色自带 dialogueApi → 空。 */
    const openApiPanel = (charId: string) => {
        if (apiPanelChar === charId) {
            setApiPanelChar(null);
            return;
        }
        const char = characters.find((c) => c.id === charId);
        const saved = speechApis[charId];
        const d = char?.dialogueApi;
        const preset = saved || (d?.baseUrl && d.apiKey && d.model ? { baseUrl: d.baseUrl, apiKey: d.apiKey, model: d.model } : { baseUrl: '', apiKey: '', model: '' });
        setApiDraft((prev) => ({ ...prev, [charId]: { ...preset } }));
        setApiPanelChar(charId);
    };

    const persistApiDraft = (charId: string) => {
        const cfg = apiDraft[charId];
        if (!cfg) return;
        saveSpeechApi(charId, cfg);
        setSpeechApis(loadSpeechApis());
        setApiPanelChar(null);
        addToast('已保存该角色的专属台词 API', 'success');
    };

    const clearApiDraft = (charId: string) => {
        saveSpeechApi(charId, null);
        setSpeechApis(loadSpeechApis());
        setApiPanelChar(null);
        addToast('已清除，回退角色专属对话 API 或主 API', 'info');
    };

    // ---------------------------------------------------------------- setup

    if (view === 'setup') {
        // 至少有一个角色就能开局：另一个座位由 NPC 补上。
        const enough = characters.length >= 1;
        return (
            <div className="h-full w-full flex flex-col bg-slate-50 relative overflow-hidden">
                <div className="shrink-0 flex items-center px-4 py-3 bg-white border-b border-slate-100" style={{ paddingTop: 'calc(var(--safe-top, 0px) + 0.5rem)' }}>
                    <button onClick={onBack} className="p-1 -ml-1 text-slate-500 hover:text-slate-700 cursor-pointer">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
                    </button>
                    <span className="ml-1 text-base font-black text-slate-800">斗地主</span>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
                    <div className="rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-800 p-4 text-white shadow-sm">
                        <p className="text-lg font-black">🃏 三人斗地主</p>
                        <p className="text-[12px] text-emerald-100 mt-1 leading-relaxed">
                            你 + 两个角色，一桌打完。叫分、炸弹翻倍都在，
                            <br />规则全部本地跑，不消耗模型额度也能玩。
                        </p>
                    </div>

                    <div>
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-bold text-slate-800">选择对手（2 位）</h3>
                            <span className="text-[11px] text-slate-400">已选 {picked.length}/2</span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5 mb-2">不够两人时自动补 NPC 陪你打</p>
                        {characters.length === 0 ? (
                            <p className="text-xs text-slate-400 py-4 text-center">还没有角色，先去「神经链接」创建吧</p>
                        ) : (
                            <div className="grid grid-cols-2 gap-2">
                                {characters.map((c) => {
                                    const on = picked.includes(c.id);
                                    return (
                                        <button
                                            key={c.id}
                                            onClick={() => togglePick(c.id)}
                                            className={`flex items-center gap-2 p-2.5 rounded-xl border text-left cursor-pointer transition-colors ${on ? 'bg-emerald-50 border-emerald-300' : 'bg-white border-slate-200 hover:border-slate-300'}`}
                                        >
                                            <span className="w-7 h-7 rounded-full bg-violet-200 flex items-center justify-center text-xs font-bold text-violet-700 shrink-0 overflow-hidden">
                                                {c.avatar ? <img src={c.avatar} className="w-full h-full object-cover" alt="" /> : c.name.slice(0, 1)}
                                            </span>
                                            <span className="text-[13px] font-bold text-slate-700 truncate">{c.name}</span>
                                            <span className={`ml-auto w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${on ? 'border-emerald-500' : 'border-slate-300'}`}>
                                                {on && <span className="w-2 h-2 rounded-full bg-emerald-500" />}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <div className="rounded-xl bg-slate-100 border border-slate-200 p-3 text-[11px] text-slate-500 leading-relaxed">
                        规则：54 张牌，每人 17 张 + 3 张底牌。叫分最高者当地主，拿底牌先出。
                        先出完手牌的一方获胜；炸弹和王炸会让本局倍数翻倍。
                    </div>

                    {picked.length > 0 && (
                        <div>
                            <h3 className="text-sm font-bold text-slate-800">台词 API（可选）</h3>
                            <p className="text-[11px] text-slate-400 mt-0.5 mb-2">
                                给每个角色单独配打牌时的说话模型；不填则依次回退角色的专属对话 API、主 API。
                            </p>
                            <div className="space-y-2">
                                {picked.map((cid) => {
                                    const c = characters.find((x) => x.id === cid);
                                    if (!c) return null;
                                    const saved = speechApis[cid];
                                    const open = apiPanelChar === cid;
                                    const draft = apiDraft[cid];
                                    return (
                                        <div key={cid} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                                            <button onClick={() => openApiPanel(cid)} className="w-full flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-slate-50">
                                                <span className="w-7 h-7 rounded-full bg-violet-200 flex items-center justify-center text-xs font-bold text-violet-700 shrink-0 overflow-hidden">
                                                    {c.avatar ? <img src={c.avatar} className="w-full h-full object-cover" alt="" /> : c.name.slice(0, 1)}
                                                </span>
                                                <span className="text-[13px] font-bold text-slate-700">{c.name} 的台词 API</span>
                                                <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${saved ? 'bg-emerald-100 text-emerald-700 font-bold' : 'bg-slate-100 text-slate-400'}`}>
                                                    {saved ? '已单独设置' : '跟随默认'}
                                                </span>
                                                <span className="text-slate-400 text-xs shrink-0">{open ? '▴' : '▾'}</span>
                                            </button>
                                            {open && draft && (
                                                <div className="px-3 pb-3 pt-1 space-y-2 border-t border-slate-100">
                                                    {(['baseUrl', 'apiKey', 'model'] as const).map((field) => (
                                                        <input
                                                            key={field}
                                                            value={draft[field]}
                                                            onChange={(e) => setApiDraft((prev) => ({ ...prev, [cid]: { ...draft, [field]: e.target.value } }))}
                                                            placeholder={field === 'baseUrl' ? 'API 地址（如 https://api.xxx.com/v1）' : field === 'apiKey' ? 'API Key' : '模型名'}
                                                            className="w-full px-2.5 py-2 rounded-lg bg-slate-50 border border-slate-200 text-[12px] text-slate-700 outline-none focus:border-emerald-400"
                                                        />
                                                    ))}
                                                    <div className="flex gap-2">
                                                        <button onClick={() => persistApiDraft(cid)} className="flex-1 py-2 rounded-lg bg-emerald-600 text-white text-[12px] font-black cursor-pointer">保存</button>
                                                        {saved && (
                                                            <button onClick={() => clearApiDraft(cid)} className="px-3 py-2 rounded-lg bg-slate-100 text-slate-500 text-[12px] font-bold cursor-pointer">清除</button>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    <button
                        onClick={() => startGame(false)}
                        disabled={!enough}
                        className={`w-full py-3 rounded-xl text-white text-sm font-black transition-colors cursor-pointer ${enough ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-300'}`}
                    >
                        🎮 开始（你 + 2 位角色）
                    </button>
                </div>
            </div>
        );
    }

    // ---------------------------------------------------------------- play

    if (!state) return null;

    const me = seats.find((s) => s.id === 'user');
    const rivals = seats.filter((s) => s.id !== 'user');
    const myHand = sortCards(state.hands['user'] || []);
    const bidding = state.phase === 'bidding';
    const over = state.phase === 'over';
    const lastSeat = state.lastPlay ? seats.find((s) => s.id === state.lastPlay!.player) : null;
    const handRows = myHand.length > 10
        ? [myHand.slice(0, Math.ceil(myHand.length / 2)), myHand.slice(Math.ceil(myHand.length / 2))]
        : [myHand];

    const seatPanel = (seat: Seat) => {
        const isLandlord = state.landlord === seat.id;
        const count = (state.hands[seat.id] || []).length;
        const line = speech[seat.id] || '';
        const active = state.currentPlayer === seat.id;
        return (
            <div key={seat.id} className={`flex-1 min-w-0 rounded-2xl border px-2.5 py-2 transition-colors ${active ? 'border-amber-300 bg-emerald-800/80' : 'border-white/10 bg-emerald-900/40'}`}>
                <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-full overflow-hidden bg-emerald-700 flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                        style={seat.hue != null ? { background: `hsl(${seat.hue},45%,42%)` } : undefined}>
                        {seat.avatar ? <img src={seat.avatar} className="w-full h-full object-cover" alt="" /> : seat.name.slice(0, 1)}
                    </span>
                    <div className="min-w-0">
                        <div className="flex items-center gap-1">
                            <span className="text-[12px] font-bold text-white truncate">{seat.name}</span>
                            {isLandlord && <span className="text-[9px] px-1 rounded bg-amber-400 text-amber-950 font-black shrink-0">地主</span>}
                        </div>
                        <div className="text-[10px] text-emerald-200/80">
                            {isLandlord ? '地主' : '农民'} · 剩 {count} 张
                        </div>
                    </div>
                </div>
                <div className="mt-1.5 flex gap-[2px] overflow-hidden">
                    {Array.from({ length: Math.min(count, 7) }).map((_, i) => <CardBack key={i} size="sm" dim={!active} />)}
                </div>
                <div className="mt-1 min-h-8">
                    {line && (
                        <button
                            onClick={() => setExpandedSeat((cur) => (cur === seat.id ? null : seat.id))}
                            className="w-full text-left cursor-pointer"
                        >
                            <p className={`text-[10px] leading-snug text-amber-100 bg-black/25 rounded-lg px-1.5 py-1 ${expandedSeat === seat.id ? 'max-h-24 overflow-y-auto' : 'line-clamp-2'}`}>
                                {expandedSeat === seat.id ? line : (line.length > 24 ? `${line.slice(0, 24)}… 点击看全文` : line)}
                            </p>
                        </button>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="h-full w-full flex flex-col relative overflow-hidden bg-gradient-to-b from-emerald-900 via-emerald-950 to-black">
            {/* 顶栏 */}
            <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-white/10" style={{ paddingTop: 'calc(var(--safe-top, 0px) + 0.9rem)' }}>
                <button onClick={onBack} className="p-1 -ml-1 text-emerald-100 cursor-pointer">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
                </button>
                <div className="text-center">
                    <p className="text-[13px] font-black text-white leading-none">斗地主</p>
                    <p className="text-[9px] text-emerald-300/80 mt-0.5">
                        {bidding ? '叫地主' : over ? '本局结束' : `底分 ${state.currentBid || 1} · 炸弹 ${bombs(state)}`}
                    </p>
                </div>
                <button onClick={() => startGame(true)} className="text-[11px] font-bold text-emerald-100 px-2 py-1 rounded-lg bg-white/10 cursor-pointer">新局</button>
            </div>

            {/* 底牌 */}
            <div className="shrink-0 flex items-center justify-center gap-1.5 py-1.5">
                <span className="text-[10px] text-emerald-300/70 mr-1">底牌</span>
                {state.bottom.map((c) =>
                    state.bottomRevealed ? <CardFace key={c} card={c} size="sm" /> : <CardBack key={c} size="sm" />,
                )}
            </div>

            {/* 对手 */}
            <div className="shrink-0 flex gap-2 px-3">{rivals.map(seatPanel)}</div>

            {/* 中央出牌区 */}
            <div className="flex-1 min-h-0 flex flex-col items-center justify-center px-4">
                {state.lastPlay ? (
                    <>
                        <p className="text-[10px] text-emerald-300/70 mb-1">
                            {lastSeat?.name || '对手'} · {classifyCards(state.lastPlay.cards)?.label || ''}
                        </p>
                        <CardRow cards={state.lastPlay.cards} />
                    </>
                ) : (
                    <p className="text-[11px] text-emerald-300/60">
                        {bidding ? '等待叫分' : over ? '' : '新一轮，出牌吧'}
                    </p>
                )}

                <p className="mt-3 text-[11px] text-amber-200/90 h-4">
                    {over
                        ? ''
                        : paused
                            ? '已暂停 · 你说话的时候没人出牌'
                            : state.currentPlayer === 'user'
                                ? '轮到你了'
                                : `${seats.find((s) => s.id === state.currentPlayer)?.name || '对手'} 思考中…`}
                </p>
            </div>

            {/* 我的手牌 */}
            <div className="shrink-0 px-2">
                <div className="flex items-center justify-between px-1 mb-1">
                    <span className="text-[10px] text-emerald-200/70">
                        {me?.name} · {state.landlord === 'user' ? '地主' : '农民'} · {myHand.length} 张
                    </span>
                    {selected.length > 0 && (
                        <span className="text-[10px] text-amber-300">
                            {selectedType ? selectedType.label : '牌型不合法'}
                        </span>
                    )}
                </div>
                <div className="pb-1 space-y-1">
                    {handRows.map((row, ri) => (
                        <div key={ri} className="flex justify-center">
                            {row.map((card, i) => {
                                const on = selected.includes(card);
                                const disabled = !isMyTurn || bidding;
                                return (
                                    <button
                                        key={card}
                                        onClick={() => toggleCard(card)}
                                        disabled={disabled}
                                        style={{ marginLeft: i === 0 ? 0 : -6 }}
                                        className={`transition-transform ${on ? '-translate-y-2' : ''} ${disabled ? 'opacity-75' : 'cursor-pointer'}`}
                                    >
                                        <CardFace card={card} size="lg" raised={on} />
                                    </button>
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>

            {/* 操作栏 */}
            <div className="shrink-0 px-3 pb-2">
                {bidding ? (
                    <div className="flex gap-2">
                        <button
                            onClick={() => submitBid(0)}
                            disabled={!isMyTurn}
                            className={`flex-1 py-2.5 rounded-xl text-[13px] font-black cursor-pointer ${isMyTurn ? 'bg-white/15 text-white' : 'bg-white/5 text-white/40'}`}
                        >
                            不叫
                        </button>
                        {[1, 2, 3].map((n) => {
                            const disabled = !isMyTurn || n <= state.currentBid;
                            return (
                                <button
                                    key={n}
                                    onClick={() => submitBid(n)}
                                    disabled={disabled}
                                    className={`flex-1 py-2.5 rounded-xl text-[13px] font-black cursor-pointer ${disabled ? 'bg-white/5 text-white/30' : 'bg-amber-400 text-amber-950'}`}
                                >
                                    {n} 分
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    <div className="flex gap-2">
                        <button
                            onClick={hint}
                            disabled={!isMyTurn}
                            className={`px-3 py-2.5 rounded-xl text-[12px] font-bold cursor-pointer ${isMyTurn ? 'bg-white/15 text-white' : 'bg-white/5 text-white/30'}`}
                        >
                            提示
                        </button>
                        <button
                            onClick={submitPass}
                            disabled={!isMyTurn || !state.lastPlay || state.lastPlay.player === 'user'}
                            className={`px-3 py-2.5 rounded-xl text-[12px] font-bold cursor-pointer ${
                                isMyTurn && state.lastPlay && state.lastPlay.player !== 'user' ? 'bg-white/15 text-white' : 'bg-white/5 text-white/30'
                            }`}
                        >
                            不出
                        </button>
                        <button
                            onClick={submitPlay}
                            disabled={!isMyTurn || !canSubmit}
                            className={`flex-1 py-2.5 rounded-xl text-[13px] font-black cursor-pointer ${isMyTurn && canSubmit ? 'bg-amber-400 text-amber-950' : 'bg-white/10 text-white/30'}`}
                        >
                            {selected.length ? `出这 ${selected.length} 张` : '出牌'}
                        </button>
                    </div>
                )}
            </div>

            {/* 牌桌聊天：常驻底部，打字时整桌暂停 */}
            <div className="shrink-0 border-t border-white/10 bg-black/25" style={{ paddingBottom: 'calc(var(--safe-bottom, 0px) + 0.4rem)' }}>
                {chatOpen && (
                    <div className="max-h-[34vh] overflow-y-auto px-3 py-2 space-y-1.5">
                        {tableChat.length === 0 && (
                            <p className="text-[10px] text-emerald-300/50 text-center py-1">牌桌上还没人说话，说一句试试</p>
                        )}
                        {tableChat.map((l) => (
                            <div key={l.id} className={`flex ${l.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[82%] rounded-xl px-2 py-1 ${l.role === 'user' ? 'bg-amber-400/90 text-amber-950' : 'bg-white/10 text-emerald-50'}`}>
                                    <div className={`text-[9px] leading-none mb-0.5 ${l.role === 'user' ? 'text-amber-900/70' : 'text-emerald-200/60'}`}>{l.speakerName}</div>
                                    <p className="text-[11.5px] leading-snug whitespace-pre-wrap break-words">{l.text}</p>
                                </div>
                            </div>
                        ))}
                        {chatBusyId && (
                            <p className="text-[10px] text-emerald-300/60 pt-0.5">
                                {seats.find((s) => s.id === chatBusyId)?.name} 正在打字…
                            </p>
                        )}
                    </div>
                )}

                <div className="flex items-center gap-1.5 px-3 pt-1.5">
                    <button
                        onClick={() => setChatOpen((o) => !o)}
                        className="shrink-0 h-9 px-2 rounded-xl bg-white/10 text-emerald-100 flex items-center cursor-pointer"
                        aria-label="展开牌桌对话"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
                        </svg>
                        {tableChat.length > 0 && <span className="ml-0.5 text-[10px] font-bold">{tableChat.length}</span>}
                    </button>
                    <input
                        value={chatDraft}
                        onChange={(e) => setChatDraft(e.target.value)}
                        onFocus={() => setPaused(true)}
                        onBlur={() => setPaused(false)}
                        onKeyDown={(e) => {
                            // 中文输入法选词时的回车不能当发送
                            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                                e.preventDefault();
                                sendChat();
                            }
                        }}
                        placeholder={paused ? '你说话的时候，大家都在等你' : '跟牌桌上说点什么'}
                        className="flex-1 min-w-0 h-9 px-3 rounded-xl bg-white/10 text-[12.5px] text-white placeholder:text-emerald-200/40 outline-none focus:bg-white/15"
                    />
                    <button
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={sendChat}
                        disabled={!chatDraft.trim()}
                        className={`shrink-0 h-9 px-3 rounded-xl text-[12px] font-black cursor-pointer ${chatDraft.trim() ? 'bg-amber-400 text-amber-950' : 'bg-white/5 text-white/30'}`}
                    >
                        发送
                    </button>
                </div>
            </div>

            {/* 结算浮层 */}
            {over && (
                <div className="absolute inset-0 z-20 bg-black/70 backdrop-blur-sm flex items-center justify-center px-6">
                    <div className="w-full max-w-xs rounded-3xl bg-white p-5 text-slate-800 shadow-2xl">
                        <div className="text-center">
                            <div className="text-3xl mb-1">
                                {state.winner === 'user' ? '🎉' : state.landlord === 'user' ? '😤' : '🙂'}
                            </div>
                            <h3 className="text-base font-black">
                                {state.winner === 'user'
                                    ? '你先走完了！'
                                    : state.landlord === 'user'
                                        ? '农民方赢了'
                                        : state.winner === state.landlord
                                            ? '地主赢了'
                                            : '农民方赢了'}
                            </h3>
                            <p className="text-[11px] text-slate-400 mt-1">
                                地主：{seats.find((s) => s.id === state.landlord)?.name || '—'} · 炸弹 {bombs(state)} 次
                            </p>
                        </div>

                        <div className="mt-3 space-y-1">
                            {state.order.map((p) => {
                                const seat = seats.find((s) => s.id === p);
                                const left = (state.hands[p] || []).length;
                                return (
                                    <div key={p} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg ${p === 'user' ? 'bg-amber-50' : ''}`}>
                                        <span className="text-[11px] font-bold text-slate-600 flex-1 truncate">
                                            {seat?.name}
                                            {state.landlord === p ? '（地主）' : ''}
                                        </span>
                                        <span className={`text-[11px] font-bold ${left === 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                                            {left === 0 ? '出完' : `剩 ${left} 张`}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>

                        <button onClick={() => setShowReport((s) => !s)} className="w-full mt-3 text-[11px] text-slate-400 cursor-pointer">
                            {showReport ? '收起战报 ▴' : '查看战报 ▾'}
                        </button>
                        {showReport && (
                            <pre className="mt-1 max-h-32 overflow-y-auto rounded-lg bg-slate-50 p-2 text-[10px] text-slate-500 whitespace-pre-wrap font-mono">{reportText}</pre>
                        )}

                        <div className="mt-3 space-y-2">
                            {tableChat.length > 0 && (
                                <p className="text-[10px] text-slate-400 text-center">牌桌上的 {tableChat.length} 句对话会一起转过去</p>
                            )}
                            <button onClick={forwardReport} className="w-full py-2.5 rounded-xl bg-emerald-600 text-white text-[13px] font-black cursor-pointer">
                                📤 转发战报到聊天
                            </button>
                            <button onClick={() => startGame(true)} className="w-full py-2.5 rounded-xl bg-slate-100 text-slate-700 text-[13px] font-black cursor-pointer">
                                🔄 再来一局
                            </button>
                            <button onClick={onBack} className="w-full py-2.5 rounded-xl bg-white border border-slate-200 text-slate-500 text-[13px] font-bold cursor-pointer">
                                返回大厅
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

/** 本局炸弹数：四张组 + 王炸（按已出的牌统计）。 */
function bombs(state: DdzState): number {
    const counts: Record<string, number> = {};
    for (const c of state.playedCards) {
        const r = cardRank(c);
        counts[r] = (counts[r] || 0) + 1;
    }
    let n = RANKS.filter((r) => counts[r] === 4).length;
    if (counts.BJ && counts.RJ) n += 1;
    return n;
}
