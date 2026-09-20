/* ============================================================
 * 附件上傳共用邏輯（presign 端點與手機代拍端點共用）
 * ------------------------------------------------------------
 * - R2 環境檢查
 * - 請求欄位強格式清洗
 * - 以 Service Account 建立 patientAttachments 中繼文件
 * - issuePresignedUpload：產 key、簽 original/thumb 兩組 URL、
 *   建文件，回傳與 presign 端點相同的合約
 * ============================================================ */

import { buildPresignedPutUrl } from './r2-sign.js';
import { getAccessToken } from '../../backup/lib/google-auth.js';

export const COLLECTION = 'patientAttachments';
export const SESSION_COLLECTION = 'attachmentCaptureSessions';

export const ALLOWED_CATEGORIES = new Set(['tongue', 'report', 'other']);
export const CONTENT_TYPE_EXT = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif'
};
// Firestore 文件 ID 僅字母數字、底線、連字號
export const SAFE_PATIENT_ID = /^[A-Za-z0-9_-]{1,128}$/;
export const SAFE_OPT_ID = /^[A-Za-z0-9_-]{0,128}$/;
export const SAFE_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const DEFAULT_TTL_SEC = 300;
export const DEFAULT_MAX_BYTES = 15 * 1024 * 1024;

export function fsStr(value) { return { stringValue: String(value) }; }
export function fsInt(value) { return { integerValue: String(Math.trunc(Number(value))) }; }
export function fsBool(value) { return { booleanValue: Boolean(value) }; }
export function fsTs(iso) { return { timestampValue: iso }; }
export const FS_NULL = { nullValue: null };

export function cleanOptionalId(value) {
    const s = String(value || '').trim();
    return SAFE_OPT_ID.test(s) ? s : null;
}

export class StoreError extends Error {
    constructor(status, code, message) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

export function ensureR2Config(env) {
    const cfg = {
        accountId: String(env.R2_ACCOUNT_ID || '').trim(),
        accessKeyId: String(env.R2_ACCESS_KEY_ID || '').trim(),
        secretAccessKey: String(env.R2_SECRET_ACCESS_KEY || '').trim(),
        bucket: String(env.R2_ATTACHMENTS_BUCKET || '').trim()
    };
    if (!cfg.accountId || !cfg.accessKeyId || !cfg.secretAccessKey || !cfg.bucket) {
        throw new StoreError(503, 'ATTACHMENT_STORAGE_NOT_CONFIGURED',
            '附件儲存服務尚未完成設定（缺少 R2 環境變數）');
    }
    return cfg;
}

/**
 * 以 Service Account 建立附件中繼文件（指定文件 ID = fileId）。
 */
export async function createMetadataDocument(env, fileId, fields) {
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

/**
 * 完整簽發一組附件上傳（original + thumb）並建立中繼文件。
 *
 * @param {object} env
 * @param {object} p
 *   uid/uploaderName      權威上傳者（Token 或代拍 session 建立者）
 *   patientId/patientName/appointmentId/consultationId/sessionId/consultationDate
 *   category/contentType/contentLength/width/height
 *   extraFields           附加中繼欄位（如 relaySessionId），key→FS value
 */
export async function issuePresignedUpload(env, p) {
    const cfg = ensureR2Config(env);

    const patientId = String(p.patientId || '').trim();
    const category = String(p.category || '').trim();
    const contentType = String(p.contentType || '').trim().toLowerCase();
    const contentLength = Number(p.contentLength);

    if (!SAFE_PATIENT_ID.test(patientId)) {
        throw new StoreError(400, 'INVALID_PATIENT_ID', '病人 ID 格式不正確');
    }
    if (!ALLOWED_CATEGORIES.has(category)) {
        throw new StoreError(400, 'INVALID_CATEGORY',
            '附件分類只可為 tongue、report、other');
    }
    const ext = CONTENT_TYPE_EXT[contentType];
    if (!ext) {
        throw new StoreError(400, 'INVALID_CONTENT_TYPE', '只支援 JPEG、PNG、WebP、GIF 圖片');
    }
    const maxBytes = Number(env.ATTACHMENT_MAX_BYTES) > 0
        ? Number(env.ATTACHMENT_MAX_BYTES)
        : DEFAULT_MAX_BYTES;
    if (Number.isFinite(contentLength) && contentLength > 0 && contentLength > maxBytes) {
        throw new StoreError(400, 'FILE_TOO_LARGE',
            `檔案超過大小上限（${Math.round(maxBytes / 1024 / 1024)}MB）`);
    }

    const patientName = String(p.patientName || '').trim().slice(0, 100);
    const appointmentIdOpt = cleanOptionalId(p.appointmentId);
    const consultationIdOpt = cleanOptionalId(p.consultationId);
    const sessionIdOpt = cleanOptionalId(p.sessionId);
    if (appointmentIdOpt === null || consultationIdOpt === null || sessionIdOpt === null) {
        throw new StoreError(400, 'INVALID_CONTEXT_ID', '掛號／診症／暫存 ID 格式不正確');
    }
    const appointmentId = appointmentIdOpt;
    const consultationId = consultationIdOpt;
    const sessionId = sessionIdOpt;
    const consultationDate = (p.consultationDate && SAFE_DATE.test(String(p.consultationDate)))
        ? String(p.consultationDate) : '';
    const width = Math.trunc(Number(p.width));
    const height = Math.trunc(Number(p.height));
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
    const pad = (n) => String(n).padStart(2, '0');
    const yyyyMmDd = now.getUTCFullYear() +
        pad(now.getUTCMonth() + 1) +
        pad(now.getUTCDate());
    const keyBase = `attachments/${patientId}/${yyyyMmDd}/${fileId}`;

    const sign = async (kind) => {
        const key = `${keyBase}/${kind}.${ext}`;
        const signed = await buildPresignedPutUrl({
            accountId: cfg.accountId,
            bucket: cfg.bucket,
            accessKeyId: cfg.accessKeyId,
            secretAccessKey: cfg.secretAccessKey,
            key,
            contentType,
            expiresSec: ttlSec,
            now
        });
        return { url: signed.url, key, contentType };
    };

    const [original, thumb] = await Promise.all([sign('original'), sign('thumb')]);

    const nowIso = now.toISOString();
    const metaFields = Object.assign({
        fileId: fsStr(fileId),
        patientId: fsStr(patientId),
        patientName: fsStr(patientName),
        consultationId: fsStr(consultationId),
        appointmentId: fsStr(appointmentId),
        sessionId: fsStr(sessionId),
        consultationDate: fsStr(consultationDate),
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
        uploadedByUid: fsStr(p.uid || ''),
        uploadedByName: fsStr(p.uploaderName || ''),
        deleted: fsBool(false),
        deletedAt: FS_NULL,
        deletedByUid: fsStr(''),
        deletedByName: fsStr('')
    }, p.extraFields || {});

    // 文件建立失敗則不發出 URL，避免無主 R2 物件
    await createMetadataDocument(env, fileId, metaFields);

    return {
        fileId,
        category,
        uploadedByUid: p.uid || '',
        maxBytes,
        expiresAt: new Date(now.getTime() + ttlSec * 1000).toISOString(),
        publicBase: String(env.R2_PUBLIC_BASE || '').replace(/\/+$/, ''),
        uploads: { original, thumb }
    };
}
