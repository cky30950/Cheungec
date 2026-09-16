

const firebaseConfig = {
  apiKey: "AIzaSyCx_BLIWVKZs0vJa5TwL6zoycJexY_5nXU",
  authDomain: "system-1e90a.firebaseapp.com",
  databaseURL: "https://system-1e90a-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "system-1e90a",
  storageBucket: "system-1e90a.firebasestorage.app",
  messagingSenderId: "80947900109",
  appId: "1:80947900109:web:b6cd62bb2f1e07971a4384",
  // FCM Web Push 憑證公鑰（Firebase Console → Cloud Messaging → Web Push certificates）
  messagingVapidKey: "BPkiiAGEHYTYNRpB_jZXmQB36oZG7frtq0lZGDWFYb4DW70sqA2ac_xdICGNeG8TbfVhDgSrJSoCFNE9ktLbr3c"
};

// 提供非模組腳本（fcm-client.js、SW 註冊流程）讀取公開設定
if (typeof window !== 'undefined') {
  window.FIREBASE_CONFIG = firebaseConfig;
}

export default firebaseConfig;
