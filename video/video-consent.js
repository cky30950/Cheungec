/* ============================================================
 * VideoConsent — 視像診症電子同意書
 * ------------------------------------------------------------
 * 病人在進入診間（鏡頭探測／Agora）前必須先同意：
 *   - 本機 localStorage 依「診間（頻道）」記錄同意版本與時間，
 *     同一掛號再次進入不重複詢問；同意書版本更新時會重新要求
 *   - 同時寫一筆 Firestore 記錄 videoConsents/<頻道> 供醫師端
 *     即時查核（離線或規則未發布時不阻斷看診，僅本機記錄）
 *
 * 安全規則（建議在 Firebase Console → Firestore 發布）：
 *   match /videoConsents/{channelId} {
 *     allow get: if channelId.matches('tcm-consult-.{1,64}');
 *     allow create: if channelId.matches('tcm-consult-.{1,64}')
 *       && request.resource.data.keys()
 *          .hasOnly(['channel','appointmentId','version','clientAt','at','userAgent']);
 *   }
 * ============================================================ */

(function () {
    'use strict';

    var CONSENT_VERSION = 'v1';
    var COLLECTION = 'videoConsents';
    var LS_PREFIX = 'tcm-video-consent:';
    var FIRESTORE_VERSION = '10.7.1';
    // localStorage 不可用（隱私模式）時的當次工作階段備援
    var memory = {};

    function storageKey(channel) {
        return LS_PREFIX + String(channel);
    }

    function getFirebase() {
        return (typeof window !== 'undefined' && window.firebase) ? window.firebase : null;
    }

    // 本機是否已同意「目前版本」的同意書
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

    function getServerTimestamp() {
        return import('https://www.gstatic.com/firebasejs/' + FIRESTORE_VERSION +
            '/firebase-firestore.js').then(function (mod) {
            if (typeof mod.serverTimestamp !== 'function') {
                throw new Error('serverTimestamp unavailable');
            }
            return mod.serverTimestamp();
        });
    }

    /**
     * 記錄同意：本機必定寫入；Firestore 查核記錄採盡力送達。
     * @returns {Promise} 永遠 resolve（Firestore 失敗不阻斷看診）
     */
    function recordConsent(channel, appointmentId) {
        var clientAt = new Date().toISOString();
        saveLocalConsent(channel, clientAt);

        return getServerTimestamp().then(function (stamp) {
            var fb = getFirebase();
            if (!fb || !fb.db || typeof fb.doc !== 'function' ||
                typeof fb.setDoc !== 'function') {
                throw new Error('FIREBASE_UNAVAILABLE');
            }
            // 文件 ID = 頻道：同一掛號只有一筆同意記錄（規則僅允許新建）
            var ref = fb.doc(fb.db, COLLECTION, String(channel));
            return fb.setDoc(ref, {
                channel: String(channel),
                appointmentId: String(appointmentId || ''),
                version: CONSENT_VERSION,
                clientAt: clientAt,
                at: stamp,
                userAgent: String(navigator.userAgent || '').slice(0, 300)
            });
        }).catch(function (err) {
            console.warn('[VideoConsent] 同意查核記錄寫入失敗（本機已記錄，不影響進入）:', err);
        });
    }

    /**
     * 醫師端監聽病人是否已簽同意書。
     * @param {string} channel 頻道名稱
     * @param {function(boolean)} cb 有／無同意記錄
     * @returns {function} 取消監聽函式
     */
    function watchConsent(channel, cb) {
        var fb = getFirebase();
        if (!fb || !fb.db || typeof fb.doc !== 'function' ||
            typeof fb.onSnapshot !== 'function') {
            return function () { /* noop */ };
        }
        var ref = fb.doc(fb.db, COLLECTION, String(channel));
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
