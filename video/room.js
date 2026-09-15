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
        ['lobby', 'error', 'call', 'ended'].forEach(function (screen) {
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
            waitingText: '已進入診間，等待醫師加入…',
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

        // 病人先在頻道外等醫師就緒；醫師在線後由病人先加入 Agora，
        // 成功後才以 markJoined 通知醫師加入——醫師端可全程免費等待。
        callController.setStatus('connecting', '等待醫師進入診間…');

        function joinNow() {
            // 等待期間若已離開則不再加入
            if (!callController) return;
            callController.join().then(function () {
                // 已成功進入 Agora：通知醫師「病人上線了」
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
            presence = window.VideoPresence.waitPeer('patient', state.channel, { timeoutMs: 45000 });
            presence.ready.then(joinNow).catch(function () {
                // 超時或信號服務不可用時退回原行為（直接加入），不阻斷看診
                joinNow();
            });
        } else {
            joinNow();
        }
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
        if (joinBtn) joinBtn.addEventListener('click', joinRoom);
        if (rejoinBtn) rejoinBtn.addEventListener('click', joinRoom);
    }

    document.addEventListener('DOMContentLoaded', init);
})();
