/* ============================================================
 * 匿名端點速率限制（共用）
 * ------------------------------------------------------------
 * 用於「無 Firebase 登入」的公開端點，防止以請求量刷 Firestore
 * 讀取帳單或濫用 R2 上傳：
 *   - GET  /api/agora-token/rtc/*（病人憑 X-Room-Session 換發 token）
 *   - POST /api/agora-token/room-session（病人以一次性 pass 換 session）
 *   - POST /api/attachments/capture-presign|status|complete
 *
 * 限流身份：CF-Connecting-IP（由 Cloudflare edge 保證填入，
 * 客戶端無法偽造）；僅非 edge 環境才退回 X-Forwarded-For。
 *
 * 雙後端，依部署綁定自動選擇：
 *  1. Workers 原生 Rate Limiting 綁定（env.ANON_RL）——最準、
 *     無額外延遲；其額度於綁定設定（simple.limit/period）。
 *  2. KV 固定窗口（env.RATE_LIMIT_KV）——Pages Functions 目前
 *     未開放原生限流綁定類型，KV 為現行可用方案，免費方案即可
 *     運作。KV 為最終一致（跨機房最長約 60 秒），語意上屬寬鬆
 *     限流，與原生綁定的 per-location 模型一致，目的在制止濫用
 *     而非精確計數。視窗額度可以環境變數覆寫。
 *
 * 兩者皆未設定／呼叫異常時採 fail-open 並輸出伺服器警告：
 * 不應因限流設定缺失而讓視訊或拍照流程整個中斷；R2 側另有
 * session uploadCount 強制上限作為第二道防線。
 * ============================================================ */

// 各限流桶：key 為 KV／綁定計數鍵前綴；defaultLimit 為每分鐘請求數
export const RL_BUCKETS = {
    // 病人入房換發 RTC token：正常入房 1～2 次，宽限重試與重連
    rtc: { key: 'rtc', defaultLimit: 12, periodSec: 60, envLimit: 'RL_RTC_LIMIT' },
    // 手機代拍三個端點共用同一額度（每張照片約 presign+complete 2 次）
    capture: { key: 'cap', defaultLimit: 40, periodSec: 60, envLimit: 'RL_CAPTURE_LIMIT' },
    // 公開預診頁遞交後觸發新預診推播（人為遞交頻率很低，額度從嚴）
    inquiry: { key: 'inq', defaultLimit: 8, periodSec: 60, envLimit: 'RL_INQUIRY_LIMIT' }
};

const warned = new Set();

function warnOnce(tag, message) {
    if (!warned.has(tag)) {
        warned.add(tag);
        console.warn(`[rate-limit] ${message}`);
    }
}

/** 取得真實客戶端 IP（Cloudflare edge 背後只信任 CF-Connecting-IP） */
export function getClientIp(request) {
    const cf = request.headers.get('CF-Connecting-IP');
    if (cf && cf.trim()) return cf.trim();
    const xff = request.headers.get('X-Forwarded-For');
    if (xff) {
        const first = String(xff).split(',')[0].trim();
        if (first) return first;
    }
    return '';
}

function readLimit(env, bucket) {
    const raw = env && bucket.envLimit ? Number(env[bucket.envLimit]) : NaN;
    if (Number.isFinite(raw) && raw >= 1 && raw <= 600) {
        return Math.floor(raw);
    }
    return bucket.defaultLimit;
}

function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Room-Session',
        'Access-Control-Max-Age': '86400'
    };
}

/**
 * 組 429 回應（含 IETF rateLimit-* 與 Retry-After 標頭）。
 */
function rateLimitedResponse(limit, resetSec, nowSec) {
    return new Response(JSON.stringify({
        error: 'RATE_LIMITED',
        message: '操作過於頻繁，請稍候再試'
    }), {
        status: 429,
        headers: Object.assign({
            'Content-Type': 'application/json; charset=utf-8',
            'Retry-After': String(Math.max(1, resetSec - nowSec)),
            'RateLimit-Limit': String(limit),
            'RateLimit-Remaining': '0',
            'RateLimit-Reset': String(resetSec)
        }, corsHeaders())
    });
}

/**
 * 對匿名請求執行每 IP 每分鐘限流。
 * @param {Request} request
 * @param {object} env Pages 環境
 * @param {'rtc'|'capture'} bucketName RL_BUCKETS 之桶名
 * @returns {Promise<Response|null>} 超額時回傳 429 Response；放行回傳 null
 */
export async function enforceAnonRateLimit(request, env, bucketName) {
    const bucket = RL_BUCKETS[bucketName];
    if (!bucket) return null;

    const nowSec = Math.floor(Date.now() / 1000);
    const period = bucket.periodSec;
    const limit = readLimit(env, bucket);
    const resetSec = (Math.floor(nowSec / period) + 1) * period;
    const ip = getClientIp(request) || 'unknown';
    const keyString = `${bucket.key}:${ip}`;

    // ── 1. Workers 原生 Rate Limiting 綁定（若有設定）──
    const native = env && env.ANON_RL;
    if (native && typeof native.limit === 'function') {
        try {
            const result = await native.limit({ key: keyString });
            if (!result || result.success === false) {
                return rateLimitedResponse(limit, resetSec, nowSec);
            }
            return null;
        } catch (error) {
            warnOnce('native-error', `原生限流綁定呼叫失敗，退回 KV：${error && error.message}`);
        }
    }

    // ── 2. KV 固定窗口 ──
    const kv = env && env.RATE_LIMIT_KV;
    if (!kv || typeof kv.get !== 'function') {
        warnOnce(
            'no-binding',
            '未設定 RATE_LIMIT_KV（或 ANON_RL）綁定，匿名端點目前不限流。'
            + '請於 Pages 專案 Settings → Bindings 加入 KV namespace（RATE_LIMIT_KV）。'
        );
        return null;
    }

    const windowIndex = Math.floor(nowSec / period);
    const kvKey = `rl:${bucket.key}:${windowIndex}:${ip}`;

    try {
        // cacheTtl:0 不讀 edge 快取，盡量取得最新計數
        const raw = await kv.get(kvKey, { cacheTtl: 0 });
        const count = raw ? (parseInt(raw, 10) || 0) : 0;
        if (count >= limit) {
            return rateLimitedResponse(limit, resetSec, nowSec);
        }
        // 並發下各 isolate 可能同時讀到舊值再各自 +1（寬鬆計數，可接受）；
        // expirationTtl 須 ≥ 60 秒，過期窗口自動清除不留垃圾。
        await kv.put(kvKey, String(count + 1), { expirationTtl: period + 30 });
        return null;
    } catch (error) {
        // KV 異常不在請求路徑上放大成 5xx（fail-open）
        warnOnce('kv-error', `KV 限流檢查失敗，本次放行：${error && error.message}`);
        return null;
    }
}
