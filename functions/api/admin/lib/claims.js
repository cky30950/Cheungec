/* ============================================================
 * Custom Claims 同步邏輯（Cloudflare Pages Functions）
 * ------------------------------------------------------------
 * 權限資料以 Firestore users/{userId} 文件為唯一事實來源：
 *   users 文件 → custom claims（Auth ID Token）＋ userAuthIndex 索引
 *
 * Claims 內容（Rules 直接讀取 request.auth.token）：
 *   v        版本標記
 *   staff    true = 診所員工帳號（自助註冊的閒雜帳號無此 claim）
 *   active   帳號是否啟用
 *   admin    position === '診所管理'
 *   userId   對應 users 集合文件 ID
 *   clinicId 所屬診所
 *   position 職位
 *   username/name 僅供識別（不參與授權）
 * ============================================================ */

import { getAccessToken } from '../../backup/lib/google-auth.js';
import { FirestoreClient } from '../../backup/lib/firestore.js';
import { IdentityClient, serializeCustomAttributes } from './identity.js';

const ADMIN_POSITION = '診所管理';
const CLAIMS_VERSION = 1;

async function getClients(env) {
    const auth = await getAccessToken(env);
    return {
        db: new FirestoreClient(auth.token, auth.projectId, env.FIREBASE_RTDB_URL || ''),
        identity: new IdentityClient(auth.token, auth.projectId)
    };
}

function cleanText(value, max = 100) {
    return value === null || value === undefined ? '' : String(value).slice(0, max);
}

/**
 * 由 users 權威文件建構 claims 物件。
 */
export function buildClaimsFromUser(userDoc, userId) {
    const data = (userDoc && userDoc.data) || userDoc || {};
    const position = cleanText(data.position, 40);
    return {
        v: CLAIMS_VERSION,
        staff: true,
        active: data.active !== false,
        admin: position === ADMIN_POSITION,
        userId: String(userId || userDoc.id || ''),
        clinicId: cleanText(data.clinicId, 100),
        position,
        username: cleanText(data.username, 60),
        name: cleanText(data.name, 60)
    };
}

/**
 * 由 users 文件建構 userAuthIndex 文件欄位（與舊前端 upsert 相容，另加 position）。
 */
function buildIndexFields(userDoc, uid) {
    const data = (userDoc && userDoc.data) || userDoc || {};
    return {
        uid: String(uid),
        userId: String(userDoc.id || ''),
        email: cleanText(data.email, 200),
        active: data.active !== false,
        archived: data.archived === true,
        status: cleanText(data.status, 20) || (data.archived === true ? 'archived' : 'active'),
        clinicId: cleanText(data.clinicId, 100),
        position: cleanText(data.position, 40),
        username: cleanText(data.username, 60),
        name: cleanText(data.name, 60),
        updatedAt: new Date()
    };
}

/**
 * 同步單一員工：users 文件 → userAuthIndex ＋ custom claims。
 * @param {object} env Pages 環境
 * @param {object} input
 * @param {string} input.targetUid Firebase Auth uid
 * @param {string} input.userId users 文件 ID（server 會重讀該文件，不信客户端其餘欄位）
 * @param {boolean} [input.forceRevoke] 強制撤銷 refresh token
 * @returns {Promise<{uid, userId, active, admin, revoked}>}
 */
export async function syncUserClaims(env, input = {}) {
    const targetUid = String(input.targetUid || '').trim();
    const userId = String(input.userId || '').trim();
    if (!targetUid || !userId) {
        const err = new Error('缺少 targetUid 或 userId');
        err.status = 400;
        throw err;
    }

    const { db, identity } = await getClients(env);

    // 以 users 文件為唯一事實來源重讀，避免客户端偽造 claim 值
    const userDoc = await db.getDocument(`users/${encodeURIComponent(userId)}`);
    if (!userDoc) {
        const err = new Error(`users/${userId} 不存在，無法同步 claims`);
        err.status = 404;
        throw err;
    }

    const claims = buildClaimsFromUser(userDoc, userId);
    const indexFields = buildIndexFields({ ...userDoc, id: userId }, targetUid);

    await db.patchDocument(
        `userAuthIndex/${encodeURIComponent(targetUid)}`,
        indexFields
    );

    // 停用（或管理員明確要求）時一併撤銷 refresh token／工作階段
    const revoked = input.forceRevoke === true || claims.active === false;
    await identity.updateAccount(targetUid, {
        customAttributes: serializeCustomAttributes(claims),
        validSince: revoked ? Math.floor(Date.now() / 1000) : undefined
    });

    return {
        uid: targetUid,
        userId,
        active: claims.active,
        admin: claims.admin,
        position: claims.position,
        revoked
    };
}

/**
 * 伺服器端建立員工 Auth 帳號（管理員瀏覽器工作階段不受影響）。
 * @returns {Promise<{uid:string, email:string}>}
 */
export async function createStaffAuth(env, props = {}) {
    const { identity } = await getClients(env);
    return identity.createEmailAccount({
        email: String(props.email || '').trim(),
        password: String(props.password || ''),
        displayName: props.displayName || ''
    });
}

/**
 * 刪除員工：移除 userAuthIndex 並刪除 Firebase Auth 帳號。
 * users 文件由客戶端先行刪除（Rules 限定 admin）。
 * @returns {Promise<{uid, authDeleted, authNotFound}>}
 */
export async function deleteStaffAuth(env, targetUid) {
    const uid = String(targetUid || '').trim();
    if (!uid) {
        const err = new Error('缺少 targetUid');
        err.status = 400;
        throw err;
    }
    const { db, identity } = await getClients(env);
    await db.deleteDocument(`userAuthIndex/${encodeURIComponent(uid)}`);

    // 一併清空殘留 claims 後再刪帳號，確保無法再登入
    let authNotFound = false;
    try {
        await identity.updateAccount(uid, { customAttributes: JSON.stringify({}) });
    } catch (_e) {
        // 帳號可能已不存在，實際刪除時會冪等處理
    }
    const result = await identity.deleteAccount(uid);
    authNotFound = !!result.notFound;
    return { uid, authDeleted: !authNotFound, authNotFound };
}

/**
 * 封存（離職）／復職員工（軟刪除，Auth 帳號保留）。
 *  - 管理員封存：users 文件 active=false/archived=true（客戶端先行寫入），
 *    後端把 Auth 帳號設為 disabled、同步 active=false claims、撤銷工作階段，
 *    但不刪除帳號，以保留病歷／財務記錄的身份審計追溯。
 *  - 員工自我封存（selfService=true）：users 文件由後端 Service Account
 *    代寫（客戶端 Rules 不允許自行變更 active/archived），僅可封存、不可自我復職；
 *    主管理員及最後一個在職管理員不得自我封存。
 *  - 復職：重新啟用 Auth 帳號，並依 users 文件現況同步 claims（僅管理員）。
 *
 * @param {object} env Pages 環境
 * @param {object} input
 * @param {string} input.targetUid Firebase Auth uid
 * @param {string} input.userId users 文件 ID（伺服器重讀，不信客户端其餘欄位）
 * @param {boolean} input.archived true＝封存，false＝復職
 * @param {boolean} [input.selfService] 員工自我封存
 * @param {string} [input.reason] 離職原因
 * @param {string} [input.actorEmail] 執行者電郵（審計記錄）
 * @returns {Promise<{uid,userId,archived,active,authNotFound}>}
 */
export async function archiveStaffAuth(env, input = {}) {
    const targetUid = String(input.targetUid || '').trim();
    const userId = String(input.userId || '').trim();
    const archived = input.archived !== false;
    const selfService = input.selfService === true;
    if (!targetUid || !userId) {
        const err = new Error('缺少 targetUid 或 userId');
        err.status = 400;
        throw err;
    }
    if (selfService && !archived) {
        const err = new Error('自我封存僅可封存帳號，復職需由管理員操作');
        err.status = 403;
        throw err;
    }
    const { db, identity } = await getClients(env);

    // 以 users 文件為唯一事實來源重讀，避免客户端偽造
    const userDoc = await db.getDocument(`users/${encodeURIComponent(userId)}`);
    if (!userDoc) {
        const err = new Error(`users/${userId} 不存在，無法同步封存狀態`);
        err.status = 404;
        throw err;
    }
    const currentData = (userDoc && userDoc.data) || userDoc || {};

    // 員工自我封存：後端代寫 users 文件並執行保護性檢查
    let sourceData = currentData;
    if (selfService) {
        const email = cleanText(currentData.email, 200).toLowerCase();
        if (email === 'admin@clinic.com') {
            const err = new Error('主管理員帳號不可封存');
            err.status = 403;
            throw err;
        }
        if (cleanText(currentData.position, 40) === ADMIN_POSITION) {
            const allUsers = await db.queryCollection({ collectionId: 'users' });
            const otherActiveAdmins = (allUsers.docs || []).filter(d => {
                const dd = d.data || {};
                if (String(d.id) === String(userId)) return false;
                if (dd.active === false || dd.archived === true || dd.status === 'archived') return false;
                return cleanText(dd.position, 40) === ADMIN_POSITION;
            });
            if (otherActiveAdmins.length === 0) {
                const err = new Error('您是最後一個在職診所管理帳號，不可封存，請先安排其他管理員');
                err.status = 403;
                throw err;
            }
        }
        const now = new Date();
        const actor = cleanText(input.actorEmail, 200) || 'self';
        await db.patchDocument(`users/${encodeURIComponent(userId)}`, {
            active: false,
            status: 'archived',
            archived: true,
            archivedAt: now,
            archivedBy: actor,
            archiveReason: cleanText(input.reason, 200) || 'self-requested',
            updatedAt: now,
            updatedBy: actor
        });
        sourceData = { ...currentData, active: false, status: 'archived', archived: true };
    }

    const sourceDoc = { ...userDoc, data: sourceData, id: userId };
    const claims = buildClaimsFromUser(sourceDoc, userId);
    const indexFields = buildIndexFields(sourceDoc, targetUid);
    // 以本次操作的封存狀態為準（文件寫入與索引更新可能存在極短時間差）
    indexFields.archived = archived;
    indexFields.status = archived ? 'archived' : 'active';
    await db.patchDocument(
        `userAuthIndex/${encodeURIComponent(targetUid)}`,
        indexFields
    );

    // Auth 帳號可能已被舊流程硬刪：索引仍如實更新，帳號缺失則回報 notFound
    let authNotFound = false;
    try {
        await identity.updateAccount(targetUid, {
            customAttributes: serializeCustomAttributes(claims),
            disableUser: archived,
            // 封存時一併撤銷 refresh token／工作階段
            validSince: archived ? Math.floor(Date.now() / 1000) : undefined
        });
    } catch (error) {
        const code = error.apiError && error.apiError.error && error.apiError.error.message;
        if (error.status === 404 || /USER_NOT_FOUND/i.test(String(code || ''))) {
            authNotFound = true;
        } else {
            throw error;
        }
    }

    return { uid: targetUid, userId, archived, active: claims.active, authNotFound };
}

/**
 * 一次性批量同步全部帳號（bootstrap／修復用）。
 * 比對 Auth 帳號與 users 文件（uid → email → userAuthIndex 三層），
 * 有對應文件者寫入索引與 claims；無對應的孤立 Auth 帳號只回報、不授權。
 *
 * @returns {Promise<{synced:number, inactive:number, orphaned:Array, totalAuth:number}>}
 */
export async function bootstrapAllClaims(env) {
    const { db, identity } = await getClients(env);

    // 1. 載入全部 users 文件
    const userDocs = await db.queryCollection({ collectionId: 'users' });
    const byUid = new Map();
    const byEmail = new Map();
    for (const doc of userDocs.docs) {
        const d = doc.data || {};
        if (d.uid) byUid.set(String(d.uid), doc);
        if (d.email) byEmail.set(String(d.email).trim().toLowerCase(), doc);
    }

    // 2. 載入 userAuthIndex（舊帳號可能只在索引中有 uid→userId 對應）
    const indexDocs = await db.queryCollection({ collectionId: 'userAuthIndex' });
    const indexByUid = new Map();
    for (const doc of indexDocs.docs) {
        const d = doc.data || {};
        if (d.uid && d.userId) indexByUid.set(String(d.uid), String(d.userId));
    }
    const userDocById = new Map(userDocs.docs.map(d => [String(d.id), d]));

    // 3. 分頁走訪全部 Auth 帳號
    let pageToken = '';
    let totalAuth = 0;
    let synced = 0;
    let inactive = 0;
    const orphaned = [];
    const pages = 200; // 安全上限（200 × 500 = 10 萬帳號）

    for (let page = 0; page < pages; page++) {
        const batch = await identity.batchGet(500, pageToken);
        totalAuth += batch.users.length;

        for (const account of batch.users) {
            const uid = String(account.localId || '');
            const email = account.email ? String(account.email).trim().toLowerCase() : '';
            let userDoc = null;
            if (uid && byUid.has(uid)) userDoc = byUid.get(uid);
            else if (email && byEmail.has(email)) userDoc = byEmail.get(email);
            else if (uid && indexByUid.has(uid)) {
                userDoc = userDocById.get(indexByUid.get(uid)) || null;
            }

            if (!userDoc) {
                orphaned.push({ uid, email });
                continue;
            }

            const claims = buildClaimsFromUser(userDoc, userDoc.id);
            await db.patchDocument(
                `userAuthIndex/${encodeURIComponent(uid)}`,
                buildIndexFields(userDoc, uid)
            );
            await identity.updateAccount(uid, {
                customAttributes: serializeCustomAttributes(claims),
                validSince: claims.active === false ? Math.floor(Date.now() / 1000) : undefined
            });
            synced += 1;
            if (claims.active === false) inactive += 1;
        }

        if (!batch.nextPageToken) break;
        pageToken = batch.nextPageToken;
    }

    return { synced, inactive, orphaned, totalAuth };
}
