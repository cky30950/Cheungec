/* ============================================================
 * Google / Firebase 認證模組（Cloudflare Pages Functions）
 * ------------------------------------------------------------
 * 零 npm 依賴，全部使用 Web Crypto：
 *  1. 以 Service Account（Firebase 私密金鑰，存於 Pages Secret）
 *     簽署 RS256 JWT，交換 OAuth2 access token，供 Function 以
 *     Firestore / Realtime Database REST API 讀取資料。
 *  2. 驗證瀏覽器傳入嘅 Firebase Auth ID Token（RS256），
 *     並判斷是否管理員（自訂 claims 或 users/{uid} 之 position）。
 *
 * 需要的環境變數（Pages → Settings → Variables and Secrets）：
 *   FIREBASE_SERVICE_ACCOUNT  Service Account JSON 整串（設為 Secret）
 *   FIREBASE_PROJECT_ID       選填，未提供時取 JSON 內 project_id
 * ============================================================ */

// 注意：Identity Toolkit Admin API（accounts:update / batchCreate 等）
// 的 discovery 文件列了 cloud-platform 與 firebase 兩個 scope，但實測
// firebase scope 調用帳號管理端點會回「insufficient authentication scopes」
// （firebase-admin SDK 預設亦使用 cloud-platform）。
// 亦不存在 identitytoolkit.admin OAuth scope（寫入會換不到 access token）。
// Service Account 本身需具「Firebase 管理員」角色。
const FIREBASE_SCOPES = [
    'https://www.googleapis.com/auth/cloud-platform',
    'https://www.googleapis.com/auth/datastore',
    'https://www.googleapis.com/auth/firebase.database',
    'https://www.googleapis.com/auth/userinfo.email'
].join(' ');

// 注意：必須使用 JWKS 端點而非 x509 PEM 端點——Cloudflare Workers/Pages
// 的 Web Crypto 不支援 importKey('x509')，只支援標準 'jwk' / 'spki'。
const SECURETOKEN_JWKS_URL =
    'https://www.googleapis.com/robot/v1/metadata/jwk/securetoken@system.gserviceaccount.com';

// 模組級 token 快取（同一 isolate 復用）
let cachedAccessToken = null;

// ID Token 公鑰快取（kid -> CryptoKey）
let cachedJwks = null;
let cachedCertsExpiry = 0;

function base64UrlEncode(bytes) {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(
            null,
            bytes.subarray(i, Math.min(i + chunkSize, bytes.length))
        );
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(text) {
    const normalized = String(text).replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

/**
 * 讀取並解析 Service Account 設定。
 */
export function getServiceAccount(env) {
    const raw = env && env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) {
        throw new Error('未設定 FIREBASE_SERVICE_ACCOUNT Secret');
    }
    let parsed;
    try {
        parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (error) {
        throw new Error('FIREBASE_SERVICE_ACCOUNT 不是有效 JSON: ' + error.message);
    }
    if (!parsed.client_email || !parsed.private_key) {
        throw new Error('FIREBASE_SERVICE_ACCOUNT 缺少 client_email / private_key');
    }
    parsed.project_id = parsed.project_id || (env && env.FIREBASE_PROJECT_ID);
    if (!parsed.project_id) {
        throw new Error('無法取得 Firebase projectId，請設定 FIREBASE_PROJECT_ID');
    }
    return parsed;
}

async function importPkcs8Pem(pem) {
    const derBase64 = String(pem)
        .replace(/-----BEGIN [^-]+-----/, '')
        .replace(/-----END [^-]+-----/, '')
        .replace(/\s+/g, '');
    const derBytes = base64UrlDecode(derBase64);
    return crypto.subtle.importKey(
        'pkcs8',
        derBytes,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['sign']
    );
}

async function signJwtRs256(payload, privateKeyPem) {
    const header = { alg: 'RS256', typ: 'JWT' };
    const headerPart = base64UrlEncode(
        new TextEncoder().encode(JSON.stringify(header))
    );
    const payloadPart = base64UrlEncode(
        new TextEncoder().encode(JSON.stringify(payload))
    );
    const signingInput = `${headerPart}.${payloadPart}`;
    const key = await importPkcs8Pem(privateKeyPem);
    const signature = await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        key,
        new TextEncoder().encode(signingInput)
    );
    return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
}

/**
 * 取得可用的 OAuth2 access token（Service Account 身分）。
 * @returns {Promise<{token:string, projectId:string, clientEmail:string}>}
 */
export async function getAccessToken(env) {
    const nowSec = Math.floor(Date.now() / 1000);
    if (cachedAccessToken && cachedAccessToken.expiresAt - 300 > nowSec) {
        return cachedAccessToken;
    }
    const sa = getServiceAccount(env);
    const assertion = await signJwtRs256({
        iss: sa.client_email,
        scope: FIREBASE_SCOPES,
        aud: 'https://oauth2.googleapis.com/token',
        iat: nowSec,
        exp: nowSec + 3600
    }, sa.private_key);

    const body = new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion
    });
    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
    });
    const data = await response.json();
    if (!response.ok || !data.access_token) {
        // 常見原因：scope 名稱無效（invalid_scope）、SA 金鑰過期
        throw new Error(
            '交換 Google access token 失敗 (HTTP ' + response.status + '): '
            + (data.error_description || (typeof data.error === 'string' ? data.error : JSON.stringify(data.error || data)))
        );
    }
    cachedAccessToken = {
        token: data.access_token,
        expiresAt: nowSec + Number(data.expires_in || 3600),
        projectId: sa.project_id,
        clientEmail: sa.client_email
    };
    return cachedAccessToken;
}

async function fetchSecureTokenKeys() {
    const nowMs = Date.now();
    if (cachedJwks && nowMs < cachedCertsExpiry) return cachedJwks;

    const response = await fetch(SECURETOKEN_JWKS_URL);
    if (!response.ok) {
        throw new Error('取得 Firebase ID Token 公鑰失敗: HTTP ' + response.status);
    }
    const jwks = await response.json();
    if (!jwks || !Array.isArray(jwks.keys)) {
        throw new Error('Firebase JWKS 回應格式異常');
    }
    // 預先匯入成 CryptoKey，回應快取時間以 Cache-Control max-age 為準（預設 1 小時）
    const keys = new Map();
    await Promise.all(jwks.keys.map(async (jwk) => {
        keys.set(jwk.kid, await crypto.subtle.importKey(
            'jwk',
            jwk,
            { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
            false,
            ['verify']
        ));
    }));
    const cacheControl = response.headers.get('Cache-Control') || '';
    const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
    const maxAgeSec = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;
    cachedJwks = keys;
    cachedCertsExpiry = nowMs + maxAgeSec * 1000;
    return keys;
}

/**
 * 驗證 Firebase Auth ID Token。
 * @returns {Promise<object>} token claims payload
 */
export async function verifyIdToken(token, projectId) {
    if (!token || typeof token !== 'string') {
        throw new Error('缺少 ID Token');
    }
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('ID Token 格式錯誤');

    const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0])));
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1])));

    const keys = await fetchSecureTokenKeys();
    const publicKey = keys.get(header.kid);
    if (!publicKey) throw new Error('ID Token 使用未知公鑰（kid 不符）');

    const signature = base64UrlDecode(parts[2]);
    const signingInput = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    let valid = false;
    try {
        valid = await crypto.subtle.verify(
            'RSASSA-PKCS1-v1_5',
            publicKey,
            signature,
            signingInput
        );
    } catch (error) {
        throw new Error('ID Token 簽章驗證失敗: ' + error.message);
    }
    if (!valid) throw new Error('ID Token 簽章無效');

    const nowSec = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < nowSec) throw new Error('ID Token 已過期');
    if (payload.iat && payload.iat > nowSec + 300) throw new Error('ID Token 簽發時間異常');
    if (payload.aud !== projectId) throw new Error('ID Token audience 不符');
    if (payload.iss !== `https://securetoken.google.com/${projectId}`) {
        throw new Error('ID Token issuer 不符');
    }
    if (!payload.sub) throw new Error('ID Token 缺少使用者識別');
    return payload;
}

/**
 * 由 Request 取出 Bearer token。
 */
export function extractBearerToken(request) {
    const header = request.headers.get('Authorization') || request.headers.get('authorization') || '';
    const match = header.match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : '';
}

/**
 * 完整管理員驗證：ID Token 有效，且符合以下任一：
 *  - custom claims: admin === true 或 role === 'admin'
 *  - users 文件（經 userAuthIndex／uid／email 解析）之 position === '診所管理'
 *
 * @param {Request} request
 * @param {object} env Pages 環境
 * @param {Function} [getUserDoc] 選注入：(claims) => users 文件資料
 *   （users 文件 ID 為 Firestore 自動 ID，需經 userAuthIndex／uid／email 解析）
 * @returns {Promise<{uid:string, email:string, claims:object, via:string}>}
 */
export async function requireAdmin(request, env, getUserDoc) {
    const token = extractBearerToken(request);
    const sa = getServiceAccount(env);
    const claims = await verifyIdToken(token, sa.project_id);

    const claimRole = claims.role ? String(claims.role).trim().toLowerCase() : '';
    if (claims.admin === true || claimRole === 'admin') {
        return { uid: claims.sub, email: claims.email || '', claims, via: 'claims' };
    }
    if (typeof getUserDoc === 'function') {
        const userDoc = await getUserDoc(claims);
        if (userDoc && userDoc.active === false) {
            const err = new Error('帳號已停用');
            err.status = 403;
            throw err;
        }
        const position = userDoc && userDoc.position ? String(userDoc.position).trim() : '';
        if (position === '診所管理') {
            return { uid: claims.sub, email: claims.email || '', claims, via: 'position' };
        }
    }
    const err = new Error('需要管理員權限');
    err.status = 403;
    throw err;
}
