/* ============================================================
 * POST /api/admin/claims/archive
 * 封存（離職）／復職員工 Auth 帳號（軟刪除）。
 *  - 管理員：可封存或復職任何員工（users 文件由客戶端先行更新）
 *  - 一般員工：僅可封存「自己」（users 文件由後端 SA 代寫），
 *    不可自我復職；主管理員／最後一個在職管理員由 lib 層攔截
 * 封存只停用 Auth 帳號、撤銷工作階段，不刪除帳號，
 * 保留病歷／財務記錄的身份審計追溯。
 *
 * Body: { targetUid: string, userId?: string, archived?: boolean, reason?: string }
 * ============================================================ */

import { archiveStaffAuth } from '../lib/claims.js';
import {
    jsonResponse,
    optionsResponse,
    requireStaffAdmin,
    errorResponse,
    authenticateSignedIn,
    resolveStaffUser
} from '../lib/http.js';

export function onRequestOptions() {
    return optionsResponse();
}

export async function onRequestPost({ request, env }) {
    let body = {};
    try {
        body = await request.json();
    } catch (_e) {
        body = {};
    }

    // 任何路徑都需通過 ID Token 驗證
    let claims;
    try {
        claims = await authenticateSignedIn(request, env);
    } catch (error) {
        return errorResponse(error, 401);
    }

    // 管理員路徑：requireStaffAdmin 失敗（403）時退回自我封存判斷
    let admin = null;
    try {
        admin = await requireStaffAdmin(request, env);
    } catch (error) {
        if (error.status !== 403) {
            return errorResponse(error, 500);
        }
    }

    try {
        if (admin) {
            const result = await archiveStaffAuth(env, {
                targetUid: body.targetUid,
                userId: body.userId,
                archived: body.archived !== false,
                reason: body.reason || '',
                actorEmail: admin.email || ''
            });
            result.by = admin.email || admin.uid;
            result.mode = 'admin';
            return jsonResponse({ ok: true, result }, 200);
        }

        // 一般員工：僅可封存本人，不可自我復職
        if (body.archived === false) {
            const err = new Error('復職需由診所管理員操作');
            err.status = 403;
            throw err;
        }
        if (!body.targetUid || String(body.targetUid) !== String(claims.sub)) {
            const err = new Error('僅可封存自己的帳號');
            err.status = 403;
            throw err;
        }

        // userId 由後端自行解析，不採信客户端傳入值
        const { userId } = await resolveStaffUser(env, claims);
        const result = await archiveStaffAuth(env, {
            targetUid: claims.sub,
            userId,
            archived: true,
            selfService: true,
            reason: body.reason || '',
            actorEmail: claims.email || ''
        });
        result.by = claims.email || claims.sub;
        result.mode = 'self';
        return jsonResponse({ ok: true, result }, 200);
    } catch (error) {
        return errorResponse(error, error.status === 403 || error.status === 404 ? error.status : 500);
    }
}
