/* ============================================================
 * 手機代拍 Session（attachmentCaptureSessions）
 * ------------------------------------------------------------
 * 電腦端建立一組限時（預設 10 分鐘）拍照 session，回傳帶 token
 * 的拍照連結；手機不需登入，憑 sid + token 呼叫代拍端點。
 *
 * Session 文件只由 Service Account 經 REST 讀寫（Rules 對客戶端
 * 全面拒絕）；token 只存 SHA-256 hash，原 token 僅出現一次於
 * 建立端點的回應與手機連結 query 中。
 * ============================================================ */

import { getAccessToken } from '../../backup/lib/google-auth.js';
import { FirestoreClient } from '../../backup/lib/firestore.js';
import { SESSION_COLLECTION, fsStr, fsTs } from './attachments-store.js';

export const SESSION_TTL_MS = 10 * 60 * 1000;
export const CAPTURE_MODES = new Set(['tongue', 'nontongue', 'all']);

// 單一拍照 session 可 presign 的張數上限（可由環境變數
// CAPTURE_MAX_UPLOADS 覆寫，範圍 1～50）；計數在 presign 時以
// Firestore 交易原子預佔，QR 連結外洩也無法灌爆 R2。
export const DEFAULT_UPLOAD_LIMIT = 20;

export const MODE_CATEGORIES = {
    tongue: new Set(['tongue']),
    nontongue: new Set(['report', 'other']),
    all: new Set(['tongue', 'report', 'other'])
};

export class SessionError extends Error {
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

/** 產生 256-bit token（hex） */
export function generateToken() {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// 常數時間比對，避免計時旁路
function safeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

/**
 * 解析 session 上傳張數上限：建立端傳入值優先（已由端點依環境變數
 * 解析），非法時退回預設值。
 */
function resolveUploadLimit(value) {
    const n = Math.trunc(Number(value));
    return Number.isFinite(n) && n >= 1 && n <= 50 ? n : DEFAULT_UPLOAD_LIMIT;
}

/**
 * 以 Service Account 建立 session 文件（文件 ID = sid）。
 * @returns {Promise<{sid:string, token:string, expiresAt:Date}>}
 */
export async function createCaptureSession(env, data) {
    const sid = crypto.randomUUID();
    const token = generateToken();
    const tokenHash = await sha256Hex(token);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

    const access = await getAccessToken(env);
    const url = `https://firestore.googleapis.com/v1/projects/${access.projectId}` +
        `/databases/(default)/documents/${SESSION_COLLECTION}?documentId=${encodeURIComponent(sid)}`;
    const fields = {
        sid: fsStr(sid),
        tokenHash: fsStr(tokenHash),
        createdByUid: fsStr(data.createdByUid),
        createdByName: fsStr(data.createdByName || ''),
        patientId: fsStr(data.patientId),
        patientName: fsStr(data.patientName || ''),
        appointmentId: fsStr(data.appointmentId || ''),
        consultationId: fsStr(data.consultationId || ''),
        consultationDate: fsStr(data.consultationDate || ''),
        mode: fsStr(data.mode),
        status: fsStr('active'),
        // 上傳配額：presign 一次預佔一格，超限即拒發新 URL
        uploadCount: { integerValue: '0' },
        uploadLimit: { integerValue: String(resolveUploadLimit(data.uploadLimit)) },
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
        throw new Error(`代拍 session 建立失敗 (HTTP ${response.status}): ${text.slice(0, 200)}`);
    }
    return { sid, token, expiresAt };
}

/**
 * 驗證 sid + token，回傳 session 文件資料。
 * 不存在或 token 錯誤一律 404（不暴露文件存在性）；
 * 過期或已關閉回 403。
 */
export async function validateCaptureSession(env, sid, token) {
    const sId = String(sid || '').trim();
    const sToken = String(token || '').trim();
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(sId) || !sToken) {
        throw new SessionError(404, 'INVALID_SESSION', '拍照連結無效');
    }

    const access = await getAccessToken(env);
    const client = new FirestoreClient(access.token, access.projectId, env.FIREBASE_RTDB_URL || '');
    const doc = await client.getDocument(`${SESSION_COLLECTION}/${encodeURIComponent(sId)}`);
    if (!doc || !doc.data) {
        throw new SessionError(404, 'INVALID_SESSION', '拍照連結無效或已不存在');
    }
    const s = doc.data;
    const expectedHash = await sha256Hex(sToken);
    if (!safeEqual(String(s.tokenHash || ''), expectedHash)) {
        throw new SessionError(404, 'INVALID_SESSION', '拍照連結無效');
    }
    if (String(s.status || '') !== 'active') {
        throw new SessionError(403, 'SESSION_CLOSED', '拍照連結已關閉');
    }
    const exp = s.expiresAt && s.expiresAt.seconds
        ? new Date(s.expiresAt.seconds * 1000)
        : null;
    if (!exp || exp.getTime() < Date.now()) {
        throw new SessionError(403, 'SESSION_EXPIRED', '拍照連結已過期，請在電腦上重新產生');
    }
    return s;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function fsDocInt(fields, key) {
    const v = fields && fields[key];
    const n = v ? Number(v.integerValue) : NaN;
    return Number.isFinite(n) ? n : null;
}

function fsDocExpiryMs(fields) {
    const raw = fields && fields.expiresAt && fields.expiresAt.timestampValue;
    if (!raw) return null;
    const ms = Date.parse(raw);
    return Number.isFinite(ms) ? ms : null;
}

/**
 * 於 presign 前以 Firestore 交易「檢查並原子預佔」一格上傳配額：
 * beginTransaction → batchGet（pin 讀取時間）→ commit transform
 * increment uploadCount。文件在讀後被改動會導致 409 ABORTED，
 * 自備有限重試，避免並發 presign 超發。
 *
 * @returns {Promise<{allowed:boolean, used:number, limit:number}>}
 *   allowed=false 表示已達上限（或 session 無效時直接拋 SessionError）
 */
export async function consumeUploadSlot(env, sid) {
    const access = await getAccessToken(env);
    const authHeaders = {
        'Authorization': `Bearer ${access.token}`,
        'Content-Type': 'application/json'
    };
    const base = `https://firestore.googleapis.com/v1/projects/${access.projectId}`
        + `/databases/(default)/documents`;
    // Firestore 資源名使用相對路徑（不含端點前綴）
    const docPath = `projects/${access.projectId}/databases/(default)`
        + `/documents/${SESSION_COLLECTION}/${encodeURIComponent(sid)}`;

    const rollback = async (transaction) => {
        try {
            await fetch(`${base}:rollback`, {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify({ transaction })
            });
        } catch (_e) { /* 交易逾時會由後端自動回收 */ }
    };

    for (let attempt = 0; attempt < 3; attempt++) {
        // 1. 開始讀寫交易
        const beginRes = await fetch(`${base}:beginTransaction`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({ options: { readWrite: {} } })
        });
        if (!beginRes.ok) {
            const text = await beginRes.text();
            if (beginRes.status >= 500 && attempt < 2) {
                await sleep(120 * (attempt + 1));
                continue;
            }
            throw new Error(`開始配額交易失敗 (HTTP ${beginRes.status}): ${text.slice(0, 200)}`);
        }
        const transaction = (await beginRes.json()).transaction;

        // 2. 交易內讀取 session 文件
        const batchRes = await fetch(`${base}:batchGet`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({ documents: [docPath], transaction })
        });
        if (!batchRes.ok) {
            const text = await batchRes.text();
            await rollback(transaction);
            if (batchRes.status >= 500 && attempt < 2) {
                await sleep(120 * (attempt + 1));
                continue;
            }
            throw new Error(`讀取拍照配額失敗 (HTTP ${batchRes.status}): ${text.slice(0, 200)}`);
        }
        const rows = await batchRes.json();
        const foundRow = Array.isArray(rows)
            ? rows.find((r) => r && r.found && r.found.name === docPath)
            : null;
        const fields = foundRow && foundRow.found ? (foundRow.found.fields || {}) : null;

        if (!fields) {
            await rollback(transaction);
            throw new SessionError(404, 'INVALID_SESSION', '拍照連結無效或已不存在');
        }
        if (String(fields.status && fields.status.stringValue || '') !== 'active') {
            await rollback(transaction);
            throw new SessionError(403, 'SESSION_CLOSED', '拍照連結已關閉');
        }
        const expiryMs = fsDocExpiryMs(fields);
        if (!expiryMs || expiryMs < Date.now()) {
            await rollback(transaction);
            throw new SessionError(403, 'SESSION_EXPIRED', '拍照連結已過期，請在電腦上重新產生');
        }

        const limit = fsDocInt(fields, 'uploadLimit');
        const effectiveLimit = limit && limit >= 1 ? limit : DEFAULT_UPLOAD_LIMIT;
        const used = fsDocInt(fields, 'uploadCount') || 0;

        if (used >= effectiveLimit) {
            await rollback(transaction);
            return { allowed: false, used, limit: effectiveLimit };
        }

        // 3. commit：原子 increment（交易保證讀寫一致，衝突會 409）
        const commitRes = await fetch(`${base}:commit`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({
                transaction,
                writes: [{
                    transform: {
                        document: docPath,
                        fieldTransforms: [
                            { fieldPath: 'uploadCount', increment: { integerValue: '1' } }
                        ]
                    }
                }]
            })
        });
        if (!commitRes.ok) {
            const text = await commitRes.text();
            // 409 ABORTED：文件在讀寫之間被改動，短退讓後重試整個交易
            if (commitRes.status === 409 && attempt < 2) {
                await sleep(120 * (attempt + 1));
                continue;
            }
            throw new Error(`更新拍照配額失敗 (HTTP ${commitRes.status}): ${text.slice(0, 200)}`);
        }

        return { allowed: true, used: used + 1, limit: effectiveLimit };
    }

    throw new Error('拍照配額檢查忙碌中，請重試');
}

/**
 * 讀取 session 現有配額（供 status 端點回報剩餘張數）；
 * 取不到數字時回傳 null，由呼叫端降級處理。
 */
export function getSessionQuota(session) {
    const limitRaw = Number(session && session.uploadLimit);
    const usedRaw = Number(session && session.uploadCount);
    const limit = Number.isFinite(limitRaw) && limitRaw >= 1 ? Math.trunc(limitRaw) : DEFAULT_UPLOAD_LIMIT;
    const used = Number.isFinite(usedRaw) && usedRaw >= 0 ? Math.trunc(usedRaw) : 0;
    return { used, limit, remaining: Math.max(0, limit - used) };
}
