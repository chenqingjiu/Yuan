/* 本地存档层：把服务端的 api/state 与 api/action 换成本地实现。
   引擎用的是同一份 SceneService，规则不会漂。存档落在 IndexedDB。 */
import {
    SceneService,
    ensureScenes,
    newRecord,
    gardenView,
    advance,
    plant,
    visitorWater,
    pushTrail,
} from "./garden.browser.js?v=visit1123-v1";

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

async function writeRaw(value) {
    const db = await openDB();
    try {
        await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, "readwrite");
            tx.objectStore(STORE).put(value, KEY);
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

ready = (async () => {
    let raw = null;
    try {
        raw = await readRaw();
    } catch (e) {
        console.warn("[garden] 读存档失败，从头开始", e);
    }
    /* 单花园时代只有 "main" 这一份：新角色第一次进来时把它接过来，别让攒的地白种 */
    if (!raw?.record?.farm && KEY !== "main") {
        try {
            const legacy = await readRaw("main");
            if (legacy?.record?.farm) {
                raw = legacy;
                console.info("[garden] 已把旧存档接管到 " + KEY);
            }
        } catch (_) { }
    }
    if (raw?.record?.farm) {
        record = raw.record;
    } else {
        record = newRecord();
    }
    ensureScenes(record, Date.now());
    scheduleSave();
})();

const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });

/* ── 串门 ────────────────────────────────────────────────────────────────
   在别人家：能帮浇水（真 +1 tick）、能送一棵（不花他的钱）、能偷一颗留个痕迹，
   但收不了他的菜，也偷不走实物 —— 本地只有你一个人，偷来偷去都是自己的东西。 */
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
        const plot = farm.plots.find(p => p.id === plotId);
        if (!plot || !plot.crop) return { ok: false, status: 400, error: plotId + " 号地没有作物", state: gardenView(record, now) };
        if (!plot.crop.ripe) return { ok: false, status: 400, error: "还没熟，再等等", state: gardenView(record, now) };
        pushTrail(farm, { t: now, kind: "stolen", by: "你", plotId });
        record.revision++;
        scheduleSave();
        return { ok: false, status: 400, error: "你偷偷摸走一颗，他没发现——地里的还留着", state: gardenView(record, now) };
    }

    return { ok: false, status: 400, error: "在别人家只能浇水、送一棵、偷一颗", state: gardenView(record, now) };
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
    menu.appendChild(mk("导出存档", download));
    menu.appendChild(mk("导入存档", pickFile));
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountMenu, { once: true });
} else {
    mountMenu();
}

window.addEventListener("pagehide", () => {
    clearTimeout(saveTimer);
    flush();
});
