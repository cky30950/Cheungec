/* ============================================================
 * VideoConsent — 視像診症電子同意書
 * ------------------------------------------------------------
 * 病人在進入診間（鏡頭探測／Agora）前必須先同意：
 *   - 本機 localStorage 依「診間（頻道）」記錄同意版本與時間，
 *     同一掛號再次進入不重複詢問；同意書版本更新時會重新要求。
 *     本機記錄只作 UX（跳過同意頁），不是授權依據。
 *   - 權威記錄由後端寫入：recordConsent 經 POST /room-consent
 *     （攜帶入房 session token）由 Pages Function 以 Service Account
 *     寫 videoConsents/<頻道>；客戶端 Firestore 規則拒絕所有匿名寫入。
 *   - RTC token 端點換發時會以 SA 查核同意記錄存在且版本正確，
 *     寫入失敗或未同意者一律拿不到 token（硬性封鎖，不可繞過）。
 * ============================================================ */

(function () {
    'use strict';

    var CONSENT_VERSION = 'v1';
    var LS_PREFIX = 'tcm-video-consent:';
    // localStorage 不可用（隱私模式）時的當次工作階段備援
    var memory = {};

    function storageKey(channel) {
        return LS_PREFIX + String(channel);
    }

    // 本機是否已同意「目前版本」的同意書（僅供跳過同意頁，不構成授權）
    function hasLocalConsent(channel) {
        try {
            var raw = localStorage.getItem(storageKey(channel));
            if (raw) {
                var rec = JSON.parse(raw);
                return !!(rec && rec.version === CONSENT_VERSION);
            }
        } catch (e) { /* ignore */ }
        return !!memory[channel];
    }

    function saveLocalConsent(channel, clientAt) {
        var rec = JSON.stringify({ version: CONSENT_VERSION, at: clientAt });
        try {
            localStorage.setItem(storageKey(channel), rec);
        } catch (e) {
            memory[channel] = true;
        }
    }

    /**
     * 記錄同意：呼叫後端以 Service Account 寫入權威同意記錄。
     * 與舊版「Firestore 失敗仍放行」不同：寫入失敗時 Promise 會 reject，
     * 呼叫端必須封鎖進入（RTC 端點亦會再次查核，雙重把關）。
     *
     * @param {string} channel     頻道名稱
     * @param {string} appointmentId 掛號編號
     * @param {string} roomSession 入房 session token（room.js 先換發）
     * @returns {Promise<{ok:boolean, version:string, reaffirmed:boolean}>}
     */
    function recordConsent(channel, appointmentId, roomSession) {
        var clientAt = new Date().toISOString();
        var cfg = (typeof window !== 'undefined' && window.AGORA_CONFIG) || {};
        var base = String(cfg.TOKEN_URL || '/api/agora-token').replace(/\/+$/, '');

        if (!roomSession) {
            return Promise.reject(new Error('尚未建立診間連線階段，請重新開啟連結'));
        }

        return fetch(base + '/room-consent', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Room-Session': String(roomSession)
            },
            body: JSON.stringify({
                channel: String(channel),
                appointmentId: String(appointmentId || ''),
                version: CONSENT_VERSION,
                clientAt: clientAt
            })
        }).then(function (res) {
            return res.json().catch(function () { return null; }).then(function (data) {
                if (!res.ok || !data || !data.ok) {
                    var err = new Error((data && data.message) || ('儲存同意書失敗（HTTP ' + res.status + '）'));
                    err.httpStatus = res.status;
                    err.code = data && data.error;
                    throw err;
                }
                // 伺服器確認寫入後才寫本機記錄（避免本機顯示已同意但伺服器無記錄）
                saveLocalConsent(channel, clientAt);
                return data;
            });
        });
    }

    /**
     * 醫師端監聽病人是否已簽同意書（醫師為已登入員工，經規則 canAccess 讀取）。
     * @param {string} channel 頻道名稱
     * @param {function(boolean)} cb 有／無同意記錄
     * @returns {function} 取消監聽函式
     */
    function watchConsent(channel, cb) {
        var fb = (typeof window !== 'undefined' && window.firebase) ? window.firebase : null;
        if (!fb || !fb.db || typeof fb.doc !== 'function' ||
            typeof fb.onSnapshot !== 'function') {
            return function () { /* noop */ };
        }
        var ref = fb.doc(fb.db, 'videoConsents', String(channel));
        var unsubscribe = fb.onSnapshot(ref, function (snap) {
            cb(!!(snap && typeof snap.exists === 'function' && snap.exists()));
        }, function () {
            cb(false);
        });
        return function () {
            try { unsubscribe(); } catch (e) { /* ignore */ }
        };
    }

    window.VideoConsent = {
        CONSENT_VERSION: CONSENT_VERSION,
        hasLocalConsent: hasLocalConsent,
        recordConsent: recordConsent,
        watchConsent: watchConsent
    };
})();
