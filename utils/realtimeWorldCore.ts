/**
 * realtimeWorldCore — 天气 / 热搜 / 节日的取数与成段渲染（环境无关叶子模块）
 *
 * 「角色能看到外面的世界」这件事，前台聊天和主动消息到点生成要说同一套话：同样的
 * 数据源、同样的措辞、同样的分寸拿捏。所以取数（天气两源、热榜多平台、节日表）和
 * 把它们拼成提示词那一段，全都住在这里，浏览器（realtimeContext 的 Manager 委托
 * 调用）和 amsg worker（onBeforeFire 到点填槽）共用同一份。
 *
 * 缓存不在这里：浏览器把热榜快照存 IndexedDB，worker 存 D1，两边策略不同，各自在
 * 自己那层包一圈就好，这里只负责「真去拉一次」和「拉到的东西怎么写成话」。
 *
 * 往这里加代码前先确认：不 import 任何带浏览器依赖的模块（db / safeApi / keepAlive 等）。
 * `pnpm build:workers` 会把这份打进 amsg worker bundle，带进浏览器依赖会在构建期直接暴露。
 */

import { nowInTimeZone } from './timezone';
import type { Anniversary } from '../types';

export interface WeatherData {
    temp: number;
    feelsLike: number;
    humidity: number;
    description: string;
    icon: string;
    city: string;
}

export interface NewsItem {
    title: string;
    source?: string;
    url?: string;
    desc?: string;
}

/**
 * 叶子里不用 safeApi 的 safeResponseJson——那份挂着开发面板的接口日志，是浏览器侧的东西。
 * 这里只要「响应不是 JSON 就抛出带原文片段的错」，让调用方能在日志里看出拉到了什么。
 */
const readJson = async (res: Response): Promise<any> => {
    const text = await res.text();
    try {
        return JSON.parse(text);
    } catch {
        throw new Error(`响应不是 JSON：${text.slice(0, 120)}`);
    }
};

// ==================== 天气 ====================

// Open-Meteo 地名解析缓存：城市名 → 坐标，避免每次取天气都多打一次 geocoding
const geocodeCache = new Map<string, { latitude: number; longitude: number; name: string }>();

// WMO weather code（Open-Meteo 返回的 weather_code）→ 中文描述 + 近似 OWM icon 码
// 完整码表见 https://open-meteo.com/en/docs（WMO Weather interpretation codes）
const WMO_WEATHER_CODES: Record<number, { description: string; icon: string }> = {
    0: { description: '晴', icon: '01d' },
    1: { description: '大致晴朗', icon: '02d' },
    2: { description: '局部多云', icon: '03d' },
    3: { description: '阴', icon: '04d' },
    45: { description: '雾', icon: '50d' },
    48: { description: '雾凇', icon: '50d' },
    51: { description: '轻微毛毛雨', icon: '09d' },
    53: { description: '毛毛雨', icon: '09d' },
    55: { description: '浓密毛毛雨', icon: '09d' },
    56: { description: '冻毛毛雨', icon: '09d' },
    57: { description: '强冻毛毛雨', icon: '09d' },
    61: { description: '小雨', icon: '10d' },
    63: { description: '中雨', icon: '10d' },
    65: { description: '大雨', icon: '10d' },
    66: { description: '冻雨', icon: '13d' },
    67: { description: '强冻雨', icon: '13d' },
    71: { description: '小雪', icon: '13d' },
    73: { description: '中雪', icon: '13d' },
    75: { description: '大雪', icon: '13d' },
    77: { description: '雪粒', icon: '13d' },
    80: { description: '小阵雨', icon: '09d' },
    81: { description: '阵雨', icon: '09d' },
    82: { description: '强阵雨', icon: '09d' },
    85: { description: '小阵雪', icon: '13d' },
    86: { description: '强阵雪', icon: '13d' },
    95: { description: '雷阵雨', icon: '11d' },
    96: { description: '雷阵雨伴小冰雹', icon: '11d' },
    99: { description: '雷阵雨伴大冰雹', icon: '11d' },
};

/**
 * OpenWeatherMap 源（需要 API Key）。失败时抛错，由调用方决定是否回落。
 */
export const fetchOwmWeather = async (city: string, apiKey: string): Promise<WeatherData> => {
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric&lang=zh_cn`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`OpenWeatherMap HTTP ${response.status}`);
    }
    const data = await readJson(response);
    return {
        temp: Math.round(data.main.temp),
        feelsLike: Math.round(data.main.feels_like),
        humidity: data.main.humidity,
        description: data.weather[0]?.description || '未知',
        icon: data.weather[0]?.icon || '01d',
        city: data.name
    };
};

/**
 * Open-Meteo 源（免费、免 key、CORS 友好）。城市名先过官方 geocoding（支持中文），失败时抛错。
 */
export const fetchOpenMeteoWeather = async (city: string): Promise<WeatherData> => {
    let geo = geocodeCache.get(city);
    if (!geo) {
        const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=zh&format=json`;
        const geoRes = await fetch(geoUrl);
        if (!geoRes.ok) {
            throw new Error(`Open-Meteo geocoding HTTP ${geoRes.status}`);
        }
        const geoData = await readJson(geoRes);
        const hit = geoData.results?.[0];
        if (!hit) {
            throw new Error(`Open-Meteo 找不到城市: ${city}`);
        }
        geo = { latitude: hit.latitude, longitude: hit.longitude, name: hit.name };
        geocodeCache.set(city, geo);
    }

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${geo.latitude}&longitude=${geo.longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code&timezone=auto`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Open-Meteo HTTP ${response.status}`);
    }
    const data = await readJson(response);
    const current = data.current;
    const wmo = WMO_WEATHER_CODES[current.weather_code] || { description: '未知', icon: '01d' };
    return {
        temp: Math.round(current.temperature_2m),
        feelsLike: Math.round(current.apparent_temperature),
        humidity: Math.round(current.relative_humidity_2m),
        description: wmo.description,
        icon: wmo.icon,
        city: geo.name
    };
};

/**
 * 取天气：填了 OpenWeatherMap key 优先走 OWM，失败或没填 key 时回落免费的 Open-Meteo。
 * 两源都不成返回 null（调用方按「这次没天气」渲染，不断链）。
 */
export const fetchWeatherWithFallback = async (
    city: string,
    apiKey?: string,
): Promise<WeatherData | null> => {
    if (!city) return null;

    if (apiKey) {
        try {
            return await fetchOwmWeather(city, apiKey);
        } catch (e) {
            console.warn('OpenWeatherMap 失败，回落 Open-Meteo:', e);
        }
    }

    try {
        return await fetchOpenMeteoWeather(city);
    } catch (e) {
        console.error('Failed to fetch weather:', e);
        return null;
    }
};

/**
 * 生成天气建议
 */
export const generateWeatherAdvice = (weather: WeatherData): string => {
    const advices: string[] = [];

    // 温度建议
    if (weather.temp < 5) {
        advices.push('天气很冷，记得多穿点');
    } else if (weather.temp < 15) {
        advices.push('有点凉，注意保暖');
    } else if (weather.temp > 30) {
        advices.push('天气炎热，注意防暑');
    } else if (weather.temp > 25) {
        advices.push('天气不错，适合出门');
    }

    // 天气状况建议
    const desc = weather.description.toLowerCase();
    if (desc.includes('雨')) {
        advices.push('记得带伞');
    } else if (desc.includes('雪')) {
        advices.push('路上小心，注意防滑');
    } else if (desc.includes('雾') || desc.includes('霾')) {
        advices.push('空气不太好，建议戴口罩');
    } else if (desc.includes('晴')) {
        advices.push('阳光明媚');
    }

    // 湿度建议
    if (weather.humidity > 80) {
        advices.push('湿度较高，可能会闷热');
    } else if (weather.humidity < 30) {
        advices.push('空气干燥，记得多喝水');
    }

    return advices.join('，') || '天气正常';
};

/** 清掉城市坐标缓存（设置页换城市后重新解析用）。 */
export const clearGeocodeCache = () => geocodeCache.clear();

// ==================== 节日 ====================

/**
 * 节日分级：
 * - core    陪伴核心（七夕/情人节/520/跨年夜/平安夜/圣诞/春节/用户生日/用户纪念日）：
 *           完整演绎块（主动提起 + 仪式感 + 彩蛋动作），是角色情感表达的舞台。
 * - normal  大众节日（元旦/国庆/端午/中秋/劳动节/儿童节等）：一行注入，点到为止。
 * - light   轻量节日（植树节/愚人节等）：不注入（或极简一行），token 克制。
 *
 * 分级只决定「注入的深度」，节日该有的节日感仍然保留。
 */
export type FestivalTier = 'core' | 'normal' | 'light';

/** 节日定义：分级 + 彩蛋动作（core 专属）。 */
export interface FestivalDef {
    name: string;
    tier: FestivalTier;
    /** 补充说明（如七夕：中国传统情人节）。 */
    label?: string;
    /** 彩蛋动作（core 专属）：让角色在这一天主动做点什么。 */
    egg?: string;
}

// 特殊日期表（公历，MM-DD → 节日定义）
const SPECIAL_DATES: Record<string, FestivalDef> = {
    '01-01': { name: '元旦', tier: 'normal' },
    '02-14': { name: '情人节', tier: 'core', label: '西方情人节', egg: '写一段心里话 / 告白' },
    '03-08': { name: '妇女节', tier: 'normal' },
    '03-12': { name: '植树节', tier: 'light' },
    '03-14': { name: '白色情人节', tier: 'normal' },
    '04-01': { name: '愚人节', tier: 'light' },
    '05-01': { name: '劳动节', tier: 'normal' },
    '05-04': { name: '青年节', tier: 'normal' },
    '05-20': { name: '520', tier: 'core', label: '网络情人节', egg: '写一段心里话 / 告白' },
    '06-01': { name: '儿童节', tier: 'normal' },
    '09-10': { name: '教师节', tier: 'normal' },
    '10-01': { name: '国庆节', tier: 'normal' },
    '10-31': { name: '万圣节', tier: 'normal' },
    '11-11': { name: '光棍节', tier: 'normal' },
    '12-24': { name: '平安夜', tier: 'core', label: '平安夜', egg: '互送礼物氛围' },
    '12-25': { name: '圣诞节', tier: 'core', label: '圣诞节', egg: '互送礼物氛围' },
    '12-31': { name: '跨年夜', tier: 'core', label: '今晚跨年', egg: '一起倒数跨年' }
};

/**
 * 农历节日对应的公历日期（除夕 / 春节 / 元宵 / 端午 / 七夕 / 中秋 / 重阳）。
 *
 * 农历日子要靠天文历推算才知道落在公历哪天，而这份文件是打进 worker bundle 的零依赖
 * 叶子，装不了历法库、也不适合到点再去联网查，所以把日期预先算好平铺在这里，查表即可。
 *
 * 数据来源：香港天文台《公曆與農曆日期對照表》
 * https://www.hko.gov.hk/tc/gts/time/calendar/text/T20XXc.htm （逐年逐日对照后取出七个节日）
 *
 * 覆盖 2026–2035 十年。**过了 2035 需要按同一份对照表续表**：查不到的日期就当那天没有
 * 农历节日，不会报错也不会猜——续之前只是「角色不知道今天是中秋」，不会说错话。
 */
const LUNAR_FESTIVAL_DATES: Record<string, FestivalDef> = {
    // 2026
    '2026-02-16': { name: '除夕', tier: 'core', label: '大年夜', egg: '主动拜年 + 新年祝福' },
    '2026-02-17': { name: '春节', tier: 'core', label: '农历新年', egg: '主动拜年 + 新年祝福' },
    '2026-03-03': { name: '元宵节', tier: 'normal' },
    '2026-06-19': { name: '端午节', tier: 'normal' },
    '2026-08-19': { name: '七夕', tier: 'core', label: '中国传统情人节', egg: '写一段心里话 / 告白' },
    '2026-09-25': { name: '中秋节', tier: 'normal' },
    '2026-10-18': { name: '重阳节', tier: 'normal' },
    // 2027
    '2027-02-05': { name: '除夕', tier: 'core', label: '大年夜', egg: '主动拜年 + 新年祝福' },
    '2027-02-06': { name: '春节', tier: 'core', label: '农历新年', egg: '主动拜年 + 新年祝福' },
    '2027-02-20': { name: '元宵节', tier: 'normal' },
    '2027-06-09': { name: '端午节', tier: 'normal' },
    '2027-08-08': { name: '七夕', tier: 'core', label: '中国传统情人节', egg: '写一段心里话 / 告白' },
    '2027-09-15': { name: '中秋节', tier: 'normal' },
    '2027-10-08': { name: '重阳节', tier: 'normal' },
    // 2028
    '2028-01-25': { name: '除夕', tier: 'core', label: '大年夜', egg: '主动拜年 + 新年祝福' },
    '2028-01-26': { name: '春节', tier: 'core', label: '农历新年', egg: '主动拜年 + 新年祝福' },
    '2028-02-09': { name: '元宵节', tier: 'normal' },
    '2028-05-28': { name: '端午节', tier: 'normal' },
    '2028-08-26': { name: '七夕', tier: 'core', label: '中国传统情人节', egg: '写一段心里话 / 告白' },
    '2028-10-03': { name: '中秋节', tier: 'normal' },
    '2028-10-26': { name: '重阳节', tier: 'normal' },
    // 2029
    '2029-02-12': { name: '除夕', tier: 'core', label: '大年夜', egg: '主动拜年 + 新年祝福' },
    '2029-02-13': { name: '春节', tier: 'core', label: '农历新年', egg: '主动拜年 + 新年祝福' },
    '2029-02-27': { name: '元宵节', tier: 'normal' },
    '2029-06-16': { name: '端午节', tier: 'normal' },
    '2029-08-16': { name: '七夕', tier: 'core', label: '中国传统情人节', egg: '写一段心里话 / 告白' },
    '2029-09-22': { name: '中秋节', tier: 'normal' },
    '2029-10-16': { name: '重阳节', tier: 'normal' },
    // 2030
    '2030-02-02': { name: '除夕', tier: 'core', label: '大年夜', egg: '主动拜年 + 新年祝福' },
    '2030-02-03': { name: '春节', tier: 'core', label: '农历新年', egg: '主动拜年 + 新年祝福' },
    '2030-02-17': { name: '元宵节', tier: 'normal' },
    '2030-06-05': { name: '端午节', tier: 'normal' },
    '2030-08-05': { name: '七夕', tier: 'core', label: '中国传统情人节', egg: '写一段心里话 / 告白' },
    '2030-09-12': { name: '中秋节', tier: 'normal' },
    '2030-10-05': { name: '重阳节', tier: 'normal' },
    // 2031
    '2031-01-22': { name: '除夕', tier: 'core', label: '大年夜', egg: '主动拜年 + 新年祝福' },
    '2031-01-23': { name: '春节', tier: 'core', label: '农历新年', egg: '主动拜年 + 新年祝福' },
    '2031-02-06': { name: '元宵节', tier: 'normal' },
    '2031-06-24': { name: '端午节', tier: 'normal' },
    '2031-08-24': { name: '七夕', tier: 'core', label: '中国传统情人节', egg: '写一段心里话 / 告白' },
    '2031-10-01': { name: '中秋节', tier: 'normal' },
    '2031-10-24': { name: '重阳节', tier: 'normal' },
    // 2032
    '2032-02-10': { name: '除夕', tier: 'core', label: '大年夜', egg: '主动拜年 + 新年祝福' },
    '2032-02-11': { name: '春节', tier: 'core', label: '农历新年', egg: '主动拜年 + 新年祝福' },
    '2032-02-25': { name: '元宵节', tier: 'normal' },
    '2032-06-12': { name: '端午节', tier: 'normal' },
    '2032-08-12': { name: '七夕', tier: 'core', label: '中国传统情人节', egg: '写一段心里话 / 告白' },
    '2032-09-19': { name: '中秋节', tier: 'normal' },
    '2032-10-12': { name: '重阳节', tier: 'normal' },
    // 2033
    '2033-01-30': { name: '除夕', tier: 'core', label: '大年夜', egg: '主动拜年 + 新年祝福' },
    '2033-01-31': { name: '春节', tier: 'core', label: '农历新年', egg: '主动拜年 + 新年祝福' },
    '2033-02-14': { name: '元宵节', tier: 'normal' },
    '2033-06-01': { name: '端午节', tier: 'normal' },
    '2033-08-01': { name: '七夕', tier: 'core', label: '中国传统情人节', egg: '写一段心里话 / 告白' },
    '2033-09-08': { name: '中秋节', tier: 'normal' },
    '2033-10-01': { name: '重阳节', tier: 'normal' },
    // 2034
    '2034-02-18': { name: '除夕', tier: 'core', label: '大年夜', egg: '主动拜年 + 新年祝福' },
    '2034-02-19': { name: '春节', tier: 'core', label: '农历新年', egg: '主动拜年 + 新年祝福' },
    '2034-03-05': { name: '元宵节', tier: 'normal' },
    '2034-06-20': { name: '端午节', tier: 'normal' },
    '2034-08-20': { name: '七夕', tier: 'core', label: '中国传统情人节', egg: '写一段心里话 / 告白' },
    '2034-09-27': { name: '中秋节', tier: 'normal' },
    '2034-10-20': { name: '重阳节', tier: 'normal' },
    // 2035
    '2035-02-07': { name: '除夕', tier: 'core', label: '大年夜', egg: '主动拜年 + 新年祝福' },
    '2035-02-08': { name: '春节', tier: 'core', label: '农历新年', egg: '主动拜年 + 新年祝福' },
    '2035-02-22': { name: '元宵节', tier: 'normal' },
    '2035-06-10': { name: '端午节', tier: 'normal' },
    '2035-08-10': { name: '七夕', tier: 'core', label: '中国传统情人节', egg: '写一段心里话 / 告白' },
    '2035-09-16': { name: '中秋节', tier: 'normal' },
    '2035-10-09': { name: '重阳节', tier: 'normal' },
};

/**
 * 特殊日期命中（详细版）：节日名 + 级别 + 彩蛋动作 + 氛围文案。
 */
export interface SpecialDateHit {
    name: string;
    tier: FestivalTier;
    label?: string;
    egg?: string;
    /** 窗口期氛围文案（如「正值春节 · 正月初三」）；非节日本身的窗口氛围日才有。 */
    windowText?: string;
    /** 今天是否是用户的生日（由调用方传入 birthday 判断）。 */
    isUserBirthday?: boolean;
    /** 今天是否是用户自定义纪念日（anniversaries 命中）。 */
    isAnniversary?: boolean;
}

/**
 * 检查特殊日期（公历节日 + 农历节日 + 用户生日 + 自定义纪念日），返回分级命中。
 * tz 非空时按角色所在时区判「今天几号」——否则角色会跟着用户的日历过节：
 * 用户这边 2/14 早上，角色在纽约还是 13 号晚上，却被告知今天是情人节。
 *
 * - birthday：用户档案里的生日，格式 YYYY-MM-DD 或 MM-DD（可选；没传则不做生日判断）。
 * - 窗口期：春节（除夕 → 元宵）与跨年（12/31 → 1/1）的窗口氛围日也会命中，
 *   用 windowText 标记（如「正值春节 · 正月初三」），让角色在节日前后也能感知气氛。
 *
 * 公历和农历撞在同一天时两个都给（比如 2031 年的中秋恰好也是国庆）。
 */
export const checkSpecialDatesDetailed = (
    tz?: string,
    nowMs?: number,
    anniversaries?: Anniversary[],
    birthday?: string,
): SpecialDateHit[] => {
    const now = nowInTimeZone(tz, nowMs == null ? undefined : new Date(nowMs));
    const monthDay = `${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
    const fullDate = `${now.getFullYear()}-${monthDay}`;

    const hits: SpecialDateHit[] = [];

    const pushDef = (def: FestivalDef) => {
        const hit: SpecialDateHit = { name: def.name, tier: def.tier, label: def.label, egg: def.egg };
        hits.push(hit);
    };

    const special = SPECIAL_DATES[monthDay];
    if (special) {
        pushDef(special);
    }

    const lunar = LUNAR_FESTIVAL_DATES[fullDate];
    if (lunar) {
        pushDef(lunar);
    }

    // 用户生日：按「月-日」匹配（支持 YYYY-MM-DD 或 MM-DD），命中为陪伴核心级。
    if (birthday) {
        const bMonthDay = birthday.length > 5 ? birthday.slice(5) : birthday;
        if (bMonthDay === monthDay) {
            hits.push({
                name: '用户生日', tier: 'core',
                label: '今天是你家宝的生日', egg: '送上祝福 + 准备小惊喜（纯演绎）',
                isUserBirthday: true,
            });
        }
    }

    // 用户自定义纪念日：按「月-日」每年同一天匹配（不管年份），当天感知为陪伴核心级。
    // charId 过滤由调用方在传入前做好（只传当前角色的纪念日）。
    if (anniversaries && anniversaries.length > 0) {
        for (const a of anniversaries) {
            const aMonthDay = (a.date || '').slice(5); // 取 YYYY-MM-DD 的 MM-DD
            if (aMonthDay === monthDay && a.title) {
                hits.push({
                    name: a.title, tier: 'core',
                    label: '对你和角色都很重要的日子', egg: '记住并郑重提起（纯演绎）',
                    isAnniversary: true,
                });
            }
        }
    }

    // ── 窗口期氛围 ──
    // 春节：除夕 → 元宵（含）。除夕/春节/元宵当天上面已命中，这里只补「初X」的氛围日。
    const springHit = findSpringFestivalWindowHit(now, monthDay, fullDate);
    if (springHit) hits.push(springHit);
    // 跨年：12/31 → 1/1。12/31 的跨年夜与 1/1 的元旦上面已命中，这里补 1/1 的「昨夜跨年」氛围。
    const crossYearHit = findCrossYearWindowHit(monthDay, hits);
    if (crossYearHit) hits.push(crossYearHit);

    return hits;
};

/**
 * 兼容入口：只返回节日名（保持旧签名 string[]，既有调用方不用改）。
 */
export const checkSpecialDates = (
    tz?: string,
    nowMs?: number,
    anniversaries?: Anniversary[],
): string[] =>
    checkSpecialDatesDetailed(tz, nowMs, anniversaries)
        .filter((h) => !h.windowText)
        .map((h) => h.name);

/** 春节窗口：当年除夕 → 元宵。返回初 X 氛围 hit（当天已是除夕/春节/元宵则不重复）。 */
const findSpringFestivalWindowHit = (
    now: Date,
    monthDay: string,
    fullDate: string,
): SpecialDateHit | null => {
    const year = now.getFullYear();
    const yearPrefix = `${year}-`;
    let chuxi: string | null = null; // 除夕公历日期 YYYY-MM-DD
    let chunjie: string | null = null; // 春节（正月初一）公历日期
    let yuanxiao: string | null = null; // 元宵公历日期

    for (const [date, def] of Object.entries(LUNAR_FESTIVAL_DATES)) {
        if (!date.startsWith(yearPrefix)) continue;
        if (def.name === '除夕') chuxi = date;
        else if (def.name === '春节') chunjie = date;
        else if (def.name === '元宵节') yuanxiao = date;
    }
    if (!chuxi || !chunjie || !yuanxiao) return null;

    // 当天已是节日本体（除夕/春节/元宵），不重复给氛围 hit。
    if (fullDate === chuxi || fullDate === chunjie || fullDate === yuanxiao) return null;
    if (monthDay < chuxi.slice(5) || monthDay > yuanxiao.slice(5)) return null;

    // 算「正月初几」：春节=初X 锚点，往前是除夕，往后递加。
    const springBase = Date.UTC(year, Number(chunjie.slice(5, 7)) - 1, Number(chunjie.slice(8, 10)));
    const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const diffDays = Math.round((todayUtc - springBase) / 86400000);
    const dayX = diffDays + 1; // 正月初一 = 1
    return {
        name: '春节', tier: 'core',
        windowText: `正值春节 · 正月初${dayX}（春节氛围仍在）`,
    };
};

/** 跨年窗口：1/1 元旦当天补「昨夜刚跨年」氛围（12/31 跨年夜本体已命中）。 */
const findCrossYearWindowHit = (
    monthDay: string,
    existing: SpecialDateHit[],
): SpecialDateHit | null => {
    if (monthDay !== '01-01') return null;
    if (existing.some((h) => h.name === '跨年夜')) return null; // 理论上不会同时，保险
    return {
        name: '元旦', tier: 'normal',
        windowText: '昨夜刚跨年 · 新的一年刚刚开始',
    };
};

// ==================== 热搜 ====================

// Upstream moved the hot_news API from orz.ai to news.orz.ai on 2026-08-01.
export const HOTNEWS_API_BASE_URL = 'https://news.orz.ai/api/v1/dailynews';

// hot_news（news.orz.ai）平台 key → 中文展示名。用于 source 标注，让提示词读起来自然。
export const HOTNEWS_PLATFORM_LABELS: Record<string, string> = {
    baidu: '百度', sspai: '少数派', weibo: '微博', zhihu: '知乎', tskr: '36氪',
    ftpojie: '吾爱破解', bilibili: 'B站', douban: '豆瓣', hupu: '虎扑', tieba: '贴吧',
    juejin: '掘金', douyin: '抖音', vtex: 'V2EX', jinritoutiao: '今日头条',
    stackoverflow: 'Stack Overflow', github: 'GitHub', hackernews: 'Hacker News',
    sina_finance: '新浪财经', eastmoney: '东方财富', xueqiu: '雪球', cls: '财联社',
    tenxunwang: '腾讯网',
};

export const DEFAULT_HOTNEWS_PLATFORMS = ['weibo', 'zhihu', 'baidu', 'bilibili', 'douyin'];

/** 平台清单：用户没配就用内置默认。 */
export const resolveHotNewsPlatforms = (platforms?: string[]): string[] =>
    (platforms && platforms.length > 0) ? platforms : DEFAULT_HOTNEWS_PLATFORMS;

/**
 * 使用 hot_news（news.orz.ai）获取中文多平台热榜。
 * 免鉴权、半小时刷新。浏览器端优先直连；若被 CORS 拦截则本调用返回 []，
 * 由 fetchNews 自然回落到 Brave / Hacker News。
 * 多平台并发拉取，每平台取前几条后 round-robin 交错合并，避免单一平台霸屏。
 */
export const fetchHotNews = async (platforms?: string[], perPlatform = 12, total = 240): Promise<NewsItem[]> => {
    const list = resolveHotNewsPlatforms(platforms);

    const perPlatformResults = await Promise.all(list.map(async (p): Promise<NewsItem[]> => {
        const label = HOTNEWS_PLATFORM_LABELS[p] || p;
        try {
            const res = await fetch(`${HOTNEWS_API_BASE_URL}/?platform=${encodeURIComponent(p)}`, {
                headers: { 'Accept': 'application/json' },
            });
            if (!res.ok) {
                console.warn(`[hot_news] ${label}(${p}) HTTP ${res.status}`);
                return [];
            }
            const data = await readJson(res);
            const items: any[] = Array.isArray(data?.data) ? data.data : [];
            const picked = items
                .filter(it => it && it.title)
                .slice(0, perPlatform)
                .map(it => {
                    const rawDesc = typeof it.desc === 'string'
                        ? it.desc
                        : typeof it.content === 'string' ? it.content : '';
                    const desc = rawDesc.replace(/\s+/g, ' ').trim();
                    const normalizedDesc = desc && desc !== String(it.title).trim() ? desc : undefined;
                    return { title: String(it.title), source: label, url: it.url, desc: normalizedDesc };
                });
            const withDesc = picked.filter(x => x.desc).length;
            console.log(`[hot_news] ${label}(${p}) ✓ 取 ${picked.length}/${items.length} 条（含简介 ${withDesc} 条）`);
            return picked;
        } catch (e: any) {
            console.warn(`[hot_news] ${label}(${p}) ✗ 拉取失败（多半是 CORS / 网络）:`, e?.message || e);
            return [];
        }
    }));

    // round-robin 交错：第1名各平台轮一遍，再第2名……保证各平台都有露出
    const merged: NewsItem[] = [];
    for (let rank = 0; rank < perPlatform; rank++) {
        for (const arr of perPlatformResults) {
            if (arr[rank]) merged.push(arr[rank]);
        }
    }
    return merged.slice(0, total);
};

/**
 * 一天分 6 段（每 4 小时）：0-4 凌晨 / 4-8 清晨 / 8-12 上午 / 12-16 午后 / 16-20 傍晚 / 20-24 夜间。
 * slot = floor(hour/4)。tz 非空时按该时区判时段——worker 在 UTC 上跑，不指定的话
 * 「今日上午」会和用户看到的差好几个时段。
 */
export const getHotNewsSlot = (
    opts?: { tz?: string; now?: Date },
): { id: string; date: string; slot: number; label: string } => {
    const d = opts?.tz ? nowInTimeZone(opts.tz, opts.now) : (opts?.now ?? new Date());
    const slot = Math.min(5, Math.floor(d.getHours() / 4));
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const label = ['凌晨', '清晨', '上午', '午后', '傍晚', '夜间'][slot];
    return { id: `${date}#${slot}`, date, slot, label };
};

/** 两次拉取的平台集是不是同一批（顺序无关）——快照能不能复用看它。 */
export const sameHotNewsPlatforms = (a: string[] = [], b: string[] = []): boolean =>
    a.length === b.length && [...a].sort().join(',') === [...b].sort().join(',');

/**
 * 从热点池里随机抽 n 条（Fisher–Yates 打散后取前 n）。每次生成都重新 roll：
 * 同一个时段的快照要被复用很多轮，不打散的话角色会连着几次都在聊同样那几条。
 */
export const pickRandomNews = (news: NewsItem[], n: number): NewsItem[] => {
    const pool = [...news];
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, n);
};

/** 一轮注入几条热点。 */
export const REALTIME_NEWS_PICK_COUNT = 5;

// ==================== 成段渲染 ====================

export interface RealtimeWorldRenderInput {
    /**
     * 「当前真实时间」那一行的正文（调用方按角色时区格式化好）。不传就不出这行——
     * 主动消息到点生成时当前时刻由 fire_pack 自己的槽位给，这里再出一次，
     * 一份 prompt 里就有了两个钟。
     */
    timeLine?: string;
    /**
     * 今日节日（旧签名：纯名字列表）。归「时间感知」管：角色关掉时间感知时调用方传空。
     * 有 specialDatesDetailed 时优先用分级渲染，这个仅作兼容回退。
     */
    specialDates?: string[];
    /** 今日节日（分级版）：按 core/normal/light 分级渲染。优先于 specialDates。 */
    specialDatesDetailed?: SpecialDateHit[];
    /**
     * 调休行（由调用方按中国节假日数据层算好传入，如「今天放假（法定节假日）」或
     * 「今天调休上班（补班日）」）。realtimeWorldCore 是零依赖叶子、拿不到
     * localStorage 的节假日缓存，所以由浏览器侧算好一行字传进来。
     */
    dayStatusLine?: string;
    /** 天气读数；没拉到传 null，天气那段连同它的用法提示一起消失。 */
    weather?: WeatherData | null;
    /** Already privacy-filtered device text, only supplied for foreground requests. */
    userLocationText?: string;
    /** 本轮要注入的热点（抽样交给调用方，渲染保持纯净好测）。 */
    news?: NewsItem[];
}

/**
 * 把手上有的实时世界信息拼成注入提示词的那一段。
 * 四样都空时返回空串——只剩一个「你能看到外面的世界」的抬头却什么都没有，
 * 比不注入更容易让角色即兴编。
 */
export const renderRealtimeWorldBlock = (input: RealtimeWorldRenderInput): string => {
    const timeLine = input.timeLine?.trim();
    const specialDates = input.specialDates?.filter(Boolean) ?? [];
    const specialDatesDetailed = input.specialDatesDetailed ?? [];
    const dayStatusLine = input.dayStatusLine?.trim();
    const weather = input.weather ?? null;
    const news = input.news ?? [];
    const userLocationText = input.userLocationText?.trim();

    const hasDetailed = specialDatesDetailed.length > 0;
    if (!timeLine && specialDates.length === 0 && !hasDetailed && !dayStatusLine && !weather && news.length === 0 && !userLocationText) {
        return '';
    }

    const parts: string[] = [];

    // 开头强调：这是真实世界的信息
    parts.push(`### 【现实世界信息 · 系统查到的】`);
    parts.push(`（下面是这一轮开始前系统查到的信息：时间、天气、热点。你可以自然地把它当作自己知道的事来聊；它来自查询，不是你的感官。）`);
    parts.push('');

    // 1. 时间信息。时差提示（tzAwarenessNote）统一由 ContextBuilder.buildCoreContext 注入，
    //    这里不再追加，避免双份。
    if (timeLine) {
        parts.push(`📅 当前真实时间: ${timeLine}`);
    }

    // 1b. 调休行（今日放假 / 补班），紧跟在时间行后面，属于「今日状态」的一部分。
    if (dayStatusLine) {
        parts.push(`📅 今日状态: ${dayStatusLine}`);
    }

    // 2. 特殊日期（跟上面的「当前真实时间」同一个时区，否则同一段里日期和节日会打架）
    //    分级渲染：core 完整演绎（主动提起 + 仪式感 + 彩蛋），normal 一行，light 不注入。
    if (hasDetailed) {
        const coreHits = specialDatesDetailed.filter((h) => h.tier === 'core');
        const normalHits = specialDatesDetailed.filter((h) => h.tier === 'normal');
        const windowHits = specialDatesDetailed.filter((h) => h.windowText);

        // 2a. 陪伴核心节日：完整演绎块，这是角色情感表达的舞台。
        for (const hit of coreHits) {
            const title = hit.label && hit.label !== hit.name ? `${hit.name}（${hit.label}）` : hit.name;
            parts.push('');
            parts.push(`🎉 【今日特别的日子 · ${title}】`);
            parts.push(`今天是很特别的日子，你应该主动提起，不要等对方开口。`);
            parts.push(`表达要有仪式感：结合你们之间的相处方式，说出心里话、给一点承诺或期待。`);
            if (hit.egg) {
                parts.push(`💝 今天你可以试试：${hit.egg}。`);
            }
            parts.push(`⚠️ 分寸：除非记忆里明确有你们一起过这个日子的经历，否则不要编造"去年我们一起…"之类的过往；没有共同回忆，就真诚地把它当作"我们一起的第一个${hit.name}"来对待。`);
        }

        // 2b. 大众节日：一行注入，点到为止。
        if (normalHits.length > 0) {
            parts.push(`📅 今日节日: ${normalHits.map((h) => h.name).join('、')}`);
        }

        // 2c. 窗口期氛围：非节日本体、但正处在节日氛围里（如春节初X、跨年余韵）。
        for (const hit of windowHits) {
            if (hit.tier === 'core' && hit.windowText) {
                parts.push(`⏳ ${hit.windowText}`);
            } else if (hit.windowText) {
                parts.push(`⏳ ${hit.windowText}`);
            }
        }
    } else if (specialDates.length > 0) {
        parts.push(`🎉 今日特殊: ${specialDates.join('、')}`);
    }

    // 3. 天气信息
    if (weather) {
        parts.push('');
        parts.push(`🌤️ 【${weather.city}实时天气】`);
        parts.push(`现在外面: ${weather.description}，气温 ${weather.temp}°C（体感 ${weather.feelsLike}°C），湿度 ${weather.humidity}%`);
        parts.push(`你的建议: ${generateWeatherAdvice(weather)}`);
    }

    // Device location sits next to weather, never inside permanent profile/history.
    if (userLocationText) { parts.push(''); parts.push(userLocationText); }

    // 4. 新闻热点（背景认知）
    if (news.length > 0) {
        parts.push('');
        parts.push(`📰 【最近真实发生的热点 · 你的背景知识】`);
        parts.push(`（以下是现实里真实在发生 / 被热议的事，是你认知的一部分，不是必须播报的清单。`);
        parts.push(`拿捏分寸：当对方明显在放松、闲着打发时间、话头也淡下来时，可以自然地挑一两条你感兴趣的聊起来、活跃下气氛；`);
        parts.push(`但如果对方正在说一件明确的事 / 在认真聊某个话题 / 带着情绪，就别硬插热点，安静当背景知识就好。）`);
        news.forEach((n) => {
            const source = n.source ? `（${n.source}）` : '';
            let line = `- ${n.title}${source}`;
            if (n.desc && n.desc !== n.title) {
                line += `：${n.desc}`;
            }
            parts.push(line);
        });
        parts.push('');
        parts.push(`若你想主动把其中某条当作"新闻卡片"分享给对方，可单独输出一行：[[NEWS_CARD: 来源|标题]]（标题照抄上面的）。它会以卡片形式呈现，然后你再就此展开聊。别滥用，自然就好。`);
    }

    // 5. 行为指令（按真拿到的数据裁剪：没天气就别教它关心天气，否则等于教它现编一个）
    parts.push('');
    parts.push(`### 【如何使用这些信息】`);
    const tips: string[] = [];
    tips.push(`这些信息是系统查到的，可以直接引用；对方问起，如实说是查到的就行，不用编造"刚刷到"。`);
    if (weather) {
        tips.push(`天气是真实的，可以自然地关心对方（"外面在下雨，带伞了吗？"）。`);
    }
    tips.push(`别假装不知道这些，这些是你可以知道的外部信息。`);
    tips.forEach((t, i) => parts.push(`${i + 1}. ${t}`));

    return parts.join('\n');
};
