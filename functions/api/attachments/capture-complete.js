/* ============================================================
 * POST /api/attachments/capture-complete
 * ------------------------------------------------------------
 * 手機完成 R2 直傳後，憑 sid+token 將中繼文件標記為 ready
 * （手機頁無 Firebase SDK，無法客戶端 PATCH，故由此端點以
 * Service Account 處理）。
 *
 * 請求：{ sid, token, fileId }
 * ============================================================ */

import { jsonResponse, optionsResponse } from '../backup/lib/http.js';
import { getAccessToken } from '../backup/lib/google-auth.js';
import { FirestoreClient } from '../backup/lib/firestore.js';
import { COLLECTION } from './lib/attachments-store.js';
import { validateCaptureSession, SessionError } from './lib/capture-session.js';

const SAFE_FILE_ID = /^[A-Za-z0-9_-]{1,128}$/;

export const onRequestOptions = () => optionsResponse();

async function markReady(env, fileId) {
    const access = await getAccessToken(env);
    const base = `https://firestore.googleapis.com/v1/projects/${access.projectId}` +
        `/databases/(default)/documents/${COLLECTION}/${encodeURIComponent(fileId)}`;
    const fields = ['uploadStatus', 'updatedAt']
        .map((f) => 'updateMask.fieldPaths=' + encodeURIComponent(f))
        .join('&');
    const nowIso = new Date().toISOString();
    const response = await fetch(`${base}?${fields}`, {
        method: 'PATCH',
        headers: {
            'Authorization': `Bearer ${access.token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            fields: {
                uploadStatus: { stringValue: 'ready' },
                updatedAt: { timestampValue: nowIso }
            }
        })
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`附件狀態更新失敗 (HTTP ${response.status}): ${text.slice(0, 200)}`);
    }
}

export async function onRequestPost(context) {
    const { request, env } = context;
    try {
        let body;
        try {
            body = await request.json();
        } catch (_e) {
            return jsonResponse({ error: 'INVALID_REQUEST', message: '請求內容必須為 JSON' }, 400);
        }

        const fileId = String(body && body.fileId || '').trim();
        if (!SAFE_FILE_ID.test(fileId)) {
            return jsonResponse({ error: 'INVALID_FILE_ID', message: '檔案 ID 格式不正確' }, 400);
        }

        const s = await validateCaptureSession(env, body && body.sid, body && body.token);

        const access = await getAccessToken(env);
        const client = new FirestoreClient(access.token, access.projectId, env.FIREBASE_RTDB_URL || '');
        const doc = await client.getDocument(`${COLLECTION}/${encodeURIComponent(fileId)}`);
        if (!doc || !doc.data) {
            return jsonResponse({ error: 'NOT_FOUND', message: '找不到該附件記錄' }, 404);
        }
        // 只允許把同一個代拍 session 產生的文件標就緒
        if (String(doc.data.relaySessionId || '') !== String(s.sid)) {
            return jsonResponse({ error: 'FORBIDDEN', message: '附件不屬於此拍照連結' }, 403);
        }
        if (doc.data.deleted === true) {
            return jsonResponse({ error: 'NOT_FOUND', message: '附件已被刪除' }, 404);
        }

        await markReady(env, fileId);
        return jsonResponse({ success: true });
    } catch (error) {
        if (error instanceof SessionError) {
            return jsonResponse({ error: error.code, message: error.message }, error.status);
        }
        return jsonResponse({
            error: 'CAPTURE_COMPLETE_FAILED',
            message: error.message || '更新附件狀態失敗'
        }, 500);
    }
}
