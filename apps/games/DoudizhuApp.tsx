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

    const stateRef = useRef<DdzState | null>(null);
    const seatsRef = useRef<Seat[]>([]);
    const spokenRef = useRef(0);
    /** 本局出牌过程记录（战报用）。 */
    const playLogRef = useRef<string[]>([]);

    useEffect(() => { stateRef.current = state; }, [state]);
    useEffect(() => { seatsRef.current = seats; }, [seats]);

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
            const res = await callGameApi(endpoint, endpoint, false, {
                system: [
                    `你正在和用户一起打斗地主，你是「${seat.name}」。`,
                    seat.persona ? `你的人设：${seat.persona}` : '',
                    '用一句话（不超过18个字）说出此刻的反应或吐槽。',
                    '只输出这一句话：不要引号、不要动作描写、不要旁白、不要解释你在做什么。',
                ].filter(Boolean).join('\n'),
                messages: [{ role: 'user', content: `局面：${describeSituation(s, pid)}。你刚才：${fallback}` }],
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
        if (!state || state.phase === 'over' || state.currentPlayer === 'user') return;
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
    }, [state]);

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
        // 内容给模型看：完整战报 + 过程，让角色明确「刚和用户打了一局斗地主」。
        const fullContent = transcript
            ? `${reportText}\n\n对局过程（你我同桌）：\n${transcript}`
            : reportText;
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
            <div className="shrink-0 px-3 pb-3" style={{ paddingBottom: 'calc(var(--safe-bottom, 0px) + 0.75rem)' }}>
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
