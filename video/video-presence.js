/* ============================================================
 * VideoPresence — 視訊診間「雙方就緒」信號（Firestore）
 * ------------------------------------------------------------
 * 目的：Agora 計費從用戶加入頻道即開始（即使只有單人在頻道內，
 * 亦按音頻分鐘計費）。因此雙方在真正加入 Agora 頻道前，先在
 * Firestore 完成就緒廣播，確認對方也在線後才進入頻道。
 *
 * 兩階段信號（雙方等待期間皆不進頻道、完全不計費）：
 *   1) 心跳就緒：{ at, sid, joined:false } — 頁面已開啟、設備已備妥
 *      （病人端在發送心跳前會先通過鏡頭／麥克風授權探測）
 *   2) 已加入：雙方心跳交會後，由「醫師」先 client.join，成功後呼叫
 *      markJoined()，心跳改寫 { at, sid, joined:true }；病人端以
 *      requirePeerJoined 等待此信號，確認醫師真的已在 Agora 頻道內
 *      才加入。故醫師不來病人可無限免費等，反之亦然；
 *      任一方單獨在頻道的時間僅最後接通的 1~2 秒。
 *
 * 機制：
 *   - 雙方共寫同一文件：videoPresence/<頻道名稱>
 *       { doctor: { at: <Firestore 伺服器時間>, sid, joined },
 *         patient: { at: <Firestore 伺服器時間>, sid, joined } }
 *   - 每 5 秒更新一次自己的心跳（就緒後仍持續，直到 leave），
 *     時間一律用 serverTimestamp，判讀時以同一文件內自己的
 *     伺服器時間為基準，完全不受雙方設備時鐘誤差影響
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
 *   // 醫師：等病人心跳新鮮即先加入，再 markJoined
 *   var p = VideoPresence.waitPeer('doctor', channel);
 *   p.ready.then(function () { return call.join(); })
 *          .then(function () { p.markJoined(); })
 *          .catch(function (err) { 信號不可用時，退回直接加入; });
 *   // 病人：等醫師 joined 才加入（不設 timeoutMs 即無限免費等待）
 *   var p2 = VideoPresence.waitPeer('patient', channel, { requirePeerJoined: true });
 *   p2.ready.then(function () { call.join(); });
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
     * @param {object} [opts]
     *   - timeoutMs：超時毫秒（逾時 reject PRESENCE_TIMEOUT）；0／不設為無限等待
     *   - requirePeerJoined：true 時除了對方心跳新鮮，還必須對方 joined===true
     *     （表示對方已成功 join Agora）才 resolve（醫師端使用）
     * @returns {{ready: Promise, leave: Function, markJoined: Function}}
     */
    function waitPeer(role, channel, opts) {
        opts = opts || {};
        var peerRole = peerRoleOf(role);
        var heartbeatMs = DEFAULT_HEARTBEAT_MS;
        var freshMs = DEFAULT_FRESH_MS;
        var requirePeerJoined = !!opts.requirePeerJoined;
        // 過渡相容：對方心跳新鮮但遲遲沒有 joined（舊版客戶端快取），
        // 寬限到期後仍放行（退回舊版同步加入行為）
        var joinedGraceMs = typeof opts.requirePeerJoinedGraceMs === 'number'
            ? opts.requirePeerJoinedGraceMs : 30000;

        var settled = false;
        var joinedFlag = false; // 自己是否已成功加入 Agora（markJoined 後為 true）
        var heartbeatTimer = null;
        var watchdogTimer = null;
        var graceTimer = null;
        var unsubscribe = null;
        var docRef = null;
        var setDocFn = null;
        var onSnapshotFn = null;
        var serverTimestampFn = null;
        // 最近一次已解析的自己心跳伺服器時間（快照中自己的 serverTimestamp
        // 在下次寫入後會短暫為 null，故保留最後有效值）
        var lastOwnServerTs = null;
        var sid = String(Date.now()) + '-' + Math.random().toString(36).slice(2, 10);

        function stopTimers() {
            if (heartbeatTimer) {
                clearInterval(heartbeatTimer);
                heartbeatTimer = null;
            }
            if (watchdogTimer) {
                clearTimeout(watchdogTimer);
                watchdogTimer = null;
            }
            if (graceTimer) {
                clearTimeout(graceTimer);
                graceTimer = null;
            }
        }

        function stop() {
            stopTimers();
            if (unsubscribe) {
                try { unsubscribe(); } catch (e) { /* ignore */ }
                unsubscribe = null;
            }
        }

        function ownPayload(joined) {
            var data = {};
            data[role] = { at: serverTimestampFn(), sid: sid, joined: !!joined };
            return data;
        }

        // 自己已成功加入 Agora 頻道：立刻把 joined:true 寫出，
        // 之後的心跳也維持 joined:true，直到 leave
        function markJoined() {
            joinedFlag = true;
            if (docRef && setDocFn && serverTimestampFn) {
                setDocFn(docRef, ownPayload(true), { merge: true }).catch(function (err) {
                    console.warn('[VideoPresence] joined 信號寫入失敗:', err);
                });
            }
        }

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

            function payload() {
                return ownPayload(joinedFlag);
            }

            function heartbeatWrite() {
                setDocFn(docRef, payload(), { merge: true }).catch(function (err) {
                    console.warn('[VideoPresence] 心跳寫入失敗:', err);
                });
            }

            function succeed() {
                if (settled) return;
                settled = true;
                // 條件達成：取消監聽與逾時計時器，但「心跳繼續」——
                // 對方可能還在 join 途中，需持續看到自己的新鮮心跳與 joined 狀態，
                // 直到呼叫 leave 才停止。
                if (watchdogTimer) { clearTimeout(watchdogTimer); watchdogTimer = null; }
                if (unsubscribe) {
                    try { unsubscribe(); } catch (e) { /* ignore */ }
                    unsubscribe = null;
                }
                resolve();
            }

            function fail(err) {
                if (settled) return;
                settled = true;
                stop();
                reject(err || new Error('PRESENCE_FAILED'));
            }

            // 只判斷對方心跳是否新鮮（joined 條件於快照回呼中另行判斷）
            var peerFresh = function (data) {
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

            function armJoinedGraceOnce() {
                if (graceTimer || !joinedGraceMs || joinedGraceMs <= 0) return;
                graceTimer = setTimeout(function () {
                    graceTimer = null;
                    // 對方是舊版客戶端（不會寫 joined）：寬限後放行
                    console.warn('[VideoPresence] 未收到對方 joined 信號，以相容模式放行');
                    succeed();
                }, joinedGraceMs);
            }

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
                        if (!peerFresh(data)) return;
                        // 對方心跳新鮮：要嘛 joined 已確認，要嘛啟動舊版相容寬限
                        var peer = data[peerRole] || {};
                        if (!requirePeerJoined || peer.joined === true) {
                            succeed();
                        } else {
                            armJoinedGraceOnce();
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
            if (heartbeatTimer || watchdogTimer || unsubscribe) stop();
            joinedFlag = false;
            var fb = getFirebase();
            if (docRef && fb && typeof fb.setDoc === 'function') {
                var data = {};
                data[role] = { at: 0, joined: false };
                fb.setDoc(docRef, data, { merge: true }).catch(function () { /* ignore */ });
            }
        }

        return { ready: ready, leave: leave, markJoined: markJoined };
    }

    window.VideoPresence = { waitPeer: waitPeer };
})();
