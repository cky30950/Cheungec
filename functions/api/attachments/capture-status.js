/* ============================================================
 * POST /api/attachments/capture-status
 * ------------------------------------------------------------
 * 手機開啟拍照頁時查詢 session 是否有效（不需登入，憑 token）。
 * 請求：{ sid, token }
 * 回應：{ valid, patientName, mode, remainingSec, expiresAt }
 * ============================================================ */

import { jsonResponse, optionsResponse } from '../backup/lib/http.js';
import { validateCaptureSession, SessionError } from './lib/capture-session.js';

export const onRequestOptions = () => optionsResponse();

export async function onRequestPost(context) {
    const { request, env } = context;
    try {
        let body;
        try {
            body = await request.json();
        } catch (_e) {
            return jsonResponse({ error: 'INVALID_REQUEST', message: '請求內容必須為 JSON' }, 400);
        }

        const s = await validateCaptureSession(env, body && body.sid, body && body.token);
        const expiresMs = s.expiresAt && s.expiresAt.seconds
            ? s.expiresAt.seconds * 1000
            : Date.now();

        return jsonResponse({
            valid: true,
            patientName: s.patientName || '',
            mode: s.mode || 'all',
            expiresAt: new Date(expiresMs).toISOString(),
            remainingSec: Math.max(0, Math.round((expiresMs - Date.now()) / 1000))
        });
    } catch (error) {
        if (error instanceof SessionError) {
            return jsonResponse({ valid: false, error: error.code, message: error.message }, error.status);
        }
        return jsonResponse({ valid: false, error: 'CAPTURE_STATUS_FAILED', message: error.message || '查詢拍照連結失敗' }, 500);
    }
}
