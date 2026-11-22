/**
 * 小红书分享链接 → 笔记卡片的公共构建逻辑。
 *
 * 私聊（apps/Chat.tsx）与群聊（apps/GroupChat.tsx）共用同一份解析，避免出现
 * 「私聊能看、群聊看不了」这种分叉——这正是抽出本文件的原因。
 *
 * 三层兜底，任何一层成功都能出卡：
 *   1. 分享文案自带标题（【标题】/「标题」+ 短链）—— 零后端依赖，永远可用；
 *   2. 配了小红书 MCP / Lite —— 抓正文、封面、作者、评论区；
 *   3. 都没抓到 —— 走极数本源纯前端解析（CORS 全开，无需部署）。
 *
 * 解析失败不抛错：返回 ok=false + notices，由调用方决定要不要 toast，
 * 保证「解析不了」永远不会拦住用户发消息。
 */

import { XhsMcpClient, normalizeXhsLiteDetail } from './xhsMcpClient';
import {
    detectFirstUrl,
    detectXhsShortUrl,
    extractXhsNoteLink,
    extractXhsShareTitle,
    expandShortUrl,
} from './webpageExtractor';
import { parseXhsNoteFromShareUrl } from './videoParser';

export interface XhsNoteCardData {
    noteId?: string;
    xsecToken?: string;
    title?: string;
    desc?: string;
    author?: string;
    authorId?: string;
    likes?: number;
    collects?: number;
    commentCount?: number;
    comments?: { author?: string; content: string }[];
    imageUrls?: string[];
    videoUrl?: string;
    coverUrl?: string;
    type?: string;
    /** 后台用视觉模型把配图/视频转成的文字（见 utils/xhsMedia.ts）。 */
    mediaDesc?: string;
    mediaDescAt?: number;
    [key: string]: any;
}

export interface BuildXhsCardOptions {
    /** 小红书 MCP / Lite 配置；缺省或未启用就只走文案 + 前端解析。 */
    xhsMcp?: { serverUrl?: string; enabled?: boolean } | null;
}

export interface BuildXhsCardResult {
    ok: boolean;
    note: XhsNoteCardData;
    /** 卡片 metadata 里要一起存的原始分享文案与链接。 */
    originalShareText: string;
    originalShareUrl?: string;
    /** 过程提示，不阻断发送。 */
    notices: string[];
}

/** 这条文本里有没有小红书分享链接（完整链接或 xhslink 短链）。 */
export function hasXhsShareLink(text: string): boolean {
    if (!text) return false;
    return !!extractXhsNoteLink(text)?.noteId || !!detectXhsShortUrl(text);
}

/** 一条内容都没有时不该发空卡（空卡在群里会变成一个看不懂的灰块）。 */
function isNoteEmpty(note: XhsNoteCardData): boolean {
    return !note.noteId && !note.title && !note.desc
        && !(note.imageUrls?.length) && !note.videoUrl;
}

export async function buildXhsNoteCard(
    text: string,
    options?: BuildXhsCardOptions,
): Promise<BuildXhsCardResult | null> {
    if (!hasXhsShareLink(text)) return null;

    const notices: string[] = [];
    const xhsFullNote = extractXhsNoteLink(text);
    let noteId = xhsFullNote?.noteId || '';
    let xsecToken = xhsFullNote?.xsecToken;
    const xhsShortUrl = detectXhsShortUrl(text) || '';
    let shortLinkError = '';

    // 短链（xhslink.com / xhslink.cn）不含 id/token —— 先展开成真实链接再提取。
    if (!noteId && xhsShortUrl) {
        try {
            const finalUrl = await expandShortUrl(xhsShortUrl);
            const expanded = extractXhsNoteLink(finalUrl);
            noteId = expanded?.noteId || '';
            xsecToken = expanded?.xsecToken;
            if (!noteId) shortLinkError = '短链返回的页面中未找到笔记地址';
        } catch (e) {
            shortLinkError = e instanceof Error ? e.message : '短链展开失败';
        }
    }

    // 兼容旧版「【标题 | 小红书】」和新版「标题 … 短链 打开【小红书】」。
    // 不能直接取第一个【】块：新版唯一的括号内容是应用名，会把标题错写成「小红书」。
    const titleFromText = extractXhsShareTitle(text);

    if (!noteId && !xhsShortUrl) {
        return {
            ok: false,
            note: {},
            originalShareText: text,
            originalShareUrl: detectFirstUrl(text) || undefined,
            notices: [`小红书链接解析失败，原消息已保留。${shortLinkError ? `（${shortLinkError}）` : ''}`],
        };
    }

    // 基础卡：标题来自分享文案，零后端依赖。
    let note: XhsNoteCardData = {
        noteId,
        title: titleFromText || '',
        desc: '',
        author: '',
        authorId: '',
        likes: 0,
        xsecToken,
    };

    // 首选：配了小红书 MCP/Lite 就抓详情（正文/封面/作者/评论最全）。
    const mcpUrl = options?.xhsMcp?.serverUrl;
    const mcpEnabled = options?.xhsMcp?.enabled === true;
    if (noteId && mcpUrl && mcpEnabled) {
        try {
            const noteUrl = `https://www.xiaohongshu.com/explore/${noteId}${xsecToken ? `?xsec_token=${encodeURIComponent(xsecToken)}&xsec_source=pc_share` : ''}`;
            const result = await XhsMcpClient.getNoteDetail(mcpUrl, noteUrl, xsecToken, { loadAllComments: true });
            if (result.success && result.data) {
                const fetched = normalizeXhsLiteDetail(result.data);
                note = {
                    ...note,
                    ...fetched,
                    noteId: (fetched as any).noteId || note.noteId,
                    title: titleFromText || (fetched as any).title || note.title,
                    xsecToken: (fetched as any).xsecToken || xsecToken,
                };
            } else if (!result.success) {
                notices.push(`小红书正文读取失败，已发送基础卡片。${result.error ? `（${result.error}）` : ''}`);
            }
        } catch {
            notices.push('小红书正文读取失败，已发送基础卡片。');
        }
    }

    // 兜底：没配自建服务、或没抓到内容时，回落极数本源解析。
    const missingDetail = !note.desc && !(note.imageUrls?.length) && !note.videoUrl;
    if (missingDetail) {
        const parseUrl = xhsShortUrl
            || `https://www.xiaohongshu.com/explore/${noteId}${xsecToken ? `?xsec_token=${encodeURIComponent(xsecToken)}&xsec_source=pc_share` : ''}`;
        try {
            const parsed = await parseXhsNoteFromShareUrl(parseUrl);
            note = {
                ...note,
                ...parsed,
                noteId: (parsed as any).noteId || note.noteId,
                title: titleFromText || (parsed as any).title || note.title,
                // token 只用本地拿到的：解析接口回的可能不是这篇的。
                xsecToken,
            };
        } catch (e) {
            notices.push(`小红书内容解析失败，已发送基础卡片。（${e instanceof Error ? e.message : '解析失败'}）`);
        }
    }

    const originalShareUrl = detectFirstUrl(text) || xhsShortUrl;

    if (isNoteEmpty(note)) {
        return {
            ok: false,
            note,
            originalShareText: text,
            originalShareUrl,
            notices: [`小红书链接解析失败，原消息已保留。通常是网络或代理导致短链无法展开。${shortLinkError ? `（${shortLinkError}）` : ''}`],
        };
    }

    return { ok: true, note, originalShareText: text, originalShareUrl, notices };
}
