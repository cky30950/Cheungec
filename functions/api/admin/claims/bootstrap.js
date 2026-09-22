/* ============================================================
 * POST /api/admin/claims/bootstrap
 * 一次性批量同步全部員工帳號的 custom claims（首次部署／修復用）。
 *
 * 認證方式（二擇一）：
 *   1. 管理員 ID Token（claims.admin 或 users 文件 position='診所管理'）
 *   2. Header X-Admin-Bootstrap-Secret == 環境變數 ADMIN_BOOTSTRAP_SECRET
 *      （供首次部署、尚未有任何 claims 時以 curl 執行）
 *
 * 回應：{ ok, synced, inactive, orphaned:[{uid,email}], totalAuth }
 * ============================================================ */

import { bootstrapAllClaims } from '../lib/claims.js';
import {
    jsonResponse,
    optionsResponse,
    requireStaffAdmin,
    isAuthorizedBootstrapCall,
    errorResponse
} from '../lib/http.js';

export function onRequestOptions() {
    return optionsResponse();
}

export async function onRequestPost({ request, env }) {
    let actor = '';
    try {
        if (isAuthorizedBootstrapCall(request, env)) {
            actor = 'bootstrap-secret';
        } else {
            const admin = await requireStaffAdmin(request, env);
            actor = admin.email || admin.uid;
        }

        const result = await bootstrapAllClaims(env);
        return jsonResponse({ ok: true, by: actor, ...result }, 200);
    } catch (error) {
        return errorResponse(error, error.status === 403 ? 403 : 500);
    }
}
