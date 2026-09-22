/* ============================================================
 * Admin API 共用 HTTP 輔助
 * ============================================================ */

import { authenticateAdmin } from '../../backup/lib/http.js';

export function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Admin-Bootstrap-Secret',
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
 * 管理員驗證：同 backup authenticateAdmin
 * （claims.admin === true，或 users 文件 position === '診所管理'）。
 */
export async function requireStaffAdmin(request, env) {
    return authenticateAdmin(request, env);
}

/**
 * Bootstrap 專用：允許以共享密鑰呼叫（首次部署、任何用戶都未有 claims 時使用）。
 */
export function isAuthorizedBootstrapCall(request, env) {
    const secret = env && env.ADMIN_BOOTSTRAP_SECRET;
    if (!secret) return false;
    const provided = request.headers.get('X-Admin-Bootstrap-Secret') || '';
    if (provided.length !== secret.length) return false;
    let mismatch = 0;
    for (let i = 0; i < secret.length; i++) {
        mismatch |= provided.charCodeAt(i) ^ secret.charCodeAt(i);
    }
    return mismatch === 0;
}

export function errorResponse(error, fallbackStatus = 500) {
    const status = error.status || fallbackStatus;
    return jsonResponse({
        error: String(error.code || 'ADMIN_API_ERROR'),
        message: String((error && error.message) || error)
    }, status);
}
