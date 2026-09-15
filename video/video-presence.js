/* ============================================================
 * VideoPresence — 視訊診間「雙方就緒」信號（Firestore）
 * ------------------------------------------------------------
 * 目的：Agora 計費從用戶加入頻道即開始（即使只有單人在頻道內，
 * 亦按音頻分鐘計費）。因此雙方在真正加入 Agora 頻道前，先在
 * Firestore 完成就緒廣播；確認對方也在線後，兩端才幾乎同時
 * join 頻道，把「未連接」的計費時間降到接近零。
 *
 * 機制：
 *   - 雙方共寫同一文件：videoPresence/<頻道名稱>
 *       { doctor: { at: <Firestore 伺服器時間>, sid: <會話識別> },
 *         patient: { at: <Firestore 伺服器時間>, sid: ... } }
 *   - 每 5 秒更新一次自己的心跳，時間一律用 serverTimestamp，
 *     判讀時以同一文件內自己的伺服器時間為基準，完全不受雙方
 *     設備時鐘誤差影響
 *   - 對方心跳距自己最近一次心跳的伺服器時間在 15 秒內視為在線
 *   - 異常斷線／關閉分頁無法主動清除時，靠心跳停止更新而失效
 *
 * 安全規則（必須在 Firebase Console → Firestore → 規則發布）：
 *   match /videoPresence/{channelId} {
 *     allow get: if channelId.matches('tcm-consult-.{1,64}');
 *     allow create, update: if channelId.matches('tcm-consult-.{1,64}')
 *       && request.resource.data.keys().hasOnly(['doctor','patient']);
 *   }
 *
 * 用法：
 *   var p = VideoPresence.waitPeer('doctor', channel, { timeoutMs: 45000 });
 *   p.ready.then(function () { call.join(); })
 *          .catch(function (err) { 信號不可用或超時，退回直接加入; });
 *   // 離開時：p.leave();
 * ============================================================ */

(function () {
    'use strict';

    var COLLECTION = 'videoPresence';
    var FIRESTORE_VERSION = '10.7.1';
    var FIRESTORE_MODULE_URL =
        'https://www.gstatic.com/firebasejs/' + FIRESTORE_VERSION + '/firebase-firestore.js';

    var DEFAULT_HEARTBEAT_MS = 5000;  // 心跳更新間隔
    var DEFAULT_FRESH_MS = 15000;     // 對方落後自己伺服器時間 15 秒內視為在線

    function getFirebase() {
        return (typeof window !== 'undefined' && window.firebase) ? window.firebase : null;
    }

    function peerRoleOf(role) {
        return role === 'doctor' ? 'patient' : 'doctor';
    }

    // 將 Firestore Timestamp 轉毫秒；無效值（含 serverTimestamp 尚未解析的 null）回 null
    function tsMillis(value) {
        return (value && typeof value.toMillis === 'function') ? value.toMillis() : null;
    }

    /**
     * 廣播自己就緒，並等待對方就緒。
     * @param {string} role 'doctor' | 'patient'
     * @param {string} channel 完整 Agora 頻道名稱
     * @param {object} [opts] timeoutMs：超時毫秒（逾時 reject PRESENCE_TIMEOUT）
     * @returns {{ready: Promise, leave: Function}}
     */
    function waitPeer(role, channel, opts) {
        opts = opts || {};
        var peerRole = peerRoleOf(role);
        var heartbeatMs = DEFAULT_HEARTBEAT_MS;
        var freshMs = DEFAULT_FRESH_MS;

        var settled = false;
        var heartbeatTimer = null;
        var watchdogTimer = null;
        var unsubscribe = null;
        var docRef = null;
        var setDocFn = null;
        var onSnapshotFn = null;
        var serverTimestampFn = null;
        // 最近一次已解析的自己心跳伺服器時間（快照中自己的 serverTimestamp
        // 在下次寫入後會短暫為 null，故保留最後有效值）
        var lastOwnServerTs = null;

        var ready = new Promise(function (resolve, reject) {
            var fb = getFirebase();
            if (!fb || !fb.db || typeof fb.doc !== 'function' ||
                typeof fb.setDoc !== 'function' || typeof fb.onSnapshot !== 'function') {
                reject(new Error('FIREBASE_UNAVAILABLE'));
                return;
            }
            setDocFn = fb.setDoc;
            onSnapshotFn = fb.onSnapshot;
            docRef = fb.doc(fb.db, COLLECTION, String(channel));

            var sid = String(Date.now()) + '-' + Math.random().toString(36).slice(2, 10);

            function payload() {
                var data = {};
                data[role] = { at: serverTimestampFn(), sid: sid };
                return data;
            }

            function heartbeatWrite() {
                setDocFn(docRef, payload(), { merge: true }).catch(function (err) {
                    console.warn('[VideoPresence] 心跳寫入失敗:', err);
                });
            }

            function stopTimers() {
                if (heartbeatTimer) {
                    clearInterval(heartbeatTimer);
                    heartbeatTimer = null;
                }
                if (watchdogTimer) {
                    clearTimeout(watchdogTimer);
                    watchdogTimer = null;
                }
            }

            function stop() {
                stopTimers();
                if (unsubscribe) {
                    try { unsubscribe(); } catch (e) { /* ignore */ }
                    unsubscribe = null;
                }
            }

            function succeed() {
                if (settled) return;
                settled = true;
                // 雙方已互相看到：不再需要心跳與監聽（掛斷時 leave 會補記 at:0）
                stop();
                resolve();
            }

            function fail(err) {
                if (settled) return;
                settled = true;
                stop();
                reject(err || new Error('PRESENCE_FAILED'));
            }

            var isFresh = function (data) {
                if (!data) return false;
                var own = data[role] || null;
                var peer = data[peerRole] || null;
                var ownTs = tsMillis(own ? own.at : null);
                var peerTs = tsMillis(peer ? peer.at : null);
                if (ownTs !== null) lastOwnServerTs = ownTs;
                // 必須先取得過自己的伺服器時間，且對方伺服器時間與自己接近
                return peerTs !== null && lastOwnServerTs !== null &&
                    peerTs >= lastOwnServerTs - freshMs;
            };

            // serverTimestamp 需從 Firestore 模組取得（經 CDN 動態匯入，
            // 與 firebase_init.js 使用同一版本）
            import(FIRESTORE_MODULE_URL).then(function (firestoreMod) {
                serverTimestampFn = firestoreMod.serverTimestamp;
                if (typeof serverTimestampFn !== 'function') {
                    throw new Error('serverTimestamp unavailable');
                }

                if (opts.timeoutMs && opts.timeoutMs > 0) {
                    watchdogTimer = setTimeout(function () {
                        var err = new Error('PRESENCE_TIMEOUT');
                        err.code = 'PRESENCE_TIMEOUT';
                        fail(err);
                    }, opts.timeoutMs);
                }

                // 首次廣播自己就緒（失敗需向上拋，讓呼叫方退回直接加入）
                return setDocFn(docRef, payload(), { merge: true });
            }).then(function () {
                if (settled) return;
                heartbeatTimer = setInterval(heartbeatWrite, heartbeatMs);

                unsubscribe = onSnapshotFn(
                    docRef,
                    function (snap) {
                        if (settled) return;
                        var data = snap && snap.data ? snap.data() : null;
                        if (isFresh(data)) succeed();
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

        // 離開／掛斷：停止心跳、取消監聽，並把自己的心跳標記為失效（at:0）
        function leave() {
            if (heartbeatTimer || watchdogTimer || unsubscribe) stop();
            var fb = getFirebase();
            if (docRef && fb && typeof fb.setDoc === 'function') {
                var data = {};
                data[role] = { at: 0 };
                fb.setDoc(docRef, data, { merge: true }).catch(function () { /* ignore */ });
            }
        }

        return { ready: ready, leave: leave };
    }

    window.VideoPresence = { waitPeer: waitPeer };
})();
