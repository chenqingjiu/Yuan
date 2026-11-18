import { describe, expect, it } from 'vitest';
import {
    buildHistoryBlock,
    formatChatForReport,
    makeLine,
    pickResponder,
    toReportChat,
    type TableLine,
} from './tableChat';

const seats = [
    { id: 'ai1', name: '林小满' },
    { id: 'ai2', name: '周野' },
];

describe('makeLine', () => {
    it('带上说话人与角色标记', () => {
        const l = makeLine('user', '你', 'user', '你们俩是不是串通好的', 1700000000000);
        expect(l.speakerId).toBe('user');
        expect(l.speakerName).toBe('你');
        expect(l.role).toBe('user');
        expect(l.text).toBe('你们俩是不是串通好的');
        expect(l.ts).toBe(1700000000000);
    });

    it('id 不重复', () => {
        const ids = new Set(Array.from({ length: 50 }, () => makeLine('ai1', 'A', 'char', 'x').id));
        expect(ids.size).toBe(50);
    });
});

describe('pickResponder', () => {
    it('点名谁谁接话', () => {
        expect(pickResponder('周野你是不是藏牌了', seats, 'ai1')).toBe('ai2');
    });

    it('名字里的空格不影响点名', () => {
        expect(pickResponder('林 小 满 你怎么不说话', seats, 'ai2')).toBe('ai1');
    });

    it('同时点到两个人时，取更长的名字（避免短名误伤）', () => {
        const list = [
            { id: 'a', name: '美' },
            { id: 'b', name: '小美' },
        ];
        expect(pickResponder('小美你说句话', list, 'a')).toBe('b');
    });

    it('没点名就轮到谁说', () => {
        expect(pickResponder('这牌打得没意思', seats, 'ai2')).toBe('ai2');
    });

    it('没点名且不知轮到谁，也会给一个人', () => {
        const id = pickResponder('哈哈哈', seats, null);
        expect(['ai1', 'ai2']).toContain(id);
    });

    it('避免同一个人连着接（只有两个候选时也给另一个人）', () => {
        for (let i = 0; i < 20; i++) {
            expect(pickResponder('嗯', seats, null, 'ai1')).toBe('ai2');
        }
    });

    it('只有一个候选时不会返回 null', () => {
        expect(pickResponder('在吗', [{ id: 'ai1', name: '林小满' }], null, 'ai1')).toBe('ai1');
    });

    it('没有候选就没人接', () => {
        expect(pickResponder('在吗', [], 'ai1')).toBeNull();
    });
});

describe('buildHistoryBlock', () => {
    const lines: TableLine[] = [
        makeLine('user', '你', 'user', '第一句'),
        makeLine('ai1', '林小满', 'char', '第二句'),
        makeLine('user', '你', 'user', '第三句'),
        makeLine('ai2', '周野', 'char', '第四句'),
    ];

    it('只带最近 N 句', () => {
        const block = buildHistoryBlock(lines, 2);
        expect(block).toContain('第三句');
        expect(block).toContain('第四句');
        expect(block).not.toContain('第一句');
    });

    it('保留原话与说话人', () => {
        expect(buildHistoryBlock(lines, 5)).toBe('你：第一句\n林小满：第二句\n你：第三句\n周野：第四句');
    });

    it('空记录返回空串', () => {
        expect(buildHistoryBlock([], 5)).toBe('');
    });
});

describe('战报对话原文', () => {
    const lines: TableLine[] = [
        makeLine('user', '你', 'user', '你俩肯定是一伙的'),
        makeLine('ai1', '林小满', 'char', '我这是替天行道'),
    ];

    it('一条不删、一句不改', () => {
        const text = formatChatForReport(lines);
        expect(text).toBe('你：你俩肯定是一伙的\n林小满：我这是替天行道');
        expect(text.split('\n')).toHaveLength(2);
    });

    it('转私聊数据保留顺序与角色标记', () => {
        const arr = toReportChat(lines);
        expect(arr).toHaveLength(2);
        expect(arr[0]).toMatchObject({ speaker: '你', role: 'user', text: '你俩肯定是一伙的' });
        expect(arr[1]).toMatchObject({ speaker: '林小满', role: 'char', text: '我这是替天行道' });
    });

    it('没有对话时是空串', () => {
        expect(formatChatForReport([])).toBe('');
        expect(toReportChat([])).toEqual([]);
    });
});
