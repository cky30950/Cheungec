/* ============================================================
 * 視訊診症延遲載入器（stub + dynamic <script> injection）
 * ------------------------------------------------------------
 * system.html 原本在頁尾無條件同步載入 6 個 video/ 腳本（含
 * 1.57MB agora-rtc-sdk.js），但只有醫師角色點擊「視訊診症」
 * 時才需要。本檔提供 stub 函式與動態載入邏輯，將 SDK 下載
 * 延後到實際需要時才執行。
 *
 * 依賴順序（必須依序載入，後者依賴前者的全域變數）：
 *   1. agora-config.js      → window.AGORA_CONFIG
 *   2. agora-rtc-sdk.js     → window.AgoraRTC
 *   3. agora-call.js        → window.AgoraCall
 *   4. video-presence.js    → window.VideoPresence
 *   5. video-consent.js     → window.VideoConsent
 *   6. video-consultation.js → 覆寫 window.openVideoConsultation / closeVideoConsultation
 *
 * room.html（病人端）仍自行載入完整腳本，不受影響。
 * ============================================================ */

(function () {
    'use strict';

    // 已載入的 promise（單例，確保只載入一次）
    var loadPromise = null;

    // 依賴順序：每個檔案載入完成後才插入下一個
    var DEPS = [
        'video/agora-config.js',
        'video/agora-rtc-sdk.js',
        'video/agora-call.js',
        'video/video-presence.js',
        'video/video-consent.js',
        'video/video-consultation.js'
    ];

    // 動態插入單一 <script> 並回傳 Promise
    function injectScript(src) {
        return new Promise(function (resolve, reject) {
            var el = document.createElement('script');
            el.src = src;
            el.async = false; // 保持依賴順序
            el.onload = function () { resolve(); };
            el.onerror = function () {
                reject(new Error('載入視訊元件失敗：' + src));
            };
            document.head.appendChild(el);
        });
    }

    // 依序載入所有依賴
    function loadAll() {
        if (loadPromise) return loadPromise;
        loadPromise = DEPS.reduce(function (chain, src) {
            return chain.then(function () { return injectScript(src); });
        }, Promise.resolve()).catch(function (err) {
            // 失敗後重置，下次可以重試
            loadPromise = null;
            throw err;
        });
        return loadPromise;
    }

    // 檢查當前登入用戶是否為醫師（不依賴 Agora SDK）
    function isDoctorUser() {
        try {
            if (typeof currentUserData !== 'undefined' && currentUserData) {
                return String(currentUserData.position || '').trim() === '醫師';
            }
        } catch (_e) { /* ignore */ }
        return false;
    }

    // 版本開關：依 version-config.js 的 videoConsultation 旗標判斷（簡單版關閉）
    function isVideoFeatureEnabled() {
        try {
            if (typeof window.isVersionFeatureEnabled !== 'function') return true;
            return window.isVersionFeatureEnabled('videoConsultation');
        } catch (_e) { return true; }
    }

    // 顯示 toast 或 fallback 到 console
    function notify(message, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type || 'info');
        } else {
            console.log('[視訊診症]', message);
        }
    }

    // 保留 stub 自身的引用，以便在 loadAll 完成後檢查是否已被覆寫
    var stubOpenVideoConsultation = null;

    // ── Stub: openVideoConsultation ──────────────────────────────
    stubOpenVideoConsultation = async function () {
        // 版本閘門（最早擋下，不浪費 1.6MB 下載）
        if (!isVideoFeatureEnabled()) {
            notify('當前系統版本未提供視訊診症功能', 'error');
            return;
        }
        // 權限閘門（最早擋下，不浪費 1.6MB 下載）
        if (!isDoctorUser()) {
            notify('視訊診症僅限醫師帳號使用', 'error');
            return;
        }

        try {
            await loadAll();
        } catch (err) {
            console.error('[視訊診症] 動態載入失敗:', err);
            notify(err.message || '視訊元件載入失敗，請重新整理頁面', 'error');
            return;
        }

        // video-consultation.js 的 IIFE 載入完成後已覆寫此函式。
        // 此時 window.openVideoConsultation !== stubOpenVideoConsultation，
        // 直接調用 real 版本。
        if (window.openVideoConsultation !== stubOpenVideoConsultation &&
            typeof window.openVideoConsultation === 'function') {
            await window.openVideoConsultation();
            return;
        }

        // 理論上不會走到這裡（video-consultation.js 頂層 IIFE 會立即覆寫）
        notify('視訊元件尚未完全就緒，請稍後再試', 'error');
    };
    window.openVideoConsultation = stubOpenVideoConsultation;

    // ── Stub: closeVideoConsultation ─────────────────────────────
    // system.js 在關閉診症表單時會呼叫此函式（L13349），不論視訊是否開啟。
    // 此 stub 只在「從未點過視訊診症（SDK 未載入）」時被調用——
    // 一旦 SDK 載入，video-consultation.js 的 IIFE 會覆寫此函式，
    // stub 永遠不會再被調用。所以這裡只做最小清理：隱藏面板 DOM。
    window.closeVideoConsultation = function () {
        var panel = document.getElementById('videoConsultPanel');
        if (panel) panel.classList.add('hidden');
        var body = document.body;
        if (body) {
            body.classList.remove('vc-phone-fullscreen-open');
        }
        try {
            var fsEl = document.fullscreenElement || document.webkitFullscreenElement;
            if (fsEl === document.documentElement) {
                if (document.exitFullscreen) document.exitFullscreen();
                else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
            }
        } catch (_e) { /* ignore */ }
    };

    // ── 角色顯示／隱藏：不依賴 SDK ──────────────────────────────
    function syncVideoEntryVisibility() {
        var btn = document.getElementById('videoConsultBtn');
        if (btn) btn.classList.toggle('hidden', !(isDoctorUser() && isVideoFeatureEnabled()));
    }

    function init() {
        syncVideoEntryVisibility();
        // 診症表單展開時再次同步（避免自動登入較慢導致按鈕一開始顯示錯誤）
        var form = document.getElementById('consultationForm');
        if (form && !form._videoRoleObserved) {
            form._videoRoleObserved = true;
            var observer = new MutationObserver(function () {
                if (!form.classList.contains('hidden')) syncVideoEntryVisibility();
            });
            observer.observe(form, { attributes: true, attributeFilter: ['class'] });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
