/* ============================================================
 * 備份 API 共用 HTTP 輔助
 * ============================================================ */

import { requireAdmin, getAccessToken, getServiceAccount } from './google-auth.js';
import { FirestoreClient } from './firestore.js';

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
 *
 * users 集合文件 ID 是 Firestore 自動 ID（非 Auth uid），需依前端
 * fetchAuthorizedUserByUidOrEmail 相同順序解析：
 *   1. userAuthIndex/{uid} 之 userId 欄位 → users/{userId}
 *   2. users where uid == Auth uid
 *   3. users where email == token 內 email
 */
export async function authenticateAdmin(request, env) {
    try {
        const admin = await requireAdmin(request, env, async (claims) => {
            const auth = await getAccessToken(env);
            const client = new FirestoreClient(
                auth.token,
                auth.projectId,
                env.FIREBASE_RTDB_URL || ''
            );
            const uid = claims.sub;
            let userData = null;

            // 1. 授權索引：userAuthIndex/{uid} -> users/{userId}
            try {
                const indexDoc = await client.getDocument(
                    `userAuthIndex/${encodeURIComponent(uid)}`
                );
                const userId = indexDoc && indexDoc.data && indexDoc.data.userId;
                if (userId) {
                    const target = await client.getDocument(
                        `users/${encodeURIComponent(String(userId))}`
                    );
                    if (target) userData = target.data;
                }
            } catch (error) {
                // 索引缺失或異常時退回舊式查詢
                console.warn('讀取 userAuthIndex 失敗，嘗試舊式解析:', error.message);
            }

            // 2. users where uid == Auth uid
            if (!userData) {
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
                if (byUid.docs[0]) userData = byUid.docs[0].data;
            }

            // 3. users where email == token email
            if (!userData && claims.email) {
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
                if (byEmail.docs[0]) userData = byEmail.docs[0].data;
            }

            return userData;
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
