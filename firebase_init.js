
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
  
  writeBatch,
  FieldValue,
  serverTimestamp as firestoreServerTimestamp,
  onSnapshot,
  clearIndexedDbPersistence,
  terminate
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getDatabase, ref, set, get, update, remove, onValue, off,

        onChildAdded,
        onChildChanged,
        onChildRemoved,

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

    /* ============================================================
     * 備份追蹤：受管集合寫入時自動補上 Firestore 端 updatedAt
     * ------------------------------------------------------------
     * R2 增量備份以 updatedAt 判斷文件變更，時間一律採用 Firestore
     * 伺服器時間（serverTimestamp），不受客戶端時鐘飄移影響。
     * 涵蓋 patients / consultations / users / patientPackages /
     * patientPackageHistory / globalBillingItems / clinics /
     * clinicExpenses / consultationAuditLogs 及
     * clinics/{id}/billingItems；新增、更新、批次寫入都會蓋章，
     * 呼叫端若已明確提供 updatedAt 則保留原值。
     * ============================================================ */
    const BACKUP_TOP_COLLECTIONS = new Set([
      'patients', 'consultations', 'users',
      'patientPackages', 'patientPackageHistory', 'globalBillingItems',
      'clinics', 'clinicExpenses', 'consultationAuditLogs',
      'patientAttachments'
    ]);

    function isBackupTrackedRef(reference) {
      if (!reference || typeof reference.path !== 'string') return false;
      const parts = reference.path.split('/');
      if (parts.length === 2) return BACKUP_TOP_COLLECTIONS.has(parts[0]);
      if (parts.length === 4) return parts[0] === 'clinics' && parts[2] === 'billingItems';
      return false;
    }

    function withUpdatedAt(data) {
      if (data && typeof data === 'object' && !Array.isArray(data) && data.updatedAt === undefined) {
        return Object.assign({}, data, { updatedAt: firestoreServerTimestamp() });
      }
      return data;
    }

    const trackedAddDoc = function (reference, data) {
      return addDoc(reference, isBackupTrackedRef(reference) ? withUpdatedAt(data) : data);
    };
    const trackedSetDoc = function (reference, data, options) {
      const finalData = isBackupTrackedRef(reference) ? withUpdatedAt(data) : data;
      return arguments.length >= 3 ? setDoc(reference, finalData, options) : setDoc(reference, finalData);
    };
    const trackedUpdateDoc = function (reference, data) {
      const finalData = isBackupTrackedRef(reference) && data && data.updatedAt === undefined
        ? Object.assign({}, data, { updatedAt: firestoreServerTimestamp() })
        : data;
      return updateDoc(reference, finalData);
    };
    const trackedWriteBatch = function (firestoreDb) {
      const batch = writeBatch(firestoreDb);
      const rawSet = batch.set.bind(batch);
      const rawUpdate = batch.update.bind(batch);
      batch.set = function (reference, data, options) {
        const finalData = isBackupTrackedRef(reference) ? withUpdatedAt(data) : data;
        return arguments.length >= 3 ? rawSet(reference, finalData, options) : rawSet(reference, finalData);
      };
      batch.update = function (reference, data) {
        const finalData = isBackupTrackedRef(reference) && data && data.updatedAt === undefined
          ? Object.assign({}, data, { updatedAt: firestoreServerTimestamp() })
          : data;
        return rawUpdate(reference, finalData);
      };
      return batch;
    };


    
    
    window.firebase = {
        
        app,
        db,
        rtdb,
        auth,
        
        collection,
        addDoc: trackedAddDoc,
        getDocs,
        doc,
        updateDoc: trackedUpdateDoc,
        deleteDoc,
        setDoc: trackedSetDoc,
        
        writeBatch: trackedWriteBatch,
        
        FieldValue,
        increment: FieldValue.increment,

        firestoreQuery: query,
        where,
        orderBy,
        limit,
        startAfter,   
        getDoc,       
        getCountFromServer,
        runTransaction,
        
        onSnapshot,
        clearIndexedDbPersistence,
        terminate,
        
        ref,
        set,
        get,
        update,
        remove,
        onValue,
        off,

        onChildAdded,
        onChildChanged,
        onChildRemoved,

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
        
        onAuthStateChanged
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

    
