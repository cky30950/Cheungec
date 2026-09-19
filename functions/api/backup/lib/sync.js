/* ============================================================
 * R2 備份同步核心
 * ------------------------------------------------------------
 * runBackupSync(env, options)：
 *   1. 以 Service Account 透過 Firestore REST 讀取各集合
 *      （大集合增量 updatedAt、小集合全量、每 7 日自動大集合 baseline）
 *   2. 將最新完整快照寫入 R2 snapshots/
 *   3. 組裝與舊版格式相容的 gzip 備份 JSON 至 exports/
 *      （舊檔到期刪除交由 R2 lifecycle rule 處理）
 *   4. 更新 state/sync-state.json（watermark、統計、最後執行狀態）
 *
 * 可由 cron（functions/scheduled.js）或管理員手動端點觸發。
 * ============================================================ */

import { getAccessToken } from './google-auth.js';
import { FirestoreClient } from './firestore.js';
import {
    STATE_KEY,
    SNAPSHOT_PREFIX,
    EXPORT_PREFIX,
    BASELINE_INTERVAL_MS,
    TOP_COLLECTIONS,
    BILLING_EXPORT_KEY,
    snapshotKey,
    clinicBillingKey,
    isClinicBillingKey,
    clinicIdFromKey,
    buildExportKey,
    downloadFileNameFromKey,
    GZIP_TYPE
} from './config.js';

const JSON_TYPE = 'application/json; charset=utf-8';

/**
 * 以 Cloudflare 原生 CompressionStream 將 JSON 文字壓成 gzip（零依賴）。
 * 回傳 ArrayBuffer 供 R2 put 使用。
 */
async function gzipString(text) {
    const compressed = new Blob([text]).stream()
        .pipeThrough(new CompressionStream('gzip'));
    return new Response(compressed).arrayBuffer();
}

async function readState(bucket) {
    const obj = await bucket.get(STATE_KEY);
    if (!obj) {
        return {
            version: 1,
            createdAt: new Date().toISOString(),
            sources: {},
            rtdb: null,
            lastExportKey: null,
            lastExportAt: null,
            lastRun: null
        };
    }
    try {
        return await obj.json();
    } catch (error) {
        return {
            version: 1,
            createdAt: new Date().toISOString(),
            sources: {},
            rtdb: null,
            lastExportKey: null,
            lastExportAt: null,
            lastRun: { warning: '舊狀態檔無法解析，已重建: ' + error.message }
        };
    }
}

async function writeState(bucket, state) {
    await bucket.put(STATE_KEY, JSON.stringify(state, null, 2), {
        httpMetadata: { contentType: JSON_TYPE }
    });
}

async function readSnapshotDocs(bucket, key) {
    const obj = await bucket.get(key);
    if (!obj) return null;
    const parsed = await obj.json();
    return parsed && parsed.docs && typeof parsed.docs === 'object' ? parsed.docs : null;
}

async function writeSnapshot(bucket, sourceKey, meta, docs) {
    const payload = {
        key: sourceKey,
        collectionId: meta.collectionId || null,
        parentDocPath: meta.parentDocPath || null,
        updatedAt: new Date().toISOString(),
        docs
    };
    await bucket.put(snapshotKey(sourceKey), JSON.stringify(payload), {
        httpMetadata: { contentType: JSON_TYPE }
    });
}

/**
 * 同步單一資料來源。
 * @returns {Promise<{mode, docsRead, totalDocs, watermark}>}
 */
async function syncSource(client, bucket, source, entry, forceBaseline) {
    const now = Date.now();
    const existingSnapshot = await readSnapshotDocs(bucket, snapshotKey(source.key));

    const baselineDue = !entry
        || !entry.lastBaselineAt
        || (now - new Date(entry.lastBaselineAt).getTime() >= BASELINE_INTERVAL_MS);

    const useBaseline = forceBaseline
        || source.alwaysFull
        || baselineDue
        || !existingSnapshot;

    if (useBaseline) {
        const docs = {};
        const result = await client.queryCollection({
            collectionId: source.collectionId,
            parentDocPath: source.parentDocPath || '',
            onDoc: (doc) => { docs[doc.id] = doc.data; }
        });
        await writeSnapshot(bucket, source.key, source, docs);
        return {
            mode: 'baseline',
            docsRead: result.docs.length,
            totalDocs: Object.keys(docs).length,
            lastBaselineAt: new Date().toISOString(),
            watermark: maxWatermarkFromDocs(result.docs) || (entry && entry.watermark) || null
        };
    }

    // 增量模式
    if (!entry.watermark || !entry.watermark.ts || !entry.watermark.name) {
        // 沒有 watermark 但有快照：快照可能來自舊版本，保險起見重做 baseline
        const docs = {};
        const result = await client.queryCollection({
            collectionId: source.collectionId,
            parentDocPath: source.parentDocPath || '',
            onDoc: (doc) => { docs[doc.id] = doc.data; }
        });
        await writeSnapshot(bucket, source.key, source, docs);
        return {
            mode: 'baseline',
            docsRead: result.docs.length,
            totalDocs: Object.keys(docs).length,
            lastBaselineAt: new Date().toISOString(),
            watermark: maxWatermarkFromDocs(result.docs)
        };
    }

    const result = await client.queryChangedSince(source, entry.watermark);
    const docs = existingSnapshot;
    for (const doc of result.docs) {
        docs[doc.id] = doc.data;
    }
    await writeSnapshot(bucket, source.key, source, docs);
    return {
        mode: 'delta',
        docsRead: result.docs.length,
        totalDocs: Object.keys(docs).length,
        lastBaselineAt: entry.lastBaselineAt || null,
        watermark: lastWatermarkFromDocs(result.docs) || entry.watermark
    };
}

function lastWatermarkFromDocs(docs) {
    if (!Array.isArray(docs) || docs.length === 0) return null;
    const last = docs[docs.length - 1];
    if (!last._rawUpdatedAt) return null;
    return { ts: last._rawUpdatedAt, name: last.name };
}

/**
 * Baseline 結果按 __name__ 排序，不能直接取最後一筆的 updatedAt。
 * 需在全體文件中找出最大的（updatedAt, __name__）作為增量起點，
 * 否則會漏讀 updatedAt 較大但名稱排序較前的文件。
 */
function maxWatermarkFromDocs(docs) {
    if (!Array.isArray(docs) || docs.length === 0) return null;
    let max = null;
    let maxMs = null;
    for (const doc of docs) {
        if (!doc._rawUpdatedAt) continue;
        const ms = Date.parse(doc._rawUpdatedAt);
        if (isNaN(ms)) continue;
        if (max === null || ms > maxMs || (ms === maxMs && doc.name > max.name)) {
            max = { ts: doc._rawUpdatedAt, name: doc.name };
            maxMs = ms;
        }
    }
    return max;
}

/**
 * 組裝與舊版 exportClinicBackup() 相容的備份物件。
 */
async function assembleExport(bucket, sourceDefs, rtdbData, stats) {
    const docsByKey = {};
    for (const def of sourceDefs) {
        docsByKey[def.key] = (await readSnapshotDocs(bucket, snapshotKey(def.key))) || {};
    }

    const toArray = (map) => Object.entries(map).map(([id, data]) => ({ id, ...data }));

    const exportObj = {
        patients: toArray(docsByKey.patients || {}),
        consultations: toArray(docsByKey.consultations || {}),
        users: toArray(docsByKey.users || {}),
        billingItems: buildBillingItems(docsByKey, sourceDefs),
        patientPackages: toArray(docsByKey.patientPackages || {}),
        patientPackageHistory: toArray(docsByKey.patientPackageHistory || {}),
        clinics: toArray(docsByKey.clinics || {}),
        clinicExpenses: toArray(docsByKey.clinicExpenses || {}),
        consultationAuditLogs: toArray(docsByKey.consultationAuditLogs || {}),
        rtdb: rtdbData || undefined,
        exportedAt: new Date().toISOString(),
        backupSource: 'cloudflare-r2',
        backupStats: stats
    };
    if (!exportObj.rtdb) delete exportObj.rtdb;
    return exportObj;
}

function buildBillingItems(docsByKey, sourceDefs) {
    const items = [];
    // 全域項目：與前端 onSnapshot 讀取一致，強制 shared: true（覆蓋文件內的值）
    for (const [id, data] of Object.entries(docsByKey.globalBillingItems || {})) {
        items.push({ id, ...data, shared: true });
    }
    // 各診所項目
    for (const def of sourceDefs) {
        if (def.key === 'globalBillingItems' || !isClinicBillingKey(def.key)) continue;
        for (const [id, data] of Object.entries(docsByKey[def.key] || {})) {
            items.push({ id, ...data });
        }
    }
    return items;
}

/**
 * 清理已不存在嘅診所殘留 billingItems 快照（避免匯入鬼魂資料）。
 */
async function pruneStaleClinicSnapshots(bucket, liveClinicIds) {
    const liveKeys = new Set(liveClinicIds.map(clinicBillingKey));
    const removed = [];
    let cursor;
    do {
        const result = await bucket.list({ prefix: SNAPSHOT_PREFIX, cursor, limit: 1000 });
        for (const obj of result.objects) {
            const key = obj.key.slice(SNAPSHOT_PREFIX.length).replace(/\.json$/, '');
            if (isClinicBillingKey(key) && !liveKeys.has(key)) {
                await bucket.delete(obj.key);
                removed.push(key);
            }
        }
        cursor = result.truncated ? result.cursor : undefined;
    } while (cursor);
    return removed;
}

/**
 * 備份主流程。
 * @param {object} env Pages 環境（含 BACKUP_BUCKET binding、Secrets）
 * @param {object} options { trigger, forceBaseline, actor }
 */
export async function runBackupSync(env, options = {}) {
    const trigger = options.trigger || 'manual';
    const bucket = env && env.BACKUP_BUCKET;
    if (!bucket) {
        throw new Error('缺少 R2 binding：BACKUP_BUCKET 未設定');
    }

    const auth = await getAccessToken(env);
    const client = new FirestoreClient(
        auth.token,
        auth.projectId,
        env.FIREBASE_RTDB_URL || ''
    );

    const state = await readState(bucket);
    state.sources = state.sources || {};

    // 組出本次資料來源清單（頂層集合＋各診所 billingItems）
    const clinicIds = await client.listClinicIds();
    const sources = TOP_COLLECTIONS.slice();
    for (const clinicId of clinicIds) {
        sources.push({
            key: clinicBillingKey(clinicId),
            collectionId: 'billingItems',
            parentDocPath: `clinics/${clinicId}`,
            alwaysFull: true
        });
    }

    const staleRemoved = await pruneStaleClinicSnapshots(bucket, clinicIds);

    const sourceResults = {};
    const failures = [];
    let totalReads = 0;

    for (const source of sources) {
        try {
            const result = await syncSource(
                client,
                bucket,
                source,
                state.sources[source.key] || null,
                !!options.forceBaseline
            );
            sourceResults[source.key] = {
                ...result,
                collectionId: source.collectionId,
                parentDocPath: source.parentDocPath || null,
                lastSyncAt: new Date().toISOString(),
                error: null
            };
            totalReads += result.docsRead;
        } catch (error) {
            console.error(`同步 ${source.key} 失敗:`, error);
            failures.push({ source: source.key, error: String(error.message || error) });
            sourceResults[source.key] = {
                ...(state.sources[source.key] || {}),
                lastSyncAt: new Date().toISOString(),
                error: String(error.message || error)
            };
        }
    }

    // RTDB（全量，RTDB 不按文件讀取計費）
    let rtdbError = null;
    let rtdbData = null;
    try {
        rtdbData = await client.fetchRtdbSnapshot();
        await writeSnapshot(bucket, 'rtdb', { collectionId: null }, rtdbData || {});
        state.rtdb = { lastSyncAt: new Date().toISOString(), error: null };
    } catch (error) {
        console.error('同步 RTDB 失敗:', error);
        rtdbError = String(error.message || error);
        state.rtdb = { ...(state.rtdb || {}), lastSyncAt: new Date().toISOString(), error: rtdbError };
        // RTDB 失敗時嘗試使用舊快照組裝
        const previous = await readSnapshotDocs(bucket, snapshotKey('rtdb'));
        if (previous) rtdbData = previous;
        failures.push({ source: 'rtdb', error: rtdbError });
    }

    // 成功來源才更新 watermark
    for (const [key, result] of Object.entries(sourceResults)) {
        if (!result.error) state.sources[key] = result;
    }

    // 組裝下載用備份檔
    const stats = {
        trigger,
        firestoreReads: totalReads,
        syncedAt: new Date().toISOString(),
        failures: failures.length,
        actor: options.actor || null
    };
    const exportObj = await assembleExport(bucket, sources, rtdbData, stats);
    const exportKey = buildExportKey();
    // 緊湊 JSON（人類不可讀無所謂，下載後可解壓）後 gzip，醫療 JSON 一般縮 5–10 倍
    const exportJson = JSON.stringify(exportObj);
    const compressedBytes = await gzipString(exportJson);
    await bucket.put(exportKey, compressedBytes, {
        httpMetadata: {
            contentType: GZIP_TYPE,
            // 刻意不設 contentEncoding：讓瀏覽器原樣下載 .json.gz，而不會自動解壓
            contentDisposition: `attachment; filename="${downloadFileNameFromKey(exportKey)}"`
        },
        customMetadata: { format: 'gzip-json', version: '1' }
    });

    state.lastExportKey = exportKey;
    state.lastExportAt = new Date().toISOString();
    state.lastRun = {
        trigger,
        at: new Date().toISOString(),
        status: failures.length ? 'partial' : 'success',
        firestoreReads: totalReads,
        failures,
        staleClinicSnapshotsRemoved: staleRemoved,
        exportBytes: compressedBytes.byteLength,
        exportBytesUncompressed: exportJson.length,
        actor: options.actor || null
    };
    await writeState(bucket, state);

    return {
        status: failures.length ? 'partial' : 'success',
        exportKey,
        exportFileName: downloadFileNameFromKey(exportKey),
        exportBytes: compressedBytes.byteLength,
        exportBytesUncompressed: exportJson.length,
        firestoreReads: totalReads,
        failures,
        sources: Object.fromEntries(
            Object.entries(sourceResults).map(([k, v]) => [
                k,
                { mode: v.mode, docsRead: v.docsRead, totalDocs: v.totalDocs, error: v.error || null }
            ])
        )
    };
}

/**
 * 列出可供下載的備份檔（最新在前）。
 */
export async function listExports(bucket) {
    const keys = [];
    let cursor;
    do {
        const result = await bucket.list({ prefix: EXPORT_PREFIX, cursor, limit: 1000 });
        for (const obj of result.objects) {
            keys.push({ key: obj.key, size: obj.size, uploaded: obj.uploaded });
        }
        cursor = result.truncated ? result.cursor : undefined;
    } while (cursor);
    keys.sort((a, b) => (a.key < b.key ? 1 : -1));
    return keys;
}

/**
 * 取狀態（供前端顯示，移除過長明細）。
 */
export async function getStatus(bucket) {
    const state = await readState(bucket);
    return {
        lastRun: state.lastRun || null,
        lastExportAt: state.lastExportAt || null,
        lastExportFileName: state.lastExportKey ? downloadFileNameFromKey(state.lastExportKey) : null,
        sources: Object.fromEntries(
            Object.entries(state.sources || {}).map(([k, v]) => [k, {
                mode: v.mode || null,
                totalDocs: v.totalDocs || 0,
                lastSyncAt: v.lastSyncAt || null,
                lastBaselineAt: v.lastBaselineAt || null,
                error: v.error || null
            }])
        ),
        rtdb: state.rtdb || null
    };
}

export { downloadFileNameFromKey };
