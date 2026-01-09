// 系統管理功能從 system.js 拆分到此文件。
// 包含診所設定管理、備份匯出/匯入及相關進度條控制。

// 診所設定管理功能
function showClinicSettingsModal() {
    // 載入現有設定
    document.getElementById('clinicChineseName').value = clinicSettings.chineseName || '';
    document.getElementById('clinicEnglishName').value = clinicSettings.englishName || '';
    document.getElementById('clinicBusinessHours').value = clinicSettings.businessHours || '';
    document.getElementById('clinicPhone').value = clinicSettings.phone || '';
    document.getElementById('clinicAddress').value = clinicSettings.address || '';
    
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
    
    if (!chineseName) {
        showToast('請輸入診所中文名稱！', 'error');
        return;
    }
    
    clinicSettings.chineseName = chineseName;
    clinicSettings.englishName = englishName;
    clinicSettings.businessHours = businessHours;
    clinicSettings.phone = phone;
    clinicSettings.address = address;
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
    // 更新系統管理頁面的診所設定顯示
    const chineseNameSpan = document.getElementById('displayChineseName');
    const englishNameSpan = document.getElementById('displayEnglishName');
    
    if (chineseNameSpan) {
        chineseNameSpan.textContent = clinicSettings.chineseName || '名醫診所系統';
    }
    if (englishNameSpan) {
        englishNameSpan.textContent = clinicSettings.englishName || 'Dr.Great Clinic';
    }
    
    // 更新登入頁面的診所名稱
    const loginTitle = document.getElementById('loginTitle');
    const loginEnglishTitle = document.getElementById('loginEnglishTitle');
    if (loginTitle) {
        loginTitle.textContent = clinicSettings.chineseName || '名醫診所系統';
    }
    if (loginEnglishTitle) {
        loginEnglishTitle.textContent = clinicSettings.englishName || 'Dr.Great Clinic';
    }
    
    // 更新主頁面的診所名稱
    const systemTitle = document.getElementById('systemTitle');
    const systemEnglishTitle = document.getElementById('systemEnglishTitle');
    if (systemTitle) {
        systemTitle.textContent = clinicSettings.chineseName || '名醫診所系統';
    }
    if (systemEnglishTitle) {
        systemEnglishTitle.textContent = clinicSettings.englishName || 'Dr.Great Clinic';
    }
    
    // 更新歡迎頁面的診所名稱
    const welcomeTitle = document.getElementById('welcomeTitle');
    const welcomeEnglishTitle = document.getElementById('welcomeEnglishTitle');
    if (welcomeTitle) {
        welcomeTitle.textContent = `歡迎使用${clinicSettings.chineseName || '名醫診所系統'}`;
    }
    if (welcomeEnglishTitle) {
        welcomeEnglishTitle.textContent = `Welcome to ${clinicSettings.englishName || 'Dr.Great Clinic'}`;
    }
}

// 匯入備份時使用的進度條相關函式
/**
 * 顯示備份匯入進度條。
 * @param {number} totalSteps 總步驟數，用於計算百分比
 */
function showBackupProgressBar(totalSteps) {
    const container = document.getElementById('backupProgressContainer');
    const bar = document.getElementById('backupProgressBar');
    const text = document.getElementById('backupProgressText');
    if (container && bar && text) {
             container.classList.remove('hidden');
             bar.style.width = '0%';
             // 取得匯入進度標籤的翻譯
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

/**
 * 更新備份匯入進度條。
 * @param {number} currentStep 已完成的步驟數
 * @param {number} totalSteps 總步驟數
 */
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

/**
 * 完成備份匯入進度條。
 * @param {boolean} success 是否匯入成功
 */
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
                 // keep defaults
             }
             text.textContent = success ? successMsg : failureMsg;
        // 於 2 秒後隱藏進度條
        setTimeout(() => {
            container.classList.add('hidden');
        }, 2000);
    }
}

/**
 * 開啟 Stripe 客戶門戶以管理訂閱與付款。
 * 這個函式會呼叫後端端點建立客戶門戶會話，然後導向使用者至該會話的 URL。
 * 若建立失敗或未取得 URL，會顯示錯誤提示。
 */
async function manageBilling() {
    try {
        // 取得當前登入使用者的 UID。可以依需求改為其他識別碼或客戶 ID。
        const uid = (window.currentUser && window.currentUser.uid) ? window.currentUser.uid : null;
        // 透過 POST 請求呼叫後端建立客戶門戶會話
        const response = await fetch('/create-customer-portal-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uid })
        });
        if (!response.ok) {
            throw new Error('network');
        }
        const data = await response.json();
        // 修改：直接使用指定的 Stripe 登入頁面。
        // 不論後端是否回傳 URL，皆導向客戶提供的訂閱與付款管理連結。
        const billingUrl = 'https://billing.stripe.com/p/login/00w00l9Sk5I98irfdLcjS00';
        window.open(billingUrl, '_blank');
    } catch (err) {
        console.error('建立客戶門戶會話失敗:', err);
        showToast('開啟付款管理視窗失敗！', 'error');
    }
}

/**
 * 等待 Firebase DataManager 準備就緒的輔助函式。
 * 某些情況下網頁載入時 Firebase 仍在初始化，直接讀取資料會失敗。
 */
async function ensureFirebaseReady() {
    if (!window.firebaseDataManager || !window.firebaseDataManager.isReady) {
        for (let i = 0; i < 100 && (!window.firebaseDataManager || !window.firebaseDataManager.isReady); i++) {
            await new Promise(resolve => setTimeout(resolve, 50));
        }
    }
}

/**
 * 匯出診所所有資料（不包含 Realtime Database 的掛號資料）。
 * 讀取各個集合後組成單一 JSON，提供下載。
 */
async function exportClinicBackup() {
    const button = document.getElementById('backupExportBtn');
    setButtonLoading(button);
    try {
        await ensureFirebaseReady();
        let totalStepsForBackupExport = 5;
        let stepCount = 0;
        showBackupProgressBar(totalStepsForBackupExport);
        // 讀取病人、診症記錄與用戶資料
        // 讀取病人與診症資料，並透過 fetchUsers() 取得用戶列表
        const [patientsRes, consultationsRes] = await Promise.all([
            // 強制刷新以取得最新病人資料
            safeGetPatients(true),
            (async () => {
                // 確保資料管理器已準備好
                await waitForFirebaseDataManager();
                /*
                 * 讀取診症記錄時也需要傳入 forceRefresh=true，
                 * 以避免回傳的是快取中的舊資料。
                 */
                return await window.firebaseDataManager.getConsultations(true);
            })()
        ]);
        const patientsData = patientsRes && patientsRes.success && Array.isArray(patientsRes.data) ? patientsRes.data : [];
        stepCount++; updateBackupProgressBar(stepCount, totalStepsForBackupExport);
        // 若診症記錄有多頁，必須依序載入所有頁面。先取得第一頁資料。
        let consultationsData = consultationsRes && consultationsRes.success && Array.isArray(consultationsRes.data) ? consultationsRes.data.slice() : [];
        try {
            // 若返回值指出還有更多頁面，迭代載入直到沒有更多資料
            let hasMore = consultationsRes && consultationsRes.success && consultationsRes.hasMore;
            while (hasMore) {
                const nextRes = await window.firebaseDataManager.getConsultationsNextPage();
                if (nextRes && nextRes.success && Array.isArray(nextRes.data)) {
                    consultationsData = nextRes.data.slice();
                    hasMore = nextRes.hasMore;
                } else {
                    hasMore = false;
                }
            }
        } catch (_pageErr) {
            // 若載入下一頁時發生錯誤，保留已獲得的資料並停止
            console.warn('讀取診症記錄全部頁面失敗，僅匯出部分資料:', _pageErr);
        }
        stepCount++; updateBackupProgressBar(stepCount, totalStepsForBackupExport);
        // 取得用戶列表；為確保包含個人設置（personalSettings），直接從 Firestore 讀取
        // 不使用快取中的 trimmed 資料，以便包含所有欄位
        let usersData = [];
        try {
            // 從 Firestore 讀取所有 users 文件
            const userSnap = await window.firebase.getDocs(
                window.firebase.collection(window.firebase.db, 'users')
            );
            userSnap.forEach((docSnap) => {
                usersData.push({ id: docSnap.id, ...docSnap.data() });
            });
        } catch (_fetchErr) {
            console.warn('匯出備份時取得用戶列表失敗，將不包含用戶資料');
        }
        stepCount++; updateBackupProgressBar(stepCount, totalStepsForBackupExport);
        // 讀取收費項目時強制刷新，避免使用快取中的舊資料。
        if (typeof initBillingItems === 'function') {
            // 強制從 Firestore 重新讀取收費項目，以確保備份內容為最新
            await initBillingItems(true);
        }
        stepCount++; updateBackupProgressBar(stepCount, totalStepsForBackupExport);
        // 讀取所有套票資料
        let packageData = [];
        try {
            const snapshot = await window.firebase.getDocs(window.firebase.collection(window.firebase.db, 'patientPackages'));
            snapshot.forEach((docSnap) => {
                // 將文件 ID 一併存入，以便還原時能維持原有 ID
                packageData.push({ id: docSnap.id, ...docSnap.data() });
            });
        } catch (e) {
            console.error('讀取套票資料失敗:', e);
        }
        const billingData = Array.isArray(billingItems) ? billingItems : [];
        stepCount++; updateBackupProgressBar(stepCount, totalStepsForBackupExport);
        // 讀取 Realtime Database 資料，排除即時掛號及診症資料
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
            if (rtdbData) {
                totalStepsForBackupExport++;
                stepCount++; updateBackupProgressBar(stepCount, totalStepsForBackupExport);
            }
        } catch (e) {
            console.warn('讀取 Realtime Database 資料失敗:', e);
            rtdbData = null;
        }
        // 組合備份資料：僅包含病人資料、診症記錄、用戶資料、套票資料與收費項目，以及可選的 Realtime Database
        const backup = {
            patients: patientsData,
            consultations: consultationsData,
            users: usersData,
            billingItems: billingData,
            patientPackages: packageData
        };
        if (rtdbData) {
            backup.rtdb = rtdbData;
        }
        stepCount++; updateBackupProgressBar(stepCount, totalStepsForBackupExport);
        const json = JSON.stringify(backup, null, 2);
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
        showToast('備份資料已匯出！', 'success');
        finishBackupProgressBar(true);
    } catch (error) {
        console.error('匯出備份失敗:', error);
        showToast('匯出備份失敗，請稍後再試', 'error');
        finishBackupProgressBar(false);
    } finally {
        clearButtonLoading(button);
    }
}

/**
 * 觸發備份檔案匯入流程：清空檔案輸入框並打開檔案選擇視窗。
 */
function triggerBackupImport() {
    const input = document.getElementById('backupFileInput');
    if (input) {
        input.value = '';  // 重置 value，確保可重新選檔
        input.click();
    }
}

/**
 * 處理使用者選擇的備份檔案，解析後進行匯入。
 * @param {File} file 使用者選擇的 JSON 檔案
 */
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
    // 動態計算匯入步驟。基本五步：patients、consultations、users、billingItems、patientPackages。
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
    // 顯示匯入進度條
    showBackupProgressBar(totalStepsForBackupImport);
    try {
        // 傳入進度回調以更新匯入進度。第三個參數為總步驟數
        await importClinicBackup(data, function(step, total) {
            updateBackupProgressBar(step, total);
        }, totalStepsForBackupImport);
        showToast('備份資料匯入完成！', 'success');
        finishBackupProgressBar(true);
    } catch (error) {
        console.error('匯入備份失敗:', error);
        showToast('匯入備份失敗，請確認檔案格式是否正確', 'error');
        // 進度條標記為失敗
        finishBackupProgressBar(false);
    } finally {
        clearButtonLoading(button);
    }
}

/**
 * 將備份資料寫回 Firestore，覆蓋現有資料。Realtime Database 資料不受影響。
 * @param {Object} data 備份物件
 */
async function importClinicBackup(data) {
    let progressCallback = null;
    // 僅還原病人資料、診症記錄、用戶資料、套票資料與收費項目，總步驟數為 5
    let totalSteps = 5;
    // 若第二個參數為函式，視為進度回調；第三個參數為總步驟數（可選）
    if (arguments.length >= 2 && typeof arguments[1] === 'function') {
        progressCallback = arguments[1];
    }
    if (arguments.length >= 3 && typeof arguments[2] === 'number') {
        totalSteps = arguments[2];
    }
    await ensureFirebaseReady();
    // helper：清空並覆寫集合資料
    /**
     * 將集合資料替換為指定項目，僅刪除不在 items 中的文件，並使用批次寫入以減少網路往返。
     * @param {string} collectionName 集合名稱
     * @param {Array} items 要寫入的新資料陣列，每個元素需包含 id 屬性
     */
    async function replaceCollection(collectionName, items) {
        const colRef = window.firebase.collection(window.firebase.db, collectionName);
        try {
            // 取得現有文件 ID
            const snap = await window.firebase.getDocs(colRef);
            const existingIds = new Set();
            snap.forEach((docSnap) => {
                existingIds.add(docSnap.id);
            });
            // 建立新資料 ID 集合
            const newIds = new Set();
            if (Array.isArray(items)) {
                items.forEach(item => {
                    if (item && item.id !== undefined && item.id !== null) {
                        newIds.add(String(item.id));
                    }
                });
            }
            // 計算需要刪除的文件（現有但不在新的 ID 集合中）
            const idsToDelete = [];
            existingIds.forEach(id => {
                if (!newIds.has(id)) {
                    idsToDelete.push(id);
                }
            });
            // 使用批次寫入刪除與寫入，單批次最多 500 個操作
            let batch = window.firebase.writeBatch(window.firebase.db);
            let opCount = 0;
            const commitBatch = async () => {
                if (opCount > 0) {
                    await batch.commit();
                    batch = window.firebase.writeBatch(window.firebase.db);
                    opCount = 0;
                }
            };
            // 先處理刪除
            for (const id of idsToDelete) {
                const docRef = window.firebase.doc(window.firebase.db, collectionName, id);
                batch.delete(docRef);
                opCount++;
                if (opCount >= 500) {
                    await commitBatch();
                }
            }
            // 再處理寫入/更新
            if (Array.isArray(items)) {
                for (const item of items) {
                    if (!item || item.id === undefined || item.id === null) continue;
                    const idStr = String(item.id);
                    const docRef = window.firebase.doc(window.firebase.db, collectionName, idStr);
                    // 移除 id 屬性，避免將 id 寫入文件內容
                    let dataToWrite;
                    try {
                        const { id, ...rest } = item || {};
                        dataToWrite = { ...rest };
                    } catch (_omitErr) {
                        dataToWrite = item;
                    }
                    batch.set(docRef, dataToWrite);
                    opCount++;
                    if (opCount >= 500) {
                        await commitBatch();
                    }
                }
            }
            // 提交最後一批
            await commitBatch();
        } catch (err) {
            console.error('更新 ' + collectionName + ' 資料時發生錯誤:', err);
        }
    }
    async function replaceClinicBillingItems(items) {
        try {
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
            const batch = window.firebase.writeBatch(window.firebase.db);
            let opCount = 0;
            const commitIfNeeded = async () => {
                if (opCount > 0) {
                    await batch.commit();
                    opCount = 0;
                }
            };
            existingClinicIds.forEach(id => {
                if (!newClinicIds.has(id)) {
                    batch.delete(window.firebase.doc(window.firebase.db, 'clinics', clinicId, 'billingItems', id));
                    opCount++;
                }
            });
            existingGlobalIds.forEach(id => {
                if (!newGlobalIds.has(id)) {
                    batch.delete(window.firebase.doc(window.firebase.db, 'globalBillingItems', id));
                    opCount++;
                }
            });
            if (Array.isArray(items)) {
                for (const it of items) {
                    if (!it || it.id === undefined || it.id === null) continue;
                    const { id, ...rest } = it || {};
                    const dataToWrite = { ...rest };
                    const idStr = String(it.id);
                    if (it.shared) {
                        batch.set(window.firebase.doc(window.firebase.db, 'globalBillingItems', idStr), dataToWrite);
                    } else {
                        batch.set(window.firebase.doc(window.firebase.db, 'clinics', clinicId, 'billingItems', idStr), dataToWrite);
                    }
                    opCount++;
                    if (opCount >= 500) await commitIfNeeded();
                }
            }
            await commitIfNeeded();
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
    // 覆蓋各集合並更新進度
    let stepCount = 0;
    // 覆蓋需要還原的集合，順序為：patients -> consultations -> users -> billingItems -> patientPackages
    await replaceCollection('patients', Array.isArray(data.patients) ? data.patients : []);
    stepCount++;
    if (progressCallback) progressCallback(stepCount, totalSteps);

    await replaceCollection('consultations', normalizeConsultations(Array.isArray(data.consultations) ? data.consultations : []));
    stepCount++;
    if (progressCallback) progressCallback(stepCount, totalSteps);

    await replaceCollection('users', Array.isArray(data.users) ? data.users : []);
    stepCount++;
    if (progressCallback) progressCallback(stepCount, totalSteps);

    await replaceClinicBillingItems(Array.isArray(data.billingItems) ? data.billingItems : []);
    stepCount++;
    if (progressCallback) progressCallback(stepCount, totalSteps);

    await replaceCollection('patientPackages', Array.isArray(data.patientPackages) ? data.patientPackages : []);
    stepCount++;
    if (progressCallback) progressCallback(stepCount, totalSteps);
    // 如果備份包含 Realtime Database 資料，將其寫回
    const rtdbData = data && typeof data.rtdb === 'object' ? data.rtdb : null;
    if (rtdbData) {
        try {
            for (const key of Object.keys(rtdbData)) {
                await window.firebase.set(window.firebase.ref(window.firebase.rtdb, key), rtdbData[key]);
            }
            // 更新本地中藥庫存或其他即時資料快取
            if (typeof initHerbInventory === 'function') {
                await initHerbInventory(true);
            } else if (rtdbData.herbInventory) {
                try {
                    herbInventory = rtdbData.herbInventory || {};
                    herbInventoryInitialized = true;
                } catch (_e) {}
            }
        } catch (err) {
            console.error('還原 Realtime Database 資料時發生錯誤:', err);
        }
        stepCount++;
        if (progressCallback) progressCallback(stepCount, totalSteps);
    }
    /*
     * 匯入完成後更新本地快取並刷新應用程式資料。
     * 為了節省 Firebase 讀取量，我們直接將備份資料寫入快取與全域變數，
     * 並預先產生分頁快取與總數，讓後續 API 調用可使用快取而非再向 Firestore 讀取。
     */
    try {
        // 將患者、診症及用戶資料寫入本地快取
        patientCache = Array.isArray(data.patients)
            ? data.patients.map(p => {
                // 確保 ID 為字串，避免數字與字串比較不相等而導致找不到病人
                const cloned = { ...(p || {}) };
                if (cloned.id !== undefined && cloned.id !== null) {
                    cloned.id = String(cloned.id);
                }
                return cloned;
            })
            : [];
        // 將病人資料依 createdAt 由新至舊排序，以模擬 Firestore 預設排序
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
        // 將資料同步至全域變數（部分功能直接引用）
        consultations = Array.isArray(consultationCache) ? consultationCache.slice() : [];
        // 同步 userCache 到全域 users 變數（去除 personalSettings 以減少冗餘）
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
        // 將病人資料同步至全域 patients 變數，以便不依賴 fetchPatients() 也能直接存取
        patients = Array.isArray(patientCache) ? patientCache.slice() : [];
        // 儲存到本地存儲以便離線使用或初始載入
        try {
            localStorage.setItem('patients', JSON.stringify(patients));
        } catch (_lsErr) {
            // 忽略 localStorage 錯誤
        }
        // 更新收費項目及其載入狀態
        billingItems = Array.isArray(data.billingItems) ? data.billingItems : [];
        billingItemsLoaded = true;
        try {
            const cid = localStorage.getItem('currentClinicId') || (typeof currentClinicId !== 'undefined' ? currentClinicId : 'local-default');
            localStorage.setItem(`billingItems_${cid}`, JSON.stringify(billingItems));
        } catch (_lsErr) {}
        // 更新病人總數快取
        patientsCountCache = Array.isArray(patientCache) ? patientCache.length : 0;
        // 重新產生病人分頁快取，使 fetchPatientsPage() 可以直接從快取取得資料
        patientPagesCache = {};
        patientPageCursors = {};
        // 取得每頁顯示數量
        const perPage = (paginationSettings && paginationSettings.patientList && paginationSettings.patientList.itemsPerPage)
            ? paginationSettings.patientList.itemsPerPage
            : 10;
        if (Array.isArray(patientCache)) {
            // 先依 createdAt 由新至舊排序，模擬 Firestore 預設排序
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
            // 依每頁大小切分分頁快取
            for (let i = 0; i < sortedPatients.length; i += perPage) {
                const pageNum = Math.floor(i / perPage) + 1;
                patientPagesCache[pageNum] = sortedPatients.slice(i, i + perPage);
            }
            // 若未產生任何頁面快取（例如無資料），確保至少有第一頁空陣列，避免 fetchPatientsPage 讀取 Firestore
            if (!patientPagesCache[1]) {
                patientPagesCache[1] = [];
            }
        }
        // 重新計算中藥庫使用次數（若有相關函式）
        if (typeof computeGlobalUsageCounts === 'function') {
            try { await computeGlobalUsageCounts(); } catch (_e) {}
        }
    } catch (_assignErr) {
        console.error('匯入備份後更新本地快取失敗:', _assignErr);
    }
    // 更新界面（使用快取資料）
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
    // 若最後仍未達到總步驟數，進行最後一次更新以顯示 100%
    if (progressCallback && stepCount < totalSteps) {
        progressCallback(totalSteps, totalSteps);
    }
}

// 將函式掛載到全域名稱空間，以覆蓋 system.js 中的同名定義
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
// 將 manageBilling 函式綁定到 systemManagement 命名空間，供系統管理頁面按鈕呼叫
window.systemManagement.manageBilling = manageBilling;
window.systemManagement.ensureFirebaseReady = ensureFirebaseReady;
window.systemManagement.exportClinicBackup = exportClinicBackup;
window.systemManagement.triggerBackupImport = triggerBackupImport;
window.systemManagement.handleBackupFile = handleBackupFile;
window.systemManagement.importClinicBackup = importClinicBackup;

// 同時將這些函式直接賦值到 window，使其覆蓋原本在 system.js 中的定義
window.showClinicSettingsModal = showClinicSettingsModal;
window.hideClinicSettingsModal = hideClinicSettingsModal;
window.saveClinicSettings = saveClinicSettings;
window.updateClinicSettingsDisplay = updateClinicSettingsDisplay;
window.showBackupProgressBar = showBackupProgressBar;
window.updateBackupProgressBar = updateBackupProgressBar;
window.finishBackupProgressBar = finishBackupProgressBar;
// 將 manageBilling 函式綁定到全域空間，以便直接呼叫
window.manageBilling = manageBilling;
window.ensureFirebaseReady = ensureFirebaseReady;
window.exportClinicBackup = exportClinicBackup;
window.triggerBackupImport = triggerBackupImport;
window.handleBackupFile = handleBackupFile;
window.importClinicBackup = importClinicBackup;

// 在 DOM 內容載入後，再次更新診所資料顯示（此時函式已覆蓋）
document.addEventListener('DOMContentLoaded', function() {
    try {
        updateClinicSettingsDisplay();
    } catch (e) {
        console.error('初始化診所設定顯示失敗:', e);
    }
});
