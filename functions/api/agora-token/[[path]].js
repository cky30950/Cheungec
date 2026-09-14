/* ============================================================
 * Agora RTC Token 伺服器（Cloudflare Pages Function）
 * ------------------------------------------------------------
 * 配合 Agora Web UI Kit 的 tokenUrl 機制，路由格式：
 *   GET /api/agora-token/rtc/<頻道名稱>/publisher/uid/<uid>/
 *   GET /api/agora-token/rtc/<頻道名稱>/subscriber/uid/<uid>/
 * 回應 JSON：{ "rtcToken": "007...." }
 *
 * Cloudflare 環境變數（Pages → 專案 → Settings → Variables）：
 *   AGORA_APP_ID            Agora 專案 App ID（32 碼）
 *   AGORA_APP_CERTIFICATE   Agora 主要憑證（Primary Certificate，32 碼）
 *   AGORA_TOKEN_EXPIRY      Token 有效秒數（選填，預設 3600）
 *   AGORA_CHANNEL_PREFIX    限制可簽發的頻道前綴（選填，例如 tcm-consult-）
 *
 * 免 npm 依賴，使用 Web Crypto（HMAC-SHA256）與 CompressionStream
 *（zlib）按 Agora AccessToken Token007 規格簽發 RTC Token，與官方
 * agora-token v2（RtcTokenBuilder2）輸出相容。
 * ============================================================ */

const TOKEN_VERSION = '007';

// Service type
const SERVICE_RTC = 1;

// ServiceRtc privilege keys
const PRIV_JOIN_CHANNEL = 1;
const PRIV_PUBLISH_AUDIO = 2;
const PRIV_PUBLISH_VIDEO = 3;
const PRIV_PUBLISH_DATA = 4;

const CHANNEL_PATTERN = /^[a-zA-Z0-9!#$%&()+\-:;<=>?@[\]^_ {|}~,]{1,64}$/;
const UID_PATTERN = /^(0|[1-9][0-9]{0,9})$/;

// Little-endian 位元組寫入器
class ByteWriter {
    constructor() {
        this.chunks = [];
    }
    u16(value) {
        const buf = new Uint8Array(2);
        new DataView(buf.buffer).setUint16(0, value & 0xffff, true);
        this.chunks.push(buf);
        return this;
    }
    u32(value) {
        const buf = new Uint8Array(4);
        new DataView(buf.buffer).setUint32(0, value >>> 0, true);
        this.chunks.push(buf);
        return this;
    }
    raw(bytes) {
        this.chunks.push(new Uint8Array(bytes));
        return this;
    }
    str(text) {
        const bytes = new TextEncoder().encode(String(text));
        this.u16(bytes.length);
        this.raw(bytes);
        return this;
    }
    build() {
        let total = 0;
        for (const chunk of this.chunks) total += chunk.length;
        const out = new Uint8Array(total);
        let offset = 0;
        for (const chunk of this.chunks) {
            out.set(chunk, offset);
            offset += chunk.length;
        }
        return out;
    }
}

async function hmacSha256(keyBytes, messageBytes) {
    const key = await crypto.subtle.importKey(
        'raw',
        keyBytes,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, messageBytes);
    return new Uint8Array(signature);
}

// Token007 簽名金鑰衍生：
//   k1 = HMAC(key=LE32(issueTs), msg=AppCertificate)
//   signKey = HMAC(key=LE32(salt), msg=k1)
async function deriveSigningKey(appCertificateBytes, issueTs, salt) {
    const tsBytes = new ByteWriter().u32(issueTs).build();
    const k1 = await hmacSha256(tsBytes, appCertificateBytes);
    const saltBytes = new ByteWriter().u32(salt).build();
    return hmacSha256(saltBytes, k1);
}

// CompressionStream('deflate') 輸出即為 zlib（RFC 1950）格式
async function zlibCompress(bytes) {
    const compressed = new Blob([bytes])
        .stream()
        .pipeThrough(new CompressionStream('deflate'));
    const buffer = await new Response(compressed).arrayBuffer();
    return new Uint8Array(buffer);
}

function toBase64(bytes) {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(
            null,
            bytes.subarray(i, Math.min(i + chunkSize, bytes.length))
        );
    }
    return btoa(binary);
}

/**
 * 依 Agora AccessToken Token007 規格簽發 RTC Token（可指定 issueTs/salt 以便測試）。
 * @param {string} role 'publisher'（可收發；醫師／病人）或 'subscriber'（只可加入）
 * @returns {Promise<string>} "007" + base64(zlib 壓縮內容)
 */
export async function buildRtcTokenDeterministic(appId, appCertificate, channelName, uid, expirySeconds, role, issueTs, salt) {
    const expire = Math.max(60, Number(expirySeconds) || 3600);
    const certBytes = new TextEncoder().encode(appCertificate);

    // uid 0 在 Token 中以空字串表示（任何 uid 皆可使用此 Token）
    const uidNum = Number(uid) >>> 0;
    const uidStr = uidNum === 0 ? '' : String(uidNum);
    const isPublisher = role !== 'subscriber';

    // ── ServiceRtc ──
    const service = new ByteWriter();
    service.u16(SERVICE_RTC);
    // privileges 必須按 key 由小到大排序
    service.u16(isPublisher ? 4 : 1);
    service.u16(PRIV_JOIN_CHANNEL);
    service.u32(expire);
    if (isPublisher) {
        service.u16(PRIV_PUBLISH_AUDIO);
        service.u32(expire);
        service.u16(PRIV_PUBLISH_VIDEO);
        service.u32(expire);
        service.u16(PRIV_PUBLISH_DATA);
        service.u32(expire);
    }
    service.str(channelName);
    service.str(uidStr);
    const serviceBytes = service.build();

    // ── Signing info ──
    const info = new ByteWriter();
    info.str(appId);
    info.u32(issueTs);
    info.u32(expire);
    info.u32(salt);
    info.u16(1); // 服務數量
    info.raw(serviceBytes);
    const signingInfo = info.build();

    // ── 簽名：HMAC(key=衍生金鑰, msg=signing info) ──
    const signKey = await deriveSigningKey(certBytes, issueTs, salt);
    const signature = await hmacSha256(signKey, signingInfo);

    // ── 內容 = 長度前綴簽名 + signing info，zlib 壓縮後加版本前綴 ──
    const content = new ByteWriter();
    content.raw(new ByteWriter().u16(signature.length).build());
    content.raw(signature);
    content.raw(signingInfo);

    const compressed = await zlibCompress(content.build());
    return TOKEN_VERSION + toBase64(compressed);
}

export async function buildRtcToken(appId, appCertificate, channelName, uid, expirySeconds, role) {
    const issueTs = Math.floor(Date.now() / 1000);
    // salt 範圍 1～99,999,999（與官方 Builder 一致）
    const salt = 1 + (crypto.getRandomValues(new Uint32Array(1))[0] % 99999999);
    return buildRtcTokenDeterministic(
        appId, appCertificate, channelName, uid, expirySeconds, role, issueTs, salt
    );
}

function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Max-Age': '86400'
    };
}

function jsonResponse(data, status) {
    return new Response(JSON.stringify(data), {
        status: status || 200,
        headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, corsHeaders())
    });
}

export function onRequestOptions() {
    return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function onRequestGet(context) {
    const { env, params } = context;

    const appId = env && env.AGORA_APP_ID;
    const appCertificate = env && env.AGORA_APP_CERTIFICATE;
    const expirySeconds = env && env.AGORA_TOKEN_EXPIRY ? Number(env.AGORA_TOKEN_EXPIRY) : 3600;
    const allowedPrefix = env && env.AGORA_CHANNEL_PREFIX ? String(env.AGORA_CHANNEL_PREFIX) : '';

    if (!appId || !appCertificate) {
        return jsonResponse({
            error: 'SERVER_NOT_CONFIGURED',
            message: '請在 Cloudflare Pages 設定 AGORA_APP_ID 與 AGORA_APP_CERTIFICATE 環境變數。'
        }, 500);
    }

    // UIKit 請求路徑：rtc/<channel>/<role>/uid/<uid>
    const segments = ((params && params.path) || [])
        .map((s) => decodeURIComponent(String(s)))
        .filter(Boolean);

    if (segments.length < 5 ||
        segments[0] !== 'rtc' ||
        !['publisher', 'subscriber'].includes(segments[2]) ||
        segments[3] !== 'uid') {
        return jsonResponse({
            error: 'BAD_PATH',
            message: '路徑格式應為 /rtc/<頻道>/publisher/uid/<uid>/'
        }, 400);
    }

    const channelName = segments[1];
    const role = segments[2];
    const uid = segments[4];

    if (!CHANNEL_PATTERN.test(channelName)) {
        return jsonResponse({ error: 'BAD_CHANNEL' }, 400);
    }
    if (allowedPrefix && !channelName.startsWith(allowedPrefix)) {
        return jsonResponse({ error: 'CHANNEL_NOT_ALLOWED' }, 403);
    }
    if (!UID_PATTERN.test(uid)) {
        return jsonResponse({ error: 'BAD_UID' }, 400);
    }

    try {
        const rtcToken = await buildRtcToken(
            appId,
            appCertificate,
            channelName,
            uid,
            expirySeconds,
            role
        );
        return jsonResponse({
            rtcToken: rtcToken,
            appId: appId,
            channel: channelName,
            uid: Number(uid) || 0
        });
    } catch (error) {
        console.error('簽發 Agora Token 失敗:', error);
        return jsonResponse({
            error: 'TOKEN_BUILD_FAILED',
            message: String((error && error.message) || error)
        }, 500);
    }
}
