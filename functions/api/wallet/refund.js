/* ============================================================
 * POST /api/wallet/refund
 * ------------------------------------------------------------
 * 管理員全額或部分退還某診症單的儲值付款；按原付款本金/贈額
 * 比例回補。冪等鍵建議 refund:{consultationId}。
 * 請求：{ patientId, consultationId, amount?, note?, idempotencyKey }
 * ============================================================ */

import { walletRefund } from './lib/wallet-store.js';
import {
    requireWalletAdmin,
    readJsonBody,
    parsePatientId,
    parseIdempotencyKey,
    resolveClinicId,
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
        const consultationId = String(body.consultationId || '').trim();
        if (!consultationId) {
            return jsonResponse({
                error: 'MISSING_CONSULTATION',
                message: '缺少 consultationId'
            }, 400);
        }
        const hasAmount = body.amount !== undefined && body.amount !== null && body.amount !== '';
        const amount = hasAmount ? Number(body.amount) : undefined;
        if (hasAmount && (!Number.isFinite(amount) || amount <= 0)) {
            return jsonResponse({
                error: 'INVALID_AMOUNT',
                message: '退款金額必須大於 0'
            }, 400);
        }
        // 診所由 token claim（隸屬診所員工）或 body（超管）決定；
        // store 內會再核對診症單 clinicId，不符一律拒絕
        const clinicId = resolveClinicId(claims, body);
        const result = await walletRefund(env, claims, {
            clinicId,
            patientId,
            consultationId,
            amount,
            note: body.note ? String(body.note) : '',
            idempotencyKey
        });
        return jsonResponse(result);
    } catch (error) {
        return toErrorResponse(error);
    }
}
