/**
 * 本地状态备份注册表（localStorage）。
 *
 * 背景：系统备份的导出侧（context/OSContext.tsx 的 exportSystem）原本只认一份
 * 「硬编码的 localStorage 白名单」（study_api_config / os_cloud_backup_config /
 * chat_translate_* 等）。自研功能的 localStorage 数据不在名单里，于是备份文件里
 * 根本没有它们，换设备导入后全部消失。
 *
 * 本模块是这类数据的**单一事实来源**：新增功能只要在 LOCAL_STATE_ENTRIES 加一行，
 * 导出与导入两侧都会自动带上，不必再改备份主流程。
 *
 * 刻意**不收录**以下几类（已由既有逻辑覆盖，重复收录会互相覆盖）：
 *   - `sullyos_` 前缀          —— exportSystem 已有前缀扫描（含拾光角色一句话、
 *                                  查手机反查记录/权限/冷却等）
 *   - `check_phone_api`        —— 走 checkPhoneApi 访问器显式备份
 *   - `os_realtime_config`     —— 作为 realtimeConfig 备份（微信读书主配置在里面）
 *   - `os_fanwai_stories_v1`
 *     `os_collected_letters_v1` —— 只是 IndexedDB 丢写时的**本机镜像**，非权威源；
 *                                  随备份迁移反而可能用陈旧镜像覆盖新数据
 *   - `os_weread_profile`      —— 旧键，真值已在 os_realtime_config 内
 *   - `sully_music_api_cache_v1` —— 代码注释明写「不参与 backup/import-export」
 *
 * ⚠️ 两个前缀只差两个字母，务必分清（历史上整批键就是栽在这儿）：
 *   - `sullyos_`（带 os）—— exportSystem 已有前缀扫描，**不要**在本表重复登记；
 *   - `sully_`（不带 os）—— **没有**任何前缀扫描，必须逐条登记，或按其真实前缀
 *     （如 `sully_char_lyric_v1_` / `sully_last_innerstate_`）登记。
 *     通话设置、音乐配置、CSS 预设、Firecrawl/视频解析 Key 都是这样漏掉的。
 *
 * 值的形状：localStorage 里全部是字符串，这里原样搬运（无损往返），
 * 不做解析再序列化 —— 那会让「裸字符串」与「JSON 字符串字面量」无法区分。
 */

/** 一条需要随备份迁移的本地状态登记项。 */
export interface LocalStateEntry {
    /** 精确 key；当 prefix 为 true 时表示前缀。 */
    key: string;
    /** true 表示前缀匹配，会收集所有以它开头的 key。 */
    prefix?: boolean;
    /** 中文标签，用于导入日志与失败告警。 */
    label: string;
    /** true = 用户内容（丢失不可恢复）；false = 配置（丢失需重设）。 */
    content: boolean;
}

/**
 * 需要备份的 localStorage 清单。
 *
 * 各 key 的权威定义位置见每行注释 —— 这里是备份视角的登记，不是定义的搬运；
 * 那些模块内的常量是私有的（未 export），因此本表集中写一次，改动时两处都要看。
 */
export const LOCAL_STATE_ENTRIES: LocalStateEntry[] = [
    // ─────────── 用户内容类（丢失不可恢复，优先保） ───────────
    {
        // 权威定义：utils/novelReader.ts `LS_PREFIX = 'nrcache_'`（已 export）
        // 覆盖 nr_current / nr_progress / nr_theme / nr_skin / nr_fontsize /
        // nr_vocab(生词本) / nr_learn / nr_geom。
        // 书架全文 v75 起改存 IndexedDB 的 novel_reader_books（随备份字段
        // novelReaderBooks 走 store 通道）；旧备份里的 nr_books 仍会被收集，
        // 导入后由 loadBooks 迁移进 IDB。
        key: 'nrcache_',
        prefix: true,
        label: '私聊小说共读（进度/生词本/皮肤等）',
        content: true,
    },
    {
        // 权威定义：utils/wechatBridge/settings.ts:10
        // 内含本机设备身份 clientId —— 丢了要重新粘贴同一枚才能共用同一片云端空间
        key: 'wechat_bridge_settings_v1',
        label: '微信桥设备身份与本地配置',
        content: true,
    },
    {
        // 权威定义：apps/Settings.tsx:501 / 1119
        key: 'os_sub_api_presets',
        label: '副 API 预设列表',
        content: true,
    },
    {
        // 权威定义：utils/games/gameStore.ts:56
        // 总局数/胜局/MVP/最近战绩，属积累型内容
        key: 'gamehub_stats',
        label: '小游戏战绩历史',
        content: true,
    },
    {
        // 权威定义：components/chat/ImageGenPanel.tsx:5 CHAR_SETTINGS_PREFIX
        //           utils/imageGen.ts:140 另有同样的字符串拼接
        // 含角色外观描述 + 锁脸参考照（压缩后的 dataURL）+ 场景描述。
        // 注意 key 拼的是**角色名**而非 charId（既有行为，本次不改）。
        key: 'os_imagegen_char_',
        prefix: true,
        label: '生图·各角色外观描述与锁脸照',
        content: true,
    },
    {
        // 权威定义：utils/imageGen.ts:154 USER_IMAGE_SETTINGS_KEY
        // 「用户自己」那一份与角色侧分开存，两者都要登记，漏一个用户描述照样丢
        key: 'os_imagegen_user_lock',
        label: '生图·用户外观描述与锁脸照',
        content: true,
    },
    {
        // 权威定义：utils/imageGen.ts:191 CUSTOM_STYLE_KEY
        // 提示词是用户自己写的，属内容而非纯配置
        key: 'os_imagegen_custom_styles',
        label: '生图·自定义风格（用户写的提示词）',
        content: true,
    },
    {
        // 权威定义：components/os/TamagotchiHome.tsx:814（`tama_board_img_${charId}`）
        // 注意只匹配带下划线的**每角色**形态；迁移前的旧全局单键 `tama_board_img`
        // 已由 desktopSkinBackup 的显式字段覆盖，前缀不会误抓它。
        // 这正是「迁移后只登记旧键、新键漏登记」的典型，与 fanwai_stories 同一类病。
        key: 'tama_board_img_',
        prefix: true,
        label: '电子宠物·每角色看板横幅图',
        content: true,
    },
    {
        // 权威定义：apps/Appearance.tsx:846,848
        // 进入「动森模式」前备份的用户原壁纸（渐变/URL 形态；data: 形态存
        // IndexedDB 的 wallpaper_user_backup，随 store 通道走）
        key: 'acnh_wallpaper_backup',
        label: '动森模式前的原壁纸备份',
        content: true,
    },
    {
        // 权威定义：apps/CallApp.tsx:716（写）/ :586（读）/ :730（删）
        // 视频通话「假摄像头」的静态机位图（blobref 令牌）
        key: 'sully-call-fake-camera-image-v1',
        label: '视频通话·假摄像头机位图',
        content: true,
    },
    {
        // 权威定义：context/MusicContext.tsx:74 `LS_LOCAL_ALBUM_KEY`
        // 本机导入 / AI 生成的歌曲专辑，内含指向本机音频资源的引用
        key: 'sully_music_local_album_v1',
        label: '音乐·本机导入与生成的歌曲专辑',
        content: true,
    },
    {
        // 权威定义：components/chat/ChromeCssEditor.tsx:10 `PRESET_STORE_KEY`
        // 用户自己写的聊天白框 CSS 预设（可能内嵌图片资源）
        key: 'sully_chrome_css_presets_v1',
        label: '聊天白框·自定义 CSS 预设',
        content: true,
    },
    {
        // 权威定义：components/bank/BankDollhouse.tsx:28 `CUSTOM_FURNITURE_ASSET_KEY`
        // 用户放的银行小屋家具素材。值是 JSON，其中图片可能是 blobref 令牌；
        // 二进制无需在此处理 —— 导出管线的 blobs/* 旁路从「真正落包的 JSON 文本」
        // 里提取令牌（见 utils/backupBlobs.ts:11-14），键落包即自动随行。
        key: 'bank_custom_furniture_assets_v1',
        label: '银行小屋·自定义家具素材',
        content: true,
    },
    {
        // 权威定义：utils/charLyricCache.ts:18（`sully_char_lyric_v1_${songId}`）
        // 按 songId 缓存歌词全文：属可重拉缓存，但重拉要联网且上游接口可能失效，
        // 体积又小，按内容对待一并带走。索引键见下方 sully_char_lyric_meta_v1。
        key: 'sully_char_lyric_v1_',
        prefix: true,
        label: 'Char 背景音·歌词全文缓存',
        content: true,
    },

    // ─────────── 配置类（丢失需重设） ───────────
    {
        // 权威定义：utils/games/gameStore.ts:55
        key: 'gamehub_settings',
        label: '小游戏设置',
        content: false,
    },
    {
        // 权威定义：utils/fanwaiGenerator.ts:801
        key: 'os_fanwai_form_v1',
        label: '番外生成表单记忆（文风/字数/人称）',
        content: false,
    },
    {
        // 权威定义：utils/letter/letterTrigger.ts:18
        key: 'os_last_seen_date',
        label: '来信节奏·最后上线日',
        content: false,
    },
    {
        // 权威定义：utils/letter/letterTrigger.ts:19（`os_letter_written_${charId}`）
        key: 'os_letter_written_',
        prefix: true,
        label: '来信节奏·当天已写信标记',
        content: false,
    },
    {
        // 权威定义：components/chat/ImageGenPanel.tsx:6 STYLE_PRESET_KEY
        key: 'os_imagegen_style_preset',
        label: '生图·当前选中的风格预设',
        content: false,
    },
    {
        // 权威定义：components/os/TamagotchiHome.tsx:831（`tama_board_fg_${charId}`）
        // 同 tama_board_img_：只匹配每角色形态，旧全局键另走 desktopSkinBackup
        key: 'tama_board_fg_',
        prefix: true,
        label: '电子宠物·每角色看板文字色',
        content: false,
    },
    {
        // 权威定义：apps/Settings.tsx:1346（写）/ :89（读）
        // 视觉（识图）可用模型列表缓存，丢了要重新拉取
        key: 'os_vision_available_models',
        label: '视觉识图·可用模型列表缓存',
        content: false,
    },
    {
        // 权威定义：utils/charLyricCache.ts:19 `META_KEY`
        // 与上面的歌词全文成对的 LRU 索引：只带歌词不带索引会对不上账
        key: 'sully_char_lyric_meta_v1',
        label: 'Char 背景音·歌词缓存索引',
        content: false,
    },
    {
        // 权威定义：utils/emotionApply.ts:21 `lastInnerStateKey()`（`sully_last_innerstate_${charId}`）
        // 角色最后一次内心独白，瞬时产物的缓存，供查手机首页等读取
        key: 'sully_last_innerstate_',
        prefix: true,
        label: '角色·最后一次内心独白缓存',
        content: false,
    },

    // ─────────── 通话 App（sully-call-* 用连字符，通用前缀扫描抓不到，逐条登记） ───────────
    {
        // 权威定义：utils/callPreferences.ts:8 `CALL_PREFERENCES_KEY`
        key: 'sully-call-preferences-v1',
        label: '通话·角色主动/语音自动播/静默催促',
        content: false,
    },
    {
        // 权威定义：utils/callPreferences.ts:9 `CALL_UPDATE_ANNOUNCEMENT_KEY`
        key: 'sully-call-update-preferences-2026-08-v2',
        label: '通话·设置更新公告已读标记',
        content: false,
    },
    {
        // 权威定义：apps/CallApp.tsx:527（写）/ :904（读）
        key: 'sully-call-mode-v1',
        label: '通话·默认模式（语音/视频）',
        content: false,
    },
    {
        // 权威定义：apps/CallApp.tsx:536,541
        key: 'sully-call-theme-v1',
        label: '通话·默认主题（亮/暗）',
        content: false,
    },
    {
        // 权威定义：apps/CallApp.tsx:171
        key: 'sully-call-video-layout-v1',
        label: '通话·视频通画面布局',
        content: false,
    },
    {
        // 权威定义：apps/CallApp.tsx:184
        key: 'sully-call-camera-preview-size-v1',
        label: '通话·自拍预览框尺寸',
        content: false,
    },
    {
        // 权威定义：components/call/VRMVideoCallStage.tsx:135,139
        key: 'sully-call-action-chips-v1',
        label: '通话·动作 chip 展开状态',
        content: false,
    },
    {
        // 权威定义：apps/CallApp.tsx:1635
        key: 'sully-call-setup-guide-v2',
        label: '通话·设置向导完成标记',
        content: false,
    },

    // ─────────── 音乐 / 抓取 / 诊断等（sully_ 前缀，与 sullyos_ 只差两个字母，勿混） ───────────
    {
        // 权威定义：context/MusicContext.tsx:72 `LS_CFG_KEY`
        // 音乐工作台地址 / cookie / 音质，独立于「设置 → 网络代理」的中心地址
        key: 'sully_music_cfg_v1',
        label: '音乐·工作台地址与音质配置',
        content: false,
    },
    {
        // 权威定义：context/MusicContext.tsx:73 `LS_STATE_KEY`
        key: 'sully_music_state_v1',
        label: '音乐·播放队列与进度',
        content: false,
    },
    {
        // 权威定义：utils/firecrawl.ts:10（网页抓取的兜底通道）
        key: 'sully_firecrawl_api_key_v1',
        label: '网页抓取·Firecrawl API Key',
        content: false,
    },
    {
        // 权威定义：utils/videoParser.ts:14 `LS_KEY`
        key: 'sully_video_parse_key_v1',
        label: '视频解析·apizero API Key',
        content: false,
    },
    {
        // 权威定义：utils/apiCallLog.ts:165 `API_REQUEST_CAPTURE_ARMED_KEY`
        key: 'sully_api_request_capture_armed_v1',
        label: '诊断·API 请求捕获开关',
        content: false,
    },
    {
        // 权威定义：utils/proxyWorker.ts:26 `SETTINGS_FOCUS_SESSION_KEY`
        // 仅用于「跳到设置页并聚焦代理输入框」的一次性标记
        key: 'sully_settings_focus_proxy_worker_v1',
        label: '设置·代理输入框聚焦标记',
        content: false,
    },
    {
        // 权威定义：components/os/CompanionHome.tsx:437
        key: 'sully-companion-wardrobe-discovery-v1',
        label: '陪伴桌面·衣橱功能发现标记',
        content: false,
    },
    {
        // 权威定义：components/weread/WereadReader.tsx:56
        key: 'os_weread_night',
        label: '微信读书·阅读夜间模式',
        content: false,
    },
    {
        // 权威定义：apps/CheckPhone.tsx:332,334
        key: 'cp_tavern_style',
        label: '查手机·酒馆界面风格',
        content: false,
    },
];

/** localStorage 是否可用（SSR / 隐私模式下可能缺失）。 */
function hasLocalStorage(): boolean {
    try {
        return typeof window !== 'undefined' && !!window.localStorage;
    } catch {
        return false;
    }
}

/** 该 key 是否落在登记表内（精确或前缀）。用于导入时拒绝写无关键。 */
export function isRegisteredLocalStateKey(key: string): boolean {
    return LOCAL_STATE_ENTRIES.some(entry => (
        entry.prefix ? key.startsWith(entry.key) : key === entry.key
    ));
}

/**
 * 收集所有登记键的当前值。无任何数据时返回 undefined，
 * 这样旧版本读到此字段为 undefined 时不会误判为「备份里是空的」而清空本地。
 */
export function collectLocalStateBackup(): Record<string, string> | undefined {
    if (!hasLocalStorage()) return undefined;
    const out: Record<string, string> = {};

    const take = (key: string): void => {
        try {
            const value = window.localStorage.getItem(key);
            if (value !== null) out[key] = value;
        } catch {
            /* 单键读取失败不影响其余键 */
        }
    };

    for (const entry of LOCAL_STATE_ENTRIES) {
        if (!entry.prefix) {
            take(entry.key);
            continue;
        }
        try {
            // 前缀项：遍历现有 key 收集。不边遍历边写，避免顺序依赖。
            const matched: string[] = [];
            for (let i = 0; i < window.localStorage.length; i++) {
                const key = window.localStorage.key(i);
                if (key && key.startsWith(entry.key)) matched.push(key);
            }
            matched.forEach(take);
        } catch {
            /* ignore */
        }
    }

    return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * 用备份内容覆盖本地登记键。未出现在备份中的键保持不动（旧备份 → 不清空本地）。
 *
 * 逐键 try/catch：单键失败只告警，绝不抛出，也不回滚已完成的 IndexedDB 恢复。
 * 出于安全，只接受登记表内的 key —— 备份文件若被塞入无关键会被丢弃。
 */
export function restoreLocalStateBackup(
    data: Record<string, string> | undefined,
): { restored: number; failed: number; skipped: number } {
    const result = { restored: 0, failed: 0, skipped: 0 };
    if (!data || typeof data !== 'object' || !hasLocalStorage()) return result;

    for (const [key, value] of Object.entries(data)) {
        if (typeof key !== 'string' || typeof value !== 'string') {
            result.skipped++;
            continue;
        }
        if (!isRegisteredLocalStateKey(key)) {
            result.skipped++;
            continue;
        }
        try {
            window.localStorage.setItem(key, value);
            result.restored++;
        } catch (error) {
            result.failed++;
            console.warn(`[Backup] 恢复本地状态失败: ${key}`, error);
        }
    }
    return result;
}
