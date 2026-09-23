/* ============================================================
 * 視訊診間「入房 Pass / 入房 Session」（videoRoomPasses / videoRoomSessions）
 * ------------------------------------------------------------
 * 病人端 room.html 無 Firebase 登入，改以醫師開診時後端核發的
 * 高熵 pass 進入：醫師（已登入員工）呼叫 POST room-pass，
 * 後端產生 256-bit pass，只把 SHA-256 hash 連同綁定的頻道名稱
 * 存入 Firestore；病人連結以 location.hash（#k=<pass>，不進伺服器
 * 日誌／Referer）帶入，開頁時以 POST room-session 將 pass 換成
 * 90 分鐘滑動 TTL 的 session token（pass 隨即標記 consumed，不可
 * 重用），換發 Agora token 時憑 header X-Room-Session 驗證，並由
 * 後端強制派生的病人 uid 與 publisher 角色（路徑無法頂用醫師 uid）。
 *
 * 診症完成時由醫師端呼叫 room-pass（action=revoke）將該頻道的
 * pass 與有效 session 批次作廢。
 *
 * 文件只由 Service Account 經 REST 讀寫；Firestore Rules 對
 * 客戶端應全面拒絕 videoRoomPasses / videoRoomSessions（預設
 * locked 規則即拒絕）。
 * ============================================================ */

import { getAccessToken } from '../../backup/lib/google-auth.js';
import { FirestoreClient } from '../../backup/lib/firestore.js';

export const ROOM_PASS_COLLECTION = 'videoRoomPasses';
export const ROOM_SESSION_COLLECTION = 'videoRoomSessions';

// 入房 pass 有效時間：4 小時（涵蓋當日診症與病人重新進入需求；未消耗前）
export const ROOM_PASS_TTL_MS = 4 * 60 * 60 * 1000;

// 入房 session 有效時間：90 分鐘滑動窗口（Agora token 預設 1 小時
// 換發一次，故每次成功換發 RTC token 都會把 session 順延 90 分鐘）
export const ROOM_SESSION_TTL_MS = 90 * 60 * 1000;

// session token 版本前綴（日後演算法變更時區分）
const SESSION_TOKEN_VERSION = 'v1';

export class RoomPassError extends Error {
    constructor(status, code, message) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

async function sha256Hex(text) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

function fsStr(value) {
    return { stringValue: String(value == null ? '' : value) };
}

function fsTs(isoString) {
    return { timestampValue: isoString };
}

/** 產生 256-bit pass（64 碼 hex，僅在此回應中出現一次） */
export function generateRoomPass() {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function firestoreClient(env) {
    const access = await getAccessToken(env);
    return new FirestoreClient(access.token, access.projectId, env.FIREBASE_RTDB_URL || '');
}

/**
 * 以 Service Account 建立入房 pass 文件（文件 ID = pass 的 SHA-256 hash）。
 * @returns {Promise<{pass:string, expiresAt:Date}>}
 */
export async function createRoomPass(env, data) {
    const pass = generateRoomPass();
    const passHash = await sha256Hex(pass);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ROOM_PASS_TTL_MS);

    const access = await getAccessToken(env);
    const url = `https://firestore.googleapis.com/v1/projects/${access.projectId}` +
        `/databases/(default)/documents/${ROOM_PASS_COLLECTION}?documentId=${encodeURIComponent(passHash)}`;
    const fields = {
        channel: fsStr(data.channel),
        createdByUid: fsStr(data.createdByUid || ''),
        createdByName: fsStr(data.createdByName || ''),
        status: fsStr('active'),
        createdAt: fsTs(now.toISOString()),
        expiresAt: fsTs(expiresAt.toISOString())
    };
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${access.token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fields })
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`入房 pass 建立失敗 (HTTP ${response.status}): ${text.slice(0, 200)}`);
    }
    return { pass, expiresAt };
}

/**
 * 驗證病人入房 pass：文件存在、status=active、未過期、頻道完全相符。
 * pass 錯誤一律 404（不暴露文件存在性），過期回 403。
 * @returns {Promise<object>} pass 文件資料
 */
export async function validateRoomPass(env, pass, expectedChannel) {
    const rawPass = String(pass || '').trim();
    if (!/^[a-f0-9]{32,256}$/i.test(rawPass)) {
        throw new RoomPassError(404, 'INVALID_ROOM_PASS', '診間連結無效');
    }

    const client = await firestoreClient(env);
    const doc = await client.getDocument(
        `${ROOM_PASS_COLLECTION}/${encodeURIComponent(await sha256Hex(rawPass))}`
    );
    if (!doc || !doc.data) {
        throw new RoomPassError(404, 'INVALID_ROOM_PASS', '診間連結無效或已不存在');
    }

    const record = doc.data;
    if (String(record.status || '') !== 'active') {
        throw new RoomPassError(403, 'ROOM_PASS_CLOSED', '診間連結已關閉');
    }
    const exp = record.expiresAt && record.expiresAt.seconds
        ? new Date(record.expiresAt.seconds * 1000)
        : null;
    if (!exp || exp.getTime() < Date.now()) {
        throw new RoomPassError(403, 'ROOM_PASS_EXPIRED', '診間連結已過期，請向診所重新索取');
    }
    if (String(record.channel || '') !== String(expectedChannel)) {
        throw new RoomPassError(403, 'ROOM_PASS_CHANNEL_MISMATCH', '此連結不屬於目前診間');
    }
    return record;
}

/* ============================================================
 * 入房 Session：pass 換發的短 TTL 憑證
 * ------------------------------------------------------------
 * 流程：
 *   1. 病人以連結中的 pass POST /room-session
 *   2. 後端驗證 pass（active／未過期／頻道相符）後，以文件
 *      updateTime 做條件式 PATCH，把 pass 標記為 consumed——
 *      並發重放只會有一方成功，失敗方取得 409
 *   3. 建立 videoRoomSessions 文件並核發 HMAC 簽章的 session token
 *   4. 病人以 X-Room-Session header 換發 RTC token；uid／角色
 *      完全由後端 session 記錄強制決定
 * ============================================================ */

const FIRESTORE_BASE_URL = 'https://firestore.googleapis.com/v1';

/** 產生 128-bit session ID（32 碼 hex，作為文件 ID） */
function generateSessionId() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function base64UrlFromBytes(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(text) {
    const padded = String(text).replace(/-/g, '+').replace(/_/g, '/')
        + '='.repeat((4 - (String(text).length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

async function hmacSha256Bytes(secret, message) {
    const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)));
}

function timingSafeEqualBytes(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    return diff === 0;
}

// session token 簽章密鑰：優先獨立變數，未設定時退回 Agora 憑證
// （同屬僅在後端保存的高熵密鑰）。建議於 Pages 設定 ROOM_SESSION_SECRET。
function sessionSecret(env) {
    return String((env && env.ROOM_SESSION_SECRET) || (env && env.AGORA_APP_CERTIFICATE) || '');
}

/**
 * 由 pass hash 確定性派生病人 Agora uid（uint32，避開萬用 uid 0）。
 * 同一 pass 重連取得相同 uid；uid 不可由請求路徑控制。
 */
export async function derivePatientUid(passHash) {
    const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(String(passHash) + ':patient-uid')
    );
    let value = 0;
    const view = new DataView(digest);
    // 取前 4 組 32-bit 組合，再映射到 1 ~ 0xFFFFFFFE（避開 0 與 0xFFFFFFFF）
    value = view.getUint32(0) >>> 0;
    return 1 + (value % 0xfffffffe);
}

async function signSessionToken(env, payload, secret) {
    const body = base64UrlFromBytes(new TextEncoder().encode(JSON.stringify(payload)));
    const sig = base64UrlFromBytes(await hmacSha256Bytes(secret, SESSION_TOKEN_VERSION + '.' + body));
    return `${SESSION_TOKEN_VERSION}.${body}.${sig}`;
}

function parseSignedSessionToken(token) {
    const parts = String(token || '').trim().split('.');
    if (parts.length !== 3 || parts[0] !== SESSION_TOKEN_VERSION) return null;
    let payload;
    try {
        payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(parts[1])));
    } catch (_e) {
        return null;
    }
    if (!payload || !payload.sid || !Number.isFinite(Number(payload.exp))) return null;
    return { payload, body: parts[1], sig: parts[2] };
}

/**
 * 以 pass 換發入房 session。pass 僅可成功換發一次（consumed）。
 * @param {object} env
 * @param {string} rawPass 病人連結中的原始 pass
 * @param {string} expectedChannel 請求頻道（須與 pass 文件完全相符）
 * @returns {Promise<{sessionToken:string, uid:number, expiresAt:Date, sessionId:string}>}
 */
export async function exchangeRoomPass(env, rawPass, expectedChannel) {
    const pass = String(rawPass || '').trim();
    if (!/^[a-f0-9]{32,256}$/i.test(pass)) {
        throw new RoomPassError(404, 'INVALID_ROOM_PASS', '診間連結無效');
    }

    const secret = sessionSecret(env);
    if (!secret) {
        throw new Error('ROOM_SESSION_SECRET / AGORA_APP_CERTIFICATE 未設定');
    }

    const passHash = await sha256Hex(pass);
    const access = await getAccessToken(env);
    const docUrl = `${FIRESTORE_BASE_URL}/projects/${access.projectId}`
        + `/databases/(default)/documents/${ROOM_PASS_COLLECTION}/${encodeURIComponent(passHash)}`;

    // 直接取原始文件以保留 updateTime（條件式寫入的前置條件）
    const getRes = await fetch(docUrl, {
        headers: { 'Authorization': `Bearer ${access.token}` }
    });
    if (getRes.status === 404) {
        throw new RoomPassError(404, 'INVALID_ROOM_PASS', '診間連結無效或已不存在');
    }
    if (!getRes.ok) {
        throw new Error(`讀取入房 pass 失敗 (HTTP ${getRes.status}): ${(await getRes.text()).slice(0, 200)}`);
    }
    const passDoc = await getRes.json();
    const record = passDoc.fields || {};
    const fieldStr = (f) => (f && typeof f.stringValue === 'string') ? f.stringValue : '';

    const status = fieldStr(record.status);
    if (status !== 'active') {
        const code = status === 'consumed'
            ? 'ROOM_PASS_ALREADY_USED'
            : (status === 'revoked' ? 'ROOM_PASS_CLOSED' : 'ROOM_PASS_CLOSED');
        const message = status === 'consumed'
            ? '此診間連結已被使用，僅可在原裝置重新進入；請聯絡診所重新索取'
            : '診間連結已關閉';
        throw new RoomPassError(status === 'consumed' ? 409 : 403, code, message);
    }
    const expSec = record.expiresAt && record.expiresAt.timestampValue
        ? Date.parse(record.expiresAt.timestampValue) / 1000
        : 0;
    if (!expSec || expSec * 1000 < Date.now()) {
        throw new RoomPassError(403, 'ROOM_PASS_EXPIRED', '診間連結已過期，請向診所重新索取');
    }
    if (fieldStr(record.channel) !== String(expectedChannel)) {
        throw new RoomPassError(403, 'ROOM_PASS_CHANNEL_MISMATCH', '此連結不屬於目前診間');
    }

    // ── 先建 session 文件，再條件式消耗 pass ──
    const sessionId = generateSessionId();
    const uid = await derivePatientUid(passHash);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ROOM_SESSION_TTL_MS);
    const expUnix = Math.floor(expiresAt.getTime() / 1000);

    const sessionUrl = `${FIRESTORE_BASE_URL}/projects/${access.projectId}`
        + `/databases/(default)/documents/${ROOM_SESSION_COLLECTION}?documentId=${encodeURIComponent(sessionId)}`;
    const sessionRes = await fetch(sessionUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${access.token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            fields: {
                channel: fsStr(expectedChannel),
                uid: { integerValue: String(uid) },
                passHash: fsStr(passHash),
                status: fsStr('active'),
                createdAt: fsTs(now.toISOString()),
                expiresAt: fsTs(expiresAt.toISOString())
            }
        })
    });
    if (!sessionRes.ok) {
        throw new Error(`入房 session 建立失敗 (HTTP ${sessionRes.status}): ${(await sessionRes.text()).slice(0, 200)}`);
    }

    // 條件式 PATCH：唯有文件仍停留在讀取當下的 updateTime 才能消耗成功，
    // 併發重放／已被其他請求消耗時，Firestore 回 FAILED_PRECONDITION
    const patchUrl = passDoc.name
        + '?currentDocument.updateTime=' + encodeURIComponent(passDoc.updateTime)
        + '&updateMask.fieldPaths=status'
        + '&updateMask.fieldPaths=consumedAt'
        + '&updateMask.fieldPaths=sessionId';
    const patchRes = await fetch(`https://firestore.googleapis.com/v1/${patchUrl}`, {
        method: 'PATCH',
        headers: {
            'Authorization': `Bearer ${access.token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            fields: {
                status: fsStr('consumed'),
                consumedAt: fsTs(now.toISOString()),
                sessionId: fsStr(sessionId)
            }
        })
    });
    if (!patchRes.ok) {
        // 競態失敗：撤銷剛建立的 session，原連結請改走原裝置的 session 或請醫師重發
        try {
            await fetch(`${FIRESTORE_BASE_URL}/projects/${access.projectId}`
                + `/databases/(default)/documents/${ROOM_SESSION_COLLECTION}/${sessionId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${access.token}` }
            });
        } catch (_cleanup) { /* 孤兒 session 會自然過期 */ }
        const bodyText = await patchRes.text();
        if (bodyText.indexOf('FAILED_PRECONDITION') !== -1 || patchRes.status === 400 || patchRes.status === 412) {
            throw new RoomPassError(
                409,
                'ROOM_PASS_ALREADY_USED',
                '此診間連結已被使用，僅可在原裝置重新進入；請聯絡診所重新索取'
            );
        }
        throw new Error(`消耗入房 pass 失敗 (HTTP ${patchRes.status}): ${bodyText.slice(0, 200)}`);
    }

    const payload = { sid: sessionId, exp: expUnix, ch: String(expectedChannel), uid: uid };
    const sessionToken = await signSessionToken(env, payload, secret);
    return { sessionToken, uid, expiresAt, sessionId };
}

/**
 * 驗證入房 session token：簽章正確、未過期、文件 active、頻道與 uid 相符。
 * @returns {Promise<{uid:number, channel:string, id:string}>}
 */
export async function validateRoomSession(env, token, expectedChannel) {
    const parsed = parseSignedSessionToken(token);
    if (!parsed) {
        throw new RoomPassError(404, 'INVALID_ROOM_SESSION', '診間連線階段無效，請重新開啟連結');
    }
    const { payload, body, sig } = parsed;

    const secret = sessionSecret(env);
    const expectedSig = await hmacSha256Bytes(secret, SESSION_TOKEN_VERSION + '.' + body);
    if (!timingSafeEqualBytes(expectedSig, base64UrlToBytes(sig))) {
        throw new RoomPassError(401, 'INVALID_ROOM_SESSION', '診間連線階段驗證失敗');
    }
    if (Number(payload.exp) * 1000 < Date.now()) {
        throw new RoomPassError(403, 'ROOM_SESSION_EXPIRED', '診間連線階段已過期，請重新開啟連結');
    }

    const client = await firestoreClient(env);
    const doc = await client.getDocument(
        `${ROOM_SESSION_COLLECTION}/${encodeURIComponent(payload.sid)}`
    );
    if (!doc || !doc.data) {
        throw new RoomPassError(404, 'INVALID_ROOM_SESSION', '診間連線階段不存在');
    }
    const record = doc.data;
    if (String(record.status || '') !== 'active') {
        throw new RoomPassError(403, 'ROOM_SESSION_CLOSED', '診間連線已結束');
    }
    const exp = record.expiresAt && record.expiresAt.seconds
        ? new Date(record.expiresAt.seconds * 1000)
        : null;
    if (!exp || exp.getTime() < Date.now()) {
        throw new RoomPassError(403, 'ROOM_SESSION_EXPIRED', '診間連線階段已過期，請重新開啟連結');
    }
    if (String(record.channel || '') !== String(expectedChannel)) {
        throw new RoomPassError(403, 'ROOM_SESSION_CHANNEL_MISMATCH', '此連線階段不屬於目前診間');
    }
    if (Number(record.uid) !== Number(payload.uid) || Number(record.uid) <= 0) {
        throw new RoomPassError(403, 'ROOM_SESSION_UID_MISMATCH', '診間連線身分不符');
    }
    return { uid: Number(record.uid), channel: String(record.channel), id: doc.id };
}

/**
 * 滑動順延 session 過期時間（每次成功換發 RTC token 後 best-effort 呼叫）。
 * 失敗不阻斷換發：session TTL（90 分鐘）已大於 RTC token 換發週期（1 小時）。
 */
export async function touchRoomSession(env, sessionId) {
    const client = await firestoreClient(env);
    await client.patchDocument(
        `${ROOM_SESSION_COLLECTION}/${encodeURIComponent(sessionId)}`,
        { expiresAt: new Date(Date.now() + ROOM_SESSION_TTL_MS) },
        { merge: true }
    );
}

/**
 * 診症完成／關閉診間時，把某頻道所有未過期的 pass 與 active session
 * 批次作廢。兩個集合皆以單欄 channel 等值查詢（免複合索引），
 * status 過濾在記憶體進行；單一頻道文件量極小。
 * @returns {Promise<{passes:number, sessions:number}>}
 */
export async function revokeChannelRoomAccess(env, channel) {
    const client = await firestoreClient(env);
    const now = new Date();
    let passes = 0;
    let sessions = 0;

    const channelFilter = (collectionId) => ({
        fieldFilter: {
            field: { fieldPath: 'channel' },
            op: 'EQUAL',
            value: { stringValue: String(channel) }
        }
    });

    const [passDocs, sessionDocs] = await Promise.all([
        client.queryCollection({
            collectionId: ROOM_PASS_COLLECTION,
            where: channelFilter(),
            limit: 100
        }),
        client.queryCollection({
            collectionId: ROOM_SESSION_COLLECTION,
            where: channelFilter(),
            limit: 100
        })
    ]);

    for (const doc of passDocs.docs || []) {
        if (doc.data && (doc.data.status === 'active' || doc.data.status === 'consumed')) {
            await client.patchDocument(
                `${ROOM_PASS_COLLECTION}/${encodeURIComponent(doc.id)}`,
                { status: 'revoked', revokedAt: now },
                { merge: true }
            );
            passes++;
        }
    }
    for (const doc of sessionDocs.docs || []) {
        if (doc.data && doc.data.status === 'active') {
            await client.patchDocument(
                `${ROOM_SESSION_COLLECTION}/${encodeURIComponent(doc.id)}`,
                { status: 'revoked', revokedAt: now },
                { merge: true }
            );
            sessions++;
        }
    }
    return { passes, sessions };
}
