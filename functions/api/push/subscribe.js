/* ============================================================
 * POST /api/push/subscribe
 * ------------------------------------------------------------
 * 建立或更新此裝置的推播訂閱（冪等 upsert）。
 *
 * 請求（JSON，需 Bearer Firebase ID Token）：
 *   {
 *     "endpoint": "https://fcm.googleapis.com/fcm/send/...",
 *     "keys": { "p256dh": "...", "auth": "..." },
 *     "events": ["chat_public", ...]   // 選填，限事件白名單
 *   }
 * ============================================================ */

import { authenticateStaff, resolveUserData } from '../attachments/lib/auth.js';
import { jsonResponse, optionsResponse } from '../backup/lib/http.js';
import { upsertSubscription } from './lib/push-store.js';
import { isAllowedEvent } from './lib/events.js';

// base64url 字串（無 padding）；p256dh 約 87 字、auth 約 22 字
const BASE64URL = /^[A-Za-z0-9_-]{16,256}$/;

// 已知瀏覽器推送服務主機（防 SSRF：避免伺服器被導向任意 https 主機）
const PUSH_HOST_SUFFIXES = [
    'fcm.googleapis.com',
    'updates.push.services.mozilla.com',
    'push.apple.com',
    'notify.windows.com'
];

function isAllowedPushHost(endpoint) {
    let host;
    try {
        host = new URL(endpoint).hostname;
    } catch (_e) {
        return false;
    }
    return PUSH_HOST_SUFFIXES.some((h) => host === h || host.endsWith('.' + h));
}

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
                message: '訂閱端點格式不正確（必須為 https 網址）'
            }, 400);
        }
        if (!isAllowedPushHost(endpoint)) {
            return jsonResponse({
                error: 'UNTRUSTED_PUSH_HOST',
                message: '訂閱端點不屬於已知瀏覽器推送服務'
            }, 400);
        }

        const keys = body && body.keys;
        const p256dh = String(keys && keys.p256dh || '').trim();
        const authSecret = String(keys && keys.auth || '').trim();
        if (!BASE64URL.test(p256dh) || !BASE64URL.test(authSecret)) {
            return jsonResponse({
                error: 'INVALID_KEYS',
                message: '訂閱金鑰格式不正確（p256dh / auth）'
            }, 400);
        }

        let events = null;
        if (body.events !== undefined) {
            if (!Array.isArray(body.events)) {
                return jsonResponse({ error: 'INVALID_EVENTS', message: 'events 必須為陣列' }, 400);
            }
            events = body.events.map((e) => String(e)).filter(Boolean);
            // 白名單校驗：未知事件一律拒絕
            if (events.some((e) => !isAllowedEvent(e))) {
                return jsonResponse({
                    error: 'INVALID_EVENTS',
                    message: '包含不允許的推播事件'
                }, 400);
            }
        }

        // username 暫以 ID Token name claim → email 前綴；
        // 解析到 users 文件後改為系統員工帳號（候診篩選 appointmentDoctor 需與之一致）
        let username = String(
            (auth.claims && (auth.claims.name || auth.claims.display_name))
            || (auth.email ? auth.email.split('@')[0] : '')
        );

        // 由後端解析員工資料（職位用於完成通知篩選、username 用於候診篩選）；失敗不阻斷訂閱
        let position = '';
        try {
            const profile = await resolveUserData(auth.claims, env);
            if (profile) {
                if (profile.position) position = String(profile.position);
                if (profile.username) username = String(profile.username);
            }
        } catch (_profileErr) {
            console.warn('解析員工職位失敗:', _profileErr.message);
        }

        const result = await upsertSubscription(env, {
            endpoint,
            keys: { p256dh, auth: authSecret },
            userId: auth.uid,
            userEmail: auth.email,
            username,
            position,
            language: String(body.language || 'zh'),
            userAgent: request.headers.get('user-agent') || '',
            events: events || undefined
        });

        return jsonResponse({ success: true, created: result.created });
    } catch (error) {
        const status = Number(error.status) > 0 ? Number(error.status) : 500;
        return jsonResponse({
            error: status === 401 ? 'UNAUTHORIZED' : 'SUBSCRIBE_FAILED',
            message: error.message || '建立推播訂閱失敗'
        }, status);
    }
}
