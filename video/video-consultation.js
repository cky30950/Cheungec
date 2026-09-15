/* ============================================================
 * Agora 視訊診症整合（RTC SDK 原生 API 自建介面）— 醫師端
 * ------------------------------------------------------------
 * 依賴（視訊相關檔案統一放在 video/ 資料夾）：
 *   - video/agora-rtc-sdk.js（Agora RTC SDK 4.x，全域 AgoraRTC）
 *   - video/agora-call.js（自建通話介面與邏輯，全域 AgoraCall）
 *   - video/agora-config.js（App ID、Token 伺服器設定）
 *   - system.js 的診症狀態（currentConsultingAppointmentId / appointments）
 *
 * 運作方式：
 *   醫師在診症表單點擊「視訊診症」→ 以「前綴 + 掛號編號」作為
 *   Agora 頻道開啟視訊；病人端使用同一頻道名稱即可加入。
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

    function getDoctorName() {
        try {
            if (typeof currentUserData !== 'undefined' && currentUserData) {
                // 顯示用戶全名並加上「醫師」，例：陳大文醫師
                var fullName = String(currentUserData.name || currentUserData.username || '').trim();
                if (fullName) {
                    return /醫師$/.test(fullName) ? fullName : fullName + '醫師';
                }
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

    // 切換「診症資料在左、視訊畫面在右（各佔一半）」的嵌入版面
    function setEmbeddedVideoUI(active) {
        var panel = document.getElementById('videoConsultPanel');
        var fieldsPanel = document.getElementById('consultationFieldsPanel');
        var fieldsGrid = document.getElementById('consultationFieldsGrid');

        if (panel) panel.classList.toggle('hidden', !active);
        // 診症資料原本滿版（col-span-2），開啟視訊後只佔左半（span 1）
        if (fieldsPanel) fieldsPanel.classList.toggle('lg:col-span-2', !active);
        // 擠到左半後，診症資料內部改為單欄排列
        if (fieldsGrid) fieldsGrid.classList.toggle('lg:grid-cols-2', !active);

        updateEntryButton(active);

        if (active && panel) {
            try { panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) { /* ignore */ }
        }
    }

    // 診症記錄標題列的「視訊診症」按鈕：作用中時變為「關閉視訊」
    function updateEntryButton(active) {
        var btn = document.getElementById('videoConsultBtn');
        if (!btn) return;
        var label = btn.querySelectorAll('span')[1];
        if (active) {
            btn.classList.remove('bg-white', 'text-green-700', 'hover:bg-green-50', 'active:bg-green-100');
            btn.classList.add('bg-red-600', 'text-white', 'hover:bg-red-700', 'active:bg-red-800');
            if (label) label.textContent = '關閉視訊';
        } else {
            btn.classList.add('bg-white', 'text-green-700', 'hover:bg-green-50', 'active:bg-green-100');
            btn.classList.remove('bg-red-600', 'text-white', 'hover:bg-red-700', 'active:bg-red-800');
            if (label) label.textContent = '視訊診症';
        }
    }

    function createCall(channel, patientName, doctorName) {
        var cfg = getConfig();
        var stage = document.getElementById('videoConsultStage');
        if (!stage) return;

        callController = window.AgoraCall.create(stage, {
            appId: cfg.APP_ID,
            channel: channel,
            tokenUrl: cfg.TOKEN_URL || '',
            localName: doctorName || '醫師',
            remoteName: patientName || '病人',
            // 對方畫面佔滿、自己畫面縮小於右上角
            layout: 'spotlight',
            waitingText: '已就緒，等待病人加入…',
            onError: function (message) {
                notify(message, 'error');
            },
            onLeft: function () {
                // 醫師按下掛斷鈕 → 關閉右側視訊面板、還原診症資料版面
                window.closeVideoConsultation(true);
            }
        });

        callController.join().catch(function () {
            // 錯誤已透過 onError 提示；面板保持開啟以便醫師重試或關閉
        });
    }

    window.openVideoConsultation = async function () {
        try {
            // 已在通訊中再次點擊 → 直接關閉視訊（按鈕這時顯示為「關閉視訊」）
            if (callController) {
                window.closeVideoConsultation();
                return;
            }

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

            var channel = buildChannelName(appointment);
            var patientName = await resolvePatientName(appointment);
            var doctorName = getDoctorName();

            // 頻道名稱顯示在「視訊診症」標題右側；
            // 病人名已見於病歷、醫師名已見於視訊畫面，此處不再重複顯示
            var channelEl = document.getElementById('videoConsultChannel');
            if (channelEl) channelEl.textContent = '頻道：' + channel;

            // 將病人診間連結寫入隱藏欄位，供「診間連結」按鈕複製
            var roomUrl = buildRoomUrl(appointment.id);
            var roomUrlInput = document.getElementById('videoConsultRoomUrl');
            if (roomUrlInput) roomUrlInput.value = roomUrl;

            // 顯示右半側視訊面板，診症資料順移至左半側
            setEmbeddedVideoUI(true);

            createCall(channel, patientName, doctorName);
        } catch (error) {
            console.error('開啟視訊診症失敗:', error);
            notify('開啟視訊診症失敗：' + (error && error.message ? error.message : error), 'error');
        }
    };

    // fromController=true 表示由通話元件的掛斷鈕觸發（SDK 已 leave）
    window.closeVideoConsultation = function (fromController) {
        var stage = document.getElementById('videoConsultStage');

        var finish = function () {
            callController = null;
            if (stage) stage.innerHTML = '';
            // 隱藏右半側面板，診症資料恢復滿版
            setEmbeddedVideoUI(false);
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

    // 以非同步剪貼簿 API 為主，舊瀏覽器／非安全來源用暫存 textarea 備援
    function copyText(text) {
        if (navigator.clipboard && window.isSecureContext) {
            return navigator.clipboard.writeText(text);
        }
        return new Promise(function (resolve, reject) {
            try {
                var ta = document.createElement('textarea');
                ta.value = text;
                ta.setAttribute('readonly', '');
                ta.style.position = 'fixed';
                ta.style.top = '-9999px';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                var ok = document.execCommand('copy');
                document.body.removeChild(ta);
                ok ? resolve() : reject(new Error('execCommand failed'));
            } catch (e) {
                reject(e);
            }
        });
    }

    // 綁定面板頂部「診間連結」按鈕：點擊複製病人診間網址
    function initCopyRoomUrlButton() {
        var btn = document.getElementById('roomLinkBtn');
        if (!btn) return;
        btn.addEventListener('click', async function () {
            var input = document.getElementById('videoConsultRoomUrl');
            var text = input ? input.value : '';
            if (!text || text === '#') {
                notify('請先開啟一筆診症的視訊診間', 'error');
                return;
            }
            try {
                await copyText(text);
                notify('已複製病人診間連結，可直接傳送給病人', 'success');
            } catch (error) {
                notify('複製失敗，請稍後再試', 'error');
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initCopyRoomUrlButton);
    } else {
        initCopyRoomUrlButton();
    }
})();
