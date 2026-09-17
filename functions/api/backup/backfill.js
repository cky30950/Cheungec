/* ============================================================
 * POST /api/backup/backfill
 * 一次性替現有文件補上 updatedAt（管理員）。
 *
 * 上線 updatedAt 攔截後，舊文件仍無 updatedAt，增量同步會漏掉它們。
 * 本端點以 IS_NULL 查詢找出缺欄位文件並逐一 PATCH（只寫 updatedAt），
 * 每個文件產生 1 次寫入計費，僅需執行一次。
 *
 * Body（選填）：{ "collections": ["patients", "consultations"] }
 * ============================================================ */

import { getAccessToken, getServiceAccount } from './lib/google-auth.js';
import { FirestoreClient } from './lib/firestore.js';
import { TOP_COLLECTIONS, clinicBillingKey } from './lib/config.js';
import { jsonResponse, optionsResponse, corsHeaders, authenticateAdmin } from './lib/http.js';

export function onRequestOptions() {
    return optionsResponse();
}

async function backfillSource(client, source) {
    let patched = 0;
    const stamp = new Date().toISOString();

    let cursor = null;
    for (let page = 0; page < 2000; page++) {
        const structuredQuery = {
            from: [{ collectionId: source.collectionId }],
            where: {
                unaryFilter: {
                    field: { fieldPath: 'updatedAt' },
                    op: 'IS_NULL'
                }
            },
            orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
            limit: 300
        };
        if (cursor) structuredQuery.startAt = cursor;

        const parent = source.parentDocPath
            ? `${client.documentsPath()}/${source.parentDocPath}`
            : client.documentsPath();
        const response = await fetch(`${parent}:runQuery`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${client.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ structuredQuery })
        });
        const rows = await response.json();
        if (!response.ok) {
            throw new Error((rows && rows.error && rows.error.message) || ('HTTP ' + response.status));
        }

        const docs = (Array.isArray(rows) ? rows : [rows])
            .filter((row) => row && row.document)
            .map((row) => row.document);

        // 每 8 個並行一批，避免突發寫入過量
        for (let i = 0; i < docs.length; i += 8) {
            await Promise.all(docs.slice(i, i + 8).map((doc) =>
                client.patchDocUpdatedAt(doc.name, stamp).then(() => { patched++; })
            ));
        }

        if (docs.length < 300) break;
        const lastName = docs[docs.length - 1].name;
        cursor = { before: false, values: [{ referenceValue: lastName }] };
    }
    return patched;
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
        const only = Array.isArray(body.collections)
            ? body.collections.map((x) => String(x))
            : null;

        const auth = await getAccessToken(env);
        const client = new FirestoreClient(auth.token, auth.projectId, env.FIREBASE_RTDB_URL || '');
        const clinicIds = await client.listClinicIds();
        const sources = TOP_COLLECTIONS.slice();
        for (const clinicId of clinicIds) {
            sources.push({
                key: clinicBillingKey(clinicId),
                collectionId: 'billingItems',
                parentDocPath: `clinics/${clinicId}`
            });
        }

        const targets = only ? sources.filter((s) => only.includes(s.key)) : sources;
        if (targets.length === 0) {
            return jsonResponse({ error: 'NO_MATCHING_COLLECTION', available: sources.map((s) => s.key) }, 400);
        }

        const report = {};
        const failures = [];
        for (const source of targets) {
            try {
                report[source.key] = await backfillSource(client, source);
            } catch (error) {
                report[source.key] = -1;
                failures.push({ source: source.key, error: String(error.message || error) });
            }
        }

        return jsonResponse({
            status: failures.length ? 'partial' : 'success',
            stampNote: '同一次 backfill 內文件獲派相同 updatedAt，之後請立即執行一次 baseline 同步',
            patched: report,
            failures
        });
    } catch (error) {
        return new Response(JSON.stringify({
            error: 'BACKFILL_FAILED',
            message: String((error && error.message) || error),
            projectHint: (() => { try { return getServiceAccount(context.env).project_id; } catch (_e) { return null; } })()
        }), {
            status: error.status || 500,
            headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, corsHeaders())
        });
    }
}
