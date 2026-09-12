/* ============================================================
   系統版本設定檔
   ------------------------------------------------------------
   想切換版本，只要修改下面這一行即可：

     'standard' = 普通版（只能使用 1 間診所）
     'advanced' = 進階版（最多可建立 5 間診所）

   改好後儲存檔案、重新整理網頁就會生效，不需改其他程式碼。
   ============================================================ */
window.SYSTEM_EDITION = 'advanced'; // ← 改成 'advanced' 即切換為進階版

(function () {
    // 各版本可建立的診所數量上限（日後如需調整數字可直接改這裡）
    var EDITION_MAX_CLINICS = {
        standard: 1,
        advanced: 5
    };

    // 標準寫法保險：只接受 'advanced'，其他輸入一律視為普通版
    var edition = (window.SYSTEM_EDITION === 'advanced') ? 'advanced' : 'standard';

    window.AppEdition = {
        edition: edition,                       // 目前版本：'standard' 或 'advanced'
        isAdvanced: edition === 'advanced',     // 是否為進階版
        isStandard: edition === 'standard',     // 是否為普通版
        maxClinics: EDITION_MAX_CLINICS[edition] // 診所數量上限
    };
})();
