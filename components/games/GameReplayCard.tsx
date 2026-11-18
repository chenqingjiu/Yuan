import React, { useState } from 'react';

/**
 * 「你说我猜」聊天内回放卡片（可展开/收起）。
 * 默认收起只显示一行战报；点击展开整局回放全文。
 * 数据来自 Message.metadata 的 GameReplayMeta。
 */

export function GameReplayCard({ meta }: { meta: any }) {
    const [open, setOpen] = useState(false);

    const game: string = meta?.game || '你说我猜';
    const rounds: number = meta?.rounds ?? 0;
    const playerCount: number = meta?.playerCount ?? 0;
    const mvp: string = meta?.mvp || '';
    const mvpScore: number = meta?.mvpScore ?? 0;
    const transcript: string = meta?.transcript || '';
    /** 斗地主等新游戏自带一行概括；旧数据回退到「N轮·N人·MVP」拼法。 */
    const subtitle: string = meta?.subtitle || `${rounds}轮 · ${playerCount}人 · MVP ${mvp}（${mvpScore}分）`;

    return (
        <div className="w-60 rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-[0_2px_10px_rgba(0,0,0,0.06)]">
            <button onClick={() => setOpen((s) => !s)} className="w-full px-3 py-2.5 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-2 min-w-0">
                    <span className="text-base">🎮</span>
                    <div className="min-w-0">
                        <p className="text-[13px] font-bold text-slate-800 leading-tight">{game} · 战报</p>
                        <p className="text-[10px] text-slate-400 mt-0.5 truncate">{subtitle}</p>
                    </div>
                </div>
                <span className="text-[10px] text-slate-400 shrink-0">{open ? '收起 ▴' : '展开 ▾'}</span>
            </button>
            {open && (
                <div className="px-3 pb-3 border-t border-slate-100 pt-2">
                    <div className="max-h-56 overflow-y-auto rounded-lg bg-slate-50 p-2.5 text-[11px] text-slate-600 leading-relaxed whitespace-pre-wrap font-mono">
                        {transcript || '暂无回放内容'}
                    </div>
                </div>
            )}
        </div>
    );
}

export default GameReplayCard;
