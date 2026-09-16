/* ============================================================
 * Firebase Cloud Messaging — 客戶端模組
 * ------------------------------------------------------------
 * 功能：
 *   1. 向瀏覽器請求通知權限
 *   2. 取得 FCM registration token 並寫入 Firestore `fcmPushTokens/{uid}`
 *   3. 監聽 token 刷新（onTokenRefresh）並自動更新
 *   4. 前景推送（頁面開啟時）以 toast 顯示
 *   5. 提供 window.FCM API 給 system.js / chat_module.js 呼叫後端推播
 *
 * 依賴：firebase_init.js 必須先執行（window.firebase 就緒）
 * Service Worker：firebase-messaging-sw.js（根目錄）
 * ============================================================ */

(function () {
  'use strict';

  const FCM_SW_PATH = '/firebase-messaging-sw.js';
  const SERVER_SENDER_ID = '80947900109'; // messagingSenderId

  let messaging = null;
  let currentToken = null;
  let initialized = false;
  let currentUserUid = null;
  let vapidKey = '';

  // ── 延遲初始化：等 window.firebase 與 Service Worker 都就緒 ──
  function waitForFirebase(timeoutMs) {
    const deadline = Date.now() + (timeoutMs || 10000);
    return new Promise(function (resolve, reject) {
      function check() {
        if (window.firebase && window.firebase.app) return resolve();
        if (Date.now() > deadline) return reject(new Error('FCM: 等待 firebase_init.js 超时'));
        setTimeout(check, 100);
      }
      check();
    });
  }

  function waitForServiceWorker(timeoutMs) {
    const deadline = Date.now() + (timeoutMs || 8000);
    return new Promise(function (resolve, reject) {
      if (!('serviceWorker' in navigator)) return resolve(null); // 無 SW 能力不算錯
      function check() {
        if (navigator.serviceWorker.controller || navigator.serviceWorker.ready) {
          return navigator.serviceWorker.ready.then(resolve, reject);
        }
        if (Date.now() > deadline) return reject(new Error('FCM: Service Worker 注册超时'));
        setTimeout(check, 100);
      }
      check();
    });
  }

  // ── 讀取 vapidKey（從 firebaseConfig.js 掛到 window） ──
  function getVapidKey() {
    if (vapidKey) return vapidKey;
    if (window.firebaseConfig && window.firebaseConfig.vapidKey) {
      vapidKey = window.firebaseConfig.vapidKey;
    }
    return vapidKey;
  }

  // ── 註冊 Service Worker ──
  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
      console.warn('[FCM] 瀏覽器不支援 Service Worker');
      return Promise.resolve(null);
    }
    return navigator.serviceWorker.register(FCM_SW_PATH)
      .then(function (reg) {
        console.log('[FCM] Service Worker 已註冊：', reg.scope);
        return reg;
      })
      .catch(function (err) {
        console.warn('[FCM] Service Worker 註冊失敗：', err);
        return null;
      });
  }

  // ── 取得 Firebase Messaging 實例 ──
  function getMessaging() {
    if (messaging) return messaging;
    if (!window.firebase || !window.firebase.app) {
      throw new Error('Firebase 尚未初始化');
    }
    // 動態 import messaging 模組
    messaging = window.firebase.getMessaging
      ? window.firebase.getMessaging(window.firebase.app)
      : null;
    return messaging;
  }

  // ── 請求通知權限 ──
  function requestPermission() {
    if (!('Notification' in window)) {
      console.warn('[FCM] 瀏覽器不支援 Notification API');
      return Promise.resolve('unsupported');
    }
    if (Notification.permission === 'granted') {
      return Promise.resolve('granted');
    }
    if (Notification.permission === 'denied') {
      console.warn('[FCM] 通知權限已被拒絕');
      return Promise.resolve('denied');
    }
    return Notification.requestPermission();
  }

  // ── 取得 FCM token ──
  function getToken(swReg) {
    try {
      const msg = getMessaging();
      if (!msg) {
        console.warn('[FCM] getMessaging 不可用');
        return Promise.reject(new Error('FCM messaging 未就緒'));
      }
      const firebaseGetToken = window.firebase && window.firebase.getToken;
      if (!firebaseGetToken) {
        console.warn('[FCM] window.firebase.getToken 不可用');
        return Promise.reject(new Error('FCM getToken 未就緒'));
      }
      const opts = {
        vapidKey: getVapidKey(),
        serviceWorkerRegistration: swReg || undefined
      };
      // Firebase v10 modular SDK：getToken(messaging, options) 是獨立函數
      return firebaseGetToken(msg, opts);
    } catch (err) {
      return Promise.reject(err);
    }
  }

  // ── 將 token 寫入 Firestore：fcmPushTokens/{uid} ──
  // 只存必要欄位，Security Rules 會限制寫入
  function saveTokenToFirestore(token, uid) {
    if (!token || !uid) return Promise.resolve();
    const db = window.firebase && window.firebase.db;
    if (!db) {
      console.warn('[FCM] Firestore 未就緒，無法寫入 token');
      return Promise.resolve();
    }
    const col = window.firebase.collection;
    const doc = window.firebase.doc;
    const setFn = window.firebase.setDoc;
    if (!col || !doc || !setFn) return Promise.resolve();

    const ref = doc(db, 'fcmPushTokens', uid);
    const now = new Date().toISOString();
    const payload = {
      token: token,
      uid: uid,
      agent: navigator.userAgent ? navigator.userAgent.substring(0, 500) : '',
      platform: detectPlatform(),
      updatedAt: now,
      createdAt: now // 若已存在 setDoc 會覆蓋
    };

    // 用 merge:true 保留 createdAt 等舊欄位
    return setFn(ref, payload, { merge: true })
      .then(function () {
        console.log('[FCM] Token 已註冊到 fcmPushTokens/' + uid);
      })
      .catch(function (err) {
        console.warn('[FCM] Token 寫入失敗（Security Rules?）：', err.message || err);
      });
  }

  // ── 移除 token（登出時） ──
  function removeTokenFromFirestore(uid) {
    if (!uid) return Promise.resolve();
    const db = window.firebase && window.firebase.db;
    const docFn = window.firebase && window.firebase.doc;
    const deleteFn = window.firebase && window.firebase.deleteDoc;
    if (!db || !docFn || !deleteFn) return Promise.resolve();

    const ref = docFn(db, 'fcmPushTokens', uid);
    return deleteFn(ref).catch(function (err) {
      console.warn('[FCM] Token 移除失敗：', err.message || err);
    });
  }

  // ── 簡單平台偵測 ──
  function detectPlatform() {
    const ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/i.test(ua)) return 'ios-safari';
    if (/Android/i.test(ua)) return 'android';
    if (/Windows/i.test(ua)) return 'windows';
    if (/Mac OS X/i.test(ua)) return 'mac';
    if (/Linux/i.test(ua)) return 'linux';
    return 'unknown';
  }

  // ── 監聽前景推送（頁面開啟時不會顯示系統通知，走這裡） ──
  function setupForegroundHandler() {
    try {
      const msg = getMessaging();
      const firebaseOnMessage = window.firebase && window.firebase.onMessage;
      if (!msg || !firebaseOnMessage) return;
      // Firebase v10 modular SDK：onMessage(messaging, observer) 是獨立函數
      firebaseOnMessage(msg, function (payload) {
        console.log('[FCM] 前景推送：', payload);
        const title = (payload.notification && payload.notification.title) ||
          (payload.data && payload.data.title) || '新通知';
        const body = (payload.notification && payload.notification.body) ||
          (payload.data && payload.data.body) || '';

        // 優先用系統 showToast（若可用），否則 console
        if (typeof window.showToast === 'function') {
          window.showToast(`${title}${body ? '：' + body : ''}`, 'info');
        }
        if (typeof window.playNotificationSound === 'function') {
          try { window.playNotificationSound(); } catch (_) {}
        }
      });
    } catch (err) {
      console.warn('[FCM] 前景監聽設定失敗：', err);
    }
  }

  // ── 監聽 token 刷新（瀏覽器自動輪替時） ──
  function setupTokenRefreshListener(swReg) {
    try {
      const msg = getMessaging();
      const firebaseOnTokenRefresh = window.firebase && window.firebase.onTokenRefresh;
      if (!msg || !firebaseOnTokenRefresh) return;
      // Firebase v10 modular SDK：onTokenRefresh(messaging, observer) 是獨立函數
      firebaseOnTokenRefresh(msg, function () {
        console.log('[FCM] Token 刷新中…');
        getToken(swReg).then(function (newToken) {
          currentToken = newToken;
          if (currentUserUid) {
            saveTokenToFirestore(newToken, currentUserUid);
          }
        }).catch(function (err) {
          console.warn('[FCM] 刷新後重新取 token 失敗：', err);
        });
      });
    } catch (err) {
      console.warn('[FCM] onTokenRefresh 設定失敗：', err);
    }
  }

  // ── 核心：完整初始化流程 ──
  function initialize(uid) {
    if (initialized && uid && uid === currentUserUid) {
      return Promise.resolve({ token: currentToken, uid: currentUserUid });
    }

    currentUserUid = uid || null;

    return waitForFirebase()
      .then(function () {
        return registerServiceWorker();
      })
      .then(function (swReg) {
        return requestPermission().then(function (perm) {
          if (perm !== 'granted') {
            console.warn('[FCM] 通知權限未授予，token 取得可能失敗：', perm);
          }
          return { swReg: swReg, permission: perm };
        });
      })
      .then(function (result) {
        return getToken(result.swReg).then(function (token) {
          return { token: token, swReg: result.swReg, permission: result.permission };
        });
      })
      .then(function (result) {
        if (!result.token) {
          console.warn('[FCM] 無法取得 token，可能是權限未授予或 vapidKey 未設定');
        }
        currentToken = result.token || null;
        initialized = true;

        if (currentToken && currentUserUid) {
          saveTokenToFirestore(currentToken, currentUserUid);
        }
        setupForegroundHandler();
        setupTokenRefreshListener(result.swReg);

        console.log('[FCM] 初始化完成，token：', currentToken ? currentToken.substring(0, 20) + '...' : '(無)');
        return { token: currentToken, uid: currentUserUid };
      })
      .catch(function (err) {
        console.warn('[FCM] 初始化失敗：', err.message || err);
        // 失敗不阻斷主流程
        return { token: null, uid: currentUserUid, error: err.message || String(err) };
      });
  }

  // ── 觸發登入後初始化（等 Auth 狀態確定） ──
  function initAfterAuth(userData) {
    if (!userData) return;
    const uid = userData.uid || (window.firebase && window.firebase.auth && window.firebase.auth.currentUser && window.firebase.auth.currentUser.uid);
    if (!uid) return;
    // 延遲一拍，確保 firebase_init.js 已完成所有模組載入
    setTimeout(function () {
      initialize(uid);
    }, 500);
  }

  // ── 登出時清除 token ──
  function handleLogout() {
    if (currentUserUid) {
      removeTokenFromFirestore(currentUserUid);
    }
    currentToken = null;
    currentUserUid = null;
    initialized = false;
  }

  // ── 呼叫後端 Cloudflare Function 發送推播 ──
  // path: 'staff' (通知護理師群組) / 'notify-video' (視訊通知) / 'chat'
  function callNotifyApi(action, payload) {
    const base = '/api/fcm';
    const url = `${base}/${action}`;
    const body = JSON.stringify(payload || {});

    // 取得 Firebase ID token（必須，後端會驗證）
    const authPromise = (window.firebase && window.firebase.auth && window.firebase.auth.currentUser)
      ? window.firebase.auth.currentUser.getIdToken(true).catch(function () { return null; })
      : Promise.resolve(null);

    return authPromise.then(function (idToken) {
      const headers = { 'Content-Type': 'application/json' };
      if (idToken) {
        headers['Authorization'] = 'Bearer ' + idToken;
      }
      return fetch(url, {
        method: 'POST',
        headers: headers,
        body: body
      });
    }).then(function (resp) {
      if (!resp.ok) {
        return resp.json().catch(function () { return {}; }).then(function (d) {
          throw new Error(d.error || d.message || '推送失敗 HTTP ' + resp.status);
        });
      }
      return resp.json().catch(function () { return {}; });
    });
  }

  // ── 便捷方法 ──
  // 通知所有護理師/診所管理：候診、診症完成等
  function notifyStaff(title, body, extraData) {
    return callNotifyApi('notify', {
      title: title,
      body: body,
      data: extraData || {},
      tag: (extraData && extraData.tag) || undefined
    });
  }

  // 通知視訊診症的特定醫師
  function notifyDoctor(doctorUid, title, body, extraData) {
    return callNotifyApi('notify-video', {
      targetUid: doctorUid,
      title: title,
      body: body,
      data: extraData || {}
    });
  }

  // 私人聊天通知特定對方
  function notifyChatPeer(peerUid, title, body, extraData) {
    return callNotifyApi('chat', {
      targetUid: peerUid,
      title: title,
      body: body,
      data: extraData || {}
    });
  }

  // ── 暴露到 window ──
  window.FCM = {
    initialize: initialize,
    initAfterAuth: initAfterAuth,
    handleLogout: handleLogout,
    requestPermission: requestPermission,
    getToken: getToken,
    saveTokenToFirestore: saveTokenToFirestore,
    removeTokenFromFirestore: removeTokenFromFirestore,
    notifyStaff: notifyStaff,
    notifyDoctor: notifyDoctor,
    notifyChatPeer: notifyChatPeer,
    callNotifyApi: callNotifyApi,
    getCurrentToken: function () { return currentToken; },
    getCurrentUid: function () { return currentUserUid; }
  };

  console.log('[FCM] fcm-client.js 已載入，等待 Firebase 與 Auth 就緒');
})();
