/* ============================================================
 * POST /api/attachments/presign
 * ------------------------------------------------------------
 * 為病歷附件（舌照／體檢報告／其他圖片）簽發兩組 R2
 * Presigned PUT URL（原圖 original、縮圖 thumb 各一組），
 * 瀏覽器取得後直接 PUT 至 R2，不經本 Function 中傳檔案。
 *
 * 需 Bearer Firebase ID Token；共用簽發邏輯見
 * ./lib/attachments-store.js（手機代拍端點同模組）。
 * ============================================================ */

import { authenticateStaff, resolveUserData } from './lib/auth.js';
import { jsonResponse, optionsResponse } from '../backup/lib/http.js';
import { issuePresignedUpload, StoreError } from './lib/attachments-store.js';

export const onRequestOptions = () => optionsResponse();

export async function onRequestPost(context) {
    const { request, env } = context;
    try {
        const auth = await authenticateStaff(request, env);

        let body;
        try {
            body = await request.json();
        } catch (_e) {
            return jsonResponse({
                error: 'INVALID_REQUEST',
                message: '請求內容必須為 JSON'
            }, 400);
        }

        // 解析上傳者名稱（best-effort，失敗以 email 取代）——uid 一律以 Token 為準
        let uploaderName = auth.email || '';
        try {
            const me = await resolveUserData(auth.claims, env);
            if (me && (me.name || me.username)) {
                uploaderName = String(me.name || me.username).slice(0, 100);
            }
        } catch (_nameErr) {
            console.warn('解析上傳者名稱失敗，改用 email:', _nameErr.message);
        }

        const result = await issuePresignedUpload(env, {
            uid: auth.uid,
            uploaderName,
            patientId: body && body.patientId,
            patientName: body && body.patientName,
            appointmentId: body && body.appointmentId,
            consultationId: body && body.consultationId,
            sessionId: body && body.sessionId,
            consultationDate: body && body.consultationDate,
            category: body && body.category,
            contentType: body && body.contentType,
            contentLength: body && body.contentLength,
            width: body && body.width,
            height: body && body.height
        });

        return jsonResponse(result);
    } catch (error) {
        if (error instanceof StoreError) {
            return jsonResponse({ error: error.code, message: error.message }, error.status);
        }
        const status = Number(error.status) > 0 ? Number(error.status) : 500;
        return jsonResponse({
            error: status === 401 ? 'UNAUTHORIZED' : 'PRESIGN_FAILED',
            message: error.message || '簽發上傳 URL 失敗'
        }, status);
    }
}
