/* ============================================================
 * Admin API 共用 HTTP 輔助
 * ============================================================ */

import { authenticateAdmin } from '../../backup/lib/http.js';
import { getAccessToken, verifyIdToken, extractBearerToken, getServiceAccount } from '../../backup/lib/google-auth.js';
import { FirestoreClient } from '../../backup/lib/firestore.js';

export function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Admin-Bootstrap-Secret',
        'Access-Control-Max-Age': '86400'
    };
}

/**
 * 驗證請求者的 Firebase ID Token（任何已登入用戶，不要求管理員）。
 * @returns {Promise<object>} token claims
 */
export async function authenticateSignedIn(request, env) {
    const token = extractBearerToken(request);
    const sa = getServiceAccount(env);
    return verifyIdToken(token, sa.project_id);
}

/**
 * 以 Auth uid 解析對應的 users 文件（後端自我服務用，不信客户端傳入的 userId）。
 * 解析順序同 authenticateAdmin：userAuthIndex → uid 欄位 → email。
 * @returns {Promise<{userId:string, data:object}>}
 */
export async function resolveStaffUser(env, claims) {
    const auth = await getAccessToken(env);
    const client = new FirestoreClient(auth.token, auth.projectId, env.FIREBASE_RTDB_URL || '');
    const uid = claims.sub;
    let userId = '';
    let data = null;

    // 1. 授權索引：userAuthIndex/{uid} -> users/{userId}
    try {
        const indexDoc = await client.getDocument(
            `userAuthIndex/${encodeURIComponent(uid)}`
        );
        const mappedUserId = indexDoc && indexDoc.data && indexDoc.data.userId;
        if (mappedUserId) {
            userId = String(mappedUserId);
            const target = await client.getDocument(
                `users/${encodeURIComponent(userId)}`
            );
            if (target) data = target.data;
        }
    } catch (error) {
        console.warn('讀取 userAuthIndex 失敗，嘗試舊式解析:', error.message);
    }

    // 2. users where uid == Auth uid
    if (!data) {
        const byUid = await client.queryCollection({
            collectionId: 'users',
            where: {
                fieldFilter: {
                    field: { fieldPath: 'uid' },
                    op: 'EQUAL',
                    value: { stringValue: uid }
                }
            },
            limit: 1
        });
        if (byUid.docs[0]) {
            userId = String(byUid.docs[0].id);
            data = byUid.docs[0].data;
        }
    }

    // 3. users where email == token email
    if (!data && claims.email) {
        const byEmail = await client.queryCollection({
            collectionId: 'users',
            where: {
                fieldFilter: {
                    field: { fieldPath: 'email' },
                    op: 'EQUAL',
                    value: { stringValue: String(claims.email).trim() }
                }
            },
            limit: 1
        });
        if (byEmail.docs[0]) {
            userId = String(byEmail.docs[0].id);
            data = byEmail.docs[0].data;
        }
    }

    if (!data) {
        const err = new Error('找不到對應的診所用戶資料');
        err.status = 404;
        throw err;
    }
    return { userId, data };
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
    const status = (error && error.status) || fallbackStatus;

    // Error.message 是不可列舉屬性；型別也可能不是字串，逐一兜底，
    // 避免前端收到 "[object Object]" 這類無資訊量的訊息
    let message = error && error.message;
    if (message && typeof message === 'object') {
        try { message = JSON.stringify(message); } catch (_e) { message = String(message); }
    }
    message = message ? String(message) : '';
    if (!message) {
        try { message = JSON.stringify(error); } catch (_e) { message = String(error); }
        if (message === '{}') message = 'ADMIN_API_ERROR';
    }

    const payload = {
        error: String((error && error.code) || 'ADMIN_API_ERROR'),
        message
    };

    // Identity Toolkit／Firestore 的原始錯誤本體（若有），方便前端顯示與排查
    const upstream = error && error.apiError && error.apiError.error;
    if (upstream) {
        if (upstream.code) payload.upstreamStatus = upstream.code;
        if (upstream.message && payload.message.indexOf(String(upstream.message)) === -1) {
            payload.upstreamMessage = String(upstream.message);
        }
    }

    return jsonResponse(payload, status);
}
