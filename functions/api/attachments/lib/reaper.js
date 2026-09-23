/* ============================================================
 * 病歷附件孤兒回收（reaper）
 * ------------------------------------------------------------
 * 場景：客戶端拿到 presigned URL、PUT 進 R2 後，因瀏覽器關閉／
 * 網路中斷而未呼叫 mark-ready，留下「持續計費的無主 PHI」；
 * 或 delete.js 軟刪文件成功但 R2 物件刪除失敗，物件殘留桶內。
 *
 * 上傳流程採「先建中繼文件再發 URL」，故孤兒必然對應得到一份
 * Firestore 文件，不需掃整個 R2 桶（R2 list 免費但與 Firestore
 * 逐筆比對很貴）。三條互補管道：
 *
 *  1. 超齡 uploading：查 uploadStatus=='uploading'（穩態結果集
 *     接近 0 筆、單欄預設索引），客戶端過濾 uploadedAt 超過
 *     ATTACHMENT_REAP_HOURS（預設 24h）→ 刪 R2 物件 → 軟刪文件。
 *  2. 重試佇列（KV）：任何 R2 刪除或文件 PATCH 失敗者入隊，
 *     指數退避重試，超過上限進 DLQ 供人工檢視。delete.js 發生
 *     部分刪除失敗時亦寫入此佇列（action=purge-deleted）。
 *  3. 軟刪安全網：每日一頁（100 筆）游標分頁掃 deleted==true，
 *     只處理缺 objectPurged 標記者；覆蓋上線前的舊殘留與佇列
 *     遺漏。游標存 KV，掃完自動回到頭部循環。
 *
 * 安全：
 *  - 每個 key 先過 SAFE_OBJECT_KEY 全域白名單，再以文件本身的
 *    patientId+fileId 組嚴格正則釘死（與 delete.js 同款），
 *    文件被竄改也無法拿 binding 刪桶內其他物件。
 *  - 逐項 try/catch：單筆失敗不影響整批；見習寬限期 24h。
 *  - 物件不存在不視為錯誤（R2 binding delete 本身冪等）。
 *
 * KV 綁定：優先 ATTACHMENT_REAP_KV，否則重用 RATE_LIMIT_KV
 * （鍵前綴 reap:，與 rl: 限流鍵互不干涉）。
 * ============================================================ */

import { getAccessToken } from '../../backup/lib/google-auth.js';
import { FirestoreClient } from '../../backup/lib/firestore.js';
import { COLLECTION, SAFE_OBJECT_KEY } from './attachments-store.js';

export const REAPER_SYSTEM_UID = 'reaper';
export const REAPER_SYSTEM_NAME = 'system:attachment-reaper';

const DEFAULT_STALE_HOURS = 24;
const DEFAULT_BATCH_LIMIT = 100;
const SWEEP_PAGE_SIZE = 100;
const MAX_ATTEMPTS = 8;
const QUEUE_TTL_SEC = 30 * 86400;      // 佇列項最長保留 30 天
const DLQ_TTL_SEC = 180 * 86400;       // DLQ 保留 180 天供人工檢視
const MAX_BACKOFF_SEC = 7 * 86400;

const Q_PREFIX = 'reap:q:';
const DLQ_PREFIX = 'reap:dlq:';
const SWEEP_CURSOR_KEY = 'reap:cursor:deleted-sweep';

export class ReapError extends Error {
    constructor(status, code, message) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

function readConfig(env) {
    let staleHours = Number(env.ATTACHMENT_REAP_HOURS);
    staleHours = Number.isFinite(staleHours) && staleHours >= 1 && staleHours <= 168
        ? Math.floor(staleHours)
        : DEFAULT_STALE_HOURS;
    let batchLimit = Number(env.ATTACHMENT_REAP_BATCH);
    batchLimit = Number.isFinite(batchLimit) && batchLimit >= 1 && batchLimit <= 500
        ? Math.floor(batchLimit)
        : DEFAULT_BATCH_LIMIT;
    return { staleHours, batchLimit };
}

function pickKv(env) {
    const dedicated = env && env.ATTACHMENT_REAP_KV;
    if (dedicated && typeof dedicated.get === 'function') return dedicated;
    const shared = env && env.RATE_LIMIT_KV;
    if (shared && typeof shared.get === 'function') return shared;
    return null;
}

function bucketOf(env) {
    const bucket = env && env.ATTACHMENTS_BUCKET;
    if (!bucket || typeof bucket.delete !== 'function') {
        throw new ReapError(503, 'ATTACHMENT_STORAGE_NOT_CONFIGURED',
            '附件儲存服務尚未完成設定（缺少 ATTACHMENTS_BUCKET 綁定）');
    }
    return bucket;
}

/** 與 delete.js 同款：把 key 釘在該文件的 patientId+fileId 下 */
function buildDocKeyPattern(patientId, fileId) {
    const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(
        '^attachments/' + esc(patientId) + '/\\d{8}/' + esc(fileId) +
        '/(original|thumb)\\.[A-Za-z0-9]+$'
    );
}

/** 取一份文件聲稱的全部物件 key（去重、逐項白名單＋歸屬校驗） */
function safeDocKeys(doc) {
    const data = doc.data || {};
    const pid = String(data.patientId || '');
    const fileId = String(doc.id || '');
    if (!pid || !fileId) return { keys: [], invalid: true };
    const owned = buildDocKeyPattern(pid, fileId);
    const keys = Array.from(new Set(
        ['originalKey', 'thumbKey'].map((f) => String(data[f] || '')).filter(Boolean)
    ));
    for (const key of keys) {
        if (!SAFE_OBJECT_KEY.test(key) || !owned.test(key)) {
            return { keys: [], invalid: true };
        }
    }
    return { keys, invalid: false };
}

/**
 * 逐個刪除 R2 物件。物件不存在視為成功；回失敗清單供重試。
 */
async function purgeObjects(bucket, keys) {
    const failed = [];
    for (const key of keys) {
        try {
            await bucket.delete(key);
        } catch (error) {
            failed.push({ key, error: String((error && error.message) || error) });
        }
    }
    return failed;
}

/**
 * Dry-run 專用：只 head 查證物件是否存在，不做任何寫入。
 * head 失敗時保守計入 existing（避免因一時錯誤誤報「無物件可刪」）。
 */
async function inspectObjects(bucket, keys) {
    const existing = [];
    const missing = [];
    for (const key of keys) {
        try {
            const head = await bucket.head(key);
            (head ? existing : missing).push(key);
        } catch (_e) {
            existing.push(key);
        }
    }
    return { existing, missing };
}

async function patchSoftReap(client, fileId, nowIso) {
    await client.patchDocument(`${COLLECTION}/${encodeURIComponent(fileId)}`, {
        // 改成終態，避免文件每天繼續命中 uploadStatus=='uploading' 查詢
        uploadStatus: 'reaped',
        deleted: true,
        deletedAt: new Date(nowIso),
        deletedByUid: REAPER_SYSTEM_UID,
        deletedByName: REAPER_SYSTEM_NAME,
        deletedReason: 'stale-uploading',
        objectPurged: true,
        objectPurgedAt: new Date(nowIso),
        updatedAt: new Date(nowIso)
    });
}

async function patchObjectPurged(client, fileId, nowIso) {
    await client.patchDocument(`${COLLECTION}/${encodeURIComponent(fileId)}`, {
        objectPurged: true,
        objectPurgedAt: new Date(nowIso),
        updatedAt: new Date(nowIso)
    });
}

function backoffDelaySec(attempts) {
    return Math.min(3600 * (2 ** Math.max(0, attempts - 1)), MAX_BACKOFF_SEC);
}

/**
 * 把一個失敗的清除工作寫入 KV 重試佇列（冪等：同 fileId 覆寫，
 * 已在佇列者保留其 attempts/firstAt）。KV 不存在時安靜降級。
 *
 * @param {object} env
 * @param {object} p
 * @param {string} p.fileId
 * @param {string[]} p.keys
 * @param {'purge-stale'|'purge-deleted'} p.action
 * @param {string} [p.reason]
 */
export async function enqueuePurge(env, p) {
    const kv = pickKv(env);
    if (!kv) {
        console.warn('[reaper] 無 KV 綁定，清除重試無法入隊：', p && p.fileId);
        return false;
    }
    const fileId = String((p && p.fileId) || '');
    const keys = Array.from(new Set(((p && p.keys) || []).map((k) => String(k))));
    if (!fileId || keys.length === 0) return false;
    for (const key of keys) {
        if (!SAFE_OBJECT_KEY.test(key)) {
            throw new ReapError(400, 'INVALID_KEY', '佇列 key 不在白名單');
        }
    }
    const action = p.action === 'purge-stale' ? 'purge-stale' : 'purge-deleted';
    const nowSec = Math.floor(Date.now() / 1000);
    const kvKey = Q_PREFIX + fileId;

    let existing = null;
    try {
        const raw = await kv.get(kvKey, { cacheTtl: 0 });
        existing = raw ? JSON.parse(raw) : null;
    } catch (_e) {
        existing = null;
    }
    const entry = {
        fileId,
        keys,
        action,
        attempts: existing && Number.isInteger(existing.attempts) ? existing.attempts : 0,
        firstAt: existing && existing.firstAt ? existing.firstAt : nowSec,
        nextAt: existing && existing.nextAt ? existing.nextAt : nowSec,
        lastReason: p.reason || (existing && existing.lastReason) || '',
        lastError: p.lastError || (existing && existing.lastError) || ''
    };
    await kv.put(kvKey, JSON.stringify(entry), { expirationTtl: QUEUE_TTL_SEC });
    return true;
}

async function drainQueue(deps, stats, limit) {
    const { env, kv, bucket, client, nowSec, nowIso } = deps;
    let listed;
    try {
        listed = await kv.list({ prefix: Q_PREFIX, limit });
    } catch (error) {
        stats.queueError = String((error && error.message) || error);
        return;
    }
    for (const item of listed.keys || []) {
        const fileId = item.name.slice(Q_PREFIX.length);
        let entry;
        try {
            const raw = await kv.get(item.name, { cacheTtl: 0 });
            entry = raw ? JSON.parse(raw) : null;
        } catch (_e) {
            continue;
        }
        if (!entry || !Array.isArray(entry.keys)) continue;
        if (Number(entry.nextAt || 0) > nowSec) { stats.queueWaiting += 1; continue; }

        // Dry-run：只回報佇列中「到期待處理」的項目，不刪物件、不搬動佇列
        if (deps.dryRun) {
            stats.queueWouldRetry += 1;
            stats.queueDryRun.push({
                fileId: entry.fileId,
                action: entry.action,
                attempts: Number(entry.attempts || 0),
                keys: entry.keys
            });
            continue;
        }

        try {
            const failed = await purgeObjects(bucket, entry.keys);
            if (failed.length > 0) throw new Error(failed.map((f) => `${f.key}:${f.error}`).join(';'));
            if (entry.action === 'purge-stale') {
                await patchSoftReap(client, entry.fileId, nowIso);
            } else {
                await patchObjectPurged(client, entry.fileId, nowIso);
            }
            await kv.delete(item.name);
            stats.queueSucceeded += 1;
        } catch (error) {
            entry.attempts = Number(entry.attempts || 0) + 1;
            entry.lastError = String((error && error.message) || error).slice(0, 300);
            if (entry.attempts >= MAX_ATTEMPTS) {
                entry.diedAt = nowSec;
                await kv.put(DLQ_PREFIX + fileId, JSON.stringify(entry), {
                    expirationTtl: DLQ_TTL_SEC
                });
                await kv.delete(item.name);
                stats.queueDlq += 1;
            } else {
                entry.nextAt = nowSec + backoffDelaySec(entry.attempts);
                await kv.put(item.name, JSON.stringify(entry), {
                    expirationTtl: QUEUE_TTL_SEC
                });
                stats.queueRetried += 1;
            }
        }
    }
}

/**
 * 管道 1：超齡 uploading 文件 → 刪物件並軟刪
 */
async function reapStaleUploads(deps, stats, staleHours, batchLimit) {
    const { env, kv, bucket, client, cutoffSec, nowIso, queuedFileIds } = deps;
    const rows = await client.queryCollection({
        collectionId: COLLECTION,
        where: {
            fieldFilter: {
                field: { fieldPath: 'uploadStatus' },
                op: 'EQUAL',
                value: { stringValue: 'uploading' }
            }
        }
    });
    stats.staleScanned = rows.docs.length;

    for (const doc of rows.docs) {
        const data = doc.data || {};
        if (data.deleted === true) continue;
        const uploadedSec = data.uploadedAt && Number(data.uploadedAt.seconds);
        if (!Number.isFinite(uploadedSec)) { stats.skippedNoTimestamp += 1; continue; }
        if (uploadedSec > cutoffSec) { stats.fresh += 1; continue; }
        if (stats.staleProcessed >= batchLimit) { stats.staleBatchExceeded += 1; continue; }

        stats.staleProcessed += 1;
        const { keys, invalid } = safeDocKeys(doc);
        if (invalid) {
            stats.invalidKeys.push(doc.id);
            console.warn('[reaper] 跳過 key 不符白名單的文件：', doc.id);
            continue;
        }
        if (deps.dryRun) {
            const { existing, missing } = await inspectObjects(bucket, keys);
            stats.staleWouldPurge += 1;
            stats.staleDryRun.push({ fileId: doc.id, uploadedAt: data.uploadedAt, keys: existing, missing });
            continue;
        }
        try {
            const failed = await purgeObjects(bucket, keys);
            if (failed.length > 0) {
                throw new Error(failed.map((f) => `${f.key}:${f.error}`).join(';'));
            }
            await patchSoftReap(client, doc.id, nowIso);
            stats.stalePurged += 1;
        } catch (error) {
            // 失敗入隊：文件保持 uploading，明日由佇列接手（同日不重複入隊）
            if (!queuedFileIds.has(doc.id)) {
                try {
                    await enqueuePurge(env, {
                        fileId: doc.id,
                        keys,
                        action: 'purge-stale',
                        reason: 'stale-uploading',
                        lastError: String((error && error.message) || error).slice(0, 300)
                    });
                    queuedFileIds.add(doc.id);
                    stats.staleQueued += 1;
                } catch (enqError) {
                    stats.staleFailed += 1;
                    console.warn('[reaper] 超齡文件回收失敗且入隊失敗：', doc.id, enqError.message);
                }
            }
        }
    }
}

/**
 * 管道 3：軟刪文件安全網（每日一頁游標掃描）
 */
async function sweepDeleted(deps, stats) {
    const { env, kv, bucket, client, nowSec, nowIso, queuedFileIds } = deps;
    let cursorName = '';
    try {
        cursorName = (await kv.get(SWEEP_CURSOR_KEY, { cacheTtl: 0 })) || '';
    } catch (_e) {
        cursorName = '';
    }
    const queryOpts = {
        collectionId: COLLECTION,
        limit: SWEEP_PAGE_SIZE,
        where: {
            fieldFilter: {
                field: { fieldPath: 'deleted' },
                op: 'EQUAL',
                value: { booleanValue: true }
            }
        }
    };
    if (cursorName) {
        queryOpts.startAt = { before: false, values: [{ referenceValue: cursorName }] };
    }

    const rows = await client.queryCollection(queryOpts);
    const docs = rows.docs || [];
    stats.sweepScanned = docs.length;

    for (const doc of docs) {
        const data = doc.data || {};
        if (data.objectPurged === true) { stats.sweepAlreadyPurged += 1; continue; }

        const { keys, invalid } = safeDocKeys(doc);
        if (invalid) {
            stats.sweepInvalidKeys.push(doc.id);
            continue;
        }
        if (deps.dryRun) {
            const { existing, missing } = await inspectObjects(bucket, keys);
            stats.sweepWouldPurge += 1;
            stats.sweepDryRun.push({ fileId: doc.id, keys: existing, missing });
            continue;
        }
        try {
            const failed = keys.length ? await purgeObjects(bucket, keys) : [];
            if (failed.length > 0) {
                throw new Error(failed.map((f) => `${f.key}:${f.error}`).join(';'));
            }
            await patchObjectPurged(client, doc.id, nowIso);
            stats.sweepPurged += 1;
        } catch (error) {
            if (!queuedFileIds.has(doc.id) && keys.length) {
                try {
                    await enqueuePurge(env, {
                        fileId: doc.id,
                        keys,
                        action: 'purge-deleted',
                        reason: 'deleted-sweep'
                    });
                    queuedFileIds.add(doc.id);
                    stats.sweepQueued += 1;
                } catch (_enqError) {
                    stats.sweepFailed += 1;
                }
            }
        }
    }

    // 一頁未滿＝掃完一輪，游標歸零重新循環；否則存最後一筆供明日接續。
    // Dry-run 不推進游標，避免「只預覽」就跳過後面的軟刪文件。
    if (deps.dryRun) {
        stats.sweepCursorDryRun = cursorName || null;
        return;
    }
    try {
        if (docs.length < SWEEP_PAGE_SIZE) {
            await kv.delete(SWEEP_CURSOR_KEY);
            stats.sweepCursorReset = true;
        } else {
            await kv.put(SWEEP_CURSOR_KEY, docs[docs.length - 1].name);
        }
    } catch (error) {
        stats.sweepCursorError = String((error && error.message) || error);
    }
}

/**
 * 執行一次附件孤兒回收。由 Pages Cron 或帶密碼的 HTTP 端點呼叫。
 * @param {object} env
 * @param {object} [options]
 * @param {string} [options.trigger]
 * @param {boolean} [options.dryRun] true＝只掃描預覽，不做任何寫入
 * @param {number} [options.nowMs] 測試用
 * @returns {Promise<object>} 本輪統計
 */
export async function runAttachmentReaper(env, options = {}) {
    const bucket = bucketOf(env);
    const kv = pickKv(env);
    const { staleHours, batchLimit } = readConfig(env);

    const nowMs = Number(options.nowMs) > 0 ? Number(options.nowMs) : Date.now();
    const nowSec = Math.floor(nowMs / 1000);
    const nowIso = new Date(nowMs).toISOString();
    const cutoffSec = nowSec - staleHours * 3600;

    const access = await getAccessToken(env);
    const client = new FirestoreClient(access.token, access.projectId, env.FIREBASE_RTDB_URL || '');

    const stats = {
        trigger: options.trigger || 'manual',
        ranAt: nowIso,
        dryRun: options.dryRun === true,
        staleHours,
        batchLimit,
        queueBound: !!kv,
        staleScanned: 0,
        fresh: 0,
        staleProcessed: 0,
        stalePurged: 0,
        staleQueued: 0,
        staleFailed: 0,
        staleBatchExceeded: 0,
        staleWouldPurge: 0,
        staleDryRun: [],
        skippedNoTimestamp: 0,
        invalidKeys: [],
        queueSucceeded: 0,
        queueRetried: 0,
        queueDlq: 0,
        queueWaiting: 0,
        queueWouldRetry: 0,
        queueDryRun: [],
        queueError: '',
        sweepScanned: 0,
        sweepAlreadyPurged: 0,
        sweepPurged: 0,
        sweepQueued: 0,
        sweepFailed: 0,
        sweepWouldPurge: 0,
        sweepDryRun: [],
        sweepInvalidKeys: [],
        sweepCursorReset: false,
        sweepCursorDryRun: null,
        sweepCursorError: ''
    };

    // 本日處理中已入隊的 fileId，避免管線間重複 enqueue
    const queuedFileIds = new Set();
    const deps = {
        env, kv, bucket, client, nowSec, nowIso, cutoffSec, queuedFileIds,
        dryRun: options.dryRun === true
    };

    // 1. 先清重試佇列（昨日失敗者優先）
    if (kv) {
        await drainQueue(deps, stats, batchLimit);
        // drainQueue 可能把鍵搬到 DLQ，補齊已在隊清單
        try {
            const listed = await kv.list({ prefix: Q_PREFIX, limit: batchLimit });
            for (const item of listed.keys || []) {
                queuedFileIds.add(item.name.slice(Q_PREFIX.length));
            }
        } catch (_e) {}
    }

    // 2. 超齡 uploading
    await reapStaleUploads(deps, stats, staleHours, batchLimit);

    // 3. 軟刪安全網（須有 KV 才能記游標；無 KV 時每日重頭掃一頁）
    if (kv) {
        await sweepDeleted(deps, stats);
    }

    console.log('[reaper] 附件回收完成：' + JSON.stringify(stats));
    return stats;
}
