/**
 * 醫師端視訊診症（系統頁 system.html 專用）
 *
 * - 在「診症記錄」標題列右側提供視訊診症按鈕（HTML 在 system.html）
 * - 開啟後診症記錄左右分欄：左側維持原欄位，右側為視訊面板
 * - token 向 Cloudflare Pages Function 請求，醫師身份以 Firebase ID token 驗證
 * - 病人加入連結由 joinCode 組成，可一鍵複製
 */
(function () {
  'use strict';

  var config = window.LIVEKIT_CONFIG || {};
  var session = null;
  var active = false;
  var connecting = false;
  var currentRoom = null;
  var patientJoinUrl = null;
  var formHiddenObserver = null;

  function $(id) {
    return document.getElementById(id);
  }

  function getButton() {
    return $('toggleVideoConsultBtn');
  }

  function setButtonState(state) {
    var btn = getButton();
    if (!btn) return;
    if (state === 'connecting') {
      btn.disabled = true;
      btn.classList.add('opacity-70', 'cursor-wait');
      btn.classList.remove('bg-red-500', 'hover:bg-red-600');
      btn.classList.add('bg-white', 'text-green-700');
      btn.querySelector('[data-video-btn-label]').textContent = '連線中…';
    } else if (state === 'active') {
      btn.disabled = false;
      btn.classList.remove('opacity-70', 'cursor-wait', 'bg-white', 'text-green-700');
      btn.classList.add('bg-red-500', 'hover:bg-red-600', 'text-white');
      btn.querySelector('[data-video-btn-label]').textContent = '關閉視訊';
    } else {
      btn.disabled = false;
      btn.classList.remove('opacity-70', 'cursor-wait', 'bg-red-500', 'hover:bg-red-600');
      btn.classList.add('bg-white', 'text-green-700');
      btn.querySelector('[data-video-btn-label]').textContent = '視訊診症';
    }
  }

  function notify(message, type) {
    if (typeof window.showToast === 'function') {
      window.showToast(message, type || 'info');
    } else {
      console.log('[視訊]', message);
    }
  }

  function getCurrentAppointmentId() {
    try {
      // currentConsultingAppointmentId 定義於 system.js 頂層（全域詞彙環境）
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

    // 備援：從全域病人清單比對
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

  function buildPatientJoinUrl(room, joinCode, patientName) {
    var url = new URL('video.html', window.location.href);
    url.searchParams.set('room', room);
    url.searchParams.set('code', joinCode);
    if (patientName) url.searchParams.set('name', patientName);
    return url.href;
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(function () {
        return fallbackCopy(text);
      });
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
      notify('尚未建立視訊診症室', 'warning');
      return;
    }
    copyText(patientJoinUrl).then(function () {
      notify('病人加入連結已複製，可貼給病人', 'success');
    }).catch(function () {
      notify('複製失敗，請手動複製網址', 'error');
    });
  };

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

  function collapseVideo() {
    active = false;
    connecting = false;
    currentRoom = null;
    patientJoinUrl = null;
    session = null;
    applySplitLayout(false);
    var container = $('consultationVideoContainer');
    if (container) container.innerHTML = '';
    setButtonState('idle');
  }

  async function getIdToken() {
    var auth = window.firebase && window.firebase.auth;
    var user = auth && auth.currentUser;
    if (!user) {
      throw new Error('登入狀態已過期，請重新整理頁面並重新登入');
    }
    return await user.getIdToken();
  }

  async function startVideo() {
    var appointmentId = getCurrentAppointmentId();
    if (!appointmentId) {
      notify('請先從今日掛號進入診症後，再開啟視訊診症', 'warning');
      return;
    }
    if (!window.LiveKitVideo || !config.url || !config.tokenEndpoint) {
      notify('視訊模組未完成載入，請重新整理頁面後再試', 'error');
      return;
    }

    var room = 'consult-' + appointmentId;
    var patientName = getPatientName();

    connecting = true;
    setButtonState('connecting');

    var tokenData;
    try {
      var idToken = await getIdToken();
      tokenData = await window.LiveKitVideo.requestToken(
        config.tokenEndpoint,
        { role: 'doctor', room: room },
        idToken
      );
    } catch (e) {
      console.error('取得視訊憑證失敗', e);
      notify('無法開啟視訊：' + (e.message || '憑證服務錯誤'), 'error');
      connecting = false;
      setButtonState('idle');
      return;
    }

    currentRoom = tokenData.room || room;
    patientJoinUrl = buildPatientJoinUrl(currentRoom, tokenData.joinCode, patientName);

    applySplitLayout(true);
    active = true;
    connecting = false;
    setButtonState('active');

    var container = $('consultationVideoContainer');
    session = window.LiveKitVideo.createSession(container, {
      mode: 'doctor',
      onLeave: function () {
        collapseVideo();
      },
      onError: function (message) {
        notify(message, 'error');
      },
      onInvite: function () {
        window.copyPatientVideoLink();
      }
    });

    try {
      await session.connect(tokenData.url || config.url, tokenData.token);
      notify('已進入視訊診症室，可複製連結邀請病人', 'success');
    } catch (_e) {
      // 連線失敗的畫面由共用核心顯示，醫師可按「關閉」收回面板
      active = false;
    }
  }

  async function stopVideo() {
    var running = session;
    if (running) {
      try {
        await running.leave();
      } catch (e) {
        collapseVideo();
      }
    } else {
      collapseVideo();
    }
  }

  window.toggleVideoConsultation = function () {
    if (connecting) return;
    if (active) {
      stopVideo();
    } else {
      startVideo();
    }
  };

  // 診症表單被系統隱藏時（完成/取消診症），一併結束視訊
  function watchFormHidden() {
    if (formHiddenObserver) return;
    var form = $('consultationForm');
    if (!form || typeof MutationObserver === 'undefined') return;
    formHiddenObserver = new MutationObserver(function () {
      if (form.classList.contains('hidden') && (active || connecting)) {
        if (session) {
          var s = session;
          session = null;
          active = false;
          connecting = false;
          Promise.resolve(s.leave()).catch(function () {});
        } else {
          collapseVideo();
        }
        var container = $('consultationVideoContainer');
        if (container) container.innerHTML = '';
        currentRoom = null;
        patientJoinUrl = null;
        setButtonState('idle');
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
