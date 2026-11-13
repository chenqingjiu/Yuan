import type { VisionApiConfig, VideoApiConfig } from '../types';
import { describeImageWithVisionApi } from './visionApi';
import { describeVideoWithVideoApi } from './videoApi';
import { VIDEO_MAX_UPLOAD_BYTES } from './videoMessage';

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
