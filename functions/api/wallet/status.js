/* ============================================================
 * POST /api/wallet/status
 * ------------------------------------------------------------
 * 管理員變更儲值帳戶狀態（active/frozen/closed）；
 * 非 active 須附說明，有餘額的帳戶不可關閉。
 * 請求：{ patientId, status, note?, idempotencyKey }
 * ============================================================ */

import { walletSetStatus } from './lib/wallet-store.js';
import {
    requireWalletAdmin,
    readJsonBody,
    parsePatientId,
    parseIdempotencyKey,
    jsonResponse,
    optionsResponse,
    toErrorResponse
} from './lib/http.js';

export const onRequestOptions = () => optionsResponse();

export async function onRequestPost(context) {
    const { request, env } = context;
    try {
        const claims = await requireWalletAdmin(request, env);
        const body = await readJsonBody(request);
        const patientId = parsePatientId(body);
        const idempotencyKey = parseIdempotencyKey(body);
        const result = await walletSetStatus(env, claims, {
            patientId,
            status: String(body.status || ''),
            note: body.note ? String(body.note) : '',
            idempotencyKey
        });
        return jsonResponse(result);
    } catch (error) {
        return toErrorResponse(error);
    }
}
