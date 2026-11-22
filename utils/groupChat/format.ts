import { Message } from '../../types';
import { isBlobRef } from '../blobRef';

/**
 * 群聊日志行里一条消息的文本表示——非文本类型用占位符。
 * image 的 content 是 base64（processImage 压的 JPEG）、emoji 是图床 URL，
 * 都不能内联进 prompt：base64 会把上下文撑爆，URL 是纯噪声。
 */
export function messageLogText(m: Message, stickerName?: (url: string) => string): string {
    const rawText = typeof m.content === 'string' ? m.content : '';
    if (m.type === 'image') return '[图片]';
    if (m.type === 'video') {
        // 视频的 content 是 blobref 令牌：有描述就用描述，没有就如实说看不到，
        // 别让群聊里的成员对一段它没看过的画面发表意见。
        const desc = typeof m.metadata?.visionDescription === 'string' ? m.metadata.visionDescription.trim() : '';
        if (!desc) return '[视频]（没有画面描述，看不到内容）';
        return m.metadata?.videoTruncated === true
            ? `[视频：${desc}]（截断片段）`
            : `[视频：${desc}]`;
    }
    if (m.type === 'emoji') return `[表情包: ${stickerName ? stickerName(rawText.trim()) : '表情'}]`;
    // 卡片消息的 content 只有标题，正文在 metadata 里。时间线只取一行摘要（会被
    // LINE_MAX_CHARS 再截一次），全文交给 buildGroupHistoryBlock 展开，那里才有完整正文。
    if (m.type === 'xhs_card') {
        const note: any = m.metadata?.xhsNote || {};
        const title = String(note.title || m.content || '').trim();
        const author = String(note.author || '').trim();
        if (!title && !author) return '[小红书笔记]（只有链接，内容没抓到）';
        return `[小红书笔记]《${title || '无标题'}》${author ? `（作者：${author}）` : ''}`;
    }
    if (m.type === 'webpage_card') {
        const wp: any = m.metadata?.webpage || {};
        const title = String(wp.title || m.content || '').trim();
        return `[网页]《${title || '未命名'}》`;
    }
    if (m.type === 'transfer') {
        if (m.metadata?.packetReceipt) return m.metadata.packetReceipt === 'claimed' ? '[领取红包]' : '[退回红包]';
        if (m.metadata?.packet) return `[发红包: ${m.metadata.totalAmount}]`;
        return `[发红包: ${m.metadata?.amount ?? ''}]`;
    }
    // 令牌（blobref:）也算媒体：图片二进制存在 blob_assets 里，正文位置只留一个短引用，
    // 内联进 prompt 同样是纯噪声。跟 groupChat/prompts.ts 的同款兜底保持一个口径。
    const trimmed = rawText.trim();
    if (/^(data:|https?:\/\/)/i.test(trimmed) || isBlobRef(trimmed)) return '[媒体]';
    return rawText;
}
