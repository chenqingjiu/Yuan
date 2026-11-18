/**
 * 游戏大厅战绩历史（localStorage，key `gamehub_stats`）。
 * 记录总局数 / 胜局 / MVP 次数 / 最近战绩，供大厅卡片展示「上次战绩」。
 *
 * 注：原「你说我猜」设置（gamehub_settings）随该游戏下线一并移除。
 */

/** 战绩历史 */
export interface GameStats {
    totalGames: number;
    wins: number;
    mvpCount: number;
    /** 最近一局战绩描述（大厅卡片展示"上次战绩"） */
    lastResult?: string;
}

const STATS_KEY = 'gamehub_stats';

/** 读取战绩历史 */
export function loadGameStats(): GameStats {
    try {
        const raw = localStorage.getItem(STATS_KEY);
        return raw ? { totalGames: 0, wins: 0, mvpCount: 0, ...JSON.parse(raw) } : { totalGames: 0, wins: 0, mvpCount: 0 };
    } catch (e) {
        return { totalGames: 0, wins: 0, mvpCount: 0 };
    }
}

/**
 * 记录一局战绩。
 * @param isWin 用户是否获胜
 * @param isMvp 用户是否为 MVP
 * @param lastResult 最近战绩描述
 */
export function recordGameStats(isWin: boolean, isMvp: boolean, lastResult: string): GameStats {
    const stats = loadGameStats();
    const next: GameStats = {
        totalGames: stats.totalGames + 1,
        wins: stats.wins + (isWin ? 1 : 0),
        mvpCount: stats.mvpCount + (isMvp ? 1 : 0),
        lastResult,
    };
    try {
        localStorage.setItem(STATS_KEY, JSON.stringify(next));
    } catch (e) { /* ignore */ }
    return next;
}
