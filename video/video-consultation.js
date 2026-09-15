/* ============================================================
 * Agora 視訊診症整合（RTC SDK 原生 API 自建介面）— 醫師端
 * ------------------------------------------------------------
 * 依賴（視訊相關檔案統一放在 video/ 資料夾）：
 *   - video/agora-rtc-sdk.js（Agora RTC SDK 4.x，全域 AgoraRTC）
 *   - video/agora-call.js（自建通話介面與邏輯，全域 AgoraCall）
 *   - video/agora-config.js（App ID、Token 伺服器設定）
 *   - system.js 的診症狀態（currentConsultingAppointmentId / appointments）
 *
 * 版面：點擊「視訊診症」後不再彈出全螢幕視窗，改為診症記錄在左、
 *       視訊診間在右的左右分屏（手機為上下排列）。
 * ============================================================ */

(function () {
    'use strict';

    var callController = null;

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

    // 病人端診間頁面網址（video/room.html?apt=<掛號編號>）
    function buildRoomUrl(appointmentId) {
        var url = new URL('video/room.html', window.location.href);
        url.searchParams.set('apt', String(appointmentId));
        return url.href;
    }

    // Agora 頻道名稱只接受 ASCII，長度 ≤ 64
    function buildChannelName(appointment) {
        var prefix = getConfig().CHANNEL_PREFIX || 'tcm-consult-';
        var raw = String(prefix) + String(appointment.id);
        var safe = raw.replace(/[^a-zA-Z0-9!#$%&()+\-:;<=>?@[\]^_{|}~]/g, '-');
        return safe.substring(0, 64);
    }

    function resolvePatientName(appointment) {
        if (appointment.patientName) return appointment.patientName;
        var patientId = appointment.patientId || appointment.patient_id;
        if (patientId && typeof window.getPatientByIdWithRefresh === 'function') {
            return Promise.resolve(window.getPatientByIdWithRefresh(patientId)).then(function (patient) {
                return (patient && (patient.name || patient.patientName)) || '';
            }).catch(function () { return ''; });
        }
        return '';
    }

    // 醫師顯示名：用戶全名 + 醫師（例如「陳大文醫師」），無全名則退回登入帳號
    function getDoctorName() {
        try {
            if (typeof currentUserData !== 'undefined' && currentUserData) {
                var raw = String(
                    currentUserData.name ||
                    currentUserData.fullName ||
                    currentUserData.username ||
                    ''
                ).trim();
                if (raw) return /醫師$/.test(raw) ? raw : raw + '醫師';
            }
        } catch (e) { /* ignore */ }
        return '醫師';
    }

    function showSetupGuide() {
        var message = '請先在 video/agora-config.js 填入 Agora App ID（測試模式），重新整理後再試。';
        if (window.Swal) {
            window.Swal.fire({
                icon: 'info',
                title: '尚未設置視訊診症',
                html: '請打開 <b>video/agora-config.js</b>，把 Agora Console 取得的 <b>App ID</b> 填入 <code>APP_ID</code> 後重新整理頁面。<br><br>正式環境請再設定 <code>TOKEN_URL</code>（Cloudflare Pages Function）。',
                confirmButtonText: '我知道了'
            });
        } else {
            notify(message, 'error');
        }
    }

    // 面板標題列右側的狀態文字：連線中 → 等待病人 → ✅ 成功連接
    function setPanelStatus(kind, text) {
        var el = document.getElementById('videoConsultStatus');
        if (!el) return;
        var label = '';
        var color = '';
        if (kind === 'connected') {
            var match = String(text || '').match(/(\d+)\s*人/);
            label = '✅ 成功連接' + (match ? '（通話中 ' + match[1] + ' 人）' : '');
            color = '#16a34a';
        } else if (kind === 'waiting') {
            label = '已就緒，等待病人加入…';
        } else if (kind === 'error') {
            label = '連線失敗';
            color = '#dc2626';
        } else if (kind === 'left') {
            label = '已離開診間';
        } else {
            label = text || '連線中…';
        }
        el.textContent = label;
        el.style.color = color;
    }

    function createCall(channel, patientName, doctorName, roomUrl) {
        var cfg = getConfig();
        var stage = document.getElementById('videoConsultStage');
        if (!stage) return;

        callController = window.AgoraCall.create(stage, {
            appId: cfg.APP_ID,
            channel: channel,
            tokenUrl: cfg.TOKEN_URL || '',
            localName: doctorName || '醫師',
            remoteName: patientName || '病人',
            roomUrl: roomUrl,
            waitingText: '已就緒，等待病人加入…',
            onStatus: function (kind, text) {
                setPanelStatus(kind, text);
            },
            onNotify: function (message, type) {
                notify(message, type);
            },
            onError: function (message) {
                notify(message, 'error');
            },
            onLeft: function () {
                // 醫師按下掛斷鈕 → 收起右側面板（SDK 已 leave）
                window.closeVideoConsultation(true);
            }
        });

        callController.join().catch(function () {
            // 錯誤已透過 onError 提示；面板保持開啟以便醫師重試或關閉
        });
    }

    function showPanel() {
        var workspace = document.getElementById('consultationWorkspace');
        var panel = document.getElementById('videoConsultPanel');
        if (workspace) workspace.classList.add('vc-active');
        if (panel) {
            panel.classList.remove('hidden');
            // 手機直向排列時，自動捲到視訊面板；桌面因左右同列，位置幾乎不變
            try { panel.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { /* ignore */ }
        }
    }

    window.openVideoConsultation = async function () {
        try {
            var cfg = getConfig();
            if (!cfg.APP_ID) {
                showSetupGuide();
                return;
            }

            if (!window.AgoraRTC || !window.AgoraCall) {
                notify('視訊元件尚未載入，請確認 video/agora-rtc-sdk.js 與 video/agora-call.js 已成功引入', 'error');
                return;
            }

            var appointment = getCurrentAppointment();
            if (!appointment) {
                notify('請先開始或進入一筆掛號診症，再開啟視訊診症', 'error');
                return;
            }

            // 已在通訊中：重複點擊只捲動到右側面板，不重複建立
            if (callController) {
                showPanel();
                return;
            }

            var channel = buildChannelName(appointment);
            var patientName = await resolvePatientName(appointment);
            var doctorName = getDoctorName();
            var roomUrl = buildRoomUrl(appointment.id);

            var subtitle = document.getElementById('videoConsultSubtitle');
            if (subtitle) {
                subtitle.textContent = (patientName ? ('病人：' + patientName + '　') : '') +
                    '醫師：' + doctorName;
            }
            setPanelStatus('connecting', '連線中…');

            showPanel();
            createCall(channel, patientName, doctorName, roomUrl);
        } catch (error) {
            console.error('開啟視訊診症失敗:', error);
            notify('開啟視訊診症失敗：' + (error && error.message ? error.message : error), 'error');
        }
    };

    // fromController=true 表示由通話元件的掛斷鈕觸發（SDK 已 leave）
    window.closeVideoConsultation = function (fromController) {
        var workspace = document.getElementById('consultationWorkspace');
        var panel = document.getElementById('videoConsultPanel');
        var stage = document.getElementById('videoConsultStage');

        var finish = function () {
            callController = null;
            if (stage) stage.innerHTML = '';
            if (panel) panel.classList.add('hidden');
            if (workspace) workspace.classList.remove('vc-active');
        };

        if (fromController) {
            finish();
            return;
        }

        if (callController) {
            var controller = callController;
            callController = null;
            controller.leave().then(finish, finish);
        } else {
            finish();
        }
    };

    // 診症表單被 system.js 關閉（取消／保存診症）時，一併結束視訊並收起面板
    function watchFormHidden() {
        var form = document.getElementById('consultationForm');
        if (!form || !('MutationObserver' in window)) return;
        var observer = new MutationObserver(function () {
            if (form.classList.contains('hidden') && callController) {
                window.closeVideoConsultation();
            }
        });
        observer.observe(form, { attributes: true, attributeFilter: ['class'] });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', watchFormHidden);
    } else {
        watchFormHidden();
    }
})();
