// 檔案路徑：/functions/api/secure-data.js

export async function onRequest(context) {
  const { env } = context;

  // 後端只負責拿 Cloudflare Dashboard 裡的變數與敏感金鑰
  const projectId = env.FIREBASE_PROJECT_ID || "system-1e90a";
  const databaseURL = env.FIREBASE_DATABASE_URL;
  const privateKey = env.FIREBASE_PRIVATE_KEY; // 敏感金鑰放在這裡

  if (!projectId) {
    return Response.json(
      { success: false, error: "Missing projectId in environment variables" },
      { status: 500 }
    );
  }

  try {
    // 在後端進行安全操作
    const res = await fetch(`${databaseURL}/data.json`);
    const data = await res.json();

    return Response.json({ success: true, data });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
