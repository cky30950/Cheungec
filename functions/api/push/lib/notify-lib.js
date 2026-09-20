/* ============================================================
 * 即時通知派送核心（POST /api/push/notify 使用）
 * ------------------------------------------------------------
 * 支援兩類來源：
 *  - chat：公開頻道（全體排除發送者）／私聊（僅收件人）
 *  - appointment：候診中（歸屬醫師）／診症完成（護理/管理/助理）
 *
 * 去重：pushState 環狀鍵清單（先發送後寫鍵；暫時性失敗不寫鍵）。
 *  - 聊天：同一 messageKey 不重發
 *  - 掛號：同一「狀態轉換時間戳」不重發（多名員工客戶端只推一次）；
 *    狀態真的再轉換（新 arrivedAt/completedAt）時會再推
 * ============================================================ */

import {
    EVENT_APPOINTMENT_WAITING,
    EVENT_APPOINTMENT_COMPLETED,
    EVENT_CHAT_PUBLIC,
    EVENT_CHAT_PRIVATE,
    COMPLETED_NOTIFY_POSITIONS
} from './events.js';
import { getPushState, savePushState, listSubscriptions } from './push-store.js';
import { sendToSubscriptions } from './sender.js';

const LIMITS = {
    key: 64,
    id: 128,
    name: 60,
    patientName: 30
};

/* 淨化：移除控制字元、壓縮空白、截斷（匯出供測試） */
export function clean(value, max) {
    return String(value == null ? '' : value)
        .replace(/[\u0000-\u001F\u007F]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max);
}

function httpError(status, code, message) {
    const err = new Error(message);
    err.status = status;
    err.code = code;
    return err;
}

/* ---------- 請求解析與驗證 → 內部事件描述 ---------- */

function parseChat(body, auth) {
    const channel = body.channel === 'public' || body.channel === 'private'
        ? body.channel
        : null;
    if (!channel) throw httpError(400, 'INVALID_CHANNEL', 'channel 必須為 public 或 private');

    const messageKey = clean(body.messageKey, LIMITS.key);
    if (!messageKey) throw httpError(400, 'INVALID_KEY', 'messageKey 不可為空白');

    const senderId = clean(body.senderId, LIMITS.id);
    if (!senderId) throw httpError(400, 'INVALID_SENDER', 'senderId 不可為空白');
    // 僅可替自己的訊息觸發通知（防偽造發送者）
    if (senderId !== auth.uid) {
        throw httpError(403, 'SENDER_MISMATCH', 'senderId 與登入者不符');
    }
    const senderName = clean(body.senderName, LIMITS.name) || '同事';

    let recipientUid = '';
    if (channel === 'private') {
        recipientUid = clean(body.recipientUid, LIMITS.id);
        if (!recipientUid) throw httpError(400, 'INVALID_RECIPIENT', '私聊需提供 recipientUid');
        if (recipientUid === auth.uid) {
            throw httpError(400, 'SELF_RECIPIENT', '不可對自己發送私聊通知');
        }
    }

    const dedupKey = channel === 'public'
        ? `public:${messageKey}`
        : `private:${recipientUid}:${messageKey}`;

    return {
        kind: 'chat',
        stateDoc: 'chat',
        event: channel === 'public' ? EVENT_CHAT_PUBLIC : EVENT_CHAT_PRIVATE,
        dedupKey,
        messageKey,
        senderName,
        recipientUid
    };
}

function parseAppointment(body) {
    const event = body.event === EVENT_APPOINTMENT_WAITING
        || body.event === EVENT_APPOINTMENT_COMPLETED
        ? body.event
        : null;
    if (!event) throw httpError(400, 'INVALID_EVENT', '不支援的掛號事件');

    const appointmentId = clean(body.appointmentId, LIMITS.id);
    if (!appointmentId) throw httpError(400, 'INVALID_ID', 'appointmentId 不可為空白');

    const patientName = clean(body.patientName, LIMITS.patientName) || '患者';

    let appointmentDoctor = '';
    if (event === EVENT_APPOINTMENT_WAITING) {
        appointmentDoctor = clean(body.appointmentDoctor, LIMITS.name);
        // 空白醫師＝general registration 或異常資料，不推送
        if (!appointmentDoctor) {
            throw httpError(400, 'INVALID_DOCTOR', 'appointmentDoctor 不可為空白');
        }
    }

    // 狀態轉換時間戳（arrivedAt/completedAt）：同次轉換跨客戶端去重
    const statusAt = clean(body.statusAt, 40);
    const phase = event === EVENT_APPOINTMENT_WAITING ? 'waiting' : 'completed';
    const dedupKey = statusAt
        ? `${phase}:${appointmentId}:${statusAt}`
        : `${phase}:${appointmentId}`; // 缺時間戳時退回舊行為（同掛號同狀態僅一次）

    return {
        kind: 'appointment',
        stateDoc: 'appointment',
        event,
        dedupKey,
        appointmentId,
        patientName,
        appointmentDoctor
    };
}

/* ---------- 收件訂閱篩選 ---------- */

function hasEvent(sub, event) {
    const list = Array.isArray(sub.events) && sub.events.length > 0 ? sub.events : [];
    return list.includes(event);
}

function filterTargets(subs, spec, auth) {
    return subs.filter((sub) => {
        if (!hasEvent(sub, spec.event)) return false;
        if (spec.kind === 'chat') {
            if (spec.event === EVENT_CHAT_PUBLIC) {
                return String(sub.userId) !== String(auth.uid);
            }
            return String(sub.userId) === String(spec.recipientUid);
        }
        if (spec.event === EVENT_APPOINTMENT_WAITING) {
            return String(sub.username || '') === spec.appointmentDoctor;
        }
        return COMPLETED_NOTIFY_POSITIONS.includes(String(sub.position || ''));
    });
}

/* ---------- 推播文案（依收件人語言） ---------- */

const COPY = {
    public: {
        zh: { title: '公開頻道新訊息', body: (n) => `${n} 傳送了訊息` },
        en: { title: 'New message — public channel', body: (n) => `${n} sent a message` }
    },
    private: {
        zh: { title: '新私人訊息', body: (n) => `${n} 傳送了訊息` },
        en: { title: 'New private message', body: (n) => `${n} sent a message` }
    },
    waiting: {
        zh: { title: '病人候診中', body: (n) => n },
        en: { title: 'Patient waiting', body: (n) => n }
    },
    completed: {
        zh: { title: '診症完成', body: (n) => n },
        en: { title: 'Consultation completed', body: (n) => n }
    }
};

// 匯出供測試：推播文案組裝
export function buildMessage(spec, lang) {
    const en = lang === 'en';
    if (spec.kind === 'chat') {
        const c = spec.event === EVENT_CHAT_PUBLIC ? COPY.public : COPY.private;
        const set = en ? c.en : c.zh;
        if (spec.event === EVENT_CHAT_PUBLIC) {
            return {
                title: set.title,
                body: set.body(spec.senderName),
                tag: `chat-public:${spec.messageKey}`,
                url: '/system.html?chat=open&c=public',
                dedupKey: spec.dedupKey
            };
        }
        return {
            title: set.title,
            body: set.body(spec.senderName),
            tag: `chat-private:${spec.recipientUid}:${spec.messageKey}`,
            url: `/system.html?chat=open&u=${encodeURIComponent(spec.recipientUid)}`,
            dedupKey: spec.dedupKey
        };
    }
    const c = spec.event === EVENT_APPOINTMENT_WAITING ? COPY.waiting : COPY.completed;
    const set = en ? c.en : c.zh;
    return {
        title: set.title,
        body: set.body(spec.patientName),
        tag: `${spec.event === EVENT_APPOINTMENT_WAITING ? 'apt-waiting' : 'apt-completed'}:${spec.appointmentId}`,
        url: '/system.html',
        dedupKey: spec.dedupKey
    };
}

/* ---------- 主流程 ---------- */

/**
 * @param {object} env
 * @param {{uid:string,email:string}} auth authenticateStaff 結果
 * @param {object} body 已解析之請求 JSON
 * @returns {Promise<{deduped:boolean, notified:number, targets:number, results:Array}>}
 */
export async function processNotify(env, auth, body) {
    if (!body || typeof body !== 'object') {
        throw httpError(400, 'INVALID_REQUEST', '請求內容必須為 JSON');
    }
    const spec = body.kind === 'chat' ? parseChat(body, auth)
        : body.kind === 'appointment' ? parseAppointment(body)
        : null;
    if (!spec) throw httpError(400, 'INVALID_KIND', 'kind 必須為 chat 或 appointment');

    // 跨客戶端去重：聊天同 messageKey、掛號同狀態轉換時間戳
    const state = await getPushState(env, spec.stateDoc);
    if (state.notifiedIds.includes(spec.dedupKey)) {
        return { deduped: true, notified: 0, targets: 0, results: [] };
    }

    const subs = await listSubscriptions(env);
    const targets = filterTargets(subs, spec, auth);

    if (targets.length === 0) {
        // 無對象仍寫鍵：避免日後新增訂閱時補推舊事件
        await savePushState(env, spec.stateDoc,
            [...state.notifiedIds, spec.dedupKey], new Date().toISOString());
        return { deduped: false, notified: 0, targets: 0, results: [] };
    }

    // 依語言分群，各自使用對應文案
    const groups = new Map();
    for (const sub of targets) {
        const lang = sub.language === 'en' ? 'en' : 'zh';
        if (!groups.has(lang)) groups.set(lang, []);
        groups.get(lang).push(sub);
    }

    let allResults = [];
    let anyTransient = false;
    for (const [lang, group] of groups) {
        const message = buildMessage(spec, lang);
        // 桌面瀏覽器對同 tag 通知只靜默取代、不彈橫幅：
        // tag 已含業務鍵（messageKey/appointmentId），再附加派送時間確保每則都會顯示。
        message.tag = `${message.tag}:${Date.now()}`;
        const batch = await sendToSubscriptions(group, message, env);
        allResults = allResults.concat(batch.results);
        if (batch.results.some((r) => r.retryable && !r.ok)) anyTransient = true;
    }

    // 暫時性失敗不寫鍵 → 下輪同事件再觸發時可補送
    if (!anyTransient) {
        await savePushState(env, spec.stateDoc,
            [...state.notifiedIds, spec.dedupKey], new Date().toISOString());
    }

    return {
        deduped: false,
        notified: allResults.filter((r) => r.ok).length,
        targets: targets.length,
        results: allResults
    };
}
