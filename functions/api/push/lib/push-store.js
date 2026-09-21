/* ============================================================
 * Web Push 訂閱儲存（Cloudflare Pages Functions）
 * ------------------------------------------------------------
 * 訂閱資料（pushSubscriptions/{sha256(endpoint)}）仍以 Firestore REST
 * 存取；通知去重狀態則存於 Realtime Database（RTDB）：
 *  - RTDB 路徑：/pushState/{event} = { notifiedIds:[], updatedAt:ISO }
 *  - 原因：高頻讀取，RTDB 不計 Firestore 文件讀取費。
 *  - 認證：Service Account OAuth2 token（含 firebase.database scope，
 *    與 presence.js 相同模式；該 token 對 RTDB 具管理員存取權，不受規則限制）。
 *
 * 部署後首次讀到 RTDB 無資料時，會自舊 Firestore pushState 集合
 * 單次搬移（每事件最多一次），避免切換初期重複推播；搬移完成後
 * 可於 Firebase Console 手動刪除 Firestore 的 pushState 集合。
 * ============================================================ */

import { getAccessToken } from '../../backup/lib/google-auth.js';
import { FirestoreClient } from '../../backup/lib/firestore.js';
import { DEFAULT_EVENTS } from './events.js';

const COLLECTION = 'pushSubscriptions';
const LEGACY_STATE_COLLECTION = 'pushState';
const STATE_MAX_IDS = 200;

// RTDB 路徑段禁用字元；現有事件名（chat/appointment）均安全
const SAFE_EVENT_RE = /^[A-Za-z0-9_-]+$/;

/**
 * 每請求新建 client（client 持有 access token，不可跨請求快取，
 * 與 attachments/lib/auth.js 相同考量；getAccessToken 內部會快取 token）。
 */
async function getClient(env) {
  const auth = await getAccessToken(env);
  return new FirestoreClient(auth.token, auth.projectId, env.FIREBASE_RTDB_URL || '');
}

/**
 * 文件 ID = SHA-256(endpoint) 小寫 hex。
 * 同一端點重複訂閱為冪等 upsert，且 endpoint 不直接成為文件路徑。
 */
export async function subscriptionDocId(endpoint) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(String(endpoint))
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * 建立或更新訂閱文件（冪等）。
 * @param {object} env
 * @param {object} input {endpoint, keys:{p256dh,auth}, userId, userEmail, username, position, userAgent, events}
 * @returns {Promise<{id:string, created:boolean}>}
 */
export async function upsertSubscription(env, input) {
  const client = await getClient(env);
  const id = await subscriptionDocId(input.endpoint);
  const now = new Date().toISOString();

  const existing = await client.getDocument(`${COLLECTION}/${id}`);

  // 同一 endpoint 文件若已屬其他使用者，拒絕覆寫
  if (existing && existing.data && existing.data.userId &&
      String(existing.data.userId) !== String(input.userId)) {
    const err = new Error('該端點訂閱已屬其他使用者，無法覆寫');
    err.status = 409;
    throw err;
  }

  const createdAt = existing && existing.data && existing.data.createdAt
    ? toRfc3339(existing.data.createdAt)
    : now;

  const events = Array.isArray(input.events) && input.events.length > 0
    ? input.events
    : [...DEFAULT_EVENTS];

  const fields = {
    endpoint: { stringValue: String(input.endpoint) },
    keys: {
      mapValue: {
        fields: {
          p256dh: { stringValue: String(input.keys.p256dh) },
          auth: { stringValue: String(input.keys.auth) }
        }
      }
    },
    userId: { stringValue: String(input.userId || '') },
    userEmail: { stringValue: String(input.userEmail || '') },
    username: { stringValue: String(input.username || '') },
    userAgent: { stringValue: String(input.userAgent || '') },
    events: { arrayValue: { values: events.map((e) => ({ stringValue: String(e) })) } },
    createdAt: { timestampValue: createdAt },
    updatedAt: { timestampValue: now }
  };

  // position 為選填欄位（解析失敗時不寫入，日後 upsert 補強）
  if (input.position) {
    fields.position = { stringValue: String(input.position) };
  }

  // 語言偏好（推播文案用）；預設 zh
  fields.language = { stringValue: /^[a-z]{2}(-[A-Z]{2})?$/.test(input.language)
    ? input.language
    : 'zh' };

  const updateMask = Object.keys(fields)
    .map((f) => `updateMask.fieldPaths=${encodeURIComponent(f)}`)
    .join('&');

  const response = await fetch(
    `${client.documentsPath()}/${COLLECTION}/${id}?${updateMask}`,
    {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${client.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ fields })
    }
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`寫入訂閱失敗 (HTTP ${response.status}): ${text.slice(0, 200)}`);
  }

  return { id, created: !existing };
}

/** 依 endpoint 刪除訂閱文件；文件不存在視為成功。 */
export async function deleteSubscription(env, endpoint) {
  const client = await getClient(env);
  const id = await subscriptionDocId(endpoint);
  const response = await fetch(
    `${client.documentsPath()}/${COLLECTION}/${id}`,
    {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${client.token}` }
    }
  );
  if (!response.ok && response.status !== 404) {
    const text = await response.text();
    throw new Error(`刪除訂閱失敗 (HTTP ${response.status}): ${text.slice(0, 200)}`);
  }
  return { id, deleted: response.status !== 404 };
}

export async function getSubscriptionByEndpoint(env, endpoint) {
  const client = await getClient(env);
  const id = await subscriptionDocId(endpoint);
  const doc = await client.getDocument(`${COLLECTION}/${id}`);
  return doc ? doc.data : null;
}

/**
 * 列出全部訂閱（自動分頁）。
 * @returns {Promise<Array<{endpoint:string,keys:object,userId:string,events:string[]}>>}
 */
export async function listSubscriptions(env) {
  const client = await getClient(env);
  const { docs } = await client.queryCollection({
    collectionId: COLLECTION,
    orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }]
  });
  return docs.map((d) => d.data);
}

/**
 * RTDB 根 URL（與 presence.js 相同慣例：env 優先，否則預設 asia-southeast1）。
 */
async function getRtdbBase(env) {
  const auth = await getAccessToken(env);
  const base = (env.FIREBASE_RTDB_URL
      || `https://${auth.projectId}-default-rtdb.asia-southeast1.firebasedatabase.app`)
      .replace(/\/$/, '');
  return { base, token: auth.token };
}

function safeEventName(eventName) {
  const name = String(eventName || '');
  if (!SAFE_EVENT_RE.test(name)) {
    throw new Error(`不安全的 pushState 事件名: ${name.slice(0, 40)}`);
  }
  return name;
}

/**
 * 讀取事件去重狀態（RTDB /pushState/{event}）。
 * RTDB 不存在該節點時回 200 + null，此時單次嘗試自舊 Firestore 搬移。
 * @returns {Promise<{notifiedIds:string[], updatedAt:string|null}>}
 */
export async function getPushState(env, eventName) {
  const event = safeEventName(eventName);
  const { base, token } = await getRtdbBase(env);

  const response = await fetch(`${base}/pushState/${event}.json`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`讀取 pushState(RTDB) 失敗 (HTTP ${response.status}): ${text.slice(0, 200)}`);
  }

  const data = await response.json();
  if (data && typeof data === 'object') {
    return {
      notifiedIds: Array.isArray(data.notifiedIds) ? data.notifiedIds.map(String) : [],
      updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : null
    };
  }

  // RTDB 尚無資料：單次自舊 Firestore 集合搬移（best-effort，失敗不阻斷）
  const migrated = await migrateLegacyState(env, event);
  if (migrated) return migrated;

  return { notifiedIds: [], updatedAt: null };
}

/**
 * 自舊 Firestore pushState/{event} 搬移到 RTDB，每個事件僅在 RTDB
 * 無節點時觸發一次。回傳 null 代表無舊資料或搬移失敗（視為全新狀態）。
 */
async function migrateLegacyState(env, event) {
  try {
    const client = await getClient(env);
    const doc = await client.getDocument(
      `${LEGACY_STATE_COLLECTION}/${encodeURIComponent(event)}`
    );
    if (!doc || !doc.data || !Array.isArray(doc.data.notifiedIds)
        || doc.data.notifiedIds.length === 0) {
      return null;
    }
    const migrated = {
      notifiedIds: doc.data.notifiedIds.map(String).slice(-STATE_MAX_IDS),
      updatedAt: doc.data.updatedAt ? toRfc3339(doc.data.updatedAt) : null
    };
    // 寫入 RTDB 失敗也不阻斷：後續 savePushState 會再次寫入
    await putRtdbState(env, event, migrated).catch(() => {});
    return migrated;
  } catch (error) {
    console.warn(`pushState 舊資料搬移失敗 (${event}):`, error && error.message);
    return null;
  }
}

/** 直接 PUT RTDB 節點（整節點覆寫）。 */
async function putRtdbState(env, event, state) {
  const { base, token } = await getRtdbBase(env);
  const response = await fetch(`${base}/pushState/${event}.json`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(state)
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`寫入 pushState(RTDB) 失敗 (HTTP ${response.status}): ${text.slice(0, 200)}`);
  }
  return response.json().catch(() => null);
}

/**
 * 寫入事件去重狀態；notifiedIds 為環狀清單，上限 200（最新在尾端）。
 */
export async function savePushState(env, eventName, notifiedIds, updatedAt) {
  const event = safeEventName(eventName);
  const state = {
    notifiedIds: notifiedIds.map(String).slice(-STATE_MAX_IDS),
    updatedAt: updatedAt || new Date().toISOString()
  };
  await putRtdbState(env, event, state);
  return state;
}

export { STATE_MAX_IDS };

// Firestore timestamp 經 normalizeDocument 後為 {seconds,nanoseconds}，轉回 RFC3339。
function toRfc3339(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value.seconds === 'number') {
    return new Date(value.seconds * 1000).toISOString();
  }
  return new Date().toISOString();
}
