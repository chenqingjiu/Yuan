/**
 * 夜市烧烤素材表。
 *
 * 所有视觉资源集中在这里：想换图只改本文件的 image 字段，界面代码一行不用动。
 * 图片放在 public/kitchen/，用 BASE_URL 拼路径（GitHub Pages 是仓库子路径）。
 */

const BASE = ((import.meta as any).env?.BASE_URL ?? '/') + 'kitchen/';
const img = (f: string) => `${BASE}${f}`;

export interface FoodDef {
    id: string;
    name: string;
    image: string;
    /** 图片加载失败时的兜底色块色 */
    color: string;
    emoji: string;
}

const food = (id: string, name: string, color: string, emoji: string): FoodDef => ({
    id, name, color, emoji, image: img(`${id}.png`),
});

/** 四种肉 */
export const MEATS: FoodDef[] = [
    food('meat-beef', '牛肉', '#b33a3a', '🥩'),
    food('meat-lamb', '羊肉', '#c97676', '🍖'),
    food('meat-wing', '鸡翅', '#e0a89a', '🍗'),
    food('meat-pork', '五花', '#d98b8b', '🥓'),
];

/** 四种菜 */
export const VEGS: FoodDef[] = [
    food('veg-pepper', '彩椒', '#e0b13a', '🫑'),
    food('veg-onion', '洋葱', '#b07fd0', '🧅'),
    food('veg-bean', '豆角', '#6fa23a', '🫛'),
    food('veg-mushroom', '香菇', '#9a6b45', '🍄'),
];

/** 辣度（0 不辣 / 1 微辣 / 2 重辣），图标是同一个辣椒叠放 */
export const SPICY_LABEL = ['不辣', '微辣', '重辣'] as const;
export const CHILI_ICON = img('icon-chili.png');

/** 烤串四态贴图 */
export const SKEWER_IMG: Record<string, string> = {
    raw: img('skewer-raw.png'),
    half: img('skewer-half.png'),
    done: img('skewer-done.png'),
    burnt: img('skewer-burnt.png'),
};

export const GRILL_IMG = img('grill.png');
export const STICK_IMG = img('skewer-stick.png');
export const BG_IMG = img('bg-night.png');
export const GUEST_IMG = [1, 2, 3, 4].map((i) => img(`guest-${i}.png`));
export const UI_BUBBLE = img('ui-bubble.png');
export const UI_BTN = img('ui-btn.png');
export const UI_PROGRESS = img('ui-progress.png');

/** 撒料（视觉效果，不影响判定） */
export const COND_IMGS = [img('cond-sesame.png'), img('cond-chili.png')];

const ALL: FoodDef[] = [...MEATS, ...VEGS];
export const FOOD_MAP: Record<string, FoodDef> = Object.fromEntries(ALL.map((f) => [f.id, f]));

export const foodOf = (id: string): FoodDef =>
    FOOD_MAP[id] || { id, name: id, image: '', color: '#999', emoji: '❓' };
