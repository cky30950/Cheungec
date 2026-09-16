/* ============================================================
 * FCM HTTP V1 推播閘道（Cloudflare Pages Function，零 npm 依賴）
 * ------------------------------------------------------------
 * 路由：
 *   POST /api/fcm/notify
 *     鑑權：Authorization: Bearer <Firebase ID token>（診所職員）
 *     Body: {
 *       targets: { uids: string[] } 或 { allStaff: true, exceptUids: string[] },
 *       title: string, body: string,
 *       data: { event, eventId?, url?, ... }   // 值皆字串
 *     }
 *
 *   POST /api/fcm/notify-video
 *     鑑權：無（病人端未登入）。伺服器自行驗證：
 *       1) 頻道名稱合法  2) 同意書 videoConsents 已存在且在 10 分鐘內
 *       3) 醫師尚未在診間（避免醫師已等待時還推播）
 *       4) 同一頻道 60 秒內只推一次
 *     Body: { channel: string }
 *
 * 環境變數（Cloudflare Pages → Settings → Variables）：
 *   FCM_PROJECT_ID       Firebase 專案 ID
 *   FCM_CLIENT_EMAIL     Service Account client_email
 *   FCM_PRIVATE_KEY      Service Account private_key（保留換行）
 *   FCM_RTDB_URL         （選填）RTDB 根網址
 *
 * OAuth2：以 Service Account 私鑰用 Web Crypto 簽 RS256 JWT，
 * 向 Google 換取存取權杖（快取至過期前 5 分鐘），scope 涵蓋
 * FCM 發送、Firestore、Realtime Database。
 * ============================================================ */

const TOKENS_COLLECTION = 'fcmPushTokens';
const AUTH_INDEX_COLLECTION = 'userAuthIndex';
const CHANNEL_PREFIX = 'tcm-consult-';
const CHANNEL_PATTERN = /^tcm-consult-[A-Za-z0-9!#$%&()+\-:;<=>?@[\]^_{|}~,]{1,52}$/;
const UID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

const OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/firebase.messaging',
  'https://www.googleapis.com/auth/datastore',
  'https://www.googleapis.com/auth/firebase.database',
  'https://www.googleapis.com/auth/userinfo.email'
].join(' ');

// ──────────────────────────── HTTP 基礎 ────────────────────────────

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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

export async function onRequestPost(context) {
  try {
    const action = Array.isArray(context.params.action)
      ? context.params.action[0] : context.params.action;

    if (action === 'notify') return await handleStaffNotify(context);
    if (action === 'notify-video') return await handleVideoNotify(context);
    return jsonResponse({ ok: false, error: 'UNKNOWN_ACTION' }, 404);
  } catch (err) {
    console.error('[FCM] 未預期錯誤:', err);
    const code = String((err && (err.code || err.message)) || 'INTERNAL_ERROR');
    const response = {
      ok: false,
      error: code,
      message: code.startsWith('PRIVATE_KEY')
        ? 'Cloudflare 環境變數 FCM_PRIVATE_KEY 格式不正確，請刪除後重新貼上（含 BEGIN/END 標記的完整內容）。'
        : String((err && err.message) || err)
    };
    // 金鑰診斷資訊不含私鑰內容，可安全回傳
    if (err && err.detail) response.detail = err.detail;
    return jsonResponse(response, 500);
  }
}

// ──────────────────────────── 請求解析 ────────────────────────────

function requireConfig(env) {
  const projectId = env && env.FCM_PROJECT_ID;
  const clientEmail = env && env.FCM_CLIENT_EMAIL;
  const privateKey = env && env.FCM_PRIVATE_KEY;
  if (!projectId || !clientEmail || !privateKey) {
    return {
      error: jsonResponse({
        ok: false,
        error: 'SERVER_NOT_CONFIGURED',
        message: '請在 Cloudflare Pages 設定 FCM_PROJECT_ID、FCM_CLIENT_EMAIL、FCM_PRIVATE_KEY'
      }, 500)
    };
  }
  return {
    projectId,
    clientEmail,
    privateKey,
    rtdbUrl: env.FCM_RTDB_URL ||
      `https://${projectId}-default-rtdb.asia-southeast1.firebasedatabase.app`
  };
}

async function readJsonBody(request) {
  let body = null;
  try {
    body = await request.json();
  } catch (_e) {
    return { error: jsonResponse({ ok: false, error: 'BAD_JSON' }, 400) };
  }
  if (!body || typeof body !== 'object') {
    return { error: jsonResponse({ ok: false, error: 'BAD_BODY' }, 400) };
  }
  return { body };
}

function capText(value, max, fallback) {
  const s = String(value == null ? '' : value).trim();
  if (!s) return fallback || '';
  return s.length > max ? s.slice(0, max) : s;
}

function sanitizeData(input) {
  const out = {};
  if (!input || typeof input !== 'object') return out;
  for (const key of Object.keys(input).slice(0, 20)) {
    if (!/^[a-zA-Z0-9_.~-]{1,40}$/.test(key)) continue;
    const v = input[key];
    if (v === undefined || v === null) continue;
    out[key] = String(v).slice(0, 1000);
  }
  return out;
}

// ──────────────────────── OAuth2：JWT 簽章換 token ─────────────────

function base64url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// 將 Cloudflare 環境變數中的私鑰字串正規化為標準 PEM。
// 常見貼入變形：含字面 \n、首尾被 JSON 引號包住、誤貼整個
// "private_key": "..." 欄位、CRLF、BOM／零寬字元、換行被壓成空白。
function normalizePrivateKey(raw) {
  let key = String(raw == null ? '' : raw);

  // 誤貼整個 JSON 欄位：擷取引號內的值
  const fieldMatch = key.match(/"?(?:private_key|privateKey)"?\s*:\s*"([\s\S]+?)"\s*,?\s*$/);
  if (fieldMatch) key = fieldMatch[1];

  // 去除 BOM 與首尾空白
  key = key.replace(/^\uFEFF/, '').trim();

  // 去除成對首尾引號（單引號或雙引號）
  if (key.length >= 2 &&
      ((key.startsWith('"') && key.endsWith('"')) ||
       (key.startsWith("'") && key.endsWith("'")))) {
    key = key.slice(1, -1);
  }

  // 字面 \r\n / \n / \r → 真實換行，再統一所有換行格式
  key = key
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  return key.trim();
}

function privateKeyDiagnostics(key) {
  return {
    hasBegin: /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(key),
    hasEnd: /-----END [A-Z ]*PRIVATE KEY-----/.test(key),
    bodyLength: key
      .replace(/-----[A-Z ]*PRIVATE KEY-----/g, '')
      .replace(/\s+/g, '').length
  };
}

function pemToPkcs8(pem) {
  const normalized = normalizePrivateKey(pem);
  const diag = privateKeyDiagnostics(normalized);

  // 取出 base64 本體：移除 PEM 標記、所有空白與不可見字元（BOM、NBSP、零寬）
  let base64 = normalized
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----/g, '')
    .replace(/-----END [A-Z ]*PRIVATE KEY-----/g, '')
    .replace(/[\s\u00A0\u200B-\u200F\u202A-\u202E\uFEFF]/g, '');

  // 萬一貼入的是 base64url，轉回標準 base64 並補齊 padding
  base64 = base64.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) base64 += '=';

  if (!diag.hasBegin || !diag.hasEnd ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || base64.length < 100) {
    const err = new Error('PRIVATE_KEY_FORMAT_INVALID');
    err.code = 'PRIVATE_KEY_FORMAT_INVALID';
    // 只回傳非敏感的診斷資訊（不含金鑰內容）
    err.detail = diag;
    throw err;
  }

  let binary;
  try {
    binary = atob(base64);
  } catch (_e) {
    const err = new Error('PRIVATE_KEY_BASE64_DECODE_FAILED');
    err.code = 'PRIVATE_KEY_BASE64_DECODE_FAILED';
    err.detail = diag;
    throw err;
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function signJwtRs256(privateKeyPem, signingInput) {
  const keyData = pemToPkcs8(privateKeyPem);
  let key;
  try {
    key = await crypto.subtle.importKey(
      'pkcs8',
      keyData,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign']
    );
  } catch (e) {
    // DER 解析失敗：常見於金鑰內容被截斷、貼成非 service account 的金鑰
    const err = new Error('PRIVATE_KEY_IMPORT_FAILED');
    err.code = 'PRIVATE_KEY_IMPORT_FAILED';
    err.detail = Object.assign(
      { reason: String((e && e.message) || e).slice(0, 120) },
      privateKeyDiagnostics(normalizePrivateKey(privateKeyPem))
    );
    throw err;
  }
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput)
  );
  return base64url(new Uint8Array(sig));
}

async function getGoogleAccessToken(cfg) {
  const store = globalThis.__fcmOAuthStore || (globalThis.__fcmOAuthStore = {});
  const cached = store[cfg.projectId];
  if (cached && cached.expiresAt > Date.now() + 300000) return cached.accessToken;

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claims = base64url(new TextEncoder().encode(JSON.stringify({
    iss: cfg.clientEmail,
    scope: OAUTH_SCOPES,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  })));
  const signingInput = `${header}.${claims}`;
  const signature = await signJwtRs256(cfg.privateKey, signingInput);
  const assertion = `${signingInput}.${signature}`;

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=' + encodeURIComponent(assertion)
  });
  const json = await resp.json();
  if (!resp.ok || !json.access_token) {
    throw new Error('OAUTH_FAILED: ' + (json.error_description || json.error || resp.status));
  }
  store[cfg.projectId] = {
    accessToken: json.access_token,
    expiresAt: Date.now() + (Number(json.expires_in) || 3600) * 1000
  };
  return json.access_token;
}

// ─────────────────── Firebase ID token 驗證（職員） ─────────────────

// 非敏感的 token 形狀診斷（不含內容，只看結構）
function idTokenShape(idToken) {
  const parts = String(idToken).split('.');
  let alg = null;
  try {
    const headerJson = JSON.parse(decodeBase64Url(parts[0]));
    alg = headerJson.alg || null;
  } catch (_e) { /* header 無法解析時保持 null */ }
  return {
    length: String(idToken).length,
    segments: parts.length,
    alg,
    hasWhitespace: /\s/.test(String(idToken))
  };
}

function decodeBase64Url(s) {
  const m = String(s).replace(/-/g, '+').replace(/_/g, '/');
  const padded = m + '='.repeat((4 - (m.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// ────── Firebase ID token 本機驗證（JWKS + RS256，Google 官方建議做法）──────
// 注意：www.googleapis.com/oauth2/v3/tokeninfo 對 securetoken.google.com
// 簽發的 Firebase Auth token 會回 400 Invalid Value，不能用於驗證；
// 官方文件要求後端自行以 Google 公開金鑰驗 RS256 簽章。

const SECURETOKEN_JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

function jwksStore() {
  return globalThis.__fcmJwksStore ||
    (globalThis.__fcmJwksStore = { keys: null, expiresAt: 0, inflight: null });
}

// 抓取（並快取）Google securetoken 公鑰集，遵守 Cache-Control max-age
async function fetchSecureTokenKeys(forceRefresh) {
  const store = jwksStore();
  const now = Date.now();
  if (!forceRefresh && store.keys && store.expiresAt > now) return store.keys;
  if (store.inflight) return store.inflight;

  store.inflight = (async () => {
    const resp = await fetch(SECURETOKEN_JWKS_URL);
    if (!resp.ok) throw new Error('JWKS_FETCH_FAILED(' + resp.status + ')');
    const data = await resp.json();
    const keys = new Map();
    await Promise.all((data.keys || []).map(async (jwk) => {
      if (jwk.kty !== 'RSA' || !jwk.kid) return;
      try {
        const key = await crypto.subtle.importKey(
          'jwk', jwk,
          { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
          false, ['verify']
        );
        keys.set(jwk.kid, key);
      } catch (_e) { /* 略過無法匯入的金鑰 */ }
    }));
    if (keys.size === 0) throw new Error('JWKS_NO_USABLE_KEYS');
    const cc = resp.headers.get('cache-control') || '';
    const maxAge = parseInt((cc.match(/max-age=(\d+)/) || [])[1], 10);
    store.keys = keys;
    store.expiresAt = now + (maxAge > 0 ? maxAge : 21600) * 1000;
    return keys;
  })();

  try {
    return await store.inflight;
  } finally {
    store.inflight = null;
  }
}

function base64UrlToBytes(s) {
  const m = String(s).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(m + '='.repeat((4 - (m.length % 4)) % 4));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// 以 header.kid 對應公鑰驗 RS256；遇到未知 kid（金鑰輪轉）會強制刷新重試一次
async function verifyTokenSignature(idToken, header) {
  const parts = idToken.split('.');
  const data = new TextEncoder().encode(parts[0] + '.' + parts[1]);
  let signature;
  try {
    signature = base64UrlToBytes(parts[2]);
  } catch (_e) {
    return { ok: false, reason: 'malformed-signature' };
  }

  let keys = await fetchSecureTokenKeys(false);
  let key = keys.get(header.kid);
  if (!key) {
    keys = await fetchSecureTokenKeys(true);
    key = keys.get(header.kid);
    if (!key) {
      return { ok: false, reason: 'unknown-kid', knownKids: Array.from(keys.keys()).slice(0, 8) };
    }
  }
  try {
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, data);
    return valid
      ? { ok: true }
      : { ok: false, reason: 'signature-mismatch' };
  } catch (_e) {
    return { ok: false, reason: 'verify-error' };
  }
}

async function verifyStaffIdToken(accessToken, projectId, idToken) {
  if (!idToken) return { error: jsonResponse({ ok: false, error: 'NO_ID_TOKEN' }, 401) };

  const shape = idTokenShape(idToken);
  // Firebase ID token 是三段 RS256 JWT，長度通常 700～1300
  if (shape.segments !== 3 || shape.alg !== 'RS256' || shape.length < 200 || shape.hasWhitespace) {
    return { error: jsonResponse({ ok: false, error: 'ID_TOKEN_MALFORMED', detail: shape }, 401) };
  }

  let header;
  let payload;
  try {
    const parts = idToken.split('.');
    header = JSON.parse(decodeBase64Url(parts[0]));
    payload = JSON.parse(decodeBase64Url(parts[1]));
  } catch (_e) {
    return { error: jsonResponse({
      ok: false,
      error: 'ID_TOKEN_MALFORMED',
      detail: Object.assign({}, shape, { reason: 'payload-unparseable' })
    }, 401) };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const expectedIss = 'https://securetoken.google.com/' + projectId;
  const ttlSeconds = typeof payload.exp === 'number' ? payload.exp - nowSec : null;

  if (payload.iss !== expectedIss || payload.aud !== projectId) {
    return { error: jsonResponse({
      ok: false,
      error: 'ID_TOKEN_WRONG_TYPE_OR_PROJECT',
      message: '送達的不是本專案簽發的 Firebase ID token（可能誤用了 Custom Token 或來自其他專案）。',
      detail: {
        iss: payload.iss ?? null, aud: payload.aud ?? null,
        expectedIss, expectedAud: projectId
      }
    }, 401) };
  }
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    return { error: jsonResponse({
      ok: false, error: 'ID_TOKEN_MALFORMED', detail: { reason: 'missing-sub' }
    }, 401) };
  }
  if (typeof payload.exp !== 'number' || ttlSeconds <= 0) {
    return { error: jsonResponse({
      ok: false,
      error: 'ID_TOKEN_EXPIRED',
      message: 'ID token 已過期（若剛核發就過期，檢查用戶端裝置時間）。',
      detail: { ttlSeconds }
    }, 401) };
  }
  // 容許用戶端與伺服器 60 秒時鐘誤差
  if (typeof payload.iat === 'number' && payload.iat > nowSec + 60) {
    return { error: jsonResponse({
      ok: false,
      error: 'ID_TOKEN_NOT_YET_VALID',
      detail: { skewSeconds: payload.iat - nowSec }
    }, 401) };
  }

  const sig = await verifyTokenSignature(idToken, header);
  if (!sig.ok) {
    return { error: jsonResponse({
      ok: false,
      error: 'ID_TOKEN_INVALID',
      message: sig.reason === 'unknown-kid'
        ? '簽章金鑰不在 Google 公鑰集（token 可能來自 Auth 模擬器或其他環境）。'
        : 'ID token 簽章驗證失敗。',
      detail: {
        reason: sig.reason,
        kid: header.kid || null,
        knownKids: sig.knownKids
      }
    }, 401) };
  }

  // 簽章有效：確認此 uid 在 userAuthIndex 中，且關聯的 users 紀錄未停用
  const indexPath = `${AUTH_INDEX_COLLECTION}/${encodeURIComponent(payload.sub)}`;
  const indexDoc = await fsGet(accessToken, projectId, indexPath);
  if (!indexDoc) {
    return { error: jsonResponse({ ok: false, error: 'USER_NOT_AUTHORIZED' }, 403) };
  }
  const linkedUserId = fieldVal(indexDoc, 'userId');
  if (linkedUserId) {
    const userDoc = await fsGet(accessToken, projectId, `users/${encodeURIComponent(linkedUserId)}`);
    if (userDoc && fieldVal(userDoc, 'active') === false) {
      return { error: jsonResponse({ ok: false, error: 'USER_DISABLED' }, 403) };
    }
  }
  return { uid: payload.sub };
}

// ──────────────────────── Firestore REST 輔助 ──────────────────────

function fsBase(projectId) {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
}

async function fsGet(accessToken, projectId, path) {
  const resp = await fetch(`${fsBase(projectId)}/${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error(`FS_GET_FAILED(${resp.status}): ${path}`);
  return resp.json();
}

async function fsDelete(accessToken, projectId, path) {
  await fetch(`${fsBase(projectId)}/${path}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` }
  }).catch(() => {});
}

function encodeValue(value) {
  if (typeof value === 'boolean') return { booleanValue: value };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(encodeValue) } };
  }
  return { stringValue: String(value) };
}

// filters: [{ field, op:'EQUAL'|'IN', value }]
async function fsQuery(accessToken, projectId, collectionId, filters, limit) {
  const where = filters.length === 0 ? undefined
    : filters.length === 1
      ? {
          fieldFilter: {
            field: { fieldPath: filters[0].field },
            op: filters[0].op,
            value: encodeValue(filters[0].value)
          }
        }
      : {
          compositeFilter: {
            op: 'AND',
            filters: filters.map((f) => ({
              fieldFilter: {
                field: { fieldPath: f.field },
                op: f.op,
                value: encodeValue(f.value)
              }
            }))
          }
        };

  const resp = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId }],
          where,
          limit: limit || 100
        }
      })
    }
  );
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`FS_QUERY_FAILED(${resp.status}): ${text.slice(0, 300)}`);
  }
  const rows = await resp.json();
  const docs = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (row && row.document) docs.push(row.document);
  }
  return docs;
}

// 取頂層欄位字串／布林值
function fieldVal(doc, key) {
  const f = doc && doc.fields && doc.fields[key];
  if (!f) return undefined;
  if ('stringValue' in f) return f.stringValue;
  if ('booleanValue' in f) return f.booleanValue;
  if ('integerValue' in f) return Number(f.integerValue);
  if ('timestampValue' in f) return f.timestampValue;
  return undefined;
}

function docIdOf(doc) {
  const parts = String(doc.name || '').split('/');
  return parts[parts.length - 1];
}

function tsMillis(timestampValue) {
  if (!timestampValue) return null;
  const t = Date.parse(timestampValue);
  return isNaN(t) ? null : t;
}

// ────────────────────────── Token 收集 ────────────────────────────

async function tokensForUids(accessToken, projectId, uids) {
  const validUids = uids.filter((u) => UID_PATTERN.test(u));
  const docs = [];
  // IN 條件上限 30，保守以 25 分批
  for (let i = 0; i < validUids.length; i += 25) {
    const chunk = validUids.slice(i, i + 25);
    const rows = await fsQuery(accessToken, projectId, TOKENS_COLLECTION, [
      { field: 'uid', op: 'IN', value: chunk }
    ], 200);
    docs.push(...rows);
  }
  return dedupeTokens(docs);
}

async function allStaffTokens(accessToken, projectId, exceptUids) {
  const docs = await fsQuery(accessToken, projectId, TOKENS_COLLECTION, [], 300);
  const except = new Set(exceptUids);
  return dedupeTokens(docs).filter((entry) => !except.has(entry.uid));
}

function dedupeTokens(docs) {
  const map = new Map();
  for (const doc of docs) {
    const token = docIdOf(doc);
    const uid = fieldVal(doc, 'uid') || '';
    if (token && uid && !map.has(token)) map.set(token, { token, uid });
  }
  return Array.from(map.values());
}

// ────────────────────────── FCM V1 發送 ───────────────────────────

function buildOrigin(request) {
  const origin = request.headers.get('origin') || '';
  if (/^https:\/\/[^\s/]+$/.test(origin)) return origin.replace(/\/$/, '');
  const referer = request.headers.get('referer') || '';
  try {
    const u = new URL(referer);
    if (u.protocol === 'https:') return u.origin;
  } catch (_e) {}
  return '';
}

async function sendOne(accessToken, projectId, entry, title, body, data, origin) {
  const link = data.url || (origin ? `${origin}/system.html` : '/system.html');
  const message = {
    token: entry.token,
    notification: { title, body },
    data: data,
    webpush: {
      headers: { Urgency: 'high', TTL: '3600' },
      notification: {
        icon: origin ? `${origin}/images/myLogo.png` : undefined,
        badge: origin ? `${origin}/images/myLogo.png` : undefined
      },
      fcm_options: { link }
    },
    android: { priority: 'HIGH', ttl: '3600s' }
  };
  // 移除 undefined
  if (!message.webpush.notification.icon) delete message.webpush.notification.icon;
  if (!message.webpush.notification.badge) delete message.webpush.notification.badge;

  const resp = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({ message })
    }
  );

  if (resp.ok) return { ok: true };
  let errJson = {};
  try { errJson = await resp.json(); } catch (_e) {}
  const status = (errJson.error && errJson.error.status) || '';
  // 失效／不符的 token → 自清
  const removable = ['NOT_FOUND', 'UNREGISTERED', 'SENDER_ID_MISMATCH', 'INVALID_ARGUMENT'];
  if (resp.status === 404 || removable.includes(status)) {
    return { ok: false, dead: true, status: status || resp.status };
  }
  return { ok: false, status: status || resp.status, message: errJson.error && errJson.error.message };
}

async function dispatch(accessToken, projectId, request, entries, title, body, data) {
  const origin = buildOrigin(request);
  let sent = 0;
  let failed = 0;
  const removed = [];

  await Promise.all(entries.map(async (entry) => {
    const result = await sendOne(accessToken, projectId, entry, title, body, data, origin);
    if (result.ok) {
      sent += 1;
    } else if (result.dead) {
      await fsDelete(accessToken, projectId, `${TOKENS_COLLECTION}/${encodeURIComponent(entry.token)}`);
      removed.push(entry.token);
    } else {
      failed += 1;
      console.warn('[FCM] 發送失敗:', entry.uid, result.status, result.message || '');
    }
  }));

  return { ok: true, sent, failed, removed: removed.length };
}

// ──────────────────── 路由 A：職員主動派發通知 ────────────────────

// 同一事件可能由多位線上職員（或同一帳號多裝置）的監聽器重複觸發，
// 以 eventId 在 isolate 內做短時去重
const staffEventStore = new Map();

async function handleStaffNotify(context) {
  const cfg = requireConfig(context.env);
  if (cfg.error) return cfg.error;

  const parsed = await readJsonBody(context.request);
  if (parsed.error) return parsed.error;
  const body = parsed.body;

  const authHeader = context.request.headers.get('authorization') || '';
  const idToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  const accessToken = await getGoogleAccessToken(cfg);
  const verified = await verifyStaffIdToken(accessToken, cfg.projectId, idToken);
  if (verified.error) return verified.error;

  const title = capText(body.title, 100, '診所系統通知');
  const messageBody = capText(body.body, 500, '');
  if (!messageBody) {
    return jsonResponse({ ok: false, error: 'BODY_REQUIRED' }, 400);
  }
  const data = sanitizeData(body.data);
  data.event = data.event || 'general';
  if (!data.url) data.url = '/system.html';

  // 事件去重（120 秒內相同 eventId 只派發一次）。
  // 注意：此處只讀取、不寫入。必須等「確認有實際接收對象」後才寫入，
  // 否則收到者自己分頁發出的無效請求（目標只剩自己→NO_TARGETS）會搶先
  // 佔用去重額度，導致其他分頁的合法請求被誤判重複而丟棄。
  const dedupeMs = 120000;
  const nowMs = Date.now();
  if (data.eventId && nowMs - (staffEventStore.get(data.eventId) || 0) < dedupeMs) {
    return jsonResponse({ ok: true, skipped: 'DEDUPED' });
  }

  const target = body.targets || {};
  let entries = [];
  let exceptUids = [];
  let uids = [];

  if (target.allStaff === true) {
    exceptUids = Array.isArray(target.exceptUids)
      ? target.exceptUids.map((u) => String(u)).filter((u) => UID_PATTERN.test(u))
      : [];
    exceptUids.push(verified.uid); // 永不推給發送者自己
    entries = await allStaffTokens(accessToken, cfg.projectId, exceptUids);
  } else {
    const rawUids = Array.isArray(target.uids)
      ? target.uids.map((u) => String(u))
      : [];
    const invalidUids = rawUids.filter((u) => !UID_PATTERN.test(u));
    const selfUids = rawUids.filter((u) => UID_PATTERN.test(u) && u === verified.uid);
    uids = rawUids.filter((u) => UID_PATTERN.test(u) && u !== verified.uid);
    if (uids.length === 0) {
      return jsonResponse({
        ok: true, sent: 0, skipped: 'NO_TARGETS',
        detail: {
          收到目標數: rawUids.length,
          格式不符: invalidUids.map((u) => u.slice(0, 12)),
          發送者本人: selfUids.length,
          發送者uid前綴: verified.uid.slice(0, 8)
        }
      });
    }
    entries = await tokensForUids(accessToken, cfg.projectId, uids);
  }

  if (entries.length === 0) {
    return jsonResponse({
      ok: true, sent: 0, skipped: 'NO_TOKENS',
      detail: target.allStaff === true
        ? { 模式: 'allStaff', 排除人數: exceptUids.length }
        : { 模式: 'uids', 目標uid前綴: uids.map((u) => u.slice(0, 8)) }
    });
  }

  // 有實際接收裝置，此刻才佔用去重額度
  if (data.eventId) {
    staffEventStore.set(data.eventId, nowMs);
    if (staffEventStore.size > 500) {
      for (const [k, v] of staffEventStore) if (nowMs - v > dedupeMs) staffEventStore.delete(k);
    }
  }
  return jsonResponse(await dispatch(accessToken, cfg.projectId, context.request, entries, title, messageBody, data));
}

// ──────────────── 路由 B：病人進入視訊診間 → 通知醫師 ──────────────

const videoRateStore = new Map(); // channel → ts（isolate 內簡易限流）

async function handleVideoNotify(context) {
  const cfg = requireConfig(context.env);
  if (cfg.error) return cfg.error;

  const parsed = await readJsonBody(context.request);
  if (parsed.error) return parsed.error;
  const body = parsed.body;

  const channel = String(body.channel || '').trim();
  if (!CHANNEL_PATTERN.test(channel)) {
    return jsonResponse({ ok: false, error: 'BAD_CHANNEL' }, 400);
  }

  // 簡易限流：同一頻道 60 秒一次
  const now = Date.now();
  const lastAt = videoRateStore.get(channel) || 0;
  if (now - lastAt < 60000) {
    return jsonResponse({ ok: true, skipped: 'RATE_LIMITED' });
  }
  videoRateStore.set(channel, now);
  if (videoRateStore.size > 200) {
    for (const [k, v] of videoRateStore) if (now - v > 300000) videoRateStore.delete(k);
  }

  const accessToken = await getGoogleAccessToken(cfg);

  // 驗證 1：同意書已存在（病人必須先簽署）
  const consent = await fsGet(accessToken, cfg.projectId,
    `videoConsents/${encodeURIComponent(channel)}`);
  if (!consent) {
    return jsonResponse({ ok: false, error: 'CONSENT_REQUIRED' }, 403);
  }
  const consentAt = tsMillis(fieldVal(consent, 'at'));
  if (!consentAt || now - consentAt > 10 * 60 * 1000) {
    return jsonResponse({ ok: true, skipped: 'CONSENT_TOO_OLD' });
  }

  // 驗證 2：醫師若已在診間（心跳新鮮且 joined），無須推播
  const presence = await fsGet(accessToken, cfg.projectId,
    `videoPresence/${encodeURIComponent(channel)}`);
  if (presence) {
    const doctor = presence.fields && presence.fields.doctor && presence.fields.doctor.mapValue;
    const dFields = doctor && doctor.fields;
    if (dFields) {
      const doctorAt = tsMillis(dFields.at && dFields.at.timestampValue);
      const doctorJoined = dFields.joined && dFields.joined.booleanValue === true;
      if (doctorJoined && doctorAt && now - doctorAt < 30000) {
        return jsonResponse({ ok: true, skipped: 'DOCTOR_PRESENT' });
      }
    }
  }

  // 找出掛號與負責醫師
  const appointmentId = String(fieldVal(consent, 'appointmentId') ||
    channel.slice(CHANNEL_PREFIX.length));
  if (!appointmentId) {
    return jsonResponse({ ok: true, skipped: 'NO_APPOINTMENT' });
  }

  const aptResp = await fetch(
    `${cfg.rtdbUrl}/appointments/${encodeURIComponent(appointmentId)}.json`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!aptResp.ok) {
    return jsonResponse({ ok: false, error: 'APPOINTMENT_LOOKUP_FAILED' }, 502);
  }
  const appointment = await aptResp.json();
  if (!appointment || typeof appointment !== 'object') {
    return jsonResponse({ ok: true, skipped: 'APPOINTMENT_NOT_FOUND' });
  }

  const doctorUsername = String(appointment.appointmentDoctor || '').trim();
  if (!doctorUsername) {
    return jsonResponse({ ok: true, skipped: 'NO_DOCTOR' });
  }

  const patientName = String(appointment.patientName || '病人');
  const doctorDocs = await fsQuery(accessToken, cfg.projectId, 'users', [
    { field: 'username', op: 'EQUAL', value: doctorUsername },
    { field: 'position', op: 'EQUAL', value: '醫師' },
    { field: 'active', op: 'EQUAL', value: true }
  ], 10);

  const doctorUids = doctorDocs
    .map((d) => fieldVal(d, 'uid'))
    .filter((u) => typeof u === 'string' && UID_PATTERN.test(u));
  if (doctorUids.length === 0) {
    return jsonResponse({ ok: true, skipped: 'DOCTOR_NO_UID' });
  }

  const entries = await tokensForUids(accessToken, cfg.projectId, doctorUids);
  if (entries.length === 0) {
    return jsonResponse({ ok: true, sent: 0, skipped: 'DOCTOR_NO_TOKENS' });
  }

  const origin = buildOrigin(context.request);
  const title = '視訊診症邀請';
  const text = `病人 ${patientName} 已進入診間等候，請立即開啟視訊診症。`;
  const data = {
    event: 'video_waiting',
    eventId: `video:${channel}:${Math.floor(consentAt / 1000)}`,
    channel,
    appointmentId,
    url: origin
      ? `${origin}/system.html?videoAlert=${encodeURIComponent(appointmentId)}`
      : '/system.html'
  };

  return jsonResponse(await dispatch(accessToken, cfg.projectId, context.request, entries, title, text, data));
}
