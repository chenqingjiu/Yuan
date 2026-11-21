import { describe, expect, it } from 'vitest';
import { localDecide, parseAttackReply, type AttackContext } from './rivalBrain';

const ctx = (over: Partial<AttackContext> = {}): AttackContext => ({
    rivalName: '苏利',
    minute: 2,
    myMoney: 100,
    rivalMoney: 120,
    myWaiting: 1,
    myGrillFull: false,
    myServed: 6,
    rivalServed: 7,
    attacksLeft: 3,
    hitBy: [],
    myItems: [],
    ...over,
});

describe('解析模型回包', () => {
    it('正常一行：道具|台词', () => {
        const r = parseAttackReply('fan|火太旺了吧，我帮你扇扇', 3);
        expect(r).toEqual({ use: true, item: 'fan', line: '火太旺了吧，我帮你扇扇' });
    });

    it('中文道具名也能认', () => {
        expect(parseAttackReply('泼水|你的火借我用用', 2)?.item).toBe('water');
        expect(parseAttackReply('城管|来了来了', 1)?.item).toBe('raid');
    });

    it('no 表示这次不出手', () => {
        const r = parseAttackReply('no|先让你烤两条', 3);
        expect(r?.use).toBe(false);
    });

    it('机会用完了，硬要打也不算', () => {
        expect(parseAttackReply('fan|扇死你', 0)).toBeNull();
    });

    it('胡说八道就返回 null，交给本地兜底', () => {
        expect(parseAttackReply('我觉得应该用扇风比较好', 3)).toBeNull();
        expect(parseAttackReply('', 3)).toBeNull();
        expect(parseAttackReply('xxx|yyy', 3)).toBeNull();
    });

    it('带引号和换行也能洗干净', () => {
        const r = parseAttackReply('扇风｜「火太大了」\n这句是解释', 3);
        expect(r?.item).toBe('fan');
        expect(r?.line).toBe('火太大了');
    });
});

describe('本地兜底', () => {
    it('没机会了就不打', () => {
        const d = localDecide(ctx({ attacksLeft: 0 }), () => 0.1);
        expect(d.use).toBe(false);
    });

    it('落后的时候更想动手', () => {
        let eager = 0;
        for (let i = 0; i < 100; i++) {
            if (localDecide(ctx({ myMoney: 200, rivalMoney: 100 }), () => i / 100).use) eager++;
        }
        expect(eager).toBeGreaterThan(65);
    });

    it('炉子满了优先扇风', () => {
        const d = localDecide(ctx({ myGrillFull: true }), () => 0.05);
        expect(d.use).toBe(true);
        expect(['fan', 'salt']).toContain(d.item);
    });

    it('出手时一定有台词', () => {
        for (let i = 0; i < 20; i++) {
            const d = localDecide(ctx(), () => i / 20);
            if (d.use) expect(d.line.length).toBeGreaterThan(0);
        }
    });
});
