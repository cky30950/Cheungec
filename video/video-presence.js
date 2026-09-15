/* ============================================================
 * VideoPresence — 視訊診間「雙方就緒」信號（Firestore）
 * ------------------------------------------------------------
 * 目的：Agora 計費從用戶加入頻道即開始（單人在頻道內亦按
 * 音頻分鐘計費）。因此雙方在真正加入 Agora 頻道前，先在
 * Firestore 完成就緒廣播；確認對方也在線後，兩端才幾乎同時
 * join 頻道，把「未連接」的計費時間降到接近零。
 *
 * 機制：
 *   - 雙方共寫同一文件：videoPresence/<頻道名稱>
 *       { doctor: { at: <用戶端毫秒>, sid: <會話識別> },
 *         patient: { at: ..., sid: ... } }
 *   - 每 5 秒更新一次自己的心跳；對方心跳在 15 秒內視為在線
 *   - 異常斷線／關閉分頁無法主動清除時，靠心跳過期自動失效
 *
 * 用法：
 *   var p = VideoPresence.waitPeer('doctor', channel);
 *   p.ready.then(function () { call.join(); })
 *          .catch(function () { 信號服務不可用，退回直接加入; });
 *   // 離開時：p.leave();
 *
 * 若頁面未載入 Firebase，ready 會直接 reject，呼叫方應退回
 * 原本「立即加入」的行為，避免信號服務故障導致無法看診。
 * ============================================================ */

(function () {
    'use strict';

    var COLLECTION = 'videoPresence';
    var HEARTBEAT_MS = 5000;    // 心跳更新間隔
    var FRESH_MS = 15000;       // 對方心跳 15 秒內視為在線

    function getFirebase() {
        return (typeof window !== 'undefined' && window.firebase) ? window.firebase : null;
    }

    // role 必須是 'doctor' 或 'patient'；對方角色自動推導
    function peerRoleOf(role) {
        return role === 'doctor' ? 'patient' : 'doctor';
    }

    /**
     * 廣播自己就緒，並等待對方就緒。
     * @returns {{ready: Promise, leave: Function}}
     */
    function waitPeer(role, channel) {
        var peerRole = peerRoleOf(role);
        var settled = false;
        var heartbeatTimer = null;
        var unsubscribe = null;
        var docRef = null;

        var ready = new Promise(function (resolve, reject) {
            var fb = getFirebase();
            if (!fb || !fb.db || typeof fb.doc !== 'function' ||
                typeof fb.setDoc !== 'function' || typeof fb.onSnapshot !== 'function') {
                reject(new Error('FIREBASE_UNAVAILABLE'));
                return;
            }

            var sid = String(Date.now()) + '-' + Math.random().toString(36).slice(2, 10);
            docRef = fb.doc(fb.db, COLLECTION, String(channel));

            function payload() {
                var data = {};
                data[role] = { at: Date.now(), sid: sid };
                return data;
            }

            // 心跳寫入：失敗不致命，下次心跳再試
            function heartbeatWrite() {
                fb.setDoc(docRef, payload(), { merge: true }).catch(function (err) {
                    console.warn('[VideoPresence] 心跳寫入失敗:', err);
                });
            }

            function stop() {
                if (heartbeatTimer) {
                    clearInterval(heartbeatTimer);
                    heartbeatTimer = null;
                }
                if (unsubscribe) {
                    try { unsubscribe(); } catch (e) { /* ignore */ }
                    unsubscribe = null;
                }
            }

            function fail(err) {
                if (settled) return;
                settled = true;
                stop();
                reject(err || new Error('PRESENCE_FAILED'));
            }

            var isFresh = function (peer) {
                return !!(peer && typeof peer.at === 'number' && peer.at > 0 &&
                    Date.now() - peer.at <= FRESH_MS);
            };

            // 首次廣播自己就緒（失敗需向上拋，讓呼叫方退回直接加入）
            fb.setDoc(docRef, payload(), { merge: true }).then(function () {
                heartbeatTimer = setInterval(heartbeatWrite, HEARTBEAT_MS);

                unsubscribe = fb.onSnapshot(
                    docRef,
                    function (snap) {
                        if (settled) return;
                        var data = snap && snap.data ? snap.data() : null;
                        if (data && isFresh(data[peerRole])) {
                            settled = true;
                            resolve();
                        }
                    },
                    function (err) {
                        // 權限不足或網路錯誤等：無法使用信號服務，交由呼叫方退回
                        console.warn('[VideoPresence] 就緒狀態監聽失敗:', err);
                        fail(err);
                    }
                );
            }).catch(function (err) {
                console.warn('[VideoPresence] 就緒廣播失敗:', err);
                fail(err);
            });
        });

        // 離開／掛斷：停止心跳、取消監聽，並把自己的心跳標記為失效
        function leave() {
            if (heartbeatTimer) {
                clearInterval(heartbeatTimer);
                heartbeatTimer = null;
            }
            if (unsubscribe) {
                try { unsubscribe(); } catch (e) { /* ignore */ }
                unsubscribe = null;
            }
            var fb = getFirebase();
            if (docRef && fb && typeof fb.setDoc === 'function') {
                var payload = {};
                payload[role] = { at: 0 };
                fb.setDoc(docRef, payload, { merge: true }).catch(function () { /* ignore */ });
            }
        }

        return { ready: ready, leave: leave };
    }

    window.VideoPresence = { waitPeer: waitPeer };
})();
