/* ============================================================
 * GET /api/backup/download?key=latest
 * 下載 R2 上已組裝好的備份檔（管理員）。
 * 全程不讀 Firestore，故不產生 Firestore 讀取計費。
 * ============================================================ */

import { listExports } from './lib/sync.js';
import { EXPORT_PREFIX, isGzipExportKey } from './lib/config.js';
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

        const url = new URL(request.url);
        const requested = url.searchParams.get('key') || 'latest';

        let objectKey;
        if (requested === 'latest') {
            const all = await listExports(bucket);
            if (all.length === 0) {
                return jsonResponse({
                    error: 'NO_BACKUP_AVAILABLE',
                    message: 'R2 尚未有備份檔，請先執行一次雲端同步'
                }, 404);
            }
            objectKey = all[0].key;
        } else {
            // 只允許下載 exports/ 前綴，避免路徑穿越
            const safe = String(requested).replace(/^\/+/, '');
            if (!safe.startsWith(EXPORT_PREFIX)) {
                return jsonResponse({ error: 'BAD_KEY' }, 400);
            }
            objectKey = safe;
        }

        const object = await bucket.get(objectKey);
        if (!object) {
            return jsonResponse({ error: 'BACKUP_NOT_FOUND' }, 404);
        }

        const fileName = objectKey.replace(/^exports\//, '');
        const isGzip = isGzipExportKey(objectKey)
            || (object.httpMetadata && object.httpMetadata.contentType === 'application/gzip')
            || (object.customMetadata && object.customMetadata.format === 'gzip-json');
        return new Response(object.body, {
            status: 200,
            headers: {
                // gzip 檔用 application/gzip 且不設 Content-Encoding，
                // 瀏覽器才會把 .json.gz 原樣存檔（否則會自動解壓令檔名／內容不符）
                'Content-Type': isGzip ? 'application/gzip' : 'application/json; charset=utf-8',
                'Content-Disposition': `attachment; filename="${fileName}"`,
                'Content-Length': String(object.size || 0),
                'Cache-Control': 'private, no-store',
                ...corsHeaders()
            }
        });
    } catch (error) {
        return new Response(JSON.stringify({
            error: 'BACKUP_DOWNLOAD_FAILED',
            message: String((error && error.message) || error)
        }), {
            status: error.status || 500,
            headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, corsHeaders())
        });
    }
}
