import React from 'react';

/**
 * 小花园：Rainholm Garden 的本地版。
 * 整套画面与规则都在 iframe 里跑，不连后端，存档落在 IndexedDB。
 * 素材与逻辑放在 public/garden，页面已经去掉小窝和 AI 连接入口。
 */
export default function GardenApp({ onBack }: { onBack: () => void }) {
    const src = `${import.meta.env.BASE_URL}garden/index.html`;

    return (
        <div className="relative h-full w-full bg-[#f7efe3] overflow-hidden">
            <iframe
                src={src}
                title="小花园"
                className="h-full w-full border-0 block"
                allow="autoplay; fullscreen; clipboard-write"
            />
            <button
                onClick={onBack}
                aria-label="离开花园"
                className="absolute left-3 z-20 flex items-center gap-1 rounded-full bg-white/80 backdrop-blur px-3 py-1.5 text-[12px] font-bold text-amber-900 shadow-sm border border-amber-200/70 active:scale-95 transition-transform"
                style={{ top: 'calc(var(--safe-top, 0px) + 10px)' }}
            >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" className="w-3.5 h-3.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                </svg>
                离开
            </button>
        </div>
    );
}
