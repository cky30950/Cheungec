/* ============================================================
 * 系統版本設定檔（可自行修改）
 * ------------------------------------------------------------
 * 想切換版本時，只要修改下面第 19 行的 APP_VERSION 即可：
 *
 *   'standard'  普通版：只能使用 1 間診所
 *                       系統管理的「新增診所」「刪除目前診所」
 *                       按鈕會反白，並標示為進階版專屬功能
 *
 *   'advanced'  進階版：最多可建立 5 間診所
 *
 * 之後若有其他功能也要區分版本，可在各自版本的設定物件內
 * 加開關（例如 videoConsultation: true），再用
 * window.isVersionFeatureEnabled('videoConsultation') 判斷。
 * ============================================================ */

window.APP_VERSION = 'standard';   // ← 在這裡切換版本：'standard'（普通版）或 'advanced'（進階版）

window.APP_VERSION_OPTIONS = {
    // 普通版
    standard: {
        label: '普通版',
        maxClinics: 1            // 普通版診所數量上限
        // features: { }         // 範例：videoConsultation: false
    },

    // 進階版
    advanced: {
        label: '進階版',
        maxClinics: 5            // 進階版診所數量上限
        // features: { }         // 範例：videoConsultation: true
    }
};

/* ===== 以下為系統讀取設定用的輔助函式，一般不需修改 ===== */

// 取得目前版本（輸入錯誤值時自動視為普通版）
window.getAppVersion = function () {
    return window.APP_VERSION === 'advanced' ? 'advanced' : 'standard';
};

// 取得目前版本的完整設定
window.getAppVersionConfig = function () {
    return window.APP_VERSION_OPTIONS[window.getAppVersion()] || window.APP_VERSION_OPTIONS.standard;
};

// 是否為進階版
window.isAdvancedVersion = function () {
    return window.getAppVersion() === 'advanced';
};

// 取得目前版本的診所數量上限
window.getMaxClinics = function () {
    var cfg = window.getAppVersionConfig();
    var n = parseInt(cfg && cfg.maxClinics, 10);
    return (isNaN(n) || n < 1) ? 1 : n;
};

// 判斷某個版本功能開關是否開啟（有在 features 裡標示 true 才算開啟）
window.isVersionFeatureEnabled = function (featureName) {
    var cfg = window.getAppVersionConfig();
    return !!(cfg && cfg.features && cfg.features[featureName] === true);
};
