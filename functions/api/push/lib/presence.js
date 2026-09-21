/* ============================================================
 * 在線狀態讀取（推播派送閘門）
 * ------------------------------------------------------------
 * 复用 ChatModule 的 RTDB presence：/presence/{uid} = {online,lastSeen}
 *  - 登入並開著系統：online = true
 *  - 登出（destroyChat）：online = false
 *  - 關閉所有分頁／瀏覽器當機：RTDB onDisconnect 由伺服器端自動寫入 false
 * 只向「在線」使用者的訂閱派送推播；讀取失敗時預設拒絕（fail-closed），
 * 避免在登出／關閉後仍送出通知。
 * ============================================================ */

import { getAccessToken } from '../../backup/lib/google-auth.js';

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
            if (info && info.online === true) online.add(String(uid));
        }
    }
    return online;
}
