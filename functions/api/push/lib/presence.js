/* ============================================================
 * 在線狀態讀取（推播派送閘門）
 * ------------------------------------------------------------
 * 复用 ChatModule 的 RTDB presence。新格式（支援同帳號多分頁／多裝置）：
 *   /presence/{uid}/connections/{connId} = { startedAt }
 * 「在線」＝connections 下存在任一活躍連線節點；各分頁關閉時只移除
 * 自己的節點，伺服器 onDisconnect 為最終保險。
 * 舊格式 /presence/{uid} = { online: true } 於部署過渡期一併視為在線。
 * 只向「在線」使用者的訂閱派送推播；讀取失敗時預設拒絕（fail-closed），
 * 避免在登出／關閉後仍送出通知。
 * ============================================================ */

import { getAccessToken } from '../../backup/lib/google-auth.js';

/**
 * 判定單一 presence 節點是否代表在線。
 * @param {*} info /presence/{uid} 的值
 * @returns {boolean}
 */
function isEntryOnline(info) {
    if (!info || typeof info !== 'object') return !!info;
    if (info.connections && typeof info.connections === 'object') {
        return Object.keys(info.connections).length > 0;
    }
    return info.online === true;
}

/**
 * @param {object} env
 * @returns {Promise<Set<string>>} 目前在線使用者的 uid 集合
 */
export async function getOnlineUserIds(env) {
    const auth = await getAccessToken(env);
    const base = (env.FIREBASE_RTDB_URL
        || `https://${auth.projectId}-default-rtdb.asia-southeast1.firebasedatabase.app`)
        .replace(/\/$/, '');

    const response = await fetch(`${base}/presence.json`, {
        headers: { 'Authorization': `Bearer ${auth.token}` }
    });
    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`讀取在線狀態失敗 (HTTP ${response.status}): ${text.slice(0, 160)}`);
    }

    const data = await response.json();
    const online = new Set();
    if (data && typeof data === 'object') {
        for (const [uid, info] of Object.entries(data)) {
            if (isEntryOnline(info)) online.add(String(uid));
        }
    }
    return online;
}
