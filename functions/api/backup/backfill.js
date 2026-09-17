/* ============================================================
 * POST /api/backup/backfill
 * 一次性替現有文件補上 updatedAt（管理員）。
 *
 * 上線 updatedAt 攔截後，舊文件仍無 updatedAt，增量同步會漏掉它們。
 * 本端點以 IS_NULL 查詢找出缺欄位文件，再以 Firestore :commit
 * （單請求最多 500 筆）批次寫入 updatedAt，每文件僅 1 次寫入計費。
 *
 * 為配合 Cloudflare 單次請求的子請求數上限，每次呼叫只處理一個集合
 * 的一批資料並回傳 cursor，由前端分批呼叫直到完成，可安全重入：
 *
 *   GET  /api/backup/backfill                列出待處理集合
 *   POST /api/backup/backfill
 *     body: { "collection": "patients", "after": null, "limit": 450 }
 *     resp: { "patched": 450, "done": false, "after": "projects/.../x" }
 * ============================================================ */

import { getAccessToken } from './lib/google-auth.js';
import { FirestoreClient } from './lib/firestore.js';
import { TOP_COLLECTIONS, clinicBillingKey } from './lib/config.js';
import { jsonResponse, optionsResponse, corsHeaders, authenticateAdmin } from './lib/http.js';

export function onRequestOptions() {
    return optionsResponse();
}

const COMMIT_CHUNK = 450; // :commit 上限 500，保留餘裕

async function listSources(client) {
    const clinicIds = await client.listClinicIds();
    const sources = TOP_COLLECTIONS.map((s) => ({
        key: s.key,
        collectionId: s.collectionId,
        parentDocPath: null
    }));
    for (const clinicId of clinicIds) {
        sources.push({
            key: clinicBillingKey(clinicId),
            collectionId: 'billingItems',
            parentDocPath: `clinics/${clinicId}`
        });
    }
    return sources;
}

/**
 * 查詢一頁 IS NULL updatedAt 文件並以 :commit 批次補蓋時間戳。
 */
async function patchOneBatch(client, source, after, limit) {
    const parent = source.parentDocPath
        ? `${client.documentsPath()}/${source.parentDocPath}`
        : client.documentsPath();

    const structuredQuery = {
        from: [{ collectionId: source.collectionId }],
        where: {
            unaryFilter: {
                field: { fieldPath: 'updatedAt' },
                op: 'IS_NULL'
            }
        },
        orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
        limit
    };
    if (after) {
        structuredQuery.startAt = { before: false, values: [{ referenceValue: after }] };
    }

    const queryResponse = await fetch(`${parent}:runQuery`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${client.token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ structuredQuery })
    });
    const rows = await queryResponse.json();
    if (!queryResponse.ok) {
        throw new Error((rows && rows.error && rows.error.message) || ('HTTP ' + queryResponse.status));
    }

    const docs = (Array.isArray(rows) ? rows : [rows])
        .filter((row) => row && row.document)
        .map((row) => row.document);

    if (docs.length === 0) {
        return { patched: 0, done: true, after: null };
    }

    const stamp = new Date().toISOString();
    const writes = docs.map((doc) => ({
        update: {
            name: doc.name,
            fields: { updatedAt: { timestampValue: stamp } }
        },
        updateMask: { fieldPaths: ['updatedAt'] }
    }));

    // 理論上一頁最多 limit 筆（≤ COMMIT_CHUNK），保險起見仍分塊提交
    for (let i = 0; i < writes.length; i += COMMIT_CHUNK) {
        const chunk = writes.slice(i, i + COMMIT_CHUNK);
        const commitResponse = await fetch(`${client.documentsPath()}:commit`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${client.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ writes: chunk })
        });
        if (!commitResponse.ok) {
            const text = await commitResponse.text();
            throw new Error(`批次寫入失敗: ${text.slice(0, 200)}`);
        }
    }

    return {
        patched: docs.length,
        // 查滿 limit 才可能有下一頁
        done: docs.length < limit,
        after: docs.length === limit ? docs[docs.length - 1].name : null
    };
}

export async function onRequestGet(context) {
    const { request, env } = context;
    try {
        await authenticateAdmin(request, env);
        const auth = await getAccessToken(env);
        const client = new FirestoreClient(auth.token, auth.projectId, env.FIREBASE_RTDB_URL || '');
        const sources = await listSources(client);
        return jsonResponse({ collections: sources.map((s) => s.key) });
    } catch (error) {
        return new Response(JSON.stringify({
            error: 'BACKFILL_LIST_FAILED',
            message: String((error && error.message) || error)
        }), {
            status: error.status || 500,
            headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, corsHeaders())
        });
    }
}

export async function onRequestPost(context) {
    const { request, env } = context;
    try {
        await authenticateAdmin(request, env);

        let body = {};
        try {
            body = await request.json();
        } catch (_e) {
            body = {};
        }
        const requestedKey = body.collection ? String(body.collection) : null;
        const after = body.after ? String(body.after) : null;
        const limit = Math.min(Math.max(Number(body.limit) || COMMIT_CHUNK, 50), COMMIT_CHUNK);

        const auth = await getAccessToken(env);
        const client = new FirestoreClient(auth.token, auth.projectId, env.FIREBASE_RTDB_URL || '');
        const sources = await listSources(client);
        const source = sources.find((s) => s.key === requestedKey);
        if (!source) {
            return jsonResponse({
                error: 'UNKNOWN_COLLECTION',
                message: `找不到集合：${requestedKey}`,
                available: sources.map((s) => s.key)
            }, 400);
        }

        const result = await patchOneBatch(client, source, after, limit);
        return jsonResponse({
            collection: source.key,
            patched: result.patched,
            done: result.done,
            after: result.after
        });
    } catch (error) {
        return new Response(JSON.stringify({
            error: 'BACKFILL_FAILED',
            message: String((error && error.message) || error)
        }), {
            status: error.status || 500,
            headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, corsHeaders())
        });
    }
}
