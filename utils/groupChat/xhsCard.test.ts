import { describe, it, expect } from 'vitest';
import { hasXhsShareLink, buildXhsNoteCard } from '../xhsLinkCard';
import { messageLogText } from './format';
import { buildGroupHistoryBlock } from './prompts';
import { buildMemberTimeline } from './timeline';

const NOTE_URL = 'https://www.xiaohongshu.com/explore/65a1b2c3d4e5f60718293a4b';

const xhsMessage = (over: Record<string, any> = {}) => ({
    id: 1,
    charId: 'user',
    groupId: 'g1',
    role: 'user',
    type: 'xhs_card',
    content: '周末去哪玩',
    timestamp: Date.now(),
    metadata: {
        xhsNote: {
            noteId: '65a1b2c3d4e5f60718293a4b',
            title: '周末去哪玩',
            desc: '沿着河边慢慢走，风很舒服，路边有家咖啡馆。',
            author: '小夏',
            likes: 128,
            collects: 20,
        },
    },
    ...over,
}) as any;

describe('小红书分享识别', () => {
    it('认得完整笔记链接与 xhslink 短链', () => {
        expect(hasXhsShareLink(`看这个 ${NOTE_URL}`)).toBe(true);
        expect(hasXhsShareLink('复制打开小红书 http://xhslink.com/a/AbCd123')).toBe(true);
    });

    it('普通文本与其它站点链接不算', () => {
        expect(hasXhsShareLink('今天天气不错，出去走走')).toBe(false);
        expect(hasXhsShareLink('https://example.com/post/1')).toBe(false);
    });

    it('非小红书文本直接返回 null，不做任何网络请求', async () => {
        await expect(buildXhsNoteCard('今天天气不错')).resolves.toBeNull();
    });
});

describe('群聊里的小红书卡片', () => {
    it('时间线只取一行摘要（不把正文塞进 80 字的时间线）', () => {
        const line = messageLogText(xhsMessage());
        expect(line).toContain('小红书笔记');
        expect(line).toContain('周末去哪玩');
        expect(line).toContain('小夏');
    });

    // 这条是本次改动的核心：卡片正文必须真的进到成员读到的 prompt 里，
    // 否则群里只有一张好看的图，模型仍然只知道标题。
    it('群聊历史展开正文、作者、互动数据', () => {
        const block = buildGroupHistoryBlock([xhsMessage()], [], [], '我');
        expect(block.text).toContain('沿着河边慢慢走');
        expect(block.text).toContain('小夏');
        expect(block.text).toContain('128赞');
    });

    it('卡片缺 metadata 时不崩，给出明确占位', () => {
        const block = buildGroupHistoryBlock(
            [xhsMessage({ metadata: {} })],
            [], [], '我',
        );
        expect(block.text).toContain('用户');
    });

    it('成员时间线遇到卡片不抛错', () => {
        const text = buildMemberTimeline({
            privateMsgs: [],
            groupMsgs: [xhsMessage()],
            cap: 40,
            resolveSpeaker: () => '用户',
            stickerName: () => '表情',
        });
        expect(text).toContain('小红书笔记');
        expect(text).toContain('周末去哪玩');
    });
});
