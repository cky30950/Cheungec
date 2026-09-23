/* ============================================================
 * 病人端視訊診間（video/room.html）— RTC SDK 原生 API
 * ------------------------------------------------------------
 * 病人打開醫師提供的連結即可就診，無需登入系統：
 *   video/room.html?apt=<掛號編號>#k=<入房 pass>
 *   video/room.html?channel=<完整頻道名稱>#k=<入房 pass>
 *
 * pass 放在 location.hash：不會送到伺服器、不會進 Referer／日誌。
 * 開頁時以 POST room-session 把「一次性」pass 換成 90 分鐘滑動 TTL
 * 的 session token（pass 隨即作廢），session token 僅存記憶體與
 * sessionStorage，供重新整理／斷線重返；換發 Agora token 時經
 * X-Room-Session header 傳送，病人 uid 由後端派生且不可指定。
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
    // 通話中醫師離開後的自動掛斷計時器（含斷線重返寬限）
    var peerGoneTimer = null;
    // 醫師「主動掛斷」（user-left reason=Quit）：幾秒後即結束
    var PEER_QUIT_GRACE_MS = 5000;
    // 醫師「斷線／當機」（ServerTimeOut）：給 45 秒重返，逾時才結束
    var PEER_DROP_GRACE_MS = 45000;
    // 自動結束等候時要顯示的原因
    var endReason = '';
    var state = {
        channel: '',
        appointmentId: '',
        // 連結中的一次性 pass（換發 session 後就不再需要）
        roomPass: '',
        // 入房 session（pass 換發後保存；僅存記憶體與同源 sessionStorage）
        roomSession: '',
        // 後端派生字該 session 的 Agora uid（join 時必須一致）
        patientUid: 0
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

    // 由網址解析頻道與入房 pass，並限定只能進入診症前綴的頻道。
    // pass 新制走 location.hash（#k=），相容舊制 query ?k=（換發後即清除）；
    // 已換發過 session 的頁面重新整理時網址不含 k，需靠 sessionStorage 重返。
    function resolveChannel() {
        var cfg = getConfig();
        var prefix = cfg.CHANNEL_PREFIX || 'tcm-consult-';
        var params = new URLSearchParams(window.location.search);
        var hashParams = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
        var appointmentId = params.get('apt') || '';
        var channel = params.get('channel') || '';
        var roomPass = (hashParams.get('k') || params.get('k') || '').trim();

        if (!channel && appointmentId) {
            channel = prefix + appointmentId;
        }
        if (!channel) return null;

        // 與醫師端相同的正規化：非 Agora 允許字元轉為 '-'，長度 ≤ 64
        var safe = String(channel)
            .replace(/[^a-zA-Z0-9!#$%&()+\-:;<=>?@[\]^_{|}~]/g, '-')
            .substring(0, 64);

        if (!safe || safe.indexOf(prefix) !== 0) return null;

        // pass 為 64 碼 hex（後端核發）；缺 pass 不立即失敗，可能已有 session
        if (roomPass && !/^[a-f0-9]{32,256}$/i.test(roomPass)) return null;

        return { channel: safe, appointmentId: appointmentId, roomPass: roomPass };
    }

    function sessionStorageKey(channel) {
        return 'roomSession:' + channel;
    }

    // 讀取已保存且憑證本身未過期的 session（伺服器仍會再次驗證）
    function readStoredSession(channel) {
        try {
            var raw = window.sessionStorage.getItem(sessionStorageKey(channel));
            if (!raw) return null;
            var parsed = JSON.parse(raw);
            var exp = parseSessionExp(parsed && parsed.token);
            if (!parsed || !parsed.token || !parsed.uid || !exp || exp * 1000 <= Date.now()) {
                window.sessionStorage.removeItem(sessionStorageKey(channel));
                return null;
            }
            return parsed;
        } catch (e) { return null; }
    }

    function saveStoredSession(channel, token, uid) {
        try {
            window.sessionStorage.setItem(sessionStorageKey(channel), JSON.stringify({
                token: token,
                uid: uid
            }));
        } catch (e) { /* 無痕模式等：僅靠記憶體仍可完成本次診症 */ }
    }

    function clearStoredSession(channel) {
        try { window.sessionStorage.removeItem(sessionStorageKey(channel)); } catch (e) { /* ignore */ }
    }

    // 從 session token 第二段（base64url JSON）取得 exp
    function parseSessionExp(token) {
        try {
            var part = String(token || '').split('.')[1] || '';
            var json = JSON.parse(decodeURIComponent(escape(
                atob(part.replace(/-/g, '+').replace(/_/g, '/'))
            )));
            return Number(json && json.exp) || 0;
        } catch (e) { return 0; }
    }

    // 以一次性 pass 換發 session；成功後把 pass 自網址移除（歷史紀錄／網址列不留密文）
    function exchangeRoomSession(channel, pass) {
        var cfg = getConfig();
        var base = String(cfg.TOKEN_URL || '/api/agora-token').replace(/\/+$/, '');
        return fetch(base + '/room-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel: channel, pass: pass })
        }).then(function (res) {
            return res.json().catch(function () { return null; }).then(function (data) {
                if (!res.ok || !data || !data.sessionToken) {
                    var err = new Error((data && data.message) || ('換發診間連線失敗（HTTP ' + res.status + '）'));
                    err.httpStatus = res.status;
                    err.code = data && data.error;
                    throw err;
                }
                return data;
            });
        }).then(function (data) {
            saveStoredSession(channel, data.sessionToken, data.uid);
            stripSecretFromUrl();
            return data;
        });
    }

    function stripSecretFromUrl() {
        try {
            var cleanUrl = window.location.pathname + window.location.search;
            // 舊制 ?k= 一併移除，其餘參數（apt／channel）保留
            if (window.location.search && window.location.search.indexOf('k=') !== -1) {
                var kept = new URLSearchParams(window.location.search);
                kept.delete('k');
                var qs = kept.toString();
                cleanUrl = window.location.pathname + (qs ? '?' + qs : '');
            }
            window.history.replaceState(null, '', cleanUrl);
        } catch (e) { /* ignore */ }
    }

    // 進入診間前確保已有 session：既存 session 直接用，否則以 pass 換發
    function ensureRoomSession(resolved) {
        if (state.roomSession) return Promise.resolve();
        var stored = readStoredSession(resolved.channel);
        if (stored) {
            state.roomSession = stored.token;
            state.patientUid = Number(stored.uid) || 0;
            return Promise.resolve();
        }
        if (!resolved.roomPass) {
            return Promise.reject(new Error('NO_PASS'));
        }
        return exchangeRoomSession(resolved.channel, resolved.roomPass).then(function (data) {
            state.roomSession = data.sessionToken;
            state.patientUid = Number(data.uid) || 0;
        });
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
        hideConsentError();
    }

    function showConsentError(message) {
        var el = $('consentErrorLine');
        if (el) {
            el.textContent = message || '儲存同意書失敗，請稍後再試。';
            el.classList.remove('hidden');
        }
    }

    function hideConsentError() {
        var el = $('consentErrorLine');
        if (el) {
            el.textContent = '';
            el.classList.add('hidden');
        }
    }

    function describeConsentError(error) {
        var status = error && error.httpStatus;
        var code = error && error.code;
        if (code === 'CONSENT_VERSION_MISMATCH' || status === 409) {
            return '同意書已有新版本，請重新整理頁面後重新簽署。';
        }
        if (status === 401 || status === 403 || status === 404) {
            return '診間連線階段已失效，請重新開啟醫師提供的連結。';
        }
        if (error && error.message === 'NO_PASS') {
            return '診間連結不完整，請重新開啟醫師提供的連結。';
        }
        return (error && error.message) || '儲存同意書失敗，請檢查網路後再試。';
    }

    // 病人勾選同意：伺服器寫入同意記錄成功後才進入診間；
    // 任何失敗（含網路／規則拒絕）皆封鎖，停留於同意頁可重試
    function acceptConsent() {
        var acceptBtn = $('acceptConsentBtn');
        if (acceptBtn) acceptBtn.disabled = true;
        hideConsentError();

        // 同意記錄須憑入房 session 由後端寫入，故先確保 session 已建立
        Promise.resolve()
            .then(function () { return ensureRoomSession(state); })
            .then(function () {
                if (!window.VideoConsent) {
                    throw new Error('同意書元件尚未載入，請重新整理頁面');
                }
                return window.VideoConsent.recordConsent(
                    state.channel, state.appointmentId, state.roomSession
                );
            })
            .then(function () { joinRoom(); })
            .catch(function (error) {
                console.error('[Room] 同意流程失敗:', error);
                showConsentError(describeConsentError(error));
                // 恢復按鈕（勾選仍保留時可直接重按）
                var check = $('consentAgreeCheck');
                if (acceptBtn) acceptBtn.disabled = !(check && check.checked);
            });
    }

    // session 換發／驗證失敗時的面向病人提示
    function describeSessionError(error) {
        var status = error && error.httpStatus;
        if (error && error.message === 'NO_PASS') {
            return '診間連結不完整，請重新開啟醫師提供的連結。';
        }
        if (status === 409 || (error && error.code === 'ROOM_PASS_ALREADY_USED')) {
            // 一次性 pass 已在其他裝置消耗；原裝置可直接重返
            return '此診間連結已在其他裝置使用，請在原裝置重新進入，或聯絡診所重新索取連結。';
        }
        if (status === 403 || status === 401 || status === 404) {
            return '診間連結已失效、過期或被關閉，請聯絡診所重新索取。';
        }
        return (error && error.message) || '無法建立診間連線，請稍後再試。';
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

        // 先以一次性 pass 換發（或取回已保存的）入房 session
        ensureRoomSession(state).then(function () {
            // 離開上一通話後重新進入：先清空容器
            if (callController) {
                callController.destroy();
                callController = null;
            }

            callController = window.AgoraCall.create(stage, {
                appId: cfg.APP_ID,
                channel: state.channel,
                tokenUrl: cfg.TOKEN_URL || '',
                // 病人端鑑權：入房 session token（header 傳送）＋後端派生 uid
                roomSession: state.roomSession,
                uid: state.patientUid,
                localName: '我',
                remoteName: '醫師',
                // 醫師畫面佔滿、病人自己的畫面縮小於右上角
                layout: 'spotlight',
                // 病人只在醫師已進入頻道後才加入，加入後數秒內隱藏自己的滿版畫面
                hideLocalUntilPeer: true,
                waitingText: '正在與醫師連線…',
                onStatus: function (kind) {
                    // 醫師影像送達／重新接通 → 取消所有自動離開計時
                    if (kind === 'connected') {
                        clearAloneTimer();
                        clearPeerGoneTimer();
                    }
                },
                // 醫師離開頻道（主動掛斷或斷線逾時）：啟動寬限計時，
                // 逾時未重返即自動掛斷，避免病人獨留頻道持續計費
                onPeerLeft: function (reason) {
                    armPeerGoneTimer(reason);
                },
                onError: function (message, err) {
                    clearAloneTimer();
                    clearPeerGoneTimer();
                    leaveCallScreen();
                    // 伺服器同意閘門拒發（同意記錄缺失／版本過期）：
                    // 回到同意頁重簽，而非停留於無路可退的錯誤頁
                    if (err && /^CONSENT_/.test(err.code || '')) {
                        resetConsentScreen();
                        showScreen('consent');
                        showConsentError(message);
                        return;
                    }
                    // 權限／設備錯誤時，回到錯誤頁並顯示具體原因
                    showError(message);
                },
                onLeft: function () {
                    clearAloneTimer();
                    clearPeerGoneTimer();
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
        function beginWaiting() {
            if (!callController) return;
            callController.setStatus('connecting', '等待醫師進入診間…');

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
        }).catch(function (error) {
            // 此處錯誤來自 session 換發（pass 已用／過期／作廢／網路等）
            console.error('[Room] 建立入房連線失敗:', error);
            var status = error && error.httpStatus;
            if (status === 401 || status === 403 || status === 404 || status === 409) {
                // 伺服器明確拒絕：清除已保存 session（若有）與記憶體狀態
                clearStoredSession(state.channel);
                state.roomSession = '';
                state.patientUid = 0;
            }
            showError(describeSessionError(error));
        });
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

    // 醫師於通話中離開頻道：主動掛斷只留 5 秒緩衝（防誤觸與收尾），
    // 斷線／當機則給 45 秒重返寬限；期間醫師重新發布串流（status=connected）
    // 會取消計時。逾時病人自動掛斷並顯示結束原因。
    function armPeerGoneTimer(reason) {
        clearPeerGoneTimer();
        var intentional = reason === 'Quit';
        var delay = intentional ? PEER_QUIT_GRACE_MS : PEER_DROP_GRACE_MS;
        if (callController) {
            callController.setStatus('waiting', intentional
                ? '醫師已離開診間，即將自動結束通話…'
                : '醫師連線中斷，若 ' + Math.round(PEER_DROP_GRACE_MS / 1000) +
                  ' 秒內未返回，將自動結束通話…');
        }
        peerGoneTimer = setTimeout(function () {
            peerGoneTimer = null;
            if (!callController) return;
            endReason = '醫師已離開診間，通話已結束。' +
                '若診療尚未完成，請聯絡診所重新取得連結。';
            callController.leave();
        }, delay);
    }

    function clearPeerGoneTimer() {
        if (peerGoneTimer) {
            clearTimeout(peerGoneTimer);
            peerGoneTimer = null;
        }
    }

    function leaveCallScreen() {
        clearAloneTimer();
        clearPeerGoneTimer();
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
        var params = new URLSearchParams(window.location.search);
        var hasApt = !!(params.get('apt') || params.get('channel'));
        var resolved = resolveChannel();
        if (!resolved) {
            // 有診間編號但解析失敗：新版連結必帶入房 pass（k），
            // 舊連結或 pass 格式錯誤時引導病人向診所重新索取
            showError(hasApt
                ? '此診間連結已失效或不是最新版本，請聯絡診所重新索取連結。'
                : '找不到診間編號，請確認連結完整。');
            return;
        }
        state.channel = resolved.channel;
        state.appointmentId = resolved.appointmentId;
        state.roomPass = resolved.roomPass;

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
