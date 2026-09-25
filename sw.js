/* ============================================================
 * 名醫診所系統 — Service Worker（根 scope）
 * ------------------------------------------------------------
 * 職責：
 *  - App Shell / 同源靜態資源快取（HTML network-first、其餘 SWR）
 *  - 白名單 CDN 跨域資源 cache-first（100 項上限／30 天）
 *  - 推播通知顯示與點擊開啟系統頁
 *  - 版本化快取；更新時由用戶端訊息觸發 skipWaiting，不強制中斷
 * ============================================================ */

const CACHE_VERSION = 'v1.0.4';
const SHELL_CACHE = 'shell-' + CACHE_VERSION;
const CDN_CACHE = 'cdn-' + CACHE_VERSION;

const PRECACHE_URLS = [
    '/offline',
    '/manifest.webmanifest',
    '/images/icons/icon-192.png'
];

/* 同源後端／平台路徑一律不攔截、不快取 */
const EXCLUDED_PREFIXES = ['/api/', '/_sdk/', '/cdn-cgi/'];

/* 敏感頁面（含醫療資料或一次性權杖）一律不寫入 Cache Storage；
   帶有憑證類 query 參數的網址亦同，避免權杖殘留於共用裝置或被 XSS 讀取 */
const SENSITIVE_DOC_PATHS = new Set([
    '/mobile-capture.html',
    '/mobile-capture',
    '/video/room.html',
    '/video/room',
    '/inquiry.html',
    '/inquiry'
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

    // 分頁回報自身可見／聚焦狀態（focus/blur/visibilitychange/心跳）
    if (msg.type === 'TCM_VIEW_STATE') {
        recordViewState(resolveClientId(event, msg), msg);
        return;
    }

    // push 到達時 SW 主動 ping 可見分頁的應答
    if (msg.type === 'tcm-view-pong') {
        handleViewPong(resolveClientId(event, msg), msg);
        return;
    }

    // 舊版客戶端可能仍送 TCM_CLIENT_OPEN／TCM_CLIENT_CLOSING／TCM_LOGGED_OUT：
    // 現行作法不再於關分頁時退訂（改於推送當下以 clients.matchAll 判斷），
    // 這些訊息明確忽略即可。
});

/* ============================================================
 * 分頁觀看狀態（焦點感知的推送抑制）
 * ------------------------------------------------------------
 * 只靠 visibilityState 會誤判：桌面瀏覽器切到其他 App、視窗被遮住
 * 但沒最小化時，分頁仍是 'visible'，導致訊息推播被不當抑制
 * （Mac 常見「有時候收不到」）。故由客戶端額外回報 document.hasFocus()。
 * SW 重啟後 Map 為空，推送當下對可見但無狀態的分頁發 ping 即時確認。
 * ============================================================ */

// clientId → {visible, focused, ts}
const clientViewStates = new Map();
// 快取逾時：超過此時間未收到回報（含定期心跳）就不採信
const VIEW_FRESH_MS = 90 * 1000;
// 無快取時 ping 等待上限：只在有 visible 分頁時才付出此延遲
const VIEW_PING_WAIT_MS = 800;
// nonce → resolve 回呼
const pendingViewPings = new Map();

function resolveClientId(event, msg) {
    if (msg && msg.clientId) return String(msg.clientId);
    try {
        if (event.source && event.source.id) return String(event.source.id);
    } catch (_e) {}
    return '';
}

function recordViewState(clientId, msg) {
    if (!clientId) return;
    clientViewStates.set(clientId, {
        visible: msg.visible === true,
        focused: msg.focused === true,
        ts: Date.now()
    });
}

function pruneViewStates(aliveIds) {
    for (const id of [...clientViewStates.keys()]) {
        if (!aliveIds.has(id)) clientViewStates.delete(id);
    }
}

function handleViewPong(clientId, msg) {
    const state = {
        visible: msg.visible === true,
        focused: msg.focused === true,
        ts: Date.now()
    };
    if (clientId) clientViewStates.set(clientId, state);
    const resolver = pendingViewPings.get(String(msg.nonce || ''));
    if (resolver) resolver(clientId, state);
}

/* 向可見但缺新狀態的分頁詢問焦點狀態；任一可見且聚焦即回 true */
function pingVisibleClients(targets) {
    return new Promise((resolve) => {
        const nonce = 'vp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
        const waiting = new Set();
        let settled = false;
        const finish = (watching) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            pendingViewPings.delete(nonce);
            resolve(watching);
        };
        const timer = setTimeout(() => finish(false), VIEW_PING_WAIT_MS);
        pendingViewPings.set(nonce, (clientId, state) => {
            if (state.visible && state.focused) {
                finish(true);
                return;
            }
            if (clientId) waiting.delete(clientId);
            if (waiting.size === 0) finish(false);
        });
        for (const c of targets) {
            waiting.add(c.id);
            try {
                c.postMessage({ type: 'tcm-view-ping', nonce });
            } catch (_e) {
                waiting.delete(c.id);
            }
        }
        if (waiting.size === 0) finish(false);
    });
}

/* 使用者是否正聚焦觀看任一同源分頁 */
async function isUserWatching() {
    const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true
    });
    pruneViewStates(new Set(clients.map((c) => c.id)));

    const visibleClients = clients.filter((c) => c.visibilityState === 'visible');
    if (visibleClients.length === 0) return false;

    const now = Date.now();
    const unknown = [];
    for (const c of visibleClients) {
        const state = clientViewStates.get(c.id);
        if (state && now - state.ts <= VIEW_FRESH_MS) {
            if (state.visible && state.focused) return true;
        } else {
            // SW 剛重啟（Map 為空）或心跳已逾時
            unknown.push(c);
        }
    }

    if (unknown.length > 0 && await pingVisibleClients(unknown)) return true;
    return false;
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

/* Cloudflare Pages 會把所有 /xxx.html 以 308 永久重新導向到 clean URL
   （/xxx）。FetchEvent 的導航請求 redirect 模式為 'manual'，若直接
   fetch(event.request)，只會拿到 status 0 的 opaqueredirect 回應：
   把它回給導航會變成 net::ERR_FAILED（手機掃 QR 開拍照頁時的症狀），
   重新包裝 Response 亦同。故這裡以字串 URL 另發 redirect:'follow'
   的同源請求，直接取得最終 200 回應（快取時也只存非 redirected 回應，
   否則同樣會因 manual 導航而觸發 ERR_FAILED）。 */
function fetchDocument(req) {
    return fetch(req.url, {
        redirect: 'follow',
        credentials: 'same-origin'
    });
}

async function handleDocument(req) {
    const cache = await caches.open(SHELL_CACHE);
    try {
        const fresh = await fetchWithTimeout(function () { return fetchDocument(req); }, DOCUMENT_NETWORK_TIMEOUT_MS);
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
        const fallback = await caches.match('/offline');
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
        const res = await fetchDocument(req);
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
        const fallback = await caches.match('/offline');
        if (fallback) return fallback;
        return new Response('您目前離線', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
    }
}

function fetchWithTimeout(fetchFactory, ms) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('network timeout')), ms);
        fetchFactory().then(
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

    // 手動測試通知：跳過去重與觀看抑制，直接顯示，並把「本機實際顯示
    // 結果」回報給分頁——伺服器送達（FCM 2xx）不等於作業系統有顯示，
    // Windows 常見系統通知總開關關閉時，送達正常但完全不會彈。
    if (data.manualTest) {
        await showManualTest(data);
        return;
    }

    // 1) 同機同事件去重：重複訂閱紀錄或多分頁競時觸發時，同一事件只顯示一次
    if (data.dedupKey && isDuplicateOnDevice(String(data.dedupKey))) return;

    // 2) 沒有任何同源分頁（全部關閉、分頁被瀏覽器為省記憶體而丟棄、
    //    或瀏覽器僅背景常駐）：不彈通知。
    //    訂閱保持有效、不做退訂——舊作法在最後分頁 pagehide 後 2 秒即
    //    unsubscribe，但 pagehide(persisted=false) 同樣發生於「慢重整／
    //    分頁被丟棄」，Windows 尤其常見，會造成訂閱實際已毀而後端仍在
    //    派送（FCM 404 清記錄），表現為該機永遠收不到推播。
    const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true
    });
    if (clients.length === 0) return;

    // 3) 有分頁：僅在使用者正「聚焦觀看」系統時抑制；
    //    切到其他 App／其他分頁／視窗最小化時照彈（頁面即時內容未必看得到）
    if (await isUserWatching()) return;

    const title = data.title || '名醫診所系統';
    await self.registration.showNotification(title, buildNotificationOptions(data));
}

/* 顯示測試通知並向所有分頁回報成敗（供測試按鈕區分送達面／顯示面問題） */
async function showManualTest(data) {
    const ack = { type: 'tcm-push-ack', manual: true, ok: false, at: Date.now() };
    try {
        const permission = (typeof Notification !== 'undefined')
            ? Notification.permission
            : 'unsupported';
        if (permission !== 'granted') {
            ack.reason = 'permission:' + permission;
        } else {
            await self.registration.showNotification(
                data.title || '測試通知', buildNotificationOptions(data));
            ack.ok = true;
        }
    } catch (e) {
        ack.reason = ((e && e.name) || 'Error') + ':' + ((e && e.message) || String(e));
    }
    try {
        const all = await self.clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        });
        for (const c of all) {
            try { c.postMessage(ack); } catch (_e) {}
        }
    } catch (_e) {}
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
