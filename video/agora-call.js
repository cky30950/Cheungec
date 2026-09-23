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
 *       onPeerLeft: function (reason) {},     // 最後一位遠端離開（Quit|ServerTimeOut|BecomeAudience）
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
        '.av-root{position:absolute;inset:0;display:flex;flex-direction:column;background:#000;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"PingFang TC","Microsoft JhengHei",sans-serif;}',
        '.av-grid{flex:1;min-height:0;display:grid;gap:10px;padding:10px;grid-template-columns:1fr;grid-auto-rows:1fr;}',
        // 焦點排版：主畫面用完整高度、不留邊距；影片以 contain 完整顯示鏡頭範圍
        '.av-root.av-spotlight .av-grid{gap:0;padding:0;}',
        '.av-root.av-spotlight .av-grid > .av-tile{border-radius:0;}',
        '.av-root.av-spotlight .av-grid video{object-fit:contain;}',
        // 醫師端：對方抵達前暫時隱藏本機滿版畫面，只留「連線中…」狀態列
        '.av-root.av-spotlight .av-tile.av-local.av-local-hidden{display:none;}',
        '.av-pips{position:absolute;left:12px;right:12px;top:12px;bottom:88px;z-index:4;pointer-events:none;}',
        // 本機小畫面固定為打直的 9:16 長方框（手機自拍視角），影像置中裁切填滿
        '.av-tile.av-pip{position:absolute;top:0;right:0;width:clamp(84px,22%,140px);aspect-ratio:9/16;border:2px solid rgba(255,255,255,.45);border-radius:12px;box-shadow:0 10px 28px rgba(0,0,0,.5);pointer-events:auto;background:#000;}',
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
        hangup: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 9.6c-1.6 0-3.1.3-4.5.9V8.2c1.4-.5 2.9-.8 4.5-.8s3.1.3 4.5.8v2.3c-1.4-.6-2.9-.9-4.5-.9z" opacity=".001"/><path d="M21 15.5l-2.8-1.3a1.8 1.8 0 0 0-2.1.4l-1 1a14.7 14.7 0 0 1-6.2-6.2l1-1a1.8 1.8 0 0 0 .4-2.1L8.5 3.5A1.8 1.8 0 0 0 6.4 2.5L3.6 3A1.6 1.6 0 0 0 2.2 4.6C1.4 13 11 22.6 19.4 21.8a1.6 1.6 0 0 0 1.6-1.4l.5-2.8a1.8 1.8 0 0 0-.5-2.1z"/></svg>',
        shot: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9.8 4h4.4l.55 1.15c.24.52.76.85 1.33.85h2.42A2.5 2.5 0 0 1 21 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5v-8A2.5 2.5 0 0 1 5.5 6h2.42c.57 0 1.09-.33 1.33-.85L9.8 4zm2.2 5.2a4.1 4.1 0 1 0 0 8.2 4.1 4.1 0 0 0 0-8.2zm0 1.8a2.3 2.3 0 1 1 0 4.6 2.3 2.3 0 0 1 0-4.6z"/></svg>'
    };

    /* ---------------- Token 取得 ---------------- */
    // credentials：
    //   { idToken: '<Firebase ID Token>' }      醫師／員工端（每次請求動態取最新 token）
    //   { roomSession: '<session token>' }      病人端（無登入，以一次性 pass 換發的入房 session）
    function fetchRtcToken(tokenUrl, channel, credentials) {
        credentials = credentials || {};
        var url = String(tokenUrl).replace(/\/+$/, '') +
            '/rtc/' + encodeURIComponent(channel) + '/publisher/uid/0/';
        var init = null;
        var headers = {};
        if (credentials.roomSession) {
            // session token 走 header：不進 query string，故不進伺服器存取日誌
            headers['X-Room-Session'] = String(credentials.roomSession);
        }
        if (credentials.idToken) {
            headers['Authorization'] = 'Bearer ' + credentials.idToken;
        }
        if (Object.keys(headers).length) init = { headers: headers };
        return fetch(url, init).then(function (res) {
            if (!res.ok) {
                var err = new Error('TOKEN_HTTP_' + res.status);
                err.httpStatus = res.status;
                // 帶出伺服器錯誤碼／訊息（如 CONSENT_REQUIRED）供 UI 精確提示
                return res.json().catch(function () { return null; }).then(function (data) {
                    if (data) {
                        err.code = data.error || '';
                        err.serverMessage = data.message || '';
                    }
                    throw err;
                });
            }
            return res.json();
        }).then(function (data) {
            if (!data || !data.rtcToken) {
                throw new Error('TOKEN_BAD_RESPONSE');
            }
            return data.rtcToken;
        });
    }

    // 依 create() 帶入的鑑權方式取 token：
    //   options.authTokenProvider() → Promise<ID Token>（醫師端，可自動刷新）
    //   options.roomSession        → 入房 session token（病人端）
    function requestRtcToken(options) {
        if (typeof options.authTokenProvider === 'function') {
            return Promise.resolve()
                .then(options.authTokenProvider)
                .then(function (idToken) {
                    return fetchRtcToken(options.tokenUrl, options.channel, { idToken: idToken });
                });
        }
        return Promise.resolve(
            fetchRtcToken(options.tokenUrl, options.channel, { roomSession: options.roomSession || '' })
        );
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
            (options.enableScreenshot
                ? '    <button type="button" class="av-btn av-on av-shot" title="舌象截圖" aria-label="舌象截圖">' + ICONS.shot + '</button>'
                : '') +
            '    <button type="button" class="av-btn av-hangup" title="離開診間" aria-label="離開診間">' + ICONS.hangup + '</button>' +
            '  </div>' +
            '</div>';

        var root = container.firstElementChild;
        if (options.layout === 'spotlight') root.classList.add('av-spotlight');
        var grid = root.querySelector('.av-grid');
        var pipsLayer = root.querySelector('.av-pips');
        var statusEl = root.querySelector('.av-status');
        var statusDot = root.querySelector('.av-dot');
        var statusText = root.querySelector('.av-status-text');
        var micBtn = root.querySelector('.av-mic');
        var camBtn = root.querySelector('.av-cam');
        var shotBtn = root.querySelector('.av-shot');
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

        function onUserLeft(user, reason) {
            removeTile(String(user.uid));
            delete remoteState[String(user.uid)];
            evaluateConnection();
            // 最後一位遠端與會者離開頻道時通知上層：病人端用於自動掛斷、
            // 醫師端用於重啟獨留計時。reason：'Quit'（主動掛斷）、
            // 'ServerTimeOut'（斷線／當機逾時）、'BecomeAudience'（轉為觀眾）
            if (joined && typeof options.onPeerLeft === 'function') {
                var remaining = Object.keys(tiles).length - (tiles.local ? 1 : 0);
                if (remaining <= 0) {
                    try {
                        options.onPeerLeft(reason || '');
                    } catch (cbErr) {
                        console.warn('[AgoraCall] onPeerLeft 回呼失敗:', cbErr);
                    }
                }
            }
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
                    // 對方已實際接通：顯示本機小畫面（解除加入初期的隱藏）
                    if (tiles.local) tiles.local.classList.remove('av-local-hidden');
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

        /* ----- 舌象截圖：擷取遠端（病人）影像當前影格 ----- */
        function findRemoteVideo() {
            // spotlight 排版下遠端畫面恆在主網格；本機影像可能縮為右上角 PiP，
            // 故明確排除 .av-local，避免截到醫師自己
            var nodes = root.querySelectorAll('.av-tile:not(.av-local) video');
            var best = null;
            var bestArea = 0;
            for (var i = 0; i < nodes.length; i++) {
                var v = nodes[i];
                var w = v.videoWidth || 0;
                var h = v.videoHeight || 0;
                if (w > 0 && h > 0 && (w * h) > bestArea) {
                    best = v;
                    bestArea = w * h;
                }
            }
            return best;
        }

        function captureRemoteFrame() {
            return new Promise(function (resolve, reject) {
                var video = findRemoteVideo();
                if (!video) {
                    reject(new Error('NO_REMOTE_VIDEO'));
                    return;
                }
                var w = video.videoWidth;
                var h = video.videoHeight;
                var canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                try {
                    canvas.getContext('2d').drawImage(video, 0, 0, w, h);
                } catch (err) {
                    reject(err);
                    return;
                }
                canvas.toBlob(function (blob) {
                    if (blob) resolve(blob);
                    else reject(new Error('CAPTURE_BLOB_FAILED'));
                }, 'image/jpeg', 0.92);
            });
        }

        if (shotBtn) {
            shotBtn.addEventListener('click', function () {
                if (typeof options.onScreenshot !== 'function') return;
                try {
                    options.onScreenshot({ capture: captureRemoteFrame });
                } catch (err) {
                    console.error('[AgoraCall] 舌象截圖回呼失敗:', err);
                }
            });
        }

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
                // 同意書閘門拒發：顯示伺服器的具體原因（未同意／版本過期）
                if (err && /^CONSENT_/.test(err.code || '')) {
                    return err.serverMessage
                        || '請先完成視像診症同意書後再進入診間。';
                }
                // 401/403/404：入房 session 過期、失效或醫師登入憑證逾期
                if (err.httpStatus === 401 || err.httpStatus === 403 || err.httpStatus === 404) {
                    return typeof options.authTokenProvider === 'function'
                        ? '登入憑證已逾期，請重新整理頁面後再試。'
                        : (err && err.serverMessage)
                            || '診間連結已失效或過期，請聯絡診所重新索取連結。';
                }
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
                ? requestRtcToken(options)
                : Promise.resolve(null);

            return tokenPromise.then(function (token) {
                // 病人端 token 綁定後端派生的專屬 uid（不帶萬用 uid 0），
                // join 必須帶同一 uid；醫師端不指定，由 Agora 配置
                return Promise.all([
                    client.join(options.appId, options.channel, token, options.uid || null),
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

                // 醫師端在對方實際接通前隱藏自己的滿版畫面（只顯示連線狀態），
                // track 仍正常發布；evaluateConnection 偵測到對方後解除
                if (options.hideLocalUntilPeer) localTile.classList.add('av-local-hidden');

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
            requestRtcToken(options).then(function (token) {
                return client.renewToken(token);
            }).then(function () {
                console.log('[AgoraCall] Token 已自動續期');
            }).catch(function (err) {
                console.error('[AgoraCall] Token 續期失敗:', err);
            });
        }

        function cleanupSdk() {
            // 先停止接收斷線後才傳回的事件，避免收尾途中又觸發畫面更新
            if (client) { try { client.removeAllListeners(); } catch (e) { /* ignore */ } }

            // 立刻關閉音視頻軌道：馬上釋放鏡頭/麥克風（瀏覽器列號燈熄滅）
            var tracks = [localAudio, localVideo].filter(Boolean);
            tracks.forEach(function (t) { try { t.close(); } catch (e) { /* ignore */ } });
            localAudio = null;
            localVideo = null;

            var clientRef = client;
            client = null;
            joined = false;

            if (!clientRef) return Promise.resolve();

            // 網路已斷時，SDK 的 leave（底層 WebSocket）可能數分鐘才逾時。
            // 本機資源已全部釋放，故最多只等 5 秒即完成掛斷；leave 請求仍在背景繼續，
            // 網路恢復時伺服器側頻道狀態一樣會清除（且對方端本來就會憑 peer 狀態判斷離線）。
            var leavePromise = clientRef.leave().catch(function (e) {
                console.warn('[AgoraCall] client.leave 失敗（多為網路已斷線，可忽略）:', e && e.message ? e.message : e);
            });
            var guard = new Promise(function (resolve) { setTimeout(resolve, 5000); });
            return Promise.race([leavePromise, guard]);
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
            // join 前亦可呼叫，用於顯示「等待對方進入診間…」等狀態
            setStatus: function (kind, text) { emitStatus(kind, text); },
            toggleMic: function () { micBtn.click(); },
            toggleCamera: function () { camBtn.click(); },
            captureRemoteFrame: captureRemoteFrame,
            isJoined: function () { return joined; }
        };
    }

    window.AgoraCall = { create: create };
})();
