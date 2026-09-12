/* =========================================================
 * 系統版本設定檔（可自行修改）
 * ---------------------------------------------------------
 * 用法：只要修改下面第 17 行的 SYSTEM_EDITION 即可切換版本
 *
 *   'pro'      → 進階版：最多可建立 5 間診所，
 *                          可新增／刪除診所
 *   'standard' → 普通版：只限使用 1 間診所，
 *                          「新增診所」「刪除目前診所」按鈕
 *                          會反白停用，並標示「進階版系統才有」
 *
 * 修改後儲存檔案，重新整理系統頁面即生效，無需改其他程式碼。
 * ========================================================= */

window.SYSTEM_EDITION = 'pro';   // 可填：'pro'（進階版） 或 'standard'（普通版）

/* 各版本參數（一般不需修改，如需調整診所上限可改這裡） */
window.SYSTEM_VERSION_CONFIG = {
    pro: {
        maxClinics: 5            // 進階版診所數量上限
    },
    standard: {
        maxClinics: 1            // 普通版診所數量上限
    }
};

/* 取得目前版本：'pro' 或 'standard'（設定錯誤時預設為進階版） */
window.getSystemEdition = function () {
    return window.SYSTEM_EDITION === 'standard' ? 'standard' : 'pro';
};

/* 是否為進階版 */
window.isProEdition = function () {
    return window.getSystemEdition() === 'pro';
};

/* 取得目前版本的診所數量上限 */
window.getMaxClinics = function () {
    var edition = window.getSystemEdition();
    var cfg = window.SYSTEM_VERSION_CONFIG[edition] || {};
    var max = parseInt(cfg.maxClinics, 10);
    return isNaN(max) || max < 1 ? 1 : max;
};
