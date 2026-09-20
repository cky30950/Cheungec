/* ============================================================
 * GET /api/push/config
 * ------------------------------------------------------------
 * 回傳 Web Push 公開設定（需 Bearer Firebase ID Token）：
 *   { vapidPublicKey, configured }
 * VAPID_PUBLIC_KEY 未設定時 configured=false，前端顯示設定提示。
 * ============================================================ */

import { authenticateStaff } from '../attachments/lib/auth.js';
import { jsonResponse, optionsResponse } from '../backup/lib/http.js';

export const onRequestOptions = () => optionsResponse();

export async function onRequestGet(context) {
    const { request, env } = context;
    try {
        await authenticateStaff(request, env);
        const vapidPublicKey = String(env.VAPID_PUBLIC_KEY || '');
        return jsonResponse({
            vapidPublicKey,
            configured: Boolean(vapidPublicKey)
        });
    } catch (error) {
        const status = Number(error.status) > 0 ? Number(error.status) : 500;
        return jsonResponse({
            error: status === 401 ? 'UNAUTHORIZED' : 'CONFIG_FAILED',
            message: error.message || '讀取推播設定失敗'
        }, status);
    }
}
