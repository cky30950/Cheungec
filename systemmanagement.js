



function showClinicSettingsModal() {
    
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
    
    const chineseNameSpan = document.getElementById('displayChineseName');
    const englishNameSpan = document.getElementById('displayEnglishName');
    
    if (chineseNameSpan) {
        chineseNameSpan.textContent = clinicSettings.chineseName || '名醫診所系統';
    }
    if (englishNameSpan) {
        englishNameSpan.textContent = clinicSettings.englishName || 'Dr.Great Clinic';
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


async function exportClinicBackup() {
    const button = document.getElementById('backupExportBtn');
    setButtonLoading(button);
    try {
        await ensureFirebaseReady();
        let totalStepsForBackupExport = 5;
        let stepCount = 0;
        showBackupProgressBar(totalStepsForBackupExport);
        
        
        const [patientsRes, consultationsRes] = await Promise.all([
            
            safeGetPatients(true),
            (async () => {
                
                await waitForFirebaseDataManager();
                
                return await window.firebaseDataManager.getConsultations(true);
            })()
        ]);
        const patientsData = patientsRes && patientsRes.success && Array.isArray(patientsRes.data) ? patientsRes.data : [];
        stepCount++; updateBackupProgressBar(stepCount, totalStepsForBackupExport);
        
        let consultationsData = consultationsRes && consultationsRes.success && Array.isArray(consultationsRes.data) ? consultationsRes.data.slice() : [];
        try {
            
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
            
            console.warn('讀取診症記錄全部頁面失敗，僅匯出部分資料:', _pageErr);
        }
        stepCount++; updateBackupProgressBar(stepCount, totalStepsForBackupExport);
        
        
        let usersData = [];
        try {
            
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
        
        if (typeof initBillingItems === 'function') {
            
            await initBillingItems(true);
        }
        stepCount++; updateBackupProgressBar(stepCount, totalStepsForBackupExport);
        
        let packageData = [];
        try {
            const snapshot = await window.firebase.getDocs(window.firebase.collection(window.firebase.db, 'patientPackages'));
            snapshot.forEach((docSnap) => {
                
                packageData.push({ id: docSnap.id, ...docSnap.data() });
            });
        } catch (e) {
            console.error('讀取套票資料失敗:', e);
        }
        const billingData = Array.isArray(billingItems) ? billingItems : [];
        stepCount++; updateBackupProgressBar(stepCount, totalStepsForBackupExport);
        
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
        
        await importClinicBackup(data, function(step, total) {
            updateBackupProgressBar(step, total);
        }, totalStepsForBackupImport);
        showToast('備份資料匯入完成！', 'success');
        finishBackupProgressBar(true);
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
    
    
    async function replaceCollection(collectionName, items) {
        const colRef = window.firebase.collection(window.firebase.db, collectionName);
        try {
            
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
            
            const idsToDelete = [];
            existingIds.forEach(id => {
                if (!newIds.has(id)) {
                    idsToDelete.push(id);
                }
            });
            
            let batch = window.firebase.writeBatch(window.firebase.db);
            let opCount = 0;
            const commitBatch = async () => {
                if (opCount > 0) {
                    await batch.commit();
                    batch = window.firebase.writeBatch(window.firebase.db);
                    opCount = 0;
                }
            };
            
            for (const id of idsToDelete) {
                const docRef = window.firebase.doc(window.firebase.db, collectionName, id);
                batch.delete(docRef);
                opCount++;
                if (opCount >= 500) {
                    await commitBatch();
                }
            }
            
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
                    if (opCount >= 500) {
                        await commitBatch();
                    }
                }
            }
            
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
    
    await replaceCollection('patients', Array.isArray(data.patients) ? data.patients : []);
    stepCount++;
    if (progressCallback) progressCallback(stepCount, totalSteps);

    const normalizedConsultations = normalizeConsultations(Array.isArray(data.consultations) ? data.consultations : []);
    const enrichedConsultations = enrichConsultationsWithPatientName(normalizedConsultations, Array.isArray(data.patients) ? data.patients : []);
    await replaceCollection('consultations', enrichedConsultations);
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
        idCard: idCard || `LEGACY-${Date.now()}-${index + 1}`,
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
    const patientInvalidHtml = parsed.invalidPatients.slice(0, 5).map(msg => `<li>${msg}</li>`).join('');
    const consultationInvalidHtml = parsed.invalidConsultations.slice(0, 5).map(msg => `<li>${msg}</li>`).join('');
    const patientPreview = parsed.patients.slice(0, 3).map(p => `${p.name}${p.phone ? ` / ${p.phone}` : ''}`).join('、');
    const consultationPreview = parsed.consultations.slice(0, 3).map(c => `${c.patientRef.patientName || '未命名病人'} / ${c.diagnosis}`).join('、');
    return `
        <div class="space-y-2">
            <div>解析完成：病人 ${parsed.patients.length} 筆、病歷 ${parsed.consultations.length} 筆</div>
            <div>病人預覽：${patientPreview || '無'}</div>
            <div>病歷預覽：${consultationPreview || '無'}</div>
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
        const legacySourceId = item.legacySourceId ? String(item.legacySourceId).trim() : '';
        const patientNumber = item.patientNumber ? String(item.patientNumber).trim() : '';
        const idCard = item.idCard ? String(item.idCard).trim().toUpperCase() : '';
        const phone = item.phone ? String(item.phone).trim() : '';
        const name = item.name ? String(item.name).trim().toLowerCase() : '';
        if (legacySourceId && id) byLegacyId.set(legacySourceId, id);
        if (patientNumber && id) byPatientNumber.set(patientNumber, id);
        if (idCard && id) byIdCard.set(idCard, id);
        if (phone && id) byPhone.set(phone, id);
        if (name && id && !byName.has(name)) byName.set(name, id);
    });
    return { byLegacyId, byPatientNumber, byIdCard, byPhone, byName };
}

function resolveConsultationPatientId(patientRef, lookup) {
    if (!patientRef || !lookup) return '';
    const legacyId = patientRef.patientId ? String(patientRef.patientId).trim() : '';
    const patientNumber = patientRef.patientNumber ? String(patientRef.patientNumber).trim() : '';
    const idCard = patientRef.idCard ? String(patientRef.idCard).trim().toUpperCase() : '';
    const phone = patientRef.phone ? String(patientRef.phone).trim() : '';
    const name = patientRef.patientName ? String(patientRef.patientName).trim().toLowerCase() : '';
    if (legacyId && lookup.byLegacyId.has(legacyId)) return lookup.byLegacyId.get(legacyId);
    if (legacyId && lookup.byPatientNumber.has(legacyId)) return lookup.byPatientNumber.get(legacyId);
    if (patientNumber && lookup.byPatientNumber.has(patientNumber)) return lookup.byPatientNumber.get(patientNumber);
    if (idCard && lookup.byIdCard.has(idCard)) return lookup.byIdCard.get(idCard);
    if (phone && lookup.byPhone.has(phone)) return lookup.byPhone.get(phone);
    if (name && lookup.byName.has(name)) return lookup.byName.get(name);
    return '';
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
        let patientSuccess = 0;
        let patientMerged = 0;
        let patientFailed = 0;
        let consultationSuccess = 0;
        let consultationSkipped = 0;
        let consultationFailed = 0;
        let currentStep = 0;
        const totalSteps = totalToImport + 2;
        for (let i = 0; i < legacyMigrationParsedState.patients.length; i++) {
            const item = legacyMigrationParsedState.patients[i];
            const idCardKey = item.idCard ? String(item.idCard).trim().toUpperCase() : '';
            const phoneKey = item.phone ? String(item.phone).trim() : '';
            const legacyKey = item.legacySourceId ? String(item.legacySourceId).trim() : '';
            const patientNumberKey = item.patientNumber ? String(item.patientNumber).trim() : '';
            const existingId = (legacyKey && lookup.byLegacyId.get(legacyKey))
                || (patientNumberKey && lookup.byPatientNumber.get(patientNumberKey))
                || (idCardKey && lookup.byIdCard.get(idCardKey))
                || (phoneKey && lookup.byPhone.get(phoneKey))
                || '';
            if (existingId) {
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
                        if (legacyKey) lookup.byLegacyId.set(legacyKey, saveRes.id);
                        if (finalPatientNumber) lookup.byPatientNumber.set(finalPatientNumber, saveRes.id);
                        if (idCardKey) lookup.byIdCard.set(idCardKey, saveRes.id);
                        if (phoneKey) lookup.byPhone.set(phoneKey, saveRes.id);
                        if (item.name) {
                            const nameKey = String(item.name).trim().toLowerCase();
                            if (nameKey && !lookup.byName.has(nameKey)) lookup.byName.set(nameKey, saveRes.id);
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
            const resolvedPatientId = resolveConsultationPatientId(item.patientRef, latestLookup);
            if (!resolvedPatientId) {
                consultationSkipped++;
                currentStep++;
                const percent = Math.round((currentStep / totalSteps) * 100);
                setLegacyMigrationProgress(percent, `遷移進度 ${percent}%（病歷 ${j + 1}/${legacyMigrationParsedState.consultations.length}）`, true);
                continue;
            }
            try {
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
                    medicalRecordNumber: item.medicalRecordNumber || (typeof generateMedicalRecordNumber === 'function' ? generateMedicalRecordNumber() : `MR${Date.now()}${String(j + 1).padStart(3, '0')}`),
                    importSource: 'legacyMigration',
                    legacySourceId: item.legacySourceId || '',
                    importedAt: new Date().toISOString()
                };
                const saveConsultationRes = await window.firebaseDataManager.addConsultation(consultationPayload);
                if (saveConsultationRes && saveConsultationRes.success) consultationSuccess++;
                else consultationFailed++;
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
                <div>病人失敗：${patientFailed} 筆</div>
                <div>病歷新增：${consultationSuccess} 筆</div>
                <div>病歷找不到病人略過：${consultationSkipped} 筆</div>
                <div>病歷失敗：${consultationFailed} 筆</div>
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
});
