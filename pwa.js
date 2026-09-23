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
        pushDeniedSiteHowto: {
            zh: '操作方式：點網址列左側的鎖頭／設定圖示 → 網站權限（設定）→ 通知 → 改為「允許」，再重新整理本頁後重試。',
            en: 'How: click the lock/settings icon at the left of the address bar → Site permissions → Notifications → Allow, then reload this page and retry.'
        },
        pushGuideWindows: {
            zh: 'Windows 電腦請另外確認：① Windows「設定 → 系統 → 通知」總開關必須開啟；② 關閉「專注輔助／勿擾模式」與省電模式；③ 不可使用 Edge／Chrome 的 InPrivate（無痕）視窗；④ 公司電腦需確認沒有群組原則封鎖通知。',
            en: 'On Windows also check: (1) Windows Settings → System → Notifications must be ON; (2) turn off Focus assist/Do not disturb and Battery saver; (3) do not use an Edge/Chrome InPrivate window; (4) on work PCs, confirm no group policy blocks notifications.'
        },
        pushGuideMac: {
            zh: 'Mac 請另外確認：「系統設定 → 通知」中瀏覽器的通知已允許，且未開啟「專注模式」。',
            en: 'On Mac also check: System Settings → Notifications allows notifications for your browser, and Focus is off.'
        },
        pushSubscribeBlocked: {
            zh: '瀏覽器拒絕建立推播訂閱，常見原因是作業系統層級的通知被關閉（Windows 上尤其常見），或使用了無痕／InPrivate 視窗。',
            en: 'The browser refused to create the push subscription, usually because OS-level notifications are turned off (common on Windows), or an InPrivate window is in use.'
        },
        pushUnsupported: {
            zh: '此瀏覽器不支援推播。iPhone 使用者請先用 Safari「分享 → 加入主畫面」安裝本系統（需 iOS 16.4 或以上），再於主畫面開啟並設定通知。',
            en: 'Push is not supported in this browser. On iPhone, install this system to the Home Screen with Safari (iOS 16.4+), then open it from the Home Screen to enable notifications.'
        },
        pushStatusOn: { zh: '已開啟 — 通知將主動推播到此裝置', en: 'Enabled — notifications will be pushed to this device.' },
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
        reload: { zh: '重新整理', en: 'Reload' },
        pushClaimOther: {
            zh: '此裝置的推播原屬於另一個帳號，已自動切換為目前帳號。',
            en: 'Push on this device belonged to another account and has been switched to the current account.'
        },
        pushClaimFailed: {
            zh: '此裝置的推播屬於另一個帳號，自動切換失敗，請將推播開關關閉後重新開啟。',
            en: 'Push on this device belongs to another account. Automatic switch failed; please turn the toggle off and on again.'
        },
        enableCardTitle: { zh: '開啟推播通知', en: 'Enable push notifications' },
        enableCardText: {
            zh: '即時接收病人候診、診症完成與聊天訊息，不漏接重要消息。',
            en: 'Get instant alerts for waiting patients, completed consultations and chat messages.'
        },
        enableCardButton: { zh: '立即啟用', en: 'Enable now' },
        pushSettingsHint: {
            zh: '日後想調整推播通知，可至「帳號安全設定」中設置。',
            en: 'To change push notification settings later, go to "Account Security Settings".'
        }
    };

    function t(key) {
        var item = STR[key];
        return item ? (isZh ? item.zh : item.en) : key;
    }

    /* ---------- 推播事件偏好 ---------- */

    // 事件顯示順序與中英標籤（id 需與後端 events.js 一致）
    var PUSH_EVENT_ITEMS = [
        { id: 'appointment_waiting', zh: '病人候診通知（醫師）', en: 'Patient waiting (doctor)' },
        { id: 'appointment_completed', zh: '診症完成通知（護理／管理／助理）', en: 'Consultation completed (nurse/manager/assistant)' },
        { id: 'chat_public', zh: '公開頻道訊息', en: 'Public channel messages' },
        { id: 'chat_private', zh: '私人聊天訊息', en: 'Private chat messages' }
    ];
    var ALL_EVENT_IDS = PUSH_EVENT_ITEMS.map(function (i) { return i.id; });
    var PREFS_KEY = 'pushEventPrefs';

    // 「此裝置推播應保持開啟」標記：
    // 最後一個系統分頁關閉時 SW 會自動退訂（使用者要求關頁後不再收廣播），
    // 重開頁面時依此標記自動恢復訂閱；手動關閉開關或登出時移除。
    var ENABLED_MARKER_KEY = 'pushDeviceEnabled';

    function markPushEnabled() {
        try { localStorage.setItem(ENABLED_MARKER_KEY, '1'); } catch (_e) {}
    }

    function clearPushEnabledMarker() {
        try { localStorage.removeItem(ENABLED_MARKER_KEY); } catch (_e) {}
    }

    function isPushEnabledMarked() {
        try { return localStorage.getItem(ENABLED_MARKER_KEY) === '1'; } catch (_e) { return false; }
    }

    var selectedEvents = loadEventPrefs();

    function loadEventPrefs() {
        try {
            var raw = localStorage.getItem(PREFS_KEY);
            if (raw) {
                var arr = JSON.parse(raw);
                if (Array.isArray(arr)) {
                    return arr.filter(function (e) { return ALL_EVENT_IDS.indexOf(e) !== -1; });
                }
            }
        } catch (_e) {}
        // 首次使用：全選
        return ALL_EVENT_IDS.slice();
    }

    function saveEventPrefs() {
        try { localStorage.setItem(PREFS_KEY, JSON.stringify(selectedEvents)); } catch (_e) {}
    }

    function currentLanguage() { return isZh ? 'zh' : 'en'; }

    /* ---------- 通用提示（toastr / showToast / 自製浮層） ---------- */

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function message(text, opts) {
        opts = opts || {};
        // 多行指引（Windows 檢查清單等）需以 <br> 呈現；內容先做 HTML 跳脫
        var htmlText = escapeHtml(text).replace(/\n/g, '<br>');
        try {
            if (typeof window.showToast === 'function') {
                window.showToast(htmlText, opts.type || 'info');
                return;
            }
            if (window.toastr) {
                var fn = window.toastr[opts.type || 'info'] || window.toastr.info;
                fn(htmlText);
                return;
            }
        } catch (_e) {}
        var el = document.createElement('div');
        el.textContent = text;
        el.style.cssText =
            'position:fixed;left:16px;right:16px;bottom:16px;z-index:10000;' +
            'background:#1E1E1E;color:#fff;padding:12px 16px;border-radius:12px;' +
            'font-size:14px;line-height:1.5;box-shadow:0 10px 30px rgba(0,0,0,.25);' +
            'white-space:pre-line;max-height:60vh;overflow:auto;';
        document.body.appendChild(el);
        setTimeout(function () {
            if (el.parentNode) el.parentNode.removeChild(el);
        }, 8000);
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
        hint: null,
        eventContainer: null
    };
    var vapidPublicKeyCached = null;

    function cacheElements() {
        ui.toggle = document.getElementById('pushToggle');
        ui.status = document.getElementById('pushStatus');
        ui.testButton = document.getElementById('pushTestButton');
        ui.hint = document.getElementById('pushUnsupportedHint');
        ui.eventContainer = document.getElementById('pushEventOptions');
    }

    /* 渲染事件勾選項（雙語；由 JS 產生，HTML 僅需容器） */
    function renderEventOptions() {
        if (!ui.eventContainer || ui.eventContainer.children.length > 0) return;
        PUSH_EVENT_ITEMS.forEach(function (item) {
            var label = document.createElement('label');
            label.className =
                'flex items-start gap-2 text-sm text-amber-900 cursor-pointer select-none py-0.5';
            var input = document.createElement('input');
            input.type = 'checkbox';
            input.value = item.id;
            input.className = 'mt-0.5 h-4 w-4 accent-amber-700';
            input.checked = selectedEvents.indexOf(item.id) !== -1;
            input.addEventListener('change', function () { onEventChanged(item.id, input.checked); });
            var span = document.createElement('span');
            span.textContent = isZh ? item.zh : item.en;
            label.appendChild(input);
            label.appendChild(span);
            ui.eventContainer.appendChild(label);
        });
    }

    function syncEventCheckboxes() {
        if (!ui.eventContainer) return;
        var boxes = ui.eventContainer.querySelectorAll('input[type=checkbox]');
        boxes.forEach(function (box) {
            box.checked = selectedEvents.indexOf(box.value) !== -1;
        });
    }

    // 勾選事件：存偏好；已訂閱者立即同步後端
    async function onEventChanged(eventId, checked) {
        if (checked) {
            if (selectedEvents.indexOf(eventId) === -1) selectedEvents.push(eventId);
        } else {
            selectedEvents = selectedEvents.filter(function (e) { return e !== eventId; });
        }
        saveEventPrefs();
        try {
            var reg = await navigator.serviceWorker.ready;
            var sub = await reg.pushManager.getSubscription();
            if (sub) await pushSubscriptionUpsert(sub);
        } catch (err) {
            console.warn('同步事件偏好失敗:', err);
        }
    }

    // 統一 upsert：帶上事件偏好與語言（所有訂閱同步路徑皆用此函式）
    async function pushSubscriptionUpsert(sub) {
        return apiCall('/subscribe', {
            method: 'POST',
            body: JSON.stringify(Object.assign({}, sub.toJSON(), {
                events: selectedEvents,
                language: currentLanguage()
            }))
        });
    }

    function currentAuthUser() {
        try {
            var fb = window.firebase;
            return fb && fb.auth && fb.auth.currentUser ? fb.auth.currentUser : null;
        } catch (_e) {
            return null;
        }
    }

    // 職員「已登入」以系統自身的登入閘門為準：
    // system.html 在 Firebase 工作階段恢復時，#loginPage 可能仍顯示（需待 performLogin），
    // 故不能只看 firebase.auth.currentUser，否則卡片會在登入頁就出現。
    function isStaffLoggedIn() {
        var loginPage = document.getElementById('loginPage');
        if (loginPage) return loginPage.classList.contains('hidden');
        // 無獨立登入頁的頁面（clinic／inquiry 等）：退回以 Firebase Auth 為準
        return !!currentAuthUser();
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

    /* 作業系統／瀏覽器偵測：訂閱失敗時給出對應的修復指引 */
    function isWindowsOS() {
        try {
            if (navigator.userAgentData && navigator.userAgentData.platform) {
                return /windows/i.test(navigator.userAgentData.platform);
            }
        } catch (_e) {}
        return /Windows/i.test(navigator.userAgent || '');
    }

    function isMacOS() {
        try {
            if (navigator.userAgentData && navigator.userAgentData.platform) {
                return /mac/i.test(navigator.userAgentData.platform);
            }
        } catch (_e) {}
        return /Macintosh|Mac OS X/i.test(navigator.userAgent || '');
    }

    function osNotifyGuide() {
        if (isWindowsOS()) return t('pushGuideWindows');
        if (isMacOS()) return t('pushGuideMac');
        return '';
    }

    // 將訂閱階段的各種例外轉為可行動的修復提示
    function describeSubscribeError(err) {
        var name = err && err.name ? String(err.name) : '';
        var msg = err && err.message ? String(err.message) : '';
        var lines = [];
        if (name === 'NotSupportedError') {
            // InPrivate／無痕視窗、或瀏覽器在此環境關閉推送能力
            lines.push(t('pushSubscribeBlocked'));
        } else if (name === 'AbortError' || /permission|denied|blocked|subscribe/i.test(msg)) {
            // Windows 關閉系統通知時，Edge/Chrome 常以 AbortError 失敗
            lines.push(t('pushSubscribeBlocked'));
        } else if (msg) {
            lines.push(msg);
        }
        lines.push(t('pushDeniedSiteHowto'));
        var osGuide = osNotifyGuide();
        if (osGuide) lines.push(osGuide);
        return lines.join('\n');
    }

    async function enablePush() {
        if (Notification.permission === 'denied') {
            message(
                t('pushDenied') + '\n' + t('pushDeniedSiteHowto')
                + (osNotifyGuide() ? '\n' + osNotifyGuide() : ''),
                { type: 'error' }
            );
            await syncPushState();
            return;
        }
        setStatus('pushStatusWorking');
        setToggle(false, false);
        try {
            var permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                const e = new Error('通知權限未取得');
                e.name = 'PermissionNotGranted';
                throw e;
            }

            var vapid = await getVapidConfig();
            var reg = await navigator.serviceWorker.ready;

            // 先清除既有訂閱，再建立全新訂閱：
            // 確保訂閱綁定的 VAPID 金鑰與伺服器目前金鑰完全一致
            // （Apple 端兩者不符會回 403 VapidPkHashMismatch）
            var oldSub = await reg.pushManager.getSubscription();
            if (oldSub) {
                var oldEndpoint = oldSub.endpoint;
                try { await oldSub.unsubscribe(); } catch (_unsubErr) {}
                try {
                    await apiCall('/unsubscribe', {
                        method: 'POST',
                        body: JSON.stringify({ endpoint: oldEndpoint })
                    });
                } catch (_apiErr) {}
            }

            var sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: decodeVapidKey(vapid)
            });

            await pushSubscriptionUpsert(sub);

            markPushEnabled();
            setToggle(true, true);
            setStatus('pushStatusOn');
            message(t('pushOn') + (isZh ? '。' : '. ') + t('pushSettingsHint'), { type: 'success' });
        } catch (err) {
            console.error('開啟推播失敗:', err);
            // 權限被拒（含 Windows 系統通知關閉導致請求被自動否決）：
            // 顯示網站權限重設步驟＋作業系統檢查清單
            if (err && (err.name === 'PermissionNotGranted'
                || /通知權限未取得|permission/i.test(err.message || ''))) {
                message(
                    t('pushDenied') + '\n' + t('pushDeniedSiteHowto')
                    + (osNotifyGuide() ? '\n' + osNotifyGuide() : ''),
                    { type: 'error' }
                );
            } else {
                message(t('pushFailed') + '\n' + describeSubscribeError(err), { type: 'error' });
            }
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
            // 手動關閉：移除標記，爾後重開頁面不再自動恢復
            clearPushEnabledMarker();
            setToggle(false, true);
            setStatus('pushStatusOff');
            message(t('pushOff') + (isZh ? '。' : '. ') + t('pushSettingsHint'), { type: 'info' });
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

    // 解析推送服務回應本文中的 reason（Apple 回 {"reason":"BadJwtToken"}）
    function extractReason(raw) {
        if (!raw) return '';
        if (typeof raw === 'object') return raw.reason || raw.error || '';
        try {
            const parsed = JSON.parse(raw);
            return (parsed && (parsed.reason || parsed.error)) || String(raw);
        } catch (_e) {
            return String(raw).slice(0, 120);
        }
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
                // 直接把推送服務（Apple）的 reason 顯示在畫面，免接電腦查 console
                const reason = extractReason(result.reason);
                const detail = reason ? code + ' [' + reason + ']' : code;
                message(t('pushTestFailed') + detail, { type: 'warning' });
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
            hideEnableCard();
            return;
        }
        if (ui.hint) ui.hint.style.display = 'none';

        if (!isStaffLoggedIn()) {
            setToggle(false, false);
            setStatus('pushStatusOff');
            hideEnableCard();
            return;
        }

        // 事件偏好勾選項（已訂閱與否皆可設定本機偏好）
        renderEventOptions();

        try {
            var reg = await navigator.serviceWorker.ready;
            var sub = await reg.pushManager.getSubscription();
            if (sub) {
                hideEnableCard();
                // 先以後端記錄為準同步事件偏好（跨裝置變更可反映至本機）
                var belongsToOther = false;
                try {
                    var remote = await apiCall(
                        '/subscription?endpoint=' + encodeURIComponent(sub.endpoint)
                    );
                    if (remote && Array.isArray(remote.events)) {
                        selectedEvents = remote.events.filter(function (e) {
                            return ALL_EVENT_IDS.indexOf(e) !== -1;
                        });
                        saveEventPrefs();
                        syncEventCheckboxes();
                    }
                } catch (remoteErr) {
                    // 403＝此瀏覽器訂閱屬於另一位使用者（共用裝置切換帳號）
                    if (remoteErr && Number(remoteErr.status) === 403) {
                        belongsToOther = true;
                    }
                }

                if (belongsToOther) {
                    await claimDeviceSubscription(sub);
                    return;
                }

                // 瀏覽器有訂閱：確保後端記錄存在且帶上當前偏好（冪等 upsert，修復先前失敗的註冊）
                try {
                    await pushSubscriptionUpsert(sub);
                } catch (upsertErr) {
                    // 雙重保險：GET 非 403 但 upsert 因擁有者衝突回 409 時同樣接管
                    if (upsertErr && Number(upsertErr.status) === 409) {
                        await claimDeviceSubscription(sub);
                        return;
                    }
                }
                // 既有訂閱（含先前版本使用者）補寫啟用標記，供關頁後重開自動恢復
                markPushEnabled();
                setToggle(true, true);
                setStatus('pushStatusOn');
            } else if (isPushEnabledMarked() && Notification.permission === 'granted') {
                // 最後一個分頁關閉時 SW 已自動退訂；標記仍在＝使用者希望保持開啟，
                // 靜默恢復訂閱（不彈任何權限提示）
                restorePushSubscription();
            } else {
                setToggle(false, true);
                setStatus('pushStatusOff');
                maybeShowEnableCard();
            }
        } catch (err) {
            console.warn('同步推播狀態失敗:', err);
            setToggle(false, true);
        }
    }

    // 防止重入：關頁後重開時的靜默恢復
    var restoringPush = false;

    /**
     * 靜默重新建立推播訂閱（分頁關閉期間 SW 已退訂，重開頁面自動恢復）。
     * 不彈任何提示；失敗則清除標記並回到未開啟狀態，避免每次載入重試循環。
     */
    async function restorePushSubscription() {
        if (restoringPush) return;
        restoringPush = true;
        setStatus('pushStatusWorking');
        setToggle(false, false);
        try {
            var vapid = await getVapidConfig();
            var reg = await navigator.serviceWorker.ready;
            var sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: decodeVapidKey(vapid)
            });
            await pushSubscriptionUpsert(sub);
            markPushEnabled();
            setToggle(true, true);
            setStatus('pushStatusOn');
            postClientOpenToSW();
        } catch (err) {
            console.warn('自動恢復推播訂閱失敗:', err);
            clearPushEnabledMarker();
            setToggle(false, true);
            setStatus('pushStatusOff');
        } finally {
            restoringPush = false;
        }
    }

    /**
     * 登出專用：在 firebase.signOut() 之前（ID token 仍有效）移除本裝置訂閱。
     * 同時取消 SW 可能正在等待的「最後分頁關閉」退訂計時。
     * 任何失敗都不可阻斷登出流程。
     */
    async function teardownPushOnLogout() {
        try {
            if (!('serviceWorker' in navigator)) return;
            var reg = await navigator.serviceWorker.ready;
            var sub = null;
            try { sub = await reg.pushManager.getSubscription(); } catch (_e) {}
            if (sub) {
                var endpoint = sub.endpoint;
                // 後端刪除需帶登入 token，必須在 signOut() 前完成
                try {
                    await apiCall('/unsubscribe', {
                        method: 'POST',
                        body: JSON.stringify({ endpoint: endpoint })
                    });
                } catch (apiErr) {
                    console.warn('登出時後端移除推播訂閱失敗:', apiErr);
                }
                try { await sub.unsubscribe(); } catch (_unsubErr) {}
            }
            clearPushEnabledMarker();
            try {
                if (reg.active) reg.active.postMessage({ type: 'TCM_LOGGED_OUT' });
            } catch (_msgErr) {}
            setToggle(false, true);
            setStatus('pushStatusOff');
            hideEnableCard();
        } catch (err) {
            // 即使失敗也要移除標記：登出後不應自動恢復前一使用者的訂閱
            console.warn('登出移除推播訂閱失敗:', err);
            clearPushEnabledMarker();
        }
    }

    // 防止 init 與 onAuthStateChanged 近乎同時觸發造成重複接管
    var claimingDevice = false;

    /**
     * 目前瀏覽器訂閱屬於另一位使用者（共用裝置切換帳號）時：
     * 解除舊訂閱 → 以目前帳號重新建立 → 登記為本人。
     * 通知權限為瀏覽器層級（已授予），不需再詢問。
     */
    async function claimDeviceSubscription(oldSub) {
        if (claimingDevice) return;
        claimingDevice = true;
        try {
            setStatus('pushStatusWorking');
            setToggle(false, false);

            var oldEndpoint = oldSub.endpoint;
            try {
                await oldSub.unsubscribe();
            } catch (_unsubErr) {}
            // 舊記錄屬於他人，後端會回 403：不影響接管。
            // 新訂閱為全新 endpoint；舊記錄爾後發送會收到 404/410，由 sender 自動清除。
            try {
                await apiCall('/unsubscribe', {
                    method: 'POST',
                    body: JSON.stringify({ endpoint: oldEndpoint })
                });
            } catch (_apiErr) {}

            var vapid = await getVapidConfig();
            var reg = await navigator.serviceWorker.ready;
            var newSub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: decodeVapidKey(vapid)
            });
            await pushSubscriptionUpsert(newSub);

            markPushEnabled();
            setToggle(true, true);
            setStatus('pushStatusOn');
            message(t('pushClaimOther'), { type: 'info' });
        } catch (err) {
            console.warn('接管裝置推播失敗:', err);
            setToggle(false, true);
            setStatus('pushStatusOff');
            message(t('pushClaimFailed'), { type: 'warning' });
        } finally {
            claimingDevice = false;
        }
    }

    /* ---------- 站內一鍵啟用卡片（登入後、未訂閱時顯示） ---------- */

    var ENABLE_CARD_DISMISS_KEY = 'pushEnableCardDismissed';
    var enableCard = null;

    function isEnableCardDismissed() {
        try { return localStorage.getItem(ENABLE_CARD_DISMISS_KEY) === '1'; } catch (_e) { return false; }
    }

    function buildEnableCard() {
        if (enableCard) return enableCard;
        var card = document.createElement('div');
        card.setAttribute('role', 'dialog');
        card.setAttribute('aria-label', t('enableCardTitle'));
        card.style.cssText =
            'position:fixed;left:16px;right:16px;bottom:16px;z-index:9999;' +
            'max-width:400px;margin:0 auto;' +
            'background:#fff;border-radius:16px;padding:16px 16px 14px;' +
            'box-shadow:0 12px 40px rgba(30,30,30,.18);' +
            'border:1px solid rgba(217,120,43,.18);' +
            'display:none;transform:translateY(12px);opacity:0;' +
            'transition:transform .25s ease,opacity .25s ease;';

        var row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:flex-start;gap:12px;';

        var icon = document.createElement('div');
        icon.textContent = '🔔';
        icon.style.cssText =
            'flex:0 0 auto;width:40px;height:40px;border-radius:12px;' +
            'background:rgba(217,120,43,.1);display:flex;align-items:center;' +
            'justify-content:center;font-size:20px;';

        var bodyBox = document.createElement('div');
        bodyBox.style.cssText = 'flex:1 1 auto;min-width:0;';

        var title = document.createElement('div');
        title.className = 'font-serif';
        title.textContent = t('enableCardTitle');
        title.style.cssText = 'font-weight:700;font-size:15px;color:#1E1E1E;margin-bottom:2px;';

        var desc = document.createElement('div');
        desc.textContent = t('enableCardText');
        desc.style.cssText = 'font-size:13px;line-height:1.5;color:#666;';

        var closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.setAttribute('aria-label', 'Close');
        closeBtn.innerHTML = '&times;';
        closeBtn.style.cssText =
            'flex:0 0 auto;border:0;background:transparent;font-size:18px;line-height:1;' +
            'color:#999;cursor:pointer;padding:2px 4px;';
        closeBtn.addEventListener('click', dismissEnableCard);

        bodyBox.appendChild(title);
        bodyBox.appendChild(desc);
        row.appendChild(icon);
        row.appendChild(bodyBox);
        row.appendChild(closeBtn);

        var actions = document.createElement('div');
        actions.style.cssText = 'margin-top:12px;display:flex;justify-content:flex-end;';

        var enableBtn = document.createElement('button');
        enableBtn.type = 'button';
        enableBtn.textContent = t('enableCardButton');
        enableBtn.style.cssText =
            'border:0;cursor:pointer;border-radius:10px;padding:9px 18px;' +
            'font-size:14px;font-weight:600;color:#fff;background:#D9782B;' +
            'box-shadow:0 4px 12px rgba(217,120,43,.3);';
        enableBtn.addEventListener('click', onEnableCardClick);
        actions.appendChild(enableBtn);

        card.appendChild(row);
        card.appendChild(actions);
        document.body.appendChild(card);
        enableCard = card;
        return card;
    }

    function showEnableCard() {
        if (isEnableCardDismissed()) return;
        var card = buildEnableCard();
        card.style.display = 'block';
        // 強制重排後再加上進場動畫
        void card.offsetWidth;
        card.style.transform = 'translateY(0)';
        card.style.opacity = '1';
    }

    function hideEnableCard() {
        if (!enableCard) return;
        enableCard.style.display = 'none';
        enableCard.style.transform = 'translateY(12px)';
        enableCard.style.opacity = '0';
    }

    // 使用者主動關閉：記住選擇，爾後不再自動顯示
    function dismissEnableCard() {
        try { localStorage.setItem(ENABLE_CARD_DISMISS_KEY, '1'); } catch (_e) {}
        hideEnableCard();
    }

    // 點擊「立即啟用」：在使用者手勢內請求權限（iPhone 硬性要求）
    async function onEnableCardClick() {
        await enablePush();
        try {
            var reg = await navigator.serviceWorker.ready;
            var sub = await reg.pushManager.getSubscription();
            if (sub) hideEnableCard();
        } catch (_e) {}
    }

    // 職員已登入（系統閘門）、無訂閱、權限尚未決定時才顯示
    function maybeShowEnableCard() {
        if (!isPushSupported() || !isStaffLoggedIn() || !currentAuthUser()
            || Notification.permission !== 'default') {
            hideEnableCard();
            return;
        }
        navigator.serviceWorker.ready.then(function (reg) {
            return reg.pushManager.getSubscription();
        }).then(function (sub) {
            if (!sub && isStaffLoggedIn() && currentAuthUser()
                && Notification.permission === 'default') {
                showEnableCard();
            } else {
                hideEnableCard();
            }
        }).catch(function () { hideEnableCard(); });
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

    // 系統各模組（掛號／聊天）觸發推播：失敗僅警告，不影響主流程
    async function notifyPushEvent(payload) {
        if (!payload || typeof payload !== 'object') return { skipped: true };
        // 注意：此處不可檢查 isPushSupported()。
        // 此呼叫是請後端通知「他人的裝置」，與發送者本機能否收推播無關：
        // iPhone 直接用 Safari（未加入主畫面）時 PushManager 不存在、本機不能收，
        // 但仍必須觸發 /notify，否則電腦同事永遠收不到 iPhone 發出的訊息廣播。
        if (!currentAuthUser()) return { skipped: true };
        try {
            return await apiCall('/notify', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
        } catch (err) {
            console.warn('觸發推播失敗:', err);
            return { skipped: true, error: err && err.message };
        }
    }

    // 依深層網址開啟聊天（?chat=open&c=public 或 &u=recipientUid）
    function openChatFromUrl(url) {
        try {
            var parsed = new URL(url, window.location.origin);
            var params = parsed.searchParams;
            if (params.get('chat') !== 'open') return;
            var opts = {};
            var c = params.get('c');
            var u = params.get('u');
            if (c) opts.c = c;
            if (u) opts.u = u;
            if (!opts.c && !opts.u) return;

            // ChatModule 存在但可能尚未 initChat：輪詢等待；無 ChatModule 的頁面提早放棄
            var attempts = 0;
            var timer = setInterval(function () {
                attempts++;
                var cm = window.ChatModule;
                if (cm && typeof cm.openChat === 'function' && cm.openChat(opts)) {
                    clearInterval(timer);
                } else if (!cm && attempts >= 5) {
                    clearInterval(timer);
                } else if (attempts > 40) {
                    clearInterval(timer);
                }
            }, 500);
        } catch (_e) {}
    }

    // 頁面載入時的深層連結（推播開新分頁場景）
    function handleChatDeepLink() {
        openChatFromUrl(window.location.href);
    }

    // 已開啟分頁被聚焦時，SW 以 postMessage 傳入目標網址
    function listenDeepLinkMessages() {
        try {
            navigator.serviceWorker.addEventListener('message', function (event) {
                var data = event.data;
                if (data && data.type === 'tcm-deep-link' && data.url) {
                    openChatFromUrl(data.url);
                }
            });
        } catch (_e) {}
    }

    // 監聽 #loginPage 顯示狀態：performLogin 隱藏（登入完成）或登出時重新顯示，
    // 隨即同步推播狀態，使卡片只在真正登入後出現、登出時立即收起。
    function observeLoginGate() {
        var loginPage = document.getElementById('loginPage');
        if (!loginPage) return;
        try {
            new MutationObserver(function () { syncPushState(); })
                .observe(loginPage, { attributes: true, attributeFilter: ['class'] });
        } catch (_e) {}
    }

    /* ---------- 分頁開關生命週期：最後一個分頁關閉即退訂 ---------- */

    // 通知 SW「本分頁仍開著」：取消它可能正在等待的關頁退訂計時。
    // 頁面剛載入、從 bfcache 恢復、SW 換代控制本分頁時都要告知。
    function postClientOpenToSW() {
        postToSW({ type: 'TCM_CLIENT_OPEN' });
    }

    function postToSW(msg) {
        try {
            var ctrl = navigator.serviceWorker.controller;
            if (ctrl) {
                ctrl.postMessage(msg);
                return;
            }
            // 首次安裝時尚無 controller：等 ready 後再送
            navigator.serviceWorker.ready.then(function (reg) {
                if (reg.active) reg.active.postMessage(msg);
            }).catch(function () {});
        } catch (_e) {}
    }

    function bindClientLifecycle() {
        if (!('serviceWorker' in navigator)) return;

        // 真正關閉分頁／視窗／結束瀏覽器時才觸發；
        // 僅切到背景或鎖屏（手機常見）不觸發，否則 iPhone PWA 背景推播會失效。
        window.addEventListener('pagehide', function (event) {
            if (event.persisted) return; // 進入 bfcache：分頁仍活著
            postToSW({ type: 'TCM_CLIENT_CLOSING' });
        });

        window.addEventListener('pageshow', function (event) {
            postClientOpenToSW();
            if (event.persisted) syncPushState(); // 從 bfcache 恢復
        });

        // SW 更新換代控制本分頁時，新 SW 不知道本分頁存在，主動告知
        navigator.serviceWorker.addEventListener('controllerchange', function () {
            postClientOpenToSW();
        });

        postClientOpenToSW();
    }

    /* ---------- 啟動 ---------- */

    function init() {
        registerServiceWorker();
        initOfflineBanner();
        bindUi();
        observeLoginGate();
        bindClientLifecycle();
        syncPushState();
        handleChatDeepLink();
        listenDeepLinkMessages();

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
        isPushSupported: isPushSupported,
        notify: notifyPushEvent,
        teardownPushOnLogout: teardownPushOnLogout
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
