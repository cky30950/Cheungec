/* ============================================================
 * Cloudflare R2（S3 相容）AWS SigV4 Query-Presigned URL 工具
 * ------------------------------------------------------------
 * 零 npm 依賴，只使用 Web Crypto（HMAC-SHA256 / SHA-256）。
 * 供病歷附件功能簽發瀏覽器直傳用的 PUT URL：
 *   - service 固定 's3'、region 固定 'auto'（R2 規定）
 *   - payload 使用 UNSIGNED-PAYLOAD（presigned URL 慣例）
 *   - 簽入 host 與 content-type，瀏覽器上傳時必須帶相同
 *     Content-Type，R2 才會以正確型別提供公開讀取
 *
 * R2 S3 endpoint（path-style）：
 *   https://<ACCOUNT_ID>.r2.cloudflarestorage.com/<bucket>/<key>
 * ============================================================ */

const SERVICE = 's3';
const REGION = 'auto';
const ALGORITHM = 'AWS4-HMAC-SHA256';
const UNSIGNED_PAYLOAD = 'UNSIGNED-PAYLOAD';

/**
 * AWS SigV4 專用 RFC3986 編碼：encodeURIComponent 後再補編碼 !'()*
 */
export function awsUriEncode(value) {
    return encodeURIComponent(String(value))
        .replace(/[!'()*]/g, (ch) => '%' + ch.charCodeAt(0).toString(16).toUpperCase());
}

function sha256Hex(text) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
        .then((buf) => hex(new Uint8Array(buf)));
}

async function hmac(keyBytes, message) {
    const key = await crypto.subtle.importKey(
        'raw',
        keyBytes,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
    return new Uint8Array(sig);
}

function hex(bytes) {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * SigV4 簽名金鑰衍生：
 *   kDate    = HMAC("AWS4"+secret, yyyyMMdd)
 *   kRegion  = HMAC(kDate, "auto")
 *   kService = HMAC(kRegion, "s3")
 *   kSigning = HMAC(kService, "aws4_request")
 */
async function deriveSigningKey(secretAccessKey, shortDate) {
    const kDate = await hmac(
        new TextEncoder().encode('AWS4' + secretAccessKey),
        shortDate
    );
    const kRegion = await hmac(kDate, REGION);
    const kService = await hmac(kRegion, SERVICE);
    return hmac(kService, 'aws4_request');
}

function formatAmzDate(date) {
    const p = (n) => String(n).padStart(2, '0');
    return date.getUTCFullYear() +
        p(date.getUTCMonth() + 1) +
        p(date.getUTCDate()) +
        'T' +
        p(date.getUTCHours()) +
        p(date.getUTCMinutes()) +
        p(date.getUTCSeconds()) +
        'Z';
}

/**
 * 產生單一物件的 query-presigned PUT URL。
 *
 * @param {object} p
 * @param {string} p.accountId       Cloudflare Account ID
 * @param {string} p.bucket          R2 bucket 名稱
 * @param {string} p.accessKeyId     R2 S3 Access Key ID
 * @param {string} p.secretAccessKey R2 S3 Secret Access Key
 * @param {string} p.key             物件 key（如 attachments/p123/20260920/uuid/original.jpg）
 * @param {string} p.contentType     上傳時必須使用的 Content-Type（會被簽入 header）
 * @param {number} p.expiresSec      URL 有效秒數
 * @param {Date}   [p.now]           注入簽章時間（測試用）
 * @returns {Promise<{url:string, signedAt:string, expiresAt:string}>}
 */
export async function buildPresignedPutUrl({
    accountId,
    bucket,
    accessKeyId,
    secretAccessKey,
    key,
    contentType,
    expiresSec,
    now = new Date()
}) {
    for (const [name, val] of Object.entries({
        accountId, bucket, accessKeyId, secretAccessKey, key, contentType
    })) {
        if (!val || typeof val !== 'string') {
            throw new Error(`buildPresignedPutUrl 缺少必要參數: ${name}`);
        }
    }
    const ttl = Number.isFinite(Number(expiresSec)) && Number(expiresSec) > 0
        ? Math.floor(Number(expiresSec))
        : 300;

    const host = `${accountId}.r2.cloudflarestorage.com`;
    const amzDate = formatAmzDate(now);
    const shortDate = amzDate.slice(0, 8);
    const credentialScope = `${shortDate}/${REGION}/${SERVICE}/aws4_request`;

    // Canonical URI：逐段編碼並保留 '/'
    const canonicalUri = '/' +
        [bucket, key]
            .map((part) => part.split('/').map(awsUriEncode).join('/'))
            .join('/');

    const queryParams = {
        'X-Amz-Algorithm': ALGORITHM,
        // AWS SDK 對 presigned PUT 的慣例：UNSIGNED-PAYLOAD 必須同時出現在
        // query 參數與 canonical request payload hash，R2 嚴格比對此參數。
        'X-Amz-Content-Sha256': UNSIGNED_PAYLOAD,
        'X-Amz-Credential': `${accessKeyId}/${credentialScope}`,
        'X-Amz-Date': amzDate,
        'X-Amz-Expires': String(ttl),
        'X-Amz-SignedHeaders': 'content-type;host'
    };
    const canonicalQueryString = Object.keys(queryParams)
        .sort()
        .map((k) => `${awsUriEncode(k)}=${awsUriEncode(queryParams[k])}`)
        .join('&');

    // Canonical headers：名稱小寫、值 trim、以換行結尾；順序依名稱排序
    const canonicalHeaders =
        `content-type:${String(contentType).trim()}\n` +
        `host:${host}\n`;

    const canonicalRequest = [
        'PUT',
        canonicalUri,
        canonicalQueryString,
        canonicalHeaders,
        'content-type;host',
        UNSIGNED_PAYLOAD
    ].join('\n');

    const stringToSign = [
        ALGORITHM,
        amzDate,
        credentialScope,
        await sha256Hex(canonicalRequest)
    ].join('\n');

    const signingKey = await deriveSigningKey(secretAccessKey, shortDate);
    const signature = hex(await hmac(signingKey, stringToSign));

    const url =
        `https://${host}${canonicalUri}` +
        `?${canonicalQueryString}&X-Amz-Signature=${signature}`;

    const expiresAt = new Date(now.getTime() + ttl * 1000).toISOString();
    return { url, signedAt: now.toISOString(), expiresAt };
}
