/* ============================================================
 * POST /api/push/notify
 * ------------------------------------------------------------
 * 由前端於事件發生當下呼叫：聊天新訊息或掛號狀態轉換。
 * 認證：有效員工 Bearer Token；事件解析、收件篩選、去重與淨化
 * 皆在 lib/notify-lib.js。
 *
 * 請求（JSON）：
 *   聊天：{kind:'chat', channel, messageKey, senderId, senderName, recipientUid?}
 *   掛號：{kind:'appointment', event, appointmentId, patientName, appointmentDoctor?}
 *
 * 回應：{deduped, notified, targets, results}
 * ============================================================ */

import { authenticateStaff } from '../attachments/lib/auth.js';
import { jsonResponse, optionsResponse } from '../backup/lib/http.js';
import { processNotify } from './lib/notify-lib.js';

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

        const result = await processNotify(env, auth, body);
        return jsonResponse(result);
    } catch (error) {
        const status = Number(error.status) > 0 ? Number(error.status) : 500;
        return jsonResponse({
            error: status === 401 ? 'UNAUTHORIZED' : (error.code || 'NOTIFY_FAILED'),
            message: error.message || '通知派送失敗'
        }, status);
    }
}
