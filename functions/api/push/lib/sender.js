/* ============================================================
 * Web Push 發送（Cloudflare Pages Functions）
 * ------------------------------------------------------------
 * 使用 @block65/webcrypto-web-push（純 WebCrypto，RFC 8291 aes128gcm
 * + RFC 8292 VAPID），不需 nodejs_compat。
 *
 * 回應狀態映射：
 *  - 2xx           → 成功
 *  - 404 / 410     → 端點失效，自動刪除訂閱文件
 *  - 429 / 5xx     → 暫時失敗，記錄但不影響批次其他訂閱
 *  - 其他 4xx      → 永久失敗（不刪文件，保留以便排查）
 * ============================================================ */

import { buildPushPayload } from '@block65/webcrypto-web-push';
import { deleteSubscription } from './push-store.js';

// TTL：推送服務保留訊息 1 小時（秒）
const PUSH_TTL = 3600;

function vapidFromEnv(env) {
  for (const key of ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT']) {
    if (!env || !env[key]) {
      throw new Error(`缺少必要環境變數：${key}`);
    }
  }
  return {
    subject: env.VAPID_SUBJECT,
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY
  };
}

/**
 * 對單一訂閱發送推播。
 * @param {object} sub {endpoint, keys:{p256dh,auth}}
 * @param {object} message {title, body, url?, tag?}
 * @param {object} env
 * @returns {Promise<{endpoint:string, ok:boolean, status:number, removed:boolean, retryable:boolean, error?:string}>}
 */
export async function sendOne(sub, message, env) {
  const vapid = vapidFromEnv(env);
  const subscription = {
    endpoint: sub.endpoint,
    expirationTime: null,
    keys: {
      p256dh: sub.keys && sub.keys.p256dh,
      auth: sub.keys && sub.keys.auth
    }
  };

  let status = 0;
  try {
    const payload = await buildPushPayload(
      {
        data: JSON.stringify(message),
        options: { ttl: PUSH_TTL }
      },
      subscription,
      vapid
    );
    const res = await fetch(sub.endpoint, payload);
    status = res.status;

    if (res.ok) {
      return { endpoint: sub.endpoint, ok: true, status, removed: false, retryable: false };
    }

    if (status === 404 || status === 410) {
      const result = await deleteSubscription(env, sub.endpoint);
      return {
        endpoint: sub.endpoint,
        ok: false,
        status,
        removed: result.deleted,
        retryable: false
      };
    }

    return {
      endpoint: sub.endpoint,
      ok: false,
      status,
      removed: false,
      retryable: status === 429 || status >= 500
    };
  } catch (error) {
    // 網路錯誤或加密失敗皆視為可重試，不拋斷批次
    return {
      endpoint: sub.endpoint,
      ok: false,
      status,
      removed: false,
      retryable: true,
      error: error.message || String(error)
    };
  }
}

/**
 * 整批發送，單一失敗不影響其他訂閱。
 * @returns {Promise<{results:Array, sent:number, removed:number, failed:number}>}
 */
export async function sendToSubscriptions(subs, message, env) {
  const settled = await Promise.allSettled(
    subs.map((sub) => sendOne(sub, message, env))
  );
  const results = settled.map((s, i) =>
    s.status === 'fulfilled'
      ? s.value
      : {
          endpoint: subs[i] && subs[i].endpoint,
          ok: false,
          removed: false,
          retryable: true,
          error: String(s.reason)
        }
  );
  return {
    results,
    sent: results.filter((r) => r.ok).length,
    removed: results.filter((r) => r.removed).length,
    failed: results.filter((r) => !r.ok).length
  };
}
