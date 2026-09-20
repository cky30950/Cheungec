/* ============================================================
 * POST /api/push/unsubscribe
 * ------------------------------------------------------------
 * 取消此裝置的推播訂閱。僅允許訂閱擁有者本人（userId 比對）。
 *
 * 請求（JSON，需 Bearer Firebase ID Token）：
 *   { "endpoint": "https://fcm.googleapis.com/fcm/send/..." }
 * ============================================================ */

import { authenticateStaff } from '../attachments/lib/auth.js';
import { jsonResponse, optionsResponse } from '../backup/lib/http.js';
import { getSubscriptionByEndpoint, deleteSubscription } from './lib/push-store.js';

export const onRequestOptions = () => optionsResponse();

export async function onRequestPost(context) {
    const { request, env } = context;
    try {
        const auth = await authenticateStaff(request, env);

        let body;
        try {
            body = await request.json();
        } catch (_e) {
            return jsonResponse({ error: 'INVALID_REQUEST', message: '請求內容必須為 JSON' }, 400);
        }

        const endpoint = String(body && body.endpoint || '').trim();
        if (!/^https:\/\//.test(endpoint) || endpoint.length > 4096) {
            return jsonResponse({
                error: 'INVALID_ENDPOINT',
                message: '訂閱端點格式不正確'
            }, 400);
        }

        const existing = await getSubscriptionByEndpoint(env, endpoint);
        if (existing && String(existing.userId || '') !== String(auth.uid)) {
            return jsonResponse({
                error: 'FORBIDDEN',
                message: '無法取消他人裝置的訂閱'
            }, 403);
        }

        const result = await deleteSubscription(env, endpoint);
        return jsonResponse({ success: true, deleted: result.deleted });
    } catch (error) {
        const status = Number(error.status) > 0 ? Number(error.status) : 500;
        return jsonResponse({
            error: status === 401 ? 'UNAUTHORIZED' : 'UNSUBSCRIBE_FAILED',
            message: error.message || '取消推播訂閱失敗'
        }, status);
    }
}
