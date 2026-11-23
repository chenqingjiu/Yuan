/* 本地存档层：把服务端的 api/state 与 api/action 换成本地实现。
   引擎用的是同一份 SceneService，规则不会漂。存档落在 IndexedDB。 */
import {
    SceneService,
    ensureScenes,
    newRecord,
    gardenView,
    advance,
    plant,
    harvest,
    visitorWater,
    pushTrail,
} from "./garden.browser.js?v=visit1123-v2";
import { startPatrol } from "./patrol.js?v=patrol1123-v1";

/* 兜底：局域网 http 访问时 crypto.randomUUID 可能不存在（非安全上下文），
   而 app.js 拿它当幂等号，缺了会直接种不了地。 */
(function ensureRandomUUID() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") return;
    const uuid = () => {
        const b = new Uint8Array(16);
        if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(b);
        else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
        b[6] = (b[6] & 0x0f) | 0x40;
        b[8] = (b[8] & 0x3f) | 0x80;
        const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
        return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
    };
    try {
        globalThis.crypto.randomUUID = uuid;
    } catch (_) {
        try {
            Object.defineProperty(globalThis.crypto, "randomUUID", { value: uuid, configurable: true });
        } catch (__) {}
    }
})();

const DB_NAME = "rainholm-garden-local";
const DB_VER = 2;
const STORE = "save";
const SAVE_VER = 2;

/* visit1123：一个角色一块地。
   ?owner=<角色id> 决定开谁的院子；?visit=1 表示这是去别人家做客。
   没有参数时退回老键 "main"，老存档照常能读。 */
const QUERY = new URLSearchParams(location.search);
const RAW_OWNER = QUERY.get("owner") || "";
const OWNER = /^[A-Za-z0-9_-]{1,64}$/.test(RAW_OWNER) ? RAW_OWNER : "main";
const VISIT = QUERY.get("visit") === "1";
const KEY = OWNER;
/** 旧 "main" 存档只搬一次家，搬过就在本地记一笔，别让后来的角色再抢一遍 */
const ADOPT_FLAG = "rainholm-garden:adopted";

/* 做客时也能帮忙收熟了的（收成归主人，见 visitAction）。
   以前这里把「收」按钮整块藏了，现在保留 —— 只把文案换成「帮 TA 收」更好认。 */
if (VISIT) {
    const visitStyle = document.createElement("style");
    visitStyle.textContent = 'body.rh-visit [data-action="harvest"]::after{content:"（帮她收）";font-size:.72em;opacity:.75}';
    (document.head || document.documentElement).appendChild(visitStyle);
    document.addEventListener("DOMContentLoaded", () => document.body.classList.add("rh-visit"), { once: true });
    if (document.body) document.body.classList.add("rh-visit");
}

function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VER);
        req.onupgradeneeded = () => {
            if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function readRaw(key) {
    const db = await openDB();
    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, "readonly");
            const q = tx.objectStore(STORE).get(key || KEY);
            q.onsuccess = () => resolve(q.result ?? null);
            q.onerror = () => reject(q.error);
        });
    } finally {
        db.close();
    }
}

async function writeRaw(value, key) {
    const db = await openDB();
    try {
        await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, "readwrite");
            tx.objectStore(STORE).put(value, key || KEY);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    } finally {
        db.close();
    }
}

async function dropRaw(key) {
    const db = await openDB();
    try {
        await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, "readwrite");
            tx.objectStore(STORE).delete(key || KEY);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    } finally {
        db.close();
    }
}

let record = null;
let saveTimer = 0;
let ready = null;

function flush() {
    if (!record) return Promise.resolve();
    return writeRaw({ v: SAVE_VER, savedAt: Date.now(), record }).catch((e) => {
        console.warn("[garden] 存档写入失败", e);
    });
}

function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 120);
}

const service = new SceneService({
    transact(_accountId, cb) {
        const out = cb(record);
        scheduleSave();
        return out;
    },
});

/* 给巡检模块的存档把手：同一套 IndexedDB，能顺手读写另一个角色那份。 */
window.__rhGardenStore = {
    key: () => KEY,
    owner: () => OWNER,
    isVisit: () => VISIT,
    record: () => record,
    readOther: (key) => readRaw(key),
    writeOther: (key, value) => writeRaw(value, key),
    save: () => scheduleSave(),
    flush: () => flush(),
};

ready = (async () => {
    let raw = null;
    try {
        raw = await readRaw();
    } catch (e) {
        console.warn("[garden] 读存档失败，从头开始", e);
    }
    /* 单花园时代只有 "main" 这一份：新角色第一次进来时把它接过来，别让攒的地白种。
       visit1123 的教训：这段没有次数限制，第二个角色进来又会把 main 抢一遍，
       于是「谁最后进门，谁就带着上一个人的地」——sully 地里凭空长出东西就是这么来的。
       现在只允许搬一次家，搬完在本地留个记号。 */
    if (!raw?.record?.farm && KEY !== "main") {
        let adopted = "";
        try {
            adopted = localStorage.getItem(ADOPT_FLAG) || "";
        } catch (_) { }
        if (!adopted) {
            try {
                const legacy = await readRaw("main");
                if (legacy?.record?.farm) {
                    raw = legacy;
                    try {
                        localStorage.setItem(ADOPT_FLAG, KEY);
                    } catch (_) { }
                    console.info("[garden] 已把旧存档接管到 " + KEY + "（仅此一次）");
                }
            } catch (_) { }
        }
    }
    if (raw?.record?.farm) {
        record = raw.record;
    } else {
        record = newRecord();
    }
    ensureScenes(record, Date.now());
    scheduleSave();
    /* 串门时不替主人巡检：否则一进她家就把熟的全收走、还以她的名义写留言发私聊，
       玩家想「帮一把」反而没得帮。巡检只在主人自己的院子里跑。 */
    if (!VISIT) startPatrol();
})();

const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });

/* ── 串门 ────────────────────────────────────────────────────────────────
   在别人家：能帮浇水（真 +1 tick）、能送一棵（不花他的钱）、能帮他收熟的。
   收成全部归主人 —— 金币、图鉴、收获记录都写进她的存档，访客自己什么都不拿。
   这样她的花不会因为没人来而烂在地里，也不存在「左手倒右手」。 */
function visitAction(body, key) {
    const now = Date.now();
    if (body.revision !== record.revision) {
        return { ok: false, status: 409, error: "这边刚有变化，已经帮你刷新", state: gardenView(record, now) };
    }
    if (advance(record.farm, now) > 0) record.revision++;
    record.farm.coins = record.wallet;
    const farm = record.farm;
    const plotId = Number(body.plotId);

    if (body.action === "water") {
        const r = visitorWater(farm, "local-visitor", plotId, "你", now);
        if (!r.ok) return { ok: false, status: 400, error: r.error, state: gardenView(record, now) };
        record.revision++;
        scheduleSave();
        return { ok: true, state: gardenView(record, now), note: r.ripened ? "正好催熟了" : "替他浇了水" };
    }

    if (body.action === "plant") {
        const seedType = body.seedType === "fantasy" ? "fantasy" : "common";
        const before = farm.coins;
        const r = plant(farm, plotId, seedType, undefined, now);
        if (!r.ok) return { ok: false, status: 400, error: r.error, state: gardenView(record, now) };
        farm.coins = before;                       /* 送的不收他的种子钱 */
        record.wallet = farm.coins;
        pushTrail(farm, { t: now, kind: "gift", by: "你", plotId });
        record.revision++;
        scheduleSave();
        return { ok: true, state: gardenView(record, now), note: "给他种下一棵" };
    }

    if (body.action === "harvest") {
        const coinsBefore = farm.coins;
        const r = harvest(farm, plotId, now);
        if (!r.ok) return { ok: false, status: 400, error: r.error, state: gardenView(record, now) };
        record.wallet = farm.coins;                /* 进的是主人的钱包 */
        const reveal = {
            id: r.crop.id,
            name: r.crop.name,
            rarity: r.crop.rarity,
            quality: r.quality.name,
            value: farm.coins - coinsBefore - (r.codexReward ?? 0),
            codexReward: r.codexReward,
            isNew: r.isNew,
            at: now,
            bonus: r.bonus ? { name: r.bonus.name, text: r.bonus.text } : null,
        };
        record.history = Array.isArray(record.history) ? record.history : [];
        record.history.unshift(reveal);
        record.history = record.history.slice(0, 100);
        pushTrail(farm, { t: now, kind: "helped", by: "你", plotId });
        record.revision++;
        scheduleSave();
        return { ok: true, state: gardenView(record, now), reveal, note: "替 TA 收了 " + r.crop.name };
    }

    return { ok: false, status: 400, error: "在别人家只能浇水、送一棵、帮忙收熟的", state: gardenView(record, now) };
}

const realFetch = window.fetch.bind(window);

window.fetch = async function (input, init) {
    const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
    let path = "";
    try {
        path = new URL(url, location.href).pathname;
    } catch (_) {
        return realFetch(input, init);
    }

    if (path.endsWith("/api/cat/black/pending")) {
        // 没有 AI 线：让前端认出 404 后自己收掉这只耳朵，猫照旧遛弯
        return json({ ok: false, error: "本地版没有 AI 接口" }, 404);
    }
    if (path.endsWith("/api/cat/black")) {
        return json({ ok: false, error: "本地版没有 AI 接口" }, 404);
    }
    /* 玩家在花园里说的话：转给对话面板 → 宿主那侧生成回复。
       面板自己也会冒泡，这里只负责不报 404。 */
    if (path.endsWith("/api/messages") && (init?.method || "GET").toUpperCase() === "POST") {
        let text = "";
        try {
            text = JSON.parse(init?.body ?? "{}").text || "";
        } catch (_) { }
        if (text && typeof window.__rhSayToChat === "function") window.__rhSayToChat(text);
        return json({ ok: true });
    }

    const isState = path.endsWith("/api/state");
    const isAction = path.endsWith("/api/action");
    if (!isState && !isAction) return realFetch(input, init);

    await ready;

    if (isState) {
        const scene = new URL(url, location.href).searchParams.get("scene") || "garden";
        const result = await service.state("local", scene);
        return json(result, result.status ?? 200);
    }

    let body = {};
    try {
        body = JSON.parse(init?.body ?? "{}");
    } catch (_) {
        return json({ ok: false, error: "请求格式有误" }, 400);
    }
    const headers = new Headers(init?.headers || {});
    const key = headers.get("Idempotency-Key") || "";
    const scene = body.scene || "garden";
    if (VISIT && scene === "garden") {
        const result = await visitAction(body, key);
        return json(result, result.status ?? 200);
    }
    const result = await service.action("local", scene, body, key);
    return json(result, result.status ?? 200);
};

/* ── 存档导出 / 导入 ─────────────────────────────────────────────────────── */
function download() {
    const data = { game: "rainholm-garden", v: SAVE_VER, savedAt: new Date().toISOString(), record };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = URL.createObjectURL(blob);
    a.download = `花园存档-${stamp}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

function pickFile() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        try {
            const parsed = JSON.parse(await file.text());
            const next = parsed?.record?.farm ? parsed.record : parsed?.farm ? parsed : null;
            if (!next) throw new Error("这不是花园存档");
            record = next;
            ensureScenes(record, Date.now());
            await flush();
            location.reload();
        } catch (e) {
            alert("存档读不出来：" + (e?.message || e));
        }
    };
    input.click();
}

function mountMenu() {
    const menu = document.getElementById("menu");
    if (!menu) return;
    const dot = document.createElement("style");
    dot.textContent = [
        "#menu button.rh-board-unread{color:#b45309;font-weight:800}",
        ".gd-tray-item.rh-board-unread{position:relative}",
        ".gd-tray-item.rh-board-unread::after{content:'';position:absolute;top:4px;right:8px;width:10px;height:10px;",
        "border-radius:50%;background:#e2725b;border:2px solid #fff8e4}",
    ].join("");
    (document.head || document.documentElement).appendChild(dot);
    const mk = (text, fn) => {
        const b = document.createElement("button");
        b.textContent = text;
        b.type = "button";
        b.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            fn();
        });
        return b;
    };
    const board = mk("留言板", () => (window.__rhGardenBoardOpen || window.__rhGardenBoard?.open)?.());
    board.dataset.rh = "board";
    menu.appendChild(board);

    /* 原 nav 整个被 ui-refresh 换成了托盘，往里加的按钮用户看不见 ——
       存档相关挪到留言板底部的细链接里，这里只留一个给托盘点的小影子。 */

    /* 原 nav 被 ui-refresh 换成了右侧托盘（#gdTray），它按固定清单建按钮，
       后加的项不会自己长出去 —— 这里给托盘补一颗影子，点它等于点原按钮。 */
    let trayItem = null;
    const attachTray = () => {
        if (trayItem) return;
        const tray = document.getElementById("gdTray");
        if (!tray) return;
        trayItem = document.createElement("button");
        trayItem.type = "button";
        trayItem.className = "gd-tray-item";
        trayItem.dataset.gdTarget = '#menu button[data-rh="board"]';
        trayItem.setAttribute("aria-label", "留言板");
        trayItem.innerHTML =
            '<img src="assets/v2/note.webp" alt="" aria-hidden="true" draggable="false">' +
            '<span class="gd-lab" aria-hidden="true">留言板</span>';
        trayItem.addEventListener("click", () => board.click());
        /* 排在「收获篮」后面：看留言是常事，别藏在最后一项 */
        tray.insertBefore(trayItem, tray.children[2] || null);
        trayItem.style.setProperty("--i", 2);
    };
    attachTray();
    if (!trayItem) setTimeout(attachTray, 900);

    /* 有新留言就在「留言板」上挂个点，别做成必须点开才知道 */
    const syncDot = () => {
        const unread = window.__rhGardenBoard?.unread?.() || 0;
        board.textContent = unread ? "留言板 · " + unread : "留言板";
        board.classList.toggle("rh-board-unread", unread > 0);
        if (trayItem) {
            trayItem.classList.toggle("rh-board-unread", unread > 0);
            const lab = trayItem.querySelector(".gd-lab");
            if (lab) lab.textContent = unread ? "留言板 " + unread : "留言板";
        }
    };
    syncDot();
    setInterval(syncDot, 1500);
}

/* 这个角色的院子整个清掉。旧存档接管过一次留下的「别人的地」也靠它收场。 */
function resetGarden() {
    const who = OWNER === "main" ? "这座花园" : "这个角色的院子";
    if (!confirm("把" + who + "整块清空？地里的作物、金币和图鉴都会没。导过存档的话还能导回来。")) return;
    dropRaw(KEY)
        .then(() => location.reload())
        .catch((e) => alert("清空失败：" + (e?.message || e)));
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountMenu, { once: true });
} else {
    mountMenu();
}

/* 留言板底部那几个细链接用到 */
window.__rhGardenSave = {
    download,
    pickFile,
    reset: resetGarden,
};

window.addEventListener("pagehide", () => {
    clearTimeout(saveTimer);
    flush();
});
