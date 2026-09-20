/* ============================================================
 * Web Push 訂閱儲存（Cloudflare Pages Functions）
 * ------------------------------------------------------------
 * 透過 Service Account 以 Firestore REST 存取：
 *  - pushSubscriptions/{sha256(endpoint)}：訂閱資料
 *  - pushState/{event}：通知去重狀態
 *
 * 認證與 FirestoreClient 沿用 backup lib（與 attachments 相同模式）。
 * ============================================================ */

import { getAccessToken } from '../../backup/lib/google-auth.js';
import { FirestoreClient } from '../../backup/lib/firestore.js';
import { DEFAULT_EVENTS } from './events.js';

const COLLECTION = 'pushSubscriptions';
const STATE_COLLECTION = 'pushState';
const STATE_MAX_IDS = 200;

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
 * 讀取事件去重狀態。
 * @returns {Promise<{notifiedIds:string[], updatedAt:string|null}>}
 */
export async function getPushState(env, eventName = 'new_inquiry') {
  const client = await getClient(env);
  const doc = await client.getDocument(
    `${STATE_COLLECTION}/${encodeURIComponent(eventName)}`
  );
  if (!doc || !doc.data) {
    return { notifiedIds: [], updatedAt: null };
  }
  return {
    notifiedIds: Array.isArray(doc.data.notifiedIds) ? doc.data.notifiedIds : [],
    updatedAt: doc.data.updatedAt ? toRfc3339(doc.data.updatedAt) : null
  };
}

/**
 * 寫入事件去重狀態；notifiedIds 為環狀清單，上限 200（最新在尾端）。
 */
export async function savePushState(env, eventName, notifiedIds, updatedAt) {
  const client = await getClient(env);
  const trimmed = notifiedIds.slice(-STATE_MAX_IDS);
  const now = updatedAt || new Date().toISOString();
  const fields = {
    notifiedIds: { arrayValue: { values: trimmed.map((i) => ({ stringValue: String(i) })) } },
    updatedAt: { timestampValue: now }
  };
  const updateMask = Object.keys(fields)
    .map((f) => `updateMask.fieldPaths=${encodeURIComponent(f)}`)
    .join('&');
  const response = await fetch(
    `${client.documentsPath()}/${STATE_COLLECTION}/${encodeURIComponent(eventName)}?${updateMask}`,
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
    throw new Error(`寫入 pushState 失敗 (HTTP ${response.status}): ${text.slice(0, 200)}`);
  }
  return { notifiedIds: trimmed, updatedAt: now };
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
