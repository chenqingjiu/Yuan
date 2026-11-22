import React, { useState } from 'react';

/**
 * 小红书笔记卡片（纯展示）。
 *
 * 私聊的卡片写在 MessageItem.tsx 里，与那一整套气泡布局耦合；群聊的布局不同，
 * 所以单独抽一份轻量版：封面 + 标题 + 正文摘要 + 作者/点赞。两处 data 同构，
 * 都由 utils/xhsLinkCard.ts 产出。
 */
interface XhsNoteCardProps {
    note: any;
    isUser?: boolean;
}

const XhsNoteCard: React.FC<XhsNoteCardProps> = ({ note, isUser }) => {
    const [coverFailed, setCoverFailed] = useState(false);
    const cover = String(note?.coverUrl || note?.imageUrls?.[0] || '').trim();
    const title = String(note?.title || '').trim();
    const desc = String(note?.desc || '').trim();
    const author = String(note?.author || '').trim();
    const likes = Number(note?.likes) || 0;
    const isVideo = note?.type === 'video' || !!note?.videoUrl;

    const openNote = () => {
        const nid = note?.noteId || note?.note_id || note?.id;
        if (!nid) return;
        const token = note?.xsecToken || note?.xsec_token;
        const url = `https://www.xiaohongshu.com/explore/${nid}${token ? `?xsec_token=${encodeURIComponent(token)}&xsec_source=pc_feed` : ''}`;
        window.open(url, '_blank', 'noopener,noreferrer');
    };

    return (
        <div
            onClick={openNote}
            className="w-56 bg-white rounded-xl overflow-hidden shadow-sm border border-slate-100 cursor-pointer active:opacity-90 transition-opacity"
        >
            {cover && !coverFailed ? (
                <div className="relative w-full h-28 bg-slate-100 overflow-hidden">
                    <img
                        src={cover}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        crossOrigin="anonymous"
                        onError={() => setCoverFailed(true)}
                    />
                    {isVideo && (
                        <div className="absolute top-1.5 right-1.5 bg-black/50 rounded-full px-1.5 py-0.5 flex items-center gap-0.5">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-2.5 h-2.5 text-white"><path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" /></svg>
                            <span className="text-[8px] text-white font-medium">视频</span>
                        </div>
                    )}
                </div>
            ) : (
                <div className="h-10 bg-gradient-to-r from-red-400 to-pink-500 flex items-center justify-center">
                    <span className="text-white/85 text-[11px] font-medium tracking-wide">小红书笔记</span>
                </div>
            )}

            <div className="p-2.5">
                <div className="font-bold text-xs text-slate-800 line-clamp-2 leading-snug mb-1">
                    {title || '无标题笔记'}
                </div>
                {desc && (
                    <p className="text-[10px] text-slate-500 line-clamp-3 leading-relaxed mb-1.5">{desc}</p>
                )}
                <div className="flex items-center justify-between pt-1.5 border-t border-slate-50">
                    <div className="flex items-center gap-1.5 min-w-0">
                        <div className="w-3.5 h-3.5 shrink-0 rounded-full bg-gradient-to-br from-red-400 to-pink-400 flex items-center justify-center text-[7px] text-white font-bold">
                            {(author || '?')[0]}
                        </div>
                        <span className="text-[9px] text-slate-500 truncate max-w-[88px]">{author || '小红书用户'}</span>
                    </div>
                    <div className="flex items-center gap-0.5 text-[9px] text-slate-400 shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-2.5 h-2.5 text-red-300"><path d="m9.653 16.915-.005-.003-.019-.01a20.759 20.759 0 0 1-1.162-.682 22.045 22.045 0 0 1-2.582-1.9C4.045 12.733 2 10.352 2 7.5a4.5 4.5 0 0 1 8-2.828A4.5 4.5 0 0 1 18 7.5c0 2.852-2.044 5.233-3.885 6.82a22.049 22.049 0 0 1-3.744 2.582l-.019.01-.005.003h-.002a.723.723 0 0 1-.692 0l-.003-.002Z" /></svg>
                        <span>{likes}</span>
                    </div>
                </div>
                <div className="mt-1.5 flex items-center gap-1 text-[8px] text-slate-300">
                    <span className="text-red-400 font-bold">小红书</span>
                    <span>·</span>
                    <span>{isVideo ? '视频' : '笔记'}{isUser ? '分享' : '推荐'}</span>
                </div>
            </div>
        </div>
    );
};

export default XhsNoteCard;
