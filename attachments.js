/* ============================================================
 * 病歷附件（Cloudflare R2 直傳）前端模組
 * ------------------------------------------------------------
 * 功能：舌象／體檢報告／其他圖片的拍照、上傳、縮圖瀏覽、
 *       原圖 Lightbox、分權刪除；診次暫存與保存後歸戶。
 *
 * 對外介面（window.MedicalAttachments）：
 *   openGallery({ scope, category, patientId })
 *   listForPatient(patientId, { force })
 *   visitGroups(patientId, consultationId)
 *   inlineThumbsHtml(docs, { patientId, visitKey })
 *   linkVisitUploads({ appointmentId, patientId, consultationId, consultationDate })
 *
 * 依賴全域：window.firebase（Firestore/Auth）、window.escapeHtml、
 *          showToast、Swal（SweetAlert2），以及 system.js 的
 *          currentConsultingAppointmentId / appointments /
 *          currentConsultationEditContext / currentUserData。
 * ============================================================ */

(function () {
    'use strict';

    var API_BASE = '/api/attachments';
    var COLLECTION = 'patientAttachments';
    var MAX_CONCURRENT = 3;

    var CATEGORY_META = {
        tongue: { label: '舌象', classes: 'bg-pink-100 text-pink-700 border-pink-200' },
        report: { label: '體檢報告', classes: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
        other: { label: '其他', classes: 'bg-gray-100 text-gray-700 border-gray-200' }
    };
    var FILTERS = [
        { key: 'all', label: '全部' },
        { key: 'tongue', label: '舌象' },
        { key: 'report', label: '體檢報告' },
        { key: 'other', label: '其他' }
    ];
    var ACCEPT_TYPES = {
        'image/jpeg': 'image/jpeg',
        'image/jpg': 'image/jpeg',
        'image/png': 'image/png',
        'image/webp': 'image/webp',
        'image/gif': 'image/gif'
    };

    /** 模組狀態 */
    var configPromise = null;
    var patientCache = {};       // patientId -> [{...doc}]（ready，已排序）
    var patientInflight = {};    // patientId -> Promise
    var sessionMap = {};         // sessionKey -> sessionId
    var gallery = null;          // 當前 gallery 狀態
    var lightbox = null;         // 當前 lightbox 狀態

    /* ----------------------------------------------------------
     * 小工具
     * ---------------------------------------------------------- */

    function esc(value) {
        if (value === null || value === undefined) return '';
        if (window.escapeHtml) return window.escapeHtml(String(value));
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // i18n：系統有 t() 就用，否則回傳原中文（i18n observer 之後也會翻譯）
    function tt(text) {
        try {
            if (typeof window.t === 'function') return window.t(text);
            if (typeof t === 'function') return t(text);
        } catch (_e) {}
        return text;
    }

    function toast(message, type) {
        try {
            if (typeof window.showToast === 'function') {
                window.showToast(message, type || 'info');
                return;
            }
            if (typeof showToast === 'function') {
                showToast(message, type || 'info');
                return;
            }
        } catch (_e) {}
        console.log('[attachments]', message);
    }

    function uuid() {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') {
            return window.crypto.randomUUID();
        }
        return 'id-' + Date.now().toString(16) + '-' +
            Math.random().toString(16).slice(2, 10) + '-' +
            Math.random().toString(16).slice(2, 10);
    }

    function pad2(n) { return String(n).padStart(2, '0'); }

    function toDate(value) {
        if (!value) return null;
        if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
        if (typeof value.toDate === 'function') {
            try { return value.toDate(); } catch (_e) {}
        }
        if (typeof value.seconds === 'number') {
            return new Date(value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6));
        }
        var d = new Date(value);
        return isNaN(d.getTime()) ? null : d;
    }

    function fmtDateTime(d) {
        d = toDate(d);
        if (!d) return '';
        return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
            ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    }

    function fmtDate(d) {
        d = toDate(d);
        if (!d) return '';
        return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    }

    /* ----------------------------------------------------------
     * 後端 API
     * ---------------------------------------------------------- */

    function currentAuthUser() {
        var fb = window.firebase;
        return fb && fb.auth && fb.auth.currentUser ? fb.auth.currentUser : null;
    }

    function currentUploader() {
        var user = currentAuthUser();
        var name = '';
        try {
            if (typeof currentUserData !== 'undefined' && currentUserData) {
                name = currentUserData.name || currentUserData.username || '';
            }
        } catch (_e) {}
        if (!name && user) name = user.email || '';
        return {
            uid: user ? user.uid : '',
            name: name
        };
    }

    async function apiFetch(path, options) {
        var user = currentAuthUser();
        if (!user) throw new Error('尚未登入，無法操作附件');
        var token = await user.getIdToken();
        var opts = options || {};
        var res = await fetch(API_BASE + path, {
            method: opts.method || 'GET',
            headers: Object.assign(
                { 'Authorization': 'Bearer ' + token },
                opts.headers || {}
            ),
            body: opts.body
        });
        var data = null;
        try { data = await res.json(); } catch (_e) {}
        if (!res.ok) {
            var err = new Error((data && data.message) || ('附件服務回應異常（HTTP ' + res.status + '）'));
            err.status = res.status;
            err.code = data && data.error;
            throw err;
        }
        return data || {};
    }

    async function getConfig(force) {
        if (!force && configPromise) return configPromise;
        configPromise = apiFetch('/config');
        try {
            return await configPromise;
        } catch (e) {
            configPromise = null;
            throw e;
        }
    }

    function publicUrl(key) {
        var cfg = settledConfig;
        var base = cfg && cfg.publicBase ? String(cfg.publicBase).replace(/\/+$/, '') : '';
        if (!base || !key) return '';
        return base + '/' + String(key).split('/').map(encodeURIComponent).join('/');
    }

    var settledConfig = null;
    async function ensureConfig() {
        if (!settledConfig) settledConfig = await getConfig();
        return settledConfig;
    }

    async function requestPresign(payload) {
        return apiFetch('/presign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    }

    async function requestDelete(fileId) {
        return apiFetch('/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileId: fileId })
        });
    }

    /* ----------------------------------------------------------
     * Firestore 資料層
     * ---------------------------------------------------------- */

    function normalizeDoc(d) {
        var data = d.data() || {};
        return Object.assign({ id: d.id }, data);
    }

    function isReady(doc) {
        return doc && doc.deleted !== true &&
            (doc.uploadStatus === undefined || doc.uploadStatus === 'ready');
    }

    /**
     * 取得某病人全部就緒附件（依 uploadedAt desc），含記憶體快取。
     */
    async function listForPatient(patientId, options) {
        patientId = String(patientId || '');
        if (!patientId) throw new Error('缺少病人 ID');
        var force = options && options.force;
        if (!force && patientCache[patientId]) return patientCache[patientId];
        if (!force && patientInflight[patientId]) return patientInflight[patientId];

        var fb = window.firebase;
        var promise = (async function () {
            await ensureConfig();
            // 僅用 patientId 等值查詢（單欄索引，免建複合索引）；排序於客戶端處理
            var q = fb.firestoreQuery(
                fb.collection(fb.db, COLLECTION),
                fb.where('patientId', '==', patientId)
            );
            var snap = await fb.getDocs(q);
            var allDocs = snap.docs.map(normalizeDoc);
            // 孤兒清理：uploading 超過 1 小時（分頁關閉/重整中斷），由本人呼叫 delete 回收
            var me = currentAuthUser();
            var staleMs = 60 * 60 * 1000;
            allDocs.forEach(function (d) {
                if (d.uploadStatus === 'uploading' && d.deleted !== true) {
                    var uploadedAt = toDate(d.uploadedAt);
                    var isMine = me && String(d.uploadedByUid || '') === String(me.uid);
                    if (isMine && uploadedAt && (Date.now() - uploadedAt.getTime()) > staleMs) {
                        requestDelete(d.fileId || d.id).catch(function () {});
                    }
                }
            });
            var docs = allDocs.filter(isReady);
            docs.sort(function (a, b) {
                return (toDate(b.uploadedAt) || 0) - (toDate(a.uploadedAt) || 0);
            });
            patientCache[patientId] = docs;
            return docs;
        })();

        patientInflight[patientId] = promise;
        try {
            return await promise;
        } finally {
            delete patientInflight[patientId];
        }
    }

    function cacheUpsert(patientId, doc) {
        var list = patientCache[String(patientId)];
        if (!list) {
            patientCache[String(patientId)] = [doc];
            return;
        }
        var idx = -1;
        for (var i = 0; i < list.length; i++) {
            if (list[i].id === doc.id || list[i].fileId === doc.fileId) { idx = i; break; }
        }
        if (idx >= 0) list[idx] = doc;
        else list.unshift(doc);
        list.sort(function (a, b) {
            return (toDate(b.uploadedAt) || 0) - (toDate(a.uploadedAt) || 0);
        });
    }

    function cacheRemove(patientId, fileId) {
        var list = patientCache[String(patientId)];
        if (!list) return;
        patientCache[String(patientId)] = list.filter(function (d) {
            return d.id !== fileId && d.fileId !== fileId;
        });
    }

    async function updateMetadata(fileId, fields) {
        var fb = window.firebase;
        await fb.updateDoc(fb.doc(fb.db, COLLECTION, fileId), fields);
    }

    /**
     * 診症儲存後，把 session 暫存的附件歸戶到 consultationId。
     * 無暫存時直接回傳 0，不做任何查詢。
     */
    async function linkVisitUploads(params) {
        var appointmentId = String((params && params.appointmentId) || '');
        var patientId = String((params && params.patientId) || '');
        var consultationId = String((params && params.consultationId) || '');
        var consultationDate = String((params && params.consultationDate) || '');
        if (!consultationId || !patientId) return { count: 0 };

        var sKey = sessionKey(appointmentId, patientId);
        var sessionId = sessionMap[sKey];

        var fb = window.firebase;
        var updates = {
            consultationId: consultationId,
            sessionId: ''
        };
        if (consultationDate) updates.consultationDate = consultationDate;

        // 候選來源 1：sessionId（同一未保存診症工作階段）
        var candidates = [];
        var seen = {};
        if (sessionId) {
            var sSnap = await fb.getDocs(fb.firestoreQuery(
                fb.collection(fb.db, COLLECTION),
                fb.where('sessionId', '==', sessionId)
            ));
            sSnap.docs.forEach(function (d) {
                if (!seen[d.id]) { seen[d.id] = true; candidates.push(d); }
            });
        }
        // 候選來源 2（競態後備）：presign 文件剛建立、尚未帶上 sessionId 的亞秒級窗口，
        // 以 appointmentId 單欄查詢（免複合索引）＋客戶端過濾未歸檔
        if (appointmentId) {
            var aSnap = await fb.getDocs(fb.firestoreQuery(
                fb.collection(fb.db, COLLECTION),
                fb.where('appointmentId', '==', appointmentId)
            ));
            aSnap.docs.forEach(function (d) {
                if (!seen[d.id]) { seen[d.id] = true; candidates.push(d); }
            });
        }

        var count = 0;
        var batch = fb.writeBatch(fb.db);
        var touched = [];
        candidates.forEach(function (d) {
            var data = d.data() || {};
            if (data.patientId !== patientId) return;
            if (data.consultationId && String(data.consultationId) !== '') return;
            batch.update(d.ref, updates);
            touched.push(Object.assign({ id: d.id }, data, updates));
            count++;
        });
        if (count > 0) {
            await batch.commit();
            touched.forEach(function (doc) {
                cacheUpsert(patientId, doc);
            });
        }
        if (sessionId) delete sessionMap[sKey];
        return { count: count };
    }

    /* ----------------------------------------------------------
     * 診症上下文（與 saveConsultation 同源解析）
     * ---------------------------------------------------------- */

    function getAppointment() {
        var apt = null;
        try {
            var aid = (typeof currentConsultingAppointmentId !== 'undefined')
                ? currentConsultingAppointmentId : null;
            if (aid && typeof appointments !== 'undefined' && Array.isArray(appointments)) {
                for (var i = 0; i < appointments.length; i++) {
                    if (appointments[i] && String(appointments[i].id) === String(aid)) {
                        apt = appointments[i];
                        break;
                    }
                }
            }
            if (!apt && typeof currentConsultationEditContext !== 'undefined' &&
                currentConsultationEditContext) {
                apt = currentConsultationEditContext;
            }
        } catch (_e) { apt = null; }
        return apt;
    }

    function resolveVisitContext(overrides) {
        overrides = overrides || {};
        var apt = getAppointment();
        var patientId = String(overrides.patientId || (apt && apt.patientId) || '').trim();
        var patientName = String(overrides.patientName || (apt && apt.patientName) || '').trim();
        var appointmentId = apt ? String(apt.id || '') : '';
        var consultationId = (apt && apt.status === 'completed' && apt.consultationId)
            ? String(apt.consultationId) : '';
        var consultationDate = '';
        if (apt) {
            consultationDate = fmtDate(
                apt.date || apt.appointmentDate || apt.sortDate ||
                apt.appointmentTime || apt.createdAt || ''
            );
        }
        return {
            patientId: patientId,
            patientName: patientName,
            appointmentId: appointmentId,
            consultationId: consultationId,
            consultationDate: consultationDate
        };
    }

    function sessionKey(appointmentId, patientId) {
        return 'apt:' + String(appointmentId || '') + '|pat:' + String(patientId || '');
    }

    function ensureSessionId(ctx) {
        var key = sessionKey(ctx.appointmentId, ctx.patientId);
        if (!sessionMap[key]) sessionMap[key] = uuid();
        return sessionMap[key];
    }

    /* ----------------------------------------------------------
     * 圖片本端處理（canvas 原圖；不再產生獨立縮圖）
     * ---------------------------------------------------------- */

    function loadImageElement(fileOrUrl) {
        return new Promise(function (resolve, reject) {
            var url = typeof fileOrUrl === 'string' ? fileOrUrl : URL.createObjectURL(fileOrUrl);
            var img = new Image();
            img.onload = function () {
                if (typeof fileOrUrl !== 'string') URL.revokeObjectURL(url);
                resolve(img);
            };
            img.onerror = function () {
                if (typeof fileOrUrl !== 'string') URL.revokeObjectURL(url);
                reject(new Error('圖片無法讀取，可能為不支援的格式（如 HEIC）'));
            };
            img.src = url;
        });
    }

    async function decodeSource(file) {
        if (typeof createImageBitmap === 'function') {
            try {
                return await createImageBitmap(file, { imageOrientation: 'from-image' });
            } catch (_e) { /* 降級 */ }
        }
        return await loadImageElement(file);
    }

    function canvasToBlob(canvas, type, quality) {
        return new Promise(function (resolve, reject) {
            canvas.toBlob(function (blob) {
                if (blob) resolve(blob);
                else reject(new Error('圖片壓縮失敗'));
            }, type, quality);
        });
    }

    async function drawResized(source, maxEdge, type, quality) {
        var sw = source.width || source.naturalWidth || 0;
        var sh = source.height || source.naturalHeight || 0;
        var scale = Math.min(1, maxEdge / Math.max(sw, sh));
        var w = Math.max(1, Math.round(sw * scale));
        var h = Math.max(1, Math.round(sh * scale));
        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d');
        // JPEG 無透明通道，先補白底
        if (type === 'image/jpeg') {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, w, h);
        }
        ctx.drawImage(source, 0, 0, w, h);
        var blob = await canvasToBlob(canvas, type, quality);
        return { blob: blob, width: w, height: h };
    }

    function sourceHasAlpha(source, fileType) {
        if (fileType !== 'image/png') return false;
        try {
            // 把整張圖縮進 32x32 後掃描所有像素，任一像素非完全不透明即視為含 alpha
            var N = 32;
            var c = document.createElement('canvas');
            c.width = N; c.height = N;
            var ctx = c.getContext('2d');
            ctx.clearRect(0, 0, N, N);
            ctx.drawImage(source, 0, 0, N, N);
            var data = ctx.getImageData(0, 0, N, N).data;
            for (var i = 3; i < data.length; i += 4) {
                if (data[i] < 255) return true;
            }
            return false;
        } catch (_e) {
            return false;
        }
    }

    /**
     * 產出原圖（≤2048，JPEG；含透明的 PNG 保留 PNG）。
     * 不再產生獨立縮圖：列表縮圖位置以原圖靠 CSS 縮放顯示。
     * @returns {Promise<{original:Blob, contentType:string, width:number, height:number}>}
     */
    async function prepareImage(file, maxBytes) {
        var inType = ACCEPT_TYPES[String(file.type || '').toLowerCase()];
        if (!inType) {
            throw new Error('不支援的圖片格式，只接受 JPEG、PNG、WebP、GIF（iPhone 請改用相機拍照或先轉 JPEG）');
        }
        if (file.size && file.size > maxBytes) {
            throw new Error('檔案超過大小上限（' + Math.round(maxBytes / 1024 / 1024) + 'MB）');
        }
        var source = await decodeSource(file);
        var hasAlpha = sourceHasAlpha(source, inType);
        // PNG 有 alpha 才保留 PNG；其餘（含 GIF/WebP）一律 JPEG
        var contentType = (inType === 'image/png' && hasAlpha) ? 'image/png' : 'image/jpeg';
        var original = await drawResized(source, 2048, contentType, 0.9);
        if (typeof source.close === 'function') {
            try { source.close(); } catch (_e) {}
        }
        if (original.blob.size > maxBytes) {
            throw new Error('壓縮後圖片仍超過大小上限（' + Math.round(maxBytes / 1024 / 1024) + 'MB）');
        }
        return {
            original: original.blob,
            contentType: contentType,
            width: original.width,
            height: original.height
        };
    }

    /* ----------------------------------------------------------
     * 直傳流程
     * ---------------------------------------------------------- */

    function putObject(url, blob, contentType, onProgress) {
        return new Promise(function (resolve, reject) {
            var xhr = new XMLHttpRequest();
            xhr.open('PUT', url, true);
            xhr.setRequestHeader('Content-Type', contentType);
            if (xhr.upload) {
                xhr.upload.onprogress = function (e) {
                    if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
                };
            }
            xhr.onload = function () {
                if (xhr.status >= 200 && xhr.status < 300) resolve();
                else reject(new Error('R2 上傳失敗（HTTP ' + xhr.status + '）'));
            };
            xhr.onerror = function () { reject(new Error('R2 上傳時發生網路錯誤')); };
            xhr.onabort = function () { reject(new Error('上傳已取消')); };
            xhr.send(blob);
        });
    }

    /**
     * 完整上傳單一檔案：presign（後端同步建立權威中繼文件）→ 直傳原圖 → 就緒。
     * @param {File} file
     * @param {object} ctx resolveVisitContext 結果
     * @param {string} category
     * @param {function(number,string)} onProgress 0-1 進度 + 狀態文字
     */
    async function uploadOne(file, ctx, category, onProgress) {
        var cfg = await ensureConfig();
        var prepared = await prepareImage(file, cfg.maxBytes);
        var sessionId = ctx.consultationId ? '' : ensureSessionId(ctx);
        var presign = await requestPresign({
            patientId: ctx.patientId,
            patientName: ctx.patientName || '',
            appointmentId: ctx.appointmentId || '',
            consultationId: ctx.consultationId || '',
            sessionId: sessionId,
            consultationDate: ctx.consultationId ? (ctx.consultationDate || '') : '',
            category: category,
            contentType: prepared.contentType,
            contentLength: prepared.original.size,
            width: prepared.width,
            height: prepared.height
        });
        var uploader = currentUploader();

        // 本端快取用中繼（伺服器文件已由 presign 端點以權威身分建立）
        var metadata = {
            fileId: presign.fileId,
            patientId: ctx.patientId,
            patientName: ctx.patientName || '',
            consultationId: ctx.consultationId || '',
            appointmentId: ctx.appointmentId || '',
            sessionId: sessionId,
            consultationDate: ctx.consultationId ? (ctx.consultationDate || '') : '',
            category: category,
            contentType: prepared.contentType,
            size: prepared.original.size,
            width: prepared.width,
            height: prepared.height,
            originalKey: presign.uploads.original.key,
            // 新上傳無獨立縮圖，thumbKey 即原圖 key
            thumbKey: presign.uploads.original.key,
            uploadStatus: 'uploading',
            uploadedAt: new Date(),
            uploadedByUid: presign.uploadedByUid || uploader.uid,
            uploadedByName: uploader.name,
            deleted: false,
            deletedAt: null,
            deletedByUid: '',
            deletedByName: ''
        };

        try {
            if (onProgress) onProgress(0.05, '上傳圖片…');
            await putObject(
                presign.uploads.original.url,
                prepared.original,
                prepared.contentType,
                function (p) { if (onProgress) onProgress(0.05 + p * 0.9); }
            );
            if (onProgress) onProgress(1, '完成');
            await updateMetadata(presign.fileId, { uploadStatus: 'ready' });
            var ready = Object.assign({}, metadata, { id: presign.fileId, uploadStatus: 'ready' });
            cacheUpsert(ctx.patientId, ready);
            return ready;
        } catch (uploadErr) {
            // 清理：刪 R2 物件並軟刪文件（本人權限必過）
            try { await requestDelete(presign.fileId); } catch (_cleanErr) {}
            throw uploadErr;
        }
    }

    async function runQueue(tasks, concurrency) {
        var idx = 0;
        async function worker() {
            while (idx < tasks.length) {
                var current = tasks[idx++];
                await current();
            }
        }
        var workers = [];
        for (var i = 0; i < Math.min(concurrency, tasks.length); i++) workers.push(worker());
        await Promise.all(workers);
    }

    /* ----------------------------------------------------------
     * 權限
     * ---------------------------------------------------------- */

    function canDelete(doc) {
        if (!doc) return false;
        var user = currentAuthUser();
        if (!user) return false;
        if (String(doc.uploadedByUid || '') === String(user.uid)) return true;
        try {
            if (typeof currentUserData !== 'undefined' && currentUserData &&
                currentUserData.position === '診所管理') {
                return true;
            }
        } catch (_e) {}
        return false;
    }

    async function confirmDelete(doc) {
        var label = (CATEGORY_META[doc.category] || {}).label || '附件';
        var time = fmtDateTime(doc.uploadedAt);
        if (window.Swal) {
            var result = await window.Swal.fire({
                title: tt('刪除附件？'),
                text: '將刪除「' + label + '」（' + time + '），此動作無法復原。',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: tt('刪除'),
                cancelButtonText: tt('取消'),
                confirmButtonColor: '#dc2626'
            });
            return !!(result && result.isConfirmed);
        }
        return window.confirm(tt('刪除附件？') + '\n' + label + ' ' + time);
    }

    async function deleteAttachment(doc) {
        var result = await requestDelete(doc.fileId || doc.id);
        cacheRemove(doc.patientId, doc.fileId || doc.id);
        return result || {};
    }

    /* ----------------------------------------------------------
     * Gallery Modal
     * ---------------------------------------------------------- */

    function galleryVisibleDocs() {
        var docs = patientCache[gallery.patientId] || [];
        var list = docs.slice();
        if (gallery.scope === 'visit') {
            if (gallery.consultationId) {
                list = list.filter(function (d) {
                    return String(d.consultationId || '') === String(gallery.consultationId);
                });
            } else {
                list = list.filter(function (d) {
                    return !d.consultationId && String(d.sessionId || '') === String(gallery.sessionId);
                });
            }
        }
        if (gallery.category === 'tongue') {
            list = list.filter(function (d) { return d.category === 'tongue'; });
        }
        if (gallery.scope === 'visit' && gallery.category === 'all') {
            // 過往記錄的「病歷附件」不含舌象（舌象由「舌象圖片」按鈕專管）
            list = list.filter(function (d) { return d.category !== 'tongue'; });
        }
        if (gallery.scope !== 'visit' && gallery.category === 'all' && gallery.filter !== 'all') {
            list = list.filter(function (d) { return d.category === gallery.filter; });
        }
        if (gallery.scope === 'visit' && gallery.filter && gallery.filter !== 'all') {
            list = list.filter(function (d) { return d.category === gallery.filter; });
        }
        return list;
    }

    function cardHtml(doc) {
        var meta = CATEGORY_META[doc.category] || CATEGORY_META.other;
        var thumbSrc = publicUrl(doc.thumbKey);
        var visitAttr = gallery.scope === 'visit'
            ? (gallery.consultationId || 'session:' + gallery.sessionId)
            : 'all';
        var kindAttr = gallery.category === 'tongue' ? 'tongue'
            : (gallery.filter === 'tongue' ? 'tongue' :
               (gallery.scope === 'visit' || gallery.filter !== 'all' ? 'other' : 'all'));
        var visitLabel = '';
        if (gallery.scope === 'patient') {
            visitLabel = doc.consultationId
                ? tt('診症') + ' ' + (doc.consultationDate || '')
                : '<span class="text-amber-600">' + tt('未歸檔診症') + '</span>';
        }
        var delBtn = canDelete(doc)
            ? '<button type="button" data-ma-delete="' + esc(doc.fileId || doc.id) + '" ' +
              'class="absolute top-1 right-1 bg-red-600/90 hover:bg-red-700 text-white rounded-full w-7 h-7 flex items-center justify-center text-sm shadow" ' +
              'title="' + tt('刪除') + '">🗑</button>'
            : '';
        return '' +
            '<div class="relative bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition">' +
                '<button type="button" class="block w-full" ' +
                    'data-ma-file="' + esc(doc.fileId || doc.id) + '" ' +
                    'data-ma-patient="' + esc(gallery.patientId) + '" ' +
                    'data-ma-visit="' + esc(visitAttr) + '" ' +
                    'data-ma-kind="' + kindAttr + '">' +
                    '<div class="w-full h-40 bg-gray-100 flex items-center justify-center">' +
                        (thumbSrc
                            ? '<img src="' + esc(thumbSrc) + '" alt="' + esc(meta.label) + '" loading="lazy" class="w-full h-40 object-cover" onerror="this.classList.add(\'opacity-20\')">'
                            : '<span class="text-3xl">🖼️</span>') +
                    '</div>' +
                '</button>' +
                delBtn +
                '<div class="p-2 space-y-1">' +
                    '<span class="inline-block text-xs px-2 py-0.5 rounded-full border ' + meta.classes + '">' + tt(meta.label) + '</span>' +
                    '<div class="text-xs text-gray-600">' + tt('上傳時間') + '：' + esc(fmtDateTime(doc.uploadedAt)) + '</div>' +
                    (visitLabel ? '<div class="text-xs text-gray-500">' + visitLabel + '</div>' : '') +
                '</div>' +
            '</div>';
    }

    function renderGrid() {
        var grid = document.getElementById('maGrid');
        if (!grid) return;
        var docs = galleryVisibleDocs();
        if (docs.length === 0) {
            grid.innerHTML =
                '<div class="text-center py-12 text-gray-500">' +
                    '<div class="text-4xl mb-3">🖼️</div>' +
                    '<div class="text-base font-medium mb-1">' + tt('暫無附件') + '</div>' +
                    '<div class="text-sm">' + tt('可拍照或上傳圖片') + '</div>' +
                '</div>';
            return;
        }
        grid.innerHTML =
            '<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">' +
            docs.map(cardHtml).join('') +
            '</div>';
    }

    function renderFilters() {
        var el = document.getElementById('maFilters');
        if (!el) return;
        if (gallery.scope !== 'patient' || gallery.category !== 'all') {
            el.innerHTML = '';
            return;
        }
        el.innerHTML =
            '<div class="flex flex-wrap gap-2 mb-4">' +
            FILTERS.map(function (f) {
                var active = gallery.filter === f.key;
                var cls = active
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50';
                return '<button type="button" data-ma-filter="' + f.key + '" ' +
                    'class="px-3 py-1 text-sm rounded-full border transition ' + cls + '">' +
                    tt(f.label) + '</button>';
            }).join('') +
            '</div>';
    }

    function renderUploadBar() {
        var bar = document.getElementById('maUploadBar');
        if (!bar) return;
        var tongueLocked = gallery.category === 'tongue';
        // 過往記錄的「病歷附件」(visit/all) 不收舌象；舌象僅由「舌象圖片」入口上傳
        var tongueOptionAllowed = tongueLocked || gallery.scope === 'patient';
        var categoryOptions =
            (tongueOptionAllowed ? '<option value="tongue">' + tt('舌象') + '</option>' : '') +
            '<option value="report">' + tt('體檢報告') + '</option>' +
            '<option value="other" selected>' + tt('其他') + '</option>';
        var categorySelect = tongueLocked ? '' :
            '<select id="maCategory" class="border border-gray-300 rounded-lg px-2 py-2 text-sm focus:ring-2 focus:ring-blue-500">' +
                categoryOptions +
            '</select>';
        bar.innerHTML =
            '<div class="flex flex-wrap items-center gap-2 mb-3">' +
                categorySelect +
                '<button type="button" id="maCameraBtn" class="inline-flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-2 rounded-lg transition">' +
                    '📷 <span>' + tt('拍照') + '</span>' +
                '</button>' +
                '<button type="button" id="maPhoneBtn" class="inline-flex items-center gap-1 bg-violet-600 hover:bg-violet-700 text-white text-sm px-3 py-2 rounded-lg transition">' +
                    '📱 <span>' + tt('手機拍照') + '</span>' +
                '</button>' +
                '<button type="button" id="maFileBtn" class="inline-flex items-center gap-1 bg-green-600 hover:bg-green-700 text-white text-sm px-3 py-2 rounded-lg transition">' +
                    '🖼️ <span>' + tt('上傳圖片') + '</span>' +
                '</button>' +
                '<input type="file" id="maCameraInput" accept="image/*" capture="environment" class="hidden">' +
                '<input type="file" id="maFileInput" accept="image/jpeg,image/png,image/webp,image/gif" multiple class="hidden">' +
            '</div>' +
            '<div id="maProgress" class="space-y-2 mb-3"></div>';

        document.getElementById('maCameraBtn').addEventListener('click', openCameraCapture);
        var phoneBtn = document.getElementById('maPhoneBtn');
        if (phoneBtn) phoneBtn.addEventListener('click', openRelay);
        document.getElementById('maFileBtn').addEventListener('click', function () {
            document.getElementById('maFileInput').click();
        });
        document.getElementById('maCameraInput').addEventListener('change', handleInputChange);
        document.getElementById('maFileInput').addEventListener('change', handleInputChange);
    }

    function currentUploadCategory() {
        if (gallery.category === 'tongue') return 'tongue';
        var sel = document.getElementById('maCategory');
        return sel ? sel.value : 'other';
    }

    async function handleInputChange(evt) {
        var input = evt.target;
        var files = [];
        try { files = Array.prototype.slice.call(input.files || []); } catch (_e) { files = []; }
        input.value = '';
        if (files.length === 0) return;
        await enqueueUploads(files);
    }

    // 檔案來源可為系統相機/檔案選擇 input，或網頁攝影機拍出的 File
    async function enqueueUploads(files) {
        if (!files || files.length === 0) return;

        // 上傳歸戶使用當下最新的診症上下文（而非開啟 Modal 時的快照），
        // 避免開啟期間掛號狀態變化造成誤歸戶；病人詳情頁入口維持不帶診次
        var ctx;
        if (gallery.explicitPatient) {
            ctx = { patientId: gallery.patientId, patientName: gallery.patientName };
        } else {
            ctx = resolveVisitContext({
                patientId: gallery.patientId,
                patientName: gallery.patientName
            });
        }
        gallery.uploadCtx = ctx;
        var fixedCategory = gallery.category === 'tongue' ? 'tongue' : null;
        var progressEl = document.getElementById('maProgress');

        var tasks = files.map(function (file) {
            return async function () {
                var row = document.createElement('div');
                row.className = 'flex items-center gap-3 text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-2';
                var displayName = file.name || tt('圖片');
                var category = fixedCategory || currentUploadCategory();
                row.innerHTML =
                    '<span class="flex-1 truncate">' + esc(displayName) + '</span>' +
                    '<span data-role="pct" class="text-blue-600 w-24 text-right">0%</span>';
                progressEl.appendChild(row);
                var pctEl = row.querySelector('[data-role="pct"]');
                try {
                    await uploadOne(file, ctx, category, function (p) {
                        pctEl.textContent = Math.round(p * 100) + '%';
                    });
                    row.classList.add('text-green-700');
                    row.classList.remove('bg-gray-50');
                    row.classList.add('bg-green-50');
                    pctEl.textContent = tt('完成');
                    renderGrid();
                } catch (err) {
                    row.classList.add('text-red-700');
                    row.classList.remove('bg-gray-50');
                    row.classList.add('bg-red-50');
                    pctEl.textContent = tt('失敗');
                    var msg = document.createElement('span');
                    msg.className = 'block w-full text-xs text-red-600';
                    msg.textContent = (err && err.message) || '上傳失敗';
                    row.appendChild(document.createElement('br'));
                    row.appendChild(msg);
                    toast((file.name || '圖片') + '：' + ((err && err.message) || '上傳失敗'), 'error');
                }
            };
        });
        await runQueue(tasks, MAX_CONCURRENT);
    }

    /* ----------------------------------------------------------
     * 按鈕讀取圈（與系統「載入診斷模板」按鈕相同樣式：
     * 凍結按鈕尺寸、原文案隱形、中央顯示旋轉圈）
     * ---------------------------------------------------------- */
    function setBtnLoading(button) {
        if (!button || button.dataset.maLoading === '1') return;
        button.dataset.maLoading = '1';
        if (!button.dataset.originalHtml) {
            button.dataset.originalHtml = button.innerHTML;
        }
        if (!button.dataset.originalWidth) {
            var w = button.offsetWidth;
            var h = button.offsetHeight;
            if (w > 0) {
                button.dataset.originalWidth = w + 'px';
                button.style.width = w + 'px';
            }
            if (h > 0) {
                button.dataset.originalHeight = h + 'px';
                button.style.height = h + 'px';
            }
        }
        button.dataset.originalPosition = button.style.position || '';
        button.dataset.originalOverflow = button.style.overflow || '';
        button.style.position = 'relative';
        button.style.overflow = 'hidden';
        button.disabled = true;
        var originalHtml = button.dataset.originalHtml || button.innerHTML;
        button.innerHTML =
            '<span class="invisible pointer-events-none">' + originalHtml + '</span>' +
            '<span class="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">' +
                '<span class="inline-block animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent"></span>' +
            '</span>';
    }

    function clearBtnLoading(button) {
        if (!button) return;
        if (button.dataset.originalHtml !== undefined) {
            button.innerHTML = button.dataset.originalHtml;
            delete button.dataset.originalHtml;
        }
        if (button.dataset.originalWidth) {
            button.style.width = '';
            delete button.dataset.originalWidth;
        }
        if (button.dataset.originalHeight) {
            button.style.height = '';
            delete button.dataset.originalHeight;
        }
        if (button.dataset.originalPosition !== undefined) {
            button.style.position = button.dataset.originalPosition;
            delete button.dataset.originalPosition;
        }
        if (button.dataset.originalOverflow !== undefined) {
            button.style.overflow = button.dataset.originalOverflow;
            delete button.dataset.originalOverflow;
        }
        button.disabled = false;
        delete button.dataset.maLoading;
    }

    /** 由按鈕觸發開啟 Gallery：按鈕顯示讀取圈直到附件清單載入完成 */
    async function openGalleryFromTrigger(button, options) {
        try {
            if (button) setBtnLoading(button);
            await openGallery(options);
        } finally {
            if (button) clearBtnLoading(button);
        }
    }

    async function openGallery(options) {
        options = options || {};
        var scope = options.scope === 'visit' ? 'visit' : 'patient';
        var category = options.category === 'tongue' ? 'tongue' : 'all';
        var ctx = resolveVisitContext({ patientId: options.patientId, patientName: options.patientName });
        // 明確指定病人（病人詳情頁入口）時不帶當前診症上下文，避免誤關聯到其他掛號
        if (options.patientId) {
            ctx.appointmentId = '';
            ctx.consultationId = '';
            ctx.consultationDate = '';
            ctx.patientId = String(options.patientId);
        }
        if (!ctx.patientId) {
            toast('找不到當前病人，無法開啟附件', 'warning');
            return;
        }

        gallery = {
            scope: scope,
            category: category,
            filter: category === 'tongue' ? 'tongue' : 'all',
            patientId: ctx.patientId,
            patientName: ctx.patientName,
            // 列表過濾用：僅 visit scope 限定診次
            consultationId: scope === 'visit' ? ctx.consultationId : '',
            sessionId: '',
            // 上傳歸戶用：保留完整診症上下文（含編輯模式的 consultationId），
            // 與列表 scope 分開；病人詳情頁入口的 ctx 已清空診次，上傳保持未歸檔
            uploadCtx: ctx,
            explicitPatient: !!options.patientId
        };
        if (scope === 'visit' && !gallery.consultationId) {
            gallery.sessionId = ensureSessionId(ctx);
        }

        var titles = {
            'patient:all': '病歷歷來附件',
            'patient:tongue': '舌象圖片',
            'visit:all': '病歷附件'
        };
        document.getElementById('maTitle').textContent = tt(titles[scope + ':' + category]);
        document.getElementById('maSubtitle').textContent =
            (ctx.patientName ? ctx.patientName + '　' : '') +
            (scope === 'visit'
                ? (gallery.consultationId ? tt('本次診症附件') : tt('本次診症（尚未儲存）'))
                : tt('所有歷史附件'));

        renderUploadBar();
        renderFilters();
        document.getElementById('maGrid').innerHTML =
            '<div class="text-center py-8 text-gray-400"><div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-400"></div></div>';
        var noticeEl = document.getElementById('maConfigNotice');
        noticeEl.classList.add('hidden');

        document.getElementById('medicalAttachmentsModal').classList.remove('hidden');

        try {
            var cfg = await ensureConfig();
            if (!cfg.publicBase) {
                noticeEl.textContent = tt('附件公開讀取網域尚未設定（R2_PUBLIC_BASE），圖片可能無法顯示，請聯絡管理員完成 Cloudflare 設定。');
                noticeEl.classList.remove('hidden');
            }
            await listForPatient(ctx.patientId);
            if (gallery && gallery.patientId === ctx.patientId) renderGrid();
        } catch (err) {
            document.getElementById('maGrid').innerHTML =
                '<div class="text-center py-10 text-red-600 text-sm">' +
                esc((err && err.message) || '載入附件失敗') + '</div>';
        }
    }

    function closeGallery() {
        closeRelay();
        document.getElementById('medicalAttachmentsModal').classList.add('hidden');
        gallery = null;
    }

    /* ----------------------------------------------------------
     * Lightbox
     * ---------------------------------------------------------- */

    function buildLightboxGroup(fileId, patientId, visitKey, kind) {
        var docs = (patientCache[String(patientId)] || []).slice();
        if (kind === 'tongue') {
            docs = docs.filter(function (d) { return d.category === 'tongue'; });
        } else if (kind === 'other') {
            docs = docs.filter(function (d) { return d.category !== 'tongue'; });
        }
        if (visitKey && visitKey !== 'all') {
            if (visitKey.indexOf('session:') === 0) {
                var sid = visitKey.slice('session:'.length);
                docs = docs.filter(function (d) {
                    return !d.consultationId && String(d.sessionId || '') === sid;
                });
            } else {
                docs = docs.filter(function (d) {
                    return String(d.consultationId || '') === String(visitKey);
                });
            }
        }
        var idx = 0;
        for (var i = 0; i < docs.length; i++) {
            if ((docs[i].fileId || docs[i].id) === fileId) { idx = i; break; }
        }
        return { docs: docs, index: idx };
    }

    function renderLightbox() {
        if (!lightbox) return;
        var doc = lightbox.docs[lightbox.index];
        if (!doc) { closeLightbox(); return; }
        var src = publicUrl(doc.originalKey) || publicUrl(doc.thumbKey);
        var meta = CATEGORY_META[doc.category] || CATEGORY_META.other;
        document.getElementById('lbImage').src = src;
        var visitInfo = '';
        if (doc.consultationId) {
            visitInfo = '<span class="mr-3">' + tt('診症') + '：' +
                esc(doc.consultationDate || doc.consultationId) + '</span>';
        } else {
            visitInfo = '<span class="mr-3 text-amber-300">' + tt('未歸檔診症') + '</span>';
        }
        document.getElementById('lbInfo').innerHTML =
            '<span class="inline-block text-xs px-2 py-0.5 rounded-full border ' + meta.classes + ' mr-2">' + tt(meta.label) + '</span>' +
            visitInfo +
            '<span class="mr-3">' + tt('上傳時間') + '：' + esc(fmtDateTime(doc.uploadedAt)) + '</span>' +
            '<span class="text-white/70">' + (lightbox.index + 1) + ' / ' + lightbox.docs.length + '</span>';
        var hasMany = lightbox.docs.length > 1;
        document.getElementById('lbPrev').style.display = hasMany ? '' : 'none';
        document.getElementById('lbNext').style.display = hasMany ? '' : 'none';
    }

    function openLightbox(fileId, patientId, visitKey, kind) {
        var group = buildLightboxGroup(fileId, patientId, visitKey, kind);
        if (group.docs.length === 0) return;
        lightbox = group;
        document.getElementById('attachmentLightbox').classList.remove('hidden');
        renderLightbox();
    }

    function lightboxStep(delta) {
        if (!lightbox || lightbox.docs.length === 0) return;
        var n = lightbox.docs.length;
        lightbox.index = (lightbox.index + delta + n) % n;
        renderLightbox();
    }

    function closeLightbox() {
        document.getElementById('attachmentLightbox').classList.add('hidden');
        document.getElementById('lbImage').src = '';
        lightbox = null;
    }

    function onLightboxKeydown(e) {
        if (!lightbox) return;
        if (e.key === 'Escape') closeLightbox();
        else if (e.key === 'ArrowLeft') lightboxStep(-1);
        else if (e.key === 'ArrowRight') lightboxStep(1);
    }

    /* ----------------------------------------------------------
     * 病歷記錄內嵌縮圖（供 system.js 兩個渲染函式呼叫）
     * ---------------------------------------------------------- */

    /**
     * 分組該診次附件：{ attachments: 非舌象, tongues: 舌象 }
     */
    function visitGroups(patientId, consultationId) {
        var docs = patientCache[String(patientId)] || [];
        var groups = { attachments: [], tongues: [] };
        docs.forEach(function (d) {
            if (String(d.consultationId || '') !== String(consultationId)) return;
            if (d.category === 'tongue') groups.tongues.push(d);
            else groups.attachments.push(d);
        });
        return groups;
    }

    /**
     * 病歷記錄用的縮圖 HTML。
     * @param {Array} docs visitGroups 內的其中一個陣列
     * @param {string} patientId
     * @param {string} visitKey consultationId
     * @param {string} kind 'tongue' | 'other'
     * @param {string} [label] 縮圖列標題（如「病歷附件」）；空字串不顯示
     */
    function inlineThumbsHtml(docs, patientId, visitKey, kind, label) {
        if (!docs || docs.length === 0) return '';
        var labelHtml = label
            ? '<span class="block text-xs font-semibold text-gray-600 mt-2">' + tt(label) + '</span>'
            : '';
        return labelHtml + '<div class="flex flex-wrap gap-2 mt-1">' + docs.map(function (d) {
            var src = publicUrl(d.thumbKey);
            return '<button type="button" class="block w-24 h-24 rounded-lg overflow-hidden border border-gray-200 bg-gray-50 hover:opacity-80 transition" ' +
                'data-ma-file="' + esc(d.fileId || d.id) + '" ' +
                'data-ma-patient="' + esc(patientId) + '" ' +
                'data-ma-visit="' + esc(visitKey) + '" ' +
                'data-ma-kind="' + kind + '" ' +
                'title="' + esc(fmtDateTime(d.uploadedAt)) + '">' +
                (src ? '<img src="' + esc(src) + '" loading="lazy" class="w-full h-full object-cover" onerror="this.classList.add(\'opacity-20\')">' : '<span class="text-xl">🖼️</span>') +
            '</button>';
        }).join('') + '</div>';
    }

    /* ----------------------------------------------------------
     * 事件綁定
     * ---------------------------------------------------------- */

    function docClickHandler(e) {
        // 動態渲染區域中的開啟 Gallery 按鈕（病人詳情頁等）
        var openBtn = e.target.closest ? e.target.closest('[data-ma-open]') : null;
        if (openBtn) {
            openGalleryFromTrigger(openBtn, {
                scope: openBtn.getAttribute('data-scope') === 'visit' ? 'visit' : 'patient',
                category: openBtn.getAttribute('data-category') === 'tongue' ? 'tongue' : 'all',
                patientId: openBtn.getAttribute('data-patient') || '',
                patientName: openBtn.getAttribute('data-patient-name') || ''
            });
            return;
        }
        // Lightbox 開圖（gallery 卡片與病歷內嵌縮圖共用）
        var trigger = e.target.closest ? e.target.closest('[data-ma-file]') : null;
        if (trigger) {
            openLightbox(
                trigger.getAttribute('data-ma-file'),
                trigger.getAttribute('data-ma-patient'),
                trigger.getAttribute('data-ma-visit'),
                trigger.getAttribute('data-ma-kind')
            );
            return;
        }
        // 刪除
        var delBtn = e.target.closest ? e.target.closest('[data-ma-delete]') : null;
        if (delBtn) {
            e.stopPropagation();
            var fileId = delBtn.getAttribute('data-ma-delete');
            handleDeleteClick(fileId);
            return;
        }
        // 分類篩選
        var filterBtn = e.target.closest ? e.target.closest('[data-ma-filter]') : null;
        if (filterBtn && gallery) {
            gallery.filter = filterBtn.getAttribute('data-ma-filter');
            renderFilters();
            renderGrid();
        }
    }

    async function handleDeleteClick(fileId) {
        if (!gallery) return;
        var docs = patientCache[gallery.patientId] || [];
        var doc = null;
        for (var i = 0; i < docs.length; i++) {
            if ((docs[i].fileId || docs[i].id) === fileId) { doc = docs[i]; break; }
        }
        if (!doc) return;
        var confirmed = false;
        try { confirmed = await confirmDelete(doc); } catch (_e) {}
        if (!confirmed) return;
        try {
            var delResult = await deleteAttachment(doc);
            toast('附件已刪除', 'success');
            if (delResult && Array.isArray(delResult.r2Warnings) && delResult.r2Warnings.length > 0) {
                console.warn('部分 R2 物件刪除失敗:', delResult.r2Warnings);
                toast('部分檔案物件刪除失敗，已記錄於系統日誌', 'warning');
            }
            renderGrid();
        } catch (err) {
            toast('刪除失敗：' + ((err && err.message) || ''), 'error');
        }
    }

    /* ----------------------------------------------------------
     * 網頁攝影機拍照（getUserMedia）
     * 手機瀏覽器/桌面 USB 攝影機即時預覽；失敗或無權限時
     * 自動降級為 <input capture> 系統相機／檔案選擇
     * ---------------------------------------------------------- */

    var camStream = null;
    var camFacing = 'environment';
    var camBlob = null;
    var camBusy = false;

    function camEls() {
        return {
            modal: document.getElementById('maCameraModal'),
            video: document.getElementById('maCameraVideo'),
            canvas: document.getElementById('maCameraCanvas'),
            msg: document.getElementById('maCameraMsg'),
            switchBtn: document.getElementById('maCamSwitch'),
            liveCtl: document.getElementById('maCamLiveCtl'),
            shotCtl: document.getElementById('maCamShotCtl')
        };
    }

    function camSetLoading(text) {
        var els = camEls();
        els.video.classList.add('hidden');
        els.canvas.classList.add('hidden');
        els.liveCtl.classList.add('hidden');
        els.shotCtl.classList.add('hidden');
        els.switchBtn.classList.add('hidden');
        els.msg.classList.remove('hidden');
        var label = els.msg.querySelector('[data-role="msg"]');
        if (label) label.textContent = tt(text);
    }

    function camSetLive() {
        var els = camEls();
        els.msg.classList.add('hidden');
        els.canvas.classList.add('hidden');
        els.shotCtl.classList.add('hidden');
        els.video.classList.remove('hidden');
        els.liveCtl.classList.remove('hidden');
    }

    function camSetShot() {
        var els = camEls();
        els.msg.classList.add('hidden');
        els.video.classList.add('hidden');
        els.liveCtl.classList.add('hidden');
        els.canvas.classList.remove('hidden');
        els.shotCtl.classList.remove('hidden');
    }

    function stopCameraStream() {
        if (camStream) {
            camStream.getTracks().forEach(function (track) {
                try { track.stop(); } catch (_e) {}
            });
            camStream = null;
        }
        var els = camEls();
        if (els.video) els.video.srcObject = null;
    }

    function camFallback(message) {
        closeCameraModal();
        toast(tt(message), 'warning');
        var input = document.getElementById('maCameraInput');
        if (input) input.click();
    }

    async function startCameraStream() {
        stopCameraStream();
        camSetLoading('啟動攝影機中…');
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            camFallback('此瀏覽器不支援網頁攝影機，已改開系統相機或檔案選擇');
            return;
        }
        if (window.isSecureContext === false) {
            camFallback('必須透過 HTTPS 連線才能使用攝影機，已改開系統相機或檔案選擇');
            return;
        }
        try {
            camStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: { ideal: camFacing },
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                },
                audio: false
            });
        } catch (err) {
            console.warn('getUserMedia failed:', err);
            camFallback('無法啟用攝影機（未授權或未偵測到裝置），已改開系統相機或檔案選擇');
            return;
        }
        var els = camEls();
        els.video.srcObject = camStream;
        try { await els.video.play(); } catch (_e) {}
        // 超過一個影像輸入裝置（如手機前後鏡頭）才顯示切換鈕
        var multiCamera = false;
        try {
            var devices = await navigator.mediaDevices.enumerateDevices();
            multiCamera = devices.filter(function (d) { return d.kind === 'videoinput'; }).length > 1;
        } catch (_e) {}
        els.switchBtn.classList.toggle('hidden', !multiCamera);
        camSetLive();
    }

    async function openCameraCapture() {
        if (!gallery) return;
        var els = camEls();
        if (!els.modal) return;
        camBlob = null;
        els.canvas.width = 0;
        els.modal.classList.remove('hidden');
        await startCameraStream();
    }

    function onCamShutter() {
        if (camBusy || !camStream) return;
        var els = camEls();
        var w = els.video.videoWidth;
        var h = els.video.videoHeight;
        if (!w || !h) return;
        els.canvas.width = w;
        els.canvas.height = h;
        els.canvas.getContext('2d').drawImage(els.video, 0, 0, w, h);
        camBusy = true;
        els.canvas.toBlob(function (blob) {
            camBusy = false;
            if (!blob) {
                toast(tt('拍照失敗，請重試'), 'error');
                return;
            }
            camBlob = blob;
            camSetShot();
        }, 'image/jpeg', 0.92);
    }

    function onCamRetake() {
        camBlob = null;
        camSetLive();
    }

    async function onCamUsePhoto() {
        if (!camBlob) return;
        var d = new Date();
        function p(n) { return String(n).padStart(2, '0'); }
        var name = 'photo_' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) +
            '_' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + '.jpg';
        var file = new File([camBlob], name, { type: 'image/jpeg' });
        closeCameraModal();
        await enqueueUploads([file]);
    }

    function closeCameraModal() {
        stopCameraStream();
        var els = camEls();
        if (els.modal) els.modal.classList.add('hidden');
        if (els.canvas) { els.canvas.width = 0; els.canvas.classList.add('hidden'); }
        if (els.video) els.video.classList.add('hidden');
        camBlob = null;
    }

    /* ----------------------------------------------------------
     * 手機代拍（電腦出 QR／連結，手機掃碼拍照直傳，電腦輪詢接收）
     * ---------------------------------------------------------- */

    var relay = null;
    var RELAY_POLL_MS = 3000;

    function relayEls() {
        return {
            modal: document.getElementById('maRelayModal'),
            qr: document.getElementById('maRelayQr'),
            link: document.getElementById('maRelayLink'),
            copy: document.getElementById('maRelayCopy'),
            status: document.getElementById('maRelayStatus'),
            received: document.getElementById('maRelayReceived'),
            expiry: document.getElementById('maRelayExpiry'),
            regen: document.getElementById('maRelayRegen'),
            close: document.getElementById('maRelayClose')
        };
    }

    function relayContext() {
        if (gallery.explicitPatient) {
            return { patientId: gallery.patientId, patientName: gallery.patientName };
        }
        return resolveVisitContext({
            patientId: gallery.patientId,
            patientName: gallery.patientName
        });
    }

    function relayMode() {
        if (gallery.category === 'tongue') return 'tongue';
        if (gallery.scope === 'visit') return 'nontongue';
        return 'all';
    }

    async function openRelay() {
        if (!gallery) return;
        var els = relayEls();
        if (!els.modal) return;
        var ctx = relayContext();
        if (!ctx.patientId) {
            toast(tt('找不到當前病人，無法開啟附件'), 'error');
            return;
        }
        els.modal.classList.remove('hidden');
        els.qr.innerHTML = '<span class="text-gray-400 text-sm">' + tt('產生連結中…') + '</span>';
        els.received.innerHTML = '';
        els.status.textContent = tt('等待手機掃碼連線…');
        els.expiry.textContent = '';

        var info;
        try {
            info = await apiFetch('/capture-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    patientId: ctx.patientId,
                    patientName: ctx.patientName,
                    appointmentId: ctx.appointmentId || '',
                    consultationId: ctx.consultationId || '',
                    consultationDate: ctx.consultationDate || '',
                    mode: relayMode()
                })
            });
        } catch (err) {
            els.qr.innerHTML = '';
            els.status.textContent = (err && err.message) || tt('產生連結失敗');
            return;
        }

        relay = {
            sid: info.sid,
            url: info.captureUrl,
            patientId: String(ctx.patientId),
            expiresAt: new Date(info.expiresAt).getTime(),
            seen: {},
            timer: null
        };

        // QR Code（CDN 程式庫；未載入時只顯示連結）
        els.qr.innerHTML = '';
        if (window.QRCode) {
            try {
                new window.QRCode(els.qr, {
                    text: info.captureUrl,
                    width: 196,
                    height: 196,
                    colorDark: '#111827',
                    colorLight: '#ffffff',
                    correctLevel: window.QRCode.CorrectLevel ? window.QRCode.CorrectLevel.M : 0
                });
            } catch (_e) { els.qr.innerHTML = ''; }
        }
        els.link.textContent = info.captureUrl;
        pollRelay();
        relay.timer = setInterval(pollRelay, RELAY_POLL_MS);
    }

    async function pollRelay() {
        if (!relay) return;
        var els = relayEls();
        var remainMs = relay.expiresAt - Date.now();
        if (remainMs <= 0) {
            stopRelayPolling();
            els.status.textContent = tt('拍照連結已過期，請按「重新產生」');
            els.expiry.textContent = tt('已過期');
            return;
        }
        els.expiry.textContent = tt('連結有效期限') + '：' + Math.ceil(remainMs / 60000) + ' ' + tt('分鐘');

        var fb = window.firebase;
        try {
            var snap = await fb.getDocs(fb.firestoreQuery(
                fb.collection(fb.db, COLLECTION),
                fb.where('relaySessionId', '==', relay.sid)
            ));
            var readyDocs = snap.docs.map(normalizeDoc).filter(isReady);
            var fresh = [];
            readyDocs.forEach(function (d) {
                var id = d.fileId || d.id;
                if (!relay.seen[id]) {
                    relay.seen[id] = true;
                    fresh.push(d);
                }
            });
            if (fresh.length > 0) {
                fresh.forEach(function (d) { cacheUpsert(relay.patientId, d); });
                renderGrid();
                renderRelayReceived();
            }
            els.status.textContent = readyDocs.length > 0
                ? '✓ ' + tt('已從手機收到') + ' ' + readyDocs.length + ' ' + tt('張照片，可繼續拍攝')
                : tt('等待手機掃碼連線…');
        } catch (err) {
            console.warn('relay poll failed:', err);
        }
    }

    function renderRelayReceived() {
        if (!relay) return;
        var els = relayEls();
        var docs = (patientCache[relay.patientId] || []).filter(function (d) {
            return isReady(d) && String(d.relaySessionId || '') === String(relay.sid);
        });
        els.received.innerHTML = docs.map(function (d) {
            var src = publicUrl(d.thumbKey);
            return '<div class="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-200 bg-gray-50">' +
                (src
                    ? '<img src="' + esc(src) + '" alt="" loading="lazy" class="w-full h-full object-cover">'
                    : '<span class="text-2xl flex items-center justify-center h-full">🖼️</span>') +
            '</div>';
        }).join('');
    }

    function stopRelayPolling() {
        if (relay && relay.timer) {
            clearInterval(relay.timer);
            relay.timer = null;
        }
    }

    async function regenerateRelay() {
        stopRelayPolling();
        await openRelay();
    }

    function closeRelay() {
        stopRelayPolling();
        relay = null;
        var els = relayEls();
        if (els.modal) els.modal.classList.add('hidden');
    }

    async function copyRelayLink() {
        if (!relay) return;
        try {
            await navigator.clipboard.writeText(relay.url);
            toast(tt('連結已複製'), 'success');
        } catch (_e) {
            var els = relayEls();
            try {
                var range = document.createRange();
                range.selectNodeContents(els.link);
                var sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
                document.execCommand('copy');
                toast(tt('連結已複製'), 'success');
            } catch (_e2) {
                toast(tt('請手動選擇網址複製'), 'info');
            }
        }
    }

    function bindStaticUi() {
        document.addEventListener('click', docClickHandler);
        document.addEventListener('keydown', onLightboxKeydown);

        var closeGalleryBtn = document.getElementById('maCloseBtn');
        if (closeGalleryBtn) closeGalleryBtn.addEventListener('click', closeGallery);
        var modal = document.getElementById('medicalAttachmentsModal');
        if (modal) {
            modal.addEventListener('click', function (e) {
                if (e.target === modal) closeGallery();
            });
        }
        var lbClose = document.getElementById('lbClose');
        if (lbClose) lbClose.addEventListener('click', closeLightbox);
        var lbOverlay = document.getElementById('attachmentLightbox');
        if (lbOverlay) {
            lbOverlay.addEventListener('click', function (e) {
                if (e.target === lbOverlay) closeLightbox();
            });
        }
        var lbPrev = document.getElementById('lbPrev');
        var lbNext = document.getElementById('lbNext');
        if (lbPrev) lbPrev.addEventListener('click', function () { lightboxStep(-1); });
        if (lbNext) lbNext.addEventListener('click', function () { lightboxStep(1); });

        var camClose = document.getElementById('maCamClose');
        if (camClose) camClose.addEventListener('click', closeCameraModal);
        var camSwitch = document.getElementById('maCamSwitch');
        if (camSwitch) camSwitch.addEventListener('click', function () {
            camFacing = camFacing === 'environment' ? 'user' : 'environment';
            startCameraStream();
        });
        var camShutter = document.getElementById('maCamShutter');
        if (camShutter) camShutter.addEventListener('click', onCamShutter);
        var camRetake = document.getElementById('maCamRetake');
        if (camRetake) camRetake.addEventListener('click', onCamRetake);
        var camUse = document.getElementById('maCamUse');
        if (camUse) camUse.addEventListener('click', onCamUsePhoto);

        var relayClose = document.getElementById('maRelayClose');
        if (relayClose) relayClose.addEventListener('click', closeRelay);
        var relayRegen = document.getElementById('maRelayRegen');
        if (relayRegen) relayRegen.addEventListener('click', regenerateRelay);
        var relayCopy = document.getElementById('maRelayCopy');
        if (relayCopy) relayCopy.addEventListener('click', copyRelayLink);
        var relayModal = document.getElementById('maRelayModal');
        if (relayModal) {
            relayModal.addEventListener('click', function (e) {
                if (e.target === relayModal) closeRelay();
            });
        }
    }

    /* ----------------------------------------------------------
     * 公開介面
     * ---------------------------------------------------------- */

    /**
     * 供外部（如視訊診症舌象截圖）直接上傳一張圖到「當前診次」。
     * 上下文自動取當下診症中的掛號；未在診症中則拋錯。
     * @param {File|Blob} fileOrBlob 圖片
     * @param {string} category tongue | report | other
     */
    async function uploadVisitFile(fileOrBlob, category) {
        var ctx = resolveVisitContext({});
        if (!ctx.patientId) {
            throw new Error('目前沒有進行中的診症，無法上傳附件');
        }
        var file = fileOrBlob;
        if (!(file instanceof File) && (typeof Blob !== 'undefined' && file instanceof Blob)) {
            var ext = (String(file.type || '').indexOf('png') >= 0) ? 'png'
                : (String(file.type || '').indexOf('webp') >= 0) ? 'webp' : 'jpg';
            var d = new Date();
            function p(n) { return String(n).padStart(2, '0'); }
            var name = 'capture_' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) +
                '_' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + '.' + ext;
            file = new File([fileOrBlob], name, { type: fileOrBlob.type || 'image/jpeg' });
        }
        var cat = (category === 'report' || category === 'other') ? category : 'tongue';
        return await uploadOne(file, ctx, cat);
    }

    window.MedicalAttachments = {
        openGallery: openGallery,
        // HTML onclick 專用：傳入 event，按鈕會顯示讀取圈至清單載入完成
        openGalleryFromEvent: function (event, options) {
            var btn = event && event.currentTarget ? event.currentTarget : null;
            return openGalleryFromTrigger(btn, options || {});
        },
        closeGallery: closeGallery,
        listForPatient: listForPatient,
        visitGroups: visitGroups,
        inlineThumbsHtml: inlineThumbsHtml,
        linkVisitUploads: linkVisitUploads,
        resolveVisitContext: resolveVisitContext,
        uploadVisitFile: uploadVisitFile,
        // 供測試/除錯
        _internal: {
            prepareImage: prepareImage,
            buildPresignedHelpers: { putObject: putObject, publicUrl: publicUrl }
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindStaticUi);
    } else {
        bindStaticUi();
    }
})();
