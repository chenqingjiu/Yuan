/** 微信桥 · 类型定义。
 *
 * 绑定模型：**在哪个角色的设定页扫码，微信就归那个角色**（一个微信 = 一个角色）。
 * 换角色一键改绑，不重扫。没有"联系人 ID"这种东西。
 *
 * 存储思路：本地只存「怎么连、开没开」，
 * LLM 凭据与 bot token 都在 Worker 端加密落库，前端永远拿不到。
 */

/** 一条待合并的增量（云端 wx_outbox.payload 的形状 + 拉取时附带的 seq 游标）。 */
export interface WechatOutboxEntry {
  seq?: number;
  msgId: string;
  charId: string;
  role: 'user' | 'assistant';
  /** 展示用正文。真正喂模型的那份在云端 pack 的 chat 里，这里只是人看的。 */
  content: string;
  at: number;
  source: 'wechat';
}

/** 微信桥本地全局设置。 */
export interface WechatBridgeSettings {
  /** 微信桥 Worker 地址（如 https://sullyos-wechat-bridge.xxx.workers.dev）。 */
  workerUrl: string;
  /** Worker 共享密钥（WX_BRIDGE_TOKEN；没配就是空串）。 */
  token: string;
  /**
   * 这台设备的身份（多租户）。
   *
   * 首屏自动生成、存 localStorage，**用户全程无感**：不注册、不需要任何人分发 token。
   * 服务端把它 hash 成 owner，微信绑定与云端上下文都挂在这个身份名下。
   * 换设备/加设备时把它复制过去粘贴一次，两台设备就共用同一份空间（见卡片里的「这台设备的身份」）。
   */
  clientId: string;
  /** 轮询秒数（App 存活期间的增量补收间隔）。 */
  pollSeconds: number;
  /** 自动补收：App 打开/切前台时拉增量并合并进主时间线。 */
  autoSync: boolean;
  /** 已拉取到的 outbox 游标（seq），续着拉不重复。 */
  lastSeq: number;
  /** 上报给 Worker 的 LLM 凭据（Worker 端 AES-GCM 加密落库）。 */
  llm?: { apiUrl: string; apiKey: string; model: string };
}

export const DEFAULT_WECHAT_BRIDGE_SETTINGS: WechatBridgeSettings = {
  workerUrl: '',
  token: '',
  clientId: '',
  pollSeconds: 20,
  autoSync: true,
  lastSeq: 0,
};

/** /wx/status 里的一个已登录 bot 概况（永不包含 token 本体）。 */
export interface WechatBotInfo {
  botId: string;
  /** 这个微信当前扮演的角色（扫码即绑定，可一键改绑）。 */
  charId?: string;
  autoReply?: boolean;
  label?: string;
  baseUrl?: string;
  expired?: boolean;
  lastPollAt?: number;
  lastError?: string;
}

/** /wx/status 的返回形状（自检面板用）。 */
export interface WechatStatusInfo {
  version?: string;
  /** 当前身份折成的空间 id（16 位 hex）。排障时用它确认"这台设备落在哪个空间"。 */
  owner?: string;
  /** 请求没带身份头（老客户端/迁移期），落在默认空间。 */
  anonymous?: boolean;
  /**
   * 名额：已用 / 上限。满了新身份会被服务端拒绝（错误码 `OWNERS_FULL`）。
   * 上限是服务端的环境变量（默认 10），面板改数字即可放宽。
   */
  owners?: { used: number; max: number };
  /**
   * 旧空间提示（多租户升级用）：升级前的数据都在默认空间里，换成本机身份后就看不见了。
   * `hasData=true` 时卡片摆一个「并到这台设备」的按钮（对应服务端 `POST /wx/claim`）。
   */
  legacySpace?: { hasData: boolean; bots: number; packs: number } | null;
  bots?: WechatBotInfo[];
  llmConfigured?: boolean;
  masterKeyConfigured?: boolean;
  packs?: Record<string, { templateVer: number; chatBuiltAt: number; bytes: number; messages: number }>;
  todayMessages?: number;
  outbox?: { pending: number; maxSeq: number };
  /**
   * 云端 cron 心跳（排障 + 前端兜底判据）：`at` = 最近一次定时任务开跑的时刻，
   * `note` = 'start' / 'ok:xxms' / 'err:…'。`at` 不前进 = 定时任务没触发。
   */
  heartbeat?: { at: number; note: string } | null;
  /**
   * 云端数据表体检（与 worker 的 `/wx/status` 一一对应）。
   * 面板路线装完后端、还没建表时 `schemaReady=false` —— 卡片据此摆出「初始化数据表」按钮。
   */
  storage?: WechatBridgeStorageInfo;
}

/** 数据表体检结果（`/wx/status` 与 `POST /wx/init` 共用同一份口径）。 */
export interface WechatBridgeStorageInfo {
  /** 五张表齐了没有。 */
  schemaReady: boolean;
  /** 缺哪几张（齐了就是空数组）。排错时直接显示给用户看，比"连不上"有用得多。 */
  missingTables: string[];
  /**
   * 缺哪些列（多租户升级列，形如 `wx_packs.owner`）。
   * 老库的"表齐但缺列"也计入 schemaReady=false —— 同样点一下「初始化数据表」补齐。
   */
  missingColumns?: string[];
  /** 已经建好的表数量。 */
  tableCount: number;
}

/** /wx/config 的返回。 */
export interface WechatConfigUploadResult {
  ok: boolean;
  error?: string;
  hint?: string;
  llmConfigured?: boolean;
}
