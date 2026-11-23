/*
 * 花园巡检。
 *
 * 每 8 小时，选中的角色自己把院子转一圈：该浇的浇，熟了的收；
 * 顺路去另一个角色的院子看看，帮他浇一块地，偶尔顺走一颗（只留个说法，不动他的收成）。
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
    visitorWater,
    pushTrail,
} from "./garden.browser.js?v=visit1123-v1";

const PATROL_MS = 8 * 60 * 60 * 1000;
const STEAL_GAP = 20 * 60 * 60 * 1000;
const NOTE_TIMEOUT = 9000;
const LOG_MAX = 40;

let info = { charId: "", charName: "", others: [] };
let running = false;
let started = false;

const store = () => window.__rhGardenStore;

function patrolState(record) {
    if (!record || typeof record !== "object") return null;
    if (!record.patrol || typeof record.patrol !== "object") record.patrol = {};
    const p = record.patrol;
    /* 没这个字段（新存档 / 老存档第一次进新版）：从现在开始算，别一开门就先把园子巡了 */
    if (!Number.isFinite(p.lastAt)) p.lastAt = Date.now();
    if (!Number.isFinite(p.lastStealAt)) p.lastStealAt = 0;
    if (!Array.isArray(p.log)) p.log = [];
    return p;
}

function readInfo() {
    const seed = window.__rhCharInfo;
    if (seed && typeof seed === "object") {
        info = {
            charId: String(seed.charId || "") || info.charId,
            charName: String(seed.charName || "") || info.charName,
            others: Array.isArray(seed.others) ? seed.others : info.others,
        };
    }
    return info;
}

/** 报告里的动作说成人话，喂给 AI 和兜底文案共用。 */
function describeOwn(steps) {
    const waterIds = steps.filter((s) => s.kind === "water").map((s) => s.plot);
    const harvests = steps.filter((s) => s.kind === "harvest");
    const parts = [];
    if (harvests.length) parts.push("收了 " + harvests.map((s) => s.plot + " 号地的" + (s.crop || "菜")).join("、"));
    if (waterIds.length) parts.push("给 " + waterIds.join("、") + " 号地浇了水");
    return parts.join("，");
}

function describeOther(other) {
    if (!other || !other.steps.length) return "";
    const waterIds = other.steps.filter((s) => s.kind === "water").map((s) => s.plot);
    const steals = other.steps.filter((s) => s.kind === "steal").map((s) => s.plot);
    const parts = [];
    if (waterIds.length) parts.push("帮 " + other.name + " 浇了 " + waterIds.join("、") + " 号地");
    if (steals.length) parts.push("从 " + other.name + " 家 " + steals.join("、") + " 号地摸走一颗");
    return parts.join("，");
}

/** 写在主人自己留言板上的说法：「你」的地，不用再重复一遍名字。 */
function describeVisit(other) {
    if (!other || !other.steps.length) return "";
    const waterIds = other.steps.filter((s) => s.kind === "water").map((s) => s.plot);
    const steals = other.steps.filter((s) => s.kind === "steal").map((s) => s.plot);
    const parts = [];
    if (waterIds.length) parts.push("给 " + waterIds.join("、") + " 号地浇了水");
    if (steals.length) parts.push("顺手从 " + steals.join("、") + " 号地摸走一颗");
    return parts.join("，");
}

function buildSummary(steps, other) {
    const own = describeOwn(steps);
    const away = describeOther(other);
    if (!own && !away) return "今天园子里没什么要忙的，转了一圈就回来了。";
    return [own ? "自己的地：" + own : "", away ? "顺路：" + away : ""].filter(Boolean).join("；") + "。";
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

/** 自己的院子：熟了就收，缺水的浇一次。 */
function patrolOwn(record, name, now, steps) {
    advance(record.farm, now);
    const view = gardenView(record, now);
    const plots = view.plots || [];
    for (const plot of record.farm.plots) {
        if (!plot.crop) continue;
        if (plot.crop.ripe) {
            const result = harvest(record.farm, plot.id, now);
            if (result.ok) steps.push({ kind: "harvest", plot: plot.id, crop: result.crop?.name || "" });
            continue;
        }
        const seen = plots.find((item) => item.id === plot.id);
        if (!seen?.needsWater) continue;
        water(record.farm, plot.id, name, true);
        steps.push({ kind: "water", plot: plot.id });
    }
    record.wallet = record.farm.coins;
    return steps;
}

/** 对方的院子：帮着浇一块，偶尔摸走一颗（痕迹留下，作物不动）。 */
async function patrolOther(record, name, now, steps) {
    const pool = (info.others || []).filter((item) => item && item.id);
    /* 不止一个邻居时随便挑一家，别每次都定点去同一个人那儿 */
    const target = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
    if (!target) return null;
    const s = store();
    if (!s) return null;
    let raw = null;
    try {
        raw = await s.readOther(target.id);
    } catch (error) {
        console.warn("[garden] 巡检：读不到对方存档", target.id, error);
        return null;
    }
    if (!raw?.record?.farm) return null;

    const farm = raw.record.farm;
    advance(farm, now);
    const other = { id: target.id, name: target.name || "对方", steps: [] };

    const otherView = gardenView(raw.record, now);
    const cap = otherView.rules?.waterCap ?? 6;
    const thirst = farm.plots.filter((plot) => {
        if (!plot.crop || plot.crop.ripe) return false;
        return (plot.crop.waterCount ?? 0) < Math.min(cap, plot.crop.progress ?? 0);
    });
    if (thirst.length) {
        const pick = thirst[0];
        const result = visitorWater(farm, info.charId || "local", pick.id, name, now);
        if (result.ok) other.steps.push({ kind: "water", plot: pick.id, ripened: !!result.ripened });
    }

    const patrol = patrolState(record);
    const ripePlots = farm.plots.filter((plot) => plot.crop?.ripe);
    if (patrol && ripePlots.length && now - (patrol.lastStealAt || 0) > STEAL_GAP && Math.random() < 0.65) {
        const pick = ripePlots[Math.floor(Math.random() * ripePlots.length)];
        pushTrail(farm, { t: now, kind: "stolen", by: name, plotId: pick.id });
        other.steps.push({ kind: "steal", plot: pick.id, crop: pick.crop?.seedType || "" });
        patrol.lastStealAt = now;
    }

    if (!other.steps.length) return other;

    raw.record.wallet = farm.coins;
    raw.record.revision = (raw.record.revision || 0) + 1;
    const otherPatrol = patrolState(raw.record);
    if (otherPatrol) {
        otherPatrol.log.unshift({
            t: now,
            from: name,
            text: name + "来你的院子转了转：" + describeVisit(other) + "。",
            steps: [],
            visitSteps: other.steps,
            read: false,
            ai: false,
        });
        if (otherPatrol.log.length > LOG_MAX) otherPatrol.log.length = LOG_MAX;
    }
    try {
        await s.writeOther(target.id, raw);
    } catch (e) {
        console.warn("[garden] 巡检：对方存档没写进去", e);
    }
    return other;
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
    const other = await patrolOther(record, name, now, steps).catch((error) => {
        console.warn("[garden] 串门巡检出错", error);
        return null;
    });

    patrol.lastAt = now;
    record.revision = (record.revision || 0) + 1;

    const summary = buildSummary(steps, other);
    const entry = {
        t: now,
        from: name,
        text: summary,
        steps,
        visitName: other?.steps.length ? other.name : "",
        visitSteps: other?.steps || [],
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
        other: other?.steps.length ? { id: other.id, name: other.name, steps: other.steps } : null,
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
