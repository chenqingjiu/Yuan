import type { VisionApiConfig, VideoApiConfig, Message } from '../types';
import { describeImageWithVisionApi } from './visionApi';
import { describeVideoWithVideoApi } from './videoApi';
import { VIDEO_MAX_UPLOAD_BYTES } from './videoMessage';
import { DB } from './db';
import { getProxyWorkerUrl } from './proxyWorker';

/**
 * 让角色"看见"小红书笔记的画面。
 *
 * 两步走的原因：笔记里的图/视频挂在 *.xhscdn.com 上且带 Referer 校验，浏览器直连 403、
 * 模型服务端去抓也 403。所以先经自家 worker 的 /xhs-media 代理把字节拿回来（那里有域名
 * 白名单，不是开放代理），再交给视觉模型。
 *
 * 失败完全静默：笔记卡片本身已经有标题/正文/评论，画面只是加分项。任何一张图挂了都不
 * 能影响分享出来的卡片。
 */

/** 描述写回 metadata.xhsNote.mediaDesc。 */
export const XHS_MEDIA_DESC_KEY = 'mediaDesc';
/** 描述时间戳（换模型后便于回看是否该重跑）。 */
export const XHS_MEDIA_DESC_AT_KEY = 'mediaDescAt';
/** 直传用 base64 图写回 metadata.xhsNote.mediaImages。 */
export const XHS_MEDIA_IMAGES_KEY = 'mediaImages';

/** 最多看几张图。4 张足够判断"这篇笔记在讲什么"，再多多半是同一组内容的重复构图。 */
const MAX_IMAGES = 4;

/**
 * 代理地址一律取 origin。
 *
 * 用户填的 serverUrl 可能带路径：bridge 模式是 `https://xxx.workers.dev/xhs/api`，
 * 直接拼会变成 `/xhs/api/xhs-media`（404）。/xhs-media 挂在域名根上，所以只保留
 * 协议+主机，把用户填的路径全部丢掉。
 */
export const buildXhsMediaProxyUrl = (proxyBase: string, rawUrl: string): string => {
    const raw = String(proxyBase || '').trim();
    if (!raw || !rawUrl) return '';
    let origin = '';
    try {
        origin = new URL(raw).origin;
    } catch {
        // 不是完整 URL（例如只填了域名）时退回字符串裁剪。
        origin = raw.replace(/\/+$/, '').replace(/\/(xhs|api)\/.*$/i, '');
    }
    if (!origin) return '';
    return `${origin}/xhs-media?url=${encodeURIComponent(rawUrl)}`;
};

export interface XhsMediaOptions {
    /** worker 地址（就是小红书 MCP/Lite 的 serverUrl，同一个 worker 上挂的代理）。 */
    proxyBase: string;
    visionApi?: VisionApiConfig | null;
    videoApi?: VideoApiConfig | null;
}

/** 图片超过这个大小就放弃识图（base64 后体积还会再涨 1/3，太大容易撞请求体上限）。 */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * 经 worker 代理把一张小红书图取回来，转成 data URL。
 *
 * 为什么不把代理 URL 直接交给视觉模型：视觉 API（如硅基流动）的服务端去下载
 * Cloudflare 上的代理地址经常超时/被拒——报「URL must be downloadable」。
 * 浏览器侧取图走用户自己的网络（能打开代理页就能取到），拿到字节转 base64
 * 直传，视觉 API 只需要认 data URL，不再依赖它机房的连通性。
 */
export const fetchXhsImageAsDataUrl = async (proxyBase: string, rawUrl: string): Promise<string> => {
    const proxied = buildXhsMediaProxyUrl(proxyBase, rawUrl);
    if (!proxied) return '';
    try {
        const res = await fetch(proxied);
        if (!res.ok) return '';
        const blob = await res.blob();
        if (!blob.size || blob.size > MAX_IMAGE_BYTES) return '';
        // 不走 FileReader：node 测试环境里没有这个类，arrayBuffer + btoa 两边都通用。
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = '';
        const CHUNK = 0x8000;
        for (let i = 0; i < bytes.length; i += CHUNK) {
            binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + CHUNK)));
        }
        return `data:${blob.type || 'image/png'};base64,${btoa(binary)}`;
    } catch {
        return '';
    }
};

/**
 * 生成笔记的画面描述。返回值直接塞进 metadata.xhsNote.mediaDesc。
 *
 * 没有开识图/视频 API 时返回空串 —— 卡片照常发，只是角色读不到画面。这是设计选择：
 * 不为一个加分项强行要求用户再配一个 Key。
 */
export async function describeXhsNoteMedia(
    note: { imageUrls?: string[]; videoUrl?: string },
    options: XhsMediaOptions,
): Promise<string> {
    const proxyBase = String(options.proxyBase || '').trim();
    if (!proxyBase) return '';

    const parts: string[] = [];
    const images = Array.isArray(note.imageUrls) ? note.imageUrls.slice(0, MAX_IMAGES) : [];

    if (options.visionApi?.enabled === true && images.length > 0) {
        for (const image of images) {
            try {
                const dataUrl = await fetchXhsImageAsDataUrl(proxyBase, image);
                if (!dataUrl) continue;
                const desc = await describeImageWithVisionApi(dataUrl, options.visionApi);
                const trimmed = String(desc || '').trim();
                if (trimmed) parts.push(trimmed.slice(0, 300));
            } catch {
                // 单张图失败跳过：其余图仍能给出画面感。
            }
        }
    }

    if (options.videoApi?.enabled === true && note.videoUrl) {
        const proxied = buildXhsMediaProxyUrl(proxyBase, note.videoUrl);
        if (proxied) {
            try {
                const response = await fetch(proxied);
                if (response.ok) {
                    const blob = await response.blob();
                    if (blob.size > 0) {
                        const desc = await describeVideoWithVideoApi(blob, options.videoApi, {
                            // 太大就只描述前 60 秒（内部会压缩），并在描述里说明截断。
                            truncated: blob.size > VIDEO_MAX_UPLOAD_BYTES,
                            cacheKey: `xhs:${note.videoUrl}`,
                        });
                        const trimmed = String(desc || '').trim();
                        if (trimmed) parts.push(`视频：${trimmed.slice(0, 400)}`);
                    }
                }
            } catch {
                // 视频拿不到就只留图片描述。
            }
        }
    }

    return parts.join('；').slice(0, 1200);
}

/**
 * 主模型直传前，把小红书卡片的配图取回成 base64 存档（metadata.xhsNote.mediaImages）。
 *
 * 为什么不能把代理 URL 直接塞给主模型：中转站/上游（尤其逆向渠道）通常不会替用户
 * 去下载 image_url，拿到代理地址也只是当字符串看一眼 —— 角色照样「看不见」。聊天里
 * 手动发的图能被看到，正是因为那些图本来就是 data URL。这里对齐同一条路：浏览器经
 * /xhs-media 取回字节 → base64 写进消息存档 → 之后每轮请求直接复用，不重复取图。
 *
 * 调用方（chatRequestPayload）负责 gate：主模型直传没开就不进这里。
 * 注意不要 import mainVisionCapability 做开关判断 —— 那边反过来依赖本文件，会循环。
 */
const inflightXhsImageMaterialize = new Map<number, Promise<Message>>();

export async function materializeXhsCardImages(messages: Message[]): Promise<Message[]> {
    const prepared: Message[] = [];
    for (const message of messages) {
        if (message.type !== 'xhs_card' || !message.id) {
            prepared.push(message);
            continue;
        }
        const note: any = message.metadata?.xhsNote || {};
        const rawImages: string[] = Array.isArray(note.imageUrls) ? note.imageUrls.slice(0, MAX_IMAGES) : [];
        const existing = Array.isArray(note[XHS_MEDIA_IMAGES_KEY])
            ? (note[XHS_MEDIA_IMAGES_KEY] as unknown[]).filter((s): s is string => typeof s === 'string' && s.startsWith('data:image/'))
            : [];
        // 已有 base64、没配图、或识图描述已经在（chatPrompts 优先用文字、不重复传图）→ 不动。
        const hasDesc = typeof note[XHS_MEDIA_DESC_KEY] === 'string' && note[XHS_MEDIA_DESC_KEY].trim();
        if (existing.length || hasDesc || !rawImages.length) {
            prepared.push(message);
            continue;
        }

        // 卡片刚保存时的预取和发送前的补齐可能并发；同一张卡只跑一次。
        const pending = inflightXhsImageMaterialize.get(message.id);
        if (pending) {
            prepared.push(await pending);
            continue;
        }

        const work = (async (): Promise<Message> => {
            const proxyBase = getProxyWorkerUrl();
            const dataUrls: string[] = [];
            for (const url of rawImages) {
                const dataUrl = await fetchXhsImageAsDataUrl(proxyBase, url);
                if (dataUrl) dataUrls.push(dataUrl);
            }
            if (!dataUrls.length) return message; // 一张都没取到：保留原样，chatPrompts 回落老路。
            const metadata = {
                ...(message.metadata || {}),
                xhsNote: { ...note, [XHS_MEDIA_IMAGES_KEY]: dataUrls, mediaImagesAt: Date.now() },
            };
            await DB.updateMessageMetadata(message.id, (prev: any) => ({
                ...(prev || {}),
                xhsNote: { ...(prev?.xhsNote || note), [XHS_MEDIA_IMAGES_KEY]: dataUrls, mediaImagesAt: Date.now() },
            }));
            return { ...message, metadata };
        })();

        inflightXhsImageMaterialize.set(message.id, work);
        try {
            prepared.push(await work);
        } finally {
            inflightXhsImageMaterialize.delete(message.id);
        }
    }
    return prepared;
}
