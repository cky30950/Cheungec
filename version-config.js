/* ============================================================
 * 系統版本設定檔（可自行修改）
 * ------------------------------------------------------------
 * 想切換版本時，只要修改下面第 20 行的 APP_VERSION 即可：
 *
 *   'simple'    簡單版：只能使用 1 間診所（不能新增診所），
 *                       且不能使用視訊診症、會員功能、病歷附件
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

window.APP_VERSION = 'standard';   // ← 在這裡切換版本：'simple'（簡單版）、'standard'（普通版）或 'advanced'（進階版）

window.APP_VERSION_OPTIONS = {
    // 簡單版
    simple: {
        label: '簡單版',
        maxClinics: 1,           // 簡單版診所數量上限（僅可使用 1 間診所，不能新增診所）
        features: {
            videoConsultation: false,       // 視訊診症
            member: false,                  // 會員功能
            medicalRecordAttachment: false  // 病歷附件
        }
    },

    // 普通版
    standard: {
        label: '普通版',
        maxClinics: 1,           // 普通版診所數量上限
        features: {
            videoConsultation: true,        // 視訊診症
            member: true,                   // 會員功能
            medicalRecordAttachment: true   // 病歷附件
        }
    },

    // 進階版
    advanced: {
        label: '進階版',
        maxClinics: 5,           // 進階版診所數量上限
        features: {
            videoConsultation: true,        // 視訊診症
            member: true,                   // 會員功能
            medicalRecordAttachment: true   // 病歷附件
        }
    }
};

/* ===== 以下為系統讀取設定用的輔助函式，一般不需修改 ===== */

// 取得目前版本（輸入錯誤值時自動視為普通版）
window.getAppVersion = function () {
    if (window.APP_VERSION === 'advanced') return 'advanced';
    if (window.APP_VERSION === 'simple') return 'simple';
    return 'standard';
};

// 取得目前版本的完整設定
window.getAppVersionConfig = function () {
    return window.APP_VERSION_OPTIONS[window.getAppVersion()] || window.APP_VERSION_OPTIONS.standard;
};

// 是否為進階版
window.isAdvancedVersion = function () {
    return window.getAppVersion() === 'advanced';
};

// 是否為簡單版
window.isSimpleVersion = function () {
    return window.getAppVersion() === 'simple';
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
