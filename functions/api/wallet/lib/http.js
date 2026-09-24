/* ============================================================
 * Wallet API 共用：員工驗證與請求解析
 * ============================================================ */

import {
    jsonResponse,
    optionsResponse
} from '../../backup/lib/http.js';
import { authenticateSignedIn } from '../../admin/lib/http.js';
import { WalletError } from './wallet-store.js';

export { jsonResponse, optionsResponse };

/**
 * 要求活躍員工（claims staff + active）。
 * 手機驗證的病人即使 token 有效也不可呼叫。
 * @returns {Promise<object>} claims
 */
export async function requireStaff(request, env) {
    const claims = await authenticateSignedIn(request, env);
    if (claims.staff !== true || claims.active !== true) {
        throw new WalletError(403, 'STAFF_ONLY', '此操作僅限診所員工');
    }
    return claims;
}

/**
 * 要求管理員（claims.admin）。端點最後防線，前端亦會隱藏入口。
 */
export async function requireWalletAdmin(request, env) {
    const claims = await requireStaff(request, env);
    if (claims.admin !== true) {
        throw new WalletError(403, 'ADMIN_ONLY', '此操作需要管理員權限');
    }
    return claims;
}

export async function readJsonBody(request) {
    let body;
    try {
        body = await request.json();
    } catch (_e) {
        throw new WalletError(400, 'INVALID_REQUEST', '請求內容必須為 JSON');
    }
    return body && typeof body === 'object' ? body : {};
}

const PATIENT_ID_RE = /^[A-Za-z0-9_-]{10,40}$/;

export function parsePatientId(body) {
    const patientId = String(body && body.patientId || '').trim();
    if (!PATIENT_ID_RE.test(patientId)) {
        throw new WalletError(400, 'INVALID_PATIENT', '病人 ID 格式不正確');
    }
    return patientId;
}

export function parseIdempotencyKey(body) {
    const key = String(body && body.idempotencyKey || '').trim();
    if (!key || key.length > 200) {
        throw new WalletError(400, 'INVALID_IDEMPOTENCY_KEY',
            '必須提供有效的 idempotencyKey');
    }
    return key;
}

export function toErrorResponse(error) {
    if (error instanceof WalletError) {
        return jsonResponse({ error: error.code, message: error.message }, error.status);
    }
    return jsonResponse({
        error: 'WALLET_API_ERROR',
        message: error && error.message ? error.message : '儲值功能發生錯誤'
    }, 500);
}
