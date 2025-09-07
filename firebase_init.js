// Import Firebase functions
    import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getFirestore, initializeFirestore, persistentLocalCache, collection, addDoc, getDocs, getDoc, doc, updateDoc, deleteDoc, setDoc, onSnapshot, query, where, orderBy, limit, getCountFromServer, startAfter,
        // 引入離線快取相關方法，啟用 IndexedDB 快取
        enableIndexedDbPersistence,
        enableMultiTabIndexedDbPersistence } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getDatabase, ref, set, get, child, push, update, remove, onValue, off,
        // 新增查詢相關方法，用於在 Realtime Database 上進行條件篩選
        query as rtdbQuery,
        orderByChild,
        startAt,
        endAt,
        equalTo } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, setPersistence, browserSessionPersistence } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

    // 您的 Firebase 配置（請替換成您的實際配置）
const firebaseConfig = {
  apiKey: "AIzaSyCx_BLIWVKZs0vJa5TwL6zoycJexY_5nXU",
  authDomain: "system-1e90a.firebaseapp.com",
  databaseURL: "https://system-1e90a-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "system-1e90a",
  storageBucket: "system-1e90a.firebasestorage.app",
  messagingSenderId: "80947900109",
  appId: "1:80947900109:web:b6cd62bb2f1e07971a4384"
};

    // Initialize Firebase
    const app = initializeApp(firebaseConfig);
    // 初始化 Firestore 時啟用持久化快取。使用 persistentLocalCache() 讓本地 IndexedDB 快取在關閉瀏覽器後仍可保留。
    const db = initializeFirestore(app, { localCache: persistentLocalCache() });
    const rtdb = getDatabase(app);
    const auth = getAuth(app);

// 啟用 Cloud Firestore 的離線快取功能。優先嘗試單分頁模式，若因多分頁導致失敗，再嘗試多分頁模式。
// 此功能會將讀取過的文件緩存至 IndexedDB，重新載入頁面時會先從本地快取讀取資料，降低網路請求次數。
try {
  // 嘗試啟用單分頁 IndexedDB 快取。使用 catch 來處理失敗案例。
  enableIndexedDbPersistence(db).catch(async (err) => {
    // 多分頁同時開啟時，enableIndexedDbPersistence 會丟出 failed-precondition 錯誤。
    if (err && err.code === 'failed-precondition') {
      try {
        // 改用多分頁模式啟用離線快取。
        await enableMultiTabIndexedDbPersistence(db);
        console.log('已啟用 Firestore 多分頁離線快取');
      } catch (multiErr) {
        console.warn('啟用多分頁離線快取失敗:', multiErr);
      }
    } else if (err && err.code === 'unimplemented') {
      // 某些瀏覽器（如 Safari 私密模式）不支援 IndexedDB
      console.warn('當前瀏覽器不支援 IndexedDB 離線快取');
    } else {
      console.warn('啟用離線快取時發生錯誤:', err);
    }
  });
} catch (persistenceErr) {
  console.warn('初始化離線快取失敗:', persistenceErr);
}

// 將 Auth 的持久化模式設置為「session」，以確保當瀏覽器或分頁關閉時自動登出
// 這會將登入狀態儲存在 sessionStorage 而非預設的 localStorage，
// 一旦使用者關閉該瀏覽器分頁或整個瀏覽器，登入狀態會被清除。
// 若設置失敗，會在控制台輸出錯誤訊息，但不會阻止應用程式繼續運作。
setPersistence(auth, browserSessionPersistence).catch((error) => {
  console.error('設置 Firebase Auth 持久化模式失敗:', error);
});

    // 讓其他腳本可以使用 Firebase
    window.firebase = {
        app, db, rtdb, auth,
        collection, addDoc, getDocs, getDoc, doc, updateDoc, deleteDoc, setDoc, onSnapshot, query, where, orderBy, limit,
        // 新增 startAfter 供分頁查詢使用
        startAfter,
        ref, set, get, child, push, update, remove, onValue, off,
        // 將 Realtime Database 查詢暴露為 rtdbQuery，避免覆蓋 Firestore 的 query
        rtdbQuery,
        orderByChild,
        startAt,
        endAt,
        equalTo,
        signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged,
        // 讓其他模組可存取持久化相關方法（可選）
        setPersistence, browserSessionPersistence,
        // 聚合查詢函式，用於 count() 等操作
        getCountFromServer
    };

    // 連接狀態監控
    window.firebaseConnected = false;
    const connectedRef = ref(rtdb, '.info/connected');
    onValue(connectedRef, (snapshot) => {
        if (snapshot.val() === true) {
            window.firebaseConnected = true;
            console.log('Firebase 已連接');
        } else {
            window.firebaseConnected = false;
            console.log('Firebase 連接中斷');
        }
    });

    console.log('Firebase 初始化完成');