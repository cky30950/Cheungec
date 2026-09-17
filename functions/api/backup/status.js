/* ============================================================
 * GET /api/backup/status
 * 查詢最近備份狀態（管理員）：最後同步時間、各集合統計、檔案。
 * ============================================================ */

import { getStatus, listExports } from './lib/sync.js';
import { jsonResponse, optionsResponse, corsHeaders, authenticateAdmin } from './lib/http.js';

export function onRequestOptions() {
    return optionsResponse();
}

export async function onRequestGet(context) {
    const { request, env } = context;
    try {
        await authenticateAdmin(request, env);
        const bucket = env.BACKUP_BUCKET;
        if (!bucket) {
            return jsonResponse({ error: 'BACKUP_BUCKET_NOT_BOUND' }, 500);
        }
        const [status, exports2] = await Promise.all([
            getStatus(bucket),
            listExports(bucket)
        ]);
        return jsonResponse({
            ...status,
            exports: exports2.slice(0, 30).map((item) => ({
                key: item.key,
                fileName: item.key.replace(/^exports\//, ''),
                size: item.size,
                uploaded: item.uploaded ? new Date(item.uploaded).toISOString() : null
            }))
        });
    } catch (error) {
        return new Response(JSON.stringify({
            error: 'BACKUP_STATUS_FAILED',
            message: String((error && error.message) || error)
        }), {
            status: error.status || 500,
            headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, corsHeaders())
        });
    }
}
