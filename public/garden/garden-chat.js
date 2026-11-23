/*
 * 小花园的对话面板（本地版）。
 *
 * iframe 里只做三件事：把玩家的话发给宿主、把宿主的回复显示出来、替 AI 执行花园动作。
 * 上下文、记忆库、私聊互通全在宿主那侧（apps/GardenApp.tsx + utils/gardenConversation.ts）。
 *
 * 入口是花园原本那颗「说话」按钮（#rhSayBtn），不再额外加按钮。
 *
 * 协议：
 *   花园 → 宿主  {source:'rainholm-garden', type:'ready'|'chat', text?, snapshot?}
 *   宿主 → 花园  {source:'rainholm-host', type:'history'|'reply'|'act'|'error'|'thinking'|'idle'|'stage', ...}
 */
(function () {
    if (window.__rhGardenChatLoaded) return;
    window.__rhGardenChatLoaded = true;

    var SELF = 'rainholm-garden';
    var HOST = 'rainholm-host';
    var hosted = false;
    var readyTries = 0;
    var messages = [];
    var busy = false;
    var charName = '';
    var panelOpen = false;

    function send(payload) {
        try {
            parent.postMessage(Object.assign({ source: SELF }, payload), '*');
        } catch (_) { }
    }

    function esc(text) {
        return String(text == null ? '' : text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /* ── DOM ───────────────────────────────────────────────────────────── */
    var host = document.createElement('div');
    host.id = 'rhChatHost';
    host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:70;';
    document.body.appendChild(host);
    var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;

    var style = document.createElement('style');
    style.textContent = [
        ':host{all:initial}',
        '*{box-sizing:border-box}',
        '#panel{position:fixed;left:0;right:0;bottom:0;margin:0 auto;width:100%;max-width:520px;height:min(62vh,560px);',
        'display:flex;flex-direction:column;background:linear-gradient(#fffdf7,#fbf3e3);border-radius:20px 20px 0 0;',
        'border:2px solid #d9c19a;border-bottom:0;box-shadow:0 -10px 30px rgba(110,75,35,.22);',
        'transform:translateY(calc(100% + 30px));transition:transform .26s cubic-bezier(.22,.9,.3,1);pointer-events:auto;',
        'padding-bottom:env(safe-area-inset-bottom,0px);font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}',
        '#panel.open{transform:translateY(0)}',
        '#head{display:flex;align-items:center;gap:8px;padding:11px 14px 9px;border-bottom:1px dashed #e2d3b8;flex:none}',
        '#head h3{margin:0;font-size:14px;color:#6b4a2a;font-weight:800;flex:1}',
        '#head small{font-size:11px;color:#a88b66;font-weight:500}',
        '#close,#switch{border:0;background:#f1e4cd;color:#8a6540;width:28px;height:28px;border-radius:50%;font-size:15px;cursor:pointer;padding:0}',
        '#switch[hidden]{display:none}',
        '#list{flex:1;overflow-y:auto;padding:12px 14px 6px;display:flex;flex-direction:column;gap:9px;-webkit-overflow-scrolling:touch}',
        '.row{display:flex;flex-direction:column;max-width:86%}',
        '.row.me{align-self:flex-end;align-items:flex-end}',
        '.row.ta{align-self:flex-start;align-items:flex-start}',
        '.who{font-size:10px;color:#a88b66;margin:0 0 3px 4px}',
        '.bubble{padding:8px 11px;border-radius:14px;font-size:13.5px;line-height:1.5;white-space:pre-wrap;word-break:break-word}',
        '.me .bubble{background:#f3dfb8;color:#5d4327;border-bottom-right-radius:5px;border:1px solid #e6cfa3}',
        '.ta .bubble{background:#fff;color:#4e4237;border-bottom-left-radius:5px;border:1px solid #e6ddcd;box-shadow:0 1px 3px rgba(120,90,50,.07)}',
        '.typing{letter-spacing:3px;color:#b39a76}',
        '.sys{align-self:center;font-size:11.5px;color:#a08a6c;background:#f4ead8;border-radius:10px;padding:5px 10px;max-width:90%;text-align:center}',
        '.empty{align-self:center;margin-top:34px;font-size:12px;color:#b09a7c}',
        '#foot{flex:none;display:flex;gap:8px;padding:9px 12px calc(10px + env(safe-area-inset-bottom,0px));border-top:1px dashed #e2d3b8;background:#fffdf7}',
        '#input{flex:1;min-height:38px;max-height:92px;resize:none;border:1.5px solid #dcc9a8;border-radius:12px;background:#fff;',
        'padding:9px 11px;font-size:13.5px;color:#4e4237;font-family:inherit;line-height:1.4;outline:none}',
        '#input:focus{border-color:#c9a36b}',
        '#send{border:0;border-radius:12px;background:#c9a36b;color:#fff;font-size:13px;font-weight:800;padding:0 15px;cursor:pointer}',
        '#send:disabled{opacity:.45;cursor:default}',
        '@media(prefers-reduced-motion:reduce){#panel{transition:none}}'
    ].join('');
    root.appendChild(style);

    var panel = document.createElement('div');
    panel.id = 'panel';
    panel.innerHTML = [
        '<div id="head"><h3 id="title">说说话</h3><small id="hint"></small>',
        '<button id="switch" type="button" aria-label="换一个人" title="换一个人" hidden>⇄</button>',
        '<button id="close" type="button" aria-label="收起">✕</button></div>',
        '<div id="list" role="log" aria-live="polite"></div>',
        '<div id="foot"><textarea id="input" rows="1" maxlength="500" placeholder="说点什么…" aria-label="在花园说句话"></textarea>',
        '<button id="send" type="button">发送</button></div>'
    ].join('');
    root.appendChild(panel);

    var list = root.getElementById('list');
    var input = root.getElementById('input');
    var sendBtn = root.getElementById('send');
    var title = root.getElementById('title');
    var hint = root.getElementById('hint');

    /* 原生的「说话」按钮加一颗未读点 */
    var dotStyle = document.createElement('style');
    dotStyle.textContent = [
        '#rhSayBtn.rh-chat-new::after{content:"";position:absolute;top:-1px;right:-1px;width:11px;height:11px;',
        'border-radius:50%;background:#e2725b;border:2px solid #fffdf7;pointer-events:none}'
    ].join('');
    document.head.appendChild(dotStyle);

    function nativeBtn() {
        return document.getElementById('rhSayBtn');
    }

    function markUnread(on) {
        var btn = nativeBtn();
        if (btn) btn.classList.toggle('rh-chat-new', !!on);
    }

    function render() {
        if (!messages.length) {
            list.innerHTML = '<div class="empty">' + (charName ? esc(charName) + ' 在花园里，说点什么吧' : '说点什么吧') + '</div>';
            return;
        }
        var html = messages.map(function (m) {
            if (m.role === 'system') return '<div class="sys">' + esc(m.text) + '</div>';
            var own = m.role === 'user';
            return '<div class="row ' + (own ? 'me' : 'ta') + '">'
                + (own ? '' : '<span class="who">' + esc(charName || 'TA') + '</span>')
                + '<div class="bubble">' + esc(m.text) + '</div></div>';
        }).join('');
        if (busy) html += '<div class="row ta"><div class="bubble typing">…</div></div>';
        list.innerHTML = html;
        list.scrollTop = list.scrollHeight;
    }

    function pushMessage(role, text, bubble) {
        if (!text) return;
        messages.push({ role: role, text: text, at: Date.now() });
        if (messages.length > 120) messages = messages.slice(-120);
        render();
        if (bubble === 'white' || bubble === 'black') {
            window.__rhCatSpeak && window.__rhCatSpeak(bubble, text, bubble === 'black' ? 9000 : 4000);
        }
        if (bubble === 'black' && !panelOpen) markUnread(true);
    }

    function setOpen(next) {
        panelOpen = next;
        panel.classList.toggle('open', next);
        if (next) {
            markUnread(false);
            render();
            setTimeout(function () { input.focus(); }, 240);
        }
    }

    function setBusy(next) {
        busy = next;
        sendBtn.disabled = next;
        render();
    }

    function submit() {
        var text = input.value.trim();
        if (!text || busy) return;
        input.value = '';
        input.style.height = '';
        pushMessage('user', text, 'white');
        send({ type: 'chat', text: text, snapshot: readSnapshot() });
    }

    sendBtn.addEventListener('click', submit);
    root.getElementById('close').addEventListener('click', function () { setOpen(false); });
    var switchBtn = root.getElementById('switch');
    switchBtn.addEventListener('click', function () {
        setOpen(false);
        send({ type: 'switch' });
    });
    input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
            e.preventDefault();
            submit();
        }
        if (e.key === 'Escape') setOpen(false);
    });
    input.addEventListener('input', function () {
        input.style.height = 'auto';
        input.style.height = Math.min(92, input.scrollHeight) + 'px';
    });

    /* 接管原生「说话」按钮：捕获阶段拦下来，改为开对话面板 */
    document.addEventListener('click', function (e) {
        var target = e.target;
        if (!target || typeof target.closest !== 'function') return;
        if (!target.closest('#rhSayBtn')) return;
        e.preventDefault();
        e.stopPropagation();
        setOpen(!panelOpen);
    }, true);

    /* ── 花园状态快照 ─────────────────────────────────────────────────── */
    function readSnapshot() {
        try {
            var g = window.RainholmGarden;
            var st = g && typeof g.getState === 'function' ? g.getState() : null;
            var coins = st && typeof st.coins === 'number'
                ? st.coins
                : parseInt((document.getElementById('coins') || {}).textContent, 10);
            var plots = st && Array.isArray(st.plots) ? st.plots.map(function (p) {
                return { id: p.id, state: p.state, crop: p.seedType || undefined };
            }) : undefined;
            var scene = (g && typeof g.getScene === 'function' ? g.getScene() : null)
                || document.body.dataset.scene
                || (location.hash.indexOf('greenhouse') >= 0 ? 'greenhouse' : 'garden');
            return {
                scene: scene,
                coins: Number.isFinite(coins) ? coins : undefined,
                plots: plots,
                /* visit1123：在别人家做客，能力边界和在自己家不一样 */
                visit: new URLSearchParams(location.search).get('visit') === '1'
            };
        } catch (_) {
            return undefined;
        }
    }

    /* 地块在屏幕上的落脚点：站到地沿外一点，别踩在苗上 */
    function plotSpot(plot) {
        var hit = document.querySelector('.plot-hit[data-plot="' + plot + '"]');
        if (!hit) return null;
        var r = hit.getBoundingClientRect();
        var world = document.getElementById('world');
        var wb = world ? world.getBoundingClientRect() : null;
        var y = r.bottom + 6;
        if (wb) y = Math.min(y, wb.bottom - 10);
        return { x: r.left + r.width / 2, y: y };
    }

    /* 先走过去，再动手。走不过去（隔着篱笆/没挂接口）也照做，
       别让一件本来能成的事卡在走路上。 */
    function walkTo(plot) {
        var spot = plotSpot(plot);
        var go = window.__rhCatGoTo;
        if (!spot || typeof go !== 'function') return Promise.resolve(false);
        var bail = new Promise(function (resolve) { setTimeout(resolve, 9500); });
        try {
            return Promise.race([go('black', spot.x, spot.y, 9000), bail]);
        } catch (_) {
            return Promise.resolve(false);
        }
    }

    /* ── 替 AI 动手 ───────────────────────────────────────────────────── */
    function doAct(act) {
        var g = window.RainholmGarden;
        var plot = Number(act.plot);
        try {
            if (act.action === 'plant') g.plant(plot, act.seed === 'fantasy' ? 'fantasy' : 'common');
            else if (act.action === 'water') g.water(plot);
            else if (act.action === 'harvest') g.harvest(plot);
        } catch (error) {
            messages.push({
                role: 'system',
                text: '这个动作没做成：' + (error && error.message ? error.message : '花园没响应'),
                at: Date.now()
            });
            render();
        }
    }

    function runAction(act) {
        if (!act || !window.RainholmGarden) return Promise.resolve();
        var plot = Number(act.plot);
        if (!Number.isFinite(plot) || plot < 1) return Promise.resolve();
        return walkTo(plot).then(function () { doAct(act); });
    }

    /* ── 与宿主通信 ───────────────────────────────────────────────────── */
    window.addEventListener('message', function (event) {
        if (event.source !== parent) return;
        var data = event.data;
        if (!data || data.source !== HOST) return;
        hosted = true;

        if (data.type === 'history') {
            charName = (data.character && data.character.name) || '';
            title.textContent = charName ? '和 ' + charName + ' 说说话' : '说说话';
            switchBtn.hidden = !charName;
            hint.textContent = data.configured === false ? '还没配聊天 API' : '';
            messages = (data.messages || []).map(function (m) {
                return { role: m.role === 'character' ? 'character' : 'user', text: m.text, at: m.at };
            });
            render();
            return;
        }
        if (data.type === 'thinking') { setBusy(true); return; }
        if (data.type === 'idle') { setBusy(false); return; }
        if (data.type === 'stage') { hint.textContent = data.stage || ''; return; }
        if (data.type === 'reply') {
            hint.textContent = '';
            pushMessage('character', data.text, 'black');
            return;
        }
        if (data.type === 'act') {
            /* 一笔一笔来：走路和动作都串起来，别让两笔抢同一个 revision */
            (data.actions || []).reduce(function (chain, act) {
                return chain.then(function () { return runAction(act); });
            }, Promise.resolve());
            return;
        }
        if (data.type === 'error') {
            hint.textContent = '';
            messages.push({ role: 'system', text: data.message || '出错了', at: Date.now() });
            render();
            return;
        }
    });

    /* 宿主可能比 iframe 晚挂监听，ready 多敲几次门 */
    function sayReady() {
        if (hosted || readyTries >= 4) return;
        readyTries += 1;
        send({ type: 'ready' });
        setTimeout(sayReady, 800);
    }

    /* 原生白猫输入条（如果还能触发）也接进对话 */
    window.__rhSayToChat = function (text) {
        var value = String(text || '').trim();
        if (!value) return;
        pushMessage('user', value);
        send({ type: 'chat', text: value, snapshot: readSnapshot() });
    };
    window.__rhGardenChatOpen = function () { setOpen(true); };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', sayReady, { once: true });
    } else {
        sayReady();
    }
})();
