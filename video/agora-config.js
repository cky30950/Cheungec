/* ============================================================
 * Agora 視訊診症設定檔（可自行修改）
 * ------------------------------------------------------------
 * 申請與設置步驟請見說明，重點只有兩個欄位：
 *
 * 1. APP_ID（必填）
 *    Agora Console → 建立專案後取得的 App ID。
 *
 * 2. TOKEN_URL（正式環境建議填寫；測試階段可留空）
 *    - 留空 ''：測試模式。專案必須在 Agora Console 關閉
 *      「主要憑證 / Primary Certificate」（即 App ID 認證模式），
 *      只適合開發測試，任何人拿到 App ID 都可使用你的額度。
 *    - 正式環境：啟用主要憑證後，部署隨附的 Cloudflare Pages
 *      Function（functions/api/agora-token/[[path]].js），
 *      再填入它的網址，例如：
 *      https://你的網站.pages.dev/api/agora-token
 *
 * 注意：視訊功能必須在 https:// 或 http://localhost 下運作，
 *       瀏覽器才會允許使用鏡頭與麥克風。
 * ============================================================ */

window.AGORA_CONFIG = {
    // Agora 專案 App ID（公開資訊，可放前端）
    APP_ID: 'c165beb6e17d4264a3d780a06bebb812',

    // Token 伺服器：使用同源相對路徑，正式部署至 Cloudflare Pages 與
    // 本機 wrangler pages dev 皆可直接運作，無需填寫網域。
    // （若想退回無 Token 測試模式，可暫時改為 ''，但 Agora 專案必須關閉主要憑證）
    TOKEN_URL: '/api/agora-token',

    // 頻道名稱前綴，實際頻道為「前綴 + 掛號編號」，例如 tcm-consult-123
    CHANNEL_PREFIX: 'tcm-consult-'
};
