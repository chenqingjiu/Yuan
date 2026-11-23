/*
 * sully 花园的「程序代管」。
 *
 * 只在这座院子被以「串门」方式打开时启动（?visit=1）；主人自己进院子
 * （王愿那种）走的是原来的 patrol.js，这个文件一行都不碰它的路径。
 *
 * 为什么要它：串门时 visitAction 把「种」当成访客送的、把「收」留给主人，
 * 巡逻又因为 isVisit() 被跳过 —— 于是 sully 的地既没人按规矩种，也没人收。
 * 这里用固定规则替她把地照看一遍：空地补种、缺水的浇、熟了的收，
 * 金币 / 图鉴 / 收获历史全部写进她自己的存档，跟她亲手做的没区别。
 *
 * 时间同样用惰性结算：进门过一会儿跑一轮，之后每隔一段看一次是否到期，
 * 关着页面期间错过的时间下次打开会补上，不会连刷。
 */
import {
    advance,
    gardenView,
    plant,
    water,
    harvest,
    pushTrail,
} from "./garden.browser.js?v=visit1123-v2";

const TEND_MS = 4 * 60 * 60 * 1000;   // 四小时一轮：普通种子三小时熟，够它长出来再收
const NOTE_TIMEOUT = 9000;
const LOG_MAX = 40;
const AUTOTEND_KEY = "tend";

let started = false;
let running = false;

const store = () => window.__rhGardenStore;

function tendState(record) {
    if (!record || typeof record !== "object") return null;
    if (!record[AUTOTEND_KEY] || typeof record[AUTOTEND_KEY] !== "object") record[AUTOTEND_KEY] = {};
    const t = record[AUTOTEND_KEY];
    if (!Number.isFinite(t.lastAt)) t.lastAt = Date.now();
    if (!Array.isArray(t.log)) t.log = [];
    return t;
}

function describe(steps) {
    const planted = steps.filter((s) => s.kind === "plant").map((s) => s.plot);
    const watered = steps.filter((s) => s.kind === "water").map((s) => s.plot);
    const got = steps.filter((s) => s.kind === "harvest");
    const parts = [];
    if (planted.length) parts.push("在 " + planted.join("、") + " 号地补了种");
    if (watered.length) parts.push("给 " + watered.join("、") + " 号地浇了水");
    if (got.length) parts.push("收了 " + got.map((s) => s.plot + " 号地的" + (s.crop || "菜")).join("、"));
    return parts.join("，");
}

/** 让宿主补一句角色语气的留言；复用 patrol 的协议，宿主已经会处理。 */
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

/** 替她把院子照看一轮：空地补种、缺水浇水、熟了就收。全部进她自己的存档。 */
function tendOwn(record, name, now, steps) {
    advance(record.farm, now);
    const view = gardenView(record, now);
    const plots = view.plots || [];
    for (const plot of record.farm.plots) {
        if (!plot.crop) {
            /* 空地补一颗普通种子；钱不够就留着下回，别把金库掏空 */
            const price = view.rules?.seedPrice?.common ?? 8;
            if (record.farm.coins < price) continue;
            const r = plant(record.farm, plot.id, "common", undefined, now);
            if (r.ok) {
                pushTrail(record.farm, { t: now, kind: "tended-plant", by: name, plotId: plot.id });
                steps.push({ kind: "plant", plot: plot.id });
            }
            continue;
        }
        if (plot.crop.ripe) {
            const coinsBefore = record.farm.coins;
            const r = harvest(record.farm, plot.id, now);
            if (!r.ok) continue;
            record.wallet = record.farm.coins;
            const reveal = {
                id: r.crop.id,
                name: r.crop.name,
                rarity: r.crop.rarity,
                quality: r.quality.name,
                value: record.farm.coins - coinsBefore - (r.codexReward ?? 0),
                codexReward: r.codexReward,
                isNew: r.isNew,
                at: now,
                bonus: r.bonus ? { name: r.bonus.name, text: r.bonus.text } : null,
            };
            record.history = Array.isArray(record.history) ? record.history : [];
            record.history.unshift(reveal);
            record.history = record.history.slice(0, 100);
            pushTrail(record.farm, { t: now, kind: "tended-harvest", by: name, plotId: plot.id });
            steps.push({ kind: "harvest", plot: plot.id, crop: r.crop.name });
            continue;
        }
        const seen = plots.find((item) => item.id === plot.id);
        if (seen?.needsWater) {
            water(record.farm, plot.id, name, true);
            pushTrail(record.farm, { t: now, kind: "tended-water", by: name, plotId: plot.id });
            steps.push({ kind: "water", plot: plot.id });
        }
    }
    record.wallet = record.farm.coins;
    return steps;
}

export async function runTend() {
    const s = store();
    if (!s || !s.isVisit()) return null;
    const record = s.record();
    if (!record?.farm) return null;
    const t = tendState(record);
    if (!t) return null;

    const now = Date.now();
    const name = window.__rhCharInfo?.charName || "她";
    const steps = [];

    tendOwn(record, name, now, steps);
    t.lastAt = now;
    record.revision = (record.revision || 0) + 1;

    const summary = steps.length
        ? describe(steps) + "。"
        : "院子里的活都做完了，转一圈没什么要忙的。";
    const entry = {
        t: now,
        from: name,
        text: summary,
        steps,
        read: false,
        ai: false,
    };
    t.log.unshift(entry);
    if (t.log.length > LOG_MAX) t.log.length = LOG_MAX;
    s.save();

    window.RainholmGarden?.refresh?.();

    const report = {
        id: "tend_" + now,
        charId: window.__rhCharInfo?.charId || "",
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
    window.dispatchEvent(new CustomEvent("rainholm:garden-tend", { detail: report }));
    return report;
}

function isDue() {
    const s = store();
    if (!s || !s.isVisit()) return false;
    const record = s.record();
    const t = tendState(record);
    if (!t) return false;
    return Date.now() - (t.lastAt || 0) >= TEND_MS;
}

async function maybeRun() {
    if (running || document.hidden) return;
    if (!isDue()) return;
    running = true;
    try {
        await runTend();
    } catch (e) {
        console.warn("[garden] 代管失败", e);
    } finally {
        running = false;
    }
}

export function startAutoTend() {
    if (started) return;
    started = true;
    setTimeout(maybeRun, 2600);
    setInterval(maybeRun, 5 * 60 * 1000);
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) maybeRun();
    });

    /* 串门时也让留言板能用，读的是这座院子自己的代管记录 */
    window.__rhGardenBoard = {
        entries: () => tendState(store()?.record())?.log || [],
        unread: () => (tendState(store()?.record())?.log || []).filter((item) => !item.read).length,
        markRead: () => {
            const list = tendState(store()?.record())?.log || [];
            list.forEach((item) => { item.read = true; });
            store()?.save();
        },
        run: () => runTend(),
    };
    window.__rhGardenBoardLabel = "现在照看一次";
}
