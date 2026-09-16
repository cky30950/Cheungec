/* ============================================================
 * Firebase Cloud Messaging — Service Worker
 * ------------------------------------------------------------
 * 負責背景推送（網頁在後台或瀏覽器關閉時仍能顯示通知）。
 * 必須放在站點根目錄（或正確的 scope 目錄）才能收到推播。
 *
 * 與 firebase_init.js 使用同一個 Firebase 專案 config，
 * 但 Service Worker 內只能使用 messaging() 模組。
 * ============================================================ */

// Firebase Messaging SW 官方腳本
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// 與 firebaseConfig.js 保持一致
const firebaseConfig = {
  apiKey: "AIzaSyCx_BLIWVKZs0vJa5TwL6zoycJexY_5nXU",
  authDomain: "system-1e90a.firebaseapp.com",
  databaseURL: "https://system-1e90a-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "system-1e90a",
  storageBucket: "system-1e90a.firebasestorage.app",
  messagingSenderId: "80947900109",
  appId: "1:80947900109:web:b6cd62bb2f1e07971a4384"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// ── 背景推送 ──
// 當頁面在後台（被切走、瀏覽器最小化）時收到推送，
// FCM 預設會自動顯示通知卡片；若 payload 含 notification 欄位則走這裡。
messaging.onBackgroundMessage(function (payload) {
  console.log('[FCM SW] onBackgroundMessage:', payload);

  // 若後端發送時已提供 notification 欄位，瀏覽器會自動顯示，
  // 這裡只在有自訂處理需求時才 override。
  // 若後端只發 data（不含 notification），需手動顯示：
  const notificationTitle = (payload.notification && payload.notification.title) ||
    (payload.data && payload.data.title) ||
    '新通知';
  const notificationBody = (payload.notification && payload.notification.body) ||
    (payload.data && payload.data.body) ||
    '';
  const clickUrl = (payload.data && payload.data.clickUrl) ||
    (payload.notification && payload.notification.click_action) ||
    self.location.origin;

  // 當 payload 沒有 notification 欄位時才手動顯示
  if (!payload.notification) {
    self.registration.showNotification(notificationTitle, {
      body: notificationBody,
      icon: '/images/myLogo.png',
      data: { url: clickUrl, ...(payload.data || {}) },
      tag: (payload.data && payload.data.tag) || undefined,
      requireInteraction: false
    });
  }
});

// ── 通知點擊 ──
// 用戶點擊通知卡片時，聚焦現有頁面或開新頁。
self.addEventListener('notificationclick', function (event) {
  console.log('[FCM SW] notificationclick:', event.notification);
  event.notification.close();

  const url = (event.notification.data && event.notification.data.url) ||
    self.location.origin;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (clients) {
        // 優先聚焦已開啟的系統頁
        for (let i = 0; i < clients.length; i++) {
          const client = clients[i];
          if (client.url && client.url.indexOf('system.html') !== -1 && 'focus' in client) {
            return client.focus().then(function () {
              return client.navigate(url);
            });
          }
        }
        // 找不到現有頁則開新頁
        if (self.clients.openWindow) {
          return self.clients.openWindow(url);
        }
      })
  );
});

// ── Service Worker 安裝時快取必要資源 ──
self.addEventListener('install', function (event) {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

console.log('[FCM SW] Firebase Messaging Service Worker 已啟動');
