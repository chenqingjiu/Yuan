/**
 * 备份载荷端到端往返测试。
 *
 * 与 backupCoverage.test.ts（静态断言「清单有没有漏」）互补：这里跑的是**生产代码本身**
 * 的 writeV2Backup / assembleV2Backup，证明新增字段真的落进了 zip 并能原样读回 ——
 * 静态检查无法证明这一点（字段名写错、被分片器跳过、落进 metadata 时被吃掉，都只有
 * 真跑一遍才看得出来）。
 */
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import {
    assembleV2Backup,
    writeV2Backup,
    type ZipFileReader,
    type ZipFileWriter,
} from './backupFormat';

/** 把 JSZip 适配成 backupFormat 期望的极简读写接口。 */
function adaptZip(zip: JSZip): { writer: ZipFileWriter; reader: ZipFileReader } {
    const writer = {
        file(name: string, data: string | Uint8Array, options?: Record<string, unknown>) {
            zip.file(name, data as never, options as never);
        },
    } as unknown as ZipFileWriter;

    const reader = {
        file(name: string) {
            const entry = zip.file(name);
            if (!entry) return null;
            return {
                async(type: 'string' | 'uint8array') {
                    return entry.async(type as never);
                },
            };
        },
    } as unknown as ZipFileReader;

    return { writer, reader };
}

/** 模拟本次修复涉及的载荷：三个新 store（数组）+ localState（对象）。 */
const PAYLOAD: Record<string, unknown> = {
    timestamp: 1758892800000,
    version: 3,
    fanwaiStories: [
        { id: 'fanwai-1', charId: 'char-1', charName: '角色', style: '古风', content: '番外正文', createdAt: 1, format: 'text' },
    ],
    collectedLetters: [
        { id: 'letter-1', charId: 'char-1', charName: '角色', date: '2026-09-26', year: 2026, body: '信的内容', tone: 'love' },
    ],
    xhsOwnedPosts: [
        { id: 'char-1:note-1', characterId: 'char-1', noteId: 'note-1', title: '笔记标题', body: '笔记正文', publishedAt: 1, updatedAt: 1 },
    ],
    localState: {
        nrcache_nr_books: '[{"id":"b1","title":"测试书"}]',
        nrcache_nr_progress: '{"b1":42}',
        os_sub_api_presets: '[{"id":"p1","name":"副API"}]',
        wechat_bridge_settings_v1: '{"clientId":"dev-1"}',
        gamehub_stats: '{"total":10}',
        os_fanwai_form_v1: '{"style":"古风"}',
        os_last_seen_date: '2026-09-26',
    },
};

describe('备份载荷往返（真实 writeV2Backup / assembleV2Backup）', () => {
    it('三个新 store 落成独立分片，且出现在 manifest.stores 中', async () => {
        const zip = new JSZip();
        const { writer } = adaptZip(zip);
        const manifest = await writeV2Backup(writer, structuredClone(PAYLOAD), {
            mode: 'full',
            createdAt: 1758892800000,
        });

        for (const field of ['fanwaiStories', 'collectedLetters', 'xhsOwnedPosts']) {
            expect(manifest.stores[field], `${field} 应有分片记录`).toBeDefined();
            expect(manifest.stores[field].count, `${field} 条数`).toBe(1);
            expect(zip.file(`stores/${field}.000.json`), `${field} 分片文件`).not.toBeNull();
        }

        // 分片文件内容应可单独解析，且是我们写进去的那条
        const fanwaiShard = await zip.file('stores/fanwaiStories.000.json')!.async('string');
        expect(JSON.parse(fanwaiShard)).toEqual(PAYLOAD.fanwaiStories);
    });

    it('localState（对象字段）进 metadata.json，并能原样读回', async () => {
        const zip = new JSZip();
        const { writer, reader } = adaptZip(zip);
        const manifest = await writeV2Backup(writer, structuredClone(PAYLOAD), {
            mode: 'full',
            createdAt: 1758892800000,
        });

        // 非数组字段走 metadata.json，不应产生 stores 分片
        expect(zip.file('metadata.json'), 'metadata.json 必须存在').not.toBeNull();
        expect(manifest.stores.localState, 'localState 不该被当成数组分片').toBeUndefined();

        const metadata = JSON.parse(await zip.file('metadata.json')!.async('string'));
        expect(metadata.localState).toEqual(PAYLOAD.localState);

        // 组装回来的完整 data 里，三类新字段都要在
        const data = await assembleV2Backup(reader, manifest);
        expect(data.fanwaiStories).toEqual(PAYLOAD.fanwaiStories);
        expect(data.collectedLetters).toEqual(PAYLOAD.collectedLetters);
        expect(data.xhsOwnedPosts).toEqual(PAYLOAD.xhsOwnedPosts);
        expect(data.localState).toEqual(PAYLOAD.localState);
    });

    it('空数组与缺省字段不会互相干扰（旧备份语义保持）', async () => {
        const zip = new JSZip();
        const { writer, reader } = adaptZip(zip);
        // 模拟"只有 idb 三个 store、没有 localState"的载荷：localState 不参与数组分片，
        // 因此旧版本读端不会因为缺少该字段而报错。
        const manifest = await writeV2Backup(writer, {
            timestamp: 1,
            version: 3,
            fanwaiStories: [],
            collectedLetters: [],
            xhsOwnedPosts: [],
        }, { mode: 'text_only', createdAt: 1 });

        const data = await assembleV2Backup(reader, manifest);
        expect(data.fanwaiStories).toEqual([]);
        expect(data.localState).toBeUndefined();
    });
});
