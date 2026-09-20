/* ============================================================
 * POST /api/attachments/presign
 * ------------------------------------------------------------
 * 為病歷附件（舌照／體檢報告／其他圖片）簽發兩組 R2
 * Presigned PUT URL（原圖 original、縮圖 thumb 各一組），
 * 瀏覽器取得後直接 PUT 至 R2，不經本 Function 中傳檔案。
 *
 * 請求（JSON，需 Bearer Firebase ID Token）：
 *   {
 *     "patientId": "abc123",
 *     "category": "tongue | report | other",
 *     "contentType": "image/jpeg | image/png | image/webp | image/gif",
 *     "contentLength": 123456   // 選填，用於提前拒絕超標圖片
 *   }
 *
 * 請求額外欄位（上下文，均為選填但強格式校驗）：
 *   patientName、appointmentId、consultationId、sessionId、
 *   consultationDate（YYYY-MM-DD）、width、height
 *
 * 本端點同時以 Service Account 建立 patientAttachments 中繼文件
 * （uploadStatus:'uploading'），uploadedByUid/uploadedByName 由已驗證
 * Token 權威寫入，客戶端無法偽造；用戶端直傳成功後 PATCH 為 ready。
 *
 * 回應 200：
 *   { fileId, category, maxBytes, expiresAt, publicBase,
 *     uploads: { original: {url,key,contentType},
 *               thumb:    {url,key,contentType} } }
 *
 * Cloudflare 環境變數：
 *   R2_ACCOUNT_ID、R2_ACCESS_KEY_ID、R2_SECRET_ACCESS_KEY、
 *   R2_ATTACHMENTS_BUCKET（桶名）、R2_PUBLIC_BASE（公開網域，可空）
 *   ATTACHMENT_URL_TTL（選填，預設 300）、
 *   ATTACHMENT_MAX_BYTES（選填，預設 15728640＝15MB）
 * ============================================================ */

import { buildPresignedPutUrl } from './lib/r2-sign.js';
import { authenticateStaff, resolveUserData } from './lib/auth.js';
import { getAccessToken } from '../backup/lib/google-auth.js';
import { jsonResponse, optionsResponse } from '../backup/lib/http.js';

const ALLOWED_CATEGORIES = new Set(['tongue', 'report', 'other']);
const CONTENT_TYPE_EXT = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif'
};
// Firestore 文件 ID 僅字母數字、底線、連字號
const SAFE_PATIENT_ID = /^[A-Za-z0-9_-]{1,128}$/;
const SAFE_OPT_ID = /^[A-Za-z0-9_-]{0,128}$/;
const SAFE_DATE = /^\d{4}-\d{2}-\d{2}$/;
const COLLECTION = 'patientAttachments';
const DEFAULT_TTL_SEC = 300;
const DEFAULT_MAX_BYTES = 15 * 1024 * 1024;

export const onRequestOptions = () => optionsResponse();

function fsStr(value) { return { stringValue: String(value) }; }
function fsInt(value) { return { integerValue: String(Math.trunc(Number(value))) }; }
function fsBool(value) { return { booleanValue: Boolean(value) }; }
function fsTs(iso) { return { timestampValue: iso }; }
const FS_NULL = { nullValue: null };

function cleanOptionalId(value) {
    const s = String(value || '').trim();
    return SAFE_OPT_ID.test(s) ? s : null;
}

/**
 * 以 Service Account 建立附件中繼文件（指定文件 ID = fileId）。
 * 身分欄位權威來自驗證後的 Token，不接受客戶端傳入。
 */
async function createMetadataDocument(env, fileId, fields) {
    const access = await getAccessToken(env);
    const url = `https://firestore.googleapis.com/v1/projects/${access.projectId}` +
        `/databases/(default)/documents/${COLLECTION}?documentId=${encodeURIComponent(fileId)}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${access.token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fields })
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`中繼文件建立失敗 (HTTP ${response.status}): ${text.slice(0, 200)}`);
    }
}

export async function onRequestPost(context) {
    const { request, env } = context;
    try {
        const auth = await authenticateStaff(request, env);

        const accountId = String(env.R2_ACCOUNT_ID || '').trim();
        const accessKeyId = String(env.R2_ACCESS_KEY_ID || '').trim();
        const secretAccessKey = String(env.R2_SECRET_ACCESS_KEY || '').trim();
        const bucket = String(env.R2_ATTACHMENTS_BUCKET || '').trim();
        if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
            return jsonResponse({
                error: 'ATTACHMENT_STORAGE_NOT_CONFIGURED',
                message: '附件儲存服務尚未完成設定（缺少 R2 環境變數）'
            }, 503);
        }

        let body;
        try {
            body = await request.json();
        } catch (_e) {
            return jsonResponse({
                error: 'INVALID_REQUEST',
                message: '請求內容必須為 JSON'
            }, 400);
        }

        const patientId = String(body && body.patientId || '').trim();
        const category = String(body && body.category || '').trim();
        const contentType = String(body && body.contentType || '').trim().toLowerCase();
        const contentLength = Number(body && body.contentLength);

        if (!SAFE_PATIENT_ID.test(patientId)) {
            return jsonResponse({
                error: 'INVALID_PATIENT_ID',
                message: '病人 ID 格式不正確'
            }, 400);
        }
        if (!ALLOWED_CATEGORIES.has(category)) {
            return jsonResponse({
                error: 'INVALID_CATEGORY',
                message: '附件分類只可為 tongue、report、other'
            }, 400);
        }
        const ext = CONTENT_TYPE_EXT[contentType];
        if (!ext) {
            return jsonResponse({
                error: 'INVALID_CONTENT_TYPE',
                message: '只支援 JPEG、PNG、WebP、GIF 圖片'
            }, 400);
        }
        const maxBytes = Number(env.ATTACHMENT_MAX_BYTES) > 0
            ? Number(env.ATTACHMENT_MAX_BYTES)
            : DEFAULT_MAX_BYTES;
        if (Number.isFinite(contentLength) && contentLength > 0 && contentLength > maxBytes) {
            return jsonResponse({
                error: 'FILE_TOO_LARGE',
                message: `檔案超過大小上限（${Math.round(maxBytes / 1024 / 1024)}MB）`
            }, 400);
        }

        // 上下文字段強格式清洗（不可信任客戶端）
        const patientName = String(body && body.patientName || '').trim().slice(0, 100);
        const appointmentId = cleanOptionalId(body && body.appointmentId);
        const consultationId = cleanOptionalId(body && body.consultationId);
        const sessionId = cleanOptionalId(body && body.sessionId);
        const consultationDate = String(body && body.consultationDate || '').trim();
        const width = Math.trunc(Number(body && body.width));
        const height = Math.trunc(Number(body && body.height));
        if (appointmentId === null || consultationId === null || sessionId === null) {
            return jsonResponse({
                error: 'INVALID_CONTEXT_ID',
                message: '掛號／診症／暫存 ID 格式不正確'
            }, 400);
        }
        const dateValue = (consultationDate && SAFE_DATE.test(consultationDate))
            ? consultationDate : '';
        const widthValue = (Number.isFinite(width) && width > 0 && width <= 20000) ? width : 0;
        const heightValue = (Number.isFinite(height) && height > 0 && height <= 20000) ? height : 0;
        const sizeValue = (Number.isFinite(contentLength) && contentLength > 0)
            ? Math.trunc(contentLength) : 0;

        const ttlSec = Number(env.ATTACHMENT_URL_TTL) > 0
            ? Math.floor(Number(env.ATTACHMENT_URL_TTL))
            : DEFAULT_TTL_SEC;

        // 後端完全掌控 key：UUID 不可預測，杜絕客戶端指定路徑
        const fileId = crypto.randomUUID();
        const now = new Date();
        const p = (n) => String(n).padStart(2, '0');
        const yyyyMmDd = now.getUTCFullYear() +
            p(now.getUTCMonth() + 1) +
            p(now.getUTCDate());
        const keyBase = `attachments/${patientId}/${yyyyMmDd}/${fileId}`;

        const sign = async (kind) => {
            const key = `${keyBase}/${kind}.${ext}`;
            const signed = await buildPresignedPutUrl({
                accountId,
                bucket,
                accessKeyId,
                secretAccessKey,
                key,
                contentType,
                expiresSec: ttlSec,
                now
            });
            return { url: signed.url, key, contentType };
        };

        const [original, thumb] = await Promise.all([
            sign('original'),
            sign('thumb')
        ]);

        // 解析上傳者名稱（best-effort，失敗以 email 取代）——身分 uid 一律以 Token 為準
        let uploaderName = auth.email || '';
        try {
            const me = await resolveUserData(auth.claims, env);
            if (me && (me.name || me.username)) {
                uploaderName = String(me.name || me.username).slice(0, 100);
            }
        } catch (_nameErr) {
            console.warn('解析上傳者名稱失敗，改用 email:', _nameErr.message);
        }

        const nowIso = now.toISOString();
        const metaFields = {
            fileId: fsStr(fileId),
            patientId: fsStr(patientId),
            patientName: fsStr(patientName),
            consultationId: fsStr(consultationId || ''),
            appointmentId: fsStr(appointmentId || ''),
            sessionId: fsStr(sessionId || ''),
            consultationDate: fsStr(dateValue),
            category: fsStr(category),
            contentType: fsStr(contentType),
            size: sizeValue > 0 ? fsInt(sizeValue) : FS_NULL,
            width: widthValue > 0 ? fsInt(widthValue) : FS_NULL,
            height: heightValue > 0 ? fsInt(heightValue) : FS_NULL,
            originalKey: fsStr(original.key),
            thumbKey: fsStr(thumb.key),
            uploadStatus: fsStr('uploading'),
            uploadedAt: fsTs(nowIso),
            updatedAt: fsTs(nowIso),
            uploadedByUid: fsStr(auth.uid),
            uploadedByName: fsStr(uploaderName),
            deleted: fsBool(false),
            deletedAt: FS_NULL,
            deletedByUid: fsStr(''),
            deletedByName: fsStr('')
        };
        // 文件建立失敗則不發出 URL，避免無主 R2 物件
        await createMetadataDocument(env, fileId, metaFields);

        return jsonResponse({
            fileId,
            category,
            uploadedByUid: auth.uid,
            maxBytes,
            expiresAt: new Date(now.getTime() + ttlSec * 1000).toISOString(),
            publicBase: String(env.R2_PUBLIC_BASE || '').replace(/\/+$/, ''),
            uploads: { original, thumb }
        });
    } catch (error) {
        const status = Number(error.status) > 0 ? Number(error.status) : 500;
        return jsonResponse({
            error: status === 401 ? 'UNAUTHORIZED' : 'PRESIGN_FAILED',
            message: error.message || '簽發上傳 URL 失敗'
        }, status);
    }
}
