/* ============================================================
 * Agora 視訊診症整合（Agora Web UI Kit）
 * ------------------------------------------------------------
 * 依賴：
 *   - agora-uikit.js（Agora Web UI Kit，提供 <agora-react-web-uikit>）
 *   - agora-config.js（App ID、Token 伺服器設定）
 *   - system.js 的診症狀態（currentConsultingAppointmentId / appointments）
 *
 * 運作方式：
 *   醫師在診症表單點擊「視訊診症」→ 以「前綴 + 掛號編號」作為
 *   Agora 頻道開啟視訊；病人端使用同一頻道名稱即可加入。
 * ============================================================ */

(function () {
    'use strict';

    var UIKIT_TAG = 'agora-react-web-uikit';
    var uikitInstance = null;

    function getConfig() {
        return window.AGORA_CONFIG || {};
    }

    function notify(message, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type || 'info');
        } else {
            console.log('[視訊診症]', message);
        }
    }

    // 安全讀取 system.js 中的當前診症掛號（頂層全域變數）
    function getCurrentAppointment() {
        var id = null;
        try {
            if (typeof currentConsultingAppointmentId !== 'undefined') {
                id = currentConsultingAppointmentId;
            }
        } catch (e) { id = null; }

        var list = null;
        try {
            if (typeof appointments !== 'undefined' && Array.isArray(appointments)) {
                list = appointments;
            }
        } catch (e) { list = null; }

        if (!id || !list) return null;
        for (var i = 0; i < list.length; i++) {
            if (list[i] && String(list[i].id) === String(id)) return list[i];
        }
        return null;
    }

    // Agora 頻道名稱只接受 ASCII，長度 ≤ 64
    function buildChannelName(appointment) {
        var prefix = getConfig().CHANNEL_PREFIX || 'tcm-consult-';
        var raw = String(prefix) + String(appointment.id);
        var safe = raw.replace(/[^a-zA-Z0-9!#$%&()+\-:;<=>?@[\]^_{|}~]/g, '-');
        return safe.substring(0, 64);
    }

    async function resolvePatientName(appointment) {
        if (!appointment) return '';
        if (appointment.patientName) return appointment.patientName;
        if (appointment.patient && appointment.patient.name) return appointment.patient.name;

        if (appointment.patientId && typeof window.getPatientByIdWithRefresh === 'function') {
            try {
                var patient = await window.getPatientByIdWithRefresh(appointment.patientId);
                if (patient && patient.name) return patient.name;
            } catch (e) { /* 忽略，退回首用頻道顯示 */ }
        }
        return '';
    }

    function getDoctorName() {
        try {
            if (typeof currentUserData !== 'undefined' && currentUserData && currentUserData.username) {
                return currentUserData.username;
            }
            if (typeof currentUser !== 'undefined' && currentUser) return String(currentUser);
        } catch (e) { /* ignore */ }
        return '';
    }

    function showSetupGuide() {
        var message = '請先在 agora-config.js 填入 Agora App ID（測試模式），重新整理後再試。';
        if (window.Swal) {
            window.Swal.fire({
                icon: 'info',
                title: '尚未設置視訊診症',
                html: '請打開 <b>agora-config.js</b>，把 Agora Console 取得的 <b>App ID</b> 填入 <code>APP_ID</code> 後重新整理頁面。<br><br>正式環境請再設定 <code>TOKEN_URL</code>（Cloudflare Pages Function）。',
                confirmButtonText: '我知道了'
            });
        } else {
            notify(message, 'error');
        }
    }

    function destroyUiKit() {
        var stage = document.getElementById('videoConsultStage');
        if (!stage) return;
        var el = stage.querySelector(UIKIT_TAG);
        if (el) {
            // 觸發 UIKit 離開頻道、釋放鏡頭與麥克風，再移除元件
            try { el.callActive = false; } catch (e) { /* ignore */ }
            try { el.removeEventListener('agoraUIKitEndcall', window.closeVideoConsultation); } catch (e) { /* ignore */ }
        }
        uikitInstance = null;
        stage.innerHTML = '';
    }

    function createUiKit(channel) {
        var cfg = getConfig();
        var stage = document.getElementById('videoConsultStage');
        if (!stage) return;

        destroyUiKit();

        var el = document.createElement(UIKIT_TAG);
        el.style.width = '100%';
        el.style.height = '100%';
        el.style.display = 'flex';

        // Direflow 元件在首次掛載時從 HTML attributes 讀取 props：
        // 空字串→true、"true"/"false"→布林、"0"→數字，其餘視為字串。
        // （屬性名在 HTML 文件中不分大小寫）
        el.setAttribute('appid', cfg.APP_ID);
        el.setAttribute('channel', channel);
        el.setAttribute('uid', '0');        // 0 = 由 Agora 分配 UID；Token 同樣以 uid 0 簽發
        el.setAttribute('role', 'host');    // 醫師以主播身分加入（可收發影像聲音）
        el.setAttribute('layout', '0');     // 0 = 九宮格佈局
        el.setAttribute('callactive', 'true');
        el.setAttribute('enableaudio', 'true');
        el.setAttribute('enablevideo', 'true');
        el.setAttribute('activespeaker', 'true');
        el.setAttribute('disablertm', 'true'); // 停用 RTM，診症只需音訊／視訊

        // TOKEN_URL 留空＝測試模式（不帶 token 屬性，UIKit 預設即為 null）
        if (cfg.TOKEN_URL) {
            // 移除網址結尾的斜線，UIKit 會自行在後方加上 /rtc/... 路徑
            el.setAttribute('tokenurl', String(cfg.TOKEN_URL).replace(/\/+$/, ''));
        }

        el.addEventListener('agoraUIKitEndcall', window.closeVideoConsultation);

        stage.appendChild(el);
        uikitInstance = el;
    }

    window.openVideoConsultation = async function () {
        try {
            var cfg = getConfig();
            if (!cfg.APP_ID) {
                showSetupGuide();
                return;
            }

            if (!window.customElements || !window.customElements.get(UIKIT_TAG)) {
                notify('視訊元件尚未載入，請確認 agora-uikit.js 已成功引入', 'error');
                return;
            }

            var appointment = getCurrentAppointment();
            if (!appointment) {
                notify('請先開始或進入一筆掛號診症，再開啟視訊診症', 'error');
                return;
            }

            var channel = buildChannelName(appointment);
            var patientName = await resolvePatientName(appointment);
            var doctorName = getDoctorName();

            var modal = document.getElementById('videoConsultModal');
            var subtitle = document.getElementById('videoConsultSubtitle');
            var status = document.getElementById('videoConsultStatus');

            if (subtitle) {
                subtitle.textContent = (patientName ? ('病人：' + patientName + '　') : '') +
                    '頻道：' + channel +
                    (doctorName ? ('　醫師：' + doctorName) : '');
            }
            if (status) {
                status.textContent = cfg.TOKEN_URL ? 'Token 認證模式' : '測試模式（無 Token）';
            }

            modal.classList.remove('hidden');

            createUiKit(channel);
        } catch (error) {
            console.error('開啟視訊診症失敗:', error);
            notify('開啟視訊診症失敗：' + (error && error.message ? error.message : error), 'error');
        }
    };

    window.closeVideoConsultation = function () {
        var modal = document.getElementById('videoConsultModal');
        try {
            destroyUiKit();
        } catch (error) {
            console.error('關閉視訊診症失敗:', error);
        }
        if (modal) modal.classList.add('hidden');
    };
})();
