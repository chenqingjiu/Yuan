import React from 'react';
import { useOS } from '../context/OSContext';
import type { CharacterProfile } from '../types';
import {
    generateGardenReply,
    loadGardenHistory,
    saveGardenMessage,
    type GardenSnapshot,
} from '../utils/gardenConversation';

const PICK_KEY = 'garden:characterId';

const post = (frame: HTMLIFrameElement | null, message: Record<string, unknown>) => {
    frame?.contentWindow?.postMessage({ source: 'rainholm-host', ...message }, '*');
};

/**
 * 小花园：Rainholm Garden 的本地版。
 * 画面与种植规则在 iframe 里跑，不连后端，存档落 IndexedDB。
 *
 * 对话走宿主这侧：iframe 只发文本，宿主用私聊同一套请求构建
 * （上下文范围 + 记忆宫殿召回 + 世界书），再写回消息表。
 * 所以花园聊过什么，私聊里看得见，下次花园也接得上。
 */
export default function GardenApp({ onBack }: { onBack: () => void }) {
    const { characters, userProfile, apiConfig } = useOS();
    const [picked, setPicked] = React.useState<string>(() => {
        try {
            return localStorage.getItem(PICK_KEY) || '';
        } catch {
            return '';
        }
    });
    const [choosing, setChoosing] = React.useState(false);
    const frameRef = React.useRef<HTMLIFrameElement>(null);
    const busy = React.useRef(false);
    const abortRef = React.useRef<AbortController | null>(null);

    const char: CharacterProfile | undefined =
        characters.find(item => item.id === picked) || (characters.length === 1 ? characters[0] : undefined);

    const pick = (id: string) => {
        try {
            localStorage.setItem(PICK_KEY, id);
        } catch {
            /* 隐私模式下存不了，本次会话照样可用 */
        }
        setPicked(id);
        setChoosing(false);
    };

    React.useEffect(() => {
        if (!char && characters.length > 1) setChoosing(true);
    }, [char, characters.length]);

    React.useEffect(() => {
        return () => abortRef.current?.abort(new DOMException('离开花园', 'AbortError'));
    }, []);

    React.useEffect(() => {
        const onMessage = async (event: MessageEvent) => {
            if (event.source !== frameRef.current?.contentWindow) return;
            const data = event.data;
            if (!data || data.source !== 'rainholm-garden') return;

            if (data.type === 'ready') {
                const messages = char ? await loadGardenHistory(char.id).catch(() => []) : [];
                post(frameRef.current, {
                    type: 'history',
                    messages,
                    character: char ? { id: char.id, name: char.name } : null,
                    configured: !!(apiConfig?.baseUrl && apiConfig?.model),
                });
                return;
            }

            if (data.type === 'chat') {
                const text = String(data.text || '').trim().slice(0, 500);
                if (!text) return;
                if (!char) {
                    post(frameRef.current, { type: 'error', message: '还没选角色' });
                    return;
                }
                if (!apiConfig?.baseUrl || !apiConfig?.model) {
                    post(frameRef.current, { type: 'error', message: '先在设置里配置聊天 API' });
                    return;
                }
                if (busy.current) {
                    post(frameRef.current, { type: 'error', message: '上一句还在想，等一下' });
                    return;
                }

                busy.current = true;
                abortRef.current = new AbortController();
                post(frameRef.current, { type: 'thinking' });

                try {
                    await saveGardenMessage(char.id, 'user', text);
                    const reply = await generateGardenReply({
                        char,
                        user: userProfile,
                        api: apiConfig,
                        text,
                        snapshot: (data.snapshot || undefined) as GardenSnapshot | undefined,
                        signal: abortRef.current.signal,
                        onStage: stage => post(frameRef.current, { type: 'stage', stage }),
                    });
                    await saveGardenMessage(char.id, 'assistant', reply.text);
                    post(frameRef.current, { type: 'reply', text: reply.text });
                } catch (error) {
                    const aborted = abortRef.current?.signal.aborted;
                    post(frameRef.current, {
                        type: 'error',
                        message: aborted
                            ? '这句先不说了'
                            : error instanceof Error
                              ? error.message
                              : '暂时没收到回复',
                    });
                } finally {
                    busy.current = false;
                    post(frameRef.current, { type: 'idle' });
                }
                return;
            }

            if (data.type === 'reload-history' && char) {
                const messages = await loadGardenHistory(char.id).catch(() => []);
                post(frameRef.current, { type: 'history', messages, character: { id: char.id, name: char.name } });
            }
        };

        window.addEventListener('message', onMessage);
        return () => window.removeEventListener('message', onMessage);
    }, [char, apiConfig, userProfile]);

    if (choosing || (!char && characters.length > 1)) {
        return (
            <div className="h-full w-full bg-[#f7efe3] overflow-y-auto">
                <div className="mx-auto w-full max-w-md px-5 py-10">
                    <button
                        onClick={onBack}
                        className="mb-6 text-[12px] font-bold text-amber-800/70 active:opacity-60"
                    >
                        ‹ 回大厅
                    </button>
                    <h1 className="text-[20px] font-black text-amber-950">和谁一起种？</h1>
                    <p className="mt-1 text-[12px] text-amber-900/60">选好后，这块地就归你们俩了。</p>
                    <div className="mt-5 space-y-2.5">
                        {characters.map(item => (
                            <button
                                key={item.id}
                                onClick={() => pick(item.id)}
                                className="w-full flex items-center gap-3 rounded-2xl bg-white/80 border border-amber-200/70 px-4 py-3 text-left active:scale-[0.99] transition-transform"
                            >
                                <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-200 to-amber-200 flex items-center justify-center text-[15px] font-black text-amber-900">
                                    {(item.name || '?').slice(0, 1)}
                                </span>
                                <span className="flex-1">
                                    <span className="block text-[14px] font-bold text-amber-950">{item.name}</span>
                                    <span className="block text-[11px] text-amber-900/50">
                                        {item.id === picked ? '上次一起种的就是 TA' : '一起种地、一起说话'}
                                    </span>
                                </span>
                                <span className="text-amber-400">›</span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    if (!char) {
        return (
            <div className="h-full w-full bg-[#f7efe3] flex flex-col items-center justify-center gap-3 text-amber-900">
                <p className="text-[13px]">还没有角色，先去创建一个吧。</p>
                <button onClick={onBack} className="text-[12px] font-bold underline">
                    回大厅
                </button>
            </div>
        );
    }

    const src = `${import.meta.env.BASE_URL}garden/index.html`;

    return (
        <div className="relative h-full w-full bg-[#f7efe3] overflow-hidden">
            <iframe
                ref={frameRef}
                src={src}
                title="小花园"
                className="h-full w-full border-0 block"
                allow="autoplay; fullscreen; clipboard-write"
            />

            <div
                className="absolute left-3 z-20 flex items-center gap-1.5"
                style={{ top: 'calc(var(--safe-top, 0px) + 10px)' }}
            >
                <button
                    onClick={onBack}
                    aria-label="离开花园"
                    className="flex items-center gap-1 rounded-full bg-white/80 backdrop-blur px-3 py-1.5 text-[12px] font-bold text-amber-900 shadow-sm border border-amber-200/70 active:scale-95 transition-transform"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2.2}
                        stroke="currentColor"
                        className="w-3.5 h-3.5"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                    </svg>
                    离开
                </button>
                {characters.length > 1 && (
                    <button
                        onClick={() => setChoosing(true)}
                        className="flex items-center gap-1 rounded-full bg-white/80 backdrop-blur px-2.5 py-1.5 text-[12px] font-bold text-amber-900 shadow-sm border border-amber-200/70 active:scale-95 transition-transform"
                        title="换一个人一起种"
                    >
                        {char.name}
                    </button>
                )}
            </div>
        </div>
    );
}
