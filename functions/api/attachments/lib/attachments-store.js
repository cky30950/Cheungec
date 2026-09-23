/* ============================================================
 * 附件上傳共用邏輯（presign 端點與手機代拍端點共用）
 * ------------------------------------------------------------
 * - R2 環境檢查
 * - 請求欄位強格式清洗
 * - 以 Service Account 建立 patientAttachments 中繼文件
 * - issuePresignedUpload：產 key、簽 original/thumb 兩組 URL、
 *   建文件，回傳與 presign 端點相同的合約
 * ============================================================ */

import { buildPresignedPutUrl, buildPresignedGetUrl } from './r2-sign.js';
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
// 員工／代拍端讀取用簽章 URL 預設效期（10 分鐘）
export const DEFAULT_GET_TTL_SEC = 600;
export const MAX_GET_TTL_SEC = 3600;
// 所有病歷物件上傳時寫死的快取政策：禁瀏覽器與中繼快取
// （身分證、體檢報告等敏感影像尤須避免落到本機磁碟快取）
export const STORED_CACHE_CONTROL = 'private, no-store';
// 批次簽章讀取端點單次最多 key 數
export const MAX_SIGN_KEYS = 100;
// 物件 key 嚴格白名單：attachments/<病人ID>/<YYYYMMDD>/<fileId>/<original|thumb>.<副檔名>
// 與 issuePresignedUpload 產生規則一致，杜絕簽任意 key（如跨前綴讀取）
export const SAFE_OBJECT_KEY = new RegExp(
    '^attachments/[A-Za-z0-9_-]{1,128}/\\d{8}/[A-Za-z0-9_-]{1,128}/' +
    '(?:original|thumb)\\.(?:jpe?g|png|webp|gif)$'
);
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

    // 讀取簽章 URL 效期（員工列表/lightbox 與手機頁剛上傳的預覽皆用之）
    let getTtlSec = Number(env.ATTACHMENT_GET_URL_TTL) > 0
        ? Math.floor(Number(env.ATTACHMENT_GET_URL_TTL))
        : DEFAULT_GET_TTL_SEC;
    getTtlSec = Math.min(Math.max(getTtlSec, 60), MAX_GET_TTL_SEC);

    // 後端完全掌控 key：UUID 不可預測，杜絕客戶端指定路徑
    const fileId = crypto.randomUUID();
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const yyyyMmDd = now.getUTCFullYear() +
        pad(now.getUTCMonth() + 1) +
        pad(now.getUTCDate());
    const keyBase = `attachments/${patientId}/${yyyyMmDd}/${fileId}`;

    // 只產出原圖一組簽章 URL。
    // 列表縮圖位置直接以原圖靠瀏覽器/CSS 縮放顯示，不再產生獨立縮圖物件；
    // 中繼文件仍保留 thumbKey 欄位並指向原圖 key，舊前端/舊記錄可相容。
    const original = await (async () => {
        const key = `${keyBase}/original.${ext}`;
        const signed = await buildPresignedPutUrl({
            accountId: cfg.accountId,
            bucket: cfg.bucket,
            accessKeyId: cfg.accessKeyId,
            secretAccessKey: cfg.secretAccessKey,
            key,
            contentType,
            // 物件存入後一律帶 private, no-store（瀏覽器實際 PUT
            // 時亦須送相同 Cache-Control 標頭，否則簽章不符）
            cacheControl: STORED_CACHE_CONTROL,
            expiresSec: ttlSec,
            now
        });
        // 手機匿名頁於上傳後需立即預覽：直接附該物件的短 TTL 讀取 URL，
        // 匿名端無法呼叫員工專用的批次簽章端點
        const signedGet = await buildPresignedGetUrl({
            accountId: cfg.accountId,
            bucket: cfg.bucket,
            accessKeyId: cfg.accessKeyId,
            secretAccessKey: cfg.secretAccessKey,
            key,
            expiresSec: getTtlSec,
            now
        });
        return {
            url: signed.url,
            key,
            contentType,
            getUrl: signedGet.url,
            getExpiresAt: signedGet.expiresAt
        };
    })();

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
        // 不再有獨立縮圖：thumbKey 與 originalKey 相同
        thumbKey: fsStr(original.key),
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
        getExpiresAt: original.getExpiresAt,
        publicBase: String(env.R2_PUBLIC_BASE || '').replace(/\/+$/, ''),
        uploads: { original }
    };
}

/**
 * 批次簽發病歷物件的短 TTL 讀取 URL（員工端列表／lightbox 用）。
 *
 * 零 Firestore 讀取：能通過 authenticateStaff 者本來就有全部
 * patientAttachments 讀權，此處只做 key 白名單把關。
 *
 * @param {object} env
 * @param {string[]} keys 去重後不超過 MAX_SIGN_KEYS 個
 * @returns {Promise<{urls:Object<string,string>, expiresAt:string, ttlSec:number}>}
 */
export async function signGetUrls(env, keys) {
    const cfg = ensureR2Config(env);
    if (!Array.isArray(keys)) {
        throw new StoreError(400, 'INVALID_REQUEST', 'keys 必須為陣列');
    }
    const unique = Array.from(new Set(keys.map((k) => String(k))));
    if (unique.length === 0) {
        throw new StoreError(400, 'INVALID_REQUEST', '至少需要一個 key');
    }
    if (unique.length > MAX_SIGN_KEYS) {
        throw new StoreError(400, 'TOO_MANY_KEYS',
            `單次最多簽 ${MAX_SIGN_KEYS} 個 key`);
    }
    for (const key of unique) {
        if (!SAFE_OBJECT_KEY.test(key)) {
            throw new StoreError(400, 'INVALID_KEY', 'key 格式不在允許範圍內');
        }
    }

    let ttlSec = Number(env.ATTACHMENT_GET_URL_TTL) > 0
        ? Math.floor(Number(env.ATTACHMENT_GET_URL_TTL))
        : DEFAULT_GET_TTL_SEC;
    ttlSec = Math.min(Math.max(ttlSec, 60), MAX_GET_TTL_SEC);

    const now = new Date();
    const signed = await Promise.all(unique.map((key) => buildPresignedGetUrl({
        accountId: cfg.accountId,
        bucket: cfg.bucket,
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
        key,
        expiresSec: ttlSec,
        now
    })));
    const urls = {};
    unique.forEach((key, i) => { urls[key] = signed[i].url; });
    return { urls, expiresAt: signed[0].expiresAt, ttlSec };
}
