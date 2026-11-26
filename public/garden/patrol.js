/*
 * 花园巡检（只照看王愿自己的院子）。
 *
 * 每 8 小时把院子转一圈：该浇的浇，熟了的收。
 * 没有串门 —— 不去别人家、不帮忙浇水、也不偷菜。
 *
 * 时间不靠后台计时器：浏览器关着就不会有人浇水。下次打开花园时按 8 小时一格补算一轮，
 * 和种子生长用的是同一套惰性结算，错过的时间不会白丢，也不会连刷好几遍。
 *
 * 做完的事写进 record.patrol.log，留言板读的就是它；
 * 宿主那边拿到报告后会补一句角色语气的留言，并同步到私聊。
 */
import {
    advance,
    gardenView,
    harvest,
    water,
    plant,
} from "./garden.browser.js?v=patrol1126-v1";

const PATROL_MS = 8 * 60 * 60 * 1000;
const NOTE_TIMEOUT = 9000;
const LOG_MAX = 40;

let info = { charId: "", charName: "" };
let running = false;
let started = false;

const store = () => window.__rhGardenStore;

function patrolState(record) {
    if (!record || typeof record !== "object") return null;
    if (!record.patrol || typeof record.patrol !== "object") record.patrol = {};
    const p = record.patrol;
    /* 没这个字段（新存档 / 老存档第一次进新版）：从现在开始算，别一开门就先把园子巡了 */
    if (!Number.isFinite(p.lastAt)) p.lastAt = Date.now();
    delete p.lastStealAt;
    if (!Array.isArray(p.log)) p.log = [];
    return p;
}

function readInfo() {
    const seed = window.__rhCharInfo;
    if (seed && typeof seed === "object") {
        info = {
            charId: String(seed.charId || "") || info.charId,
            charName: String(seed.charName || "") || info.charName,
        };
    }
    return info;
}

/** 把动作说成人话，喂给 AI 和兜底文案共用。 */
function describeOwn(steps) {
    const plants = steps.filter((s) => s.kind === "plant").map((s) => s.plot);
    const waterIds = steps.filter((s) => s.kind === "water").map((s) => s.plot);
    const harvests = steps.filter((s) => s.kind === "harvest");
    const parts = [];
    if (plants.length) parts.push("在 " + plants.join("、") + " 号地种下了种子");
    if (waterIds.length) parts.push("给 " + waterIds.join("、") + " 号地浇了水");
    if (harvests.length) parts.push("收了 " + harvests.map((s) => s.plot + " 号地的" + (s.crop || "菜")).join("、"));
    return parts.join("，");
}

function buildSummary(steps) {
    const own = describeOwn(steps);
    return own ? own + "。" : "今天园子里没什么要忙的，转了一圈就回来了。";
}

/** 让宿主补一句角色语气的留言；没有宿主就直接用兜底文案。 */
function askHost(report) {
    if (window.parent === window) return Promise.resolve("");
    return new Promise((resolve) => {
        let done = false;
        const finish = (text) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            window.removeEventListener("message", onMessage);
            resolve(text);
        };
        const onMessage = (event) => {
            if (event.source !== window.parent) return;
            const data = event.data;
            if (!data || data.source !== "rainholm-host" || data.type !== "patrol-note" || data.id !== report.id) return;
            finish(String(data.text || "").trim());
        };
        const timer = setTimeout(() => finish(""), NOTE_TIMEOUT);
        window.addEventListener("message", onMessage);
        window.parent.postMessage({ source: "rainholm-garden", type: "patrol", id: report.id, report }, "*");
    });
}

/** 自己的院子：空地顺手种几颗，没熟的浇一次，熟了就收。 */
function patrolOwn(record, name, now, steps) {
    advance(record.farm, now);
    const view = gardenView(record, now);
    const plots = view.plots || [];

    /* 一轮最多种 3 块，且手里留出两颗普通种子的钱（16 金币），别把周转钱花光 */
    const SEED_PRICE = 8;
    let plantQuota = 3;
    for (const plot of record.farm.plots) {
        if (plantQuota > 0 && !plot.crop && record.farm.coins >= SEED_PRICE * 2 + 1) {
            const result = plant(record.farm, plot.id, "common", void 0, now);
            if (result.ok) {
                steps.push({ kind: "plant", plot: plot.id, crop: "普通种子" });
                plantQuota -= 1;
            }
        }
    }

    for (const plot of record.farm.plots) {
        if (!plot.crop) continue;
        if (plot.crop.ripe) {
            const result = harvest(record.farm, plot.id, now);
            if (result.ok) steps.push({ kind: "harvest", plot: plot.id, crop: result.crop?.name || "" });
            continue;
        }
        /* 8 小时才补算一轮，作物早过浇水窗口了；只要还能浇（没浇满）就补一次，
           不只看 needsWater，否则巡检永远只收不浇。刚种下的这轮也一起浇。 */
        const seen = plots.find((item) => item.id === plot.id);
        const canWater = seen?.canWater ?? (!plot.crop.ripe && (plot.crop.waterCount || 0) < 6);
        if (!canWater) continue;
        water(record.farm, plot.id, name, true);
        steps.push({ kind: "water", plot: plot.id });
    }
    record.wallet = record.farm.coins;
    return steps;
}

export async function runPatrol() {
    const s = store();
    if (!s || s.isVisit()) return null;
    const record = s.record();
    if (!record?.farm) return null;

    readInfo();
    const patrol = patrolState(record);
    if (!patrol) return null;

    const now = Date.now();
    const name = info.charName || "我";
    const steps = [];

    patrolOwn(record, name, now, steps);

    patrol.lastAt = now;
    record.revision = (record.revision || 0) + 1;

    const summary = buildSummary(steps);
    const entry = {
        t: now,
        from: name,
        text: summary,
        steps,
        read: false,
        ai: false,
    };
    patrol.log.unshift(entry);
    if (patrol.log.length > LOG_MAX) patrol.log.length = LOG_MAX;
    s.save();

    window.RainholmGarden?.refresh?.();

    const report = {
        id: "patrol_" + now,
        charId: info.charId,
        name,
        summary,
        steps,
        other: null,
    };
    const note = await askHost(report);
    if (note) {
        entry.text = note;
        entry.ai = true;
        s.save();
    }
    window.dispatchEvent(new CustomEvent("rainholm:garden-patrol", { detail: report }));
    return report;
}

function isDue() {
    const s = store();
    if (!s || s.isVisit()) return false;
    const record = s.record();
    const patrol = patrolState(record);
    if (!patrol) return false;
    return Date.now() - (patrol.lastAt || 0) >= PATROL_MS;
}

async function maybeRun() {
    if (running || document.hidden) return;
    if (!isDue()) return;
    running = true;
    try {
        await runPatrol();
    } catch (e) {
        console.warn("[garden] 巡检失败", e);
    } finally {
        running = false;
    }
}

export function startPatrol() {
    if (started) return;
    started = true;
    readInfo();

    /* 等界面把第一帧铺好再动，别和进门的刷新抢 revision */
    setTimeout(maybeRun, 2600);
    setInterval(maybeRun, 5 * 60 * 1000);
    window.addEventListener("message", (event) => {
        if (event.source !== window.parent) return;
        const data = event.data;
        if (!data || data.source !== "rainholm-host") return;
        if (data.type === "history") readInfo();
    });
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) maybeRun();
    });

    window.__rhGardenBoard = {
        entries: () => patrolState(store()?.record())?.log || [],
        unread: () => (patrolState(store()?.record())?.log || []).filter((item) => !item.read).length,
        markRead: () => {
            const list = patrolState(store()?.record())?.log || [];
            list.forEach((item) => {
                item.read = true;
            });
            store()?.save();
        },
        run: () => runPatrol(),
    };
}
