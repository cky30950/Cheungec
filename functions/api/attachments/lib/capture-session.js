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
