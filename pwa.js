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
        reload: { zh: '重新整理', en: 'Reload' },
        pushClaimOther: {
            zh: '此裝置的推播原屬於另一個帳號，已自動切換為目前帳號。',
            en: 'Push on this device belonged to another account and has been switched to the current account.'
        },
        pushClaimFailed: {
            zh: '此裝置的推播屬於另一個帳號，自動切換失敗，請將推播開關關閉後重新開啟。',
            en: 'Push on this device belongs to another account. Automatic switch failed; please turn the toggle off and on again.'
        }
    };

    function t(key) {
        var item = STR[key];
        return item ? (isZh ? item.zh : item.en) : key;
    }

    /* ---------- 推播事件偏好 ---------- */

    // 事件顯示順序與中英標籤（id 需與後端 events.js 一致）
    var PUSH_EVENT_ITEMS = [
        { id: 'new_inquiry', zh: '新預診資料', en: 'New pre-consultation inquiry' },
        { id: 'appointment_waiting', zh: '病人候診通知（醫師）', en: 'Patient waiting (doctor)' },
        { id: 'appointment_completed', zh: '診症完成通知（護理／管理／助理）', en: 'Consultation completed (nurse/manager/assistant)' },
        { id: 'chat_public', zh: '公開頻道訊息', en: 'Public channel messages' },
        { id: 'chat_private', zh: '私人聊天訊息', en: 'Private chat messages' }
    ];
    var ALL_EVENT_IDS = PUSH_EVENT_ITEMS.map(function (i) { return i.id; });
    var PREFS_KEY = 'pushEventPrefs';

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
            return;
        }
        if (ui.hint) ui.hint.style.display = 'none';

        if (!currentAuthUser()) {
            setToggle(false, false);
            setStatus('pushStatusOff');
            return;
        }

        // 事件偏好勾選項（已訂閱與否皆可設定本機偏好）
        renderEventOptions();

        try {
            var reg = await navigator.serviceWorker.ready;
            var sub = await reg.pushManager.getSubscription();
            if (sub) {
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
        if (!isPushSupported() || !currentAuthUser()) return { skipped: true };
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

    /* ---------- 啟動 ---------- */

    function init() {
        registerServiceWorker();
        initOfflineBanner();
        bindUi();
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
        notify: notifyPushEvent
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
