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
    // 雙方就緒信號控制代碼（VideoPresence），用於在加入 Agora 前等待病人
    var presence = null;
    // 面板是否處於開啟狀態（自動重返等待流程時用，避免與手動關閉競態）
    var panelActive = false;
    // 自動重返等待中（此時 Agora 的 onLeft 不應關閉面板）
    var reattaching = false;
    // 加入後遲遲未見病人的自動離開計時器
    var aloneTimer = null;
    var DOCTOR_ALONE_MS = 60000;
    // 病人電子同意書記錄監聽取消函式
    var consentUnwatch = null;

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

    // 取得目前登入醫師的新鮮 Firebase ID Token（Agora token 端點鑑權用；
    // 每次 join／續期都重新取，避免一小時後 token 過期）
    function getFreshIdToken() {
        var user = window.firebase && window.firebase.auth && window.firebase.auth.currentUser;
        if (!user) return Promise.reject(new Error('尚未登入，無法開啟視訊診間'));
        return Promise.resolve(user.getIdToken());
    }

    // 病人端診間頁面網址：video/room.html?apt=<掛號編號>#k=<入房 pass>
    // pass 放在 hash fragment：不會送到伺服器、不會進 Referer 與存取日誌；
    // 病人開頁時以 POST room-session 將一次性 pass 換成短 TTL session token。
    async function mintRoomUrl(appointmentId, channel) {
        var idToken = await getFreshIdToken();
        var base = String(getConfig().TOKEN_URL || '/api/agora-token').replace(/\/+$/, '');
        var res = await fetch(base + '/room-pass', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + idToken,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ channel: channel })
        });
        var data = null;
        try { data = await res.json(); } catch (e) { data = null; }
        if (!res.ok || !data || !data.pass) {
            throw new Error((data && data.message) || ('核發診間連結失敗（HTTP ' + res.status + '）'));
        }
        var url = new URL('video/room.html', window.location.href);
        url.searchParams.set('apt', String(appointmentId));
        // pass 放 fragment 而非 query：不進伺服器日誌、不隨 Referer 外洩
        url.hash = 'k=' + encodeURIComponent(String(data.pass));
        return url.href;
    }

    // 診症完成時批次作廢該頻道所有入房 pass 與有效 session（best-effort，
    // 失敗不影響診症完成流程；pass 本身最長 4 小時、session 90 分鐘亦會自然失效）
    async function revokeRoomAccess(channel) {
        var idToken = await getFreshIdToken();
        var base = String(getConfig().TOKEN_URL || '/api/agora-token').replace(/\/+$/, '');
        var res = await fetch(base + '/room-pass', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + idToken,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ channel: String(channel), action: 'revoke' })
        });
        if (!res.ok) {
            throw new Error('作廢診間連結失敗（HTTP ' + res.status + '）');
        }
        return res.json().catch(function () { return null; });
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

    // 視訊診症僅限職位為「醫師」者使用（護理師／診所管理／用戶皆無此功能）
    function isDoctorUser() {
        try {
            if (typeof currentUserData !== 'undefined' && currentUserData) {
                return String(currentUserData.position || '').trim() === '醫師';
            }
        } catch (e) { /* ignore */ }
        return false;
    }

    // 依當前登入角色顯示／隱藏診症記錄標題列的「視訊診症」按鈕
    function syncVideoEntryVisibility() {
        var btn = document.getElementById('videoConsultBtn');
        if (btn) btn.classList.toggle('hidden', !isDoctorUser());
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

    // 舌象截圖：擷取病人畫面當前影格 → 預覽確認 → 以舌象分類上傳至本次病歷
    async function handleTongueScreenshot(shotApi) {
        var blob;
        try {
            blob = await shotApi.capture();
        } catch (e) {
            console.warn('[視訊診症] 擷取病人影像失敗:', e);
            notify('目前沒有病人的影像畫面，無法截圖（請確認病人已加入診間並開啟鏡頭）', 'error');
            return;
        }

        var objectUrl = URL.createObjectURL(blob);
        var confirmed = false;
        try {
            if (window.Swal) {
                var result = await window.Swal.fire({
                    title: '舌象截圖',
                    text: '確認將此畫面上傳到本次病歷的舌象圖片？',
                    imageUrl: objectUrl,
                    imageAlt: '舌象截圖預覽',
                    showCancelButton: true,
                    confirmButtonText: '上傳到本次病歷',
                    cancelButtonText: '取消重拍',
                    focusCancel: true
                });
                confirmed = !!(result && result.isConfirmed);
            } else {
                confirmed = window.confirm('將此舌象截圖上傳到本次病歷？');
            }
        } finally {
            // Swal 會把圖片複製進自身 DOM；對話框關閉後即可釋放
            setTimeout(function () { URL.revokeObjectURL(objectUrl); }, 2000);
        }
        if (!confirmed) return;

        notify('舌象截圖上傳中…', 'info');
        try {
            await window.MedicalAttachments.uploadVisitFile(blob, 'tongue');
            notify('舌象截圖已上傳至本次病歷', 'success');
        } catch (e) {
            console.error('[視訊診症] 舌象截圖上傳失敗:', e);
            notify('舌象截圖上傳失敗：' + ((e && e.message) || e), 'error');
        }
    }

    function createCall(channel, patientName, doctorName) {
        var cfg = getConfig();
        var stage = document.getElementById('videoConsultStage');
        if (!stage) return;

        // 重新進入等待流程前，先結束舊的就緒監聽
        clearPresence();

        callController = window.AgoraCall.create(stage, {
            appId: cfg.APP_ID,
            channel: channel,
            tokenUrl: cfg.TOKEN_URL || '',
            // 醫師端鑑權：每次取 Agora token 前動態取新鮮 Firebase ID token
            authTokenProvider: getFreshIdToken,
            localName: doctorName || '醫師',
            remoteName: patientName || '病人',
            // 對方畫面佔滿、自己畫面縮小於右上角
            layout: 'spotlight',
            // 醫師只在病人已進入頻道後才加入，加入後數秒內會隱藏自己的滿版畫面
            hideLocalUntilPeer: true,
            waitingText: '正在與病人連線…',
            // 醫師端工具列顯示「舌象截圖」按鈕（病人端 room.js 不啟用）
            enableScreenshot: true,
            onScreenshot: handleTongueScreenshot,
            onStatus: function (kind) {
                // 病人影像送達 → 取消自動離開計時
                if (kind === 'connected') clearAloneTimer();
            },
            // 病人接通後又離開頻道（掛斷／當機／斷線逾時）：重啟獨留計時，
            // 60 秒未重返即自動離開頻道停止計費，並回到等待流程供病人再進入
            onPeerLeft: function () {
                armAloneTimer(channel, patientName, doctorName);
            },
            onError: function (message) {
                clearAloneTimer();
                notify(message, 'error');
            },
            onLeft: function () {
                // 自動重返等待流程造成的 leave，不關面板
                if (reattaching) return;
                // 醫師按下掛斷鈕 → 關閉右側視訊面板、還原診症資料版面
                window.closeVideoConsultation(true);
            }
        });

        panelActive = true;

        // 醫師與病人皆在頻道外免費等待：病人發出新鮮心跳（已通過鏡頭檢查）
        // 後，由醫師先加入 Agora，並以 markJoined 通知病人加入。
        callController.setStatus('connecting', '等待病人進入診間…');

        function joinNow() {
            // 等待期間若已關閉面板則不再加入
            if (!callController || !panelActive) return;
            callController.join().then(function () {
                if (!panelActive) return;
                // 醫師已在頻道：通知病人加入
                if (presence && typeof presence.markJoined === 'function') {
                    presence.markJoined();
                }
                // 60 秒仍未看到病人則自動離開並重返等待
                armAloneTimer(channel, patientName, doctorName);
            }).catch(function () {
                // 錯誤已透過 onError 提示；面板保持開啟以便醫師重試或關閉
            });
        }

        if (window.VideoPresence) {
            // 不設逾時：病人不來，醫師就一直免費等下去；
            // 醫師只要求病人心跳新鮮（病人已完成鏡頭授權），不要求 joined
            presence = window.VideoPresence.waitPeer('doctor', channel);
            presence.ready.then(joinNow).catch(function () {
                // 只有信號服務故障才退回直接加入（極罕見；避免完全無法看診）
                notify('就緒檢查服務暫不可用，已直接進入診間', 'info');
                joinNow();
            });
        } else {
            joinNow();
        }
    }

    function armAloneTimer(channel, patientName, doctorName) {
        clearAloneTimer();
        aloneTimer = setTimeout(function () {
            beginReattach(channel, patientName, doctorName);
        }, DOCTOR_ALONE_MS);
    }

    function clearAloneTimer() {
        if (aloneTimer) {
            clearTimeout(aloneTimer);
            aloneTimer = null;
        }
    }

    // 加入後遲遲未見病人（對方加入後當機／斷線）：離開頻道停止計費，
    // 並自動回到「等待病人進入診間」，病人重新進入時會再次自動接通
    function beginReattach(channel, patientName, doctorName) {
        if (!panelActive || !callController || reattaching) return;
        reattaching = true;
        clearAloneTimer();
        var old = callController;
        callController = null;
        notify('尚未偵測到病人，已暫時離開頻道，等待病人重新進入…', 'info');
        old.leave().then(function () {
            reattaching = false;
            if (!panelActive) return;
            createCall(channel, patientName, doctorName);
        }, function () {
            reattaching = false;
            if (!panelActive) return;
            createCall(channel, patientName, doctorName);
        });
    }

    function clearPresence() {
        if (presence) {
            try { presence.leave(); } catch (e) { /* ignore */ }
            presence = null;
        }
    }

    function setConsentBadge(signed) {
        var badge = document.getElementById('videoConsultConsent');
        if (badge) badge.classList.toggle('hidden', !signed);
    }

    // 監聽病人是否已簽電子同意書（病人同意後才會開始心跳，故未簽時
    // 醫師只會停在等待狀態；此標記供醫師即時確認與事後查核）
    function startConsentWatch(channel) {
        stopConsentWatch();
        setConsentBadge(false);
        if (window.VideoConsent) {
            consentUnwatch = window.VideoConsent.watchConsent(channel, setConsentBadge);
        }
    }

    function stopConsentWatch() {
        if (consentUnwatch) {
            try { consentUnwatch(); } catch (e) { /* ignore */ }
            consentUnwatch = null;
        }
        setConsentBadge(false);
    }

    window.openVideoConsultation = async function () {
        try {
            // 權限閘門：非醫師不得開啟（按鈕亦已隱藏，此處擋住控制台或殘留入口）
            if (!isDoctorUser()) {
                notify('視訊診症僅限醫師帳號使用', 'error');
                return;
            }

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

            // 向後端核發本次診間的病人入房 pass，組成 #k= fragment 病人連結；
            // 核發失敗（未登入／後端異常）則不開啟面板，避免產生無用連結
            var roomUrl;
            try {
                roomUrl = await mintRoomUrl(appointment.id, channel);
            } catch (mintError) {
                console.error('[視訊診症] 核發診間連結失敗:', mintError);
                notify('無法核發診間連結：' + (mintError && mintError.message ? mintError.message : mintError), 'error');
                return;
            }
            var roomUrlInput = document.getElementById('videoConsultRoomUrl');
            if (roomUrlInput) roomUrlInput.value = roomUrl;

            // 顯示右半側視訊面板，診症資料順移至左半側
            setEmbeddedVideoUI(true);

            // 監聽病人同意書簽署狀態（標題列顯示「已簽同意書」）
            startConsentWatch(channel);

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
            panelActive = false;
            clearAloneTimer();
            callController = null;
            clearPresence();
            stopConsentWatch();
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

    // 診症完成時由 system.js 呼叫：依掛號編號派生頻道名並批次作廢 pass／session。
    // 回傳 Promise（呼叫端可 fire-and-forget）；任何失敗皆內部吸收，不阻斷完成流程。
    window.VideoRoomPass = {
        revokeForAppointment: function (appointmentId) {
            var id = String(appointmentId == null ? '' : appointmentId);
            if (!id) return Promise.resolve(null);
            var fakeAppointment = { id: id };
            return Promise.resolve()
                .then(function () { return revokeRoomAccess(buildChannelName(fakeAppointment)); })
                .catch(function (error) {
                    console.warn('[視訊診症] 診症完成作廢入房連結失敗:',
                        error && error.message ? error.message : error);
                    return null;
                });
        },
        revokeForChannel: function (channel) {
            return Promise.resolve()
                .then(function () { return revokeRoomAccess(channel); })
                .catch(function () { return null; });
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

    function initRoleGate() {
        syncVideoEntryVisibility();
        // 診症表單展開時（使用者登入後才進入診症）再次同步，
        // 避免自動登入較慢導致按鈕狀態未更新
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
        document.addEventListener('DOMContentLoaded', function () {
            initCopyRoomUrlButton();
            initRoleGate();
        });
    } else {
        initCopyRoomUrlButton();
        initRoleGate();
    }
})();
