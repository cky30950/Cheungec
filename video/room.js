/* ============================================================
 * 病人端視訊診間（video/room.html）— RTC SDK 原生 API
 * ------------------------------------------------------------
 * 病人打開醫師提供的連結即可就診，無需登入系統：
 *   video/room.html?apt=<掛號編號>
 *   video/room.html?channel=<完整頻道名稱>
 *
 * 頻道 = agora-config.js 的 CHANNEL_PREFIX + 掛號編號，
 * 與醫師端 video-consultation.js 使用同一規則，雙方自動接通。
 * 通話介面與邏輯共用 video/agora-call.js。
 * ============================================================ */

(function () {
    'use strict';

    var callController = null;
    // 雙方就緒信號控制代碼（VideoPresence），用於在加入 Agora 前等待醫師
    var presence = null;
    // 加入後遲遲未見醫師的自動掛斷計時器（避免病人單獨在頻道內持續計費）
    var aloneTimer = null;
    var ALONE_LIMIT_MS = 90000;
    // 上次發送「病人已進入診間」FCM 推播的時間（限流，2 分鐘最多一次）
    var lastVideoNotifyAt = 0;
    // 自動結束等候時要顯示的原因
    var endReason = '';
    var state = {
        channel: '',
        appointmentId: ''
    };

    function $(id) {
        return document.getElementById(id);
    }

    function getConfig() {
        return window.AGORA_CONFIG || {};
    }

    function showScreen(name) {
        ['lobby', 'consent', 'error', 'call', 'ended'].forEach(function (screen) {
            var el = $(screen + 'Screen');
            if (el) el.classList.toggle('hidden', screen !== name);
        });
    }

    function showError(message) {
        var el = $('errorMessage');
        if (el) el.textContent = message || '連結無效或已過期。';
        showScreen('error');
    }

    // 由網址參數解析頻道，並限定只能進入診症前綴的頻道
    function resolveChannel() {
        var cfg = getConfig();
        var prefix = cfg.CHANNEL_PREFIX || 'tcm-consult-';
        var params = new URLSearchParams(window.location.search);
        var appointmentId = params.get('apt') || '';
        var channel = params.get('channel') || '';

        if (!channel && appointmentId) {
            channel = prefix + appointmentId;
        }
        if (!channel) return null;

        // 與醫師端相同的正規化：非 Agora 允許字元轉為 '-'，長度 ≤ 64
        var safe = String(channel)
            .replace(/[^a-zA-Z0-9!#$%&()+\-:;<=>?@[\]^_{|}~]/g, '-')
            .substring(0, 64);

        if (!safe || safe.indexOf(prefix) !== 0) return null;

        return { channel: safe, appointmentId: appointmentId };
    }

    // 進入前閘門：未簽同意書者先看同意書，已簽（同一診間、同一版本）則直接進入
    function requestEnterRoom() {
        if (window.VideoConsent &&
            window.VideoConsent.hasLocalConsent(state.channel)) {
            joinRoom();
        } else {
            resetConsentScreen();
            showScreen('consent');
        }
    }

    function resetConsentScreen() {
        var check = $('consentAgreeCheck');
        var acceptBtn = $('acceptConsentBtn');
        if (check) check.checked = false;
        if (acceptBtn) acceptBtn.disabled = true;
    }

    // 病人勾選同意：記錄後才進入診間（鏡頭探測與 Agora 皆在其後）
    function acceptConsent() {
        var acceptBtn = $('acceptConsentBtn');
        if (acceptBtn) acceptBtn.disabled = true;

        var proceed = function () { joinRoom(); };
        if (window.VideoConsent) {
            // recordConsent 一定會 resolve（Firestore 失敗僅警告，不阻斷）
            window.VideoConsent.recordConsent(state.channel, state.appointmentId)
                .then(proceed, proceed);
        } else {
            proceed();
        }
    }

    function joinRoom() {
        var cfg = getConfig();

        if (!cfg.APP_ID) {
            showError('診間尚未完成視訊配置，請聯絡診所。');
            return;
        }
        if (!window.AgoraRTC || !window.AgoraCall) {
            showError('視訊元件載入失敗，請重新整理頁面後再試。');
            return;
        }

        var stage = $('roomStage');
        if (!stage) return;

        // 離開上一通話後重新進入：先清空容器
        if (callController) {
            callController.destroy();
            callController = null;
        }

        callController = window.AgoraCall.create(stage, {
            appId: cfg.APP_ID,
            channel: state.channel,
            tokenUrl: cfg.TOKEN_URL || '',
            localName: '我',
            remoteName: '醫師',
            // 醫師畫面佔滿、病人自己的畫面縮小於右上角
            layout: 'spotlight',
            // 病人只在醫師已進入頻道後才加入，加入後數秒內隱藏自己的滿版畫面
            hideLocalUntilPeer: true,
            waitingText: '正在與醫師連線…',
            onStatus: function (kind) {
                // 醫師影像送達 → 取消自動離開計時
                if (kind === 'connected') clearAloneTimer();
            },
            onError: function (message) {
                // 權限／設備錯誤時，回到錯誤頁並顯示具體原因
                clearAloneTimer();
                leaveCallScreen();
                showError(message);
            },
            onLeft: function () {
                clearAloneTimer();
                leaveCallScreen();
                if (endReason) {
                    showError(endReason);
                    endReason = '';
                } else {
                    showScreen('ended');
                }
            }
        });

        showScreen('call');

        // 先確認鏡頭與麥克風可用（含瀏覽器授權），通過後才廣播就緒，
        // 避免病人卡在授權彈窗時醫師已先進入頻道空等計費。
        callController.setStatus('connecting', '正在確認鏡頭與麥克風…');
        probeDevices().then(function () {
            // 短暫緩衝讓設備完全釋放，隨後 Agora 再建立軌道（部分瀏覽器需要）
            setTimeout(beginWaiting, 300);
        }, function (message) {
            leaveCallScreen();
            showError(message);
        });

        // 病人在頻道外免費等待：看到醫師「已成功加入 Agora」（joined 信號）
        // 才進入頻道——醫師不來就無限等待，完全不計費。
        // 病人已簽同意書、鏡頭麥克風授權通過，即將開始心跳等待：
        // 經 Cloudflare Function 推播給負責醫師（後端會驗同意書與醫師在場狀態）
        function notifyDoctorWaiting() {
            var now = Date.now();
            if (now - lastVideoNotifyAt < 120000) return;
            lastVideoNotifyAt = now;
            try {
                var endpoint = new URL('../api/fcm/notify-video', window.location.href).href;
                fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ channel: state.channel })
                }).catch(function () { /* 推播失敗不影響看診 */ });
            } catch (e) { /* ignore */
            }
        }

        function beginWaiting() {
            if (!callController) return;
            callController.setStatus('connecting', '等待醫師進入診間…');
            // 通知醫師（fire-and-forget；同意書、限流、醫師是否已在場由後端把關）
            notifyDoctorWaiting();

            function joinNow() {
                // 等待期間若已離開則不再加入
                if (!callController) return;
                callController.join().then(function () {
                    // 病人已進入（雙方接通後的 joined 狀態仍持續心跳，
                    // 供醫師萬一斷線重返時判讀）
                    if (presence && typeof presence.markJoined === 'function') {
                        presence.markJoined();
                    }
                    // 醫師未於 90 秒內出現 → 自動離開停止計費
                    armAloneTimer();
                }).catch(function () {
                    // 錯誤已由 onError 切換到錯誤頁處理
                });
            }

            if (window.VideoPresence) {
                // 不設逾時：醫師不來，病人就一直免費等下去；
                // 30 秒寬限為相容舊版醫師頁面（快取未更新）之用
                presence = window.VideoPresence.waitPeer('patient', state.channel, { requirePeerJoined: true });
                presence.ready.then(joinNow).catch(function () {
                    // 信號服務故障才退回直接加入，不阻斷看診
                    joinNow();
                });
            } else {
                joinNow();
            }
        }
    }

    // 預先取得鏡頭與麥克風授權：通過後立即釋放，Agora 稍後建立軌道時
    // 不會再彈權限視窗（授權已記住），失敗則給出具體操作指引
    function probeDevices() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            return Promise.reject('瀏覽器不支援視訊，請使用最新版 Chrome／Safari，並以 HTTPS 開啟頁面。');
        }
        return navigator.mediaDevices.getUserMedia({ video: true, audio: true })
            .then(function (stream) {
                stream.getTracks().forEach(function (track) {
                    try { track.stop(); } catch (e) { /* ignore */ }
                });
            })
            .catch(function (err) {
                var name = err && (err.name || err.message) || '';
                if (/NotAllowed|PermissionDenied|SecurityError/i.test(name)) {
                    throw '請允許瀏覽器使用鏡頭與麥克風（可按網址列左側鎖頭圖示調整權限）後，再按進入診間。';
                }
                if (/NotFound|DevicesNotFound|Overconstrained/i.test(name)) {
                    throw '找不到鏡頭或麥克風，請確認設備已連接後再試。';
                }
                if (/NotReadable|TrackStartError|DeviceInUse/i.test(name)) {
                    throw '鏡頭或麥克風正被其他程式佔用，請關閉其他視訊應用程式（如 FaceTime、Zoom）後再試。';
                }
                throw '無法開啟鏡頭或麥克風，請檢查設備後再試。';
            });
    }

    function armAloneTimer() {
        clearAloneTimer();
        aloneTimer = setTimeout(function () {
            if (!callController) return;
            endReason = '醫師尚未進入診間，等候已結束。請按「重新進入」再試，或聯絡診所。';
            callController.leave();
        }, ALONE_LIMIT_MS);
    }

    function clearAloneTimer() {
        if (aloneTimer) {
            clearTimeout(aloneTimer);
            aloneTimer = null;
        }
    }

    function leaveCallScreen() {
        clearAloneTimer();
        if (presence) {
            try { presence.leave(); } catch (e) { /* ignore */ }
            presence = null;
        }
        if (callController) {
            callController.destroy();
            callController = null;
        }
    }

    function init() {
        var resolved = resolveChannel();
        if (!resolved) {
            showError('找不到診間編號，請確認連結完整。');
            return;
        }
        state.channel = resolved.channel;
        state.appointmentId = resolved.appointmentId;

        var codeText = $('roomCodeText');
        if (codeText) {
            // 顯示掛號編號；若只有頻道名則去掉前綴顯示
            var prefix = getConfig().CHANNEL_PREFIX || 'tcm-consult-';
            codeText.textContent = state.appointmentId || state.channel.replace(prefix, '');
        }

        var joinBtn = $('joinRoomBtn');
        var rejoinBtn = $('rejoinRoomBtn');
        if (joinBtn) joinBtn.addEventListener('click', requestEnterRoom);
        if (rejoinBtn) rejoinBtn.addEventListener('click', requestEnterRoom);

        // 同意書：勾選後才能按同意；不同意則返回大廳
        var agreeCheck = $('consentAgreeCheck');
        var acceptBtn = $('acceptConsentBtn');
        var declineBtn = $('declineConsentBtn');
        if (agreeCheck && acceptBtn) {
            agreeCheck.addEventListener('change', function () {
                acceptBtn.disabled = !agreeCheck.checked;
            });
        }
        if (acceptBtn) acceptBtn.addEventListener('click', acceptConsent);
        if (declineBtn) declineBtn.addEventListener('click', function () {
            resetConsentScreen();
            showScreen('lobby');
        });
    }

    document.addEventListener('DOMContentLoaded', init);
})();
