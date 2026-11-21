import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOS } from '../../context/OSContext';
import { DB } from '../../utils/db';
import {
    BG_IMG,
    CHILI_ICON,
    GRILL_IMG,
    GUEST_IMG,
    MEATS,
    SKEWER_IMG,
    SPICY_LABEL,
    VEGS,
    foodOf,
} from '../../utils/games/bbq/assets';
import {
    ITEMS,
    ROUND_MS,
    SLOT_COUNT,
    canFlip,
    canServe,
    cookProgress,
    createGame,
    discard,
    flip,
    pickFood,
    pickSpicy,
    placeOnGrill,
    remainMs,
    serve,
    skewerState,
    summary,
    tick,
    useItem,
    type BbqState,
    type ItemId,
    type Skewer,
} from '../../utils/games/bbq/engine';

interface Props {
    onBack: () => void;
}

const fmtTime = (ms: number) => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** 竖屏提示：横过来才能开摊 */
function RotateHint({ onFullscreen }: { onFullscreen: () => void }) {
    return (
        <div className="absolute inset-0 z-50 bg-[#0b1020] flex flex-col items-center justify-center text-center px-8">
            <div className="text-5xl mb-6 animate-[spin_2.4s_ease-in-out_infinite]">📱</div>
            <p className="text-white text-base font-black">请把手机横过来</p>
            <p className="text-slate-400 text-[12px] mt-2 leading-relaxed">
                夜市摊是一张长桌，横屏才摆得下
                <br />转动手机后画面会自动铺满
            </p>
            <button
                onClick={onFullscreen}
                className="mt-6 px-5 py-2 rounded-full bg-amber-500 text-[#1a1206] text-[12px] font-black cursor-pointer active:scale-95 transition-transform"
            >
                全屏试试
            </button>
        </div>
    );
}

function GuestCardItem({ o, now }: { o: BbqState['orders'][number]; now: number }) {
    const left = o.patience - (now - o.bornAt);
    const ratio = Math.max(0, Math.min(1, left / o.patience));
    const urgent = ratio < 0.35;
    const meat = foodOf(o.meat);
    const eatDone = o.status !== 'waiting';

    return (
        <div
            className={`relative min-w-0 rounded-lg px-1.5 py-1 flex items-center gap-1.5 transition-all ${
                urgent ? 'bg-red-950/70 ring-1 ring-red-500/70' : 'bg-white/[0.07] ring-1 ring-white/10'
            } ${eatDone ? 'opacity-40' : ''}`}
        >
            <div className={`w-8 h-8 rounded-full overflow-hidden shrink-0 ${urgent ? 'ring-2 ring-red-400 animate-pulse' : ''}`}>
                <img src={GUEST_IMG[o.guest]} alt="" className="w-full h-full object-cover object-top" draggable={false} />
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                    <img src={meat.image} alt="" className="w-4 h-4 object-contain" draggable={false} />
                    <span className="text-[10px] text-amber-100 font-bold truncate">{meat.name}</span>
                    <img src={foodOf(o.veg).image} alt="" className="w-4 h-4 object-contain ml-0.5" draggable={false} />
                    <span className="text-[9px] text-slate-300 truncate">{foodOf(o.veg).name}</span>
                </div>
                <div className="flex items-center gap-0.5 mt-0.5">
                    {o.spicy === 0 ? (
                        <span className="text-[9px] text-emerald-300">不辣</span>
                    ) : (
                        Array.from({ length: o.spicy }).map((_, i) => (
                            <img key={i} src={CHILI_ICON} alt="" className="w-3.5 h-3.5 object-contain" draggable={false} />
                        ))
                    )}
                    {urgent && <span className="text-[9px] text-red-300 font-black ml-1">催！</span>}
                </div>
                <div className="h-1.5 mt-1 rounded-full bg-black/40 overflow-hidden">
                    <div
                        className={`h-full transition-[width] duration-100 ${urgent ? 'bg-red-500' : 'bg-amber-400'}`}
                        style={{ width: `${ratio * 100}%` }}
                    />
                </div>
            </div>
        </div>
    );
}

/** 炉位上的串 */
function SlotView({ k, now, onClick }: { k: Skewer | null; now: number; onClick: () => void }) {
    if (!k) {
        return (
            <div className="flex-1 rounded-lg border border-dashed border-white/10 flex items-center justify-center">
                <span className="text-[9px] text-white/20">空炉</span>
            </div>
        );
    }
    const st = skewerState(k, now);
    const flipReady = canFlip(k, now);
    const serveReady = st === 'done';
    const prog = cookProgress(k, now);
    const img = SKEWER_IMG[k.dead ? 'burnt' : st];
    const label = k.dead ? '糊了' : flipReady ? '翻面！' : serveReady ? '上菜！' : st === 'half' ? '另一面' : '烤着';
    const tone = k.dead
        ? 'border-white/10 bg-black/40'
        : serveReady
            ? 'border-emerald-400 bg-emerald-500/15 shadow-[0_0_14px_rgba(52,211,153,0.45)]'
            : flipReady
                ? 'border-amber-400 bg-amber-500/15 animate-pulse'
                : 'border-white/15 bg-white/[0.06]';

    return (
        <button onClick={onClick} className={`flex-1 min-w-0 rounded-lg border ${tone} flex flex-col items-center justify-center py-1 cursor-pointer transition-colors`}>
            <img src={img} alt="" className="h-[54px] object-contain drop-shadow-lg" draggable={false} />
            <span className={`text-[9px] font-black mt-0.5 ${serveReady ? 'text-emerald-300' : flipReady ? 'text-amber-300' : k.dead ? 'text-slate-500' : 'text-slate-300'}`}>
                {label}
            </span>
            <div className="w-[80%] h-[3px] rounded-full bg-black/50 overflow-hidden mt-0.5">
                <div className={`h-full ${k.dead ? 'bg-slate-600' : st === 'done' ? 'bg-emerald-400' : 'bg-amber-400'}`} style={{ width: `${prog * 100}%` }} />
            </div>
        </button>
    );
}

/** 对手面板 */
function RivalPanel({ state, now }: { state: BbqState; now: number }) {
    const r = state.rival;
    const frozen = now < r.frozenUntil;
    const lured = now < r.lureUntil;
    const busy = !frozen && now - r.taskStartedAt < r.taskMs;
    const showLine = r.line && now - r.lineAt < 4200;

    return (
        <div className="flex-1 min-h-0 flex flex-col px-2.5 py-2 gap-1.5">
            <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-full overflow-hidden bg-slate-700 ring-1 ring-white/20 shrink-0">
                    {r.avatar ? <img src={r.avatar} alt="" className="w-full h-full object-cover" draggable={false} /> : <div className="w-full h-full flex items-center justify-center text-sm">{r.name.slice(0, 1)}</div>}
                </div>
                <div className="min-w-0">
                    <p className="text-[11px] font-black text-white truncate leading-tight">{r.name} 的摊</p>
                    <p className="text-[9px] text-slate-400 leading-tight">烧烤 · 对面</p>
                </div>
            </div>

            <div className="rounded-lg bg-white/[0.06] px-2 py-1.5">
                <p className="text-[9px] text-slate-400">今晚营业额</p>
                <p className="text-xl font-black text-sky-300 leading-tight">¥{r.money}</p>
                <p className="text-[9px] text-slate-400 mt-0.5">
                    {r.served} 单 · 糊 {r.burned}
                </p>
            </div>

            <div className={`text-[10px] font-bold ${frozen ? 'text-red-300' : busy ? 'text-emerald-300' : 'text-amber-300'}`}>
                {now < r.frozenUntil ? `熄火中 ${Math.ceil((r.frozenUntil - now) / 1000)}s` : now - r.taskStartedAt < r.taskMs ? '正在烤…' : '在等下一桌'}
            </div>
            {lured && <div className="text-[9px] text-orange-300">客人被你的喇叭喊走了</div>}

            <div className="flex-1" />

            {showLine && (
                <div className="shrink-0 relative rounded-lg rounded-bl-none bg-[#f5f4ef] text-[#2a2f3a] text-[10px] leading-snug px-2 py-1.5 font-bold break-words">
                    {r.line}
                </div>
            )}
        </div>
    );
}

/** 道具栏 */
function ItemBar({ state, now, onUse }: { state: BbqState; now: number; onUse: (id: ItemId) => void }) {
    const [flash, setFlash] = useState<string | null>(null);
    return (
        <div className="shrink-0 px-2 pb-1.5">
            <div className="flex items-center gap-1 mb-0.5">
                <span className="text-[9px] text-slate-400">捣乱能量</span>
                <div className="flex gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <span key={i} className={`w-2 h-2 rounded-sm ${i < state.energy ? 'bg-amber-400' : 'bg-white/15'}`} />
                    ))}
                </div>
            </div>
            <div className="grid grid-cols-5 gap-1">
                {ITEMS.map((it) => {
                    const ok = state.energy >= it.cost;
                    return (
                        <button
                            key={it.id}
                            onClick={() => { if (!ok) return; onUse(it.id); setFlash(it.id); setTimeout(() => setFlash(null), 400); }}
                            title={it.desc}
                            className={`relative rounded-lg py-1 flex flex-col items-center cursor-pointer transition-all ${
                                ok ? 'bg-white/[0.09] active:scale-90' : 'bg-white/[0.03] opacity-45'
                            } ${flash === it.id ? 'ring-2 ring-amber-400' : ''}`}
                        >
                            <span className="text-base leading-none">{it.icon}</span>
                            <span className="text-[8px] text-slate-300 mt-0.5 leading-none">{it.name}</span>
                            <span className={`absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full text-[7px] font-black flex items-center justify-center ${ok ? 'bg-amber-400 text-black' : 'bg-slate-600 text-slate-300'}`}>
                                {it.cost}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

export default function BbqApp({ onBack }: Props) {
    const { characters, userProfile, addToast } = useOS();
    const rootRef = useRef<HTMLDivElement>(null);
    const [view, setView] = useState<'setup' | 'play'>('setup');
    const [rivalId, setRivalId] = useState<string>(() => characters[0]?.id || '');
    const [game, setGame] = useState<BbqState | null>(null);
    const [now, setNow] = useState(() => Date.now());
    const [landscape, setLandscape] = useState(true);
    const [forwarded, setForwarded] = useState(false);
    const [showReport, setShowReport] = useState(false);

    // 横屏检测
    useEffect(() => {
        const check = () => {
            const el = rootRef.current;
            const w = el?.clientWidth || window.innerWidth;
            const h = el?.clientHeight || window.innerHeight;
            setLandscape(w > h);
        };
        check();
        const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(check) : null;
        if (ro && rootRef.current) ro.observe(rootRef.current);
        window.addEventListener('resize', check);
        window.addEventListener('orientationchange', check);
        return () => {
            ro?.disconnect();
            window.removeEventListener('resize', check);
            window.removeEventListener('orientationchange', check);
        };
    }, [view]);

    // 主循环：100ms 推一次
    useEffect(() => {
        if (view !== 'play' || !game || game.phase === 'over') return;
        const id = setInterval(() => {
            const t = Date.now();
            setNow(t);
            setGame((g) => (g && g.phase === 'playing' ? tick(g, t) : g));
        }, 100);
        return () => clearInterval(id);
    }, [view, game?.phase]);

    // 预加载
    useEffect(() => {
        [...MEATS, ...VEGS, ...[1, 2, 3, 4].map((i) => ({ image: GUEST_IMG[i - 1] }))].forEach((f) => {
            const im = new Image();
            im.src = f.image;
        });
        [GRILL_IMG, BG_IMG, CHILI_ICON, ...Object.values(SKEWER_IMG)].forEach((s) => {
            const im = new Image();
            im.src = s;
        });
    }, []);

    const rival = characters.find((c) => c.id === rivalId) || characters[0];

    const start = useCallback(() => {
        if (!rival) {
            addToast('还没有角色，先去「神经链接」创建一个', 'info');
            return;
        }
        const t = Date.now();
        setGame(createGame({ now: t, rivalName: rival.name, rivalAvatar: rival.avatar }));
        setNow(t);
        setForwarded(false);
        setShowReport(false);
        setView('play');
        // 顺手尝试全屏（iOS 会失败，忽略）
        (document.documentElement as any).requestFullscreen?.().catch?.(() => { });
    }, [rival, addToast]);

    const onSlotClick = (k: Skewer) => {
        const t = Date.now();
        setNow(t);
        setGame((g) => {
            if (!g) return g;
            const st = skewerState(k, t);
            if (st === 'burnt') return discard(g, k.id, t);
            if (canFlip(k, t)) return flip(g, k.id, t);
            if (canServe(k, t)) return serve(g, k.id, t);
            return g;
        });
    };

    const onPick = (kind: 'meat' | 'veg', id: string) => {
        const t = Date.now();
        setNow(t);
        setGame((g) => (g ? pickFood(g, kind, id, t) : g));
    };

    const onSpicy = (v: 0 | 1 | 2) => {
        const t = Date.now();
        setNow(t);
        setGame((g) => (g ? pickSpicy(g, v, t) : g));
    };

    const onUse = (id: ItemId) => {
        const t = Date.now();
        setNow(t);
        setGame((g) => (g ? useItem(g, id, t) : g));
    };

    const forward = async () => {
        if (!game || !rival) return;
        const sm = summary(game);
        const transcript = game.log.join('\n');
        const content = [
            `刚和你在夜市各摆了一个烧烤摊，比了五分钟。`,
            sm.win ? `结果：我 ¥${sm.money}，你 ¥${sm.rivalMoney}，我赢你 ¥${sm.diff}。` : sm.draw ? `结果：打平，都是 ¥${sm.money}。` : `结果：我 ¥${sm.money}，你 ¥${sm.rivalMoney}，你赢我 ¥${sm.diff}。`,
            `我一共上了 ${sm.served} 单，其中 ${sm.perfect} 单零失误；糊了 ${sm.burnt} 串，还有 ${sm.missed} 位客人等不及走了。`,
            sm.rivalBurned ? `你那边糊了 ${sm.rivalBurned} 单，我看见了。` : '',
            `\n当晚经过：\n${transcript}`,
        ].filter(Boolean).join('\n');

        try {
            await DB.saveMessage({
                charId: rival.id,
                role: 'user',
                type: 'game_replay',
                content,
                metadata: {
                    game: '夜市烧烤对决',
                    subtitle: sm.subtitle,
                    rounds: sm.served,
                    playerCount: 2,
                    mvp: sm.win ? (userProfile?.name || '你') : rival.name,
                    transcript,
                    summary: content,
                    myMoney: sm.money,
                    rivalMoney: sm.rivalMoney,
                    charIds: [rival.id],
                    charNames: [rival.name],
                    ts: Date.now(),
                },
            });
            setForwarded(true);
            addToast(`战报已发到和${rival.name}的聊天`, 'success');
        } catch (e) {
            addToast('转发失败，稍后再试', 'error');
        }
    };

    // ---------------------------------------------------------------- 选人

    if (view === 'setup') {
        return (
            <div className="h-full w-full flex flex-col bg-slate-50 overflow-hidden">
                <div className="shrink-0 flex items-center px-4 py-3 bg-white border-b border-slate-100" style={{ paddingTop: 'calc(var(--safe-top, 0px) + 0.5rem)' }}>
                    <button onClick={onBack} className="p-1 -ml-1 text-slate-500 hover:text-slate-700 cursor-pointer">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
                    </button>
                    <span className="ml-1 text-base font-black text-slate-800">夜市烧烤</span>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                    <div className="rounded-2xl bg-gradient-to-br from-[#2a1a10] to-[#4a2a12] p-4 text-white">
                        <p className="text-lg font-black">🔥 夜市烧烤对决</p>
                        <p className="text-[12px] text-amber-100/90 mt-1 leading-relaxed">
                            你和 TA 各守一个摊，抢同一条街的客人。
                            五分钟，比谁赚得多。中途可以互相捣乱。
                        </p>
                    </div>

                    <div>
                        <h3 className="text-sm font-bold text-slate-800">选一个对手</h3>
                        <p className="text-[11px] text-slate-400 mt-0.5 mb-2">他会在你对面摆摊，用他自己的名字</p>
                        {characters.length === 0 ? (
                            <p className="text-xs text-slate-400 py-6 text-center">还没有角色，先去「神经链接」创建吧</p>
                        ) : (
                            <div className="grid grid-cols-2 gap-2">
                                {characters.map((c) => {
                                    const on = c.id === (rival?.id || rivalId);
                                    return (
                                        <button
                                            key={c.id}
                                            onClick={() => setRivalId(c.id)}
                                            className={`flex items-center gap-2 p-2.5 rounded-xl border text-left cursor-pointer transition-colors ${on ? 'bg-amber-50 border-amber-300' : 'bg-white border-slate-200'}`}
                                        >
                                            <span className="w-8 h-8 rounded-full bg-amber-200 flex items-center justify-center text-xs font-bold text-amber-800 shrink-0 overflow-hidden">
                                                {c.avatar ? <img src={c.avatar} className="w-full h-full object-cover" alt="" /> : c.name.slice(0, 1)}
                                            </span>
                                            <span className="text-[13px] font-bold text-slate-700 truncate">{c.name}</span>
                                            <span className={`ml-auto w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${on ? 'border-amber-500' : 'border-slate-300'}`}>
                                                {on && <span className="w-2 h-2 rounded-full bg-amber-500" />}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-[11px] text-amber-900/80 leading-relaxed space-y-1">
                        <p className="font-bold">怎么玩</p>
                        <p>① 客人头顶显示要什么：肉 + 菜 + 辣度，点齐三样自动成串</p>
                        <p>② 点待烤区的串上炉，四个炉位同时烤</p>
                        <p>③ 变半熟时点一下翻面，全熟了再点一下上菜</p>
                        <p>④ 做得好攒能量，用道具去对面捣乱</p>
                    </div>

                    <button
                        onClick={start}
                        disabled={!rival}
                        className="w-full py-3 rounded-xl bg-amber-500 text-[#1a1206] text-[14px] font-black cursor-pointer disabled:opacity-40 active:scale-[0.99] transition-transform"
                    >
                        {rival ? `和 ${rival.name} 开摊` : '先选个角色'}
                    </button>
                    <p className="text-[10px] text-slate-400 text-center pb-4">进去之后请把手机横过来</p>
                </div>
            </div>
        );
    }

    if (!game) return null;

    const sm = summary(game);
    const over = game.phase === 'over';
    const remain = remainMs({ ...game, now });
    const waiting = game.orders.filter((o) => o.status === 'waiting');
    const onGrill = game.skewers.filter((k) => k.slot >= 0);
    const bench = game.skewers.filter((k) => k.slot < 0);

    return (
        <div ref={rootRef} className="relative h-full w-full overflow-hidden bg-[#0b1020] select-none">
            {/* 背景：夜市街 */}
            <div className="absolute inset-0">
                <img src={BG_IMG} alt="" className="w-full h-full object-cover scale-110 blur-[3px] brightness-[0.38]" draggable={false} />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0b1020] via-[#0b1020]/70 to-[#0b1020]/40" />
            </div>

            {!landscape && <RotateHint onFullscreen={() => (document.documentElement as any).requestFullscreen?.().catch?.(() => { })} />}

            <div className="relative h-full w-full flex flex-col">
                {/* 顶栏 */}
                <div className="shrink-0 flex items-center gap-2 px-2.5 py-1">
                    <div className="flex items-center gap-1 shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                        <span className="text-[9px] text-slate-400">你</span>
                        <span className="text-[14px] font-black text-amber-300 leading-none">¥{game.money}</span>
                    </div>
                    <div className="relative flex-1 min-w-0 h-[14px] flex items-center">
                        <div className="w-full h-[6px] rounded-full bg-white/10 overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-amber-500 to-orange-400 transition-[width] duration-200" style={{ width: `${Math.max(0, Math.min(100, (1 - remain / ROUND_MS) * 100))}%` }} />
                        </div>
                        <span className={`absolute inset-0 flex items-center justify-center text-[10px] font-black tabular-nums ${remain < 30000 ? 'text-red-400' : 'text-white/90'}`} style={{ textShadow: '0 1px 2px rgba(0,0,0,0.9)' }}>{fmtTime(remain)}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 max-w-[38%] pl-2 border-l border-white/10">
                        <span className="text-[14px] font-black text-sky-300 leading-none shrink-0">¥{game.rival.money}</span>
                        <span className="text-[9px] text-slate-400 truncate">{game.rival.name}</span>
                    </div>
                </div>

                {/* 主体：左操作 / 右对手 */}
                <div className="flex-1 min-h-0 flex">
                    {/* 左 */}
                    <div className="flex-[68] min-w-0 flex flex-col px-2 pb-2 gap-1.5">
                        {/* 客人 */}
                        <div className="shrink-0 grid grid-cols-3 gap-1.5 h-[56px]">
                            {[0, 1, 2].map((i) => {
                                const o = waiting[i];
                                return o ? (
                                    <GuestCardItem key={o.id} o={o} now={now} />
                                ) : (
                                    <div key={'empty' + i} className="rounded-lg border border-dashed border-white/10 flex items-center justify-center">
                                        <span className="text-[9px] text-white/25">空位</span>
                                    </div>
                                );
                            })}
                        </div>

                        {/* 炉子 */}
                        <div className="relative flex-1 min-h-0 rounded-xl overflow-hidden">
                            <img src={GRILL_IMG} alt="" className="absolute inset-0 w-full h-full object-cover opacity-45" draggable={false} />
                            <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/30 to-black/60" />
                            <div className="relative h-full flex items-stretch gap-1.5 p-1.5">
                                {Array.from({ length: SLOT_COUNT }).map((_, i) => {
                                    const id = game.slots[i];
                                    const k = id != null ? onGrill.find((x) => x.id === id) || null : null;
                                    return <SlotView key={i} k={k} now={now} onClick={() => k && onSlotClick(k)} />;
                                })}
                            </div>
                        </div>

                        {/* 待烤区 */}
                        <div className="shrink-0 flex items-center gap-1.5 h-[34px]">
                            <span className="text-[9px] text-slate-400 shrink-0 w-8 leading-tight">待烤<br />{bench.length}/3</span>
                            <div className="flex-1 flex gap-1.5">
                                {bench.length === 0 ? (
                                    <div className="flex-1 rounded-lg border border-dashed border-white/10 flex items-center justify-center">
                                        <span className="text-[9px] text-white/20">点食材凑一单</span>
                                    </div>
                                ) : (
                                    bench.map((k) => (
                                        <button
                                            key={k.id}
                                            onClick={() => { const t = Date.now(); setNow(t); setGame((g) => (g ? placeOnGrill(g, k.id, t) : g)); }}
                                            className="flex-1 rounded-lg bg-white/[0.07] border border-white/15 flex items-center gap-1 px-1 cursor-pointer active:scale-95 transition-transform"
                                        >
                                            <img src={SKEWER_IMG.raw} alt="" className="h-6 object-contain" draggable={false} />
                                            <div className="min-w-0">
                                                <p className="text-[9px] text-amber-100 font-bold truncate leading-tight">{foodOf(k.meat).name}</p>
                                                <p className="text-[8px] text-slate-400 truncate leading-tight">{foodOf(k.veg).name} · {SPICY_LABEL[k.spicy]}</p>
                                            </div>
                                            <span className="ml-auto text-[8px] text-emerald-300 font-black shrink-0">上炉</span>
                                        </button>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* 食材架 */}
                        <div className="shrink-0 rounded-lg bg-black/35 border border-white/10 p-1">
                            <div className="flex items-center gap-1">
                                <div className="flex-1 grid grid-cols-4 gap-1">
                                    {MEATS.map((m) => (
                                        <button
                                            key={m.id}
                                            onClick={() => onPick('meat', m.id)}
                                            className={`rounded-lg py-0.5 flex flex-col items-center cursor-pointer transition-transform active:scale-90 ${game.pick.meat === m.id ? 'bg-amber-400/25 ring-1 ring-amber-400' : 'bg-white/[0.05]'}`}
                                        >
                                            <img src={m.image} alt="" className="h-[26px] object-contain" draggable={false} />
                                            <span className="text-[8px] text-slate-300 leading-tight">{m.name}</span>
                                        </button>
                                    ))}
                                </div>
                                <div className="w-px h-8 bg-white/10" />
                                <div className="flex-1 grid grid-cols-4 gap-1">
                                    {VEGS.map((v) => (
                                        <button
                                            key={v.id}
                                            onClick={() => onPick('veg', v.id)}
                                            className={`rounded-lg py-0.5 flex flex-col items-center cursor-pointer transition-transform active:scale-90 ${game.pick.veg === v.id ? 'bg-emerald-400/25 ring-1 ring-emerald-400' : 'bg-white/[0.05]'}`}
                                        >
                                            <img src={v.image} alt="" className="h-[26px] object-contain" draggable={false} />
                                            <span className="text-[8px] text-slate-300 leading-tight">{v.name}</span>
                                        </button>
                                    ))}
                                </div>
                                <div className="w-px h-8 bg-white/10" />
                                <div className="flex flex-col gap-0.5 w-[46px]">
                                    {([0, 1, 2] as const).map((s) => {
                                        const on = game.pick.spicy === s;
                                        const tone = s === 0 ? 'text-emerald-300' : s === 1 ? 'text-amber-300' : 'text-red-300';
                                        return (
                                            <button
                                                key={s}
                                                onClick={() => onSpicy(s)}
                                                className={`flex-1 rounded-md flex items-center justify-center cursor-pointer transition-colors ${on ? 'bg-white/20 ring-1 ring-white/60' : 'bg-white/[0.05]'}`}
                                            >
                                                <span className={`text-[9px] font-black leading-none ${tone}`}>{SPICY_LABEL[s]}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 右：对手 */}
                    <div className="flex-[32] min-w-0 flex flex-col border-l border-white/10 bg-black/25">
                        <RivalPanel state={{ ...game, now }} now={now} />
                        <ItemBar state={game} now={now} onUse={onUse} />
                    </div>
                </div>
            </div>

            {/* 飘字 */}
            {game.toast && (
                <div className="absolute left-1/2 -translate-x-1/2 top-[18%] pointer-events-none">
                    <div className={`px-3 py-1 rounded-full text-[12px] font-black ${game.toast.kind === 'good' ? 'bg-emerald-500 text-white' : game.toast.kind === 'bad' ? 'bg-red-500 text-white' : 'bg-white/90 text-slate-800'}`}>
                        {game.toast.text}
                    </div>
                </div>
            )}

            {/* 结算 */}
            {over && !showReport && (
                <div className="absolute inset-0 z-40 bg-black/75 backdrop-blur-sm flex items-center justify-center px-6">
                    <div className="w-full max-w-[420px] rounded-2xl bg-[#121828] border border-white/10 p-4">
                        <p className="text-center text-[11px] text-slate-400">打烊了</p>
                        <div className="flex items-end justify-center gap-4 mt-1">
                            <div className="text-center">
                                <p className="text-[10px] text-amber-300">你</p>
                                <p className={`text-2xl font-black ${sm.win ? 'text-amber-300' : 'text-slate-200'}`}>¥{sm.money}</p>
                            </div>
                            <span className="text-slate-500 text-sm pb-1">VS</span>
                            <div className="text-center">
                                <p className="text-[10px] text-sky-300 truncate max-w-[90px]">{game.rival.name}</p>
                                <p className={`text-2xl font-black ${!sm.win && !sm.draw ? 'text-sky-300' : 'text-slate-200'}`}>¥{sm.rivalMoney}</p>
                            </div>
                        </div>
                        <p className="text-center text-[13px] font-black mt-2 text-white">
                            {sm.win ? `你赢了 ¥${sm.diff}` : sm.draw ? '打平了' : `输了 ¥${sm.diff}`}
                        </p>
                        <div className="grid grid-cols-2 gap-2 mt-3 text-[10px]">
                            <div className="rounded-lg bg-white/5 px-2 py-1.5 flex justify-between"><span className="text-slate-400">上菜</span><span className="text-slate-100 font-bold">{sm.served} 单</span></div>
                            <div className="rounded-lg bg-white/5 px-2 py-1.5 flex justify-between"><span className="text-slate-400">零失误</span><span className="text-emerald-300 font-bold">{sm.perfect} 单</span></div>
                            <div className="rounded-lg bg-white/5 px-2 py-1.5 flex justify-between"><span className="text-slate-400">烤糊</span><span className="text-red-300 font-bold">{sm.burnt} 串</span></div>
                            <div className="rounded-lg bg-white/5 px-2 py-1.5 flex justify-between"><span className="text-slate-400">客人走掉</span><span className="text-slate-300 font-bold">{sm.missed} 位</span></div>
                        </div>
                        <div className="mt-3 space-y-2">
                            <button onClick={forward} disabled={forwarded} className="w-full py-2.5 rounded-xl bg-amber-500 text-[#1a1206] text-[13px] font-black cursor-pointer disabled:opacity-60">
                                {forwarded ? '✓ 已发到聊天' : '📤 把战报发给 TA'}
                            </button>
                            <button onClick={() => setShowReport(true)} className="w-full py-2 rounded-xl bg-white/10 text-slate-200 text-[12px] font-bold cursor-pointer">
                                看当晚经过
                            </button>
                            <div className="flex gap-2">
                                <button onClick={start} className="flex-1 py-2 rounded-xl bg-white/10 text-slate-200 text-[12px] font-bold cursor-pointer">再来一局</button>
                                <button onClick={onBack} className="flex-1 py-2 rounded-xl bg-white/5 text-slate-400 text-[12px] font-bold cursor-pointer">返回大厅</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* 经过全文 */}
            {showReport && (
                <div className="absolute inset-0 z-40 bg-black/80 backdrop-blur-sm flex items-center justify-center px-6">
                    <div className="w-full max-w-[460px] max-h-[86%] rounded-2xl bg-[#121828] border border-white/10 p-3 flex flex-col">
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-[13px] font-black text-white">当晚经过</p>
                            <button onClick={() => setShowReport(false)} className="text-[11px] text-slate-400 cursor-pointer">收起</button>
                        </div>
                        <div className="flex-1 overflow-y-auto rounded-lg bg-black/40 p-2.5 text-[10.5px] text-slate-300 leading-relaxed whitespace-pre-wrap font-mono">
                            {game.log.join('\n') || '（这一局没留下记录）'}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
