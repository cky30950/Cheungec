/* ============================================================
 * POST /api/admin/claims/archive
 * 封存（離職）／復職員工 Auth 帳號（管理員，軟刪除）。
 * 由前端「封存／復職用戶」完成 users 文件更新後呼叫：
 * 封存只停用 Auth 帳號、撤銷工作階段，不刪除帳號，
 * 保留病歷／財務記錄的身份審計追溯。
 *
 * Body: { targetUid: string, userId: string, archived: boolean }
 * ============================================================ */

import { archiveStaffAuth } from '../lib/claims.js';
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

        const result = await archiveStaffAuth(env, {
            targetUid: body.targetUid,
            userId: body.userId,
            archived: body.archived !== false
        });
        result.by = admin.email || admin.uid;
        return jsonResponse({ ok: true, result }, 200);
    } catch (error) {
        return errorResponse(error, error.status === 403 ? 403 : 500);
    }
}
