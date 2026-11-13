import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    getMainVisionMode,
    setMainVisionMode,
    markMainVisionResult,
    getMainVisionCapability,
    shouldAttachMainVisionImages,
    resetMainVisionCapability,
    probeMainVision,
} from './mainVisionCapability';

const setApiConfig = (baseUrl: string, model: string) => {
    localStorage.setItem('os_api_config', JSON.stringify({ baseUrl, model }));
};

beforeEach(() => {
    localStorage.clear();
    setApiConfig('https://api.example.com/v1', 'demo-vl-model');
});

afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
});

describe('主模型直传开关', () => {
    it('默认自动；没探测过时不直传（保守，避免打成 400）', () => {
        expect(getMainVisionMode()).toBe('auto');
        expect(getMainVisionCapability()).toBeNull();
        expect(shouldAttachMainVisionImages()).toBe(false);
    });

    it('探测支持后 auto 直传；关掉就永远不直传', () => {
        markMainVisionResult(true);
        expect(shouldAttachMainVisionImages()).toBe(true);

        setMainVisionMode('off');
        expect(shouldAttachMainVisionImages()).toBe(false);
    });

    it('探测不支持时 auto 不直传', () => {
        markMainVisionResult(false);
        expect(shouldAttachMainVisionImages()).toBe(false);
    });

    it('手动开：就算没探测过也直传', () => {
        setMainVisionMode('on');
        expect(shouldAttachMainVisionImages()).toBe(true);
    });

    it('换模型 / 换中转地址后旧结论作废，需要重新探测', () => {
        markMainVisionResult(true);
        expect(shouldAttachMainVisionImages()).toBe(true);

        setApiConfig('https://api.other.com/v1', 'another-model');
        expect(getMainVisionCapability()).toBeNull();
        expect(shouldAttachMainVisionImages()).toBe(false);

        resetMainVisionCapability();
        expect(shouldAttachMainVisionImages()).toBe(false);
    });
});

describe('probeMainVision', () => {
    const config = { baseUrl: 'https://api.example.com/v1', apiKey: 'sk-test', model: 'demo-vl-model' };

    const stubFetch = (impl: (url: string, init: any) => any) => {
        const fn = vi.fn(async (input: any, init: any) => impl(String(input), init));
        vi.stubGlobal('fetch', fn);
        return fn;
    };

    it('主模型正常回话 → 支持，且请求里带的是经代理的图', async () => {
        const fn = stubFetch(async () => ({
            ok: true,
            status: 200,
            json: async () => ({ choices: [{ message: { content: '红色' } }] }),
        }));
        const result = await probeMainVision(config);
        expect(result.supported).toBe(true);

        const body = JSON.parse(fn.mock.calls[0][1].body);
        expect(body.model).toBe('demo-vl-model');
        const parts = body.messages[0].content;
        expect(parts[1].type).toBe('image_url');
        expect(parts[1].image_url.url).toContain('/xhs-media?url=');
    });

    it('模型不收图（400）→ 不支持，把原因带出来', async () => {
        stubFetch(async () => ({
            ok: false,
            status: 400,
            text: async () => 'invalid content type image_url',
        }));
        const result = await probeMainVision(config);
        expect(result.supported).toBe(false);
        expect(result.reason).toContain('400');
    });

    it('配置不全直接拒绝，不发请求', async () => {
        const fn = stubFetch(async () => ({ ok: true, status: 200, json: async () => ({}) }));
        const result = await probeMainVision({ baseUrl: '', apiKey: '', model: '' });
        expect(result.supported).toBe(false);
        expect(fn).not.toHaveBeenCalled();
    });
});
