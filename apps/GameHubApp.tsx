import React from 'react';
import { useOS } from '../context/OSContext';
import DoudizhuApp from './games/DoudizhuApp';
import BbqApp from './games/BbqApp';

/**
 * 游戏大厅（MyGame）—— 小游戏合集入口。
 * 内置「斗地主」「夜市烧烤」，后续游戏注册表式扩展。
 */
export default function GameHubApp() {
    const { closeApp } = useOS();
    const [active, setActive] = React.useState<'hub' | 'doudizhu' | 'bbq'>('hub');

    return (
        <div className="h-full w-full flex flex-col bg-slate-50 relative overflow-hidden">
            {active === 'hub' ? (
                <>
                    {/* 顶栏 */}
                    <div className="shrink-0 flex items-center px-4 py-3 bg-white border-b border-slate-100" style={{ paddingTop: 'calc(var(--safe-top, 0px) + 0.5rem)' }}>
                        <button onClick={closeApp} className="p-1 -ml-1 text-slate-500 hover:text-slate-700 cursor-pointer">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
                        </button>
                        <span className="ml-1 text-base font-black text-slate-800">游戏大厅</span>
                    </div>

                    {/* 游戏列表 */}
                    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                        <button onClick={() => setActive('doudizhu')}
                            className="w-full p-4 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 text-left cursor-pointer hover:border-emerald-400 transition-colors active:scale-[0.99]">
                            <div className="flex items-center gap-3">
                                <span className="w-11 h-11 rounded-xl bg-emerald-600 flex items-center justify-center text-2xl shadow-sm">🃏</span>
                                <div className="flex-1">
                                    <p className="text-[15px] font-black text-slate-800">斗地主</p>
                                    <p className="text-[11px] text-slate-500 mt-0.5">三人一桌 · 叫分抢先手 · 和角色同场</p>
                                </div>
                                <span className="text-slate-400">›</span>
                            </div>
                            <div className="flex gap-2 mt-2">
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/70 text-slate-500">54 张</span>
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/70 text-slate-500">炸弹翻倍</span>
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/70 text-slate-500">本地规则</span>
                            </div>
                        </button>

                        <button onClick={() => setActive('bbq')}
                            className="w-full p-4 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 text-left cursor-pointer hover:border-amber-400 transition-colors active:scale-[0.99]">
                            <div className="flex items-center gap-3">
                                <span className="w-11 h-11 rounded-xl bg-amber-600 flex items-center justify-center text-2xl shadow-sm">🔥</span>
                                <div className="flex-1">
                                    <p className="text-[15px] font-black text-slate-800">夜市烧烤</p>
                                    <p className="text-[11px] text-slate-500 mt-0.5">各守一摊 · 五分钟比营业额 · 互相捣乱</p>
                                </div>
                                <span className="text-slate-400">›</span>
                            </div>
                            <div className="flex gap-2 mt-2">
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/70 text-slate-500">横屏</span>
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/70 text-slate-500">4 炉位</span>
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/70 text-slate-500">5 种道具</span>
                            </div>
                        </button>

                        <div className="w-full p-4 rounded-2xl bg-slate-100 border border-slate-200 opacity-60">
                            <div className="flex items-center gap-3">
                                <span className="w-11 h-11 rounded-xl bg-slate-300 flex items-center justify-center text-2xl">⚔️</span>
                                <div>
                                    <p className="text-[15px] font-black text-slate-400">更多游戏</p>
                                    <p className="text-[11px] text-slate-400 mt-0.5">敬请期待</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            ) : active === 'doudizhu' ? (
                <DoudizhuApp onBack={() => setActive('hub')} />
            ) : (
                <BbqApp onBack={() => setActive('hub')} />
            )}
        </div>
    );
}
