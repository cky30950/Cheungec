/* ============================================================
 * GET /api/push/subscription?endpoint=...
 * ------------------------------------------------------------
 * 讀取此裝置訂閱目前的事件偏好與語言（供跨裝置同步 UI）。
 * 僅訂閱擁有者本人可讀。
 * ============================================================ */

import { authenticateStaff } from '../attachments/lib/auth.js';
import { jsonResponse, optionsResponse } from '../backup/lib/http.js';
import { getSubscriptionByEndpoint } from './lib/push-store.js';

export const onRequestOptions = () => optionsResponse();

export async function onRequestGet(context) {
    const { request, env } = context;
    try {
        const auth = await authenticateStaff(request, env);

        const endpoint = String(
            new URL(request.url).searchParams.get('endpoint') || ''
        ).trim();
        if (!/^https:\/\//.test(endpoint)) {
            return jsonResponse({ error: 'INVALID_ENDPOINT', message: 'endpoint 格式不正確' }, 400);
        }

        const sub = await getSubscriptionByEndpoint(env, endpoint);
        if (!sub) {
            return jsonResponse({ error: 'NOT_FOUND', message: '找不到訂閱記錄' }, 404);
        }
        if (String(sub.userId || '') !== String(auth.uid)) {
            return jsonResponse({ error: 'FORBIDDEN', message: '無法讀取他人裝置' }, 403);
        }

        return jsonResponse({
            events: Array.isArray(sub.events) ? sub.events : [],
            language: sub.language || 'zh',
            position: sub.position || ''
        });
    } catch (error) {
        const status = Number(error.status) > 0 ? Number(error.status) : 500;
        return jsonResponse({
            error: status === 401 ? 'UNAUTHORIZED' : 'GET_SUBSCRIPTION_FAILED',
            message: error.message || '讀取訂閱失敗'
        }, status);
    }
}
