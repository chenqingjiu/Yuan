import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOS } from '../../context/OSContext';
import type { CharacterProfile } from '../../types';
import { CreatorRollBridge } from '../room3d/chibi/CreatorRollBridge';
import { decodeParts } from '../room3d/chibi/visitor';
import { selectedHairAssets, type HairSettings, type Parts } from '../room3d/chibi/types';
import { loadCreatorPartsForRender } from '../../utils/creatorPartsBlob';
import { FarmScene } from './FarmScene';
import {
    createFarm,
    harvest,
    isRipe,
    levelOf,
    levelProgress,
    needsWater,
    offlineReport,
    plant,
    plotSummary,
    remainingMs,
    stageOf,
    water,
    type FarmState,
} from '../../utils/farm/engine';
import { CROPS, type CropId } from '../../utils/farm/crops';

const CROP_ORDER: CropId[] = ['wheat', 'corn', 'carrot'];

/**
 * 一块田 —— 院子里的四块地。
 *
 * 逻辑全在 utils/farm/engine（纯函数、可测），这个文件只做三件事：喂状态、转点击、
 * 画 HUD。3D 在 FarmScene，角色用的是小屋同一套 chibi 素体。
 */
export default function FarmApp({ character, onBack }: { character?: CharacterProfile; onBack: () => void }) {
    const { addToast } = useOS();
    const hostRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<FarmScene | null>(null);

    const storageKey = `farm_state_${character?.id ?? 'guest'}`;

    const [farm, setFarm] = useState<FarmState>(() => {
        try {
            const raw = localStorage.getItem(`farm_state_${character?.id ?? 'guest'}`);
            if (raw) {
                const parsed = JSON.parse(raw) as FarmState;
                if (Array.isArray(parsed.plots) && parsed.plots.length === 4) return parsed;
            }
        } catch {
            /* 存档坏了就当新档，不能让一块田打不开 */
        }
        return createFarm();
    });

    const [now, setNow] = useState(() => Date.now());
    const [seed, setSeed] = useState<CropId>('wheat');
    const [busy, setBusy] = useState(false);
    const [offer, setOffer] = useState<string[]>([]);
    const [parts, setParts] = useState<Parts>();
    const [extraItems, setExtraItems] = useState<unknown[]>();
    const [creatorReady, setCreatorReady] = useState(false);

    const hair: HairSettings | undefined = character?.chibiStudio?.home3D?.hair;
    /**
     * 交给 createVisitor 的设定必须是完整结构：它会直接读 hair.layers.outfit。
     * 角色没捏过头发时 hair 是 undefined，这里补一层默认值兜住。
     */
    const [actorHair, setActorHair] = useState<HairSettings>(() => ({
        layers: {},
        extras: [],
        ...(character?.chibiStudio?.home3D?.hair ?? {}),
    }));
    const savedState =
        character?.chibiStudio?.home3D?.state ??
        character?.chibiStudio?.room?.state ??
        character?.chibiStudio?.vr?.state;

    // ---------- 存档 ----------

    useEffect(() => {
        try {
            localStorage.setItem(storageKey, JSON.stringify(farm));
        } catch {
            /* 隐私模式下写不进去就算了，不影响这一局 */
        }
    }, [farm, storageKey]);

    // 每秒重读一次时间，让作物自己长、倒计时自己走
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, []);

    // ---------- 场景 ----------

    useEffect(() => {
        if (!hostRef.current) return;
        const scene = new FarmScene({
            host: hostRef.current,
            onPlotClick: index => handlePlotClick(index),
        });
        sceneRef.current = scene;

        const onResize = () => scene.resize();
        window.addEventListener('resize', onResize);
        return () => {
            window.removeEventListener('resize', onResize);
            scene.dispose();
            sceneRef.current = null;
        };
        // handlePlotClick 用 ref 转发，避免重建场景
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // 把状态推给场景：地块作物 + 房子等级
    useEffect(() => {
        const scene = sceneRef.current;
        if (!scene) return;
        farm.plots.forEach((plot, i) => {
            scene.setPlot(i, { crop: plot.crop, stage: stageOf(plot, now) });
        });
        scene.setHouseLevel(levelOf(farm));
    }, [farm, now]);

    // 角色形象：跟小屋同一套 iframe 桥，解出来再塞进场景
    useEffect(() => {
        let cancelled = false;
        loadCreatorPartsForRender()
            .then(items => {
                if (!cancelled) setExtraItems(items.map(p => ({ ...p, categoryKey: p.categoryKey })));
            })
            .catch(() => {
                /* 自定义素材读不到就用内置的 */
            });
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!parts || !sceneRef.current) return;
        sceneRef.current.setActor(parts, actorHair).catch(() => {
            // 形象加载失败就摆一个最简单的小人，别让田里空着
            sceneRef.current?.setPlaceholderActor();
        });
    }, [parts, actorHair]);

    // ---------- 交互 ----------

    const clickRef = useRef<(index: number) => void>(() => {});
    const busyRef = useRef(false);
    const farmRef = useRef(farm);
    farmRef.current = farm;
    const seedRef = useRef(seed);
    seedRef.current = seed;

    const apply = useCallback(
        (result: { ok: boolean; reason?: string }, okText?: string) => {
            if (!result.ok) {
                if (result.reason) addToast(result.reason);
                return false;
            }
            if (okText) addToast(okText);
            return true;
        },
        [addToast],
    );

    const handlePlotClick = useCallback(
        (index: number) => {
            if (busyRef.current) return;
            const state = farmRef.current;
            const plot = state.plots[index];
            const t = Date.now();
            if (!plot) return;

            // 空地：种下选中的种子
            if (!plot.crop) {
                const result = plant(state, index, seedRef.current, t);
                if (!apply(result, `种下了${CROPS[seedRef.current].name}`)) return;
                setFarm(result.ok ? result.state : state);
                setNow(t);
                return;
            }

            // 该浇水了：让角色走过去浇
            if (needsWater(plot)) {
                busyRef.current = true;
                setBusy(true);
                sceneRef.current?.walkToPlot(index, () => {
                    const result = water(farmRef.current, index, Date.now());
                    if (result.ok) {
                        setFarm(result.state);
                        setNow(Date.now());
                        sceneRef.current?.playAction('water');
                    }
                    busyRef.current = false;
                    setBusy(false);
                });
                return;
            }

            // 熟了：走过去收
            if (isRipe(plot, t)) {
                busyRef.current = true;
                setBusy(true);
                sceneRef.current?.walkToPlot(index, () => {
                    const result = harvest(farmRef.current, index, Date.now());
                    if (result.ok) {
                        setFarm(result.state);
                        setNow(Date.now());
                        addToast(`收了${CROPS[plot.crop!].name} +${result.gained ?? 0}`);
                    }
                    busyRef.current = false;
                    setBusy(false);
                });
                return;
            }

            const left = remainingMs(plot, t);
            addToast(left > 60_000 ? `还要 ${Math.ceil(left / 60_000)} 分钟` : `还有 ${Math.max(1, Math.ceil(left / 1000))} 秒`);
        },
        [apply, addToast],
    );
    clickRef.current = handlePlotClick;

    // ---------- 入口日报 ----------

    const bootedRef = useRef(false);
    useEffect(() => {
        if (bootedRef.current) return;
        bootedRef.current = true;
        const lines = offlineReport(farm, Date.now());
        if (lines.length) setOffer(lines);
    }, [farm]);

    // ---------- 派生 ----------

    const level = levelOf(farm);
    const progress = levelProgress(farm);
    const tutorialPending = !farm.tutorialUsed;

    const seedCards = useMemo(
        () =>
            CROP_ORDER.map(id => {
                const def = CROPS[id];
                const unlocked = level >= def.level;
                return { def, unlocked, affordable: farm.coins >= def.seedCost };
            }),
        [level, farm.coins],
    );

    return (
        <div className="h-full w-full flex flex-col bg-[#bfe3f2] relative overflow-hidden select-none">
            <div ref={hostRef} className="absolute inset-0" />

            {/* 顶栏 */}
            <div
                className="relative z-10 shrink-0 flex items-center gap-2 px-3 pb-2"
                style={{ paddingTop: 'calc(var(--safe-top, 0px) + 0.55rem)' }}
            >
                <button
                    onClick={onBack}
                    className="w-8 h-8 rounded-full bg-white/85 backdrop-blur flex items-center justify-center text-slate-600 shadow-sm cursor-pointer active:scale-95"
                    aria-label="返回"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                    </svg>
                </button>

                <div className="flex-1 flex items-center gap-1.5">
                    <span className="px-2.5 py-1 rounded-full bg-white/85 backdrop-blur text-[12px] font-bold text-amber-700 shadow-sm">
                        🪙 {farm.coins}
                    </span>
                    <span className="px-2.5 py-1 rounded-full bg-white/85 backdrop-blur text-[12px] font-bold text-emerald-700 shadow-sm">
                        Lv.{level}
                    </span>
                    {level < 3 && (
                        <span className="px-2 py-1 rounded-full bg-white/60 backdrop-blur text-[10px] text-slate-600">
                            {progress.into}/{progress.need}
                        </span>
                    )}
                </div>
            </div>

            {/* 日报 */}
            {offer.length > 0 && (
                <div className="relative z-10 mx-3 mt-1 rounded-2xl bg-white/92 backdrop-blur px-3.5 py-3 shadow-lg">
                    <div className="flex items-start gap-2">
                        <span className="text-base leading-none mt-0.5">🌤️</span>
                        <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-bold text-slate-500">你不在的时候</p>
                            <ul className="mt-1 space-y-0.5">
                                {offer.slice(0, 4).map((line, i) => (
                                    <li key={i} className="text-[12px] text-slate-700 leading-snug">
                                        · {line}
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <button
                            onClick={() => setOffer([])}
                            className="text-slate-400 text-lg leading-none px-1 cursor-pointer"
                            aria-label="关闭"
                        >
                            ×
                        </button>
                    </div>
                </div>
            )}

            {busy && (
                <div className="relative z-10 mx-3 mt-1 self-start px-3 py-1 rounded-full bg-white/80 backdrop-blur text-[11px] text-slate-600">
                    {character?.name ?? '他'}正在过去…
                </div>
            )}

            <div className="flex-1" />

            {/* 种子栏 */}
            <div className="relative z-10 shrink-0 px-3 pb-3" style={{ paddingBottom: 'calc(var(--safe-bottom, 0px) + 0.75rem)' }}>
                {tutorialPending && (
                    <p className="mb-2 text-center text-[11px] text-white/95 drop-shadow">
                        先种一块麦子试试——浇水后一分钟就熟
                    </p>
                )}
                <div className="flex gap-2">
                    {seedCards.map(({ def, unlocked, affordable }) => {
                        const active = seed === def.id;
                        return (
                            <button
                                key={def.id}
                                onClick={() => {
                                    if (!unlocked) {
                                        addToast(`${def.name}要 ${def.level} 级才能种`);
                                        return;
                                    }
                                    setSeed(def.id);
                                }}
                                className={`flex-1 rounded-2xl px-2 py-2 text-center transition-all cursor-pointer ${
                                    active
                                        ? 'bg-white shadow-md ring-2 ring-emerald-400'
                                        : unlocked
                                          ? 'bg-white/75 backdrop-blur'
                                          : 'bg-white/45 backdrop-blur'
                                }`}
                            >
                                <div className={`text-[13px] font-black ${unlocked ? 'text-slate-800' : 'text-slate-400'}`}>
                                    {def.name}
                                </div>
                                <div className={`text-[9px] mt-0.5 ${unlocked ? 'text-slate-500' : 'text-slate-400'}`}>
                                    {unlocked ? (
                                        <>
                                            {def.seedCost} 币 · 卖 {def.price}
                                            {!affordable && ' · 钱不够'}
                                        </>
                                    ) : (
                                        `Lv.${def.level} 解锁`
                                    )}
                                </div>
                            </button>
                        );
                    })}
                </div>

                {/* 地块状态：点哪块看哪块，也给无障碍留一条文字通道 */}
                <div className="mt-2 flex gap-1.5">
                    {farm.plots.map((plot, i) => (
                        <button
                            key={i}
                            onClick={() => clickRef.current(i)}
                            className="flex-1 rounded-lg bg-white/60 backdrop-blur px-1 py-1 text-[9px] text-slate-600 leading-tight cursor-pointer active:bg-white/80"
                        >
                            <span className="block font-bold text-slate-500">{i + 1}号</span>
                            {plotSummary(plot, now)}
                        </button>
                    ))}
                </div>
            </div>

            {/* 角色形象还原桥：和小屋同一套，藏在屏幕外 */}
            {savedState && (
                <div style={{ position: 'fixed', left: -9999, top: 0, width: 1, height: 1, overflow: 'hidden' }}>
                    <CreatorRollBridge
                        request={creatorReady && extraItems ? 1 : 0}
                        savedState={savedState}
                        extraItems={extraItems}
                        onReady={() => setCreatorReady(true)}
                        onResult={result => {
                            const assets = selectedHairAssets(result.state);
                            const merged: HairSettings = {
                                ...actorHair,
                                assets: { ...(actorHair.assets ?? {}), ...assets },
                            };
                            decodeParts(result, merged)
                                .then(p => {
                                    setActorHair(merged);
                                    setParts(p);
                                })
                                .catch(() => sceneRef.current?.setPlaceholderActor());
                        }}
                        onError={() => {
                            /* 形象桥失败不阻塞农场 */
                        }}
                    />
                </div>
            )}
        </div>
    );
}
