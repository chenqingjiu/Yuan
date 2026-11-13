/**
 * 主模型能不能"直接看图"。
 *
 * 为什么需要这件事：小红书笔记的配图本来要额外配一个识图/视频 API 转成文字
 * （多花一次调用）。但很多人的主模型本身就是多模态的（qwen-vl / gpt-4o / gemini…），
 * 把图直接塞进主请求就行，一次都不用多花。反过来，纯文本模型（DeepSeek 等）收到
 * image_url 会直接 400，所以不能默认开。
 *
 * 判定不绑型号：跑一次探测拿到结论存下来，主 API 的 baseUrl/model 一变就自动作废。
 * 探测同时验证两件事——worker 的 /xhs-media 代理能取到小红书图片、主模型吃得下这张图。
 */

import { buildXhsMediaProxyUrl } from './xhsMedia';
import { getProxyWorkerUrl } from './proxyWorker';

/** 自动 = 按探测结果；开 = 强制直传；关 = 永远走文字描述。 */
export type MainVisionMode = 'auto' | 'on' | 'off';

const MODE_KEY = 'os_main_vision_mode';
const CAP_KEY = 'os_main_vision_capability';
const API_CONFIG_KEY = 'os_api_config';

/** 探测用的小红书图（极数本源文档里的公开样例）。换掉也不会影响功能，只是探测失败。 */
const PROBE_IMAGE = 'https://sns-img-hw.xhscdn.com/1040g3k0324fneca50m004b4pdr0lps2k7du00i0';

const safeStorage = (): Storage | null => {
    try {
        return typeof localStorage === 'undefined' ? null : localStorage;
    } catch {
        return null;
    }
};

/** 主 API 的「身份」。换个模型或换个中转地址，旧结论就不算数了。 */
export const mainVisionFingerprint = (): string => {
    try {
        const raw = safeStorage()?.getItem(API_CONFIG_KEY);
        if (!raw) return '';
        const cfg = JSON.parse(raw);
        const baseUrl = String(cfg?.baseUrl || '').trim().replace(/\/+$/, '').toLowerCase();
        const model = String(cfg?.model || '').trim();
        return baseUrl || model ? `${baseUrl}::${model}` : '';
    } catch {
        return '';
    }
};

export const getMainVisionMode = (): MainVisionMode => {
    const raw = safeStorage()?.getItem(MODE_KEY);
    return raw === 'on' || raw === 'off' ? raw : 'auto';
};

export const setMainVisionMode = (mode: MainVisionMode): void => {
    try {
        safeStorage()?.setItem(MODE_KEY, mode);
    } catch { /* localStorage 不可用就按自动处理 */ }
};

/** 探测结论。主 API 配置变了就当作没探测过。 */
export const getMainVisionCapability = (): { supported: boolean; at: number } | null => {
    try {
        const raw = safeStorage()?.getItem(CAP_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (typeof parsed?.supported !== 'boolean') return null;
        if (String(parsed?.fp || '') !== mainVisionFingerprint()) return null;
        return { supported: parsed.supported, at: Number(parsed.at) || 0 };
    } catch {
        return null;
    }
};

export const markMainVisionResult = (supported: boolean): void => {
    try {
        safeStorage()?.setItem(CAP_KEY, JSON.stringify({
            fp: mainVisionFingerprint(),
            supported,
            at: Date.now(),
        }));
    } catch { /* ignore */ }
};

export const resetMainVisionCapability = (): void => {
    try {
        safeStorage()?.removeItem(CAP_KEY);
    } catch { /* ignore */ }
};

/**
 * 这一轮要不要把小红书配图随主请求直传。
 * 探测过且支持才在 auto 下放行 —— 没探测过一律保守走文字，免得把整轮聊天打成 400。
 */
export const shouldAttachMainVisionImages = (): boolean => {
    const mode = getMainVisionMode();
    if (mode === 'off') return false;
    if (mode === 'on') return true;
    return getMainVisionCapability()?.supported === true;
};

export interface MainVisionProbeResult {
    supported: boolean;
    /** 失败原因，直接给用户看。 */
    reason?: string;
}

/**
 * 真跑一次请求：拿一张经 worker 代理的小红书图，问主模型它是什么颜色。
 * 代理没部署（404）或主模型不吃图，都算不支持 —— 两种情况直传都会失败。
 */
export async function probeMainVision(config: {
    baseUrl: string;
    apiKey: string;
    model: string;
}): Promise<MainVisionProbeResult> {
    const baseUrl = String(config.baseUrl || '').trim().replace(/\/+$/, '');
    const apiKey = String(config.apiKey || '').trim();
    const model = String(config.model || '').trim();
    if (!baseUrl || !apiKey || !model) return { supported: false, reason: '主 API 的 URL / Key / Model 还没填完整' };

    const proxyBase = getProxyWorkerUrl();
    const imageUrl = buildXhsMediaProxyUrl(proxyBase, PROBE_IMAGE) || PROBE_IMAGE;

    let res: Response;
    try {
        res = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                max_tokens: 16,
                messages: [{
                    role: 'user',
                    content: [
                        { type: 'text', text: '这张图是什么颜色？只回答颜色。' },
                        { type: 'image_url', image_url: { url: imageUrl } },
                    ],
                }],
            }),
        });
    } catch (e: any) {
        return { supported: false, reason: `请求主 API 失败：${e?.message || '网络错误'}` };
    }

    if (!res.ok) {
        const detail = await res.text().catch(() => '');
        const trimmed = detail.replace(/\s+/g, ' ').slice(0, 160);
        if (res.status === 404 && !trimmed) {
            return { supported: false, reason: '小红书图片代理 /xhs-media 还没部署（404），直传暂时用不了' };
        }
        return { supported: false, reason: `主模型不收图（HTTP ${res.status}${trimmed ? `：${trimmed}` : ''}）` };
    }

    // 有的中转会 200 但把图片悄悄丢掉。能回出话来就算它吃下了 —— 这只是能力探测，不追求答案正确。
    const body = await res.json().catch(() => null);
    const answer = body?.choices?.[0]?.message?.content;
    if (typeof answer === 'string' && answer.trim()) return { supported: true };
    return { supported: false, reason: '主模型返回了空结果，可能没真正读到图片' };
}

/** 探测并把结论落盘（成功/失败都记，auto 模式直接用）。 */
export async function probeAndStoreMainVision(config: {
    baseUrl: string;
    apiKey: string;
    model: string;
}): Promise<MainVisionProbeResult> {
    const result = await probeMainVision(config);
    markMainVisionResult(result.supported);
    return result;
}
