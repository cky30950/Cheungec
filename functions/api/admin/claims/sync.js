/* ============================================================
 * POST /api/admin/claims/sync
 * 同步單一員工的 custom claims 與授權索引（管理員）。
 * 由前端「新增／編輯／啟用／停用」用戶後呼叫。
 *
 * Body: { targetUid: string, userId: string, forceRevoke?: boolean }
 * 伺服器會重讀 users/{userId} 文件作為 claims 事實來源，
 * 不採信客户端傳入的 active/position 等授權欄位。
 * ============================================================ */

import { syncUserClaims } from '../lib/claims.js';
import { jsonResponse, optionsResponse, requireStaffAdmin, errorResponse } from '../lib/http.js';

export function onRequestOptions() {
    return optionsResponse();
}

export async function onRequestPost({ request, env }) {
    try {
        const admin = await requireStaffAdmin(request, env);

        let body = {};
        try {
            body = await request.json();
        } catch (_e) {
            body = {};
        }

        const result = await syncUserClaims(env, {
            targetUid: body.targetUid,
            userId: body.userId,
            forceRevoke: body.forceRevoke === true
        });
        result.by = admin.email || admin.uid;
        return jsonResponse({ ok: true, result }, 200);
    } catch (error) {
        return errorResponse(error, error.status === 403 ? 403 : 500);
    }
}
