/**
 * 斗地主规则引擎（纯函数：牌型 / 压牌 / 候选枚举 / 状态迁移）。
 *
 * 移植自 AionsHome（death34018-hue/AionsHome，MIT）的 aion-chat/routes/doudizhu.py，
 * 规则行为保持一致，去掉了钱包结算、群聊战报与 TTS 播报。
 */

export type Card = string;
export type PlayerId = 'user' | string;

export const RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2', 'BJ', 'RJ'];
export const RANK_VALUE: Record<string, number> = RANKS.reduce<Record<string, number>>((acc, rank, i) => {
    acc[rank] = i;
    return acc;
}, {});
const SUIT_VALUE: Record<string, number> = { S: 0, H: 1, C: 2, D: 3 };
const STRAIGHT_RANKS = RANKS.slice(0, 12); // 3 ~ A，顺子/连对/飞机不含 2 和王

export const SUIT_SYMBOL: Record<string, string> = { S: '♠', H: '♥', C: '♣', D: '♦' };

export type MoveKind =
    | 'rocket'
    | 'bomb'
    | 'single'
    | 'pair'
    | 'triple'
    | 'triple_single'
    | 'triple_pair'
    | 'straight'
    | 'pair_straight'
    | 'airplane'
    | 'airplane_single'
    | 'airplane_pair'
    | 'four_two_singles'
    | 'four_two_pairs';

export interface MoveType {
    type: MoveKind;
    rank: number;
    length: number;
    chain?: number;
    wing?: 'none' | 'single' | 'pair';
    label: string;
}

export interface PlayRecord extends MoveType {
    player: string;
    cards: Card[];
}

export interface DdzState {
    phase: 'bidding' | 'playing' | 'over';
    order: string[];
    hands: Record<string, Card[]>;
    bottom: Card[];
    bottomRevealed: boolean;
    landlord: string | null;
    currentPlayer: string;
    currentBid: number;
    bidTurns: number;
    bids: { player: string; bid: number }[];
    lastPlay: PlayRecord | null;
    passes: string[];
    playedCards: Card[];
    winner: string | null;
}

export function cardRank(card: Card): string {
    return card === 'BJ' || card === 'RJ' ? card : card.slice(0, -1);
}

function cardSuitValue(card: Card): number {
    const suit = card.slice(-1);
    return SUIT_VALUE[suit] ?? 0;
}

export function sortCards(cards: Card[]): Card[] {
    return [...cards].sort((a, b) => {
        const d = RANK_VALUE[cardRank(a)] - RANK_VALUE[cardRank(b)];
        return d !== 0 ? d : cardSuitValue(a) - cardSuitValue(b);
    });
}

export function newDeck(): Card[] {
    const deck: Card[] = [];
    for (const rank of RANKS.slice(0, 13)) {
        for (const suit of ['S', 'H', 'C', 'D']) deck.push(`${rank}${suit}`);
    }
    deck.push('BJ', 'RJ');
    return deck;
}

export function countRanks(cards: Card[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const card of cards) {
        const r = cardRank(card);
        counts[r] = (counts[r] || 0) + 1;
    }
    return counts;
}

function isConsecutive(values: number[]): boolean {
    if (!values.length) return false;
    for (let i = 0; i < values.length - 1; i++) {
        if (values[i] + 1 !== values[i + 1]) return false;
    }
    return true;
}

/** 识别牌型；不合法返回 null。 */
export function classifyCards(input: Card[]): MoveType | null {
    const cards = sortCards(input);
    const n = cards.length;
    if (!n) return null;

    const rankCount = countRanks(cards);
    const entries = Object.entries(rankCount).sort((a, b) => RANK_VALUE[a[0]] - RANK_VALUE[b[0]]);
    const values = entries.map(([rank]) => RANK_VALUE[rank]);
    const counts = Object.values(rankCount).sort((a, b) => b - a);

    if (n === 2 && rankCount.BJ === 1 && rankCount.RJ === 1) {
        return { type: 'rocket', rank: RANK_VALUE.RJ, length: 2, label: '王炸' };
    }
    if (n === 4 && counts.length === 1 && counts[0] === 4) {
        return { type: 'bomb', rank: values[0], length: 4, label: '炸弹' };
    }
    if (n === 1) {
        return { type: 'single', rank: values[0], length: 1, label: '单张' };
    }
    if (n === 2 && counts.length === 1 && counts[0] === 2) {
        return { type: 'pair', rank: values[0], length: 2, label: '对子' };
    }
    if (n === 3 && counts.length === 1 && counts[0] === 3) {
        return { type: 'triple', rank: values[0], length: 3, label: '三张' };
    }
    if (n === 4 && counts[0] === 3 && counts[1] === 1) {
        const main = Math.max(...entries.filter(([, c]) => c === 3).map(([r]) => RANK_VALUE[r]));
        return { type: 'triple_single', rank: main, length: 4, label: '三带一' };
    }
    if (n === 5 && counts[0] === 3 && counts[1] === 2) {
        const main = Math.max(...entries.filter(([, c]) => c === 3).map(([r]) => RANK_VALUE[r]));
        return { type: 'triple_pair', rank: main, length: 5, label: '三带一对' };
    }

    const noTwoOrJoker = values.every((v) => v < RANK_VALUE['2']);
    if (n >= 5 && entries.length === n && noTwoOrJoker && isConsecutive(values)) {
        return { type: 'straight', rank: values[values.length - 1], length: n, label: `${n}顺` };
    }
    if (n >= 6 && n % 2 === 0 && counts.every((c) => c === 2) && noTwoOrJoker && isConsecutive(values)) {
        return { type: 'pair_straight', rank: values[values.length - 1], length: n, chain: n / 2, label: '连对' };
    }

    const tripleValues = entries
        .filter(([rank, c]) => c === 3 && RANK_VALUE[rank] < RANK_VALUE['2'])
        .map(([rank]) => RANK_VALUE[rank])
        .sort((a, b) => a - b);
    if (tripleValues.length >= 2 && isConsecutive(tripleValues)) {
        const tripleCount = tripleValues.length;
        const restCounts = entries.filter(([rank]) => !tripleValues.includes(RANK_VALUE[rank])).map(([, c]) => c);
        if (n === tripleCount * 3) {
            return { type: 'airplane', rank: tripleValues[tripleValues.length - 1], length: n, chain: tripleCount, wing: 'none', label: '飞机' };
        }
        if (n === tripleCount * 4 && restCounts.every((c) => c === 1)) {
            return { type: 'airplane_single', rank: tripleValues[tripleValues.length - 1], length: n, chain: tripleCount, wing: 'single', label: '飞机带单' };
        }
        if (n === tripleCount * 5 && restCounts.every((c) => c === 2)) {
            return { type: 'airplane_pair', rank: tripleValues[tripleValues.length - 1], length: n, chain: tripleCount, wing: 'pair', label: '飞机带对' };
        }
    }

    if (n === 6 && counts[0] === 4) {
        const main = Math.max(...entries.filter(([, c]) => c === 4).map(([r]) => RANK_VALUE[r]));
        return { type: 'four_two_singles', rank: main, length: 6, label: '四带二' };
    }
    if (n === 8 && counts[0] === 4 && counts.filter((c) => c !== 4).join(',') === '2,2') {
        const main = Math.max(...entries.filter(([, c]) => c === 4).map(([r]) => RANK_VALUE[r]));
        return { type: 'four_two_pairs', rank: main, length: 8, label: '四带两对' };
    }

    return null;
}

/** 这手牌能否压过上一手。 */
export function canBeat(move: MoveType | null, last: MoveType | null): boolean {
    if (!move) return false;
    if (!last) return true;
    if (move.type === 'rocket') return last.type !== 'rocket';
    if (move.type === 'bomb') {
        return last.type !== 'bomb' && last.type !== 'rocket' ? true : move.rank > last.rank;
    }
    if (last.type === 'bomb' || last.type === 'rocket') return false;
    return (
        move.type === last.type &&
        move.length === last.length &&
        move.chain === last.chain &&
        move.rank > last.rank
    );
}

export function isBombMove(move: { type?: string } | null | undefined): boolean {
    return !!move && (move.type === 'bomb' || move.type === 'rocket');
}

function combinations<T>(items: T[], k: number): T[][] {
    if (k <= 0) return [[]];
    if (items.length < k) return [];
    const out: T[][] = [];
    const pick: T[] = [];
    const walk = (start: number) => {
        if (pick.length === k) {
            out.push([...pick]);
            return;
        }
        for (let i = start; i < items.length; i++) {
            pick.push(items[i]);
            walk(i + 1);
            pick.pop();
        }
    };
    walk(0);
    return out;
}

/** 枚举手牌里所有可能组成的牌型（不判压牌，只判牌型合法）。 */
export function generateCandidateMoves(input: Card[]): Card[][] {
    const hand = sortCards(input);
    const byRank: Record<string, Card[]> = {};
    for (const card of hand) {
        const r = cardRank(card);
        if (!byRank[r]) byRank[r] = [];
        byRank[r].push(card);
    }

    const moves: Card[][] = [];
    const take = (rank: string, n: number) => byRank[rank].slice(0, n);

    for (const rank of RANKS) {
        const cards = byRank[rank] || [];
        if (cards.length >= 1) moves.push(take(rank, 1));
        if (cards.length >= 2) moves.push(take(rank, 2));
        if (cards.length >= 3) {
            const triple = take(rank, 3);
            moves.push(triple);
            for (const r of RANKS) {
                if (r !== rank && byRank[r]) moves.push([...triple, take(r, 1)[0]]);
            }
            const pairRanks = RANKS.filter((r) => r !== rank && (byRank[r] || []).length >= 2);
            for (const r of pairRanks) moves.push([...triple, ...take(r, 2)]);
        }
        if (cards.length === 4) {
            const bomb = take(rank, 4);
            moves.push(bomb);
            const others = RANKS.filter((r) => r !== rank && byRank[r]);
            for (const [a, b] of combinations(others, 2)) {
                moves.push([...bomb, byRank[a][0], byRank[b][0]]);
            }
            const pairs = others.filter((r) => byRank[r].length >= 2);
            for (const r of pairs) moves.push([...bomb, ...take(r, 2)]);
            for (const [a, b] of combinations(pairs, 2)) {
                moves.push([...bomb, ...take(a, 2), ...take(b, 2)]);
            }
        }
    }

    if (byRank.BJ && byRank.RJ) moves.push(['BJ', 'RJ']);

    for (let start = 0; start < STRAIGHT_RANKS.length; start++) {
        const run: string[] = [];
        for (const rank of STRAIGHT_RANKS.slice(start)) {
            if (!byRank[rank]) break;
            run.push(rank);
            if (run.length >= 5) moves.push(run.map((r) => take(r, 1)[0]));
        }
    }

    for (let start = 0; start < STRAIGHT_RANKS.length; start++) {
        const run: string[] = [];
        for (const rank of STRAIGHT_RANKS.slice(start)) {
            if ((byRank[rank] || []).length < 2) break;
            run.push(rank);
            if (run.length >= 3) {
                const cards: Card[] = [];
                for (const r of run) cards.push(...take(r, 2));
                moves.push(cards);
            }
        }
    }

    for (let start = 0; start < STRAIGHT_RANKS.length; start++) {
        const run: string[] = [];
        for (const rank of STRAIGHT_RANKS.slice(start)) {
            if ((byRank[rank] || []).length < 3) break;
            run.push(rank);
            if (run.length >= 2) {
                const cards: Card[] = [];
                for (const r of run) cards.push(...take(r, 3));
                moves.push(cards);
                const others = RANKS.filter((r) => !run.includes(r) && byRank[r]);
                for (const wings of combinations(others, run.length)) {
                    moves.push([...cards, ...wings.map((r) => byRank[r][0])]);
                }
                const pairs = others.filter((r) => byRank[r].length >= 2);
                for (const wings of combinations(pairs, run.length)) {
                    moves.push([...cards, ...wings.flatMap((r) => take(r, 2))]);
                }
            }
        }
    }

    const seen = new Set<string>();
    const unique: Card[][] = [];
    for (const cards of moves) {
        const sorted = sortCards(cards);
        const key = sorted.join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(sorted);
    }
    return unique;
}

export interface LegalMove {
    action: 'play' | 'pass';
    cards: Card[];
    type?: MoveKind;
    label: string;
    rank?: number;
}

/** 当前可出的所有合法选择（含「不出」）。 */
export function legalMoves(hand: Card[], last: PlayRecord | null, canPass: boolean): LegalMove[] {
    const moves: LegalMove[] = [];
    if (canPass) moves.push({ action: 'pass', cards: [], label: '不出' });

    for (const cards of generateCandidateMoves(hand)) {
        const moveType = classifyCards(cards);
        if (!moveType) continue;
        if (last && !canBeat(moveType, last)) continue;
        moves.push({
            action: 'play',
            cards: sortCards(cards),
            type: moveType.type,
            label: moveType.label,
            rank: moveType.rank,
        });
    }

    moves.sort((a, b) => {
        const aLen = a.action === 'pass' ? 0 : a.cards.length;
        const bLen = b.action === 'pass' ? 0 : b.cards.length;
        if (aLen !== bLen) return aLen - bLen;
        return (a.rank ?? -1) - (b.rank ?? -1);
    });
    return moves;
}

// ---------------------------------------------------------------- 状态迁移

export function createGame(playerIds: string[]): DdzState {
    const deck = newDeck();
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    const hands: Record<string, Card[]> = {};
    playerIds.forEach((pid, idx) => {
        hands[pid] = sortCards(deck.slice(idx * 17, idx * 17 + 17));
    });
    return {
        phase: 'bidding',
        order: [...playerIds],
        hands,
        bottom: sortCards(deck.slice(51, 54)),
        bottomRevealed: false,
        landlord: null,
        currentPlayer: playerIds[0],
        currentBid: 0,
        bidTurns: 0,
        bids: [],
        lastPlay: null,
        passes: [],
        playedCards: [],
        winner: null,
    };
}

function nextPlayer(state: DdzState, player: string): string {
    const idx = state.order.indexOf(player);
    return state.order[(idx + 1) % state.order.length];
}

/** 叫分。返回是否已进入出牌阶段。 */
export function applyBid(state: DdzState, player: string, bid: number): DdzState {
    const next: DdzState = { ...state, hands: { ...state.hands }, bids: [...state.bids], passes: [] };
    let value = Math.max(0, Math.min(3, Math.trunc(bid)));
    if (value !== 0 && value <= next.currentBid) value = 0;

    next.bids.push({ player, bid: value });
    next.currentBid = Math.max(next.currentBid, value);
    next.bidTurns += 1;

    if (value === 3 || next.bidTurns >= 3) {
        const best = next.bids.reduce((a, b) => (b.bid > a.bid ? b : a), next.bids[0]);
        if (best.bid <= 0) {
            // 三家都不叫：重新发牌，回到叫分起点。
            return createGame(state.order);
        }
        next.landlord = best.player;
        next.bottomRevealed = true;
        next.hands[best.player] = sortCards([...(next.hands[best.player] || []), ...next.bottom]);
        next.phase = 'playing';
        next.currentPlayer = best.player;
        next.lastPlay = null;
        next.passes = [];
    } else {
        next.currentPlayer = nextPlayer(next, player);
    }
    return next;
}

/** 出牌 / 不出。非法时抛错，调用方负责兜底。 */
export function applyPlay(state: DdzState, player: string, action: 'play' | 'pass', cards: Card[]): DdzState {
    const next: DdzState = {
        ...state,
        hands: { ...state.hands },
        passes: [...state.passes],
        playedCards: [...state.playedCards],
    };

    if (action === 'pass') {
        if (!state.lastPlay || state.lastPlay.player === player) {
            throw new Error('当前轮次不能不出');
        }
        next.passes.push(player);
        if (new Set(next.passes).size >= 2) {
            const starter = state.lastPlay.player;
            next.currentPlayer = starter;
            next.lastPlay = null;
            next.passes = [];
        } else {
            next.currentPlayer = nextPlayer(state, player);
        }
        return next;
    }

    const played = sortCards(cards);
    if (!played.length) throw new Error('没有选择要出的牌');
    const hand = state.hands[player] || [];
    const handCopy = [...hand];
    for (const card of played) {
        const idx = handCopy.indexOf(card);
        if (idx < 0) throw new Error('手牌中没有这些牌');
        handCopy.splice(idx, 1);
    }
    const moveType = classifyCards(played);
    if (!moveType) throw new Error('牌型不合法');
    const last = state.lastPlay;
    if (last && last.player !== player && !canBeat(moveType, last)) {
        throw new Error('这手牌压不过上一手');
    }

    next.hands[player] = sortCards(handCopy);
    next.playedCards.push(...played);
    next.lastPlay = { player, cards: played, ...moveType };
    next.passes = [];

    if (!next.hands[player].length) {
        next.phase = 'over';
        next.winner = player;
    } else {
        next.currentPlayer = nextPlayer(state, player);
    }
    return next;
}

export function bombCount(state: DdzState): number {
    // 只统计成功打出的炸弹 / 王炸：靠 lastPlay 历史不够，这里从已出牌里数四张组数与双王。
    const counts = countRanks(state.playedCards);
    let bombs = Object.values(counts).filter((c) => c === 4).length;
    if (counts.BJ === 1 && counts.RJ === 1) bombs += 1;
    return bombs;
}

export function isTeammate(state: DdzState, player: string, other: string): boolean {
    if (!state.landlord) return false;
    return player !== state.landlord && other !== state.landlord;
}
