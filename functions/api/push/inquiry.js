/* ============================================================
 * POST /api/push/inquiry
 * ------------------------------------------------------------
 * 病人在公開 inquiry 頁成功寫入 inquiries/{id} 後呼叫（無登入）：
 * 由後端以 Service Account 驗單存在且為 15 分鐘內新建，再向所有
 * new_inquiry 訂閱者派送推播。以文件 ID 去重，重複呼叫冪等。
 *
 * 這取代舊的每分鐘 cron 掃描：遞交當下即時送達，不依賴排程。
 *
 * 防濫用：
 *   - 匿名端點每 IP 每分鐘限流（inquiry 桶，預設 8 次）
 *   - 不接受姓名／文案等客户端內容，通知內文只取自 SA 讀到的文件
 *   - 舊／不存在文件一律不送
 *
 * 請求：{ "id": "<inquiries 文件 ID>" }
 * 回應：{ ok:true, deduped?, notified, targets } 或 { ok:true, skipped }
 * ============================================================ */

import { jsonResponse, optionsResponse } from '../backup/lib/http.js';
import { enforceAnonRateLimit } from '../_lib/rate-limit.js';
import { notifyNewInquiry } from './lib/inquiry-notify.js';

export const onRequestOptions = () => optionsResponse();

export async function onRequestPost(context) {
    const { request, env } = context;
    try {
        const limited = await enforceAnonRateLimit(request, env, 'inquiry');
        if (limited) return limited;

        let body;
        try {
            body = await request.json();
        } catch (_e) {
            return jsonResponse({ error: 'INVALID_REQUEST', message: '請求內容必須為 JSON' }, 400);
        }

        const result = await notifyNewInquiry(env, body && body.id);
        // not_found／stale 等不應成為列舉通道：對客户端一律回 200
        return jsonResponse(Object.assign({ ok: true }, result));
    } catch (error) {
        const status = Number(error && error.status) > 0 ? Number(error.status) : 500;
        if (status >= 500) {
            console.error('新預診推播派送失敗:', error && error.message ? error.message : error);
        }
        return jsonResponse({
            error: status === 400 ? 'INVALID_INQUIRY_ID' : 'INQUIRY_NOTIFY_FAILED',
            message: (error && error.message) || '通知派送失敗'
        }, status);
    }
}
