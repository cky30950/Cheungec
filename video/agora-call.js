/* ============================================================
 * AgoraCall — Agora RTC SDK 4.x 原生 API 封裝（自建介面）
 * ------------------------------------------------------------
 * 醫師端（video-consultation.js）與病人端（room.js）共用。
 *
 * 用法：
 *   var call = AgoraCall.create(container, {
 *       appId: '...', channel: 'tcm-consult-123',
 *       tokenUrl: '/api/agora-token',   // 留空＝無 Token 模式
 *       localName: '我（醫師）',
 *       remoteName: '陳大文',           // 遠端顯示名（選填）
 *       onStatus: function (kind, text) {},   // connecting|waiting|connected|error|left
 *       onParticipants: function (count) {},  // 含自己在內的人數
 *       onError: function (message, detail) {},
 *       onLeft: function () {},
 *       layout: 'grid'                 // 選填，'grid'（預設並排）或 'spotlight'（遠端滿版、本機小畫面）
 *   });
 *   await call.join();
 *   call.toggleMic(); call.toggleCamera(); call.leave();
 *
 * 介面（樣式類別前綴 av-）以內嵌 <style> 注入，不依賴 Tailwind。
 * ============================================================ */

(function () {
    'use strict';

    var RTC = window.AgoraRTC;

    /* ---------------- 樣式（只注入一次） ---------------- */
    var STYLE_ID = 'agora-call-style';
    var CSS = [
        '.av-root{position:absolute;inset:0;display:flex;flex-direction:column;background:#0b1220;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"PingFang TC","Microsoft JhengHei",sans-serif;}',
        '.av-grid{flex:1;min-height:0;display:grid;gap:10px;padding:10px;grid-template-columns:1fr;grid-auto-rows:1fr;}',
        '.av-pips{position:absolute;left:12px;right:12px;top:12px;bottom:88px;z-index:4;pointer-events:none;}',
        '.av-tile.av-pip{position:absolute;top:0;right:0;width:clamp(96px,26%,210px);aspect-ratio:16/10;border:2px solid rgba(255,255,255,.45);border-radius:12px;box-shadow:0 10px 28px rgba(0,0,0,.5);pointer-events:auto;}',
        '.av-tile.av-pip .av-namebar{display:none;}',
        '.av-tile.av-pip .av-avatar{width:42%;min-width:38px;max-width:64px;font-size:clamp(18px,3vw,28px);}',
        '.av-tile{position:relative;background:#111827;border-radius:12px;overflow:hidden;min-height:0;display:flex;align-items:center;justify-content:center;}',
        '.av-media{position:absolute;inset:0;}',
        '.av-media video{width:100%;height:100%;object-fit:cover;display:block;}',
        '.av-local .av-media video{transform:scaleX(-1);}',
        '.av-avatar{position:relative;z-index:1;width:24%;aspect-ratio:1/1;min-width:64px;max-width:130px;border-radius:9999px;background:linear-gradient(135deg,#2563eb,#0ea5e9);color:#fff;display:flex;align-items:center;justify-content:center;font-size:clamp(28px,5vw,52px);font-weight:700;user-select:none;}',
        '.av-namebar{position:absolute;z-index:3;left:8px;bottom:8px;display:flex;align-items:center;gap:6px;background:rgba(0,0,0,.55);color:#fff;font-size:13px;line-height:1;padding:6px 10px;border-radius:999px;max-width:calc(100% - 16px);}',
        '.av-namebar span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
        '.av-badge{font-size:13px;line-height:1;}',
        '.av-status{position:absolute;z-index:5;top:14px;left:50%;transform:translateX(-50%);display:inline-flex;align-items:center;gap:8px;background:rgba(0,0,0,.6);color:#fff;font-size:14px;font-weight:500;padding:7px 16px;border-radius:9999px;white-space:nowrap;backdrop-filter:blur(4px);}',
        '.av-dot{width:9px;height:9px;border-radius:9999px;background:#fbbf24;animation:av-pulse 1.2s ease-in-out infinite;}',
        '.av-dot.av-green{background:#34d399;animation:none;}',
        '.av-dot.av-red{background:#f87171;animation:none;}',
        '@keyframes av-pulse{0%,100%{opacity:1}50%{opacity:.35}}',
        '.av-bar{flex:none;display:flex;align-items:center;justify-content:center;gap:18px;padding:14px;background:#0f172a;border-top:1px solid #1e293b;}',
        '.av-btn{width:52px;height:52px;border-radius:9999px;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;background:#1f2937;color:#f9fafb;transition:background .15s,transform .1s;}',
        '.av-btn:hover{background:#374151;}',
        '.av-btn:active{transform:scale(.94);}',
        '.av-btn.av-on{background:#374151;}',
        '.av-btn.av-off{background:#ef4444;}',
        '.av-btn.av-off:hover{background:#dc2626;}',
        '.av-btn svg{width:24px;height:24px;}',
        '.av-hangup{width:60px;height:60px;background:#dc2626;}',
        '.av-hangup:hover{background:#b91c1c;}',
        '.av-hangup svg{width:28px;height:28px;}'
    ].join('');

    function injectStyle() {
        if (document.getElementById(STYLE_ID)) return;
        var style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = CSS;
        document.head.appendChild(style);
    }

    // 正式環境將 SDK 日誌降為 WARNING，避免 console 被 DEBUG 訊息洗版
    try {
        if (RTC && typeof RTC.setLogLevel === 'function') {
            RTC.setLogLevel(2); // 0=DEBUG 1=INFO 2=WARNING 3=ERROR 4=NONE
        }
    } catch (e) { /* ignore */ }

    var ICONS = {
        micOn: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3z"/><path d="M19 11a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.92V21a1 1 0 1 0 2 0v-3.08A7 7 0 0 0 19 11z"/></svg>',
        micOff: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 9a3 3 0 0 1 5.12-2.13L9 9.89V9z"/><path d="M12 14a3 3 0 0 0 2.06-.81L10.5 9.67A3 3 0 0 0 12 14z" opacity=".45"/><path d="M19 11a1 1 0 1 0-2 0 5 5 0 0 1-.27 1.63l1.47 1.47A7 7 0 0 0 19 11z" opacity=".45"/><path d="M5 11a1 1 0 1 0-2 0c0 .65.09 1.28.27 1.88l1.64-1.64A5 5 0 0 1 5 11z"/><path d="M3.7 2.3a1 1 0 0 0-1.4 1.4l16 16a1 1 0 0 0 1.4-1.4l-16-16z"/></svg>',
        camOn: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 11.9 9.8 8.6a.6.6 0 0 0-.9.52v5.76a.6.6 0 0 0 .9.52l5.7-3.3a.6.6 0 0 0 0-1.04z"/><rect x="2.5" y="6" width="13" height="12" rx="2.5"/></svg>',
        camOff: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3.7 2.3a1 1 0 0 0-1.4 1.4l2.2 2.2V18a2 2 0 0 0 2 2h11a2 2 0 0 0 1.2-.4l1.6 1.6a1 1 0 0 0 1.4-1.4l-18-17.5zM13.5 12.1 8.5 7.2V7A1.5 1.5 0 0 1 10 5.5h5A1.5 1.5 0 0 1 16.5 7v3.5l4-2.3v7.6l-4-2.3v.5l-3-2.9z"/></svg>',
        hangup: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 9.6c-1.6 0-3.1.3-4.5.9V8.2c1.4-.5 2.9-.8 4.5-.8s3.1.3 4.5.8v2.3c-1.4-.6-2.9-.9-4.5-.9z" opacity=".001"/><path d="M21 15.5l-2.8-1.3a1.8 1.8 0 0 0-2.1.4l-1 1a14.7 14.7 0 0 1-6.2-6.2l1-1a1.8 1.8 0 0 0 .4-2.1L8.5 3.5A1.8 1.8 0 0 0 6.4 2.5L3.6 3A1.6 1.6 0 0 0 2.2 4.6C1.4 13 11 22.6 19.4 21.8a1.6 1.6 0 0 0 1.6-1.4l.5-2.8a1.8 1.8 0 0 0-.5-2.1z"/></svg>'
    };

    /* ---------------- Token 取得 ---------------- */
    function fetchRtcToken(tokenUrl, channel) {
        var url = String(tokenUrl).replace(/\/+$/, '') +
            '/rtc/' + encodeURIComponent(channel) + '/publisher/uid/0/';
        return fetch(url).then(function (res) {
            if (!res.ok) {
                var err = new Error('TOKEN_HTTP_' + res.status);
                err.httpStatus = res.status;
                throw err;
            }
            return res.json();
        }).then(function (data) {
            if (!data || !data.rtcToken) {
                throw new Error('TOKEN_BAD_RESPONSE');
            }
            return data.rtcToken;
        });
    }

    function initialOf(name) {
        var s = String(name || '?').trim();
        return s ? s.charAt(0).toUpperCase() : '?';
    }

    /* ---------------- Call 工廠 ---------------- */
    function create(container, options) {
        injectStyle();
        options = options || {};

        var client = null;
        var localAudio = null;
        var localVideo = null;
        var localUid = 0;
        var joined = false;
        var leaving = false;
        var micEnabled = true;
        var camEnabled = true;
        var tiles = {};          // uid -> tile 元素（local 用 'local'）
        var remoteState = {};    // uid -> {audio:bool, video:bool, name:string}
        var participantCount = 0;
        var leftFired = false;

        /* ----- DOM ----- */
        container.innerHTML =
            '<div class="av-root">' +
            '  <div class="av-status"><span class="av-dot"></span><span class="av-status-text">連線中…</span></div>' +
            '  <div class="av-grid"></div>' +
            '  <div class="av-pips"></div>' +
            '  <div class="av-bar">' +
            '    <button type="button" class="av-btn av-on av-mic" title="開關麥克風" aria-label="開關麥克風">' + ICONS.micOn + '</button>' +
            '    <button type="button" class="av-btn av-on av-cam" title="開關鏡頭" aria-label="開關鏡頭">' + ICONS.camOn + '</button>' +
            '    <button type="button" class="av-btn av-hangup" title="離開診間" aria-label="離開診間">' + ICONS.hangup + '</button>' +
            '  </div>' +
            '</div>';

        var root = container.firstElementChild;
        var grid = root.querySelector('.av-grid');
        var pipsLayer = root.querySelector('.av-pips');
        var statusEl = root.querySelector('.av-status');
        var statusDot = root.querySelector('.av-dot');
        var statusText = root.querySelector('.av-status-text');
        var micBtn = root.querySelector('.av-mic');
        var camBtn = root.querySelector('.av-cam');
        var hangupBtn = root.querySelector('.av-hangup');

        function emitStatus(kind, text) {
            statusText.textContent = text;
            statusDot.className = 'av-dot' + (kind === 'connected' ? ' av-green' : kind === 'error' ? ' av-red' : '');
            if (typeof options.onStatus === 'function') options.onStatus(kind, text);
        }

        function refreshParticipants() {
            var count = Object.keys(tiles).length;
            if (count !== participantCount) {
                participantCount = count;
                if (typeof options.onParticipants === 'function') options.onParticipants(count);
            }

            var cols;
            if (options.layout === 'spotlight') {
                // 焦點排版：遠端畫面佔滿主要區域；本機影像在有遠端與會者時
                // 縮為右上角小畫面（PiP），無人加入時仍滿版顯示自己的畫面。
                var remoteCount = Math.max(0, count - (tiles.local ? 1 : 0));
                cols = remoteCount <= 1 ? 1 : remoteCount <= 4 ? 2 : 3;

                var localTile = tiles.local;
                if (localTile) {
                    if (remoteCount > 0) {
                        if (localTile.parentNode !== pipsLayer) pipsLayer.appendChild(localTile);
                        localTile.classList.add('av-pip');
                    } else {
                        if (localTile.parentNode !== grid) grid.appendChild(localTile);
                        localTile.classList.remove('av-pip');
                    }
                }
            } else {
                // 1 人直向滿版、2 人左右、3-4 人兩欄、5+ 三欄
                cols = count <= 1 ? 1 : count <= 4 ? 2 : 3;
            }
            grid.style.gridTemplateColumns = 'repeat(' + cols + ', 1fr)';
        }

        function setTileName(tile, name, micOn, camOn) {
            tile.querySelector('.av-name-text').textContent = name;
            tile.querySelector('.av-badge-mic').textContent = micOn ? '🎤' : '🔇';
            var avatar = tile.querySelector('.av-avatar');
            var badgeCam = tile.querySelector('.av-badge-cam');
            avatar.style.display = camOn ? 'none' : 'flex';
            badgeCam.textContent = camOn ? '' : '🚫📷';
        }

        function buildTile(key, name, isLocal) {
            if (tiles[key]) return tiles[key];
            var tile = document.createElement('div');
            tile.className = 'av-tile' + (isLocal ? ' av-local' : '');
            tile.innerHTML =
                '<div class="av-media"></div>' +
                '<div class="av-avatar">' + initialOf(name) + '</div>' +
                '<div class="av-namebar">' +
                '  <span class="av-badge av-badge-mic">🎤</span>' +
                '  <span class="av-badge av-badge-cam"></span>' +
                '  <span class="av-name-text"></span>' +
                '</div>';
            grid.appendChild(tile);
            tiles[key] = tile;
            setTileName(tile, name, true, true);
            refreshParticipants();
            return tile;
        }

        function removeTile(key) {
            var tile = tiles[key];
            if (tile) {
                tile.remove();
                delete tiles[key];
                refreshParticipants();
            }
        }

        /* ----- Agora 事件 ----- */
        function playRemoteVideo(track, tile) {
            try {
                track.play(tile.querySelector('.av-media'));
            } catch (err) {
                // 少數瀏覽器首次自動播放受限時，於首次使用者點擊後可恢復
                console.warn('[AgoraCall] 遠端影像播放失敗，稍候重試:', err);
                setTimeout(function () {
                    try { track.play(tile.querySelector('.av-media')); } catch (e2) { /* ignore */ }
                }, 800);
            }
        }

        function playRemoteAudio(track) {
            try {
                track.play();
            } catch (err) {
                // 必須在點擊手勢後播放；若首次被瀏覽器擋下，短暫延後重試
                console.warn('[AgoraCall] 遠端聲音播放失敗，稍候重試:', err);
                setTimeout(function () {
                    try { track.play(); } catch (e2) { /* ignore */ }
                }, 800);
            }
        }

        function onUserPublished(user, mediaType) {
            var key = String(user.uid);
            // 必須「同步」建立共享狀態物件：audio 與 video 的 user-published 會
            // 先後觸發，若在非同步 subscribe 回呼內才建立，兩者會各自擁有獨立
            // 狀態，後完成者覆蓋先完成者（例如 mic 狀態被還原成靜音）。
            var st = remoteState[key];
            if (!st) {
                st = { audio: false, video: false, name: options.remoteName || ('參與者 ' + user.uid) };
                remoteState[key] = st;
            }
            var tile = buildTile(key, st.name, false);
            client.subscribe(user, mediaType).then(function () {
                if (mediaType === 'video') {
                    st.video = true;
                    if (user.videoTrack) playRemoteVideo(user.videoTrack, tile);
                } else if (mediaType === 'audio') {
                    st.audio = true;
                    if (user.audioTrack) playRemoteAudio(user.audioTrack);
                }
                setTileName(tile, st.name, st.audio, st.video);
                evaluateConnection();
            }).catch(function (err) {
                console.error('[AgoraCall] subscribe 失敗:', err);
            });
        }

        function onUserUnpublished(user, mediaType) {
            var key = String(user.uid);
            var tile = tiles[key];
            var st = remoteState[key];
            if (!tile || !st) return;
            if (mediaType === 'video') {
                st.video = false;
            } else if (mediaType === 'audio') {
                st.audio = false;
            }
            setTileName(tile, st.name, st.audio, st.video);
        }

        function onUserLeft(user) {
            removeTile(String(user.uid));
            delete remoteState[String(user.uid)];
            evaluateConnection();
        }

        function onUserInfoUpdated(uid, msg) {
            var key = String(uid);
            var tile = tiles[key];
            var st = remoteState[key];
            if (!tile || !st) return;
            if (msg === 'mute-audio') st.audio = false;
            else if (msg === 'unmute-audio') st.audio = true;
            else if (msg === 'mute-video') st.video = false;
            else if (msg === 'unmute-video') st.video = true;
            else return;
            setTileName(tile, st.name, st.audio, st.video);
        }

        function evaluateConnection() {
            var remoteCount = Object.keys(tiles).length - (tiles.local ? 1 : 0);
            if (joined) {
                if (remoteCount > 0) {
                    emitStatus('connected', '已連線（通話中 ' + (remoteCount + 1) + ' 人）');
                } else {
                    emitStatus('waiting', options.waitingText || '已進入診間，等待對方加入…');
                }
            }
        }

        /* ----- 控制鈕 ----- */
        micBtn.addEventListener('click', function () {
            if (!localAudio) return;
            micEnabled = !micEnabled;
            localAudio.setEnabled(micEnabled).then(function () {
                micBtn.innerHTML = micEnabled ? ICONS.micOn : ICONS.micOff;
                micBtn.className = 'av-btn ' + (micEnabled ? 'av-on' : 'av-off');
                var tile = tiles.local;
                if (tile) {
                    tile.querySelector('.av-badge-mic').textContent = micEnabled ? '🎤' : '🔇';
                }
            }).catch(function (err) {
                micEnabled = !micEnabled;
                console.error('[AgoraCall] 麥克風切換失敗:', err);
            });
        });

        camBtn.addEventListener('click', function () {
            if (!localVideo) return;
            camEnabled = !camEnabled;
            localVideo.setEnabled(camEnabled).then(function () {
                camBtn.innerHTML = camEnabled ? ICONS.camOn : ICONS.camOff;
                camBtn.className = 'av-btn ' + (camEnabled ? 'av-on' : 'av-off');
                var tile = tiles.local;
                if (tile) {
                    var st = { camOn: camEnabled };
                    tile.querySelector('.av-avatar').style.display = camEnabled ? 'none' : 'flex';
                    tile.querySelector('.av-badge-cam').textContent = camEnabled ? '' : '🚫📷';
                }
            }).catch(function (err) {
                camEnabled = !camEnabled;
                console.error('[AgoraCall] 鏡頭切換失敗:', err);
            });
        });

        hangupBtn.addEventListener('click', function () {
            leave();
        });

        /* ----- 生命週期 ----- */
        function describeDeviceError(err) {
            var name = err && (err.name || err.message) || '';
            if (/NotAllowed|PermissionDenied|SecurityError/i.test(name)) {
                return '請允許瀏覽器使用鏡頭與麥克風（可按網址列左側鎖頭圖示調整權限）後重新進入。';
            }
            if (/NotFound|DevicesNotFound|Overconstrained/i.test(name)) {
                return '找不到鏡頭或麥克風，請確認設備已連接。';
            }
            if (/NotReadable|TrackStartError|DeviceInUse/i.test(name)) {
                return '鏡頭或麥克風正被其他程式佔用，請關閉其他視訊應用程式（如 FaceTime、Zoom）後再試。';
            }
            if (/TOKEN_HTTP_/.test(name)) {
                return '視訊伺服器連線失敗（錯誤 ' + (err.httpStatus || '') + '），請聯絡診所或稍後再試。';
            }
            if (/TOKEN_BAD_RESPONSE/.test(name)) {
                return '視訊伺服器回應異常，請聯絡診所。';
            }
            return '無法開啟視訊：' + (err && err.message ? err.message : name);
        }

        function join() {
            if (joined) return Promise.resolve();
            if (!RTC) {
                var sdkErr = 'Agora RTC SDK 未載入';
                emitStatus('error', sdkErr);
                if (typeof options.onError === 'function') options.onError(sdkErr);
                return Promise.reject(new Error(sdkErr));
            }

            emitStatus('connecting', '連線中…');

            client = RTC.createClient({ mode: 'rtc', codec: 'vp8' });
            client.on('user-published', onUserPublished);
            client.on('user-unpublished', onUserUnpublished);
            client.on('user-left', onUserLeft);
            client.on('user-info-updated', onUserInfoUpdated);

            // Token 即將到期／已到期時自動續期
            client.on('token-privilege-will-expire', renewToken);
            client.on('token-privilege-did-expire', renewToken);

            var tokenPromise = options.tokenUrl
                ? fetchRtcToken(options.tokenUrl, options.channel)
                : Promise.resolve(null);

            return tokenPromise.then(function (token) {
                return Promise.all([
                    client.join(options.appId, options.channel, token, null),
                    RTC.createMicrophoneAudioTrack({ encoderConfig: 'speech_standard' }),
                    RTC.createCameraVideoTrack({ encoderConfig: '720p_1' })
                ]);
            }).then(function (results) {
                localUid = results[0];
                localAudio = results[1];
                localVideo = results[2];
                joined = true;

                var localTile = buildTile('local', options.localName || '我', true);
                localVideo.play(localTile.querySelector('.av-media'), { mirror: true });
                // 本地音軌不播放，避免自己聽到自己的回音

                return client.publish([localAudio, localVideo]);
            }).then(function () {
                evaluateConnection();
                return localUid;
            }).catch(function (err) {
                console.error('[AgoraCall] join 失敗:', err);
                var message = describeDeviceError(err);
                emitStatus('error', '連線失敗');
                if (typeof options.onError === 'function') options.onError(message, err);
                cleanupSdk();
                throw err;
            });
        }

        function renewToken() {
            if (!options.tokenUrl || !client || !joined) return;
            fetchRtcToken(options.tokenUrl, options.channel).then(function (token) {
                return client.renewToken(token);
            }).then(function () {
                console.log('[AgoraCall] Token 已自動續期');
            }).catch(function (err) {
                console.error('[AgoraCall] Token 續期失敗:', err);
            });
        }

        function cleanupSdk() {
            var tracks = [localAudio, localVideo].filter(Boolean);
            var leavePromise = client ? client.leave().catch(function (e) {
                console.error('[AgoraCall] client.leave 失敗:', e);
            }) : Promise.resolve();
            tracks.forEach(function (t) { try { t.close(); } catch (e) { /* ignore */ } });
            localAudio = null;
            localVideo = null;
            return leavePromise.then(function () {
                if (client) {
                    client.removeAllListeners();
                    client = null;
                }
                joined = false;
            });
        }

        function leave() {
            if (leaving) return Promise.resolve();
            leaving = true;
            emitStatus('left', '已離開診間');

            var done = function () {
                if (!leftFired) {
                    leftFired = true;
                    if (typeof options.onLeft === 'function') options.onLeft();
                }
            };
            return cleanupSdk().then(done, done);
        }

        function destroy() {
            container.innerHTML = '';
        }

        return {
            join: join,
            leave: leave,
            destroy: destroy,
            toggleMic: function () { micBtn.click(); },
            toggleCamera: function () { camBtn.click(); },
            isJoined: function () { return joined; }
        };
    }

    window.AgoraCall = { create: create };
})();
