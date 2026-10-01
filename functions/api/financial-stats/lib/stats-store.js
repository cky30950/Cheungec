/* ============================================================
 * 財務日聚合：Service Account 端權威寫入
 * ------------------------------------------------------------
 * 每日每診所一筆聚合文件（dailyFinancialStats），客戶端唯讀，
 * 所有寫入經本模組以 SA 身份繞過 Rules。
 *
 * 提供：
 *  - syncDailyStats(env, beforeRecord, afterRecord)
 *    單筆診症新增/更新/刪除後的增量 delta：對受影響的
 *    （dateKey, clinicId）bucket 做 ± 調整。
 *  - rebuildDailyStatsForDateRange(env, startDate, endDate)
 *    全量重建指定範圍的聚合：從 consultationFinancialSummaries
 *    讀取所有符合條件的文件，按日彙總後寫入。
 *
 * 與前端 calculateFinancialStatistics 保持同一口徑：
 *  - 只計 status == 'completed' 的診症
 *  - 收入金額 = totalAmount（前端 parseFinancialBillingItems 結果）
 *  - 醫師統計按 doctor 欄位
 *  - 服務統計按 summaryItems[].category（consultation/medicine/treatment/other）
 * ============================================================ */

import { getAccessToken } from '../../backup/lib/google-auth.js';
import {
    FirestoreClient,
    normalizeDocument,
    jsObjectToFirestoreFields
} from '../../backup/lib/firestore.js';

export const FINANCIAL_STATS_VERSION = 1;
const DAILY_COLLECTION = 'dailyFinancialStats';
const SUMMARY_COLLECTION = 'consultationFinancialSummaries';
const CLINICS_COLLECTION = 'clinics';

const COMMIT_BATCH_SIZE = 400;
const DELTA_MAX_ATTEMPTS = 5;
const REBUILD_LEASE_MS = 15 * 60 * 1000;
const STATE_COLLECTION = 'dailyFinancialStatsRebuildStates';

// -------- 工具函式 ---------------------------------------------------

async function getDb(env) {
    const auth = await getAccessToken(env);
    return new FirestoreClient(auth.token, auth.projectId, '');
}

function normStr(v) {
    if (v === undefined || v === null) return '';
    try { return String(v).trim(); } catch (_e) { return ''; }
}

// 解析 Firestore timestampValue / seconds / JS Date / ISO string
function parseDate(value) {
    if (!value) return null;
    try {
        if (typeof value.toDate === 'function') {
            const d = value.toDate();
            return isNaN(d.getTime()) ? null : d;
        }
        if (typeof value === 'object' && value.seconds !== undefined) {
            const ms = Number(value.seconds) * 1000
                + Math.round((Number(value.nanoseconds) || 0) / 1e6);
            const d = new Date(ms);
            return isNaN(d.getTime()) ? null : d;
        }
        if (typeof value === 'string') {
            const s = value.trim();
            const m = s.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
            if (m) {
                const d = new Date(
                    parseInt(m[1], 10),
                    parseInt(m[2], 10) - 1,
                    parseInt(m[3], 10),
                    m[4] ? parseInt(m[4], 10) : 0,
                    m[5] ? parseInt(m[5], 10) : 0
                );
                if (!isNaN(d.getTime())) return d;
            }
            const parsed = new Date(s);
            if (!isNaN(parsed.getTime())) return parsed;
        }
        if (typeof value === 'number') {
            const d = new Date(value);
            if (!isNaN(d.getTime())) return d;
        }
    } catch (_e) {}
    return null;
}

// 將 Date 轉香港時間 YYYY-MM-DD
function hkDateKey(date) {
    if (!date) return '';
    try {
        return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Hong_Kong' }).format(date);
    } catch (_e) {
        const m = String(date).match(/^(\d{4}-\d{2}-\d{2})/);
        return m ? m[1] : '';
    }
}

// 香港時間當日 00:00:00 對應的 UTC Timestamp（供 sortDate 使用）
function hkDayStartTimestamp(dateKey) {
    const d = new Date(`${dateKey}T00:00:00+08:00`);
    return d;
}

// Firestore 保留名清理：遞迴移除所有以 "__" 開頭的 key
// （Firestore 禁止以 __ 開頭的欄位／map key，如 __general_registration__）
function sanitizeReservedKeys(obj) {
    if (obj === null || obj === undefined) return obj;
    if (Array.isArray(obj)) return obj.map(sanitizeReservedKeys).filter(v => v !== undefined);
    if (typeof obj === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(obj)) {
            if (k.startsWith('__')) continue;
            out[k] = sanitizeReservedKeys(v);
        }
        return out;
    }
    return obj;
}

// docId = {dateKey}__{clinicId}（clinicId 經 encodeURIComponent）
function getDailyDocId(dateKey, clinicId) {
    const cid = encodeURIComponent(normStr(clinicId) || 'no-clinic');
    return `${dateKey}__${cid}`;
}

// 取得診所名稱快取（補救舊診症缺 clinicId 的情況）
let clinicMapCache = { at: 0, byName: new Map(), byId: new Map() };
const CLINIC_MAP_TTL_MS = 60 * 1000;

async function getClinicMaps(db) {
    const now = Date.now();
    if ((clinicMapCache.byName.size || clinicMapCache.byId.size)
        && now - clinicMapCache.at < CLINIC_MAP_TTL_MS) {
        return { byName: clinicMapCache.byName, byId: clinicMapCache.byId };
    }
    const byName = new Map();
    const byId = new Map();
    let cursor = null;
    do {
        const res = await db.queryCollection({
            collectionId: CLINICS_COLLECTION,
            orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
            startAt: cursor,
            limit: 300
        });
        for (const doc of res.docs) {
            const id = normStr(doc.id);
            if (!id || id === 'local-default') continue;
            byId.set(id, {
                id,
                chineseName: normStr(doc.data && doc.data.chineseName),
                englishName: normStr(doc.data && doc.data.englishName)
            });
            const cn = normStr(doc.data && doc.data.chineseName);
            const en = normStr(doc.data && doc.data.englishName);
            if (cn) byName.set(cn, id);
            if (en) byName.set(en, id);
        }
        cursor = res.docs.length === 300 ? res.nextCursor : null;
    } while (cursor);
    clinicMapCache = { at: now, byName, byId };
    return { byName, byId };
}

async function resolveClinic(db, source) {
    let clinicId = normStr(source && source.clinicId);
    let clinicName = normStr(source && source.clinicName);

    if (!clinicId && clinicName) {
        const { byName, byId } = await getClinicMaps(db);
        const matched = byName.get(clinicName);
        if (matched) {
            clinicId = matched;
            const info = byId.get(matched);
            if (info && !clinicName) clinicName = info.chineseName || info.englishName;
        }
    }
    if (clinicId && !clinicName) {
        const { byId } = await getClinicMaps(db);
        const info = byId.get(clinicId);
        if (info) clinicName = info.chineseName || info.englishName || '';
    }

    const clinicKey = clinicId || (clinicName ? `name:${clinicName}` : 'no-clinic');
    return { clinicId: clinicId || null, clinicName, clinicKey };
}

// -------- 聚合計算 ---------------------------------------------------

// 從 consultation（或 summary）記錄抽取財務資訊
function extractFinancialFromRecord(record) {
    if (!record || typeof record !== 'object') return null;
    const status = normStr(record.status);
    if (status && status !== 'completed') return null;
    const isDeleted = !!record.isDeleted;
    if (isDeleted) return null;

    // 日期優先取 dateKey / sortDate / date
    const dateKey = normStr(record.dateKey);
    const sortDate = parseDate(record.sortDate || record.date || record.createdAt);
    const effectiveDateKey = dateKey || (sortDate ? hkDateKey(sortDate) : '');
    if (!effectiveDateKey) return null;

    const doctor = normStr(record.doctor);
    if (!doctor) return null; // 無醫師歸屬的不算入
    // Firestore 保留名：以 "__" 開頭的欄位 key 不允許（如一般掛號 __general_registration__）
    if (doctor.startsWith('__')) return null;

    // 金額
    const totalAmount = Math.round(
        Number(record.totalAmount)
            ?? Number(record.financialTotalAmount)
            ?? 0
    ) || 0;

    // 服務項目
    const summaryItems = Array.isArray(record.summaryItems)
        ? record.summaryItems
        : (Array.isArray(record.financialSummaryItems) ? record.financialSummaryItems : []);

    const serviceStats = {};
    for (const item of summaryItems) {
        const category = normStr(item && item.category);
        if (!category) continue;
        const qty = Math.round(Number(item.quantity) || 0);
        const amt = Math.round(Number(item.totalAmount) || (Number(item.unitPrice) || 0) * qty) || 0;
        if (!serviceStats[category]) serviceStats[category] = { count: 0, revenue: 0 };
        serviceStats[category].count += qty;
        serviceStats[category].revenue += amt;
    }

    return { doctor, effectiveDateKey, totalAmount, serviceStats };
}

// -------- Firestore 底層工具（參考 personal-stats） -----------------

function docResourceName(db, docPath) {
    return `projects/${db.projectId}/databases/(default)/documents/${docPath}`;
}

async function commitWrites(db, writes) {
    if (!writes.length) return;
    const res = await fetch(`${db.documentsPath()}:commit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${db.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ writes })
    });
    if (!res.ok) {
        const text = await res.text();
        let code = 'COMMIT_FAILED';
        let message = text.slice(0, 300);
        try {
            const payload = JSON.parse(text);
            if (payload && payload.error) {
                if (payload.error.status) code = payload.error.status;
                if (payload.error.message) message = payload.error.message;
            }
        } catch (_e) {}
        const err = new Error(`聚合寫入失敗 (HTTP ${res.status}): ${message}`);
        err.status = res.status;
        err.code = String(code).toUpperCase();
        throw err;
    }
}

function mergeWrite(db, docPath, fields, precondition) {
    const write = {
        update: { name: docResourceName(db, docPath), fields: jsObjectToFirestoreFields(fields) },
        updateMask: { fieldPaths: Object.keys(fields) }
    };
    if (precondition) write.currentDocument = precondition;
    return write;
}

function fullReplaceWrite(db, docPath, fields, precondition) {
    const write = {
        update: { name: docResourceName(db, docPath), fields: jsObjectToFirestoreFields(fields) }
    };
    if (precondition) write.currentDocument = precondition;
    return write;
}

function preconditionOf(raw) {
    return raw.exists && raw.updateTime
        ? { updateTime: raw.updateTime }
        : { exists: false };
}

async function commitInBatches(db, writes) {
    for (let i = 0; i < writes.length; i += COMMIT_BATCH_SIZE) {
        await commitWrites(db, writes.slice(i, i + COMMIT_BATCH_SIZE));
    }
}

// 用 Firestore REST API 讀單一文件（帶 updateTime 供樂觀鎖）
async function rawGetDocument(db, docPath) {
    const url = `${db.documentsPath()}/${docPath}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${db.token}` } });
    if (res.status === 404) return { exists: false, updateTime: null, data: {}, name: url };
    const text = await res.text();
    if (!res.ok) {
        const err = new Error(`讀取 ${docPath} 失敗 (HTTP ${res.status}): ${text.slice(0, 200)}`);
        err.status = res.status;
        throw err;
    }
    const doc = text ? JSON.parse(text) : {};
    return {
        exists: true,
        updateTime: doc.updateTime || null,
        data: normalizeDocument(doc).data,
        name: doc.name || url
    };
}

function isRetriableConflict(error) {
    const code = String((error && error.code) || '').toUpperCase();
    return code === 'FAILED_PRECONDITION' || code === 'ABORTED';
}

// -------- 增量同步 ---------------------------------------------------

/**
 * 單筆診症新增/更新/刪除後的增量同步。
 * 對受影響的（dateKey, clinicId）bucket 做 ± 調整。
 *
 * @param {object} env Cloudflare Worker env
 * @param {object|null} beforeRecord 舊記錄（刪除／更新前）
 * @param {object|null} afterRecord 新記錄（新增／更新後）
 * @returns {Promise<object>}
 */
export async function syncDailyStats(env, beforeRecord, afterRecord) {
    const db = await getDb(env);
    const changesByBucket = new Map(); // docId -> { sign (+1/-1), record }

    const applySign = async (record, sign) => {
        if (!record || typeof record !== 'object') return;
        const fin = extractFinancialFromRecord(record);
        if (!fin) return;
        const { clinicId, clinicName } = await resolveClinic(db, record);
        if (!clinicId && !clinicName) return;
        const clinicKey = clinicId || (clinicName ? `name:${clinicName}` : 'no-clinic');
        const docId = getDailyDocId(fin.effectiveDateKey, clinicKey);
        if (!changesByBucket.has(docId)) {
            changesByBucket.set(docId, {
                docId,
                dateKey: fin.effectiveDateKey,
                clinicId: clinicId || null,
                clinicName,
                sign: 0,
                doctorDeltas: {},
                serviceDeltas: {},
                revenueDelta: 0
            });
        }
        const bucket = changesByBucket.get(docId);
        bucket.sign += sign;
        bucket.revenueDelta += fin.totalAmount * sign;
        // 醫師
        if (!bucket.doctorDeltas[fin.doctor]) bucket.doctorDeltas[fin.doctor] = { count: 0, revenue: 0 };
        bucket.doctorDeltas[fin.doctor].count += sign;
        bucket.doctorDeltas[fin.doctor].revenue += fin.totalAmount * sign;
        // 服務
        for (const [cat, svc] of Object.entries(fin.serviceStats)) {
            if (!bucket.serviceDeltas[cat]) bucket.serviceDeltas[cat] = { count: 0, revenue: 0 };
            bucket.serviceDeltas[cat].count += svc.count * sign;
            bucket.serviceDeltas[cat].revenue += svc.revenue * sign;
        }
    };

    await applySign(beforeRecord, -1);
    await applySign(afterRecord, 1);

    if (!changesByBucket.size) return { success: true, changedBuckets: 0 };

    // 對每個 bucket 做樂觀鎖更新
    const results = [];
    for (const bucket of changesByBucket.values()) {
        const res = await applyBucketDelta(db, bucket);
        results.push(res);
    }
    return { success: true, changedBuckets: changesByBucket.size, results };
}

async function applyBucketDelta(db, bucket) {
    const docPath = `${DAILY_COLLECTION}/${bucket.docId}`;

    for (let attempt = 0; attempt < DELTA_MAX_ATTEMPTS; attempt++) {
        const raw = await rawGetDocument(db, docPath);
        const curDoctors = raw.data.doctorStats && typeof raw.data.doctorStats === 'object'
            ? { ...raw.data.doctorStats } : {};
        const curServices = raw.data.serviceStats && typeof raw.data.serviceStats === 'object'
            ? { ...raw.data.serviceStats } : {};

        // 套用醫師 delta
        for (const [doctor, delta] of Object.entries(bucket.doctorDeltas)) {
            const cur = curDoctors[doctor] || { count: 0, revenue: 0 };
            const newCount = Math.max(0, Math.round((cur.count || 0) + (delta.count || 0)));
            const newRev = Math.round((cur.revenue || 0) + (delta.revenue || 0));
            if (newCount <= 0 && newRev <= 0) delete curDoctors[doctor];
            else curDoctors[doctor] = { count: newCount, revenue: newRev };
        }
        // 套用服務 delta
        for (const [cat, delta] of Object.entries(bucket.serviceDeltas)) {
            const cur = curServices[cat] || { count: 0, revenue: 0 };
            const newCount = Math.max(0, Math.round((cur.count || 0) + (delta.count || 0)));
            const newRev = Math.round((cur.revenue || 0) + (delta.revenue || 0));
            if (newCount <= 0 && newRev <= 0) delete curServices[cat];
            else curServices[cat] = { count: newCount, revenue: newRev };
        }

        // 總計
        let totalConsultations = 0;
        let totalRevenue = 0;
        for (const d of Object.values(curDoctors)) {
            totalConsultations += Math.round(d.count || 0);
        }
        for (const d of Object.values(curServices)) {
            totalRevenue += Math.round(d.revenue || 0);
        }
        // 保證與 serviceStats 加總一致（醫師 totalAmount 加總可能有四捨五入差異）
        if (totalRevenue === 0 && bucket.revenueDelta !== 0) {
            // 剛好所有服務項目都還沒算出來時，用醫師加總兜底
            let docRev = 0;
            for (const d of Object.values(curDoctors)) docRev += Math.round(d.revenue || 0);
            totalRevenue = docRev;
        }

        if (totalConsultations <= 0 && totalRevenue <= 0) {
            // bucket 已空，刪除文件
            if (raw.exists) {
                try {
                    await commitWrites(db, [{ delete: docResourceName(db, docPath) }]);
                } catch (_e) {
                    if (!isRetriableConflict(_e)) throw _e;
                    continue;
                }
            }
            return { docId: bucket.docId, action: 'deleted', attempts: attempt + 1 };
        }

        const now = new Date();
        const sortDate = hkDayStartTimestamp(bucket.dateKey);
        const fields = sanitizeReservedKeys({
            dateKey: bucket.dateKey,
            sortDate,
            clinicId: bucket.clinicId,
            clinicName: bucket.clinicName || '',
            totalRevenue,
            totalConsultations,
            averageRevenue: totalConsultations > 0 ? Math.round(totalRevenue / totalConsultations) : 0,
            doctorStats: curDoctors,
            serviceStats: curServices,
            syncedAt: now,
            summaryVersion: FINANCIAL_STATS_VERSION,
            updatedAt: now
        });

        try {
            await commitWrites(db, [
                fullReplaceWrite(db, docPath, fields, preconditionOf(raw))
            ]);
            return { docId: bucket.docId, action: 'updated', attempts: attempt + 1 };
        } catch (error) {
            if (!isRetriableConflict(error) || attempt === DELTA_MAX_ATTEMPTS - 1) throw error;
        }
    }
    throw new Error(`bucket ${bucket.docId} 重試次數過多`);
}

// -------- 全量重建 ---------------------------------------------------

/**
 * 全量重建指定日期範圍的 dailyFinancialStats。
 * 從 consultationFinancialSummaries 讀取所有符合條件的文件，
 * 按 (dateKey, clinicId) 分組後寫入。
 *
 * @param {object} env Cloudflare Worker env
 * @param {string} startDate YYYY-MM-DD（香港日）
 * @param {string} endDate YYYY-MM-DD（香港日）
 * @param {string|null} clinicId 限縮某診所（null = 全部）
 * @returns {Promise<object>}
 */
export async function rebuildDailyStatsForDateRange(env, startDate, endDate, clinicId = null) {
    const db = await getDb(env);

    // 把 YYYY-MM-DD 轉香港時間 Timestamp 邊界
    const startTs = hkDayStartTimestamp(startDate);
    const endTs = hkDayStartTimestamp(endDate);
    endTs.setUTCHours(23, 59, 59, 999);

    const orderBy = [{ field: { fieldPath: 'sortDate' }, direction: 'ASCENDING' }];
    const whereParts = [
        {
            fieldFilter: {
                field: { fieldPath: 'sortDate' },
                op: 'GREATER_THAN_OR_EQUAL',
                value: { timestampValue: startTs }
            }
        },
        {
            fieldFilter: {
                field: { fieldPath: 'sortDate' },
                op: 'LESS_THAN_OR_EQUAL',
                value: { timestampValue: endTs }
            }
        }
    ];
    const where = { compositeFilter: { op: 'AND', filters: whereParts } };

    // 讀 consultationFinancialSummaries（有 clinicId 過濾時加進 where）。
    // limit 為分頁大小，queryCollection 會自動以 sortDate 游標翻到用盡，
    // 不可只取第一頁（舊寫法超過 300 筆會靜默漏算）。
    let summaryDocs;
    try {
        const summaryRes = await db.queryCollection({
            collectionId: SUMMARY_COLLECTION,
            where,
            orderBy,
            limit: 300
        });
        summaryDocs = summaryRes.docs;
        if (summaryRes.truncated) {
            console.warn(`財務聚合重建：${SUMMARY_COLLECTION} 查詢遭截斷，統計可能不完整（範圍 ${startDate}～${endDate}）`);
        }
    } catch (err) {
        console.warn('從 consultationFinancialSummaries 重建失敗，退回 consultations:', err.message);
        // 退回 consultations 集合（同樣自動分頁讀滿整個日期範圍）
        const fallbackRes = await db.queryCollection({
            collectionId: 'consultations',
            where,
            orderBy: [{ field: { fieldPath: 'sortDate' }, direction: 'ASCENDING' }],
            limit: 300
        });
        summaryDocs = fallbackRes.docs;
        if (fallbackRes.truncated) {
            console.warn(`財務聚合重建：consultations 退回查詢遭截斷，統計可能不完整（範圍 ${startDate}～${endDate}）`);
        }
    }

    // 過濾 clinicId
    const filtered = summaryDocs.filter(doc => {
        if (clinicId && normStr(doc.data && doc.data.clinicId) !== clinicId) return false;
        return true;
    });

    // 按 bucket 聚合
    const bucketMap = new Map(); // docId -> bucket
    for (const doc of filtered) {
        const fin = extractFinancialFromRecord(doc.data);
        if (!fin) continue;
        const { clinicId: cid, clinicName } = await resolveClinic(db, doc.data);
        if (!cid && !clinicName) continue;
        const clinicKey = cid || (clinicName ? `name:${clinicName}` : 'no-clinic');
        const docId = getDailyDocId(fin.effectiveDateKey, clinicKey);

        if (!bucketMap.has(docId)) {
            bucketMap.set(docId, {
                docId,
                dateKey: fin.effectiveDateKey,
                clinicId: cid || null,
                clinicName,
                doctorStats: {},
                serviceStats: {},
                totalRevenue: 0,
                totalConsultations: 0
            });
        }
        const bucket = bucketMap.get(docId);
        bucket.totalConsultations += 1;
        bucket.totalRevenue += fin.totalAmount;
        // 醫師
        if (!bucket.doctorStats[fin.doctor]) bucket.doctorStats[fin.doctor] = { count: 0, revenue: 0 };
        bucket.doctorStats[fin.doctor].count += 1;
        bucket.doctorStats[fin.doctor].revenue += fin.totalAmount;
        // 服務
        for (const [cat, svc] of Object.entries(fin.serviceStats)) {
            if (!bucket.serviceStats[cat]) bucket.serviceStats[cat] = { count: 0, revenue: 0 };
            bucket.serviceStats[cat].count += svc.count;
            bucket.serviceStats[cat].revenue += svc.revenue;
        }
    }

    // 讀取現有 dailyFinancialStats 文件，找出要刪除的（重建後不再有資料的 bucket）
    const existingWhere = {
        compositeFilter: {
            op: 'AND',
            filters: [
                {
                    fieldFilter: {
                        field: { fieldPath: 'sortDate' },
                        op: 'GREATER_THAN_OR_EQUAL',
                        value: { timestampValue: startTs }
                    }
                },
                {
                    fieldFilter: {
                        field: { fieldPath: 'sortDate' },
                        op: 'LESS_THAN_OR_EQUAL',
                        value: { timestampValue: endTs }
                    }
                }
            ]
        }
    };
    let existingDocs = [];
    try {
        const res = await db.queryCollection({
            collectionId: DAILY_COLLECTION,
            where: existingWhere,
            orderBy: [{ field: { fieldPath: 'sortDate' }, direction: 'ASCENDING' }],
            limit: 300
        });
        existingDocs = res.docs;
        if (res.truncated) {
            console.warn(`財務聚合重建：${DAILY_COLLECTION} 舊 bucket 查詢遭截斷，殘留 bucket 可能未被清除（範圍 ${startDate}～${endDate}）`);
        }
    } catch (_e) {
        // 索引未建立時忽略
    }

    const keepIds = new Set(bucketMap.keys());
    const now = new Date();
    const writes = [];

    // 要刪除的
    for (const doc of existingDocs) {
        if (clinicId && normStr(doc.data && doc.data.clinicId) !== clinicId) continue;
        if (!keepIds.has(doc.id)) {
            writes.push({ delete: docResourceName(db, `${DAILY_COLLECTION}/${doc.id}`) });
        }
    }

    // 要寫入的（全量覆蓋）
    for (const bucket of bucketMap.values()) {
        const bucketDocId = bucket.docId;
        bucket.totalRevenue = Math.round(bucket.totalRevenue);
        const avgRev = bucket.totalConsultations > 0
            ? Math.round(bucket.totalRevenue / bucket.totalConsultations)
            : 0;
        const fields = sanitizeReservedKeys({
            dateKey: bucket.dateKey,
            sortDate: hkDayStartTimestamp(bucket.dateKey),
            clinicId: bucket.clinicId,
            clinicName: bucket.clinicName || '',
            totalRevenue: bucket.totalRevenue,
            totalConsultations: bucket.totalConsultations,
            averageRevenue: avgRev,
            doctorStats: bucket.doctorStats,
            serviceStats: bucket.serviceStats,
            syncedAt: now,
            summaryVersion: FINANCIAL_STATS_VERSION,
            updatedAt: now
        });
        writes.push(fullReplaceWrite(db, `${DAILY_COLLECTION}/${bucketDocId}`, fields, null));
    }

    await commitInBatches(db, writes);

    return {
        success: true,
        bucketCount: bucketMap.size,
        deletedCount: writes.filter(w => w.delete).length,
        sourceRecordCount: filtered.length,
        startDate,
        endDate
    };
}
