/* ============================================================
 * FCMClient — Firebase Cloud Messaging（V1）Web 客戶端
 * ------------------------------------------------------------
 * 僅供 system.html 診所職員使用（病人端不載入本檔案）。
 * 職責：
 *   1. 登入後請求通知授權、註冊 Service Worker、取得 FCM token
 *   2. token 寫入 Firestore fcmPushTokens/{token}，供後端派發
 *   3. 前景訊息接駁既有 showToast + playNotificationSound
 *   4. sendPush() 呼叫 Cloudflare Pages Function /api/fcm/notify
 *   5. 登出時刪除 token 與 Firestore 記錄
 *
 * 對外 API：
 *   window.FCMClient.initAfterLogin(userData)
 *   window.FCMClient.enable()                 // 使用者手動啟用（bell 鈕）
 *   window.FCMClient.handleLogout()
 *   window.FCMClient.sendPush(targets, title, body, data, eventId)
 *   window.FCMClient.markEventSeen(eventId)   // 站內已顯示之事件去重
 * ============================================================ */

import { getMessaging, getToken, deleteToken, onMessage, isSupported }
  from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js';

const TOKENS_COLLECTION = 'fcmPushTokens';
const SW_URL = '/firebase-messaging-sw.js';
const NOTIFY_ENDPOINT = '/api/fcm/notify';
const SEEN_TTL_MS = 90 * 1000;          // 前景推播與站內通知去重時窗
const SEEN_STORAGE_KEY = 'fcmSeenEvents';

let messaging = null;
let swRegistration = null;
let currentToken = '';
let currentUser = null;
let supported = false;
let bellBtn = null;
let initialized = false;

// ---------------------------------------------------------------- 工具

function getFb() {
  return (window.firebase && window.firebase.db) ? window.firebase : null;
}

function getAuthUid() {
  try {
    const u = window.firebase && window.firebase.auth
      ? window.firebase.auth.currentUser : null;
    return u ? u.uid : (currentUser && currentUser.uid) || '';
  } catch (_e) {
    return (currentUser && currentUser.uid) || '';
  }
}

// 事件去重：回傳 true 表示「已看過」（不應再顯示）
export function markEventSeen(eventId) {
  if (!eventId) return false;
  let map = {};
  try {
    map = JSON.parse(localStorage.getItem(SEEN_STORAGE_KEY) || '{}') || {};
  } catch (_e) { map = {}; }

  const now = Date.now();
  Object.keys(map).forEach((k) => {
    if (!map[k] || map[k] < now) delete map[k];
  });

  if (map[eventId]) return true;
  map[eventId] = now + SEEN_TTL_MS;
  try {
    localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(map));
  } catch (_e) { /* 隱私模式等 */ }
  return false;
}

function truncate(text, max) {
  const s = String(text == null ? '' : text);
  return s.length > max ? s.slice(0, max) : s;
}

function isIosStandaloneRequired() {
  const ua = navigator.userAgent || '';
  const isIOS = /iphone|ipad|ipod/i.test(ua) ||
    (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  // iOS 16.4+ 僅在「已加到主畫面」的 PWA 中支援 Web Push
  return isIOS && !window.matchMedia('(display-mode: standalone)').matches;
}

// ---------------------------------------------------------------- bell UI

function ensureBellButton() {
  if (bellBtn && document.body.contains(bellBtn)) return bellBtn;
  if (!document.body) return null;

  bellBtn = document.createElement('button');
  bellBtn.type = 'button';
  bellBtn.title = '啟用桌面推播通知';
  bellBtn.textContent = '🔔';
  bellBtn.style.cssText = [
    'position:fixed', 'left:16px', 'bottom:16px', 'z-index:9998',
    'width:44px', 'height:44px', 'border-radius:50%',
    'background:#059669', 'color:#fff', 'font-size:20px',
    'border:none', 'box-shadow:0 2px 8px rgba(0,0,0,.25)',
    'cursor:pointer', 'display:none'
  ].join(';');

  bellBtn.addEventListener('click', onBellClick);
  document.body.appendChild(bellBtn);
  return bellBtn;
}

function showBell(show) {
  const btn = ensureBellButton();
  if (btn) btn.style.display = show ? 'block' : 'none';
}

function refreshBellVisibility() {
  if (!supported || !currentUser) { showBell(false); return; }
  let perm = 'default';
  try { perm = Notification.permission || 'default'; } catch (_e) {}
  showBell(perm !== 'granted');
}

function onBellClick() {
  let perm = 'default';
  try { perm = Notification.permission || 'default'; } catch (_e) {}

  if (perm === 'denied') {
    const msg = isIosStandaloneRequired()
      ? '推播通知已被停用。iPhone／iPad：請先用 Safari 開啟本系統，依「分享 → 加到主畫面」後再由主畫面圖示進入。'
      : '推播通知已被瀏覽器封鎖，請按網址列左側鎖頭／設定圖示，將「通知」改為允許後再按一次。';
    if (window.showToast) window.showToast(msg, 'warning');
    else alert(msg);
    return;
  }

  if (isIosStandaloneRequired()) {
    if (window.showToast) {
      window.showToast('iPhone／iPad 請先用 Safari「分享 → 加到主畫面」，再由主畫面圖示進入本系統以啟用推播。', 'info');
    }
  }
  enable();
}

// ---------------------------------------------------------------- 註冊流程

async function registerServiceWorker() {
  if (!navigator.serviceWorker) throw new Error('NO_SERVICE_WORKER');
  swRegistration = await navigator.serviceWorker.register(SW_URL);
  await navigator.serviceWorker.ready;
  return swRegistration;
}

function tokenRecord(nowIso) {
  return {
    uid: getAuthUid(),
    userId: String((currentUser && currentUser.id) || ''),
    username: String((currentUser && currentUser.username) || ''),
    name: String((currentUser && currentUser.name) || ''),
    position: String((currentUser && currentUser.position) || ''),
    platform: 'web',
    userAgent: String(navigator.userAgent || '').slice(0, 200),
    createdAt: nowIso,
    updatedAt: nowIso
  };
}

async function persistToken(token) {
  const fb = getFb();
  if (!fb || !token) return;

  try {
    // 同 token 重複登入：直接覆寫；跨帳號（共用電腦）規則會拒絕
    await fb.setDoc(fb.doc(fb.db, TOKENS_COLLECTION, token), tokenRecord(new Date().toISOString()));
  } catch (err) {
    if (err && err.code === 'permission-denied') {
      // token 歸屬於其他帳號：作廢後重新請發一顆屬於自己的 token
      try { await deleteToken(messaging); } catch (_e) {}
      const newToken = await getToken(messaging, {
        vapidKey: getVapidKey(),
        serviceWorkerRegistration: swRegistration
      });
      if (newToken) {
        currentToken = newToken;
        await fb.setDoc(fb.doc(fb.db, TOKENS_COLLECTION, newToken), tokenRecord(new Date().toISOString()));
      }
    } else {
      throw err;
    }
  }
}

function getVapidKey() {
  return (window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.messagingVapidKey) || '';
}

async function refreshToken() {
  if (!messaging || !swRegistration) return '';
  if (!getVapidKey()) {
    console.warn('[FCM] 缺少 messagingVapidKey，無法取得 token');
    return '';
  }
  const token = await getToken(messaging, {
    vapidKey: getVapidKey(),
    serviceWorkerRegistration: swRegistration
  });
  if (!token) throw new Error('EMPTY_TOKEN');

  if (token !== currentToken) {
    currentToken = token;
    await persistToken(token);
    console.log('[FCM] 推播 token 已註冊');
  }
  return token;
}

async function requestAndRegister() {
  if (!supported) return false;
  try {
    if (!swRegistration) await registerServiceWorker();
    await refreshToken();
    refreshBellVisibility();
    return true;
  } catch (err) {
    console.warn('[FCM] 啟用推播失敗:', err);
    if (window.showToast) {
      window.showToast('啟用推播通知失敗，請稍後再試或檢查瀏覽器通知設定。', 'warning');
    }
    refreshBellVisibility();
    return false;
  }
}

// 使用者明確點擊啟用（具手勢，Safari 必要條件）
export async function enable() {
  if (!supported) {
    if (window.showToast) window.showToast('目前瀏覽器不支援推播通知，請使用最新版 Chrome／Edge／Safari。', 'warning');
    return false;
  }
  try {
    if ('Notification' in window && Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        refreshBellVisibility();
        return false;
      }
    }
  } catch (_e) { /* 部分瀏覽器需 callback 形式 */ }

  return requestAndRegister();
}

// ---------------------------------------------------------------- 前景接收

function handleForegroundMessage(payload) {
  try {
    const data = (payload && payload.data) || {};
    const title = (payload.notification && payload.notification.title) || data.title || '診所系統通知';
    const body = (payload.notification && payload.notification.body) || data.body || '';
    const eventId = data.eventId || '';

    // 站內即時通知（RTDB 監聽）已顯示過 → 不重複跳 toast
    if (eventId && markEventSeen(eventId)) return;

    window.dispatchEvent(new CustomEvent('fcmForegroundMessage', {
      detail: { title, body, data }
    }));

    if (window.showToast) {
      window.showToast(body ? `${title}：${body}` : title, 'info');
    }
    if (typeof window.playNotificationSound === 'function') {
      try { window.playNotificationSound(); } catch (_e) {}
    }
  } catch (err) {
    console.warn('[FCM] 處理前景推播失敗:', err);
  }
}

// ---------------------------------------------------------------- 對外 API

async function initAfterLogin(userData) {
  currentUser = userData || null;
  if (!supported) return;

  try {
    if (!messaging) {
      const app = window.firebase && window.firebase.app;
      messaging = getMessaging(app);
      onMessage(messaging, handleForegroundMessage);
    }

    // SW 先註冊（不論授權與否），背景時才能收訊
    if (!swRegistration) {
      try { await registerServiceWorker(); } catch (e) { console.warn('[FCM] SW 註冊失敗:', e); }
    }

    let perm = 'default';
    try { perm = Notification.permission || 'default'; } catch (_e) {}

    if (perm === 'granted') {
      await requestAndRegister();
    } else {
      // Chrome／Edge 可在登入後直接詢問；Safari 需手勢，失敗就靠 bell 鈕
      try {
        const granted = await Notification.requestPermission();
        if (granted === 'granted') await requestAndRegister();
        else refreshBellVisibility();
      } catch (_e) {
        refreshBellVisibility();
      }
    }

    // 分頁重新取得可見性時補檢 token（例如使用者在其他分頁授權）
    document.addEventListener('visibilitychange', onVisibilityChange);
    initialized = true;
  } catch (err) {
    console.warn('[FCM] 初始化失敗:', err);
    refreshBellVisibility();
  }
}

function onVisibilityChange() {
  if (document.hidden || !currentUser) return;
  refreshBellVisibility();
  // 模組化 SDK 已無 onTokenRefresh，回到前景時重檢一次 token 以捕捉輪換
  try {
    if (Notification.permission === 'granted' && messaging) {
      refreshToken().catch(() => {});
    }
  } catch (_e) {}
}

async function handleLogout() {
  if (!supported) return;
  document.removeEventListener('visibilitychange', onVisibilityChange);
  showBell(false);

  // 先刪 Firestore 記錄（登出前 auth 仍有效）
  const fb = getFb();
  if (fb && currentToken) {
    try {
      await fb.deleteDoc(fb.doc(fb.db, TOKENS_COLLECTION, currentToken));
    } catch (_e) { /* 規則或網路失敗則忽略，後端會自清失效 token */ }
  }
  if (messaging) {
    try { await deleteToken(messaging); } catch (_e) {}
  }
  currentToken = '';
  currentUser = null;
  initialized = false;
}

/**
 * 由業務事件呼叫，向後端請求派發推播。
 * @param {{uids?:string[], allStaff?:boolean, exceptUids?:string[]}} targets
 * @param {string} title
 * @param {string} body
 * @param {object} [data] 所有值須可轉字串
 * @param {string} [eventId] 去重 id
 */
async function sendPush(targets, title, body, data, eventId) {
  if (!supported) return { skipped: true, reason: 'unsupported' };

  const fb = getFb();
  const auth = fb && window.firebase.auth ? window.firebase.auth : null;
  const firebaseUser = auth ? auth.currentUser : null;
  if (!firebaseUser) return { skipped: true, reason: 'not-authenticated' };

  const target = targets || {};
  const uids = Array.isArray(target.uids)
    ? target.uids.map((u) => String(u || '').trim()).filter(Boolean).slice(0, 50)
    : [];
  const exceptUids = Array.isArray(target.exceptUids)
    ? target.exceptUids.map((u) => String(u || '').trim()).filter(Boolean)
    : [];

  if (!target.allStaff && uids.length === 0) return { skipped: true, reason: 'no-targets' };

  const cleanData = { event: (data && data.event) || 'general' };
  if (eventId) cleanData.eventId = String(eventId);
  if (data) {
    Object.keys(data).slice(0, 20).forEach((k) => {
      if (k === 'event') return;
      const v = data[k];
      if (v === undefined || v === null) return;
      cleanData[k] = truncate(v, 500);
    });
  }
  cleanData.url = (cleanData.url && String(cleanData.url).indexOf('/') === 0)
    ? new URL(cleanData.url, window.location.origin).href
    : window.location.origin + '/system.html';

  let idToken = '';
  try {
    idToken = await firebaseUser.getIdToken();
  } catch (_e) {
    return { skipped: true, reason: 'no-id-token' };
  }

  try {
    const resp = await fetch(NOTIFY_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + idToken
      },
      body: JSON.stringify({
        targets: target.allStaff ? { allStaff: true, exceptUids } : { uids },
        title: truncate(title, 100) || '診所系統通知',
        body: truncate(body, 500) || '',
        data: cleanData
      })
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.warn('[FCM] 派發推播失敗:', json && (json.message || json.error) || resp.status);
    }
    return json;
  } catch (err) {
    console.warn('[FCM] 推播請求錯誤:', err);
    return { skipped: true, reason: 'network-error' };
  }
}

// ---------------------------------------------------------------- 啟動

(async function boot() {
  try {
    supported = await isSupported();
  } catch (_e) {
    supported = false;
  }
  if (!supported) {
    console.info('[FCM] 此瀏覽器不支援 Web Push');
    return;
  }
  if (document.readyState !== 'loading') ensureBellButton();
  else document.addEventListener('DOMContentLoaded', ensureBellButton);
})();

window.FCMClient = {
  initAfterLogin,
  enable,
  handleLogout,
  sendPush,
  markEventSeen,
  isSupported: () => supported,
  isInitialized: () => initialized
};
