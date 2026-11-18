import { describe, expect, it } from 'vitest';
import type { DdzState } from './rules';
import {
    applyBid,
    applyPlay,
    canBeat,
    classifyCards,
    createGame,
    generateCandidateMoves,
    legalMoves,
} from './rules';
import { chooseBid, choosePlay } from './ai';

const kind = (cards: string[]) => classifyCards(cards)?.type ?? null;

function baseState(over: Partial<DdzState> = {}): DdzState {
    return {
        phase: 'playing',
        order: ['user', 'ai1', 'ai2'],
        hands: {
            user: ['3S', '3H', '4S', '4H', '5S'],
            ai1: ['6S', '6H'],
            ai2: ['7S', '7H'],
        },
        bottom: ['8S', '8H', '8C'],
        bottomRevealed: true,
        landlord: 'ai1',
        currentPlayer: 'user',
        currentBid: 1,
        bidTurns: 3,
        bids: [],
        lastPlay: null,
        passes: [],
        playedCards: [],
        winner: null,
        ...over,
    };
}

describe('classifyCards 牌型识别', () => {
    it('识别基础牌型', () => {
        expect(kind(['3S'])).toBe('single');
        expect(kind(['3S', '3H'])).toBe('pair');
        expect(kind(['3S', '3H', '3C'])).toBe('triple');
        expect(kind(['3S', '3H', '3C', '5S'])).toBe('triple_single');
        expect(kind(['3S', '3H', '3C', '5S', '5H'])).toBe('triple_pair');
    });

    it('识别炸弹与王炸', () => {
        expect(kind(['3S', '3H', '3C', '3D'])).toBe('bomb');
        expect(kind(['BJ', 'RJ'])).toBe('rocket');
        // 双王之外的额外牌不算王炸
        expect(kind(['BJ', 'RJ', '3S'])).toBe(null);
    });

    it('识别顺子 / 连对', () => {
        expect(kind(['3S', '4H', '5C', '6S', '7H'])).toBe('straight');
        expect(kind(['10S', 'JH', 'QC', 'KS', 'AH'])).toBe('straight');
        // 顺子不能含 2
        expect(kind(['JS', 'QH', 'KC', 'AS', '2S'])).toBe(null);
        // 顺子最少 5 张
        expect(kind(['3S', '4H', '5C', '6S'])).toBe(null);
        expect(kind(['3S', '3H', '4S', '4H', '5S', '5H'])).toBe('pair_straight');
        expect(kind(['3S', '3H', '4S', '4H'])).toBe(null);
    });

    it('识别飞机三个变体', () => {
        expect(kind(['3S', '3H', '3C', '4S', '4H', '4C'])).toBe('airplane');
        expect(kind(['3S', '3H', '3C', '4S', '4H', '4C', '5S', '6H'])).toBe('airplane_single');
        expect(kind(['3S', '3H', '3C', '4S', '4H', '4C', '5S', '5H', '6S', '6H'])).toBe('airplane_pair');
    });

    it('识别四带二', () => {
        expect(kind(['3S', '3H', '3C', '3D', '5S', '6H'])).toBe('four_two_singles');
        expect(kind(['3S', '3H', '3C', '3D', '5S', '5H', '6S', '6H'])).toBe('four_two_pairs');
    });

    it('乱牌不合法', () => {
        expect(kind(['3S', '5H'])).toBe(null);
        expect(kind(['3S', '3H', '5C'])).toBe(null);
        expect(kind([])).toBe(null);
    });
});

describe('canBeat 压牌判定', () => {
    it('同类型比大小', () => {
        const small = classifyCards(['3S'])!;
        const big = classifyCards(['5S'])!;
        expect(canBeat(big, small)).toBe(true);
        expect(canBeat(small, big)).toBe(false);
        expect(canBeat(small, small)).toBe(false);
    });

    it('长度不同不能压', () => {
        const straight5 = classifyCards(['3S', '4H', '5C', '6S', '7H'])!;
        const straight6 = classifyCards(['3S', '4H', '5C', '6S', '7H', '8C'])!;
        expect(canBeat(straight6, straight5)).toBe(false);
    });

    it('炸弹压普通牌，王炸压炸弹', () => {
        const single = classifyCards(['AS'])!;
        const pair = classifyCards(['AS', 'AH'])!;
        const bomb = classifyCards(['3S', '3H', '3C', '3D'])!;
        const rocket = classifyCards(['BJ', 'RJ'])!;
        expect(canBeat(bomb, single)).toBe(true);
        expect(canBeat(bomb, pair)).toBe(true);
        expect(canBeat(rocket, bomb)).toBe(true);
        expect(canBeat(bomb, rocket)).toBe(false);
    });

    it('普通牌压不过炸弹', () => {
        const bomb = classifyCards(['3S', '3H', '3C', '3D'])!;
        const bigPair = classifyCards(['2S', '2H'])!;
        expect(canBeat(bigPair, bomb)).toBe(false);
    });

    it('空场随便出', () => {
        expect(canBeat(classifyCards(['3S'])!, null)).toBe(true);
        expect(canBeat(null, null)).toBe(false);
    });
});

describe('generateCandidateMoves / legalMoves 枚举', () => {
    it('候选牌型都能被规则识别（不会产生非法组合）', () => {
        const hand = ['3S', '3H', '3C', '4S', '4H', '5S', '6H', '7C', '8D'];
        for (const cards of generateCandidateMoves(hand)) {
            expect(classifyCards(cards)).not.toBeNull();
        }
    });

    it('候选去重', () => {
        const hand = ['3S', '3H', '4S', '4H'];
        const moves = generateCandidateMoves(hand).map((c) => [...c].sort().join('|'));
        expect(new Set(moves).size).toBe(moves.length);
    });

    it('有上家出牌时，只留能压过的选择', () => {
        const last = { player: 'ai1', cards: ['5S'], ...classifyCards(['5S'])! };
        const moves = legalMoves(['3S', '7H', '9C'], last, true);
        const plays = moves.filter((m) => m.action === 'play');
        expect(plays.every((m) => m.cards[0] !== '3S')).toBe(true);
        expect(plays.length).toBeGreaterThan(0);
        expect(moves[0].action).toBe('pass');
    });
});

describe('applyBid 叫分', () => {
    it('叫 3 分立刻当地主并拿底牌', () => {
        const game = createGame(['user', 'ai1', 'ai2']);
        const next = applyBid(game, 'user', 3);
        expect(next.landlord).toBe('user');
        expect(next.phase).toBe('playing');
        expect(next.hands['user'].length).toBe(20);
        expect(next.bottomRevealed).toBe(true);
        expect(next.currentPlayer).toBe('user');
    });

    it('三家都不叫，重新发牌', () => {
        let game = createGame(['user', 'ai1', 'ai2']);
        game = applyBid(game, 'user', 0);
        game = applyBid(game, 'ai1', 0);
        game = applyBid(game, 'ai2', 0);
        expect(game.phase).toBe('bidding');
        expect(game.bidTurns).toBe(0);
        expect(game.bids).toHaveLength(0);
        expect(game.hands['user'].length).toBe(17);
    });

    it('叫分必须高于当前分，否则视为不叫', () => {
        let game = createGame(['user', 'ai1', 'ai2']);
        game = applyBid(game, 'user', 2);
        game = applyBid(game, 'ai1', 1);
        expect(game.bids[1].bid).toBe(0);
        expect(game.currentBid).toBe(2);
    });
});

describe('applyPlay 出牌', () => {
    it('出牌后手牌减少，轮到下家', () => {
        const state = baseState();
        const next = applyPlay(state, 'user', 'play', ['3S']);
        expect(next.hands['user']).toEqual(['3H', '4S', '4H', '5S']);
        expect(next.currentPlayer).toBe('ai1');
        expect(next.lastPlay?.cards).toEqual(['3S']);
    });

    it('出完手牌即结束', () => {
        const state = baseState({ hands: { user: ['3S'], ai1: ['6S'], ai2: ['7S'] } });
        const next = applyPlay(state, 'user', 'play', ['3S']);
        expect(next.phase).toBe('over');
        expect(next.winner).toBe('user');
    });

    it('压不过会抛错', () => {
        const state = baseState({
            lastPlay: { player: 'ai1', cards: ['5S'], ...classifyCards(['5S'])! },
            currentPlayer: 'user',
        });
        expect(() => applyPlay(state, 'user', 'play', ['3S'])).toThrow();
    });

    it('不是自己的手牌会抛错', () => {
        const state = baseState();
        expect(() => applyPlay(state, 'user', 'play', ['6S'])).toThrow();
    });

    it('两家不出后轮次重置给最后出牌的人', () => {
        const state = baseState({
            lastPlay: { player: 'ai1', cards: ['6S'], ...classifyCards(['6S'])! },
            currentPlayer: 'ai2',
        });
        const afterAi2 = applyPlay(state, 'ai2', 'pass', []);
        expect(afterAi2.currentPlayer).toBe('user');
        expect(afterAi2.passes).toEqual(['ai2']);

        const afterUser = applyPlay(afterAi2, 'user', 'pass', []);
        expect(afterUser.currentPlayer).toBe('ai1');
        expect(afterUser.lastPlay).toBeNull();
        expect(afterUser.passes).toEqual([]);
    });

    it('自己领出时不能不出', () => {
        const state = baseState({ lastPlay: null });
        expect(() => applyPlay(state, 'user', 'pass', [])).toThrow();
    });
});

describe('choosePlay AI 决策', () => {
    it('能一手走完就出', () => {
        const state = baseState({ hands: { user: ['3S'], ai1: ['6S'], ai2: ['7S'] }, lastPlay: null });
        const d = choosePlay(state, 'user');
        expect(d.action).toBe('play');
        expect(d.cards).toEqual(['3S']);
    });

    it('压不过时主动不出', () => {
        const state = baseState({
            hands: { user: ['3S', '4H'], ai1: ['6S'], ai2: ['7S'] },
            lastPlay: { player: 'ai1', cards: ['5S', '5H'], ...classifyCards(['5S', '5H'])! },
            currentPlayer: 'user',
        });
        const d = choosePlay(state, 'user');
        expect(d.action).toBe('pass');
    });

    it('决策一定是合法出牌', () => {
        const hands = [
            ['3S', '3H', '3C', '4S', '4H', '5S', '6H', '7C', '8D', '9S', '10H', 'JC', 'QS', 'KH', 'AS', '2S', 'BJ'],
            ['3S', '4H', '5C', '6S', '7H', '8C', '9S', '10H', 'JC', 'QS', 'KH', 'AS', '2H', '2C', '2D', 'RJ', '5D'],
        ];
        for (const hand of hands) {
            const state = baseState({ hands: { user: hand, ai1: ['6S'], ai2: ['7S'] }, lastPlay: null });
            const d = choosePlay(state, 'user');
            expect(d.action).toBe('play');
            expect(classifyCards(d.cards)).not.toBeNull();
            // 出的牌必须都在手里
            for (const card of d.cards) expect(hand).toContain(card);
        }
    });

    it('是队友的牌就尽量不抢（除非地主快走完）', () => {
        // 玩家是农民，队友 ai2 出了单张，地主 ai1 还剩 8 张 —— 应当让过
        const state = baseState({
            landlord: 'ai1',
            hands: {
                user: ['3S', '4H', '9C', 'KD', 'AS'],
                ai1: ['6S', '6H', '7S', '7H', '8S', '8H', '9S', '9H'],
                ai2: ['5S'],
            },
            lastPlay: { player: 'ai2', cards: ['5S'], ...classifyCards(['5S'])! },
            currentPlayer: 'user',
        });
        const d = choosePlay(state, 'user');
        expect(d.action).toBe('pass');
    });
});

describe('整局对局模拟', () => {
    it('三家 AI 连续 30 局都能正常打完（无死循环 / 无非法出牌）', () => {
        const turnsPerGame: number[] = [];
        for (let round = 0; round < 30; round++) {
            let game = createGame(['user', 'ai1', 'ai2']);

            let guard = 0;
            while (game.phase === 'bidding' && guard++ < 12) {
                const pid = game.currentPlayer;
                game = applyBid(game, pid, chooseBid(game.hands[pid] || [], game.currentBid, game.bidTurns >= 2));
            }
            expect(game.phase).toBe('playing');

            let steps = 0;
            while (game.phase === 'playing' && steps++ < 600) {
                const pid = game.currentPlayer;
                const decision = choosePlay(game, pid);
                game = applyPlay(game, pid, decision.action, decision.cards);
            }
            expect(game.phase).toBe('over');
            expect(game.winner).toBeTruthy();
            expect((game.hands[game.winner!] || []).length).toBe(0);
            turnsPerGame.push(steps);
        }
        // 一局正常在几十步内结束，超过 200 步说明 AI 在来回无效出牌。
        expect(Math.max(...turnsPerGame)).toBeLessThan(200);
    });
});
