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
    subject: normalizeVapidSubject(env.VAPID_SUBJECT),
    publicKey: String(env.VAPID_PUBLIC_KEY).trim(),
    privateKey: String(env.VAPID_PRIVATE_KEY).trim()
  };
}

/**
 * 正規化 VAPID subject。
 * Apple Web Push 嚴格要求 sub 必須為 mailto: 或 https URL（BadJwtToken），
 * FCM 則不檢查；故在此統一校正：
 *  - 去除前後空白
 *  - 純 email 自動補上 mailto:
 *  - 最後以 URL 解析驗證
 */
function normalizeVapidSubject(raw) {
  let subject = String(raw || '').trim();
  if (!subject) throw new Error('缺少必要環境變數：VAPID_SUBJECT');
  if (/^[^\s:/@]+@[^\s:/@]+\.[^\s]+$/.test(subject)) {
    subject = 'mailto:' + subject;
  }
  try {
    const parsed = new URL(subject);
    if (parsed.protocol !== 'mailto:' && parsed.protocol !== 'https:') {
      throw new Error('protocol ' + parsed.protocol);
    }
  } catch (e) {
    throw new Error(
      `VAPID_SUBJECT 格式必須為 mailto:email 或 https URL，目前為：${subject}`
    );
  }
  return subject;
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

    // 讀取失敗回應本文供診斷（Apple 會回 {"reason":"BadJwt"} 等）
    const reasonText = (await res.text().catch(() => '')).slice(0, 300);

    if (status === 404 || status === 410) {
      const result = await deleteSubscription(env, sub.endpoint);
      return {
        endpoint: sub.endpoint,
        ok: false,
        status,
        removed: result.deleted,
        retryable: false,
        reasonText
      };
    }

    return {
      endpoint: sub.endpoint,
      ok: false,
      status,
      removed: false,
      retryable: status === 429 || status >= 500,
      reasonText
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
