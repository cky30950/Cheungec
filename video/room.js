/* ============================================================
 * 病人端視訊診間（video/room.html）
 * ------------------------------------------------------------
 * 病人打開醫師提供的連結即可就診，無需登入系統：
 *   video/room.html?apt=<掛號編號>
 *   video/room.html?channel=<完整頻道名稱>
 *
 * 頻道 = agora-config.js 的 CHANNEL_PREFIX + 掛號編號，
 * 與醫師端 video-consultation.js 使用同一規則，雙方自動接通。
 * Token 經同源 /api/agora-token 自動取得。
 * ============================================================ */

(function () {
    'use strict';

    var UIKIT_TAG = 'agora-react-web-uikit';
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

    function destroyUiKit() {
        var stage = $('roomStage');
        if (!stage) return;
        var el = stage.querySelector(UIKIT_TAG);
        if (el) {
            // 觸發離開頻道、釋放鏡頭與麥克風後再移除元件
            try { el.callActive = false; } catch (e) { /* ignore */ }
            try { el.removeEventListener('agoraUIKitEndcall', onEndCall); } catch (e) { /* ignore */ }
        }
        stage.innerHTML = '';
    }

    function onEndCall() {
        destroyUiKit();
        showScreen('ended');
    }

    function joinRoom() {
        var cfg = getConfig();

        if (!cfg.APP_ID) {
            showError('診間尚未完成視訊配置，請聯絡診所。');
            return;
        }
        if (!window.customElements || !window.customElements.get(UIKIT_TAG)) {
            showError('視訊元件載入失敗，請重新整理頁面後再試。');
            return;
        }

        var stage = $('roomStage');
        if (!stage) return;
        destroyUiKit();

        var el = document.createElement(UIKIT_TAG);
        el.style.width = '100%';
        el.style.height = '100%';
        el.style.display = 'flex';

        // 與醫師端相同的 Direflow 屬性設定方式
        el.setAttribute('appid', cfg.APP_ID);
        el.setAttribute('channel', state.channel);
        el.setAttribute('uid', '0');
        el.setAttribute('role', 'host');    // 病人同樣需要收發鏡頭與聲音
        el.setAttribute('layout', '0');     // 九宮格佈局
        el.setAttribute('callactive', 'true');
        el.setAttribute('enableaudio', 'true');
        el.setAttribute('enablevideo', 'true');
        el.setAttribute('activespeaker', 'true');
        el.setAttribute('disablertm', 'true');

        if (cfg.TOKEN_URL) {
            el.setAttribute('tokenurl', String(cfg.TOKEN_URL).replace(/\/+$/, ''));
        }

        el.addEventListener('agoraUIKitEndcall', onEndCall);

        stage.appendChild(el);
        showScreen('call');
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
