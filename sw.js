/* ============================================================
 * 名醫診所系統 — Service Worker（根 scope）
 * ------------------------------------------------------------
 * 職責：
 *  - App Shell / 同源靜態資源快取（HTML network-first、其餘 SWR）
 *  - 白名單 CDN 跨域資源 cache-first（100 項上限／30 天）
 *  - 推播通知顯示與點擊開啟系統頁
 *  - 版本化快取；更新時由用戶端訊息觸發 skipWaiting，不強制中斷
 * ============================================================ */

const CACHE_VERSION = 'v1.0.0';
const SHELL_CACHE = 'shell-' + CACHE_VERSION;
const CDN_CACHE = 'cdn-' + CACHE_VERSION;

const PRECACHE_URLS = [
    '/offline.html',
    '/manifest.webmanifest',
    '/images/icons/icon-192.png'
];

/* 同源後端／平台路徑一律不攔截、不快取 */
const EXCLUDED_PREFIXES = ['/api/', '/_sdk/', '/cdn-cgi/'];

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

/* 客戶端回報的聊天觀看狀態：clientId → {chatKey, visible} */
const chatViews = new Map();

self.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg === 'SKIP_WAITING' || (msg && msg.type === 'SKIP_WAITING')) {
        self.skipWaiting();
        return;
    }
    if (msg && msg.type === 'tcm-chat-view' && event.source) {
        chatViews.set(event.source.id, {
            chatKey: String(msg.chatKey || ''),
            visible: !!msg.visible
        });
    }
});

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

        if (req.destination === 'document') {
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

    // 收件者正觀看對應畫面時抑制彈窗（頁面已有即時內容/toast）
    if (await shouldSuppressPush(data)) return;

    const title = data.title || '名醫診所系統';
    const options = {
        body: data.body || '',
        icon: '/images/icons/icon-192.png',
        badge: '/images/icons/icon-192.png',
        tag: data.tag || 'tcm-notification',
        data: { url: data.url || '/system.html' }
    };
    await self.registration.showNotification(title, options);
}

/**
 * 抑制規則：
 *  - 掛號類：任一可見 system.html 分頁（頁面 toast 已提示）
 *  - 公開頻道：客戶端回報正可見地觀看公開頻道
 *  - 私聊：客戶端回報正可見地觀看該對話（chatId 比對）
 */
async function shouldSuppressPush(data) {
    const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true
    });

    // 清除已關閉客戶的過期回報
    const aliveIds = new Set(clients.map((c) => c.id));
    for (const id of [...chatViews.keys()]) {
        if (!aliveIds.has(id)) chatViews.delete(id);
    }

    if (data.kind === 'appointment') {
        return clients.some((c) =>
            c.visibilityState === 'visible' && c.url.indexOf('/system.html') !== -1);
    }
    if (data.kind === 'chat') {
        if (data.chatKey === 'public') {
            return [...chatViews.values()]
                .some((v) => v.visible && v.chatKey === 'public');
        }
        if (data.chatKey === 'private') {
            return [...chatViews.values()]
                .some((v) => v.visible && v.chatKey === String(data.chatId || ''));
        }
    }
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
