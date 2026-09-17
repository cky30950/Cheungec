



function showClinicSettingsModal() {
    
    document.getElementById('clinicChineseName').value = clinicSettings.chineseName || '';
    document.getElementById('clinicEnglishName').value = clinicSettings.englishName || '';
    document.getElementById('clinicBusinessHours').value = clinicSettings.businessHours || '';
    document.getElementById('clinicPhone').value = clinicSettings.phone || '';
    document.getElementById('clinicAddress').value = clinicSettings.address || '';
    const thankYouInput = document.getElementById('clinicReceiptThankYouText');
    if (thankYouInput) thankYouInput.value = clinicSettings.receiptThankYouText || '';
    
    try { populateClinicSelectors(); } catch (_e) {}
    document.getElementById('clinicSettingsModal').classList.remove('hidden');
}

function hideClinicSettingsModal() {
    document.getElementById('clinicSettingsModal').classList.add('hidden');
}

async function saveClinicSettings() {
    const chineseName = document.getElementById('clinicChineseName').value.trim();
    const englishName = document.getElementById('clinicEnglishName').value.trim();
    const businessHours = document.getElementById('clinicBusinessHours').value.trim();
    const phone = document.getElementById('clinicPhone').value.trim();
    const address = document.getElementById('clinicAddress').value.trim();
    const thankYouInput = document.getElementById('clinicReceiptThankYouText');
    const receiptThankYouText = thankYouInput ? thankYouInput.value.trim() : '';
    
    if (!chineseName) {
        showToast('請輸入診所中文名稱！', 'error');
        return;
    }
    
    clinicSettings.chineseName = chineseName;
    clinicSettings.englishName = englishName;
    clinicSettings.businessHours = businessHours;
    clinicSettings.phone = phone;
    clinicSettings.address = address;
    clinicSettings.receiptThankYouText = receiptThankYouText;
    clinicSettings.updatedAt = new Date().toISOString();
    try {
        if (typeof currentClinicId !== 'undefined' && currentClinicId) {
            await window.firebaseDataManager.updateClinic(currentClinicId, clinicSettings);
            try {
                const listRes = await window.firebaseDataManager.getClinics();
                if (listRes && listRes.success && Array.isArray(listRes.data)) {
                    clinicsList = listRes.data;
                }
                try { localStorage.setItem('clinics', JSON.stringify(clinicsList)); } catch (_eLs) {}
            } catch (_eList) {}
            updateClinicSettingsDisplay();
            try { populateClinicSelectors(); } catch (_ePop) {}
            try { updateCurrentClinicDisplay(); } catch (_eDisp) {}
            hideClinicSettingsModal();
            showToast('診所資料已成功更新！', 'success');
        } else {
            showToast('未選擇診所', 'error');
        }
    } catch (_e) {
        showToast('更新診所資料失敗！', 'error');
    }
}

function updateClinicSettingsDisplay() {
    
    const chineseNameSpan = document.getElementById('displayChineseName');
    const englishNameSpan = document.getElementById('displayEnglishName');
    const activeClinicName = (typeof getClinicDisplayName === 'function' ? getClinicDisplayName(clinicSettings || {}) : (clinicSettings.chineseName || clinicSettings.englishName || '名醫診所系統')) || '名醫診所系統';
    const showSystemManagementClinicName = Array.isArray(clinicsList) && clinicsList.length > 1;
    const systemManagementClinicNameRowEl = document.getElementById('systemManagementClinicNameRow');
    const systemManagementClinicNameEl = document.getElementById('systemManagementClinicName');
    const herbClinicNameEl = document.getElementById('systemManagementHerbClinicName');
    const permissionClinicNameEl = document.getElementById('permissionClinicName');
    const receiptClinicNameEl = document.getElementById('receiptCustomizationClinicName');
    
    if (chineseNameSpan) {
        chineseNameSpan.textContent = clinicSettings.chineseName || '名醫診所系統';
    }
    if (englishNameSpan) {
        englishNameSpan.textContent = clinicSettings.englishName || 'Dr.Great Clinic';
    }
    if (systemManagementClinicNameRowEl) {
        systemManagementClinicNameRowEl.classList.toggle('hidden', !showSystemManagementClinicName);
    }
    if (systemManagementClinicNameEl) {
        systemManagementClinicNameEl.textContent = activeClinicName;
    }
    if (herbClinicNameEl) {
        herbClinicNameEl.textContent = activeClinicName;
    }
    if (permissionClinicNameEl) {
        permissionClinicNameEl.textContent = activeClinicName;
    }
    if (receiptClinicNameEl) {
        receiptClinicNameEl.textContent = activeClinicName;
    }
    
    
    const loginTitle = document.getElementById('loginTitle');
    const loginEnglishTitle = document.getElementById('loginEnglishTitle');
    if (loginTitle) {
        loginTitle.textContent = clinicSettings.chineseName || '名醫診所系統';
    }
    if (loginEnglishTitle) {
        loginEnglishTitle.textContent = clinicSettings.englishName || 'Dr.Great Clinic';
    }
    
    
    const systemTitle = document.getElementById('systemTitle');
    const systemEnglishTitle = document.getElementById('systemEnglishTitle');
    if (systemTitle) {
        systemTitle.textContent = clinicSettings.chineseName || '名醫診所系統';
    }
    if (systemEnglishTitle) {
        systemEnglishTitle.textContent = clinicSettings.englishName || 'Dr.Great Clinic';
    }
    
    
    const welcomeTitle = document.getElementById('welcomeTitle');
    const welcomeEnglishTitle = document.getElementById('welcomeEnglishTitle');
    if (welcomeTitle) {
        welcomeTitle.textContent = `歡迎使用${clinicSettings.chineseName || '名醫診所系統'}`;
    }
    if (welcomeEnglishTitle) {
        welcomeEnglishTitle.textContent = `Welcome to ${clinicSettings.englishName || 'Dr.Great Clinic'}`;
    }
    try {
        if (typeof applyReceiptCustomizationUI === 'function') {
            applyReceiptCustomizationUI();
        }
    } catch (_eApplyReceiptUI) {}
    try {
        if (typeof applyClinicHerbInventoryToggleUI === 'function') {
            applyClinicHerbInventoryToggleUI();
        }
    } catch (_eApplyHerbToggle) {}
    try {
        if (typeof loadPermissionManagementPanel === 'function') {
            loadPermissionManagementPanel();
        }
    } catch (_eLoadPermissionPanel) {}
    try {
        if (typeof updatePrescriptionDisplay === 'function') {
            updatePrescriptionDisplay();
        }
    } catch (_eUpdatePrescriptionDisplay) {}
    try {
        if (typeof searchHerbsForPrescription === 'function') {
            searchHerbsForPrescription();
        }
    } catch (_eSearchHerbs) {}
}



function showBackupProgressBar(totalSteps) {
    const container = document.getElementById('backupProgressContainer');
    const bar = document.getElementById('backupProgressBar');
    const text = document.getElementById('backupProgressText');
    if (container && bar && text) {
             container.classList.remove('hidden');
             bar.style.width = '0%';
             
             let baseLabel = '匯入進度';
             try {
                 if (window.t) {
                     baseLabel = window.t('匯入進度');
                 } else {
                     const lang = localStorage.getItem('lang') || 'zh';
                     const dict = window.translations && window.translations[lang] || {};
                     baseLabel = dict['匯入進度'] || baseLabel;
                 }
             } catch (e) {
                 baseLabel = '匯入進度';
             }
             text.textContent = baseLabel + ' 0%';
             container.dataset.totalSteps = totalSteps;
    }
}


function updateBackupProgressBar(currentStep, totalSteps) {
    const container = document.getElementById('backupProgressContainer');
    const bar = document.getElementById('backupProgressBar');
    const text = document.getElementById('backupProgressText');
    if (container && bar && text) {
        const percent = totalSteps > 0 ? Math.round((currentStep / totalSteps) * 100) : 0;
             bar.style.width = percent + '%';
             let baseLabel = '匯入進度';
             try {
                 if (window.t) {
                     baseLabel = window.t('匯入進度');
                 } else {
                     const lang = localStorage.getItem('lang') || 'zh';
                     const dict = window.translations && window.translations[lang] || {};
                     baseLabel = dict['匯入進度'] || baseLabel;
                 }
             } catch (e) {
                 baseLabel = '匯入進度';
             }
             text.textContent = baseLabel + ' ' + percent + '%';
    }
}


function finishBackupProgressBar(success) {
    const container = document.getElementById('backupProgressContainer');
    const bar = document.getElementById('backupProgressBar');
    const text = document.getElementById('backupProgressText');
    if (container && bar && text) {
             bar.style.width = '100%';
             let successMsg = '匯入完成！';
             let failureMsg = '匯入失敗！';
             try {
                 if (window.t) {
                     successMsg = window.t('匯入完成！');
                     failureMsg = window.t('匯入失敗！');
                 } else {
                     const lang = localStorage.getItem('lang') || 'zh';
                     const dict = window.translations && window.translations[lang] || {};
                     successMsg = dict['匯入完成！'] || successMsg;
                     failureMsg = dict['匯入失敗！'] || failureMsg;
                 }
             } catch (e) {
                 
             }
             text.textContent = success ? successMsg : failureMsg;
        
        setTimeout(() => {
            container.classList.add('hidden');
        }, 2000);
    }
}


async function manageBilling() {
    try {
        
        const uid = (window.currentUser && window.currentUser.uid) ? window.currentUser.uid : null;
        
        const response = await fetch('/create-customer-portal-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uid })
        });
        if (!response.ok) {
            throw new Error('network');
        }
        const data = await response.json();
        
        
        const billingUrl = 'https://billing.stripe.com/p/login/00w00l9Sk5I98irfdLcjS00';
        window.open(billingUrl, '_blank');
    } catch (err) {
        console.error('建立客戶門戶會話失敗:', err);
        showToast('開啟付款管理視窗失敗！', 'error');
    }
}


async function ensureFirebaseReady() {
    if (!window.firebaseDataManager || !window.firebaseDataManager.isReady) {
        for (let i = 0; i < 100 && (!window.firebaseDataManager || !window.firebaseDataManager.isReady); i++) {
            await new Promise(resolve => setTimeout(resolve, 50));
        }
    }
}


/**
 * 載入上次備份資訊並顯示在 UI 上。
 * 非阻塞，失敗時 UI 保持隱藏狀態。
 */
async function loadLastBackupInfo() {
    const infoEl = document.getElementById('lastBackupInfo');
    if (!infoEl) return;
    try {
        await ensureFirebaseReady();
        const docSnap = await window.firebase.getDoc(
            window.firebase.doc(window.firebase.db, 'backupMeta', 'lastBackup')
        );
        if (docSnap && docSnap.exists()) {
            const data = docSnap.data() || {};
            updateLastBackupInfo({
                timestamp: data.timestamp ? (data.timestamp.toDate ? data.timestamp.toDate() : new Date(data.timestamp)) : null,
                fileName: data.fileName,
                counts: data.counts,
                delta: data.delta || null
            });
        }
    } catch (_e) {
        // 備份資訊讀取失敗不影響主流程
    }
}

/**
 * 更新 UI 顯示上次備份資訊，包含：
 * - 備份時間 + 相對時間（剛剛 / 2 小時前 / 3 天前）
 * - 各集合文檔數量
 * - 自上次備份以來的變動（delta）
 */
function updateLastBackupInfo(info) {
    const infoEl = document.getElementById('lastBackupInfo');
    if (!infoEl || !info) return;

    const ts = info.timestamp ? (info.timestamp instanceof Date ? info.timestamp : new Date(info.timestamp)) : null;
    if (!ts || isNaN(ts.getTime())) {
        infoEl.classList.add('hidden');
        return;
    }

    const now = new Date();
    const diffMs = now - ts;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    let timeLabel;
    if (diffMs < 60000) timeLabel = '剛剛';
    else if (diffMs < 3600000) timeLabel = `${Math.floor(diffMs / 60000)} 分鐘前`;
    else if (diffMs < 86400000) timeLabel = `${Math.floor(diffMs / 3600000)} 小時前`;
    else if (diffDays === 1) timeLabel = '昨天';
    else timeLabel = `${diffDays} 天前`;

    const dateStr = ts.toLocaleString('zh-TW', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit'
    });

    // 組合數量顯示
    let countsStr = '';
    if (info.counts) {
        const parts = [];
        if (info.counts.patients !== undefined) parts.push(`病人 ${info.counts.patients}`);
        if (info.counts.consultations !== undefined) parts.push(`診症 ${info.counts.consultations}`);
        if (info.counts.users !== undefined) parts.push(`用戶 ${info.counts.users}`);
        countsStr = parts.length ? ` · ${parts.join(' / ')}` : '';
    }

    // 組合 delta 顯示（自上次備份以來的變動）
    // 支援兩種格式：
    //   舊格式：{ patients: +3, consultations: -5 }
    //   新格式：{ patients: { new: 3, changed: 12, removed: 0 } }
    let deltaStr = '';
    if (info.delta && typeof info.delta === 'object') {
        const deltaParts = [];
        const labels = {
            patients: '病人',
            consultations: '診症',
            users: '用戶',
            billingItems: '收費項目',
            patientPackages: '套票'
        };
        const keys = Object.keys(info.delta);
        if (keys.length > 0) {
            for (const k of keys) {
                const v = info.delta[k];
                if (v && typeof v === 'object') {
                    // 新格式：{ new, changed, removed }
                    const subParts = [];
                    if (v.new > 0) subParts.push(`+${v.new}`);
                    if (v.changed > 0) subParts.push(`變${v.changed}`);
                    if (v.removed > 0) subParts.push(`-${v.removed}`);
                    if (subParts.length > 0) deltaParts.push(`${labels[k] || k} ${subParts.join(' ')}`);
                } else if (typeof v === 'number') {
                    // 舊格式：純數量差
                    const sign = v > 0 ? '+' : '';
                    deltaParts.push(`${labels[k] || k} ${sign}${v}`);
                }
            }
            deltaStr = `\n📈 自上次備份以來：${deltaParts.join('，')}`;
        }
    } else if (info.prevBackupTime) {
        deltaStr = '\n（首次備份，無變動資訊）';
    }

    infoEl.innerHTML =
        `<div>上次備份：${dateStr}（${timeLabel}）${countsStr}</div>` +
        (deltaStr ? `<div style="margin-top:2px">${deltaStr.replace(/\n/g, '')}</div>` : '');
    infoEl.classList.remove('hidden');
}

// ==================== 備份 Manifest 工具 ====================
// 每次匯出後在 localStorage 存一份輕量 manifest（集合名 → { id: contentHash }）
// 下次匯出時拿來比較，算出「新增 / 變動 / 刪除」的文檔數量，供 UI 顯示
const MANIFEST_KEY = 'clinic_backup_manifest_v1';

function computeDocHash(data) {
    if (!data || typeof data !== 'object') return 'empty';
    // 優先用 updatedAt（如果有的話）
    const ua = data.updatedAt;
    if (ua) {
        if (ua instanceof Date) return 'ua:' + ua.getTime();
        if (typeof ua === 'object' && ua.seconds) return 'ua:' + ua.seconds;
        if (typeof ua === 'string') return 'ua:' + ua;
        if (typeof ua === 'number') return 'ua:' + ua;
    }
    const createdAt = data.createdAt;
    if (createdAt) {
        if (createdAt instanceof Date) return 'ca:' + createdAt.getTime();
        if (typeof createdAt === 'object' && createdAt.seconds) return 'ca:' + createdAt.seconds;
    }
    // 最後 fallback：對 JSON 字串做簡單 hash（DJB2），避免不同內容但相同長度導致誤判
    try {
        const json = JSON.stringify(data);
        let h = 5381;
        for (let i = 0; i < json.length; i++) { h = ((h << 5) + h) + json.charCodeAt(i); h |= 0; }
        return 'h:' + (h >>> 0).toString(36);
    } catch (_) { return 'unknown'; }
}

function loadBackupManifest() {
    try {
        const raw = localStorage.getItem(MANIFEST_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_) { return null; }
}

function saveBackupManifest(currentData) {
    try {
        const manifest = { _ts: Date.now() };
        const mapCollection = (items) => {
            const map = {};
            if (Array.isArray(items)) {
                for (const item of items) {
                    if (!item || item.id === undefined || item.id === null) continue;
                    const { id, ...rest } = item;
                    map[String(id)] = computeDocHash(rest);
                }
            }
            return map;
        };
        manifest.patients = mapCollection(currentData.patients);
        manifest.consultations = mapCollection(currentData.consultations);
        manifest.users = mapCollection(currentData.users);
        manifest.billingItems = mapCollection(currentData.billingItems);
        manifest.patientPackages = mapCollection(currentData.patientPackages);
        localStorage.setItem(MANIFEST_KEY, JSON.stringify(manifest));
    } catch (_) { /* quota 滿了或其他錯，靜默 */ }
}

// 比較當前文檔清單與 manifest，傳回 { new, changed, removed, total }
function diffCollectionAgainstManifest(items, prevMap) {
    const result = { new: 0, changed: 0, removed: 0, total: 0 };
    const newIds = new Set();
    if (Array.isArray(items)) {
        result.total = items.length;
        for (const item of items) {
            if (!item || item.id === undefined || item.id === null) continue;
            const idStr = String(item.id);
            newIds.add(idStr);
            const { id, ...rest } = item;
            const hash = computeDocHash(rest);
            if (!prevMap || !prevMap[idStr]) {
                result.new++;
            } else if (prevMap[idStr] !== hash) {
                result.changed++;
            }
        }
    }
    if (prevMap) {
        for (const prevId of Object.keys(prevMap)) {
            if (!newIds.has(prevId)) result.removed++;
        }
    }
    return result;
}


async function exportClinicBackup() {
    const button = document.getElementById('backupExportBtn');
    setButtonLoading(button);

    // 細粒度進度回調 — 更新 backupProgressDetail 元素
    const detailEl = document.getElementById('backupProgressDetail');
    const setDetail = (html) => {
        if (detailEl) { detailEl.innerHTML = html; detailEl.classList.remove('hidden'); }
    };
    const getDetail = () => detailEl ? (detailEl.innerHTML || '') : '';
    const appendDetail = (html) => setDetail(getDetail() + html);

    const labelMap = {
        patients: '病人資料', consultations: '診症記錄',
        users: '用戶資料', billingItems: '收費項目', patientPackages: '套票資料'
    };

    try {
        await ensureFirebaseReady();
        let totalSteps = 6; // 病人+診症 / 用戶 / 收費項目 / 套票 / 組裝下載 / 更新記錄
        let stepCount = 0;
        showBackupProgressBar(totalSteps);

        // 讀取上次 manifest 供變動比較
        const prevManifest = loadBackupManifest();
        const hasPrevManifest = !!prevManifest;

        const db = window.firebase.db;
        const col = (name) => window.firebase.collection(db, name);

        // ====== Step 1: 病人 + 診症（並行讀取） ======
        let patientsData = [];
        let consultationsData = [];
        try {
            setDetail('<span style="color:#6b7280">正在讀取病人資料 + 診症記錄...</span>');
            const [patientsSnap, consultationsSnap] = await Promise.all([
                window.firebase.getDocs(col('patients')),
                window.firebase.getDocs(col('consultations'))
            ]);
            patientsSnap.forEach((docSnap) => { patientsData.push({ id: docSnap.id, ...docSnap.data() }); });
            consultationsSnap.forEach((docSnap) => { consultationsData.push({ id: docSnap.id, ...docSnap.data() }); });

            // 變動比較
            const pDiff = diffCollectionAgainstManifest(patientsData, prevManifest?.patients);
            const cDiff = diffCollectionAgainstManifest(consultationsData, prevManifest?.consultations);
            const buildSummary = (diff, displayName) => {
                const parts = [];
                if (diff.new > 0) parts.push(`<span style="color:#16a34a">新增 ${diff.new}</span>`);
                if (diff.changed > 0) parts.push(`<span style="color:#2563eb">變動 ${diff.changed}</span>`);
                if (diff.removed > 0) parts.push(`<span style="color:#dc2626">刪除 ${diff.removed}</span>`);
                const summary = parts.length > 0 ? parts.join(' · ') : (hasPrevManifest ? '無變動' : '首次備份');
                return `${displayName} ✓ ${diff.total} 筆${hasPrevManifest ? ' · ' + summary : ''}`;
            };
            setDetail(buildSummary(pDiff, '病人資料') + '<br>' + buildSummary(cDiff, '診症記錄'));
        } catch (_fetchErr) {
            console.error('讀取病人或診症資料失敗:', _fetchErr);
            setDetail('<span style="color:#dc2626">病人/診症讀取失敗</span>');
        }
        stepCount++; updateBackupProgressBar(stepCount, totalSteps);

        // ====== Step 2: 用戶 ======
        let usersData = [];
        try {
            appendDetail('<br><span style="color:#6b7280">正在讀取用戶資料...</span>');
            const userSnap = await window.firebase.getDocs(col('users'));
            userSnap.forEach((docSnap) => { usersData.push({ id: docSnap.id, ...docSnap.data() }); });
            const uDiff = diffCollectionAgainstManifest(usersData, prevManifest?.users);
            const uParts = [];
            if (uDiff.new > 0) uParts.push(`<span style="color:#16a34a">新增 ${uDiff.new}</span>`);
            if (uDiff.changed > 0) uParts.push(`<span style="color:#2563eb">變動 ${uDiff.changed}</span>`);
            if (uDiff.removed > 0) uParts.push(`<span style="color:#dc2626">刪除 ${uDiff.removed}</span>`);
            const uSummary = uParts.length > 0 ? ' · ' + uParts.join(' · ') : (hasPrevManifest ? ' · 無變動' : '');
            appendDetail('<br>用戶資料 ✓ ' + usersData.length + ' 筆' + uSummary);
        } catch (_fetchErr) {
            console.warn('匯出備份時取得用戶列表失敗，將不包含用戶資料');
            appendDetail('<br><span style="color:#dc2626">用戶讀取失敗（略過）</span>');
        }
        stepCount++; updateBackupProgressBar(stepCount, totalSteps);

        // ====== Step 3: 收費項目 ======
        if (typeof initBillingItems === 'function') {
            appendDetail('<br><span style="color:#6b7280">正在讀取收費項目...</span>');
            await initBillingItems();
        }
        const billingData = Array.isArray(billingItems) ? billingItems : [];
        const bDiff = diffCollectionAgainstManifest(billingData, prevManifest?.billingItems);
        const bParts = [];
        if (bDiff.new > 0) bParts.push(`<span style="color:#16a34a">新增 ${bDiff.new}</span>`);
        if (bDiff.changed > 0) bParts.push(`<span style="color:#2563eb">變動 ${bDiff.changed}</span>`);
        if (bDiff.removed > 0) bParts.push(`<span style="color:#dc2626">刪除 ${bDiff.removed}</span>`);
        const bSummary = bParts.length > 0 ? ' · ' + bParts.join(' · ') : (hasPrevManifest ? ' · 無變動' : '');
        appendDetail('<br>收費項目 ✓ ' + billingData.length + ' 筆' + bSummary);
        stepCount++; updateBackupProgressBar(stepCount, totalSteps);

        // ====== Step 4: 套票 ======
        let packageData = [];
        try {
            const snapshot = await window.firebase.getDocs(col('patientPackages'));
            snapshot.forEach((docSnap) => { packageData.push({ id: docSnap.id, ...docSnap.data() }); });
            const pkDiff = diffCollectionAgainstManifest(packageData, prevManifest?.patientPackages);
            const pkParts = [];
            if (pkDiff.new > 0) pkParts.push(`<span style="color:#16a34a">新增 ${pkDiff.new}</span>`);
            if (pkDiff.changed > 0) pkParts.push(`<span style="color:#2563eb">變動 ${pkDiff.changed}</span>`);
            if (pkDiff.removed > 0) pkParts.push(`<span style="color:#dc2626">刪除 ${pkDiff.removed}</span>`);
            const pkSummary = pkParts.length > 0 ? ' · ' + pkParts.join(' · ') : (hasPrevManifest ? ' · 無變動' : '');
            appendDetail('<br>套票資料 ✓ ' + packageData.length + ' 筆' + pkSummary);
        } catch (e) {
            console.error('讀取套票資料失敗:', e);
            appendDetail('<br><span style="color:#dc2626">套票讀取失敗</span>');
        }
        stepCount++; updateBackupProgressBar(stepCount, totalSteps);

        // ====== Step 5: 組裝 + 下載 ======
        appendDetail('<br><span style="color:#6b7280">正在組裝備份檔案...</span>');
        let rtdbData = null;
        try {
            const rtdbSnap = await window.firebase.get(window.firebase.ref(window.firebase.rtdb));
            const allRtdb = (rtdbSnap && rtdbSnap.exists()) ? rtdbSnap.val() : {};
            if (allRtdb && typeof allRtdb === 'object') {
                rtdbData = {};
                for (const key of Object.keys(allRtdb)) {
                    if (!['appointments', 'consultations', 'consultation', 'onlineConsultations'].includes(key)) {
                        rtdbData[key] = allRtdb[key];
                    }
                }
            }
        } catch (e) {
            console.warn('讀取 Realtime Database 資料失敗:', e);
        }

        const backup = { patients: patientsData, consultations: consultationsData, users: usersData, billingItems: billingData, patientPackages: packageData };
        if (rtdbData) backup.rtdb = rtdbData;

        const json = JSON.stringify(backup, null, 2);
        const jsonBytes = new Blob([json]).size;
        const jsonKB = Math.round(jsonBytes / 1024);
        const jsonMB = (jsonBytes / 1024 / 1024).toFixed(1);
        const sizeStr = jsonMB >= 1 ? jsonMB + ' MB' : jsonKB + ' KB';
        const totalDocs = patientsData.length + consultationsData.length + usersData.length + billingData.length + packageData.length;

        stepCount++; updateBackupProgressBar(stepCount, totalSteps);
        const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        a.download = `clinic_backup_${timestamp}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast(`備份資料已匯出！（${sizeStr}，共 ${totalDocs} 筆）`, 'success');

        // 顯示檔案資訊
        const finalDiff = {
            patients: diffCollectionAgainstManifest(patientsData, prevManifest?.patients),
            consultations: diffCollectionAgainstManifest(consultationsData, prevManifest?.consultations),
            users: diffCollectionAgainstManifest(usersData, prevManifest?.users),
            billingItems: diffCollectionAgainstManifest(billingData, prevManifest?.billingItems),
            patientPackages: diffCollectionAgainstManifest(packageData, prevManifest?.patientPackages)
        };
        const changeItems = [];
        const totalNew = Object.values(finalDiff).reduce((s, d) => s + d.new, 0);
        const totalChanged = Object.values(finalDiff).reduce((s, d) => s + d.changed, 0);
        const totalRemoved = Object.values(finalDiff).reduce((s, d) => s + d.removed, 0);
        if (totalNew > 0) changeItems.push(`<span style="color:#16a34a">新增 ${totalNew}</span>`);
        if (totalChanged > 0) changeItems.push(`<span style="color:#2563eb">變動 ${totalChanged}</span>`);
        if (totalRemoved > 0) changeItems.push(`<span style="color:#dc2626">刪除 ${totalRemoved}</span>`);
        const changeSummary = changeItems.length > 0 ? changeItems.join(' · ') : (hasPrevManifest ? '無變動' : '首次備份');
        setDetail(`匯出完成 ✓ ${totalDocs} 筆 · ${sizeStr}<br>${hasPrevManifest ? '📈 自上次備份以來：' + changeSummary : '📋 首次備份（已記錄基準線）'}`);

        // ====== Step 6: 更新記錄 + 存 manifest ======
        stepCount++; updateBackupProgressBar(stepCount, totalSteps);
        finishBackupProgressBar(true);

        // 存 localStorage manifest（下次備份拿來比）
        saveBackupManifest({
            patients: patientsData, consultations: consultationsData,
            users: usersData, billingItems: billingData, patientPackages: packageData
        });

        // 寫 Firestore backupMeta
        try {
            const currentCounts = {
                patients: patientsData.length, consultations: consultationsData.length,
                users: usersData.length, billingItems: billingData.length,
                patientPackages: packageData.length
            };

            // 詳細 delta（用 manifest 比對的結果）
            let delta = null;
            if (hasPrevManifest) {
                const d = {};
                for (const [colName, label] of Object.entries(labelMap)) {
                    const fd = finalDiff[colName];
                    if (!fd) continue;
                    if (fd.new === 0 && fd.changed === 0 && fd.removed === 0) continue;
                    d[colName] = { new: fd.new, changed: fd.changed, removed: fd.removed };
                }
                if (Object.keys(d).length > 0) delta = d;
            }

            // 同時讀取 Firestore 裡的上次備份時間供 UI 顯示
            let prevBackupTime = null;
            try {
                const prevSnap = await window.firebase.getDoc(
                    window.firebase.doc(window.firebase.db, 'backupMeta', 'lastBackup')
                );
                if (prevSnap && prevSnap.exists()) {
                    const prev = prevSnap.data() || {};
                    prevBackupTime = prev.timestamp
                        ? (prev.timestamp.toDate ? prev.timestamp.toDate() : new Date(prev.timestamp))
                        : null;
                }
            } catch (_) {}

            await window.firebase.setDoc(
                window.firebase.doc(window.firebase.db, 'backupMeta', 'lastBackup'),
                {
                    timestamp: window.firebase.serverTimestamp ? window.firebase.serverTimestamp() : new Date(),
                    localTime: new Date().toISOString(),
                    fileName: `clinic_backup_${timestamp}.json`,
                    counts: currentCounts,
                    delta,
                    totalDocs,
                    fileSizeBytes: jsonBytes
                }
            );

            updateLastBackupInfo({
                timestamp: new Date(),
                fileName: `clinic_backup_${timestamp}.json`,
                counts: currentCounts,
                delta,
                prevBackupTime
            });
        } catch (_metaErr) {
            console.warn('更新備份記錄失敗（不影響備份本身）:', _metaErr);
        }
    } catch (error) {
        console.error('匯出備份失敗:', error);
        showToast('匯出備份失敗，請稍後再試', 'error');
        finishBackupProgressBar(false);
    } finally {
        clearButtonLoading(button);
    }
}


function triggerBackupImport() {
    const input = document.getElementById('backupFileInput');
    if (input) {
        input.value = '';  
        input.click();
    }
}


async function handleBackupFile(file) {
    if (!file) return;
    {
        const lang = localStorage.getItem('lang') || 'zh';
        const zhMsg = '匯入備份將覆蓋現有資料，確定要繼續嗎？';
        const enMsg = 'Importing a backup will overwrite existing data; are you sure you want to continue?';
        const confirmed = await showConfirmation(lang === 'en' ? enMsg : zhMsg, 'warning');
        if (!confirmed) {
            return;
        }
    }
    const button = document.getElementById('backupImportBtn');
    setButtonLoading(button);
    
    let totalStepsForBackupImport = 5;
    let data;
    try {
        const text = await file.text();
        data = JSON.parse(text);
        if (data && typeof data.rtdb === 'object' && data.rtdb !== null) {
            totalStepsForBackupImport++;
        }
    } catch (parseErr) {
        console.error('讀取備份檔案失敗:', parseErr);
        showToast('讀取備份檔案失敗，請確認檔案格式是否正確', 'error');
        clearButtonLoading(button);
        return;
    }
    
    showBackupProgressBar(totalStepsForBackupImport);
    try {
        // 詳細進度回調 — 更新 backupProgressDetail 元素
        const detailProgress = (info) => {
            const detailEl = document.getElementById('backupProgressDetail');
            if (!detailEl) return;

            if (info.phase === 'analyzed') {
                detailEl.innerHTML = info.message;
                detailEl.classList.remove('hidden');
            } else if (info.phase === 'writing') {
                const percent = info.percent || 0;
                const done = info.done || 0;
                const total = info.total || 0;
                const adds = info.added || 0;
                const upds = info.updated || 0;
                const dels = info.deleted || 0;
                const parts = [];
                if (adds > 0) parts.push(`<span style="color:#16a34a">新增</span>`);
                if (upds > 0) parts.push(`<span style="color:#2563eb">更新</span>`);
                if (dels > 0) parts.push(`<span style="color:#dc2626">刪除</span>`);
                detailEl.innerHTML = `正在寫入 ${info.displayName}：${parts.join(' / ')} · ${done}/${total}（${percent}%）`;
                detailEl.classList.remove('hidden');
            } else if (info.phase === 'done') {
                const parts = [];
                if (info.added > 0) parts.push(`<span style="color:#16a34a">新增 ${info.added}</span>`);
                if (info.updated > 0) parts.push(`<span style="color:#2563eb">更新 ${info.updated}</span>`);
                if (info.deleted > 0) parts.push(`<span style="color:#dc2626">刪除 ${info.deleted}</span>`);
                detailEl.innerHTML = `${info.displayName} ✓ ${parts.length > 0 ? parts.join(' · ') : '無變動'}`;
                detailEl.classList.remove('hidden');
            }
        };

        await importClinicBackup(data, function(step, total) {
            updateBackupProgressBar(step, total);
        }, totalStepsForBackupImport, detailProgress);
        showToast('備份資料匯入完成！', 'success');
        finishBackupProgressBar(true);

        // 匯入完更新備份記錄（使用匯入的備份檔案中的數量）
        try {
            const importedCounts = {
                patients: Array.isArray(data.patients) ? data.patients.length : 0,
                consultations: Array.isArray(data.consultations) ? data.consultations.length : 0,
                users: Array.isArray(data.users) ? data.users.length : 0,
                billingItems: Array.isArray(data.billingItems) ? data.billingItems.length : 0,
                patientPackages: Array.isArray(data.patientPackages) ? data.patientPackages.length : 0
            };
            await window.firebase.setDoc(
                window.firebase.doc(window.firebase.db, 'backupMeta', 'lastBackup'),
                {
                    timestamp: window.firebase.serverTimestamp ? window.firebase.serverTimestamp() : new Date(),
                    localTime: new Date().toISOString(),
                    fileName: null,
                    importedAt: new Date().toISOString(),
                    importedFrom: file.name,
                    counts: importedCounts,
                    delta: null
                }
            );
        } catch (_metaErr) {}

        // 匯入完更新 manifest（下次備份拿來比的基準線）
        try {
            saveBackupManifest({
                patients: data.patients || [],
                consultations: data.consultations || [],
                users: data.users || [],
                billingItems: data.billingItems || [],
                patientPackages: data.patientPackages || []
            });
        } catch (_mErr) {}
    } catch (error) {
        console.error('匯入備份失敗:', error);
        showToast('匯入備份失敗，請確認檔案格式是否正確', 'error');
        
        finishBackupProgressBar(false);
    } finally {
        clearButtonLoading(button);
    }
}


async function importClinicBackup(data) {
    let progressCallback = null;
    
    let totalSteps = 5;
    
    if (arguments.length >= 2 && typeof arguments[1] === 'function') {
        progressCallback = arguments[1];
    }
    if (arguments.length >= 3 && typeof arguments[2] === 'number') {
        totalSteps = arguments[2];
    }
    await ensureFirebaseReady();
    
    
    async function replaceCollection(collectionName, items, onProgress) {
        const colRef = window.firebase.collection(window.firebase.db, collectionName);
        const labelMap = {
            patients: '病人資料',
            consultations: '診症記錄',
            users: '用戶資料',
            patientPackages: '套票資料'
        };
        const displayName = labelMap[collectionName] || collectionName;

        try {
            // 顯示「正在讀取現有資料...」
            if (typeof onProgress === 'function') {
                onProgress({ phase: 'start', collection: collectionName, displayName, message: `正在處理 ${displayName}...` });
            }

            const snap = await window.firebase.getDocs(colRef);
            const existingIds = new Set();
            snap.forEach((docSnap) => {
                existingIds.add(docSnap.id);
            });

            const newIds = new Set();
            if (Array.isArray(items)) {
                items.forEach(item => {
                    if (item && item.id !== undefined && item.id !== null) {
                        newIds.add(String(item.id));
                    }
                });
            }

            // 計算差異
            const idsToDelete = [];
            let addedCount = 0;
            let updatedCount = 0;
            const itemIdList = new Map();
            if (Array.isArray(items)) {
                for (const item of items) {
                    if (!item || item.id === undefined || item.id === null) continue;
                    const idStr = String(item.id);
                    if (existingIds.has(idStr)) {
                        updatedCount++;
                    } else {
                        addedCount++;
                    }
                    itemIdList.set(idStr, item);
                }
            }
            existingIds.forEach(id => {
                if (!newIds.has(id)) {
                    idsToDelete.push(id);
                }
            });
            const deletedCount = idsToDelete.length;

            const totalOps = addedCount + updatedCount + deletedCount;
            let doneOps = 0;

            // 顯示預估
            if (typeof onProgress === 'function') {
                const parts = [];
                if (addedCount > 0) parts.push(`<span style="color:#16a34a">新增 ${addedCount}</span>`);
                if (updatedCount > 0) parts.push(`<span style="color:#2563eb">更新 ${updatedCount}</span>`);
                if (deletedCount > 0) parts.push(`<span style="color:#dc2626">刪除 ${deletedCount}</span>`);
                const summary = parts.length > 0 ? parts.join(' · ') : '無變動';
                onProgress({
                    phase: 'analyzed',
                    collection: collectionName,
                    displayName,
                    added: addedCount, updated: updatedCount, deleted: deletedCount,
                    message: `${displayName}：${summary}`
                });
            }

            // 批次寫入
            let batch = window.firebase.writeBatch(window.firebase.db);
            let opCount = 0;
            const reportBatchProgress = () => {
                if (typeof onProgress === 'function' && totalOps > 0) {
                    const percent = Math.round((doneOps / totalOps) * 100);
                    onProgress({
                        phase: 'writing',
                        collection: collectionName,
                        displayName,
                        done: doneOps, total: totalOps, percent,
                        added: addedCount, updated: updatedCount, deleted: deletedCount
                    });
                }
            };
            const commitBatch = async () => {
                if (opCount > 0) {
                    await batch.commit();
                    batch = window.firebase.writeBatch(window.firebase.db);
                    opCount = 0;
                }
            };

            // 先刪除
            for (const id of idsToDelete) {
                const docRef = window.firebase.doc(window.firebase.db, collectionName, id);
                batch.delete(docRef);
                opCount++;
                doneOps++;
                if (opCount >= 500) {
                    await commitBatch();
                    reportBatchProgress();
                }
            }

            // 再寫入（新增 + 更新都用 set）
            if (Array.isArray(items)) {
                for (const item of items) {
                    if (!item || item.id === undefined || item.id === null) continue;
                    const idStr = String(item.id);
                    const docRef = window.firebase.doc(window.firebase.db, collectionName, idStr);
                    let dataToWrite;
                    try {
                        const { id, ...rest } = item || {};
                        dataToWrite = { ...rest };
                    } catch (_omitErr) {
                        dataToWrite = item;
                    }
                    batch.set(docRef, dataToWrite);
                    opCount++;
                    doneOps++;
                    if (opCount >= 500) {
                        await commitBatch();
                        reportBatchProgress();
                    }
                }
            }

            await commitBatch();
            reportBatchProgress();

            if (typeof onProgress === 'function') {
                onProgress({
                    phase: 'done',
                    collection: collectionName,
                    displayName,
                    added: addedCount, updated: updatedCount, deleted: deletedCount,
                    message: `${displayName} 完成`
                });
            }
        } catch (err) {
            console.error('更新 ' + collectionName + ' 資料時發生錯誤:', err);
            throw err;
        }
    }
    async function replaceClinicBillingItems(items, onProgress) {
        const displayName = '收費項目';
        try {
            if (typeof onProgress === 'function') {
                onProgress({ phase: 'start', collection: 'billingItems', displayName, message: `正在處理 ${displayName}...` });
            }
            await waitForFirebaseDb();
            const clinicId = localStorage.getItem('currentClinicId') || (typeof currentClinicId !== 'undefined' ? currentClinicId : 'local-default');
            const clinicCol = window.firebase.collection(window.firebase.db, 'clinics', clinicId, 'billingItems');
            const globalCol = window.firebase.collection(window.firebase.db, 'globalBillingItems');
            const clinicSnap = await window.firebase.getDocs(clinicCol);
            const globalSnap = await window.firebase.getDocs(globalCol);
            const existingClinicIds = new Set();
            const existingGlobalIds = new Set();
            clinicSnap.forEach(d => existingClinicIds.add(d.id));
            globalSnap.forEach(d => existingGlobalIds.add(d.id));
            const newClinicIds = new Set();
            const newGlobalIds = new Set();
            if (Array.isArray(items)) {
                items.forEach(it => {
                    if (!it || it.id === undefined || it.id === null) return;
                    const idStr = String(it.id);
                    if (it.shared) newGlobalIds.add(idStr);
                    else newClinicIds.add(idStr);
                });
            }

            // 計算差異
            const idsToDelete = [];
            existingClinicIds.forEach(id => { if (!newClinicIds.has(id)) idsToDelete.push(id); });
            existingGlobalIds.forEach(id => { if (!newGlobalIds.has(id)) idsToDelete.push(id); });

            let addedCount = 0;
            let updatedCount = 0;
            if (Array.isArray(items)) {
                for (const it of items) {
                    if (!it || it.id === undefined || it.id === null) continue;
                    const idStr = String(it.id);
                    const wasExisting = existingClinicIds.has(idStr) || existingGlobalIds.has(idStr);
                    if (wasExisting) updatedCount++;
                    else addedCount++;
                }
            }
            const deletedCount = idsToDelete.length;
            const totalOps = addedCount + updatedCount + deletedCount;
            let doneOps = 0;

            if (typeof onProgress === 'function') {
                const parts = [];
                if (addedCount > 0) parts.push(`<span style="color:#16a34a">新增 ${addedCount}</span>`);
                if (updatedCount > 0) parts.push(`<span style="color:#2563eb">更新 ${updatedCount}</span>`);
                if (deletedCount > 0) parts.push(`<span style="color:#dc2626">刪除 ${deletedCount}</span>`);
                onProgress({
                    phase: 'analyzed', collection: 'billingItems', displayName,
                    added: addedCount, updated: updatedCount, deleted: deletedCount,
                    message: `${displayName}：${parts.length > 0 ? parts.join(' · ') : '無變動'}`
                });
            }

            const batch = window.firebase.writeBatch(window.firebase.db);
            let opCount = 0;
            const commitIfNeeded = async () => {
                if (opCount > 0) {
                    await batch.commit();
                    batch = window.firebase.writeBatch(window.firebase.db);
                    opCount = 0;
                }
                if (typeof onProgress === 'function' && totalOps > 0) {
                    const percent = Math.round((doneOps / totalOps) * 100);
                    onProgress({
                        phase: 'writing', collection: 'billingItems', displayName,
                        done: doneOps, total: totalOps, percent,
                        added: addedCount, updated: updatedCount, deleted: deletedCount
                    });
                }
            };

            // 先刪除
            for (const id of idsToDelete) {
                const isGlobal = existingGlobalIds.has(id);
                const docRef = isGlobal
                    ? window.firebase.doc(window.firebase.db, 'globalBillingItems', id)
                    : window.firebase.doc(window.firebase.db, 'clinics', clinicId, 'billingItems', id);
                batch.delete(docRef);
                opCount++; doneOps++;
                if (opCount >= 500) await commitIfNeeded();
            }
            // 再寫入
            if (Array.isArray(items)) {
                for (const it of items) {
                    if (!it || it.id === undefined || it.id === null) continue;
                    const { id, ...rest } = it || {};
                    const dataToWrite = { ...rest };
                    const idStr = String(it.id);
                    const docRef = it.shared
                        ? window.firebase.doc(window.firebase.db, 'globalBillingItems', idStr)
                        : window.firebase.doc(window.firebase.db, 'clinics', clinicId, 'billingItems', idStr);
                    batch.set(docRef, dataToWrite);
                    opCount++; doneOps++;
                    if (opCount >= 500) await commitIfNeeded();
                }
            }
            await commitIfNeeded();

            if (typeof onProgress === 'function') {
                onProgress({ phase: 'done', collection: 'billingItems', displayName, added: addedCount, updated: updatedCount, deleted: deletedCount });
            }
        } catch (err) {
            console.error('更新收費項目資料時發生錯誤:', err);
        }
    }
    function parseBackupDate(dateInput) {
        try {
            if (!dateInput) return null;
            if (dateInput instanceof Date) return isNaN(dateInput.getTime()) ? null : dateInput;
            if (typeof dateInput === 'object' && dateInput.seconds !== undefined) {
                const d = new Date(dateInput.seconds * 1000);
                return isNaN(d.getTime()) ? null : d;
            }
            if (typeof dateInput === 'string') {
                const d = new Date(dateInput);
                return isNaN(d.getTime()) ? null : d;
            }
            if (typeof dateInput === 'number') {
                const d = new Date(dateInput);
                return isNaN(d.getTime()) ? null : d;
            }
            return null;
        } catch (_e) {
            return null;
        }
    }
    function normalizeConsultations(items) {
        if (!Array.isArray(items)) return [];
        return items.map(c => {
            const clone = { ...(c || {}) };
            if (clone.id !== undefined && clone.id !== null) clone.id = String(clone.id);
            if (clone.patientId !== undefined && clone.patientId !== null) clone.patientId = String(clone.patientId);
            let d = parseBackupDate(clone.date || clone.createdAt || clone.updatedAt || null);
            if (!d) d = new Date(0);
            clone.date = d;
            if (clone.createdAt) {
                const ca = parseBackupDate(clone.createdAt);
                if (ca) clone.createdAt = ca;
            }
            if (clone.updatedAt) {
                const ua = parseBackupDate(clone.updatedAt);
                if (ua) clone.updatedAt = ua;
            }
            return clone;
        });
    }
    function enrichConsultationsWithPatientName(items, patients) {
        try {
            const map = {};
            if (Array.isArray(patients)) {
                for (const p of patients) {
                    if (!p) continue;
                    const idStr = (p.id !== undefined && p.id !== null) ? String(p.id) : null;
                    if (!idStr) continue;
                    const name =
                        p.name ||
                        p.patientName ||
                        p.fullName ||
                        p.displayName ||
                        p.chineseName ||
                        p.englishName ||
                        '';
                    map[idStr.trim()] = name;
                }
            }
            return Array.isArray(items)
                ? items.map(c => {
                    const clone = { ...(c || {}) };
                    if (clone.patientId !== undefined && clone.patientId !== null) {
                        const pid = String(clone.patientId).trim();
                        if ((!clone.patientName || String(clone.patientName).trim() === '') && map[pid]) {
                            clone.patientName = map[pid];
                        }
                    }
                    return clone;
                })
                : [];
        } catch (_e) {
            return Array.isArray(items) ? items.slice() : [];
        }
    }
    
    let stepCount = 0;

    // 細粒度進度回調 — 由 handleBackupFile 透過第四個參數傳入
    const detailProgress = arguments.length >= 4 && typeof arguments[3] === 'function'
        ? arguments[3]
        : null;

    const handleReplaceProgress = (info) => {
        if (detailProgress) detailProgress(info);
        if (info.phase === 'analyzed') {
            console.log(`[匯入] ${info.displayName}：新增 ${info.added || 0} · 更新 ${info.updated || 0} · 刪除 ${info.deleted || 0}`);
        }
    };

    await replaceCollection('patients', Array.isArray(data.patients) ? data.patients : [], handleReplaceProgress);
    stepCount++;
    if (progressCallback) progressCallback(stepCount, totalSteps);

    const normalizedConsultations = normalizeConsultations(Array.isArray(data.consultations) ? data.consultations : []);
    const enrichedConsultations = enrichConsultationsWithPatientName(normalizedConsultations, Array.isArray(data.patients) ? data.patients : []);
    await replaceCollection('consultations', enrichedConsultations, handleReplaceProgress);
    stepCount++;
    if (progressCallback) progressCallback(stepCount, totalSteps);

    await replaceCollection('users', Array.isArray(data.users) ? data.users : [], handleReplaceProgress);
    stepCount++;
    if (progressCallback) progressCallback(stepCount, totalSteps);

    await replaceClinicBillingItems(Array.isArray(data.billingItems) ? data.billingItems : [], handleReplaceProgress);
    stepCount++;
    if (progressCallback) progressCallback(stepCount, totalSteps);

    await replaceCollection('patientPackages', Array.isArray(data.patientPackages) ? data.patientPackages : [], handleReplaceProgress);
    stepCount++;
    if (progressCallback) progressCallback(stepCount, totalSteps);
    
    const rtdbData = data && typeof data.rtdb === 'object' ? data.rtdb : null;
    if (rtdbData) {
        try {
            const clinicId = (function() {
                try {
                    return localStorage.getItem('currentClinicId') || (typeof currentClinicId !== 'undefined' ? currentClinicId : 'local-default');
                } catch (_e) {
                    return (typeof currentClinicId !== 'undefined' ? currentClinicId : 'local-default') || 'local-default';
                }
            })();
            const needsClinicScope = new Set(['herbInventory', 'herbInventorySlice', 'scheduleShifts']);
            for (const rawKey of Object.keys(rtdbData)) {
                const key = String(rawKey);
                const shouldScope = needsClinicScope.has(key);
                const finalPath = shouldScope
                    ? `clinics/${String(clinicId)}/${key}`
                    : key;
                await window.firebase.set(window.firebase.ref(window.firebase.rtdb, finalPath), rtdbData[rawKey]);
            }
            
            if (typeof initHerbInventory === 'function') {
                await initHerbInventory(true);
            } else if (rtdbData.herbInventory) {
                try {
                    herbInventory = rtdbData.herbInventory || {};
                    herbInventoryInitialized = true;
                } catch (_e) {}
            }
            
            try {
                if (typeof window.scheduleReloadForClinic === 'function') {
                    await window.scheduleReloadForClinic();
                }
            } catch (_eSched) {}
        } catch (err) {
            console.error('還原 Realtime Database 資料時發生錯誤:', err);
        }
        stepCount++;
        if (progressCallback) progressCallback(stepCount, totalSteps);
    }
    
    try {
        
        patientCache = Array.isArray(data.patients)
            ? data.patients.map(p => {
                
                const cloned = { ...(p || {}) };
                if (cloned.id !== undefined && cloned.id !== null) {
                    cloned.id = String(cloned.id);
                }
                return cloned;
            })
            : [];
        
        if (Array.isArray(patientCache) && patientCache.length > 1) {
            patientCache.sort((a, b) => {
                let dateA = 0;
                let dateB = 0;
                if (a && a.createdAt) {
                    if (a.createdAt.seconds !== undefined) {
                        dateA = a.createdAt.seconds * 1000;
                    } else {
                        const d = new Date(a.createdAt);
                        dateA = d instanceof Date && !isNaN(d) ? d.getTime() : 0;
                    }
                }
                if (b && b.createdAt) {
                    if (b.createdAt.seconds !== undefined) {
                        dateB = b.createdAt.seconds * 1000;
                    } else {
                        const d = new Date(b.createdAt);
                        dateB = d instanceof Date && !isNaN(d) ? d.getTime() : 0;
                    }
                }
                return dateB - dateA;
            });
        }
        consultationCache = Array.isArray(data.consultations)
            ? normalizeConsultations(data.consultations)
            : [];
        userCache = Array.isArray(data.users)
            ? data.users.map(u => {
                const clone = { ...(u || {}) };
                if (clone.id !== undefined && clone.id !== null) {
                    clone.id = String(clone.id);
                }
                return clone;
            })
            : [];
        
        consultations = Array.isArray(consultationCache) ? consultationCache.slice() : [];
        
        if (Array.isArray(userCache)) {
            users = userCache.map(u => {
                try {
                    const { personalSettings, ...rest } = u || {};
                    return { ...rest };
                } catch (_e) {
                    return { ...(u || {}) };
                }
            });
        } else {
            users = [];
        }
        
        patients = Array.isArray(patientCache) ? patientCache.slice() : [];
        
        try {
            localStorage.setItem('patients', JSON.stringify(patients));
        } catch (_lsErr) {
            
        }
        
        billingItems = Array.isArray(data.billingItems) ? data.billingItems : [];
        billingItemsLoaded = true;
        try {
            const cid = localStorage.getItem('currentClinicId') || (typeof currentClinicId !== 'undefined' ? currentClinicId : 'local-default');
            localStorage.setItem(`billingItems_${cid}`, JSON.stringify(billingItems));
        } catch (_lsErr) {}
        
        patientsCountCache = Array.isArray(patientCache) ? patientCache.length : 0;
        
        patientPagesCache = {};
        patientPageCursors = {};
        
        const perPage = (paginationSettings && paginationSettings.patientList && paginationSettings.patientList.itemsPerPage)
            ? paginationSettings.patientList.itemsPerPage
            : 10;
        if (Array.isArray(patientCache)) {
            
            const sortedPatients = patientCache.slice().sort((a, b) => {
                let dateA = 0;
                let dateB = 0;
                if (a && a.createdAt) {
                    if (a.createdAt.seconds !== undefined) {
                        dateA = a.createdAt.seconds * 1000;
                    } else {
                        const d = new Date(a.createdAt);
                        dateA = d instanceof Date && !isNaN(d) ? d.getTime() : 0;
                    }
                }
                if (b && b.createdAt) {
                    if (b.createdAt.seconds !== undefined) {
                        dateB = b.createdAt.seconds * 1000;
                    } else {
                        const d = new Date(b.createdAt);
                        dateB = d instanceof Date && !isNaN(d) ? d.getTime() : 0;
                    }
                }
                return dateB - dateA;
            });
            
            for (let i = 0; i < sortedPatients.length; i += perPage) {
                const pageNum = Math.floor(i / perPage) + 1;
                patientPagesCache[pageNum] = sortedPatients.slice(i, i + perPage);
            }
            
            if (!patientPagesCache[1]) {
                patientPagesCache[1] = [];
            }
        }
        
        if (typeof computeGlobalUsageCounts === 'function') {
            try { await computeGlobalUsageCounts(); } catch (_e) {}
        }
    } catch (_assignErr) {
        console.error('匯入備份後更新本地快取失敗:', _assignErr);
    }
    
    try {
        if (typeof loadPatientList === 'function') {
            loadPatientList();
        }
        if (typeof loadTodayAppointments === 'function') {
            await loadTodayAppointments();
        }
        if (typeof updateStatistics === 'function') {
            updateStatistics();
        }
    } catch (_uiErr) {
        console.error('匯入備份後重新渲染介面時發生錯誤:', _uiErr);
    }
    
    if (progressCallback && stepCount < totalSteps) {
        progressCallback(totalSteps, totalSteps);
    }
}

let legacyMigrationParsedState = null;

function triggerLegacyMigrationImport() {
    const input = document.getElementById('legacyMigrationFileInput');
    if (input) {
        input.value = '';
        input.click();
    }
}

function setLegacyMigrationProgress(percent, text, visible) {
    const container = document.getElementById('legacyMigrationProgressContainer');
    const bar = document.getElementById('legacyMigrationProgressBar');
    const label = document.getElementById('legacyMigrationProgressText');
    if (!container || !bar || !label) return;
    if (visible) {
        container.classList.remove('hidden');
    } else {
        container.classList.add('hidden');
    }
    const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));
    bar.style.width = `${safePercent}%`;
    label.textContent = text || `遷移進度 ${safePercent}%`;
}

function parseCsvTextToObjects(text) {
    const content = String(text || '').replace(/^\uFEFF/, '');
    const rows = [];
    let row = [];
    let value = '';
    let inQuotes = false;
    for (let i = 0; i < content.length; i++) {
        const ch = content[i];
        if (ch === '"') {
            if (inQuotes && content[i + 1] === '"') {
                value += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (ch === ',' && !inQuotes) {
            row.push(value);
            value = '';
        } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
            if (ch === '\r' && content[i + 1] === '\n') i++;
            row.push(value);
            if (row.some(cell => String(cell || '').trim() !== '')) {
                rows.push(row);
            }
            row = [];
            value = '';
        } else {
            value += ch;
        }
    }
    row.push(value);
    if (row.some(cell => String(cell || '').trim() !== '')) {
        rows.push(row);
    }
    if (!rows.length) return [];
    const headers = rows[0].map(h => String(h || '').trim());
    return rows.slice(1).map(cells => {
        const obj = {};
        headers.forEach((header, idx) => {
            obj[header] = String(cells[idx] || '').trim();
        });
        return obj;
    });
}

function getValueByKeys(item, keys) {
    if (!item || typeof item !== 'object') return '';
    for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(item, key)) {
            const value = item[key];
            if (value !== undefined && value !== null && String(value).trim() !== '') {
                return String(value).trim();
            }
        }
    }
    return '';
}

function normalizeDateStringToDate(raw) {
    if (!raw && raw !== 0) return null;
    if (raw instanceof Date && !isNaN(raw.getTime())) return raw;
    if (typeof raw === 'number') {
        const d = new Date(raw);
        return isNaN(d.getTime()) ? null : d;
    }
    if (typeof raw === 'object' && raw.seconds !== undefined) {
        const d = new Date(Number(raw.seconds) * 1000);
        return isNaN(d.getTime()) ? null : d;
    }
    const str = String(raw).trim();
    if (!str) return null;
    const normalized = str.replace(/\./g, '-').replace(/\//g, '-');
    const d = new Date(normalized);
    return isNaN(d.getTime()) ? null : d;
}

function formatDateToInput(date) {
    const d = normalizeDateStringToDate(date);
    if (!d) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function normalizeLegacyLookupValue(raw, options) {
    const opts = options || {};
    let value = raw === undefined || raw === null ? '' : String(raw).trim();
    if (!value) return '';
    if (opts.stripSpaces) value = value.replace(/\s+/g, '');
    if (opts.uppercase) value = value.toUpperCase();
    if (opts.lowercase) value = value.toLowerCase();
    return value;
}

function buildStableLegacyFallbackId(item, index) {
    const legacySourceId = getValueByKeys(item, ['id', 'patientId', 'oldId', '舊系統ID']);
    const patientNumber = getValueByKeys(item, ['patientNumber', '病歷號', '病人編號']);
    const name = getValueByKeys(item, ['name', 'patientName', 'fullName', '姓名', '病人姓名']);
    const phone = getValueByKeys(item, ['phone', 'mobile', 'phoneNumber', '聯絡電話', '電話']);
    const birthDate = formatDateToInput(getValueByKeys(item, ['birthDate', 'birthday', 'dob', '出生日期']));
    const seed = JSON.stringify({
        legacySourceId: normalizeLegacyLookupValue(legacySourceId, { uppercase: true }),
        patientNumber: normalizeLegacyLookupValue(patientNumber, { uppercase: true }),
        name: normalizeLegacyLookupValue(name, { lowercase: true }),
        phone: normalizeLegacyLookupValue(phone, { stripSpaces: true }),
        birthDate: birthDate || '',
        row: Number(index) || 0
    });
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = ((hash << 5) - hash) + seed.charCodeAt(i);
        hash |= 0;
    }
    return `LEGACY-${Math.abs(hash).toString(36).toUpperCase()}`;
}

function appendLookupMatch(map, key, id) {
    if (!map || !key || !id) return;
    if (!map.has(key)) {
        map.set(key, [id]);
        return;
    }
    const existing = map.get(key) || [];
    if (!existing.includes(id)) {
        existing.push(id);
        map.set(key, existing);
    }
}

function getLookupResolution(map, key) {
    if (!map || !key || !map.has(key)) {
        return { matchedId: '', ambiguous: false, count: 0 };
    }
    const ids = Array.isArray(map.get(key)) ? map.get(key).filter(Boolean) : [];
    if (ids.length === 1) {
        return { matchedId: ids[0], ambiguous: false, count: 1 };
    }
    if (ids.length > 1) {
        return { matchedId: '', ambiguous: true, count: ids.length };
    }
    return { matchedId: '', ambiguous: false, count: 0 };
}

function normalizeLegacyTextFingerprint(raw) {
    return normalizeLegacyLookupValue(raw, { lowercase: true }).replace(/\s+/g, ' ');
}

function buildConsultationIdentityFingerprint(item, patientId) {
    const resolvedPatientId = normalizeLegacyLookupValue(patientId);
    if (!resolvedPatientId || !item) return '';
    const dateKey = formatDateToInput(item.date);
    const symptomsKey = normalizeLegacyTextFingerprint(item.symptoms);
    const diagnosisKey = normalizeLegacyTextFingerprint(item.diagnosis);
    const prescriptionKey = normalizeLegacyTextFingerprint(item.prescription);
    if (!dateKey && !symptomsKey && !diagnosisKey && !prescriptionKey) return '';
    return [resolvedPatientId, dateKey, symptomsKey, diagnosisKey, prescriptionKey].join('||');
}

function legacyMigrationEscapeHtml(value) {
    const raw = value === undefined || value === null ? '' : String(value);
    return raw
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function normalizeLegacyPatientItem(item, index) {
    const name = getValueByKeys(item, ['name', 'patientName', 'fullName', '姓名', '病人姓名']);
    const genderRaw = getValueByKeys(item, ['gender', 'sex', '性別']);
    const phone = getValueByKeys(item, ['phone', 'mobile', 'phoneNumber', '聯絡電話', '電話']);
    const idCard = getValueByKeys(item, ['idCard', 'identityNo', 'idNumber', '身分證', '身分證字號']);
    const birthDate = getValueByKeys(item, ['birthDate', 'birthday', 'dob', '出生日期']);
    const address = getValueByKeys(item, ['address', '住址']);
    const allergies = getValueByKeys(item, ['allergies', '過敏史']);
    const history = getValueByKeys(item, ['history', 'medicalHistory', '病史']);
    const patientNumber = getValueByKeys(item, ['patientNumber', '病歷號', '病人編號']);
    const legacySourceId = getValueByKeys(item, ['id', 'patientId', 'oldId', '舊系統ID']);
    if (!name) {
        return { valid: false, reason: `第 ${index + 1} 筆病人缺少姓名` };
    }
    let gender = genderRaw || '未填';
    if (gender === 'M' || gender.toLowerCase() === 'male') gender = '男';
    if (gender === 'F' || gender.toLowerCase() === 'female') gender = '女';
    const normalized = {
        name,
        gender,
        phone: phone || '',
        birthDate: formatDateToInput(birthDate),
        idCard: idCard || buildStableLegacyFallbackId(item, index),
        address: address || '',
        allergies: allergies || '',
        history: history || '',
        patientNumber: patientNumber || '',
        legacySourceId: legacySourceId || '',
        legacyRaw: item
    };
    return { valid: true, data: normalized };
}

function normalizeLegacyConsultationItem(item, index) {
    const symptoms = getValueByKeys(item, ['symptoms', 'chiefComplaint', 'complaint', '主訴', '現病史']);
    const diagnosis = getValueByKeys(item, ['diagnosis', '辨證', '中醫診斷', '診斷']);
    const tongue = getValueByKeys(item, ['tongue', '舌象']);
    const pulse = getValueByKeys(item, ['pulse', '脈象']);
    const syndrome = getValueByKeys(item, ['syndrome', '證型']);
    const prescription = getValueByKeys(item, ['prescription', '處方']);
    const instructions = getValueByKeys(item, ['instructions', '醫囑']);
    const medicalRecordNumber = getValueByKeys(item, ['medicalRecordNumber', '病歷編號', 'recordNumber']);
    const dateRaw = getValueByKeys(item, ['date', 'consultationDate', 'visitDate', '日期', '就診日期', 'createdAt']);
    const legacySourceId = getValueByKeys(item, ['id', 'consultationId', 'oldId', '舊系統ID']);
    const patientId = getValueByKeys(item, ['patientId', 'oldPatientId', '病人ID']);
    const patientNumber = getValueByKeys(item, ['patientNumber', '病人編號', '病歷號']);
    const patientName = getValueByKeys(item, ['patientName', 'name', '病人姓名', '姓名']);
    const idCard = getValueByKeys(item, ['idCard', '身分證', '身分證字號']);
    const phone = getValueByKeys(item, ['phone', 'mobile', '電話', '聯絡電話']);
    const date = normalizeDateStringToDate(dateRaw);
    if (!symptoms && !diagnosis) {
        return { valid: false, reason: `第 ${index + 1} 筆病歷缺少主訴或診斷` };
    }
    const normalized = {
        symptoms: symptoms || '舊系統匯入',
        diagnosis: diagnosis || '舊系統匯入待補',
        tongue: tongue || '',
        pulse: pulse || '',
        syndrome: syndrome || '',
        prescription: prescription || '',
        instructions: instructions || '',
        medicalRecordNumber: medicalRecordNumber || '',
        date: date || new Date(),
        legacySourceId: legacySourceId || '',
        patientRef: {
            patientId: patientId || '',
            patientNumber: patientNumber || '',
            patientName: patientName || '',
            idCard: idCard || '',
            phone: phone || ''
        },
        legacyRaw: item
    };
    return { valid: true, data: normalized };
}

function inferArrayType(items) {
    if (!Array.isArray(items) || !items.length) return 'patients';
    const sample = items[0] || {};
    const keys = Object.keys(sample).map(k => String(k).toLowerCase());
    const consultationHints = ['symptoms', 'diagnosis', 'chiefcomplaint', 'medicalrecordnumber', 'patientid'];
    const hit = consultationHints.some(h => keys.some(k => k.includes(h)));
    return hit ? 'consultations' : 'patients';
}

function collectLegacyRawData(data, dataType) {
    const normalizedType = dataType || 'auto';
    let patientItems = [];
    let consultationItems = [];
    if (Array.isArray(data)) {
        const inferred = normalizedType === 'auto' ? inferArrayType(data) : normalizedType;
        if (inferred === 'consultations') consultationItems = data;
        else patientItems = data;
        return { patientItems, consultationItems };
    }
    if (!data || typeof data !== 'object') {
        return { patientItems, consultationItems };
    }
    const patientKeys = ['patients', 'patient', 'patientList', 'patientData'];
    const consultationKeys = ['consultations', 'consultation', 'records', 'medicalRecords', 'visits', 'visitRecords'];
    patientKeys.forEach(k => {
        if (Array.isArray(data[k])) patientItems = patientItems.concat(data[k]);
    });
    consultationKeys.forEach(k => {
        if (Array.isArray(data[k])) consultationItems = consultationItems.concat(data[k]);
    });
    if (data.data && typeof data.data === 'object') {
        patientKeys.forEach(k => {
            if (Array.isArray(data.data[k])) patientItems = patientItems.concat(data.data[k]);
        });
        consultationKeys.forEach(k => {
            if (Array.isArray(data.data[k])) consultationItems = consultationItems.concat(data.data[k]);
        });
    }
    if (normalizedType === 'patients') consultationItems = [];
    if (normalizedType === 'consultations') patientItems = [];
    if (normalizedType === 'mixed' && !patientItems.length && !consultationItems.length) {
        const entries = Object.values(data).filter(v => Array.isArray(v));
        entries.forEach(arr => {
            const t = inferArrayType(arr);
            if (t === 'consultations') consultationItems = consultationItems.concat(arr);
            else patientItems = patientItems.concat(arr);
        });
    }
    return { patientItems, consultationItems };
}

function buildLegacyMigrationSummaryHtml(parsed) {
    const patientInvalidHtml = parsed.invalidPatients.slice(0, 5).map(msg => `<li>${legacyMigrationEscapeHtml(msg)}</li>`).join('');
    const consultationInvalidHtml = parsed.invalidConsultations.slice(0, 5).map(msg => `<li>${legacyMigrationEscapeHtml(msg)}</li>`).join('');
    const patientPreview = parsed.patients.slice(0, 3).map(p => `${p.name}${p.phone ? ` / ${p.phone}` : ''}`).join('、');
    const consultationPreview = parsed.consultations.slice(0, 3).map(c => `${c.patientRef.patientName || '未命名病人'} / ${c.diagnosis}`).join('、');
    return `
        <div class="space-y-2">
            <div>解析完成：病人 ${parsed.patients.length} 筆、病歷 ${parsed.consultations.length} 筆</div>
            <div>病人預覽：${legacyMigrationEscapeHtml(patientPreview || '無')}</div>
            <div>病歷預覽：${legacyMigrationEscapeHtml(consultationPreview || '無')}</div>
            <div>病人無效資料：${parsed.invalidPatients.length} 筆</div>
            ${patientInvalidHtml ? `<ul class="list-disc ml-5 text-red-600">${patientInvalidHtml}</ul>` : ''}
            <div>病歷無效資料：${parsed.invalidConsultations.length} 筆</div>
            ${consultationInvalidHtml ? `<ul class="list-disc ml-5 text-red-600">${consultationInvalidHtml}</ul>` : ''}
        </div>
    `;
}

async function handleLegacyMigrationFile(file) {
    if (!file) return;
    const fileInfo = document.getElementById('legacyMigrationFileInfo');
    const summary = document.getElementById('legacyMigrationSummary');
    if (fileInfo) {
        fileInfo.textContent = `已選擇：${file.name}`;
    }
    try {
        const formatSelect = document.getElementById('legacyMigrationFormat');
        const typeSelect = document.getElementById('legacyMigrationDataType');
        const selectedFormat = formatSelect ? formatSelect.value : 'auto';
        const selectedType = typeSelect ? typeSelect.value : 'auto';
        const text = await file.text();
        const ext = String(file.name || '').toLowerCase().split('.').pop();
        const format = selectedFormat === 'auto' ? (ext === 'csv' ? 'csv' : 'json') : selectedFormat;
        let patientItems = [];
        let consultationItems = [];
        if (format === 'csv') {
            const objects = parseCsvTextToObjects(text);
            const inferredType = selectedType === 'auto' ? inferArrayType(objects) : selectedType;
            if (inferredType === 'consultations') consultationItems = objects;
            else patientItems = objects;
        } else {
            const jsonData = JSON.parse(text);
            const collected = collectLegacyRawData(jsonData, selectedType);
            patientItems = collected.patientItems;
            consultationItems = collected.consultationItems;
        }
        const patients = [];
        const consultations = [];
        const invalidPatients = [];
        const invalidConsultations = [];
        patientItems.forEach((item, idx) => {
            const result = normalizeLegacyPatientItem(item, idx);
            if (result.valid) patients.push(result.data);
            else invalidPatients.push(result.reason);
        });
        consultationItems.forEach((item, idx) => {
            const result = normalizeLegacyConsultationItem(item, idx);
            if (result.valid) consultations.push(result.data);
            else invalidConsultations.push(result.reason);
        });
        legacyMigrationParsedState = {
            fileName: file.name,
            patients,
            consultations,
            invalidPatients,
            invalidConsultations
        };
        if (summary) {
            summary.innerHTML = buildLegacyMigrationSummaryHtml(legacyMigrationParsedState);
            summary.classList.remove('hidden');
        }
        showToast('舊資料檔案解析完成，請確認預覽後開始轉移', 'success');
    } catch (error) {
        legacyMigrationParsedState = null;
        if (summary) {
            summary.classList.add('hidden');
            summary.innerHTML = '';
        }
        console.error('解析舊資料檔案失敗:', error);
        showToast('解析失敗，請確認檔案格式（JSON/CSV）', 'error');
    }
}

function buildPatientLookupMaps(items) {
    const byLegacyId = new Map();
    const byPatientNumber = new Map();
    const byIdCard = new Map();
    const byPhone = new Map();
    const byName = new Map();
    (items || []).forEach(item => {
        if (!item) return;
        const id = item.id ? String(item.id) : '';
        const legacySourceId = normalizeLegacyLookupValue(item.legacySourceId);
        const patientNumber = normalizeLegacyLookupValue(item.patientNumber, { uppercase: true });
        const idCard = normalizeLegacyLookupValue(item.idCard, { uppercase: true });
        const phone = normalizeLegacyLookupValue(item.phone, { stripSpaces: true });
        const name = normalizeLegacyLookupValue(item.name, { lowercase: true });
        appendLookupMatch(byLegacyId, legacySourceId, id);
        appendLookupMatch(byPatientNumber, patientNumber, id);
        appendLookupMatch(byIdCard, idCard, id);
        appendLookupMatch(byPhone, phone, id);
        appendLookupMatch(byName, name, id);
    });
    return { byLegacyId, byPatientNumber, byIdCard, byPhone, byName };
}

function resolveExistingPatientMatch(item, lookup) {
    if (!item || !lookup) {
        return { patientId: '', ambiguous: false, reason: '查無病人比對資料' };
    }
    const checks = [
        {
            label: '舊系統 ID',
            key: normalizeLegacyLookupValue(item.legacySourceId),
            map: lookup.byLegacyId
        },
        {
            label: '病人編號',
            key: normalizeLegacyLookupValue(item.patientNumber, { uppercase: true }),
            map: lookup.byPatientNumber
        },
        {
            label: '身分證字號',
            key: normalizeLegacyLookupValue(item.idCard, { uppercase: true }),
            map: lookup.byIdCard
        },
        {
            label: '電話',
            key: normalizeLegacyLookupValue(item.phone, { stripSpaces: true }),
            map: lookup.byPhone
        }
    ];
    for (const check of checks) {
        if (!check.key) continue;
        const resolution = getLookupResolution(check.map, check.key);
        if (resolution.matchedId) {
            return { patientId: resolution.matchedId, ambiguous: false, reason: '' };
        }
        if (resolution.ambiguous) {
            return {
                patientId: '',
                ambiguous: true,
                reason: `${check.label} 對應到多於一位現有病人`
            };
        }
    }
    return { patientId: '', ambiguous: false, reason: '' };
}

function resolveConsultationPatientMatch(patientRef, lookup) {
    if (!patientRef || !lookup) {
        return { patientId: '', ambiguous: false, reason: '病歷缺少病人參照資料' };
    }
    const checks = [
        {
            label: '舊系統病人 ID',
            key: normalizeLegacyLookupValue(patientRef.patientId),
            map: lookup.byLegacyId
        },
        {
            label: '病人編號',
            key: normalizeLegacyLookupValue(patientRef.patientNumber, { uppercase: true }),
            map: lookup.byPatientNumber
        },
        {
            label: '身分證字號',
            key: normalizeLegacyLookupValue(patientRef.idCard, { uppercase: true }),
            map: lookup.byIdCard
        },
        {
            label: '電話',
            key: normalizeLegacyLookupValue(patientRef.phone, { stripSpaces: true }),
            map: lookup.byPhone
        }
    ];
    for (const check of checks) {
        if (!check.key) continue;
        const resolution = getLookupResolution(check.map, check.key);
        if (resolution.matchedId) {
            return { patientId: resolution.matchedId, ambiguous: false, reason: '' };
        }
        if (resolution.ambiguous) {
            return {
                patientId: '',
                ambiguous: true,
                reason: `病歷病人${check.label} 對應到多於一位病人`
            };
        }
    }
    const name = normalizeLegacyLookupValue(patientRef.patientName, { lowercase: true });
    if (name) {
        const nameResolution = getLookupResolution(lookup.byName, name);
        if (nameResolution.ambiguous) {
            return { patientId: '', ambiguous: true, reason: '病歷病人姓名重覆，為避免配錯已略過' };
        }
        if (nameResolution.matchedId) {
            return { patientId: '', ambiguous: true, reason: '病歷僅憑姓名可匹配，為避免配錯已略過' };
        }
    }
    return { patientId: '', ambiguous: false, reason: '病歷缺少可可靠匹配病人的識別資料' };
}

function buildConsultationLookupMaps(items) {
    const byLegacySourceId = new Set();
    const byPatientMedicalRecordNumber = new Set();
    const byFingerprint = new Set();
    (items || []).forEach(item => {
        if (!item) return;
        const legacySourceId = normalizeLegacyLookupValue(item.legacySourceId);
        const patientId = normalizeLegacyLookupValue(item.patientId);
        const medicalRecordNumber = normalizeLegacyLookupValue(item.medicalRecordNumber, { uppercase: true });
        const fingerprint = buildConsultationIdentityFingerprint(item, patientId);
        if (legacySourceId) byLegacySourceId.add(legacySourceId);
        if (patientId && medicalRecordNumber) {
            byPatientMedicalRecordNumber.add(`${patientId}||${medicalRecordNumber}`);
        }
        if (fingerprint) byFingerprint.add(fingerprint);
    });
    return { byLegacySourceId, byPatientMedicalRecordNumber, byFingerprint };
}

async function getAllConsultationsForLegacyMigration() {
    if (!window.firebaseDataManager || typeof window.firebaseDataManager.getConsultations !== 'function') {
        return [];
    }
    let result = await window.firebaseDataManager.getConsultations(true);
    if (!result || !result.success) return [];
    let list = Array.isArray(result.data) ? result.data.slice() : [];
    while (result && result.success && result.hasMore && typeof window.firebaseDataManager.getConsultationsNextPage === 'function') {
        result = await window.firebaseDataManager.getConsultationsNextPage();
        if (!result || !result.success) break;
        list = Array.isArray(result.data) ? result.data.slice() : list;
    }
    return list;
}

function detectExistingConsultationDuplicate(item, patientId, lookup) {
    if (!item || !patientId || !lookup) {
        return { duplicate: false, reason: '' };
    }
    const legacySourceId = normalizeLegacyLookupValue(item.legacySourceId);
    if (legacySourceId && lookup.byLegacySourceId.has(legacySourceId)) {
        return { duplicate: true, reason: '相同舊系統病歷 ID 已存在' };
    }
    const medicalRecordNumber = normalizeLegacyLookupValue(item.medicalRecordNumber, { uppercase: true });
    if (medicalRecordNumber && lookup.byPatientMedicalRecordNumber.has(`${patientId}||${medicalRecordNumber}`)) {
        return { duplicate: true, reason: '同病人病歷編號已存在' };
    }
    if (!legacySourceId && !medicalRecordNumber) {
        const fingerprint = buildConsultationIdentityFingerprint(item, patientId);
        if (fingerprint && lookup.byFingerprint.has(fingerprint)) {
            return { duplicate: true, reason: '相同病人與病歷內容疑似已匯入' };
        }
    }
    return { duplicate: false, reason: '' };
}

function registerImportedConsultation(item, patientId, lookup, savedMedicalRecordNumber) {
    if (!item || !patientId || !lookup) return;
    const legacySourceId = normalizeLegacyLookupValue(item.legacySourceId);
    const medicalRecordNumber = normalizeLegacyLookupValue(savedMedicalRecordNumber || item.medicalRecordNumber, { uppercase: true });
    const fingerprint = buildConsultationIdentityFingerprint({
        ...item,
        medicalRecordNumber: savedMedicalRecordNumber || item.medicalRecordNumber
    }, patientId);
    if (legacySourceId) lookup.byLegacySourceId.add(legacySourceId);
    if (medicalRecordNumber) lookup.byPatientMedicalRecordNumber.add(`${patientId}||${medicalRecordNumber}`);
    if (fingerprint) lookup.byFingerprint.add(fingerprint);
}

async function startLegacyDataMigration() {
    if (!legacyMigrationParsedState) {
        showToast('請先選擇並解析舊資料檔案', 'error');
        return;
    }
    const totalToImport = legacyMigrationParsedState.patients.length + legacyMigrationParsedState.consultations.length;
    if (!totalToImport) {
        showToast('沒有可遷移的有效資料', 'error');
        return;
    }
    const confirmed = await showConfirmation('舊資料轉移將新增/合併病人並匯入病歷，確定開始嗎？', 'warning');
    if (!confirmed) return;
    const button = document.getElementById('legacyMigrationStartBtn');
    setButtonLoading(button);
    const summary = document.getElementById('legacyMigrationSummary');
    try {
        setLegacyMigrationProgress(1, '遷移進度 1%（初始化）', true);
        await ensureFirebaseReady();
        const existingPatientsRes = await window.firebaseDataManager.getPatients(true);
        const existingPatients = existingPatientsRes && existingPatientsRes.success && Array.isArray(existingPatientsRes.data)
            ? existingPatientsRes.data
            : [];
        const lookup = buildPatientLookupMaps(existingPatients);
        const existingConsultations = await getAllConsultationsForLegacyMigration();
        const consultationLookup = buildConsultationLookupMaps(existingConsultations);
        let patientSuccess = 0;
        let patientMerged = 0;
        let patientSkippedAmbiguous = 0;
        let patientFailed = 0;
        let consultationSuccess = 0;
        let consultationSkippedNoPatient = 0;
        let consultationSkippedAmbiguousPatient = 0;
        let consultationSkippedDuplicate = 0;
        let consultationFailed = 0;
        const patientIssueMessages = [];
        const consultationIssueMessages = [];
        let currentStep = 0;
        const totalSteps = totalToImport + 2;
        for (let i = 0; i < legacyMigrationParsedState.patients.length; i++) {
            const item = legacyMigrationParsedState.patients[i];
            const idCardKey = normalizeLegacyLookupValue(item.idCard, { uppercase: true });
            const phoneKey = normalizeLegacyLookupValue(item.phone, { stripSpaces: true });
            const legacyKey = normalizeLegacyLookupValue(item.legacySourceId);
            const patientNumberKey = normalizeLegacyLookupValue(item.patientNumber, { uppercase: true });
            const existingMatch = resolveExistingPatientMatch(item, lookup);
            if (existingMatch.ambiguous) {
                patientSkippedAmbiguous++;
                if (patientIssueMessages.length < 5) {
                    patientIssueMessages.push(`${item.name || `第 ${i + 1} 筆病人`}: ${existingMatch.reason}`);
                }
            } else if (existingMatch.patientId) {
                patientMerged++;
            } else {
                try {
                    let finalPatientNumber = item.patientNumber;
                    if (!finalPatientNumber) {
                        if (typeof generatePatientNumberFromFirebase === 'function') {
                            finalPatientNumber = await generatePatientNumberFromFirebase();
                        } else {
                            finalPatientNumber = `P${String(Date.now()).slice(-6)}`;
                        }
                    }
                    const saveRes = await window.firebaseDataManager.addPatient({
                        name: item.name,
                        gender: item.gender,
                        phone: item.phone,
                        birthDate: item.birthDate,
                        idCard: item.idCard,
                        address: item.address,
                        allergies: item.allergies,
                        history: item.history,
                        patientNumber: finalPatientNumber,
                        legacySourceId: item.legacySourceId || '',
                        importSource: 'legacyMigration',
                        importAt: new Date().toISOString()
                    });
                    if (saveRes && saveRes.success && saveRes.id) {
                        patientSuccess++;
                        appendLookupMatch(lookup.byLegacyId, legacyKey, saveRes.id);
                        appendLookupMatch(lookup.byPatientNumber, normalizeLegacyLookupValue(finalPatientNumber, { uppercase: true }), saveRes.id);
                        appendLookupMatch(lookup.byIdCard, idCardKey, saveRes.id);
                        appendLookupMatch(lookup.byPhone, phoneKey, saveRes.id);
                        if (item.name) {
                            const nameKey = normalizeLegacyLookupValue(item.name, { lowercase: true });
                            appendLookupMatch(lookup.byName, nameKey, saveRes.id);
                        }
                    } else {
                        patientFailed++;
                    }
                } catch (_patientError) {
                    patientFailed++;
                }
            }
            currentStep++;
            const percent = Math.round((currentStep / totalSteps) * 100);
            setLegacyMigrationProgress(percent, `遷移進度 ${percent}%（病人 ${i + 1}/${legacyMigrationParsedState.patients.length}）`, true);
        }
        const latestPatientsRes = await window.firebaseDataManager.getPatients(true);
        const latestPatients = latestPatientsRes && latestPatientsRes.success && Array.isArray(latestPatientsRes.data)
            ? latestPatientsRes.data
            : [];
        const latestLookup = buildPatientLookupMaps(latestPatients);
        const patientNameMap = new Map();
        latestPatients.forEach(p => {
            if (p && p.id) patientNameMap.set(String(p.id), p.name || '');
        });
        for (let j = 0; j < legacyMigrationParsedState.consultations.length; j++) {
            const item = legacyMigrationParsedState.consultations[j];
            const patientMatch = resolveConsultationPatientMatch(item.patientRef, latestLookup);
            const resolvedPatientId = patientMatch.patientId;
            if (!resolvedPatientId) {
                if (patientMatch.ambiguous) {
                    consultationSkippedAmbiguousPatient++;
                } else {
                    consultationSkippedNoPatient++;
                }
                if (consultationIssueMessages.length < 5) {
                    consultationIssueMessages.push(`${item.patientRef.patientName || `第 ${j + 1} 筆病歷`}: ${patientMatch.reason}`);
                }
                currentStep++;
                const percent = Math.round((currentStep / totalSteps) * 100);
                setLegacyMigrationProgress(percent, `遷移進度 ${percent}%（病歷 ${j + 1}/${legacyMigrationParsedState.consultations.length}）`, true);
                continue;
            }
            const duplicateCheck = detectExistingConsultationDuplicate(item, resolvedPatientId, consultationLookup);
            if (duplicateCheck.duplicate) {
                consultationSkippedDuplicate++;
                if (consultationIssueMessages.length < 5) {
                    consultationIssueMessages.push(`${item.patientRef.patientName || `第 ${j + 1} 筆病歷`}: ${duplicateCheck.reason}`);
                }
                currentStep++;
                const percent = Math.round((currentStep / totalSteps) * 100);
                setLegacyMigrationProgress(percent, `遷移進度 ${percent}%（病歷 ${j + 1}/${legacyMigrationParsedState.consultations.length}）`, true);
                continue;
            }
            try {
                const finalMedicalRecordNumber = item.medicalRecordNumber || (typeof generateMedicalRecordNumber === 'function' ? generateMedicalRecordNumber() : `MR${Date.now()}${String(j + 1).padStart(3, '0')}`);
                const consultationPayload = {
                    patientId: resolvedPatientId,
                    patientName: patientNameMap.get(String(resolvedPatientId)) || item.patientRef.patientName || '',
                    date: item.date instanceof Date ? item.date : new Date(),
                    symptoms: item.symptoms,
                    diagnosis: item.diagnosis,
                    tongue: item.tongue,
                    pulse: item.pulse,
                    syndrome: item.syndrome,
                    prescription: item.prescription,
                    instructions: item.instructions,
                    medicalRecordNumber: finalMedicalRecordNumber,
                    importSource: 'legacyMigration',
                    legacySourceId: item.legacySourceId || '',
                    importedAt: new Date().toISOString()
                };
                const saveConsultationRes = await window.firebaseDataManager.addConsultation(consultationPayload);
                if (saveConsultationRes && saveConsultationRes.success) {
                    consultationSuccess++;
                    registerImportedConsultation(item, resolvedPatientId, consultationLookup, finalMedicalRecordNumber);
                } else {
                    consultationFailed++;
                }
            } catch (_consultationError) {
                consultationFailed++;
            }
            currentStep++;
            const percent = Math.round((currentStep / totalSteps) * 100);
            setLegacyMigrationProgress(percent, `遷移進度 ${percent}%（病歷 ${j + 1}/${legacyMigrationParsedState.consultations.length}）`, true);
        }
        currentStep++;
        setLegacyMigrationProgress(Math.round((currentStep / totalSteps) * 100), '遷移進度 99%（更新畫面）', true);
        try {
            if (typeof loadPatientList === 'function') loadPatientList();
            if (typeof loadTodayAppointments === 'function') await loadTodayAppointments();
            if (typeof updateStatistics === 'function') updateStatistics();
        } catch (_refreshError) {}
        setLegacyMigrationProgress(100, '遷移進度 100%（完成）', true);
        const resultHtml = `
            <div class="space-y-2">
                <div class="font-semibold text-green-700">資料轉移完成</div>
                <div>病人新增：${patientSuccess} 筆</div>
                <div>病人已存在略過：${patientMerged} 筆</div>
                <div>病人因匹配衝突略過：${patientSkippedAmbiguous} 筆</div>
                <div>病人失敗：${patientFailed} 筆</div>
                <div>病歷新增：${consultationSuccess} 筆</div>
                <div>病歷因找不到病人略過：${consultationSkippedNoPatient} 筆</div>
                <div>病歷因病人匹配不安全略過：${consultationSkippedAmbiguousPatient} 筆</div>
                <div>病歷因重覆略過：${consultationSkippedDuplicate} 筆</div>
                <div>病歷失敗：${consultationFailed} 筆</div>
                ${patientIssueMessages.length ? `<div class="pt-2 text-amber-700">病人提醒：${legacyMigrationEscapeHtml(patientIssueMessages.join('；'))}</div>` : ''}
                ${consultationIssueMessages.length ? `<div class="pt-2 text-amber-700">病歷提醒：${legacyMigrationEscapeHtml(consultationIssueMessages.join('；'))}</div>` : ''}
            </div>
        `;
        if (summary) {
            summary.innerHTML = resultHtml;
            summary.classList.remove('hidden');
        }
        showToast('舊資料轉移完成', 'success');
    } catch (error) {
        console.error('舊資料轉移失敗:', error);
        showToast('舊資料轉移失敗，請稍後重試', 'error');
    } finally {
        clearButtonLoading(button);
    }
}


if (!window.systemManagement) {
    window.systemManagement = {};
}
window.systemManagement.showClinicSettingsModal = showClinicSettingsModal;
window.systemManagement.hideClinicSettingsModal = hideClinicSettingsModal;
window.systemManagement.saveClinicSettings = saveClinicSettings;
window.systemManagement.updateClinicSettingsDisplay = updateClinicSettingsDisplay;
window.systemManagement.showBackupProgressBar = showBackupProgressBar;
window.systemManagement.updateBackupProgressBar = updateBackupProgressBar;
window.systemManagement.finishBackupProgressBar = finishBackupProgressBar;

window.systemManagement.manageBilling = manageBilling;
window.systemManagement.ensureFirebaseReady = ensureFirebaseReady;
window.systemManagement.exportClinicBackup = exportClinicBackup;
window.systemManagement.triggerBackupImport = triggerBackupImport;
window.systemManagement.handleBackupFile = handleBackupFile;
window.systemManagement.importClinicBackup = importClinicBackup;
window.systemManagement.triggerLegacyMigrationImport = triggerLegacyMigrationImport;
window.systemManagement.handleLegacyMigrationFile = handleLegacyMigrationFile;
window.systemManagement.startLegacyDataMigration = startLegacyDataMigration;


window.showClinicSettingsModal = showClinicSettingsModal;
window.hideClinicSettingsModal = hideClinicSettingsModal;
window.saveClinicSettings = saveClinicSettings;
window.updateClinicSettingsDisplay = updateClinicSettingsDisplay;
window.showBackupProgressBar = showBackupProgressBar;
window.updateBackupProgressBar = updateBackupProgressBar;
window.finishBackupProgressBar = finishBackupProgressBar;

window.manageBilling = manageBilling;
window.ensureFirebaseReady = ensureFirebaseReady;
window.exportClinicBackup = exportClinicBackup;
window.triggerBackupImport = triggerBackupImport;
window.handleBackupFile = handleBackupFile;
window.importClinicBackup = importClinicBackup;
window.triggerLegacyMigrationImport = triggerLegacyMigrationImport;
window.handleLegacyMigrationFile = handleLegacyMigrationFile;
window.startLegacyDataMigration = startLegacyDataMigration;


document.addEventListener('DOMContentLoaded', function() {
    try {
        updateClinicSettingsDisplay();
    } catch (e) {
        console.error('初始化診所設定顯示失敗:', e);
    }
    // 顯示上次備份資訊（非阻塞）
    loadLastBackupInfo();
});
