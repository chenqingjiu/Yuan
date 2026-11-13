/** 微信桥 · 顶层轮询器：App 存活期间把云端的微信增量补收进角色主时间线。
 *
 * 与现实桥 global-poller.tsx 同一套模式：
 *   · 配置了 workerUrl 且开了自动补收才轮询；没配则完全不做事、零开销；
 *   · 「App 被杀也能收」由云端保证（回复已在云端生成并发回微信），这里只负责
 *     把一来一回**合并进 SullyOS 的聊天记录**（打开 App 就能看到）。
 *
 * 合并是幂等的（chat-glue 按 msg_id 去重），轮询重叠、重复拉都不会写出重复气泡。
 */

import { useCallback, useEffect, useRef } from 'react';
import { useOS } from '../../context/OSContext';
import { loadWechatSettings } from '../../utils/wechatBridge/settings';
import { drainWechatOutbox, checkBot, wechatStatus } from '../../utils/wechatBridge/sync';
import { announceWechatRefresh } from '../../utils/wechatBridge/chat-glue';
import { autoRefreshContexts } from '../../utils/wechatBridge/auto-sync';

// ── 轮询兜底（cron 保险丝）──
// 收消息的心跳本该由 Worker 的 cron 驱动，但实测 cron 曾静默停摆（lastPollAt 一天不动、
// 无任何报错）。App 活着时由前端每分钟问一次云端状态做兜底。
//
// **cron 正常时一个 getupdates 都不发**（曾经是"两边并发也无害"——错的）：
// 官方协议文档明确警告不要自行并发调用 getupdates（重复消费同一个游标流 / 丢消息），
// 2026-09-13 那次「卡片误报登录失效」就是并发把服务端喂出了一个 -14。
// msg_id 幂等只挡住了重复回复，挡不住这种会话级副作用。
const checkBusy = { current: false };
let lastCheckAt = 0;

/** 云端心跳新鲜度阈值：cron 每分钟一次，两轮没动静才算它真的死了。 */
const CLOUD_FRESH_MS = 150_000;

const maybeCheck = async (): Promise<void> => {
    const now = Date.now();
    if (checkBusy.current || now - lastCheckAt < 60_000) return;
    if (!loadWechatSettings().workerUrl) return;
    checkBusy.current = true;
    lastCheckAt = now;
    try {
        // 先问一句"云端还活着吗"：活着就走人，绝不和 cron 抢同一个会话。
        const status = await wechatStatus();
        if (status.ok && status.info) {
            const times = [
                status.info.heartbeat?.at ?? 0,
                ...(status.info.bots ?? []).map(b => b.lastPollAt ?? 0),
            ];
            if (now - Math.max(0, ...times) < CLOUD_FRESH_MS) return;
            console.warn('[wechat-bridge] 云端心跳已过期（cron 可能停摆），前端兜底接管');
        }
        await checkBot();
    } catch { /* 静默：cron 才是主心跳，这里只是保险 */ }
    finally { checkBusy.current = false; }
};

export function WechatBridgePoller(): null {
    const { characters, addToast } = useOS();
    const pollTimer = useRef<number | null>(null);
    const busy = useRef(false);
    const charNames = useRef<Record<string, string>>({});

    useEffect(() => {
        charNames.current = Object.fromEntries(characters.map(c => [c.id, c.name]));
    }, [characters]);

    const drain = useCallback(async (reason: string) => {
        if (busy.current) return;
        const settings = loadWechatSettings();
        if (!settings.workerUrl || !settings.autoSync) return;
        busy.current = true;
        try {
            const result = await drainWechatOutbox();
            if (result.merged > 0) {
                for (const charId of result.charIds) {
                    announceWechatRefresh(charId, charNames.current[charId]);
                }
                console.log(`[wechat-bridge] ${reason}：合并了 ${result.merged} 条微信消息`);
            }
        } catch (err) {
            console.warn('[wechat-bridge] 补收失败（下次再试）', err);
        } finally {
            busy.current = false;
        }
        // 上下文自动同步：App 里聊过（本地比云端新）或云端还没有上下文时自动重传。
        // 内部有 5 分钟节流与互斥，这里尽管放心叫。
        void autoRefreshContexts();
        // 收消息心跳兜底：cron 停摆时靠它保证 App 开着就能收发。
        void maybeCheck();
    }, []);

    useEffect(() => {
        let cancelled = false;

        const setup = () => {
            const settings = loadWechatSettings();
            if (!settings.workerUrl || !settings.autoSync) return;
            if (pollTimer.current !== null) return;
            const intervalMs = Math.max(10, settings.pollSeconds) * 1000;
            pollTimer.current = window.setInterval(() => { void drain('轮询'); }, intervalMs);
            // 挂上就先补一次：App 刚打开 / 刚配好，把欠的都收进来。
            void drain('启动');
        };

        const teardown = () => {
            if (pollTimer.current !== null) {
                window.clearInterval(pollTimer.current);
                pollTimer.current = null;
            }
        };

        const onVisible = () => {
            // 设置可能在别的页面被改（workerUrl / autoSync），每次回到前台都重新对一遍。
            teardown();
            setup();
            void drain('回到前台');
        };

        setup();
        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener('wechat-bridge-settings-changed', onVisible);
        void onVisible;

        return () => {
            cancelled = true;
            void cancelled;
            teardown();
            document.removeEventListener('visibilitychange', onVisible);
            window.removeEventListener('wechat-bridge-settings-changed', onVisible);
        };
    }, [drain]);

    // addToast 目前没用到（消息合并走 chatGenEvents 的未读/toast 通道）。
    void addToast;
    return null;
}
