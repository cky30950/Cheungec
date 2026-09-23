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
import { enforceAnonRateLimit } from '../_lib/rate-limit.js';
import {
    issuePresignedUpload,
    fsStr,
    StoreError
} from './lib/attachments-store.js';
import {
    validateCaptureSession,
    consumeUploadSlot,
    MODE_CATEGORIES,
    SessionError
} from './lib/capture-session.js';

export const onRequestOptions = () => optionsResponse();

export async function onRequestPost(context) {
    const { request, env } = context;

    // 匿名端點：每 IP 每分鐘限流（須在任何 Firestore 讀取之前）
    const limited = await enforceAnonRateLimit(request, env, 'capture');
    if (limited) return limited;

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

        // 原子預佔上傳配額（每個 QR session 預設最多 20 張），
        // 須在簽發 R2 URL 之前，外洩連結也無法無限上傳
        const slot = await consumeUploadSlot(env, s.sid);
        if (!slot.allowed) {
            return jsonResponse({
                error: 'CAPTURE_UPLOAD_LIMIT',
                message: `此拍照連結已達上傳張數上限（${slot.limit} 張），請在電腦端重新產生拍照連結`,
                used: slot.used,
                limit: slot.limit
            }, 429);
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

        return jsonResponse(Object.assign({
            remainingUploads: Math.max(0, slot.limit - slot.used),
            uploadLimit: slot.limit
        }, result));
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
