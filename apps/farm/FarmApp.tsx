import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOS } from '../../context/OSContext';
import type { CharacterProfile } from '../../types';
import { CreatorRollBridge } from '../room3d/chibi/CreatorRollBridge';
import { decodeParts } from '../room3d/chibi/visitor';
import { selectedHairAssets, type HairSettings, type Parts } from '../room3d/chibi/types';
import { loadCreatorPartsForRender } from '../../utils/creatorPartsBlob';
import { FarmScene } from './FarmScene';
import {
    buyHouse,
    canBuyHouse,
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
    setHouseStage,
    stageOf,
    water,
    type FarmState,
} from '../../utils/farm/engine';
import { CROPS, HOUSE_STAGES, MAX_LEVEL, PLOT_COUNT, type CropId, type HouseStage } from '../../utils/farm/crops';

const CROP_ORDER: CropId[] = ['wheat', 'corn', 'carrot'];

/** 干活的动作时长：走到位之后蹲下 → 生效 → 起身 */
const ACTION_MS = 1700;
const APPLY_AT = 850;

/** 竖屏提示：院子是横着铺开的，竖着看只剩中间一条 */
function RotateHint() {
    return (
        <div className="absolute inset-0 z-50 bg-[#0d1710] flex flex-col items-center justify-center text-center px-8">
            <div className="text-5xl mb-6 animate-[spin_2.4s_ease-in-out_infinite]">📱</div>
            <p className="text-white text-base font-black">把手机横过来</p>
            <p className="text-emerald-200/70 text-[12px] mt-2 leading-relaxed">
                房子在前、六块地在后，横屏才看得全
                <br />转过来画面会自动铺满
            </p>
            <button
                onClick={() => (document.documentElement as never as { requestFullscreen?: () => Promise<void> })
                    .requestFullscreen?.()
                    ?.catch?.(() => {})}
                className="mt-6 px-5 py-2 rounded-full bg-emerald-400 text-[#0d2417] text-[12px] font-black cursor-pointer active:scale-95 transition-transform"
            >
                全屏试试
            </button>
        </div>
    );
}

/**
 * 一块田 —— 院子里的六块地。
 *
 * 逻辑全在 utils/farm/engine（纯函数、可测），这个文件只做三件事：喂状态、转点击、
 * 画 HUD。3D 在 FarmScene，角色用的是小屋同一套 chibi 素体。
 */
export default function FarmApp({ character, onBack }: { character?: CharacterProfile; onBack: () => void }) {
    const { addToast } = useOS();
    const hostRef = useRef<HTMLDivElement>(null);
    const rootRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<FarmScene | null>(null);
    /** 这块田是按横屏构图做的，竖屏先请人转过来 */
    const [landscape, setLandscape] = useState(true);

    const storageKey = `farm_state_v2_${character?.id ?? 'guest'}`;

    const [farm, setFarm] = useState<FarmState>(() => {
        try {
            const raw = localStorage.getItem(`farm_state_v2_${character?.id ?? 'guest'}`);
            if (raw) {
                const parsed = JSON.parse(raw) as FarmState;
                if (Array.isArray(parsed.plots) && parsed.plots.length === PLOT_COUNT && Array.isArray(parsed.ownedHouses)) {
                    return parsed;
                }
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
    const [shopOpen, setShopOpen] = useState(false);

    useEffect(() => {
        const el = rootRef.current;
        const check = () => {
            const w = el?.clientWidth || window.innerWidth;
            const h = el?.clientHeight || window.innerHeight;
            setLandscape(w > h);
        };
        check();
        const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(check) : null;
        if (ro && el) ro.observe(el);
        window.addEventListener('resize', check);
        window.addEventListener('orientationchange', check);
        return () => {
            ro?.disconnect();
            window.removeEventListener('resize', check);
            window.removeEventListener('orientationchange', check);
        };
    }, []);

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

    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, []);

    // ---------- 场景 ----------

    const clickRef = useRef<(index: number) => void>(() => {});
    const busyRef = useRef(false);
    const farmRef = useRef(farm);
    farmRef.current = farm;
    const seedRef = useRef(seed);
    seedRef.current = seed;

    useEffect(() => {
        if (!hostRef.current) return;
        const scene = new FarmScene({
            host: hostRef.current,
            onPlotClick: index => clickRef.current(index),
            onGroundClick: (x, z) => {
                if (busyRef.current) return;
                scene.walkToXZ(x, z);
            },
            onActorClick: () => {
                scene.blink();
            },
        });
        sceneRef.current = scene;

        const onResize = () => scene.resize();
        window.addEventListener('resize', onResize);
        // 没有存档形象（访客、或形象桥还没回来）时先摆个占位小人：
        // 场景里没有可动的身体，走路回调不会触发，点地块就会没反应。
        const placeholderTimer = window.setTimeout(() => scene.setPlaceholderActor(), 1200);
        return () => {
            window.clearTimeout(placeholderTimer);
            window.removeEventListener('resize', onResize);
            scene.dispose();
            sceneRef.current = null;
        };
    }, []);

    // 状态推给场景
    useEffect(() => {
        const scene = sceneRef.current;
        if (!scene) return;
        farm.plots.forEach((plot, i) => {
            scene.setPlot(i, { crop: plot.crop, stage: stageOf(plot, now) });
        });
        scene.setHouseLevel(farm.houseStage);
    }, [farm, now]);

    // 角色形象
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
            sceneRef.current?.setPlaceholderActor();
        });
    }, [parts, actorHair]);

    // ---------- 交互 ----------

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

    /** 走过去 → 蹲下干活 → 生效 → 起身。动作和状态变化要卡在一起才像在干活。 */
    const workAt = useCallback(
        (index: number, kind: 'plant' | 'water' | 'harvest', commit: () => void) => {
            const scene = sceneRef.current;
            if (!scene) return;
            busyRef.current = true;
            setBusy(true);
            scene.walkToPlot(index, () => {
                scene.playAction(kind, ACTION_MS);
                window.setTimeout(() => {
                    commit();
                    setNow(Date.now());
                }, APPLY_AT);
                window.setTimeout(() => {
                    busyRef.current = false;
                    setBusy(false);
                    scene.stepBack(0.35);
                }, ACTION_MS);
            });
        },
        [],
    );

    const handlePlotClick = useCallback(
        (index: number) => {
            if (busyRef.current) {
                addToast('他正忙着，等一下');
                return;
            }
            const state = farmRef.current;
            const plot = state.plots[index];
            if (!plot) return;
            const t = Date.now();

            // 空地：走过去蹲下种
            if (!plot.crop) {
                const cropId = seedRef.current;
                const check = plant(state, index, cropId, t);
                if (!check.ok) {
                    addToast(check.reason);
                    return;
                }
                workAt(index, 'plant', () => {
                    const result = plant(farmRef.current, index, cropId, Date.now());
                    if (result.ok) {
                        setFarm(result.state);
                        addToast(`种下${CROPS[cropId].name}`);
                    }
                });
                return;
            }

            // 待浇水
            if (needsWater(plot)) {
                workAt(index, 'water', () => {
                    const result = water(farmRef.current, index, Date.now());
                    if (result.ok) setFarm(result.state);
                });
                return;
            }

            // 熟了
            if (isRipe(plot, t)) {
                const crop = plot.crop;
                workAt(index, 'harvest', () => {
                    const result = harvest(farmRef.current, index, Date.now());
                    if (result.ok) {
                        setFarm(result.state);
                        addToast(`收了${CROPS[crop].name}，+${result.gained ?? 0} 币`);
                    }
                });
                return;
            }

            const left = remainingMs(plot, t);
            addToast(left > 60_000 ? `还要 ${Math.ceil(left / 60_000)} 分钟` : `还有 ${Math.max(1, Math.ceil(left / 1000))} 秒`);
        },
        [addToast, workAt],
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
    const curHouse = HOUSE_STAGES.find(h => h.stage === farm.houseStage) ?? HOUSE_STAGES[0];
    const nextHouse = HOUSE_STAGES.find(h => !farm.ownedHouses.includes(h.stage));

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
        <div ref={rootRef} className="h-full w-full flex flex-col bg-[#bfe3f2] relative overflow-hidden select-none">
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
                    {level < MAX_LEVEL && (
                        <span className="px-2 py-1 rounded-full bg-white/60 backdrop-blur text-[10px] text-slate-600 tabular-nums">
                            {progress.into}/{progress.need}
                        </span>
                    )}
                </div>

                <button
                    onClick={() => setShopOpen(true)}
                    className="shrink-0 px-2.5 py-1 rounded-full bg-white/85 backdrop-blur text-[11px] font-bold text-slate-700 shadow-sm cursor-pointer active:scale-95 flex items-center gap-1"
                >
                    🏠 {curHouse.name}
                    {nextHouse && <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />}
                </button>
            </div>

            {/* 日报 */}
            {offer.length > 0 && (
                <div className="relative z-10 mx-3 mt-1 rounded-2xl bg-white/92 backdrop-blur px-3.5 py-3 shadow-lg self-start max-w-[300px]">
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

            {/* 底部：种子 + 地块 */}
            <div
                className={`relative z-10 shrink-0 px-3 ${landscape ? 'pb-1.5' : 'pb-3'}`}
                style={{ paddingBottom: landscape ? 'calc(var(--safe-bottom, 0px) + 0.4rem)' : 'calc(var(--safe-bottom, 0px) + 0.65rem)' }}
            >
                {tutorialPending && (
                    <p className={`text-center text-white/95 drop-shadow ${landscape ? 'mb-1 text-[10px]' : 'mb-2 text-[11px]'}`}>
                        先种一块麦子试试——浇水后一分钟就熟
                    </p>
                )}
                <div className={`flex items-end ${landscape ? 'gap-1.5 max-w-[560px]' : 'gap-2'}`}>
                    <div className="flex gap-1.5 flex-1 min-w-0">
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
                                    className={`flex-1 rounded-2xl px-2 text-center transition-all cursor-pointer ${landscape ? 'py-1' : 'py-1.5'} ${
                                        active
                                            ? 'bg-white shadow-md ring-2 ring-emerald-400'
                                            : unlocked
                                              ? 'bg-white/75 backdrop-blur'
                                              : 'bg-white/45 backdrop-blur'
                                    }`}
                                >
                                    <div className={`text-[12px] font-black leading-tight ${unlocked ? 'text-slate-800' : 'text-slate-400'}`}>
                                        {def.name}
                                    </div>
                                    <div className={`text-[9px] mt-0.5 leading-tight ${unlocked ? 'text-slate-500' : 'text-slate-400'}`}>
                                        {unlocked ? (
                                            <>
                                                籽{def.seedCost} · 收{def.price}
                                                {!affordable && ' · 钱不够'}
                                            </>
                                        ) : (
                                            `Lv.${def.level}`
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* 地块状态文字通道：横屏时地面上的地块能直接点，这排会挡画面，只留竖屏 */}
                {!landscape && (
                    <div className="mt-1.5 flex gap-1">
                        {farm.plots.map((plot, i) => (
                            <button
                                key={i}
                                onClick={() => clickRef.current(i)}
                                className="flex-1 min-w-0 rounded-lg bg-white/55 backdrop-blur px-1 py-1 text-[9px] text-slate-600 leading-tight cursor-pointer active:bg-white/80"
                            >
                                <span className="block font-bold text-slate-500">{i + 1}号</span>
                                <span className="block truncate">{plotSummary(plot, now)}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* 房子商店 */}
            {shopOpen && (
                <div className="absolute inset-0 z-30 bg-black/45 backdrop-blur-sm flex items-end sm:items-center justify-center px-3 pb-3" onClick={() => setShopOpen(false)}>
                    <div className="w-full max-w-[520px] rounded-2xl bg-white shadow-2xl p-3" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-2">
                            <div>
                                <p className="text-[13px] font-black text-slate-800">修房子</p>
                                <p className="text-[10px] text-slate-500 mt-0.5">够等级才能买，买过的随时能换回去</p>
                            </div>
                            <button onClick={() => setShopOpen(false)} className="text-slate-400 text-xl leading-none px-1 cursor-pointer">×</button>
                        </div>

                        <div className="space-y-1.5">
                            {HOUSE_STAGES.map(h => {
                                const owned = farm.ownedHouses.includes(h.stage);
                                const stage = h.stage as HouseStage;
                                const check = canBuyHouse(farm, stage);
                                const active = farm.houseStage === h.stage;
                                return (
                                    <button
                                        key={h.stage}
                                        onClick={() => {
                                            if (active) return;
                                            if (owned) {
                                                apply(setHouseStage(farm, stage, Date.now()), `换回「${h.name}」`);
                                                return;
                                            }
                                            const r = buyHouse(farm, stage, Date.now());
                                            if (apply(r, `修好了 · ${h.name}`)) setShopOpen(false);
                                        }}
                                        className={`w-full flex items-center gap-2.5 p-2 rounded-xl border text-left transition-colors ${
                                            active
                                                ? 'bg-emerald-50 border-emerald-300'
                                                : owned
                                                  ? 'bg-slate-50 border-slate-200 cursor-pointer'
                                                  : check.ok
                                                    ? 'bg-amber-50 border-amber-300 cursor-pointer'
                                                    : 'bg-slate-50 border-slate-200 opacity-70'
                                        }`}
                                    >
                                        <img src={`${import.meta.env.BASE_URL}farm/house-${h.stage}.png`} alt="" className="w-11 h-11 object-contain shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[12px] font-black text-slate-800">{h.name}</p>
                                            <p className="text-[10px] text-slate-500 mt-0.5">
                                                {h.stage === 1 ? '一开始就有的破屋子' : `Lv.${h.level} 解锁 · ${h.cost} 币`}
                                            </p>
                                        </div>
                                        <span className={`text-[10px] font-bold shrink-0 ${
                                            active ? 'text-emerald-600' : owned ? 'text-slate-500' : check.ok ? 'text-amber-700' : 'text-slate-400'
                                        }`}>
                                            {active ? '当前' : owned ? '换上' : check.ok ? '购买' : (level < h.level ? `Lv.${h.level}` : '金币不足')}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        {level >= MAX_LEVEL && (
                            <p className="mt-2 text-[10px] text-slate-400 text-center">这一版到 Lv.10，下一版会有草莓、南瓜和院子装饰</p>
                        )}
                    </div>
                </div>
            )}

            {/* 角色形象还原桥 */}
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

            {!landscape && <RotateHint />}
        </div>
    );
}
