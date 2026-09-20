/* ============================================================
 * POST /api/push/test
 * ------------------------------------------------------------
 * 對指定裝置發送一則固定測試通知。僅允許訂閱擁有者本人。
 *
 * 請求（JSON，需 Bearer Firebase ID Token）：
 *   { "endpoint": "https://fcm.googleapis.com/fcm/send/..." }
 *
 * 回應：
 *   { delivered: true }
 *   { delivered: false, removed: true }   ← 端點失效，已自動清除
 * ============================================================ */

import { authenticateStaff } from '../attachments/lib/auth.js';
import { jsonResponse, optionsResponse } from '../backup/lib/http.js';
import { getSubscriptionByEndpoint } from './lib/push-store.js';
import { sendOne } from './lib/sender.js';

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

        const sub = await getSubscriptionByEndpoint(env, endpoint);
        if (!sub) {
            return jsonResponse({ error: 'NOT_FOUND', message: '找不到此裝置的訂閱記錄' }, 404);
        }
        if (String(sub.userId || '') !== String(auth.uid)) {
            return jsonResponse({
                error: 'FORBIDDEN',
                message: '無法對他人裝置發送測試通知'
            }, 403);
        }

        // 每次使用唯一 tag：固定 tag 會讓桌面瀏覽器以新通知靜默取代舊通知，
        // 不再彈出橫幅，造成「再按測試沒反應」的觀感。
        const sentAt = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const timeText =
            `${pad(sentAt.getHours())}:${pad(sentAt.getMinutes())}:${pad(sentAt.getSeconds())}`;

        const message = {
            title: '測試通知',
            body: `推播功能正常運作 ✓（${timeText}）`,
            url: '/system.html',
            tag: `push-test-${sentAt.getTime()}`,
            // 手動測試豁免：觀看頁面時也要能彈出，否則測試按鈕永遠無反應
            manualTest: true
        };
        const result = await sendOne(sub, message, env);

        if (!result.ok) {
            console.log('[push test] 未送達：' + JSON.stringify({
                host: new URL(sub.endpoint).host,
                status: result.status,
                reasonText: result.reasonText || null,
                removed: result.removed
            }));
        }

        return jsonResponse({
            delivered: result.ok,
            removed: result.removed,
            retryable: result.retryable,
            status: result.status,
            reason: result.reasonText || null
        });
    } catch (error) {
        const status = Number(error.status) > 0 ? Number(error.status) : 500;
        return jsonResponse({
            error: status === 401 ? 'UNAUTHORIZED' : 'TEST_FAILED',
            message: error.message || '發送測試通知失敗'
        }, status);
    }
}
