import React from 'react';
import { useOS } from '../context/OSContext';
import type { CharacterProfile } from '../types';
import {
    generateGardenReply,
    generatePatrolNote,
    loadGardenHistory,
    saveGardenBoardMessage,
    saveGardenMessage,
    type GardenSnapshot,
    type PatrolReport,
} from '../utils/gardenConversation';

const post = (frame: HTMLIFrameElement | null, message: Record<string, unknown>) => {
    frame?.contentWindow?.postMessage({ source: 'rainholm-host', ...message }, '*');
};

/**
 * 小花园：Rainholm Garden 的本地版，固定给「王愿」一个人种。
 * 画面与种植规则在 iframe 里跑，不连后端，存档落 IndexedDB。
 *
 * 对话走宿主这侧：iframe 只发文本，宿主用私聊同一套请求构建
 * （上下文范围 + 记忆宫殿召回 + 世界书），再写回消息表。
 * 所以花园聊过什么，私聊里看得见，下次花园也接得上。
 */
export default function GardenApp({ onBack }: { onBack: () => void }) {
    const { characters, userProfile, apiConfig } = useOS();
    const frameRef = React.useRef<HTMLIFrameElement>(null);
    const busy = React.useRef(false);
    const abortRef = React.useRef<AbortController | null>(null);

    /* 只认名字「王愿」：不再有选人页、串门、换人。找不到就如实提示，
       不随便拿别的角色顶上——否则花园会种到 sully 名下，又回到老问题。 */
    const char: CharacterProfile | undefined = React.useMemo(
        () => characters.find(item => (item.name || '').trim() === '王愿'),
        [characters]
    );
    const owner = char?.id || '';

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

            /* 巡检做完了：补一句角色语气的留言，回给花园，同时写进私聊 */
            if (data.type === 'patrol') {
                const report = data.report as PatrolReport | undefined;
                if (!report || !char) return;
                const frame = frameRef.current;
                void (async () => {
                    let note = '';
                    try {
                        note = await generatePatrolNote({ char, user: userProfile, api: apiConfig, report });
                    } catch {
                        /* 文案失败不影响已经做过的动作，花园那边会用兜底句 */
                    }
                    post(frame, { type: 'patrol-note', id: data.id, text: note });

                    const line = note || report.summary;
                    if (!line) return;
                    await saveGardenBoardMessage(char.id, `「小花园 · 留言板」${line}`, {
                        patrolId: report.id,
                        patrolBy: char.id,
                        /* 巡检动作明细随留言一起进私聊，卡片里展示种/浇/收，历史消息没有也不影响 */
                        steps: report.steps || [],
                    }).catch(() => 0);
                })();
                return;
            }

            if (data.type === 'chat') {
                const text = String(data.text || '').trim().slice(0, 500);
                if (!text) return;
                if (!char) {
                    post(frameRef.current, { type: 'error', message: '还没找到王愿这个角色' });
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
                    const action = reply.actions[0];
                    const fallback = action
                        ? `（去 ${action.plot} 号地${
                              action.action === 'plant'
                                  ? '种下了' + (action.seed === 'fantasy' ? '奇幻种子' : '普通种子')
                                  : action.action === 'water'
                                    ? '浇了水'
                                    : '收了菜'
                          }）`
                        : '';
                    await saveGardenMessage(char.id, 'assistant', reply.text || fallback);
                    if (reply.text) post(frameRef.current, { type: 'reply', text: reply.text });
                    if (action) post(frameRef.current, { type: 'act', actions: reply.actions });
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
    }, [char, apiConfig, userProfile, characters]);

    if (!char) {
        return (
            <div className="h-full w-full bg-[#f7efe3] flex flex-col items-center justify-center gap-3 text-amber-900 px-8 text-center">
                <p className="text-[13px]">没找到名字叫「王愿」的角色。<br />花园只和王愿一起种，请先把角色名改成「王愿」，或建一个叫王愿的角色。</p>
                <button onClick={onBack} className="text-[12px] font-bold underline">
                    回大厅
                </button>
            </div>
        );
    }

    const src = `${import.meta.env.BASE_URL}garden/index.html?owner=${encodeURIComponent(owner)}`;

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
                style={{ top: 'calc(var(--safe-top, 0px) + 58px)' }}
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
            </div>
        </div>
    );
}
