/* ============================================================
 * POST /api/agora-token/room-consent
 * ------------------------------------------------------------
 * 病人端（無 Firebase 登入）提交視像診症電子同意書：
 * 須持有效入房 session（X-Room-Session），後端驗證 session 後
 * 以 Service Account 寫入 videoConsents/<頻道>。客戶端 Firestore
 * 規則全面拒絕寫入，故同意記錄無法被匿名偽造。
 *
 * 請求：
 *   Header: X-Room-Session: <入房 session token>
 *   { "channel": "tcm-consult-12345",
 *     "appointmentId": "12345",
 *     "version": "v1",
 *     "clientAt": "<ISO>" }
 * 回應：
 *   { "ok": true, "version": "v1", "reaffirmed": false }
 * ============================================================ */

import { validateRoomSession } from './lib/room-pass.js';
import { writeChannelConsent } from './lib/consent.js';
import { jsonResponse, optionsResponse } from '../backup/lib/http.js';
import { enforceAnonRateLimit } from '../_lib/rate-limit.js';

const CHANNEL_PATTERN = /^[a-zA-Z0-9!#$%&()+\-:;<=>?@[\]^_{|}~,]{1,64}$/;

export const onRequestOptions = () => optionsResponse();

export async function onRequestPost(context) {
    const { request, env } = context;
    try {
        // 匿名端點：每 IP 每分鐘限流
        const limited = await enforceAnonRateLimit(request, env, 'rtc');
        if (limited) return limited;

        const sessionToken = request.headers.get('X-Room-Session') || '';
        if (!sessionToken.trim()) {
            return jsonResponse({ error: 'UNAUTHORIZED', message: '診間連線階段不存在，請重新開啟連結' }, 401);
        }

        let body;
        try {
            body = await request.json();
        } catch (_e) {
            return jsonResponse({ error: 'INVALID_REQUEST', message: '請求內容必須為 JSON' }, 400);
        }

        const channel = String(body && body.channel || '').trim();
        if (!CHANNEL_PATTERN.test(channel)) {
            return jsonResponse({ error: 'BAD_CHANNEL', message: '頻道名稱格式不正確' }, 400);
        }
        const allowedPrefix = env && env.AGORA_CHANNEL_PREFIX ? String(env.AGORA_CHANNEL_PREFIX) : '';
        if (allowedPrefix && !channel.startsWith(allowedPrefix)) {
            return jsonResponse({ error: 'CHANNEL_NOT_ALLOWED', message: '頻道不在允許前綴範圍內' }, 403);
        }

        // session 必須有效，且綁定頻道與請求頻道完全一致
        await validateRoomSession(env, sessionToken, channel);

        const result = await writeChannelConsent(env, {
            channel: channel,
            appointmentId: String(body && body.appointmentId || ''),
            clientVersion: String(body && body.version || ''),
            clientAt: String(body && body.clientAt || ''),
            // UA 取自請求標頭（客户端無法在 body 以外偽造得更可信）
            userAgent: request.headers.get('User-Agent') || ''
        });

        return jsonResponse(Object.assign({ ok: true }, result));
    } catch (error) {
        const status = Number(error && error.status) > 0 ? Number(error.status) : 500;
        const code = error && error.code
            ? error.code
            : (status === 401 ? 'UNAUTHORIZED' : 'ROOM_CONSENT_FAILED');
        console.error('寫入入房同意書失敗:', error && error.message ? error.message : error);
        return jsonResponse({
            error: code,
            message: (error && error.message) || '儲存同意書失敗'
        }, status);
    }
}
