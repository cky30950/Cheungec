/* ============================================================
 * 視像診症電子同意書（videoConsents）伺服器端權威
 * ------------------------------------------------------------
 * 「未同意不得連線」是硬性合規約束，不能只靠 room.html 的前端
 * 閘門：病人可直接呼叫 RTC token 端點繞過。因此：
 *
 *   1. 同意記錄只由 Pages Function 以 Service Account 寫入
 *      （POST /api/agora-token/room-consent，須持有效入房 session）；
 *   2. RTC token 端點在病人換發 token 時，以 SA 讀取
 *      videoConsents/<頻道>，文件存在且 version 為現行版本才發 token；
 *   3. Firestore Rules 對客戶端拒絕所有寫入，匿名 get 一併移除
 *      （僅員工可 get，供醫師端監聽簽署狀態）。
 *
 * 同意書版本更新時：調整 DEFAULT_REQUIRED_CONSENT_VERSION，或於
 * Pages 環境變數設定 VIDEO_CONSENT_VERSION；舊版本記錄會令 RTC
 * 換發回 403 CONSENT_VERSION_MISMATCH，病人須重新簽署新版。
 * ============================================================ */

import { getAccessToken } from '../../backup/lib/google-auth.js';
import { FirestoreClient } from '../../backup/lib/firestore.js';

export const VIDEO_CONSENT_COLLECTION = 'videoConsents';

// 與 room.html 同意書標題「版本 v1」、video-consent.js CONSENT_VERSION 一致
export const DEFAULT_REQUIRED_CONSENT_VERSION = 'v1';

// userAgent 最長保留長度（與舊前端欄位一致）
const USER_AGENT_MAX_LEN = 300;
const APPOINTMENT_ID_MAX_LEN = 64;

export class ConsentError extends Error {
    constructor(status, code, message) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

export function requiredConsentVersion(env) {
    return String((env && env.VIDEO_CONSENT_VERSION) || DEFAULT_REQUIRED_CONSENT_VERSION);
}

async function firestoreClient(env) {
    const access = await getAccessToken(env);
    return new FirestoreClient(access.token, access.projectId, env.FIREBASE_RTDB_URL || '');
}

/**
 * RTC 換發前的伺服器端同意閘門：videoConsents/<channel> 必須存在，
 * 且 version 等於現行要求版本。
 * @returns {Promise<object>} 同意記錄資料
 */
export async function assertChannelConsent(env, channel) {
    const client = await firestoreClient(env);
    const doc = await client.getDocument(
        `${VIDEO_CONSENT_COLLECTION}/${encodeURIComponent(String(channel))}`
    );
    if (!doc || !doc.data) {
        throw new ConsentError(403, 'CONSENT_REQUIRED', '尚未完成視像診症同意書，無法進入診間');
    }
    const version = String(doc.data.version || '');
    if (!version || version !== requiredConsentVersion(env)) {
        throw new ConsentError(
            403,
            'CONSENT_VERSION_MISMATCH',
            '同意書已有新版本，請重新整理頁面並重新簽署後再進入診間'
        );
    }
    return doc.data;
}

/**
 * 以 Service Account 寫入（或更新）同意記錄。呼叫端必須已通過
 * room-session 驗證，channel 以 session 綁定頻道為準，不采信客户端。
 *
 * @param {object} env
 * @param {object} data
 * @param {string} data.channel       session 綁定的頻道（權威來源）
 * @param {string} data.appointmentId 掛號編號（客户端提供，僅作欄位）
 * @param {string} data.clientVersion 客户端同意書版本（須與伺服器一致）
 * @param {string} [data.clientAt]    客户端送出時間 ISO（審計輔助）
 * @param {string} [data.userAgent]   請求的 User-Agent（伺服器取自 header）
 * @returns {Promise<{version:string, reaffirmed:boolean}>}
 */
export async function writeChannelConsent(env, data) {
    const channel = String((data && data.channel) || '');
    const required = requiredConsentVersion(env);
    const clientVersion = String((data && data.clientVersion) || '');
    if (clientVersion !== required) {
        // 客户端同意書版本過舊：拒絕寫入，要求重新整理取新版
        throw new ConsentError(
            409,
            'CONSENT_VERSION_MISMATCH',
            '同意書已有新版本，請重新整理頁面後重新簽署'
        );
    }

    const appointmentId = String((data && data.appointmentId) || '').slice(0, APPOINTMENT_ID_MAX_LEN);
    const userAgent = String((data && data.userAgent) || '').slice(0, USER_AGENT_MAX_LEN);
    const clientAt = String((data && data.clientAt) || '').slice(0, 40) || new Date().toISOString();

    const client = await firestoreClient(env);
    const docPath = `${VIDEO_CONSENT_COLLECTION}/${encodeURIComponent(channel)}`;
    const existing = await client.getDocument(docPath);
    const serverNow = new Date();

    if (existing && existing.data) {
        // 重複簽署（重新進入）：保留首次同意時間，僅記錄再確認時間
        await client.patchDocument(docPath, {
            channel: channel,
            appointmentId: appointmentId,
            version: required,
            clientAt: clientAt,
            userAgent: userAgent,
            reaffirmedAt: serverNow
        }, { merge: true });
        return { version: required, reaffirmed: true };
    }

    // 首次簽署：merge 寫入（文件不存在時 patchDocument 會建立）
    await client.patchDocument(docPath, {
        channel: channel,
        appointmentId: appointmentId,
        version: required,
        clientAt: clientAt,
        at: serverNow,
        userAgent: userAgent
    }, { merge: true });
    return { version: required, reaffirmed: false };
}
