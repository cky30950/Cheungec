/* ============================================================
 * R2 備份設定
 * ------------------------------------------------------------
 * R2 物件佈局：
 *   state/sync-state.json          同步狀態（watermark、計數、歷史）
 *   snapshots/<key>.json           各集合最新完整快照（delta 合併）
 *   exports/clinic_backup_*.json.gz  組裝好可供下載的 gzip 備份檔
 *                                    （保留期限由 R2 lifecycle rule 管理）
 *
 * 同步策略：
 *  - 大集合（patients / consultations / patientPackageHistory /
 *      consultationAuditLogs）：
 *      每日只讀 updatedAt 之後的增量；距上次 baseline ≥ 7 日時自動全量，
 *      全量會自然排除已被硬刪除的文件。
 *  - 小集合（users / 收費項目 / 套票 / 診所 / 診所支出）：每次都全量讀取，
 *      讀取量極小，但刪除可以即時反映。
 * ============================================================ */

export const STATE_KEY = 'state/sync-state.json';
export const SNAPSHOT_PREFIX = 'snapshots/';
export const EXPORT_PREFIX = 'exports/';

// 備份檔保留期限由 R2 Object lifecycle rule 管理（目前設為 2 個月），
// 程式不再主動刪除 exports/ 內舊檔。

// 大集合全量 baseline 間隔（7 日）
export const BASELINE_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

// 單集合快照保險上限（筆數），超過只跳過組裝並警告，不影響同步
export const EXPORT_DOC_SOFT_LIMIT = 200000;

/**
 * 頂層集合定義。
 * key：R2 快照與匯出檔使用的名稱（與舊版備份 JSON 欄位對齊）
 */
export const TOP_COLLECTIONS = [
    { key: 'patients', collectionId: 'patients', alwaysFull: false },
    { key: 'consultations', collectionId: 'consultations', alwaysFull: false },
    { key: 'users', collectionId: 'users', alwaysFull: true },
    { key: 'patientPackages', collectionId: 'patientPackages', alwaysFull: true },
    { key: 'patientPackageHistory', collectionId: 'patientPackageHistory', alwaysFull: false },
    { key: 'globalBillingItems', collectionId: 'globalBillingItems', alwaysFull: true },
    // 診所主文件（名稱、設定等），數量極少（進階版上限 5 間），每次全量
    { key: 'clinics', collectionId: 'clinics', alwaysFull: true },
    // 診所支出記錄，每月僅零星筆數，每次全量
    { key: 'clinicExpenses', collectionId: 'clinicExpenses', alwaysFull: true },
    // 病歷審核追蹤（append-only，含修改前後快照，筆數可能龐大）：
    // 日常走 updatedAt 增量，每 7 日 baseline 排除已刪除文件。
    // 歷史舊文件若無 updatedAt，同步會自動退回 baseline，不漏資料。
    { key: 'consultationAuditLogs', collectionId: 'consultationAuditLogs', alwaysFull: false }
];

// 匯出檔中「billingItems」＝全域收費項目＋各診所非公費項目
export const BILLING_EXPORT_KEY = 'billingItems';

export function snapshotKey(sourceKey) {
    return SNAPSHOT_PREFIX + String(sourceKey).replace(/[\\/]/g, '__') + '.json';
}

export function clinicBillingKey(clinicId) {
    return `clinics__${clinicId}__billingItems`;
}

export function isClinicBillingKey(key) {
    return /^clinics__.+__billingItems$/.test(String(key));
}

export function clinicIdFromKey(key) {
    const match = String(key).match(/^clinics__(.+)__billingItems$/);
    return match ? match[1] : null;
}

/**
 * 產生備份檔的 R2 key（UTC 時間，檔名與舊版 clinic_backup_ 一致）。
 * 匯出檔統一以 gzip 儲存（.json.gz），可大幅縮減 R2 容量。
 */
export function buildExportKey(date) {
    const ts = (date || new Date()).toISOString().replace(/[:.]/g, '-');
    return `${EXPORT_PREFIX}clinic_backup_${ts}.json.gz`;
}

export function downloadFileNameFromKey(key) {
    return String(key).startsWith(EXPORT_PREFIX) ? String(key).slice(EXPORT_PREFIX.length) : key;
}

/** 判斷 R2 備份檔是否為 gzip 格式（新格式 .json.gz，舊檔為 .json） */
export function isGzipExportKey(key) {
    return String(key).endsWith('.gz');
}

export const GZIP_TYPE = 'application/gzip';
