/* ============================================================
 * 新預診掃描與推播（Pages Cron 每分鐘呼叫）
 * ------------------------------------------------------------
 * 防重複機制（pushState/new_inquiry.notifiedIds，環狀清單上限 200）：
 *  1. 查近 10 分鐘 inquiries（createdAt DESC）
 *  2. 過濾已通知 ID
 *  3. 對全部 new_inquiry 訂閱發送（內容僅含病人姓名）
 *  4. 成功送達（或無任何訂閱）後才寫入 notifiedIds；
 *     有暫時性失敗（429/5xx/網路錯誤）的 ID 不寫，下輪重試
 *
 * 端點失效（404/410）會自動刪除訂閱，不影響去重。
 * ============================================================ */

import { getAccessToken } from '../../backup/lib/google-auth.js';
import { FirestoreClient } from '../../backup/lib/firestore.js';
import {
    getPushState,
    savePushState,
    listSubscriptions
} from './push-store.js';
import { getOnlineUserIds } from './presence.js';
import { sendToSubscriptions } from './sender.js';

const LOOKBACK_MS = 10 * 60 * 1000;
const EVENT = 'new_inquiry';

/**
 * @param {object} env
 * @param {object} [options]
 * @param {string|Date} [options.now] 注入目前時間（測試用）
 * @returns {Promise<{scanned:number, newCount:number, notifiedIds:string[], failedIds:string[], deliveries:Array}>}
 */
export async function notifyNewInquiries(env, options = {}) {
    const now = options.now ? new Date(options.now) : new Date();
    const since = new Date(now.getTime() - LOOKBACK_MS);

    const state = await getPushState(env, EVENT);
    const notifiedSet = new Set(state.notifiedIds);

    const auth = await getAccessToken(env);
    const client = new FirestoreClient(
        auth.token,
        auth.projectId,
        env.FIREBASE_RTDB_URL || ''
    );

    const { docs } = await client.queryCollection({
        collectionId: 'inquiries',
        where: {
            fieldFilter: {
                field: { fieldPath: 'createdAt' },
                op: 'GREATER_THAN_OR_EQUAL',
                value: { timestampValue: since.toISOString() }
            }
        },
        orderBy: [
            { field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' },
            { field: { fieldPath: '__name__' }, direction: 'DESCENDING' }
        ]
    });

    const fresh = docs.filter((d) => !notifiedSet.has(d.id));

    // 無新單時不觸發訂閱清單讀取
    let targets = [];
    if (fresh.length > 0) {
        const [subs, onlineIds] = await Promise.all([
            listSubscriptions(env),
            getOnlineUserIds(env)
        ]);
        targets = subs.filter(
            (s) => (Array.isArray(s.events) ? s.events : [EVENT]).includes(EVENT)
                && onlineIds.has(String(s.userId))
        );
    }

    const notifiedIds = [];
    const failedIds = [];
    const deliveries = [];

    for (const doc of fresh) {
        const patientName = sanitizeName(doc.data && doc.data.patientName);
        const message = {
            title: '新預診資料',
            body: `病人：${patientName} 已提交預診`,
            url: '/system.html',
            tag: `inquiry-${doc.id}`
        };

        const result = await sendToSubscriptions(targets, message, env);
        deliveries.push({ id: doc.id, ...result });

        // 無訂閱：標記已通知，避免日後新增訂閱時補推舊單。
        // 有訂閱且全部嘗試沒有暫時性失敗（retryable 且未成功）才標記完成。
        const hasTransientFailure = result.results.some((r) => r.retryable && !r.ok);
        if (targets.length === 0 || !hasTransientFailure) {
            notifiedIds.push(doc.id);
        } else {
            failedIds.push(doc.id);
        }
    }

    if (notifiedIds.length > 0) {
        await savePushState(
            env,
            EVENT,
            [...state.notifiedIds, ...notifiedIds],
            now.toISOString()
        );
    }

    return {
        scanned: docs.length,
        newCount: fresh.length,
        notifiedIds,
        failedIds,
        deliveries
    };
}

// 推播內容最小化：只取姓名，截斷與去除換行，避免注入通知版面
function sanitizeName(value) {
    const name = String(value || '').replace(/\s+/g, ' ').trim();
    if (!name) return '患者';
    return name.length > 30 ? `${name.slice(0, 30)}…` : name;
}
