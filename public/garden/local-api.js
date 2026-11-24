/* 本地存档层：把服务端的 api/state 与 api/action 换成本地实现。
   引擎用的是同一份 SceneService，规则不会漂。存档落在 IndexedDB。
   花园固定给「王愿」一个人：没有串门、没有访客规则，所有动作都走主人规则。 */
import {
    SceneService,
    ensureScenes,
    newRecord,
} from "./garden.browser.js?v=single1124-v1";
import { startPatrol } from "./patrol.js?v=single1124-v1";

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

/* 一棵花园：只认 URL 里的 owner（宿主固定传「王愿」的 id）。
   没有参数时退回老键 "main"。 */
const QUERY = new URLSearchParams(location.search);
const RAW_OWNER = QUERY.get("owner") || "";
const OWNER = /^[A-Za-z0-9_-]{1,64}$/.test(RAW_OWNER) ? RAW_OWNER : "main";
const KEY = OWNER;
/** 只清一次：之后就算别处又冒出旧 key 也不会反复删（它们本来也进不来） */
const PURGE_FLAG = "rainholm-garden:purged-single:" + KEY;

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

/* 彻底清掉其它角色的花园存档（sully 那块地），只留当前 key。
   用户选的是「彻底清空」：作物、金币、图鉴一起没，git 备份里还有旧版本。 */
async function purgeOtherGardens() {
    let done = "";
    try {
        done = localStorage.getItem(PURGE_FLAG) || "";
    } catch (_) { }
    if (done === "1") return;
    const db = await openDB();
    try {
        const keys = await new Promise((resolve, reject) => {
            const q = db.transaction(STORE, "readonly").objectStore(STORE).getAllKeys();
            q.onsuccess = () => resolve(q.result || []);
            q.onerror = () => reject(q.error);
        });
        const doomed = keys.filter((k) => String(k) !== KEY);
        if (doomed.length) {
            await new Promise((resolve, reject) => {
                const tx = db.transaction(STORE, "readwrite");
                const os = tx.objectStore(STORE);
                doomed.forEach((k) => os.delete(k));
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });
            console.info("[garden] 已清空其它角色的花园存档：" + doomed.map(String).join("、"));
        }
        try {
            localStorage.setItem(PURGE_FLAG, "1");
        } catch (_) { }
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

/* 巡检模块的存档把手：同一套 IndexedDB。 */
window.__rhGardenStore = {
    key: () => KEY,
    owner: () => OWNER,
    isVisit: () => false,
    record: () => record,
    save: () => scheduleSave(),
    flush: () => flush(),
};

ready = (async () => {
    await purgeOtherGardens();
    let raw = null;
    try {
        raw = await readRaw();
    } catch (e) {
        console.warn("[garden] 读存档失败，从头开始", e);
    }
    if (raw?.record?.farm) {
        record = raw.record;
    } else {
        record = newRecord();
    }
    ensureScenes(record, Date.now());
    scheduleSave();
    startPatrol();
})();

const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });

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
    /* 玩家在花园里说的话：转给对话面板 → 宿主那侧生成回复。 */
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
    /* 只有一个主人：种、浇、收全走主人规则，收成进王愿自己的钱包。 */
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

    /* 有新留言就在「留言板」上挂个点 */
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

/* 这个角色的院子整个清掉。 */
function resetGarden() {
    if (!confirm("把王愿的花园整块清空？地里的作物、金币和图鉴都会没。导过存档的话还能导回来。")) return;
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
