/* ============================================================
 * POST /api/attachments/delete
 * ------------------------------------------------------------
 * 刪除病歷附件：先驗權限，再以 R2 bucket binding 刪除
 * original/thumb 兩個物件，最後將 Firestore 文件軟刪除。
 *
 * 請求（JSON，需 Bearer Firebase ID Token）：
 *   { "fileId": "uuid" }
 *
 * 權限：上傳者本人（patientAttachments.uploadedByUid == uid）
 *       或 users 集合 position === '診所管理'。
 *
 * 需求：
 *   - R2 bucket binding：ATTACHMENTS_BUCKET
 *   - FIREBASE_SERVICE_ACCOUNT Secret（既有）
 * ============================================================ */

import { authenticateStaff, resolveUserData } from './lib/auth.js';
import { jsonResponse, optionsResponse } from '../backup/lib/http.js';
import { getAccessToken } from '../backup/lib/google-auth.js';
import { FirestoreClient } from '../backup/lib/firestore.js';

const SAFE_FILE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const COLLECTION = 'patientAttachments';

export const onRequestOptions = () => optionsResponse();

async function softDeleteDocument(env, fileId, deletedByUid, deletedByName) {
    const auth = await getAccessToken(env);
    const base = `https://firestore.googleapis.com/v1/projects/${auth.projectId}` +
        `/databases/(default)/documents/${COLLECTION}/${encodeURIComponent(fileId)}`;
    // updateMask 是 DocumentMask 訊息類型，gRPC transcoding 要求以
    // 重複 query 參數 updateMask.fieldPaths=<field> 傳遞（不可寫成 updateMask=a,b）
    const maskFields = ['deleted', 'deletedAt', 'deletedByUid', 'deletedByName', 'updatedAt'];
    const url = `${base}?${maskFields
        .map((f) => 'updateMask.fieldPaths=' + encodeURIComponent(f))
        .join('&')}`;
    const nowIso = new Date().toISOString();
    const response = await fetch(url, {
        method: 'PATCH',
        headers: {
            'Authorization': `Bearer ${auth.token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            fields: {
                deleted: { booleanValue: true },
                deletedAt: { timestampValue: nowIso },
                deletedByUid: { stringValue: deletedByUid },
                deletedByName: { stringValue: deletedByName || '' },
                // 觸發 R2 增量備份（以 updatedAt 判斷文件變更）
                updatedAt: { timestampValue: nowIso }
            }
        })
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Firestore 軟刪失敗 (HTTP ${response.status}): ${text.slice(0, 200)}`);
    }
}

export async function onRequestPost(context) {
    const { request, env } = context;
    try {
        const auth = await authenticateStaff(request, env);

        if (!env.ATTACHMENTS_BUCKET || typeof env.ATTACHMENTS_BUCKET.delete !== 'function') {
            return jsonResponse({
                error: 'ATTACHMENT_STORAGE_NOT_CONFIGURED',
                message: '附件儲存服務尚未完成設定（缺少 ATTACHMENTS_BUCKET 綁定）'
            }, 503);
        }

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

        const access = await getAccessToken(env);
        const client = new FirestoreClient(access.token, access.projectId, env.FIREBASE_RTDB_URL || '');
        const doc = await client.getDocument(`${COLLECTION}/${encodeURIComponent(fileId)}`);
        if (!doc) {
            return jsonResponse({ error: 'NOT_FOUND', message: '找不到該附件記錄' }, 404);
        }

        const data = doc.data || {};
        const isOwner = String(data.uploadedByUid || '') === String(auth.uid);
        let isAdmin = false;
        let currentUserData = null;
        if (!isOwner) {
            // 只在非本人時才需要查 users 文件，節省一次讀取
            currentUserData = await resolveUserData(auth.claims, env);
            isAdmin = !!currentUserData && String(currentUserData.position || '').trim() === '診所管理';
        }
        if (!isOwner && !isAdmin) {
            return jsonResponse({
                error: 'FORBIDDEN',
                message: '只有上傳者本人或診所管理可以刪除該附件'
            }, 403);
        }

        // Key 歸屬校驗：兩個 key 必須嚴格符合
        // attachments/<patientId>/<yyyymmdd>/<fileId>/(original|thumb).<ext>，
        // 避免被竄改文件後拿 binding 刪除桶內其他物件
        const pid = String(data.patientId || '');
        const safeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const keyPattern = new RegExp(
            '^attachments/' + safeRe(pid) + '/\\d{8}/' + safeRe(fileId) +
            '/(original|thumb)\\.[A-Za-z0-9]+$'
        );
        if (!pid) {
            return jsonResponse({
                error: 'INVALID_KEY_OWNERSHIP',
                message: '附件記錄缺少病人歸屬，已拒絕刪除'
            }, 400);
        }
        for (const field of ['originalKey', 'thumbKey']) {
            const key = String(data[field] || '');
            if (!key) continue;
            if (!keyPattern.test(key)) {
                return jsonResponse({
                    error: 'INVALID_KEY_OWNERSHIP',
                    message: '附件物件路徑與記錄不符，已拒絕刪除'
                }, 400);
            }
        }

        // R2 刪除（物件不存在不視為錯誤）。新上傳已無獨立縮圖，
        // thumbKey 與 originalKey 相同，故先去重再逐個刪除；
        // 舊記錄仍可能有兩個不同 key。
        const r2Errors = [];
        const keysToDelete = [...new Set(
            ['originalKey', 'thumbKey']
                .map((f) => String(data[f] || ''))
                .filter(Boolean)
        )];
        for (const key of keysToDelete) {
            try {
                await env.ATTACHMENTS_BUCKET.delete(key);
            } catch (r2Err) {
                r2Errors.push(`${key}: ${r2Err.message}`);
            }
        }
        if (r2Errors.length > 0) {
            // 伺服器端留痕：軟刪已完成但 R2 物件可能殘留，供日後重掃回收
            console.warn('Attachment R2 delete partial failure',
                JSON.stringify({ fileId, patientId: data.patientId, r2Errors }));
        }

        // 已軟刪文件屬冪等成功；否則寫入軟刪欄位
        if (!data.deleted) {
            let deleterName = auth.email || '';
            try {
                const me = currentUserData || await resolveUserData(auth.claims, env);
                deleterName = (me && (me.name || me.username)) || deleterName;
            } catch (_e) {}
            await softDeleteDocument(env, fileId, auth.uid, deleterName);
        }

        return jsonResponse({
            success: true,
            alreadyDeleted: !!data.deleted,
            r2Warnings: r2Errors
        });
    } catch (error) {
        const status = Number(error.status) > 0 ? Number(error.status) : 500;
        return jsonResponse({
            error: status === 401 ? 'UNAUTHORIZED' : 'DELETE_FAILED',
            message: error.message || '刪除附件失敗'
        }, status);
    }
}
