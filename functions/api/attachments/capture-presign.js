/* ============================================================
 * POST /api/attachments/capture-presign
 * ------------------------------------------------------------
 * 手機代拍頁用（不需 Firebase 登入，憑 session sid+token）。
 * 驗證 session 後，以 session 建立者的權威身分簽發 R2 預簽
 * URL 並建立 patientAttachments 中繼文件（uploadedByUid 為
 * 電腦端發起醫師，檔案額外標記 relaySessionId）。
 *
 * 請求：{ sid, token, category, contentType, contentLength?,
 *         width?, height? }
 * 回應：同 /api/attachments/presign
 * ============================================================ */

import { jsonResponse, optionsResponse } from '../backup/lib/http.js';
import {
    issuePresignedUpload,
    fsStr,
    StoreError
} from './lib/attachments-store.js';
import {
    validateCaptureSession,
    MODE_CATEGORIES,
    SessionError
} from './lib/capture-session.js';

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

        const category = String(body && body.category || '').trim();
        const allowed = MODE_CATEGORIES[s.mode] || MODE_CATEGORIES.all;
        if (!allowed.has(category)) {
            return jsonResponse({
                error: 'CATEGORY_NOT_ALLOWED',
                message: '此拍照連結不允許該附件分類'
            }, 400);
        }

        const result = await issuePresignedUpload(env, {
            uid: s.createdByUid,
            uploaderName: s.createdByName,
            patientId: s.patientId,
            patientName: s.patientName,
            appointmentId: s.appointmentId,
            consultationId: s.consultationId,
            sessionId: '',
            consultationDate: s.consultationDate,
            category,
            contentType: body && body.contentType,
            contentLength: body && body.contentLength,
            width: body && body.width,
            height: body && body.height,
            extraFields: { relaySessionId: fsStr(s.sid) }
        });

        return jsonResponse(result);
    } catch (error) {
        if (error instanceof SessionError) {
            return jsonResponse({ error: error.code, message: error.message }, error.status);
        }
        if (error instanceof StoreError) {
            return jsonResponse({ error: error.code, message: error.message }, error.status);
        }
        return jsonResponse({
            error: 'CAPTURE_PRESIGN_FAILED',
            message: error.message || '簽發拍照上傳 URL 失敗'
        }, 500);
    }
}
