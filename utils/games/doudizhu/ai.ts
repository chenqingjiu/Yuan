/**
 * 斗地主 AI 决策（纯规则，不烧 token）。
 *
 * 移植自 AionsHome（MIT）的 _strategic_play_decision / _fallback_bid：
 * 用「剩余手数」估算牌力，配合队友识别、剩余大牌推演、炸弹时机，打出接近人类的水平。
 * 台词由 UI 层另调小模型生成，这里只给规则兜底文案。
 */

import type { Card, DdzState } from './rules';
import {
    RANKS,
    RANK_VALUE,
    canBeat,
    cardRank,
    classifyCards,
    countRanks,
    generateCandidateMoves,
    isBombMove,
    isTeammate,
    newDeck,
    sortCards,
} from './rules';

export interface Decision {
    action: 'play' | 'pass';
    cards: Card[];
    speech: string;
}

interface ScoredMove {
    action: 'play';
    cards: Card[];
    type: string;
    rank: number;
}

const PASS_SPEECH = '这手我先不要。';

function nextPlayerOf(state: DdzState, player: string): string {
    const idx = state.order.indexOf(player);
    return state.order[(idx + 1) % state.order.length];
}

function opponentsOf(state: DdzState, player: string): string[] {
    const others = state.order.filter((p) => p !== player);
    if (!state.landlord) return others;
    return player === state.landlord ? others : [state.landlord];
}

function minHandCount(state: DdzState, players: string[]): number {
    const counts = players.filter(Boolean).map((p) => (state.hands[p] || []).length);
    return counts.length ? Math.min(...counts) : 99;
}

/** 自己看不到的牌（全副牌 - 自己的手牌 - 已出的牌）。 */
export function unseenRankCounts(state: DdzState, player: string): Record<string, number> {
    const seen = [...(state.hands[player] || []), ...state.playedCards];
    const total = countRanks(newDeck());
    const visible = countRanks(seen);
    const out: Record<string, number> = {};
    for (const r of RANKS) out[r] = (total[r] || 0) - (visible[r] || 0);
    return out;
}

/**
 * 「还剩几手能出完」的估算器：把所有合法牌型当覆盖块，做记忆化搜索。
 * 忽略对手，只衡量手牌结构好坏，用作 AI 的核心估值。
 */
function buildTurnCounter(hand: Card[]): (counts: number[]) => number {
    const patterns = new Set<string>();
    for (const cards of generateCandidateMoves(hand)) {
        if (!classifyCards(cards)) continue;
        const c = countRanks(cards);
        patterns.add(RANKS.map((r) => c[r] || 0).join(','));
    }

    const covering: { size: number; used: [number, number][] }[][] = RANKS.map(() => []);
    for (const key of patterns) {
        const pattern = key.split(',').map(Number);
        const used: [number, number][] = [];
        pattern.forEach((n, i) => {
            if (n) used.push([i, n]);
        });
        const size = pattern.reduce((a, b) => a + b, 0);
        for (const [i] of used) covering[i].push({ size, used });
    }
    for (const options of covering) {
        options.sort((a, b) => b.size - a.size || a.used.length - b.used.length);
    }

    const memo = new Map<string, number>();
    const turns = (counts: number[]): number => {
        const total = counts.reduce((a, b) => a + b, 0);
        if (!total) return 0;
        const key = counts.join(',');
        const cached = memo.get(key);
        if (cached !== undefined) return cached;
        if (patterns.has(key)) {
            memo.set(key, 1);
            return 1;
        }
        const pivot = counts.findIndex((n) => n > 0);
        let best = total;
        for (const option of covering[pivot]) {
            if (!option.used.every(([i, n]) => counts[i] >= n)) continue;
            const rest = counts.slice();
            for (const [i, n] of option.used) rest[i] -= n;
            best = Math.min(best, 1 + turns(rest));
            if (best === 2) break; // 一手能走完的情况已经在上面处理过
        }
        memo.set(key, best);
        return best;
    };
    return turns;
}

/**
 * 叫分：按大牌（2 / 王 / A）和炸弹估算牌力。
 * isLastBidder=true 表示自己是最后一家，此时牌不太烂就给个 1 分，
 * 避免三家都不叫反复重新发牌。
 */
export function chooseBid(hand: Card[], currentBid: number, isLastBidder = false): number {
    const counts = countRanks(hand);
    const bombs = Object.values(counts).filter((c) => c === 4).length;
    const strength =
        (counts['2'] || 0) +
        (counts.BJ || 0) * 1.5 +
        (counts.RJ || 0) * 2 +
        (counts.A || 0) * 0.5 +
        bombs * 2.5;

    let want = 0;
    if (strength >= 4.5) want = 3;
    else if (strength >= 3) want = 2;
    else if (strength >= 2) want = 1;

    if (want <= currentBid) {
        if (isLastBidder && currentBid === 0 && strength >= 1.2) want = 1;
        else want = 0;
    }
    return Math.min(3, want);
}

export function choosePlay(state: DdzState, player: string): Decision {
    const hand = state.hands[player] || [];
    const last = state.lastPlay;
    const following = !!last && last.player !== player;
    const canPass = following;

    const candidates: ScoredMove[] = [];
    for (const cards of generateCandidateMoves(hand)) {
        const moveType = classifyCards(cards);
        if (!moveType) continue;
        if (following && last && !canBeat(moveType, last)) continue;
        candidates.push({
            action: 'play',
            cards: sortCards(cards),
            type: moveType.type,
            rank: moveType.rank,
        });
    }

    const pass = (speech: string = PASS_SPEECH): Decision => ({ action: 'pass', cards: [], speech });
    if (!candidates.length) return pass();

    // 能一手走完就直接走。
    for (const move of candidates) {
        if (hand.length - move.cards.length === 0) {
            return { action: 'play', cards: move.cards, speech: '这手能收就不拖了。' };
        }
    }

    const original = countRanks(hand);
    const turns = buildTurnCounter(hand);
    const unseen = unseenRankCounts(state, player);
    const opponents = opponentsOf(state, player);
    const opponentCount = minHandCount(state, opponents);
    const threats = new Set<number>(
        opponents.map((p) => (state.hands[p] || []).length).filter((n) => n === 1 || n === 2),
    );
    const teammate = state.order.find((p) => p !== player && isTeammate(state, player, p));
    const teammateCount = teammate ? (state.hands[teammate] || []).length : 99;

    const restOf = (move: ScoredMove): number[] => {
        const used = countRanks(move.cards);
        return RANKS.map((r) => (original[r] || 0) - (used[r] || 0));
    };

    const score = (move: ScoredMove): number => {
        const used = countRanks(move.cards);
        const rest = restOf(move);
        let value = -140 * turns(rest) - rest.reduce((a, b) => a + b, 0) * 2;
        value -= move.rank * (following ? 1.5 : 0.5);
        RANKS.forEach((r, i) => {
            if (rest[i] === 1) value -= Math.max(0, RANK_VALUE.A - RANK_VALUE[r]) * 1.5;
        });
        for (const r of RANKS) {
            const u = used[r] || 0;
            if (!u) continue;
            const owned = original[r] || 0;
            if (owned === 4 && u < 4) value -= 180;
            else if ((owned === 2 || owned === 3) && u < owned) value -= 18;
            if (RANK_VALUE[r] >= RANK_VALUE['2']) value -= u * 24;
        }
        if (original.BJ && original.RJ && !!used.BJ !== !!used.RJ) value -= 180;
        if (isBombMove(move)) value -= 100;
        return value;
    };

    const best = (options: ScoredMove[]): ScoredMove =>
        options.reduce((a, b) => (score(b) > score(a) ? b : a), options[0]);

    const highestBlock = (options: ScoredMove[]): ScoredMove => {
        const normal = options.filter((m) => !isBombMove(m));
        if (!normal.length) return best(options);
        return normal.reduce((a, b) => {
            if (b.rank !== a.rank) return b.rank > a.rank ? b : a;
            return score(b) > score(a) ? b : a;
        }, normal[0]);
    };

    // 炸弹时机：手里剩下的牌能一次出完，且对手大概率没有更大炸弹时才炸。
    const maxOpponentCount = Math.max(0, ...opponents.map((p) => (state.hands[p] || []).length));
    for (const bomb of candidates.filter((m) => isBombMove(m))) {
        const rest = hand.filter((c) => !bomb.cards.includes(c));
        if (!classifyCards(rest)) continue;
        const rocketPossible = maxOpponentCount >= 2 && unseen.BJ > 0 && unseen.RJ > 0;
        const higherBombPossible = maxOpponentCount >= 4 && RANKS.some((r) => unseen[r] === 4 && RANK_VALUE[r] > bomb.rank);
        if (bomb.type === 'rocket' || !(rocketPossible || higherBombPossible)) {
            return { action: 'play', cards: bomb.cards, speech: '先拿回出牌权，下一手收尾。' };
        }
    }

    if (following && last) {
        // 队友出的牌：能接就接，但别抢队友的收尾；地主下一手就可能走完时才顶上去。
        if (isTeammate(state, player, last.player)) {
            const landlordNext = nextPlayerOf(state, player) === state.landlord;
            const matchingThreat = threats.has(last.length) && (last.type === 'single' || last.type === 'pair');
            const biggerUnseen = RANKS.some((r) => unseen[r] >= last.length && RANK_VALUE[r] > last.rank);
            if (landlordNext && matchingThreat && biggerUnseen) {
                const pick = highestBlock(candidates);
                return { action: 'play', cards: pick.cards, speech: '我来挡一下，别让地主收尾。' };
            }
            return pass('这手给队友过。');
        }

        const urgent = opponentCount <= 2;
        if (urgent && (last.type === 'single' || last.type === 'pair') && threats.has(last.length)) {
            const pick = highestBlock(candidates);
            return { action: 'play', cards: pick.cards, speech: '这手得拦住。' };
        }
        const normal = candidates.filter((m) => !isBombMove(m));
        if (!normal.length && !urgent) return pass();
        const chosen = best(normal.length ? normal : candidates);
        if (!urgent && chosen.rank >= RANK_VALUE['2'] && turns(restOf(chosen)) > 1) {
            return pass();
        }
        return { action: 'play', cards: chosen.cards, speech: '压一手，把节奏拿回来。' };
    }

    // 自己先出：对手只剩一两张时优先封口。
    if (threats.size) {
        const controls = candidates.filter(
            (m) =>
                (m.type === 'single' || m.type === 'pair') &&
                threats.has(m.cards.length) &&
                !RANKS.some((r) => unseen[r] >= m.cards.length && RANK_VALUE[r] > m.rank),
        );
        if (controls.length) {
            const pick = best(controls);
            return { action: 'play', cards: pick.cards, speech: '先用大牌把收尾封住。' };
        }
        const safe = candidates.filter((m) => !threats.has(m.cards.length));
        const pick = safe.length ? best(safe) : highestBlock(candidates);
        return { action: 'play', cards: pick.cards, speech: '先封住你们的收尾。' };
    }

    // 队友快走完了，下一手是他：递一个小口。
    if (teammate && teammateCount <= 2 && nextPlayerOf(state, player) === teammate) {
        const wanted = teammateCount === 1 ? 'single' : 'pair';
        const feeds = candidates.filter((m) => m.type === wanted && m.rank < RANK_VALUE.A);
        const intact = feeds.filter((m) => (original[cardRank(m.cards[0])] || 0) === m.cards.length);
        if (intact.length) {
            const pick = intact.reduce((a, b) => (b.rank < a.rank ? b : a));
            return { action: 'play', cards: pick.cards, speech: '递个小口，给队友接。' };
        }
    }

    const pick = best(candidates);
    return { action: 'play', cards: pick.cards, speech: '先把牌型顺出去。' };
}

/** 给玩家的「提示」：复用同一套决策，返回推荐出牌（可能是「不出」）。 */
export function suggestPlay(state: DdzState, player: string): Decision {
    return choosePlay(state, player);
}
