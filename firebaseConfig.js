

const firebaseConfig = {
  apiKey: "AIzaSyCx_BLIWVKZs0vJa5TwL6zoycJexY_5nXU",
  authDomain: "system-1e90a.firebaseapp.com",
  databaseURL: "https://system-1e90a-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "system-1e90a",
  storageBucket: "system-1e90a.firebasestorage.app",
  messagingSenderId: "80947900109",
  appId: "1:80947900109:web:b6cd62bb2f1e07971a4384",
  // ── FCM Web Push VAPID Key ──
  vapidKey: "BPkiiAGEHYTYNRpB_jZXmQB36oZG7frtq0lZGDWFYb4DW70sqA2ac_xdICGNeG8TbfVhDgSrJSoCFNE9ktLbr3c"
};

// 讓 fcm-client.js 也能讀取到
if (typeof window !== 'undefined') {
  window.firebaseConfig = firebaseConfig;
}

export default firebaseConfig;
