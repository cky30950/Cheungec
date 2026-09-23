/* ============================================================
 * 新預診即時推播（事件驅動，取代舊每分鐘 cron 掃描）
 * ------------------------------------------------------------
 * 病人在公開 inquiry 頁寫入 inquiries/{id} 後，前端呼叫
 * POST /api/push/inquiry（匿名、每 IP 限流）。本模組以 Service
 * Account 讀取該文件驗證真偽與新鮮度，再對所有 new_inquiry
 * 訂閱者派送：
 *   - 文件不存在／建立逾 15 分鐘 → 不送（防以舊 ID 重放刷通知）
 *   - 以文件 ID 於 RTDB /pushState/new_inquiry 去重，重複呼叫冪等
 *   - 429/5xx/網路錯誤等暫時性失敗不寫鍵，客戶端或下次重試可補送
 *
 * 推播內容最小化：只含病人姓名（截斷、去控制字元）。
 * ============================================================ */

import { getAccessToken } from '../../backup/lib/google-auth.js';
import { FirestoreClient } from '../../backup/lib/firestore.js';
import { EVENT_NEW_INQUIRY } from './events.js';
import { getPushState, savePushState, listSubscriptions } from './push-store.js';
import { sendToSubscriptions } from './sender.js';

// Firestore 自動 ID 格式（20 位 [A-Za-z0-9]）；不符者直接拒絕
const INQUIRY_ID_RE = /^[A-Za-z0-9]{20}$/;
// 只派送建立後 15 分鐘內的新單
const FRESH_WINDOW_MS = 15 * 60 * 1000;
const NAME_MAX = 30;

function sanitizeName(value) {
    const name = String(value == null ? '' : value)
        .replace(/[\u0000-\u001F\u007F]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    if (!name) return '患者';
    return name.length > NAME_MAX ? name.slice(0, NAME_MAX) + '…' : name;
}

// 無 events 欄位的舊訂閱視為全訂閱（與 notify-lib 一致）
function hasEvent(sub, event) {
    if (!Array.isArray(sub.events) || sub.events.length === 0) return true;
    return sub.events.includes(event);
}

function docCreatedAtMs(doc) {
    // normalizeDocument 已把 timestamp 轉成 {seconds,nanoseconds}
    const raw = doc && doc.data && doc.data.createdAt;
    if (raw && typeof raw === 'object' && Number.isFinite(raw.seconds)) {
        return raw.seconds * 1000;
    }
    if (typeof raw === 'string') {
        const t = Date.parse(raw);
        return Number.isFinite(t) ? t : NaN;
    }
    if (raw instanceof Date) return raw.getTime();
    return NaN;
}

/**
 * @param {object} env
 * @param {string} inquiryId  inquiries 集合文件 ID（Firestore 自動 ID）
 * @param {object} [options]
 * @param {number} [options.nowMs]  注入目前時間（測試用）
 * @returns {Promise<{deduped?:boolean, notified:number, targets:number,
 *                    skipped?:string, results:Array}>}
 */
export async function notifyNewInquiry(env, inquiryId, options = {}) {
    const id = String(inquiryId == null ? '' : inquiryId);
    if (!INQUIRY_ID_RE.test(id)) {
        const err = new Error('inquiryId 格式不正確');
        err.status = 400;
        err.code = 'INVALID_INQUIRY_ID';
        throw err;
    }

    // 去重先行：同文件 ID 只派送一次
    const state = await getPushState(env, EVENT_NEW_INQUIRY);
    if (state.notifiedIds.includes(id)) {
        return { deduped: true, notified: 0, targets: 0, results: [] };
    }

    // SA 驗單：文件必須存在且為 15 分鐘內新建
    const access = await getAccessToken(env);
    const client = new FirestoreClient(access.token, access.projectId, env.FIREBASE_RTDB_URL || '');
    const doc = await client.getDocument(`inquiries/${id}`);

    const skip = (reason) => ({ skipped: reason, notified: 0, targets: 0, results: [] });
    if (!doc || !doc.data) return skip('not_found');

    const nowMs = Number(options.nowMs) || Date.now();
    const createdAtMs = docCreatedAtMs(doc);
    if (!Number.isFinite(createdAtMs)) return skip('no_created_at');
    if (nowMs - createdAtMs > FRESH_WINDOW_MS) return skip('stale');
    if (createdAtMs - nowMs > 5 * 60 * 1000) return skip('future');

    const patientName = sanitizeName(doc.data.patientName);

    const subs = await listSubscriptions(env);
    const targets = subs.filter((sub) => hasEvent(sub, EVENT_NEW_INQUIRY));

    if (targets.length === 0) {
        // 無對象仍寫鍵：避免日後新增訂閱時補推舊單
        await savePushState(env, EVENT_NEW_INQUIRY,
            [...state.notifiedIds, id], new Date(nowMs).toISOString());
        return { notified: 0, targets: 0, results: [] };
    }

    // 依語言分群
    const groups = new Map();
    for (const sub of targets) {
        const lang = sub.language === 'en' ? 'en' : 'zh';
        if (!groups.has(lang)) groups.set(lang, []);
        groups.get(lang).push(sub);
    }

    let allResults = [];
    let anyTransient = false;
    for (const [lang, group] of groups) {
        const message = lang === 'en'
            ? {
                title: 'New pre-consultation inquiry',
                body: `Patient: ${patientName} has submitted an inquiry`,
                tag: `inquiry-${id}:${nowMs}`,
                url: '/system.html',
                dedupKey: `inquiry:${id}`
            }
            : {
                title: '新預診資料',
                body: `病人：${patientName} 已提交預診`,
                tag: `inquiry-${id}:${nowMs}`,
                url: '/system.html',
                dedupKey: `inquiry:${id}`
            };
        const batch = await sendToSubscriptions(group, message, env);
        allResults = allResults.concat(batch.results);
        if (batch.results.some((r) => r.retryable && !r.ok)) anyTransient = true;
    }

    if (!anyTransient) {
        await savePushState(env, EVENT_NEW_INQUIRY,
            [...state.notifiedIds, id], new Date(nowMs).toISOString());
    }

    return {
        deduped: false,
        notified: allResults.filter((r) => r.ok).length,
        targets: targets.length,
        results: allResults
    };
}

export { INQUIRY_ID_RE, FRESH_WINDOW_MS };
