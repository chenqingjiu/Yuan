/**
 * 版本更新检查工具。
 *
 * 部署后每次构建会把当前版本信息写进站点根目录的 version.json
 * （见 scripts/build-metadata.ts 的 pageBuildMetadataPlugin），字段：
 *   { branch, commit, label: "branch@shortCommit", time, buildId }
 *
 * 前端「检查更新」按钮 fetch 这份文件，与当前构建的 BUILD_LABEL 对比，
 * 不一致就说明有新版可更新。
 *
 * 两个必须绕开的缓存（都踩过）：
 *   1. Service Worker 的静态缓存（public/sw-keep-alive.js）。
 *      它把 .json 后缀的构建产物一起收进了 manifest，`cache: 'no-cache'`
 *      的请求照样会被它拦截并返回旧副本 —— 于是「线上明明有新提交，检查更新
 *      却说已是最新」。它的 handle 只放行 `cache: 'no-store'` 和带非 v 查询
 *      参数的请求，所以这里两个都用上。
 *   2. 浏览器 / CDN 的 HTTP 缓存：`no-store` + 时间戳参数足够。
 */

import { BUILD_LABEL } from './buildInfo';

export interface VersionPayload {
  branch: string;
  commit: string;
  label: string;
  time: string;
  buildId?: string;
}

export type UpdateCheckResult =
  | { status: 'up-to-date'; latest: VersionPayload }
  | { status: 'update-available'; latest: VersionPayload }
  | { status: 'error'; message: string };

const VERSION_URL = 'version.json';

/** fetch 线上 version.json，容错为 null（拿不到就当作检查失败，不误报）。 */
export async function fetchVersionPayload(): Promise<VersionPayload | null> {
  try {
    const res = await fetch(`${VERSION_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || typeof data.label !== 'string' || typeof data.commit !== 'string') return null;
    return data as VersionPayload;
  } catch {
    return null;
  }
}

/** 检查是否有新版本。label 不同即视为有新版。 */
export async function checkForUpdate(): Promise<UpdateCheckResult> {
  const latest = await fetchVersionPayload();
  if (!latest) {
    return { status: 'error', message: '无法获取线上版本信息，请检查网络' };
  }
  if (latest.label !== BUILD_LABEL) {
    return { status: 'update-available', latest };
  }
  return { status: 'up-to-date', latest };
}

/**
 * 刷新到最新版。
 *
 * 只 reload 不够：旧的 Service Worker 会继续把缓存的 index.html / 脚本发回来，
 * 刷新十次还是同一个版本。这里先把本站的静态缓存整体删掉（只删 sully-static-*，
 * 不碰聊天记录所在的 IndexedDB），再刷新——下一次导航拿不到缓存，只能走网络，
 * 新 SW 也就有机会装上了。
 */
export async function reloadToLatest(): Promise<void> {
  try {
    if (typeof caches !== 'undefined') {
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name.startsWith('sully-static-')).map((name) => caches.delete(name)),
      );
    }
  } catch {
    /* 存储被禁用 / 清理失败都不阻塞刷新 */
  }
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    await registration?.update();
  } catch {
    /* 没有 SW 或更新失败，普通刷新也能拿到新版本 */
  }
  window.location.reload();
}
