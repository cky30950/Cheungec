/* ============================================================
 * POST /api/admin/claims/delete
 * 移除授權索引並刪除員工的 Firebase Auth 帳號（管理員）。
 * 由前端「刪除用戶」並完成 users 文件刪除後呼叫。
 *
 * Body: { targetUid: string }
 * ============================================================ */

import { deleteStaffAuth } from '../lib/claims.js';
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

        const result = await deleteStaffAuth(env, body.targetUid);
        result.by = admin.email || admin.uid;
        return jsonResponse({ ok: true, result }, 200);
    } catch (error) {
        return errorResponse(error, error.status === 403 ? 403 : 500);
    }
}
