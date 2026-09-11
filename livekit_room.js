/**
 * LiveKit 視訊共用核心（醫師系統頁 + 病人 video.html 共用）
 *
 * 用法：
 *   const session = window.LiveKitVideo.createSession(container, {
 *     mode: 'doctor' | 'patient',
 *     onLeave: () => { ... },
 *     onError: (msg) => { ... },
 *     onInvite: () => { ... }   // 僅 doctor 模式的「複製病人連結」
 *   });
 *   await session.connect(url, token);
 *   await session.leave();
 *
 * 依賴 livekit-client ESM（透過 CDN 動態載入，不需要打包工具）。
 */
(function () {
  'use strict';

  var SDK_URL =
    'https://cdn.jsdelivr.net/npm/livekit-client@2.22.3/dist/livekit-client.esm.mjs';
  var sdkPromise = null;
  function loadSdk() {
    if (!sdkPromise) sdkPromise = import(SDK_URL);
    return sdkPromise;
  }

  var ICONS = {
    mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><path d="M12 19v3"/>',
    micOff:
      '<path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6"/><path d="M5 10a7 7 0 0 0 10.71 6m2.37-2.4A7 7 0 0 0 19 10"/><path d="M12 19v3"/><path d="m2 2 20 20"/>',
    video:
      '<path d="m22 8-6 4 6 4V8Z"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
    videoOff:
      '<path d="M10.66 6H14a2 2 0 0 1 2 2v2.34l1 1L22 8v8"/><path d="M16 16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2l10 10Z"/><path d="m2 2 20 20"/>',
    share:
      '<path d="M13 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-3"/><path d="M8 21h8"/><path d="M12 17v4"/><path d="m17 8 5-5"/><path d="M17 3h5v5"/>',
    users:
      '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    link:
      '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    fullscreen:
      '<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>',
    fullscreenExit:
      '<path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>',
    hangup:
      '<path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.94 12.94 0 0 0 2.81.7A2 2 0 0 1 22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91"/><path d="m22 2-20 20"/>'
  };

  function svgIcon(name) {
    return (
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5 pointer-events-none">' +
      ICONS[name] +
      '</svg>'
    );
  }

  var cssInjected = false;
  function injectCss() {
    if (cssInjected) return;
    cssInjected = true;
    var css = [
      '.lk-shell{position:relative;display:flex;flex-direction:column;height:100%;min-height:20rem;background:#0f172a;border-radius:.75rem;overflow:hidden;}',
      '.lk-stage{position:relative;flex:1 1 auto;min-height:0;display:grid;gap:.5rem;padding:.5rem;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));grid-auto-rows:1fr;align-content:center;overflow:hidden;background:#020617}',
      '.lk-tile{position:relative;background:#1e293b;border-radius:.6rem;overflow:hidden;min-height:150px;display:flex;align-items:center;justify-content:center}',
      '.lk-tile video{width:100%;height:100%;object-fit:cover}',
      '.lk-tile.lk-self video{transform:scaleX(-1)}',
      '.lk-tile.lk-speaking{box-shadow:0 0 0 2px #4ade80}',
      '.lk-tile.lk-share{grid-column:1/-1;min-height:230px}',
      '.lk-tile audio{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}',
      '.lk-name{position:absolute;left:.5rem;bottom:.5rem;background:rgba(0,0,0,.6);color:#fff;font-size:.75rem;line-height:1;padding:.3rem .55rem;border-radius:.4rem;white-space:nowrap;max-width:90%;overflow:hidden;text-overflow:ellipsis}',
      '.lk-avatar{width:4.5rem;height:4.5rem;border-radius:9999px;background:#334155;color:#e2e8f0;display:flex;align-items:center;justify-content:center;font-size:1.75rem;font-weight:600}',
      '.lk-bar{display:flex;align-items:center;gap:.4rem;padding:.55rem .7rem;background:#111827;flex-wrap:wrap}',
      '.lk-btn{display:inline-flex;align-items:center;justify-content:center;gap:.35rem;background:rgba(255,255,255,.12);color:#fff;border-radius:.55rem;padding:.5rem .7rem;font-size:.8rem;line-height:1;transition:background .15s ease;cursor:pointer;border:0;white-space:nowrap}',
      '.lk-btn:hover:not(:disabled){background:rgba(255,255,255,.24)}',
      '.lk-btn.off{background:#dc2626;color:#fff}',
      '.lk-btn.off:hover:not(:disabled){background:#b91c1c}',
      '.lk-btn:disabled{opacity:.45;cursor:not-allowed}',
      '.lk-btn.danger{background:#dc2626}',
      '.lk-btn.danger:hover:not(:disabled){background:#b91c1c}',
      '.lk-spacer{flex:1 1 auto}',
      '.lk-count{background:rgba(0,0,0,.35);border-radius:.6rem;padding:.05rem .4rem;font-size:.7rem}',
      '.lk-overlay{position:absolute;inset:0;z-index:8;display:none;align-items:center;justify-content:center;background:rgba(2,6,23,.72);color:#e2e8f0;text-align:center;padding:1.25rem}',
      '.lk-overlay.show{display:flex}',
      '.lk-overlay-title{font-size:1.05rem;font-weight:600;margin-bottom:.4rem}',
      '.lk-overlay-sub{font-size:.85rem;color:#94a3b8;margin-bottom:1rem;max-width:22rem}',
      '.lk-overlay-action{background:#2563eb;color:#fff;border:0;border-radius:.55rem;padding:.55rem 1.2rem;font-size:.85rem;cursor:pointer}',
      '.lk-pop{position:absolute;left:.7rem;bottom:4.3rem;z-index:9;display:none;min-width:13rem;max-width:16rem;background:#1f2937;color:#e5e7eb;border-radius:.6rem;padding:.45rem .6rem;font-size:.8rem;box-shadow:0 10px 30px rgba(0,0,0,.45);max-height:45%;overflow:auto}',
      '.lk-pop.show{display:block}',
      '.lk-pop-item{display:flex;align-items:center;gap:.45rem;padding:.3rem .2rem;border-bottom:1px solid rgba(255,255,255,.08)}',
      '.lk-pop-item:last-child{border-bottom:0}',
      '.lk-dot{width:.55rem;height:.55rem;border-radius:9999px;flex:0 0 auto}',
      '.lk-dot.on{background:#4ade80}',
      '.lk-dot.off{background:#64748b}',
      '.lk-pop-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    ].join('\n');
    var styleEl = document.createElement('style');
    styleEl.setAttribute('data-livekit-style', '1');
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  }

  function shellHtml(mode) {
    return (
      '<div class="lk-shell">' +
      '<div class="lk-stage" data-lk-stage></div>' +
      '<div class="lk-overlay" data-lk-overlay>' +
      '<div>' +
      '<div class="lk-overlay-title" data-lk-overlay-title></div>' +
      '<div class="lk-overlay-sub" data-lk-overlay-sub></div>' +
      '<button type="button" class="lk-overlay-action" data-lk-overlay-action></button>' +
      '</div>' +
      '</div>' +
      '<div class="lk-pop" data-lk-pop></div>' +
      '<div class="lk-bar">' +
      '<button type="button" class="lk-btn" data-lk-btn="mic" title="麥克風" disabled>' + svgIcon('mic') + '</button>' +
      '<button type="button" class="lk-btn" data-lk-btn="cam" title="攝影機" disabled>' + svgIcon('video') + '</button>' +
      (mode === 'doctor'
        ? '<button type="button" class="lk-btn" data-lk-btn="share" title="分享螢幕" disabled>' + svgIcon('share') + '</button>'
        : '') +
      '<button type="button" class="lk-btn" data-lk-btn="users" title="參與者"><span>' + svgIcon('users') + '</span><span class="lk-count" data-lk-count>1</span></button>' +
      (mode === 'doctor'
        ? '<button type="button" class="lk-btn" data-lk-btn="invite" title="複製病人加入連結">' + svgIcon('link') + '</button>'
        : '') +
      '<span class="lk-spacer"></span>' +
      '<button type="button" class="lk-btn" data-lk-btn="fs" title="全螢幕">' + svgIcon('fullscreen') + '</button>' +
      '<button type="button" class="lk-btn danger" data-lk-btn="leave" title="離開通話">' + svgIcon('hangup') + '</button>' +
      '</div>' +
      '</div>'
    );
  }

  function requestToken(tokenEndpoint, payload, idToken) {
    var headers = { 'Content-Type': 'application/json' };
    if (idToken) headers.Authorization = 'Bearer ' + idToken;
    return fetch(tokenEndpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload)
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new Error(data.error || '簽 token 失敗（HTTP ' + res.status + '）');
        return data;
      });
    });
  }

  function createSession(root, options) {
    injectCss();
    options = options || {};
    var mode = options.mode === 'patient' ? 'patient' : 'doctor';
    root.innerHTML = shellHtml(mode);

    var shell = root.querySelector('.lk-shell');
    var stage = root.querySelector('[data-lk-stage]');
    var overlay = root.querySelector('[data-lk-overlay]');
    var overlayTitle = root.querySelector('[data-lk-overlay-title]');
    var overlaySub = root.querySelector('[data-lk-overlay-sub]');
    var overlayAction = root.querySelector('[data-lk-overlay-action]');
    var pop = root.querySelector('[data-lk-pop]');
    var btnMic = root.querySelector('[data-lk-btn="mic"]');
    var btnCam = root.querySelector('[data-lk-btn="cam"]');
    var btnShare = root.querySelector('[data-lk-btn="share"]');
    var btnUsers = root.querySelector('[data-lk-btn="users"]');
    var btnInvite = root.querySelector('[data-lk-btn="invite"]');
    var btnFs = root.querySelector('[data-lk-btn="fs"]');
    var btnLeave = root.querySelector('[data-lk-btn="leave"]');
    var countEl = root.querySelector('[data-lk-count]');

    var room = null;
    var RoomEvent = null;
    var Track = null;
    var connected = false;
    var manualLeave = false;
    var videoTiles = {}; // identity|source -> {tile, video, avatar, sid}
    var audioEls = {}; // identity -> audio element

    function reportError(message) {
      if (typeof options.onError === 'function') options.onError(message);
    }

    function showOverlay(title, sub, actionLabel, onAction) {
      overlayTitle.textContent = title || '';
      overlaySub.textContent = sub || '';
      if (actionLabel && typeof onAction === 'function') {
        overlayAction.textContent = actionLabel;
        overlayAction.onclick = onAction;
        overlayAction.style.display = '';
      } else {
        overlayAction.style.display = 'none';
        overlayAction.onclick = null;
      }
      overlay.classList.add('show');
    }
    function hideOverlay() {
      overlay.classList.remove('show');
    }

    function initialsOf(name) {
      var n = (name || '?').trim();
      return n ? n.charAt(0).toUpperCase() : '?';
    }

    function videoKey(identity, source) {
      return identity + '|' + source;
    }

    function attachVideo(pub, participant, isLocal) {
      var key = videoKey(participant.identity, pub.source);
      if (videoTiles[key] || !pub.track) return;

      var tile = document.createElement('div');
      tile.className = 'lk-tile' +
        (isLocal ? ' lk-self' : '') +
        (String(pub.source) === String(Track.Source.ScreenShare) ? ' lk-share' : '');
      tile.setAttribute('data-identity', participant.identity);

      var avatar = document.createElement('div');
      avatar.className = 'lk-avatar';
      avatar.textContent = initialsOf(participant.name || participant.identity);

      var video = document.createElement('video');
      video.autoplay = true;
      video.playsInline = true;
      video.muted = !!isLocal;
      try {
        pub.track.attach(video);
      } catch (e) {
        console.warn('附加影片軌道失敗', e);
      }

      var label = document.createElement('div');
      label.className = 'lk-name';
      label.textContent = String(pub.source) === String(Track.Source.ScreenShare)
        ? (participant.name || participant.identity) + ' 的螢幕'
        : (participant.name || participant.identity);

      tile.appendChild(avatar);
      tile.appendChild(video);
      tile.appendChild(label);
      if (pub.isMuted) {
        video.style.display = 'none';
      } else {
        avatar.style.display = 'none';
      }
      stage.appendChild(tile);
      videoTiles[key] = { tile: tile, video: video, avatar: avatar, sid: pub.trackSid };
    }

    function detachVideo(identity, source) {
      var key = videoKey(identity, source);
      var entry = videoTiles[key];
      if (!entry) return;
      if (entry.tile.parentNode) entry.tile.parentNode.removeChild(entry.tile);
      delete videoTiles[key];
    }

    function attachAudio(participant, isLocal) {
      if (isLocal || audioEls[participant.identity]) return;
      var pub = participant.getTrackPublication(Track.Source.Microphone);
      if (!pub || !pub.track) return;
      var audio = document.createElement('audio');
      audio.autoplay = true;
      try {
        pub.track.attach(audio);
      } catch (e) {
        console.warn('附加音訊軌道失敗', e);
      }
      shell.appendChild(audio);
      audioEls[participant.identity] = audio;
    }

    function detachAudio(identity) {
      var audio = audioEls[identity];
      if (audio && audio.parentNode) audio.parentNode.removeChild(audio);
      delete audioEls[identity];
    }

    function syncParticipant(participant, isLocal) {
      var pubs = participant.getTrackPublications();
      for (var i = 0; i < pubs.length; i++) {
        var pub = pubs[i];
        if (String(pub.kind) === 'video') attachVideo(pub, participant, isLocal);
        else if (String(pub.kind) === 'audio') attachAudio(participant, isLocal);
      }
    }

    function removeParticipantMedia(identity) {
      Object.keys(videoTiles).forEach(function (key) {
        if (key.indexOf(identity + '|') === 0) {
          var entry = videoTiles[key];
          if (entry.tile.parentNode) entry.tile.parentNode.removeChild(entry.tile);
          delete videoTiles[key];
        }
      });
      detachAudio(identity);
    }

    function updateMuteVisuals(participant, isLocal) {
      var sources = [Track.Source.Camera, Track.Source.ScreenShare];
      sources.forEach(function (source) {
        var entry = videoTiles[videoKey(participant.identity, source)];
        if (!entry) return;
        var pub = participant.getTrackPublication(source);
        var muted = !pub || pub.isMuted || !pub.track;
        entry.video.style.display = muted ? 'none' : '';
        entry.avatar.style.display = muted ? '' : 'none';
      });
    }

    function eachRemote(fn) {
      if (!room) return;
      if (room.remoteParticipants instanceof Map) {
        room.remoteParticipants.forEach(fn);
      } else {
        Object.keys(room.remoteParticipants).forEach(function (id) {
          fn(room.remoteParticipants[id]);
        });
      }
    }

    function remoteCount() {
      if (!room) return 0;
      return room.remoteParticipants instanceof Map
        ? room.remoteParticipants.size
        : Object.keys(room.remoteParticipants).length;
    }

    function updateWaiting() {
      if (!connected) return;
      if (remoteCount() === 0) {
        if (mode === 'doctor') {
          showOverlay('等候病人加入', '病人尚未進入診症室，可點下方連結圖示複製邀請連結傳給病人。');
        } else {
          showOverlay('等候醫師進入', '醫師尚未開始視訊診症，請稍候，醫師進入後會自動接通。');
        }
      } else {
        hideOverlay();
      }
    }

    function mediaStateOf(participant, source) {
      var pub = participant.getTrackPublication(source);
      return !!(pub && pub.track && !pub.isMuted);
    }

    function refreshRoster() {
      if (!room) {
        pop.innerHTML = '';
        countEl.textContent = '0';
        return;
      }
      var list = [];
      var local = room.localParticipant;
      list.push({
        name: (local.name || local.identity) + (mode === 'doctor' ? '（醫師）' : '（我）'),
        mic: mediaStateOf(local, Track.Source.Microphone),
        cam: mediaStateOf(local, Track.Source.Camera)
      });
      eachRemote(function (rp) {
        list.push({
          name: rp.name || rp.identity,
          mic: mediaStateOf(rp, Track.Source.Microphone),
          cam: mediaStateOf(rp, Track.Source.Camera)
        });
      });
      countEl.textContent = String(list.length);
      pop.innerHTML = list.map(function (item) {
        return '<div class="lk-pop-item">' +
          '<span class="lk-dot ' + (item.mic ? 'on' : 'off') + '" title="麥克風"></span>' +
          '<span class="lk-dot ' + (item.cam ? 'on' : 'off') + '" title="攝影機"></span>' +
          '<span class="lk-pop-name">' + escapeHtml(item.name) + '</span>' +
          '</div>';
      }).join('');
    }

    function refreshButtons() {
      if (!room) return;
      var lp = room.localParticipant;
      var micOn = mediaStateOf(lp, Track.Source.Microphone);
      var camOn = mediaStateOf(lp, Track.Source.Camera);
      var sharing = mediaStateOf(lp, Track.Source.ScreenShare);
      btnMic.classList.toggle('off', !micOn);
      btnMic.innerHTML = svgIcon(micOn ? 'mic' : 'micOff');
      btnCam.classList.toggle('off', !camOn);
      btnCam.innerHTML = svgIcon(camOn ? 'video' : 'videoOff');
      if (btnShare) {
        btnShare.classList.toggle('off', !sharing);
      }
    }

    function refreshAll() {
      refreshButtons();
      refreshRoster();
      updateMuteVisuals(room.localParticipant, true);
      eachRemote(function (rp) { updateMuteVisuals(rp, false); });
      updateWaiting();
    }

    function onFullscreenChange() {
      btnFs.innerHTML = svgIcon(document.fullscreenElement === shell ? 'fullscreenExit' : 'fullscreen');
    }
    document.addEventListener('fullscreenchange', onFullscreenChange);

    btnFs.addEventListener('click', function () {
      try {
        if (document.fullscreenElement === shell) {
          document.exitFullscreen();
        } else if (shell.requestFullscreen) {
          shell.requestFullscreen();
        }
      } catch (e) {
        reportError('全螢幕功能無法使用：' + friendlyError(e));
      }
    });

    btnLeave.addEventListener('click', function () {
      session.leave();
    });
    btnUsers.addEventListener('click', function () {
      refreshRoster();
      pop.classList.toggle('show');
    });
    if (btnInvite) {
      btnInvite.addEventListener('click', function () {
        if (typeof options.onInvite === 'function') options.onInvite();
      });
    }

    function bindToggle(btn, fn) {
      btn.addEventListener('click', function () {
        if (!connected) return;
        btn.disabled = true;
        Promise.resolve()
          .then(fn)
          .catch(function (e) {
            reportError(friendlyError(e));
          })
          .then(function () {
            btn.disabled = false;
            refreshButtons();
          });
      });
    }

    bindToggle(btnMic, function () {
      var lp = room.localParticipant;
      return lp.setMicrophoneEnabled(!mediaStateOf(lp, Track.Source.Microphone));
    });
    bindToggle(btnCam, function () {
      var lp = room.localParticipant;
      return lp.setCameraEnabled(!mediaStateOf(lp, Track.Source.Camera));
    });
    if (btnShare) {
      bindToggle(btnShare, function () {
        var lp = room.localParticipant;
        var willShare = !mediaStateOf(lp, Track.Source.ScreenShare);
        return lp.setScreenShareEnabled(willShare).then(function () {
          if (willShare) showToastSharingHint();
        });
      });
    }
    function showToastSharingHint() {
      // 病人端沒有 showToast；僅醫師端依 onError 管道提示可選，故安靜處理。
    }

    function registerRoomEvents(roomInstance, events) {
      var lp = roomInstance.localParticipant;

      roomInstance.on(events.Reconnecting, function () {
        showOverlay('視訊重新連線中…', '網路不穩，正在嘗試重新連接。');
      });
      roomInstance.on(events.Reconnected, refreshAll);

      roomInstance.on(events.ParticipantConnected, function (p) {
        syncParticipant(p, false);
        refreshRoster();
        updateWaiting();
      });
      roomInstance.on(events.ParticipantDisconnected, function (p) {
        removeParticipantMedia(p.identity);
        refreshRoster();
        updateWaiting();
      });

      roomInstance.on(events.TrackSubscribed, function (_track, pub, participant) {
        if (participant) syncParticipant(participant, false);
        refreshRoster();
      });
      roomInstance.on(events.TrackUnsubscribed, function (_track, pub, participant) {
        if (!participant) return;
        if (String(pub.kind) === 'video') detachVideo(participant.identity, pub.source);
        else if (String(pub.kind) === 'audio') detachAudio(participant.identity);
        refreshRoster();
      });

      lp.on(events.LocalTrackPublished, function (pub) {
        syncParticipant(lp, true);
        refreshButtons();
        refreshRoster();
        updateMuteVisuals(lp, true);
      });
      lp.on(events.LocalTrackUnpublished, function (pub) {
        detachVideo(lp.identity, pub.source);
        refreshButtons();
        refreshRoster();
      });

      roomInstance.on(events.TrackMuted, function (pub, participant) {
        if (participant) updateMuteVisuals(participant, participant === lp);
        refreshButtons();
        refreshRoster();
      });
      roomInstance.on(events.TrackUnmuted, function (pub, participant) {
        if (participant) updateMuteVisuals(participant, participant === lp);
        refreshButtons();
        refreshRoster();
      });

      roomInstance.on(events.ActiveSpeakersChanged, function (speakers) {
        var activeIds = {};
        (speakers || []).forEach(function (p) { activeIds[p.identity] = true; });
        Object.keys(videoTiles).forEach(function (key) {
          var identity = key.split('|')[0];
          videoTiles[key].tile.classList.toggle('lk-speaking', !!activeIds[identity]);
        });
      });

      roomInstance.on(events.Disconnected, function () {
        connected = false;
        [btnMic, btnCam, btnShare].forEach(function (b) { if (b) b.disabled = true; });
        stage.innerHTML = '';
        videoTiles = {};
        audioEls = {};
        pop.classList.remove('show');
        countEl.textContent = '0';
        if (!manualLeave) {
          showOverlay(
            '視訊連線中斷',
            '與伺服器的連線已斷開，請重新進入診症室。',
            mode === 'doctor' ? '關閉視訊' : '返回',
            function () { if (typeof options.onLeave === 'function') options.onLeave(); }
          );
        }
      });
    }

    function friendlyError(e) {
      var msg = e && e.message ? e.message : String(e);
      if (/NotAllowedError|Permission denied/i.test(msg)) {
        return '瀏覽器拒絕了攝影機／麥克風權限，請在網址列左邊的權限設定中允許後重試。';
      }
      if (/NotFoundError/i.test(msg)) return '找不到攝影機或麥克風裝置。';
      if (/NotReadableError/i.test(msg)) return '攝影機／麥克風正被其他程式佔用，請關閉後重試。';
      return msg;
    }

    var session = {
      connect: function (url, token) {
        manualLeave = false;
        showOverlay('連線中…', '正在進入視訊診症室。');
        return loadSdk().then(function (sdk) {
          RoomEvent = sdk.RoomEvent;
          Track = sdk.Track;
          room = new sdk.Room({
            adaptiveStream: true,
            dynacast: true,
            videoCaptureDefaults: {
              resolution: sdk.VideoPresets
                ? undefined
                : { width: 640, height: 480, frameRate: 24 }
            }
          });
          registerRoomEvents(room, RoomEvent);
          return room.connect(url, token).then(function () {
            connected = true;
            [btnMic, btnCam, btnShare].forEach(function (b) { if (b) b.disabled = false; });
            var lp = room.localParticipant;
            return lp.enableCameraAndMicrophone().then(function () {
              refreshAll();
            }).catch(function (e) {
              console.warn('同時開啟攝影機與麥克風失敗，改為個別嘗試', e);
              var tasks = [
                lp.setMicrophoneEnabled(true).catch(function (err) { reportError(friendlyError(err)); }),
                lp.setCameraEnabled(true).catch(function (err) { reportError(friendlyError(err)); })
              ];
              return Promise.all(tasks).then(function () {
                refreshAll();
              });
            });
          });
        }).catch(function (e) {
          console.error('LiveKit 連線失敗', e);
          showOverlay(
            '無法進入視訊診症室',
            friendlyError(e),
            '關閉',
            function () { if (typeof options.onLeave === 'function') options.onLeave(); }
          );
          throw e;
        });
      },
      leave: function () {
        manualLeave = true;
        hideOverlay();
        var disconnecting = room ? Promise.resolve(room.disconnect()).catch(function () {}) : Promise.resolve();
        return disconnecting.then(function () {
          room = null;
          connected = false;
          if (typeof options.onLeave === 'function') options.onLeave();
        });
      }
    };

    return session;
  }

  function escapeHtml(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  window.LiveKitVideo = {
    createSession: createSession,
    requestToken: requestToken
  };
})();
