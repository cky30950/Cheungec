/* ============================================================
 * 名醫診所系統 — PWA 用戶端
 * ------------------------------------------------------------
 *  - Service Worker 註冊與「有新版本」提示（使用者確認才更新）
 *  - 線上/離線狀態橫幅
 *  - 推播通知開關、訂閱同步、測試通知（僅已登入頁面）
 * 對外：window.TCMPwa
 * ============================================================ */

(function () {
    'use strict';

    var isZh = (function () {
        try {
            var stored = localStorage.getItem('language') || localStorage.getItem('preferredLanguage');
            if (stored) return stored.toLowerCase().indexOf('en') !== 0;
        } catch (_e) {}
        return navigator.language.toLowerCase().indexOf('zh') === 0;
    })();

    var STR = {
        offlineBanner: {
            zh: '目前離線：可瀏覽已快取資料，您的變更會在連線恢復後自動同步。',
            en: 'You are offline. Cached data is available; changes will sync automatically when reconnected.'
        },
        update: {
            zh: '系統有新版本，點此立即更新',
            en: 'A new version is available. Click to update.'
        },
        pushOn: { zh: '推播通知已開啟', en: 'Push notifications enabled' },
        pushOff: { zh: '推播通知已關閉', en: 'Push notifications disabled' },
        pushDenied: {
            zh: '瀏覽器已封鎖通知，請於瀏覽器網站設定中開啟通知權限後再試。',
            en: 'Notifications are blocked. Please allow notifications in your browser site settings.'
        },
        pushUnsupported: {
            zh: '此瀏覽器不支援推播。iPhone 使用者請先用 Safari「分享 → 加入主畫面」安裝本系統（需 iOS 16.4 或以上），再於主畫面開啟並設定通知。',
            en: 'Push is not supported in this browser. On iPhone, install this system to the Home Screen with Safari (iOS 16.4+), then open it from the Home Screen to enable notifications.'
        },
        pushStatusOn: { zh: '已開啟 — 新預診資料將主動推播到此裝置', en: 'Enabled — new pre-consultation inquiries will be pushed to this device.' },
        pushStatusOff: { zh: '未開啟', en: 'Disabled' },
        pushStatusWorking: { zh: '設定中…', en: 'Working…' },
        pushTestSent: { zh: '測試通知已送出，請查看通知', en: 'Test notification sent. Please check your notifications.' },
        pushTestFailed: { zh: '測試通知無法送達，訂閱可能已失效，請重新開啟通知。', en: 'Test notification could not be delivered. The subscription may have expired; please re-enable notifications.' },
        pushFailed: { zh: '通知設定失敗：', en: 'Failed to configure notifications: ' },
        pushLoginNeeded: { zh: '請先登入後再設定通知', en: 'Please log in to configure notifications.' },
        pushNoSubscription: { zh: '此裝置尚未開啟推播訂閱，請先開啟開關。', en: 'This device has no push subscription yet. Please turn on the toggle first.' },
        pushServerKeyInvalid: {
            zh: '伺服器推播金鑰未正確設定（VAPID_PUBLIC_KEY 空白或不完整），請於 Cloudflare Pages 環境變數檢查後重試。',
            en: 'The server push key is missing or invalid (VAPID_PUBLIC_KEY). Please check Cloudflare Pages environment variables and retry.'
        },
        reload: { zh: '重新整理', en: 'Reload' }
    };

    function t(key) {
        var item = STR[key];
        return item ? (isZh ? item.zh : item.en) : key;
    }

    /* ---------- 通用提示（toastr / showToast / 自製浮層） ---------- */

    function message(text, opts) {
        opts = opts || {};
        try {
            if (typeof window.showToast === 'function') {
                window.showToast(text, opts.type || 'info');
                return;
            }
            if (window.toastr) {
                var fn = window.toastr[opts.type || 'info'] || window.toastr.info;
                fn(text);
                return;
            }
        } catch (_e) {}
        var el = document.createElement('div');
        el.textContent = text;
        el.style.cssText =
            'position:fixed;left:16px;right:16px;bottom:16px;z-index:10000;' +
            'background:#1E1E1E;color:#fff;padding:12px 16px;border-radius:12px;' +
            'font-size:14px;line-height:1.5;box-shadow:0 10px 30px rgba(0,0,0,.25)';
        document.body.appendChild(el);
        setTimeout(function () {
            if (el.parentNode) el.parentNode.removeChild(el);
        }, 5000);
    }

    /* ---------- Service Worker 註冊與更新 ---------- */

    var registration = null;
    var refreshing = false;
    var updateConfirmed = false;

    async function registerServiceWorker() {
        if (!('serviceWorker' in navigator)) return;
        try {
            registration = await navigator.serviceWorker.register('/sw.js');
            trackUpdates(registration);
        } catch (err) {
            console.warn('Service Worker 註冊失敗:', err);
        }
    }

    function trackUpdates(reg) {
        reg.addEventListener('updatefound', function () {
            var newWorker = reg.installing;
            if (!newWorker) return;
            newWorker.addEventListener('statechange', function () {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    promptUpdate(newWorker);
                }
            });
        });

        // 頁面載入當下若已有 waiting worker（他頁已下載新版本），直接提示
        if (reg.waiting && navigator.serviceWorker.controller) {
            promptUpdate(reg.waiting);
        }

        // 控制器換代：僅在使用者於本頁確認更新後才自動重整，
        // 避免首次安裝 activate claim 時造成頁面無故重整
        navigator.serviceWorker.addEventListener('controllerchange', function () {
            if (!updateConfirmed || refreshing) return;
            refreshing = true;
            location.reload();
        });
    }

    function promptUpdate(worker) {
        var el = document.createElement('div');
        el.textContent = t('update');
        el.setAttribute('role', 'button');
        el.style.cssText =
            'position:fixed;right:16px;bottom:16px;z-index:10000;cursor:pointer;' +
            'background:linear-gradient(135deg,#D9782B,#B8621F);color:#fff;' +
            'padding:14px 20px;border-radius:14px;font-size:14px;font-weight:600;' +
            'box-shadow:0 14px 30px -10px rgba(184,98,31,.7);max-width:320px';
        el.addEventListener('click', function () {
            updateConfirmed = true;
            worker.postMessage({ type: 'SKIP_WAITING' });
            // controllerchange 後會自動 reload
        });
        document.body.appendChild(el);
    }

    /* ---------- 離線橫幅 ---------- */

    var banner = null;

    function ensureBanner() {
        if (banner) return banner;
        banner = document.createElement('div');
        banner.setAttribute('role', 'status');
        banner.style.cssText =
            'background:linear-gradient(135deg,#D9782B,#8E4E19);color:#fff;' +
            'padding:10px 16px;font-size:13px;line-height:1.5;text-align:center;' +
            'display:none;font-family:inherit;';
        if (document.body) {
            document.body.insertBefore(banner, document.body.firstChild);
        }
        return banner;
    }

    function updateBanner() {
        ensureBanner();
        banner.textContent = t('offlineBanner');
        banner.style.display = navigator.onLine ? 'none' : 'block';
    }

    function initOfflineBanner() {
        window.addEventListener('online', updateBanner);
        window.addEventListener('offline', updateBanner);
        window.addEventListener('firebaseConnectionChanged', function (e) {
            if (e && e.detail && e.detail.connected === false) {
                ensureBanner();
                banner.textContent = t('offlineBanner');
                banner.style.display = 'block';
            } else {
                updateBanner();
            }
        });
        updateBanner();
    }

    /* ---------- 推播 ---------- */

    var ui = {
        toggle: null,
        status: null,
        testButton: null,
        hint: null
    };
    var vapidPublicKeyCached = null;

    function cacheElements() {
        ui.toggle = document.getElementById('pushToggle');
        ui.status = document.getElementById('pushStatus');
        ui.testButton = document.getElementById('pushTestButton');
        ui.hint = document.getElementById('pushUnsupportedHint');
    }

    function currentAuthUser() {
        try {
            var fb = window.firebase;
            return fb && fb.auth && fb.auth.currentUser ? fb.auth.currentUser : null;
        } catch (_e) {
            return null;
        }
    }

    async function apiCall(path, options) {
        var user = currentAuthUser();
        if (!user) throw new Error(t('pushLoginNeeded'));
        var token = await user.getIdToken();
        var opts = options || {};
        var res = await fetch('/api/push' + path, {
            method: opts.method || 'GET',
            headers: Object.assign(
                { 'Authorization': 'Bearer ' + token },
                opts.body ? { 'Content-Type': 'application/json' } : {}
            ),
            body: opts.body || undefined
        });
        var data = null;
        try { data = await res.json(); } catch (_e) {}
        if (!res.ok) {
            var err = new Error((data && data.message) || ('HTTP ' + res.status));
            err.status = res.status;
            throw err;
        }
        return data || {};
    }

    function setStatus(key) {
        if (ui.status) ui.status.textContent = t(key);
    }

    function isPushSupported() {
        return !!(
            window.isSecureContext &&
            'PushManager' in window &&
            'serviceWorker' in navigator &&
            'Notification' in window
        );
    }

    function setToggle(enabled, interactive) {
        if (!ui.toggle) return;
        uiToggleSafe(enabled, interactive);
    }

    function uiToggleSafe(enabled, interactive) {
        if (ui.toggle.tagName === 'INPUT') {
            ui.toggle.checked = !!enabled;
            ui.toggle.disabled = !interactive;
        } else {
            ui.toggle.setAttribute('aria-pressed', enabled ? 'true' : 'false');
            ui.toggle.dataset.state = enabled ? 'on' : 'off';
            ui.toggle.disabled = !interactive;
        }
        if (ui.testButton) ui.testButton.disabled = !enabled;
    }

    async function getVapidConfig() {
        if (vapidPublicKeyCached) return vapidPublicKeyCached;
        var cfg = await apiCall('/config');
        var key = cfg.vapidPublicKey || '';
        // 空白金鑰不寫入快取，修正環境變數後重試可立即重新取得
        if (!key) throw new Error(t('pushServerKeyInvalid'));
        vapidPublicKeyCached = key;
        return vapidPublicKeyCached;
    }

    // 檢查公鑰必須為 65 bytes、0x04 開頭（P-256 uncompressed point）
    function decodeVapidKey(key) {
        var bytes = urlBase64ToUint8Array(key);
        if (bytes.length !== 65 || bytes[0] !== 0x04) {
            console.error('VAPID public key length:', bytes.length);
            throw new Error(t('pushServerKeyInvalid'));
        }
        return bytes;
    }

    function urlBase64ToUint8Array(base64String) {
        var padding = '='.repeat((4 - (base64String.length % 4)) % 4);
        var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        var raw = atob(base64);
        var output = new Uint8Array(raw.length);
        for (var i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
        return output;
    }

    async function enablePush() {
        if (Notification.permission === 'denied') {
            message(t('pushDenied'), { type: 'error' });
            await syncPushState();
            return;
        }
        setStatus('pushStatusWorking');
        setToggle(false, false);
        try {
            var permission = await Notification.requestPermission();
            if (permission !== 'granted') throw new Error('通知權限未取得');

            var vapid = await getVapidConfig();
            var reg = await navigator.serviceWorker.ready;
            var sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: decodeVapidKey(vapid)
            });

            await apiCall('/subscribe', {
                method: 'POST',
                body: JSON.stringify(sub.toJSON())
            });

            setToggle(true, true);
            setStatus('pushStatusOn');
            message(t('pushOn'), { type: 'success' });
        } catch (err) {
            console.error('開啟推播失敗:', err);
            message(t('pushFailed') + (err.message || ''), { type: 'error' });
            setToggle(false, true);
            setStatus('pushStatusOff');
        }
    }

    async function disablePush() {
        setStatus('pushStatusWorking');
        setToggle(true, false);
        try {
            var reg = await navigator.serviceWorker.ready;
            var sub = await reg.pushManager.getSubscription();
            if (sub) {
                var json = sub.toJSON();
                await sub.unsubscribe();
                try {
                    await apiCall('/unsubscribe', {
                        method: 'POST',
                        body: JSON.stringify({ endpoint: json.endpoint })
                    });
                } catch (apiErr) {
                    console.warn('後端移除訂閱失敗:', apiErr);
                }
            }
            setToggle(false, true);
            setStatus('pushStatusOff');
            message(t('pushOff'), { type: 'info' });
        } catch (err) {
            console.error('關閉推播失敗:', err);
            message(t('pushFailed') + (err.message || ''), { type: 'error' });
            setToggle(true, true);
        }
    }

    async function getCurrentEndpoint() {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        return sub ? sub.endpoint : null;
    }

    async function sendTest() {
        try {
            const endpoint = await getCurrentEndpoint();
            if (!endpoint) {
                message(t('pushNoSubscription'), { type: 'warning' });
                return;
            }
            var result = await apiCall('/test', {
                method: 'POST',
                body: JSON.stringify({ endpoint: endpoint })
            });
            if (result.delivered) {
                message(t('pushTestSent'), { type: 'success' });
            } else {
                console.warn('測試通知未送達，伺服器回應：', result);
                const code = result.status ? '（HTTP ' + result.status + '）' : '';
                message(t('pushTestFailed') + code, { type: 'warning' });
                await syncPushState();
            }
        } catch (err) {
            message(t('pushFailed') + (err.message || ''), { type: 'error' });
        }
    }

    async function syncPushState() {
        cacheElements();
        if (!ui.toggle) return;

        if (!isPushSupported()) {
            if (ui.hint) {
                ui.hint.textContent = t('pushUnsupported');
                ui.hint.style.display = 'block';
            }
            setToggle(false, false);
            setStatus('pushStatusOff');
            return;
        }
        if (ui.hint) ui.hint.style.display = 'none';

        if (!currentAuthUser()) {
            setToggle(false, false);
            setStatus('pushStatusOff');
            return;
        }

        try {
            var reg = await navigator.serviceWorker.ready;
            var sub = await reg.pushManager.getSubscription();
            if (sub) {
                // 瀏覽器有訂閱：確保後端記錄存在（冪等 upsert，修復先前失敗的註冊）
                try {
                    await apiCall('/subscribe', {
                        method: 'POST',
                        body: JSON.stringify(sub.toJSON())
                    });
                } catch (_upsertErr) {}
                setToggle(true, true);
                setStatus('pushStatusOn');
            } else {
                setToggle(false, true);
                setStatus('pushStatusOff');
            }
        } catch (err) {
            console.warn('同步推播狀態失敗:', err);
            setToggle(false, true);
        }
    }

    function bindUi() {
        cacheElements();
        if (ui.toggle) {
            ui.toggle.addEventListener('change', function () {
                var on = ui.toggle.tagName === 'INPUT' ? ui.toggle.checked
                    : ui.toggle.getAttribute('aria-pressed') === 'true';
                if (on) enablePush();
                else disablePush();
            });
            ui.toggle.addEventListener('click', function () {
                if (ui.toggle.tagName !== 'INPUT') {
                    var on = ui.toggle.getAttribute('aria-pressed') === 'true';
                    if (on) disablePush();
                    else enablePush();
                }
            });
        }
        if (ui.testButton) ui.testButton.addEventListener('click', sendTest);
    }

    /* ---------- 啟動 ---------- */

    function init() {
        registerServiceWorker();
        initOfflineBanner();
        bindUi();
        syncPushState();

        // 登入／登出後自動同步推播狀態
        try {
            if (window.firebase && window.firebase.auth && window.firebase.onAuthStateChanged) {
                window.firebase.onAuthStateChanged(window.firebase.auth, function () {
                    syncPushState();
                });
            }
        } catch (_e) {}
    }

    window.TCMPwa = {
        init: init,
        syncPushState: syncPushState,
        isPushSupported: isPushSupported
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
