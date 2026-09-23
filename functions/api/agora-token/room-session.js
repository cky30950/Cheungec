/* ============================================================
 * POST /api/agora-token/room-session
 * ------------------------------------------------------------
 * 病人端（無 Firebase 登入）以入房 pass 換發短 TTL session token：
 * pass 隨後被標記為 consumed，不可重用；同一瀏覽器把 session
 * token 存於 sessionStorage，供重新整理／通話中斷後重返診間。
 *
 * 請求：
 *   { "channel": "tcm-consult-12345", "pass": "<64 碼 hex>" }
 * 回應：
 *   { "sessionToken": "v1.xxx.yyy", "uid": 1234567,
 *     "expiresAt": "<ISO>" }
 *
 * pass 必須放在 POST body（不要放 query，以免進入伺服器日誌）。
 * ============================================================ */

import { exchangeRoomPass } from './lib/room-pass.js';
import { jsonResponse, optionsResponse } from '../backup/lib/http.js';
import { enforceAnonRateLimit } from '../_lib/rate-limit.js';

// 與 [[path]].js 之 CHANNEL_PATTERN 一致（Agora 頻道名字元集，長度 ≤ 64）
const CHANNEL_PATTERN = /^[a-zA-Z0-9!#$%&()+\-:;<=>?@[\]^_{|}~,]{1,64}$/;

export const onRequestOptions = () => optionsResponse();

export async function onRequestPost(context) {
    const { request, env } = context;
    try {
        // 匿名端點：每 IP 每分鐘限流，避免列舉／爆破 pass
        const limited = await enforceAnonRateLimit(request, env, 'rtc');
        if (limited) return limited;

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

        const result = await exchangeRoomPass(env, body && body.pass, channel);
        return jsonResponse({
            sessionToken: result.sessionToken,
            uid: result.uid,
            expiresAt: result.expiresAt.toISOString()
        });
    } catch (error) {
        const status = Number(error && error.status) > 0 ? Number(error.status) : 500;
        const code = error && error.code
            ? error.code
            : (status === 401 ? 'UNAUTHORIZED' : 'ROOM_SESSION_FAILED');
        console.error('換發入房 session 失敗:', error && error.message ? error.message : error);
        return jsonResponse({
            error: code,
            message: (error && error.message) || '換發入房 session 失敗'
        }, status);
    }
}
