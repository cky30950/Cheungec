/* ============================================================
 * 名醫診所系統 — Service Worker（根 scope）
 * ------------------------------------------------------------
 * 職責：
 *  - App Shell / 同源靜態資源快取（HTML network-first、其餘 SWR）
 *  - 白名單 CDN 跨域資源 cache-first（100 項上限／30 天）
 *  - 推播通知顯示與點擊開啟系統頁
 *  - 版本化快取；更新時由用戶端訊息觸發 skipWaiting，不強制中斷
 * ============================================================ */

const CACHE_VERSION = 'v1.0.3';
const SHELL_CACHE = 'shell-' + CACHE_VERSION;
const CDN_CACHE = 'cdn-' + CACHE_VERSION;

const PRECACHE_URLS = [
    '/offline.html',
    '/manifest.webmanifest',
    '/images/icons/icon-192.png'
];

/* 同源後端／平台路徑一律不攔截、不快取 */
const EXCLUDED_PREFIXES = ['/api/', '/_sdk/', '/cdn-cgi/'];

/* 敏感頁面（含醫療資料或一次性權杖）一律不寫入 Cache Storage；
   帶有憑證類 query 參數的網址亦同，避免權杖殘留於共用裝置或被 XSS 讀取 */
const SENSITIVE_DOC_PATHS = new Set([
    '/mobile-capture.html',
    '/video/room.html',
    '/inquiry.html'
]);
const SENSITIVE_QUERY_RE = /[?&](?:sid|t|k|apt|channel)=/i;

function isSensitiveDocument(url) {
    return SENSITIVE_DOC_PATHS.has(url.pathname) || SENSITIVE_QUERY_RE.test(url.search);
}

/* 跨域僅快取以下明確白名單主機；其餘跨域直接通過 */
const CDN_HOSTS = new Set([
    'www.gstatic.com',
    'cdn.tailwindcss.com',
    'cdnjs.cloudflare.com',
    'unpkg.com',
    'cdn.jsdelivr.net',
    'fonts.googleapis.com',
    'fonts.gstatic.com'
]);

const CDN_MAX_ENTRIES = 100;
const CDN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const CDN_META_KEY = 'https://__tcm_cdn_meta__/index.json';
const DOCUMENT_NETWORK_TIMEOUT_MS = 3000;

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(SHELL_CACHE);
        await cache.addAll(PRECACHE_URLS);
    })());
    // 不呼叫 skipWaiting：
    // 首次安裝（無舊 SW）瀏覽器會自然完成 activate；
    // 更新時等待客戶端依使用者意願送 SKIP_WAITING，避免中斷診症操作。
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(
            keys
                .filter((k) => k !== SHELL_CACHE && k !== CDN_CACHE)
                .map((k) => caches.delete(k))
        );
        await self.clients.claim();
    })());
});

self.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg === 'SKIP_WAITING' || (msg && msg.type === 'SKIP_WAITING')) {
        self.skipWaiting();
        return;
    }
    if (!msg || typeof msg !== 'object') return;

    // 分頁開啟（含重整後新文件、bfcache 恢復、SW 換代）：取消待执行的退訂計時
    if (msg.type === 'TCM_CLIENT_OPEN' || msg.type === 'TCM_LOGGED_OUT') {
        cancelPendingTeardown();
        return;
    }

    // 某分頁真正關閉：等待短暫過渡期（重整／跨頁導覽），
    // 若同源下已無任何系統分頁，則退訂推播——關頁後不再收到任何廣播。
    if (msg.type === 'TCM_CLIENT_CLOSING') {
        event.waitUntil(schedulePushTeardownWhenNoClients());
    }
});

/* 最後分頁關閉後的推播退訂（瀏覽器端）。
 * 後端訂閱記錄不需在此直連刪除（SW 無有效登入 token）：
 * 退訂後推送服務會對舊端點回 404/410，sender 派送時即自動清除記錄。
 * 重開頁面時 pwa.js 依 pushDeviceEnabled 標記自動恢復訂閱。 */
const CLIENT_GONE_GRACE_MS = 2000;
let pendingTeardown = null;

function cancelPendingTeardown() {
    if (pendingTeardown) {
        pendingTeardown.canceled = true;
        pendingTeardown = null;
    }
}

async function schedulePushTeardownWhenNoClients() {
    // 新的關閉事件取代前一個等待（多分頁依序關閉）
    cancelPendingTeardown();
    const state = { canceled: false };
    pendingTeardown = state;

    // 不用 clearTimeout 取消等待（會讓 waitUntil 的 Promise 懸著）：
    // 一律等完緩衝時間，再以 canceled 旗標與客戶端清單決定是否退訂。
    await new Promise((resolve) => {
        setTimeout(resolve, CLIENT_GONE_GRACE_MS);
    });
    if (state.canceled || pendingTeardown !== state) return;
    pendingTeardown = null;

    // 過渡期後仍有任何同源分頁（含 clinic／inquiry／room）→ 不退訂
    const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true
    });
    if (clients.length > 0) return;

    let sub = null;
    try {
        sub = await self.registration.pushManager.getSubscription();
    } catch (_e) {
        return;
    }
    if (!sub) return;
    try {
        await sub.unsubscribe();
    } catch (_e) {}
}

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    let url;
    try {
        url = new URL(req.url);
    } catch (_e) {
        return;
    }

    if (url.origin === self.location.origin) {
        if (EXCLUDED_PREFIXES.some((p) => url.pathname.startsWith(p))) return;

        // SW 腳本本身絕不可走 SWR 快取：瀏覽器以位元組比對偵測 SW 更新，
        // 若由舊 SW 回傳舊 sw.js，新版永遠不會被安裝（更新提示也就不會出現）。
        if (url.pathname === '/sw.js') return;

        if (req.destination === 'document') {
            if (isSensitiveDocument(url)) {
                event.respondWith(handleSensitiveDocument(req));
                return;
            }
            event.respondWith(handleDocument(req));
            return;
        }
        event.respondWith(handleSameOriginStatic(req));
        return;
    }

    if (CDN_HOSTS.has(url.host)) {
        event.respondWith(handleCdn(req));
    }
});

/* ---------- 導航文件：network-first → 快取 → 離線備援 ---------- */

async function handleDocument(req) {
    const cache = await caches.open(SHELL_CACHE);
    try {
        const fresh = await fetchWithTimeout(req, DOCUMENT_NETWORK_TIMEOUT_MS);
        if (fresh.ok) {
            cache.put(req, fresh.clone());
            return fresh;
        }
        const cachedOnError = await cache.match(req);
        if (cachedOnError) return cachedOnError;
        return fresh;
    } catch (_err) {
        const cached = await cache.match(req);
        if (cached) return cached;
        const fallback = await caches.match('/offline.html');
        if (fallback) return fallback;
        return new Response('您目前離線', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
    }
}

/* ---------- 敏感導航文件：僅走網路，不寫入、不讀取快取 ---------- */

async function handleSensitiveDocument(req) {
    try {
        const res = await fetch(req);
        // 加上 no-store，避免瀏覽器 HTTP 快取與歷史預覽殘留一次性權杖頁
        const headers = new Headers(res.headers);
        headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
        headers.set('Referrer-Policy', 'no-referrer');
        return new Response(res.body, {
            status: res.status,
            statusText: res.statusText,
            headers
        });
    } catch (_err) {
        // 離線時只顯示通用離線頁，絕不回放曾快取的敏感頁
        const fallback = await caches.match('/offline.html');
        if (fallback) return fallback;
        return new Response('您目前離線', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
    }
}

function fetchWithTimeout(req, ms) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('network timeout')), ms);
        fetch(req).then(
            (res) => { clearTimeout(timer); resolve(res); },
            (err) => { clearTimeout(timer); reject(err); }
        );
    });
}

/* ---------- 同源靜態資源：stale-while-revalidate ---------- */

async function handleSameOriginStatic(req) {
    const cache = await caches.open(SHELL_CACHE);
    const cachedPromise = cache.match(req);
    const networkPromise = fetch(req)
        .then((res) => {
            if (res && res.ok) {
                cache.put(req, res.clone());
            }
            return res;
        })
        .catch(() => null);

    const cached = await cachedPromise;
    return cached || networkPromise;
}

/* ---------- 白名單 CDN：cache-first + 天期/數量封頂 ---------- */

async function handleCdn(req) {
    const cache = await caches.open(CDN_CACHE);
    const cached = await cache.match(req);
    if (cached) return cached;

    const res = await fetch(req);
    if (res && (res.ok || res.type === 'opaque')) {
        cache.put(req, res.clone());
        await updateCdnMeta(cache, req.url);
        await trimCdnCache(cache);
    }
    return res;
}

async function readCdnMeta(cache) {
    const raw = await cache.match(CDN_META_KEY);
    if (!raw) return {};
    try {
        return await raw.json();
    } catch (_e) {
        return {};
    }
}

async function writeCdnMeta(cache, meta) {
    await cache.put(
        new Request(CDN_META_KEY),
        new Response(JSON.stringify(meta), {
            headers: { 'Content-Type': 'application/json' }
        })
    );
}

async function updateCdnMeta(cache, url) {
    const meta = await readCdnMeta(cache);
    meta[url] = Date.now();
    await writeCdnMeta(cache, meta);
}

async function trimCdnCache(cache) {
    const meta = await readCdnMeta(cache);
    const now = Date.now();
    let changed = false;

    // 刪除超過天期的項目
    for (const [u, ts] of Object.entries(meta)) {
        if (now - Number(ts) > CDN_MAX_AGE_MS) {
            await cache.delete(new Request(u));
            delete meta[u];
            changed = true;
        }
    }

    // 數量封頂：刪除最舊項目
    const entries = (await cache.keys())
        .filter((r) => r.url !== CDN_META_KEY)
        .map((r) => [r, Number(meta[r.url]) || 0])
        .sort((a, b) => a[1] - b[1]);

    while (entries.length > CDN_MAX_ENTRIES) {
        const [oldest] = entries.shift();
        await cache.delete(oldest);
        delete meta[oldest.url];
        changed = true;
    }

    if (changed) await writeCdnMeta(cache, meta);
}

/* ---------- 推播 ---------- */

/* 本機短時去重：事件鍵 → 收到時間（毫秒） */
const recentPushKeys = new Map();
const PUSH_DEDUP_WINDOW_MS = 120 * 1000;

self.addEventListener('push', (event) => {
    event.waitUntil(handlePush(event));
});

async function handlePush(event) {
    let data = {};
    // 現行規格：推送承載在 event.data（PushMessageData）
    if (event.data) {
        try {
            data = event.data.json();
        } catch (_e) {
            try {
                data = JSON.parse(event.data.text());
            } catch (_e2) {
                data = {};
            }
        }
    } else if (typeof event.json === 'function') {
        // 極舊版瀏覽器相容（2016 年前期草案）
        try { data = event.json(); } catch (_e) { data = {}; }
    }
    if (!data || typeof data !== 'object') data = {};

    // 手動測試通知：跳過去重與觀看抑制，直接顯示
    if (data.manualTest) {
        await self.registration.showNotification(
            data.title || '測試通知', buildNotificationOptions(data));
        return;
    }

    // 1) 同機同事件去重：重複訂閱紀錄或多分頁競時觸發時，同一事件只顯示一次
    if (data.dedupKey && isDuplicateOnDevice(String(data.dedupKey))) return;

    // 2) 網頁正開著觀看時，所有業務推送不彈（頁面已有即時內容/toast/音效）
    if (await isAnyClientVisible()) return;

    const title = data.title || '名醫診所系統';
    await self.registration.showNotification(title, buildNotificationOptions(data));
}

function buildNotificationOptions(data) {
    return {
        body: data.body || '',
        icon: '/images/icons/icon-192.png',
        badge: '/images/icons/icon-192.png',
        tag: data.tag || 'tcm-notification',
        data: { url: data.url || '/system.html' }
    };
}

/* 同一事件鍵在去重時窗內重複出現視為重複；同時清理過期鍵 */
function isDuplicateOnDevice(key) {
    const now = Date.now();
    for (const [k, ts] of recentPushKeys) {
        if (now - ts > PUSH_DEDUP_WINDOW_MS) recentPushKeys.delete(k);
    }
    if (recentPushKeys.has(key)) return true;
    recentPushKeys.set(key, now);
    return false;
}

/* 是否有任何同源分頁處於可見狀態（非最小化、未切到其他 App） */
async function isAnyClientVisible() {
    const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true
    });
    return clients.some((c) => c.visibilityState === 'visible');
}

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const target =
        (event.notification.data && event.notification.data.url) || '/system.html';
    event.waitUntil((async () => {
        const all = await self.clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        });
        for (const client of all) {
            if (client.url.indexOf('/system.html') !== -1) {
                // 舊分頁網址可能沒有 chat query：聚焦並以 postMessage 傳遞目標網址
                try { client.postMessage({ type: 'tcm-deep-link', url: target }); } catch (_e) {}
                if ('focus' in client) return client.focus();
                return;
            }
        }
        return self.clients.openWindow(target);
    })());
});
