



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


document.addEventListener('DOMContentLoaded', function() {
    try {
        updateClinicSettingsDisplay();
    } catch (e) {
        console.error('初始化診所設定顯示失敗:', e);
    }
});
