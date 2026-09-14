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
            waitingText: '已進入診間，等待醫師加入…',
            onError: function (message) {
                // 權限／設備錯誤時，回到錯誤頁並顯示具體原因
                leaveCallScreen();
                showError(message);
            },
            onLeft: function () {
                leaveCallScreen();
                showScreen('ended');
            }
        });

        showScreen('call');
        callController.join().catch(function () {
            // 錯誤已由 onError 切換到錯誤頁處理
        });
    }

    function leaveCallScreen() {
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
