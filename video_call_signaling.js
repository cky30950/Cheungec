/**
 * 視訊診症「雙方確認」信令（醫師系統頁 + 病人 video.html 共用）
 *
 * 在雙方真正連入 LiveKit 房間「之前」，所有等候／申請／接納／拒絕狀態
 * 全部走 Firestore（文件極小、即時監聽），因此確認前 LiveKit 不會計算任何流量。
 *
 * Firestore 文件：videoCallRequests/{room}
 * 狀態流轉：
 *   pending（病人申請）
 *     ├─ accepted（醫師接納 → 雙方連線）
 *     ├─ declined（醫師拒絕）
 *     └─ cancelled（病人取消 / 逾時）
 *   accepted 通話中 ──ended（任一方掛斷）──▶ 結束
 */
(function () {
  'use strict';

  var COLLECTION = 'videoCallRequests';

  function fb() {
    return window.firebase;
  }

  function ready() {
    var f = fb();
    return !!(f && f.db && typeof f.setDoc === 'function' && typeof f.onSnapshot === 'function');
  }

  function docRef(room) {
    return fb().doc(fb().db, COLLECTION, room);
  }

  function mergeSet(room, fields) {
    return fb().setDoc(docRef(room), Object.assign({ room: room }, fields), { merge: true });
  }

  /** 病人提出申請 */
  function request(room, patientName) {
    return mergeSet(room, {
      patientName: patientName,
      status: 'pending',
      requestedAt: fb().serverTimestamp(),
      requestedAtMs: Date.now()
    });
  }

  /** 醫師接納 */
  function accept(room, doctorName) {
    return mergeSet(room, {
      status: 'accepted',
      doctorName: doctorName || '',
      decidedAt: fb().serverTimestamp()
    });
  }

  /** 醫師關閉大廳時病人仍在等候 → 自動拒絕，避免病人無限等待 */
  function decline(room) {
    return mergeSet(room, {
      status: 'declined',
      decidedAt: fb().serverTimestamp()
    });
  }

  /** 任一方掛斷結束通話 */
  function end(room, endedBy) {
    return mergeSet(room, {
      status: 'ended',
      endedBy: endedBy || '',
      endedAt: fb().serverTimestamp()
    });
  }

  /** 病人主動取消申請（或逾時），直接刪除文件，醫師端回到無人等候 */
  function cancel(room) {
    return fb().deleteDoc(docRef(room)).catch(function () {
      return mergeSet(room, { status: 'cancelled', cancelledAt: fb().serverTimestamp() });
    });
  }

  /**
   * 監聽房間申請狀態
   * @param {string} room
   * @param {function(data: object|null, error?: Error)} onChange  data 為 null 代表文件不存在
   * @returns {function|null} unsubscribe
   */
  function watch(room, onChange) {
    if (!ready()) return null;
    return fb().onSnapshot(
      docRef(room),
      function (snapshot) {
        onChange(snapshot.exists() ? snapshot.data() : null);
      },
      function (error) {
        onChange(null, error);
      }
    );
  }

  window.VideoCallSignaling = {
    COLLECTION: COLLECTION,
    ready: ready,
    request: request,
    accept: accept,
    decline: decline,
    end: end,
    cancel: cancel,
    watch: watch
  };
})();
