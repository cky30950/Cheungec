/* ============================================================
 * POST /api/wallet/topup
 * ------------------------------------------------------------
 * 員工為病人儲值充值。贈送額由伺服器依診所配置的級距計算。
 * 請求：{ patientId, amount, appointmentId?, note?, idempotencyKey }
 * 回應：{ ok, balance, bonusBalance, bonusAmount, txId }
 * ============================================================ */

import { walletTopup } from './lib/wallet-store.js';
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
                message: '充值金額必須大於 0 且不超過 HK$100,000'
            }, 400);
        }
        const result = await walletTopup(env, claims, {
            patientId,
            amount,
            appointmentId: body.appointmentId ? String(body.appointmentId) : '',
            note: body.note ? String(body.note) : '',
            idempotencyKey
        });
        return jsonResponse(result);
    } catch (error) {
        return toErrorResponse(error);
    }
}
