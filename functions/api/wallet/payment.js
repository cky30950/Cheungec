/* ============================================================
 * POST /api/wallet/payment
 * ------------------------------------------------------------
 * 員工以病人儲值餘額支付診症帳單。冪等鍵建議 pay:{consultationId}。
 * 請求：{ patientId, amount, consultationId, appointmentId?,
 *         idempotencyKey }
 * 回應：{ ok, balance, bonusBalance, fromBalance, fromBonus, txId }
 * 餘額不足回 402 INSUFFICIENT_FUNDS。
 * ============================================================ */

import { walletPayment } from './lib/wallet-store.js';
import {
    requireStaff,
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
        const claims = await requireStaff(request, env);
        const body = await readJsonBody(request);
        const patientId = parsePatientId(body);
        const idempotencyKey = parseIdempotencyKey(body);
        const amount = Number(body.amount);
        if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) {
            return jsonResponse({
                error: 'INVALID_AMOUNT',
                message: '付款金額必須大於 0 且不超過 HK$100,000'
            }, 400);
        }
        const consultationId = String(body.consultationId || '').trim();
        if (!consultationId) {
            return jsonResponse({
                error: 'MISSING_CONSULTATION',
                message: '缺少 consultationId'
            }, 400);
        }
        const result = await walletPayment(env, claims, {
            patientId,
            amount,
            consultationId,
            appointmentId: body.appointmentId ? String(body.appointmentId) : '',
            idempotencyKey
        });
        return jsonResponse(result);
    } catch (error) {
        return toErrorResponse(error);
    }
}
