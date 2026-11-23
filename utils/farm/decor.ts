/**
 * 一块田 · 院子装饰。
 *
 * 和房子不一样：房子是「换一栋」，装饰是「买一个摆一个」。
 * 每个品类都有固定的候选位，按买下的顺序依次落到空位里，
 * 这样玩家不用拖拽也不会把院子摆成一锅粥。
 *
 * 坐标是场景世界坐标（米），z 越小越靠里。
 */

export type DecorId = 'fence' | 'rock' | 'flower' | 'bush' | 'haystack' | 'well' | 'tree' | 'sakura';

export interface DecorSlot {
    x: number;
    z: number;
    /** 覆盖默认高度，让同一品类的大小有变化 */
    h?: number;
    /** 朝向，栅栏一排用得上 */
    ry?: number;
}

export interface DecorDef {
    id: DecorId;
    name: string;
    tex: string;
    /** 单价 */
    cost: number;
    /** 解锁等级 */
    level: number;
    /** 最多摆几个（= 候选位数量） */
    max: number;
    /** 默认高度 */
    size: number;
    slots: DecorSlot[];
    desc: string;
}

export const DECOR: Record<DecorId, DecorDef> = {
    fence: {
        id: 'fence',
        name: '木栅栏',
        tex: 'prop-fence.png',
        cost: 60,
        level: 2,
        max: 2,
        size: 1.32,
        slots: [
            { x: 0.9, z: -4.85 },
            { x: 2.16, z: -4.85 },
        ],
        desc: '把后院那排栅栏接着往右围',
    },
    rock: {
        id: 'rock',
        name: '青石',
        tex: 'prop-rock.png',
        cost: 40,
        level: 2,
        max: 2,
        size: 0.55,
        slots: [
            { x: 1.75, z: -0.6, h: 0.6 },
            { x: -5.4, z: 0.4, h: 0.5 },
        ],
        desc: '随手丢在草里的一块石头，不小不大',
    },
    flower: {
        id: 'flower',
        name: '花丛',
        tex: 'flower-3.png',
        cost: 45,
        level: 3,
        max: 2,
        size: 0.95,
        slots: [
            { x: 2.1, z: -1.8 },
            { x: -4.8, z: 0.9 },
        ],
        desc: '一丛小野花，院子里的那点颜色',
    },
    bush: {
        id: 'bush',
        name: '灌木',
        tex: 'prop-bush.png',
        cost: 80,
        level: 3,
        max: 1,
        size: 1.1,
        slots: [
            { x: -6.0, z: -0.9 },
        ],
        desc: '矮矮一团，挡不住视线但看着热闹',
    },
    haystack: {
        id: 'haystack',
        name: '干草堆',
        tex: 'prop-haystack.png',
        cost: 90,
        level: 5,
        max: 1,
        size: 1.5,
        slots: [
            { x: 0.0, z: -4.2 },
        ],
        desc: '收完的麦秆扎成一垛，秋收的味儿',
    },
    well: {
        id: 'well',
        name: '水井',
        tex: 'prop-well.png',
        cost: 220,
        level: 6,
        max: 1,
        size: 1.7,
        slots: [
            { x: 2.3, z: -2.5 },
        ],
        desc: '院子里第二口井，纯属好看',
    },
    tree: {
        id: 'tree',
        name: '大树',
        tex: 'prop-tree.png',
        cost: 200,
        level: 7,
        max: 1,
        size: 3.0,
        slots: [
            { x: -1.5, z: -6.2, h: 3.0 },
        ],
        desc: '再来一棵，院子一下就满了',
    },
    sakura: {
        id: 'sakura',
        name: '樱花树',
        tex: 'prop-sakura.png',
        cost: 320,
        level: 9,
        max: 1,
        size: 3.1,
        slots: [
            { x: 3.6, z: -4.4, h: 3.1 },
        ],
        desc: '最贵的一棵，风一吹全是花瓣',
    },
};

export const DECOR_ORDER: DecorId[] = ['fence', 'rock', 'flower', 'bush', 'haystack', 'well', 'tree', 'sakura'];

/** 当前摆了几个 */
export function decorCount(state: { decor?: Partial<Record<DecorId, number>> }, id: DecorId): number {
    return Math.min(state.decor?.[id] ?? 0, DECOR[id].slots.length);
}
