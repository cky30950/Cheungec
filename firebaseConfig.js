import { initializeApp } from 'firebase/app';
import { getDatabase, ref, get } from 'firebase/database';

export default {
  async fetch(request, env, ctx) {
    // 1. 從 env 動態組裝 Firebase Config
    const firebaseConfig = {
      apiKey: env.FIREBASE_API_KEY,
      authDomain: env.FIREBASE_AUTH_DOMAIN,
      databaseURL: env.FIREBASE_DATABASE_URL,
      projectId: env.FIREBASE_PROJECT_ID,
      storageBucket: env.FIREBASE_STORAGE_BUCKET,
      messagingSenderId: env.FIREBASE_MESSAGING_SENDER_ID,
      appId: env.FIREBASE_APP_ID,
    };

    // 2. 初始化 Firebase App
    const app = initializeApp(firebaseConfig);

    // 3. 範例：存取 Realtime Database (或 Firestore)
    const db = getDatabase(app);
    // ... 進行你的 Firebase 操作 ...

    return new Response("Firebase SDK 初始化成功！");
  }
};
