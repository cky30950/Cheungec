/* ============================================================
 * POST /api/wallet/migrate（僅管理員）
 * ------------------------------------------------------------
 * 一次性把舊制「單一全域錢包」遷移為「每診所獨立錢包」。
 * 可重複執行：已標記 walletMigratedAt 的舊文件自動跳過。
 * 請求：{ dryRun?: boolean }
 * 回應：遷移報告（掃描數、已遷移、未分組餘額、未知診所等）
 *
 * 注意：帳號本身隸屬某診所（clinicId claim）的管理員只能為自己
 * 診所核對；遷移本身是跨診所作業，流水依病歷／掛號證據歸屬，
 * 不受操作者 clinicId 影響（超級管理員執行最單純）。
 * ============================================================ */

import { walletMigrateLegacy } from './lib/wallet-store.js';
import {
    requireWalletAdmin,
    readJsonBody,
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
        const result = await walletMigrateLegacy(env, claims, {
            dryRun: body.dryRun === true
        });
        return jsonResponse(result);
    } catch (error) {
        return toErrorResponse(error);
    }
}
