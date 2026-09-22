/* ============================================================
 * 視訊診間「入房 Pass」（videoRoomPasses）
 * ------------------------------------------------------------
 * 病人端 room.html 無 Firebase 登入，改以醫師開診時後端核發的
 * 高熵一次性 pass 進入：醫師（已登入員工）呼叫 POST room-pass，
 * 後端產生 256-bit pass，只把 SHA-256 hash 連同綁定的頻道名稱
 * 存入 Firestore；病人連結以 ?k=<pass> 帶入，換發 Agora token
 * 時由 [[path]].js 驗證 pass 有效、未過期，且頻道完全相符。
 *
 * 文件只由 Service Account 經 REST 讀寫；Firestore Rules 對
 * 客戶端應全面拒絕 videoRoomPasses（預設 locked 規則即拒絕）。
 * ============================================================ */

import { getAccessToken } from '../../backup/lib/google-auth.js';
import { FirestoreClient } from '../../backup/lib/firestore.js';

export const ROOM_PASS_COLLECTION = 'videoRoomPasses';

// 入房 pass 有效時間：4 小時（涵蓋當日診症與病人重新進入需求）
export const ROOM_PASS_TTL_MS = 4 * 60 * 60 * 1000;

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
