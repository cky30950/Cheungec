/* ============================================================
 * POST /api/backup/sync
 * 手動觸發 Firestore → R2 備份同步（管理員）。
 * 亦接受 X-Backup-Cron-Secret（供外部排程服務呼叫）。
 * Body（選填）：{ "forceBaseline": false }
 * ============================================================ */

import { runBackupSync } from './lib/sync.js';
import { jsonResponse, optionsResponse, corsHeaders, authenticateAdmin, isAuthorizedCronCall } from './lib/http.js';

export function onRequestOptions() {
    return optionsResponse();
}

export async function onRequestPost(context) {
    const { request, env } = context;
    let actor = null;

    try {
        if (isAuthorizedCronCall(request, env)) {
            actor = 'cron-secret';
        } else {
            const admin = await authenticateAdmin(request, env);
            actor = admin.email || admin.uid;
        }

        let body = {};
        try {
            body = await request.json();
        } catch (_e) {
            body = {};
        }
        const forceBaseline = !!(body && body.forceBaseline);

        const result = await runBackupSync(env, {
            trigger: actor === 'cron-secret' ? 'cron-secret' : 'manual',
            forceBaseline,
            actor
        });
        return jsonResponse(result, 200);
    } catch (error) {
        const status = error.status || (String(error.message || '').includes('BACKUP_BUCKET') ? 500 : 500);
        return new Response(JSON.stringify({
            error: 'BACKUP_SYNC_FAILED',
            message: String((error && error.message) || error)
        }), {
            status,
            headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, corsHeaders())
        });
    }
}

export async function onRequestGet() {
    return jsonResponse({ error: 'METHOD_NOT_ALLOWED', message: '請使用 POST 觸發同步' }, 405);
}
