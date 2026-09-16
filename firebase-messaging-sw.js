/* ============================================================
 * Firebase Cloud Messaging（FCM V1）背景推播 Service Worker
 * ------------------------------------------------------------
 * 位置必須在網站根目錄（scope = /），由 fcm-client.js 註冊。
 * 使用 compat 版 SDK（經 importScripts），免打包工具、廣泛相容。
 *
 * 訊息行為（後端固定同時發送 notification + data）：
 *   - 網頁關閉／在背景：FCM SDK 自動顯示系統通知，
 *     點擊依 webpush.fcm_options.link 開啟（/system.html?...）
 *   - data-only 訊息：由下方 onBackgroundMessage 自行顯示
 *   - 網頁在前景：由 fcm-client.js 的 onMessage 接駁站內 toast
 * ============================================================ */

/* global importScripts, firebase */

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// 公開用戶端設定（與 firebaseConfig.js 相同；SW 無法以 ES module 匯入）
firebase.initializeApp({
  apiKey: 'AIzaSyCx_BLIWVKZs0vJa5TwL6zoycJexY_5nXU',
  authDomain: 'system-1e90a.firebaseapp.com',
  databaseURL: 'https://system-1e90a-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'system-1e90a',
  storageBucket: 'system-1e90a.firebasestorage.app',
  messagingSenderId: '80947900109',
  appId: '1:80947900109:web:b6cd62bb2f1e07971a4384'
});

const messaging = firebase.messaging();

const DEFAULT_ICON = '/images/myLogo.png';

// data-only 背景訊息：自行顯示系統通知（notification+data 訊息由 SDK 自動顯示）
messaging.onBackgroundMessage((payload) => {
  const data = (payload && payload.data) || {};
  const title = data.title || '診所系統通知';
  const body = data.body || '';

  return self.registration.showNotification(title, {
    body,
    icon: data.icon || DEFAULT_ICON,
    badge: data.badge || DEFAULT_ICON,
    tag: data.eventId || undefined,
    renotify: true,
    data: Object.assign({ swSelfShown: '1' }, data)
  });
});

// 點擊通知：已開啟的分頁直接聚焦，否則開啟對應網址。
// 註：FCM 自動顯示的通知（含 fcm_options.link）由 SDK 自身處理點擊；
// 此處只處理我們自行 showNotification 的訊息，避免重複開分頁。
self.addEventListener('notificationclick', (event) => {
  const notification = event.notification;
  const data = (notification && notification.data) || {};

  if (!data.swSelfShown) return;

  notification.close();

  const targetUrl = data.url || '/system.html';

  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

    // 優先聚焦已開啟系統頁的分頁
    for (const client of allClients) {
      try {
        const clientUrl = new URL(client.url);
        if (clientUrl.pathname === '/system.html' || clientUrl.pathname.endsWith('/system.html')) {
          client.postMessage({ type: 'FCM_NOTIFICATION_CLICK', data });
          if ('focus' in client) return client.focus();
        }
      } catch (_e) { /* ignore */ }
    }

    if (self.clients.openWindow) {
      return self.clients.openWindow(targetUrl);
    }
  })());
});

// 直接點 SW 時不顯示空白頁
self.addEventListener('install', () => {
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
