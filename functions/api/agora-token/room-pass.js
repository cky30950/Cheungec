/* ============================================================
 * POST /api/agora-token/room-pass
 * ------------------------------------------------------------
 * 醫師端（已登入員工）為指定 Agora 頻道核發一組病人入房 pass，
 * 供組成 video/room.html?apt=<掛號>#k=<pass> 連結（pass 放 fragment
 * 不進伺服器日誌；病人開頁後以 POST room-session 換發 session token）。
 *
 * 請求（需 Authorization: Bearer <Firebase ID Token>）：
 *   { "channel": "tcm-consult-12345" }
 *   { "channel": "tcm-consult-12345", "action": "revoke" }  // 診症完成批次作廢
 * 回應：
 *   { "pass": "<64 碼 hex>", "expiresAt": "<ISO>" }
 *   { "ok": true, "revoked": { "passes": 1, "sessions": 1 } }
 *
 * pass 只存 SHA-256 hash 於 Firestore（videoRoomPasses），
 * 並與頻道名稱綁定；病人無法用它進入其他診間。
 * ============================================================ */

import { authenticateStaff, resolveUserData } from '../attachments/lib/auth.js';
import { jsonResponse, optionsResponse } from '../backup/lib/http.js';
import { createRoomPass, revokeChannelRoomAccess } from './lib/room-pass.js';

// 與 [[path]].js 之 CHANNEL_PATTERN 一致（Agora 頻道名字元集，長度 ≤ 64）
const CHANNEL_PATTERN = /^[a-zA-Z0-9!#$%&()+\-:;<=>?@[\]^_{|}~,]{1,64}$/;

export const onRequestOptions = () => optionsResponse();

export async function onRequestPost(context) {
    const { request, env } = context;
    try {
        const auth = await authenticateStaff(request, env);

        // 只允許醫師核發入房 pass（與前端 isDoctorUser 相同口徑：職位含「醫師」）
        const userData = await resolveUserData(auth.claims, env);
        const position = String((userData && userData.position) || '');
        if (position.indexOf('醫師') === -1) {
            return jsonResponse({
                error: 'FORBIDDEN',
                message: '僅限醫師帳號核發診間連結'
            }, 403);
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

        // 診症完成：作廢該頻道所有未過期 pass 與有效入房 session
        if (body && body.action === 'revoke') {
            const revoked = await revokeChannelRoomAccess(env, channel);
            return jsonResponse({ ok: true, revoked: revoked });
        }

        const { pass, expiresAt } = await createRoomPass(env, {
            channel,
            createdByUid: auth.uid,
            createdByName: auth.email || ''
        });

        return jsonResponse({ pass, expiresAt: expiresAt.toISOString() });
    } catch (error) {
        const status = Number(error && error.status) > 0 ? Number(error.status) : 500;
        const code = status === 401 ? 'UNAUTHORIZED' : 'ROOM_PASS_FAILED';
        console.error('核發入房 pass 失敗:', error && error.message ? error.message : error);
        return jsonResponse({
            error: code,
            message: (error && error.message) || '核發入房 pass 失敗'
        }, status);
    }
}
