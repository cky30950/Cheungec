// 檔案路徑：/functions/api/secure-data.js
import getFirebaseConfig from '../../firebaseConfig.js';

export async function onRequest(context) {
  // 1. 取得 Cloudflare Dashboard 注入的環境變數
  const { env } = context;

  // 2. 呼叫根目錄的 firebaseConfig.js 取得完整配置
  const firebaseConfig = getFirebaseConfig(env);

  // 3. 安全檢查：確認變數有順利讀取
  if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
    return Response.json(
      { success: false, error: "伺服器環境變數讀取失敗，請確認 Dashboard 設定" },
      { status: 500 }
    );
  }

  // 4. 後端邏輯處理（例如調用 Firebase REST API）
  try {
    const dbUrl = `${firebaseConfig.databaseURL}/data.json`;
    const response = await fetch(dbUrl);
    const result = await response.json();

    return Response.json({
      success: true,
      data: result
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
