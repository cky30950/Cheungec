
    import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  setDoc,
  query,
  where,
  orderBy,
  limit,
  getCountFromServer,
  startAfter,
  getDoc,
  runTransaction,
  
  initializeFirestore,
  persistentLocalCache,
  
  persistentMultipleTabManager
  ,
  
  writeBatch
  
  , onSnapshot
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getDatabase, ref, set, get, update, remove, onValue, off,
        
        onDisconnect,
        push,
        serverTimestamp,
        
        query as rtdbQuery,
        orderByChild,
        startAt,
        endAt,
        
        limitToLast } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js';
import { getAuth, signInWithEmailAndPassword, signOut, setPersistence,
        browserSessionPersistence, browserLocalPersistence,
        createUserWithEmailAndPassword, updateProfile,
        
        updatePassword, deleteUser as firebaseDeleteUser, EmailAuthProvider, reauthenticateWithCredential,
        
        onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

// ── FCM Cloud Messaging ──
// Firebase v10 modular SDK 只导出：getMessaging / getToken / onMessage / deleteToken / isSupported
// 注意：onTokenRefresh 在 modular SDK 中不存在（只有 compat 版本有）
import {
  getMessaging,
  getToken,
  onMessage,
  deleteToken,
  isSupported as messagingIsSupported
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js';


import firebaseConfig from './firebaseConfig.js';

    
    const app = initializeApp(firebaseConfig);
    
    
    
    const db = initializeFirestore(app, {
      
      
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
      })
    });

    
    const rtdb = getDatabase(app);
    const auth = getAuth(app);




setPersistence(auth, browserSessionPersistence).catch((error) => {
  console.error('設置 Firebase Auth 持久化模式失敗:', error);
});

    
    
    
    window.firebase = {
        
        app,
        db,
        rtdb,
        auth,
        
        collection,
        addDoc,
        getDocs,
        doc,
        updateDoc,
        deleteDoc,
        setDoc,
        
        writeBatch,
        
        firestoreQuery: query,
        where,
        orderBy,
        limit,
        startAfter,   
        getDoc,       
        getCountFromServer,
        runTransaction,
        
        onSnapshot,
        
        ref,
        set,
        get,
        update,
        remove,
        onValue,
        off,
        
        onDisconnect,
        push,
        serverTimestamp,
        
        rtdbQuery,
        
        query: rtdbQuery,
        orderByChild,
        startAt,
        endAt,
        
        limitToLast,
        
        signInWithEmailAndPassword,
        signOut,
        createUserWithEmailAndPassword,
        updateProfile,
        
        updatePassword,
        
        deleteAuthUser: firebaseDeleteUser,
        
        EmailAuthProvider,
        reauthenticateWithCredential,
        
        setPersistence,
        browserSessionPersistence,
        browserLocalPersistence,
        
        onAuthStateChanged,

        // ── FCM Cloud Messaging ──
        getMessaging,
        getToken,
        onMessage,
        deleteToken,
        messagingIsSupported
    };

    
    window.firebaseConnected = false;
    const connectedRef = ref(rtdb, '.info/connected');
    onValue(connectedRef, (snapshot) => {
        if (snapshot.val() === true) {
            window.firebaseConnected = true;
            console.log('Firebase 已連接');
            
            window.firebaseStatusInitialized = true;
            
            try {
                window.dispatchEvent(new CustomEvent('firebaseConnectionChanged', {
                    detail: { connected: true }
                }));
            } catch (_e) {
                
            }
        } else {
            window.firebaseConnected = false;
            console.log('Firebase 連接中斷');
            
            window.firebaseStatusInitialized = true;
            
            try {
                window.dispatchEvent(new CustomEvent('firebaseConnectionChanged', {
                    detail: { connected: false }
                }));
            } catch (_e) {
                
            }
        }
    });

    console.log('Firebase 初始化完成');

    
