/**
 * 微信桥 · Cloudflare Worker 入口
 *
 * 一句话：**微信是角色的第二扇门，共用同一个大脑（SullyOS 的 fire_pack）。**
 *
 * 收发模型（对接微信官方 iLink Bot API，见 ./ilink.ts）：
 *   · Cron 每分钟触发 → 对每个已登录 bot 发起一次 getupdates 长轮询（服务端最多挂
 *     ~35s）→ 拉到消息 → 命中绑定角色 → 生成回复 → 逐段发回微信。
 *   · 扫码登录由 Worker 中转（POST /wx/bot/qr → GET /wx/bot/qr/status），bot token
 *     加密落库，前端全程接触不到。
 *
 * 端点：
 *   POST /wx/bot/qr          拿登录二维码（img 可直接 <img>）
 *   GET  /wx/bot/qr/status   轮询扫码状态；confirmed 时加密保存 bot 并绑定到 charId
 *   POST /wx/bot/bind        一键改绑（换角色不重扫）/ 改自动回复开关
 *   POST /wx/bot/check       对指定 bot 做一次真实轮询，探测 token 是否过期
 *   POST /wx/bot/remove      移除一个 bot（换号 / 不用了）
 *   POST /wx/init            幂等建表（装好后点一下就行，不用去 D1 控制台粘 SQL）
 *   POST /wx/config          设置页上传加密 LLM 凭据
 *   POST /wx/pack            设置页上传该角色的 fire_pack（模板 + 对话）
 *   GET  /wx/outbox          拉增量（App 打开/切前台时补收，合并进角色主时间线）
 *   POST /wx/outbox/ack      认领并删除已合并的增量
 *   GET  /wx/status          自检：bot 状态、pack 在不在、凭据配没配、数据表齐不齐
 *
 * 两条不可动摇的规矩（改代码前先读）：
 *   1. **不拼自己的提示词。** 请求消息 = `pack.chat.messages` 原样 +
 *      `buildInstantTimelyBlock` 追加的时效块。系统提示词、角色卡、世界书、记忆、
 *      时间感知全在前端烤好的模板里。现实桥 worker 的 `buildLlmMessages` 是简化
 *      prompt（只塞 persona），**这里绝不能抄它**——那是必然 OOC 的路子。
 *   2. **不依赖主动消息 2.0。** 自有 D1、自有凭据、自有会话存储。用户没配过 amsg
 *      也完全能跑，两套并行互不干扰。
 *
 * 与 amsg 的关系：只 import 纯叶子模块（utils/amsgFirePack、amsg 的
 * buildInstantTimelyBlock），不碰它的端点、表、密钥。
 */

import { decryptSecret, encryptSecret, callLlm, type LlmCredentials, type LlmMessage } from './llm';
import { normalizeReplyForWechat } from './reply';
import {
  DEFAULT_ILINK_BASE,
  extractInboundText,
  pollQrLogin,
  pollUpdates,
  sendText,
  startQrLogin,
  type ILinkInboundMessage,
} from './ilink';
import { buildInstantTimelyBlock } from '../../amsg/src/instantChat';
import { SCHEMA_STATEMENTS, SCHEMA_TABLES, SCHEMA_UPGRADE_COLUMNS } from './schema';
import { AMSG_FIRE_PACK_KEY, amsgStateNamespace } from '../../../utils/amsgFirePack';
import type { AmsgFirePack } from '../../../utils/amsgFirePack';

const BRIDGE_VERSION = '0.2.0';

/** 加密凭据用的盐；换盐等于把已存的密文全部作废。 */
const MASTER_SALT = 'wechat-bridge-v1';
const BOT_TOKEN_SALT = 'wechat-bridge-bot-v1';

interface Env {
  DB: D1Database;
  /** 64 位 hex，加密用户上传的 LLM 凭据与 bot token。没配就没法解密 → 全线不可用。 */
  MASTER_KEY?: string;
  /**
   * 可选共享密钥。**配了就退化成老的单人模式**：所有 /wx/* 只认这一枚密钥，
   * 等于把所有人关进同一个空间。多租户请把它留空。
   */
  WX_BRIDGE_TOKEN?: string;
  /**
   * 名额上限（默认 10）。**面板改这个数字即可放宽**，不用改代码、不用重新部署。
   * 只限制"新身份"，已进门的人不受影响；默认空间 'main' 不占名额。
   */
  WX_MAX_OWNERS?: string;
  /**
   * 分片轮询（保底开关，默认 1 = 每分钟轮全部空间）。
   *
   * 什么时候才需要它：万一平台对"同一请求内的并发外连数"限制比预期低，就把轮询摊到
   * 多分钟上——每分钟只轮 1/N 的空间，按分钟轮转。代价是收消息延迟几十秒，
   * 但绝不超时被掐（那会让整轮白跑、还静默无痕）。
   */
  WX_POLL_SHARD?: string;
}

/* 最小 D1 类型声明（与 amsg 同风格，不引 workers-types） */
interface D1Database {
  prepare(query: string): D1PreparedStatement;
}
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  run(): Promise<{ meta?: { changes?: number } }>;
  first<T = unknown>(col?: string): Promise<T | null>;
  all<T = unknown>(): Promise<{ results: T[] }>;
}

/* ─────────── 数据形状 ─────────── */

/**
 * 一个已扫码登录的微信 bot（token 加密存，明文只在生成/轮询的瞬间存在）。
 *
 * 绑定模型（用户定的，别改回去）：**在哪个角色的设定页扫码，微信就归那个角色**。
 * 一个微信账号同时只属于一个角色；换角色走 /wx/bot/bind 一键改绑，不重扫
 * （码只是微信登录态，charId 只是云端的一个绑定字段）。
 */
interface BotRecord {
  botId: string;
  tokenEnc: string;
  tokenIv: string;
  /** 登录确认返回的专属基址；空串 = 用官方默认。 */
  baseUrl: string;
  /** 这个微信扮演的角色。空 = 未绑定（扫码时没带上 charId 的旧部署），消息会被忽略。 */
  charId?: string;
  /**
   * 自动回复。关掉 = 只把消息同步进 SullyOS、不生成回复（留给你自己在 App 里回）。
   * 注意：反过来「在 App 里回、发到微信」受协议限制做不了——iLink 回复必须带
   * 入站消息的 context_token，没有入站就发不出去。
   */
  autoReply?: boolean;
  /** 角色「时间感知」开关。关掉的角色在微信里也一个钟都不给。缺省视为开。 */
  timeAwarenessEnabled?: boolean;
  /** 备注名（登录时没有可靠的名字，一般留空，仅用于多 bot 区分）。 */
  label?: string;
  /** getupdates 的不透明游标：持久化、原样回传，丢了最多重复收最近一批。 */
  cursor: string;
  lastPollAt?: number;
  /** 最近一次**尝试**轮询的时刻（成功失败都记）——失效 bot 的低频探测靠它节流。 */
  lastProbeAt?: number;
  lastError?: string;
  /**
   * 会话过期标记（-14 丢游标重试也没过）。**这不是永久判决**：cron 会低频探测，
   * 恢复了自己清掉（见 pollBotOnce）。曾经是"置位后 cron 永久跳过 + 成功也不清除"，
   * 于是一次瞬时抖动就把这个微信静默锁死（2026-09-13 实际发生，用户白重扫一次）。
   */
  expired?: boolean;
}

interface ConfigRow {
  bots_json: string;
  llm_enc: string | null;
  llm_iv: string | null;
  updated_at: number;
}

interface BridgeConfig {
  bots: BotRecord[];
  llmEnc: string | null;
  llmIv: string | null;
  /**
   * 乐观锁版本 = 数据库那一行的 updated_at。写回时带上它，只有库里还是这个值才允许写；
   * 否则说明期间有人写过（cron 每分钟都落库），调用方必须重读重改。
   */
  rev?: number;
}

interface PackRow {
  pack_json: string;
  template_ver: number;
  chat_built_at: number;
}

/** 一条待 App 补收的增量（wx_outbox.payload 的形状）。 */
interface OutboxEntry {
  msgId: string;
  charId: string;
  role: 'user' | 'assistant';
  /** 展示用正文；真正喂模型的那份在 pack 的 chat 里。 */
  content: string;
  at: number;
  source: 'wechat';
}

/* ─────────── 基础 helpers ─────────── */

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Token',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    },
  });
}

function corsPreflight(): Response {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Token',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Max-Age': '86400',
    },
  });
}

/* ─────────── 多租户身份 ─────────── */

/**
 * 身份头：前端首屏自动生成一枚随机「设备身份」（128 位），存 localStorage，请求原样带上。
 * **用户完全无感**——不注册、不需要任何人分发 token；换设备时把那串身份粘过去即可
 * （卡片里有「这台设备的身份」显示 / 复制 / 粘贴）。
 */
const OWNER_HEADER = 'X-Client-Token';
/** 老客户端（不带身份头）与迁移期数据的归属空间，也是"主人自己的历史数据"所在。 */
const DEFAULT_OWNER = 'main';
/** 名额上限默认值（可用 WX_MAX_OWNERS 覆盖）。 */
const DEFAULT_MAX_OWNERS = 10;

/** sha256 → hex。把身份折成 owner，库里不存明文身份。 */
async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * 请求 → owner（sha256 前 16 位 hex：64 bit，够抗撞、又好认）。
 *
 * 身份来源两处，优先级：`X-Client-Token`（新前端自动带）→ `Authorization: Bearer`
 * （老部署的共享密钥模式，那时客户端就是这么发的）。都不带 = 老客户端 / 迁移期 →
 * 落到默认空间 'main'，行为与升级前完全一致。
 */
async function resolveOwner(req: Request): Promise<{ owner: string; anonymous: boolean }> {
  const header = (req.headers.get(OWNER_HEADER) || '').trim();
  const auth = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const raw = header || auth;
  if (!raw) return { owner: DEFAULT_OWNER, anonymous: true };
  return { owner: (await sha256Hex(raw)).slice(0, 16), anonymous: false };
}

const resolveMaxOwners = (env: Env): number => {
  const parsed = Number((env.WX_MAX_OWNERS || '').trim());
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_MAX_OWNERS;
};

/** 这个身份已经有自己的行了（= 老成员，名额已经算过它）。 */
async function isKnownOwner(env: Env, owner: string): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT 1 AS ok FROM wx_config WHERE id = ?1`,
  ).bind(owner).first<{ ok: number }>();
  return !!row;
}

/** 已占用的名额数。默认空间 'main' 不算——那是主人自己的历史数据。 */
async function countOwners(env: Env): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT count(*) AS n FROM wx_config WHERE id != ?1`,
  ).bind(DEFAULT_OWNER).first<{ n: number }>();
  return row?.n ?? 0;
}

/**
 * 进门前的两道闸（顺序：老密钥 → 名额）。返回非 null = 直接回这个错误。
 *
 * · `WX_BRIDGE_TOKEN` 配了 = 老的单人模式：只认这一枚共享密钥（多租户请留空，
 *   留着它等于把所有人关进同一个空间）。
 * · 名额：`WX_MAX_OWNERS`（默认 10）只限制**新**身份；满了给人话，不说"错误码 403"。
 *
 * 默认（两个都不配）就是"打开链接、扫码即用"，任何人都能直接连——因为主人把仓库
 * 设为私有、也不想再维护邀请口令。这靠"身份隔离 + 名额 10"兜底，而不是靠一道密码。
 */
async function ownerGate(
  req: Request,
  env: Env,
  owner: string,
  anonymous: boolean,
): Promise<Response | null> {
  const sharedToken = (env.WX_BRIDGE_TOKEN || '').trim();
  if (sharedToken) {
    const auth = req.headers.get('Authorization') || '';
    const got = auth.replace(/^Bearer\s+/i, '').trim() || (req.headers.get(OWNER_HEADER) || '').trim();
    if (got !== sharedToken) return json({ ok: false, error: 'unauthorized' }, 401);
    return null;
  }
  if (anonymous) return null;                    // 默认空间永远放行（主人自己的历史数据）

  const max = resolveMaxOwners(env);
  if (await isKnownOwner(env, owner)) return null;
  if ((await countOwners(env)) >= max) {
    return json({ ok: false, error: 'OWNERS_FULL', hint: `这台服务只留了 ${max} 个位置，已经满了` }, 403);
  }
  return null;
}

async function readJson<T>(req: Request): Promise<T | null> {
  try { return await req.json() as T; } catch { return null; }
}

const log = (tag: string, message: string, extra?: unknown) => {
  console.log(`[wx:${tag}] ${message}${extra === undefined ? '' : ` ${JSON.stringify(extra)}`}`);
};
const logWarn = (tag: string, message: string, extra?: unknown) => {
  console.warn(`[wx:${tag}] ${message}${extra === undefined ? '' : ` ${JSON.stringify(extra)}`}`);
};

const sleep = (ms: number) => new Promise((resolve) => { setTimeout(resolve, ms); });

/**
 * 有并发上限的 map。
 *
 * 为什么需要它：iLink 的 getupdates 是**长轮询**——没有新消息也会把连接挂到超时
 * （cron 里给 20 秒，实测单 bot 整轮 14.6~18.8 秒）。于是 N 个微信串行就是 N × 20 秒：
 * 3 个就超过定时任务的墙钟预算，表现为"cron 静默停摆"（2026-09-13 排查了两天）。
 * 按空间并行后，整轮时长回到"一个长轮询"的量级，加人不再线性变慢。
 */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  run: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  const width = Math.max(1, Math.min(limit, items.length));
  let cursor = 0;
  await Promise.all(Array.from({ length: width }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await run(items[index], index);
    }
  }));
  return results;
}

/* ─────────── 配置读写 ─────────── */

const emptyConfig = (): BridgeConfig => ({ bots: [], llmEnc: null, llmIv: null });

async function loadConfig(env: Env, owner: string): Promise<BridgeConfig> {
  const row = await env.DB.prepare(
    `SELECT bots_json, llm_enc, llm_iv, updated_at FROM wx_config WHERE id = ?1`,
  ).bind(owner).first<ConfigRow>();
  if (!row) return emptyConfig();
  let bots: BotRecord[] = [];
  try { bots = JSON.parse(row.bots_json || '[]') as BotRecord[]; } catch { /* 坏的当空 */ }
  return {
    bots: Array.isArray(bots) ? bots.filter((b) => b && typeof b.botId === 'string') : [],
    llmEnc: row.llm_enc,
    llmIv: row.llm_iv,
    rev: row.updated_at,
  };
}

/**
 * 落库（**乐观锁**）。返回 false = 期间有人写过这把配置，调用方必须重读重改再存。
 *
 * 为什么必须加锁：整把配置是一行 JSON，而 cron 每分钟都整行落库；它读配置在这一轮
 * **开头**，一次长轮询能挂 20 秒——也就是说它手里那份快照最长可能旧 19 秒。裸
 * 「读—改—整行写」的结果：这 19 秒里用户的所有操作都被静默回滚。2026-09-13 实测
 * 踩到：/wx/bot/remove 明明返回 removed:1，一分钟后那个 bot 又在状态里（被并发的
 * 那次 cron 落库覆盖）。
 */
async function saveConfig(env: Env, owner: string, cfg: BridgeConfig): Promise<boolean> {
  const now = Date.now();
  if (cfg.rev === undefined) {
    // 还没读到过行（这个人第一次落库）：只能插；插不进去 = 有人抢先建了 → 冲突，让调用方重读。
    const ins = await env.DB.prepare(
      `INSERT OR IGNORE INTO wx_config (id, bots_json, llm_enc, llm_iv, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5)`,
    ).bind(owner, JSON.stringify(cfg.bots), cfg.llmEnc, cfg.llmIv, now).run();
    if ((ins.meta?.changes ?? 0) === 0) return false;
    cfg.rev = now;
    return true;
  }
  const upd = await env.DB.prepare(
    `UPDATE wx_config SET bots_json = ?1, llm_enc = ?2, llm_iv = ?3, updated_at = ?4
     WHERE id = ?5 AND updated_at = ?6`,
  ).bind(JSON.stringify(cfg.bots), cfg.llmEnc, cfg.llmIv, now, owner, cfg.rev).run();
  if ((upd.meta?.changes ?? 0) === 0) return false;
  cfg.rev = now;
  return true;
}

/**
 * 安全的「读—改—写」：冲突就整体重来（重读最新、重新应用改动）。
 * 用户动作（删绑定 / 改绑 / 存凭据 / 扫码确认）都走这里。
 */
async function mutateConfig<T>(
  env: Env,
  owner: string,
  mutate: (cfg: BridgeConfig) => T,
): Promise<{ ok: true; value: T } | { ok: false }> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const cfg = await loadConfig(env, owner);
    const value = mutate(cfg);
    if (await saveConfig(env, owner, cfg)) return { ok: true, value };
    await sleep(60 * (attempt + 1));
  }
  logWarn('config', '写入连续冲突，本次修改未生效（让用户重试）');
  return { ok: false };
}

/** 一次轮询里 bot 会变的字段——只写这些，不拿旧快照整行覆盖别人的改动。 */
type BotStatePatch = Pick<BotRecord, 'botId' | 'cursor' | 'lastPollAt' | 'lastProbeAt' | 'lastError' | 'expired'>;

const botStatePatch = (bot: BotRecord): BotStatePatch => ({
  botId: bot.botId,
  cursor: bot.cursor,
  lastPollAt: bot.lastPollAt,
  lastProbeAt: bot.lastProbeAt,
  lastError: bot.lastError,
  expired: bot.expired,
});

/**
 * 把轮询结果**合并**进最新配置再落库。期间被删掉的 bot 直接跳过（状态丢弃，绝不复活）。
 */
async function applyBotState(env: Env, owner: string, patches: BotStatePatch[]): Promise<void> {
  if (patches.length === 0) return;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const cfg = await loadConfig(env, owner);
    for (const patch of patches) {
      const bot = cfg.bots.find((b) => b.botId === patch.botId);
      if (!bot) continue;
      bot.cursor = patch.cursor;
      bot.lastPollAt = patch.lastPollAt;
      bot.lastProbeAt = patch.lastProbeAt;
      bot.lastError = patch.lastError;
      bot.expired = patch.expired;
    }
    if (await saveConfig(env, owner, cfg)) return;
    await sleep(60 * (attempt + 1));
  }
  logWarn('config', 'bot 状态落库连续冲突，已放弃（下一轮会再写）');
}

/* ─────────── bot token 加解密 ─────────── */

async function decryptBotToken(env: Env, bot: BotRecord): Promise<string | null> {
  if (!env.MASTER_KEY) return null;
  const plain = await decryptSecret(env.MASTER_KEY, BOT_TOKEN_SALT, bot.tokenIv, bot.tokenEnc);
  return plain || null;
}

async function encryptBotToken(env: Env, token: string): Promise<{ tokenEnc: string; tokenIv: string } | null> {
  if (!env.MASTER_KEY) return null;
  const sealed = await encryptSecret(env.MASTER_KEY, BOT_TOKEN_SALT, token);
  return { tokenEnc: sealed.data, tokenIv: sealed.iv };
}

/* ─────────── pack 读写 ─────────── */

/**
 * 宽松读一份 pack。
 *
 * 故意**不**用 `parseFirePack` 严格校验：那个函数连同 `v`（版本号）一起验，而 worker
 * 是一次性部署、App 会持续更新——上游把 FIRE_PACK_VERSION 一提，严格校验就会把用户
 * 手里合法的包全部打回，表现为「微信桥突然不回消息了，重部署才好」。这里只检查
 * 真正用得上的三个字段，版本号仅用于日志与自检展示。
 */
function readPack(jsonText: string): AmsgFirePack | null {
  try {
    const parsed = JSON.parse(jsonText) as AmsgFirePack;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.tzId !== 'string' || !parsed.tzId) return null;
    if (!parsed.chat || !Array.isArray(parsed.chat.messages) || parsed.chat.messages.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function loadPack(env: Env, owner: string, charId: string): Promise<PackRow | null> {
  return env.DB.prepare(
    `SELECT pack_json, template_ver, chat_built_at FROM wx_packs WHERE owner = ?1 AND char_id = ?2`,
  ).bind(owner, charId).first<PackRow>();
}

async function savePack(
  env: Env,
  owner: string,
  charId: string,
  pack: AmsgFirePack,
  opts: { templateVer?: number; chatBuiltAt?: number } = {},
): Promise<void> {
  const now = Date.now();
  const existing = await env.DB.prepare(
    `SELECT template_ver FROM wx_packs WHERE owner = ?1 AND char_id = ?2`,
  ).bind(owner, charId).first<{ template_ver: number }>();
  const templateVer = opts.templateVer ?? existing?.template_ver ?? 1;
  const packJson = JSON.stringify(pack);
  const chatBuiltAt = opts.chatBuiltAt ?? pack.chat?.builtAt ?? now;
  // 手动 upsert（先 UPDATE 再 INSERT）而不是 ON CONFLICT：老库的主键只有 char_id
  // （多租户升级只能加列、不动主键），ON CONFLICT(owner, char_id) 在老库上找不到对应约束。
  const updated = await env.DB.prepare(
    `UPDATE wx_packs SET pack_json = ?1, template_ver = ?2, chat_built_at = ?3, updated_at = ?4
      WHERE owner = ?5 AND char_id = ?6`,
  ).bind(packJson, templateVer, chatBuiltAt, now, owner, charId).run();
  if ((updated.meta?.changes ?? 0) > 0) return;
  // INSERT OR IGNORE：老库上 char_id 是主键，万一同一个 char_id 已被别人的空间占了
  // （uuid 撞车，概率可忽略），宁可少写一行也别抛错打断这轮回复。
  await env.DB.prepare(
    `INSERT OR IGNORE INTO wx_packs (owner, char_id, pack_json, template_ver, chat_built_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
  ).bind(owner, charId, packJson, templateVer, chatBuiltAt, now).run();
}

/* ─────────── 凭据 ─────────── */

async function decryptCreds(env: Env, cfg: BridgeConfig): Promise<LlmCredentials | null> {
  if (!cfg.llmEnc || !cfg.llmIv) return null;
  if (!env.MASTER_KEY) {
    logWarn('llm', 'D1 里有加密凭据但没配 MASTER_KEY（wrangler secret put MASTER_KEY）');
    return null;
  }
  const plain = await decryptSecret(env.MASTER_KEY, MASTER_SALT, cfg.llmIv, cfg.llmEnc);
  if (!plain) {
    logWarn('llm', 'MASTER_KEY 与凭据对不上，解不开（换过密钥就要在设置页重新上传凭据）');
    return null;
  }
  try {
    const parsed = JSON.parse(plain) as LlmCredentials;
    if (!parsed?.apiUrl || !parsed?.model) return null;
    return parsed;
  } catch {
    return null;
  }
}

/* ─────────── 台账与增量 ─────────── */

/**
 * 幂等写入一条台账。返回 false = 这条已经处理过。
 * 去重靠 `INSERT OR IGNORE`：并发/重放都不可能两个都插进去。
 * 新库按 (owner, msg_id) 去重（每人各自幂等）；老库主键只有 msg_id，一处顺手也更安全。
 */
async function insertLedger(
  env: Env,
  owner: string,
  msgId: string,
  charId: string,
  role: 'user' | 'assistant',
  content: string,
  at: number,
): Promise<boolean> {
  const res = await env.DB.prepare(
    `INSERT OR IGNORE INTO wx_messages (msg_id, owner, char_id, role, content, source, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, 'wechat', ?6)`,
  ).bind(msgId, owner, charId, role, content.slice(0, 4000), at).run();
  return (res.meta?.changes ?? 0) > 0;
}

async function pushOutbox(env: Env, owner: string, entries: OutboxEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const now = Date.now();
  const stmt = env.DB.prepare(
    `INSERT INTO wx_outbox (owner, char_id, msg_id, payload, created_at) VALUES (?1, ?2, ?3, ?4, ?5)`,
  );
  // 逐条跑：条数极少（一次生成最多 6 段），不值得为它引入 batch 的复杂度。
  for (const entry of entries) {
    await stmt.bind(owner, entry.charId, entry.msgId, JSON.stringify(entry), now).run();
  }
}

/* ─────────── 核心：处理一条微信入站消息 ─────────── */

async function processIncoming(
  env: Env,
  owner: string,
  cfg: BridgeConfig,
  bot: BotRecord,
  msg: ILinkInboundMessage,
): Promise<void> {
  const from = String(msg.from_user_id || '').trim();
  // 防自环：自己发出去的消息也会出现在 updates 里，不拦就是无限自言自语。
  if (!from || (bot.botId && from === bot.botId)) return;
  const text = extractInboundText(msg);
  if (!text) return; // 图片/语音等 P0 不处理

  // 绑定模型：这个微信扮演谁，消息就归谁。没绑定角色 = 用户还没在某个角色设定页
  // 扫码确认，忽略（上游 iLink 的未绑定 bot 本来也收不到消息路由）。
  const charId = String(bot.charId || '').trim();
  if (!charId) {
    logWarn('poll', `bot ${bot.botId} 还没绑定角色，忽略来自 ${from} 的消息`);
    return;
  }
  // 微信里任何人发来的消息都归这个角色（包括用户自己用别的号发的）——这正是
  // 「ta 住在这个微信号里」的语义；不想让陌生人触发回复，就别把这个号的二维码给别人。

  const now = Date.now();
  const msgId = typeof msg.message_id === 'number' && msg.message_id > 0
    ? `ilink_${msg.message_id}`
    : `ilink_${from}_${now}`;

  // 幂等闸：重放/重复推送在这里返回，不会重复生成、重复发。
  if (!(await insertLedger(env, owner, msgId, charId, 'user', text, now))) return;

  const contextToken = String(msg.context_token || '');
  if (!contextToken) {
    // 没有它就回复不了（协议规定）。仍然记账 + 回流，让用户至少能在 SullyOS 里看到。
    logWarn('poll', `消息缺 context_token，无法回复`, { from, charId: charId });
    await pushOutbox(env, owner, [{ msgId, charId: charId, role: 'user', content: text, at: now, source: 'wechat' }]);
    return;
  }

  const packRow = await loadPack(env, owner, charId);
  const pack = packRow ? readPack(packRow.pack_json) : null;
  if (!packRow || !pack) {
    logWarn('poll', `角色 ${charId} 还没有可用的 fire_pack，无法生成回复`);
    await pushOutbox(env, owner, [{ msgId, charId: charId, role: 'user', content: text, at: now, source: 'wechat' }]);
    return;
  }

  // ── 先把用户这一轮落进 pack 并保存：哪怕后面 LLM 挂了，这条也进了会话上下文。 ──
  pack.chat!.messages.push({ role: 'user', content: text });
  pack.chat!.builtAt = now;
  await savePack(env, owner, charId, pack, { chatBuiltAt: now });
  await pushOutbox(env, owner, [{ msgId, charId: charId, role: 'user', content: text, at: now, source: 'wechat' }]);

  if (bot.autoReply === false) {
    log('poll', `角色 ${charId} 关着自动回复：只同步，不生成`);
    return;
  }

  const creds = await decryptCreds(env, cfg);
  if (!creds) {
    logWarn('poll', '没有可用的 LLM 凭据，无法生成回复');
    return;
  }

  // ── 组请求：pack 里的对话原样 + 末尾时效块（满血大脑，见文件头规矩 1） ──
  const tz = { tzId: pack.tzId };
  const timelyBlock = buildInstantTimelyBlock({
    nowMs: Date.now(),
    tz,
    userTzId: pack.userTzId || pack.tzId,
    targetName: pack.targetName || '对方',
    timeAwarenessEnabled: bot.timeAwarenessEnabled !== false,
    // 实时世界（天气/热搜）依赖 amsg 那套基建，微信桥 P0 不带。
    blocks: [],
  });
  const messages: LlmMessage[] = [
    ...pack.chat!.messages.map((m) => ({ role: m.role, content: m.content })),
    ...(timelyBlock ? [{ role: 'system', content: timelyBlock }] : []),
  ];

  const result = await callLlm(creds, messages, { timeoutMs: 90_000 });
  if (!result.ok || !result.text) {
    logWarn('llm', `生成失败：${result.error ?? '空内容'}`, { charId: charId, status: result.status });
    return; // 用户那一轮已在 pack 和 outbox 里，SullyOS 打开就看得到
  }

  const { segments, emojiNames } = normalizeReplyForWechat(result.text);
  if (segments.length === 0) {
    logWarn('llm', '整理后没有可发的正文（全是令牌）', { charId: charId });
    return;
  }
  if (emojiNames.length > 0) {
    log('poll', `回复里有 ${emojiNames.length} 个表情包令牌，P0 只剥不发`, { emojiNames });
  }

  // ── 逐段发回微信 + 落台账/增量 ──
  const outboxEntries: OutboxEntry[] = [];
  const sentSegments: string[] = [];
  for (let i = 0; i < segments.length; i += 1) {
    if (i > 0) await sleep(600); // 连发几条时留点人间隔，别像机关枪
    const send = await sendText(bot.baseUrl || DEFAULT_ILINK_BASE, await decryptBotToken(env, bot) || '', from, contextToken, segments[i]);
    if (!send.ok) {
      logWarn('poll', `第 ${i + 1} 段没发出去：${send.error}`);
      // 一段失败就停：继续发后面的会让微信里出现「半截回复」。
      break;
    }
    sentSegments.push(segments[i]);
    const segMsgId = segments.length === 1 ? `${msgId}:reply` : `${msgId}:reply:${i + 1}`;
    await insertLedger(env, owner, segMsgId, charId, 'assistant', segments[i], Date.now());
    outboxEntries.push({
      msgId: segMsgId, charId: charId, role: 'assistant',
      content: segments[i], at: Date.now(), source: 'wechat',
    });
  }

  // 助手这轮也追加进 pack 的对话，云端自洽——App 一周不开上下文也不断。
  if (sentSegments.length > 0) {
    for (const segment of sentSegments) {
      pack.chat!.messages.push({ role: 'assistant', content: segment });
    }
    pack.chat!.builtAt = Date.now();
    await savePack(env, owner, charId, pack, { chatBuiltAt: pack.chat!.builtAt });
    await pushOutbox(env, owner, outboxEntries);
  }

  log('poll', `回复完成：${sentSegments.length}/${segments.length} 段`, { charId: charId });
}

/* ─────────── Cron：轮询所有 bot ─────────── */

/**
 * 心跳：cron 每次跑都留一条痕（id 固定 'cron'，只保留最近一次）。
 * 排障用——「cron 有没有触发、跑到哪一步、报什么错」一眼可见（曾出现静默不干活的情况）。
 */
async function writeHeartbeat(env: Env, at: number, note: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO wx_heartbeat (id, at, note) VALUES ('cron', ?1, ?2)
     ON CONFLICT(id) DO UPDATE SET at = ?1, note = ?2`,
  ).bind(at, note.slice(0, 300)).run();
}

/** 会话被判失效后，每隔多久再探一次（每分钟都探等于白烧请求；5 分钟足够自愈）。 */
const EXPIRED_PROBE_INTERVAL_MS = 5 * 60_000;

/**
 * 轮询一个 bot，并把结果写回它的记录。**cron 与 /wx/bot/check 共用这一份**——
 * 两条路径的口径必须一致，否则又会出现"手动检查说好了、云上还是死的"。
 * 调用方负责 saveConfig（多个 bot 循环后一次性落库）。
 */
async function pollBotOnce(
  env: Env,
  owner: string,
  cfg: BridgeConfig,
  bot: BotRecord,
  pollTimeoutMs: number,
): Promise<{ expired: boolean; processed: number; failed: boolean }> {
  bot.lastProbeAt = Date.now();
  const token = await decryptBotToken(env, bot);
  if (!token) {
    bot.lastError = 'MASTER_KEY 缺失或对不上，解不开 token';
    return { expired: false, processed: 0, failed: true };
  }
  try {
    const result = await pollUpdates(bot.baseUrl || DEFAULT_ILINK_BASE, token, bot.cursor || '', pollTimeoutMs);
    if (result.expired) {
      // 丢游标重试也过不去 = 会话真的没了。清掉游标（官方口径：清状态重新开始），
      // 但**不停止轮询**——pollOwnerOnce 会对失效 bot 低频探测，恢复了自己会回来。
      bot.expired = true;
      bot.cursor = '';
      bot.lastError = '登录会话已过期（重试仍未通过）；点「检查连接」再试一次，一直不行才需要重新扫码';
      logWarn('poll', `bot ${bot.botId} 会话过期（丢游标重试仍未通过）`);
      return { expired: true, processed: 0, failed: false };
    }
    let processed = 0;
    // 顺序处理：确保上一条完整处理完再处理下一条（与上游口径一致）。
    for (const msg of result.messages) {
      try {
        await processIncoming(env, owner, cfg, bot, msg);
        processed += 1;
      } catch (err) {
        // 单条失败不连累整批，也不卡游标——下一轮游标已前进，这条不会重收。
        logWarn('poll', `单条消息处理失败：${err instanceof Error ? err.message : String(err)}`);
      }
    }
    bot.cursor = result.nextCursor;
    bot.lastPollAt = Date.now();
    bot.lastError = undefined;
    // ★ 成功即自愈：这里曾经只清 lastError 不清 expired，于是一次瞬时 -14 就把这个
    //   微信永久锁死（cron 里 `if (bot.expired) continue`），只能等用户手点检查。
    if (bot.expired) {
      log('poll', `bot ${bot.botId} 会话已恢复`);
      bot.expired = false;
    }
    if (result.cursorReset) log('poll', `bot ${bot.botId} 丢游标重试成功，会话已续上`);
    return { expired: false, processed, failed: false };
  } catch (err) {
    bot.lastError = err instanceof Error ? err.message : String(err);
    logWarn('poll', `bot ${bot.botId} 轮询失败：${bot.lastError}`);
    return { expired: false, processed: 0, failed: true };
  }
}

/** 增量保留窗口：72 小时。窗口外的行由 cron 顺带清掉（替代原来的"认领即删"）。 */
const OUTBOX_RETENTION_MS = 72 * 60 * 60 * 1000;

/**
 * 清理窗口外的增量。**按 owner 逐空间清**——不按时间全表清，是因为别人的空间
 * 不该由这一轮顺手动（虽然结果一样，但隔离意图写在 SQL 里更好读）。
 */
async function pruneOutbox(env: Env, owner: string): Promise<number> {
  const res = await env.DB.prepare(
    `DELETE FROM wx_outbox WHERE owner = ?1 AND created_at < ?2`,
  ).bind(owner, Date.now() - OUTBOX_RETENTION_MS).run();
  return res.meta?.changes ?? 0;
}

/**
 * 一个空间（owner）的一轮轮询。**组内串行**：同一个人名下可能有多个微信，
 * 它们可能绑到同一个角色上，并行会让同一份 pack 出现读改写交错。
 */
async function pollOwnerOnce(env: Env, owner: string, pollTimeoutMs: number): Promise<number> {
  // 增量清理顺带做：没有 bot 的空间也要清，否则它的历史行只涨不消。
  await pruneOutbox(env, owner);
  const cfg = await loadConfig(env, owner);
  if (cfg.bots.length === 0) return 0;
  const patches: BotStatePatch[] = [];
  let polled = 0;
  for (const bot of cfg.bots) {
    // 失效的 bot **不再永久跳过**（曾经这样，结果静默死掉一整天）：改成低频探测，
    // 会话恢复了自己回来。首次（还没探过）立刻探一次，之后每 5 分钟一次。
    if (bot.expired && Date.now() - (bot.lastProbeAt ?? 0) < EXPIRED_PROBE_INTERVAL_MS) continue;
    await pollBotOnce(env, owner, cfg, bot, pollTimeoutMs);
    patches.push(botStatePatch(bot));
    polled += 1;
  }
  // ★ 合并写（不整行覆盖）：否则这一分钟里用户的手动操作会被这次落库静默回滚。
  await applyBotState(env, owner, patches);
  return polled;
}

/** 所有空间（`wx_config` 的每一行就是一个空间，含默认空间 'main'）。 */
async function listOwners(env: Env): Promise<string[]> {
  const rows = await env.DB.prepare(`SELECT id FROM wx_config`).all<{ id: string }>();
  return (rows.results || []).map((row) => String(row.id)).filter((id) => !!id);
}

/** 并发上限：跟随在线人数，再留一个安全阀，别把平台的连接数打爆。 */
const MAX_POLL_CONCURRENCY = 10;

/** 一轮的总预算：到点就不再启动新的空间（宁可这轮少轮几个，也别被平台掐死）。 */
const POLL_BUDGET_MS = 25_000;

/** 分片轮询的片数（默认 1 = 每分钟轮全部；见 Env 里 WX_POLL_SHARD 的说明）。 */
const resolveShard = (env: Env): number => {
  const parsed = Number((env.WX_POLL_SHARD || '').trim());
  return Number.isFinite(parsed) && parsed > 1 ? Math.floor(parsed) : 1;
};

/**
 * 轮询全部空间：**空间之间并行、并发跟随人数**。
 *
 * 这是"名额可以放到 10 人"的前提：串行时 10 个微信最多 200 秒，必被墙钟掐死；
 * 并行后整轮 ≈ 一个长轮询（约 20 秒），人再多也不超预算。
 * 另有两道保险：总预算守卫（到点不再启动新空间）与可选分片（摊到多分钟）。
 */
async function pollAllOwners(
  env: Env,
  pollTimeoutMs = 40_000,
): Promise<{ owners: number; bots: number; skipped: number }> {
  const all = await listOwners(env);
  if (all.length === 0) return { owners: 0, bots: 0, skipped: 0 };

  // 分片（默认关闭）：按"第几分钟"轮转，只轮属于这一分钟的那一片。
  const shard = resolveShard(env);
  const owners = shard === 1
    ? all
    : all.filter((_, index) => index % shard === Math.floor(Date.now() / 60_000) % shard);

  const deadline = Date.now() + POLL_BUDGET_MS;
  let skipped = 0;
  const counts = await mapWithConcurrency(owners, MAX_POLL_CONCURRENCY, async (owner) => {
    if (Date.now() > deadline) {
      skipped += 1;                              // 这轮没轮上，下一轮还会轮到它（空间不会丢）
      return 0;
    }
    return pollOwnerOnce(env, owner, pollTimeoutMs);
  });
  return { owners: owners.length, bots: counts.reduce((sum, n) => sum + n, 0), skipped };
}

/* ─────────── 端点 ─────────── */

async function handleConfig(req: Request, env: Env, owner: string): Promise<Response> {
  const body = await readJson<{
    llm?: LlmCredentials | null;
    clearLlm?: boolean;
  }>(req);
  if (!body) return json({ ok: false, error: 'invalid body' }, 400);

  // 先做校验与加密（可能失败、也慢），再进"读—改—写"，避免把加密塞进重试循环里。
  let chosen: { enc: string | null; iv: string | null } | null = null;
  if (body.clearLlm) {
    chosen = { enc: null, iv: null };
  } else if (body.llm) {
    if (!env.MASTER_KEY) return json({ ok: false, error: 'MASTER_KEY_NOT_SET', hint: '先在 Worker 上配 MASTER_KEY 密钥' }, 409);
    const payload: LlmCredentials = {
      apiUrl: String(body.llm.apiUrl || '').trim(),
      apiKey: String(body.llm.apiKey || ''),
      model: String(body.llm.model || '').trim(),
      ...(body.llm.extraBody ? { extraBody: body.llm.extraBody } : {}),
    };
    if (!payload.apiUrl || !payload.model) return json({ ok: false, error: 'apiUrl / model 必填' }, 400);
    const sealed = await encryptSecret(env.MASTER_KEY, MASTER_SALT, JSON.stringify(payload));
    chosen = { enc: sealed.data, iv: sealed.iv };
  }
  // 既没传 llm 也没传 clearLlm：纯探测请求，只回现状。
  if (!chosen) {
    const cur = await loadConfig(env, owner);
    return json({ ok: true, llmConfigured: !!cur.llmEnc });
  }

  const next = chosen;
  const res = await mutateConfig(env, owner, (cfg) => {
    cfg.llmEnc = next.enc;
    cfg.llmIv = next.iv;
    return !!cfg.llmEnc;
  });
  if (!res.ok) return json({ ok: false, error: '云端配置正在写入，请再点一次「保存凭据」' }, 409);
  return json({ ok: true, llmConfigured: res.value });
}

/** 拿登录二维码。 */
async function handleBotQrStart(_req: Request, env: Env): Promise<Response> {
  try {
    const qr = await startQrLogin();
    return json({ ok: true, qrcode: qr.qrcode, img: qr.qrcodeImg });
  } catch (err) {
    logWarn('bot', `拿二维码失败：${err instanceof Error ? err.message : String(err)}`);
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 502);
  }
}

/**
 * 同一角色只留最新的那个微信绑定。
 *
 * 为什么必须自动做：重新扫同一个微信会拿到一个**新的 botId**（旧 token 其实还能用），
 * 两条并存 = 同一个微信号被两个会话同时长轮询，而官方协议文档明确警告「不要自行并发
 * getupdates」（重复消费、消息丢失）——2026-09-13 那次「误报失效」就有它一份。
 * 用户的期望也正是：重扫以最新为准，旧的自动删。
 *
 * 只清**同一 charId** 下的旧绑定：不同角色各自的微信互不影响。
 */
function pruneSiblingBots(cfg: BridgeConfig, keep: BotRecord): BotRecord[] {
  if (!keep.charId) return [];
  const dropped = cfg.bots.filter((b) => b.botId !== keep.botId && b.charId === keep.charId);
  if (dropped.length === 0) return [];
  cfg.bots = cfg.bots.filter((b) => b.botId === keep.botId || b.charId !== keep.charId);
  return dropped;
}

/**
 * 轮询扫码状态。confirmed 时立刻加密落库——token 的明文只在这一跳存在，
 * 返回给前端的只有 botId。
 *
 * 绑定模型：query 里带 charId（哪个角色的设定页发起的扫码），确认时一并写入——
 * 「在谁家扫码，微信就归谁」。
 */
async function handleBotQrStatus(req: Request, env: Env, owner: string): Promise<Response> {
  const url = new URL(req.url);
  const qrcode = (url.searchParams.get('qrcode') || '').trim();
  if (!qrcode) return json({ ok: false, error: '缺少 qrcode' }, 400);
  const charId = (url.searchParams.get('charId') || '').trim();
  try {
    const result = await pollQrLogin(qrcode);
    if (result.status !== 'confirmed') {
      return json({ ok: true, status: result.status });
    }
    if (!result.botToken || !result.botId) {
      return json({ ok: false, error: 'confirmed 但没返回 token（协议异常，请重试）' }, 502);
    }
    if (!charId) return json({ ok: false, error: '缺少 charId（不知道绑给哪个角色）' }, 400);
    const sealed = await encryptBotToken(env, result.botToken);
    if (!sealed) return json({ ok: false, error: 'MASTER_KEY_NOT_SET', hint: '先在 Worker 上配 MASTER_KEY' }, 409);

    // 这一跳要塞进 token，必须走"读—改—写"：否则刚写的绑定会被并发的 cron 落库回滚
    // （实测就是它把 /wx/bot/remove 的结果吞了）。
    const newBotId = result.botId;
    const res = await mutateConfig(env, owner, (cfg) => {
      const existing = cfg.bots.find((b) => b.botId === newBotId);
      const record: BotRecord = {
        botId: newBotId,
        tokenEnc: sealed.tokenEnc,
        tokenIv: sealed.tokenIv,
        // 重新扫码刷新 token 时保留原基址与游标；新 bot 从默认基址、空游标开始。
        baseUrl: result.baseUrl || existing?.baseUrl || '',
        // 扫码即绑定：这个微信从此扮演发起扫码的这个角色。autoReply 缺省开。
        charId,
        autoReply: existing?.charId === charId ? existing?.autoReply ?? true : true,
        timeAwarenessEnabled: existing?.timeAwarenessEnabled,
        label: existing?.label,
        cursor: existing?.cursor || '',
      };
      cfg.bots = [...cfg.bots.filter((b) => b.botId !== newBotId), record];
      // 重扫 = 以最新为准：同一角色名下的旧绑定顺手清掉，别让两个会话并发轮询同一个微信。
      return pruneSiblingBots(cfg, record);
    });
    if (!res.ok) return json({ ok: false, error: '云端配置正在写入，请重新扫一次码' }, 409);
    log('bot', `bot 登录成功，已绑定到角色`, { botId: newBotId, charId });
    if (res.value.length > 0) {
      log('bot', `已清理同角色的旧绑定 ${res.value.length} 个`, { botIds: res.value.map((b) => b.botId) });
    }
    return json({ ok: true, status: 'confirmed', botId: newBotId, charId, removedOld: res.value.length });
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 502);
  }
}

/**
 * 一键改绑 / 改自动回复开关。token 与游标原样保留——换角色不需要重新扫码。
 * botId 缺省 = 唯一那个 bot（当前一个微信一个角色的模型下基本只有一个）。
 */
async function handleBotBind(req: Request, env: Env, owner: string): Promise<Response> {
  const body = await readJson<{ botId?: string; charId?: string; autoReply?: boolean }>(req);
  const charId = String(body?.charId || '').trim();
  if (!charId) return json({ ok: false, error: '缺少 charId' }, 400);
  const res = await mutateConfig(env, owner, (cfg) => {
    const bot = body?.botId ? cfg.bots.find((b) => b.botId === body.botId) : cfg.bots[0];
    if (!bot) return null;
    const previous = bot.charId;
    bot.charId = charId;
    if (typeof body?.autoReply === 'boolean') bot.autoReply = body.autoReply;
    // 改绑也算"以最新为准"：目标角色名下若还挂着别的微信，一并清掉（同一微信只该有一个会话）。
    const dropped = pruneSiblingBots(cfg, bot);
    return { botId: bot.botId, from: previous, dropped, autoReply: bot.autoReply !== false };
  });
  if (!res.ok) return json({ ok: false, error: '云端配置正在写入，请再点一次' }, 409);
  if (!res.value) return json({ ok: false, error: '还没有已登录的微信（先扫码）' }, 400);
  const { botId, from, dropped, autoReply } = res.value;
  log('bot', `改绑完成`, { botId, from: from || '(未绑定)', to: charId });
  if (dropped.length > 0) {
    log('bot', `已清理该角色下的其他绑定 ${dropped.length} 个`, { botIds: dropped.map((b) => b.botId) });
  }
  return json({ ok: true, botId, charId, autoReply, removedOld: dropped.length });
}

/**
 * 对 bot 做一次真实轮询：既能探会话状态，也顺带收消息。
 *
 * **不带 botId = 所有 bot 都查一遍**（前端兜底轮询走这条；以前默认只查 bots[0]，
 * 结果第二个绑定等于没人管）。带 botId = 只查那一个（卡片上的「检查连接」）。
 */
async function handleBotCheck(req: Request, env: Env, owner: string): Promise<Response> {
  const body = await readJson<{ botId?: string }>(req);
  const cfg = await loadConfig(env, owner);
  const targets = body?.botId
    ? cfg.bots.filter((b) => b.botId === body.botId)
    : cfg.bots;
  if (targets.length === 0) {
    return json({ ok: false, error: body?.botId ? '找不到这个微信绑定' : '没有已登录的 bot（先扫码）' }, 400);
  }

  // 与 cron 同一份口径（含 -14 丢游标重试、成功自愈），也同一套并发策略：
  // 多个 bot 并行，否则"检查连接"会随着绑定的微信变多而越来越慢（HTTP 路径给 40 秒）。
  const patches: BotStatePatch[] = [];
  const results = await mapWithConcurrency(targets, MAX_POLL_CONCURRENCY, async (bot) => {
    const r = await pollBotOnce(env, owner, cfg, bot, 40_000);
    patches.push(botStatePatch(bot));
    return { botId: bot.botId, expired: r.expired, lastPollAt: bot.lastPollAt, lastError: bot.lastError, failed: r.failed };
  });
  const rows = results.map(({ failed: _failed, ...row }) => row);
  const failedCount = results.filter((r) => r.failed).length;
  await applyBotState(env, owner, patches);

  // 一个都没查通 → 按失败返回，前端才会弹「检查失败」而不是「连接正常」。
  if (failedCount === targets.length) {
    return json({ ok: false, error: rows[0].lastError || '轮询失败' }, 502);
  }
  const primary = rows[0];
  return json({
    ok: true,
    // 只要有一个被判过期，整体就是"需要处理"，卡片按它决定要不要亮黄字。
    expired: rows.some((r) => r.expired),
    botId: primary.botId,
    lastPollAt: primary.lastPollAt,
    lastError: primary.lastError,
    bots: rows,
  });
}

async function handleBotRemove(req: Request, env: Env, owner: string): Promise<Response> {
  const body = await readJson<{ botId?: string }>(req);
  if (!body?.botId) return json({ ok: false, error: '缺少 botId' }, 400);
  const res = await mutateConfig(env, owner, (cfg) => {
    const before = cfg.bots.length;
    cfg.bots = cfg.bots.filter((b) => b.botId !== body.botId);
    return before - cfg.bots.length;
  });
  if (!res.ok) return json({ ok: false, error: '云端配置正在写入，请再点一次' }, 409);
  return json({ ok: true, removed: res.value });
}

async function handlePackUpload(req: Request, env: Env, owner: string): Promise<Response> {
  const body = await readJson<{ charId?: string; pack?: unknown; chatBuiltAt?: number }>(req);
  if (!body?.charId || !body.pack) return json({ ok: false, error: 'charId / pack 必填' }, 400);

  const incoming = body.pack as AmsgFirePack;
  if (typeof incoming.tzId !== 'string' || !incoming.tzId) {
    return json({ ok: false, error: 'pack 缺少 tzId' }, 400);
  }
  if (!incoming.chat || !Array.isArray(incoming.chat.messages) || incoming.chat.messages.length === 0) {
    return json({ ok: false, error: 'pack 缺少 chat.messages（微信桥靠它当请求消息）' }, 400);
  }

  const existing = await loadPack(env, owner, body.charId);
  const incomingChatAt = body.chatBuiltAt ?? incoming.chat.builtAt ?? 0;
  let chatBuiltAt = incomingChatAt;
  let chatKept = false;

  if (existing) {
    const existingChatAt = existing.chat_built_at ?? 0;
    // ★ 防丢更新的正解：模板随 App 覆盖，**对话只能往前**。
    // 云端可能已经有微信里聊出来的几轮（App 关着时生成的），App 手里那份反而是旧的——
    // 直接覆盖就等于把微信里的对话抹掉。
    if (existingChatAt > incomingChatAt) {
      const cloudPack = readPack(existing.pack_json);
      if (cloudPack) {
        incoming.chat = cloudPack.chat;
        chatBuiltAt = existingChatAt;
        chatKept = true;
        log('pack', `云端对话更新（${existingChatAt} > ${incomingChatAt}），保留云端那份`, { charId: body.charId });
      }
    }
  }

  const prevVer = existing?.template_ver ?? 0;
  await savePack(env, owner, body.charId, incoming, { templateVer: prevVer + 1, chatBuiltAt });
  log('pack', `已保存角色 ${body.charId} 的 pack`, {
    templateVer: prevVer + 1,
    messages: incoming.chat?.messages.length ?? 0,
    chatKept,
  });
  return json({ ok: true, templateVer: prevVer + 1, chatKept });
}

async function handleOutboxPull(req: Request, env: Env, owner: string): Promise<Response> {
  const url = new URL(req.url);
  const since = Number(url.searchParams.get('since') || '0') || 0;
  const charId = (url.searchParams.get('charId') || '').trim();
  const limit = Math.min(Number(url.searchParams.get('limit') || '200') || 200, 500);

  // ★ 按 owner 过滤：只回自己空间里的增量。多租户之前这里没有任何身份过滤，
  //   同一个 worker 上的两台设备/两个人会互相拉到对方的条目。
  const rows = charId
    ? await env.DB.prepare(
        `SELECT seq, payload FROM wx_outbox WHERE owner = ?1 AND seq > ?2 AND char_id = ?3 ORDER BY seq ASC LIMIT ?4`,
      ).bind(owner, since, charId, limit).all<{ seq: number; payload: string }>()
    : await env.DB.prepare(
        `SELECT seq, payload FROM wx_outbox WHERE owner = ?1 AND seq > ?2 ORDER BY seq ASC LIMIT ?3`,
      ).bind(owner, since, limit).all<{ seq: number; payload: string }>();

  const items: Array<OutboxEntry & { seq: number }> = [];
  let nextSince = since;
  for (const row of rows.results || []) {
    nextSince = Math.max(nextSince, row.seq);
    try {
      items.push({ ...(JSON.parse(row.payload) as OutboxEntry), seq: row.seq });
    } catch { /* 单条坏了不该拖垮整批 */ }
  }
  return json({ ok: true, items, nextSince });
}

/**
 * POST /wx/outbox/ack —— 兼容口：**保留接口与返回形状，但不再删除任何东西**。
 *
 * 为什么改成不删：以前它是"认领即删"，于是同一个人的手机和电脑会互相抢——谁先拉谁
 * 把那几条删掉，另一台设备永远补不到（2026-09-13 用户实测："有时候 SullyOS 里看不到
 * 消息"，就是这个）。改成保留窗口后每台设备按自己的 lastSeq 各拉各的，谁都不吃亏；
 * 清理交给 cron 按时间做（见 pruneOutbox），重复拉由客户端 msg_id 幂等去重兜住（已有）。
 */
async function handleOutboxAck(_req: Request, _env: Env, _owner: string): Promise<Response> {
  return json({ ok: true, deleted: 0, kept: true });
}

/* ─────────── 建表与体检 ─────────── */

/** 列出现有表名。体检与 /wx/init 都用它，一次 sqlite_master 查询。 */
async function listTables(env: Env): Promise<Set<string>> {
  const rows = await env.DB.prepare(
    `SELECT name FROM sqlite_master WHERE type = 'table'`,
  ).all<{ name: string }>();
  return new Set((rows.results || []).map((row) => String(row.name)));
}

/** 某一列在不在（表不存在时返回 false）。只给状态接口的体检用，不进 cron 热路径。 */
async function hasColumn(env: Env, table: string, column: string): Promise<boolean> {
  const rows = await env.DB.prepare(
    `SELECT name FROM pragma_table_info('${table}')`,
  ).all<{ name: string }>();
  return (rows.results || []).some((row) => String(row.name) === column);
}

/**
 * 体检：五张表齐不齐 + 多租户升级列在不在。**只在状态接口按需调用，绝不进定时任务**
 * ——cron 是每分钟的热路径，不该为体检多查几次库。
 *
 * 为什么要连"列"一起查：多租户之前建的老库表是齐的，但缺 owner 列，业务查询会直接
 * `no such column` 报错。把"缺列"也计入 schemaReady，卡片现有的「初始化数据表」按钮
 * 就会照常摆出来，而不是让人对着一个"自检全绿、但什么都干不了"的界面。
 */
async function readSchemaState(
  env: Env,
): Promise<{
  schemaReady: boolean;
  missingTables: string[];
  missingColumns: string[];
  tableCount: number;
}> {
  const existing = await listTables(env);
  const missingTables = SCHEMA_TABLES.filter((name) => !existing.has(name));
  const missingColumns: string[] = [];
  for (const { table, column } of SCHEMA_UPGRADE_COLUMNS) {
    if (!existing.has(table)) continue;                       // 表都没建 → 建表时会带列
    if (!(await hasColumn(env, table, column))) missingColumns.push(`${table}.${column}`);
  }
  return {
    schemaReady: missingTables.length === 0 && missingColumns.length === 0,
    missingTables,
    missingColumns,
    tableCount: SCHEMA_TABLES.length - missingTables.length,
  };
}

/**
 * 老库补列：多租户升级列（owner）在表已存在时只能 ALTER 加。
 * 先 pragma 看一眼、缺了才加 → 可重复调用；对新建的库是空操作（CREATE 已带列）。
 *
 * 表名 / 列名 / 列定义全部取自 `SCHEMA_UPGRADE_COLUMNS`（编译期常量，不是用户输入），
 * 所以这里直接拼字符串是安全的；D1 的 prepare 也不接受标识符占位符。
 */
async function ensureUpgradeColumns(env: Env): Promise<string[]> {
  const existing = await listTables(env);
  const upgraded: string[] = [];
  for (const { table, column, definition } of SCHEMA_UPGRADE_COLUMNS) {
    if (!existing.has(table)) continue;
    if (await hasColumn(env, table, column)) continue;
    await env.DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
    upgraded.push(`${table}.${column}`);
  }
  return upgraded;
}

/**
 * POST /wx/init —— 幂等建表 + 老库补列。
 *
 * 存在意义：面板路线装完后端的人，不该被要求去 D1 控制台粘 SQL（粘错一个字就是
 * "功能假死 + 报错看不懂"，而且没人能从 SQL 报错里看出少建了一张表）。
 * 这里逐条跑 CREATE ... IF NOT EXISTS（重复调用无副作用），再补老库缺的列。
 */
async function handleInit(_req: Request, env: Env): Promise<Response> {
  const before = await listTables(env);
  for (const statement of SCHEMA_STATEMENTS) {
    // D1 的 prepare() 一次只能跑一条语句，所以常量是数组而不是一整段 SQL。
    await env.DB.prepare(statement).run();
  }
  // 多租户升级：老库的表建得出来但缺 owner 列，业务查询会 no such column。
  const upgraded = await ensureUpgradeColumns(env);
  const after = await listTables(env);
  const created = SCHEMA_TABLES.filter((name) => !before.has(name) && after.has(name));
  const state = await readSchemaState(env);
  log('init', `建表完成：新建 ${created.length} 张、补列 ${upgraded.length} 个，就绪=${state.schemaReady}`, {
    created,
    upgraded,
  });
  return json({ ok: true, data: { created, upgraded, ...state } });
}

/** 老空间（单租户时代的 'main'）里还有多少东西——只读，用来提示主人「可以认领」。 */
async function readLegacySpace(
  env: Env,
): Promise<{ hasData: boolean; bots: number; packs: number }> {
  const row = await env.DB.prepare(
    `SELECT bots_json FROM wx_config WHERE id = ?1`,
  ).bind(DEFAULT_OWNER).first<{ bots_json: string }>();
  let bots = 0;
  try { bots = (JSON.parse(row?.bots_json || '[]') as unknown[]).length; } catch { bots = 0; }
  const packs = await env.DB.prepare(
    `SELECT count(*) AS n FROM wx_packs WHERE owner = ?1`,
  ).bind(DEFAULT_OWNER).first<{ n: number }>();
  const packCount = packs?.n ?? 0;
  return { hasData: bots > 0 || packCount > 0, bots, packs: packCount };
}

async function handleStatus(
  _req: Request,
  env: Env,
  owner: string,
  anonymous: boolean,
): Promise<Response> {
  // ★ 先体检再查业务表：刚装好还没建表（或缺多租户列）时，下面每一条查询都会抛
  //   "no such table" / "no such column"，整个状态接口 500 —— 那卡片就永远显示不出
  //   "该点初始化了"。所以必须早退，返回一份"空但可读"的状态，让初始化按钮摆得出来。
  const storage = await readSchemaState(env);
  if (!storage.schemaReady) {
    return json({
      ok: true,
      data: {
        version: BRIDGE_VERSION,
        owner,
        anonymous,
        bots: [],
        llmConfigured: false,
        masterKeyConfigured: !!env.MASTER_KEY,
        packs: {},
        todayMessages: 0,
        outbox: { pending: 0, maxSeq: 0 },
        heartbeat: null,
        storage,
      },
    });
  }

  const cfg = await loadConfig(env, owner);
  // ★ 只统计自己名下的包：多租户之前这条没有任何 WHERE，会把别人的一起算进来。
  const packRows = await env.DB.prepare(
    `SELECT char_id, template_ver, chat_built_at, length(pack_json) AS bytes FROM wx_packs WHERE owner = ?1`,
  ).bind(owner).all<{ char_id: string; template_ver: number; chat_built_at: number; bytes: number }>();

  const packs: Record<string, { templateVer: number; chatBuiltAt: number; bytes: number; messages: number }> = {};
  for (const row of packRows.results || []) {
    const full = await loadPack(env, owner, row.char_id);
    const pack = full ? readPack(full.pack_json) : null;
    packs[row.char_id] = {
      templateVer: row.template_ver,
      chatBuiltAt: row.chat_built_at,
      bytes: row.bytes,
      messages: pack?.chat?.messages.length ?? 0,
    };
  }

  const todayStart = new Date().setUTCHours(0, 0, 0, 0);
  const today = await env.DB.prepare(
    `SELECT count(*) AS n FROM wx_messages WHERE owner = ?1 AND created_at >= ?2`,
  ).bind(owner, todayStart).first<{ n: number }>();

  const pending = await env.DB.prepare(
    `SELECT count(*) AS n, coalesce(max(seq), 0) AS maxSeq FROM wx_outbox WHERE owner = ?1`,
  ).bind(owner).first<{ n: number; maxSeq: number }>();

  // 心跳是全局的（cron 与用户无关），所以这一条不带 owner。
  const heartbeat = await env.DB.prepare(
    `SELECT at, note FROM wx_heartbeat WHERE id = 'cron'`,
  ).first<{ at: number; note: string }>();

  // 老空间提示：只在"自己不是默认空间"时查，主人的日常请求不多花两次查询。
  const legacySpace = anonymous ? null : await readLegacySpace(env);

  return json({
    ok: true,
    data: {
      version: BRIDGE_VERSION,
      // 当前身份与它所属的空间（前端拿来显示"这台设备的身份"、判断是否需要认领）。
      owner,
      anonymous,
      // bot 概况（永不返回 token 本体）。
      bots: cfg.bots.map((b) => ({
        botId: b.botId,
        charId: b.charId,
        autoReply: b.autoReply !== false,
        label: b.label,
        baseUrl: b.baseUrl || DEFAULT_ILINK_BASE,
        expired: !!b.expired,
        lastPollAt: b.lastPollAt,
        lastError: b.lastError,
      })),
      llmConfigured: !!cfg.llmEnc,
      masterKeyConfigured: !!env.MASTER_KEY,
      packs,
      todayMessages: today?.n ?? 0,
      outbox: { pending: pending?.n ?? 0, maxSeq: pending?.maxSeq ?? 0 },
      // cron 心跳：at 是最近一次 scheduled 开跑的时刻，note 是 'start' / 'ok:xxms' / 'err:...'。
      // at 不前进 = cron 没触发；note 里带 err = 跑了但出错。
      heartbeat: heartbeat ? { at: heartbeat.at, note: heartbeat.note } : null,
      // 数据表体检：面板路线装完只差这一步，卡片据此决定要不要摆「初始化数据表」按钮。
      storage,
      // 名额：已用与上限。满了新身份会被拒，卡片可以直接说人话而不是报错码。
      owners: { used: await countOwners(env), max: resolveMaxOwners(env) },
      legacySpace,
      firePackKey: `${BRIDGE_VERSION}:${AMSG_FIRE_PACK_KEY}:${amsgStateNamespace('<charId>')}`,
    },
  });
}

/**
 * POST /wx/claim —— 认领老空间（多租户升级用，幂等）。
 *
 * 场景：升级前的数据全在默认空间 'main' 里（那时没有"谁"这个维度）。主人换成
 * "无感身份"之后那些数据就看不见了。与其让他去 D1 控制台跑 SQL，不如给一个按钮：
 * 一次性把 'main' 名下的所有行改挂到当前身份名下。
 *
 * 安全口径：**只允许"自己名下什么都没有"的身份认领**（否则等于把别人的空间合并进来，
 * 语义混乱）。顺序是"先搬数据、最后搬配置"——中途失败时 'main' 的配置还在，
 * 重试仍然走得通；搬完的第二次调用会因为 'main' 已空而返回 0，天然幂等。
 */
async function handleClaim(
  _req: Request,
  env: Env,
  owner: string,
  anonymous: boolean,
): Promise<Response> {
  if (anonymous) {
    return json({
      ok: false,
      error: 'NO_IDENTITY',
      hint: '当前请求没有设备身份，本身就在默认空间里，没有可认领的对象',
    }, 400);
  }
  if (await isKnownOwner(env, owner)) {
    return json({
      ok: false,
      error: 'ALREADY_HAS_SPACE',
      hint: '你已经有一份自己的数据了，不再认领老空间（避免两份混在一起）',
    }, 409);
  }
  const moved: Record<string, number> = { packs: 0, messages: 0, outbox: 0 };
  const tables: Array<[string, string]> = [
    ['wx_packs', 'packs'],
    ['wx_messages', 'messages'],
    ['wx_outbox', 'outbox'],
  ];
  for (const [table, key] of tables) {
    const res = await env.DB.prepare(
      `UPDATE ${table} SET owner = ?1 WHERE owner = ?2`,
    ).bind(owner, DEFAULT_OWNER).run();
    moved[key] = res.meta?.changes ?? 0;
  }
  const cfgMoved = await env.DB.prepare(
    `UPDATE wx_config SET id = ?1 WHERE id = ?2`,
  ).bind(owner, DEFAULT_OWNER).run();
  moved.config = cfgMoved.meta?.changes ?? 0;
  log('claim', '认领老空间完成', { owner, ...moved });
  return json({ ok: true, moved });
}

/* ─────────── 入口 ─────────── */

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (request.method === 'OPTIONS') return corsPreflight();

    if (path === '/' || path === '/health') {
      return json({ ok: true, service: 'wechat-bridge', version: BRIDGE_VERSION });
    }

    // 身份：前端首屏自动生成的随机串，hash 后即 owner；不带头 = 默认空间（老客户端兼容）。
    const { owner, anonymous } = await resolveOwner(request);
    const denied = await ownerGate(request, env, owner, anonymous);
    if (denied) return denied;

    try {
      if (path === '/wx/config' && request.method === 'POST') return await handleConfig(request, env, owner);
      if (path === '/wx/pack' && request.method === 'POST') return await handlePackUpload(request, env, owner);
      if (path === '/wx/outbox' && request.method === 'GET') return await handleOutboxPull(request, env, owner);
      if (path === '/wx/outbox/ack' && request.method === 'POST') return await handleOutboxAck(request, env, owner);
      if (path === '/wx/init' && request.method === 'POST') return await handleInit(request, env);
      if (path === '/wx/status' && request.method === 'GET') return await handleStatus(request, env, owner, anonymous);
      if (path === '/wx/claim' && request.method === 'POST') return await handleClaim(request, env, owner, anonymous);
      if (path === '/wx/bot/qr' && request.method === 'POST') return await handleBotQrStart(request, env);
      if (path === '/wx/bot/qr/status' && request.method === 'GET') return await handleBotQrStatus(request, env, owner);
      if (path === '/wx/bot/bind' && request.method === 'POST') return await handleBotBind(request, env, owner);
      if (path === '/wx/bot/check' && request.method === 'POST') return await handleBotCheck(request, env, owner);
      if (path === '/wx/bot/remove' && request.method === 'POST') return await handleBotRemove(request, env, owner);
      return json({ ok: false, error: 'not found', path }, 404);
    } catch (err) {
      logWarn('route', `${path} 抛错：${err instanceof Error ? err.message : String(err)}`);
      return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
    }
  },

  /** Cron 每分钟一次：逐空间、逐 bot 长轮询收消息并回复。这是微信桥的心跳。 */
  async scheduled(_event: unknown, env: Env): Promise<void> {
    // 心跳写在最前面（任何可能抛错/超时的动作之前）：这样「cron 到底有没有跑」
    // 永远有据可查——曾经出现过 scheduled 静默不干活、又没有任何报错可看的情况。
    const startedAt = Date.now();
    try {
      await writeHeartbeat(env, startedAt, 'start');
      // cron 用 20s 上限：scheduled 调用的墙钟比 HTTP 短，40s 长轮询会被平台掐掉。
      // 空间之间并行（并发跟随人数）——人多时整轮仍是一个长轮询的量级，不超预算。
      const round = await pollAllOwners(env, 20_000);
      await writeHeartbeat(
        env,
        Date.now(),
        `ok:${Date.now() - startedAt}ms spaces:${round.owners} bots:${round.bots}`
          + (round.skipped > 0 ? ` skipped:${round.skipped}` : ''),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logWarn('cron', `轮询轮失败：${message}`);
      await writeHeartbeat(env, Date.now(), `err:${message}`).catch(() => { /* 心跳再失败就只能在平台日志里看 */ });
    }
  },
};
