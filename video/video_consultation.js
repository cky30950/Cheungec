/**
 * 醫師端視訊診症（系統頁 system.html 專用）— 雙方確認制
 *
 * 狀態機：
 *   idle（未開啟）
 *     → lobby（等候大廳：完全不連 LiveKit，只透過 Firestore 等候病人申請）
 *       pending：病人申請中 → 醫師可「接納並開始 / 拒絕」
 *     → accepting（醫師接納，向 CF 取新 token 並連入 LiveKit）
 *     → call（通話中）
 *
 * 只有 accepting 之後才會連入 LiveKit，確認前 LiveKit 零流量。
 * 掛斷或關閉面板：write status=ended/declined，病人端即時得知。
 */
(function () {
  'use strict';

  var config = window.LIVEKIT_CONFIG || {};

  // phase: 'idle' | 'lobby' | 'accepting' | 'call'
  var phase = 'idle';
  var closing = false;
  var session = null;
  var unsubscribe = null;
  var currentRoom = null;
  var patientJoinUrl = null;
  var lastStatus = null;
  var formHiddenObserver = null;

  var PENDING_TTL_MS = 30 * 60 * 1000; // 超過 30 分鐘的 pending 視為過期

  function $(id) {
    return document.getElementById(id);
  }

  function notify(message, type) {
    if (typeof window.showToast === 'function') {
      window.showToast(message, type || 'info');
    } else {
      console.log('[視訊]', message);
    }
  }

  function escapeHtml(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* -------------------------------------------------------------- */
  /* 標題按鈕                                                        */
  /* -------------------------------------------------------------- */

  function setButtonState(state) {
    var btn = $('toggleVideoConsultBtn');
    if (!btn) return;
    var label = btn.querySelector('[data-video-btn-label]');
    if (state === 'active') {
      btn.disabled = false;
      // 關閉態的白底綠字／綠 hover 必須一併移走，否則 class 並存會互相覆蓋
      btn.classList.remove(
        'opacity-70', 'cursor-wait',
        'bg-white', 'text-green-700', 'hover:bg-green-50'
      );
      btn.classList.add('bg-red-500', 'hover:bg-red-600', 'text-white');
      label.textContent = '關閉視訊';
    } else {
      btn.disabled = false;
      btn.classList.remove(
        'opacity-70', 'cursor-wait',
        'bg-red-500', 'hover:bg-red-600', 'text-white'
      );
      btn.classList.add('bg-white', 'text-green-700', 'hover:bg-green-50');
      label.textContent = '視訊診症';
    }
  }

  /* -------------------------------------------------------------- */
  /* 診症語境                                                        */
  /* -------------------------------------------------------------- */

  function getCurrentAppointmentId() {
    try {
      if (typeof currentConsultingAppointmentId !== 'undefined' && currentConsultingAppointmentId) {
        return String(currentConsultingAppointmentId);
      }
    } catch (_e) {}
    return null;
  }

  function getPatientName() {
    var nameEl = $('formPatientName');
    var name = nameEl ? nameEl.textContent.trim() : '';
    if (name) return name;
    try {
      var patientId = typeof window.getCurrentConsultationPatientId === 'function'
        ? window.getCurrentConsultationPatientId()
        : null;
      var list = (typeof patients !== 'undefined' && Array.isArray(patients)) ? patients : null;
      if (patientId && list) {
        var found = list.find(function (p) { return p && String(p.id) === String(patientId); });
        if (found && found.name) return found.name;
      }
    } catch (_e) {}
    return '病人';
  }

  function getDoctorName() {
    var user = window.firebase && window.firebase.auth && window.firebase.auth.currentUser;
    if (user) return user.displayName || user.email || '醫師';
    return '醫師';
  }

  function buildPatientJoinUrl(room, joinCode, patientName) {
    var url = new URL('video.html', window.location.href);
    url.searchParams.set('room', room);
    url.searchParams.set('code', joinCode);
    if (patientName) url.searchParams.set('name', patientName);
    return url.href;
  }

  /* -------------------------------------------------------------- */
  /* 複製連結                                                        */
  /* -------------------------------------------------------------- */

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(function () { return fallbackCopy(text); });
    }
    return fallbackCopy(text);
  }

  function fallbackCopy(text) {
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        resolve();
      } catch (e) {
        reject(e);
      } finally {
        document.body.removeChild(ta);
      }
    });
  }

  window.copyPatientVideoLink = function () {
    if (!patientJoinUrl) {
      notify('病人連結尚未準備好，請稍候', 'warning');
      return;
    }
    copyText(patientJoinUrl).then(function () {
      notify('病人連結已複製，可貼給病人', 'success');
    }).catch(function () {
      notify('複製失敗，請手動複製網址', 'error');
    });
  };

  /* -------------------------------------------------------------- */
  /* 版型                                                            */
  /* -------------------------------------------------------------- */

  function applySplitLayout(open) {
    var form = $('consultationForm');
    var pane = $('consultationVideoPane');
    if (!form || !pane) return;
    if (open) {
      form.classList.add('video-split');
      pane.classList.remove('hidden');
    } else {
      form.classList.remove('video-split');
      pane.classList.add('hidden');
    }
  }

  function container() {
    return $('consultationVideoContainer');
  }

  /* -------------------------------------------------------------- */
  /* 等候大廳 UI                                                     */
  /* -------------------------------------------------------------- */

  function linkIcon() {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 pointer-events-none"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
  }

  function lobbyShell(bodyHtml) {
    return '' +
      '<div class="h-full flex flex-col bg-white rounded-xl border border-gray-200 overflow-hidden">' +
        '<div class="bg-blue-600 text-white px-4 py-3 flex items-center justify-between gap-3 flex-wrap">' +
          '<div class="font-bold text-sm whitespace-nowrap">視訊診症 · 等候室</div>' +
          '<button type="button" onclick="copyPatientVideoLink()" ' +
                  'class="inline-flex items-center gap-1.5 bg-white text-blue-700 hover:bg-blue-50 text-xs font-medium px-3 py-1.5 rounded-lg whitespace-nowrap">' +
            linkIcon() + '<span>複製病人連結</span>' +
          '</button>' +
        '</div>' +
        '<div class="flex-1 p-5 flex flex-col items-center justify-center text-center gap-4 overflow-auto">' +
          bodyHtml +
        '</div>' +
      '</div>';
  }

  function renderLobbyWaiting() {
    var c = container();
    if (!c || phase === 'call') return;
    c.innerHTML = lobbyShell(
      '<div class="w-14 h-14 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">' +
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-7 h-7"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' +
      '</div>' +
      '<div>' +
        '<div class="font-semibold text-gray-800">等候病人申請視訊</div>' +
        '<div class="text-sm text-gray-500 mt-1 max-w-xs">請先把病人連結傳給對方；對方開啟連結並提出申請後，這裡會出現「接納」按鈕。<br><span class="text-xs text-gray-400">雙方確認後才會開始連線計費。</span></div>' +
      '</div>' +
      '<button type="button" onclick="copyPatientVideoLink()" ' +
              'class="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg">' +
        linkIcon() + '<span>複製病人連結</span>' +
      '</button>'
    );
  }

  function renderLobbyRequest(patientName) {
    var c = container();
    if (!c || phase === 'call') return;
    c.innerHTML = lobbyShell(
      '<div class="w-14 h-14 rounded-full bg-green-100 text-green-600 flex items-center justify-center animate-pulse">' +
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-7 h-7"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z"/></svg>' +
      '</div>' +
      '<div>' +
        '<div class="font-semibold text-gray-800">病人申請視訊診症</div>' +
        '<div class="text-base font-bold text-green-700 mt-1">' + escapeHtml(patientName) + '</div>' +
      '</div>' +
      '<div class="flex gap-3">' +
        '<button type="button" onclick="window.acceptVideoCall()" ' +
                'class="bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-5 py-2.5 rounded-lg">接納並開始</button>' +
        '<button type="button" onclick="window.declineVideoCall()" ' +
                'class="bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm font-medium px-5 py-2.5 rounded-lg">拒絕</button>' +
      '</div>'
    );
  }

  function renderLobbyConnecting() {
    var c = container();
    if (!c) return;
    c.innerHTML = lobbyShell(
      '<div class="w-12 h-12 rounded-full border-4 border-blue-200 border-t-blue-600 animate-spin"></div>' +
      '<div class="font-semibold text-gray-800">接通中…</div>' +
      '<div class="text-sm text-gray-500">正在建立視訊連線，請允許瀏覽器使用攝影機與麥克風。</div>'
    );
  }

  function renderLobbyError(message, withRetry) {
    var c = container();
    if (!c || phase === 'call') return;
    c.innerHTML = lobbyShell(
      '<div class="w-14 h-14 rounded-full bg-red-100 text-red-600 flex items-center justify-center">' +
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-7 h-7"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>' +
      '</div>' +
      '<div class="font-semibold text-gray-800">視訊服務無法使用</div>' +
      '<div class="text-sm text-red-600 max-w-xs">' + escapeHtml(message) + '</div>' +
      (withRetry ? '<button type="button" onclick="window.startVideoConsult()" class="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg">重試</button>' : '')
    );
  }

  /* -------------------------------------------------------------- */
  /* 信令狀態處理                                                    */
  /* -------------------------------------------------------------- */

  function handleSignalingData(data, error) {
    if (error) {
      console.error('監聽視訊申請狀態失敗', error);
      if (phase === 'lobby') {
        renderLobbyError('即時狀態連線失敗，請檢查網路後重試。', true);
      }
      return;
    }

    // 通話中：只關心 ended（對方掛斷）
    if (phase === 'call') {
      if (data && data.status === 'ended' && session) {
        notify('病人已結束通話', 'info');
        var s = session;
        session = null;
        Promise.resolve(s.leave()).catch(function () {});
      }
      return;
    }
    if (phase !== 'lobby') return;

    lastStatus = data;

    if (data && data.status === 'pending') {
      var ts = data.requestedAtMs || 0;
      if (ts && Date.now() - ts > PENDING_TTL_MS) {
        renderLobbyWaiting(); // 過期申請忽略
        return;
      }
      renderLobbyRequest(data.patientName || '病人');
    } else {
      // null / declined / ended / cancelled / accepted（非本端觸發）→ 等候畫面
      renderLobbyWaiting();
    }
  }

  /* -------------------------------------------------------------- */
  /* Token                                                           */
  /* -------------------------------------------------------------- */

  function getIdToken() {
    var user = window.firebase && window.firebase.auth && window.firebase.auth.currentUser;
    if (!user) throw new Error('登入狀態已過期，請重新整理頁面並重新登入');
    return user.getIdToken();
  }

  function fetchDoctorToken(room) {
    return getIdToken().then(function (idToken) {
      return window.LiveKitVideo.requestToken(
        config.tokenEndpoint,
        { role: 'doctor', room: room },
        idToken
      );
    });
  }

  /* -------------------------------------------------------------- */
  /* 進入 / 接納 / 掛斷                                              */
  /* -------------------------------------------------------------- */

  window.startVideoConsult = function () {
    startVideo();
  };

  function startVideo() {
    var appointmentId = getCurrentAppointmentId();
    if (!appointmentId) {
      notify('請先從今日掛號進入診症後，再開啟視訊診症', 'warning');
      return;
    }
    if (!window.LiveKitVideo || !window.VideoCallSignaling || !config.url || !config.tokenEndpoint) {
      notify('視訊模組未完成載入，請重新整理頁面後再試', 'error');
      return;
    }
    if (!window.VideoCallSignaling.ready()) {
      notify('即時服務尚未就緒，請稍候再試', 'warning');
      return;
    }

    var room = 'consult-' + appointmentId;
    var patientName = getPatientName();

    phase = 'lobby';
    closing = false;
    currentRoom = room;
    patientJoinUrl = null;
    setButtonState('active');
    applySplitLayout(true);
    renderLobbyWaiting();

    // 先開始監聽，才不會漏掉申請
    if (unsubscribe) { try { unsubscribe(); } catch (_e) {} }
    unsubscribe = window.VideoCallSignaling.watch(room, handleSignalingData);

    // 取 token 只為取得 joinCode 組出病人連結；此時完全不連 LiveKit
    fetchDoctorToken(room).then(function (tokenData) {
      if (phase === 'idle' || closing) return;
      patientJoinUrl = buildPatientJoinUrl(tokenData.room || room, tokenData.joinCode, patientName);
      // 重新依當前狀態繪製一次（等待中/已有申請）
      handleSignalingData(lastStatus, null);
    }).catch(function (e) {
      console.error('取得病人連結失敗', e);
      if (phase === 'lobby') {
        renderLobbyError((e && e.message) || '憑證服務錯誤', true);
      }
    });
  }

  window.acceptVideoCall = function () {
    if (phase !== 'lobby' || !currentRoom) return;
    phase = 'accepting';
    renderLobbyConnecting();

    var room = currentRoom;
    Promise.resolve()
      .then(function () { return window.VideoCallSignaling.accept(room, getDoctorName()); })
      .then(function () { return fetchDoctorToken(room); })
      .then(function (tokenData) {
        if (closing || phase === 'idle') return;

        var c = container();
        session = window.LiveKitVideo.createSession(c, {
          mode: 'doctor',
          onLeave: function () {
            var wasCall = phase === 'call' || phase === 'accepting';
            session = null;
            if (closing || !wasCall) {
              collapseVideo();
            } else {
              // 醫師由控制列掛斷：回到等候大廳，可接受下一次申請
              phase = 'lobby';
              renderLobbyWaiting();
              handleSignalingData(lastStatus, null);
            }
          },
          onError: function (message) {
            notify(message, 'error');
          },
          onInvite: function () {
            window.copyPatientVideoLink();
          }
        });

        return session.connect(tokenData.url || config.url, tokenData.token).then(function () {
          phase = 'call';
          notify('視訊已接通', 'success');
        });
      })
      .catch(function (e) {
        console.error('接納視訊失敗', e);
        notify('接通失敗：' + ((e && e.message) || '未知錯誤'), 'error');
        // 回到大廳並結束本次申請狀態
        session = null;
        Promise.resolve(window.VideoCallSignaling.end(room, 'doctor')).catch(function () {});
        phase = 'lobby';
        renderLobbyWaiting();
      });
  };

  window.declineVideoCall = function () {
    if (phase !== 'lobby' || !currentRoom) return;
    Promise.resolve(window.VideoCallSignaling.decline(currentRoom)).catch(function (e) {
      console.warn('拒絕申請寫入失敗', e);
    });
    renderLobbyWaiting();
  };

  function stopVideo() {
    var room = currentRoom;
    closing = true;

    if (phase === 'call' || phase === 'accepting') {
      if (room) Promise.resolve(window.VideoCallSignaling.end(room, 'doctor')).catch(function () {});
      if (session) {
        var s = session;
        session = null;
        Promise.resolve(s.leave()).catch(function () {});
      }
    } else if (phase === 'lobby' && lastStatus && lastStatus.status === 'pending' && room) {
      // 病人仍在等候，醫師直接關閉 → 自動拒絕，避免病人無限等待
      Promise.resolve(window.VideoCallSignaling.decline(room)).catch(function () {});
    }

    collapseVideo();
  }

  function collapseVideo() {
    phase = 'idle';
    closing = false;
    if (unsubscribe) {
      try { unsubscribe(); } catch (_e) {}
      unsubscribe = null;
    }
    session = null;
    currentRoom = null;
    patientJoinUrl = null;
    lastStatus = null;
    applySplitLayout(false);
    var c = container();
    if (c) c.innerHTML = '';
    setButtonState('idle');
  }

  window.toggleVideoConsultation = function () {
    if (phase === 'idle') {
      startVideo();
    } else {
      stopVideo();
    }
  };

  /* -------------------------------------------------------------- */
  /* 診症表單被隱藏（完成/取消診症）→ 一併收尾                       */
  /* -------------------------------------------------------------- */

  function watchFormHidden() {
    if (formHiddenObserver) return;
    var form = $('consultationForm');
    if (!form || typeof MutationObserver === 'undefined') return;
    formHiddenObserver = new MutationObserver(function () {
      if (form.classList.contains('hidden') && phase !== 'idle') {
        stopVideo();
      }
    });
    formHiddenObserver.observe(form, { attributes: true, attributeFilter: ['class'] });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', watchFormHidden);
  } else {
    watchFormHidden();
  }
})();
