/* ============================================================
 * 備份 API 共用 HTTP 輔助
 * ============================================================ */

import { requireAdmin, getAccessToken, getServiceAccount } from './google-auth.js';

export function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Backup-Cron-Secret',
        'Access-Control-Max-Age': '86400'
    };
}

export function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, corsHeaders())
    });
}

export function optionsResponse() {
    return new Response(null, { status: 204, headers: corsHeaders() });
}

/**
 * 管理員驗證；成功回傳 {uid, email, via}，失敗拋出帶 status 的錯誤。
 */
export async function authenticateAdmin(request, env) {
    try {
        const admin = await requireAdmin(request, env, async (uid) => {
            const auth = await getAccessToken(env);
            const url = `https://firestore.googleapis.com/v1/projects/${auth.projectId}/databases/(default)/documents/users/${encodeURIComponent(uid)}`;
            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${auth.token}` }
            });
            if (!response.ok) return null;
            const doc = await response.json();
            const fields = doc.fields || {};
            const position = fields.position && fields.position.stringValue;
            return position ? { position } : null;
        });
        return admin;
    } catch (error) {
        error.status = error.status || 401;
        throw error;
    }
}

/**
 * 外部排程服務（cron-job.org 等）以共享密鑰呼叫時使用。
 */
export function isAuthorizedCronCall(request, env) {
    const secret = env && env.BACKUP_CRON_SECRET;
    if (!secret) return false;
    const provided = request.headers.get('X-Backup-Cron-Secret') || '';
    if (provided.length !== secret.length) return false;
    let mismatch = 0;
    for (let i = 0; i < secret.length; i++) {
        mismatch |= provided.charCodeAt(i) ^ secret.charCodeAt(i);
    }
    return mismatch === 0;
}

export function projectIdOf(env) {
    return getServiceAccount(env).project_id;
}
