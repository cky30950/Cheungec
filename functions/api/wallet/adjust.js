/* ============================================================
 * POST /api/wallet/adjust
 * ------------------------------------------------------------
 * 管理員人工調整病人儲值餘額（補登、核銷異常等），
 * 強制填原因，調整後餘額不得為負。
 * 請求：{ patientId, deltaBalance?, deltaBonus?, reason,
 *         idempotencyKey }
 * ============================================================ */

import { walletAdjust } from './lib/wallet-store.js';
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
        const result = await walletAdjust(env, claims, {
            patientId,
            deltaBalance: body.deltaBalance !== undefined ? Number(body.deltaBalance) : 0,
            deltaBonus: body.deltaBonus !== undefined ? Number(body.deltaBonus) : 0,
            reason: String(body.reason || ''),
            idempotencyKey
        });
        return jsonResponse(result);
    } catch (error) {
        return toErrorResponse(error);
    }
}
