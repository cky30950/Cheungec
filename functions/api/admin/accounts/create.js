/* ============================================================
 * POST /api/admin/accounts/create
 * 伺服器端建立員工 Firebase Auth 帳號（管理員）。
 *
 * 為何不走客戶端 createUserWithEmailAndPassword：
 * 該 API 會把「管理員自己的瀏覽器工作階段」切換成新帳號，
 * 新帳號沒有 admin claims，後續 users 文件寫入會被 Rules 拒絕。
 *
 * Body: { email: string, password: string(≥6), displayName?: string }
 * 回應: { ok, uid, email }
 * ============================================================ */

import { createStaffAuth } from '../lib/claims.js';
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

        const email = String(body.email || '').trim();
        const password = String(body.password || '');
        if (!email || !password) {
            return jsonResponse({ ok: false, message: '缺少電郵或密碼' }, 400);
        }
        if (password.length < 6) {
            return jsonResponse({ ok: false, message: '密碼長度至少 6 位數' }, 400);
        }

        const result = await createStaffAuth(env, {
            email,
            password,
            displayName: body.displayName || ''
        });
        result.createdBy = admin.email || admin.uid;
        return jsonResponse({ ok: true, ...result }, 200);
    } catch (error) {
        // EMAIL_EXISTS 等 API 錯誤維持 400，其餘 500
        const msg = String(error.message || '');
        const status = /EMAIL_EXISTS|EMAIL_NOT_FOUND|INVALID_EMAIL|WEAK_PASSWORD|TOO_MANY|400/i.test(msg)
            ? 400
            : (error.status === 403 ? 403 : 500);
        return errorResponse(Object.assign({}, error, { status }), status);
    }
}
