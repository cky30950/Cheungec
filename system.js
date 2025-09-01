// 系統資料儲存
// 用戶登入後的資料
let currentUser = null;
let currentUserData = null;

/**
 * 角色與對應可存取的系統區塊對照表。
 * 每個角色可存取哪些頁面（功能），在此集中定義。
 */
const ROLE_PERMISSIONS = {
  // 診所管理者擁有全部功能權限，包括個人設置與模板庫管理
  // 診所管理：將模板庫管理放在診症系統之後，其餘順序保持一致
  '診所管理': ['patientManagement', 'consultationSystem', 'templateLibrary', 'herbLibrary', 'billingManagement', 'userManagement', 'financialReports', 'systemManagement', 'personalSettings'],
  // 醫師可存取大部分功能，包含個人設置與模板庫管理
  // 醫師：模板庫管理放在診症系統之後
  '醫師': ['patientManagement', 'consultationSystem', 'templateLibrary', 'herbLibrary', 'billingManagement', 'userManagement', 'systemManagement', 'personalSettings'],
  // 護理師原本僅能使用診症相關功能。為了讓模板庫管理變成公用功能，
  // 將 templateLibrary 新增到護理師的權限清單，讓護理師也能瀏覽與使用模板庫。
  // 護理師：模板庫管理放在診症系統之後
      '護理師': ['patientManagement', 'consultationSystem', 'templateLibrary', 'herbLibrary'],
  // 一般用戶原本只能進入病患管理與診症系統。為了讓模板庫管理變成公用功能，
  // 也將 templateLibrary 新增到一般用戶的權限清單，使所有登入用戶都可存取模板庫。
      '用戶': ['patientManagement', 'consultationSystem', 'templateLibrary']
};

/**
 * 判斷當前用戶是否具有存取指定區塊的權限。
 * @param {string} sectionId
 * @returns {boolean}
 */
function hasAccessToSection(sectionId) {
  // 若尚未取得用戶資料或未設定職位，則直接拒絕存取
  if (!currentUserData || !currentUserData.position) return false;

  // 額外規則：收費項目管理僅限診所管理者或醫師使用
  // 即使在 ROLE_PERMISSIONS 中配置不當，也能確保護理師無法進入
  if (sectionId === 'billingManagement') {
    const pos = currentUserData.position.trim ? currentUserData.position.trim() : currentUserData.position;
    if (pos !== '診所管理' && pos !== '醫師') {
      return false;
    }
  }

  // 根據角色權限定義判斷
  const allowed = ROLE_PERMISSIONS[currentUserData.position] || [];
  return allowed.includes(sectionId);
}

// 初始化全域變數
let patients = [];
let consultations = [];
let appointments = [];
// 快取病人列表，避免重複從 Firestore 讀取
let patientCache = null;

// 快取診症記錄和用戶列表，避免重複從 Firestore 讀取
let consultationCache = null;
let userCache = null;

// 追蹤本次診症操作期間對套票使用造成的暫時變更。
// 當使用者在開啟診症或編輯病歷時使用或取消使用套票，
// 將對患者套票剩餘次數產生影響。若使用者最終未保存病歷或取消診症，
// 應當將這些變更回復，以避免套票次數不正確。
// 每個項目包含 patientId、packageRecordId 以及 delta，
// delta 為負數表示消耗一次，為正數表示退回一次。
let pendingPackageChanges = [];

/**
 * 計算指定病人和套票的暫存變更總和。
 * @param {string} patientId
 * @param {string} packageRecordId
 * @returns {number}
 */
// 已移除 getPendingPackageDelta 函式（未使用）

/**
 * 將所有暫存的套票變更同步至 Firestore。
 * 在保存病歷時呼叫此函式，根據 pendingPackageChanges 中累積的差值
 * 更新各套票的剩餘次數。
 */
async function commitPendingPackageChanges() {
    try {
        // 聚合變更，避免對同一筆套票重複更新
        const aggregated = {};
        for (const change of pendingPackageChanges) {
            if (!change || !change.patientId || !change.packageRecordId || typeof change.delta !== 'number') continue;
            const key = String(change.patientId) + '||' + String(change.packageRecordId);
            if (!aggregated[key]) {
                aggregated[key] = { patientId: change.patientId, packageRecordId: change.packageRecordId, delta: 0 };
            }
            aggregated[key].delta += change.delta;
        }
        // 套用每個聚合後的變更
        for (const key in aggregated) {
            const { patientId, packageRecordId, delta } = aggregated[key];
            if (!delta) continue;
            try {
                const packages = await getPatientPackages(patientId);
                // 確保 ID 比較時以字串進行
                const pkg = packages.find(p => String(p.id) === String(packageRecordId));
                if (!pkg) continue;
                let newRemaining = (pkg.remainingUses || 0) + delta;
                // 約束 remainingUses 不小於 0，也不超過 totalUses（若存在）
                if (typeof pkg.totalUses === 'number') {
                    newRemaining = Math.max(0, Math.min(pkg.totalUses, newRemaining));
                } else {
                    newRemaining = Math.max(0, newRemaining);
                }
                const updatedPackage = { ...pkg, remainingUses: newRemaining };
                await window.firebaseDataManager.updatePatientPackage(packageRecordId, updatedPackage);
            } catch (err) {
                console.error('套用暫存套票變更時發生錯誤:', err);
            }
        }
    } catch (error) {
        console.error('提交暫存套票變更錯誤:', error);
    }
}

/**
 * 復原所有暫存的套票使用變更。
 * 當取消診症或退出編輯且未保存時呼叫此函式，
 * 依序將 pendingPackageChanges 中的各項改變倒轉（即減去 delta），
 * 並清空 pendingPackageChanges。
 */
async function revertPendingPackageChanges() {
    // 取消診症或退出編輯時，不再回復資料庫中的套票次數。
    // 只需清除暫存的變更並重新渲染套票列表，以恢復原始顯示。
    try {
        pendingPackageChanges = [];
        if (typeof refreshPatientPackagesUI === 'function') {
            await refreshPatientPackagesUI();
        }
    } catch (e) {
        console.error('重置暫存套票變更錯誤:', e);
    }
}

/**
 * 通用的資料快取器。
 *
 * 許多讀取資料的函式僅在快取不存在或強制重新讀取時才從資料庫取得資料。
 * 這個工具函式用來簡化這類模式，避免在不同地方重複撰寫快取邏輯。
 *
 * @param {any} cache 當前快取資料
 * @param {Function} fetchFunc 回傳 Promise 的函式，用於從資料庫載入資料
 * @param {boolean} forceRefresh 是否強制重新載入
 * @returns {Promise<any[]>} 最新的資料陣列
 */
async function fetchDataWithCache(cache, fetchFunc, forceRefresh = false) {
    try {
        // 若需要重新讀取，或快取為空則從資料庫讀取
        if (forceRefresh || !cache) {
            const result = await fetchFunc();
            if (result && result.success) {
                cache = result.data;
            } else {
                cache = null;
            }
        }
        return cache || [];
    } catch (error) {
        console.error('資料載入失敗:', error);
        return [];
    }
}

/**
 * 取得病人列表並使用本地快取。
 * 利用 `fetchDataWithCache` 函式統一讀取邏輯。
 *
 * @param {boolean} forceRefresh 是否強制重新從 Firestore 讀取資料
 * @returns {Promise<Array>} 病人資料陣列
 */
async function fetchPatients(forceRefresh = false) {
    patientCache = await fetchDataWithCache(
        patientCache,
        () => window.firebaseDataManager.getPatients(),
        forceRefresh
    );
    return patientCache;
}

/**
 * 取得診症記錄列表並使用本地快取。
 * 利用 `fetchDataWithCache` 函式統一讀取邏輯。
 *
 * @param {boolean} forceRefresh 是否強制重新從 Firestore 讀取資料
 * @returns {Promise<Array>} 診症資料陣列
 */
async function fetchConsultations(forceRefresh = false) {
    consultationCache = await fetchDataWithCache(
        consultationCache,
        () => window.firebaseDataManager.getConsultations(),
        forceRefresh
    );
    return consultationCache;
}

/**
 * 取得用戶列表並使用本地快取。
 * 利用 `fetchDataWithCache` 函式統一讀取邏輯。
 *
 * @param {boolean} forceRefresh 是否強制重新從 Firestore 讀取資料
 * @returns {Promise<Array>} 用戶資料陣列
 */
async function fetchUsers(forceRefresh = false) {
    userCache = await fetchDataWithCache(
        userCache,
        () => window.firebaseDataManager.getUsers(),
        forceRefresh
    );
    return userCache;
}
        
        // 診所設定
        let clinicSettings = JSON.parse(localStorage.getItem('clinicSettings') || '{}');
        if (!clinicSettings.chineseName) {
            clinicSettings.chineseName = '名醫診所系統';
            clinicSettings.englishName = 'TCM Clinic';
            clinicSettings.businessHours = '週一至週五 09:00-18:00';
            clinicSettings.phone = '(852) 2345-6789';
            clinicSettings.address = '香港中環皇后大道中123號';
            localStorage.setItem('clinicSettings', JSON.stringify(clinicSettings));
        }
        
        // 浮動提示功能
        function showToast(message, type = 'info') {
            // 移除現有的提示
            const existingToast = document.querySelector('.toast');
            if (existingToast) {
                existingToast.remove();
            }
            
            // 創建新的提示
            const toast = document.createElement('div');
            toast.className = `toast ${type}`;
            
            // 設置圖標
            const icons = {
                success: '✅',
                error: '❌',
                warning: '⚠️',
                info: 'ℹ️'
            };
            
            toast.innerHTML = `
                <div class="toast-icon">${icons[type] || icons.info}</div>
                <div class="toast-content">${message}</div>
            `;
            
            // 添加到頁面
            document.body.appendChild(toast);
            
            // 顯示動畫
            setTimeout(() => {
                toast.classList.add('show');
            }, 100);
            
            // 4秒後淡出並移除
            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translateX(100%)';
                setTimeout(() => {
                    if (toast.parentNode) {
                        toast.parentNode.removeChild(toast);
                    }
                }, 300);
            }, 4000);
        }

        // 播放候診提醒音效
        // 使用 Web Audio API 產生簡單的短促音效，避免載入外部音訊檔案。
        // 此函式在病人狀態變為候診中時被呼叫。
function playNotificationSound() {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        oscillator.type = 'sine';
        // 柔和的 440Hz 音頻
        oscillator.frequency.setValueAtTime(440, ctx.currentTime);
        // 初始音量較低
        gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        oscillator.start();
        // 緩慢降低音量，營造漸漸淡出的效果
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
        oscillator.stop(ctx.currentTime + 0.8);
    } catch (err) {
        console.error('播放提醒音效失敗:', err);
    }
}

/**
 * 生成唯一的病歷編號。
 * 使用當前日期時間和隨機數組成，格式如 MR20250101123045-1234。
 * @returns {string} 新的病歷編號
 */
function generateMedicalRecordNumber() {
    try {
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const datePart = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
        const randomPart = Math.floor(1000 + Math.random() * 9000);
        return `MR${datePart}-${randomPart}`;
    } catch (e) {
        // 萬一日期取得失敗，退回目前時間戳記為編號
        return `MR${Date.now()}`;
    }
}
        // 按鈕讀取狀態控制函數
        // 在按鈕上顯示一個半透明的旋轉小圈，以顯示正在讀取中。
        // 原始內容將儲存在 data-originalHtml 中，完成後可復原。
        function setButtonLoading(button, loadingText) {
            if (!button) return;
            // Save the original HTML so we can restore it later. Preserve the button's
            // text and any nested elements for restoration once loading is complete.
            if (!button.dataset.originalHtml) {
                button.dataset.originalHtml = button.innerHTML;
            }
            /*
             * Capture and store the button's current width and height the first time we set
             * loading. Without setting these explicitly, replacing the button's content with
             * only a small spinner element can cause the element to shrink, which in turn
             * shifts surrounding layout and alters the button's size. By explicitly setting
             * both dimensions, we ensure the button occupies the same space during loading.
             */
            if (!button.dataset.originalWidth || !button.dataset.originalHeight) {
                const computedWidth = button.offsetWidth;
                const computedHeight = button.offsetHeight;
                // Store and set width if it's a valid positive number
                if (computedWidth > 0) {
                    button.dataset.originalWidth = computedWidth + 'px';
                    button.style.width = button.dataset.originalWidth;
                }
                // Store and set height if it's a valid positive number
                if (computedHeight > 0) {
                    button.dataset.originalHeight = computedHeight + 'px';
                    button.style.height = button.dataset.originalHeight;
                }
            }
            // Always disable the button while loading to prevent further clicks
            button.disabled = true;
            /*
             * Only show a spinning indicator while loading. We intentionally do not display any
             * loading text here (including the value passed in via `loadingText`) to satisfy
             * the requirement of "只需顯示讀取圈" (only show the spinner). To avoid affecting
             * the button's intrinsic size, we've captured its original width and height above.
             */
            // To avoid layout shifts, we center the spinner by converting the button into a flex container.
            // Save existing layout-related styles so they can be restored later.
            if (!button.dataset.originalDisplay) {
                button.dataset.originalDisplay = button.style.display || '';
                button.dataset.originalAlignItems = button.style.alignItems || '';
                button.dataset.originalJustifyContent = button.style.justifyContent || '';
            }
            // Set up flexbox centering for the spinner
            button.style.display = 'flex';
            button.style.alignItems = 'center';
            button.style.justifyContent = 'center';
            // Replace the button's content with a spinner using Tailwind classes. Remove margin since
            // there's no text to align next to it.
            // 使用 border-current 讓讀取圓圈的顏色繼承按鈕字體顏色，使其在淺色背景上仍然可見
            button.innerHTML = `<div class="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-current opacity-50"></div>`;
        }

        // 清除按鈕讀取狀態，還原原始內容
        function clearButtonLoading(button) {
            if (!button) return;
            // Restore the original HTML content if we stored it
            if (button.dataset.originalHtml) {
                button.innerHTML = button.dataset.originalHtml;
                delete button.dataset.originalHtml;
            }
            // Restore the button's width if we stored it previously
            if (button.dataset.originalWidth) {
                // Clear the inline width style so the button can size itself based on its content again
                button.style.width = '';
                delete button.dataset.originalWidth;
            }
            // Restore the button's height if we stored it previously
            if (button.dataset.originalHeight) {
                // Clear the inline height style so the button can size itself based on its content again
                button.style.height = '';
                delete button.dataset.originalHeight;
            }
            // Restore display and alignment properties if they were modified
            if (button.dataset.originalDisplay !== undefined) {
                button.style.display = button.dataset.originalDisplay;
                delete button.dataset.originalDisplay;
            }
            if (button.dataset.originalAlignItems !== undefined) {
                button.style.alignItems = button.dataset.originalAlignItems;
                delete button.dataset.originalAlignItems;
            }
            if (button.dataset.originalJustifyContent !== undefined) {
                button.style.justifyContent = button.dataset.originalJustifyContent;
                delete button.dataset.originalJustifyContent;
            }
            // Re-enable the button
            button.disabled = false;
        }

        /**
         * 從事件或備援選擇器取得觸發按鈕的通用函式。
         *
         * 多個操作函式需要先獲取當前點擊的按鈕以套用讀取狀態，
         * 但並非所有函式都直接接收 event 參數。因此，這個輔助函式
         * 會優先檢查全域的 event 物件，若其中存在 currentTarget
         * 則視為當前觸發的按鈕；否則將使用備援選擇器查找。
         *
         * @param {string} fallbackSelector CSS 選擇器，用於查找按鈕
         * @returns {HTMLElement|null} 對應的按鈕元素或 null
         */
        function getLoadingButtonFromEvent(fallbackSelector) {
            let btn = null;
            try {
                if (typeof event !== 'undefined' && event && event.currentTarget) {
                    btn = event.currentTarget;
                }
            } catch (_e) {
                // 若 event 物件無法存取則忽略
            }
            if (!btn) {
                try {
                    btn = document.querySelector(fallbackSelector);
                } catch (_e) {
                    btn = null;
                }
            }
            return btn;
        }

        // 計算年齡函數
        function calculateAge(birthDate) {
            const birth = new Date(birthDate);
            const today = new Date();
            let age = today.getFullYear() - birth.getFullYear();
            const monthDiff = today.getMonth() - birth.getMonth();
            
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
                age--;
            }
            
            return age;
        }
        
        // 格式化年齡顯示
        function formatAge(birthDate) {
            if (!birthDate) return '未知';
            
            const birth = new Date(birthDate);
            const today = new Date();
            
            let years = today.getFullYear() - birth.getFullYear();
            const monthDiff = today.getMonth() - birth.getMonth();
            
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
                years--;
            }
            
            if (years > 0) {
                return `${years}歲`;
            } else {
                // 未滿一歲的嬰幼兒顯示月數
                let months = today.getMonth() - birth.getMonth();
                let days = today.getDate() - birth.getDate();
                
                if (days < 0) {
                    months--;
                    const lastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
                    days += lastMonth.getDate();
                }
                
                if (months < 0) {
                    months += 12;
                }
                
                if (months > 0) {
                    return `${months}個月`;
                } else {
                    return `${days}天`;
                }
            }
        }
        
        // 移除原先依賴全域 patients 陣列產生病人編號的函式，以避免使用未同步的本地資料。
        // 目前系統僅透過 generatePatientNumberFromFirebase 取得新編號。


        // 初始化中藥庫資料
        let herbLibrary = [];
        /**
         * 從 Firestore 讀取中藥庫資料，若資料不存在則自動使用預設值初始化。
         * 此函式會等待 Firebase 初始化完成後再執行。
         */
        async function initHerbLibrary() {
            // 等待 Firebase 及其資料庫初始化
            await waitForFirebaseDb();
            try {
                // 從 Firestore 取得 herbLibrary 集合資料
                const querySnapshot = await window.firebase.getDocs(
                    window.firebase.collection(window.firebase.db, 'herbLibrary')
                );
                const herbsFromFirestore = [];
                querySnapshot.forEach((docSnap) => {
                    // docSnap.data() 已包含 id 屬性，因此直接展開
                    herbsFromFirestore.push({ ...docSnap.data() });
                });
                if (herbsFromFirestore.length === 0) {
                    // Firestore 中沒有資料時，不自動載入預設資料，保持空陣列
                    herbLibrary = [];
                } else {
                    herbLibrary = herbsFromFirestore;
                }
            } catch (error) {
                console.error('讀取/初始化中藥庫資料失敗:', error);
            }
        }

        // 預設收費項目資料（目前未使用，但保留以備日後擴充）
        // 移除未使用的預設收費項目陣列以減少程式碼冗餘

        // 初始化收費項目資料
        let billingItems = [];
        /**
         * 從 Firestore 讀取收費項目資料，若資料不存在則使用預設資料初始化。
         * 此函式會等待 Firebase 初始化完成後再執行。
         */
        async function initBillingItems() {
            // 等待 Firebase 及其資料庫初始化
            await waitForFirebaseDb();
            try {
                // 從 Firestore 取得 billingItems 集合資料
                const querySnapshot = await window.firebase.getDocs(
                    window.firebase.collection(window.firebase.db, 'billingItems')
                );
                const itemsFromFirestore = [];
                querySnapshot.forEach((docSnap) => {
                    itemsFromFirestore.push({ ...docSnap.data() });
                });
                if (itemsFromFirestore.length === 0) {
                    // Firestore 中沒有資料時，不自動載入預設資料，保持空陣列
                    billingItems = [];
                } else {
                    billingItems = itemsFromFirestore;
                }
            } catch (error) {
                console.error('讀取/初始化收費項目資料失敗:', error);
            }
        }

        // 初始化模板庫資料
        /**
         * 從 Firestore 讀取模板庫資料，包含醫囑模板與診斷模板。
         * 若資料存在於 Firestore，則取代本地目前的模板列表；否則保留現有資料。
         * 此函式會等待 Firebase 初始化完成後再執行，並在讀取後重新渲染模板列表。
         */
        async function initTemplateLibrary() {
            // 等待 Firebase 及其資料庫初始化
            await waitForFirebaseDb();
            try {
                // 從 Firestore 讀取醫囑模板
                const presSnapshot = await window.firebase.getDocs(
                    window.firebase.collection(window.firebase.db, 'prescriptionTemplates')
                );
                const presFromFirestore = [];
                presSnapshot.forEach(docSnap => {
                    presFromFirestore.push({ ...docSnap.data() });
                });
                if (presFromFirestore.length > 0) {
                    prescriptionTemplates = presFromFirestore;
                }

                // 從 Firestore 讀取診斷模板
                const diagSnapshot = await window.firebase.getDocs(
                    window.firebase.collection(window.firebase.db, 'diagnosisTemplates')
                );
                const diagFromFirestore = [];
                diagSnapshot.forEach(docSnap => {
                    diagFromFirestore.push({ ...docSnap.data() });
                });
                if (diagFromFirestore.length > 0) {
                    diagnosisTemplates = diagFromFirestore;
                }
            } catch (error) {
                console.error('讀取/初始化模板庫資料失敗:', error);
            }
            // 渲染模板內容
            try {
                if (typeof renderPrescriptionTemplates === 'function') {
                    renderPrescriptionTemplates();
                }
                if (typeof renderDiagnosisTemplates === 'function') {
                    renderDiagnosisTemplates();
                }
                // 在初次初始化模板庫後刷新分類篩選下拉選單，
                // 以確保「診斷模板」與「醫囑模板」篩選器顯示最新的分類
                if (typeof refreshTemplateCategoryFilters === 'function') {
                    try {
                        refreshTemplateCategoryFilters();
                    } catch (_e) {}
                }
            } catch (err) {
                console.error('渲染模板庫內容失敗:', err);
            }
        }

        // 預設用戶資料（目前未使用，但保留以備日後擴充）
        // 移除未使用的預設用戶陣列以減少程式碼冗餘

        // 初始化用戶資料：不使用本地預設，用空陣列代替，待由 Firebase 載入
        let users = [];

// 通用等待 Firebase 初始化的輔助函式
// 避免在程式各處反覆使用 while (!window.firebase) 或 while (!window.firebase.db)
async function waitForFirebase() {
  while (!window.firebase) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

async function waitForFirebaseDb() {
  await waitForFirebase();
  while (!window.firebase.db) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

// 等待 FirebaseDataManager 初始化的輔助函式
// 某些函式需要等待 DataManager isReady 再繼續
async function waitForFirebaseDataManager() {
  // 先確保 Firebase 本身已初始化，以避免數據管理器永遠無法就緒
  await waitForFirebase();
  while (!window.firebaseDataManager || !window.firebaseDataManager.isReady) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

    

// 主要登入功能
async function attemptMainLogin() {
    const email = document.getElementById('mainLoginUsername').value.trim();
    const password = document.getElementById('mainLoginPassword').value.trim();
    
    if (!email || !password) {
        showToast('請輸入電子郵件和密碼！', 'error');
        return;
    }

    // 顯示載入狀態：在按鈕中顯示旋轉小圈並禁用按鈕
    // 由於不再使用 inline onclick 屬性，透過 id 取得登入按鈕
    const loginButton = document.getElementById('loginButton');
    if (loginButton) {
        setButtonLoading(loginButton, '登入中...');
    }

    try {
        // 等待 Firebase 初始化
        await waitForFirebase();

        // 等待 Firebase 初始化後檢查連線狀態，若未連線則顯示錯誤並中止
        if (window.firebaseConnected === false) {
            showToast('無法連接到伺服器，請稍後再試', 'error');
            return;
        }

        // 使用 Firebase 登入
        const userCredential = await window.firebase.signInWithEmailAndPassword(
            window.firebase.auth,
            email,
            password
        );

        console.log('Firebase 登入成功:', userCredential.user.email);

        // 取得 Firebase 使用者資訊
        const firebaseUser = userCredential.user;
        const uid = firebaseUser.uid;

        // 同步載入 Firebase 用戶數據
        await syncUserDataFromFirebase();

        // 在用戶資料中尋找對應的 UID 或電子郵件
        let matchingUser = users.find(u => u.uid && u.uid === uid);
        if (!matchingUser) {
            // 若未設定 uid，改用 email 比對（不區分大小寫）
            matchingUser = users.find(u => u.email && u.email.toLowerCase() === firebaseUser.email.toLowerCase());
            if (matchingUser) {
                // 將 Firebase UID 設定到用戶資料中，以便下次可直接透過 UID 比對
                matchingUser.uid = uid;
                
                // 更新到 Firebase
                try {
                    await window.firebaseDataManager.updateUser(matchingUser.id, { uid: uid });
                } catch (error) {
                    console.error('更新用戶 UID 失敗:', error);
                }
                
                // 更新本地存儲
                localStorage.setItem('users', JSON.stringify(users));
            }
        }

        if (matchingUser) {
            // 找到對應用戶，檢查是否啟用
            if (!matchingUser.active) {
                showToast('您的帳號已被停用，請聯繫管理員', 'error');
                await window.firebase.signOut(window.firebase.auth);
                return;
            }

            // 更新最後登入時間
            matchingUser.lastLogin = new Date().toISOString();
            try {
                await window.firebaseDataManager.updateUser(matchingUser.id, { 
                    lastLogin: new Date() 
                });
            } catch (error) {
                console.error('更新最後登入時間失敗:', error);
            }
            
            // 使用用戶資料進行登入
            currentUserData = matchingUser;
            currentUser = matchingUser.username;
        } else {
            // 若找不到對應用戶，表示尚未授權，不允許以臨時帳號登入
            showToast('此帳號尚未被授權，請聯繫系統管理員', 'error');
            // 登出 Firebase 使用者，避免逕自進入系統
            try {
                await window.firebase.signOut(window.firebase.auth);
            } catch (e) {
                console.error('登出 Firebase 失敗:', e);
            }
            return;
        }

        // 在登入主系統前並行載入中藥庫資料、收費項目、分類資料與模板資料
        // 透過 Promise.all 同時執行多個初始化函式，提升效率
        try {
            const initTasks = [];
            if (typeof initHerbLibrary === 'function') {
                initTasks.push(initHerbLibrary());
            }
            if (typeof initBillingItems === 'function') {
                initTasks.push(initBillingItems());
            }
            if (typeof initCategoryData === 'function') {
                initTasks.push((async () => {
                    try {
                        await initCategoryData();
                    } catch (err) {
                        console.error('初始化分類資料失敗:', err);
                    }
                })());
            }
            if (typeof initTemplateLibrary === 'function') {
                initTasks.push((async () => {
                    try {
                        await initTemplateLibrary();
                    } catch (err) {
                        console.error('初始化模板庫資料失敗:', err);
                    }
                })());
            }
            if (initTasks.length > 0) {
                await Promise.all(initTasks);
            }
        } catch (error) {
            console.error('初始化中藥庫或收費項目資料失敗:', error);
        }

        // 登入成功，切換到主系統
        performLogin(currentUserData);
        // 登入後初始化系統資料（載入掛號、診療記錄、患者等）
        await initializeSystemAfterLogin();

        // 在使用者已登入的情況下清除過期的問診資料。
        // 這樣可確保僅在具備適當權限時執行刪除動作，
        // 避免未授權狀態下觸發 Firebase 的權限錯誤。
        try {
            if (window.firebaseDataManager && typeof window.firebaseDataManager.clearOldInquiries === 'function') {
                await window.firebaseDataManager.clearOldInquiries();
            }
        } catch (err) {
            console.error('登入後清理問診資料失敗:', err);
        }

        showToast('登入成功！', 'success');

    } catch (error) {
        console.error('登入失敗:', error);
        let errorMessage = '登入失敗';
        
        if (error.code === 'auth/user-not-found') {
            errorMessage = '電子郵件不存在';
        } else if (error.code === 'auth/wrong-password') {
            errorMessage = '密碼錯誤';
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = '電子郵件格式不正確';
        }
        
        showToast(errorMessage, 'error');
        document.getElementById('mainLoginPassword').value = '';
    } finally {
        // 恢復按鈕狀態與內容
        clearButtonLoading(loginButton);
    }
}

// 同步 Firebase 用戶數據到本地
async function syncUserDataFromFirebase() {
    try {
        if (!window.firebaseDataManager || !window.firebaseDataManager.isReady) {
            console.log('Firebase 數據管理器尚未準備就緒，跳過同步');
            return;
        }

        const result = await window.firebaseDataManager.getUsers();
        if (result.success && result.data.length > 0) {
            // 更新本地 users 變數
            // 只同步必要欄位，不包含 personalSettings，以避免將其他用戶的個人設置保存到本地
            users = result.data.map(user => {
                // 排除個人設定欄位
                const { personalSettings, ...rest } = user || {};
                return {
                    ...rest,
                    // 確保數據格式兼容性
                    createdAt: user.createdAt
                      ? (user.createdAt.seconds
                        ? new Date(user.createdAt.seconds * 1000).toISOString()
                        : user.createdAt)
                      : new Date().toISOString(),
                    updatedAt: user.updatedAt
                      ? (user.updatedAt.seconds
                        ? new Date(user.updatedAt.seconds * 1000).toISOString()
                        : user.updatedAt)
                      : new Date().toISOString(),
                    lastLogin: user.lastLogin
                      ? (user.lastLogin.seconds
                        ? new Date(user.lastLogin.seconds * 1000).toISOString()
                        : user.lastLogin)
                      : null
                };
            });
            
            // 保存到本地存儲作為備用
            localStorage.setItem('users', JSON.stringify(users));
            console.log('已同步 Firebase 用戶數據到本地:', users.length, '筆');
        } else {
            console.log('Firebase 用戶數據為空或讀取失敗，使用本地數據');
        }
    } catch (error) {
        console.error('同步 Firebase 用戶數據失敗:', error);
    }
}

// 已移除 getUserNameFromEmail 與 getUserPositionFromEmail 函式（未使用）
        
        // 執行登入
        function performLogin(user) {
            // 更新最後登入時間
            const userIndex = users.findIndex(u => u.id === user.id);
            if (userIndex !== -1) {
                users[userIndex].lastLogin = new Date().toISOString();
                localStorage.setItem('users', JSON.stringify(users));
            }
            
            currentUser = user.username;
            currentUserData = user;
            
            // 切換到主系統
            document.getElementById('loginPage').classList.add('hidden');
            document.getElementById('mainSystem').classList.remove('hidden');
            // 切換版權顯示：登入頁版權隱藏，顯示全局版權
            if (typeof showGlobalCopyright === 'function') {
                try {
                    showGlobalCopyright();
                } catch (_e) {
                    // 若發生錯誤則忽略
                }
            }
            
            document.getElementById('userRole').textContent = `當前用戶：${getUserDisplayName(user)}`;
            document.getElementById('sidebarUserRole').textContent = `當前用戶：${getUserDisplayName(user)}`;
            
            generateSidebarMenu();
            // After generating the sidebar, load the personal settings for this user.
            // We call this asynchronously and do not block the login flow. Any errors will be logged to the console.
            if (typeof loadPersonalSettings === 'function') {
                loadPersonalSettings().catch((err) => {
                    console.error('載入個人設置時發生錯誤:', err);
                });
            }
            // 統計資訊將在登入後初始化系統時更新

            showToast(`歡迎回來，${getUserDisplayName(user)}！`, 'success');
        }

        // 側邊選單控制
        function toggleSidebar() {
            const sidebar = document.getElementById('sidebar');
            const overlay = document.getElementById('sidebarOverlay');
            
            if (sidebar.classList.contains('-translate-x-full')) {
                sidebar.classList.remove('-translate-x-full');
                overlay.classList.remove('hidden');
            } else {
                sidebar.classList.add('-translate-x-full');
                overlay.classList.add('hidden');
            }
        }

        // 登出功能
async function logout() {
    try {
        // Firebase 登出
        if (window.firebase && window.firebase.auth) {
            await window.firebase.signOut(window.firebase.auth);
        }
        
        // 清理本地數據
        currentUser = null;
        currentUserData = null;
        
        // 切換頁面
        document.getElementById('loginPage').classList.remove('hidden');
        document.getElementById('mainSystem').classList.add('hidden');
        // 切換版權顯示：顯示登入頁版權，隱藏全局版權
        if (typeof hideGlobalCopyright === 'function') {
            try {
                hideGlobalCopyright();
            } catch (_e) {
                // 若發生錯誤則忽略
            }
        }
        document.getElementById('sidebar').classList.add('-translate-x-full');
        document.getElementById('sidebarOverlay').classList.add('hidden');
        hideAllSections();

        // 登出時若有開啟診症相關面板，將其關閉
        try {
            // 若有診症表單正在顯示，呼叫關閉函式或直接隱藏
            if (typeof closeConsultationForm === 'function') {
                closeConsultationForm();
            } else if (document.getElementById('consultationForm')) {
                document.getElementById('consultationForm').classList.add('hidden');
            }

            // 若有診症記錄查看彈窗正在顯示，呼叫關閉函式或直接隱藏
            if (typeof closeMedicalHistoryModal === 'function') {
                closeMedicalHistoryModal();
            } else if (document.getElementById('medicalHistoryModal')) {
                document.getElementById('medicalHistoryModal').classList.add('hidden');
            }

            // 若有病人病歷查看彈窗正在顯示，呼叫關閉函式或直接隱藏
            if (typeof closePatientMedicalHistoryModal === 'function') {
                closePatientMedicalHistoryModal();
            } else if (document.getElementById('patientMedicalHistoryModal')) {
                document.getElementById('patientMedicalHistoryModal').classList.add('hidden');
            }
        } catch (e) {
            console.warn('登出時關閉診症相關面板時發生錯誤:', e);
        }

        // 清空登入表單
        document.getElementById('mainLoginUsername').value = '';
        document.getElementById('mainLoginPassword').value = '';
        
        showToast('已成功登出', 'success');
        
    } catch (error) {
        console.error('登出錯誤:', error);
        showToast('登出時發生錯誤', 'error');
    }
}

        // 生成側邊選單
        function generateSidebarMenu() {
            const menuContainer = document.getElementById('sidebarMenu');
            menuContainer.innerHTML = '';

            // 定義各個功能的標題、圖示及說明
            const menuItems = {
                patientManagement: { title: '病人資料管理', icon: '👥', description: '新增、查看、管理病人資料' },
                consultationSystem: { title: '診症系統', icon: '🩺', description: '記錄症狀、診斷、開立處方' },
                herbLibrary: { title: '中藥庫管理', icon: '🌿', description: '管理中藥材及方劑資料' },
                billingManagement: { title: '收費項目管理', icon: '💰', description: '管理診療費用及收費項目' },
                // 將診所用戶管理的圖示更新為單人符號，以符合交換後的配置
                userManagement: { title: '診所用戶管理', icon: '👤', description: '管理診所用戶權限' },
                financialReports: { title: '財務報表', icon: '📊', description: '收入分析與財務統計' },
                systemManagement: { title: '系統管理', icon: '⚙️', description: '統計資料、備份匯出' },
                // 新增：個人設置（使用扳手符號作為圖示）
                personalSettings: { title: '個人設置', icon: '🔧', description: '管理慣用藥方及穴位組合' },
                // 新增：模板庫管理
                templateLibrary: { title: '模板庫管理', icon: '📚', description: '管理醫囑與診斷模板' }
            };

            // 根據當前用戶職位決定可使用的功能列表
            const userPosition = (currentUserData && currentUserData.position) || '';
            const permissions = ROLE_PERMISSIONS[userPosition] || [];

            // 依序建立側邊選單按鈕
            permissions.forEach(permission => {
                const item = menuItems[permission];
                if (!item) return;
                const button = document.createElement('button');
                // 移除預設 margin-bottom，改由外層容器控制間距，使選單項目更加整齊
                button.className = 'w-full text-left p-4 rounded-lg hover:bg-gray-100 transition duration-200 border border-gray-200';
                button.innerHTML = `
                    <div class="flex items-center">
                        <span class="text-2xl mr-4">${item.icon}</span>
                        <div>
                            <div class="font-semibold text-gray-800">${item.title}</div>
                            <div class="text-sm text-gray-600">${item.description}</div>
                        </div>
                    </div>
                `;
                button.onclick = () => {
                    showSection(permission);
                    toggleSidebar();
                };
                menuContainer.appendChild(button);
            });
        }

        /**
         * 判斷當前用戶是否具備指定的角色權限。
         *
         * 在多處需要檢查用戶角色是否符合存取資格，故抽出此函式簡化條件判斷。
         *
         * @param {string[]} allowedRoles 允許存取的職位陣列
         * @returns {boolean} 若當前用戶存在且職位在允許名單中則回傳 true
         */
// 已移除 hasPermission 函式（未使用）

        // 顯示指定區域
        function showSection(sectionId) {
            // 統一權限檢查：若沒有權限則提示並返回
            if (!hasAccessToSection(sectionId)) {
                showToast('權限不足，您沒有存取此功能的權限', 'error');
                return;
            }
            hideAllSections();

            // 根據所選的區域決定是否顯示主要內容包裝區（contentWrapper）。
            // 當顯示個人設置或模板庫管理時，隱藏包裝區以避免產生額外的上方留白；
            // 其他區域則顯示包裝區，保持與原先版面一致。
            try {
                const wrapper = document.getElementById('contentWrapper');
                if (wrapper) {
                    if (sectionId === 'personalSettings' || sectionId === 'templateLibrary') {
                        wrapper.classList.add('hidden');
                    } else {
                        wrapper.classList.remove('hidden');
                    }
                }
            } catch (e) {
                console.error('切換區域時調整版面顯示失敗：', e);
            }
            // 隱藏歡迎頁
            document.getElementById('welcomePage').classList.add('hidden');
            // 顯示指定區域
            const sectionEl = document.getElementById(sectionId);
            if (sectionEl) sectionEl.classList.remove('hidden');
            // 根據 sectionId 載入相應功能
            if (sectionId === 'patientManagement') {
                loadPatientList();
            } else if (sectionId === 'consultationSystem') {
                loadConsultationSystem();
            } else if (sectionId === 'herbLibrary') {
                loadHerbLibrary();
            } else if (sectionId === 'billingManagement') {
                loadBillingManagement();
            } else if (sectionId === 'financialReports') {
                loadFinancialReports();
            } else if (sectionId === 'userManagement') {
                loadUserManagement();
            }
        }

        // 隱藏所有區域
        function hideAllSections() {
            // 隱藏所有區域，包括新增的個人設置與模板庫管理
            ['patientManagement', 'consultationSystem', 'herbLibrary', 'billingManagement', 'userManagement', 'financialReports', 'systemManagement', 'personalSettings', 'templateLibrary', 'welcomePage'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.classList.add('hidden');
            });
        }

        // 病人管理功能
        let editingPatientId = null;
        let filteredPatients = [];
        
        // 更新病人年齡顯示
        function updatePatientAge() {
            const birthDate = document.getElementById('patientBirthDate').value;
            const ageInput = document.getElementById('patientAge');
            
            if (birthDate) {
                const age = calculateAge(birthDate);
                ageInput.value = age;
            } else {
                ageInput.value = '';
            }
        }

        function showAddPatientForm() {
            editingPatientId = null;
            document.getElementById('formTitle').textContent = '新增病人資料';
            document.getElementById('saveButtonText').textContent = '儲存';
            document.getElementById('addPatientModal').classList.remove('hidden');
            clearPatientForm();
        }

        function hideAddPatientForm() {
            document.getElementById('addPatientModal').classList.add('hidden');
            clearPatientForm();
            editingPatientId = null;
        }

        function clearPatientForm() {
            ['patientName', 'patientAge', 'patientGender', 'patientPhone', 'patientIdCard', 'patientBirthDate', 'patientAddress', 'patientAllergies', 'patientHistory'].forEach(id => {
                document.getElementById(id).value = '';
            });
        }

async function savePatient() {
    const patient = {
        name: document.getElementById('patientName').value.trim(),
        age: document.getElementById('patientAge').value,
        gender: document.getElementById('patientGender').value,
        phone: document.getElementById('patientPhone').value.trim(),
        idCard: document.getElementById('patientIdCard').value.trim(),
        birthDate: document.getElementById('patientBirthDate').value,
        address: document.getElementById('patientAddress').value.trim(),
        allergies: document.getElementById('patientAllergies').value.trim(),
        history: document.getElementById('patientHistory').value.trim()
    };

    // 驗證必填欄位：姓名、性別、電話、出生日期與身分證字號
    if (!patient.name || !patient.gender || !patient.phone || !patient.birthDate || !patient.idCard) {
        showToast('請填寫必要資料（姓名、性別、電話、出生日期、身分證字號）！', 'error');
        return;
    }

    // 驗證電話格式：僅允許數字，可接受 7~15 位
    const phonePattern = /^\d{7,15}$/;
    if (!phonePattern.test(patient.phone)) {
        showToast('電話格式不正確，請輸入 7-15 位數字！', 'error');
        return;
    }

    // 驗證出生日期
    const birthDate = new Date(patient.birthDate);
    const today = new Date();
    if (birthDate > today) {
        showToast('出生日期不能晚於今天！', 'error');
        return;
    }

    // 計算年齡
    const calculatedAge = calculateAge(patient.birthDate);
    if (calculatedAge > 120) {
        showToast('請確認出生日期是否正確！', 'error');
        return;
    }

    // 驗證電話格式
    const phoneRegex = /^[0-9\-\+\(\)\s]+$/;
    if (!phoneRegex.test(patient.phone)) {
        showToast('請輸入有效的電話號碼！', 'error');
        return;
    }

    // 不限制身分證字號格式，因此無需檢查格式

    // 顯示載入中狀態：根據是新增或更新顯示不同文字
    const saveButton = document.querySelector('[onclick="savePatient()"]');
    if (saveButton) {
        // 若正在編輯，顯示「更新中...」，否則顯示「儲存中...」
        const loadingText = (typeof editingPatientId !== 'undefined' && editingPatientId) ? '更新中...' : '儲存中...';
        setButtonLoading(saveButton, loadingText);
    }

    try {
        if (editingPatientId) {
            // 更新現有病人
            const result = await window.firebaseDataManager.updatePatient(editingPatientId, patient);
            if (result.success) {
                showToast('病人資料已成功更新！', 'success');
            } else {
                showToast('更新失敗，請稍後再試', 'error');
                return;
            }
        } else {
            // 新增病人
            // 生成病人編號
            patient.patientNumber = await generatePatientNumberFromFirebase();
            
            const result = await window.firebaseDataManager.addPatient(patient);
            if (result.success) {
                showToast('病人資料已成功新增！', 'success');
            } else {
                showToast('新增失敗，請稍後再試', 'error');
                return;
            }
        }

        // 更新快取資料，下一次讀取時重新載入
        patientCache = null;

        // 重新載入病人列表
        await loadPatientListFromFirebase();
        hideAddPatientForm();
        updateStatistics();

    } catch (error) {
        console.error('保存病人資料錯誤:', error);
        showToast('保存時發生錯誤，請稍後再試', 'error');
    } finally {
        // 還原按鈕狀態與內容
        if (saveButton) {
            clearButtonLoading(saveButton);
        }
    }

    } // end of savePatient function

        // 從 Firebase 生成病人編號
async function generatePatientNumberFromFirebase() {
    try {
        const result = await window.firebaseDataManager.getPatients();
        if (!result.success) {
            return 'P000001'; // 如果無法讀取，使用預設編號
        }

        const existingNumbers = result.data
            .map(p => p.patientNumber)
            .filter(num => num && num.startsWith('P'))
            .map(num => parseInt(num.substring(1)))
            .filter(num => !isNaN(num));

        const maxNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0;
        const newNumber = maxNumber + 1;
        return `P${newNumber.toString().padStart(6, '0')}`;
    } catch (error) {
        console.error('生成病人編號失敗:', error);
        return `P${Date.now().toString().slice(-6)}`; // 備用方案
    }
}

// 從 Firebase 載入病人列表
async function loadPatientListFromFirebase() {
    const tbody = document.getElementById('patientList');
    const searchTerm = document.getElementById('searchPatient').value.toLowerCase();
    
    try {
        // 顯示載入中
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="px-4 py-8 text-center text-gray-500">
                    <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                    <div class="mt-2">載入中...</div>
                </td>
            </tr>
        `;

        // 從快取或 Firebase 取得病人資料
        const allPatients = await fetchPatients();
        // 無法取得資料時顯示提示
        if (!allPatients || allPatients.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="px-4 py-8 text-center text-gray-500">
                        ${searchTerm ? '沒有找到符合條件的病人' : '尚無病人資料'}
                    </td>
                </tr>
            `;
            return;
        }

        // 過濾病人資料
        const filteredPatients = allPatients.filter(patient => 
            (patient.name && patient.name.toLowerCase().includes(searchTerm)) ||
            (patient.phone && patient.phone.includes(searchTerm)) ||
            (patient.idCard && patient.idCard.toLowerCase().includes(searchTerm)) ||
            (patient.patientNumber && patient.patientNumber.toLowerCase().includes(searchTerm))
        );

        tbody.innerHTML = '';

        if (filteredPatients.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="px-4 py-8 text-center text-gray-500">
                        ${searchTerm ? '沒有找到符合條件的病人' : '尚無病人資料'}
                    </td>
                </tr>
            `;
            return;
        }

        filteredPatients.forEach(patient => {
            const row = document.createElement('tr');
            row.className = 'hover:bg-gray-50';
            // 轉義顯示的值，避免 XSS
            const safeNumber = window.escapeHtml(patient.patientNumber || '未設定');
            const safeName = window.escapeHtml(patient.name);
            const safeAge = window.escapeHtml(formatAge(patient.birthDate));
            const safeGender = window.escapeHtml(patient.gender);
            const safePhone = window.escapeHtml(patient.phone);
            // 建立病人資料列表行，新增「查看病歷」按鈕觸發病歷查看彈窗
            row.innerHTML = `
                <td class="px-4 py-3 text-sm text-blue-600 font-medium">${safeNumber}</td>
                <td class="px-4 py-3 text-sm text-gray-900 font-medium">${safeName}</td>
                <td class="px-4 py-3 text-sm text-gray-900">${safeAge}</td>
                <td class="px-4 py-3 text-sm text-gray-900">${safeGender}</td>
                <td class="px-4 py-3 text-sm text-gray-900">${safePhone}</td>
                <td class="px-4 py-3 text-sm space-x-2">
                    <button onclick="viewPatient('${patient.id}')" class="text-blue-600 hover:text-blue-800">查看</button>
                    <!-- 新增查看病歷功能 -->
                    <button onclick="showPatientMedicalHistory('${patient.id}')" class="text-purple-600 hover:text-purple-800">病歷</button>
                    <button onclick="editPatient('${patient.id}')" class="text-green-600 hover:text-green-800">編輯</button>
                    <button onclick="deletePatient('${patient.id}')" class="text-red-600 hover:text-red-800">刪除</button>
                </td>
            `;
            tbody.appendChild(row);
        });

        console.log('已載入', filteredPatients.length, '筆病人資料');

    } catch (error) {
        console.error('載入病人列表錯誤:', error);
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="px-4 py-8 text-center text-gray-500">
                    載入失敗，請檢查網路連接
                </td>
            </tr>
        `;
    }
}

function loadPatientList() {
    loadPatientListFromFirebase();
}


        
async function editPatient(id) {
    try {
        // 從快取或 Firebase 取得病人資料
        const allPatients = await fetchPatients();
        if (!allPatients || allPatients.length === 0) {
            showToast('無法讀取病人資料', 'error');
            return;
        }

        const patient = allPatients.find(p => p.id === id);
        if (!patient) {
            showToast('找不到病人資料', 'error');
            return;
        }

        editingPatientId = id;
        document.getElementById('formTitle').textContent = '編輯病人資料';
        document.getElementById('saveButtonText').textContent = '更新';
        
        // 填入現有資料
        document.getElementById('patientName').value = patient.name || '';
        document.getElementById('patientGender').value = patient.gender || '';
        document.getElementById('patientPhone').value = patient.phone || '';
        document.getElementById('patientIdCard').value = patient.idCard || '';
        document.getElementById('patientBirthDate').value = patient.birthDate || '';
        document.getElementById('patientAddress').value = patient.address || '';
        document.getElementById('patientAllergies').value = patient.allergies || '';
        document.getElementById('patientHistory').value = patient.history || '';
        
        // 自動計算年齡
        updatePatientAge();
        
        document.getElementById('addPatientModal').classList.remove('hidden');

    } catch (error) {
        console.error('編輯病人資料錯誤:', error);
        showToast('讀取病人資料失敗', 'error');
    }
}
async function deletePatient(id) {
    try {
        // 從快取或 Firebase 取得病人資料
        const allPatients = await fetchPatients();
        if (!allPatients || allPatients.length === 0) {
            showToast('無法讀取病人資料', 'error');
            return;
        }

        const patient = allPatients.find(p => p.id === id);
        if (!patient) {
            showToast('找不到病人資料', 'error');
            return;
        }

        const confirmMessage = `確定要刪除病人「${patient.name}」的資料嗎？\n\n注意：相關的診症記錄也會一併刪除！`;
        
        if (confirm(confirmMessage)) {
            // 顯示刪除中狀態
            showToast('刪除中...', 'info');

            // 從 Firebase 刪除病人資料
            const deleteResult = await window.firebaseDataManager.deletePatient(id);
            
            if (deleteResult.success) {
                showToast('病人資料已刪除！', 'success');
                // 清除快取，下次讀取時重新從資料庫載入
                patientCache = null;
                // 重新載入病人列表
                await loadPatientListFromFirebase();
                updateStatistics();
            } else {
                showToast('刪除失敗，請稍後再試', 'error');
            }
        }

    } catch (error) {
        console.error('刪除病人資料錯誤:', error);
        showToast('刪除時發生錯誤', 'error');
    }
}

async function viewPatient(id) {
    try {
        // 從快取或 Firebase 取得病人資料
        const allPatients = await fetchPatients();
        if (!allPatients || allPatients.length === 0) {
            showToast('無法讀取病人資料', 'error');
            return;
        }
        const patient = allPatients.find(p => p.id === id);
        if (!patient) {
            showToast('找不到病人資料', 'error');
            return;
        }

        // 顯示病人詳細資料
        let content = `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div class="space-y-4">
                    <h4 class="text-lg font-semibold text-gray-800 border-b pb-2">基本資料</h4>
                    <div class="space-y-2">
                        <div><span class="font-medium">病人編號：</span><span class="text-blue-600 font-semibold">${patient.patientNumber || '未設定'}</span></div>
                        <div><span class="font-medium">姓名：</span>${patient.name}</div>
                        <div><span class="font-medium">年齡：</span>${formatAge(patient.birthDate)}</div>
                        <div><span class="font-medium">性別：</span>${patient.gender}</div>
                        <div><span class="font-medium">電話：</span>${patient.phone}</div>
                        ${patient.idCard ? `<div><span class="font-medium">身分證：</span>${patient.idCard}</div>` : ''}
                        ${patient.birthDate ? `<div><span class="font-medium">出生日期：</span>${new Date(patient.birthDate).toLocaleDateString('zh-TW')}</div>` : ''}
                        ${patient.address ? `<div><span class="font-medium">地址：</span>${patient.address}</div>` : ''}
                    </div>
                </div>
                
                <div class="space-y-4">
                    <h4 class="text-lg font-semibold text-gray-800 border-b pb-2">醫療資訊</h4>
                    <div class="space-y-2">
                        ${patient.history ? `<div><span class="font-medium">病史及備註：</span><div class="mt-1 p-2 bg-gray-50 rounded text-sm medical-field">${patient.history}</div></div>` : ''}
                        ${patient.allergies ? `<div><span class="font-medium">過敏史：</span><div class="mt-1 p-2 bg-red-50 rounded text-sm medical-field">${patient.allergies}</div></div>` : ''}
                        <div><span class="font-medium">建檔日期：</span>${patient.createdAt ? new Date(patient.createdAt.seconds * 1000).toLocaleDateString('zh-TW') : '未知'}</div>
                        ${patient.updatedAt ? `<div><span class="font-medium">更新日期：</span>${new Date(patient.updatedAt.seconds * 1000).toLocaleDateString('zh-TW')}</div>` : ''}
                    </div>
                </div>
            </div>
            
            <!-- 診症記錄摘要 -->
            <div class="mt-6 pt-6 border-t border-gray-200">
                <div class="flex justify-between items-center mb-4">
                    <h4 class="text-lg font-semibold text-gray-800">診症記錄摘要</h4>
                </div>
                
<div id="patientConsultationSummary">
    <div class="text-center py-4">
        <div class="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900"></div>
        <div class="mt-2 text-sm">載入診症記錄中...</div>
    </div>
</div>
            </div>
        `;

        // 為避免 XSS，建立替換後的 content
        {
            const safePatientNumber = window.escapeHtml(patient.patientNumber || '未設定');
            const safeName = window.escapeHtml(patient.name);
            const safeAge = window.escapeHtml(formatAge(patient.birthDate));
            const safeGender = window.escapeHtml(patient.gender);
            const safePhone = window.escapeHtml(patient.phone);
            const safeIdCard = patient.idCard ? window.escapeHtml(patient.idCard) : null;
            const safeAddress = patient.address ? window.escapeHtml(patient.address) : null;
            const safeHistory = patient.history ? window.escapeHtml(patient.history) : null;
            const safeAllergies = patient.allergies ? window.escapeHtml(patient.allergies) : null;
            const birthDateString = patient.birthDate ? new Date(patient.birthDate).toLocaleDateString('zh-TW') : '';
            const createdAtStr = patient.createdAt ? new Date(patient.createdAt.seconds * 1000).toLocaleDateString('zh-TW') : '未知';
            const updatedAtStr = patient.updatedAt ? new Date(patient.updatedAt.seconds * 1000).toLocaleDateString('zh-TW') : '';
            // 取得患者套票資料，用於顯示套票情況
            let packageStatusHtml = '';
            try {
                const pkgs = await getPatientPackages(patient.id);
                if (Array.isArray(pkgs) && pkgs.length > 0) {
                    // 將套票依有效與失效分類，並另外標示即將到期或剩餘次數少於等於 2 的有效套票
                    const now = new Date();
                    // 定義即將到期的閾值（7 天內）
                    const soonThreshold = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
                    const validPkgs = [];
                    const invalidPkgs = [];
                    pkgs.forEach(pkg => {
                        const expDate = new Date(pkg.expiresAt);
                        const expired = expDate < now || (typeof pkg.remainingUses === 'number' && pkg.remainingUses <= 0);
                        if (expired) {
                            invalidPkgs.push(pkg);
                        } else {
                            validPkgs.push(pkg);
                        }
                    });
                    const sortedValid = validPkgs.slice().sort((a, b) => new Date(a.expiresAt) - new Date(b.expiresAt));
                    const sortedInvalid = invalidPkgs.slice().sort((a, b) => new Date(a.expiresAt) - new Date(b.expiresAt));
                    packageStatusHtml = `
                <div class="mt-6 pt-6 border-t border-gray-200">
                    <div class="flex justify-between items-center mb-4">
                        <h4 class="text-lg font-semibold text-gray-800">套票情況</h4>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            ${sortedValid.length > 0 ? `<div class="font-medium text-gray-700 mb-2">有效套票</div>` : ''}
                            <div class="space-y-2">
                                ${sortedValid.map(pkg => {
                                    const safePkgName = window.escapeHtml(pkg.name || '');
                                    const statusText = formatPackageStatus(pkg);
                                    const safeStatusText = window.escapeHtml(statusText || '');
                                    const remainingUses = typeof pkg.remainingUses === 'number' ? pkg.remainingUses : '';
                                    const totalUses = typeof pkg.totalUses === 'number' ? pkg.totalUses : '';
                                    const expDate = new Date(pkg.expiresAt);
                                    const lowUses = typeof pkg.remainingUses === 'number' && pkg.remainingUses <= 2;
                                    // 判斷是否即將到期或剩餘次數少於等於 2
                                    const highlight = (expDate <= soonThreshold) || lowUses;
                                    const containerClasses = highlight ? 'bg-red-50 border border-red-200' : 'bg-purple-50 border border-purple-200';
                                    const nameClass = highlight ? 'text-red-700' : 'text-purple-900';
                                    const statusClass = highlight ? 'text-red-600' : 'text-gray-600';
                                    const usesClass = highlight ? 'text-red-700' : 'text-gray-800';
                                    return `
                                    <div class="flex items-center justify-between ${containerClasses} rounded p-2">
                                        <div>
                                            <div class="font-medium ${nameClass}">${safePkgName}</div>
                                            <div class="text-xs ${statusClass}">${safeStatusText}</div>
                                        </div>
                                        <div class="text-sm ${usesClass}">${remainingUses}${totalUses !== '' ? '/' + totalUses : ''}</div>
                                    </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                        <div>
                            ${sortedInvalid.length > 0 ? `<div class="font-medium text-gray-700 mb-2">失效套票</div>` : ''}
                            <div class="space-y-2">
                                ${sortedInvalid.map(pkg => {
                                    const safePkgName = window.escapeHtml(pkg.name || '');
                                    const statusText = formatPackageStatus(pkg);
                                    const safeStatusText = window.escapeHtml(statusText || '');
                                    const remainingUses = typeof pkg.remainingUses === 'number' ? pkg.remainingUses : '';
                                    const totalUses = typeof pkg.totalUses === 'number' ? pkg.totalUses : '';
                                    return `
                                    <div class="flex items-center justify-between bg-gray-50 border border-gray-200 rounded p-2">
                                        <div>
                                            <div class="font-medium text-gray-500">${safePkgName}</div>
                                            <div class="text-xs text-gray-400">${safeStatusText}</div>
                                        </div>
                                        <div class="text-sm text-gray-500">${remainingUses}${totalUses !== '' ? '/' + totalUses : ''}</div>
                                    </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    </div>
                </div>
                    `;
                } else {
                    // 未購買任何套票
                    packageStatusHtml = `
                <div class="mt-6 pt-6 border-t border-gray-200">
                    <div class="flex justify-between items-center mb-4">
                        <h4 class="text-lg font-semibold text-gray-800">套票情況</h4>
                    </div>
                    <div class="text-sm text-gray-500">尚未購買套票</div>
                </div>
                    `;
                }
            } catch (err) {
                packageStatusHtml = `
                <div class="mt-6 pt-6 border-t border-gray-200">
                    <div class="flex justify-between items-center mb-4">
                        <h4 class="text-lg font-semibold text-gray-800">套票情況</h4>
                    </div>
                    <div class="text-sm text-red-600">載入套票資料失敗</div>
                </div>
                `;
            }
            content = `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div class="space-y-4">
                    <h4 class="text-lg font-semibold text-gray-800 border-b pb-2">基本資料</h4>
                    <div class="space-y-2">
                        <div><span class="font-medium">病人編號：</span><span class="text-blue-600 font-semibold">${safePatientNumber}</span></div>
                        <div><span class="font-medium">姓名：</span>${safeName}</div>
                        <div><span class="font-medium">年齡：</span>${safeAge}</div>
                        <div><span class="font-medium">性別：</span>${safeGender}</div>
                        <div><span class="font-medium">電話：</span>${safePhone}</div>
                        ${safeIdCard ? `<div><span class="font-medium">身分證：</span>${safeIdCard}</div>` : ''}
                        ${birthDateString ? `<div><span class="font-medium">出生日期：</span>${birthDateString}</div>` : ''}
                        ${safeAddress ? `<div><span class="font-medium">地址：</span>${safeAddress}</div>` : ''}
                    </div>
                </div>
                
                <div class="space-y-4">
                    <h4 class="text-lg font-semibold text-gray-800 border-b pb-2">醫療資訊</h4>
                    <div class="space-y-2">
                        ${safeHistory ? `<div><span class="font-medium">病史及備註：</span><div class="mt-1 p-2 bg-gray-50 rounded text-sm medical-field">${safeHistory}</div></div>` : ''}
                        ${safeAllergies ? `<div><span class="font-medium">過敏史：</span><div class="mt-1 p-2 bg-red-50 rounded text-sm medical-field">${safeAllergies}</div></div>` : ''}
                        <div><span class="font-medium">建檔日期：</span>${createdAtStr}</div>
                        ${updatedAtStr ? `<div><span class="font-medium">更新日期：</span>${updatedAtStr}</div>` : ''}
                    </div>
                </div>
            </div>
            ${packageStatusHtml}
            `;
        }
        // 先將內容插入並顯示模態框
        const detailContainer = document.getElementById('patientDetailContent');
        if (detailContainer) {
            detailContainer.innerHTML = content;
        }
        const modalEl = document.getElementById('patientDetailModal');
        if (modalEl) {
            modalEl.classList.remove('hidden');
        }

        /**
         * 載入診症記錄摘要
         *
         * 注意：診症記錄摘要區塊是在上面插入的內容中動態生成的。
         * 必須確保 DOM 已經渲染完畢後再呼叫，否則會找不到容器導致錯誤。
         */
        loadPatientConsultationSummary(id);

    } catch (error) {
        console.error('查看病人資料錯誤:', error);
        showToast('讀取病人資料失敗', 'error');
    }
}

        function closePatientDetail() {
            document.getElementById('patientDetailModal').classList.add('hidden');
        }





        // 搜尋功能：已移至統一的 DOMContentLoaded 事件中處理，避免重複綁定。

        // 診症系統功能
        let selectedPatientForRegistration = null;
        let currentConsultingAppointmentId = null;
// 儲存從 Firebase 載入的問診資料選項。
// 鍵為問診紀錄 ID，值為完整紀錄內容，用於掛號與診症預填。
let inquiryOptionsData = {};

/**
 * 依據問診資料中的主症狀資訊產生摘要。
 * 用於在診症表單中預填主訴欄位。
 *
 * @param {Object} results 問診資料中的 data 欄位
 * @returns {string} 摘要文字
 */
function getMainSymptomFromResult(results) {
    if (!results) return '';
    // 將身體部位英文代碼轉換為中文名稱
    const bodyPartNames = {
        head: '頭部',
        neck: '頸部',
        chest: '胸部',
        abdomen: '腹部',
        back: '背部',
        arms: '手臂',
        legs: '腿部',
        joints: '關節',
        skin: '皮膚',
        internal: '內科症狀',
        gynecology: '婦科',
        andrology: '男科',
        other: '其他'
    };
    // 將詳細部位英文代碼轉換為中文名稱。
    // 這裡彙整各身體部位的對應值，避免預診資料產生英文代碼。
    const detailedLocationNames = {
        // 頭部
        forehead: '前額',
        temples: '太陽穴',
        top_head: '頭頂',
        back_head: '後腦勺',
        eyes: '眼部',
        nose: '鼻部',
        ears: '耳部',
        mouth: '口部',
        jaw: '下顎',
        whole_head: '整個頭部',
        // 頸部
        front_neck: '前頸',
        back_neck: '後頸',
        side_neck: '側頸',
        throat: '喉嚨',
        whole_neck: '整個頸部',
        // 胸部
        upper_chest: '上胸部',
        lower_chest: '下胸部',
        left_chest: '左胸',
        right_chest: '右胸',
        heart_area: '心臟部位',
        ribs: '肋骨',
        whole_chest: '整個胸部',
        // 腹部
        upper_abdomen: '上腹部',
        lower_abdomen: '下腹部',
        left_abdomen: '左腹部',
        right_abdomen: '右腹部',
        navel: '肚臍周圍',
        stomach: '胃部',
        liver_area: '肝區',
        whole_abdomen: '整個腹部',
        // 背部
        upper_back: '上背部',
        middle_back: '中背部',
        lower_back: '下背部/腰部',
        left_back: '左背',
        right_back: '右背',
        spine: '脊椎',
        shoulder_blade: '肩胛骨',
        whole_back: '整個背部',
        // 手臂
        shoulders: '肩膀',
        upper_arms: '上臂',
        elbows: '手肘',
        forearms: '前臂',
        wrists: '手腕',
        hands: '手掌',
        fingers: '手指',
        left_arm: '左手臂',
        right_arm: '右手臂',
        both_arms: '雙手臂',
        // 腿部
        hips: '臀部',
        thighs: '大腿',
        knees: '膝蓋',
        calves: '小腿',
        ankles: '腳踝',
        feet: '腳掌',
        toes: '腳趾',
        left_leg: '左腿',
        right_leg: '右腿',
        both_legs: '雙腿',
        // 關節
        shoulder_joint: '肩關節',
        elbow_joint: '肘關節',
        wrist_joint: '腕關節',
        hip_joint: '髖關節',
        knee_joint: '膝關節',
        ankle_joint: '踝關節',
        spine_joint: '脊椎關節',
        multiple_joints: '多個關節',
        // 皮膚
        face_skin: '面部皮膚',
        body_skin: '身體皮膚',
        hands_skin: '手部皮膚',
        feet_skin: '足部皮膚',
        scalp: '頭皮',
        widespread_skin: '全身皮膚',
        // 內科
        breathing: '呼吸系統',
        digestion: '消化系統',
        circulation: '循環系統',
        nervous: '神經系統',
        urinary: '泌尿系統',
        reproductive: '生殖系統',
        general_weakness: '全身無力',
        fever: '發熱',
        // 婦科
        menstrual_issues: '月經問題',
        vaginal_discharge: '白帶異常',
        pelvic_pain: '骨盆腔疼痛',
        breast_issues: '乳房問題',
        menopause_symptoms: '更年期症狀',
        fertility_issues: '生育相關',
        urinary_gyneco: '泌尿婦科',
        postpartum_issues: '產後問題',
        // 男科
        erectile_dysfunction: '勃起功能',
        prostate_issues: '前列腺問題',
        urinary_male: '泌尿問題',
        testicular_pain: '睪丸疼痛',
        fertility_male: '生育能力',
        hormonal_male: '荷爾蒙問題',
        sexual_function: '性功能障礙',
        genital_issues: '生殖器問題',
        // 其他
        multiple_areas: '多個部位',
        unclear_location: '位置不明確',
        whole_body: '全身',
        other_specify: '其他（請在補充描述中說明）'
    };
    // 先轉換身體部位名稱
    let symptom = bodyPartNames[results.bodyPart] || (results.bodyPart || '未指定部位');
    // 如果有詳細部位則轉換為中文
    if (results.detailedLocation) {
        const locKey = results.detailedLocation;
        const locName = detailedLocationNames[locKey] || results.detailedLocation;
        symptom += ' - ' + locName;
    }
    // 整理相關症狀，移除重複後取前三項
    let related = results.relatedSymptoms;
    if (related) {
        if (!Array.isArray(related)) {
            related = [related];
        }
        // 使用 Set 移除重複的症狀
        const uniqueRelated = Array.from(new Set(related));
        if (uniqueRelated.length > 0) {
            symptom += '：' + uniqueRelated.slice(0, 3).join('、');
        }
    }
    return symptom;
}

/**
 * 根據問診資料生成完整的主訴摘要。
 * 此摘要會包含主要症狀、補充描述及相關症狀，
 * 以便填入診症表單的主訴欄位。
 *
 * @param {Object} data 問診資料中的 data 欄位
 * @returns {string} 完整主訴摘要
 */
function generateSymptomSummaryFromInquiry(data) {
    if (!data) return '';
    // 首先使用內建函式生成主要症狀摘要
    let summary = getMainSymptomFromResult(data) || '';
    const parts = [];
    // 補充描述
    if (data.additionalSymptoms && typeof data.additionalSymptoms === 'string' && data.additionalSymptoms.trim()) {
        // 使用中文全形冒號，避免預診系統填入英文字元
        parts.push('補充描述：' + data.additionalSymptoms.trim());
    }
    // 相關症狀：避免與主要症狀重複顯示。若相關症狀超過三個，前三個已在主症狀摘要中呈現，剩餘項目於此顯示。
    if (data.relatedSymptoms) {
        let relatedList = [];
        if (Array.isArray(data.relatedSymptoms)) {
            relatedList = data.relatedSymptoms;
        } else if (typeof data.relatedSymptoms === 'string') {
            relatedList = [data.relatedSymptoms];
        }
        if (relatedList.length > 0) {
            // 移除重複值
            const uniqueRelated = Array.from(new Set(relatedList));
            // 取前三項已在主要症狀摘要呈現
            const remaining = uniqueRelated.slice(3);
            if (remaining.length > 0) {
                // 使用中文全形冒號，避免預診系統填入英文字元
                parts.push('相關症狀：' + remaining.join('、'));
            }
        }
    }
    if (parts.length > 0) {
        if (summary) {
            summary += '；' + parts.join('；');
        } else {
            summary = parts.join('；');
        }
    }
    return summary;
}

/**
 * 根據問診資料生成現病史摘要。
 * 將問診表中的其他條目整理成多行文字，每行包含欄位標籤與值。
 *
 * @param {Object} data 問診資料中的 data 欄位
 * @returns {string} 現病史摘要，用換行符號分隔各項
 */
function generateHistorySummaryFromInquiry(data) {
    if (!data) return '';
    const labels = {
        sweating: '汗出情況',
        '出汗部位': '出汗部位',
        temperature: '寒熱',
        coldHands: '手腳冰冷',
        appetite: '食慾',
        appetiteSymptoms: '胃口症狀',
        foodPreference: '食物偏好',
        drinkingPreference: '飲水偏好',
        drinkingHabits: '飲水習慣',
        urination: '小便症狀',
        nightUrination: '夜尿次數',
        dailyUrination: '日間小便次數',
        urineColor: '小便顏色',
        stoolForm: '大便形狀',
        stoolSymptoms: '大便症狀',
        stoolFrequency: '大便頻率',
        stoolOdor: '大便氣味',
        stoolColor: '大便顏色',
        sleep: '睡眠',
        energy: '精神狀態',
        morningEnergy: '晨起精神',
        concentration: '注意力',
        medicalHistory: '病史',
        detailedMedicalHistory: '詳細病史',
        currentMeds: '目前用藥',
        allergies: '過敏史',
        otherAllergies: '其他過敏'
    };
    const lines = [];
    Object.keys(labels).forEach(key => {
        const label = labels[key];
        const value = data[key];
        if (value === undefined || value === null) return;
        // Skip empty strings or arrays with no content
        if (Array.isArray(value)) {
            if (value.length === 0) return;
            const joined = value.join('、');
            if (joined.trim()) {
                lines.push(label + '：' + joined.trim());
            }
        } else {
            const valStr = String(value).trim();
            if (!valStr || valStr === '無') return;
            lines.push(label + '：' + valStr);
        }
    });
    return lines.join('\n');
}

/**
 * 從 Firebase 載入問診資料列表，並填充至掛號彈窗的下拉選單。
 * 不再限制必須與病人姓名匹配，將載入所有未過期的問診資料。
 * 每個選項會標示問診創建時間與病人姓名，方便辨識。
 *
 * @param {Object} patient 病人資料物件（可選，不使用時依然會載入所有資料）
 */
async function loadInquiryOptions(patient) {
    const select = document.getElementById('inquirySelect');
    if (!select) return;
    // 清空現有選項並加入預設選項
    select.innerHTML = '<option value="">不使用問診資料</option>';
    try {
        // 清除過期問診資料：僅當使用者已登入時才執行，以避免未授權錯誤
        const userLoggedIn = (window.firebase && window.firebase.auth && window.firebase.auth.currentUser) ||
                             (typeof currentUserData !== 'undefined' && currentUserData);
        if (userLoggedIn && window.firebaseDataManager && window.firebaseDataManager.clearOldInquiries) {
            await window.firebaseDataManager.clearOldInquiries();
        }
    } catch (err) {
        console.error('清除過期問診資料時發生錯誤:', err);
    }
    try {
        // 從 Firebase 取得問診資料；不傳入 patientName 以取得全部未過期的問診紀錄
        let result;
        try {
            result = await window.firebaseDataManager.getInquiryRecords('');
        } catch (e) {
            console.error('讀取全部問診資料失敗，嘗試使用病人名稱查詢:', e);
            const nameForSearch = patient && patient.name ? String(patient.name).trim() : '';
            result = await window.firebaseDataManager.getInquiryRecords(nameForSearch);
        }
        inquiryOptionsData = {};
        if (result && result.success && Array.isArray(result.data)) {
            result.data.forEach(rec => {
                // 取出問診記錄創建時間
                let createdAt = rec.createdAt;
                let dateStr = '';
                if (createdAt && createdAt.seconds !== undefined) {
                    const ts = new Date(createdAt.seconds * 1000);
                    dateStr = ts.toLocaleString('zh-TW', { hour12: false });
                } else if (createdAt) {
                    try {
                        dateStr = new Date(createdAt).toLocaleString('zh-TW', { hour12: false });
                    } catch (_e) {
                        dateStr = '';
                    }
                }
                const opt = document.createElement('option');
                opt.value = rec.id;
                // 加入病人姓名以便辨識
                const patientName = rec.patientName || '';
                if (dateStr) {
                    opt.textContent = `${dateStr} ${patientName} 問診資料`;
                } else {
                    opt.textContent = `${patientName} 問診資料 (${rec.id})`;
                }
                select.appendChild(opt);
                inquiryOptionsData[rec.id] = rec;
            });
        }
    } catch (error) {
        console.error('讀取問診資料錯誤:', error);
    }
}

        /**
         * 判斷當前是否可以對套票進行操作（新增、刪除或調整數量）。
         * 當掛號已標記為完成（appointment.status === 'completed'）時，
         * 應禁止後續對套票的任何修改，以避免診症完成後仍更動收費項目。
         *
         * @returns {boolean} 如果允許修改套票則回傳 true；若已完成則回傳 false
         */
        function canModifyPackageItems() {
            try {
                // 從全域 appointments 中取得當前掛號資訊
                if (Array.isArray(appointments) && currentConsultingAppointmentId !== null && currentConsultingAppointmentId !== undefined) {
                    const appt = appointments.find(ap => ap && String(ap.id) === String(currentConsultingAppointmentId));
                    // 如果存在且狀態為已完成，則不允許修改套票
                    if (appt && appt.status === 'completed') {
                        return false;
                    }
                }
            } catch (e) {
                // 發生錯誤時保持允許狀態，避免阻塞其他操作
            }
            return true;
        }
        
        function loadConsultationSystem() {
            // 初始化掛號日期選擇器
            try {
                setupAppointmentDatePicker();
            } catch (_e) {
                // 忽略初始化失敗
            }
            // 載入選定日期的掛號列表
            loadTodayAppointments();
            clearPatientSearch();
        }

        /**
         * 初始化掛號日期選擇器。
         * 設定最小可選日期為今日 00:00，並在未選擇日期時預設為今日 00:00。
         * 當使用者改變日期時會重新載入掛號列表。
         */
        function setupAppointmentDatePicker() {
            try {
                const picker = document.getElementById('appointmentDatePicker');
                if (!picker) return;
                // 設定最小可選日期為今天 00:00
                const now = new Date();
                const minDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                const localMin = new Date(minDate.getTime() - minDate.getTimezoneOffset() * 60000)
                    .toISOString()
                    .slice(0, 10);
                picker.min = localMin;
                // 若尚未有值，預設為今日
                if (!picker.value) {
                    picker.value = localMin;
                }
                // 只綁定一次 change 事件
                if (!picker.dataset.bound) {
                    picker.addEventListener('change', function () {
                        try {
                            loadTodayAppointments();
                        } catch (_err) {
                            console.error('更新掛號列表失敗：', _err);
                        }
                    });
                    picker.dataset.bound = 'true';
                }
            } catch (err) {
                console.error('初始化日期選擇器失敗：', err);
            }
        }
        
// 1. 修改病人搜尋函數，改為從 Firebase 讀取資料
async function searchPatientsForRegistration() {
    const searchTerm = document.getElementById('patientSearchInput').value.trim().toLowerCase();
    const resultsContainer = document.getElementById('patientSearchResults');
    const resultsList = document.getElementById('searchResultsList');
    
    if (searchTerm.length < 1) {
        resultsContainer.classList.add('hidden');
        return;
    }
    
    // 顯示載入中
    resultsList.innerHTML = `
        <div class="p-4 text-center text-gray-500">
            <div class="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900"></div>
            <div class="mt-2">搜尋中...</div>
        </div>
    `;
    resultsContainer.classList.remove('hidden');
    
    try {
        // 從快取或 Firebase 取得病人資料
        const allPatients = await fetchPatients();
        if (!allPatients || allPatients.length === 0) {
            resultsList.innerHTML = `
                <div class="p-4 text-center text-red-500">
                    讀取病人資料失敗，請重試
                </div>
            `;
            return;
        }

        // 搜索匹配的病人
        const matchedPatients = allPatients.filter(patient => 
            (patient.name && patient.name.toLowerCase().includes(searchTerm)) ||
            (patient.phone && patient.phone.includes(searchTerm)) ||
            (patient.patientNumber && patient.patientNumber.toLowerCase().includes(searchTerm))
        );
        
        if (matchedPatients.length === 0) {
            resultsList.innerHTML = `
                <div class="p-4 text-center text-gray-500">
                    找不到符合條件的病人
                </div>
            `;
            resultsContainer.classList.remove('hidden');
            return;
        }
        
        // 顯示搜索結果，使用 escapeHtml 轉義顯示內容
        resultsList.innerHTML = matchedPatients.map(patient => {
            const safeId = String(patient.id).replace(/"/g, '&quot;');
            const safeName = window.escapeHtml(patient.name);
            const safeNumber = window.escapeHtml(patient.patientNumber || '');
            const safeAge = window.escapeHtml(formatAge(patient.birthDate));
            const safeGender = window.escapeHtml(patient.gender);
            const safePhone = window.escapeHtml(patient.phone);
            return `
            <div class="p-4 hover:bg-gray-50 cursor-pointer transition duration-200" onclick="selectPatientForRegistration('${safeId}')">
                <div>
                    <div class="font-semibold text-gray-900">${safeName}</div>
                    <div class="text-sm text-gray-600">編號：${safeNumber} | 年齡：${safeAge} | 性別：${safeGender}</div>
                    <div class="text-sm text-gray-500">電話：${safePhone}</div>
                </div>
            </div>
            `;
        }).join('');
        
        resultsContainer.classList.remove('hidden');
        
    } catch (error) {
        console.error('搜尋病人資料錯誤:', error);
        resultsList.innerHTML = `
            <div class="p-4 text-center text-red-500">
                搜尋失敗，請檢查網路連接
            </div>
        `;
    }
}
        
// 2. 修改選擇病人進行掛號函數
async function selectPatientForRegistration(patientId) {
    // 檢查是否需要限制醫師掛號操作：只有醫師在診症時才限制
    let consultingAppointment = null;
    const isDoctorUser = currentUserData && currentUserData.position === '醫師';
    if (isDoctorUser) {
        // 檢查當天是否有同一醫師正在診症
        consultingAppointment = appointments.find(apt =>
            apt.status === 'consulting' &&
            apt.appointmentDoctor === currentUserData.username &&
            new Date(apt.appointmentTime).toDateString() === new Date().toDateString()
        );
    }
    
    if (consultingAppointment) {
        try {
            // 從快取或 Firebase 取得正在診症的病人資料
            const allPatients = await fetchPatients();
            if (allPatients && allPatients.length > 0) {
                const consultingPatient = allPatients.find(p => p.id === consultingAppointment.patientId);
                const consultingPatientName = consultingPatient ? consultingPatient.name : '某位病人';
                showToast(`無法進行掛號！您目前正在為 ${consultingPatientName} 診症中，請完成後再進行掛號操作。`, 'warning');
                return;
            }
        } catch (error) {
            console.error('檢查診症狀態錯誤:', error);
        }
    }
    
    try {
        // 從快取或 Firebase 取得病人資料
        const allPatients = await fetchPatients();
        if (!allPatients || allPatients.length === 0) {
            showToast('讀取病人資料失敗', 'error');
            return;
        }
        
        const patient = allPatients.find(p => p.id === patientId);
        if (!patient) {
            showToast('找不到病人資料', 'error');
            return;
        }
        
        selectedPatientForRegistration = patient;
        showRegistrationModal(patient);
        
    } catch (error) {
        console.error('選擇病人資料錯誤:', error);
        showToast('讀取病人資料失敗', 'error');
    }
}
        
        // 清除病人搜索
        function clearPatientSearch() {
            document.getElementById('patientSearchInput').value = '';
            document.getElementById('patientSearchResults').classList.add('hidden');
            selectedPatientForRegistration = null;
        }
        

        
        // 顯示掛號彈窗
        function showRegistrationModal(patient) {
            if (!patient) return;
            
            // 顯示選中的病人資訊，對文字進行轉義避免 XSS
            const safeName = window.escapeHtml(patient.name);
            const safeNumber = window.escapeHtml(patient.patientNumber || '');
            const safeAge = window.escapeHtml(formatAge(patient.birthDate));
            const safeGender = window.escapeHtml(patient.gender);
            const safePhone = window.escapeHtml(patient.phone);
            document.getElementById('selectedPatientInfo').innerHTML = `
                <div class="space-y-1">
                    <div><span class="font-medium">姓名：</span>${safeName}</div>
                    <div><span class="font-medium">編號：</span>${safeNumber}</div>
                    <div><span class="font-medium">年齡：</span>${safeAge} | <span class="font-medium">性別：</span>${safeGender}</div>
                    <div><span class="font-medium">電話：</span>${safePhone}</div>
                </div>
            `;
            
            // 載入醫師選項
            loadDoctorOptions();
            
            // 設置預設掛號時間為當前時間（加5分鐘避免時間過期）
            const nowForDefault = new Date();
            nowForDefault.setMinutes(nowForDefault.getMinutes() + 5); // 加5分鐘作為預設值
            const defYear = nowForDefault.getFullYear();
            const defMonth = String(nowForDefault.getMonth() + 1).padStart(2, '0');
            const defDay = String(nowForDefault.getDate()).padStart(2, '0');
            const defHours = String(nowForDefault.getHours()).padStart(2, '0');
            const defMinutes = String(nowForDefault.getMinutes()).padStart(2, '0');
            const localDateTime = `${defYear}-${defMonth}-${defDay}T${defHours}:${defMinutes}`;

            // 設置掛號時間輸入欄的預設值
            const appointmentInput = document.getElementById('appointmentDateTime');
            appointmentInput.value = localDateTime;

            // 設置允許選擇的最小日期時間為今日 00:00
            // 依需求，掛號時間只能選擇「今日」或之後的日期
            const today = new Date();
            const tYear = today.getFullYear();
            const tMonth = String(today.getMonth() + 1).padStart(2, '0');
            const tDay = String(today.getDate()).padStart(2, '0');
            const minDateTime = `${tYear}-${tMonth}-${tDay}T00:00`;
            appointmentInput.min = minDateTime;
            
            clearRegistrationForm();
            // 根據病人載入問診資料選項
            try {
                loadInquiryOptions(patient);
            } catch (_e) {
                console.warn('載入問診資料選項失敗:', _e);
            }
            document.getElementById('registrationModal').classList.remove('hidden');
        }
        
        // 載入醫師選項
        function loadDoctorOptions() {
            const doctorSelect = document.getElementById('appointmentDoctor');
            
            // 獲取所有啟用的醫師用戶
            const doctors = users.filter(user => 
                user.active && user.position === '醫師'
            );
            
            // 清空現有選項（保留預設選項）
            doctorSelect.innerHTML = '<option value="">請選擇醫師</option>';
            
            // 添加醫師選項
            doctors.forEach(doctor => {
                const option = document.createElement('option');
                option.value = doctor.username;
                option.textContent = `${doctor.name}醫師`;
                if (doctor.registrationNumber) {
                    option.textContent += ` (${doctor.registrationNumber})`;
                }
                doctorSelect.appendChild(option);
            });
            
            // 如果當前用戶是醫師，預設選擇自己
            if (currentUserData && currentUserData.position === '醫師') {
                doctorSelect.value = currentUserData.username;
            }
        }
        
        // 關閉掛號彈窗
        function closeRegistrationModal() {
            document.getElementById('registrationModal').classList.add('hidden');
            clearRegistrationForm();
            selectedPatientForRegistration = null;
        }
        
        // 清空掛號表單
        function clearRegistrationForm() {
            document.getElementById('appointmentDoctor').value = '';
            document.getElementById('quickChiefComplaint').value = '';
            // 重置問診資料下拉選單
            const inquirySelect = document.getElementById('inquirySelect');
            if (inquirySelect) {
                inquirySelect.value = '';
            }

            // 重設主訴欄位顯示狀態（若已有問診資料則隱藏，反之顯示）
            try {
                const toggler = window.toggleChiefComplaintVisibility;
                if (typeof toggler === 'function') {
                    toggler();
                }
            } catch (_e) {
                // 若未定義切換函式，忽略錯誤
            }
        }
        
        // 確認掛號
        async function confirmRegistration() {
            if (!selectedPatientForRegistration) {
                showToast('系統錯誤：未選擇病人！', 'error');
                return;
            }
            
            const appointmentDateTime = document.getElementById('appointmentDateTime').value;
            const appointmentDoctor = document.getElementById('appointmentDoctor').value;
            const chiefComplaint = document.getElementById('quickChiefComplaint').value.trim();

            // 取得選擇的問診資料 ID 並準備對應的資料
            let selectedInquiryId = '';
            let inquiryDataForAppointment = null;
            let inquirySummaryForAppointment = '';
            try {
                const inquirySelectEl = document.getElementById('inquirySelect');
                if (inquirySelectEl) {
                    selectedInquiryId = inquirySelectEl.value;
                }
                if (selectedInquiryId) {
                    const rec = inquiryOptionsData ? inquiryOptionsData[selectedInquiryId] : null;
                    if (rec && rec.data) {
                        inquiryDataForAppointment = rec.data;
                        // 產生摘要供預填主訴或展示
                        inquirySummaryForAppointment = getMainSymptomFromResult(rec.data);
                    }
                }
            } catch (err) {
                console.warn('處理問診資料時發生錯誤:', err);
            }
            
            if (!appointmentDateTime) {
                showToast('請選擇掛號時間！', 'error');
                return;
            }
            
            if (!appointmentDoctor) {
                showToast('請選擇掛號醫師！', 'error');
                return;
            }
            
            // 驗證選擇的醫師是否存在且啟用
            const selectedDoctor = users.find(user => 
                user.username === appointmentDoctor && 
                user.active && 
                user.position === '醫師'
            );
            
            if (!selectedDoctor) {
                showToast('選擇的醫師無效，請重新選擇！', 'error');
                return;
            }
            
            // 驗證掛號時間不能是過去時間（允許1分鐘的誤差）
            const selectedTime = new Date(appointmentDateTime);
            const now = new Date();
            now.setMinutes(now.getMinutes() - 1); // 允許1分鐘誤差
            if (selectedTime < now) {
                showToast('掛號時間不能早於現在時間！', 'error');
                return;
            }
            
            const appointment = {
                id: Date.now(),
                patientId: selectedPatientForRegistration.id,
                appointmentTime: selectedTime.toISOString(),
                appointmentDoctor: appointmentDoctor,
                chiefComplaint: chiefComplaint || '無特殊主訴',
                status: 'registered', // registered, waiting, consulting, completed
                createdAt: new Date().toISOString(),
                createdBy: currentUserData ? currentUserData.username : currentUser
            };

            // 若有選擇問診資料，僅保存問診 ID 與摘要。避免將完整問診內容存入掛號資料，
            // 以便在不同裝置上都能從 Firestore 取得問診詳情。保存摘要方便快速展示。
            if (inquiryDataForAppointment) {
                appointment.inquiryId = selectedInquiryId;
                appointment.inquirySummary = inquirySummaryForAppointment || '';
                // 若未輸入主訴或主訴為預設值，使用問診摘要作為主訴
                if (!chiefComplaint || chiefComplaint === '無特殊主訴') {
                    appointment.chiefComplaint = inquirySummaryForAppointment || '無特殊主訴';
                }
            }

            try {
                // 加入本地陣列
                appointments.push(appointment);
                // 將掛號資訊存入 Firebase Realtime Database
                const result = await window.firebaseDataManager.addAppointment(appointment);
                // 更新本地儲存作為備份
                localStorage.setItem('appointments', JSON.stringify(appointments));
                if (result.success) {
                    showToast(`${selectedPatientForRegistration.name} 已掛號給 ${selectedDoctor.name}醫師！`, 'success');
                    closeRegistrationModal();
                    clearPatientSearch();
                    loadTodayAppointments();
                } else {
                    showToast('掛號失敗，請稍後再試', 'error');
                }
            } catch (error) {
                console.error('掛號失敗:', error);
                showToast('掛號失敗，請稍後再試', 'error');
            }
        }
        
            // 每日自動清空過期掛號列表（同步到 Firebase）
            async function clearOldAppointments() {
                /**
                 * 從 Firebase Realtime Database 讀取所有掛號記錄，
                 * 將掛號時間早於今日 00:00:00 的記錄刪除。
                 *
                 * 判斷邏輯：
                 *  - 取得今天的開始時間（本地時間）
                 *  - 對每筆掛號紀錄解析其 appointmentTime
                 *  - 若該時間早於今日，則將這筆資料從 Realtime Database 刪除
                 *
                 * 此函式會同步更新本地的 appointments 陣列與 localStorage。
                 */
                try {
                    // 讀取所有掛號資料
                    const snapshot = await window.firebase.get(
                        window.firebase.ref(window.firebase.rtdb, 'appointments')
                    );
                    const data = (snapshot && typeof snapshot.val === 'function'
                        ? snapshot.val()
                        : snapshot && snapshot.val) || {};

                    // 計算今日凌晨時間（本地時區）
                    const now = new Date();
                    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

                    const idsToRemove = [];
                    for (const id in data) {
                        if (!Object.prototype.hasOwnProperty.call(data, id)) continue;
                        const apt = data[id] || {};
                        const timeValue = apt.appointmentTime;
                        // 如果沒有 appointmentTime，視為過期資料
                        if (!timeValue) {
                            idsToRemove.push(id);
                            continue;
                        }
                        const aptDate = new Date(timeValue);
                        if (isNaN(aptDate.getTime())) {
                            // 無法解析日期，視為過期
                            idsToRemove.push(id);
                            continue;
                        }
                        // 如果掛號時間在今日凌晨之前（昨天或更早），則刪除
                        if (aptDate < startOfToday) {
                            idsToRemove.push(id);
                        }
                    }

                    // 若沒有需要刪除的掛號，直接返回
                    if (idsToRemove.length === 0) {
                        console.log('沒有過期掛號需要清除。');
                        return;
                    }

                    // 刪除每筆過期的掛號
                    for (const id of idsToRemove) {
                        try {
                            await window.firebase.remove(
                                window.firebase.ref(window.firebase.rtdb, 'appointments/' + id)
                            );
                        } catch (removeError) {
                            console.error('刪除過期掛號失敗:', id, removeError);
                        }
                    }

                    // 更新本地 appointments 陣列
                    if (typeof appointments !== 'undefined' && Array.isArray(appointments)) {
                        appointments = appointments.filter(apt => !idsToRemove.includes(String(apt.id)));
                        localStorage.setItem('appointments', JSON.stringify(appointments));
                    }

                    console.log(`清除 ${idsToRemove.length} 筆過期掛號完成。`);
                } catch (error) {
                    console.error('清除過期掛號時發生錯誤:', error);
                }
            }



// 3. 修改今日掛號列表載入功能，確保能正確顯示病人資訊
async function loadTodayAppointments() {
    // 在讀取掛號資料之前，先清除過期掛號（同步到 Firebase）。
    // 如果掛號時間在昨日或更早（即早於今天 00:00:00），會從 Realtime Database 中刪除。
    await clearOldAppointments();

    // 如果全域 appointments 尚未有資料，則從 Firebase 讀取掛號資料。若已有資料則直接使用，避免重複讀取。
    if (!Array.isArray(appointments) || appointments.length === 0) {
        try {
            const result = await window.firebaseDataManager.getAppointments();
            if (result.success) {
                appointments = result.data.map(apt => {
                    return { ...apt };
                });
                // 更新本地存儲作為備份
                localStorage.setItem('appointments', JSON.stringify(appointments));
            } else {
                console.warn('無法從 Firebase 讀取掛號資料，使用本地資料');
            }
        } catch (error) {
            console.error('讀取掛號資料錯誤:', error);
        }
    }

    // 根據日期選擇器決定要顯示的日期；若未選擇則使用今日
    let targetDate = new Date();
    try {
        const datePicker = document.getElementById('appointmentDatePicker');
        if (datePicker && datePicker.value) {
            const selected = new Date(datePicker.value);
            if (!isNaN(selected.getTime())) {
                targetDate = selected;
            }
        }
    } catch (_e) {
        // 若取得日期失敗則維持今日
    }
    const targetDateStr = targetDate.toDateString();
    let todayAppointments = appointments.filter(apt => 
        new Date(apt.appointmentTime).toDateString() === targetDateStr
    );
    
    // 如果當前用戶是醫師，只顯示掛給自己的病人
    if (currentUserData && currentUserData.position === '醫師') {
        todayAppointments = todayAppointments.filter(apt => 
            apt.appointmentDoctor === currentUserData.username
        );
    }
    
    // 按時間排序
    todayAppointments.sort((a, b) => new Date(a.appointmentTime) - new Date(b.appointmentTime));
    
    const tbody = document.getElementById('todayAppointmentsList');
    document.getElementById('todayTotal').textContent = todayAppointments.length;
    
    if (todayAppointments.length === 0) {
        const message = currentUserData && currentUserData.position === '醫師' 
            ? '今日暫無掛給您的病人' 
            : '今日暫無掛號記錄';
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="px-4 py-8 text-center text-gray-500">
                    ${message}
                </td>
            </tr>
        `;
        return;
    }
    
    try {
        // 優先使用快取的病人資料來避免重複從 Firebase 讀取。
        const patientsData = await fetchPatients();
        
        tbody.innerHTML = todayAppointments.map((appointment, index) => {
            // 從資料集中尋找對應病人
            const patient = patientsData.find(p => p.id === appointment.patientId);
            
            if (!patient) {
                // 如果在快取找不到，嘗試從全域陣列找（向後兼容）
                const localPatient = patients.find(p => p.id === appointment.patientId);
                if (!localPatient) {
                    return `
                        <tr class="hover:bg-gray-50">
                            <td colspan="7" class="px-4 py-3 text-center text-red-500">
                                找不到病人資料 (ID: ${appointment.patientId})
                            </td>
                        </tr>
                    `;
                }
                // 使用本地病人資料
                return createAppointmentRow(appointment, localPatient, index);
            }
            
            // 使用快取病人資料
            return createAppointmentRow(appointment, patient, index);
        }).join('');
        
    } catch (error) {
        console.error('載入掛號列表錯誤:', error);
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="px-4 py-8 text-center text-red-500">
                    載入掛號列表失敗，請重新整理頁面
                </td>
            </tr>
        `;
    }
}

// 新增：訂閱 Firebase Realtime Database 的掛號變動，實時更新今日掛號列表
function subscribeToAppointments() {
    // 監聽 appointments 資料變化
    const appointmentsRef = window.firebase.ref(window.firebase.rtdb, 'appointments');
    // 如果先前已經有監聽器，先取消以避免重複觸發
    if (window.appointmentsListener) {
        window.firebase.off(appointmentsRef, 'value', window.appointmentsListener);
    }
    // 初始化前一次狀態記錄
    if (!window.previousAppointmentStatuses) {
        window.previousAppointmentStatuses = {};
    }
    // 建立新的監聽回調，使用 async 以便在偵測到狀態變更時讀取病人資料
    window.appointmentsListener = async (snapshot) => {
        const data = snapshot.val() || {};
        // 取得新的掛號資料陣列
        const newAppointments = Object.keys(data).map(key => {
            return { id: key, ...data[key] };
        });
        try {
            // 判斷是否有病人狀態變更為候診中需要通知
            const toNotify = [];
            for (const apt of newAppointments) {
                const prevStatus = window.previousAppointmentStatuses[apt.id];
                // 當前狀態為候診中且與先前狀態不同，視為新的候診事件
                if (prevStatus !== undefined && prevStatus !== apt.status && apt.status === 'waiting') {
                    toNotify.push(apt);
                }
                // 更新狀態紀錄
                window.previousAppointmentStatuses[apt.id] = apt.status;
            }
            // 如果有需要通知的掛號並且目前使用者是醫師
            if (toNotify.length > 0 && currentUserData && currentUserData.position === '醫師') {
                // 讀取所有病人資訊以獲取病人姓名
                const allPatients = await fetchPatients();
                for (const apt of toNotify) {
                    // 僅通知該醫師所屬的掛號
                    if (apt.appointmentDoctor === currentUserData.username) {
                        const patient = allPatients.find(p => p.id === apt.patientId);
                        const patientName = patient ? patient.name : '';
                        // 顯示提示並播放音效
                        showToast(`病人 ${patientName} 已進入候診中，請準備診症。`, 'info');
                        playNotificationSound();
                    }
                }
            }
        } catch (err) {
            console.error('處理候診通知時發生錯誤:', err);
        }
        // 更新全域掛號資料
        appointments = newAppointments;
        // 儲存到本地作為備份
        localStorage.setItem('appointments', JSON.stringify(appointments));
        // 重新載入今日掛號列表
        loadTodayAppointments();
        // 更新統計資訊
        updateStatistics();
    };
    // 設置監聽器
    window.firebase.onValue(appointmentsRef, window.appointmentsListener);
}



// 新增：從 Firebase 載入診症記錄進行編輯
async function loadConsultationForEdit(consultationId) {
    // 清除上一個診症操作遺留的套票變更記錄。
    pendingPackageChanges = [];
    try {
        // 先嘗試從本地找
        let consultation = null;
try {
    const consultationResult = await window.firebaseDataManager.getConsultations();
    if (consultationResult.success) {
        consultation = consultationResult.data.find(c => c.id === consultationId);
        // 同步更新全域變數
        consultations = consultationResult.data;
    }
} catch (error) {
    console.error('讀取診療記錄錯誤:', error);
}
        
        // 如果本地找不到，從 Firebase 找
        if (!consultation) {
            const consultationResult = await window.firebaseDataManager.getConsultations();
            if (consultationResult.success) {
                consultation = consultationResult.data.find(c => c.id === consultationId);
                if (consultation) {
                    // 同步到本地
                    consultations.push(consultation);
                    localStorage.setItem('consultations', JSON.stringify(consultations));
                }
            }
        }
        
        if (consultation) {
            // 載入診症記錄內容
            document.getElementById('formSymptoms').value = consultation.symptoms || '';
            document.getElementById('formTongue').value = consultation.tongue || '';
            document.getElementById('formPulse').value = consultation.pulse || '';
            document.getElementById('formCurrentHistory').value = consultation.currentHistory || '';
            document.getElementById('formDiagnosis').value = consultation.diagnosis || '';
            document.getElementById('formSyndrome').value = consultation.syndrome || '';
            document.getElementById('formAcupunctureNotes').value = consultation.acupunctureNotes || '';
            document.getElementById('formUsage').value = consultation.usage || '';
            document.getElementById('formTreatmentCourse').value = consultation.treatmentCourse || '';
            document.getElementById('formInstructions').value = consultation.instructions || '';
            document.getElementById('formFollowUpDate').value = consultation.followUpDate || '';
            
            // 處理到診時間 - 支援多種日期格式
            if (consultation.visitTime) {
                const visitTime = parseConsultationDate(consultation.visitTime);
                if (visitTime) {
                    const year = visitTime.getFullYear();
                    const month = String(visitTime.getMonth() + 1).padStart(2, '0');
                    const day = String(visitTime.getDate()).padStart(2, '0');
                    const hours = String(visitTime.getHours()).padStart(2, '0');
                    const minutes = String(visitTime.getMinutes()).padStart(2, '0');
                    document.getElementById('formVisitTime').value = `${year}-${month}-${day}T${hours}:${minutes}`;
                }
            }
            
            // 載入休息期間設定
            if (consultation.restStartDate && consultation.restEndDate) {
                document.getElementById('formRestStartDate').value = consultation.restStartDate;
                document.getElementById('formRestEndDate').value = consultation.restEndDate;
                updateRestPeriod();
            } else {
                // 使用預設值
                const startDate = new Date();
                const endDate = new Date();
                // 將結束日期設為與開始日期相同，預設休息 1 天
                endDate.setDate(startDate.getDate());
                
                const startDateStr = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`;
                const endDateStr = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;
                
                document.getElementById('formRestStartDate').value = startDateStr;
                document.getElementById('formRestEndDate').value = endDateStr;
                updateRestPeriod();
            }
            
            // 載入處方內容
            selectedPrescriptionItems = [];
            if (consultation.prescription) {
                // 先將完整處方內容存入隱藏文本域
                document.getElementById('formPrescription').value = consultation.prescription;
                // 嘗試解析處方內容並生成處方項目列表
                parsePrescriptionToItems(consultation.prescription);
                updatePrescriptionDisplay();
                // 如果未能解析出任何處方項目（例如庫中缺少相關藥材或方劑資料），
                // 則直接將原始處方文本顯示於處方區域，避免顯示為空白
                if (selectedPrescriptionItems.length === 0) {
                    // 還原隱藏文本域為原始內容，因為 updatePrescriptionDisplay 會清空它
                    document.getElementById('formPrescription').value = consultation.prescription;
                    const container = document.getElementById('selectedPrescriptionItems');
                    if (container) {
                        container.innerHTML = `<div class="text-sm text-gray-900 whitespace-pre-line">${consultation.prescription}</div>`;
                    }
                    // 隱藏服藥天數與次數設定
                    const medicationSettingsEl = document.getElementById('medicationSettings');
                    if (medicationSettingsEl) {
                        medicationSettingsEl.style.display = 'none';
                    }
                }
            }
            
            // 載入收費項目
            selectedBillingItems = [];
            if (consultation.billingItems) {
                document.getElementById('formBillingItems').value = consultation.billingItems;
                // 解析舊病歷中的收費項目
                parseBillingItemsFromText(consultation.billingItems);
                // 嘗試為舊病歷載入的套票使用項目補全 meta（patientId 和 packageRecordId），
                // 優先使用診症記錄中的 patientId，若不存在再嘗試使用當前掛號（currentConsultingAppointmentId）推斷。
                try {
                    // 優先使用 consultation.patientId，如果資料庫中有存儲病人 ID
                    let pid = consultation && consultation.patientId ? consultation.patientId : null;
                    // 如果 consultation.patientId 不存在，退而使用當前掛號的病人 ID
                    if (!pid && typeof currentConsultingAppointmentId !== 'undefined' && Array.isArray(appointments)) {
                        // 使用字串比較 ID，避免數字與字串不一致導致匹配失敗
                        const appt = appointments.find(ap => ap && String(ap.id) === String(currentConsultingAppointmentId));
                        if (appt) pid = appt.patientId;
                    }
                    if (pid) {
                        await restorePackageUseMeta(pid);
                    }
                } catch (e) {
                    console.error('載入舊病歷時恢復套票 meta 失敗:', e);
                }
                // 更新顯示
                updateBillingDisplay();
            }
            
            // 安全獲取診症儲存按鈕文本元素，避免為 null 時出錯
            const saveButtonTextEl = document.getElementById('consultationSaveButtonText');
            if (saveButtonTextEl) {
                saveButtonTextEl.textContent = '保存病歷';
            } else {
                // 如果找不到元素，不抛出錯誤，而是紀錄警告，這樣使用者可繼續操作
                console.warn('consultationSaveButtonText element not found when loading consultation for edit. Skipping text update.');
            }
        } else {
            showToast('找不到診症記錄，將使用空白表單', 'warning');
            clearConsultationForm();
        }
    } catch (error) {
        console.error('載入診症記錄錯誤:', error);
        showToast('載入診症記錄失敗，將使用空白表單', 'warning');
        clearConsultationForm();
    }
}

// 新增：解析診症日期的通用函數
function parseConsultationDate(dateInput) {
    if (!dateInput) return null;
    
    try {
        // 如果是 Firebase Timestamp 格式
        if (dateInput.seconds) {
            return new Date(dateInput.seconds * 1000);
        }
        
        // 如果是字符串格式
        if (typeof dateInput === 'string') {
            const parsed = new Date(dateInput);
            if (!isNaN(parsed.getTime())) {
                return parsed;
            }
        }
        
        // 如果是 Date 對象
        if (dateInput instanceof Date) {
            return dateInput;
        }
        
        // 如果是數字格式（timestamp）
        if (typeof dateInput === 'number') {
            return new Date(dateInput);
        }
        
        return null;
    } catch (error) {
        console.error('日期解析錯誤:', error, dateInput);
        return null;
    }
}
// 修復格式化診症日期顯示
// 已移除 formatConsultationDate 函式（未使用），請改用 formatConsultationDateTime()

function formatConsultationDateTime(dateInput) {
    const date = parseConsultationDate(dateInput);
    if (!date || isNaN(date.getTime())) {
        return '時間未知';
    }
    
    return date.toLocaleString('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}


        
// 1. 修改 createAppointmentRow 函數，確保診症記錄按鈕正確傳遞 patientId
function createAppointmentRow(appointment, patient, index) {
    // 獲取掛號醫師資訊
    const appointmentDoctor = users.find(u => u.username === appointment.appointmentDoctor);
    const doctorName = appointmentDoctor ? `${appointmentDoctor.name}醫師` : '未指定醫師';
    
    const statusInfo = getStatusInfo(appointment.status);
    const operationButtons = getOperationButtons(appointment, patient); // 傳遞 patient 參數
    
    return `
        <tr class="hover:bg-gray-50">
            <td class="px-4 py-3 text-sm text-gray-900 font-medium">${index + 1}</td>
            <td class="px-4 py-3 text-sm font-medium text-gray-900">
                ${patient.name}
                <div class="text-xs text-gray-500">${patient.patientNumber}</div>
            </td>
            <td class="px-4 py-3 text-sm text-gray-900">
                <div class="font-medium text-blue-600">${doctorName}</div>
            </td>
            <td class="px-4 py-3 text-sm text-gray-900">
                ${new Date(appointment.appointmentTime).toLocaleString('zh-TW', {
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                })}
            </td>
            <td class="px-4 py-3 text-sm text-gray-900">
                <div class="max-w-xs truncate" title="${appointment.chiefComplaint || '無'}">
                    ${appointment.chiefComplaint || '無'}
                </div>
            </td>
            <td class="px-4 py-3">
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusInfo.class}">
                    ${statusInfo.text}
                </span>
            </td>
            <td class="px-4 py-3 text-sm">
                <!--
                  將操作按鈕容器設為寬度 100% 並使用 justify-end，使所有操作按鈕靠右排列。
                  原本在 <td> 上設置 w-full 會導致表格排版異常，令整列偏左。
                  因此僅在內層容器上使用 w-full，以確保按鈕佔滿該欄寬度但不影響整行
                  的寬度計算。
                -->
                <div class="flex flex-wrap gap-1 justify-end w-full">
                    ${operationButtons}
                </div>
            </td>
        </tr>
    `;
}
        
        // 獲取狀態資訊
        function getStatusInfo(status) {
            const statusMap = {
                'registered': { text: '已掛號', class: 'bg-blue-100 text-blue-800' },
                'waiting': { text: '候診中', class: 'bg-yellow-100 text-yellow-800' },
                'consulting': { text: '診症中', class: 'bg-green-100 text-green-800' },
                'completed': { text: '已完成', class: 'bg-gray-100 text-gray-800' }
            };
            return statusMap[status] || { text: '未知', class: 'bg-gray-100 text-gray-800' };
        }
        
// 2. 修改 getOperationButtons 函數，確保使用正確的 patientId
function getOperationButtons(appointment, patient = null) {
    const buttons = [];
    
    // 檢查目前用戶是否為醫師
    const isDoctorUser = currentUserData && currentUserData.position === '醫師';
    // 檢查同一醫師是否有病人在今日診症中
    const isDoctorConsulting = isDoctorUser && appointments.some(apt =>
        apt.status === 'consulting' &&
        apt.appointmentDoctor === currentUserData.username &&
        new Date(apt.appointmentTime).toDateString() === new Date().toDateString()
    );
    
    const isCurrentConsulting = appointment.status === 'consulting';
    
    // 檢查當前用戶是否為該掛號的醫師
    const isAppointmentDoctor = currentUserData && 
        currentUserData.position === '醫師' && 
        appointment.appointmentDoctor === currentUserData.username;
    
    // 檢查當前用戶是否為管理員或護理師（可以進行管理操作）
    const canManage = currentUserData && 
        (currentUserData.position === '診所管理' || currentUserData.position === '護理師');
    
    // 檢查當前用戶是否可以確認到達（管理員、護理師或該掛號的醫師）
    const canConfirmArrival = canManage || isAppointmentDoctor;
    
    // 使用正確的 patientId（優先使用 Firebase ID）
    const patientId = patient ? patient.id : appointment.patientId;
    
    // 所有狀態都可以查看診症記錄
    buttons.push(`<button onclick="viewPatientMedicalHistory('${patientId}')" class="bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded text-xs transition duration-200">診症記錄</button>`);
    
    // 僅當醫師正在為其他病人診症時禁用其對其他掛號的操作
    const isDisabled = isDoctorConsulting && !isCurrentConsulting;
    let disabledTooltip = '';
    if (isDisabled) {
        // 提示醫師目前正在診症中
        disabledTooltip = `title="您正在診症中，操作暫時禁用"`;
    }
    
    switch (appointment.status) {
        case 'registered':
            if (isDisabled) {
                if (canConfirmArrival) {
                    buttons.push(`<span class="bg-gray-300 text-gray-500 px-2 py-1 rounded text-xs cursor-not-allowed" ${disabledTooltip}>確認到達</span>`);
                }
                if (canManage) {
                    buttons.push(`<span class="bg-gray-300 text-gray-500 px-2 py-1 rounded text-xs cursor-not-allowed" ${disabledTooltip}>移除掛號</span>`);
                }
            } else {
                if (canConfirmArrival) {
                    buttons.push(`<button onclick="confirmPatientArrival(${appointment.id})" class="bg-yellow-500 hover:bg-yellow-600 text-white px-2 py-1 rounded text-xs transition duration-200">確認到達</button>`);
                }
                if (canManage) {
                    buttons.push(`<button onclick="removeAppointment(${appointment.id})" class="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-xs transition duration-200">移除掛號</button>`);
                }
            }
            break;
            
        case 'waiting':
            if (isDisabled) {
                if (isAppointmentDoctor) {
                    buttons.push(`<span class="bg-gray-300 text-gray-500 px-2 py-1 rounded text-xs cursor-not-allowed" ${disabledTooltip}>開始診症</span>`);
                }
            } else {
                if (isAppointmentDoctor) {
                    buttons.push(`<button onclick="startConsultation(${appointment.id})" class="bg-green-500 hover:bg-green-600 text-white px-2 py-1 rounded text-xs transition duration-200">開始診症</button>`);
                }
            }
            break;
            
        case 'consulting':
            if (isAppointmentDoctor) {
                buttons.push(`<button onclick="continueConsultation(${appointment.id})" class="bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded text-xs transition duration-200">繼續診症</button>`);
            }
            break;
            
        case 'completed':
            // 列印收據功能不受診症狀態限制
            buttons.push(`<button onclick="printReceiptFromAppointment(${appointment.id})" class="bg-green-500 hover:bg-green-600 text-white px-2 py-1 rounded text-xs transition duration-200">列印收據</button>`);
            // 新增方藥醫囑列印功能，位於列印收據旁
            buttons.push(`<button onclick="printPrescriptionInstructionsFromAppointment(${appointment.id})" class="bg-yellow-500 hover:bg-yellow-600 text-white px-2 py-1 rounded text-xs transition duration-200">藥單醫囑</button>`);
            buttons.push(`<button onclick="printAttendanceCertificateFromAppointment(${appointment.id})" class="bg-purple-500 hover:bg-purple-600 text-white px-2 py-1 rounded text-xs transition duration-200">到診證明</button>`);
            buttons.push(`<button onclick="printSickLeaveFromAppointment(${appointment.id})" class="bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded text-xs transition duration-200">病假證明</button>`);
            
            if (isDisabled) {
                if (isAppointmentDoctor) {
                    buttons.push(`<span class="bg-gray-300 text-gray-500 px-2 py-1 rounded text-xs cursor-not-allowed" ${disabledTooltip}>修改病歷</span>`);
                }
                if (canManage) {
                    buttons.push(`<span class="bg-gray-300 text-gray-500 px-2 py-1 rounded text-xs cursor-not-allowed" ${disabledTooltip}>撤回診症</span>`);
                }
            } else {
                if (isAppointmentDoctor) {
                    buttons.push(`<button onclick="editMedicalRecord(${appointment.id})" class="bg-orange-500 hover:bg-orange-600 text-white px-2 py-1 rounded text-xs transition duration-200">修改病歷</button>`);
                }
                if (canManage) {
                    buttons.push(`<button onclick="withdrawConsultation(${appointment.id})" class="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-xs transition duration-200">撤回診症</button>`);
                }
            }
            break;
            
        default:
            buttons.push('<span class="text-gray-400 text-xs">狀態異常</span>');
            break;
    }
    
    return buttons.join('');
}

        
// 3. 修改確認病人到達函數，支援 Firebase
async function confirmPatientArrival(appointmentId) {
    const appointment = appointments.find(apt => apt && String(apt.id) === String(appointmentId));
    if (!appointment) {
        showToast('找不到掛號記錄！', 'error');
        return;
    }
    // 取得觸發按鈕：優先使用事件目標，其次透過 DOM 查找
    let loadingButton = null;
    try {
        if (typeof event !== 'undefined' && event && event.currentTarget) {
            loadingButton = event.currentTarget;
        }
    } catch (_e) {}
    if (!loadingButton) {
        loadingButton = document.querySelector('button[onclick="confirmPatientArrival(' + appointmentId + ')"]');
    }
    if (loadingButton) {
        setButtonLoading(loadingButton, '處理中...');
    }
    try {
        // 從 Firebase 獲取病人資料
        const result = await window.firebaseDataManager.getPatients();
        if (!result.success) {
            showToast('無法讀取病人資料！', 'error');
            return;
        }
        const patient = result.data.find(p => p.id === appointment.patientId);
        if (!patient) {
            showToast('找不到病人資料！', 'error');
            return;
        }
        // 詳細狀態檢查
        console.log(`確認到達狀態檢查 - 病人: ${patient.name}, 當前狀態: ${appointment.status}`);
        // 只有已掛號狀態才能確認到達
        if (appointment.status !== 'registered') {
            const statusNames = {
                'waiting': '候診中',
                'consulting': '診症中',
                'completed': '已完成'
            };
            const currentStatusName = statusNames[appointment.status] || appointment.status;
            showToast(`無法確認到達！病人 ${patient.name} 目前狀態為「${currentStatusName}」，只能對「已掛號」的病人確認到達。`, 'warning');
            return;
        }
        // 更新狀態為候診中
        appointment.status = 'waiting';
        appointment.arrivedAt = new Date().toISOString();
        appointment.confirmedBy = currentUserData ? currentUserData.username : currentUser;
        // 保存狀態變更
        localStorage.setItem('appointments', JSON.stringify(appointments));
        await window.firebaseDataManager.updateAppointment(String(appointment.id), appointment);
        showToast(`${patient.name} 已確認到達，進入候診狀態！`, 'success');
        loadTodayAppointments();
    } catch (error) {
        console.error('確認到達錯誤:', error);
        showToast('處理確認到達時發生錯誤', 'error');
    } finally {
        if (loadingButton) {
            clearButtonLoading(loadingButton);
        }
    }
}

        
 // 5. 修改移除掛號函數，支援 Firebase
async function removeAppointment(appointmentId) {
    const appointment = appointments.find(apt => apt && String(apt.id) === String(appointmentId));
    if (!appointment) {
        showToast('找不到掛號記錄！', 'error');
        return;
    }
    // 取得觸發按鈕
    let loadingButton = null;
    try {
        if (typeof event !== 'undefined' && event && event.currentTarget) {
            loadingButton = event.currentTarget;
        }
    } catch (_e) {}
    if (!loadingButton) {
        loadingButton = document.querySelector('button[onclick="removeAppointment(' + appointmentId + ')"]');
    }
    if (loadingButton) {
        setButtonLoading(loadingButton, '處理中...');
    }
    try {
        // 從 Firebase 獲取病人資料
        const result = await window.firebaseDataManager.getPatients();
        if (!result.success) {
            showToast('無法讀取病人資料！', 'error');
            return;
        }
        const patient = result.data.find(p => p.id === appointment.patientId);
        if (!patient) {
            showToast('找不到病人資料！', 'error');
            return;
        }
        // 詳細狀態檢查
        console.log(`移除掛號狀態檢查 - 病人: ${patient.name}, 當前狀態: ${appointment.status}`);
        // 檢查是否可以移除
        if (appointment.status === 'waiting') {
            showToast(`無法移除掛號！病人 ${patient.name} 已確認到達候診中，請聯繫醫師處理。`, 'warning');
            return;
        }
        if (appointment.status === 'consulting') {
            showToast(`無法移除掛號！病人 ${patient.name} 目前正在診症中，請先結束診症後再移除。`, 'warning');
            return;
        }
        if (appointment.status === 'completed') {
            showToast(`無法移除掛號！病人 ${patient.name} 已完成診症，已完成的記錄無法移除。`, 'warning');
            return;
        }
        // 確認移除
        const statusNames = {
            'registered': '已掛號',
            'waiting': '候診中'
        };
        const statusText = statusNames[appointment.status] || appointment.status;
        const confirmMessage = `確定要移除 ${patient.name} 的掛號嗎？\n\n` +
                             `狀態：${statusText}\n` +
                             `掛號時間：${new Date(appointment.appointmentTime).toLocaleString('zh-TW')}\n\n` +
                             `注意：此操作無法復原！`;
        if (confirm(confirmMessage)) {
            // 從掛號列表中移除
            appointments = appointments.filter(apt => apt.id !== appointmentId);
            localStorage.setItem('appointments', JSON.stringify(appointments));
            // 從遠端刪除掛號
            await window.firebaseDataManager.deleteAppointment(String(appointmentId));
            showToast(`已移除 ${patient.name} 的掛號記錄`, 'success');
            loadTodayAppointments();
            // 如果正在診症表單中顯示該病人，則關閉表單
            if (String(currentConsultingAppointmentId) === String(appointmentId)) {
                closeConsultationForm();
                currentConsultingAppointmentId = null;
            }
        }
    } catch (error) {
        console.error('移除掛號錯誤:', error);
        showToast('移除掛號時發生錯誤', 'error');
    } finally {
        if (loadingButton) {
            clearButtonLoading(loadingButton);
        }
    }
}

        

        
 // 4. 修改開始診症函數，支援 Firebase
async function startConsultation(appointmentId) {
    // 在開始新的診症前，清除先前留存的套票變更記錄，
    // 以免不同病人的操作互相影響。
    pendingPackageChanges = [];
    const appointment = appointments.find(apt => apt && String(apt.id) === String(appointmentId));
    if (!appointment) {
        showToast('找不到掛號記錄！', 'error');
        return;
    }
    // 取得觸發按鈕。使用通用輔助函式以簡化後續程式碼。
    // 使用模板字串產生動態選擇器，以正確包含 appointmentId
    let loadingButton = getLoadingButtonFromEvent(`button[onclick="startConsultation(${appointmentId})"]`);
    if (loadingButton) {
        setButtonLoading(loadingButton, '處理中...');
    }
    try {
        // 從 Firebase 獲取病人資料
        const result = await window.firebaseDataManager.getPatients();
        if (!result.success) {
            showToast('無法讀取病人資料！', 'error');
            return;
        }
        const patient = result.data.find(p => p.id === appointment.patientId);
        if (!patient) {
            showToast('找不到病人資料！', 'error');
            return;
        }
        // 檢查當前用戶是否為該掛號的醫師
        if (!currentUserData || currentUserData.position !== '醫師' || appointment.appointmentDoctor !== currentUserData.username) {
            showToast('只有該掛號的醫師才能開始診症！', 'error');
            return;
        }
        // 詳細狀態檢查
        console.log(`開始診症狀態檢查 - 病人: ${patient.name}, 當前狀態: ${appointment.status}`);
        // 檢查病人狀態是否允許開始診症
        if (!['waiting', 'registered'].includes(appointment.status)) {
            const statusNames = {
                'consulting': '診症中',
                'completed': '已完成'
            };
            const currentStatusName = statusNames[appointment.status] || appointment.status;
            showToast(`無法開始診症！病人 ${patient.name} 目前狀態為「${currentStatusName}」，只能對「已掛號」或「候診中」的病人開始診症。`, 'error');
            return;
        }
        // 如果是已掛號狀態，自動確認到達
        if (appointment.status === 'registered') {
            appointment.arrivedAt = new Date().toISOString();
            appointment.confirmedBy = currentUserData ? currentUserData.username : currentUser;
            showToast(`${patient.name} 已自動確認到達`, 'info');
        }
        // 檢查是否已有其他病人在診症中（只檢查同一醫師的病人）
        const consultingAppointment = appointments.find(apt =>
            apt &&
            apt.status === 'consulting' &&
            String(apt.id) !== String(appointmentId) &&
            apt.appointmentDoctor === currentUserData.username &&
            new Date(apt.appointmentTime).toDateString() === new Date().toDateString()
        );
        if (consultingAppointment) {
            const consultingPatient = result.data.find(p => p.id === consultingAppointment.patientId);
            const consultingPatientName = consultingPatient ? consultingPatient.name : '未知病人';
            if (confirm(`您目前正在為 ${consultingPatientName} 診症。\n\n是否要結束該病人的診症並開始為 ${patient.name} 診症？\n\n注意：${consultingPatientName} 的狀態將改回候診中。`)) {
                consultingAppointment.status = 'waiting';
                delete consultingAppointment.consultationStartTime;
                delete consultingAppointment.consultingDoctor;
                if (String(currentConsultingAppointmentId) === String(consultingAppointment.id)) {
                    closeConsultationForm();
                }
                showToast(`已結束 ${consultingPatientName} 的診症`, 'info');
            } else {
                return;
            }
        }
        // 開始新的診症
        appointment.status = 'consulting';
        appointment.consultationStartTime = new Date().toISOString();
        appointment.consultingDoctor = currentUserData ? currentUserData.username : currentUser;
        localStorage.setItem('appointments', JSON.stringify(appointments));
        await window.firebaseDataManager.updateAppointment(String(appointment.id), appointment);
        currentConsultingAppointmentId = appointmentId;
        showConsultationForm(appointment);
        loadTodayAppointments();
        showToast(`開始為 ${patient.name} 診症`, 'success');
    } catch (error) {
        console.error('開始診症錯誤:', error);
        showToast('開始診症時發生錯誤', 'error');
    } finally {
        if (loadingButton) {
            clearButtonLoading(loadingButton);
        }
    }
}
        
        // 繼續診症
        async function continueConsultation(appointmentId) {
            // 取得按鈕並顯示讀取狀態
            let loadingButton = null;
            try {
                if (typeof event !== 'undefined' && event && event.currentTarget) {
                    loadingButton = event.currentTarget;
                }
            } catch (_e) {}
            if (!loadingButton) {
                try {
                    loadingButton = document.querySelector('button[onclick="continueConsultation(' + appointmentId + ')"]');
                } catch (_e) {
                    loadingButton = null;
                }
            }
            if (loadingButton) {
                setButtonLoading(loadingButton, '處理中...');
            }
            try {
                const appointment = appointments.find(apt => apt && String(apt.id) === String(appointmentId));
                if (!appointment) {
                    showToast('找不到掛號記錄！', 'error');
                    return;
                }
                currentConsultingAppointmentId = appointmentId;
                // 等待顯示表單完成，因其可能涉及異步操作
                await showConsultationForm(appointment);
            } catch (error) {
                console.error('繼續診症錯誤:', error);
                showToast('繼續診症時發生錯誤', 'error');
            } finally {
                if (loadingButton) {
                    clearButtonLoading(loadingButton);
                }
            }
        }
        
// 修復診症表單顯示函數
async function showConsultationForm(appointment) {
    try {
        // 從 Firebase 獲取病人資料
        const result = await window.firebaseDataManager.getPatients();
        if (!result.success) {
            showToast('無法讀取病人資料！', 'error');
            return;
        }
        
        const patient = result.data.find(p => p.id === appointment.patientId);
        if (!patient) {
            showToast('找不到病人資料！', 'error');
            return;
        }
        
        // 設置病人資訊
        // 顯示病人姓名與編號
        document.getElementById('formPatientName').textContent = `${patient.name} (${patient.patientNumber})`;
        // 顯示掛號時間
        document.getElementById('formAppointmentTime').textContent = new Date(appointment.appointmentTime).toLocaleString('zh-TW');
        // 顯示病人年齡，若沒有出生日期則顯示「未知」
        const ageEl = document.getElementById('formPatientAge');
        if (ageEl) {
            ageEl.textContent = formatAge(patient.birthDate);
        }
        // 顯示病人性別，若沒有資料則顯示「未知」
        const genderEl = document.getElementById('formPatientGender');
        if (genderEl) {
            genderEl.textContent = patient.gender || '未知';
        }
        // 顯示過敏史，如果有資料則填入並顯示容器，否則隱藏容器
        const allergiesContainer = document.getElementById('allergiesContainer');
        const allergiesEl = document.getElementById('formPatientAllergies');
        if (allergiesContainer && allergiesEl) {
            if (patient.allergies) {
                allergiesEl.textContent = patient.allergies;
                allergiesContainer.style.display = '';
            } else {
                allergiesEl.textContent = '';
                allergiesContainer.style.display = 'none';
            }
        }
        // 顯示病史及備註，如果有資料則填入並顯示容器，否則隱藏容器
        const historyContainer = document.getElementById('historyContainer');
        const historyEl = document.getElementById('formPatientHistory');
        if (historyContainer && historyEl) {
            if (patient.history) {
                historyEl.textContent = patient.history;
                historyContainer.style.display = '';
            } else {
                historyEl.textContent = '';
                historyContainer.style.display = 'none';
            }
        }
        // 渲染病人療程/套餐資訊
        renderPatientPackages(patient.id);
        
        // 檢查是否為編輯模式
        if (appointment.status === 'completed' && appointment.consultationId) {
            // 編輯模式：從 Firebase 載入現有診症記錄
            await loadConsultationForEdit(appointment.consultationId);
        } else {
            // 新診症模式：使用空白表單
            clearConsultationForm();
            
            // 設置預設值
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const localDateTime = `${year}-${month}-${day}T${hours}:${minutes}`;
            document.getElementById('formVisitTime').value = localDateTime;
            
            // 設置預設休息期間
            const startDate = new Date();
            const endDate = new Date();
            // 預設休息期間為一天，結束日期與開始日期相同
            endDate.setDate(startDate.getDate());
            
            const startDateStr = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`;
            const endDateStr = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;
            
            document.getElementById('formRestStartDate').value = startDateStr;
            document.getElementById('formRestEndDate').value = endDateStr;
            updateRestPeriod();

            // 設置預設複診時間為診症當天的 7 天後，時間保持與到診時間一致
            try {
                const followUp = new Date(now);
                followUp.setDate(followUp.getDate() + 7);
                const fYear = followUp.getFullYear();
                const fMonth = String(followUp.getMonth() + 1).padStart(2, '0');
                const fDay = String(followUp.getDate()).padStart(2, '0');
                const fHours = String(followUp.getHours()).padStart(2, '0');
                const fMinutes = String(followUp.getMinutes()).padStart(2, '0');
                document.getElementById('formFollowUpDate').value = `${fYear}-${fMonth}-${fDay}T${fHours}:${fMinutes}`;
            } catch (_e) {
                console.warn('無法設定預設複診時間', _e);
            }
            
            // 嘗試從 Firestore 取得問診資料，用於預填主訴與現病史。
            // 這裡不再使用 appointment.inquiryData，本地僅保存 inquiryId 與摘要。
            let inquiryDataForPrefill = null;
            if (appointment && appointment.inquiryId) {
                try {
                    // 對病人姓名進行修剪，避免前後空白導致查詢不到
                    const nameForSearch = patient && patient.name ? String(patient.name).trim() : '';
                    let inquiryResult = await window.firebaseDataManager.getInquiryRecords(nameForSearch);
                    let rec = null;
                    if (inquiryResult && inquiryResult.success && Array.isArray(inquiryResult.data)) {
                        rec = inquiryResult.data.find(r => String(r.id) === String(appointment.inquiryId));
                    }
                    // 如果按姓名查詢找不到，改為查詢所有記錄再搜尋 id
                    if (!rec) {
                        try {
                            const allResult = await window.firebaseDataManager.getInquiryRecords('');
                            if (allResult && allResult.success && Array.isArray(allResult.data)) {
                                rec = allResult.data.find(r => String(r.id) === String(appointment.inquiryId));
                            }
                        } catch (e2) {
                            console.warn('取得全部問診記錄時發生錯誤:', e2);
                        }
                    }
                    if (rec && rec.data) {
                        inquiryDataForPrefill = rec.data;
                    }
                } catch (err) {
                    console.error('取得問診資料時發生錯誤:', err);
                }
            }

            // 如果掛號時有問診摘要且未填寫主訴或主訴為預設，優先使用問診摘要
            const symptomsField = document.getElementById('formSymptoms');
            if (symptomsField) {
                if (appointment && appointment.inquirySummary && (!appointment.chiefComplaint || appointment.chiefComplaint === '無特殊主訴')) {
                    symptomsField.value = appointment.inquirySummary;
                } else if (appointment.chiefComplaint && appointment.chiefComplaint !== '無特殊主訴') {
                    symptomsField.value = appointment.chiefComplaint;
                }
                // 根據問診資料進一步完善主訴摘要
                if (inquiryDataForPrefill) {
                    const newSummary = generateSymptomSummaryFromInquiry(inquiryDataForPrefill);
                    if (newSummary) {
                        const currentVal = symptomsField.value ? symptomsField.value.trim() : '';
                        // 如果目前為空或與問診摘要/主訴一致，則直接覆蓋；否則附加在後
                        if (!currentVal || currentVal === appointment.inquirySummary || currentVal === appointment.chiefComplaint || currentVal === '無特殊主訴') {
                            symptomsField.value = newSummary;
                        } else {
                            symptomsField.value = currentVal + '\n' + newSummary;
                        }
                    }
                }
            }
            // 根據問診資料填充現病史欄位
            if (inquiryDataForPrefill) {
                const historyField = document.getElementById('formCurrentHistory');
                if (historyField) {
                    const historySummary = generateHistorySummaryFromInquiry(inquiryDataForPrefill);
                    if (historySummary) {
                        const currentHistory = historyField.value ? historyField.value.trim() : '';
                        if (!currentHistory) {
                            historyField.value = historySummary;
                        } else {
                            historyField.value = currentHistory + '\n' + historySummary;
                        }
                    }
                }
            }

            // 自動添加預設診金收費項目
            addDefaultConsultationFee(patient);
            
            // 安全獲取診症儲存按鈕文本元素，避免為 null 時出錯
            const saveButtonTextElNew = document.getElementById('consultationSaveButtonText');
            if (saveButtonTextElNew) {
                saveButtonTextElNew.textContent = '完成診症';
            } else {
                // 若找不到元素，則紀錄警告並跳過，不造成程式崩潰
                console.warn('consultationSaveButtonText element not found when starting consultation. Skipping text update.');
            }
        }
        
        document.getElementById('consultationForm').classList.remove('hidden');
        
        // 滾動到表單位置
        document.getElementById('consultationForm').scrollIntoView({ behavior: 'smooth' });
        
    } catch (error) {
        console.error('顯示診症表單錯誤:', error);
        showToast('載入診症表單時發生錯誤', 'error');
    }
}
        

        
        // 清空診症表單
        function clearConsultationForm() {
            ['formSymptoms', 'formTongue', 'formPulse', 'formCurrentHistory', 'formDiagnosis', 'formSyndrome', 'formAcupunctureNotes', 'formPrescription', 'formFollowUpDate', 'formVisitTime', 'formRestStartDate', 'formRestEndDate'].forEach(id => {
                document.getElementById(id).value = '';
            });
            
            // 重置服藥日數和次數為預設值
            document.getElementById('medicationDays').value = '5';
            document.getElementById('medicationFrequency').value = '2';
            
            // 重置休息期間顯示
            document.getElementById('restPeriodDisplay').textContent = '請選擇開始和結束日期';
            document.getElementById('restPeriodDisplay').className = 'text-sm text-gray-500 font-medium';
            
            // 設置預設值
            // 將預設服用方法由「早晚一次，飯後服」改為「溫水化開，飯後服」
            document.getElementById('formUsage').value = '溫水化開，飯後服';
            document.getElementById('formInstructions').value = '注意休息，飲食清淡';
            document.getElementById('formTreatmentCourse').value = '一周';
            
            // 清空處方項目
            selectedPrescriptionItems = [];
            updatePrescriptionDisplay();
            clearPrescriptionSearch();
            
            // 清空收費項目（但會在 prefillWithPreviousRecord 中自動添加診金）
            selectedBillingItems = [];
            updateBillingDisplay();
            clearBillingSearch();
        }
        
        // 關閉診症表單
        async function closeConsultationForm() {
            // 在關閉表單前，如有暫存的套票使用變更且尚未保存，嘗試回復。
            try {
                if (pendingPackageChanges && pendingPackageChanges.length > 0) {
                    await revertPendingPackageChanges();
                }
            } catch (_e) {
                // 若回復失敗，仍繼續關閉表單
            }
            // 隱藏診症表單
            document.getElementById('consultationForm').classList.add('hidden');
            
            // 清理全域變數
            currentConsultingAppointmentId = null;
            
            // 清空處方和收費項目選擇
            selectedPrescriptionItems = [];
            selectedBillingItems = [];
            
            // 滾動回頂部
            document.getElementById('consultationSystem').scrollIntoView({ behavior: 'smooth' });
        }
        
        // 取消診症
        async function cancelConsultation() {
            // 顯示讀取圈：嘗試取得觸發按鈕，如果無法從事件取得，則透過查詢尋找具有 cancelConsultation() 的按鈕
            let loadingButton = null;
            try {
                if (typeof event !== 'undefined' && event && event.currentTarget) {
                    loadingButton = event.currentTarget;
                }
            } catch (_e) {
                // 忽略錯誤
            }
            if (!loadingButton) {
                try {
                    loadingButton = document.querySelector('button[onclick="cancelConsultation()"]');
                } catch (_e) {
                    loadingButton = null;
                }
            }
            if (loadingButton) {
                // 顯示讀取圈，不顯示文字
                setButtonLoading(loadingButton, '處理中...');
            }
            try {
                if (!currentConsultingAppointmentId) {
                    closeConsultationForm();
                    return;
                }
                // 使用字串比較 ID，避免數字與字串不一致導致匹配失敗
                const appointment = appointments.find(apt => apt && String(apt.id) === String(currentConsultingAppointmentId));
                if (!appointment) {
                    closeConsultationForm();
                    currentConsultingAppointmentId = null;
                    return;
                }
                const patientResult = await window.firebaseDataManager.getPatients();
                if (!patientResult.success) {
                    showToast('無法讀取病人資料！', 'error');
                    closeConsultationForm();
                    currentConsultingAppointmentId = null;
                    return;
                }
                const patient = patientResult.data.find(p => p.id === appointment.patientId);
                if (!patient) {
                    showToast('找不到病人資料！', 'error');
                    closeConsultationForm();
                    currentConsultingAppointmentId = null;
                    return;
                }
                // 詳細狀態檢查
                console.log(`取消診症狀態檢查 - 病人: ${patient.name}, 當前狀態: ${appointment.status}`);
                if (appointment.status === 'consulting') {
                    const confirmMessage = `確定要取消 ${patient.name} 的診症嗎？\n\n` +
                        `病人狀態將回到候診中，已填寫的診症內容將會遺失。\n\n` +
                        `注意：此操作無法復原！`;
                    if (confirm(confirmMessage)) {
                        // 將狀態改回候診中
                        appointment.status = 'waiting';
                        delete appointment.consultationStartTime;
                        delete appointment.consultingDoctor;
                        // 保存狀態變更
                        localStorage.setItem('appointments', JSON.stringify(appointments));
                        // 同步更新到 Firebase
                        await window.firebaseDataManager.updateAppointment(String(appointment.id), appointment);
                        // 回復暫存套票變更
                        await revertPendingPackageChanges();
                        showToast(`已取消 ${patient.name} 的診症，病人回到候診狀態`, 'info');
                        // 關閉表單並清理
                        closeConsultationForm();
                        currentConsultingAppointmentId = null;
                        loadTodayAppointments();
                    }
                } else if (appointment.status === 'completed') {
                    // 如果是已完成的診症，只是關閉編輯模式
                    await revertPendingPackageChanges();
                    showToast('已退出病歷編輯模式', 'info');
                    closeConsultationForm();
                    currentConsultingAppointmentId = null;
                } else {
                    // 其他狀態直接關閉
                    await revertPendingPackageChanges();
                    closeConsultationForm();
                    currentConsultingAppointmentId = null;
                }
            } finally {
                // 移除讀取圈，恢復按鈕
                if (loadingButton) {
                    clearButtonLoading(loadingButton);
                }
            }
        }
        
        // 儲存診症記錄（醫師操作）
async function saveConsultation() {
    if (!currentConsultingAppointmentId) {
        showToast('系統錯誤：找不到診症記錄！', 'error');
        return;
    }
    
    const symptoms = document.getElementById('formSymptoms').value.trim();
    const diagnosis = document.getElementById('formDiagnosis').value.trim();
    
    if (!symptoms || !diagnosis) {
        showToast('請填寫必填欄位：主訴、中醫診斷！', 'error');
        return;
    }
    // 取得當前掛號資訊並判斷是否為編輯模式，供後續預處理和保存使用
    const appointment = appointments.find(apt => apt && String(apt.id) === String(currentConsultingAppointmentId));
    // 判斷是否為編輯模式：掛號狀態為已完成且存在 consultationId
    const isEditing = appointment && appointment.status === 'completed' && appointment.consultationId;
        // 預處理套票購買和立即使用（僅在非編輯模式下處理，以免重複購買）
    if (appointment && !isEditing && Array.isArray(selectedBillingItems)) {
        try {
            // 找到所有套票項目
            const packageItems = selectedBillingItems.filter(item => item && item.category === 'package');
            // 對每個套票項目按購買數量進行處理
            for (const item of packageItems) {
                // 確保數量至少為 1，無效值預設為 1
                const qty = Math.max(1, Number(item.quantity) || 1);
                // 依據數量逐次購買套票
                for (let i = 0; i < qty; i++) {
                    // 先購買套票
                    const purchasedPackage = await purchasePackage(appointment.patientId, item);
                    if (purchasedPackage) {
                        // 套票購買成功後，詢問是否立即使用第一次（每張套票都詢問一次）
                        const confirmUse = confirm(
                            `套票「${item.name}」購買成功！\n\n是否立即使用第一次？\n\n套票詳情：\n• 總次數：${item.packageUses} 次\n• 有效期：${item.validityDays} 天`
                        );
                        if (confirmUse) {
                            // 立即使用一次套票
                            const useResult = await consumePackage(appointment.patientId, purchasedPackage.id);
                            if (useResult.ok) {
                                // 添加套票使用記錄到收費項目中
                                const usedName = `${item.name} (使用套票)`;
                                // 將 patientId 與 packageRecordId 轉為字串儲存，以避免後續比較時類型不一致導致匹配錯誤
                                selectedBillingItems.push({
                                    // 包含索引避免在快速迴圈中生成相同的時間戳導致重複 ID
                                    id: `use-${purchasedPackage.id}-${Date.now()}-${i}`,
                                    name: usedName,
                                    category: 'packageUse',
                                    price: 0,
                                    unit: '次',
                                    description: '套票抵扣一次',
                                    quantity: 1,
                                    // 套票使用不參與折扣
                                    includedInDiscount: false,
                                    patientId: (appointment.patientId !== undefined && appointment.patientId !== null) ? String(appointment.patientId) : '',
                                    packageRecordId: (purchasedPackage && purchasedPackage.id) ? String(purchasedPackage.id) : ''
                                });
                                showToast(
                                    `已使用套票：${item.name}，剩餘 ${useResult.record.remainingUses} 次`,
                                    'info'
                                );
                            } else {
                                showToast(`使用套票失敗：${useResult.msg}`, 'error');
                            }
                        }
                    } else {
                        // 購買失敗
                        showToast(`套票「${item.name}」購買失敗`, 'error');
                    }
                }
            }
            // 重新更新收費顯示，確保套票使用記錄被包含在最終的診症記錄中
            updateBillingDisplay();
        } catch (e) {
            console.error('預處理套票購買時發生錯誤：', e);
        }
    }

    // 在進入 try 區塊之前禁用保存按鈕並顯示讀取中小圈
    // 由於 saveConsultation 函式可能透過 onclick 直接呼叫，
    // 無法保證 event 物件始終存在，故使用通用輔助函式取得按鈕。
    let saveButton = getLoadingButtonFromEvent('button[onclick="saveConsultation()"]');
    if (saveButton) {
        // 傳入的文字僅用於語意描述，實際 setButtonLoading 只顯示讀取圈
        setButtonLoading(saveButton, '保存中...');
    }
    try {
        // 確認預先取得的 appointment 是否存在，若不存在則提示錯誤
        if (!appointment) {
            showToast('找不到掛號記錄！', 'error');
            return;
        }

        // Assemble consultation data common to both new and edit operations
        const consultationData = {
            appointmentId: currentConsultingAppointmentId,
            patientId: appointment.patientId,
            symptoms: symptoms,
            tongue: document.getElementById('formTongue').value.trim(),
            pulse: document.getElementById('formPulse').value.trim(),
            currentHistory: document.getElementById('formCurrentHistory').value.trim(),
            diagnosis: diagnosis,
            syndrome: document.getElementById('formSyndrome').value.trim(),
            acupunctureNotes: document.getElementById('formAcupunctureNotes').value.trim(),
            prescription: document.getElementById('formPrescription').value.trim(),
            usage: document.getElementById('formUsage').value.trim(),
            treatmentCourse: document.getElementById('formTreatmentCourse').value.trim(),
            instructions: document.getElementById('formInstructions').value.trim(),
            followUpDate: document.getElementById('formFollowUpDate').value,
            visitTime: document.getElementById('formVisitTime').value,
            restStartDate: document.getElementById('formRestStartDate').value,
            restEndDate: document.getElementById('formRestEndDate').value,
            billingItems: document.getElementById('formBillingItems').value.trim(),
            // date and doctor fields are assigned below depending on whether this is a new record or an edit
            status: 'completed'
        };

        // Determine whether this is an edit of an existing consultation or a new one
        // isEditing 已在函式開始時定義，這裡直接使用
        let operationSuccess = false;
        if (isEditing) {
            // For editing we preserve the original date and doctor information if available
            let existing = consultations.find(c => c.id === appointment.consultationId);
            if (!existing) {
                const consResult = await window.firebaseDataManager.getConsultations();
                if (consResult && consResult.success) {
                    existing = consResult.data.find(c => c.id === appointment.consultationId);
                }
            }
            consultationData.date = existing && existing.date ? existing.date : new Date();
            consultationData.doctor = existing && existing.doctor ? existing.doctor : currentUser;
            // Update the existing consultation record
            const updateResult = await window.firebaseDataManager.updateConsultation(String(appointment.consultationId), consultationData);
            if (updateResult && updateResult.success) {
                operationSuccess = true;
                // Update local cache if present
                const idx = consultations.findIndex(c => c.id === appointment.consultationId);
                if (idx >= 0) {
                    consultations[idx] = { ...consultations[idx], ...consultationData, updatedAt: new Date(), updatedBy: currentUser };
                }
                showToast('診症記錄已更新！', 'success');
            } else {
                showToast('更新診症記錄失敗，請稍後再試', 'error');
            }
        } else {
            // New consultation: assign the current date and doctor
            // 為新的病歷產生一個唯一的病歷編號
            consultationData.medicalRecordNumber = generateMedicalRecordNumber();
            consultationData.date = new Date();
            consultationData.doctor = currentUser;
            const result = await window.firebaseDataManager.addConsultation(consultationData);
            if (result && result.success) {
                operationSuccess = true;
                // Update appointment status and metadata
                appointment.status = 'completed';
                appointment.completedAt = new Date().toISOString();
                appointment.consultationId = result.id;
                appointment.completedBy = currentUser;
                localStorage.setItem('appointments', JSON.stringify(appointments));
                await window.firebaseDataManager.updateAppointment(String(appointment.id), appointment);
                showToast('診症記錄已保存！', 'success');
            } else {
                showToast('保存診症記錄失敗，請稍後再試', 'error');
            }
        }

        if (operationSuccess) {
            // 保存成功時，先提交本地暫存的套票變更至資料庫
            await commitPendingPackageChanges();
            // 提交後清空暫存變更，表示這些變更已經正式記錄，不需要再撤銷。
            pendingPackageChanges = [];
            // 完成後關閉診症表單並更新 UI
            closeConsultationForm();
            loadTodayAppointments();
            updateStatistics();
            clearAllSearchFields();
        }

    } catch (error) {
        console.error('保存診症記錄錯誤:', error);
        showToast('保存時發生錯誤', 'error');
    } finally {
        // 恢復按鈕狀態與內容。使用前面取得的 saveButton 以避免重複查找。
        if (saveButton) {
            clearButtonLoading(saveButton);
        }
    }
}
        
        // 病人資料管理頁面的病歷查看功能
        let currentPatientConsultations = [];
        let currentPatientHistoryPage = 0;
        
        async function showPatientMedicalHistory(patientId) {
    try {
const patientResult = await window.firebaseDataManager.getPatients();
if (!patientResult.success) {
    showToast('無法讀取病人資料！', 'error');
    return;
}

const patient = patientResult.data.find(p => p.id === patientId);
if (!patient) {
    showToast('找不到病人資料！', 'error');
    return;
}
            
            // 獲取該病人的所有診症記錄（從 Firestore 取得）
            const consultationResult = await window.firebaseDataManager.getPatientConsultations(patientId);
            if (!consultationResult.success) {
                showToast('無法讀取診症記錄！', 'error');
                return;
            }
            
            // 使用通用日期解析函式對資料進行排序，按日期升序排列（較舊至較新）
            currentPatientConsultations = consultationResult.data.slice().sort((a, b) => {
                const dateA = parseConsultationDate(a.date);
                const dateB = parseConsultationDate(b.date);
                // 若其中一個日期無法解析，將其放到較後面
                if (!dateA || isNaN(dateA.getTime())) return 1;
                if (!dateB || isNaN(dateB.getTime())) return -1;
                return dateA - dateB;
            });
            
            // 預設顯示最新的病歷（最近一次診症）
            currentPatientHistoryPage = currentPatientConsultations.length - 1;
            
            // 設置標題
            document.getElementById('patientMedicalHistoryTitle').textContent = `${patient.name} 的病歷記錄`;
            
            // 顯示病人基本資訊
            document.getElementById('patientMedicalHistoryPatientInfo').innerHTML = `
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                    <div>
                        <span class="font-medium text-gray-700">病人編號：</span>
                        <span class="text-blue-600 font-semibold">${patient.patientNumber}</span>
                    </div>
                    <div>
                        <span class="font-medium text-gray-700">姓名：</span>
                        <span class="font-semibold">${patient.name}</span>
                    </div>
                    <div>
                        <span class="font-medium text-gray-700">年齡：</span>
                        <span>${formatAge(patient.birthDate)}</span>
                    </div>
                    <div>
                        <span class="font-medium text-gray-700">性別：</span>
                        <span>${patient.gender}</span>
                    </div>
                ${patient.history ? `
                    <div class="md:col-span-1 lg:col-span-2">
                        <span class="font-medium text-gray-700">病史及備註：</span>
                        <span class="medical-field text-gray-700">${patient.history}</span>
                    </div>
                    ` : ''}
                ${patient.allergies ? `
                    <div class="md:col-span-1 lg:col-span-2">
                        <span class="font-medium text-red-600">過敏史：</span>
                        <span class="medical-field text-red-700 bg-red-50 px-2 py-1 rounded">${patient.allergies}</span>
                    </div>
                    ` : ''}
                </div>
            `;
            
            // 顯示分頁病歷記錄
            displayPatientMedicalHistoryPage();
            
            document.getElementById('patientMedicalHistoryModal').classList.remove('hidden');
            } catch (error) {
        console.error('讀取病人資料錯誤:', error);
        showToast('讀取病人資料失敗', 'error');
    }
        }
        
        function displayPatientMedicalHistoryPage() {
            const contentDiv = document.getElementById('patientMedicalHistoryContent');
            
            if (currentPatientConsultations.length === 0) {
                contentDiv.innerHTML = `
                    <div class="text-center py-12 text-gray-500">
                        <div class="text-4xl mb-4">📋</div>
                        <div class="text-lg font-medium mb-2">暫無診症記錄</div>
                        <div class="text-sm">該病人尚未有診症記錄</div>
                    </div>
                `;
                return;
            }
            
            const consultation = currentPatientConsultations[currentPatientHistoryPage];
            const totalPages = currentPatientConsultations.length;
            const currentPageNumber = currentPatientHistoryPage + 1;
            const consultationNumber = currentPatientHistoryPage + 1;
            
            contentDiv.innerHTML = `
                <!-- 分頁導航 -->
                <div class="mb-6 flex justify-between items-center bg-gray-50 rounded-lg p-4">
                    <div class="flex items-center space-x-4">
                        <h4 class="text-lg font-semibold text-gray-800">診症記錄</h4>
                        <span class="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
                            第 ${consultationNumber} 次診症
                        </span>
                        <span class="text-sm text-gray-600">
                            共 ${totalPages} 次診症記錄
                        </span>
                    </div>
                    
                    <div class="flex items-center space-x-2">
                        <button onclick="changePatientHistoryPage(-1)" 
                                ${currentPatientHistoryPage === 0 ? 'disabled' : ''}
                                class="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm">
                            ← 較舊
                        </button>
                        <span class="text-sm text-gray-600 px-2">
                            ${currentPageNumber} / ${totalPages}
                        </span>
                        <button onclick="changePatientHistoryPage(1)" 
                                ${currentPatientHistoryPage === totalPages - 1 ? 'disabled' : ''}
                                class="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm">
                            較新 →
                        </button>
                    </div>
                </div>
                
                <!-- 當前病歷記錄 -->
                <div class="border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                    <div class="bg-gradient-to-r from-gray-50 to-blue-50 px-6 py-4 border-b border-gray-200">
                        <div class="flex justify-between items-center">
                            <div class="flex items-center space-x-4">
                                <span class="font-semibold text-gray-900 text-lg">
                                    ${(() => {
                                        // 使用通用日期解析函式處理各種日期格式
                                        const parsedDate = parseConsultationDate(consultation.date);
                                        if (!parsedDate || isNaN(parsedDate.getTime())) {
                                            return '日期未知';
                                        }
                                        // 顯示日期和時間
                                        return parsedDate.toLocaleDateString('zh-TW') + ' ' + parsedDate.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
                                    })()}
                                </span>
                                <span class="text-sm text-gray-600 bg-white px-3 py-1 rounded">
                                    醫師：${getDoctorDisplayName(consultation.doctor)}
                                </span>
                                <span class="text-sm text-gray-600 bg-white px-3 py-1 rounded">
                                    病歷編號：${consultation.medicalRecordNumber || consultation.id}
                                </span>
                                ${consultation.updatedAt ? `
                                    <span class="text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded">
                                        已修改
                                    </span>
                                ` : ''}
                            </div>
                            <div class="flex space-x-2">
                                <button onclick="printConsultationRecord('${consultation.id}')" 
                                        class="text-green-600 hover:text-green-800 text-sm font-medium bg-green-50 px-3 py-2 rounded">
                                    列印收據
                                </button>
                                <!-- 新增藥單醫囑列印按鈕，放在收據右側 -->
                                <button onclick="printPrescriptionInstructions('${consultation.id}')" 
                                        class="text-yellow-600 hover:text-yellow-800 text-sm font-medium bg-yellow-50 px-3 py-2 rounded">
                                    藥單醫囑
                                </button>
                                <button onclick="printAttendanceCertificate('${consultation.id}')" 
                                        class="text-blue-600 hover:text-blue-800 text-sm font-medium bg-blue-50 px-3 py-2 rounded">
                                    到診證明
                                </button>
                                ${(() => {
                                    // 檢查是否正在診症且為相同病人
                                    if (currentConsultingAppointmentId) {
                                        const currentAppointment = appointments.find(apt => apt && String(apt.id) === String(currentConsultingAppointmentId));
                                        if (currentAppointment && String(currentAppointment.patientId) === String(consultation.patientId)) {
                                            return `
                                                <button onclick="loadMedicalRecordToCurrentConsultation('${consultation.id}')" 
                                                        class="text-blue-600 hover:text-blue-800 text-sm font-medium bg-blue-50 px-3 py-2 rounded">
                                                    📋 載入病歷
                                                </button>
                                            `;
                                        }
                                    }
                                    return '';
                                })()}
                            </div>
                        </div>
                    </div>
                    
                    <div class="p-6">
                        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <div class="space-y-4">
                                <div>
                                    <span class="text-sm font-semibold text-gray-700 block mb-2">主訴</span>
                                    <div class="bg-gray-50 p-3 rounded-lg text-sm text-gray-900 medical-field">${consultation.symptoms || '無記錄'}</div>
                                </div>
                                
                                ${consultation.tongue ? `
                                <div>
                                    <span class="text-sm font-semibold text-gray-700 block mb-2">舌象</span>
                                    <div class="bg-gray-50 p-3 rounded-lg text-sm text-gray-900 medical-field">${consultation.tongue}</div>
                                </div>
                                ` : ''}
                                
                                ${consultation.pulse ? `
                                <div>
                                    <span class="text-sm font-semibold text-gray-700 block mb-2">脈象</span>
                                    <div class="bg-gray-50 p-3 rounded-lg text-sm text-gray-900 medical-field">${consultation.pulse}</div>
                                </div>
                                ` : ''}
                                
                                ${consultation.currentHistory ? `
                                <div>
                                    <span class="text-sm font-semibold text-gray-700 block mb-2">現病史</span>
                                    <div class="bg-gray-50 p-3 rounded-lg text-sm text-gray-900 medical-field">${consultation.currentHistory}</div>
                                </div>
                                ` : ''}
                                
                                <div>
                                    <span class="text-sm font-semibold text-gray-700 block mb-2">中醫診斷</span>
                                    <div class="bg-green-50 p-3 rounded-lg text-sm text-gray-900 border-l-4 border-green-400 medical-field">${consultation.diagnosis || '無記錄'}</div>
                                </div>
                                
                                <div>
                                    <span class="text-sm font-semibold text-gray-700 block mb-2">證型診斷</span>
                                    <div class="bg-blue-50 p-3 rounded-lg text-sm text-gray-900 border-l-4 border-blue-400 medical-field">${consultation.syndrome || '無記錄'}</div>
                                </div>
                                
                                ${consultation.acupunctureNotes ? `
                                <div>
                                    <span class="text-sm font-semibold text-gray-700 block mb-2">針灸備註</span>
                                    <div class="bg-orange-50 p-3 rounded-lg text-sm text-gray-900 border-l-4 border-orange-400 medical-field">${consultation.acupunctureNotes}</div>
                                </div>
                                ` : ''}
                            </div>
                            
                            <div class="space-y-4">
                                <div>
                                    <span class="text-sm font-semibold text-gray-700 block mb-2">處方內容</span>
                                    <div class="bg-yellow-50 p-3 rounded-lg text-sm text-gray-900 border-l-4 border-yellow-400 whitespace-pre-line medical-field">${consultation.prescription || '無記錄'}</div>
                                </div>
                                
                                ${consultation.usage ? `
                                <div>
                                    <span class="text-sm font-semibold text-gray-700 block mb-2">服用方法</span>
                                    <div class="bg-gray-50 p-3 rounded-lg text-sm text-gray-900 medical-field">${consultation.usage}</div>
                                </div>
                                ` : ''}
                                
                                ${consultation.treatmentCourse ? `
                                <div>
                                    <span class="text-sm font-semibold text-gray-700 block mb-2">療程</span>
                                    <div class="bg-gray-50 p-3 rounded-lg text-sm text-gray-900 medical-field">${consultation.treatmentCourse}</div>
                                </div>
                                ` : ''}
                                
                                ${consultation.instructions ? `
                                <div>
                                    <span class="text-sm font-semibold text-gray-700 block mb-2">醫囑及注意事項</span>
                                    <div class="bg-red-50 p-3 rounded-lg text-sm text-gray-900 border-l-4 border-red-400 medical-field">${consultation.instructions}</div>
                                </div>
                                ` : ''}
                                
                                ${consultation.followUpDate ? `
                                <div>
                                    <span class="text-sm font-semibold text-gray-700 block mb-2">複診時間</span>
                                    <div class="bg-purple-50 p-3 rounded-lg text-sm text-gray-900 border-l-4 border-purple-400 medical-field">${new Date(consultation.followUpDate).toLocaleString('zh-TW')}</div>
                                </div>
                                ` : ''}
                                
                                ${consultation.billingItems ? `
                                <div>
                                    <span class="text-sm font-semibold text-gray-700 block mb-2">收費項目</span>
                                    <div class="bg-green-50 p-3 rounded-lg text-sm text-gray-900 border-l-4 border-green-400 whitespace-pre-line medical-field">${consultation.billingItems}</div>
                                </div>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
        
        function changePatientHistoryPage(direction) {
            const newPage = currentPatientHistoryPage + direction;
            if (newPage >= 0 && newPage < currentPatientConsultations.length) {
                currentPatientHistoryPage = newPage;
                displayPatientMedicalHistoryPage();
            }
        }

        // 關閉病人病歷查看彈窗
        function closePatientMedicalHistoryModal() {
            document.getElementById('patientMedicalHistoryModal').classList.add('hidden');
        }



        // 診症系統中的病歷查看功能
        let currentConsultationConsultations = [];
        let currentConsultationHistoryPage = 0;
        
// 5. 修改查看病人診症記錄功能
async function viewPatientMedicalHistory(patientId) {
    // 取得觸發按鈕：優先使用事件目標，其次透過 DOM 查找
    let loadingButton = null;
    try {
        if (typeof event !== 'undefined' && event && event.currentTarget) {
            loadingButton = event.currentTarget;
        }
    } catch (_e) {}
    if (!loadingButton) {
        try {
            loadingButton = document.querySelector(`button[onclick="viewPatientMedicalHistory('${patientId}')"]`);
        } catch (_e) {
            loadingButton = null;
        }
    }
    if (loadingButton) {
        setButtonLoading(loadingButton, '讀取中...');
    }
    try {
        // 從 Firebase 獲取病人資料
        const patientResult = await window.firebaseDataManager.getPatients();
        if (!patientResult.success) {
            showToast('無法讀取病人資料', 'error');
            return;
        }
        
        const patient = patientResult.data.find(p => p.id === patientId);
        if (!patient) {
            showToast('找不到病人資料', 'error');
            return;
        }
        
        // 獲取該病人的所有診症記錄
        const consultationResult = await window.firebaseDataManager.getPatientConsultations(patientId);
        if (!consultationResult.success) {
            showToast('無法讀取診症記錄', 'error');
            return;
        }

        /**
         * Firebase 回傳的診症記錄預設按照日期降序（最新在前），
         * 但在病歷瀏覽頁面中希望將順序調整為「較舊在左、最新在右」。
         * 因此這裡先複製一份資料，再使用日期進行升序排序，
         * 並將當前頁索引設為最後一筆，確保進入頁面時顯示最新的一次診症。
         */
        currentConsultationConsultations = consultationResult.data.slice().sort((a, b) => {
            const dateA = parseConsultationDate(a.date);
            const dateB = parseConsultationDate(b.date);
            // 若其中一個日期無法解析，將其放到較後面
            if (!dateA || isNaN(dateA.getTime())) return 1;
            if (!dateB || isNaN(dateB.getTime())) return -1;
            return dateA - dateB;
        });

        // 預設顯示最新的病歷（最近一次診症在最右）
        currentConsultationHistoryPage = currentConsultationConsultations.length - 1;
        
        // 設置標題（轉義使用者輸入，避免 XSS）
        document.getElementById('medicalHistoryTitle').textContent = `${window.escapeHtml(patient.name)} 的診症記錄`;
        
        // 顯示病人基本資訊
        document.getElementById('medicalHistoryPatientInfo').innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                <div>
                    <span class="font-medium text-gray-700">病人編號：</span>
            <span class="text-blue-600 font-semibold">${window.escapeHtml(patient.patientNumber)}</span>
                </div>
                <div>
                    <span class="font-medium text-gray-700">姓名：</span>
            <span class="font-semibold">${window.escapeHtml(patient.name)}</span>
                </div>
                <div>
                    <span class="font-medium text-gray-700">年齡：</span>
            <span>${window.escapeHtml(formatAge(patient.birthDate))}</span>
                </div>
                <div>
                    <span class="font-medium text-gray-700">性別：</span>
            <span>${window.escapeHtml(patient.gender)}</span>
                </div>
                ${patient.history ? `
                <div class="md:col-span-1 lg:col-span-2">
                    <span class="font-medium text-gray-700">病史及備註：</span>
                    <span class="medical-field text-gray-700">${window.escapeHtml(patient.history)}</span>
                </div>
                ` : ''}
                ${patient.allergies ? `
                <div class="md:col-span-1 lg:col-span-2">
                    <span class="font-medium text-red-600">過敏史：</span>
                    <span class="medical-field text-red-700 bg-red-50 px-2 py-1 rounded">${window.escapeHtml(patient.allergies)}</span>
                </div>
                ` : ''}
            </div>
        `;
        
        // 顯示分頁病歷記錄
        displayConsultationMedicalHistoryPage();
        
        document.getElementById('medicalHistoryModal').classList.remove('hidden');
        
    } catch (error) {
        console.error('查看病人診症記錄錯誤:', error);
        showToast('讀取病人資料失敗', 'error');
    } finally {
        // 清除按鈕的讀取狀態
        if (loadingButton) {
            clearButtonLoading(loadingButton);
        }
    }
}
        
// 修復病歷記錄顯示中的日期問題
function displayConsultationMedicalHistoryPage() {
    const contentDiv = document.getElementById('medicalHistoryContent');
    
    if (currentConsultationConsultations.length === 0) {
        contentDiv.innerHTML = `
            <div class="text-center py-12 text-gray-500">
                <div class="text-4xl mb-4">📋</div>
                <div class="text-lg font-medium mb-2">暫無診症記錄</div>
                <div class="text-sm">該病人尚未有診症記錄</div>
            </div>
        `;
        return;
    }
    
    const consultation = currentConsultationConsultations[currentConsultationHistoryPage];
    const totalPages = currentConsultationConsultations.length;
    const currentPageNumber = currentConsultationHistoryPage + 1;
    const consultationNumber = currentConsultationHistoryPage + 1;
    
    contentDiv.innerHTML = `
        <!-- 分頁導航 -->
        <div class="mb-6 flex justify-between items-center bg-gray-50 rounded-lg p-4">
            <div class="flex items-center space-x-4">
                <h4 class="text-lg font-semibold text-gray-800">診症記錄</h4>
                <span class="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
                    第 ${consultationNumber} 次診症
                </span>
                <span class="text-sm text-gray-600">
                    共 ${totalPages} 次診症記錄
                </span>
            </div>
            
            <div class="flex items-center space-x-2">
                <button onclick="changeConsultationHistoryPage(-1)" 
                        ${currentConsultationHistoryPage === 0 ? 'disabled' : ''}
                        class="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm">
                    ← 較舊
                </button>
                <span class="text-sm text-gray-600 px-2">
                    ${currentPageNumber} / ${totalPages}
                </span>
                <button onclick="changeConsultationHistoryPage(1)" 
                        ${currentConsultationHistoryPage === totalPages - 1 ? 'disabled' : ''}
                        class="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm">
                    較新 →
                </button>
            </div>
        </div>
        
        <!-- 當前病歷記錄 -->
        <div class="border border-gray-200 rounded-lg overflow-hidden shadow-sm">
            <div class="bg-gradient-to-r from-gray-50 to-blue-50 px-6 py-4 border-b border-gray-200">
                <div class="flex justify-between items-center">
                    <div class="flex items-center space-x-4">
                        <span class="font-semibold text-gray-900 text-lg">
                            ${formatConsultationDateTime(consultation.date)}
                        </span>
                        <span class="text-sm text-gray-600 bg-white px-3 py-1 rounded">
                            醫師：${getDoctorDisplayName(consultation.doctor)}
                        </span>
                        <!-- 新增病歷編號顯示 -->
                        <span class="text-sm text-gray-600 bg-white px-3 py-1 rounded">
                            病歷編號：${consultation.medicalRecordNumber || consultation.id}
                        </span>
                        ${consultation.updatedAt ? `
                            <span class="text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded">
                                已修改
                            </span>
                        ` : ''}
                    </div>
                    <div class="flex space-x-2">
                        <button onclick="printConsultationRecord('${consultation.id}')" 
                                class="text-green-600 hover:text-green-800 text-sm font-medium bg-green-50 px-3 py-2 rounded">
                            列印收據
                        </button>
                        <!-- 新增藥單醫囑列印按鈕，放在收據右側 -->
                        <button onclick="printPrescriptionInstructions('${consultation.id}')" 
                                class="text-yellow-600 hover:text-yellow-800 text-sm font-medium bg-yellow-50 px-3 py-2 rounded">
                            藥單醫囑
                        </button>
                        <button onclick="printAttendanceCertificate('${consultation.id}')" 
                                class="text-blue-600 hover:text-blue-800 text-sm font-medium bg-blue-50 px-3 py-2 rounded">
                            到診證明
                        </button>
                        ${(() => {
                            // 檢查是否正在診症且為相同病人
                            if (currentConsultingAppointmentId) {
                                const currentAppointment = appointments.find(apt => apt && String(apt.id) === String(currentConsultingAppointmentId));
                                if (currentAppointment && String(currentAppointment.patientId) === String(consultation.patientId)) {
                                    return `
                                        <button onclick="loadMedicalRecordToCurrentConsultation('${consultation.id}')" 
                                                class="text-blue-600 hover:text-blue-800 text-sm font-medium bg-blue-50 px-3 py-2 rounded">
                                            📋 載入病歷
                                        </button>
                                    `;
                                }
                            }
                            return '';
                        })()}
                    </div>
                </div>
            </div>
            
            <div class="p-6">
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div class="space-y-4">
                        <div>
                            <span class="text-sm font-semibold text-gray-700 block mb-2">主訴</span>
                            <div class="bg-gray-50 p-3 rounded-lg text-sm text-gray-900 medical-field">${consultation.symptoms || '無記錄'}</div>
                        </div>
                        
                        ${consultation.tongue ? `
                        <div>
                            <span class="text-sm font-semibold text-gray-700 block mb-2">舌象</span>
                            <div class="bg-gray-50 p-3 rounded-lg text-sm text-gray-900 medical-field">${consultation.tongue}</div>
                        </div>
                        ` : ''}
                        
                        ${consultation.pulse ? `
                        <div>
                            <span class="text-sm font-semibold text-gray-700 block mb-2">脈象</span>
                            <div class="bg-gray-50 p-3 rounded-lg text-sm text-gray-900 medical-field">${consultation.pulse}</div>
                        </div>
                        ` : ''}
                        
                        ${consultation.currentHistory ? `
                        <div>
                            <span class="text-sm font-semibold text-gray-700 block mb-2">現病史</span>
                            <div class="bg-gray-50 p-3 rounded-lg text-sm text-gray-900 medical-field">${consultation.currentHistory}</div>
                        </div>
                        ` : ''}
                        
                        <div>
                            <span class="text-sm font-semibold text-gray-700 block mb-2">中醫診斷</span>
                            <div class="bg-green-50 p-3 rounded-lg text-sm text-gray-900 border-l-4 border-green-400 medical-field">${consultation.diagnosis || '無記錄'}</div>
                        </div>
                        
                        <div>
                            <span class="text-sm font-semibold text-gray-700 block mb-2">證型診斷</span>
                            <div class="bg-blue-50 p-3 rounded-lg text-sm text-gray-900 border-l-4 border-blue-400 medical-field">${consultation.syndrome || '無記錄'}</div>
                        </div>
                        
                        ${consultation.acupunctureNotes ? `
                        <div>
                            <span class="text-sm font-semibold text-gray-700 block mb-2">針灸備註</span>
                            <div class="bg-orange-50 p-3 rounded-lg text-sm text-gray-900 border-l-4 border-orange-400 medical-field">${consultation.acupunctureNotes}</div>
                        </div>
                        ` : ''}
                    </div>
                    
                    <div class="space-y-4">
                        <div>
                            <span class="text-sm font-semibold text-gray-700 block mb-2">處方內容</span>
                            <div class="bg-yellow-50 p-3 rounded-lg text-sm text-gray-900 border-l-4 border-yellow-400 whitespace-pre-line medical-field">${consultation.prescription || '無記錄'}</div>
                        </div>
                        
                        ${consultation.usage ? `
                        <div>
                            <span class="text-sm font-semibold text-gray-700 block mb-2">服用方法</span>
                            <div class="bg-gray-50 p-3 rounded-lg text-sm text-gray-900 medical-field">${consultation.usage}</div>
                        </div>
                        ` : ''}
                        
                        ${consultation.treatmentCourse ? `
                        <div>
                            <span class="text-sm font-semibold text-gray-700 block mb-2">療程</span>
                            <div class="bg-gray-50 p-3 rounded-lg text-sm text-gray-900 medical-field">${consultation.treatmentCourse}</div>
                        </div>
                        ` : ''}
                        
                        ${consultation.instructions ? `
                        <div>
                            <span class="text-sm font-semibold text-gray-700 block mb-2">醫囑及注意事項</span>
                            <div class="bg-red-50 p-3 rounded-lg text-sm text-gray-900 border-l-4 border-red-400 medical-field">${consultation.instructions}</div>
                        </div>
                        ` : ''}
                        
                        ${consultation.followUpDate ? `
                        <div>
                            <span class="text-sm font-semibold text-gray-700 block mb-2">複診時間</span>
                            <div class="bg-purple-50 p-3 rounded-lg text-sm text-gray-900 border-l-4 border-purple-400 medical-field">${formatConsultationDateTime(consultation.followUpDate)}</div>
                        </div>
                        ` : ''}
                        
                        ${consultation.billingItems ? `
                        <div>
                            <span class="text-sm font-semibold text-gray-700 block mb-2">收費項目</span>
                            <div class="bg-green-50 p-3 rounded-lg text-sm text-gray-900 border-l-4 border-green-400 whitespace-pre-line medical-field">${consultation.billingItems}</div>
                        </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        </div>
    `;
}
        
        function changeConsultationHistoryPage(direction) {
            const newPage = currentConsultationHistoryPage + direction;
            if (newPage >= 0 && newPage < currentConsultationConsultations.length) {
                currentConsultationHistoryPage = newPage;
                displayConsultationMedicalHistoryPage();
            }
        }
        
        // 關閉診症記錄彈窗
        function closeMedicalHistoryModal() {
            document.getElementById('medicalHistoryModal').classList.add('hidden');
        }
        

        
// 1. 修改從掛號記錄列印收據函數
async function printReceiptFromAppointment(appointmentId) {
    const appointment = appointments.find(apt => apt && String(apt.id) === String(appointmentId));
    if (!appointment) {
        showToast('找不到掛號記錄！', 'error');
        return;
    }
    // 只能列印已完成診症的收據
    if (appointment.status !== 'completed' || !appointment.consultationId) {
        showToast('只能列印已完成診症的收據！', 'error');
        return;
    }
    // 取得觸發按鈕，優先使用事件目標，其次透過 DOM 查找
    let loadingButton = null;
    try {
        if (typeof event !== 'undefined' && event && event.currentTarget) {
            loadingButton = event.currentTarget;
        }
    } catch (_e) {}
    if (!loadingButton) {
        try {
            loadingButton = document.querySelector('button[onclick="printReceiptFromAppointment(' + appointmentId + ')"]');
        } catch (_e) {
            loadingButton = null;
        }
    }
    if (loadingButton) {
        setButtonLoading(loadingButton, '列印中...');
    }
    try {
        // 從 Firebase 獲取診症記錄
        const consultationResult = await window.firebaseDataManager.getConsultations();
        if (!consultationResult.success) {
            showToast('無法讀取診症記錄！', 'error');
            return;
        }
        const consultation = consultationResult.data.find(c => c.id === appointment.consultationId);
        if (!consultation) {
            showToast('找不到對應的診症記錄！', 'error');
            return;
        }
        // 直接調用現有的列印功能
        await printConsultationRecord(consultation.id, consultation);
    } catch (error) {
        console.error('列印收據錯誤:', error);
        showToast('列印收據時發生錯誤', 'error');
    } finally {
        if (loadingButton) {
            clearButtonLoading(loadingButton);
        }
    }
}

        
// 2. 修改從掛號記錄列印到診證明函數
async function printAttendanceCertificateFromAppointment(appointmentId) {
    const appointment = appointments.find(apt => apt && String(apt.id) === String(appointmentId));
    if (!appointment) {
        showToast('找不到掛號記錄！', 'error');
        return;
    }
    // 只能列印已完成診症的到診證明
    if (appointment.status !== 'completed' || !appointment.consultationId) {
        showToast('只能列印已完成診症的到診證明！', 'error');
        return;
    }
    // 取得觸發按鈕
    let loadingButton = null;
    try {
        if (typeof event !== 'undefined' && event && event.currentTarget) {
            loadingButton = event.currentTarget;
        }
    } catch (_e) {}
    if (!loadingButton) {
        try {
            loadingButton = document.querySelector('button[onclick="printAttendanceCertificateFromAppointment(' + appointmentId + ')"]');
        } catch (_e) {
            loadingButton = null;
        }
    }
    if (loadingButton) {
        setButtonLoading(loadingButton, '列印中...');
    }
    try {
        // 從 Firebase 獲取診症記錄
        const consultationResult = await window.firebaseDataManager.getConsultations();
        if (!consultationResult.success) {
            showToast('無法讀取診症記錄！', 'error');
            return;
        }
        const consultation = consultationResult.data.find(c => c.id === appointment.consultationId);
        if (!consultation) {
            showToast('找不到對應的診症記錄！', 'error');
            return;
        }
        // 直接調用到診證明列印功能
        await printAttendanceCertificate(consultation.id, consultation);
    } catch (error) {
        console.error('列印到診證明錯誤:', error);
        showToast('列印到診證明時發生錯誤', 'error');
    } finally {
        if (loadingButton) {
            clearButtonLoading(loadingButton);
        }
    }
}
        
// 3. 修改從掛號記錄列印病假證明函數
async function printSickLeaveFromAppointment(appointmentId) {
    const appointment = appointments.find(apt => apt && String(apt.id) === String(appointmentId));
    if (!appointment) {
        showToast('找不到掛號記錄！', 'error');
        return;
    }
    // 只能列印已完成診症的病假證明
    if (appointment.status !== 'completed' || !appointment.consultationId) {
        showToast('只能列印已完成診症的病假證明！', 'error');
        return;
    }
    // 取得觸發按鈕
    let loadingButton = null;
    try {
        if (typeof event !== 'undefined' && event && event.currentTarget) {
            loadingButton = event.currentTarget;
        }
    } catch (_e) {}
    if (!loadingButton) {
        try {
            loadingButton = document.querySelector('button[onclick="printSickLeaveFromAppointment(' + appointmentId + ')"]');
        } catch (_e) {
            loadingButton = null;
        }
    }
    if (loadingButton) {
        setButtonLoading(loadingButton, '列印中...');
    }
    try {
        // 從 Firebase 獲取診症記錄
        const consultationResult = await window.firebaseDataManager.getConsultations();
        if (!consultationResult.success) {
            showToast('無法讀取診症記錄！', 'error');
            return;
        }
        const consultation = consultationResult.data.find(c => c.id === appointment.consultationId);
        if (!consultation) {
            showToast('找不到對應的診症記錄！', 'error');
            return;
        }
        // 直接調用病假證明列印功能
        await printSickLeave(consultation.id, consultation);
    } catch (error) {
        console.error('列印病假證明錯誤:', error);
        showToast('列印病假證明時發生錯誤', 'error');
    } finally {
        if (loadingButton) {
            clearButtonLoading(loadingButton);
        }
    }
}
        
// 4. 修改列印診症記錄函數
async function printConsultationRecord(consultationId, consultationData = null) {
    let consultation = consultationData;
    // 將傳入的 ID 轉為字串以便比較（兼容數字與字串）
    const idToFind = String(consultationId);
    
    // 如果沒有提供診症資料，從 Firebase 獲取
    if (!consultation) {
        try {
            const consultationResult = await window.firebaseDataManager.getConsultations();
            if (!consultationResult.success) {
                showToast('無法讀取診症記錄！', 'error');
                return;
            }
            
            consultation = consultationResult.data.find(c => String(c.id) === idToFind);
            if (!consultation) {
                showToast('找不到診症記錄！', 'error');
                return;
            }
        } catch (error) {
            console.error('讀取診症記錄錯誤:', error);
            showToast('讀取診症記錄失敗', 'error');
            return;
        }
    }
    
    try {
        // 從 Firebase 獲取病人資料
        const patientResult = await window.firebaseDataManager.getPatients();
        if (!patientResult.success) {
            showToast('無法讀取病人資料！', 'error');
            return;
        }
        
        const patient = patientResult.data.find(p => p.id === consultation.patientId);
        if (!patient) {
            showToast('找不到病人資料！', 'error');
            return;
        }
        
        // 解析收費項目以計算總金額
        let totalAmount = 0;
        let billingItemsHtml = '';
        if (consultation.billingItems) {
            const lines = consultation.billingItems.split('\n');
            lines.forEach(line => {
                if (line.includes('=') && line.includes('$')) {
                    const match = line.match(/\$(\d+)/);
                    if (match) {
                        totalAmount += parseInt(match[1]);
                    }
                    billingItemsHtml += `<tr><td style="padding: 5px; border-bottom: 1px dotted #ccc;">${line}</td></tr>`;
                } else if (line.includes('總費用')) {
                    const match = line.match(/\$(\d+)/);
                    if (match) {
                        totalAmount = parseInt(match[1]);
                    }
                } else if (line.startsWith('折扣適用於')) {
                    // 顯示折扣適用項目明細於收據中
                    billingItemsHtml += `<tr><td style="padding: 5px; border-bottom: 1px dotted #ccc;">${line}</td></tr>`;
                }
            });
        }
        
        // 獲取診症日期（處理 Firebase Timestamp）
        let consultationDate;
        if (consultation.date && consultation.date.seconds) {
            consultationDate = new Date(consultation.date.seconds * 1000);
        } else if (consultation.date) {
            consultationDate = new Date(consultation.date);
        } else {
            consultationDate = new Date();
        }

        // 取得服藥天數與每日次數，供收據顯示使用
        let medDays = '';
        let medFreq = '';
        try {
            const daysEl = document.getElementById('medicationDays');
            if (daysEl) {
                medDays = daysEl.value;
            }
            const freqEl = document.getElementById('medicationFrequency');
            if (freqEl) {
                medFreq = freqEl.value;
            }
        } catch (_e) {
            // 若無法取得元素，保持預設空值
        }
        // 組合顯示字串：若天數或次數存在，分別加上標籤與單位；若有服用方法則附加。
        let medInfoHtml = '';
        if (medDays) {
            medInfoHtml += '<strong>服藥天數：</strong>' + medDays + '天　';
        }
        if (medFreq) {
            medInfoHtml += '<strong>每日次數：</strong>' + medFreq + '次　';
        }
        if (consultation.usage) {
            medInfoHtml += '<strong>服用方法：</strong>' + consultation.usage;
        }
        
        // 將處方內容、醫囑、複診日期、服藥天數、每日次數與服用方法移至方藥醫囑功能
        // 在收據中不顯示這些資料，因此暫時將這些屬性設為空
        const originalPrescription = consultation.prescription;
        const originalInstructions  = consultation.instructions;
        const originalFollowUpDate  = consultation.followUpDate;
        consultation.prescription = null;
        consultation.instructions = null;
        consultation.followUpDate = null;

        // 創建中醫診所收據格式
        const printContent = `
            <!DOCTYPE html>
            <html lang="zh-TW">
            <head>
                <meta charset="UTF-8">
                <title>收據 - ${patient.name}</title>
                <style>
                    body { 
                        font-family: 'Microsoft JhengHei', '微軟正黑體', sans-serif; 
                        margin: 0; 
                        padding: 10px; 
                        line-height: 1.3;
                        font-size: 11px;
                    }
                    .receipt-container {
                        width: 148mm;
                        height: 210mm;
                        margin: 0 auto;
                        border: 2px solid #000;
                        padding: 8px;
                        background: white;
                        box-sizing: border-box;
                    }
                    .clinic-header {
                        text-align: center;
                        border-bottom: 2px double #000;
                        padding-bottom: 10px;
                        margin-bottom: 15px;
                    }
                    .clinic-name {
                        font-size: 14px;
                        font-weight: bold;
                        margin-bottom: 2px;
                        letter-spacing: 1px;
                    }
                    .clinic-subtitle {
                        font-size: 10px;
                        color: #666;
                        margin-bottom: 3px;
                    }
                    .receipt-title {
                        font-size: 14px;
                        font-weight: bold;
                        text-align: center;
                        margin: 6px 0;
                        letter-spacing: 2px;
                    }
                    .receipt-info {
                        margin-bottom: 10px;
                    }
                    .info-row {
                        display: flex;
                        justify-content: space-between;
                        margin-bottom: 3px;
                        font-size: 11px;
                    }
                    .info-label {
                        font-weight: bold;
                    }
                    .items-section {
                        border-top: 1px solid #000;
                        border-bottom: 1px solid #000;
                        padding: 6px 0;
                        margin: 8px 0;
                    }
                    .items-title {
                        font-weight: bold;
                        text-align: center;
                        margin-bottom: 6px;
                        font-size: 12px;
                    }
                    .items-table {
                        width: 100%;
                        font-size: 10px;
                    }
                    .items-table td {
                        padding: 3px 5px;
                        border-bottom: 1px dotted #999;
                    }
                    .total-section {
                        /* Shrink the amount section to conserve vertical space */
                        text-align: right;
                        margin: 4px 0;
                        font-size: 10px;
                        font-weight: bold;
                    }
                    .total-amount {
                        /* Reduce padding, border and font size for the amount box */
                        font-size: 10px;
                        color: #000;
                        border: 1px solid #000;
                        padding: 2px;
                        display: inline-block;
                        min-width: 50px;
                        text-align: center;
                    }
                    .prescription-section {
                        margin: 8px 0;
                        border-top: 1px dashed #666;
                        padding-top: 6px;
                    }
                    .prescription-title {
                        font-weight: bold;
                        margin-bottom: 4px;
                        font-size: 11px;
                    }
                    .prescription-content {
                        background: #f9f9f9;
                        padding: 4px;
                        border: 1px solid #ddd;
                        font-size: 10px;
                        line-height: 1.2;
                    }
                    .footer-info {
                        margin-top: 10px;
                        border-top: 1px dashed #666;
                        padding-top: 6px;
                        font-size: 9px;
                        color: #666;
                    }
                    .footer-row {
                        display: flex;
                        justify-content: space-between;
                        margin-bottom: 2px;
                    }
                    .thank-you {
                        text-align: center;
                        margin: 8px 0;
                        font-weight: bold;
                        font-size: 11px;
                    }
                    .diagnosis-section {
                        margin: 6px 0;
                        font-size: 10px;
                    }
                    .diagnosis-title {
                        /* Display diagnosis title inline with result; remove bottom margin and add right margin */
                        font-weight: bold;
                        margin-bottom: 0;
                        margin-right: 4px;
                    }
                    @media print {
                        @page {
                            size: A5;
                            margin: 10mm;
                        }
                        body { 
                            margin: 0; 
                            padding: 0; 
                            font-size: 11px;
                        }
                        .receipt-container { 
                            border: 2px solid #000;
                            width: 100%;
                            height: 100%;
                            padding: 8mm;
                        }
                    }
                </style>
            </head>
            <body>
                <div class="receipt-container">
                    <!-- 診所標題 -->
                    <div class="clinic-header">
                        <div class="clinic-name">${clinicSettings.chineseName || '名醫診所系統'}</div>
                        <div class="clinic-subtitle">${clinicSettings.englishName || 'TCM Clinic'}</div>
                        <div class="clinic-subtitle">電話：${clinicSettings.phone || '(852) 2345-6789'}　地址：${clinicSettings.address || '香港中環皇后大道中123號'}</div>
                    </div>
                    
                    <!-- 收據標題 -->
                    <div class="receipt-title">收　據</div>
                    
                    <!-- 基本資訊 -->
                    <div class="receipt-info">
                        <div class="info-row">
                            <span class="info-label">收據編號：</span>
                            <span>R${consultation.id.toString().padStart(6, '0')}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">病人姓名：</span>
                            <span>${patient.name}</span>
                        </div>
                        <!-- 新增病歷編號顯示，置於姓名下方 -->
                        <div class="info-row">
                            <span class="info-label">病歷編號：</span>
                            <span>${consultation.medicalRecordNumber || consultation.id}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">病人號碼：</span>
                            <span>${patient.patientNumber}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">診療日期：</span>
                            <span>${consultationDate.toLocaleDateString('zh-TW', {
                                year: 'numeric',
                                month: '2-digit',
                                day: '2-digit'
                            })}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">診療時間：</span>
                            <span>${consultationDate.toLocaleTimeString('zh-TW', {
                                hour: '2-digit',
                                minute: '2-digit'
                            })}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">主治醫師：</span>
                            <span>${getDoctorDisplayName(consultation.doctor)}</span>
                        </div>
                        ${(() => {
                            const regNumber = getDoctorRegistrationNumber(consultation.doctor);
                            return regNumber ? `
                                <div class="info-row">
                                    <span class="info-label">註冊編號：</span>
                                    <span>${regNumber}</span>
                                </div>
                            ` : '';
                        })()}
                    </div>
                    
                    <!-- 診斷資訊 -->
                    ${consultation.diagnosis ? `
                    <div class="diagnosis-section">
                        <!-- 將診斷結果和證型分成兩行顯示 -->
                        <div>
                            <span class="diagnosis-title">診斷：</span>
                            <span>${consultation.diagnosis}</span>
                        </div>
                        ${consultation.syndrome ? `
                        <div>
                            <span class="diagnosis-title">證型：</span>
                            <span>${consultation.syndrome}</span>
                        </div>
                        ` : ''}
                    </div>
                    ` : ''}
                    
                    <!-- 收費項目 -->
                    ${consultation.billingItems ? `
                    <div class="items-section">
                        <div class="items-title">收費明細</div>
                        <table class="items-table">
                            ${billingItemsHtml}
                        </table>
                    </div>
                    ` : ''}
                    
                    <!-- 總金額 -->
                    <div class="total-section">
                        <!-- Shrink the label for amount receivable -->
                        <div style="margin-bottom: 4px; font-size: 9px;">應收金額：</div>
                        <div class="total-amount">HK$ ${totalAmount.toLocaleString()}</div>
                    </div>
                    
                    <!-- 處方資訊 -->
                    ${consultation.prescription ? `
                    <div class="prescription-section">
                        <div class="prescription-title">📋 處方內容</div>
                        <div class="prescription-content">${(() => {
                            // 將處方內容按行分割，然後橫向排列
                            const lines = consultation.prescription.split('\n').filter(line => line.trim());
                            const allItems = [];
                            let i = 0;
                            
                            while (i < lines.length) {
                                const line = lines[i].trim();
                                if (!line) {
                                    i++;
                                    continue;
                                }
                                
                                // 檢查是否為藥材/方劑格式（名稱 劑量g）
                                const itemMatch = line.match(/^(.+?)\s+(\d+(?:\.\d+)?)g$/);
                                if (itemMatch) {
                                    const itemName = itemMatch[1].trim();
                                    const dosage = itemMatch[2];
                                    
                                    // 檢查是否為常見方劑名稱
                                    const isFormula = ['湯', '散', '丸', '膏', '飲', '丹', '煎', '方', '劑'].some(suffix => itemName.includes(suffix));
                                    
                                    if (isFormula) {
                                        // 檢查下一行是否為方劑組成
                                        let composition = '';
                                        if (i + 1 < lines.length) {
                                            const nextLine = lines[i + 1].trim();
                                            // 如果下一行不是標準藥材格式，視為方劑組成
                                            if (nextLine && !nextLine.match(/^.+?\s+\d+(?:\.\d+)?g$/)) {
                                                composition = nextLine.replace(/\n/g, '、').replace(/、/g, ',');
                                                i++; // 跳過組成行
                                            }
                                        }
                                        
                                        // 方劑顯示格式：方劑名 劑量g (組成)
                                        if (composition) {
                                            // 方劑保留名稱與劑量之間的空格，並以小字體標示組成
                                            allItems.push(`${itemName} ${dosage}g <span style="font-size: 8px;">(${composition})</span>`);
                                        } else {
                                            allItems.push(`${itemName} ${dosage}g`);
                                        }
                                    } else {
                                        // 普通藥材：為節省空間，藥名與劑量之間不加空格
                                        allItems.push(`${itemName}${dosage}g`);
                                    }
                                } else {
                                    // 非標準格式的行，可能是獨立的說明
                                    allItems.push(`<div style="margin: 2px 0; font-size: 9px; color: #666;">${line}</div>`);
                                }
                                
                                i++;
                            }
                            
                            // 分離普通項目和特殊行
                            const regularItems = allItems.filter(item => typeof item === 'string' && !item.includes('<div'));
                            const specialLines = allItems.filter(item => typeof item === 'string' && item.includes('<div'));
                            
                            let result = '';

                            // 先顯示特殊行
                            specialLines.forEach(line => {
                                result += line;
                            });

                            // 接著顯示所有藥材及方劑，用頓號「、」連接，節省空間
                            if (regularItems.length > 0) {
                                // 將所有藥材及方劑按照原順序用頓號連接
                                const joined = regularItems.join('、');
                                result += `<div style="margin: 2px 0;">${joined}</div>`;
                            }

                            return result || consultation.prescription.replace(/\n/g, '<br>');
                        })()}</div>
                        ${medInfoHtml ? `
                        <div style="margin-top: 8px; font-size: 12px;">${medInfoHtml}</div>
                        ` : ''}
                    </div>
                    ` : ''}
                    
                    <!-- 醫囑 -->
                    ${consultation.instructions ? `
                    <div style="margin: 6px 0; font-size: 10px; background: #fff3cd; padding: 6px; border: 1px solid #ffeaa7;">
                        <strong>⚠️ 醫囑及注意事項：</strong><br>
                        ${consultation.instructions}
                    </div>
                    ` : ''}
                    
                    <!-- 複診提醒 -->
                    ${consultation.followUpDate ? `
                    <div style="margin: 10px 0; font-size: 12px; background: #e3f2fd; padding: 8px; border: 1px solid #90caf9;">
                        <strong>📅 建議複診時間：</strong><br>
                        ${new Date(consultation.followUpDate).toLocaleString('zh-TW')}
                    </div>
                    ` : ''}
                    
                    <!-- 感謝語 -->
                    <div class="thank-you">
                        謝謝您的光臨，祝您身體健康！
                    </div>
                    
                    <!-- 頁尾資訊 -->
                    <div class="footer-info">
                        <div class="footer-row">
                            <span>收據開立時間：</span>
                            <span>${new Date().toLocaleString('zh-TW')}</span>
                        </div>
                        <div class="footer-row">
                            <span>診所營業時間：</span>
                            <span>${clinicSettings.businessHours || '週一至週五 09:00-18:00'}</span>
                        </div>
                        <div class="footer-row">
                            <span>本收據請妥善保存</span>
                            <span>如有疑問請洽櫃檯</span>
                        </div>
                    </div>
                </div>
            </body>
            </html>
        `;
        
        // 開啟新視窗進行列印
        const printWindow = window.open('', '_blank', 'width=500,height=700');
        printWindow.document.write(printContent);
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();

        // 列印完成後恢復原本的處方、醫囑與複診資料
        consultation.prescription = originalPrescription;
        consultation.instructions = originalInstructions;
        consultation.followUpDate = originalFollowUpDate;

        showToast('中醫診所收據已準備列印！', 'success');
        
    } catch (error) {
        console.error('列印收據錯誤:', error);
        showToast('列印收據時發生錯誤', 'error');
    }
}
        
// 5. 修改列印到診證明函數
async function printAttendanceCertificate(consultationId, consultationData = null) {
    let consultation = consultationData;
    // 將傳入的 ID 轉為字串以便比較（兼容數字與字串）
    const idToFind = String(consultationId);
    
    // 如果沒有提供診症資料，從 Firebase 獲取
    if (!consultation) {
        try {
            const consultationResult = await window.firebaseDataManager.getConsultations();
            if (!consultationResult.success) {
                showToast('無法讀取診症記錄！', 'error');
                return;
            }
            
            consultation = consultationResult.data.find(c => String(c.id) === idToFind);
            if (!consultation) {
                showToast('找不到診症記錄！', 'error');
                return;
            }
        } catch (error) {
            console.error('讀取診症記錄錯誤:', error);
            showToast('讀取診症記錄失敗', 'error');
            return;
        }
    }
    
    try {
        // 從 Firebase 獲取病人資料
        const patientResult = await window.firebaseDataManager.getPatients();
        if (!patientResult.success) {
            showToast('無法讀取病人資料！', 'error');
            return;
        }
        
        const patient = patientResult.data.find(p => p.id === consultation.patientId);
        if (!patient) {
            showToast('找不到病人資料！', 'error');
            return;
        }
        
        // 獲取診症日期（處理 Firebase Timestamp）
        let consultationDate;
        if (consultation.date && consultation.date.seconds) {
            consultationDate = new Date(consultation.date.seconds * 1000);
        } else if (consultation.date) {
            consultationDate = new Date(consultation.date);
        } else {
            consultationDate = new Date();
        }
        
        // 創建到診證明格式
        const printContent = `
            <!DOCTYPE html>
            <html lang="zh-TW">
            <head>
                <meta charset="UTF-8">
                <title>到診證明書 - ${patient.name}</title>
                <style>
                    body { 
                        font-family: 'Microsoft JhengHei', '微軟正黑體', sans-serif; 
                        margin: 0; 
                        padding: 8px; 
                        line-height: 1.3;
                        font-size: 10px;
                        background: white;
                    }
                    .certificate-container {
                        width: 148mm;
                        height: 210mm;
                        margin: 0 auto;
                        border: 3px solid #000;
                        padding: 8px;
                        background: white;
                        position: relative;
                        box-sizing: border-box;
                    }
                    .clinic-header {
                        text-align: center;
                        border-bottom: 2px solid #000;
                        padding-bottom: 10px;
                        margin-bottom: 15px;
                    }
                    .clinic-name {
                        font-size: 13px;
                        font-weight: bold;
                        margin-bottom: 3px;
                        letter-spacing: 1px;
                    }
                    .clinic-subtitle {
                        font-size: 10px;
                        color: #666;
                        margin-bottom: 4px;
                    }
                    .certificate-title {
                        font-size: 16px;
                        font-weight: bold;
                        text-align: center;
                        margin: 8px 0;
                        letter-spacing: 3px;
                        color: #000;
                    }
                    .certificate-number {
                        text-align: right;
                        font-size: 10px;
                        color: #666;
                        margin-bottom: 10px;
                    }
                    .content-section {
                        margin: 8px 0;
                        font-size: 10px;
                        line-height: 1.4;
                    }
                    .patient-info {
                        margin: 8px 0;
                    }
                    .info-row {
                        margin: 4px 0;
                        display: flex;
                        align-items: center;
                    }
                    .info-label {
                        font-weight: bold;
                        min-width: 80px;
                        display: inline-block;
                        font-size: 10px;
                    }
                    .info-value {
                        border-bottom: 1px solid #000;
                        min-width: 120px;
                        padding: 3px 6px;
                        margin-left: 6px;
                        font-size: 10px;
                    }
                    .attendance-section {
                        margin: 8px 0;
                        background: #e3f2fd;
                        padding: 6px;
                        border: 2px solid #2196f3;
                        border-radius: 4px;
                        text-align: center;
                    }
                    .attendance-title {
                        font-size: 11px;
                        font-weight: bold;
                        color: #1976d2;
                        margin-bottom: 4px;
                    }
                    .attendance-details {
                        font-size: 10px;
                        line-height: 1.3;
                    }
                    .doctor-signature {
                        margin-top: 10px;
                        display: flex;
                        justify-content: space-between;
                        align-items: flex-end;
                    }
                    .signature-section {
                        text-align: center;
                    }
                    .signature-line {
                        border-bottom: 2px solid #000;
                        width: 60px;
                        height: 25px;
                        margin: 6px auto;
                        position: relative;
                    }
                    .signature-label {
                        font-size: 9px;
                        color: #666;
                        margin-top: 3px;
                    }
                    .date-section {
                        text-align: right;
                        font-size: 10px;
                    }
                    .footer-note {
                        margin-top: 15px;
                        padding-top: 8px;
                        border-top: 1px dashed #666;
                        font-size: 8px;
                        color: #666;
                        text-align: center;
                    }
                    .watermark {
                        position: absolute;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%) rotate(-45deg);
                        font-size: 80px;
                        color: rgba(0, 0, 0, 0.05);
                        font-weight: bold;
                        z-index: 0;
                        pointer-events: none;
                    }
                    .content {
                        position: relative;
                        z-index: 1;
                    }
                    @media print {
                        @page {
                            size: A5;
                            margin: 10mm;
                        }
                        body { 
                            margin: 0; 
                            padding: 0; 
                            font-size: 11px;
                        }
                        .certificate-container { 
                            border: 3px solid #000;
                            width: 100%;
                            height: 100%;
                            padding: 8mm;
                        }
                    }
                </style>
            </head>
            <body>
                <div class="certificate-container">
                    <!-- 浮水印 -->
                    <div class="watermark">到診證明</div>
                    
                    <div class="content">
                        <!-- 診所標題 -->
                        <div class="clinic-header">
                            <div class="clinic-name">${clinicSettings.chineseName || '名醫診所系統'}</div>
                            <div class="clinic-subtitle">${clinicSettings.englishName || 'TCM Clinic'}</div>
                            <div class="clinic-subtitle">電話：${clinicSettings.phone || '(852) 2345-6789'}　地址：${clinicSettings.address || '香港中環皇后大道中123號'}</div>
                        </div>
                        
                        <!-- 證明書編號 -->
                        <div class="certificate-number">
                            證明書編號：AC${consultation.id.toString().padStart(6, '0')}
                        </div>
                        
                        <!-- 證明書標題 -->
                        <div class="certificate-title">到診證明書</div>
                        
                        <!-- 病人資訊 -->
                        <div class="patient-info">
                            <div class="info-row">
                                <span class="info-label">姓　　名：</span>
                                <span class="info-value">${patient.name}</span>
                            </div>
                            <!-- 新增病歷編號顯示，置於姓名下方 -->
                            <div class="info-row">
                                <span class="info-label">病歷編號：</span>
                                <span class="info-value">${consultation.medicalRecordNumber || consultation.id}</span>
                            </div>
                            <div class="info-row">
                                <span class="info-label">性　　別：</span>
                                <span class="info-value">${patient.gender}</span>
                            </div>
                            <div class="info-row">
                                <span class="info-label">年　　齡：</span>
                                <span class="info-value">${formatAge(patient.birthDate)}</span>
                            </div>
                            <div class="info-row">
                                <span class="info-label">身分證號：</span>
                                <span class="info-value">${patient.idCard || '未提供'}</span>
                            </div>
                        </div>
                        
                        <!-- 到診資訊 -->
                        <div class="attendance-section">
                            <div class="attendance-title">到診資訊</div>
                            <div class="attendance-details">
                                <div><strong>到診日期：</strong>${(() => {
                                    const visitDate = consultation.visitTime ? new Date(consultation.visitTime) : consultationDate;
                                    return visitDate.toLocaleDateString('zh-TW', {
                                        year: 'numeric',
                                        month: '2-digit',
                                        day: '2-digit'
                                    });
                                })()}</div>
                                <div><strong>到診時間：</strong>${(() => {
                                    const visitDate = consultation.visitTime ? new Date(consultation.visitTime) : consultationDate;
                                    return visitDate.toLocaleTimeString('zh-TW', {
                                        hour: '2-digit',
                                        minute: '2-digit'
                                    });
                                })()}</div>
                            </div>
                        </div>
                        
                        <!-- 診療資訊 -->
                        ${consultation.diagnosis ? `
                        <div class="content-section">
                            <div style="margin-bottom: 15px;">
                                <strong>診斷結果：</strong>${consultation.diagnosis}
                            </div>
                        </div>
                        ` : ''}
                        
                        <div class="content-section">
                            <strong>茲證明上述病人確實於上述日期時間到本診所接受中醫診療。</strong>
                        </div>
                        
                        <div class="content-section">
                            <strong>特此證明。</strong>
                        </div>
                        
                        <!-- 醫師簽名區 -->
                        <div class="doctor-signature">
                            <div class="signature-section">
                                <div class="signature-line"></div>
                                <div class="signature-label">主治醫師簽名</div>
                                <div style="margin-top: 10px; font-weight: bold;">
                                    ${getDoctorDisplayName(consultation.doctor)}
                                </div>
                                ${(() => {
                                    const regNumber = getDoctorRegistrationNumber(consultation.doctor);
                                    return regNumber ? `
                                        <div style="margin-top: 5px; font-size: 12px; color: #666;">
                                            註冊編號：${regNumber}
                                        </div>
                                    ` : '';
                                })()}
                            </div>
                            
                            <div class="date-section">
                                <div style="margin-bottom: 20px;">
                                    <strong>開立日期：</strong><br>
                                    ${new Date().toLocaleDateString('zh-TW', {
                                        year: 'numeric',
                                        month: '2-digit',
                                        day: '2-digit'
                                    })}
                                </div>
                                <div style="border: 2px solid #000; padding: 15px; text-align: center; background: #f8f9fa;">
                                    <div style="font-weight: bold; margin-bottom: 5px;">診所印章</div>
                                    <div style="font-size: 12px; color: #666;">(此處應蓋診所印章)</div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- 頁尾說明 -->
                        <div class="footer-note">
                            <div>本證明書僅證明到診事實，如有疑問請洽本診所</div>
                            <div>診所電話：${clinicSettings.phone || '(852) 2345-6789'} | 營業時間：${clinicSettings.businessHours || '週一至週五 09:00-18:00'}</div>
                            <div style="margin-top: 10px; font-size: 10px;">
                                證明書開立時間：${new Date().toLocaleString('zh-TW')}
                            </div>
                        </div>
                    </div>
                </div>
            </body>
            </html>
        `;
        
        // 開啟新視窗進行列印
        const printWindow = window.open('', '_blank', 'width=700,height=900');
        printWindow.document.write(printContent);
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
        
        showToast('到診證明書已準備列印！', 'success');
        
    } catch (error) {
        console.error('列印到診證明錯誤:', error);
        showToast('列印到診證明時發生錯誤', 'error');
    }
}
        
// 修復病假證明函數
async function printSickLeave(consultationId, consultationData = null) {
    let consultation = consultationData;
    
    // 如果沒有提供診症資料，從本地查找
    if (!consultation) {
        consultation = consultations.find(c => c.id === consultationId);
        if (!consultation) {
            showToast('找不到診症記錄！', 'error');
            return;
        }
    }
    
    try {            
        const patientResult = await window.firebaseDataManager.getPatients();
        if (!patientResult.success) {
            showToast('無法讀取病人資料！', 'error');
            return;
        }

        const patient = patientResult.data.find(p => p.id === consultation.patientId);
        if (!patient) {
            showToast('找不到病人資料！', 'error');
            return;
        }
        
        // 創建病假證明格式
        const printContent = `
            <!DOCTYPE html>
            <html lang="zh-TW">
            <head>
                <meta charset="UTF-8">
                <title>病假證明書 - ${patient.name}</title>
                <style>
                    body { 
                        font-family: 'Microsoft JhengHei', '微軟正黑體', sans-serif; 
                        margin: 0; 
                        padding: 8px; 
                        line-height: 1.3;
                        font-size: 10px;
                        background: white;
                    }
                    .certificate-container {
                        width: 148mm;
                        height: 210mm;
                        margin: 0 auto;
                        border: 3px solid #000;
                        padding: 8px;
                        background: white;
                        position: relative;
                        box-sizing: border-box;
                    }
                    .clinic-header {
                        text-align: center;
                        border-bottom: 2px solid #000;
                        padding-bottom: 10px;
                        margin-bottom: 15px;
                    }
                    .clinic-name {
                        font-size: 13px;
                        font-weight: bold;
                        margin-bottom: 3px;
                        letter-spacing: 1px;
                    }
                    .clinic-subtitle {
                        font-size: 10px;
                        color: #666;
                        margin-bottom: 4px;
                    }
                    .certificate-title {
                        font-size: 16px;
                        font-weight: bold;
                        text-align: center;
                        margin: 8px 0;
                        letter-spacing: 3px;
                        color: #000;
                    }
                    .certificate-number {
                        text-align: right;
                        font-size: 10px;
                        color: #666;
                        margin-bottom: 10px;
                    }
                    .content-section {
                        margin: 8px 0;
                        font-size: 10px;
                        line-height: 1.4;
                    }
                    .patient-info {
                        margin: 8px 0;
                    }
                    .info-row {
                        margin: 4px 0;
                        display: flex;
                        align-items: center;
                    }
                    .info-label {
                        font-weight: bold;
                        min-width: 80px;
                        display: inline-block;
                        font-size: 10px;
                    }
                    .info-value {
                        border-bottom: 1px solid #000;
                        min-width: 120px;
                        padding: 3px 6px;
                        margin-left: 6px;
                        font-size: 10px;
                    }
                    .diagnosis-section {
                        margin: 8px 0;
                        background: #f9f9f9;
                        padding: 6px;
                        border: 1px solid #ddd;
                        border-radius: 3px;
                    }
                    .rest-period {
                        margin: 8px 0;
                        font-size: 11px;
                        font-weight: bold;
                        text-align: center;
                        background: #fff3cd;
                        padding: 6px;
                        border: 2px solid #ffc107;
                        border-radius: 4px;
                    }
                    .doctor-signature {
                        margin-top: 10px;
                        display: flex;
                        justify-content: space-between;
                        align-items: flex-end;
                    }
                    .signature-section {
                        text-align: center;
                    }
                    .signature-line {
                        border-bottom: 2px solid #000;
                        width: 60px;
                        height: 25px;
                        margin: 6px auto;
                        position: relative;
                    }
                    .signature-label {
                        font-size: 9px;
                        color: #666;
                        margin-top: 3px;
                    }
                    .date-section {
                        text-align: right;
                        font-size: 10px;
                    }
                    .footer-note {
                        margin-top: 15px;
                        padding-top: 8px;
                        border-top: 1px dashed #666;
                        font-size: 8px;
                        color: #666;
                        text-align: center;
                    }
                    .watermark {
                        position: absolute;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%) rotate(-45deg);
                        font-size: 80px;
                        color: rgba(0, 0, 0, 0.05);
                        font-weight: bold;
                        z-index: 0;
                        pointer-events: none;
                    }
                    .content {
                        position: relative;
                        z-index: 1;
                    }
                    @media print {
                        @page {
                            size: A5;
                            margin: 10mm;
                        }
                        body { 
                            margin: 0; 
                            padding: 0; 
                            font-size: 11px;
                        }
                        .certificate-container { 
                            border: 3px solid #000;
                            width: 100%;
                            height: 100%;
                            padding: 8mm;
                        }
                    }
                </style>
            </head>
            <body>
                <div class="certificate-container">
                    <!-- 浮水印 -->
                    <div class="watermark">病假證明</div>
                    
                    <div class="content">
                        <!-- 診所標題 -->
                        <div class="clinic-header">
                            <div class="clinic-name">${clinicSettings.chineseName || '名醫診所系統'}</div>
                            <div class="clinic-subtitle">${clinicSettings.englishName || 'TCM Clinic'}</div>
                            <div class="clinic-subtitle">電話：${clinicSettings.phone || '(852) 2345-6789'}　地址：${clinicSettings.address || '香港中環皇后大道中123號'}</div>
                        </div>
                        
                        <!-- 證明書編號 -->
                        <div class="certificate-number">
                            證明書編號：SL${consultation.id.toString().padStart(6, '0')}
                        </div>
                        
                        <!-- 證明書標題 -->
                        <div class="certificate-title">病假證明書</div>
                        
                        <!-- 病人資訊 -->
                        <div class="patient-info">
                            <div class="info-row">
                                <span class="info-label">姓　　名：</span>
                                <span class="info-value">${patient.name}</span>
                            </div>
                            <!-- 新增病歷編號顯示，置於姓名下方 -->
                            <div class="info-row">
                                <span class="info-label">病歷編號：</span>
                                <span class="info-value">${consultation.medicalRecordNumber || consultation.id}</span>
                            </div>
                            <div class="info-row">
                                <span class="info-label">性　　別：</span>
                                <span class="info-value">${patient.gender}</span>
                            </div>
                            <div class="info-row">
                                <span class="info-label">年　　齡：</span>
                                <span class="info-value">${formatAge(patient.birthDate)}</span>
                            </div>
                            <div class="info-row">
                                <span class="info-label">身分證號：</span>
                                <span class="info-value">${patient.idCard || '未提供'}</span>
                            </div>
                        </div>
                        
                        <!-- 診斷資訊 -->
                        <div class="diagnosis-section">
                            <div style="margin-bottom: 15px;">
                                <strong>診療日期：</strong>${(() => {
                                    // 使用通用日期解析函式處理到診時間或診症日期
                                    const visitDate = consultation.visitTime ? parseConsultationDate(consultation.visitTime) : parseConsultationDate(consultation.date);
                                    if (!visitDate || isNaN(visitDate.getTime())) {
                                        return '未知日期';
                                    }
                                    return visitDate.toLocaleDateString('zh-TW', {
                                        year: 'numeric',
                                        month: '2-digit',
                                        day: '2-digit'
                                    });
                                })()}
                            </div>
                            <div style="margin-bottom: 15px;">
                                <strong>診斷結果：</strong>${consultation.diagnosis || '需要休息調養'}
                            </div>
                        </div>
                        
                        <!-- 建議休息期間 -->
                        <div class="rest-period">
                            建議休息期間：${(() => {
                                // 優先使用診症記錄中的休息期間設定
                                if (consultation.restStartDate && consultation.restEndDate) {
                                    // 解析休息起止日期，支援多種格式
                                    const startDate = parseConsultationDate(consultation.restStartDate);
                                    const endDate = parseConsultationDate(consultation.restEndDate);
                                    if (!startDate || isNaN(startDate.getTime()) || !endDate || isNaN(endDate.getTime())) {
                                        return '未知日期';
                                    }
                                    const timeDiff = endDate.getTime() - startDate.getTime();
                                    const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1; // 包含開始和結束日期
                                    return startDate.toLocaleDateString('zh-TW') + ' 至 ' + endDate.toLocaleDateString('zh-TW') + ' (共 ' + daysDiff + ' 天)';
                                }
                                
                                // 如果沒有設定休息期間，使用舊的邏輯
                                // 將預設休息天數由 3 天調整為 1 天
                                let restDays = consultation.restDays ? parseInt(consultation.restDays) : 1;
                                
                                // 如果沒有設定休息天數，則根據治療療程推算
                                if (!consultation.restDays) {
                                    const treatmentCourse = consultation.treatmentCourse || '一周';
                                    
                                    if (treatmentCourse.includes('天')) {
                                        const match = treatmentCourse.match(/(\d+)天/);
                                        if (match) {
                                            restDays = Math.min(parseInt(match[1]), 7); // 最多7天
                                        }
                                    } else if (treatmentCourse.includes('週') || treatmentCourse.includes('周')) {
                                        const match = treatmentCourse.match(/(\d+)[週周]/);
                                        if (match) {
                                            restDays = Math.min(parseInt(match[1]) * 7, 7); // 最多7天
                                        }
                                    }
                                }
                                
                                // 使用到診時間作為起始日期，如果沒有則使用診症日期
                                const startDate = consultation.visitTime ? parseConsultationDate(consultation.visitTime) : parseConsultationDate(consultation.date);
                                if (!startDate || isNaN(startDate.getTime())) {
                                    return '未知日期';
                                }
                                const endDate = new Date(startDate);
                                endDate.setDate(startDate.getDate() + restDays - 1);
                                return startDate.toLocaleDateString('zh-TW') + ' 至 ' + endDate.toLocaleDateString('zh-TW') + ' (共 ' + restDays + ' 天)';
                            })()}
                        </div>
                        
                        <!-- 醫囑 -->
                        ${consultation.instructions ? `
                        <div class="content-section">
                            <strong>醫師建議：</strong><br>
                            ${consultation.instructions}
                        </div>
                        ` : ''}
                        
                        <div class="content-section">
                            <strong>特此證明。</strong>
                        </div>
                        
                        <!-- 醫師簽名區 -->
                        <div class="doctor-signature">
                            <div class="signature-section">
                                <div class="signature-line"></div>
                                <div class="signature-label">主治醫師簽名</div>
                                <div style="margin-top: 10px; font-weight: bold;">
                                    ${getDoctorDisplayName(consultation.doctor)}
                                </div>
                                ${(() => {
                                    const regNumber = getDoctorRegistrationNumber(consultation.doctor);
                                    return regNumber ? `
                                        <div style="margin-top: 5px; font-size: 12px; color: #666;">
                                            註冊編號：${regNumber}
                                        </div>
                                    ` : '';
                                })()}
                            </div>
                            
                            <div class="date-section">
                                <div style="margin-bottom: 20px;">
                                    <strong>開立日期：</strong><br>
                                    ${new Date().toLocaleDateString('zh-TW', {
                                        year: 'numeric',
                                        month: '2-digit',
                                        day: '2-digit'
                                    })}
                                </div>
                                <div style="border: 2px solid #000; padding: 15px; text-align: center; background: #f8f9fa;">
                                    <div style="font-weight: bold; margin-bottom: 5px;">診所印章</div>
                                    <div style="font-size: 12px; color: #666;">(此處應蓋診所印章)</div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- 頁尾說明 -->
                        <div class="footer-note">
                            <div>本證明書僅供請假使用，如有疑問請洽本診所</div>
                            <div>診所電話：${clinicSettings.phone || '(852) 2345-6789'} | 營業時間：${clinicSettings.businessHours || '週一至週五 09:00-18:00'}</div>
                            <div style="margin-top: 10px; font-size: 10px;">
                                證明書開立時間：${new Date().toLocaleString('zh-TW')}
                            </div>
                        </div>
                    </div>
                </div>
            </body>
            </html>
        `;
        
        // 開啟新視窗進行列印
        const printWindow = window.open('', '_blank', 'width=700,height=900');
        printWindow.document.write(printContent);
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
        
        showToast('病假證明書已準備列印！', 'success');
        
    } catch (error) {
        console.error('讀取病人資料錯誤:', error);
        showToast('讀取病人資料失敗', 'error');
    }
}

// 新增：從掛號記錄列印方藥醫囑
async function printPrescriptionInstructionsFromAppointment(appointmentId) {
    const appointment = appointments.find(apt => apt && String(apt.id) === String(appointmentId));
    if (!appointment) {
        showToast('找不到掛號記錄！', 'error');
        return;
    }
    // 只能列印已完成診症的方藥醫囑
    if (appointment.status !== 'completed' || !appointment.consultationId) {
        showToast('只能列印已完成診症的藥單醫囑！', 'error');
        return;
    }
    // 取得觸發按鈕，優先使用事件目標，其次透過 DOM 查找
    let loadingButton = null;
    try {
        if (typeof event !== 'undefined' && event && event.currentTarget) {
            loadingButton = event.currentTarget;
        }
    } catch (_e) {}
    if (!loadingButton) {
        try {
            loadingButton = document.querySelector('button[onclick="printPrescriptionInstructionsFromAppointment(' + appointmentId + ')"]');
        } catch (_e) {
            loadingButton = null;
        }
    }
    if (loadingButton) {
        setButtonLoading(loadingButton, '列印中...');
    }
    try {
        // 從 Firebase 獲取診症記錄
        const consultationResult = await window.firebaseDataManager.getConsultations();
        if (!consultationResult.success) {
            showToast('無法讀取診症記錄！', 'error');
            return;
        }
        const consultation = consultationResult.data.find(c => c.id === appointment.consultationId);
        if (!consultation) {
            showToast('找不到對應的診症記錄！', 'error');
            return;
        }
        // 調用方藥醫囑列印功能
        await printPrescriptionInstructions(consultation.id, consultation);
    } catch (error) {
        console.error('列印藥單醫囑錯誤:', error);
        showToast('列印藥單醫囑時發生錯誤', 'error');
    } finally {
        if (loadingButton) {
            clearButtonLoading(loadingButton);
        }
    }
}

/**
 * 列印方藥醫囑收據頁面。
 * 內容包含處方內容、服藥天數、每日次數、服用方法、醫囑及注意事項以及建議複診時間。
 * @param {number|string} consultationId 診症 ID
 * @param {object|null} consultationData 可選，若已提供診症資料則直接使用
 */
async function printPrescriptionInstructions(consultationId, consultationData = null) {
    let consultation = consultationData;
    const idToFind = String(consultationId);
    // 若未提供診症資料，從 Firebase 讀取
    if (!consultation) {
        try {
            const consultationResult = await window.firebaseDataManager.getConsultations();
            if (!consultationResult.success) {
                showToast('無法讀取診症記錄！', 'error');
                return;
            }
            consultation = consultationResult.data.find(c => String(c.id) === idToFind);
            if (!consultation) {
                showToast('找不到診症記錄！', 'error');
                return;
            }
        } catch (error) {
            console.error('讀取診症記錄錯誤:', error);
            showToast('讀取診症記錄失敗', 'error');
            return;
        }
    }
    try {
        // 讀取病人資料
        const patientResult = await window.firebaseDataManager.getPatients();
        if (!patientResult.success) {
            showToast('無法讀取病人資料！', 'error');
            return;
        }
        const patient = patientResult.data.find(p => p.id === consultation.patientId);
        if (!patient) {
            showToast('找不到病人資料！', 'error');
            return;
        }
        // 解析診療日期
        let consultationDate;
        if (consultation.date && consultation.date.seconds) {
            consultationDate = new Date(consultation.date.seconds * 1000);
        } else if (consultation.date) {
            consultationDate = new Date(consultation.date);
        } else {
            consultationDate = new Date();
        }
        // 組合處方內容 - 將處方項目分為三欄顯示以節省空間，方劑的組成使用較小字體顯示於方劑名稱下方
        let prescriptionHtml = '';
        if (consultation.prescription) {
            try {
                // 解析處方內容行並移除空行
                const lines = consultation.prescription.split('\n').filter(line => line.trim());
                const itemsList = [];
                let i = 0;
                // 將每個條目處理為單獨的 HTML 區塊
                while (i < lines.length) {
                    const raw = lines[i].trim();
                    if (!raw) {
                        i++;
                        continue;
                    }
                    // 判斷是否符合「名稱 劑量g」格式
                    const match = raw.match(/^(.+?)\s+(\d+(?:\.\d+)?)g$/);
                    if (match) {
                        const itemName = match[1].trim();
                        const dosage = match[2];
                        const isFormula = ['湯','散','丸','膏','飲','丹','煎','方','劑'].some(suffix => itemName.includes(suffix));
                        if (isFormula) {
                            // 如果是方劑，檢查下一行是否為組成說明，非藥材格式的行視為組成
                            let composition = '';
                            if (i + 1 < lines.length) {
                                const nextLine = lines[i + 1].trim();
                                if (nextLine && !nextLine.match(/^.+?\s+\d+(?:\.\d+)?g$/)) {
                                    composition = nextLine;
                                    i++;
                                }
                            }
                            // 建立方劑區塊，組成文字使用半尺寸字體並置於下一行
                            const compHtml = composition ? `<br><span style="font-size: 5px;">(${composition})</span>` : '';
                            itemsList.push(`<div style="margin-bottom: 4px;">${itemName} ${dosage}g${compHtml}</div>`);
                        } else {
                            // 普通藥材區塊
                            itemsList.push(`<div style="margin-bottom: 4px;">${itemName} ${dosage}g</div>`);
                        }
                    } else {
                        // 其他說明行直接以較小字體顯示
                        itemsList.push(`<div style="margin-bottom: 4px; font-size: 9px; color: #666;">${raw}</div>`);
                    }
                    i++;
                }
                if (itemsList.length > 0) {
                    // 將條目平均分配到三欄（直行）以節省垂直空間
                    const total = itemsList.length;
                    const columnsCount = 3;
                    const rows = Math.ceil(total / columnsCount);
                    const columns = [[], [], []];
                    for (let col = 0; col < columnsCount; col++) {
                        for (let row = 0; row < rows; row++) {
                            const idx = col * rows + row;
                            if (idx < total) {
                                columns[col].push(itemsList[idx]);
                            }
                        }
                    }
                    // 組合三欄的 HTML 內容
                    let html = '<div style="display: flex;">';
                    columns.forEach((colItems) => {
                        html += `<div style="flex: 1; padding-right: 4px;">${colItems.join('')}</div>`;
                    });
                    html += '</div>';
                    prescriptionHtml = html;
                } else {
                    // 若未能解析任何項目，直接以換行顯示原始內容
                    prescriptionHtml = consultation.prescription.replace(/\n/g, '<br>');
                }
            } catch (_e) {
                // 解析出錯時，退回顯示原始處方內容
                prescriptionHtml = consultation.prescription.replace(/\n/g, '<br>');
            }
        } else {
            // 無處方內容
            prescriptionHtml = '無記錄';
        }
        // 組合服藥資訊
        let medDays = '';
        let medFreq = '';
        try {
            const daysEl = document.getElementById('medicationDays');
            if (daysEl) {
                medDays = daysEl.value;
            }
            const freqEl = document.getElementById('medicationFrequency');
            if (freqEl) {
                medFreq = freqEl.value;
            }
        } catch (_e) {
            // 若無法取得元素，保持預設空值
        }
        let medInfoHtml = '';
        if (medDays) {
            medInfoHtml += '<strong>服藥天數：</strong>' + medDays + '天　';
        }
        if (medFreq) {
            medInfoHtml += '<strong>每日次數：</strong>' + medFreq + '次　';
        }
        if (consultation.usage) {
            medInfoHtml += '<strong>服用方法：</strong>' + consultation.usage;
        }
        // 醫囑及注意事項
        const instructionsHtml = consultation.instructions ? consultation.instructions.replace(/\n/g, '<br>') : '';
        // 建議複診時間
        let followUpHtml = '';
        if (consultation.followUpDate) {
            try {
                if (consultation.followUpDate.seconds) {
                    followUpHtml = new Date(consultation.followUpDate.seconds * 1000).toLocaleString('zh-TW');
                } else {
                    followUpHtml = new Date(consultation.followUpDate).toLocaleString('zh-TW');
                }
            } catch (_err) {
                try {
                    followUpHtml = formatConsultationDateTime(consultation.followUpDate);
                } catch (_e2) {
                    followUpHtml = '';
                }
            }
        }
        // 構建列印內容
        const printContent = `
            <!DOCTYPE html>
            <html lang="zh-TW">
            <head>
                <meta charset="UTF-8">
                <title>藥單醫囑 - ${patient.name}</title>
                <style>
                    body { 
                        font-family: 'Microsoft JhengHei', '微軟正黑體', sans-serif; 
                        margin: 0; 
                        padding: 10px; 
                        line-height: 1.3;
                        font-size: 11px;
                    }
                    .advice-container {
                        width: 148mm;
                        height: 210mm;
                        margin: 0 auto;
                        border: 2px solid #000;
                        padding: 8px;
                        background: white;
                        box-sizing: border-box;
                    }
                    .clinic-header {
                        text-align: center;
                        border-bottom: 2px double #000;
                        padding-bottom: 10px;
                        margin-bottom: 15px;
                    }
                    .clinic-name {
                        font-size: 14px;
                        font-weight: bold;
                        margin-bottom: 2px;
                        letter-spacing: 1px;
                    }
                    .clinic-subtitle {
                        font-size: 10px;
                        color: #666;
                        margin-bottom: 3px;
                    }
                    .advice-title {
                        font-size: 14px;
                        font-weight: bold;
                        text-align: center;
                        margin: 6px 0;
                        letter-spacing: 2px;
                    }
                    .patient-info {
                        margin-bottom: 10px;
                        font-size: 11px;
                    }
                    .info-row {
                        display: flex;
                        justify-content: space-between;
                        margin-bottom: 3px;
                        font-size: 11px;
                    }
                    .info-label {
                        font-weight: bold;
                    }
                    .section-title {
                        font-weight: bold;
                        margin-top: 10px;
                        margin-bottom: 4px;
                        font-size: 12px;
                    }
                    .section-content {
                        background: #f9f9f9;
                        padding: 4px;
                        border: 1px solid #ddd;
                        font-size: 10px;
                        line-height: 1.3;
                        border-radius: 3px;
                    }
                    .thank-you {
                        text-align: center;
                        margin: 12px 0;
                        font-size: 11px;
                        font-weight: bold;
                        color: #333;
                    }
                    /* 頁尾資訊與行排版 */
                    .footer-info {
                        margin-top: 10px;
                        border-top: 1px dashed #666;
                        padding-top: 6px;
                        font-size: 9px;
                        color: #666;
                    }
                    .footer-row {
                        display: flex;
                        justify-content: space-between;
                        margin-bottom: 2px;
                    }
                    @media print {
                        @page {
                            size: A5;
                            margin: 10mm;
                        }
                        body { 
                            margin: 0; 
                            padding: 0; 
                            font-size: 11px;
                        }
                        .advice-container { 
                            width: 100%;
                            height: 100%;
                            padding: 8mm;
                        }
                    }
                </style>
            </head>
            <body>
                <div class="advice-container">
                    <!-- 診所標題 -->
                    <div class="clinic-header">
                        <div class="clinic-name">${clinicSettings.chineseName || '名醫診所系統'}</div>
                        <div class="clinic-subtitle">${clinicSettings.englishName || 'TCM Clinic'}</div>
                        <div class="clinic-subtitle">電話：${clinicSettings.phone || '(852) 2345-6789'}　地址：${clinicSettings.address || '香港中環皇后大道中123號'}</div>
                    </div>
                    <!-- 標題 -->
                    <div class="advice-title">藥單醫囑</div>
                    <!-- 病人及診療資訊 -->
                    <div class="patient-info">
                        <div class="info-row"><span class="info-label">病人姓名：</span><span>${patient.name}</span></div>
                        <!-- 新增病歷編號顯示，置於姓名下方 -->
                        <div class="info-row"><span class="info-label">病歷編號：</span><span>${consultation.medicalRecordNumber || consultation.id}</span></div>
                        ${patient.patientNumber ? `<div class="info-row"><span class="info-label">病人號碼：</span><span>${patient.patientNumber}</span></div>` : ''}
                        <div class="info-row"><span class="info-label">診療日期：</span><span>${consultationDate.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' })}</span></div>
                        <div class="info-row"><span class="info-label">診療時間：</span><span>${consultationDate.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}</span></div>
                        <div class="info-row"><span class="info-label">主治醫師：</span><span>${getDoctorDisplayName(consultation.doctor)}</span></div>
                        ${(() => {
                            // 顯示註冊編號（如有）
                            const regNumber = getDoctorRegistrationNumber(consultation.doctor);
                            return regNumber ? `
                                <div class="info-row"><span class="info-label">註冊編號：</span><span>${regNumber}</span></div>
                            ` : '';
                        })()}
                        ${consultation.diagnosis ? `<div class="info-row"><span class="info-label">診斷：</span><span>${consultation.diagnosis}</span></div>` : ''}
                    </div>
                    <!-- 處方內容 -->
                    <div class="section-title">處方內容</div>
                    <!-- 將處方內容分為三欄顯示 -->
                    <div class="section-content">${prescriptionHtml}</div>
                    ${medInfoHtml ? `<div class="section-title">服藥資訊</div><div class="section-content">${medInfoHtml}</div>` : ''}
                    ${instructionsHtml ? `<div class="section-title">醫囑及注意事項</div><div class="section-content">${instructionsHtml}</div>` : ''}
                    ${followUpHtml ? `<div class="section-title">建議複診時間</div><div class="section-content">${followUpHtml}</div>` : ''}
                    <div class="thank-you">謝謝您的光臨，祝您身體健康！</div>
                    <!-- 頁尾資訊（參考收據的應收金額下方內容） -->
                    <div class="footer-info">
                        <div class="footer-row">
                            <span>列印時間：</span>
                            <span>${new Date().toLocaleString('zh-TW')}</span>
                        </div>
                        <div class="footer-row">
                            <span>診所營業時間：</span>
                            <span>${clinicSettings.businessHours || '週一至週五 09:00-18:00'}</span>
                        </div>
                        <div class="footer-row">
                            <span>本醫囑請妥善保存<span style="font-size: 8px;">，此藥方不可重配</span></span>
                            <span>如有疑問請洽櫃檯</span>
                        </div>
                    </div>
                </div>
            </body>
            </html>
        `;
        // 開啟新視窗並列印
        const printWindow = window.open('', '_blank', 'width=500,height=700');
        printWindow.document.write(printContent);
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
        showToast('藥單醫囑已準備列印！', 'success');
    } catch (error) {
        console.error('列印藥單醫囑錯誤:', error);
        showToast('列印藥單醫囑時發生錯誤', 'error');
    }
}

// 修復撤回診症功能
async function withdrawConsultation(appointmentId) {
    // 取得觸發按鈕並顯示讀取狀態
    let loadingButton = null;
    try {
        if (typeof event !== 'undefined' && event && event.currentTarget) {
            loadingButton = event.currentTarget;
        }
    } catch (_e) {}
    if (!loadingButton) {
        try {
            loadingButton = document.querySelector('button[onclick="withdrawConsultation(' + appointmentId + ')"]');
        } catch (_e) {
            loadingButton = null;
        }
    }
    if (loadingButton) {
        setButtonLoading(loadingButton, '處理中...');
    }
    try {
        // 確保全域變數已初始化
        if (!Array.isArray(appointments)) {
            try {
                const appointmentResult = await window.firebaseDataManager.getAppointments();
                if (appointmentResult.success) {
                    appointments = appointmentResult.data;
                } else {
                    appointments = [];
                }
            } catch (error) {
                appointments = [];
            }
        }
        if (!Array.isArray(consultations)) {
            try {
                const consultationResult = await window.firebaseDataManager.getConsultations();
                if (consultationResult.success) {
                    consultations = consultationResult.data;
                } else {
                    consultations = [];
                }
            } catch (error) {
                consultations = [];
            }
        }
        const appointment = appointments.find(apt => apt && String(apt.id) === String(appointmentId));
        if (!appointment) {
            showToast('找不到掛號記錄！', 'error');
            return;
        }
        const patientResult = await window.firebaseDataManager.getPatients();
        if (!patientResult.success) {
            showToast('無法讀取病人資料！', 'error');
            return;
        }
        const patient = patientResult.data.find(p => p.id === appointment.patientId);
        if (!patient) {
            showToast('找不到病人資料！', 'error');
            return;
        }
        // 詳細狀態檢查
        console.log(`撤回診症狀態檢查 - 病人: ${patient.name}, 當前狀態: ${appointment.status}, 診症記錄ID: ${appointment.consultationId}`);
        // 只有已完成的診症才能撤回
        if (appointment.status !== 'completed') {
            const statusNames = {
                'registered': '已掛號',
                'waiting': '候診中',
                'consulting': '診症中'
            };
            const currentStatusName = statusNames[appointment.status] || appointment.status;
            showToast(`無法撤回診症！病人 ${patient.name} 目前狀態為「${currentStatusName}」，只能撤回已完成的診症。`, 'warning');
            return;
        }
        // 檢查是否有診症記錄
        if (!appointment.consultationId) {
            showToast(`無法撤回診症！病人 ${patient.name} 沒有對應的診症記錄。`, 'error');
            return;
        }
        // 嘗試從本地或 Firebase 取得診症記錄
        let consultation = consultations.find(c => c.id === appointment.consultationId);
        if (!consultation) {
            // 如果本地沒有，從 Firebase 讀取所有診症記錄並搜尋
            const consResult = await window.firebaseDataManager.getConsultations();
            if (consResult && consResult.success) {
                consultation = consResult.data.find(c => c.id === appointment.consultationId);
                if (consultation) {
                    consultations.push(consultation);
                    localStorage.setItem('consultations', JSON.stringify(consultations));
                }
            }
        }
        if (!consultation) {
            showToast(`無法撤回診症！找不到病人 ${patient.name} 的診症記錄資料。`, 'error');
            return;
        }

// 確認撤回操作
const confirmMessage = `確定要撤回 ${patient.name} 的診症嗎？\n\n` +
                     `此操作將會：\n` +
                     `• 刪除該次病歷記錄\n` +
                     `• 病人狀態回到「已掛號」\n` +
                     `• 所有診症資料將永久遺失\n\n` +
                     `診斷：${consultation.diagnosis || '無記錄'}\n\n` +
                     `注意：此操作無法復原！`;

if (confirm(confirmMessage)) {
    // 刪除診症記錄
    // 先從 Firebase 刪除該次診症記錄
    try {
        await window.firebase.deleteDoc(
            window.firebase.doc(
                window.firebase.db,
                'consultations',
                String(appointment.consultationId)
            )
        );
        // 從本地集合中移除該診症記錄
        const consultationIndex = consultations.findIndex(
            (c) => c.id === appointment.consultationId
        );
        if (consultationIndex !== -1) {
            consultations.splice(consultationIndex, 1);
            localStorage.setItem(
                'consultations',
                JSON.stringify(consultations)
            );
        }
    } catch (error) {
        console.error('刪除診症記錄失敗:', error);
        showToast('刪除診症記錄時發生錯誤', 'error');
    }

    // 將掛號狀態改回已掛號
    appointment.status = 'registered';
    delete appointment.completedAt;
    delete appointment.consultationId;
    delete appointment.completedBy;
    delete appointment.consultationStartTime;
    delete appointment.consultingDoctor;

    // 保存狀態變更
    localStorage.setItem('appointments', JSON.stringify(appointments));
    // 同步更新到 Firebase
    await window.firebaseDataManager.updateAppointment(
        String(appointment.id),
        appointment
    );

    showToast(
        `已撤回 ${patient.name} 的診症，病人狀態回到已掛號`,
        'success'
    );

    // 如果正在編輯該病歷，則關閉表單
    if (
        String(currentConsultingAppointmentId) === String(appointmentId)
    ) {
        closeConsultationForm();
        currentConsultingAppointmentId = null;
    }
    // 重新載入列表和統計
    loadTodayAppointments();
    updateStatistics();
}
    } catch (error) {
        console.error('讀取病人資料錯誤:', error);
        showToast('讀取病人資料失敗', 'error');
    } finally {
        // 清除按鈕的讀取狀態
        if (loadingButton) {
            clearButtonLoading(loadingButton);
        }
    }
}

// 修復修改病歷功能
async function editMedicalRecord(appointmentId) {
    // 取得觸發按鈕並顯示讀取狀態
    let loadingButton = null;
    try {
        if (typeof event !== 'undefined' && event && event.currentTarget) {
            loadingButton = event.currentTarget;
        }
    } catch (_e) {}
    if (!loadingButton) {
        try {
            loadingButton = document.querySelector('button[onclick="editMedicalRecord(' + appointmentId + ')"]');
        } catch (_e) {
            loadingButton = null;
        }
    }
    if (loadingButton) {
        setButtonLoading(loadingButton, '處理中...');
    }
    try {
        // 確保全域變數已初始化
        if (!Array.isArray(appointments)) {
            try {
                const appointmentResult = await window.firebaseDataManager.getAppointments();
                if (appointmentResult.success) {
                    appointments = appointmentResult.data;
                } else {
                    appointments = [];
                }
            } catch (error) {
                console.error('初始化掛號數據錯誤:', error);
                appointments = [];
            }
        }
        if (!Array.isArray(consultations)) {
            try {
                const consultationResult = await window.firebaseDataManager.getConsultations();
                if (consultationResult.success) {
                    consultations = consultationResult.data;
                } else {
                    consultations = [];
                }
            } catch (error) {
                console.error('初始化診療記錄錯誤:', error);
                consultations = [];
            }
        }
        const appointment = appointments.find(apt => apt && String(apt.id) === String(appointmentId));
        if (!appointment) {
            showToast('找不到掛號記錄！', 'error');
            return;
        }
        const patientResult = await window.firebaseDataManager.getPatients();
        if (!patientResult.success) {
            showToast('無法讀取病人資料！', 'error');
            return;
        }
        const patient = patientResult.data.find(p => p.id === appointment.patientId);
        if (!patient) {
            showToast('找不到病人資料！', 'error');
            return;
        }
        // 詳細狀態檢查
        console.log(`修改病歷狀態檢查 - 病人: ${patient.name}, 當前狀態: ${appointment.status}, 診症記錄ID: ${appointment.consultationId}`);
        // 只有已完成的診症才能修改病歷
        if (appointment.status !== 'completed') {
            const statusNames = {
                'registered': '已掛號',
                'waiting': '候診中',
                'consulting': '診症中'
            };
            const currentStatusName = statusNames[appointment.status] || appointment.status;
            showToast(`無法修改病歷！病人 ${patient.name} 目前狀態為「${currentStatusName}」，只能修改已完成診症的病歷。`, 'warning');
            return;
        }
        // 檢查是否有診症記錄
        if (!appointment.consultationId) {
            showToast(`無法修改病歷！病人 ${patient.name} 沒有對應的診症記錄。`, 'error');
            return;
        }
        // 嘗試從本地或 Firebase 取得診療記錄
        let consultation = null;
        try {
            const consResult = await window.firebaseDataManager.getConsultations();
            if (consResult && consResult.success) {
                consultation = consResult.data.find(c => c.id === appointment.consultationId);
                // 同步更新全域變數
                consultations = consResult.data;
            }
        } catch (error) {
            console.error('讀取診療記錄錯誤:', error);
        }
        if (!consultation) {
            // 如果本地沒有，則從 Firebase 讀取所有診症記錄並搜尋
            const consResult = await window.firebaseDataManager.getConsultations();
            if (consResult && consResult.success) {
                consultation = consResult.data.find(c => c.id === appointment.consultationId);
                if (consultation) {
                    // 將查找到的診症記錄寫入本地緩存，以便後續使用
                    consultations.push(consultation);
                    localStorage.setItem('consultations', JSON.stringify(consultations));
                }
            }
        }
        if (!consultation) {
            // 如果仍然找不到診症記錄，提示錯誤後結束
            showToast(`無法修改病歷！找不到病人 ${patient.name} 的診症記錄資料。`, 'error');
            return;
        }
        // 檢查是否有其他病人正在診症中（僅限制同一醫師）
        let consultingAppointment = null;
        const isDoctorUser = currentUserData && currentUserData.position === '醫師';
        if (isDoctorUser) {
            consultingAppointment = appointments.find(apt =>
                apt.status === 'consulting' &&
                apt.appointmentDoctor === currentUserData.username &&
                new Date(apt.appointmentTime).toDateString() === new Date().toDateString()
            );
        }
        if (consultingAppointment) {
            // 從 Firebase 獲取正在診症的病人資料
            const consultingPatient = patientResult.data.find(p => p.id === consultingAppointment.patientId);
            const consultingPatientName = consultingPatient ? consultingPatient.name : '未知病人';
            if (confirm(`您目前正在為 ${consultingPatientName} 診症。\n\n是否要結束該病人的診症並開始修改 ${patient.name} 的病歷？\n\n注意：${consultingPatientName} 的狀態將改回候診中。`)) {
                // 結束當前診症的病人
                consultingAppointment.status = 'waiting';
                delete consultingAppointment.consultationStartTime;
                delete consultingAppointment.consultingDoctor;
                // 關閉可能開啟的診症表單
                // 使用字串比較，避免 ID 類型不一致導致無法匹配
                if (String(currentConsultingAppointmentId) === String(consultingAppointment.id)) {
                    closeConsultationForm();
                }
                showToast(`已結束 ${consultingPatientName} 的診症`, 'info');
                localStorage.setItem('appointments', JSON.stringify(appointments));
                // 同步更新到 Firebase
                await window.firebaseDataManager.updateAppointment(String(consultingAppointment.id), consultingAppointment);
            } else {
                return; // 用戶取消操作
            }
        }
        // 設置為編輯模式
        currentConsultingAppointmentId = appointmentId;
        showConsultationForm(appointment);
        showToast(`進入 ${patient.name} 的病歷編輯模式`, 'info');
    } catch (error) {
        console.error('讀取病人資料錯誤:', error);
        showToast('讀取病人資料失敗', 'error');
    } finally {
        // 清除按鈕的讀取狀態
        if (loadingButton) {
            clearButtonLoading(loadingButton);
        }
    }
}
// 載入病人診療記錄摘要
async function loadPatientConsultationSummary(patientId) {
    const summaryContainer = document.getElementById('patientConsultationSummary');

    // 如果容器尚未渲染，直接跳過，以免對 null 設定 innerHTML
    if (!summaryContainer) {
        console.warn('patientConsultationSummary 容器不存在，診療摘要無法載入');
        return;
    }

    try {
        const result = await window.firebaseDataManager.getPatientConsultations(patientId);
        
        if (!result.success) {
            summaryContainer.innerHTML = `
                <div class="text-center py-8 text-gray-500">
                    <div class="text-4xl mb-2">❌</div>
                    <div>無法載入診療記錄</div>
                </div>
            `;
            return;
        }

        const consultations = result.data;
        const totalConsultations = consultations.length;
        const lastConsultation = consultations[0]; // 最新的診療記錄

        // 取得並計算套票狀態
        let packageStatusHtml = '';
        try {
            const pkgs = await getPatientPackages(patientId);
            // 如果有套票紀錄
            if (Array.isArray(pkgs) && pkgs.length > 0) {
                // 只顯示有剩餘次數的套票
                const activePkgs = pkgs.filter(p => p && p.remainingUses > 0);
                if (activePkgs.length > 0) {
                    // 按到期日排序，越早到期越前面顯示
                    activePkgs.sort((a, b) => new Date(a.expiresAt) - new Date(b.expiresAt));
                    
                    packageStatusHtml = `
                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            ${activePkgs.map(pkg => {
                                const status = formatPackageStatus(pkg);
                                const expiresAt = new Date(pkg.expiresAt);
                                const now = new Date();
                                const daysLeft = Math.ceil((expiresAt - now) / (1000*60*60*24));
                                
                                // 根據剩餘天數決定顏色
                                let statusColor = 'bg-green-50 border-green-200 text-green-800';
                                let iconColor = 'text-green-600';
                                let progressColor = 'bg-green-500';
                                
                                if (daysLeft <= 7) {
                                    statusColor = 'bg-red-50 border-red-200 text-red-800';
                                    iconColor = 'text-red-600';
                                    progressColor = 'bg-red-500';
                                } else if (daysLeft <= 30) {
                                    statusColor = 'bg-yellow-50 border-yellow-200 text-yellow-800';
                                    iconColor = 'text-yellow-600';
                                    progressColor = 'bg-yellow-500';
                                }
                                
                                // 計算使用進度
                                const usagePercentage = ((pkg.totalUses - pkg.remainingUses) / pkg.totalUses) * 100;
                                
                                return `
                                    <div class="relative ${statusColor} border rounded-lg p-3 transition-all duration-200 hover:shadow-md">
                                        <!-- 套票名稱和圖標 -->
                                        <div class="flex items-start justify-between mb-2">
                                            <div class="flex items-center space-x-2">
                                                <div class="${iconColor}">
                                                    <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                                        <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                                                    </svg>
                                                </div>
                                                <div class="font-medium text-sm truncate">${pkg.name}</div>
                                            </div>
                                            <div class="text-xs font-medium px-2 py-1 rounded-full bg-white bg-opacity-70 whitespace-nowrap">
                                                ${daysLeft <= 0 ? '已到期' : `${daysLeft}天`}
                                            </div>
                                        </div>
                                        
                                        <!-- 使用次數和進度條 -->
                                        <div class="space-y-2">
                                            <div class="flex justify-between items-center text-xs">
                                                <span>剩餘 ${pkg.remainingUses}/${pkg.totalUses}</span>
                                                <span>${Math.round(100 - usagePercentage)}%</span>
                                            </div>
                                            
                                            <!-- 進度條 -->
                                            <div class="w-full bg-white bg-opacity-50 rounded-full h-1.5">
                                                <div class="${progressColor} h-1.5 rounded-full transition-all duration-300" 
                                                     style="width: ${usagePercentage}%"></div>
                                            </div>
                                            
                                            <!-- 到期日 -->
                                            <div class="text-xs opacity-75 truncate">
                                                ${expiresAt.toLocaleDateString('zh-TW')}
                                            </div>
                                        </div>
                                        
                                        <!-- 緊急標記 -->
                                        ${daysLeft <= 7 && daysLeft > 0 ? `
                                            <div class="absolute -top-1 -right-1">
                                                <span class="inline-flex items-center justify-center w-4 h-4 text-xs font-bold text-white bg-red-500 rounded-full animate-pulse">
                                                    !
                                                </span>
                                            </div>
                                        ` : ''}
                                    </div>
                                `;
                            }).join('')}
                        </div>`;
                } else {
                    // 有套票記錄但已全數用盡
                    packageStatusHtml = `
                        <div class="bg-gray-50 border-gray-200 border rounded-lg p-3 text-center">
                            <div class="text-gray-400 mb-1">
                                <svg class="w-6 h-6 mx-auto" fill="currentColor" viewBox="0 0 20 20">
                                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
                                </svg>
                            </div>
                            <div class="text-sm font-medium text-gray-600">無可用套票</div>
                            <div class="text-xs text-gray-500 mt-1">所有套票已用完或過期</div>
                        </div>
                    `;
                }
            } else {
                // 無套票記錄
                packageStatusHtml = `
                    <div class="bg-blue-50 border-blue-200 border rounded-lg p-3 text-center">
                        <div class="text-blue-400 mb-1">
                            <svg class="w-6 h-6 mx-auto" fill="currentColor" viewBox="0 0 20 20">
                                <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/>
                            </svg>
                        </div>
                        <div class="text-sm font-medium text-blue-700">尚未購買套票</div>
                        <div class="text-xs text-blue-600 mt-1">可於診療時購買套票享優惠</div>
                    </div>
                `;
            }
        } catch (err) {
            console.error('取得套票資訊失敗:', err);
            packageStatusHtml = `
                <div class="bg-red-50 border-red-200 border rounded-lg p-3 text-center">
                    <div class="text-red-400 mb-1">
                        <svg class="w-6 h-6 mx-auto" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
                        </svg>
                    </div>
                    <div class="text-sm font-medium text-red-700">載入失敗</div>
                    <div class="text-xs text-red-600 mt-1">無法載入套票狀態</div>
                </div>
            `;
        }

        if (totalConsultations === 0) {
            summaryContainer.innerHTML = `
                <!-- 第一行：基本統計資訊 -->
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div class="bg-blue-50 rounded-lg p-4 text-center">
                        <div class="text-2xl font-bold text-blue-600">0</div>
                        <div class="text-sm text-blue-800">總診療次數</div>
                    </div>
                    <div class="bg-green-50 rounded-lg p-4 text-center">
                        <div class="text-lg font-semibold text-green-600">無</div>
                        <div class="text-sm text-green-800">最近診療</div>
                    </div>
                    <div class="bg-orange-50 rounded-lg p-4 text-center">
                        <div class="text-lg font-semibold text-orange-600">無安排</div>
                        <div class="text-sm text-orange-800">下次複診</div>
                    </div>
                </div>

                <!-- 第二行：套票狀態區域 -->
                <div class="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg p-4 border border-purple-200 mb-4">
                    <div class="flex items-center justify-between mb-3">
                        <div class="flex items-center">
                            <svg class="w-5 h-5 text-purple-600 mr-2" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                            </svg>
                            <h3 class="text-lg font-semibold text-purple-800">套票狀態</h3>
                        </div>
                        <div class="text-xs text-purple-600 bg-white px-2 py-1 rounded-full">
                            0 個可用
                        </div>
                    </div>
                    ${packageStatusHtml}
                </div>

                <div class="text-center py-8 text-gray-500">
                    <div class="text-4xl mb-2">📋</div>
                    <div>尚無診療記錄</div>
                </div>
            `;
            return;
        }

        // 格式化最後診療日期
        const lastConsultationDate = lastConsultation.date ? 
            new Date(lastConsultation.date.seconds * 1000).toLocaleDateString('zh-TW') : 
            new Date(lastConsultation.createdAt.seconds * 1000).toLocaleDateString('zh-TW');

        // 格式化下次複診日期
        const nextFollowUp = lastConsultation.followUpDate ? 
            new Date(lastConsultation.followUpDate).toLocaleDateString('zh-TW') : '無安排';

        // 更新診療摘要：第一行顯示基本統計，第二行顯示套票狀態
        summaryContainer.innerHTML = `
            <!-- 第一行：基本統計資訊 -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div class="bg-blue-50 rounded-lg p-4 text-center">
                    <div class="text-2xl font-bold text-blue-600">${totalConsultations}</div>
                    <div class="text-sm text-blue-800">總診療次數</div>
                </div>
                <div class="bg-green-50 rounded-lg p-4 text-center">
                    <div class="text-lg font-semibold text-green-600">${lastConsultationDate}</div>
                    <div class="text-sm text-green-800">最近診療</div>
                </div>
                <div class="bg-orange-50 rounded-lg p-4 text-center">
                    <div class="text-lg font-semibold text-orange-600">${nextFollowUp}</div>
                    <div class="text-sm text-orange-800">下次複診</div>
                </div>
            </div>

            <!-- 第二行：套票狀態區域 -->
            <div class="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg p-4 border border-purple-200">
                <div class="flex items-center justify-between mb-3">
                    <div class="flex items-center">
                        <svg class="w-5 h-5 text-purple-600 mr-2" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                        <h3 class="text-lg font-semibold text-purple-800">套票狀態</h3>
                    </div>
                    <div class="text-xs text-purple-600 bg-white px-2 py-1 rounded-full">
                        ${Array.isArray(await getPatientPackages(patientId)) ? (await getPatientPackages(patientId)).filter(p => p.remainingUses > 0).length : 0} 個可用
                    </div>
                </div>
                ${packageStatusHtml}
            </div>
        `;

    } catch (error) {
        console.error('載入診療記錄摘要錯誤:', error);
        summaryContainer.innerHTML = `
            <div class="text-center py-8 text-gray-500">
                <div class="text-4xl mb-2">❌</div>
                <div>載入診療記錄失敗</div>
            </div>
        `;
    }
}
        
// 更新統計功能
async function updateStatistics() {
    try {
        // 如果 Firebase 數據管理器尚未初始化或尚未準備好，則跳過統計更新。
        if (!window.firebaseDataManager || !window.firebaseDataManager.isReady) {
            console.log('Firebase 數據管理器尚未準備就緒，統計資訊將稍後更新');
            return;
        }
        // 為避免在主頁多次從 Firebase 讀取掛號和病人資料，這裡優先使用已緩存或本地儲存的資料計算統計。
        let totalPatients = 0;
        try {
            // 如果全域 patients 已載入且非空，直接使用其長度
            if (Array.isArray(patients) && patients.length > 0) {
                totalPatients = patients.length;
            } else if (Array.isArray(patientCache) && patientCache.length > 0) {
                // 如果有快取，使用快取長度
                totalPatients = patientCache.length;
            } else {
                // 最後檢查本地存儲
                const storedPatients = localStorage.getItem('patients');
                if (storedPatients) {
                    try {
                        const parsed = JSON.parse(storedPatients);
                        if (Array.isArray(parsed)) {
                            totalPatients = parsed.length;
                        }
                    } catch (parseError) {
                        // ignore JSON parse error
                    }
                }
            }
        } catch (countError) {
            console.error('計算病人數量錯誤:', countError);
            totalPatients = 0;
        }
        // 更新病人總數顯示
        const totalPatientsElement = document.getElementById('totalPatients');
        if (totalPatientsElement) {
            totalPatientsElement.textContent = totalPatients;
        }
        // 處理掛號資料：優先使用全域 appointments，如果不存在再使用本地儲存。
        let appointmentsData = [];
        try {
            if (Array.isArray(appointments) && appointments.length > 0) {
                appointmentsData = appointments;
            } else {
                const storedApts = localStorage.getItem('appointments');
                if (storedApts) {
                    try {
                        const parsedApt = JSON.parse(storedApts);
                        if (Array.isArray(parsedApt)) {
                            appointmentsData = parsedApt;
                        }
                    } catch (parseErr) {
                        // ignore JSON parse error
                    }
                }
            }
        } catch (aptError) {
            console.error('讀取掛號資料錯誤:', aptError);
            appointmentsData = [];
        }
        // 計算今日診療數（從掛號數據計算）
        const today = new Date().toDateString();
        const todayConsultations = appointmentsData.filter(apt => 
            apt.status === 'completed' && 
            new Date(apt.appointmentTime).toDateString() === today
        ).length;
        const todayConsultationsElement = document.getElementById('todayConsultations');
        if (todayConsultationsElement) {
            todayConsultationsElement.textContent = todayConsultations;
        }
        // 計算本月診療數
        const thisMonth = new Date();
        const monthlyConsultations = appointmentsData.filter(apt => 
            apt.status === 'completed' && 
            new Date(apt.appointmentTime).getMonth() === thisMonth.getMonth() &&
            new Date(apt.appointmentTime).getFullYear() === thisMonth.getFullYear()
        ).length;
        const monthlyConsultationsElement = document.getElementById('monthlyConsultations');
        if (monthlyConsultationsElement) {
            monthlyConsultationsElement.textContent = monthlyConsultations;
        }
    } catch (error) {
        console.error('更新統計錯誤:', error);
        // 如果計算失敗，顯示 0
        const totalPatientsElement = document.getElementById('totalPatients');
        if (totalPatientsElement) {
            totalPatientsElement.textContent = '0';
        }
    }
}

// 在用戶透過 Authentication 登入後初始化系統資料。
// 這個函式會載入掛號、診療記錄及患者資料，
// 並在完成後更新統計資訊以及訂閱掛號即時更新。
async function initializeSystemAfterLogin() {
    // 確保 Firebase 資料管理器已準備好
    await waitForFirebaseDataManager();
    try {
        // 僅在登入後初始化必要的資料。為了避免在進入主頁時重複讀取掛號與病人資料，
        // 此處僅讀取診療記錄，掛號與病人資料將透過實時監聽或功能頁面再讀取。
        try {
            const consultationResult = await window.firebaseDataManager.getConsultations();
            if (consultationResult && consultationResult.success) {
                consultations = consultationResult.data;
            } else {
                consultations = [];
            }
        } catch (consultError) {
            console.error('讀取診療記錄失敗:', consultError);
            consultations = [];
        }
        console.log('登入後系統資料初始化完成');
    } catch (error) {
        console.error('初始化系統資料失敗:', error);
        consultations = [];
    }
    // 不在此處更新統計或讀取掛號/病人資料。實時掛號監聽將在後續處理。
    // 啟動實時掛號監聽，無需手動更新今日掛號列表
    subscribeToAppointments();
}



        // 診所設定管理功能
        function showClinicSettingsModal() {
            // 載入現有設定
            document.getElementById('clinicChineseName').value = clinicSettings.chineseName || '';
            document.getElementById('clinicEnglishName').value = clinicSettings.englishName || '';
            document.getElementById('clinicBusinessHours').value = clinicSettings.businessHours || '';
            document.getElementById('clinicPhone').value = clinicSettings.phone || '';
            document.getElementById('clinicAddress').value = clinicSettings.address || '';
            
            document.getElementById('clinicSettingsModal').classList.remove('hidden');
        }
        
        function hideClinicSettingsModal() {
            document.getElementById('clinicSettingsModal').classList.add('hidden');
        }
        
        function saveClinicSettings() {
            const chineseName = document.getElementById('clinicChineseName').value.trim();
            const englishName = document.getElementById('clinicEnglishName').value.trim();
            const businessHours = document.getElementById('clinicBusinessHours').value.trim();
            const phone = document.getElementById('clinicPhone').value.trim();
            const address = document.getElementById('clinicAddress').value.trim();
            
            if (!chineseName) {
                showToast('請輸入診所中文名稱！', 'error');
                return;
            }
            
            // 更新診所設定
            clinicSettings.chineseName = chineseName;
            clinicSettings.englishName = englishName;
            clinicSettings.businessHours = businessHours;
            clinicSettings.phone = phone;
            clinicSettings.address = address;
            clinicSettings.updatedAt = new Date().toISOString();
            
            // 保存到本地儲存
            localStorage.setItem('clinicSettings', JSON.stringify(clinicSettings));
            
            // 更新系統管理頁面的顯示
            updateClinicSettingsDisplay();
            
            hideClinicSettingsModal();
            showToast('診所資料已成功更新！', 'success');
        }
        
        function updateClinicSettingsDisplay() {
            // 更新系統管理頁面的診所設定顯示
            const chineseNameSpan = document.getElementById('displayChineseName');
            const englishNameSpan = document.getElementById('displayEnglishName');
            
            if (chineseNameSpan) {
                chineseNameSpan.textContent = clinicSettings.chineseName || '名醫診所系統';
            }
            if (englishNameSpan) {
                englishNameSpan.textContent = clinicSettings.englishName || 'TCM Clinic';
            }
            
            // 更新登入頁面的診所名稱
            const loginTitle = document.getElementById('loginTitle');
            const loginEnglishTitle = document.getElementById('loginEnglishTitle');
            if (loginTitle) {
                loginTitle.textContent = clinicSettings.chineseName || '名醫診所系統';
            }
            if (loginEnglishTitle) {
                loginEnglishTitle.textContent = clinicSettings.englishName || 'TCM Clinic';
            }
            
            // 更新主頁面的診所名稱
            const systemTitle = document.getElementById('systemTitle');
            const systemEnglishTitle = document.getElementById('systemEnglishTitle');
            if (systemTitle) {
                systemTitle.textContent = clinicSettings.chineseName || '名醫診所系統';
            }
            if (systemEnglishTitle) {
                systemEnglishTitle.textContent = clinicSettings.englishName || 'TCM Clinic';
            }
            
            // 更新歡迎頁面的診所名稱
            const welcomeTitle = document.getElementById('welcomeTitle');
            const welcomeEnglishTitle = document.getElementById('welcomeEnglishTitle');
            if (welcomeTitle) {
                welcomeTitle.textContent = `歡迎使用${clinicSettings.chineseName || '名醫診所系統'}`;
            }
            if (welcomeEnglishTitle) {
                welcomeEnglishTitle.textContent = `Welcome to ${clinicSettings.englishName || 'TCM Clinic'}`;
            }
        }



        // 中藥庫管理功能
        let editingHerbId = null;
        let editingFormulaId = null;
        let currentHerbFilter = 'all';
        
        async function loadHerbLibrary() {
            // 若尚未載入中藥庫資料，才從 Firestore 重新載入
            if (typeof initHerbLibrary === 'function' && (!Array.isArray(herbLibrary) || herbLibrary.length === 0)) {
                await initHerbLibrary();
            }
            displayHerbLibrary();
            
            // 搜尋功能
            const searchInput = document.getElementById('searchHerb');
            if (searchInput) {
                searchInput.addEventListener('input', function() {
                    displayHerbLibrary();
                });
            }
        }
        
        function filterHerbLibrary(type) {
            currentHerbFilter = type;
            
            // 更新按鈕樣式
            document.querySelectorAll('[id^="filter-"]').forEach(btn => {
                btn.className = 'px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition duration-200';
            });
            document.getElementById(`filter-${type}`).className = 'px-4 py-2 rounded-lg text-sm font-medium bg-blue-100 text-blue-800 transition duration-200';
            
            displayHerbLibrary();
        }
        
        function displayHerbLibrary() {
            const searchTerm = document.getElementById('searchHerb').value.toLowerCase();
            const listContainer = document.getElementById('herbLibraryList');
            
            // 過濾資料
            let filteredItems = herbLibrary.filter(item => {
                const matchesSearch = item.name.toLowerCase().includes(searchTerm) ||
                                    (item.alias && item.alias.toLowerCase().includes(searchTerm)) ||
                                    (item.effects && item.effects.toLowerCase().includes(searchTerm));
                
                const matchesFilter = currentHerbFilter === 'all' || item.type === currentHerbFilter;
                
                return matchesSearch && matchesFilter;
            });
            
            if (filteredItems.length === 0) {
                listContainer.innerHTML = `
                    <div class="text-center py-12 text-gray-500">
                        <div class="text-4xl mb-4">🌿</div>
                        <div class="text-lg font-medium mb-2">沒有找到相關資料</div>
                        <div class="text-sm">請嘗試其他搜尋條件或新增中藥材/方劑</div>
                    </div>
                `;
                return;
            }
            
            // 按類型分組顯示
            const herbs = filteredItems.filter(item => item.type === 'herb');
            const formulas = filteredItems.filter(item => item.type === 'formula');
            
            let html = '';
            
            if (herbs.length > 0 && (currentHerbFilter === 'all' || currentHerbFilter === 'herb')) {
                html += `
                    <div class="mb-8">
                        <h3 class="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                            <span class="mr-2">🌿</span>中藥材 (${herbs.length})
                        </h3>
                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            ${herbs.map(herb => createHerbCard(herb)).join('')}
                        </div>
                    </div>
                `;
            }
            
            if (formulas.length > 0 && (currentHerbFilter === 'all' || currentHerbFilter === 'formula')) {
                html += `
                    <div class="mb-8">
                        <h3 class="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                            <span class="mr-2">📋</span>方劑 (${formulas.length})
                        </h3>
                        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            ${formulas.map(formula => createFormulaCard(formula)).join('')}
                        </div>
                    </div>
                `;
            }
            
            listContainer.innerHTML = html;
        }
        
        function createHerbCard(herb) {
            // 為避免 XSS，對文字內容進行轉義
            const safeName = window.escapeHtml(herb.name);
            const safeAlias = herb.alias ? window.escapeHtml(herb.alias) : null;
            const safeEffects = herb.effects ? window.escapeHtml(herb.effects) : null;
            const safeDosage = herb.dosage ? window.escapeHtml(String(herb.dosage)) : null;
            const safeCautions = herb.cautions ? window.escapeHtml(herb.cautions) : null;
            return `
                <div class="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition duration-200">
                    <div class="flex justify-between items-start mb-3">
                        <div>
                            <h4 class="text-lg font-semibold text-gray-900">${safeName}</h4>
                            ${safeAlias ? `<p class="text-sm text-gray-600">${safeAlias}</p>` : ''}
                        </div>
                        <div class="flex space-x-1">
                            <button onclick="editHerb(${herb.id})" class="text-blue-600 hover:text-blue-800 text-sm">編輯</button>
                            <button onclick="deleteHerbItem(${herb.id})" class="text-red-600 hover:text-red-800 text-sm">刪除</button>
                        </div>
                    </div>
                    
                    <div class="space-y-2 text-sm">
                        <!-- 移除性味與歸經顯示 -->
                        ${safeEffects ? `<div><span class="font-medium text-gray-700">功效：</span>${safeEffects}</div>` : ''}
                        ${safeDosage ? `<div><span class="font-medium text-gray-700">劑量：</span><span class="text-blue-600 font-medium">${safeDosage}</span></div>` : ''}
                        ${safeCautions ? `<div><span class="font-medium text-red-600">注意：</span><span class="text-red-700">${safeCautions}</span></div>` : ''}
                    </div>
                </div>
            `;
        }
        
        function createFormulaCard(formula) {
            // 為避免 XSS，對文字內容進行轉義
            const safeName = window.escapeHtml(formula.name);
            const safeSource = formula.source ? window.escapeHtml(formula.source) : null;
            const safeEffects = formula.effects ? window.escapeHtml(formula.effects) : null;
            const safeComposition = formula.composition ? window.escapeHtml(formula.composition).replace(/\n/g, '<br>') : null;
            const safeCautions = formula.cautions ? window.escapeHtml(formula.cautions) : null;
            return `
                <div class="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition duration-200">
                    <div class="flex justify-between items-start mb-3">
                        <div>
                            <h4 class="text-lg font-semibold text-gray-900">${safeName}</h4>
                            ${safeSource ? `<p class="text-sm text-gray-600">出處：${safeSource}</p>` : ''}
                        </div>
                        <div class="flex space-x-1">
                            <button onclick="editFormula(${formula.id})" class="text-blue-600 hover:text-blue-800 text-sm">編輯</button>
                            <button onclick="deleteHerbItem(${formula.id})" class="text-red-600 hover:text-red-800 text-sm">刪除</button>
                        </div>
                    </div>
                    
                    <div class="space-y-3 text-sm">
                        ${safeEffects ? `<div><span class="font-medium text-gray-700">功效：</span>${safeEffects}</div>` : ''}
                        <!-- 移除主治顯示 -->
                        ${safeComposition ? `
                            <div>
                                <span class="font-medium text-gray-700">組成：</span>
                                <div class="mt-1 p-2 bg-yellow-50 rounded text-xs whitespace-pre-line border-l-2 border-yellow-400">${safeComposition}</div>
                            </div>
                        ` : ''}
                        <!-- 移除用法顯示 -->
                        ${safeCautions ? `<div><span class="font-medium text-red-600">注意：</span><span class="text-red-700">${safeCautions}</span></div>` : ''}
                    </div>
                </div>
            `;
        }
        
        // 中藥材表單功能
        function showAddHerbForm() {
            editingHerbId = null;
            document.getElementById('herbFormTitle').textContent = '新增中藥材';
            document.getElementById('herbSaveButtonText').textContent = '儲存';
            clearHerbForm();
            document.getElementById('addHerbModal').classList.remove('hidden');
        }
        
        function hideAddHerbForm() {
            document.getElementById('addHerbModal').classList.add('hidden');
            clearHerbForm();
            editingHerbId = null;
        }
        
        function clearHerbForm() {
            // 移除性味、歸經與主治欄位，僅清除仍使用的欄位
            ['herbName', 'herbAlias', 'herbEffects', 'herbDosage', 'herbCautions'].forEach(id => {
                document.getElementById(id).value = '';
            });
        }
        
        function editHerb(id) {
            const herb = herbLibrary.find(item => item.id === id && item.type === 'herb');
            if (!herb) return;
            
            editingHerbId = id;
            document.getElementById('herbFormTitle').textContent = '編輯中藥材';
            document.getElementById('herbSaveButtonText').textContent = '更新';
            
            document.getElementById('herbName').value = herb.name || '';
            document.getElementById('herbAlias').value = herb.alias || '';
            // 不再處理性味與歸經欄位
            document.getElementById('herbEffects').value = herb.effects || '';
            // 主治欄位已移除
            document.getElementById('herbDosage').value = herb.dosage || '';
            document.getElementById('herbCautions').value = herb.cautions || '';
            
            document.getElementById('addHerbModal').classList.remove('hidden');
        }
        
        async function saveHerb() {
            const name = document.getElementById('herbName').value.trim();
            
            if (!name) {
                showToast('請輸入中藥材名稱！', 'error');
                return;
            }
            
            // 組合中藥物件時，不再包含性味、歸經與主治欄位
            const herb = {
                id: editingHerbId || Date.now(),
                type: 'herb',
                name: name,
                alias: document.getElementById('herbAlias').value.trim(),
                effects: document.getElementById('herbEffects').value.trim(),
                dosage: document.getElementById('herbDosage').value.trim(),
                cautions: document.getElementById('herbCautions').value.trim(),
                createdAt: editingHerbId ? herbLibrary.find(h => h.id === editingHerbId).createdAt : new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            
            if (editingHerbId) {
                const index = herbLibrary.findIndex(item => item.id === editingHerbId);
                herbLibrary[index] = herb;
                showToast('中藥材資料已更新！', 'success');
            } else {
                herbLibrary.push(herb);
                showToast('中藥材已新增！', 'success');
            }
            
            try {
                // 將中藥材資料寫入 Firestore
                await window.firebase.setDoc(
                    window.firebase.doc(window.firebase.db, 'herbLibrary', String(herb.id)),
                    herb
                );
            } catch (error) {
                console.error('儲存中藥材資料至 Firestore 失敗:', error);
            }
            hideAddHerbForm();
            displayHerbLibrary();
        }
        
        // 方劑表單功能
        function showAddFormulaForm() {
            editingFormulaId = null;
            document.getElementById('formulaFormTitle').textContent = '新增方劑';
            document.getElementById('formulaSaveButtonText').textContent = '儲存';
            clearFormulaForm();
            document.getElementById('addFormulaModal').classList.remove('hidden');
        }
        
        function hideAddFormulaForm() {
            document.getElementById('addFormulaModal').classList.add('hidden');
            clearFormulaForm();
            editingFormulaId = null;
        }
        
        function clearFormulaForm() {
            // 只清除仍使用的欄位，移除主治與用法
            ['formulaName', 'formulaSource', 'formulaEffects', 'formulaComposition', 'formulaCautions'].forEach(id => {
                document.getElementById(id).value = '';
            });
        }
        
        function editFormula(id) {
            const formula = herbLibrary.find(item => item.id === id && item.type === 'formula');
            if (!formula) return;
            
            editingFormulaId = id;
            document.getElementById('formulaFormTitle').textContent = '編輯方劑';
            document.getElementById('formulaSaveButtonText').textContent = '更新';
            
            document.getElementById('formulaName').value = formula.name || '';
            document.getElementById('formulaSource').value = formula.source || '';
            document.getElementById('formulaEffects').value = formula.effects || '';
            // 主治與用法欄位已移除，不再填入
            document.getElementById('formulaComposition').value = formula.composition || '';
            document.getElementById('formulaCautions').value = formula.cautions || '';
            
            document.getElementById('addFormulaModal').classList.remove('hidden');
        }
        
        async function saveFormula() {
            const name = document.getElementById('formulaName').value.trim();
            const composition = document.getElementById('formulaComposition').value.trim();
            
            if (!name) {
                showToast('請輸入方劑名稱！', 'error');
                return;
            }
            
            if (!composition) {
                showToast('請輸入方劑組成！', 'error');
                return;
            }
            
            // 組合方劑物件時，不再包含主治與用法欄位
            const formula = {
                id: editingFormulaId || Date.now(),
                type: 'formula',
                name: name,
                source: document.getElementById('formulaSource').value.trim(),
                effects: document.getElementById('formulaEffects').value.trim(),
                composition: composition,
                cautions: document.getElementById('formulaCautions').value.trim(),
                createdAt: editingFormulaId ? herbLibrary.find(f => f.id === editingFormulaId).createdAt : new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            
            if (editingFormulaId) {
                const index = herbLibrary.findIndex(item => item.id === editingFormulaId);
                herbLibrary[index] = formula;
                showToast('方劑資料已更新！', 'success');
            } else {
                herbLibrary.push(formula);
                showToast('方劑已新增！', 'success');
            }
            
            try {
                // 將方劑資料寫入 Firestore
                await window.firebase.setDoc(
                    window.firebase.doc(window.firebase.db, 'herbLibrary', String(formula.id)),
                    formula
                );
            } catch (error) {
                console.error('儲存方劑資料至 Firestore 失敗:', error);
            }
            hideAddFormulaForm();
            displayHerbLibrary();
        }
        
        // 刪除中藥材或方劑
        async function deleteHerbItem(id) {
            const item = herbLibrary.find(h => h.id === id);
            if (!item) return;
            
            const itemType = item.type === 'herb' ? '中藥材' : '方劑';
            
            if (confirm(`確定要刪除${itemType}「${item.name}」嗎？\n\n此操作無法復原！`)) {
                herbLibrary = herbLibrary.filter(h => h.id !== id);
                try {
                    await window.firebase.deleteDoc(
                        window.firebase.doc(window.firebase.db, 'herbLibrary', String(id))
                    );
                } catch (error) {
                    console.error('刪除中藥材資料至 Firestore 失敗:', error);
                }
                showToast(`${itemType}「${item.name}」已刪除！`, 'success');
                displayHerbLibrary();
            }
        }

        // 收費項目管理功能
        let editingBillingItemId = null;
        let currentBillingFilter = 'all';
        
        async function loadBillingManagement() {
    // 權限檢查：護理師或一般用戶不得訪問收費項目管理
    if (!hasAccessToSection('billingManagement')) {
        showToast('權限不足，無法存取收費項目管理', 'error');
        return;
    }
            // 若尚未載入收費項目資料，才從 Firestore 重新載入
            if (typeof initBillingItems === 'function' && (!Array.isArray(billingItems) || billingItems.length === 0)) {
                await initBillingItems();
            }
            displayBillingItems();
            
            // 搜尋功能
            const searchInput = document.getElementById('searchBilling');
            if (searchInput) {
                searchInput.addEventListener('input', function() {
                    displayBillingItems();
                });
            }
        }
        
        function filterBillingItems(category) {
            currentBillingFilter = category;
            
            // 更新按鈕樣式
            document.querySelectorAll('[id^="billing-filter-"]').forEach(btn => {
                btn.className = 'px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition duration-200';
            });
            document.getElementById(`billing-filter-${category}`).className = 'px-4 py-2 rounded-lg text-sm font-medium bg-blue-100 text-blue-800 transition duration-200';
            
            displayBillingItems();
        }
        
        function displayBillingItems() {
            const searchTerm = document.getElementById('searchBilling').value.toLowerCase();
            const listContainer = document.getElementById('billingItemsList');
            
            // 過濾資料
            let filteredItems = billingItems.filter(item => {
                const matchesSearch = item.name.toLowerCase().includes(searchTerm) ||
                                    (item.description && item.description.toLowerCase().includes(searchTerm));
                
                const matchesFilter = currentBillingFilter === 'all' || item.category === currentBillingFilter;
                
                return matchesSearch && matchesFilter;
            });
            
            if (filteredItems.length === 0) {
                listContainer.innerHTML = `
                    <div class="text-center py-12 text-gray-500">
                        <div class="text-4xl mb-4">💰</div>
                        <div class="text-lg font-medium mb-2">沒有找到相關收費項目</div>
                        <div class="text-sm">請嘗試其他搜尋條件或新增收費項目</div>
                    </div>
                `;
                return;
            }
            
            // 按類別分組顯示
            const billingCategories = {
                consultation: { name: '診療費', icon: '🩺', items: [] },
                medicine: { name: '藥費', icon: '💊', items: [] },
                treatment: { name: '治療費', icon: '🔧', items: [] },
                other: { name: '其他', icon: '📋', items: [] },
                discount: { name: '折扣項目', icon: '💸', items: [] },
                package: { name: '套票項目', icon: '🎫', items: [] }
            };

            // 將過濾後的項目分配到對應的帳單分類中
            filteredItems.forEach(item => {
                if (billingCategories[item.category]) {
                    billingCategories[item.category].items.push(item);
                }
            });

            let html = '';

            // 建立各分類的顯示內容
            Object.keys(billingCategories).forEach(categoryKey => {
                const category = billingCategories[categoryKey];
                if (category.items.length > 0 && (currentBillingFilter === 'all' || currentBillingFilter === categoryKey)) {
                    html += `
                        <div class="mb-8">
                            <h3 class="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                                <span class="mr-2">${category.icon}</span>${category.name} (${category.items.length})
                            </h3>
                            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                ${category.items.map(item => createBillingItemCard(item)).join('')}
                            </div>
                        </div>
                    `;
                }
            });
            
            listContainer.innerHTML = html;
        }
        
        function createBillingItemCard(item) {
            const statusClass = item.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
            const statusText = item.active ? '啟用' : '停用';
            
            // 折扣項目使用不同的顏色顯示
            const priceColor = item.category === 'discount' ? 'text-red-600' : 'text-green-600';
            let pricePrefix = '$';
            let displayPrice = Math.abs(item.price);
            
            // 處理折扣項目的顯示
            if (item.category === 'discount') {
                if (item.price > 0 && item.price < 1) {
                    // 百分比折扣 (0.9 = 9折)
                    pricePrefix = '';
                    displayPrice = (item.price * 10).toFixed(0);
                } else if (item.price < 0) {
                    // 固定金額折扣
                    pricePrefix = '-$';
                    displayPrice = Math.abs(item.price);
                }
            }
            
            // 為避免 XSS，對文字內容進行轉義
            const safeName = window.escapeHtml(item.name);
            const safeUnit = item.unit ? window.escapeHtml(item.unit) : null;
            const safeDescription = item.description ? window.escapeHtml(item.description) : null;
            return `
                <div class="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition duration-200 ${!item.active ? 'opacity-75' : ''}">
                    <div class="flex justify-between items-start mb-3">
                        <div class="flex-1">
                            <h4 class="text-lg font-semibold text-gray-900">${safeName}</h4>
                            <div class="flex items-center mt-1">
                                <span class="text-2xl font-bold ${priceColor}">${pricePrefix}${displayPrice}</span>
                                ${safeUnit ? `<span class="text-sm text-gray-500 ml-1">/ ${safeUnit}</span>` : ''}
                            </div>
                        </div>
                        <div class="flex flex-col items-end space-y-2">
                            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusClass}">
                                ${statusText}
                            </span>
                            <div class="flex space-x-1">
                                <button onclick="editBillingItem(${item.id})" class="text-blue-600 hover:text-blue-800 text-sm">編輯</button>
                                <button onclick="deleteBillingItem(${item.id})" class="text-red-600 hover:text-red-800 text-sm">刪除</button>
                            </div>
                        </div>
                    </div>
                    
                    ${safeDescription ? `
                        <div class="text-sm text-gray-600 bg-gray-50 p-2 rounded">
                            ${safeDescription}
                        </div>
                    ` : ''}
                </div>
            `;
        }
        
        // 收費項目表單功能
        function showAddBillingItemForm() {
    // 若沒有管理收費項目的權限，阻止開啟表單
    if (!hasAccessToSection('billingManagement')) {
        showToast('權限不足，無法新增收費項目', 'error');
        return;
    }
            editingBillingItemId = null;
            document.getElementById('billingItemFormTitle').textContent = '新增收費項目';
            document.getElementById('billingItemSaveButtonText').textContent = '儲存';
            clearBillingItemForm();
            document.getElementById('addBillingItemModal').classList.remove('hidden');
        }
        
        function hideAddBillingItemForm() {
            document.getElementById('addBillingItemModal').classList.add('hidden');
            clearBillingItemForm();
            editingBillingItemId = null;
        }
        
        function clearBillingItemForm() {
            document.getElementById('billingItemPackageUses').value = '';
            document.getElementById('billingItemValidityDays').value = '';
            var pf = document.getElementById('packageFields'); if (pf) pf.classList.add('hidden');
            document.getElementById('billingItemName').value = '';
            document.getElementById('billingItemCategory').value = '';
            document.getElementById('billingItemPrice').value = '';
            document.getElementById('billingItemUnit').value = '';
            document.getElementById('billingItemDescription').value = '';
            document.getElementById('billingItemActive').checked = true;
        }
        
        function editBillingItem(id) {
    // 權限檢查：無權限者不得編輯
    if (!hasAccessToSection('billingManagement')) {
        showToast('權限不足，無法編輯收費項目', 'error');
        return;
    }
            const item = billingItems.find(b => b.id === id);
            if (!item) return;
            
            editingBillingItemId = id;
            document.getElementById('billingItemFormTitle').textContent = '編輯收費項目';
            document.getElementById('billingItemSaveButtonText').textContent = '更新';
            
            document.getElementById('billingItemName').value = item.name || '';
            document.getElementById('billingItemCategory').value = item.category || '';
            document.getElementById('billingItemPrice').value = item.price || '';
            document.getElementById('billingItemUnit').value = item.unit || '';
            document.getElementById('billingItemDescription').value = item.description || '';
            document.getElementById('billingItemActive').checked = item.active !== false;
            document.getElementById('billingItemPackageUses').value = item.packageUses || '';
            document.getElementById('billingItemValidityDays').value = item.validityDays || '';
            {
                const pf = document.getElementById('packageFields');
                if (pf) pf.classList.toggle('hidden', item.category !== 'package');
            }
            
            document.getElementById('addBillingItemModal').classList.remove('hidden');
        }
        
        async function saveBillingItem() {
    // 權限檢查：無權限者不得儲存
    if (!hasAccessToSection('billingManagement')) {
        showToast('權限不足，無法保存收費項目', 'error');
        return;
    }
            const name = document.getElementById('billingItemName').value.trim();
            const category = document.getElementById('billingItemCategory').value;
            let price = parseFloat(document.getElementById('billingItemPrice').value);

            let packageUses = null;
            let validityDays = null;
            if (category === 'package') {
                packageUses = parseInt(document.getElementById('billingItemPackageUses').value);
                validityDays = parseInt(document.getElementById('billingItemValidityDays').value);
                if (!packageUses || packageUses <= 0) {
                    showToast('請輸入套票可用次數！', 'error');
                    return;
                }
                if (!validityDays || validityDays <= 0) {
                    showToast('請輸入有效天數！', 'error');
                    return;
                }
            }
            
            if (!name) {
                showToast('請輸入收費項目名稱！', 'error');
                return;
            }
            
            if (!category) {
                showToast('請選擇項目類別！', 'error');
                return;
            }
            
            if (isNaN(price)) {
                showToast('請輸入有效的收費金額！', 'error');
                return;
            }
            
            // 折扣項目允許負數或0-1之間的小數（百分比），其他項目不允許負數
            if (category !== 'discount' && price < 0) {
                showToast('除折扣項目外，收費金額不能為負數！', 'error');
                return;
            }
            
            // 折扣項目的特殊驗證
            if (category === 'discount') {
                if (price > 0 && price >= 1 && price <= 10) {
                    // 如果輸入1-10之間的數字，自動轉換為折扣比例
                    price = price / 10;
                    document.getElementById('billingItemPrice').value = price;
                    showToast(`已自動轉換為${(price * 100).toFixed(0)}折`, 'info');
                }
            }
            
            const item = {
                id: editingBillingItemId || Date.now(),
                name: name,
                category: category,
                price: price,
                unit: document.getElementById('billingItemUnit').value.trim(),
                description: document.getElementById('billingItemDescription').value.trim(),
                packageUses: packageUses,
                validityDays: validityDays,
                active: document.getElementById('billingItemActive').checked,
                createdAt: editingBillingItemId ? billingItems.find(b => b.id === editingBillingItemId).createdAt : new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            
            if (editingBillingItemId) {
                const index = billingItems.findIndex(b => b.id === editingBillingItemId);
                billingItems[index] = item;
                showToast('收費項目已更新！', 'success');
            } else {
                billingItems.push(item);
                showToast('收費項目已新增！', 'success');
            }
            
            try {
                // 將收費項目寫入 Firestore
                await window.firebase.setDoc(
                    window.firebase.doc(window.firebase.db, 'billingItems', String(item.id)),
                    item
                );
            } catch (error) {
                console.error('儲存收費項目至 Firestore 失敗:', error);
            }
            hideAddBillingItemForm();
            displayBillingItems();
        }
        
        async function deleteBillingItem(id) {
    // 權限檢查：無權限者不得刪除
    if (!hasAccessToSection('billingManagement')) {
        showToast('權限不足，無法刪除收費項目', 'error');
        return;
    }
            const item = billingItems.find(b => b.id === id);
            if (!item) return;
            
            if (confirm(`確定要刪除收費項目「${item.name}」嗎？\n\n此操作無法復原！`)) {
                billingItems = billingItems.filter(b => b.id !== id);
                try {
                    await window.firebase.deleteDoc(
                        window.firebase.doc(window.firebase.db, 'billingItems', String(id))
                    );
                } catch (error) {
                    console.error('刪除收費項目資料至 Firestore 失敗:', error);
                }
                showToast(`收費項目「${item.name}」已刪除！`, 'success');
                displayBillingItems();
            }
        }

        // 處方搜索功能
        function searchHerbsForPrescription() {
            const searchTerm = document.getElementById('prescriptionSearch').value.trim().toLowerCase();
            const resultsContainer = document.getElementById('prescriptionSearchResults');
            const resultsList = document.getElementById('prescriptionSearchList');
            
            if (searchTerm.length < 1) {
                resultsContainer.classList.add('hidden');
                return;
            }
            
            // 搜索匹配的中藥材和方劑
            const matchedItems = herbLibrary.filter(item => 
                item.name.toLowerCase().includes(searchTerm) ||
                (item.alias && item.alias.toLowerCase().includes(searchTerm)) ||
                (item.effects && item.effects.toLowerCase().includes(searchTerm))
            ).slice(0, 10); // 限制顯示前10個結果
            
            if (matchedItems.length === 0) {
                resultsList.innerHTML = `
                    <div class="p-3 text-center text-gray-500 text-sm">
                        找不到符合條件的中藥材或方劑
                    </div>
                `;
                resultsContainer.classList.remove('hidden');
                return;
            }
            
            // 顯示搜索結果
            resultsList.innerHTML = matchedItems.map(item => {
                const typeName = item.type === 'herb' ? '中藥材' : '方劑';
                const bgColor = 'bg-yellow-50 hover:bg-yellow-100 border-yellow-200';
                
                return `
                    <div class="p-3 ${bgColor} border rounded-lg cursor-pointer transition duration-200" onclick="addToPrescription('${item.type}', ${item.id})">
                        <div class="text-center">
                            <div class="font-semibold text-gray-900 text-sm mb-1">${item.name}</div>
                            <div class="text-xs bg-white text-gray-600 px-2 py-1 rounded mb-2">${typeName}</div>
                            ${item.type === 'herb' && item.dosage ? `<div class="text-xs text-yellow-600 font-medium">${item.dosage}</div>` : ''}
                            ${item.effects ? `<div class="text-xs text-gray-600 mt-1">${item.effects.substring(0, 30)}${item.effects.length > 30 ? '...' : ''}</div>` : ''}
                        </div>
                    </div>
                `;
            }).join('');
            
            resultsContainer.classList.remove('hidden');
        }
        
        // 存儲已選擇的處方項目
        let selectedPrescriptionItems = [];
        
        // 存儲已選擇的收費項目
        let selectedBillingItems = [];
        
        // 添加到處方內容
        function addToPrescription(type, itemId) {
            const item = herbLibrary.find(h => h.id === itemId);
            if (!item) return;
            
            // 檢查是否已經添加過
            const existingIndex = selectedPrescriptionItems.findIndex(p => p.id === itemId);
            if (existingIndex !== -1) {
                showToast(`${item.name} 已經在處方中！`, 'warning');
                return;
            }
            
            // 添加到已選擇項目
            const prescriptionItem = {
                id: itemId,
                type: type,
                name: item.name,
                dosage: type === 'herb' ? (item.dosage || '6g') : null,
                customDosage: '6', // 中藥材和方劑都預設6克
                composition: type === 'formula' ? item.composition : null,
                effects: item.effects
            };
            
            selectedPrescriptionItems.push(prescriptionItem);
            
            // 更新顯示
            updatePrescriptionDisplay();
            
            // 如果是第一個處方項目，自動添加藥費
            if (selectedPrescriptionItems.length === 1) {
                const days = parseInt(document.getElementById('medicationDays').value) || 5;
                updateMedicineFeeByDays(days);
            }
            
            // 清除搜索
            clearPrescriptionSearch();
            
            showToast(`已添加${type === 'herb' ? '中藥材' : '方劑'}：${item.name}`, 'success');
        }
        

        
        // 更新處方顯示
        function updatePrescriptionDisplay() {
            const container = document.getElementById('selectedPrescriptionItems');
            const hiddenTextarea = document.getElementById('formPrescription');
            const medicationSettings = document.getElementById('medicationSettings');
            
            if (selectedPrescriptionItems.length === 0) {
                container.innerHTML = `
                    <div class="text-sm text-gray-500 text-center py-4">
                        請使用上方搜索功能添加中藥材或方劑
                    </div>
                `;
                hiddenTextarea.value = '';
                // 隱藏服藥天數設定
                medicationSettings.style.display = 'none';
                return;
            }
            
            // 顯示服藥天數設定
            medicationSettings.style.display = 'block';
            
            // 顯示已添加的項目
            const displayHtml = `
                <div class="space-y-3">
                    ${selectedPrescriptionItems.map((item, index) => {
                        const bgColor = 'bg-yellow-50 border-yellow-200';
                        
                        return `
                            <div class="${bgColor} border rounded-lg p-3">
                                <div class="flex items-center">
                                    <div class="flex-1">
                                        <div class="font-semibold text-gray-900">${item.name}</div>
                                        ${item.type === 'formula' ? `<div class="text-xs text-gray-600">方劑</div>` : ''}
                                    </div>
                                    <div class="flex items-center space-x-2 mr-3">
                                        <input type="number" 
                                               value="${item.customDosage || '6'}" 
                                               min="0.5" 
                                               max="100" 
                                               step="0.5"
                                               class="w-16 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-center"
                                               oninput="updatePrescriptionDosageLive(${index}, this.value)"
                                               onchange="updatePrescriptionDosage(${index}, this.value)"
                                               onclick="this.select()">
                                        <span class="text-sm text-gray-600 font-medium">g</span>
                                    </div>
                                    <button onclick="removePrescriptionItem(${index})" class="text-red-500 hover:text-red-700 font-bold text-lg px-2">×</button>
                                </div>
                                
                                ${item.type === 'formula' && item.composition ? `
                                    <div class="mt-3 pt-3 border-t border-yellow-200">
                                        <div class="text-xs font-semibold text-gray-700 mb-2">方劑組成：</div>
                                        <div class="text-xs text-gray-600 bg-white rounded px-3 py-2 border border-yellow-100">
                                            ${item.composition.replace(/\n/g, '、')}
                                        </div>
                                    </div>
                                ` : ''}
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
            
            container.innerHTML = displayHtml;
            
            // 更新隱藏的文本域
            let prescriptionText = '';
            
            selectedPrescriptionItems.forEach(item => {
                if (item.type === 'herb') {
                    const dosage = item.customDosage || '6';
                    prescriptionText += `${item.name} ${dosage}g\n`;
                } else if (item.type === 'formula') {
                    const dosage = item.customDosage || '6';
                    prescriptionText += `${item.name} ${dosage}g\n`;
                    if (item.composition) {
                        prescriptionText += `${item.composition.replace(/\n/g, '、')}\n`;
                    }
                    prescriptionText += '\n';
                }
            });
            
            hiddenTextarea.value = prescriptionText.trim();
        }
        
        // 更新服藥天數
        function updateMedicationDays(change) {
            const daysInput = document.getElementById('medicationDays');
            const currentDays = parseInt(daysInput.value) || 5;
            const newDays = Math.max(1, Math.min(30, currentDays + change));
            daysInput.value = newDays;
            
            // 更新處方顯示
            if (selectedPrescriptionItems.length > 0) {
                updatePrescriptionDisplay();
            }
            
            // 自動更新藥費
            updateMedicineFeeByDays(newDays);
        }
        
        // 更新服藥次數
        function updateMedicationFrequency(change) {
            const frequencyInput = document.getElementById('medicationFrequency');
            const currentFrequency = parseInt(frequencyInput.value) || 2;
            const newFrequency = Math.max(1, Math.min(6, currentFrequency + change));
            frequencyInput.value = newFrequency;
            
            // 更新處方顯示
            if (selectedPrescriptionItems.length > 0) {
                updatePrescriptionDisplay();
            }
        }
        
        // 根據開藥天數自動更新藥費
        function updateMedicineFeeByDays(days) {
            // 只有在有處方內容時才自動更新藥費
            if (selectedPrescriptionItems.length === 0) {
                return;
            }
            
            // 尋找中藥調劑費項目
            const medicineFeeItem = billingItems.find(item => 
                item.active && 
                item.category === 'medicine' && 
                (item.name.includes('中藥') || item.name.includes('藥費') || item.name.includes('調劑'))
            );
            
            if (!medicineFeeItem) {
                return; // 如果沒有找到藥費項目，不進行自動更新
            }
            
            // 查找現有的藥費項目
            const existingMedicineFeeIndex = selectedBillingItems.findIndex(item => 
                item.id === medicineFeeItem.id
            );
            
            if (existingMedicineFeeIndex !== -1) {
                // 更新現有藥費項目的數量為天數
                selectedBillingItems[existingMedicineFeeIndex].quantity = days;
                updateBillingDisplay();
                showToast(`已更新藥費：${medicineFeeItem.name} x${days}天`, 'info');
            } else {
                // 如果沒有藥費項目，自動添加
                const billingItem = {
                    id: medicineFeeItem.id,
                    name: medicineFeeItem.name,
                    category: medicineFeeItem.category,
                    price: medicineFeeItem.price,
                    unit: medicineFeeItem.unit,
                    description: medicineFeeItem.description,
                    quantity: days,
                    // 預設藥費可參與折扣
                    includedInDiscount: true
                };
                selectedBillingItems.push(billingItem);
                updateBillingDisplay();
                showToast(`已自動添加藥費：${medicineFeeItem.name} x${days}天`, 'info');
            }
        }
        
        // 處理天數輸入框直接變更
        function updateMedicationDaysFromInput() {
            const daysInput = document.getElementById('medicationDays');
            const days = parseInt(daysInput.value) || 5;
            
            // 確保天數在有效範圍內
            const validDays = Math.max(1, Math.min(30, days));
            if (validDays !== days) {
                daysInput.value = validDays;
            }
            
            // 更新處方顯示
            if (selectedPrescriptionItems.length > 0) {
                updatePrescriptionDisplay();
            }
            
            // 自動更新藥費
            updateMedicineFeeByDays(validDays);
        }
        
        // 更新休息期間顯示
        function updateRestPeriod() {
            const startDateInput = document.getElementById('formRestStartDate');
            const endDateInput = document.getElementById('formRestEndDate');
            const displaySpan = document.getElementById('restPeriodDisplay');
            
            if (!startDateInput || !endDateInput || !displaySpan) return;
            
            const startDate = startDateInput.value;
            const endDate = endDateInput.value;
            
            if (startDate && endDate) {
                const start = new Date(startDate);
                const end = new Date(endDate);
                
                if (end >= start) {
                    const timeDiff = end.getTime() - start.getTime();
                    const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1; // 包含開始和結束日期
                    displaySpan.textContent = `共 ${daysDiff} 天`;
                    displaySpan.className = 'text-sm text-blue-600 font-medium';
                } else {
                    displaySpan.textContent = '結束日期不能早於開始日期';
                    displaySpan.className = 'text-sm text-red-600 font-medium';
                }
            } else {
                displaySpan.textContent = '請選擇開始和結束日期';
                displaySpan.className = 'text-sm text-gray-500 font-medium';
            }
        }
        

        
        // 更新處方藥量
        function updatePrescriptionDosage(index, newDosage) {
            // 用於更新處方項目的藥材劑量。當使用者完成輸入（change 事件）時觸發。
            if (index >= 0 && index < selectedPrescriptionItems.length) {
                const dosage = parseFloat(newDosage);
                // 允許的範圍：0.5 克至 100 克。因 input 的 step 設為 0.5，使用 > 0 仍包含 0.5。
                if (dosage > 0 && dosage <= 100) {
                    // 將使用者輸入值（字串）存回自訂劑量欄，以便重新渲染時使用相同值
                    selectedPrescriptionItems[index].customDosage = newDosage;
                    // 重新生成處方文本與畫面
                    updatePrescriptionDisplay();
                } else {
                    // 若輸入無效，不更新資料，僅重新渲染以回復原值
                    updatePrescriptionDisplay();
                    showToast('請輸入有效的藥量（0.5-100克）', 'warning');
                }
            }
        }

        /**
         * 即時更新處方藥量。
         * 在使用者輸入過程中（input 事件）呼叫此函式，只更新自訂劑量而不重新渲染畫面。
         * 這樣即便在輸入期間頁面因其他操作而重新渲染，也會保留輸入中的數值。
         *
         * @param {number} index 選定處方項目的索引
         * @param {string} newDosage 使用者輸入的新劑量字串
         */
        function updatePrescriptionDosageLive(index, newDosage) {
            if (index >= 0 && index < selectedPrescriptionItems.length) {
                // 直接更新 customDosage，不對值做解析或驗證，以便保留使用者輸入
                selectedPrescriptionItems[index].customDosage = newDosage;
            }
        }
        

        
        // 移除處方項目
        function removePrescriptionItem(index) {
            if (index >= 0 && index < selectedPrescriptionItems.length) {
                const removedItem = selectedPrescriptionItems.splice(index, 1)[0];
                updatePrescriptionDisplay();
                
                // 如果移除後沒有處方項目了，移除藥費
                if (selectedPrescriptionItems.length === 0) {
                    // 尋找並移除藥費項目
                    const medicineFeeItem = billingItems.find(item => 
                        item.active && 
                        item.category === 'medicine' && 
                        (item.name.includes('中藥') || item.name.includes('藥費') || item.name.includes('調劑'))
                    );
                    
                    if (medicineFeeItem) {
                        const medicineFeeIndex = selectedBillingItems.findIndex(item => 
                            item.id === medicineFeeItem.id
                        );
                        
                        if (medicineFeeIndex !== -1) {
                            selectedBillingItems.splice(medicineFeeIndex, 1);
                            updateBillingDisplay();
                        }
                    }
                }
            }
        }
        
        // 清除處方搜索
        function clearPrescriptionSearch() {
            document.getElementById('prescriptionSearch').value = '';
            document.getElementById('prescriptionSearchResults').classList.add('hidden');
        }
        
        // 收費項目搜索功能
        function searchBillingForConsultation() {
            const searchTerm = document.getElementById('billingSearch').value.trim().toLowerCase();
            const resultsContainer = document.getElementById('billingSearchResults');
            const resultsList = document.getElementById('billingSearchList');
            
            if (searchTerm.length < 1) {
                resultsContainer.classList.add('hidden');
                return;
            }
            
            // 搜索匹配的收費項目（只顯示啟用的項目）
            const matchedItems = billingItems.filter(item => 
                item.active && (
                    item.name.toLowerCase().includes(searchTerm) ||
                    (item.description && item.description.toLowerCase().includes(searchTerm))
                )
            ).slice(0, 10); // 限制顯示前10個結果
            
            if (matchedItems.length === 0) {
                resultsList.innerHTML = `
                    <div class="p-3 text-center text-gray-500 text-sm">
                        找不到符合條件的收費項目
                    </div>
                `;
                resultsContainer.classList.remove('hidden');
                return;
            }
            
            // 顯示搜索結果
            resultsList.innerHTML = matchedItems.map(item => {
                const categoryNames = {
                    consultation: '診療費',
                    medicine: '藥費',
                    treatment: '治療費',
                    other: '其他',
                    discount: '折扣項目',
                    package: '套票項目',
                    packageUse: '套票使用'
                };
                const categoryName = categoryNames[item.category] || '未分類';
                const bgColor = getCategoryBgColor(item.category);
                
                return `
                    <div class="p-3 ${bgColor} border rounded-lg cursor-pointer transition duration-200" onclick="addToBilling(${item.id})">
                        <div class="text-center">
                            <div class="font-semibold text-gray-900 text-sm mb-1">${item.name}</div>
                            <div class="text-xs bg-white text-gray-600 px-2 py-1 rounded mb-2">${categoryName}</div>
                            ${item.category !== 'discount' ? `
                                <div class="text-sm font-bold text-green-600">
                                    $${item.price}
                                </div>
                            ` : ''}
                            ${item.unit ? `<div class="text-xs text-gray-600">/ ${item.unit}</div>` : ''}
                            ${item.description ? `<div class="text-xs text-gray-600 mt-1">${item.description.substring(0, 30)}${item.description.length > 30 ? '...' : ''}</div>` : ''}
                        </div>
                    </div>
                `;
            }).join('');
            
            resultsContainer.classList.remove('hidden');
        }
        
        // 獲取類別背景顏色
        function getCategoryBgColor(category) {
            const colors = {
                consultation: 'bg-blue-50 hover:bg-blue-100 border-blue-200',
                medicine: 'bg-green-50 hover:bg-green-100 border-green-200',
                treatment: 'bg-orange-50 hover:bg-orange-100 border-orange-200',
                other: 'bg-gray-50 hover:bg-gray-100 border-gray-200',
                discount: 'bg-red-50 hover:bg-red-100 border-red-200',
                package: 'bg-purple-50 hover:bg-purple-100 border-purple-200',
                packageUse: 'bg-purple-50 hover:bg-purple-100 border-purple-200'
            };
            return colors[category] || colors.other;
        }
        
        // 添加到收費項目
        function addToBilling(itemId) {
            const item = billingItems.find(b => b.id === itemId);
            if (!item) return;

            // 如為套票項目且目前不允許修改套票，則停止並顯示警告
            if (item.category === 'package' && !canModifyPackageItems()) {
                showToast('診症完成後無法新增套票', 'warning');
                // 清理搜尋結果避免殘留
                clearBillingSearch();
                return;
            }

            // 檢查折扣使用限制：每個診症僅能有一個折扣項目。
            if (item.category === 'discount') {
                // 如果列表中已經存在任何折扣項目，則禁止再添加其他折扣
                const hasAnyDiscount = selectedBillingItems.some(b => b && b.category === 'discount');
                if (hasAnyDiscount) {
                    showToast('每個診症僅能使用一項折扣優惠', 'warning');
                    // 清理搜尋結果避免殘留
                    clearBillingSearch();
                    return;
                }
                // 如果已有同名折扣，禁止再添加（名稱重複仍不可）
                const duplicateDiscount = selectedBillingItems.some(b => b && b.category === 'discount' && b.name === item.name);
                if (duplicateDiscount) {
                    showToast('同名折扣項目僅能使用一項', 'warning');
                    // 清理搜尋結果避免殘留
                    clearBillingSearch();
                    return;
                }
            }

            // 檢查是否已經添加過相同 ID
            const existingIndex = selectedBillingItems.findIndex(b => b.id === itemId);
            if (existingIndex !== -1) {
                // 如果已存在
                const existingItem = selectedBillingItems[existingIndex];
                // 折扣項目不允許增加數量
                if (existingItem.category === 'discount') {
                    showToast('折扣項目已存在，無法重複使用', 'warning');
                } else {
                    // 其他類別項目增加數量
                    existingItem.quantity += 1;
                }
            } else {
                // 添加新項目
                const billingItem = {
                    id: itemId,
                    name: item.name,
                    category: item.category,
                    price: item.price,
                    unit: item.unit,
                    description: item.description,
                    packageUses: item.packageUses,
                    validityDays: item.validityDays,
                    quantity: 1,
                    // 預設除折扣項目外皆可參與折扣
                    includedInDiscount: item.category !== 'discount'
                };
                selectedBillingItems.push(billingItem);
            }

            // 更新顯示
            updateBillingDisplay();

            // 清除搜索
            clearBillingSearch();

            showToast(`已添加收費項目：${item.name}`, 'success');
        }
        
        // 更新收費項目顯示
        function updateBillingDisplay() {
            const container = document.getElementById('selectedBillingItems');
            const hiddenTextarea = document.getElementById('formBillingItems');
            const totalAmountSpan = document.getElementById('totalBillingAmount');
            
            if (selectedBillingItems.length === 0) {
                container.innerHTML = `
                    <div class="text-sm text-gray-500 text-center py-4">
                        請使用上方搜索功能添加收費項目
                    </div>
                `;
                hiddenTextarea.value = '';
                totalAmountSpan.textContent = '$0';
                return;
            }
            
            // 計算總費用與折扣相關數值
            // 判斷是否有折扣項目
            const hasDiscount = selectedBillingItems.some(it => it.category === 'discount');
            let totalAmount = 0;
            let subtotalForDiscount = 0;
            let subtotalAllItems = 0;
            // 計算兩種小計：所有非折扣項目合計與折扣適用項目合計
            selectedBillingItems.forEach(item => {
                if (item.category !== 'discount') {
                    const itemSubtotal = item.price * item.quantity;
                    subtotalAllItems += itemSubtotal;
                    // 若有折扣，且此項目未被排除（undefined 視為 true），則加入折扣小計
                    if (!hasDiscount || item.includedInDiscount !== false) {
                        subtotalForDiscount += itemSubtotal;
                    }
                }
            });
            // 基於所有項目計算初始總金額
            totalAmount = subtotalAllItems;
            if (hasDiscount) {
                selectedBillingItems.forEach(item => {
                    if (item.category === 'discount') {
                        if (item.price > 0 && item.price < 1) {
                            // 百分比折扣：對折扣適用小計進行折扣計算
                            const discountAmount = subtotalForDiscount * (1 - item.price) * item.quantity;
                            totalAmount -= discountAmount;
                        } else {
                            // 固定金額折扣
                            totalAmount += item.price * item.quantity;
                        }
                    }
                });
            }
            // 更新顯示的總金額
            totalAmountSpan.textContent = `$${totalAmount}`;
            // 計算所有折扣適用項目的名稱，用於顯示折扣明細
            const includedItemNames = selectedBillingItems
                .filter(it => it.category !== 'discount' && (!hasDiscount || it.includedInDiscount !== false))
                .map(it => it.name);
            
            // 分離折扣項目和非折扣項目，但保持各自的添加順序
            const nonDiscountItems = [];
            const discountItems = [];
            
            selectedBillingItems.forEach((item, originalIndex) => {
                if (item.category === 'discount') {
                    discountItems.push({ item, originalIndex });
                } else {
                    nonDiscountItems.push({ item, originalIndex });
                }
            });
            
            // 合併顯示：非折扣項目在前，折扣項目在後
            const displayItems = [...nonDiscountItems, ...discountItems];
            
            // 在渲染列表前先嘗試取得當前掛號的病人 ID。這將用於後續處理舊病歷載入的套票使用項目（這些項目缺少 patientId 與 packageRecordId），
            // 使得使用者仍然可以點擊「取消使用」按鈕以嘗試退回套票次數。
            let currentPatientIdForDisplay = null;
            try {
                // 根據全域的 currentConsultingAppointmentId 從 appointments 陣列找到當前掛號資訊
                // 使用字串比較 ID，避免類型不一致導致匹配失敗
                const currentAppt = appointments.find(appt => appt && String(appt.id) === String(currentConsultingAppointmentId));
                if (currentAppt) {
                    currentPatientIdForDisplay = currentAppt.patientId;
                }
            } catch (e) {
                // 忽略錯誤，保持 currentPatientIdForDisplay 為 null
            }
            // 顯示已選擇的項目（非折扣項目在前，折扣項目在後）
            container.innerHTML = `
                <div class="space-y-2">
                    ${displayItems.map(({ item, originalIndex }) => {
                        const categoryNames = {
                            consultation: '診療費',
                            medicine: '藥費',
                            treatment: '治療費',
                            other: '其他',
                            discount: '折扣項目',
                            package: '套票項目',
                            packageUse: '套票使用'
                        };
                        const categoryName = categoryNames[item.category] || '未分類';
                        const bgColor = getCategoryBgColor(item.category);
                        let subtotal;
                        let subtotalDisplay;
                        // 檢查是否為套票使用
                        const isPackageUse = item.category === 'packageUse';
                        // 檢查是否為折扣項目
                        const isDiscountItem = item.category === 'discount';
                        // 決定是否顯示取消按鈕：對於所有套票使用項目均提供取消功能，
                        // 即便是舊病歷載入（缺少 patientId 或 packageRecordId）。
                        // 取消按鈕生成時優先使用項目自身的 patientId 與 packageRecordId，若缺失則使用當前病人 ID 與空字串。
                        const patientIdForUndo = (item.patientId || currentPatientIdForDisplay || '').toString();
                        const packageRecordIdForUndo = (item.packageRecordId || '').toString();
                        const canUndo = isPackageUse;
                        const undoBtn = canUndo ? `
                                    <button
                                        type="button"
                                        class="ml-2 text-xs px-2 py-0.5 rounded border border-purple-300 text-purple-700 hover:bg-purple-50"
                                        onclick="undoPackageUse('${patientIdForUndo}', '${packageRecordIdForUndo}', '${item.id}')"
                                    >取消使用</button>
                                ` : '';
                        // 判斷是否為套票項目，且當前是否禁止修改套票
                        const isPackageItem = item.category === 'package';
                        const packageLocked = isPackageItem && !canModifyPackageItems();
                        // 根據項目是否為套票使用或套票鎖定決定是否顯示刪除按鈕
                        // 套票使用項目 (packageUse) 或鎖定的套票 (package) 不提供刪除功能
                        const removeBtn = (isPackageUse || packageLocked)
                            ? ''
                            : `<button onclick="removeBillingItem(${originalIndex})" class="text-red-500 hover:text-red-700 font-bold text-lg px-2">×</button>`;
                        // 數量控制區：套票使用或鎖定的套票僅顯示次數；折扣項目不顯示數量；其他類型可增減數量
                        let quantityControls;
                        if (isDiscountItem) {
                            // 折扣項目不需顯示數量
                            quantityControls = '';
                        } else if (isPackageUse || packageLocked) {
                            // 套票使用或鎖定的套票僅顯示次數
                            quantityControls = `
                                <div class="flex items-center space-x-2 mr-3">
                                    <span class="w-8 text-center font-semibold">${item.quantity}</span>
                                </div>
                            `;
                        } else {
                            // 其他類別項目可增減數量
                            quantityControls = `
                                <div class="flex items-center space-x-2 mr-3">
                                    <button onclick="updateBillingQuantity(${originalIndex}, -1)" class="w-6 h-6 bg-red-500 text-white rounded-full text-xs hover:bg-red-600 transition duration-200">-</button>
                                    <span class="w-8 text-center font-semibold">${item.quantity}</span>
                                    <button onclick="updateBillingQuantity(${originalIndex}, 1)" class="w-6 h-6 bg-green-500 text-white rounded-full text-xs hover:bg-green-600 transition duration-200">+</button>
                                </div>
                            `;
                        }
                        
                        // 決定是否顯示折扣勾選框：有折扣項目且當前項目不是折扣項亦不是套票使用
                        const showDiscountCheckbox = hasDiscount && item.category !== 'discount' && item.category !== 'packageUse';
                        const checkboxHtml = showDiscountCheckbox ? `<div class="mr-2 flex items-center"><input type="checkbox" ${item.includedInDiscount === false ? '' : 'checked'} onchange="toggleDiscountEligibility(${originalIndex})"></div>` : '';
                        // 計算每一列的金額顯示
                        if (item.category === 'discount' && item.price > 0 && item.price < 1) {
                            // 百分比折扣：顯示折扣金額，以折扣適用小計為基準
                            const discountAmount = subtotalForDiscount * (1 - item.price) * item.quantity;
                            subtotal = -discountAmount;
                            subtotalDisplay = `-$${discountAmount.toFixed(0)}`;
                        } else {
                            // 一般項目或固定金額折扣
                            subtotal = item.price * item.quantity;
                            subtotalDisplay = `$${subtotal}`;
                        }

                        return `
                            <div class="flex items-center ${bgColor} border rounded-lg p-3">
                                ${checkboxHtml}
                                <div class="flex-1">
                                    <div class="font-semibold text-gray-900">${item.name}</div>
                                    <div class="text-xs text-gray-600">${categoryName}</div>
                                    <div class="text-sm font-medium ${item.category === 'discount' ? 'text-red-600' : 'text-green-600'}">
                                        ${(() => {
                                            if (item.category === 'discount') {
                                                if (item.price > 0 && item.price < 1) {
                                                    return `${(item.price * 10).toFixed(1)}折`;
                                                } else if (item.price < 0) {
                                                    return `-$${Math.abs(item.price)}`;
                                                } else {
                                                    return `$${item.price}`;
                                                }
                                            }
                                            return `$${item.price}`;
                                        })()}${item.unit ? ` / ${item.unit}` : ''}
                                    </div>
                                </div>
                                ${quantityControls}
                                <div class="mr-3 text-right">
                                    <div class="font-bold ${subtotal < 0 ? 'text-red-600' : 'text-green-600'}">${subtotalDisplay}</div>
                                </div>
                                ${undoBtn}${removeBtn}
                            </div>
                        `;
                    }).join('')}
                </div>
                
                <!-- 小計和總計顯示 -->
                ${subtotalForDiscount > 0 && hasDiscount ? `
                    <div class="mt-4 pt-3 border-t border-gray-200">
                        <div class="text-right space-y-1">
                            <div class="text-sm text-gray-600">
                                小計：<span class="font-medium">$${subtotalForDiscount}</span>
                            </div>
                            ${selectedBillingItems.filter(item => item.category === 'discount').map(item => {
                                if (item.price > 0 && item.price < 1) {
                                    const discountAmount = subtotalForDiscount * (1 - item.price) * item.quantity;
                                    return `<div class="text-sm text-red-600">
                                        ${item.name}${includedItemNames.length > 0 ? ` (適用：${includedItemNames.join(',')})` : ''}：<span class="font-medium">-$${discountAmount.toFixed(0)}</span>
                                    </div>`;
                                } else {
                                    return `<div class="text-sm text-red-600">
                                        ${item.name}${includedItemNames.length > 0 ? ` (適用：${includedItemNames.join(',')})` : ''}：<span class="font-medium">$${item.price * item.quantity}</span>
                                    </div>`;
                                }
                            }).join('')}
                            <div class="text-base font-bold text-green-600 pt-1 border-t border-gray-300">
                                總計：$${Math.round(totalAmount)}
                            </div>
                        </div>
                    </div>
                ` : ''}
            `;
            
            // 更新隱藏的文本域（非折扣項目在前，折扣項目在後）
            let billingText = '';
            // 如果有折扣項目，先顯示折扣適用小計
            if (hasDiscount) {
                billingText += `小計：$${subtotalForDiscount}\n\n`;
            }
            // 先記錄非折扣項目
            selectedBillingItems.forEach(item => {
                if (item.category !== 'discount') {
                    billingText += `${item.name} x${item.quantity} = $${item.price * item.quantity}\n`;
                }
            });
            // 再記錄折扣項目
            selectedBillingItems.forEach(item => {
                if (item.category === 'discount') {
                    if (item.price > 0 && item.price < 1) {
                        // 百分比折扣
                        const discountAmount = subtotalForDiscount * (1 - item.price) * item.quantity;
                        billingText += `${item.name} x${item.quantity} = -$${discountAmount.toFixed(0)}\n`;
                    } else {
                        // 固定金額折扣
                        billingText += `${item.name} x${item.quantity} = $${item.price * item.quantity}\n`;
                    }
                }
            });
            // 記錄折扣適用明細
            if (hasDiscount) {
                billingText += `折扣適用於: ${includedItemNames.join(',')}\n`;
            }
            billingText += `\n總費用：$${Math.round(totalAmount)}`;
            hiddenTextarea.value = billingText.trim();
        }
        
        // 更新收費項目數量
        function updateBillingQuantity(index, change) {
            if (index >= 0 && index < selectedBillingItems.length) {
                const item = selectedBillingItems[index];
                // 如果是折扣項目，不允許修改數量
                if (item.category === 'discount') {
                    showToast('折扣項目不允許修改數量', 'warning');
                    return;
                }
                // 如果是套票使用，且 change < 0，直接取消使用並退回次數
                if (change < 0 && item.category === 'packageUse') {
                    // 調用取消函式，這會自動移除該筆記錄並退回次數
                    undoPackageUse(item.patientId, item.packageRecordId, item.id);
                    return;
                }
                // 若為套票項目且不允許修改套票，則不調整數量
                if (item && item.category === 'package' && !canModifyPackageItems()) {
                    showToast('診症完成後無法調整套票數量', 'warning');
                    return;
                }
                const newQuantity = item.quantity + change;
                if (newQuantity > 0) {
                    selectedBillingItems[index].quantity = newQuantity;
                    updateBillingDisplay();
                } else if (newQuantity === 0) {
                    // 數量為0時移除項目
                    removeBillingItem(index);
                }
            }
        }
        
        // 移除收費項目
        function removeBillingItem(index) {
            if (index >= 0 && index < selectedBillingItems.length) {
                const removedItem = selectedBillingItems[index];
                // 如果為套票項目且目前不允許修改套票，則不允許移除
                if (removedItem && removedItem.category === 'package' && !canModifyPackageItems()) {
                    showToast('診症完成後無法刪除套票', 'warning');
                    return;
                }
                // 如果是套票使用，移除時需要退回剩餘次數
                if (removedItem.category === 'packageUse') {
                    // 直接調用取消函式，它會自動從陣列移除並處理次數
                    undoPackageUse(removedItem.patientId, removedItem.packageRecordId, removedItem.id);
                    return;
                }
                // 否則，單純移除
                selectedBillingItems.splice(index, 1);
                updateBillingDisplay();
                // showToast(`已移除：${removedItem.name}`, 'info');
            }
        }

        // 切換收費項目是否參與折扣
        function toggleDiscountEligibility(index) {
            if (index >= 0 && index < selectedBillingItems.length) {
                const item = selectedBillingItems[index];
                // 只針對非折扣項目切換折扣適用狀態
                if (item && item.category !== 'discount') {
                    // 若 undefined 或 true，視為參與折扣，切換為不參與；若為 false 則改為參與
                    item.includedInDiscount = item.includedInDiscount === false ? true : false;
                    updateBillingDisplay();
                }
            }
        }
        
        // 清除收費項目搜索
        function clearBillingSearch() {
            document.getElementById('billingSearch').value = '';
            document.getElementById('billingSearchResults').classList.add('hidden');
        }
        
        // 清空所有搜尋欄位
        function clearAllSearchFields() {
            // 清空病人搜尋欄
            const patientSearchInput = document.getElementById('patientSearchInput');
            if (patientSearchInput) {
                patientSearchInput.value = '';
            }
            
            // 清空處方搜尋欄
            clearPrescriptionSearch();
            
            // 清空收費項目搜尋欄
            clearBillingSearch();
        }
        
        // 自動添加預設診金收費
        function addDefaultConsultationFee(patient) {
            // 尋找診金收費項目（優先尋找名稱包含「診金」的項目）
            let consultationFeeItem = billingItems.find(item => 
                item.active && 
                item.category === 'consultation' && 
                item.name.includes('診金')
            );
            
            // 如果沒有找到診金項目，使用第一個診療費項目
            if (!consultationFeeItem) {
                consultationFeeItem = billingItems.find(item => 
                    item.active && item.category === 'consultation'
                );
            }
            
            // 如果找到診金項目，自動添加
            if (consultationFeeItem) {
                // 清空現有收費項目
                selectedBillingItems = [];
                
                // 添加診金項目
                const billingItem = {
                    id: consultationFeeItem.id,
                    name: consultationFeeItem.name,
                    category: consultationFeeItem.category,
                    price: consultationFeeItem.price,
                    unit: consultationFeeItem.unit,
                    description: consultationFeeItem.description,
                    quantity: 1,
                    // 預設診金可參與折扣
                    includedInDiscount: true
                };
                selectedBillingItems.push(billingItem);
                
                // 自動添加預設藥費（根據預設5天）
                const defaultDays = 5;
                updateMedicineFeeByDays(defaultDays);
                
                // 更新顯示
                updateBillingDisplay();
            } else {
                // 如果沒有找到任何診療費項目，只清空收費項目並更新顯示
                selectedBillingItems = [];
                updateBillingDisplay();
            }
        }
        

        
        // 載入上次處方內容（按鈕觸發）
        async function loadPreviousPrescription() {
            // 先檢查是否有正在診症的掛號
            if (!currentConsultingAppointmentId) {
                showToast('請先開始診症！', 'error');
                return;
            }
            // 使用字串比較 ID，避免類型不一致導致匹配失敗
            const appointment = appointments.find(apt => apt && String(apt.id) === String(currentConsultingAppointmentId));
            if (!appointment) {
                showToast('找不到當前診症記錄！', 'error');
                return;
            }
            // 取得觸發按鈕：優先使用事件目標，若不存在則從 DOM 查找
            let loadingButton = null;
            try {
                if (typeof event !== 'undefined' && event && event.currentTarget) {
                    loadingButton = event.currentTarget;
                }
            } catch (_e) {
                // 忽略事件取得失敗
            }
            if (!loadingButton) {
                loadingButton = document.querySelector('button[onclick="loadPreviousPrescription()"]');
            }
            if (loadingButton) {
                setButtonLoading(loadingButton, '讀取中...');
            }
            try {
                const patientResult = await window.firebaseDataManager.getPatients();
                if (!patientResult.success) {
                    showToast('無法讀取病人資料！', 'error');
                    return;
                }
                // 依據 appointment.patientId 找到病人
                const patient = patientResult.data.find(p => p.id === appointment.patientId);
                if (!patient) {
                    showToast('找不到病人資料！', 'error');
                    return;
                }
                // 讀取病人的診症記錄
                const consultationResult = await window.firebaseDataManager.getPatientConsultations(patient.id);
                if (!consultationResult.success) {
                    showToast('無法讀取診症記錄！', 'error');
                    return;
                }
                // 排除當前正在編輯的診症記錄（如果有）
                let patientConsultations = consultationResult.data || [];
                if (appointment.consultationId) {
                    patientConsultations = patientConsultations.filter(c => c.id !== appointment.consultationId);
                }
                // 取得最近一次診症記錄
                const lastConsultation = patientConsultations.length > 0 ? patientConsultations[0] : null;
                if (!lastConsultation || !lastConsultation.prescription) {
                    showToast(`${patient.name} 沒有上次處方記錄可載入`, 'warning');
                    return;
                }
                // 清空並解析處方
                selectedPrescriptionItems = [];
                parsePrescriptionToItems(lastConsultation.prescription);
                updatePrescriptionDisplay();
                // 在載入上次處方後，自動依照當前服藥天數更新藥費。
                // 先讀取天數輸入框的值，若無法取得則使用預設5天。
                try {
                    const daysInputEl = document.getElementById('medicationDays');
                    const daysVal = daysInputEl ? parseInt(daysInputEl.value) || 5 : 5;
                    // 只有當載入的處方有內容時才進行藥費更新
                    if (selectedPrescriptionItems.length > 0) {
                        updateMedicineFeeByDays(daysVal);
                    }
                } catch (_e) {
                    // 忽略任何錯誤，避免阻斷流程
                }
            } catch (error) {
                console.error('讀取病人資料錯誤:', error);
                showToast('讀取病人資料失敗', 'error');
            } finally {
                if (loadingButton) {
                    clearButtonLoading(loadingButton);
                }
            }
        }
        
        // 解析處方內容並重建處方項目
        function parsePrescriptionToItems(prescriptionText) {
            if (!prescriptionText) return;
            
            const lines = prescriptionText.split('\n');
            let i = 0;
            
            while (i < lines.length) {
                const line = lines[i].trim();
                if (!line) {
                    i++;
                    continue;
                }
                
                // 檢查是否為藥材/方劑格式（名稱 劑量g）
                const itemMatch = line.match(/^(.+?)\s+(\d+(?:\.\d+)?)g$/);
                if (itemMatch) {
                    const itemName = itemMatch[1].trim();
                    const dosage = itemMatch[2];
                    
                    // 先在中藥庫中尋找對應的項目（優先匹配中藥材，再匹配方劑）
                    let foundItem = herbLibrary.find(item => 
                        item.type === 'herb' && item.name === itemName
                    );
                    
                    if (foundItem) {
                        // 找到中藥材
                        const prescriptionItem = {
                            id: foundItem.id,
                            type: 'herb',
                            name: foundItem.name,
                            dosage: foundItem.dosage || '6g',
                            customDosage: dosage,
                            effects: foundItem.effects
                        };
                        selectedPrescriptionItems.push(prescriptionItem);
                    } else {
                        // 沒找到中藥材，尋找方劑
                        foundItem = herbLibrary.find(item => 
                            item.type === 'formula' && item.name === itemName
                        );
                        
                        if (foundItem) {
                            // 找到方劑
                            const prescriptionItem = {
                                id: foundItem.id,
                                type: 'formula',
                                name: foundItem.name,
                                customDosage: dosage,
                                composition: foundItem.composition,
                                effects: foundItem.effects
                            };
                            selectedPrescriptionItems.push(prescriptionItem);
                        } else {
                            // 都沒找到，根據常見方劑名稱特徵智能判斷類型
                            const isLikelyFormula = isFormulaName(itemName);
                            
                            const prescriptionItem = {
                                id: Date.now() + Math.random(), // 臨時ID
                                type: isLikelyFormula ? 'formula' : 'herb',
                                name: itemName,
                                customDosage: dosage,
                                effects: '（從上次處方載入）'
                            };
                            
                            if (isLikelyFormula) {
                                prescriptionItem.composition = '（從上次處方載入）';
                            } else {
                                prescriptionItem.dosage = `${dosage}g`;
                            }
                            
                            selectedPrescriptionItems.push(prescriptionItem);
                        }
                    }
                }
                
                i++;
            }
        }
        
        // 判斷是否為方劑名稱的輔助函數
        function isFormulaName(name) {
            // 常見方劑名稱特徵
            const formulaKeywords = [
                '湯', '散', '丸', '膏', '飲', '丹', '煎', '方', '劑',
                '四君子', '六君子', '八珍', '十全', '補中益氣', '逍遙',
                '甘麥大棗', '小柴胡', '大柴胡', '半夏瀉心', '黃連解毒',
                '清熱解毒', '銀翹', '桑菊', '麻黃', '桂枝', '葛根',
                '白虎', '承氣', '理中', '真武', '苓桂', '五苓'
            ];
            
            return formulaKeywords.some(keyword => name.includes(keyword));
        }
        

        
        // 載入上次收費項目（按鈕觸發）
        async function loadPreviousBillingItems() {
            // 先檢查是否有正在診症的掛號
            if (!currentConsultingAppointmentId) {
                showToast('請先開始診症！', 'error');
                return;
            }
            const appointment = appointments.find(apt => apt && String(apt.id) === String(currentConsultingAppointmentId));
            if (!appointment) {
                showToast('找不到當前診症記錄！', 'error');
                return;
            }
            // 取得觸發按鈕
            let loadingButton = null;
            try {
                if (typeof event !== 'undefined' && event && event.currentTarget) {
                    loadingButton = event.currentTarget;
                }
            } catch (_e) {}
            if (!loadingButton) {
                loadingButton = document.querySelector('button[onclick="loadPreviousBillingItems()"]');
            }
            if (loadingButton) {
                setButtonLoading(loadingButton, '讀取中...');
            }
            try {
                const patientResult = await window.firebaseDataManager.getPatients();
                if (!patientResult.success) {
                    showToast('無法讀取病人資料！', 'error');
                    return;
                }
                // 使用 appointment.patientId 取得病人資料
                const patient = patientResult.data.find(p => p.id === appointment.patientId);
                if (!patient) {
                    showToast('找不到病人資料！', 'error');
                    return;
                }
                // 從 Firebase 取得病人的診症記錄並按日期排序
                const consultationResult = await window.firebaseDataManager.getPatientConsultations(patient.id);
                if (!consultationResult.success) {
                    showToast('無法讀取診症記錄！', 'error');
                    return;
                }
                let patientConsultations = consultationResult.data || [];
                if (appointment.consultationId) {
                    patientConsultations = patientConsultations.filter(c => c.id !== appointment.consultationId);
                }
                // 最近一次診症記錄
                const lastConsultation = patientConsultations.length > 0 ? patientConsultations[0] : null;
                if (!lastConsultation || !lastConsultation.billingItems) {
                    showToast(`${patient.name} 沒有上次收費記錄可載入`, 'warning');
                    return;
                }
                // 清空現有收費項目並解析
                selectedBillingItems = [];
                parseBillingItemsFromText(lastConsultation.billingItems);
                // 根據要求：載入上次收費時，排除任何「使用套票」的抵扣項目與套票購買項目。
                // 原先僅排除 category 為 'packageUse' 的項目（即使用套票時產生的抵扣），
                // 但後續需求也要排除 category 為 'package' 的項目（即購買套票的收費項目）。
                if (Array.isArray(selectedBillingItems) && selectedBillingItems.length > 0) {
                    selectedBillingItems = selectedBillingItems.filter(item => item.category !== 'packageUse' && item.category !== 'package');
                }
                // 更新顯示
                updateBillingDisplay();
            } catch (error) {
                console.error('讀取病人資料錯誤:', error);
                showToast('讀取病人資料失敗', 'error');
            } finally {
                if (loadingButton) {
                    clearButtonLoading(loadingButton);
                }
            }
        }
        
// 解析收費項目文字並載入
function parseBillingItemsFromText(billingText) {
    if (!billingText) {
        return;
    }
    
    // 解析上次收費項目
    const billingLines = billingText.split('\n');
    // 用於儲存折扣適用的項目名稱列表（從文本中解析）
    let discountApplicableNames = null;
    billingLines.forEach(rawLine => {
        let line = (rawLine || '').trim();
        if (!line) return;
        // 檢查折扣適用於行，格式如：折扣適用於: 項目1,項目2
        // 使用 (.*) 允許捕獲空字串，以支援無項目適用折扣（全部排除）的情況
        const applicabilityMatch = line.match(/^折扣適用於[:：]\s*(.*)$/);
        if (applicabilityMatch) {
            // 解析所有名稱並去除空白
            discountApplicableNames = applicabilityMatch[1]
                .split(',')
                .map(n => n.trim())
                .filter(n => n.length > 0);
            return;
        }
        // 略過小計與總費用行
        if (line.includes('小計') || line.includes('總費用')) return;
        // 解析收費項目格式：項目名 x數量 = 金額
        // 原來的邏輯只匹配前綴為一個負號或貨幣符號的整數，例如 "$30" 或 "-30"，
        // 但對於折扣項目來說，金額可能出現組合符號，例如 "-$30" 或 "$-30"，甚至含有小數部分，例如 "-$30.5"。
        // 如果正則無法匹配這些形式，折扣項目就會被忽略，進而導致無法還原當時的折扣狀態。
        // 因此改用更寬鬆的正則式來截取項目名稱與數量，允許金額部分包含任意的「-」與「$」順序以及小數點。
        // 此處只關心前兩個群組（項目名與數量），第三個群組捕獲金額字串，但後續邏輯不使用這個值。
        const itemMatch = line.match(/^(.+?)\s+x(\d+)\s+=\s+(-?\$?-?\d+(?:\.\d+)?)$/);
        if (itemMatch) {
            const itemName = itemMatch[1].trim();
            const quantity = parseInt(itemMatch[2]);
            // 在收費項目中尋找對應的項目
            const billingItem = billingItems.find(it => it.active && it.name === itemName);
            if (billingItem) {
                const selectedItem = {
                    id: billingItem.id,
                    name: billingItem.name,
                    category: billingItem.category,
                    price: billingItem.price,
                    unit: billingItem.unit,
                    description: billingItem.description,
                    quantity: quantity,
                    // 預設除折扣項目外皆可參與折扣
                    includedInDiscount: billingItem.category !== 'discount'
                };
                selectedBillingItems.push(selectedItem);
            } else {
                // 處理套票使用項目（從舊病歷載入的情況）
                // 只要名稱包含「使用套票」，即視為套票抵扣
                if (itemName.includes('使用套票')) {
                    selectedBillingItems.push({
                        id: `loaded-packageUse-${Date.now()}-${Math.random().toString(36).substr(2,5)}`,
                        name: itemName,
                        category: 'packageUse',
                        price: 0,
                        unit: '次',
                        description: '套票抵扣一次',
                        quantity: quantity,
                        // 套票使用不參與折扣
                        includedInDiscount: false,
                        // 標記為從舊病歷載入，待恢復 meta 後可取消使用
                        isHistorical: true,
                        patientId: null,
                        packageRecordId: null
                    });
                } else {
                    // 如果在收費項目中找不到，創建一個臨時項目（用於已刪除的收費項目）
                    console.log(`找不到收費項目：${itemName || line}，可能已被刪除`);
                }
            }
        } else {
            // 若行不符合收費項目格式，且不是折扣適用於行，則略過
            // 這確保新的折扣明細不會導致錯誤
            return;
        }
    });
    // 如果解析到了折扣適用於行，根據其中的名稱調整各項目的折扣適用狀態
    // 注意：即使折扣名單為空（表示沒有項目適用折扣），也應該調整 includedInDiscount 屬性；
    // 若 discountApplicableNames 為 null，表示原文本沒有該行，則保留預設狀態。
    if (discountApplicableNames !== null) {
        selectedBillingItems.forEach(item => {
            if (item.category !== 'discount') {
                // 若名稱在折扣適用名單中則標記為可參與折扣，否則標記為不可參與折扣
                item.includedInDiscount = discountApplicableNames.includes(item.name);
            }
        });
    }
}
        
        // 已移除 loadPreviousBillingItemsFromConsultation 函式（未使用）
        
        // 載入指定病歷記錄到當前診症
        async function loadMedicalRecordToCurrentConsultation(consultationId) {
            if (!currentConsultingAppointmentId) {
                showToast('請先開始診症！', 'error');
                return;
            }
            
            // 將傳入的 ID 轉為字串以便比較
            const idToFind = String(consultationId);
            // 先在本地資料中查找診症記錄（兼容數字與字串）
            let consultation = consultations.find(c => String(c.id) === idToFind);
            // 如果本地找不到，嘗試從 Firebase 取得
            if (!consultation) {
                try {
                    const consultationResult = await window.firebaseDataManager.getConsultations();
                    if (consultationResult.success) {
                        consultation = consultationResult.data.find(c => String(c.id) === idToFind);
                    }
                } catch (error) {
                    console.error('讀取診症記錄錯誤:', error);
                    // 留空，後續將提示錯誤
                }
            }
            if (!consultation) {
                showToast('找不到指定的診症記錄！', 'error');
                return;
            }
            
            // 使用字串比較 ID，避免類型不匹配
            const currentAppointment = appointments.find(apt => apt && String(apt.id) === String(currentConsultingAppointmentId));
            if (!currentAppointment) {
                showToast('找不到當前診症記錄！', 'error');
                return;
            }
            
            // 確認是否為相同病人
            if (currentAppointment.patientId !== consultation.patientId) {
                showToast('只能載入相同病人的病歷記錄！', 'error');
                return;
            }
            
const patientResult = await window.firebaseDataManager.getPatients();
if (!patientResult.success) {
    showToast('無法讀取病人資料！', 'error');
    return;
}

const patient = patientResult.data.find(p => p.id === consultation.patientId);
if (!patient) {
    showToast('找不到病人資料！', 'error');
    return;
}

const consultationDate = (() => {
    const d = parseConsultationDate(consultation.date);
    return d ? d.toLocaleDateString('zh-TW') : '未知日期';
})();
            
            // 直接載入病歷，不彈出確認提示視窗
            // 注意：此操作會覆蓋當前已填寫的診症內容（主訴、舌象、脈象、診斷、處方、收費項目、醫囑等），且無法復原。
            // 若需要再次顯示確認提示，可重新加入 confirm 相關程式碼。
            
            // 載入診症資料
            document.getElementById('formSymptoms').value = consultation.symptoms || '';
            document.getElementById('formTongue').value = consultation.tongue || '';
            document.getElementById('formPulse').value = consultation.pulse || '';
            document.getElementById('formCurrentHistory').value = consultation.currentHistory || '';
            document.getElementById('formDiagnosis').value = consultation.diagnosis || '';
            document.getElementById('formSyndrome').value = consultation.syndrome || '';
            document.getElementById('formAcupunctureNotes').value = consultation.acupunctureNotes || '';
            document.getElementById('formUsage').value = consultation.usage || '';
            document.getElementById('formTreatmentCourse').value = consultation.treatmentCourse || '';
            document.getElementById('formInstructions').value = consultation.instructions || '';
            document.getElementById('formFollowUpDate').value = consultation.followUpDate || '';
            document.getElementById('formVisitTime').value = consultation.visitTime || '';
            
            // 載入休息期間
            if (consultation.restStartDate && consultation.restEndDate) {
                document.getElementById('formRestStartDate').value = consultation.restStartDate;
                document.getElementById('formRestEndDate').value = consultation.restEndDate;
                updateRestPeriod();
            } else {
                // 使用預設休息期間（今天），預設建議休息 1 天
                const startDate = new Date();
                const endDate = new Date();
                // 預設休息期間為一天，結束日期與開始日期相同
                endDate.setDate(startDate.getDate());
                
                const startDateStr = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`;
                const endDateStr = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;
                
                document.getElementById('formRestStartDate').value = startDateStr;
                document.getElementById('formRestEndDate').value = endDateStr;
                updateRestPeriod();
            }
            
            // 載入處方內容
            selectedPrescriptionItems = [];
            if (consultation.prescription) {
                // 先將完整處方內容存入隱藏文本域
                document.getElementById('formPrescription').value = consultation.prescription;
                
                // 嘗試解析處方內容並重建處方項目列表
                parsePrescriptionToItems(consultation.prescription);
                updatePrescriptionDisplay();
                
                // 若解析後沒有任何處方項目（可能中藥庫未包含相關藥材），
                // 則直接顯示原始處方內容，避免呈現空白
                if (selectedPrescriptionItems.length === 0) {
                    // 還原隱藏文本域為原始內容
                    document.getElementById('formPrescription').value = consultation.prescription;
                    const container = document.getElementById('selectedPrescriptionItems');
                    if (container) {
                        container.innerHTML = `<div class="text-sm text-gray-900 whitespace-pre-line">${consultation.prescription}</div>`;
                    }
                    const medicationSettingsEl = document.getElementById('medicationSettings');
                    if (medicationSettingsEl) {
                        medicationSettingsEl.style.display = 'none';
                    }
                }
            } else {
                // 清空處方
                document.getElementById('formPrescription').value = '';
                updatePrescriptionDisplay();
            }
            
            // 載入收費項目
            selectedBillingItems = [];
            if (consultation.billingItems) {
                // 直接將收費項目設置到隱藏文本域
                document.getElementById('formBillingItems').value = consultation.billingItems;

                // 解析並載入收費項目
                parseBillingItemsFromText(consultation.billingItems);

                // 根據要求：載入病歷時，排除任何「使用套票」的抵扣項目與套票購買項目。
                // 這些項目在 parseBillingItemsFromText 中會被標記為 category === 'packageUse' 或 category === 'package'。
                if (Array.isArray(selectedBillingItems) && selectedBillingItems.length > 0) {
                    selectedBillingItems = selectedBillingItems.filter(item => item.category !== 'packageUse' && item.category !== 'package');
                }

                // 嘗試為舊記錄補全套票使用的 meta 資訊（patientId 與 packageRecordId）。
                // 此步驟在移除套票使用項目後依然呼叫，不會對結果造成影響。
                try {
                    // 以前的程式碼中直接使用未宣告的 appointment 變數，導致 ReferenceError。
                    // 改為使用前面取得的 currentAppointment（當前掛號）來取得病人 ID。
                    const pidForRestore = (currentAppointment && currentAppointment.patientId) ? currentAppointment.patientId : null;
                    if (pidForRestore) {
                        await restorePackageUseMeta(pidForRestore);
                    }
                } catch (e) {
                    console.error('恢復套票使用 meta 錯誤:', e);
                }

                // 更新收費顯示
                updateBillingDisplay();
            } else {
                // 清空收費項目
                document.getElementById('formBillingItems').value = '';
                updateBillingDisplay();
            }
            
            // 清除搜索框
            clearPrescriptionSearch();
            clearBillingSearch();
            
            // 關閉病歷查看彈窗
            closeMedicalHistoryModal();
            
            // 滾動到診症表單
            document.getElementById('consultationForm').scrollIntoView({ behavior: 'smooth' });
            
            showToast(`已載入 ${patient ? patient.name : '未知病人'} 在 ${consultationDate} 的完整病歷記錄`, 'success');
        }
        
        // 清空診症表單時也要清空處方搜索
        /* clearConsultationFormOld 函式已移除（未使用） */



        // 獲取用戶顯示名稱（姓名全名 + 職位）
        function getUserDisplayName(user) {
            if (!user || !user.name) return '未知用戶';
            
            const fullName = user.name;
            const position = user.position || '用戶';
            
            return `${fullName}${position}`;
        }
        
        // 獲取醫師顯示名稱
        function getDoctorDisplayName(doctorRole) {
            if (!doctorRole) return '未記錄';
            
            // 如果是舊的固定值，直接返回
            if (doctorRole === 'doctor') {
                return '張中醫師醫師';
            }
            
            // 尋找對應的醫師用戶
            const doctorUser = users.find(u => u.username === doctorRole);
            if (doctorUser) {
                return getUserDisplayName(doctorUser);
            }
            
            // 如果找不到，返回原值
            return doctorRole;
        }
        
        // 獲取醫師註冊編號
        function getDoctorRegistrationNumber(doctorRole) {
            if (!doctorRole) return null;
            
            // 如果是舊的固定值，返回預設註冊編號
            if (doctorRole === 'doctor') {
                return 'CM001234';
            }
            
            // 尋找對應的醫師用戶
            const doctorUser = users.find(u => u.username === doctorRole);
            if (doctorUser && doctorUser.position === '醫師') {
                return doctorUser.registrationNumber || null;
            }
            
            return null;
        }
        
// 用戶管理功能
let editingUserId = null;
let currentUserFilter = 'all';
let usersFromFirebase = []; // 儲存從 Firebase 讀取的用戶數據

async function loadUserManagement() {
    await loadUsersFromFirebase();
    displayUsers();
    
    // 搜尋功能
    const searchInput = document.getElementById('searchUser');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            displayUsers();
        });
    }
}

// 從 Firebase 載入用戶數據
async function loadUsersFromFirebase() {
    const tbody = document.getElementById('userList');
    
    // 顯示載入中
    tbody.innerHTML = `
        <tr>
            <td colspan="7" class="px-4 py-8 text-center text-gray-500">
                <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                <div class="mt-2">載入中...</div>
            </td>
        </tr>
    `;

    try {
        const result = await window.firebaseDataManager.getUsers();
        
        if (result.success) {
            usersFromFirebase = result.data;
            // 同時更新本地 users 變數以保持兼容性
            users = result.data.map(user => ({
                ...user,
                // 確保數據格式兼容性
                createdAt: user.createdAt ? (user.createdAt.seconds ? new Date(user.createdAt.seconds * 1000).toISOString() : user.createdAt) : new Date().toISOString(),
                updatedAt: user.updatedAt ? (user.updatedAt.seconds ? new Date(user.updatedAt.seconds * 1000).toISOString() : user.updatedAt) : new Date().toISOString(),
                lastLogin: user.lastLogin ? (user.lastLogin.seconds ? new Date(user.lastLogin.seconds * 1000).toISOString() : user.lastLogin) : null
            }));
            
            console.log('已從 Firebase 載入用戶數據:', usersFromFirebase.length, '筆');
        } else {
            // 如果 Firebase 讀取失敗，使用本地 users 數據
            usersFromFirebase = users;
            console.log('Firebase 讀取失敗，使用本地用戶數據');
        }
    } catch (error) {
        console.error('載入用戶數據錯誤:', error);
        usersFromFirebase = users; // 使用本地數據作為備用
        showToast('載入用戶數據時發生錯誤，使用本地數據', 'warning');
    }
}

function filterUsers(status) {
    currentUserFilter = status;
    
    // 更新按鈕樣式
    document.querySelectorAll('[id^="user-filter-"]').forEach(btn => {
        btn.className = 'px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition duration-200';
    });
    document.getElementById(`user-filter-${status}`).className = 'px-4 py-2 rounded-lg text-sm font-medium bg-blue-100 text-blue-800 transition duration-200';
    
    displayUsers();
}

function displayUsers() {
    const searchTerm = document.getElementById('searchUser').value.toLowerCase();
    const tbody = document.getElementById('userList');
    
    // 使用 Firebase 數據或本地數據
    const currentUsers = usersFromFirebase.length > 0 ? usersFromFirebase : users;
    
    // 過濾用戶資料
    let filteredUsers = currentUsers.filter(user => {
        // 僅以姓名或電子郵件進行搜尋，不包含帳號
        const matchesSearch = user.name.toLowerCase().includes(searchTerm) ||
                            (user.email && user.email.toLowerCase().includes(searchTerm));
        
        let matchesFilter = true;
        if (currentUserFilter === 'inactive') {
            matchesFilter = !user.active;
        }
        
        return matchesSearch && matchesFilter;
    });
    
        tbody.innerHTML = '';
    
    if (filteredUsers.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="px-4 py-8 text-center text-gray-500">
                    ${searchTerm ? '沒有找到符合條件的用戶' : '尚無用戶資料'}
                </td>
            </tr>
        `;
        return;
    }
    
        filteredUsers.forEach(user => {
        const statusClass = user.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
        const statusText = user.active ? '啟用' : '停用';
        
        // 處理 Firebase Timestamp 格式
        let lastLogin = '從未登入';
        if (user.lastLogin) {
            if (user.lastLogin.seconds) {
                lastLogin = new Date(user.lastLogin.seconds * 1000).toLocaleString('zh-TW');
            } else {
                lastLogin = new Date(user.lastLogin).toLocaleString('zh-TW');
            }
        }
        // 對動態資料進行轉義
        const safeId = window.escapeHtml(String(user.id));
        const safeName = window.escapeHtml(user.name);
        const safePosition = window.escapeHtml(user.position || '未設定');
        const safeRegNumber = user.position === '醫師' ? window.escapeHtml(user.registrationNumber || '未設定') : '-';
        const safeEmail = window.escapeHtml(user.email || '未設定');
        const safeLastLogin = window.escapeHtml(lastLogin);
        let actionsHtml;
        const superAdminEmail = 'admin@clinic.com';
        if (user.email && user.email.toLowerCase() === superAdminEmail) {
            actionsHtml = `<span class="text-gray-400 text-xs">主管理員不可修改</span>`;
        } else if (user.id === currentUserData.id) {
            actionsHtml = `
                        <button onclick="editUser('${safeId}')" class="text-blue-600 hover:text-blue-800">編輯</button>
                        <span class="text-gray-400 text-xs ml-1">當前用戶</span>
                    `;
        } else {
            actionsHtml = `
                        <button onclick="editUser('${safeId}')" class="text-blue-600 hover:text-blue-800">編輯</button>
                        <button onclick="toggleUserStatus('${safeId}')" class="text-orange-600 hover:text-orange-800">
                            ${user.active ? '停用' : '啟用'}
                        </button>
                        <button onclick="deleteUser('${safeId}')" class="text-red-600 hover:text-red-800">刪除</button>
                    `;
        }
        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-50';
        row.innerHTML = `
            <td class="px-4 py-3 text-sm text-gray-900">${safeName}</td>
            <td class="px-4 py-3 text-sm text-gray-600">${safePosition}</td>
            <td class="px-4 py-3 text-sm text-gray-600">${safeRegNumber}</td>
            <td class="px-4 py-3 text-sm text-gray-900">${safeEmail}</td>
            <td class="px-4 py-3">
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusClass}">
                    ${statusText}
                </span>
            </td>
            <td class="px-4 py-3 text-sm text-gray-600">${safeLastLogin}</td>
            <td class="px-4 py-3 text-sm space-x-2">${actionsHtml}</td>
        `;
        tbody.appendChild(row);
    });
}

function showAddUserForm() {
    editingUserId = null;
    // 使用防呆處理，避免目標元素不存在時拋出錯誤
    const titleEl = document.getElementById('userFormTitle');
    if (titleEl) {
        titleEl.textContent = '新增用戶';
    }
    const saveBtnTextEl = document.getElementById('userSaveButtonText');
    if (saveBtnTextEl) {
        saveBtnTextEl.textContent = '儲存';
    }
    clearUserForm();
    const modalEl = document.getElementById('addUserModal');
    if (modalEl) {
        modalEl.classList.remove('hidden');
    }
}

function hideAddUserForm() {
    document.getElementById('addUserModal').classList.add('hidden');
    clearUserForm();
    editingUserId = null;
}

function clearUserForm() {
    ['userDisplayName', 'userPosition', 'userEmail', 'userPhone', 'userRegistrationNumber', 'userUID'].forEach(id => {
        document.getElementById(id).value = '';
    });
    document.getElementById('userActive').checked = true;
    
    // 隱藏註冊編號欄位
    document.getElementById('registrationNumberField').classList.add('hidden');
}

// 切換註冊編號欄位顯示
function toggleRegistrationNumberField() {
    const positionSelect = document.getElementById('userPosition');
    const registrationField = document.getElementById('registrationNumberField');
    
    if (positionSelect.value === '醫師') {
        registrationField.classList.remove('hidden');
    } else {
        registrationField.classList.add('hidden');
        // 清空註冊編號欄位
        document.getElementById('userRegistrationNumber').value = '';
    }
}

async function editUser(id) {
    // 檢查權限：未具備用戶管理權限則阻止操作
    if (!hasAccessToSection('userManagement')) {
        showToast('權限不足，無法執行此操作', 'error');
        return;
    }
    const currentUsers = usersFromFirebase.length > 0 ? usersFromFirebase : users;
    const user = currentUsers.find(u => u.id === id);
    if (!user) return;
    // 禁止編輯主管理員帳號（使用電子郵件判斷）
    const superAdminEmail = 'admin@clinic.com';
    if (user.email && user.email.toLowerCase() === superAdminEmail) {
        showToast('主管理員帳號不可編輯！', 'error');
        return;
    }
    
    editingUserId = id;
    // 使用防呆處理，避免目標元素不存在時拋出錯誤
    const titleEl = document.getElementById('userFormTitle');
    if (titleEl) {
        titleEl.textContent = '編輯用戶';
    }
    const saveBtnTextEl = document.getElementById('userSaveButtonText');
    if (saveBtnTextEl) {
        saveBtnTextEl.textContent = '更新';
    }
    
    // 帳號及密碼欄位已移除，無需填充相關資料
    // 填充表單資料
    const displayNameEl = document.getElementById('userDisplayName');
    if (displayNameEl) displayNameEl.value = user.name || '';
    const positionEl = document.getElementById('userPosition');
    if (positionEl) positionEl.value = user.position || '';
    const emailEl = document.getElementById('userEmail');
    if (emailEl) emailEl.value = user.email || '';
    const phoneEl = document.getElementById('userPhone');
    if (phoneEl) phoneEl.value = user.phone || '';
    const regNumEl = document.getElementById('userRegistrationNumber');
    if (regNumEl) regNumEl.value = user.registrationNumber || '';
    const activeEl = document.getElementById('userActive');
    if (activeEl) activeEl.checked = user.active !== false;

    // 填入 Firebase UID
    const uidEl = document.getElementById('userUID');
    if (uidEl) uidEl.value = user.uid || '';
    
    // 根據職位顯示或隱藏註冊編號欄位
    toggleRegistrationNumberField();
    
    const modalEl = document.getElementById('addUserModal');
    if (modalEl) {
        modalEl.classList.remove('hidden');
    }
}

async function saveUser() {
    // 檢查權限：未具備用戶管理權限則阻止操作
    if (!hasAccessToSection('userManagement')) {
        showToast('權限不足，無法執行此操作', 'error');
        return;
    }
    // 帳號及密碼欄位已移除，使用 UID 或電子郵件自動產生內部識別名稱
    const name = document.getElementById('userDisplayName').value.trim();
    const position = document.getElementById('userPosition').value.trim();
    const email = document.getElementById('userEmail').value.trim();
    const phone = document.getElementById('userPhone').value.trim();
    const registrationNumber = document.getElementById('userRegistrationNumber').value.trim();
    const active = document.getElementById('userActive').checked;
    const uid = document.getElementById('userUID').value.trim();

    // 產生內部用戶識別名稱（username）
    let username;
    if (uid) {
        username = uid;
    } else if (email) {
        username = email.split('@')[0];
    } else {
        username = 'user_' + Date.now();
    }
    
    // 驗證必填欄位（姓名與職位）
    if (!name || !position) {
        showToast('請填寫必要資料（姓名、職位）！', 'error');
        return;
    }

    // 檢查電子郵件格式
    if (email) {
        // 基本電子郵件格式驗證
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailPattern.test(email)) {
            showToast('電子郵件格式不正確！', 'error');
            return;
        }
    }

    // 檢查電話格式：允許 7~15 位數字
    if (phone) {
        const phonePattern = /^\d{7,15}$/;
        if (!phonePattern.test(phone)) {
            showToast('電話格式不正確，請輸入 7-15 位數字！', 'error');
            return;
        }
    }
    
    // 醫師職位必須填寫註冊編號
    if (position === '醫師' && !registrationNumber) {
        showToast('醫師職位必須填寫中醫註冊編號！', 'error');
        return;
    }
    
    // 檢查電子郵件是否重複
    if (email) {
        const currentUsers = usersFromFirebase.length > 0 ? usersFromFirebase : users;
        const existingUserByEmail = currentUsers.find(u => u.email && u.email.toLowerCase() === email.toLowerCase() && u.id !== editingUserId);
        if (existingUserByEmail) {
            showToast('此電子郵件已存在，請使用其他電子郵件！', 'error');
            return;
        }
    }
    
    // 驗證電子郵件格式
    if (email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            showToast('請輸入有效的電子郵件格式！', 'error');
            return;
        }
    }

    // 如果正在編輯，且用戶為主管理員則禁止編輯
    if (editingUserId) {
        const currentUsers = usersFromFirebase.length > 0 ? usersFromFirebase : users;
        const editingUser = currentUsers.find(u => u.id === editingUserId);
        const superAdminEmail = 'admin@clinic.com';
        if (editingUser && editingUser.email && editingUser.email.toLowerCase() === superAdminEmail) {
            showToast('主管理員帳號不可編輯！', 'error');
            return;
        }
    }

    // 顯示保存中狀態：在按鈕中顯示旋轉小圈並禁用按鈕
    const saveButton = document.querySelector('[onclick="saveUser()"]');
    setButtonLoading(saveButton, '保存中...');

    try {
        if (editingUserId) {
            // 更新現有用戶
            const userData = {
                name: name,
                position: position,
                registrationNumber: position === '醫師' ? registrationNumber : null,
                email: email,
                phone: phone,
                uid: uid || '',
                active: active
            };

            const result = await window.firebaseDataManager.updateUser(editingUserId, userData);
            
            if (result.success) {
                // 更新本地數據
                const userIndex = users.findIndex(u => u.id === editingUserId);
                if (userIndex !== -1) {
                    users[userIndex] = { ...users[userIndex], ...userData, updatedAt: new Date().toISOString() };
                }

                // 更新 Firebase 數據
                const firebaseUserIndex = usersFromFirebase.findIndex(u => u.id === editingUserId);
                if (firebaseUserIndex !== -1) {
                    usersFromFirebase[firebaseUserIndex] = { ...usersFromFirebase[firebaseUserIndex], ...userData };
                }
                
                // 如果更新的是當前登入用戶，同步更新 currentUserData
                if (editingUserId === currentUserData.id) {
                    currentUserData = { ...currentUserData, ...userData };
                    currentUser = users[userIndex].username;
                    
                    // 更新顯示的用戶資訊
                    document.getElementById('userRole').textContent = `當前用戶：${getUserDisplayName(currentUserData)}`;
                    document.getElementById('sidebarUserRole').textContent = `當前用戶：${getUserDisplayName(currentUserData)}`;
                }
                
                showToast('用戶資料已成功更新！', 'success');
            } else {
                showToast('更新用戶資料失敗，請稍後再試', 'error');
                return;
            }
        } else {
            // 新增用戶
            const userData = {
                username: username,
                name: name,
                position: position,
                registrationNumber: position === '醫師' ? registrationNumber : null,
                email: email,
                phone: phone,
                uid: uid || '',
                active: active,
                lastLogin: null
            };

            const result = await window.firebaseDataManager.addUser(userData);
            
            if (result.success) {
                // 更新本地數據
                const newUser = {
                    id: result.id,
                    ...userData,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                users.push(newUser);
                usersFromFirebase.push(newUser);
                
                showToast('用戶已成功新增！', 'success');
            } else {
                showToast('新增用戶失敗，請稍後再試', 'error');
                return;
            }
        }
        
        // 保存到本地儲存作為備用
        localStorage.setItem('users', JSON.stringify(users));
        displayUsers();
        hideAddUserForm();

    } catch (error) {
        console.error('保存用戶資料錯誤:', error);
        showToast('保存時發生錯誤', 'error');
    } finally {
        // 恢復按鈕狀態與內容
        clearButtonLoading(saveButton);
    }
}

async function toggleUserStatus(id) {
    // 檢查權限：未具備用戶管理權限則阻止操作
    if (!hasAccessToSection('userManagement')) {
        showToast('權限不足，無法執行此操作', 'error');
        return;
    }
    const currentUsers = usersFromFirebase.length > 0 ? usersFromFirebase : users;
    const user = currentUsers.find(u => u.id === id);
    if (!user) return;
    
    // 防止停用自己的帳號
    if (user.id === currentUserData.id) {
        showToast('不能停用自己的帳號！', 'error');
        return;
    }
    // 禁止停用主管理員帳號（使用電子郵件判斷）
    const superAdminEmail = 'admin@clinic.com';
    if (user.email && user.email.toLowerCase() === superAdminEmail) {
        showToast('主管理員帳號不可停用！', 'error');
        return;
    }
    
    const action = user.active ? '停用' : '啟用';
    const confirmMessage = `確定要${action}用戶「${user.name}」嗎？\n\n${user.active ? '停用後該用戶將無法登入系統。' : '啟用後該用戶可以正常登入系統。'}`;
    
    if (confirm(confirmMessage)) {
        // 顯示處理中狀態
        showToast('處理中...', 'info');

        try {
            const userData = {
                active: !user.active
            };

            const result = await window.firebaseDataManager.updateUser(id, userData);
            
            if (result.success) {
                // 更新本地數據
                const userIndex = users.findIndex(u => u.id === id);
                if (userIndex !== -1) {
                    users[userIndex].active = !user.active;
                    users[userIndex].updatedAt = new Date().toISOString();
                }

                // 更新 Firebase 數據
                const firebaseUserIndex = usersFromFirebase.findIndex(u => u.id === id);
                if (firebaseUserIndex !== -1) {
                    usersFromFirebase[firebaseUserIndex].active = !user.active;
                }
                
                localStorage.setItem('users', JSON.stringify(users));
                displayUsers();
                showToast(`用戶「${user.name}」已${action}！`, 'success');
            } else {
                showToast(`${action}用戶失敗，請稍後再試`, 'error');
            }
        } catch (error) {
            console.error('更新用戶狀態錯誤:', error);
            showToast('更新用戶狀態時發生錯誤', 'error');
        }
    }
}

async function deleteUser(id) {
    // 檢查權限：未具備用戶管理權限則阻止操作
    if (!hasAccessToSection('userManagement')) {
        showToast('權限不足，無法執行此操作', 'error');
        return;
    }
    const currentUsers = usersFromFirebase.length > 0 ? usersFromFirebase : users;
    const user = currentUsers.find(u => u.id === id);
    if (!user) return;
    
    // 防止刪除自己的帳號
    if (user.id === currentUserData.id) {
        showToast('不能刪除自己的帳號！', 'error');
        return;
    }
    // 禁止刪除主管理員帳號（使用電子郵件判斷）
    const superAdminEmail = 'admin@clinic.com';
    if (user.email && user.email.toLowerCase() === superAdminEmail) {
        showToast('主管理員帳號不可刪除！', 'error');
        return;
    }
    
    // 檢查是否為最後一個管理員
    const adminUsers = currentUsers.filter(u => u.position === '診所管理' && u.active && u.id !== id);
    if (user.position === '診所管理' && adminUsers.length === 0) {
        showToast('不能刪除最後一個診所管理帳號！', 'error');
        return;
    }
    
    const confirmMessage = `確定要刪除用戶「${user.name}」嗎？\n\n` +
                         `職位：${user.position}\n` +
                         `電子郵件：${user.email || '未設定'}\n\n` +
                         `注意：此操作無法復原！`;
    
    if (confirm(confirmMessage)) {
        // 顯示刪除中狀態
        showToast('刪除中...', 'info');

        try {
            const result = await window.firebaseDataManager.deleteUser(id);
            
            if (result.success) {
                // 更新本地數據
                users = users.filter(u => u.id !== id);
                usersFromFirebase = usersFromFirebase.filter(u => u.id !== id);
                
                localStorage.setItem('users', JSON.stringify(users));
                displayUsers();
                showToast(`用戶「${user.name}」已刪除！`, 'success');
            } else {
                showToast('刪除用戶失敗，請稍後再試', 'error');
            }
        } catch (error) {
            console.error('刪除用戶錯誤:', error);
            showToast('刪除用戶時發生錯誤', 'error');
        }
    }
}

// 財務報表功能
        let currentFinancialTabType = 'summary';
        
        // 載入財務報表頁面
        async function loadFinancialReports() {
            // 設置預設日期範圍（本月）
            const today = new Date();
            const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
            const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
            
            document.getElementById('startDate').value = formatFinancialDate(firstDayOfMonth);
            document.getElementById('endDate').value = formatFinancialDate(lastDayOfMonth);
            
            // 從 Firebase 更新用戶與診症資料（如可用）
            if (typeof loadUsersForFinancial === 'function') {
                await loadUsersForFinancial();
            }
            if (typeof loadConsultationsForFinancial === 'function') {
                await loadConsultationsForFinancial();
            }
            // 載入醫師選項
            loadFinancialDoctorOptions();
            // 生成初始報表
            generateFinancialReport();
        }

        // 格式化日期為 YYYY-MM-DD
        function formatFinancialDate(date) {
            return date.toISOString().split('T')[0];
        }

        // 載入醫師選項
        function loadFinancialDoctorOptions() {
            const doctorSelect = document.getElementById('doctorFilter');
            const doctors = users.filter(user => 
                user.active && user.position === '醫師'
            );
            
            // 清空現有選項（保留「全部醫師」）
            doctorSelect.innerHTML = '<option value="">全部醫師</option>';
            
            // 添加醫師選項
            doctors.forEach(doctor => {
                const option = document.createElement('option');
                option.value = doctor.username;
                option.textContent = `${doctor.name}`;
                doctorSelect.appendChild(option);
            });
        }

        // 從 Firebase 載入用戶資料以供財務報表使用
        async function loadUsersForFinancial() {
            // 如果 Firebase 數據管理器尚未準備或不存在，跳過
            if (!window.firebaseDataManager || !window.firebaseDataManager.isReady) {
                return;
            }
            try {
                const result = await window.firebaseDataManager.getUsers();
                if (result.success) {
                    // 更新全局 users 變數以供其他函式使用
                    users = result.data.map(user => {
                        // 轉換時間戳為 ISO 字串，兼容不同數據類型
                        const createdAt = user.createdAt
                            ? (user.createdAt.seconds
                                ? new Date(user.createdAt.seconds * 1000).toISOString()
                                : user.createdAt)
                            : new Date().toISOString();
                        const updatedAt = user.updatedAt
                            ? (user.updatedAt.seconds
                                ? new Date(user.updatedAt.seconds * 1000).toISOString()
                                : user.updatedAt)
                            : new Date().toISOString();
                        const lastLogin = user.lastLogin
                            ? (user.lastLogin.seconds
                                ? new Date(user.lastLogin.seconds * 1000).toISOString()
                                : user.lastLogin)
                            : null;
                        return { ...user, createdAt, updatedAt, lastLogin };
                    });
                }
            } catch (error) {
                console.error('載入 Firebase 用戶資料失敗:', error);
            }
        }

        // 從 Firebase 載入診症記錄以供財務報表使用
        async function loadConsultationsForFinancial() {
            if (!window.firebaseDataManager || !window.firebaseDataManager.isReady) {
                return;
            }
            try {
                const result = await window.firebaseDataManager.getConsultations();
                if (result.success) {
                    // 轉換 Firebase Timestamp 為 ISO 字串
                    consultations = result.data.map(item => {
                        let dateStr = null;
                        if (item.date) {
                            if (typeof item.date === 'object' && item.date.seconds) {
                                dateStr = new Date(item.date.seconds * 1000).toISOString();
                            } else {
                                dateStr = item.date;
                            }
                        } else if (item.createdAt) {
                            if (typeof item.createdAt === 'object' && item.createdAt.seconds) {
                                dateStr = new Date(item.createdAt.seconds * 1000).toISOString();
                            } else {
                                dateStr = item.createdAt;
                            }
                        }
                        return { ...item, date: dateStr };
                    });
                }
            } catch (error) {
                console.error('載入 Firebase 診症資料失敗:', error);
            }
        }

        // 快速日期選擇
        function setQuickDate() {
            const quickDate = document.getElementById('quickDate').value;
            const today = new Date();
            let startDate, endDate;

            switch (quickDate) {
                case 'today':
                    startDate = endDate = today;
                    document.getElementById('reportType').value = 'daily';
                    break;
                case 'yesterday':
                    startDate = endDate = new Date(today.getTime() - 24 * 60 * 60 * 1000);
                    document.getElementById('reportType').value = 'daily';
                    break;
                case 'thisWeek':
                    const thisWeekStart = new Date(today);
                    thisWeekStart.setDate(today.getDate() - today.getDay());
                    startDate = thisWeekStart;
                    endDate = today;
                    document.getElementById('reportType').value = 'weekly';
                    break;
                case 'lastWeek':
                    const lastWeekStart = new Date(today);
                    lastWeekStart.setDate(today.getDate() - today.getDay() - 7);
                    const lastWeekEnd = new Date(lastWeekStart);
                    lastWeekEnd.setDate(lastWeekStart.getDate() + 6);
                    startDate = lastWeekStart;
                    endDate = lastWeekEnd;
                    document.getElementById('reportType').value = 'weekly';
                    break;
                case 'thisMonth':
                    startDate = new Date(today.getFullYear(), today.getMonth(), 1);
                    endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                    document.getElementById('reportType').value = 'monthly';
                    break;
                case 'lastMonth':
                    startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                    endDate = new Date(today.getFullYear(), today.getMonth(), 0);
                    document.getElementById('reportType').value = 'monthly';
                    break;
                case 'thisYear':
                    startDate = new Date(today.getFullYear(), 0, 1);
                    endDate = new Date(today.getFullYear(), 11, 31);
                    document.getElementById('reportType').value = 'yearly';
                    break;
                case 'lastYear':
                    startDate = new Date(today.getFullYear() - 1, 0, 1);
                    endDate = new Date(today.getFullYear() - 1, 11, 31);
                    document.getElementById('reportType').value = 'yearly';
                    break;
                default:
                    return;
            }

            if (startDate && endDate) {
                document.getElementById('startDate').value = formatFinancialDate(startDate);
                document.getElementById('endDate').value = formatFinancialDate(endDate);
                generateFinancialReport();
            }
        }

        // 解析收費項目文本
        function parseFinancialBillingItems(billingText) {
            const items = [];
            const lines = billingText.split('\n');
            let totalAmount = 0;

            lines.forEach(line => {
                line = line.trim();
                if (!line || line.includes('小計') || line.includes('總費用')) {
                    // 提取總費用
                    if (line.includes('總費用')) {
                        const match = line.match(/\$(\d+)/);
                        if (match) {
                            totalAmount = parseInt(match[1]);
                        }
                    }
                    return;
                }

                // 解析收費項目格式：項目名 x數量 = $金額 或 項目名 x數量 = -$金額
                const itemMatch = line.match(/^(.+?)\s+x(\d+)\s+=\s+([\-\$]?\d+)$/);
                if (itemMatch) {
                    const itemName = itemMatch[1].trim();
                    const quantity = parseInt(itemMatch[2]);
                    const amount = parseInt(itemMatch[3].replace(/[\-\$]/g, ''));
                    const isDiscount = itemMatch[3].includes('-');

                    items.push({
                        name: itemName,
                        quantity: quantity,
                        unitPrice: Math.abs(amount / quantity),
                        totalAmount: isDiscount ? -amount : amount,
                        category: getFinancialCategoryFromItemName(itemName)
                    });
                }
            });

            return { items, totalAmount };
        }

        // 根據項目名稱推斷類別
        function getFinancialCategoryFromItemName(itemName) {
            if (itemName.includes('診金') || itemName.includes('診療') || itemName.includes('複診')) {
                return 'consultation';
            } else if (itemName.includes('藥') || itemName.includes('中藥') || itemName.includes('調劑')) {
                return 'medicine';
            } else if (itemName.includes('針灸') || itemName.includes('推拿') || itemName.includes('拔罐') || itemName.includes('刮痧') || itemName.includes('艾灸')) {
                return 'treatment';
            } else if (itemName.includes('折扣') || itemName.includes('優惠')) {
                return 'discount';
            } else if (itemName.includes('套票') || itemName.includes('套餐') || itemName.includes('療程') || itemName.includes('方案')) {
                return 'package';
            } else {
                return 'other';
            }
        }

        // 生成財務報表
        function generateFinancialReport() {
            const startDate = document.getElementById('startDate').value;
            const endDate = document.getElementById('endDate').value;
            const doctorFilter = document.getElementById('doctorFilter').value;
            const reportType = document.getElementById('reportType').value;

            if (!startDate || !endDate) {
                showToast('請選擇日期範圍！', 'error');
                return;
            }

            // 過濾診症資料
            const filteredConsultations = filterFinancialConsultations(startDate, endDate, doctorFilter);
            
            // 計算統計資料
            const stats = calculateFinancialStatistics(filteredConsultations);
            
            // 更新關鍵指標
            updateFinancialKeyMetrics(stats);
            
            // 更新表格
            updateFinancialTables(filteredConsultations, stats);
            
            // 更新時間
            document.getElementById('lastUpdateTime').textContent = new Date().toLocaleString('zh-TW');
            
            showToast('財務報表已更新！', 'success');
        }

        // 過濾診症資料
        function filterFinancialConsultations(startDate, endDate, doctorFilter) {
            const start = new Date(startDate);
            const end = new Date(endDate + 'T23:59:59.999Z');

            return consultations.filter(consultation => {
                const consultationDate = new Date(consultation.date);
                const dateInRange = consultationDate >= start && consultationDate <= end;
                const doctorMatch = !doctorFilter || consultation.doctor === doctorFilter;
                const isCompleted = consultation.status === 'completed';

                return dateInRange && doctorMatch && isCompleted;
            });
        }

        // 計算財務統計資料
        function calculateFinancialStatistics(consultations) {
            let totalRevenue = 0;
            let totalConsultations = consultations.length;
            const doctorStats = {};
            const serviceStats = {};
            const dailyStats = {};

            consultations.forEach(consultation => {
                const parsed = parseFinancialBillingItems(consultation.billingItems || '');
                const consultationRevenue = parsed.totalAmount;
                totalRevenue += consultationRevenue;

                // 醫師統計
                if (!doctorStats[consultation.doctor]) {
                    doctorStats[consultation.doctor] = {
                        count: 0,
                        revenue: 0
                    };
                }
                doctorStats[consultation.doctor].count += 1;
                doctorStats[consultation.doctor].revenue += consultationRevenue;

                // 服務統計
                parsed.items.forEach(item => {
                    if (!serviceStats[item.category]) {
                        serviceStats[item.category] = {
                            name: getFinancialCategoryDisplayName(item.category),
                            count: 0,
                            revenue: 0,
                            items: []
                        };
                    }
                    serviceStats[item.category].count += item.quantity;
                    serviceStats[item.category].revenue += item.totalAmount;
                    serviceStats[item.category].items.push(item);
                });

                // 每日統計
                const dateKey = consultation.date.split('T')[0];
                if (!dailyStats[dateKey]) {
                    dailyStats[dateKey] = {
                        count: 0,
                        revenue: 0,
                        services: {}
                    };
                }
                dailyStats[dateKey].count += 1;
                dailyStats[dateKey].revenue += consultationRevenue;
            });

            const averageRevenue = totalConsultations > 0 ? totalRevenue / totalConsultations : 0;
            const activeDoctors = Object.keys(doctorStats).length;

            return {
                totalRevenue,
                totalConsultations,
                averageRevenue,
                activeDoctors,
                doctorStats,
                serviceStats,
                dailyStats
            };
        }

        // 獲取類別顯示名稱
        function getFinancialCategoryDisplayName(category) {
            const names = {
                consultation: '診療費',
                medicine: '藥費',
                treatment: '治療費',
                other: '其他費用',
                discount: '折扣',
                package: '套票項目',
                packageUse: '套票使用'
            };
            return names[category] || category;
        }

        // 更新關鍵指標
        function updateFinancialKeyMetrics(stats) {
            document.getElementById('totalRevenue').textContent = `$${stats.totalRevenue.toLocaleString()}`;
            document.getElementById('totalConsultations').textContent = stats.totalConsultations.toLocaleString();
            document.getElementById('averageRevenue').textContent = `$${Math.round(stats.averageRevenue).toLocaleString()}`;
            document.getElementById('activeDoctors').textContent = stats.activeDoctors;
        }

        // 更新財務表格
        function updateFinancialTables(consultations, stats) {
            updateFinancialSummaryTable(stats);
            updateFinancialDailyTable(stats.dailyStats);
            updateFinancialDoctorTable(stats.doctorStats);
            updateFinancialServiceTable(stats.serviceStats);
        }

        // 更新收入摘要表格
        function updateFinancialSummaryTable(stats) {
            const tbody = document.getElementById('financialSummaryTableBody');
            const summaryData = [
                { item: '診療費收入', amount: 0, category: 'consultation' },
                { item: '藥費收入', amount: 0, category: 'medicine' },
                { item: '治療費收入', amount: 0, category: 'treatment' },
                { item: '其他收入', amount: 0, category: 'other' },
                { item: '套票收入', amount: 0, category: 'package' }
            ];

            // 計算各類別收入
            Object.keys(stats.serviceStats).forEach(category => {
                const stat = stats.serviceStats[category];
                const summaryItem = summaryData.find(item => item.category === category);
                if (summaryItem) {
                    summaryItem.amount = stat.revenue;
                }
            });

            const totalRevenue = stats.totalRevenue;

            tbody.innerHTML = summaryData.map(item => {
                const percentage = totalRevenue > 0 ? ((item.amount / totalRevenue) * 100).toFixed(1) : '0';
                return `
                    <tr class="hover:bg-gray-50">
                        <td class="px-4 py-3 text-sm text-gray-900">${item.item}</td>
                        <td class="px-4 py-3 text-sm text-gray-900 text-right font-medium">$${item.amount.toLocaleString()}</td>
                        <td class="px-4 py-3 text-sm text-gray-600 text-right">${percentage}%</td>
                        <td class="px-4 py-3 text-sm text-gray-500 text-right">統計期間</td>
                    </tr>
                `;
            }).join('');
        }

        // 更新每日明細表格
        function updateFinancialDailyTable(dailyStats) {
            const tbody = document.getElementById('financialDailyTableBody');
            const sortedDates = Object.keys(dailyStats).sort().reverse();

            if (sortedDates.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="5" class="px-4 py-8 text-center text-gray-500">
                            選定期間內沒有診症記錄
                        </td>
                    </tr>
                `;
                return;
            }

            tbody.innerHTML = sortedDates.map(date => {
                const stat = dailyStats[date];
                const averageDaily = stat.count > 0 ? Math.round(stat.revenue / stat.count) : 0;
                const formattedDate = new Date(date + 'T00:00:00').toLocaleDateString('zh-TW');

                return `
                    <tr class="hover:bg-gray-50">
                        <td class="px-4 py-3 text-sm text-gray-900">${formattedDate}</td>
                        <td class="px-4 py-3 text-sm text-gray-900 text-right">${stat.count}</td>
                        <td class="px-4 py-3 text-sm text-gray-900 text-right font-medium">$${stat.revenue.toLocaleString()}</td>
                        <td class="px-4 py-3 text-sm text-gray-600 text-right">$${averageDaily.toLocaleString()}</td>
                        <td class="px-4 py-3 text-sm text-gray-600">診療、藥費</td>
                    </tr>
                `;
            }).join('');
        }

        // 更新醫師業績表格
        function updateFinancialDoctorTable(doctorStats) {
            const tbody = document.getElementById('financialDoctorTableBody');
            const totalRevenue = Object.values(doctorStats).reduce((sum, stat) => sum + stat.revenue, 0);

            if (Object.keys(doctorStats).length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="5" class="px-4 py-8 text-center text-gray-500">
                            選定期間內沒有醫師診症記錄
                        </td>
                    </tr>
                `;
                return;
            }

            const sortedDoctors = Object.entries(doctorStats).sort(([,a], [,b]) => b.revenue - a.revenue);

            tbody.innerHTML = sortedDoctors.map(([doctorUsername, stat]) => {
                const percentage = totalRevenue > 0 ? ((stat.revenue / totalRevenue) * 100).toFixed(1) : '0';
                const average = stat.count > 0 ? Math.round(stat.revenue / stat.count) : 0;
                const doctorName = getDoctorDisplayName(doctorUsername);

                return `
                    <tr class="hover:bg-gray-50">
                        <td class="px-4 py-3 text-sm text-gray-900">${doctorName}</td>
                        <td class="px-4 py-3 text-sm text-gray-900 text-right">${stat.count}</td>
                        <td class="px-4 py-3 text-sm text-gray-900 text-right font-medium">$${stat.revenue.toLocaleString()}</td>
                        <td class="px-4 py-3 text-sm text-gray-600 text-right">$${average.toLocaleString()}</td>
                        <td class="px-4 py-3 text-sm text-gray-600 text-right">${percentage}%</td>
                    </tr>
                `;
            }).join('');
        }

        // 更新服務分析表格
        function updateFinancialServiceTable(serviceStats) {
            const tbody = document.getElementById('financialServiceTableBody');
            const totalRevenue = Object.values(serviceStats).reduce((sum, stat) => sum + stat.revenue, 0);

            if (Object.keys(serviceStats).length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="5" class="px-4 py-8 text-center text-gray-500">
                            選定期間內沒有服務記錄
                        </td>
                    </tr>
                `;
                return;
            }

            const sortedServices = Object.entries(serviceStats).sort(([,a], [,b]) => b.revenue - a.revenue);

            tbody.innerHTML = sortedServices.map(([category, stat]) => {
                const percentage = totalRevenue > 0 ? ((stat.revenue / totalRevenue) * 100).toFixed(1) : '0';
                const average = stat.count > 0 ? Math.round(stat.revenue / stat.count) : 0;

                return `
                    <tr class="hover:bg-gray-50">
                        <td class="px-4 py-3 text-sm text-gray-900">${stat.name}</td>
                        <td class="px-4 py-3 text-sm text-gray-900 text-right">${stat.count}</td>
                        <td class="px-4 py-3 text-sm text-gray-900 text-right font-medium">$${stat.revenue.toLocaleString()}</td>
                        <td class="px-4 py-3 text-sm text-gray-600 text-right">$${average.toLocaleString()}</td>
                        <td class="px-4 py-3 text-sm text-gray-600 text-right">${percentage}%</td>
                    </tr>
                `;
            }).join('');
        }

        // 切換財務標籤
        function switchFinancialTab(tabType) {
            // 更新標籤按鈕樣式
            document.querySelectorAll('[role="tablist"] button').forEach(btn => {
                if (btn.id && btn.id.startsWith('financial')) {
                    btn.className = 'py-4 px-1 border-b-2 border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 font-medium text-sm transition duration-200';
                }
            });
            
            document.getElementById(`financial${tabType.charAt(0).toUpperCase() + tabType.slice(1)}Tab`).className = 'py-4 px-1 border-b-2 border-green-500 text-green-600 font-medium text-sm transition duration-200';

            // 隱藏所有標籤內容
            document.querySelectorAll('.financial-tab-content').forEach(content => {
                content.classList.add('hidden');
            });

            // 顯示選中的標籤內容
            document.getElementById(`financial${tabType.charAt(0).toUpperCase() + tabType.slice(1)}Content`).classList.remove('hidden');
            
            currentFinancialTabType = tabType;
        }

        // 匯出財務報表
function exportFinancialReport() {
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;
    const reportType = document.getElementById('reportType').value;
    // 取得醫師篩選條件（若有）
    let doctorFilter = '';
    const doctorFilterInput = document.getElementById('doctorFilter');
    if (doctorFilterInput) {
        doctorFilter = doctorFilterInput.value;
    }
    // 過濾診症資料並計算統計以生成更詳細的報表
    const filteredConsultations = filterFinancialConsultations(startDate, endDate, doctorFilter);
    const stats = calculateFinancialStatistics(filteredConsultations);
    // 準備各區塊文字
    const doctorLines = Object.keys(stats.doctorStats).map(key => {
        const data = stats.doctorStats[key];
        const doctorName = key || '未知醫師';
        return `${doctorName}: 次數 ${data.count.toLocaleString()}，收入 $${data.revenue.toLocaleString()}`;
    }).join('\n');
    const serviceLines = Object.values(stats.serviceStats).map(item => {
        return `${item.name}: 次數 ${item.count.toLocaleString()}，收入 $${item.revenue.toLocaleString()}`;
    }).join('\n');
    const dailyLines = Object.keys(stats.dailyStats).map(dateKey => {
        const data = stats.dailyStats[dateKey];
        return `${dateKey}: 次數 ${data.count.toLocaleString()}，收入 $${data.revenue.toLocaleString()}`;
    }).join('\n');
    // 組合文字報表
    let textReport = '';
    if (doctorFilter) {
        textReport += `選擇醫師: ${doctorFilter}\n`;
    }
    textReport += `報表標題: 財務報表 - ${reportType}\n`;
    textReport += `期間: ${startDate} 至 ${endDate}\n`;
    textReport += `生成時間: ${new Date().toLocaleString('zh-TW')}\n`;
    textReport += `總收入: $${stats.totalRevenue.toLocaleString()}\n`;
    textReport += `總診症數: ${stats.totalConsultations.toLocaleString()}\n`;
    textReport += `平均收入: $${Math.round(stats.averageRevenue).toLocaleString()}\n`;
    textReport += `有效醫師數: ${stats.activeDoctors.toLocaleString()}\n\n`;
    textReport += `醫師統計:\n${doctorLines || '無資料'}\n\n`;
    textReport += `服務分類統計:\n${serviceLines || '無資料'}\n\n`;
    textReport += `每日統計:\n${dailyLines || '無資料'}\n`;
    // 創建下載為純文字檔案
    const blob = new Blob([textReport], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `財務報表_${startDate}_${endDate}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('財務報表已匯出！', 'success');
}

// ================== 資料備份與還原相關函式 ==================
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
        // 讀取病人、診症記錄與用戶資料
        const [patientsRes, consultationsRes, usersRes] = await Promise.all([
            window.firebaseDataManager.getPatients(),
            window.firebaseDataManager.getConsultations(),
            window.firebaseDataManager.getUsers()
        ]);
        const patientsData = patientsRes && patientsRes.success && Array.isArray(patientsRes.data) ? patientsRes.data : [];
        const consultationsData = consultationsRes && consultationsRes.success && Array.isArray(consultationsRes.data) ? consultationsRes.data : [];
        const usersData = usersRes && usersRes.success && Array.isArray(usersRes.data) ? usersRes.data : [];
        // 確保中藥庫與收費項目已載入
        if (typeof initHerbLibrary === 'function') {
            await initHerbLibrary();
        }
        if (typeof initBillingItems === 'function') {
            await initBillingItems();
        }
        // 確保模板庫已載入以獲取最新模板資料
        if (typeof initTemplateLibrary === 'function') {
            try {
                await initTemplateLibrary();
            } catch (_e) {
                // 若初始化失敗，略過並依據現有資料備份
            }
        }
        const herbData = Array.isArray(herbLibrary) ? herbLibrary : [];
        const billingData = Array.isArray(billingItems) ? billingItems : [];
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
        // 讀取醫囑模板資料
        let prescriptionTemplatesData = [];
        try {
            const presSnap = await window.firebase.getDocs(window.firebase.collection(window.firebase.db, 'prescriptionTemplates'));
            presSnap.forEach((docSnap) => {
                prescriptionTemplatesData.push({ id: docSnap.id, ...docSnap.data() });
            });
        } catch (e) {
            console.error('讀取醫囑模板資料失敗:', e);
        }
        // 讀取診斷模板資料
        let diagnosisTemplatesData = [];
        try {
            const diagSnap = await window.firebase.getDocs(window.firebase.collection(window.firebase.db, 'diagnosisTemplates'));
            diagSnap.forEach((docSnap) => {
                diagnosisTemplatesData.push({ id: docSnap.id, ...docSnap.data() });
            });
        } catch (e) {
            console.error('讀取診斷模板資料失敗:', e);
        }
        // 讀取問診資料
        let inquiriesData = [];
        try {
            const inquirySnap = await window.firebase.getDocs(window.firebase.collection(window.firebase.db, 'inquiries'));
            inquirySnap.forEach((docSnap) => {
                inquiriesData.push({ id: docSnap.id, ...docSnap.data() });
            });
        } catch (e) {
            console.error('讀取問診資料失敗:', e);
        }
        // 組合備份資料
        const backup = {
            patients: patientsData,
            consultations: consultationsData,
            users: usersData,
            herbLibrary: herbData,
            billingItems: billingData,
            patientPackages: packageData,
            clinicSettings: clinicSettings,
            prescriptionTemplates: prescriptionTemplatesData,
            diagnosisTemplates: diagnosisTemplatesData,
            inquiries: inquiriesData
        };
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
    } catch (error) {
        console.error('匯出備份失敗:', error);
        showToast('匯出備份失敗，請稍後再試', 'error');
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
    if (!window.confirm('匯入備份將覆蓋現有資料，確定要繼續嗎？')) {
        return;
    }
    const button = document.getElementById('backupImportBtn');
    setButtonLoading(button);
    try {
        const text = await file.text();
        const data = JSON.parse(text);
        await importClinicBackup(data);
        showToast('備份資料匯入完成！', 'success');
    } catch (error) {
        console.error('匯入備份失敗:', error);
        showToast('匯入備份失敗，請確認檔案格式是否正確', 'error');
    } finally {
        clearButtonLoading(button);
    }
}

/**
 * 將備份資料寫回 Firestore，覆蓋現有資料。Realtime Database 資料不受影響。
 * @param {Object} data 備份物件
 */
async function importClinicBackup(data) {
    await ensureFirebaseReady();
    // helper：清空並覆寫集合資料
    async function replaceCollection(collectionName, items) {
        const colRef = window.firebase.collection(window.firebase.db, collectionName);
        try {
            const snap = await window.firebase.getDocs(colRef);
            const deletions = [];
            snap.forEach((docSnap) => {
                deletions.push(window.firebase.deleteDoc(window.firebase.doc(window.firebase.db, collectionName, docSnap.id)));
            });
            if (deletions.length > 0) {
                await Promise.all(deletions);
            }
        } catch (err) {
            console.error('刪除 ' + collectionName + ' 舊資料失敗:', err);
        }
        const writes = [];
        if (Array.isArray(items)) {
            items.forEach(item => {
                if (item && item.id !== undefined && item.id !== null) {
                    const idStr = String(item.id);
                    writes.push(window.firebase.setDoc(window.firebase.doc(window.firebase.db, collectionName, idStr), item));
                }
            });
        }
        if (writes.length > 0) {
            await Promise.all(writes);
        }
    }
    // 覆蓋各集合
    await replaceCollection('patients', Array.isArray(data.patients) ? data.patients : []);
    await replaceCollection('consultations', Array.isArray(data.consultations) ? data.consultations : []);
    await replaceCollection('users', Array.isArray(data.users) ? data.users : []);
    await replaceCollection('herbLibrary', Array.isArray(data.herbLibrary) ? data.herbLibrary : []);
    await replaceCollection('billingItems', Array.isArray(data.billingItems) ? data.billingItems : []);
    await replaceCollection('patientPackages', Array.isArray(data.patientPackages) ? data.patientPackages : []);
    // 新增：覆蓋醫囑模板、診斷模板與問診資料
    await replaceCollection('prescriptionTemplates', Array.isArray(data.prescriptionTemplates) ? data.prescriptionTemplates : []);
    await replaceCollection('diagnosisTemplates', Array.isArray(data.diagnosisTemplates) ? data.diagnosisTemplates : []);
    await replaceCollection('inquiries', Array.isArray(data.inquiries) ? data.inquiries : []);
    // 更新診所設定
    if (data.clinicSettings && typeof data.clinicSettings === 'object') {
        clinicSettings = { ...data.clinicSettings };
        localStorage.setItem('clinicSettings', JSON.stringify(clinicSettings));
        updateClinicSettingsDisplay();
    }
    // 清除本地快取
    patientCache = null;
    consultationCache = null;
    userCache = null;
    herbLibrary = Array.isArray(data.herbLibrary) ? data.herbLibrary : [];
    billingItems = Array.isArray(data.billingItems) ? data.billingItems : [];
    // 更新模板資料至全域變數
    if (Array.isArray(data.prescriptionTemplates)) {
        prescriptionTemplates = data.prescriptionTemplates;
    } else {
        prescriptionTemplates = [];
    }
    if (Array.isArray(data.diagnosisTemplates)) {
        diagnosisTemplates = data.diagnosisTemplates;
    } else {
        diagnosisTemplates = [];
    }
    // 重新載入資料
    await fetchPatients(true);
    await fetchConsultations(true);
    await fetchUsers(true);
    if (typeof initHerbLibrary === 'function') {
        await initHerbLibrary();
    }
    if (typeof initBillingItems === 'function') {
        await initBillingItems();
    }
    // 重新載入模板庫資料顯示
    if (typeof renderPrescriptionTemplates === 'function') {
        try {
            renderPrescriptionTemplates();
        } catch (_e) {}
    }
    if (typeof renderDiagnosisTemplates === 'function') {
        try {
            renderDiagnosisTemplates();
        } catch (_e) {}
    }
    // 更新模板分類篩選
    if (typeof refreshTemplateCategoryFilters === 'function') {
        try {
            refreshTemplateCategoryFilters();
        } catch (_e) {}
    }
    // 更新界面
    if (typeof loadPatientList === 'function') {
        loadPatientList();
    }
    if (typeof loadTodayAppointments === 'function') {
        await loadTodayAppointments();
    }
    if (typeof updateStatistics === 'function') {
        updateStatistics();
    }
}

        
// 套票管理函式
async function getPatientPackages(patientId) {
    // 等待數據管理器準備就緒，避免初始化過程中返回空陣列
    if (!window.firebaseDataManager || !window.firebaseDataManager.isReady) {
        // 最多等待5秒（100 * 50ms），防止無限等待
        for (let i = 0; i < 100 && (!window.firebaseDataManager || !window.firebaseDataManager.isReady); i++) {
            await new Promise(resolve => setTimeout(resolve, 50));
        }
    }
    // 如果仍未就緒，回傳空陣列並警告
    if (!window.firebaseDataManager || !window.firebaseDataManager.isReady) {
        console.warn('FirebaseDataManager 尚未就緒，無法取得患者套票');
        return [];
    }
    try {
        const result = await window.firebaseDataManager.getPatientPackages(patientId);
        return result.success ? result.data : [];
    } catch (error) {
        console.error('獲取患者套票錯誤:', error);
        return [];
    }
}

async function purchasePackage(patientId, item) {
    const totalUses = Number(item.packageUses || item.totalUses || 0);
    const validityDays = Number(item.validityDays || 0);
    const purchasedAt = new Date();
    const expiresAt = new Date(purchasedAt);
    expiresAt.setDate(expiresAt.getDate() + validityDays);
    
    const record = {
        patientId: patientId,
        packageItemId: item.id,
        name: item.name,
        totalUses: totalUses,
        remainingUses: totalUses,
        purchasedAt: purchasedAt.toISOString(),
        expiresAt: expiresAt.toISOString()
    };
    
    try {
        const result = await window.firebaseDataManager.addPatientPackage(record);
        if (result.success) {
            return { ...record, id: result.id };
        }
        return null;
    } catch (error) {
        console.error('購買套票錯誤:', error);
        return null;
    }
}

async function consumePackage(patientId, packageRecordId) {
    try {
        const packages = await getPatientPackages(patientId);
        // 比對 ID 時統一轉為字串，避免類型不一致導致找不到套票
        const pkg = packages.find(p => String(p.id) === String(packageRecordId));
        
        if (!pkg) return { ok: false, msg: '找不到套票' };
        
        const now = new Date();
        const exp = new Date(pkg.expiresAt);
        if (now > exp) return { ok: false, msg: '套票已過期' };
        if (pkg.remainingUses <= 0) return { ok: false, msg: '套票已用完' };
        
        const updatedPackage = {
            ...pkg,
            remainingUses: pkg.remainingUses - 1
        };
        
        const result = await window.firebaseDataManager.updatePatientPackage(packageRecordId, updatedPackage);
        
        if (result.success) {
            return { ok: true, record: updatedPackage };
        } else {
            return { ok: false, msg: '更新套票失敗' };
        }
    } catch (error) {
        console.error('使用套票錯誤:', error);
        return { ok: false, msg: '系統錯誤' };
    }
}

/**
 * 在本地消耗套票使用次數，不立即同步到資料庫。
 * 將根據暫存變更計算可用的剩餘次數，並於保存病歷時一次性提交。
 *
 * @param {string} patientId 患者 ID
 * @param {string} packageRecordId 套票記錄 ID
 * @returns {Promise<{ok: boolean, msg?: string, record?: any}>}
 */
async function consumePackageLocally(patientId, packageRecordId) {
    try {
        const packages = await getPatientPackages(patientId);
        // 比對 ID 時統一轉為字串，避免類型不一致導致找不到套票
        const pkg = packages.find(p => String(p.id) === String(packageRecordId));
        if (!pkg) {
            return { ok: false, msg: '找不到套票' };
        }
        const now = new Date();
        const exp = new Date(pkg.expiresAt);
        if (now > exp) {
            return { ok: false, msg: '套票已過期' };
        }
        // 根據暫存變更計算可用的剩餘次數
        const delta = pendingPackageChanges
            .filter(change => {
                if (!change || typeof change.delta !== 'number') return false;
                return String(change.patientId) === String(patientId) && String(change.packageRecordId) === String(packageRecordId);
            })
            .reduce((sum, change) => sum + change.delta, 0);
        const availableUses = (pkg.remainingUses || 0) + delta;
        if (availableUses <= 0) {
            return { ok: false, msg: '套票已用完' };
        }
        // 回傳剩餘次數已減 1 的模擬記錄，用於更新 UI
        const updatedPackage = { ...pkg, remainingUses: availableUses - 1 };
        return { ok: true, record: updatedPackage };
    } catch (error) {
        console.error('本地使用套票錯誤:', error);
        return { ok: false, msg: '系統錯誤' };
    }
}

function formatPackageStatus(pkg) {
    const exp = new Date(pkg.expiresAt);
    const now = new Date();
    const daysLeft = Math.ceil((exp - now) / (1000*60*60*24));
    const expired = daysLeft < 0;
    return expired
      ? `已到期（${exp.toLocaleDateString('zh-TW')}）`
      : `剩餘 ${pkg.remainingUses}/${pkg.totalUses} 次 · ${exp.toLocaleDateString('zh-TW')} 到期（約 ${daysLeft} 天）`;
}

async function renderPatientPackages(patientId) {
    const container = document.getElementById('patientPackagesList');
    if (!container) return;
    
    try {
        const pkgs = await getPatientPackages(patientId);
        // 應用暫存變更，調整每個套票的剩餘次數
        const modifiedPkgs = pkgs.map(pkg => {
            const delta = pendingPackageChanges
                .filter(change => {
                    if (!change || typeof change.delta !== 'number') return false;
                    return String(change.patientId) === String(patientId) && String(change.packageRecordId) === String(pkg.id);
                })
                .reduce((sum, change) => sum + change.delta, 0);
            let newRemaining = (pkg.remainingUses || 0) + delta;
            // 約束 remainingUses 不小於 0，也不超過 totalUses（若 totalUses 定義）
            if (typeof pkg.totalUses === 'number') {
                newRemaining = Math.max(0, Math.min(pkg.totalUses, newRemaining));
            } else {
                newRemaining = Math.max(0, newRemaining);
            }
            return { ...pkg, remainingUses: newRemaining };
        });
        const activePkgs = modifiedPkgs.filter(p => p.remainingUses > 0).sort((a,b) => new Date(a.expiresAt) - new Date(b.expiresAt));
        if (activePkgs.length === 0) {
            container.innerHTML = '<div class="text-gray-500">無已購買的套票</div>';
            return;
        }
        container.innerHTML = activePkgs.map(pkg => {
            const exp = new Date(pkg.expiresAt);
            const now = new Date();
            const expired = now > exp;
            const disabled = expired || pkg.remainingUses <= 0;
            const badge =
              expired ? '<span class="ml-2 text-xs text-white px-2 py-0.5 rounded bg-red-500">已到期</span>' :
              (pkg.remainingUses <= 0 ? '<span class="ml-2 text-xs text-white px-2 py-0.5 rounded bg-gray-500">已用完</span>' : '');
            return `
      <div class="flex items-center justify-between bg-white border border-purple-200 rounded p-2">
        <div>
          <div class="font-medium text-purple-900">${pkg.name}${badge}</div>
          <div class="text-xs text-gray-600">${formatPackageStatus(pkg)}</div>
        </div>
        <button type="button" ${disabled ? 'disabled' : ''} 
          onclick="useOnePackage('${pkg.patientId}', '${pkg.id}')"
          class="px-3 py-1 rounded ${disabled ? 'bg-gray-300 text-gray-600' : 'bg-purple-600 text-white hover:bg-purple-700'}">
          使用一次
        </button>
      </div>
    `;
        }).join('');
    } catch (error) {
        console.error('渲染患者套票錯誤:', error);
        container.innerHTML = '<div class="text-red-500">載入套票資料失敗</div>';
    }
}

async function refreshPatientPackagesUI() {
    // 使用字串比較 ID，避免類型不一致導致匹配失敗
    const appointment = appointments.find(apt => apt && String(apt.id) === String(currentConsultingAppointmentId));
    if (!appointment) return;
    await renderPatientPackages(appointment.patientId);
}

async function useOnePackage(patientId, packageRecordId) {
    // 在按鈕上顯示讀取狀態：嘗試從事件對象取得當前按鈕，若無則從 DOM 查找
    let loadingButton = null;
    try {
        if (typeof event !== 'undefined' && event && event.currentTarget) {
            loadingButton = event.currentTarget;
        }
    } catch (_e) {}
    if (!loadingButton) {
        try {
            // 透過 onclick 屬性匹配對應按鈕（使用模板字串避免引號問題）
            const selector = `button[onclick="useOnePackage('${patientId}', '${packageRecordId}')"]`;
            loadingButton = document.querySelector(selector);
        } catch (_e) {
            loadingButton = null;
        }
    }
    if (loadingButton) {
        setButtonLoading(loadingButton, '處理中...');
    }
    try {
        // 僅在本地消耗套票次數，不立即同步到資料庫
        const res = await consumePackageLocally(patientId, packageRecordId);
        if (!res.ok) {
            showToast(res.msg || '套票不可用', 'warning');
            return;
        }
        const usedName = `${res.record.name} (使用套票)`;
        selectedBillingItems.push({
            id: `use-${res.record.id}-${Date.now()}`,
            name: usedName,
            category: 'packageUse',
            price: 0,
            unit: '次',
            description: '套票抵扣一次',
            quantity: 1,
            // 套票使用不參與折扣
            includedInDiscount: false,
            // 以字串保存 patientId 及 packageRecordId，避免類型不一致導致匹配錯誤
            patientId: patientId !== undefined && patientId !== null ? String(patientId) : '',
            packageRecordId: res.record && res.record.id ? String(res.record.id) : ''
        });
        // 記錄本次套票消耗，以便取消診症時回復。此處 delta 設為 -1 表示減少一次。
        try {
            // 使用 res.record.id 來記錄套票變更，避免因外部傳入的 packageRecordId 與實際套票 ID 不一致
            // 導致之後退回套票時發生錯誤或套票錯亂的情況。
            pendingPackageChanges.push({
                patientId: patientId !== undefined && patientId !== null ? String(patientId) : '',
                packageRecordId: res.record && res.record.id ? String(res.record.id) : String(packageRecordId),
                delta: -1
            });
        } catch (_e) {}
        updateBillingDisplay();
        await refreshPatientPackagesUI();
        showToast(`已使用套票：${res.record.name}，剩餘 ${res.record.remainingUses} 次`, 'success');
    } catch (error) {
        console.error('使用套票時發生錯誤:', error);
        showToast('使用套票時發生錯誤', 'error');
    } finally {
        if (loadingButton) {
            clearButtonLoading(loadingButton);
        }
    }
}

async function undoPackageUse(patientId, packageRecordId, usageItemId) {
    // 先取得觸發按鈕：優先使用事件目標，其次透過 DOM 查找
    let loadingButton = null;
    try {
        if (typeof event !== 'undefined' && event && event.currentTarget) {
            loadingButton = event.currentTarget;
        }
    } catch (_e) {}
    if (!loadingButton) {
        try {
            // 使用部分匹配，以 usageItemId 為關鍵字查找對應的取消按鈕
            loadingButton = document.querySelector(`button[onclick*="undoPackageUse("][onclick*="'${usageItemId}'"]`);
        } catch (_e) {
            loadingButton = null;
        }
    }
    if (loadingButton) {
        setButtonLoading(loadingButton, '處理中...');
    }
    try {
        // 等待 Firebase 數據管理器準備好，避免在初始化過程中無法更新套票
        if (!window.firebaseDataManager || !window.firebaseDataManager.isReady) {
            for (let i = 0; i < 100 && (!window.firebaseDataManager || !window.firebaseDataManager.isReady); i++) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }
        // 先取得對應的項目
        const item = selectedBillingItems.find(it => it.id === usageItemId);
        if (!item) {
            // 找不到項目，可能已被刪除
            showToast('找不到套票使用項目', 'warning');
            return;
        }
        // 推斷病人 ID：優先使用項目中的 patientId，其次使用傳入的參數，再退而從當前掛號推斷
        let resolvedPatientId = item.patientId || patientId;
        if (!resolvedPatientId) {
            try {
                if (typeof currentConsultingAppointmentId !== 'undefined' && Array.isArray(appointments)) {
                    // 使用字串比較 ID，避免類型不一致導致匹配失敗
                    const currAppt = appointments.find(appt => appt && String(appt.id) === String(currentConsultingAppointmentId));
                    if (currAppt) {
                        resolvedPatientId = currAppt.patientId;
                    }
                }
            } catch (e) {
                // 忽略錯誤，保持 resolvedPatientId 為 undefined
            }
        }
        // 嘗試恢復缺失的套票 meta，以便舊病歷也能取消使用
        try {
            // restorePackageUseMeta 會根據 resolvedPatientId 嘗試為所有缺失的套票使用項目補全 patientId 和 packageRecordId
            if (typeof restorePackageUseMeta === 'function' && resolvedPatientId) {
                await restorePackageUseMeta(resolvedPatientId);
            }
        } catch (e) {
            console.error('恢復套票使用 meta 錯誤:', e);
        }
        // 若 patientId 或 packageRecordId 缺失，嘗試使用傳入的參數填充
        if (!item.patientId && resolvedPatientId) {
            item.patientId = resolvedPatientId;
        }
        if (!item.packageRecordId && packageRecordId) {
            item.packageRecordId = packageRecordId;
        }
        // 如果成功補齊 meta，取消歷史標記
        if (item.isHistorical && item.patientId && item.packageRecordId) {
            item.isHistorical = false;
        }
        // 如果仍然缺少 meta，嘗試根據名稱匹配患者的套票以恢復 packageRecordId
        // 先使用傳入的 patientId 參數填補 item.patientId（若缺失）
        if (!item.patientId && resolvedPatientId) {
            item.patientId = resolvedPatientId;
        }
        // 若缺少 packageRecordId，嘗試透過名稱匹配
        if (!item.packageRecordId && item.patientId) {
            try {
                const pkgsForUndo = await getPatientPackages(item.patientId);
                // 從品項名稱中移除「(使用套票)」或「（使用套票）」，並處理可能出現的全形或半形括號與額外空格
                let baseName = item.name || '';
                baseName = baseName
                    // 移除括號包裹的使用套票字串，例如「推拿療程 (使用套票)」或「推拿療程（使用套票）」
                    .replace(/\s*[\(（]\s*使用套票\s*[\)）]\s*/g, '')
                    // 移除未被括號包裹的「使用套票」字串
                    .replace(/\s*使用套票\s*/g, '')
                    .trim();
                // 依名稱完全匹配當前病人的套票
                const candidatesForUndo = pkgsForUndo.filter(p => p.name === baseName);
                if (candidatesForUndo.length === 1) {
                    item.packageRecordId = candidatesForUndo[0].id;
                    item.isHistorical = false;
                } else if (candidatesForUndo.length > 1) {
                    // 如果有多張同名套票，選擇使用次數較多的那一張；若使用次數相同，則選擇購買時間較早的
                    candidatesForUndo.sort((a, b) => {
                        const usedA = (a.totalUses || 0) - (a.remainingUses || 0);
                        const usedB = (b.totalUses || 0) - (b.remainingUses || 0);
                        if (usedA !== usedB) {
                            // 使用次數多的排前面
                            return usedB - usedA;
                        }
                        // 使用次數相同，按購買日期早的排前面
                        const pa = a.purchasedAt ? new Date(a.purchasedAt).getTime() : 0;
                        const pb = b.purchasedAt ? new Date(b.purchasedAt).getTime() : 0;
                        if (pa !== pb) {
                            return pa - pb;
                        }
                        // 若購買日期也相同，使用 ID 的字典序進行最後排序，確保 deterministic
                        if (a.id && b.id) {
                            return String(a.id).localeCompare(String(b.id));
                        }
                        return 0;
                    });
                    const chosenPkg = candidatesForUndo[0];
                    item.packageRecordId = chosenPkg.id;
                    item.isHistorical = false;
                }
            } catch (e) {
                console.error('套票名稱匹配錯誤:', e);
            }
        }
        // 如果嘗試補全後仍缺少 meta，則移除項目但不嘗試退回次數
        if (!item.patientId || !item.packageRecordId) {
            selectedBillingItems = selectedBillingItems.filter(it => it.id !== usageItemId);
            updateBillingDisplay();
            showToast('已移除套票使用項目，未退回次數', 'info');
            return;
        }
        // 以項目中的 packageRecordId 為準
        const pkgId = item.packageRecordId;
        try {
            // 取得病人的套票，如果沒有取得則重試一次
            const packages = await getPatientPackages(item.patientId);
            // 比較套票 ID 時統一轉為字串，以避免類型不一致導致匹配失敗
            const pkg = packages.find(p => String(p.id) === String(pkgId));
            if (!pkg) {
                // 找不到對應的套票，直接移除項目
                selectedBillingItems = selectedBillingItems.filter(it => it.id !== usageItemId);
                updateBillingDisplay();
                showToast('找不到對應的套票，已移除項目', 'warning');
                return;
            }
            /*
             * 不立即更新資料庫，僅在本地回復套票使用。
             * 將剩餘次數增加 1 並更新暫存變更，保存病歷時再同步到資料庫。
             */
            {
                // 如果套票使用項目的數量大於 1，代表當次診症已抵扣多次。
                // 此時取消使用只應減少數量並退回一次，並保留項目；
                // 若數量為 1，則從列表中移除該項目。
                const currentItem = selectedBillingItems.find(it => it.id === usageItemId);
                if (currentItem && typeof currentItem.quantity === 'number' && currentItem.quantity > 1) {
                    currentItem.quantity -= 1;
                } else {
                    selectedBillingItems = selectedBillingItems.filter(it => it.id !== usageItemId);
                }
                // 在 UI 更新前先記錄本次套票退回，以便 renderPatientPackages 能正確反映新的剩餘次數
                try {
                    const undoPatientIdRaw = (item && item.patientId) ? item.patientId : resolvedPatientId;
                    // 在暫存變更中統一使用字串表示 ID
                    const undoPatientIdStr = (undoPatientIdRaw !== undefined && undoPatientIdRaw !== null) ? String(undoPatientIdRaw) : '';
                    const pkgIdStr = (pkgId !== undefined && pkgId !== null) ? String(pkgId) : '';
                    pendingPackageChanges.push({
                        patientId: undoPatientIdStr,
                        packageRecordId: pkgIdStr,
                        delta: +1
                    });
                } catch (_e) {}
                // 更新收費項目與套票列表顯示
                updateBillingDisplay();
                await refreshPatientPackagesUI();
                showToast('已取消本次套票使用，次數已退回', 'success');
            }
        } catch (error) {
            console.error('取消套票使用錯誤:', error);
            showToast('取消套票使用時發生錯誤', 'error');
        }
    } finally {
        if (loadingButton) {
            clearButtonLoading(loadingButton);
        }
    }
}

// 嘗試為缺失 meta 的套票使用項目補全 patientId 與 packageRecordId
// 當舊病歷無法取消套票時，會嘗試透過病人當前的套票記錄推斷對應的套票ID
async function restorePackageUseMeta(patientId) {
    try {
        // 取得病人的所有套票
        const packages = await getPatientPackages(patientId);
        // 遍歷已選擇的收費項目，尋找缺乏 meta 的套票使用項目
        selectedBillingItems.forEach(item => {
            // 判斷是否為套票抵扣項目：品項類別為 packageUse 或名稱含有「使用套票」
            const isPackageUse = item && (item.category === 'packageUse' || (item.name && item.name.includes('使用套票')));
                if (isPackageUse && (item.isHistorical || !item.patientId || !item.packageRecordId)) {
                // 即便標記為歷史記錄，也嘗試恢復 meta 以便可以取消使用
                
                // 補充病人ID，統一轉為字串
                item.patientId = (patientId !== undefined && patientId !== null) ? String(patientId) : '';
                // 從名稱中移除後綴以找出套票名稱，例如「推拿療程 (使用套票)」或「推拿療程（使用套票）」→「推拿療程」
                // 使用正則處理全形、半形括號及可能的空格，並移除未被括號包裹的「使用套票」字樣
                let baseName = item.name || '';
                baseName = baseName
                    .replace(/\s*[\(（]\s*使用套票\s*[\)）]\s*/g, '')
                    .replace(/\s*使用套票\s*/g, '')
                    .trim();
                // 在病人的套票中尋找名稱完全匹配的項目
                const candidates = packages.filter(p => p.name === baseName);
                if (candidates.length === 1) {
                    // 將匹配到的套票 ID 轉為字串
                    item.packageRecordId = (candidates[0] && candidates[0].id) ? String(candidates[0].id) : '';
                    // 找到對應的套票，取消歷史標記
                    item.isHistorical = false;
                } else if (candidates.length > 1) {
                    // 如果有多個同名套票，選擇使用次數較多的那一個；若使用次數相同，則選擇購買時間較早的
                    candidates.sort((a, b) => {
                        const usedA = (a.totalUses || 0) - (a.remainingUses || 0);
                        const usedB = (b.totalUses || 0) - (b.remainingUses || 0);
                        if (usedA !== usedB) {
                            // 使用次數多的排前面
                            return usedB - usedA;
                        }
                        // 使用次數相同，按購買日期早的排前面
                        const pa = a.purchasedAt ? new Date(a.purchasedAt).getTime() : 0;
                        const pb = b.purchasedAt ? new Date(b.purchasedAt).getTime() : 0;
                        if (pa !== pb) {
                            return pa - pb;
                        }
                        // 若購買日期也相同，使用 ID 的字典序進行最後排序，確保 deterministic
                        if (a.id && b.id) {
                            return String(a.id).localeCompare(String(b.id));
                        }
                        return 0;
                    });
                    const chosen = candidates[0];
                    // 將匹配到的套票 ID 轉為字串
                    item.packageRecordId = (chosen && chosen.id) ? String(chosen.id) : '';
                    // 找到對應的套票，取消歷史標記
                    item.isHistorical = false;
                } else {
                    // 找不到匹配的套票，保持歷史記錄狀態
                    item.isHistorical = true;
                }
            }
        });
    } catch (error) {
        console.error('restorePackageUseMeta 錯誤:', error);
    }
}
// 將函式暴露到全域以便其他部分調用
window.restorePackageUseMeta = restorePackageUseMeta;
// Firebase 數據管理系統
class FirebaseDataManager {
    constructor() {
        this.isReady = false;
        this.initializeWhenReady();
    }

    async initializeWhenReady() {
        // 等待 Firebase 初始化，使用通用等待函式
        await waitForFirebase();
        this.isReady = true;
        console.log('Firebase 數據管理器已準備就緒');
    }

    // 病人數據管理
    async addPatient(patientData) {
        if (!this.isReady) {
            showToast('數據管理器尚未準備就緒', 'error');
            return { success: false };
        }

        try {
            const docRef = await window.firebase.addDoc(
                window.firebase.collection(window.firebase.db, 'patients'),
                {
                    ...patientData,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    createdBy: currentUser || 'system'
                }
            );
            
            console.log('病人數據已添加到 Firebase:', docRef.id);
            // 新增病人後清除緩存，讓下一次讀取時重新載入
            this.patientsCache = null;
            return { success: true, id: docRef.id };
        } catch (error) {
            console.error('添加病人數據失敗:', error);
            showToast('保存病人數據失敗', 'error');
            return { success: false, error: error.message };
        }
    }

    async getPatients() {
        if (!this.isReady) return { success: false, data: [] };

        try {
            const querySnapshot = await window.firebase.getDocs(
                window.firebase.collection(window.firebase.db, 'patients')
            );
            
            const patients = [];
            querySnapshot.forEach((doc) => {
                patients.push({ id: doc.id, ...doc.data() });
            });
            
            console.log('已從 Firebase 讀取病人數據:', patients.length, '筆');
            return { success: true, data: patients };
        } catch (error) {
            console.error('讀取病人數據失敗:', error);
            return { success: false, data: [] };
        }
    }

    async updatePatient(patientId, patientData) {
        try {
            await window.firebase.updateDoc(
                window.firebase.doc(window.firebase.db, 'patients', patientId),
                {
                    ...patientData,
                    updatedAt: new Date(),
                    updatedBy: currentUser || 'system'
                }
            );
            // 更新病人資料後清除緩存，讓下一次讀取時重新載入
            this.patientsCache = null;
            return { success: true };
        } catch (error) {
            console.error('更新病人數據失敗:', error);
            return { success: false, error: error.message };
        }
    }

    async deletePatient(patientId) {
        try {
            await window.firebase.deleteDoc(
                window.firebase.doc(window.firebase.db, 'patients', patientId)
            );
            // 刪除病人後清除緩存
            this.patientsCache = null;
            return { success: true };
        } catch (error) {
            console.error('刪除病人數據失敗:', error);
            return { success: false, error: error.message };
        }
    }
// 診症記錄管理
    async addConsultation(consultationData) {
        if (!this.isReady) {
            showToast('數據管理器尚未準備就緒', 'error');
            return { success: false };
        }

        try {
            // When creating a new consultation record we only set the createdAt timestamp
            // and createdBy. The updatedAt field should be reserved for subsequent edits.
            const docRef = await window.firebase.addDoc(
                window.firebase.collection(window.firebase.db, 'consultations'),
                {
                    ...consultationData,
                    createdAt: new Date(),
                    createdBy: currentUser
                }
            );
            
            console.log('診症記錄已添加到 Firebase:', docRef.id);
            // 新增診症後清除緩存
            this.consultationsCache = null;
            return { success: true, id: docRef.id };
        } catch (error) {
            console.error('添加診症記錄失敗:', error);
            showToast('保存診症記錄失敗', 'error');
            return { success: false, error: error.message };
        }
    }

    async getConsultations() {
        if (!this.isReady) return { success: false, data: [] };

        try {
            const querySnapshot = await window.firebase.getDocs(
                window.firebase.collection(window.firebase.db, 'consultations')
            );
            
            const consultations = [];
            querySnapshot.forEach((doc) => {
                consultations.push({ id: doc.id, ...doc.data() });
            });
            
            console.log('已從 Firebase 讀取診症記錄:', consultations.length, '筆');
            return { success: true, data: consultations };
        } catch (error) {
            console.error('讀取診症記錄失敗:', error);
            return { success: false, data: [] };
        }
    }

    async updateConsultation(consultationId, consultationData) {
        try {
            await window.firebase.updateDoc(
                window.firebase.doc(window.firebase.db, 'consultations', consultationId),
                {
                    ...consultationData,
                    updatedAt: new Date(),
                    updatedBy: currentUser
                }
            );
            // 更新診症後清除緩存
            this.consultationsCache = null;
            return { success: true };
        } catch (error) {
            console.error('更新診症記錄失敗:', error);
            return { success: false, error: error.message };
        }
    }

    async getPatientConsultations(patientId) {
        if (!this.isReady) return { success: false, data: [] };

        try {
            const allConsultations = await this.getConsultations();
            if (!allConsultations.success) {
                return { success: false, data: [] };
            }

            const patientConsultations = allConsultations.data
                .filter(consultation => String(consultation.patientId) === String(patientId))
                .sort((a, b) => {
                    const dateA = a.date ? new Date(a.date.seconds * 1000) : new Date(a.createdAt.seconds * 1000);
                    const dateB = b.date ? new Date(b.date.seconds * 1000) : new Date(b.createdAt.seconds * 1000);
                    return dateB - dateA; // 最新的在前面
                });

            return { success: true, data: patientConsultations };
        } catch (error) {
            console.error('讀取病人診症記錄失敗:', error);
            return { success: false, data: [] };
        }
    }
    // 用戶數據管理
    async addUser(userData) {
        if (!this.isReady) {
            showToast('數據管理器尚未準備就緒', 'error');
            return { success: false };
        }

        try {
            const docRef = await window.firebase.addDoc(
                window.firebase.collection(window.firebase.db, 'users'),
                {
                    ...userData,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    createdBy: currentUser || 'system'
                }
            );
            
            console.log('用戶數據已添加到 Firebase:', docRef.id);
            return { success: true, id: docRef.id };
        } catch (error) {
            console.error('添加用戶數據失敗:', error);
            showToast('保存用戶數據失敗', 'error');
            return { success: false, error: error.message };
        }
    }

    async getUsers() {
        if (!this.isReady) return { success: false, data: [] };

        try {
            const querySnapshot = await window.firebase.getDocs(
                window.firebase.collection(window.firebase.db, 'users')
            );
            
            const users = [];
            querySnapshot.forEach((doc) => {
                users.push({ id: doc.id, ...doc.data() });
            });
            
            console.log('已從 Firebase 讀取用戶數據:', users.length, '筆');
            return { success: true, data: users };
        } catch (error) {
            console.error('讀取用戶數據失敗:', error);
            return { success: false, data: [] };
        }
    }

    async updateUser(userId, userData) {
        try {
            await window.firebase.updateDoc(
                window.firebase.doc(window.firebase.db, 'users', userId),
                {
                    ...userData,
                    updatedAt: new Date(),
                    updatedBy: currentUser || 'system'
                }
            );
            // 更新用戶後清除用戶緩存
            this.usersCache = null;
            return { success: true };
        } catch (error) {
            console.error('更新用戶數據失敗:', error);
            return { success: false, error: error.message };
        }
    }

    async deleteUser(userId) {
        try {
            await window.firebase.deleteDoc(
                window.firebase.doc(window.firebase.db, 'users', userId)
            );
            // 刪除用戶後清除緩存
            this.usersCache = null;
            return { success: true };
        } catch (error) {
            console.error('刪除用戶數據失敗:', error);
            return { success: false, error: error.message };
        }
    }

    // 掛號資料管理（使用 Realtime Database）
    async addAppointment(appointmentData) {
        if (!this.isReady) {
            showToast('數據管理器尚未準備就緒', 'error');
            return { success: false };
        }
        try {
            const id = appointmentData.id;
            // 將掛號資料存入 Realtime Database，以掛號 ID 作為鍵
            await window.firebase.set(
                window.firebase.ref(window.firebase.rtdb, 'appointments/' + id),
                { ...appointmentData }
            );
            console.log('掛號資料已添加到 Firebase Realtime Database:', id);
            return { success: true, id: id };
        } catch (error) {
            console.error('添加掛號數據失敗:', error);
            showToast('保存掛號數據失敗', 'error');
            return { success: false, error: error.message };
        }
    }

    async getAppointments() {
        if (!this.isReady) return { success: false, data: [] };
        try {
            const snapshot = await window.firebase.get(
                window.firebase.ref(window.firebase.rtdb, 'appointments')
            );
            const data = snapshot.val() || {};
            const appointments = Object.keys(data).map(key => {
                return { id: key, ...data[key] };
            });
            console.log('已從 Firebase Realtime Database 讀取掛號數據:', appointments.length, '筆');
            return { success: true, data: appointments };
        } catch (error) {
            console.error('讀取掛號數據失敗:', error);
            return { success: false, data: [] };
        }
    }

    async updateAppointment(id, appointmentData) {
        try {
            await window.firebase.update(
                window.firebase.ref(window.firebase.rtdb, 'appointments/' + id),
                { ...appointmentData }
            );
            return { success: true };
        } catch (error) {
            console.error('更新掛號數據失敗:', error);
            return { success: false, error: error.message };
        }
    }

    async deleteAppointment(id) {
        try {
            await window.firebase.remove(
                window.firebase.ref(window.firebase.rtdb, 'appointments/' + id)
            );
            return { success: true };
        } catch (error) {
            console.error('刪除掛號數據失敗:', error);
            return { success: false, error: error.message };
        }
    }
// 患者套票數據管理
    async addPatientPackage(packageData) {
        if (!this.isReady) {
            showToast('數據管理器尚未準備就緒', 'error');
            return { success: false };
        }

        try {
            const docRef = await window.firebase.addDoc(
                window.firebase.collection(window.firebase.db, 'patientPackages'),
                {
                    ...packageData,
                    createdAt: new Date(),
                    createdBy: currentUser || 'system'
                }
            );
            
            console.log('患者套票已添加到 Firebase:', docRef.id);
            return { success: true, id: docRef.id };
        } catch (error) {
            console.error('添加患者套票失敗:', error);
            return { success: false, error: error.message };
        }
    }

    async getPatientPackages(patientId) {
        if (!this.isReady) return { success: false, data: [] };

        try {
            const querySnapshot = await window.firebase.getDocs(
                window.firebase.collection(window.firebase.db, 'patientPackages')
            );
            
            const packages = [];
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                // 以字串比較避免 patientId 型別不一致導致匹配失敗
                if (String(data.patientId) === String(patientId)) {
                    packages.push({ id: doc.id, ...data });
                }
            });
            
            return { success: true, data: packages };
        } catch (error) {
            console.error('讀取患者套票失敗:', error);
            return { success: false, data: [] };
        }
    }

    async updatePatientPackage(packageId, packageData) {
        try {
            await window.firebase.updateDoc(
                window.firebase.doc(window.firebase.db, 'patientPackages', packageId),
                {
                    ...packageData,
                    updatedAt: new Date(),
                    updatedBy: currentUser || 'system'
                }
            );
            return { success: true };
        } catch (error) {
            console.error('更新患者套票失敗:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 新增一筆問診資料。
     * 此方法主要用於後端或其他管理介面，如在問診表單頁面可直接使用 Firebase API。
     *
     * @param {string} patientName 病人姓名
     * @param {Object} data 問診資料內容
     * @returns {Promise<{success: boolean, id?: string, error?: string}>}
     */
    async addInquiryRecord(patientName, data) {
        if (!this.isReady) {
            showToast('數據管理器尚未準備就緒', 'error');
            return { success: false };
        }
        try {
            const now = new Date();
            const expireDate = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 小時後過期
            const docRef = await window.firebase.addDoc(
                window.firebase.collection(window.firebase.db, 'inquiries'),
                {
                    patientName: patientName,
                    data: data,
                    createdAt: now,
                    expireAt: expireDate
                }
            );
            return { success: true, id: docRef.id };
        } catch (error) {
            console.error('添加問診資料失敗:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 讀取指定病人姓名的問診資料。
     * 僅返回尚未過期的資料，並依照創建時間降序排列。
     *
     * @param {string} patientName 病人姓名
     * @returns {Promise<{success: boolean, data: Array}>}
     */
    async getInquiryRecords(patientName) {
        if (!this.isReady) return { success: false, data: [] };
        try {
            let baseRef = window.firebase.collection(window.firebase.db, 'inquiries');
            // 若有提供 patientName，則使用 where 條件
            let q;
            if (patientName) {
                q = window.firebase.query(
                    baseRef,
                    window.firebase.where('patientName', '==', patientName),
                    window.firebase.orderBy('createdAt', 'desc')
                );
            } else {
                q = window.firebase.query(baseRef, window.firebase.orderBy('createdAt', 'desc'));
            }
            const snapshot = await window.firebase.getDocs(q);
            const now = new Date();
            const records = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                let expireDate = null;
                if (data.expireAt) {
                    if (data.expireAt.seconds !== undefined) {
                        expireDate = new Date(data.expireAt.seconds * 1000);
                    } else {
                        expireDate = new Date(data.expireAt);
                    }
                }
                // 若無 expireAt 或未過期則加入
                if (!expireDate || expireDate >= now) {
                    records.push({ id: doc.id, ...data });
                }
            });
            return { success: true, data: records };
        } catch (error) {
            console.error('讀取問診資料失敗:', error);
            return { success: false, data: [] };
        }
    }

    /**
     * 刪除指定問診資料。
     *
     * @param {string} inquiryId 問診紀錄 ID
     */
    async deleteInquiryRecord(inquiryId) {
        try {
            await window.firebase.deleteDoc(
                window.firebase.doc(window.firebase.db, 'inquiries', inquiryId)
            );
            return { success: true };
        } catch (error) {
            console.error('刪除問診資料失敗:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 清除過期的問診資料。
     *
     * 此函式會遍歷 `inquiries` 集合，並刪除那些
     * `createdAt` 發生在今日 00:00 之前（即昨天或更早）的問診紀錄。
     * 若某筆記錄缺少 `createdAt` 欄位，則會改用 `expireAt` 作為判斷依據。
     * 因為系統設計與 Realtime Database 的掛號清理邏輯一致，
     * 只保留今天及未來的資料，所有舊資料將被移除。
     *
     * @returns {Promise<{success: boolean, deletedCount?: number}>}
     */
    async clearOldInquiries() {
        if (!this.isReady) return { success: false };
        try {
            const snapshot = await window.firebase.getDocs(
                window.firebase.collection(window.firebase.db, 'inquiries')
            );
            const now = new Date();
            // 計算今日凌晨時間（本地時區）。任何發生在此時間之前的紀錄將被視為過期。
            const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const deletions = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                let createdDate = null;
                // 解析 createdAt。Firestore 的 Timestamp 物件包含 seconds 屬性，其他情況視為 ISO 字串。
                if (data.createdAt) {
                    if (data.createdAt.seconds !== undefined) {
                        createdDate = new Date(data.createdAt.seconds * 1000);
                    } else {
                        createdDate = new Date(data.createdAt);
                    }
                }
                // 若缺少 createdAt，則使用 expireAt 作為備援依據
                let targetDate = createdDate;
                if (!targetDate && data.expireAt) {
                    if (data.expireAt.seconds !== undefined) {
                        targetDate = new Date(data.expireAt.seconds * 1000);
                    } else {
                        targetDate = new Date(data.expireAt);
                    }
                }
                // 如果目標日期存在且早於今日凌晨，則視為過期，待刪除
                if (targetDate && targetDate < startOfToday) {
                    deletions.push(window.firebase.deleteDoc(
                        window.firebase.doc(window.firebase.db, 'inquiries', doc.id)
                    ));
                }
            });
            let count = 0;
            if (deletions.length > 0) {
                await Promise.all(deletions);
                count = deletions.length;
            }
            return { success: true, deletedCount: count };
        } catch (error) {
            console.error('清除過期問診資料失敗:', error);
            return { success: false, error: error.message };
        }
    }
}

// 初始化數據管理器
let firebaseDataManager;
window.addEventListener('load', async () => {
    // 只初始化 FirebaseDataManager，避免在使用者登入前載入大量資料。
    firebaseDataManager = new FirebaseDataManager();
    window.firebaseDataManager = firebaseDataManager; // 全域使用
    // 等待管理器準備好再繼續，但不讀取資料，僅確保後續呼叫不失敗。
    while (!firebaseDataManager.isReady) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    // 移除系統載入時清除過期問診資料的邏輯，改為在使用者登入後執行。
    // 這是為了避免在未授權狀態下呼叫刪除資料而導致權限錯誤。

    // 設置定時任務：每日自動清理一次過期的問診資料，但僅在使用者已登入時執行
    try {
        const dayMs = 24 * 60 * 60 * 1000;
        setInterval(() => {
            try {
                // 確認使用者已登入（透過 Firebase auth 或本地 currentUserData）
                const userLoggedIn = (window.firebase && window.firebase.auth && window.firebase.auth.currentUser) ||
                                     (typeof currentUserData !== 'undefined' && currentUserData);
                if (userLoggedIn && firebaseDataManager && typeof firebaseDataManager.clearOldInquiries === 'function') {
                    firebaseDataManager.clearOldInquiries().catch(err => {
                        console.error('定時清理問診資料失敗:', err);
                    });
                }
            } catch (e) {
                console.error('定時調用清理問診資料時發生錯誤:', e);
            }
        }, dayMs);
    } catch (_e) {
        // 若無法設置定時任務則忽略
    }
});
        
// 初始化系統
document.addEventListener('DOMContentLoaded', function() {
    
    updateClinicSettingsDisplay();

    // 隱藏不再使用的中藥材及方劑欄位：性味、歸經、主治、用法
    ['herbNature', 'herbMeridian', 'herbIndications', 'formulaIndications', 'formulaUsage'].forEach(function(id) {
        const el = document.getElementById(id);
        if (el) {
            // 嘗試隱藏包含此輸入的父層容器（通常為欄位區塊）。
            const container = el.closest('div');
            if (container) {
                container.style.display = 'none';
            } else {
                el.style.display = 'none';
            }
        }
    });
    
    
    // 自動聚焦到電子郵件輸入框
    const usernameInput = document.getElementById('mainLoginUsername');
    if (usernameInput) {
        setTimeout(() => {
            usernameInput.focus();
        }, 100);
    }

    // 以下事件綁定已從先前重複的 DOMContentLoaded 事件合併至此處。
    // 針對收費類別的「套票」選項，切換對應的欄位顯示。
    const categorySelect = document.getElementById('billingItemCategory');
    if (categorySelect) {
        categorySelect.addEventListener('change', function() {
            const isPackage = this.value === 'package';
            const pf = document.getElementById('packageFields');
            if (pf) {
                pf.classList.toggle('hidden', !isPackage);
            }
        });
    }

    // 病人管理搜尋欄位：輸入時重新載入病人列表
    const searchInput = document.getElementById('searchPatient');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            loadPatientList();
        });
    }

    // 當選擇問診資料時，自動隱藏主訴症狀輸入欄位。
    // 由於主訴欄位與其標籤位於同一父層 <div>，使用 parentElement/closest('div')
    // 將容器切換 display。當問診資料未選擇時則顯示主訴欄位。
    const inquirySelectElem = document.getElementById('inquirySelect');
    const quickChiefComplaintElem = document.getElementById('quickChiefComplaint');
    if (inquirySelectElem && quickChiefComplaintElem) {
        // 嘗試取得最近的 div 作為容器，如果找不到則退而求其次使用 parentElement
        const complaintContainer = quickChiefComplaintElem.closest('div') || quickChiefComplaintElem.parentElement;
        function toggleChiefComplaintVisibility() {
            try {
                // 根據問診下拉選擇值決定顯示或隱藏
                if (inquirySelectElem.value && inquirySelectElem.value !== '') {
                    // 已選擇問診資料，隱藏主訴欄位
                    complaintContainer.style.display = 'none';
                } else {
                    // 無問診資料或清空選擇，顯示主訴欄位
                    complaintContainer.style.display = '';
                }
            } catch (_e) {
                // 若容器不存在或遇到錯誤則忽略，避免影響其他邏輯
            }
        }
        // 綁定下拉變更事件
        inquirySelectElem.addEventListener('change', toggleChiefComplaintVisibility);
        // 將函式掛到全域，供其他函式（例如清空表單時）呼叫
        window.toggleChiefComplaintVisibility = toggleChiefComplaintVisibility;
        // 根據預設值初始化顯示狀態
        toggleChiefComplaintVisibility();
    }

    /*
     * 登入頁與側邊欄事件綁定
     * 為了避免在 HTML 中使用 inline 事件處理器，我們在 DOMContentLoaded 之後
     * 使用 addEventListener 綁定對應的事件。這些元素在系統各處使用，透過
     * id 或 data-* 屬性取得後綁定事件處理函式。
     */
    try {
        // 登入按鈕：點擊觸發登入
        const loginBtn = document.getElementById('loginButton');
        if (loginBtn) {
            loginBtn.addEventListener('click', function () {
                try {
                    attemptMainLogin();
                } catch (e) {
                    console.error('登入按鈕事件錯誤:', e);
                }
            });
        }

        // 登入頁輸入框：按下 Enter 鍵觸發登入
        const loginEmailInput = document.querySelector('[data-login-email]');
        const loginPasswordInput = document.querySelector('[data-login-password]');
        const loginKeyListener = function (ev) {
            if (ev && ev.key === 'Enter') {
                try {
                    attemptMainLogin();
                } catch (e) {
                    console.error('登入輸入框鍵盤事件錯誤:', e);
                }
            }
        };
        if (loginEmailInput) {
            loginEmailInput.addEventListener('keypress', loginKeyListener);
        }
        if (loginPasswordInput) {
            loginPasswordInput.addEventListener('keypress', loginKeyListener);
        }

        // 側邊欄開關按鈕與遮罩：點擊時切換側邊欄狀態
        const openSidebarBtn = document.getElementById('openSidebarButton');
        if (openSidebarBtn) {
            openSidebarBtn.addEventListener('click', function () {
                try {
                    toggleSidebar();
                } catch (e) {
                    console.error('開啟側邊欄按鈕事件錯誤:', e);
                }
            });
        }
        const closeSidebarBtn = document.getElementById('closeSidebarButton');
        if (closeSidebarBtn) {
            closeSidebarBtn.addEventListener('click', function () {
                try {
                    toggleSidebar();
                } catch (e) {
                    console.error('關閉側邊欄按鈕事件錯誤:', e);
                }
            });
        }
        const sidebarOverlay = document.getElementById('sidebarOverlay');
        if (sidebarOverlay) {
            sidebarOverlay.addEventListener('click', function () {
                try {
                    toggleSidebar();
                } catch (e) {
                    console.error('點擊遮罩錯誤:', e);
                }
            });
        }

        // 登出按鈕（頂部與側邊欄）：點擊後調用 logout
        const logoutBtn = document.getElementById('logoutButton');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', function () {
                try {
                    logout();
                } catch (e) {
                    console.error('頂部登出按鈕事件錯誤:', e);
                }
            });
        }
        const sidebarLogoutBtn = document.getElementById('sidebarLogoutButton');
        if (sidebarLogoutBtn) {
            sidebarLogoutBtn.addEventListener('click', function () {
                try {
                    logout();
                } catch (e) {
                    console.error('側邊欄登出按鈕事件錯誤:', e);
                }
            });
        }

        // 病人資料管理：新增/隱藏/儲存事件綁定
        // 新增病人按鈕
        const showAddPatientBtn = document.getElementById('showAddPatientButton');
        if (showAddPatientBtn) {
            showAddPatientBtn.addEventListener('click', function () {
                try {
                    showAddPatientForm();
                } catch (e) {
                    console.error('顯示新增病人表單錯誤:', e);
                }
            });
        }
        // 關閉新增病人表單（標題列叉號）
        const hideAddPatientBtnTop = document.getElementById('hideAddPatientButtonTop');
        if (hideAddPatientBtnTop) {
            hideAddPatientBtnTop.addEventListener('click', function () {
                try {
                    hideAddPatientForm();
                } catch (e) {
                    console.error('關閉新增病人表單（標題）錯誤:', e);
                }
            });
        }
        // 取消按鈕：隱藏新增病人表單
        const cancelAddPatientBtn = document.getElementById('cancelAddPatientButton');
        if (cancelAddPatientBtn) {
            cancelAddPatientBtn.addEventListener('click', function () {
                try {
                    hideAddPatientForm();
                } catch (e) {
                    console.error('取消新增病人表單錯誤:', e);
                }
            });
        }
        // 儲存病人按鈕：提交表單
        const savePatientBtn = document.getElementById('savePatientButton');
        if (savePatientBtn) {
            savePatientBtn.addEventListener('click', function () {
                try {
                    savePatient();
                } catch (e) {
                    console.error('儲存病人資料錯誤:', e);
                }
            });
        }

        /**
         * 一次性移除頁面上所有內嵌的 onclick/onchange 事件處理器，改以透過
         * addEventListener 綁定。這樣可避免 HTML 中的 inline 事件污染
         * 全域命名空間，也方便後續維護與重構。此邏輯將在頁面載入時
         * 掃描帶有 onclick 或 onchange 屬性的元素，解析其中的函式名稱
         * 與參數，並以事件委派的方式在相同元素上綁定對應的事件處理
         * 函式。原始的 onclick/onchange 屬性會被移除，避免重複執行。
         */
        (function initInlineEventHandlers() {
            /**
             * 將字串形式的參數列表轉換為實際的引數陣列。
             * 此函式會特別處理字面值 'event' 與 'this'：
             *   - 'event' 會替換為觸發事件的物件
             *   - 'this'  會替換為綁定的 DOM 元素
             * 其餘字串會直接以 JavaScript 字面量解析（例如數字或帶引號的字串）。
             * @param {string} argsStr 原始參數字串，例如 "-1, 'herbs'"
             * @param {Event} event 事件對象
             * @param {HTMLElement} el 觸發事件的元素
             * @returns {Array} 解析後的引數陣列
             */
            function parseArgs(argsStr, event, el) {
                const trimmed = argsStr.trim();
                if (!trimmed) {
                    return [];
                }
                // 先替換 'event' 與 'this' 為特殊標記，避免 eval 時當作變數解析
                const replaced = trimmed
                    .replace(/\bevent\b/g, '__EVENT__')
                    .replace(/\bthis\b/g, '__THIS__');
                let args;
                try {
                    /*
                     * 直接 eval 包含 __EVENT__/__THIS__ 標記的字串會導致 ReferenceError，
                     * 因為這些標記並非實際定義的變數。為了避免此問題，先將這些標記
                     * 轉換成帶引號的字串，讓 eval 得到的是字串占位符陣列，再於後續
                     * 將其映射回正確的 event 或元素物件。這樣能避免在開發階段於控制台
                     * 輸出 "__EVENT__ is not defined" 的錯誤訊息。
                     */
                    const replacedForEval = replaced
                        .replace(/__EVENT__/g, '"__EVENT__"')
                        .replace(/__THIS__/g, '"__THIS__"');
                    // 以陣列字面量包覆，使用 eval 將字串解析為實際值
                    args = eval(`[${replacedForEval}]`);
                } catch (e) {
                    console.error('解析 inline 事件參數失敗:', argsStr, e);
                    args = [];
                }
                // 將特殊標記替換為實際的 event 或 element
                return args.map(function (arg) {
                    if (arg === '__EVENT__') return event;
                    if (arg === '__THIS__') return el;
                    return arg;
                });
            }

            /**
             * 綁定指定屬性的 inline 事件處理器。此函式會從元素上讀取
             * 事件屬性（例如 onclick 或 onchange）的內容並解析出函式
             * 名稱與參數，再透過 addEventListener 重新綁定事件。
             * @param {string} attrName 屬性名稱，例如 'onclick' 或 'onchange'
             * @param {string} eventName 對應的事件名稱，例如 'click' 或 'change'
             */
            function bindInlineHandlers(attrName, eventName) {
                const selector = '[' + attrName + ']';
                document.querySelectorAll(selector).forEach(function (el) {
                    const handlerCode = el.getAttribute(attrName);
                    if (!handlerCode) return;
                    // 移除 inline 屬性，避免瀏覽器原生執行
                    el.removeAttribute(attrName);
                    el.addEventListener(eventName, function (event) {
                        try {
                            // 匹配類似 "functionName(arg1, arg2)" 的字串
                            const match = handlerCode.match(/^\s*([^(]+)\s*\((.*)\)\s*$/);
                            if (!match) {
                                return;
                            }
                            const fnName = match[1].trim();
                            const argsStr = match[2];
                            // 解析參數
                            const args = parseArgs(argsStr, event, el);
                            // 若函式名稱包含 "."，代表可能為某物件的屬性或方法
                            if (fnName.indexOf('.') >= 0) {
                                const parts = fnName.split('.');
                                // 若第一段是 'this'，則從元素本身取用
                                let target;
                                if (parts[0] === 'this') {
                                    target = el;
                                    parts.shift();
                                } else {
                                    // 其餘根據 window 尋找
                                    target = window[parts.shift()];
                                }
                                let prop;
                                while (parts.length > 1 && target) {
                                    prop = parts.shift();
                                    target = target[prop];
                                }
                                const methodName = parts.shift();
                                if (target && typeof target[methodName] === 'function') {
                                    target[methodName].apply(target, args);
                                }
                            } else {
                                // 從全域 window 取用函式
                                const fn = window[fnName];
                                if (typeof fn === 'function') {
                                    fn.apply(el, args);
                                }
                            }
                        } catch (err) {
                            console.error('執行 inline 事件處理器時發生錯誤:', handlerCode, err);
                        }
                    });
                });
            }

            // 綁定所有現有的 onclick 與 onchange 事件
            bindInlineHandlers('onclick', 'click');
            bindInlineHandlers('onchange', 'change');

            /**
             * 監聽 DOM 變更，動態綁定後續新增的元素上的 inline 事件。
             * 有些按鈕會在執行期間動態插入（例如搜尋結果列表），若不在此
             * 監聽，將會導致內嵌事件仍然存在。透過 MutationObserver 監
             * 看新增的節點，並對其及其子孫節點執行相同的綁定邏輯。
             */
            const observer = new MutationObserver(function (mutationsList) {
                mutationsList.forEach(function (mutation) {
                    mutation.addedNodes.forEach(function (node) {
                        if (node.nodeType !== 1) return;
                        // 對新增節點及其子孫節點處理
                        [node, ...node.querySelectorAll('[onclick], [onchange]')].forEach(function (el) {
                            if (el.hasAttribute && el.hasAttribute('onclick')) {
                                const code = el.getAttribute('onclick');
                                el.removeAttribute('onclick');
                                // 若已有事件監聽，避免重複綁定（透過 dataset 標記）
                                if (!el.dataset.inlineClickBound) {
                                    el.dataset.inlineClickBound = 'true';
                                    el.addEventListener('click', function (event) {
                                        try {
                                            const match = code.match(/^\s*([^(]+)\s*\((.*)\)\s*$/);
                                            if (!match) return;
                                            const fnName = match[1].trim();
                                            const argsStr = match[2];
                                            const args = parseArgs(argsStr, event, el);
                                            if (fnName.indexOf('.') >= 0) {
                                                const parts = fnName.split('.');
                                                let target;
                                                if (parts[0] === 'this') {
                                                    target = el;
                                                    parts.shift();
                                                } else {
                                                    target = window[parts.shift()];
                                                }
                                                let prop;
                                                while (parts.length > 1 && target) {
                                                    prop = parts.shift();
                                                    target = target[prop];
                                                }
                                                const methodName = parts.shift();
                                                if (target && typeof target[methodName] === 'function') {
                                                    target[methodName].apply(target, args);
                                                }
                                            } else {
                                                const fn = window[fnName];
                                                if (typeof fn === 'function') {
                                                    fn.apply(el, args);
                                                }
                                            }
                                        } catch (err) {
                                            console.error('執行動態 inline 事件處理器錯誤:', code, err);
                                        }
                                    });
                                }
                            }
                            if (el.hasAttribute && el.hasAttribute('onchange')) {
                                const code = el.getAttribute('onchange');
                                el.removeAttribute('onchange');
                                if (!el.dataset.inlineChangeBound) {
                                    el.dataset.inlineChangeBound = 'true';
                                    el.addEventListener('change', function (event) {
                                        try {
                                            const match = code.match(/^\s*([^(]+)\s*\((.*)\)\s*$/);
                                            if (!match) return;
                                            const fnName = match[1].trim();
                                            const argsStr = match[2];
                                            const args = parseArgs(argsStr, event, el);
                                            if (fnName.indexOf('.') >= 0) {
                                                const parts = fnName.split('.');
                                                let target;
                                                if (parts[0] === 'this') {
                                                    target = el;
                                                    parts.shift();
                                                } else {
                                                    target = window[parts.shift()];
                                                }
                                                let prop;
                                                while (parts.length > 1 && target) {
                                                    prop = parts.shift();
                                                    target = target[prop];
                                                }
                                                const methodName = parts.shift();
                                                if (target && typeof target[methodName] === 'function') {
                                                    target[methodName].apply(target, args);
                                                }
                                            } else {
                                                const fn = window[fnName];
                                                if (typeof fn === 'function') {
                                                    fn.apply(el, args);
                                                }
                                            }
                                        } catch (err) {
                                            console.error('執行動態 inline 事件處理器錯誤:', code, err);
                                        }
                                    });
                                }
                            }
                        });
                    });
                });
            });
            observer.observe(document.body, { childList: true, subtree: true });
        })();
    } catch (e) {
        console.error('綁定登入與側邊欄事件時發生錯誤:', e);
    }
});

// 為 HTML 內使用的函式建立全域引用。
// 這些函式會被 HTML 屬性（例如 onclick、onkeypress）呼叫，若不掛在 window 上，瀏覽器會找不到對應函式。
(function() {
  window.attemptMainLogin = attemptMainLogin;
  window.cancelConsultation = cancelConsultation;
  window.clearBillingSearch = clearBillingSearch;
  window.clearPatientSearch = clearPatientSearch;
  window.clearPrescriptionSearch = clearPrescriptionSearch;
  window.closeMedicalHistoryModal = closeMedicalHistoryModal;
  window.closePatientDetail = closePatientDetail;
  window.closePatientMedicalHistoryModal = closePatientMedicalHistoryModal;
  window.closeRegistrationModal = closeRegistrationModal;
  window.confirmRegistration = confirmRegistration;
  window.exportFinancialReport = exportFinancialReport;
  window.exportClinicBackup = exportClinicBackup;
  window.triggerBackupImport = triggerBackupImport;
  window.handleBackupFile = handleBackupFile;

  /**
   * 安全地轉義使用者提供的字串，用於避免 XSS 攻擊。
   * 將特殊字元替換為 HTML 實體，確保不會被當成 HTML 插入。
   * @param {any} str 可能包含 HTML 的字串或其他型別
   * @returns {string} 轉義後的字串
   */
  window.escapeHtml = function(str) {
    // 對於 null 或 undefined 直接轉為空字串
    const s = String(str == null ? '' : str);
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };
  window.filterBillingItems = filterBillingItems;
  window.filterHerbLibrary = filterHerbLibrary;
  window.filterUsers = filterUsers;
  window.generateFinancialReport = generateFinancialReport;
  window.hideAddBillingItemForm = hideAddBillingItemForm;
  window.hideAddFormulaForm = hideAddFormulaForm;
  window.hideAddHerbForm = hideAddHerbForm;
  window.hideAddPatientForm = hideAddPatientForm;
  window.hideAddUserForm = hideAddUserForm;
  window.hideClinicSettingsModal = hideClinicSettingsModal;
  window.loadPreviousBillingItems = loadPreviousBillingItems;
  window.loadPreviousPrescription = loadPreviousPrescription;
  window.logout = logout;
  window.refreshPatientPackagesUI = refreshPatientPackagesUI;
  window.saveBillingItem = saveBillingItem;
  window.saveClinicSettings = saveClinicSettings;
  window.saveConsultation = saveConsultation;
  window.saveFormula = saveFormula;
  window.saveHerb = saveHerb;
  window.savePatient = savePatient;
  window.saveUser = saveUser;
  window.searchBillingForConsultation = searchBillingForConsultation;
  window.searchHerbsForPrescription = searchHerbsForPrescription;
  window.searchPatientsForRegistration = searchPatientsForRegistration;
  window.setQuickDate = setQuickDate;
  window.showAddBillingItemForm = showAddBillingItemForm;
  window.showAddFormulaForm = showAddFormulaForm;
  window.showAddHerbForm = showAddHerbForm;
  window.showAddPatientForm = showAddPatientForm;
  window.showAddUserForm = showAddUserForm;
  window.showClinicSettingsModal = showClinicSettingsModal;
  window.switchFinancialTab = switchFinancialTab;
  window.toggleRegistrationNumberField = toggleRegistrationNumberField;
  window.toggleSidebar = toggleSidebar;
  window.updateMedicationDays = updateMedicationDays;
  window.updateMedicationDaysFromInput = updateMedicationDaysFromInput;
  window.updateMedicationFrequency = updateMedicationFrequency;
  window.updatePatientAge = updatePatientAge;
  // 將個人慣用組合的渲染函式公開至全域，方便在搜尋或分類變更時呼叫
  window.renderHerbCombinations = renderHerbCombinations;
  window.renderAcupointCombinations = renderAcupointCombinations;
  window.updateRestPeriod = updateRestPeriod;
  window.useOnePackage = useOnePackage;
  window.undoPackageUse = undoPackageUse;

  // 將個人設置與慣用組合相關函式掛載至全域，讓 HTML 按鈕可以直接調用。
  window.loadPersonalSettings = loadPersonalSettings;
  window.updatePersonalSettings = updatePersonalSettings;
  window.showHerbComboModal = showHerbComboModal;
  window.hideHerbComboModal = hideHerbComboModal;
  window.selectHerbCombo = selectHerbCombo;
  window.showAcupointComboModal = showAcupointComboModal;
  window.hideAcupointComboModal = hideAcupointComboModal;
  window.selectAcupointCombo = selectAcupointCombo;

  // 新增封裝函式：為常用藥方和穴位載入按鈕提供統一的讀取圈效果。
  // 與 openDiagnosisTemplate/openPrescriptionTemplate 風格一致，按下按鈕後顯示讀取圖示再開啟彈窗。
  async function openHerbCombo(ev) {
    let btn = null;
    try {
      if (ev && ev.currentTarget) btn = ev.currentTarget;
      if (!btn) {
        btn = document.querySelector('button[onclick*="openHerbCombo"]');
      }
      if (btn) {
        setButtonLoading(btn);
      }
      // 輕微延遲，讓使用者感受讀取狀態
      await new Promise(resolve => setTimeout(resolve, 200));
      if (typeof showHerbComboModal === 'function') {
        showHerbComboModal();
      }
    } catch (err) {
      console.error('開啟常用藥方按鈕錯誤:', err);
    } finally {
      if (btn) {
        clearButtonLoading(btn);
      }
    }
  }

  async function openAcupointCombo(ev) {
    let btn = null;
    try {
      if (ev && ev.currentTarget) btn = ev.currentTarget;
      if (!btn) {
        btn = document.querySelector('button[onclick*="openAcupointCombo"]');
      }
      if (btn) {
        setButtonLoading(btn);
      }
      await new Promise(resolve => setTimeout(resolve, 200));
      if (typeof showAcupointComboModal === 'function') {
        showAcupointComboModal();
      }
    } catch (err) {
      console.error('開啟常用穴位按鈕錯誤:', err);
    } finally {
      if (btn) {
        clearButtonLoading(btn);
      }
    }
  }

  // 將封裝函式掛載至全域，以便 HTML 按鈕呼叫
  window.openHerbCombo = openHerbCombo;
  window.openAcupointCombo = openAcupointCombo;

  // 模板庫：診斷模板與醫囑模板彈窗
  // 顯示診斷模板選擇彈窗，並動態生成模板列表
  function showDiagnosisTemplateModal() {
    try {
      const modal = document.getElementById('diagnosisTemplateModal');
      const listEl = document.getElementById('diagnosisTemplateList');
      if (!modal || !listEl) return;
      // 在列表上方放置搜尋欄，若尚未存在則建立
      let searchInput = modal.querySelector('#diagnosisTemplateSearch');
      if (!searchInput) {
        searchInput = document.createElement('input');
        searchInput.id = 'diagnosisTemplateSearch';
        searchInput.type = 'text';
        searchInput.placeholder = '搜尋診斷模板...';
        searchInput.className = 'w-full mb-3 px-3 py-2 border border-gray-300 rounded';
        // 插入至列表容器之前
        listEl.parentNode.insertBefore(searchInput, listEl);
        // 在輸入時重新渲染列表
        searchInput.addEventListener('input', function() {
          showDiagnosisTemplateModal();
        });
      }
      // 取得搜尋字串並轉成小寫以便比對
      const keyword = searchInput.value ? String(searchInput.value).trim().toLowerCase() : '';
      listEl.innerHTML = '';
      // 取得模板列表
      const templates = Array.isArray(diagnosisTemplates) ? diagnosisTemplates : [];
      // 根據關鍵字過濾
      let filtered = templates;
      if (keyword) {
        filtered = templates.filter(t => {
          if (!t) return false;
          const name = (t.name || '').toLowerCase();
          const category = (t.category || '').toLowerCase();
          const content = (t.content || '').toLowerCase();
          return name.includes(keyword) || category.includes(keyword) || content.includes(keyword);
        });
      }
      // 依名稱排序，改善搜尋體驗
      const sorted = filtered.slice().sort((a, b) => {
        const an = (a && a.name) ? a.name : '';
        const bn = (b && b.name) ? b.name : '';
        return an.localeCompare(bn, 'zh-Hans-CN', { sensitivity: 'base' });
      });
      sorted.forEach(template => {
        if (!template) return;
        const div = document.createElement('div');
        div.className = 'p-3 border border-gray-200 rounded-lg flex justify-between items-center hover:bg-gray-50';
        // 對模板名稱與分類進行轉義，避免 XSS
        const safeName = template.name ? window.escapeHtml(template.name) : '';
        const safeCategory = template.category ? window.escapeHtml(template.category) : null;
        const categoryLine = safeCategory ? `<div class="text-sm text-gray-500">${safeCategory}</div>` : '';
        const safeId = String(template.id).replace(/"/g, '&quot;');
        div.innerHTML = `
            <div>
              <div class="font-medium text-gray-800">${safeName}</div>
              ${categoryLine}
            </div>
            <button type="button" class="text-xs bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded" onclick="selectDiagnosisTemplate('${safeId}')">套用</button>
        `;
        listEl.appendChild(div);
      });
      modal.classList.remove('hidden');
    } catch (err) {
      console.error('顯示診斷模板彈窗失敗:', err);
    }
  }

  function hideDiagnosisTemplateModal() {
    const modal = document.getElementById('diagnosisTemplateModal');
    if (modal) modal.classList.add('hidden');
  }

  function selectDiagnosisTemplate(id) {
    try {
      const templates = Array.isArray(diagnosisTemplates) ? diagnosisTemplates : [];
      const template = templates.find(t => String(t.id) === String(id));
      if (!template) return;
      // 填入主訴與診斷相關欄位
      const formSymptoms = document.getElementById('formSymptoms');
      const formCurrentHistory = document.getElementById('formCurrentHistory');
      const formTongue = document.getElementById('formTongue');
      const formPulse = document.getElementById('formPulse');
      const formDiagnosis = document.getElementById('formDiagnosis');
      const formSyndrome = document.getElementById('formSyndrome');

      /**
       * 嘗試從模板的 content 欄位解析特定的診斷欄目，例如「主訴」、「現病史」、「舌象」等。
       * 若模板已有對應屬性（如 chiefComplaint 等）則優先使用該屬性。
       * 解析順序：
       *   - 先檢查模板對應欄位是否有資料。
       *   - 再從 content 中以關鍵字切割獲取。
       *   - 最後退而求其次使用整段 content 或模板名稱。
       */
      const tmplContent = typeof template.content === 'string' ? template.content : '';
      // 解析 content 中指定標題後的內容，使用非貪婪匹配，直到下一個已知標題或字串結尾
      function parseSection(keyword) {
        try {
          const pattern = new RegExp(String(keyword) + '[：:]\\s*([\\s\\S]*?)(?:\\n|$|主訴|現病史|舌象|脈象|中醫診斷|證型診斷|症狀描述|檢查建議|治療建議|復診安排)', 'i');
          const match = tmplContent.match(pattern);
          return match ? match[1].trim() : '';
        } catch (_e) {
          return '';
        }
      }

      // 主訴
      if (formSymptoms && !formSymptoms.value) {
        let value = '';
        if (template.chiefComplaint) {
          value = template.chiefComplaint;
        } else {
          // 嘗試從 content 解析「主訴」或「症狀描述」
          value = parseSection('主訴');
          if (!value) {
            value = parseSection('症狀描述');
          }
          // 若仍無法取得，使用整段 content
          if (!value && tmplContent) {
            value = tmplContent;
          }
        }
        formSymptoms.value = value;
      }

      // 現病史
      if (formCurrentHistory && !formCurrentHistory.value) {
        let value = '';
        if (template.currentHistory) {
          value = template.currentHistory;
        } else {
          value = parseSection('現病史');
        }
        if (value) formCurrentHistory.value = value;
      }

      // 舌象
      if (formTongue && !formTongue.value) {
        let value = '';
        if (template.tongue) {
          value = template.tongue;
        } else {
          value = parseSection('舌象');
        }
        if (value) formTongue.value = value;
      }

      // 脈象
      if (formPulse && !formPulse.value) {
        let value = '';
        if (template.pulse) {
          value = template.pulse;
        } else {
          value = parseSection('脈象');
        }
        if (value) formPulse.value = value;
      }

      // 中醫診斷
      if (formDiagnosis && !formDiagnosis.value) {
        let value = '';
        if (template.tcmDiagnosis) {
          value = template.tcmDiagnosis;
        } else {
          value = parseSection('中醫診斷');
        }
        // 若仍無內容，使用模板名稱作為診斷
        if (!value && template.name) {
          value = template.name;
        }
        formDiagnosis.value = value;
      }

      // 證型診斷
      if (formSyndrome && !formSyndrome.value) {
        let value = '';
        if (template.syndromeDiagnosis) {
          value = template.syndromeDiagnosis;
        } else {
          value = parseSection('證型診斷');
        }
        if (value) formSyndrome.value = value;
      }

      hideDiagnosisTemplateModal();
      showToast('已載入診斷模板', 'success');
    } catch (err) {
      console.error('選擇診斷模板錯誤:', err);
    }
  }

  // 顯示醫囑模板選擇彈窗，並動態生成列表
  async function showPrescriptionTemplateModal() {
    /**
     * 顯示醫囑模板選擇彈窗。此函式會在必要時先初始化模板庫資料，
     * 然後根據目前的醫囑模板清單動態產生列表。若無可用模板，
     * 將顯示提示訊息。所有操作包含在 try/catch 中，以避免意外錯誤破壞 UI。
     */
    try {
      const modal = document.getElementById('prescriptionTemplateModal');
      const listEl = document.getElementById('prescriptionTemplateList');
      if (!modal || !listEl) return;
      // 如果模板尚未載入，嘗試從資料庫初始化。
      if (!Array.isArray(prescriptionTemplates) || prescriptionTemplates.length === 0) {
        if (typeof initTemplateLibrary === 'function') {
          try {
            await initTemplateLibrary();
          } catch (e) {
            console.error('初始化模板庫資料失敗:', e);
          }
        }
      }
      // 在列表上方放置搜尋欄，若尚未存在則建立
      let searchInput = modal.querySelector('#prescriptionTemplateSearch');
      if (!searchInput) {
        searchInput = document.createElement('input');
        searchInput.id = 'prescriptionTemplateSearch';
        searchInput.type = 'text';
        searchInput.placeholder = '搜尋醫囑模板...';
        searchInput.className = 'w-full mb-3 px-3 py-2 border border-gray-300 rounded';
        listEl.parentNode.insertBefore(searchInput, listEl);
        searchInput.addEventListener('input', function() {
          // 重新渲染列表
          showPrescriptionTemplateModal();
        });
      }
      listEl.innerHTML = '';
      const templates = Array.isArray(prescriptionTemplates) ? prescriptionTemplates : [];
      // 取得搜尋字串
      const keyword = searchInput.value ? String(searchInput.value).trim().toLowerCase() : '';
      if (!templates || templates.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'text-sm text-gray-500 text-center p-4';
        emptyDiv.textContent = '目前尚無醫囑模板，請先建立或同步模板資料。';
        listEl.appendChild(emptyDiv);
      } else {
        // 過濾列表
        let filtered = templates;
        if (keyword) {
          filtered = templates.filter(t => {
            if (!t) return false;
            const name = (t.name || '').toLowerCase();
            const category = (t.category || '').toLowerCase();
            const content = (t.content || '').toLowerCase();
            return name.includes(keyword) || category.includes(keyword) || content.includes(keyword);
          });
        }
        // 依名稱排序
        const sorted = filtered.slice().sort((a, b) => {
          const an = (a && a.name) ? a.name : '';
          const bn = (b && b.name) ? b.name : '';
          return an.localeCompare(bn, 'zh-Hans-CN', { sensitivity: 'base' });
        });
        sorted.forEach(template => {
          if (!template) return;
          const div = document.createElement('div');
          div.className = 'p-3 border border-gray-200 rounded-lg flex justify-between items-center hover:bg-gray-50';
          // 對模板名稱與分類進行轉義，避免 XSS
          const safeName = template.name ? window.escapeHtml(template.name) : '';
          const safeCategory = template.category ? window.escapeHtml(template.category) : null;
          const categoryLine = safeCategory ? `<div class="text-sm text-gray-500">${safeCategory}</div>` : '';
          div.innerHTML = `
            <div>
              <div class="font-medium text-gray-800">${safeName}</div>
              ${categoryLine}
            </div>
            <button type="button" class="text-xs bg-purple-500 hover:bg-purple-600 text-white px-2 py-1 rounded select-prescription-btn" data-id="${template.id}">套用</button>
          `;
          listEl.appendChild(div);
        });
        // 為每個按鈕掛上事件監聽
        const buttons = listEl.querySelectorAll('.select-prescription-btn');
        buttons.forEach(btn => {
          btn.addEventListener('click', function (evt) {
            const tid = evt.currentTarget.getAttribute('data-id');
            // 使用全域掛載的新版函式載入醫囑模板
            if (window && typeof window.selectPrescriptionTemplate === 'function') {
              window.selectPrescriptionTemplate(tid);
            }
          });
        });
      }
      modal.classList.remove('hidden');
    } catch (err) {
      console.error('顯示醫囑模板彈窗失敗:', err);
      showToast('無法顯示醫囑模板', 'error');
    }
  }

  function hidePrescriptionTemplateModal() {
    const modal = document.getElementById('prescriptionTemplateModal');
    if (modal) modal.classList.add('hidden');
  }

// 將舊版醫囑模板載入函式重新命名為 _oldSelectPrescriptionTemplate，避免與新版衝突
function _oldSelectPrescriptionTemplate(id) {
    /**
     * 選擇醫囑模板並套用到表單中。此函式會依序嘗試從模板的 content、note、
     * duration 以及 followUp 中解析出服藥方法、注意事項、療程與複診天數。
     * 完成後將值填入對應表單欄位，並更新複診日期。
     */
    try {
      const templates = Array.isArray(prescriptionTemplates) ? prescriptionTemplates : [];
      // 以 String 比較，確保不同類型的識別值也能匹配
      const template = templates.find(t => String(t.id) === String(id));
      if (!template) {
        showToast('找不到選定的醫囑模板', 'warning');
        return;
      }
      const usageField = document.getElementById('formUsage');
      const treatmentField = document.getElementById('formTreatmentCourse');
      const instructionsField = document.getElementById('formInstructions');
      // 定義解析器：解析文字以取得 usage、instructions、treatment
      const parseSections = text => {
        let usage = '';
        let instructions = '';
        let treatment = '';
        if (!text || typeof text !== 'string') return { usage, instructions, treatment };
        const contentStr = String(text);
        // 定義各區塊標題的候選關鍵字
        const usageMarkers = ['服藥方法', '服用方法', '服用方式', '用藥指導', '服藥指南', '服用指南', '中藥服用方法', '西藥服用方法'];
        const instructionMarkers = ['注意事項', '注意事项', '注意要點', '注意要点', '注意事項及叮嚀', '醫囑', '医嘱', '注意'];
        const treatmentMarkers = ['療程安排', '疗程安排', '療程', '疗程', '治療計劃', '治疗计划', '治療安排', '治疗安排'];
        // 收集所有標題位置
        let positions = [];
        const collectPositions = (markers, type) => {
          markers.forEach(mk => {
            const pos = contentStr.indexOf(mk);
            if (pos !== -1) {
              positions.push({ pos, marker: mk, type });
            }
          });
        };
        collectPositions(usageMarkers, 'usage');
        collectPositions(instructionMarkers, 'instructions');
        collectPositions(treatmentMarkers, 'treatment');
        if (positions.length > 0) {
          // 依位置排序，如位置相同則較長的標題優先（避免較短的關鍵字覆蓋掉完整標題）
          positions.sort((a, b) => {
            if (a.pos === b.pos) {
              return b.marker.length - a.marker.length;
            }
            return a.pos - b.pos;
          });
          // 移除同一位置的重複標題，只保留最長的那個，避免像「注意」與「注意事項」重複解析
          const unique = [];
          positions.forEach(item => {
            if (unique.length === 0 || unique[unique.length - 1].pos !== item.pos) {
              unique.push(item);
            }
          });
          positions = unique;
          const assigned = { usage: false, instructions: false, treatment: false };
          for (let i = 0; i < positions.length; i++) {
            const { pos, marker, type } = positions[i];
            let start = pos + marker.length;
            // 去除冒號、全角冒號以及空白
            const afterMarker = contentStr.substring(start).replace(/^[\s:：]+/, '');
            start = pos + marker.length + (contentStr.substring(start).length - afterMarker.length);
            let end = contentStr.length;
            if (i + 1 < positions.length) {
              end = positions[i + 1].pos;
            }
            if (!assigned[type]) {
              const extracted = contentStr.substring(start, end).trim();
              if (type === 'usage') usage = extracted;
              if (type === 'instructions') instructions = extracted;
              if (type === 'treatment') treatment = extracted;
              assigned[type] = true;
            }
          }
        }
        return { usage, instructions, treatment };
      };
      // 儲存最終解析結果
      let usage = '';
      let instructions = '';
      let treatment = '';
      // 先從 content 解析
      if (template.content && typeof template.content === 'string') {
        const parsed = parseSections(template.content);
        usage = parsed.usage;
        instructions = parsed.instructions;
        treatment = parsed.treatment;
      }
      // 接著使用 note 補充資料：不覆寫服藥方法，僅補充療程與將整段注意事項合併至醫囑欄
      if (template.note && typeof template.note === 'string' && template.note.trim()) {
        const noteStr = template.note.trim();
        // 解析 note 以取得療程資訊，若 treatment 尚未填寫則使用
        const parsedNote = parseSections(template.note);
        if (!treatment && parsedNote.treatment) {
          treatment = parsedNote.treatment;
        }
        // 將 note 內容合併到 instructions 欄位，避免覆寫原本的服藥方法
        if (noteStr) {
          if (instructions) {
            // 若 existing instructions 中尚未包含 note，則以換行分隔後追加
            if (!instructions.includes(noteStr)) {
              instructions = instructions + (instructions.endsWith('\n') ? '' : '\n') + noteStr;
            }
          } else {
            instructions = noteStr;
          }
        }
      }
      // 若仍為空，直接使用 note 或 content 作為 usage
      if (!usage) {
        if (template.note && typeof template.note === 'string' && template.note.trim()) {
          usage = template.note.trim();
        } else if (template.content && typeof template.content === 'string') {
          usage = template.content.trim();
        }
      }
      // 若 instructions 為空，且 note 不等於 usage，使用 note 作為 instructions
      if (!instructions) {
        if (template.note && typeof template.note === 'string' && template.note.trim()) {
          if (template.note.trim() !== usage) {
            instructions = template.note.trim();
          }
        }
      }
      // 若 treatment 為空，使用 duration
      if (!treatment) {
        if (template.duration && typeof template.duration === 'string') {
          treatment = template.duration;
        }
      }
      // 將值填入表單欄位
      if (usageField) usageField.value = usage || '';
      if (instructionsField) instructionsField.value = instructions || '';
      if (treatmentField) treatmentField.value = treatment || '';
      // 自動填入複診日期
      try {
        const followUpField = document.getElementById('formFollowUpDate');
        if (followUpField) {
          let days = 0;
          // 1. 解析 template.followUp
          if (template.followUp && typeof template.followUp === 'string') {
            // 先移除括號以支援格式如「3（週）」或「7（天）」
            const fuClean = template.followUp.replace(/[()（）]/g, '');
            const numMatch = fuClean.match(/(\d+)/);
            if (numMatch) {
              const num = parseInt(numMatch[1], 10);
              if (!isNaN(num)) {
                if (/天|日/.test(fuClean)) {
                  days = num;
                } else if (/週|周/.test(fuClean)) {
                  days = num * 7;
                } else if (/月/.test(fuClean)) {
                  days = num * 30;
                }
              }
            }
            // 如果還無法解析，仍採用舊有正則作為後備
            if (!days) {
              let match;
              match = fuClean.match(/(\d+)\s*(?:個)?\s*(天|日)/);
              if (match) {
                const num = parseInt(match[1], 10);
                if (!isNaN(num)) days = num;
              }
              if (!days) {
                match = fuClean.match(/(\d+)\s*(?:個)?\s*[週周]/);
                if (match) {
                  const num = parseInt(match[1], 10);
                  if (!isNaN(num)) days = num * 7;
                }
              }
              if (!days) {
                match = fuClean.match(/(\d+)\s*(?:個)?\s*月/);
                if (match) {
                  const num = parseInt(match[1], 10);
                  if (!isNaN(num)) days = num * 30;
                }
              }
            }
          }
          // 2. 若未得出結果，從 content 搜尋回/複診
          const searchFollowUp = (str) => {
            if (!str || typeof str !== 'string') return 0;
            const re = /(\d+)\s*(?:個)?\s*(天|日|週|周|月)\s*(?:後)?\s*[回複復复][診诊]/g;
            let matches = [];
            let m;
            while ((m = re.exec(str)) !== null) {
              matches.push(m);
            }
            if (matches.length > 0) {
              const last = matches[matches.length - 1];
              const num = parseInt(last[1], 10);
              const unit = last[2];
              if (!isNaN(num)) {
                if (unit === '天' || unit === '日') return num;
                if (unit === '週' || unit === '周') return num * 7;
                if (unit === '月') return num * 30;
              }
            }
            return 0;
          };
          if (days <= 0 && template.content && typeof template.content === 'string') {
            days = searchFollowUp(template.content);
          }
          if (days <= 0 && template.note && typeof template.note === 'string') {
            days = searchFollowUp(template.note);
          }
          if (days > 0) {
            // 取得基準日期：優先使用 formVisitTime，否則為當前時間
            let baseDate = new Date();
            const visitField = document.getElementById('formVisitTime');
            if (visitField && visitField.value) {
              const parsed = new Date(visitField.value);
              if (!isNaN(parsed.getTime())) {
                baseDate = parsed;
              }
            }
            const followDate = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);
            const y = followDate.getFullYear();
            const mStr = String(followDate.getMonth() + 1).padStart(2, '0');
            const dStr = String(followDate.getDate()).padStart(2, '0');
            const hStr = String(followDate.getHours()).padStart(2, '0');
            const minStr = String(followDate.getMinutes()).padStart(2, '0');
            followUpField.value = `${y}-${mStr}-${dStr}T${hStr}:${minStr}`;
            try {
              // 派發事件通知可能的監聽器
              followUpField.dispatchEvent(new Event('change'));
              followUpField.dispatchEvent(new Event('input'));
            } catch (e) {
              // ignore event dispatch errors
            }
          }
        }
      } catch (fuErr) {
        // 若解析複診日期失敗則忽略，不提示使用者
        console.warn('解析複診日期失敗：', fuErr);
      }
      hidePrescriptionTemplateModal();
      showToast('已載入醫囑模板', 'success');
    } catch (err) {
      console.error('選擇醫囑模板錯誤:', err);
      showToast('載入醫囑模板失敗', 'error');
    }
  }

  // 將模板相關函式掛載至全域，供 HTML 按鈕調用
  window.showDiagnosisTemplateModal = showDiagnosisTemplateModal;
  window.hideDiagnosisTemplateModal = hideDiagnosisTemplateModal;
  window.selectDiagnosisTemplate = selectDiagnosisTemplate;
  window.showPrescriptionTemplateModal = showPrescriptionTemplateModal;
  window.hidePrescriptionTemplateModal = hidePrescriptionTemplateModal;
  // 定義新版載入醫囑模板函式，僅處理療程、中藥服用方法、複診時間、醫囑及注意事項
  function selectPrescriptionTemplate(id) {
    try {
      const templates = Array.isArray(prescriptionTemplates) ? prescriptionTemplates : [];
      const template = templates.find(t => String(t.id) === String(id));
      if (!template) {
        showToast('找不到選定的醫囑模板', 'warning');
        return;
      }
      const usageField = document.getElementById('formUsage');
      const treatmentField = document.getElementById('formTreatmentCourse');
      const instructionsField = document.getElementById('formInstructions');
      const followUpField = document.getElementById('formFollowUpDate');
      if (treatmentField) treatmentField.value = (template.duration && typeof template.duration === 'string') ? template.duration.trim() : '';
      // 修正載入醫囑模板時將「中藥服用方法」與「醫囑及注意事項」欄位對應錯置的問題
      // 在編輯模板介面中，`note` 對應的是「中藥服用方法」，`content` 對應的是「醫囑內容及注意事項」。
      // 因此在套用模板時，應將 note 填入使用方式欄位，content 填入醫囑欄位。
      if (usageField) {
        usageField.value = (template.note && typeof template.note === 'string') ? template.note.trim() : '';
      }
      if (instructionsField) {
        instructionsField.value = (template.content && typeof template.content === 'string') ? template.content.trim() : '';
      }
      try {
        if (followUpField) {
          // 先嘗試解析含括號的複診時間。例如「3（週）」應解析為 21 天。
          let days = 0;
          if (template.followUp && typeof template.followUp === 'string') {
            // 移除中英文括號，避免像「7（天）」這樣的格式無法解析
            const fuClean = template.followUp.replace(/[()（）]/g, '');
            const numMatch = fuClean.match(/(\d+)/);
            if (numMatch) {
              const num = parseInt(numMatch[1], 10);
              if (!isNaN(num)) {
                if (/天|日/.test(fuClean)) {
                  days = num;
                } else if (/週|周/.test(fuClean)) {
                  days = num * 7;
                } else if (/月/.test(fuClean)) {
                  days = num * 30;
                }
              }
            }
          }
          // 若尚未解析出天數，退回原本的正則匹配邏輯
          if (days === 0 && template.followUp && typeof template.followUp === 'string') {
            let match;
            const fu = template.followUp;
            match = fu.match(/(\d+)\s*(?:個)?\s*(天|日)/);
            if (match) {
              const num = parseInt(match[1], 10);
              if (!isNaN(num)) days = num;
            }
            if (!days) {
              match = fu.match(/(\d+)\s*(?:個)?\s*[週周]/);
              if (match) {
                const num = parseInt(match[1], 10);
                if (!isNaN(num)) days = num * 7;
              }
            }
            if (!days) {
              match = fu.match(/(\d+)\s*(?:個)?\s*月/);
              if (match) {
                const num = parseInt(match[1], 10);
                if (!isNaN(num)) days = num * 30;
              }
            }
          }
          if (days > 0) {
            // 取得基準日期：優先使用 formVisitTime，否則為當前時間
            let baseDate = new Date();
            const visitField = document.getElementById('formVisitTime');
            if (visitField && visitField.value) {
              const parsed = new Date(visitField.value);
              if (!isNaN(parsed.getTime())) {
                baseDate = parsed;
              }
            }
            const followDate = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);
            const y = followDate.getFullYear();
            const mStr = String(followDate.getMonth() + 1).padStart(2, '0');
            const dStr = String(followDate.getDate()).padStart(2, '0');
            const hStr = String(followDate.getHours()).padStart(2, '0');
            const minStr = String(followDate.getMinutes()).padStart(2, '0');
            followUpField.value = `${y}-${mStr}-${dStr}T${hStr}:${minStr}`;
            try {
              // 派發事件，讓可能的監聽器能捕捉到變化
              followUpField.dispatchEvent(new Event('change'));
              followUpField.dispatchEvent(new Event('input'));
            } catch (e) {
              // 忽略事件派發錯誤
            }
          }
        }
      } catch (fuErr) {
        console.warn('解析複診日期失敗：', fuErr);
      }
      hidePrescriptionTemplateModal();
      showToast('已載入醫囑模板', 'success');
    } catch (err) {
      console.error('選擇醫囑模板錯誤:', err);
      showToast('載入醫囑模板失敗', 'error');
    }
  }
  // 將新版函式掛載到全域
  window.selectPrescriptionTemplate = selectPrescriptionTemplate;

  // 以下為封裝診斷模板與醫囑模板載入按鈕的函式。
  // 按下載入按鈕時顯示讀取圈，稍作延遲後再打開對應的模板彈窗，並於完成後恢復原始按鈕內容。
  async function openDiagnosisTemplate(ev) {
    let btn = null;
    try {
      if (ev && ev.currentTarget) btn = ev.currentTarget;
      if (!btn) {
        btn = document.querySelector('button[onclick*="openDiagnosisTemplate"]');
      }
      if (btn) {
        setButtonLoading(btn);
      }
      await new Promise(resolve => setTimeout(resolve, 200));
      if (typeof showDiagnosisTemplateModal === 'function') {
        showDiagnosisTemplateModal();
      }
    } catch (err) {
      console.error('開啟診斷模板按鈕錯誤:', err);
    } finally {
      if (btn) {
        clearButtonLoading(btn);
      }
    }
  }

  async function openPrescriptionTemplate(ev) {
    let btn = null;
    try {
      // 找到觸發按鈕
      if (ev && ev.currentTarget) btn = ev.currentTarget;
      if (!btn) {
        // 後備搜尋頁面中的按鈕
        btn = document.querySelector('button[onclick*="openPrescriptionTemplate"]');
      }
      if (btn) {
        setButtonLoading(btn);
      }
      // 若模板尚未載入，嘗試初始化模板庫
      if (!Array.isArray(prescriptionTemplates) || prescriptionTemplates.length === 0) {
        if (typeof initTemplateLibrary === 'function') {
          try {
            await initTemplateLibrary();
          } catch (initErr) {
            console.error('初始化模板庫失敗:', initErr);
          }
        }
      }
      // 小延遲讓使用者感受讀取反饋
      await new Promise(resolve => setTimeout(resolve, 200));
      if (typeof showPrescriptionTemplateModal === 'function') {
        // 使用 await 以確保如有異步操作完成後再繼續
        await showPrescriptionTemplateModal();
      }
    } catch (err) {
      console.error('開啟醫囑模板按鈕錯誤:', err);
      showToast('載入醫囑模板失敗', 'error');
    } finally {
      if (btn) {
        clearButtonLoading(btn);
      }
    }
  }

  // 將封裝函式掛載至全域，供 HTML 直接調用
  window.openDiagnosisTemplate = openDiagnosisTemplate;
  window.openPrescriptionTemplate = openPrescriptionTemplate;

  /**
   * 在使用者嘗試直接關閉或重新整理網頁時提示確認，避免未保存的套票使用紀錄被誤判為取消。
   *
   * 先前的實作中會在取消診症或退出編輯時，將 pendingPackageChanges 中的變更回復。
   * 但如果使用者直接關閉瀏覽器頁籤或刷新頁面，這些變更不應自動回復，
   * 否則將導致套票次數被無意間加回。為此，加入 beforeunload 監聽器，
   * 當存在未保存的套票變更時，提示使用者確認離開。若使用者仍選擇離開，
   * 我們不會執行 revertPendingPackageChanges，而是保留目前資料庫中的套票狀態。
   */
  window.addEventListener('beforeunload', function (e) {
    try {
      // 若有暫存的套票使用變更尚未正式保存，則提示確認離開
      if (pendingPackageChanges && pendingPackageChanges.length > 0) {
        // 阻止預設行為，並設置 returnValue 以符合部分瀏覽器要求
        e.preventDefault();
        e.returnValue = '';
      }
    } catch (_e) {
      // 忽略意外錯誤，避免影響離開流程
    }
  });

  /**
   * 在頁面卸載時清空暫存的套票變更。
   *
   * 離開頁面後，記憶體中的 pendingPackageChanges 將會失效，不過在某些瀏覽器中
   * 仍有可能在後續執行非同步或同步回調時引用到舊資料。為安全起見，在 unload 事件
   * 中顯式將暫存變更清空，確保後續不會誤判為需要回復。
   */
  window.addEventListener('unload', function () {
    try {
      pendingPackageChanges = [];
    } catch (_e) {
      // 若無法清空，略過即可；刷新後此變數會重新初始化
    }
  });
})();
          // 分類數據
          let categories = {
            herbs: ['感冒類', '消化系統', '婦科調理', '補益類', '清熱類'],
            acupoints: ['頭面部', '胸腹部', '四肢部', '背腰部', '內科疾病', '婦科疾病'],
            prescriptions: ['用藥指導', '生活調理', '飲食建議', '運動指導', '復診提醒', '慢性病管理', '婦科調理'],
            diagnosis: ['內科', '婦科', '兒科', '皮膚科', '骨傷科']
          };

          // 將分類資料公開到全域，讓其他模組能夠讀取與更新
          window.categories = categories;

          // -----------------------------------------------------------------------------
          // 個人慣用藥方組合及穴位組合的分類（管理分類）
          //
          // 這些分類用於常用中藥組合與穴位組合的管理，可依個人偏好調整。
          // 預設值取自全域 categories.herbs 與 categories.acupoints，
          // 但當用戶在個人設定中另行指定時會被覆蓋。
          // 透過 window 曝露讓其他模組可以存取與更新。
          let herbComboCategories = Array.isArray(categories.herbs) ? [...categories.herbs] : [];
          let acupointComboCategories = Array.isArray(categories.acupoints) ? [...categories.acupoints] : [];
          window.herbComboCategories = herbComboCategories;
          window.acupointComboCategories = acupointComboCategories;

        /**
         * 同步個人慣用組合分類與全域分類。
         * 當更新 categories.herbs 或 categories.acupoints 時，
         * 如果個人分類尚未設定或者與全域分類保持一致，
         * 則以最新的全域分類覆蓋個人分類。此函式也會更新對應的 window
         * 變數，以便其他模組立即取得正確的分類資料。
         *
         * @param {string} type - 要同步的分類類型（'herbs' 或 'acupoints'）
         */
        function refreshComboCategories(type) {
          try {
            if (type === 'herbs') {
              // 若個人中藥分類不存在、長度與全域資料不一致，或有任意項目不同，則重新同步
              if (!Array.isArray(herbComboCategories) ||
                  herbComboCategories.length !== (categories.herbs ? categories.herbs.length : 0) ||
                  !herbComboCategories.every((c, idx) => categories.herbs && categories.herbs[idx] === c)) {
                herbComboCategories = Array.isArray(categories.herbs) ? [...categories.herbs] : [];
                window.herbComboCategories = herbComboCategories;
              }
            } else if (type === 'acupoints') {
              // 同步穴位分類，條件同上
              if (!Array.isArray(acupointComboCategories) ||
                  acupointComboCategories.length !== (categories.acupoints ? categories.acupoints.length : 0) ||
                  !acupointComboCategories.every((c, idx) => categories.acupoints && categories.acupoints[idx] === c)) {
                acupointComboCategories = Array.isArray(categories.acupoints) ? [...categories.acupoints] : [];
                window.acupointComboCategories = acupointComboCategories;
              }
            }
          } catch (e) {
            console.error('刷新個人組合分類失敗:', e);
          }

          // 更新分類後，重新建立個人組合搜尋與分類介面，以反映最新的分類資料
          try {
            if (typeof setupPersonalComboSearchAndFilter === 'function') {
              setupPersonalComboSearchAndFilter();
            }
          } catch (_e) {
            // 若初始化失敗，不阻斷流程
          }
        }

/**
 * 刷新模板庫的分類篩選下拉選單。
 * 此函式會根據最新的 categories.prescriptions 和 categories.diagnosis
 * 更新醫囑模板與診斷模板的分類選擇器，以便在模板庫頁面能夠顯示所有
 * 可用分類進行篩選。若當前選中的值仍存在於新的分類清單中，則維持選中；
 * 否則恢復到預設的「全部類別」或「全部科別」。
 */
function refreshTemplateCategoryFilters() {
  try {
    // 醫囑模板分類篩選
    const pFilter = document.getElementById('prescriptionTemplateCategoryFilter');
    if (pFilter) {
      // 保存目前選中值
      const prevValue = pFilter.value;
      // 清空並添加預設選項
      pFilter.innerHTML = '';
      const defaultOpt = document.createElement('option');
      defaultOpt.value = '全部類別';
      defaultOpt.textContent = '全部類別';
      pFilter.appendChild(defaultOpt);
      // 加入所有醫囑分類
      const pCats = (categories && Array.isArray(categories.prescriptions)) ? categories.prescriptions : [];
      pCats.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        pFilter.appendChild(opt);
      });
      // 恢復先前選項（若仍存在）
      if (prevValue && Array.from(pFilter.options).some(o => o.value === prevValue)) {
        pFilter.value = prevValue;
      } else {
        pFilter.value = '全部類別';
      }
    }
    // 診斷模板分類篩選
    const dFilter = document.getElementById('diagnosisTemplateCategoryFilter');
    if (dFilter) {
      const prevValue2 = dFilter.value;
      dFilter.innerHTML = '';
      const defaultOpt2 = document.createElement('option');
      // 使用原本的預設文案為「全部科別」，若需要亦可使用「全部分類」
      defaultOpt2.value = '全部科別';
      defaultOpt2.textContent = '全部科別';
      dFilter.appendChild(defaultOpt2);
      const dCats = (categories && Array.isArray(categories.diagnosis)) ? categories.diagnosis : [];
      dCats.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        dFilter.appendChild(opt);
      });
      if (prevValue2 && Array.from(dFilter.options).some(o => o.value === prevValue2)) {
        dFilter.value = prevValue2;
      } else {
        dFilter.value = '全部科別';
      }
    }
  } catch (e) {
    console.error('刷新模板分類篩選下拉選單失敗:', e);
  }
}

        /**
         * 從 Firebase 初始化分類資料。
         * 嘗試讀取位於 'categories/default' 的文檔，若不存在則寫入當前預設分類。
         * 讀取成功後會更新 categories 物件以及 window.categories。
         */
        async function initCategoryData() {
          // 優先從本地載入分類資料
          try {
            const stored = localStorage.getItem('categories');
            if (stored) {
              const localData = JSON.parse(stored);
              if (localData && typeof localData === 'object') {
                if (Array.isArray(localData.herbs)) categories.herbs = localData.herbs;
                if (Array.isArray(localData.acupoints)) categories.acupoints = localData.acupoints;
                if (Array.isArray(localData.prescriptions)) categories.prescriptions = localData.prescriptions;
                if (Array.isArray(localData.diagnosis)) categories.diagnosis = localData.diagnosis;
                // 更新全域引用
                window.categories = categories;
                // 更新模板庫分類篩選下拉選單，以顯示最新的醫囑與診斷分類
                if (typeof refreshTemplateCategoryFilters === 'function') {
                  try {
                    refreshTemplateCategoryFilters();
                  } catch (_e) {}
                }
              }
            }
          } catch (err) {
            console.error('從本地載入分類資料失敗:', err);
          }

          // 若 Firebase 未定義或缺少 getDoc，則直接結束，使用預設或本地資料
          if (!window.firebase || !window.firebase.getDoc || !window.firebase.doc || !window.firebase.db) {
            return;
          }

          // 等待 Firebase 初始化完成
          await waitForFirebaseDb();
          try {
            const docRef = window.firebase.doc(window.firebase.db, 'categories', 'default');
            const docSnap = await window.firebase.getDoc(docRef);
            if (docSnap && docSnap.exists()) {
              const data = docSnap.data();
              if (data && typeof data === 'object') {
                if (Array.isArray(data.herbs)) {
                  categories.herbs = data.herbs;
                }
                if (Array.isArray(data.acupoints)) {
                  categories.acupoints = data.acupoints;
                }
                if (Array.isArray(data.prescriptions)) {
                  categories.prescriptions = data.prescriptions;
                }
                if (Array.isArray(data.diagnosis)) {
                  categories.diagnosis = data.diagnosis;
                }
              }
            } else {
              // 若文件不存在，初始化一份包含當前分類的文檔
              await window.firebase.setDoc(docRef, {
                herbs: categories.herbs,
                acupoints: categories.acupoints,
                prescriptions: categories.prescriptions,
                diagnosis: categories.diagnosis
              });
            }
            // 更新全域引用
            window.categories = categories;
            // 更新模板庫分類篩選下拉選單，以顯示最新的醫囑與診斷分類
            if (typeof refreshTemplateCategoryFilters === 'function') {
              try {
                refreshTemplateCategoryFilters();
              } catch (_e) {}
            }
          } catch (error) {
            console.error('讀取/初始化分類資料失敗:', error);
          }
        }

        /**
         * 將最新的分類資料寫入 Firebase。
         * 這會覆蓋存儲在 'categories/default' 文檔中的 existing 資料。
         */
        async function saveCategoriesToFirebase() {
          try {
            // 如果 Firebase 可用，則將分類資料寫入 Firestore
            if (window.firebase && window.firebase.db && window.firebase.setDoc && window.firebase.doc) {
              // 確保 Firebase 已經初始化
              await waitForFirebaseDb();
              const docRef = window.firebase.doc(window.firebase.db, 'categories', 'default');
              await window.firebase.setDoc(docRef, {
                herbs: categories.herbs,
                acupoints: categories.acupoints,
                prescriptions: categories.prescriptions,
                diagnosis: categories.diagnosis
              });

              // 無論是否使用 Firebase，均在本地保存一份副本
              try {
                localStorage.setItem('categories', JSON.stringify(categories));
              } catch (err) {
                console.error('保存分類資料至本地失敗:', err);
              }
            } else {
              // 若 Firebase 不可用，退而求其次保存至 localStorage
              try {
                localStorage.setItem('categories', JSON.stringify(categories));
              } catch (err) {
                console.error('保存分類資料至本地失敗:', err);
              }
              return;
            }
          } catch (error) {
            console.error('保存分類資料至 Firebase 失敗:', error);
            // 嘗試使用本地儲存作為後備機制
            try {
              localStorage.setItem('categories', JSON.stringify(categories));
            } catch (err2) {
              console.error('保存分類資料至本地失敗:', err2);
            }
          }
        }

        /**
         * 將當前分類資料寫入瀏覽器的 localStorage。
         * Firebase 若不可用或寫入失敗，仍可通過此函式確保分類設定不會遺失。
         */
        function persistCategoriesLocally() {
          try {
            localStorage.setItem('categories', JSON.stringify(categories));
          } catch (err) {
            console.error('本地保存分類資料失敗:', err);
          }
        }

          // 數據存儲
          // 移除預設的中藥組合範例，預設為空陣列。
          let herbCombinations = [];

          // 移除預設的穴位組合範例，預設為空陣列。
          let acupointCombinations = [];

          let prescriptionTemplates = [
            {
              id: 1,
              name: '感冒用藥指導模板',
              category: '用藥指導',
              duration: '7天',
              followUp: '3天後',
              content: '服藥方法：每日三次，飯後30分鐘溫服。服藥期間多喝溫開水。避免生冷、油膩、辛辣食物。注意事項：充分休息，避免熬夜。如症狀加重或持續發燒請立即回診。療程安排：建議療程7天，服藥3天後回診評估。',
              note: '',
              lastModified: '2024-02-15'
            }
          ];

          let diagnosisTemplates = [
            {
              id: 1,
              name: '感冒診斷模板',
              category: '內科',
              content: '症狀描述：患者表現為鼻塞、喉嚨痛、咳嗽等症狀。檢查建議：觀察咽部紅腫狀況，測量體溫。治療建議：建議使用疏風解表類中藥，搭配休息和多喝水。復診安排：3天後回診。',
              lastModified: '2024-01-20'
            }
          ];

          // 渲染中藥組合
          function renderHerbCombinations() {
            const container = document.getElementById('herbCombinationsContainer');
            if (!container) return;
            container.innerHTML = '';
            // 根據搜尋關鍵字與分類篩選清單
            let searchTerm = '';
            ['herbComboSearch', 'searchHerbCombo', 'searchHerbCombination', 'herbComboSearchInput'].some(id => {
              const el = document.getElementById(id);
              if (el) {
                searchTerm = (el.value || '').trim().toLowerCase();
                return true;
              }
              return false;
            });
            let selectedCategory = 'all';
            ['herbComboCategoryFilter', 'herbComboCategory', 'herbComboCategorySelect'].some(id => {
              const el = document.getElementById(id);
              if (el) {
                selectedCategory = el.value;
                return true;
              }
              return false;
            });
            let list = herbCombinations;
            if (searchTerm || (selectedCategory && selectedCategory !== 'all' && selectedCategory !== '')) {
              list = herbCombinations.filter(item => {
                let matchesSearch = true;
                if (searchTerm) {
                  const nameMatch = item.name && item.name.toLowerCase().includes(searchTerm);
                  const descMatch = item.description && item.description.toLowerCase().includes(searchTerm);
                  const ingredientsMatch = Array.isArray(item.ingredients) && item.ingredients.some(ing => {
                    return ing && ing.name && ing.name.toLowerCase().includes(searchTerm);
                  });
                  matchesSearch = nameMatch || descMatch || ingredientsMatch;
                }
                let matchesCategory = true;
                if (selectedCategory && selectedCategory !== 'all' && selectedCategory !== '') {
                  matchesCategory = item.category === selectedCategory;
                }
                return matchesSearch && matchesCategory;
              });
            }
            // 過濾掉未命名的新建組合，避免顯示空白卡片
            list = Array.isArray(list)
              ? list.filter(item => item && item.name && String(item.name).trim() !== '')
              : [];
            if (!Array.isArray(list) || list.length === 0) {
              // 當列表為空時顯示提示，鼓勵使用者創建自己的組合。
              container.innerHTML = '<div class="w-full md:col-span-2 text-center text-gray-400 text-lg py-10">創建自己的組合</div>';
              return;
            }
            list.forEach(item => {
              const card = document.createElement('div');
              card.className = 'bg-white p-6 rounded-lg border-2 border-green-200';
              // 在卡片標題下方加入分類顯示。若沒有分類則顯示空字串。
              const category = item && item.category ? item.category : '';
              card.innerHTML = `
                <div class="flex justify-between items-start mb-3">
                  <div>
                    <h3 class="text-lg font-semibold text-green-800">${item.name}</h3>
                    <div class="text-xs text-green-600 mt-1">${category}</div>
                  </div>
                  <div class="flex gap-2">
                    <button class="text-blue-600 hover:text-blue-800 text-sm" onclick="showEditModal('herb', '${item.name}')">編輯</button>
                    <!-- 移除複製功能：僅保留編輯與刪除按鈕 -->
                    <button class="text-red-600 hover:text-red-800 text-sm" onclick="deleteHerbCombination(${item.id})">刪除</button>
                  </div>
                </div>
                <p class="text-gray-600 mb-3">${item.description}</p>
                <div class="text-sm text-gray-700 space-y-1">
                  ${item.ingredients.map(ing => {
                    // 始終在劑量後顯示單位「克」，如果劑量為空則不顯示單位
                    const dosage = ing && ing.dosage ? String(ing.dosage).trim() : '';
                    const displayDosage = dosage ? dosage + '克' : '';
                    return '<div class="flex justify-between"><span>' + (ing && ing.name ? ing.name : '') + '</span><span>' + displayDosage + '</span></div>';
                  }).join('')}
                </div>
                <!-- 使用頻率顯示已移除 -->
              `;
              container.appendChild(card);
            });
          }

          function addNewHerbCombination() {
            // 使用編輯介面新增藥方組合：建立一個空白項目並立即打開編輯視窗
            // 建立一個新的藥方組合，標記為 isNew 以便取消時移除
            const newItem = {
              id: Date.now(),
              // 新項目預設名稱為空，使用者可在編輯視窗中填寫
              name: '',
              // 預設分類採用個人慣用藥方組合分類，若無則回退至全域分類，如果兩者皆無則空字串
              category: (typeof herbComboCategories !== 'undefined' && herbComboCategories.length > 0)
                ? herbComboCategories[0]
                : ((typeof categories !== 'undefined' && categories.herbs && categories.herbs.length > 0) ? categories.herbs[0] : ''),
              description: '',
              ingredients: [],
              lastModified: new Date().toISOString().split('T')[0],
              // 標記此組合為新建，用於取消時回收
              isNew: true
            };
            // 將新組合暫存到列表
            herbCombinations.push(newItem);
            // 渲染並立即開啟編輯介面，讓使用者填寫詳細資料
            renderHerbCombinations();
            showEditModal('herb', newItem.name);
          }

          /* duplicateHerbCombination 函式已移除（未使用） */

          function deleteHerbCombination(id) {
            if (!confirm('確定要刪除此藥方組合嗎？')) return;
            herbCombinations = herbCombinations.filter(h => h.id !== id);
            renderHerbCombinations();
            // Persist changes for personal herb combinations
            if (typeof updatePersonalSettings === 'function') {
              try {
                updatePersonalSettings().catch((err) => console.error('更新個人設置失敗:', err));
              } catch (_e) {}
            }
          }

          // 渲染穴位組合
          function renderAcupointCombinations() {
            // 根據搜尋關鍵字與分類篩選並渲染個人慣用穴位組合。
            const container = document.getElementById('acupointCombinationsContainer');
            if (!container) return;
            container.innerHTML = '';
            // 取得搜尋字串，支援多個可能的輸入框 ID。
            let searchTerm = '';
            ['acupointComboSearch', 'searchAcupointCombo', 'acupointComboSearchInput'].some(id => {
              const el = document.getElementById(id);
              if (el) {
                searchTerm = (el.value || '').trim().toLowerCase();
                return true;
              }
              return false;
            });
            // 取得分類篩選值，預設為 'all'。
            let selectedCategory = 'all';
            ['acupointComboCategoryFilter', 'acupointComboCategory', 'acupointComboCategorySelect'].some(id => {
              const el = document.getElementById(id);
              if (el) {
                selectedCategory = el.value;
                return true;
              }
              return false;
            });
            // 篩選資料：依據搜尋字串和分類。
            let list = acupointCombinations;
            if (searchTerm || (selectedCategory && selectedCategory !== 'all' && selectedCategory !== '')) {
              list = acupointCombinations.filter(item => {
                // 搜尋：比對名稱、針法與穴位名稱或類型。
                let matchesSearch = true;
                if (searchTerm) {
                  const nameMatch = (item.name && item.name.toLowerCase().includes(searchTerm));
                  const techniqueMatch = (item.technique && item.technique.toLowerCase().includes(searchTerm));
                  const pointsMatch = Array.isArray(item.points) && item.points.some(pt => {
                    const nm = pt && pt.name && pt.name.toLowerCase().includes(searchTerm);
                    const ty = pt && pt.type && pt.type.toLowerCase().includes(searchTerm);
                    return nm || ty;
                  });
                  matchesSearch = nameMatch || techniqueMatch || pointsMatch;
                }
                // 分類條件：只有在選定特定分類時才生效。
                let matchesCategory = true;
                if (selectedCategory && selectedCategory !== 'all' && selectedCategory !== '') {
                  matchesCategory = item.category === selectedCategory;
                }
                return matchesSearch && matchesCategory;
              });
            }
            // 過濾掉未命名的新建組合，避免顯示空白卡片
            list = Array.isArray(list)
              ? list.filter(item => item && item.name && String(item.name).trim() !== '')
              : [];
            // 若無資料顯示提示。
            if (!Array.isArray(list) || list.length === 0) {
              // 顯示背景文字提示，鼓勵使用者創建自己的穴位組合。
              container.innerHTML = '<div class="w-full md:col-span-2 text-center text-gray-400 text-lg py-10">創建自己的組合</div>';
              return;
            }
            // 渲染篩選後的結果。
            list.forEach(item => {
              const card = document.createElement('div');
              card.className = 'bg-white p-6 rounded-lg border-2 border-blue-200';
              // 在標題下方加入分類顯示。若沒有分類則顯示空字串。
              const category = item && item.category ? item.category : '';
              card.innerHTML = `
                <div class="flex justify-between items-start mb-3">
                  <div>
                    <h3 class="text-lg font-semibold text-blue-800">${item.name}</h3>
                    <div class="text-xs text-blue-600 mt-1">${category}</div>
                  </div>
                  <div class="flex gap-2">
                    <button class="text-blue-600 hover:text-blue-800 text-sm" onclick="showEditModal('acupoint', '${item.name}')">編輯</button>
                    <!-- 移除複製功能：僅保留編輯與刪除按鈕 -->
                    <button class="text-red-600 hover:text-red-800 text-sm" onclick="deleteAcupointCombination(${item.id})">刪除</button>
                  </div>
                </div>
                <div class="text-sm text-gray-700 space-y-1">
                  ${item.points.map(pt => '<div class="flex justify-between items-center"><span class="text-gray-700">' + pt.name + '</span><span class="text-sm bg-gray-100 text-gray-600 px-2 py-1 rounded">' + pt.type + '</span></div>').join('')}
                </div>
                <div class="mt-3 pt-3 border-t border-gray-200 text-sm text-gray-600">
                  <p>針法：${item.technique}</p>
                </div>
              `;
              container.appendChild(card);
            });
          }

          function addNewAcupointCombination() {
            // 使用編輯介面新增穴位組合：建立一個空白項目並立即打開編輯視窗
            // 建立一個新的穴位組合，標記為 isNew 以便取消時移除
            const newItem = {
              id: Date.now(),
              name: '',
              // 預設分類採用個人慣用穴位組合分類，若無則回退至全域分類，如果兩者皆無則空字串
              category: (typeof acupointComboCategories !== 'undefined' && acupointComboCategories.length > 0)
                ? acupointComboCategories[0]
                : ((typeof categories !== 'undefined' && categories.acupoints && categories.acupoints.length > 0) ? categories.acupoints[0] : ''),
              points: [],
              technique: '',
              frequency: '低',
              lastModified: new Date().toISOString().split('T')[0],
              isNew: true
            };
            // 將新組合暫存到列表
            acupointCombinations.push(newItem);
            renderAcupointCombinations();
            showEditModal('acupoint', newItem.name);
          }

          /* duplicateAcupointCombination 函式已移除（未使用） */

          function deleteAcupointCombination(id) {
            if (!confirm('確定要刪除此穴位組合嗎？')) return;
            acupointCombinations = acupointCombinations.filter(a => a.id !== id);
            renderAcupointCombinations();
            // Persist changes for personal acupoint combinations
            if (typeof updatePersonalSettings === 'function') {
              try {
                updatePersonalSettings().catch((err) => console.error('更新個人設置失敗:', err));
              } catch (_e) {}
            }
          }

        /**
         * 初始化個人常用中藥與穴位組合的搜尋與分類篩選界面。
         * 此函式會在個人設定介面上動態插入搜尋框與分類下拉選單，
         * 並根據當前的個人分類（herbComboCategories、acupointComboCategories）
         * 產生選項。若已存在對應的元素，將會更新其選項內容。
         *
         * 調用本函式可確保搜尋與分類介面與最新分類保持同步。
         */
        function setupPersonalComboSearchAndFilter() {
          try {
            // 中藥組合區域：若畫面已含搜尋輸入框與分類下拉選單，僅更新選項；否則建立之
            const herbContainer = document.getElementById('herbCombinationsContainer');
            if (herbContainer) {
              const existingSearch = document.getElementById('herbComboSearchInput');
              const existingSelect = document.getElementById('herbComboCategoryFilter');
              if (existingSearch && existingSelect) {
                // 清空現有分類選項後重新建立，以符合最新分類
                existingSelect.innerHTML = '';
                const defaultOpt = document.createElement('option');
                defaultOpt.value = 'all';
                defaultOpt.textContent = '全部分類';
                existingSelect.appendChild(defaultOpt);
                const herbCats = (typeof herbComboCategories !== 'undefined' && Array.isArray(herbComboCategories) && herbComboCategories.length > 0)
                  ? herbComboCategories
                  : ((categories && Array.isArray(categories.herbs)) ? categories.herbs : []);
                herbCats.forEach(cat => {
                  const opt = document.createElement('option');
                  opt.value = cat;
                  opt.textContent = cat;
                  existingSelect.appendChild(opt);
                });
                // 不重複綁定事件，事件監聽在初始化後會統一添加
              } else {
                // 若尚未建立搜尋區塊（例如舊畫面），維持原先邏輯建立搜索欄與分類選單
                let herbWrapper = document.getElementById('herbComboSearchWrapper');
                if (!herbWrapper) {
                  herbWrapper = document.createElement('div');
                  herbWrapper.id = 'herbComboSearchWrapper';
                  herbWrapper.className = 'flex flex-wrap gap-2 mb-4';
                  herbContainer.parentNode.insertBefore(herbWrapper, herbContainer);
                }
                herbWrapper.innerHTML = '';
                const herbSearchInput = document.createElement('input');
                herbSearchInput.id = 'herbComboSearchInput';
                herbSearchInput.className = 'px-3 py-2 border border-gray-300 rounded flex-1';
                herbSearchInput.placeholder = '搜索常用藥方...';
                herbWrapper.appendChild(herbSearchInput);
                const herbSelect = document.createElement('select');
                herbSelect.id = 'herbComboCategoryFilter';
                herbSelect.className = 'px-3 py-2 border border-gray-300 rounded';
                const defOpt = document.createElement('option');
                defOpt.value = 'all';
                defOpt.textContent = '全部分類';
                herbSelect.appendChild(defOpt);
                const herbCats2 = (typeof herbComboCategories !== 'undefined' && Array.isArray(herbComboCategories) && herbComboCategories.length > 0)
                  ? herbComboCategories
                  : ((categories && Array.isArray(categories.herbs)) ? categories.herbs : []);
                herbCats2.forEach(cat => {
                  const opt = document.createElement('option');
                  opt.value = cat;
                  opt.textContent = cat;
                  herbSelect.appendChild(opt);
                });
                herbWrapper.appendChild(herbSelect);
                // 為新建立的搜尋與分類選單綁定事件，以即時刷新列表
                try {
                  herbSearchInput.addEventListener('input', function() {
                    if (typeof renderHerbCombinations === 'function') {
                      renderHerbCombinations();
                    }
                  });
                } catch (_e) {}
                try {
                  herbSelect.addEventListener('change', function() {
                    if (typeof renderHerbCombinations === 'function') {
                      renderHerbCombinations();
                    }
                  });
                } catch (_e) {}
              }
            }
            // 穴位組合區域：若畫面已有搜尋輸入框與分類下拉選單，僅更新選項；否則建立之
            const acupointContainer = document.getElementById('acupointCombinationsContainer');
            if (acupointContainer) {
              const existingAcuSearch = document.getElementById('acupointComboSearchInput');
              const existingAcuSelect = document.getElementById('acupointComboCategoryFilter');
              if (existingAcuSearch && existingAcuSelect) {
                existingAcuSelect.innerHTML = '';
                const acuDefaultOpt = document.createElement('option');
                acuDefaultOpt.value = 'all';
                acuDefaultOpt.textContent = '全部分類';
                existingAcuSelect.appendChild(acuDefaultOpt);
                const acuCats = (typeof acupointComboCategories !== 'undefined' && Array.isArray(acupointComboCategories) && acupointComboCategories.length > 0)
                  ? acupointComboCategories
                  : ((categories && Array.isArray(categories.acupoints)) ? categories.acupoints : []);
                acuCats.forEach(cat => {
                  const opt = document.createElement('option');
                  opt.value = cat;
                  opt.textContent = cat;
                  existingAcuSelect.appendChild(opt);
                });
                // 不重複綁定事件；統一在其他地方綁定
              } else {
                // 舊邏輯建立
                let acuWrapper = document.getElementById('acupointComboSearchWrapper');
                if (!acuWrapper) {
                  acuWrapper = document.createElement('div');
                  acuWrapper.id = 'acupointComboSearchWrapper';
                  acuWrapper.className = 'flex flex-wrap gap-2 mb-4';
                  acupointContainer.parentNode.insertBefore(acuWrapper, acupointContainer);
                }
                acuWrapper.innerHTML = '';
                const acuSearchInput = document.createElement('input');
                acuSearchInput.id = 'acupointComboSearchInput';
                acuSearchInput.className = 'px-3 py-2 border border-gray-300 rounded flex-1';
                acuSearchInput.placeholder = '搜索常用穴位組合...';
                acuWrapper.appendChild(acuSearchInput);
                const acuSelect = document.createElement('select');
                acuSelect.id = 'acupointComboCategoryFilter';
                acuSelect.className = 'px-3 py-2 border border-gray-300 rounded';
                const acuDefOpt = document.createElement('option');
                acuDefOpt.value = 'all';
                acuDefOpt.textContent = '全部分類';
                acuSelect.appendChild(acuDefOpt);
                const acuCats2 = (typeof acupointComboCategories !== 'undefined' && Array.isArray(acupointComboCategories) && acupointComboCategories.length > 0)
                  ? acupointComboCategories
                  : ((categories && Array.isArray(categories.acupoints)) ? categories.acupoints : []);
                acuCats2.forEach(cat => {
                  const opt = document.createElement('option');
                  opt.value = cat;
                  opt.textContent = cat;
                  acuSelect.appendChild(opt);
                });
                acuWrapper.appendChild(acuSelect);
                // 綁定事件至新建立的穴位搜尋與分類選單
                try {
                  acuSearchInput.addEventListener('input', function() {
                    if (typeof renderAcupointCombinations === 'function') {
                      renderAcupointCombinations();
                    }
                  });
                } catch (_e) {}
                try {
                  acuSelect.addEventListener('change', function() {
                    if (typeof renderAcupointCombinations === 'function') {
                      renderAcupointCombinations();
                    }
                  });
                } catch (_e) {}
              }
            }
          } catch (error) {
            console.error('初始化個人組合搜尋分類介面錯誤:', error);
          }
        }

          // -----------------------------------------------------------------------------
          // 個人設置相關函式與常用組合載入
          //
          // 讀取並保存當前用戶的個人設置（慣用中藥組合及穴位組合）到 Firebase。
          // 這些函式不會阻塞主要流程，但會在登入後載入使用者的個人設定，
          // 並在任何修改時更新至 Firestore。也提供 UI 彈窗讓診症時快速載入
          // 慣用組合。

          /**
           * 從 Firestore 載入當前用戶的個人設置，包括慣用中藥組合與穴位組合。
           * 如果未找到任何設定，則使用當前的預設數據或維持空陣列。
           */
          async function loadPersonalSettings() {
            try {
              // 等待 Firebase 與資料管理器初始化
              await waitForFirebaseDb();
              await waitForFirebaseDataManager();
              // 若沒有當前用戶資料，直接結束
              if (!currentUserData || !currentUserData.id) {
                return;
              }
              /*
               * 優先嘗試利用 Firestore 的 getDoc API 直接讀取當前用戶的文件，
               * 以避免拉取所有用戶資料。如果 getDoc 不存在或失敗，則退回
               * 到透過 FirebaseDataManager.getUsers() 取得用戶清單後再篩選，
               * 以確保兼容舊環境。
               */
              let userRecord = null;
              // 嘗試直接讀取當前用戶的文件
              try {
                if (window.firebase && window.firebase.getDoc && window.firebase.doc) {
                  const docRef = window.firebase.doc(window.firebase.db, 'users', String(currentUserData.id));
                  const docSnap = await window.firebase.getDoc(docRef);
                  if (docSnap && docSnap.exists()) {
                    userRecord = { id: docSnap.id, ...docSnap.data() };
                  }
                }
              } catch (err) {
                console.error('直接讀取用戶文件時發生錯誤:', err);
              }
              // 若無法直接取得，改為從用戶清單中篩選
              if (!userRecord) {
                try {
                  const usersResult = await window.firebaseDataManager.getUsers();
                  if (usersResult && usersResult.success && Array.isArray(usersResult.data)) {
                    userRecord = usersResult.data.find(u => {
                      const idMatches = u && u.id !== undefined && currentUserData.id !== undefined;
                      return idMatches && String(u.id) === String(currentUserData.id);
                    });
                  }
                } catch (err) {
                  console.error('讀取用戶資料時發生錯誤:', err);
                }
              }
              if (userRecord && userRecord.personalSettings) {
                const personal = userRecord.personalSettings;
                if (Array.isArray(personal.herbCombinations)) {
                  herbCombinations = personal.herbCombinations;
                }
                if (Array.isArray(personal.acupointCombinations)) {
                  acupointCombinations = personal.acupointCombinations;
                }
                // 個人慣用組合分類載入：若 personalSettings 中包含分類，則覆蓋預設值
                if (Array.isArray(personal.herbComboCategories)) {
                  // 更新個人慣用分類
                  herbComboCategories = personal.herbComboCategories;
                  window.herbComboCategories = herbComboCategories;
                  try {
                    // 同步至全域 categories，確保管理分類彈窗能顯示已保存分類
                    categories.herbs = [...herbComboCategories];
                    if (window.categories && Array.isArray(window.categories.herbs)) {
                      window.categories.herbs = categories.herbs;
                    }
                  } catch (_e) {}
                }
                if (Array.isArray(personal.acupointComboCategories)) {
                  // 更新個人慣用分類
                  acupointComboCategories = personal.acupointComboCategories;
                  window.acupointComboCategories = acupointComboCategories;
                  try {
                    // 同步至全域 categories，確保管理分類彈窗能顯示已保存分類
                    categories.acupoints = [...acupointComboCategories];
                    if (window.categories && Array.isArray(window.categories.acupoints)) {
                      window.categories.acupoints = categories.acupoints;
                    }
                  } catch (_e) {}
                }
              }
            } catch (error) {
              console.error('讀取個人設置失敗:', error);
            } finally {
              // 渲染 UI 以反映載入結果
              try {
                if (typeof renderHerbCombinations === 'function') {
                  renderHerbCombinations();
                }
                if (typeof renderAcupointCombinations === 'function') {
                  renderAcupointCombinations();
                }
                // 在載入個人設定後刷新搜尋與分類介面，確保選單與最新資料同步
                if (typeof setupPersonalComboSearchAndFilter === 'function') {
                  try {
                    setupPersonalComboSearchAndFilter();
                  } catch (_e) {}
                }
              } catch (e) {
                console.error('渲染個人設置失敗:', e);
              }
            }
          }

          /**
           * 將當前的個人設置保存至 Firestore。
           * 包含慣用中藥組合和慣用穴位組合。
           */
          async function updatePersonalSettings() {
            try {
              await waitForFirebaseDb();
              if (!currentUserData || !currentUserData.id) {
                return;
              }
              await window.firebase.updateDoc(
                window.firebase.doc(window.firebase.db, 'users', String(currentUserData.id)),
                {
                  personalSettings: {
                    herbCombinations: Array.isArray(herbCombinations) ? herbCombinations : [],
                    acupointCombinations: Array.isArray(acupointCombinations) ? acupointCombinations : [],
                    // 保存個人分類：中藥組合分類與穴位組合分類
                    herbComboCategories: Array.isArray(herbComboCategories) ? herbComboCategories : [],
                    acupointComboCategories: Array.isArray(acupointComboCategories) ? acupointComboCategories : []
                  },
                  updatedAt: new Date(),
                  updatedBy: currentUser || 'system'
                }
              );
            } catch (error) {
              console.error('更新個人設置至 Firestore 失敗:', error);
            }
          }

          /**
           * 顯示常用藥方組合選擇彈窗。列出所有個人慣用中藥組合供選擇。
           */
          function showHerbComboModal() {
            try {
              const modal = document.getElementById('herbComboModal');
              const listContainer = document.getElementById('herbComboList');
              if (!modal || !listContainer) return;
              // 在列表上方放置搜尋欄，若尚未存在則建立
              let searchInput = modal.querySelector('#herbComboSearch');
              if (!searchInput) {
                searchInput = document.createElement('input');
                searchInput.id = 'herbComboSearch';
                searchInput.type = 'text';
                searchInput.placeholder = '搜尋常用藥方...';
                searchInput.className = 'w-full mb-3 px-3 py-2 border border-gray-300 rounded';
                listContainer.parentNode.insertBefore(searchInput, listContainer);
                searchInput.addEventListener('input', function() {
                  // 重新渲染列表
                  showHerbComboModal();
                });
              }
              listContainer.innerHTML = '';
              // 過濾掉名稱為空白或未命名的組合，避免顯示錯誤資料
              let combos = Array.isArray(herbCombinations)
                ? herbCombinations.filter(c => c && c.name && String(c.name).trim() !== '')
                : [];
              // 取得搜尋關鍵字
              const herbKeyword = searchInput.value ? String(searchInput.value).trim().toLowerCase() : '';
              if (herbKeyword) {
                combos = combos.filter(combo => {
                  const nameStr = combo.name ? combo.name.toLowerCase() : '';
                  // 搜尋名稱或原料
                  let ingredientsStr = '';
                  if (Array.isArray(combo.ingredients)) {
                    ingredientsStr = combo.ingredients.map(ing => (ing && ing.name ? String(ing.name).toLowerCase() : '')).join(' ');
                  }
                  return nameStr.includes(herbKeyword) || ingredientsStr.includes(herbKeyword);
                });
              }
              if (combos.length === 0) {
                listContainer.innerHTML = '<div class="text-center text-gray-500">尚未設定常用藥方組合</div>';
              } else {
                // 依名稱排序
                combos = combos.slice().sort((a, b) => {
                  const an = a && a.name ? a.name : '';
                  const bn = b && b.name ? b.name : '';
                  return an.localeCompare(bn, 'zh-Hans-CN', { sensitivity: 'base' });
                });
                combos.forEach(combo => {
                  const itemDiv = document.createElement('div');
                  itemDiv.className = 'p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer';
                  // 對名稱與原料進行轉義，避免 XSS
                  const safeComboName = combo.name ? window.escapeHtml(combo.name) : '';
                  const ingredientsText = (combo.ingredients && combo.ingredients.length > 0)
                    ? combo.ingredients.map(ing => {
                        const name = ing && ing.name ? window.escapeHtml(ing.name) : '';
                        if (ing && ing.dosage) {
                          // 將劑量也轉義
                          const safeDosage = window.escapeHtml(String(ing.dosage));
                          return name + '(' + safeDosage + '克)';
                        }
                        return name;
                      }).join('、')
                    : '';
                  itemDiv.innerHTML = `
                    <div class="font-semibold text-gray-800 mb-1">${safeComboName}</div>
                    <div class="text-sm text-gray-600">${ingredientsText}</div>
                  `;
                  itemDiv.onclick = function() {
                    selectHerbCombo(combo.id);
                  };
                  listContainer.appendChild(itemDiv);
                });
              }
              modal.classList.remove('hidden');
            } catch (error) {
              console.error('顯示常用藥方彈窗錯誤:', error);
            }
          }

          function hideHerbComboModal() {
            const modal = document.getElementById('herbComboModal');
            if (modal) modal.classList.add('hidden');
          }

          /**
           * 當選擇某個常用藥方組合時，將其藥材加入當前處方。
           * @param {number} comboId 組合的 ID
           */
          function selectHerbCombo(comboId) {
            try {
              const combo = herbCombinations.find(c => String(c.id) === String(comboId));
              if (!combo) return;
              hideHerbComboModal();
              if (!Array.isArray(combo.ingredients) || combo.ingredients.length === 0) return;
              combo.ingredients.forEach(ing => {
                if (!ing || !ing.name) return;
                const item = herbLibrary.find(h => h.name === ing.name);
                if (item) {
                  addToPrescription(item.type, item.id);
                  try {
                    const lastIndex = selectedPrescriptionItems.length - 1;
                    if (lastIndex >= 0 && ing.dosage) {
                      const numeric = String(ing.dosage).match(/[0-9.]+/);
                      selectedPrescriptionItems[lastIndex].customDosage = numeric ? numeric[0] : selectedPrescriptionItems[lastIndex].customDosage;
                    }
                  } catch (_e) {}
                } else {
                  const numeric = ing.dosage ? String(ing.dosage).match(/[0-9.]+/) : null;
                  selectedPrescriptionItems.push({
                    id: Date.now() + Math.random(),
                    type: 'herb',
                    name: ing.name,
                    dosage: ing.dosage || '',
                    customDosage: numeric ? numeric[0] : '6',
                    composition: null,
                    effects: ''
                  });
                }
              });
              updatePrescriptionDisplay();
              showToast('已載入常用藥方組合：' + combo.name, 'success');
            } catch (error) {
              console.error('載入常用藥方組合錯誤:', error);
            }
          }

          /**
           * 顯示常用穴位組合選擇彈窗。
           */
          function showAcupointComboModal() {
            try {
              const modal = document.getElementById('acupointComboModal');
              const listContainer = document.getElementById('acupointComboList');
              if (!modal || !listContainer) return;
              // 在列表上方放置搜尋欄，若尚未存在則建立
              let searchInput = modal.querySelector('#acupointComboSearch');
              if (!searchInput) {
                searchInput = document.createElement('input');
                searchInput.id = 'acupointComboSearch';
                searchInput.type = 'text';
                searchInput.placeholder = '搜尋常用穴位...';
                searchInput.className = 'w-full mb-3 px-3 py-2 border border-gray-300 rounded';
                listContainer.parentNode.insertBefore(searchInput, listContainer);
                searchInput.addEventListener('input', function() {
                  showAcupointComboModal();
                });
              }
              listContainer.innerHTML = '';
              let combos = Array.isArray(acupointCombinations)
                ? acupointCombinations.filter(c => c && c.name && String(c.name).trim() !== '')
                : [];
              // 搜尋關鍵字
              const acuKeyword = searchInput.value ? String(searchInput.value).trim().toLowerCase() : '';
              if (acuKeyword) {
                combos = combos.filter(combo => {
                  const nameStr = combo.name ? combo.name.toLowerCase() : '';
                  // 將穴位名稱與類型串起來供搜尋
                  let pointsStr = '';
                  if (Array.isArray(combo.points)) {
                    pointsStr = combo.points.map(pt => {
                      const n = pt && pt.name ? String(pt.name).toLowerCase() : '';
                      const t = pt && pt.type ? String(pt.type).toLowerCase() : '';
                      return n + t;
                    }).join(' ');
                  }
                  const techniqueStr = combo.technique ? String(combo.technique).toLowerCase() : '';
                  return nameStr.includes(acuKeyword) || pointsStr.includes(acuKeyword) || techniqueStr.includes(acuKeyword);
                });
              }
              if (combos.length === 0) {
                listContainer.innerHTML = '<div class="text-center text-gray-500">尚未設定常用穴位組合</div>';
              } else {
                // 依名稱排序
                combos = combos.slice().sort((a, b) => {
                  const an = a && a.name ? a.name : '';
                  const bn = b && b.name ? b.name : '';
                  return an.localeCompare(bn, 'zh-Hans-CN', { sensitivity: 'base' });
                });
                combos.forEach(combo => {
                  const itemDiv = document.createElement('div');
                  itemDiv.className = 'p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer';
                  const pointsText = (combo.points && combo.points.length > 0)
                    ? combo.points.map(pt => {
                        const pName = pt && pt.name ? window.escapeHtml(pt.name) : '';
                        const pType = pt && pt.type ? window.escapeHtml(pt.type) : '';
                        return pName + (pType ? '(' + pType + ')' : '');
                      }).join('、')
                    : '';
                  const safeComboName = combo.name ? window.escapeHtml(combo.name) : '';
                  itemDiv.innerHTML = `
                    <div class="font-semibold text-gray-800 mb-1">${safeComboName}</div>
                    <div class="text-sm text-gray-600">${pointsText}</div>
                  `;
                  itemDiv.onclick = function() {
                    selectAcupointCombo(combo.id);
                  };
                  listContainer.appendChild(itemDiv);
                });
              }
              modal.classList.remove('hidden');
            } catch (error) {
              console.error('顯示常用穴位彈窗錯誤:', error);
            }
          }

          function hideAcupointComboModal() {
            const modal = document.getElementById('acupointComboModal');
            if (modal) modal.classList.add('hidden');
          }

          /**
           * 當選擇某個常用穴位組合時，將其內容填入針灸備註欄。
           * @param {number} comboId 組合的 ID
           */
          function selectAcupointCombo(comboId) {
            try {
              const combo = acupointCombinations.find(c => String(c.id) === String(comboId));
              if (!combo) return;
              hideAcupointComboModal();
              let note = '';
              if (Array.isArray(combo.points) && combo.points.length > 0) {
                note += combo.points.map(pt => pt.name + (pt.type ? '(' + pt.type + ')' : '')).join('、');
              }
              if (combo.technique) {
                if (note.length > 0) note += '，';
                note += '針法：' + combo.technique;
              }
              const textarea = document.getElementById('formAcupunctureNotes');
              if (textarea) {
                textarea.value = note;
              }
              showToast('已載入常用穴位組合：' + combo.name, 'success');
            } catch (error) {
              console.error('載入常用穴位組合錯誤:', error);
            }
          }


          // 渲染醫囑模板
          function renderPrescriptionTemplates(list) {
            const container = document.getElementById('prescriptionTemplatesContainer');
            container.innerHTML = '';
            // 使用傳入的列表，若未提供則使用全域列表
            // 取得要顯示的模板列表；若傳入特定列表則使用之，否則使用全域列表。
            // 為避免在使用新增功能時未按保存便顯示空白模板，
            // 我們過濾掉標記為 isNew 的項目。這些項目僅在保存後才顯示。
            const templates = Array.isArray(list) ? list : prescriptionTemplates;
            const displayTemplates = Array.isArray(templates)
              ? templates.filter(t => !t.isNew)
              : [];
            displayTemplates.forEach(item => {
              const card = document.createElement('div');
              card.className = 'bg-white p-6 rounded-lg border-2 border-purple-200';
              card.innerHTML = `
                <div class="flex justify-between items-start mb-3">
                  <div>
                    <h3 class="text-lg font-semibold text-purple-800">${item.name}</h3>
                    <div class="flex gap-2 mt-1">
                      <span class="text-sm bg-purple-100 text-purple-700 px-2 py-1 rounded">${item.category}</span>
                      <span class="text-sm bg-blue-100 text-blue-700 px-2 py-1 rounded">療程: ${item.duration}</span>
                      <span class="text-sm bg-orange-100 text-orange-700 px-2 py-1 rounded">複診: ${item.followUp}</span>
                    </div>
                  </div>
                  <div class="flex gap-2">
                    <button class="text-blue-600 hover:text-blue-800" onclick="showEditModal('prescription', '${item.name}')">編輯</button>
                    <!-- 移除複製按鈕，避免模板被重複複製。僅保留編輯與刪除操作 -->
                    <button class="text-red-600 hover:text-red-800" onclick="deletePrescriptionTemplate(${item.id})">刪除</button>
                  </div>
                </div>
                <div class="bg-gray-50 p-4 rounded-lg text-gray-700">
                  ${item.content.split('\n').map(p => '<p class="mb-2">' + p + '</p>').join('')}
                </div>
              `;
              container.appendChild(card);
            });
          }

          function addNewPrescriptionTemplate() {
            // 使用編輯介面新增醫囑模板：建立空白項目並開啟編輯介面
            const newItem = {
              id: Date.now(),
              name: '',
              category: (typeof categories !== 'undefined' && categories.prescriptions && categories.prescriptions.length > 0) ? categories.prescriptions[0] : '',
              duration: '',
              followUp: '',
              content: '',
              note: '',
              lastModified: new Date().toISOString().split('T')[0],
              // 標記為新建項目，用於取消時移除
              isNew: true
            };
            prescriptionTemplates.push(newItem);
            renderPrescriptionTemplates();
            showEditModal('prescription', newItem.name);
          }

          /* duplicatePrescriptionTemplate 函式已移除（未使用） */

          async function deletePrescriptionTemplate(id) {
            if (!confirm('確定要刪除此醫囑模板嗎？')) return;
            prescriptionTemplates = prescriptionTemplates.filter(p => p.id !== id);
            // 從 Firestore 中刪除該醫囑模板
            try {
              await window.firebase.deleteDoc(
                window.firebase.doc(window.firebase.db, 'prescriptionTemplates', String(id))
              );
            } catch (error) {
              console.error('刪除醫囑模板資料至 Firestore 失敗:', error);
            }
            renderPrescriptionTemplates();
          }

          // 渲染診斷模板
          function renderDiagnosisTemplates(list) {
            const container = document.getElementById('diagnosisTemplatesContainer');
            container.innerHTML = '';
            // 使用傳入的列表，若未提供則使用全域列表
            // 取得要顯示的診斷模板列表；若傳入特定列表則使用之，否則使用全域列表。
            // 過濾掉尚未儲存（isNew 為 true）的項目，避免在點擊新增後立即顯示空白模板。
            const templates = Array.isArray(list) ? list : diagnosisTemplates;
            const displayTemplates = Array.isArray(templates)
              ? templates.filter(t => !t.isNew)
              : [];
            displayTemplates.forEach(item => {
              const card = document.createElement('div');
              card.className = 'bg-white p-6 rounded-lg border-2 border-orange-200';
              // Build display content for diagnosis template fields.
              let contentHtml = '';
              if (item.chiefComplaint || item.currentHistory || item.tongue || item.pulse || item.tcmDiagnosis || item.syndromeDiagnosis) {
                const parts = [];
                if (item.chiefComplaint) {
                  parts.push('<p class="mb-2"><strong>主訴：</strong>' + String(item.chiefComplaint).split('\n').map(l => l).join('<br>') + '</p>');
                }
                if (item.currentHistory) {
                  parts.push('<p class="mb-2"><strong>現病史：</strong>' + String(item.currentHistory).split('\n').map(l => l).join('<br>') + '</p>');
                }
                if (item.tongue) {
                  parts.push('<p class="mb-2"><strong>舌象：</strong>' + String(item.tongue).split('\n').map(l => l).join('<br>') + '</p>');
                }
                if (item.pulse) {
                  parts.push('<p class="mb-2"><strong>脈象：</strong>' + String(item.pulse).split('\n').map(l => l).join('<br>') + '</p>');
                }
                if (item.tcmDiagnosis) {
                  parts.push('<p class="mb-2"><strong>中醫診斷：</strong>' + String(item.tcmDiagnosis).split('\n').map(l => l).join('<br>') + '</p>');
                }
                if (item.syndromeDiagnosis) {
                  parts.push('<p class="mb-2"><strong>證型診斷：</strong>' + String(item.syndromeDiagnosis).split('\n').map(l => l).join('<br>') + '</p>');
                }
                contentHtml = parts.join('');
              } else if (item.content) {
                contentHtml = item.content.split('\n').map(p => '<p class="mb-2">' + p + '</p>').join('');
              }
              card.innerHTML = `
                <div class="flex justify-between items-start mb-3">
                  <div>
                    <h3 class="text-lg font-semibold text-orange-800">${item.name}</h3>
                    <div class="flex gap-2 mt-1">
                      <span class="text-sm bg-orange-100 text-orange-700 px-2 py-1 rounded">${item.category}</span>
                    </div>
                  </div>
                  <div class="flex gap-2">
                    <button class="text-blue-600 hover:text-blue-800" onclick="showEditModal('diagnosis', '${item.name}')">編輯</button>
                    <!-- 移除複製按鈕，避免模板被重複複製。僅保留編輯與刪除操作 -->
                    <button class="text-red-600 hover:text-red-800" onclick="deleteDiagnosisTemplate(${item.id})">刪除</button>
                  </div>
                </div>
                <div class="bg-gray-50 p-4 rounded-lg text-gray-700">
                  ${contentHtml}
                </div>
              `;
              container.appendChild(card);
            });
          }

          function addNewDiagnosisTemplate() {
            // 使用編輯介面新增診斷模板：建立空白項目並開啟編輯介面
            const newItem = {
              id: Date.now(),
              name: '',
              category: (typeof categories !== 'undefined' && categories.diagnosis && categories.diagnosis.length > 0) ? categories.diagnosis[0] : '',
              // 新增診斷模板欄位：主訴、現病史、舌象、脈象、中醫診斷、證型診斷
              chiefComplaint: '',
              currentHistory: '',
              tongue: '',
              pulse: '',
              tcmDiagnosis: '',
              syndromeDiagnosis: '',
              lastModified: new Date().toISOString().split('T')[0],
              // 標記為新建項目，用於取消時移除
              isNew: true
            };
            diagnosisTemplates.push(newItem);
            renderDiagnosisTemplates();
            showEditModal('diagnosis', newItem.name);
          }

          /* duplicateDiagnosisTemplate 函式已移除（未使用） */

          async function deleteDiagnosisTemplate(id) {
            if (!confirm('確定要刪除此診斷模板嗎？')) return;
            diagnosisTemplates = diagnosisTemplates.filter(d => d.id !== id);
            // 從 Firestore 中刪除該診斷模板
            try {
              await window.firebase.deleteDoc(
                window.firebase.doc(window.firebase.db, 'diagnosisTemplates', String(id))
              );
            } catch (error) {
              console.error('刪除診斷模板資料至 Firestore 失敗:', error);
            }
            renderDiagnosisTemplates();
          }

          /**
           * 初始化模板庫搜尋功能，綁定搜尋和分類變更事件。
           * 根據輸入的名稱關鍵字和選擇的分類篩選醫囑或診斷模板，並重新渲染列表。
           * 使用者輸入或選擇變更時即時觸發。
           */
          function setupTemplateLibrarySearch() {
            try {
              // 醫囑模板搜尋與分類
              const pInput = document.getElementById('prescriptionTemplateSearch');
              const pCategory = document.getElementById('prescriptionTemplateCategoryFilter');
              const filterPrescriptions = function() {
                const term = pInput ? pInput.value.trim().toLowerCase() : '';
                const cat = pCategory ? pCategory.value : '';
                let filtered = Array.isArray(prescriptionTemplates) ? prescriptionTemplates.filter(item => {
                  const name = (item.name || '').toLowerCase();
                  return name.includes(term);
                }) : [];
                // 若選擇非全部類別，則依據類別進一步篩選
                if (cat && cat !== '全部類別' && cat !== '全部分類') {
                  filtered = filtered.filter(item => item.category === cat);
                }
                renderPrescriptionTemplates(filtered);
              };
              if (pInput) {
                pInput.addEventListener('input', filterPrescriptions);
              }
              if (pCategory) {
                pCategory.addEventListener('change', filterPrescriptions);
              }

              // 診斷模板搜尋與分類
              const dInput = document.getElementById('diagnosisTemplateSearch');
              const dCategory = document.getElementById('diagnosisTemplateCategoryFilter');
              const filterDiagnosis = function() {
                const term = dInput ? dInput.value.trim().toLowerCase() : '';
                const cat = dCategory ? dCategory.value : '';
                let filtered = Array.isArray(diagnosisTemplates) ? diagnosisTemplates.filter(item => {
                  const name = (item.name || '').toLowerCase();
                  return name.includes(term);
                }) : [];
                if (cat && cat !== '全部科別' && cat !== '全部分類') {
                  filtered = filtered.filter(item => item.category === cat);
                }
                renderDiagnosisTemplates(filtered);
              };
              if (dInput) {
                dInput.addEventListener('input', filterDiagnosis);
              }
              if (dCategory) {
                dCategory.addEventListener('change', filterDiagnosis);
              }
            } catch (e) {
              console.error('初始化模板庫搜尋功能失敗:', e);
            }
          }

          // 切換個人設置標籤
          function switchPersonalTab(tabId) {
            const tabContents = document.querySelectorAll('.personal-tab-content');
            tabContents.forEach(content => content.classList.add('hidden'));
            if (tabId === 'herbs') {
              document.getElementById('herbsContent').classList.remove('hidden');
            } else if (tabId === 'acupoints') {
              document.getElementById('acupointsContent').classList.remove('hidden');
            }
            const tabButtons = ['herbsTab', 'acupointsTab'];
            tabButtons.forEach(buttonId => {
              const button = document.getElementById(buttonId);
              if (buttonId === tabId + 'Tab') {
                button.className = 'px-6 py-3 text-amber-700 border-b-2 border-amber-500 font-medium';
              } else {
                button.className = 'px-6 py-3 text-gray-500 hover:text-amber-700 font-medium';
              }
            });
          }

          // 切換模板庫標籤
          function switchTemplateTab(tabId) {
            const tabContents = document.querySelectorAll('.template-tab-content');
            tabContents.forEach(content => content.classList.add('hidden'));
            if (tabId === 'prescriptions') {
              document.getElementById('prescriptionsContent').classList.remove('hidden');
            } else if (tabId === 'diagnosis') {
              document.getElementById('diagnosisContent').classList.remove('hidden');
            }
            const tabButtons = ['prescriptionsTab', 'diagnosisTab'];
            tabButtons.forEach(buttonId => {
              const button = document.getElementById(buttonId);
              if (buttonId === tabId + 'Tab') {
                button.className = 'px-6 py-3 text-amber-700 border-b-2 border-amber-500 font-medium';
              } else {
                button.className = 'px-6 py-3 text-gray-500 hover:text-amber-700 font-medium';
              }
            });

            // 每次切換模板標籤時更新分類下拉選單，
            // 以便立即反映新增或刪除後的分類
            if (typeof refreshTemplateCategoryFilters === 'function') {
              try {
                refreshTemplateCategoryFilters();
              } catch (_e) {}
            }
          }

          // 顯示分類管理彈窗
          function showCategoryModal(type) {
            const modal = document.getElementById('categoryModal');
            const titleEl = document.getElementById('categoryModalTitle');
            const listEl = document.getElementById('categoryList');
            const titles = {
              herbs: '管理中藥分類',
              acupoints: '管理穴位分類',
              prescriptions: '管理醫囑分類',
              diagnosis: '管理診斷分類'
            };
            titleEl.textContent = titles[type] || '管理分類';
            modal.classList.remove('hidden');
            modal.dataset.type = type;
            // 渲染分類列表
            listEl.innerHTML = '';
            // 為 herbs 和 acupoints 選擇來源：若全域 categories 中有值則使用，否則使用個人分類
            let sourceList = [];
            try {
              if (type === 'herbs') {
                if (Array.isArray(categories.herbs) && categories.herbs.length > 0) {
                  sourceList = categories.herbs;
                } else if (Array.isArray(herbComboCategories) && herbComboCategories.length > 0) {
                  sourceList = herbComboCategories;
                }
              } else if (type === 'acupoints') {
                if (Array.isArray(categories.acupoints) && categories.acupoints.length > 0) {
                  sourceList = categories.acupoints;
                } else if (Array.isArray(acupointComboCategories) && acupointComboCategories.length > 0) {
                  sourceList = acupointComboCategories;
                }
              } else {
                // 其他分類（prescriptions, diagnosis）直接讀取全域 categories
                if (categories[type] && Array.isArray(categories[type])) {
                  sourceList = categories[type];
                }
              }
            } catch (_e) {
              // 若出現錯誤則保持空列表
            }
            // fallback: 若來源列表仍為空，嘗試使用 categories[type]
            if ((!sourceList || sourceList.length === 0) && categories[type] && Array.isArray(categories[type])) {
              sourceList = categories[type];
            }
            sourceList.forEach((cat, idx) => {
              const div = document.createElement('div');
              div.className = 'flex justify-between items-center p-3 bg-gray-50 rounded-lg';
              div.innerHTML = `
                <span class="text-gray-700">${cat}</span>
                <button onclick="removeCategory('${type}', ${idx})" class="text-red-600 hover:text-red-800 text-sm">刪除</button>
              `;
              listEl.appendChild(div);
            });
          }

          function hideCategoryModal() {
            document.getElementById('categoryModal').classList.add('hidden');
            document.getElementById('newCategoryInput').value = '';
          }

          function addCategory() {
            const input = document.getElementById('newCategoryInput');
            const type = document.getElementById('categoryModal').dataset.type;
            const newCategory = input.value.trim();
            // 將分類名稱統一轉為小寫並移除空白，用於檢查是否重複
            const normalizedNew = newCategory.replace(/\s+/g, '').toLowerCase();
            const hasDup = Array.isArray(categories[type]) && categories[type].some(cat => {
              return String(cat).replace(/\s+/g, '').toLowerCase() === normalizedNew;
            });
            if (newCategory && !hasDup) {
              // 推入未處理過的分類名稱，以保留使用者輸入的原始格式
              categories[type].push(newCategory);
              // 如為醫囑或診斷分類，刷新模板分類篩選下拉選單
              if (type === 'prescriptions' || type === 'diagnosis') {
                if (typeof refreshTemplateCategoryFilters === 'function') {
                  try {
                    refreshTemplateCategoryFilters();
                  } catch (_e) {}
                }
              }
              // 若修改的是中藥或穴位分類，更新個人慣用分類
              if (typeof refreshComboCategories === 'function') {
                refreshComboCategories(type);
              }
              showCategoryModal(type);
              input.value = '';
              // 將更新後的分類儲存至 Firebase 或本地
              if (typeof saveCategoriesToFirebase === 'function') {
                try {
                  saveCategoriesToFirebase().catch(err => console.error('保存分類資料失敗:', err));
                } catch (_e) {}
              }
              // 立即在 localStorage 中保存分類，避免非同步或 Firebase 不可用時資料遺失
              if (typeof persistCategoriesLocally === 'function') {
                try {
                  persistCategoriesLocally();
                } catch (_e) {}
              }
              // 如屬 herbs 或 acupoints，同步保存個人設定中的分類資料
              if ((type === 'herbs' || type === 'acupoints') && typeof updatePersonalSettings === 'function') {
                try {
                  updatePersonalSettings().catch(err => console.error('更新個人設置失敗:', err));
                } catch (_e) {}
              }
            }
          }

          function removeCategory(type, index) {
            if (confirm('確定要刪除此分類嗎？')) {
              // 先從全域分類中移除目標分類並取得被移除的名稱
              let removedArr = [];
              try {
                removedArr = categories[type].splice(index, 1);
              } catch (_e) {
                removedArr = [];
              }
              const removed = Array.isArray(removedArr) ? removedArr[0] : undefined;
              // 若修改的是中藥或穴位分類，則需同步更新個人慣用分類，移除已刪除的分類
              try {
                if (type === 'herbs' && Array.isArray(herbComboCategories)) {
                  if (removed !== undefined) {
                    herbComboCategories = herbComboCategories.filter(cat => cat !== removed);
                    window.herbComboCategories = herbComboCategories;
                  }
                } else if (type === 'acupoints' && Array.isArray(acupointComboCategories)) {
                  if (removed !== undefined) {
                    acupointComboCategories = acupointComboCategories.filter(cat => cat !== removed);
                    window.acupointComboCategories = acupointComboCategories;
                  }
                }
              } catch (_e) {}
              // 更新搜尋與分類選單，使 UI 立即反映最新的分類
              try {
                if (typeof refreshComboCategories === 'function') {
                  refreshComboCategories(type);
                }
                if (typeof setupPersonalComboSearchAndFilter === 'function') {
                  setupPersonalComboSearchAndFilter();
                }
              } catch (_e) {}
              // 若刪除的是醫囑或診斷分類，刷新模板分類篩選下拉選單
              if (type === 'prescriptions' || type === 'diagnosis') {
                if (typeof refreshTemplateCategoryFilters === 'function') {
                  try {
                    refreshTemplateCategoryFilters();
                  } catch (_e) {}
                }
              }
              // 重新渲染分類管理彈窗
              showCategoryModal(type);
              // 將更新後的分類儲存至 Firebase 或本地
              if (typeof saveCategoriesToFirebase === 'function') {
                try {
                  saveCategoriesToFirebase().catch(err => console.error('保存分類資料失敗:', err));
                } catch (_e) {}
              }
              // 立即在 localStorage 中保存分類，避免非同步或 Firebase 不可用時資料遺失
              if (typeof persistCategoriesLocally === 'function') {
                try {
                  persistCategoriesLocally();
                } catch (_e) {}
              }
              // 如屬 herbs 或 acupoints，同步保存個人設定中的分類資料
              if ((type === 'herbs' || type === 'acupoints') && typeof updatePersonalSettings === 'function') {
                try {
                  updatePersonalSettings().catch(err => console.error('更新個人設置失敗:', err));
                } catch (_e) {}
              }
            }
          }

          // 顯示編輯彈窗
          function showEditModal(itemType, title) {
            const modal = document.getElementById('editModal');
            const modalTitle = document.getElementById('editModalTitle');
            const modalContent = document.getElementById('editModalContent');
            // 將當前編輯類型存於 modal dataset 中，以便保存時使用
            modal.dataset.editType = itemType;
            // 根據 itemType 尋找對應的資料陣列與顯示名稱
            let item = null;
            const typeNames = {
              herb: '藥方組合',
              acupoint: '穴位組合',
              prescription: '醫囑模板',
              diagnosis: '診斷模板'
            };
            if (itemType === 'herb') {
              item = herbCombinations.find(h => h.name === title);
            } else if (itemType === 'acupoint') {
              item = acupointCombinations.find(a => a.name === title);
            } else if (itemType === 'prescription') {
              // 當標題為空時，優先尋找標記為新建的項目，避免取錯對象
              if (title && title.trim()) {
                item = prescriptionTemplates.find(p => p.name === title);
              } else {
                item = prescriptionTemplates.find(p => p.isNew);
                // fallback：若仍找不到，則從後往前尋找名稱為空白的項目
                if (!item) {
                  for (let i = prescriptionTemplates.length - 1; i >= 0; i--) {
                    const candidate = prescriptionTemplates[i];
                    if (!candidate.name) {
                      item = candidate;
                      break;
                    }
                  }
                }
              }
            } else if (itemType === 'diagnosis') {
              if (title && title.trim()) {
                item = diagnosisTemplates.find(d => d.name === title);
              } else {
                item = diagnosisTemplates.find(d => d.isNew);
                if (!item) {
                  for (let i = diagnosisTemplates.length - 1; i >= 0; i--) {
                    const candidate = diagnosisTemplates[i];
                    if (!candidate.name) {
                      item = candidate;
                      break;
                    }
                  }
                }
              }
            }
            // 若找不到項目則返回，不顯示編輯窗
            if (!item) return;
            // 設定當前編輯項目 id 於 dataset 中
            modal.dataset.itemId = item.id;
            // 標題顯示判斷：若 title 為空，表示新建
            if (title && title.trim()) {
              modalTitle.textContent = '編輯' + title;
            } else {
              modalTitle.textContent = '新增' + (typeNames[itemType] || '項目');
            }
            // 標記當前是否為新建，用於取消時清除
            if (item && item.isNew) {
              modal.dataset.isNew = 'true';
            } else {
              // 若不是新建，確保標記被清除
              delete modal.dataset.isNew;
            }
            // 顯示 modal
            modal.classList.remove('hidden');
            // 根據不同類型渲染編輯內容
            if (itemType === 'herb') {
              // 使用輸入框而非下拉選單顯示既有藥材，並提供搜尋功能新增藥材
              // 重新組裝藥材列表：每行使用 flex 排版，包含名稱、劑量欄、單位及刪除按鈕。
              const herbIngredientsHtml = Array.isArray(item.ingredients)
                ? item.ingredients.map(ing => {
                    return '<div class="flex items-center gap-2">' +
                      '<input type="text" value="' + (ing.name || '') + '" readonly placeholder="藥材名稱" class="flex-1 px-2 py-1 border border-gray-300 rounded">' +
                      '<input type="number" value="' + (ing.dosage || '') + '" placeholder="" class="w-20 px-2 py-1 border border-gray-300 rounded">' +
                      '<span class="text-sm text-gray-700">克</span>' +
                      '<button type="button" class="text-red-500 hover:text-red-700 text-sm" onclick="this.parentElement.remove()">刪除</button>' +
                      '</div>';
                  }).join('')
                : '';
              modalContent.innerHTML = `
                <div class="space-y-4">
                  <div>
                    <label class="block text-gray-700 font-medium mb-2">組合名稱 *</label>
                    <input type="text" id="herbNameInput" value="${item.name}" required class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-400 focus:outline-none">
                  </div>
                  <div>
                    <label class="block text-gray-700 font-medium mb-2">分類</label>
                    <select id="herbCategorySelect" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-400 focus:outline-none">
                      ${(Array.isArray(herbComboCategories) && herbComboCategories.length > 0 ? herbComboCategories : categories.herbs).map(cat => '<option value="' + cat + '" ' + (cat === item.category ? 'selected' : '') + '>' + cat + '</option>').join('')}
                    </select>
                  </div>
                  <div>
                    <label class="block text-gray-700 font-medium mb-2">適應症描述</label>
                    <textarea id="herbDescriptionTextarea" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-400 focus:outline-none" rows="3">${item.description || ''}</textarea>
                  </div>
                  <!-- 先顯示搜尋欄，再列出已添加的藥材列表 -->
                  <div>
                    <label class="block text-gray-700 font-medium mb-2">搜尋藥材或方劑</label>
                    <input type="text" id="herbIngredientSearch" placeholder="搜尋中藥材或方劑名稱..." class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-400 focus:outline-none" oninput="searchHerbForCombo()">
                    <div id="herbIngredientSearchResults" class="hidden">
                      <div class="bg-white border border-green-200 rounded max-h-40 overflow-y-auto">
                        <div id="herbIngredientSearchList" class="grid grid-cols-1 md:grid-cols-2 gap-2 p-2"></div>
                      </div>
                    </div>
                  </div>
                  <div>
                    <label class="block text-gray-700 font-medium mb-2">藥材</label>
                    <div id="herbIngredients" class="space-y-2">
                      ${herbIngredientsHtml}
                    </div>
                  </div>
                </div>
              `;
            } else if (itemType === 'acupoint') {
              modalContent.innerHTML = `
                <div class="space-y-4">
                  <div>
                    <label class="block text-gray-700 font-medium mb-2">組合名稱 *</label>
                    <input type="text" id="acupointNameInput" value="${item.name}" required class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-400 focus:outline-none">
                  </div>
                  <div>
                    <label class="block text-gray-700 font-medium mb-2">分類</label>
                    <select id="acupointCategorySelect" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-400 focus:outline-none">
                      ${(Array.isArray(acupointComboCategories) && acupointComboCategories.length > 0 ? acupointComboCategories : categories.acupoints).map(cat => '<option value="' + cat + '" ' + (cat === item.category ? 'selected' : '') + '>' + cat + '</option>').join('')}
                    </select>
                  </div>
                  <div>
                    <label class="block text-gray-700 font-medium mb-2">穴位列表</label>
                    <div id="acupointPoints" class="space-y-2">
                      ${item.points.map(pt => '<div class="flex items-center gap-2"><input type="text" value="' + (pt.name || '') + '" placeholder="穴位名稱" class="flex-1 px-2 py-1 border border-gray-300 rounded"><input type="text" value="' + (pt.type || '') + '" placeholder="主穴/配穴" class="w-28 px-2 py-1 border border-gray-300 rounded"><button type="button" class="text-red-500 hover:text-red-700 text-sm" onclick="this.parentElement.remove()">刪除</button></div>').join('')}
                    </div>
                    <button onclick="addAcupointPointField()" class="mt-2 text-sm text-blue-600 hover:text-blue-800">+ 新增穴位</button>
                  </div>
                  <div>
                    <label class="block text-gray-700 font-medium mb-2">針法</label>
                    <input type="text" id="acupointTechniqueInput" value="${item.technique || ''}" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-400 focus:outline-none">
                  </div>
                </div>
              `;
            } else if (itemType === 'prescription') {
              // 解析複診時間，擷取數量與單位（天、周、月）供預設值使用
              let followNum = '';
              let followUnit = '';
              if (item && item.followUp) {
                const matchFU = String(item.followUp).match(/(\d+)\s*[（(]?([天周月])[^)）]*[)）]?/);
                if (matchFU) {
                  followNum = matchFU[1] || '';
                  followUnit = matchFU[2] || '';
                } else {
                  // 若未包含數字，僅解析單位
                  if (String(item.followUp).includes('天')) followUnit = '天';
                  else if (String(item.followUp).includes('周')) followUnit = '周';
                  else if (String(item.followUp).includes('月')) followUnit = '月';
                }
              }
              modalContent.innerHTML = `
                <div class="space-y-4">
                  <div>
                    <label class="block text-gray-700 font-medium mb-2">模板名稱 *</label>
                    <input type="text" id="prescriptionNameInput" value="${item.name}" required class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-400 focus:outline-none">
                  </div>
                  <div class="grid grid-cols-2 gap-4">
                    <div>
                      <label class="block text-gray-700 font-medium mb-2">分類</label>
                      <select id="prescriptionCategorySelect" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-400 focus:outline-none">
                        ${categories.prescriptions.map(cat => '<option value="' + cat + '" ' + (cat === item.category ? 'selected' : '') + '>' + cat + '</option>').join('')}
                      </select>
                    </div>
                    <div>
                      <label class="block text-gray-700 font-medium mb-2">療程時間</label>
                      <input type="text" id="prescriptionDurationInput" value="${item.duration || ''}" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-400 focus:outline-none">
                    </div>
                  </div>
                  <div class="grid grid-cols-2 gap-4">
                    <div>
                      <label class="block text-gray-700 font-medium mb-2">複診時間</label>
                      <div class="flex gap-2">
                        <input type="number" id="prescriptionFollowUpNumberInput" value="${followNum}" min="1" class="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-400 focus:outline-none">
                        <select id="prescriptionFollowUpUnitInput" class="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-400 focus:outline-none">
                          <option value="天" ${followUnit === '天' ? 'selected' : ''}>天</option>
                          <option value="周" ${followUnit === '周' ? 'selected' : ''}>周</option>
                          <option value="月" ${followUnit === '月' ? 'selected' : ''}>月</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label class="block text-gray-700 font-medium mb-2">中藥服用方法</label>
                      <input type="text" id="prescriptionNoteInput" value="${item.note || ''}" placeholder="如：服藥完畢後" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-400 focus:outline-none">
                    </div>
                  </div>
                  <div>
                    <label class="block text-gray-700 font-medium mb-2">醫囑內容及注意事項</label>
                    <textarea id="prescriptionContentTextarea" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-400 focus:outline-none" rows="5">${item.content || ''}</textarea>
                  </div>
                </div>
              `;
            } else if (itemType === 'diagnosis') {
              modalContent.innerHTML = `
                <div class="space-y-4">
                  <div>
                    <label class="block text-gray-700 font-medium mb-2">模板名稱 *</label>
                    <input type="text" id="diagnosisNameInput" value="${item.name}" required class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                  </div>
                  <div>
                    <label class="block text-gray-700 font-medium mb-2">科別</label>
                    <select id="diagnosisCategorySelect" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                      ${categories.diagnosis.map(cat => '<option value="' + cat + '" ' + (cat === item.category ? 'selected' : '') + '>' + cat + '</option>').join('')}
                    </select>
                  </div>
                  <div>
                    <label class="block text-gray-700 font-medium mb-2">主訴</label>
                    <textarea id="diagnosisChiefComplaintInput" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" rows="3">${item.chiefComplaint || ''}</textarea>
                  </div>
                  <div>
                    <label class="block text-gray-700 font-medium mb-2">現病史</label>
                    <textarea id="diagnosisCurrentHistoryInput" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" rows="6">${item.currentHistory || ''}</textarea>
                  </div>
                  <div class="grid grid-cols-2 gap-4">
                    <div>
                      <label class="block text-gray-700 font-medium mb-2">舌象</label>
                      <textarea id="diagnosisTongueInput" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" rows="2">${item.tongue || ''}</textarea>
                    </div>
                    <div>
                      <label class="block text-gray-700 font-medium mb-2">脈象</label>
                      <textarea id="diagnosisPulseInput" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" rows="2">${item.pulse || ''}</textarea>
                    </div>
                  </div>
                  <div class="grid grid-cols-2 gap-4">
                    <div>
                      <label class="block text-gray-700 font-medium mb-2">中醫診斷</label>
                      <textarea id="diagnosisTcmDiagnosisInput" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" rows="2">${item.tcmDiagnosis || ''}</textarea>
                    </div>
                    <div>
                      <label class="block text-gray-700 font-medium mb-2">證型診斷</label>
                      <textarea id="diagnosisSyndromeDiagnosisInput" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" rows="2">${item.syndromeDiagnosis || ''}</textarea>
                    </div>
                  </div>
                </div>
              `;
            }
          }

          function hideEditModal() {
            const modal = document.getElementById('editModal');
            if (!modal) return;
            // 檢查是否為新建項目，如果取消則從陣列中移除
            const isNew = modal.dataset.isNew === 'true';
            const editType = modal.dataset.editType;
            const itemIdStr = modal.dataset.itemId;
            if (isNew && editType && itemIdStr) {
              const itemId = parseInt(itemIdStr, 10);
              if (editType === 'herb') {
                herbCombinations = herbCombinations.filter(h => h.id !== itemId);
                renderHerbCombinations();
              } else if (editType === 'acupoint') {
                acupointCombinations = acupointCombinations.filter(a => a.id !== itemId);
                renderAcupointCombinations();
              } else if (editType === 'prescription') {
                // 如果取消新建的醫囑模板，移除該項
                prescriptionTemplates = prescriptionTemplates.filter(p => p.id !== itemId);
                renderPrescriptionTemplates();
              } else if (editType === 'diagnosis') {
                // 如果取消新建的診斷模板，移除該項
                diagnosisTemplates = diagnosisTemplates.filter(d => d.id !== itemId);
                renderDiagnosisTemplates();
              }
              // 重置 dataset 標記
              delete modal.dataset.isNew;
              // 針對 herb 與 acupoint 保存個人設定
              if (editType === 'herb' || editType === 'acupoint') {
                if (typeof updatePersonalSettings === 'function') {
                  try {
                    updatePersonalSettings().catch((err) => console.error('更新個人設置失敗:', err));
                  } catch (_e) {}
                }
              }
            }
            modal.classList.add('hidden');
          }

          async function saveEdit() {
            const modal = document.getElementById('editModal');
            const editType = modal.dataset.editType;
            const itemIdStr = modal.dataset.itemId;
            if (!editType || !itemIdStr) {
              // 若沒有設定類型或 ID，則無法保存
              return;
            }
            const itemId = parseInt(itemIdStr, 10);
            // 根據 editType 找到對應的項目並更新
            if (editType === 'herb') {
              const item = herbCombinations.find(h => h.id === itemId);
              if (!item) return;
              // 檢查名稱必填
              const nameVal = (document.getElementById('herbNameInput').value || '').trim();
              if (!nameVal) {
                // 若名稱為空，提示錯誤並停止保存
                if (typeof showToast === 'function') {
                  showToast('請輸入組合名稱！', 'error');
                } else {
                  alert('請輸入組合名稱！');
                }
                return;
              }
              // 更新資料
              item.name = nameVal;
              item.category = document.getElementById('herbCategorySelect').value;
              item.description = document.getElementById('herbDescriptionTextarea').value;
              const ingredientRows = document.querySelectorAll('#herbIngredients > div');
              item.ingredients = Array.from(ingredientRows).map(row => {
                const select = row.querySelector('select');
                const inputs = row.querySelectorAll('input');
                let name = '';
                let dosage = '';
                if (select) {
                  // 若存在下拉選單，名稱取自 select，劑量取自第一個 input
                  name = select.value;
                  dosage = inputs[0] ? inputs[0].value : '';
                } else {
                  // 兼容舊資料結構：使用兩個輸入框分別代表名稱與劑量
                  if (inputs.length >= 2) {
                    name = inputs[0].value;
                    dosage = inputs[1].value;
                  } else if (inputs.length === 1) {
                    name = inputs[0].value;
                  }
                }
                return { name: name, dosage: dosage };
              });
              item.lastModified = new Date().toISOString().split('T')[0];
              // 標記為已保存（非新建），避免取消時被移除
              if (item.isNew) {
                item.isNew = false;
              }
              // 也更新 modal 的 isNew 標記
              modal.dataset.isNew = 'false';
              renderHerbCombinations();
              // Persist changes for personal herb combinations to Firestore
              if (typeof updatePersonalSettings === 'function') {
                try {
                  updatePersonalSettings().catch((err) => console.error('更新個人設置失敗:', err));
                } catch (_e) {}
              }
            } else if (editType === 'acupoint') {
              const item = acupointCombinations.find(a => a.id === itemId);
              if (!item) return;
              // 檢查名稱必填
              const acupointNameVal = (document.getElementById('acupointNameInput').value || '').trim();
              if (!acupointNameVal) {
                if (typeof showToast === 'function') {
                  showToast('請輸入組合名稱！', 'error');
                } else {
                  alert('請輸入組合名稱！');
                }
                return;
              }
              item.name = acupointNameVal;
              item.category = document.getElementById('acupointCategorySelect').value;
              const pointRows = document.querySelectorAll('#acupointPoints > div');
              item.points = Array.from(pointRows).map(row => {
                const inputs = row.querySelectorAll('input');
                return { name: inputs[0].value, type: inputs[1].value };
              });
              item.technique = document.getElementById('acupointTechniqueInput').value;
              item.lastModified = new Date().toISOString().split('T')[0];
              // 標記為已保存（非新建），避免取消時被移除
              if (item.isNew) {
                item.isNew = false;
              }
              // 更新 modal 的 isNew 標記
              modal.dataset.isNew = 'false';
              renderAcupointCombinations();
              // Persist changes for personal acupoint combinations to Firestore
              if (typeof updatePersonalSettings === 'function') {
                try {
                  updatePersonalSettings().catch((err) => console.error('更新個人設置失敗:', err));
                } catch (_e) {}
              }
            } else if (editType === 'prescription') {
              const item = prescriptionTemplates.find(p => p.id === itemId);
              if (!item) return;
              // 檢查模板名稱必填
              const presNameVal = (document.getElementById('prescriptionNameInput').value || '').trim();
              if (!presNameVal) {
                if (typeof showToast === 'function') {
                  showToast('請輸入模板名稱！', 'error');
                } else {
                  alert('請輸入模板名稱！');
                }
                return;
              }
              item.name = presNameVal;
              item.category = document.getElementById('prescriptionCategorySelect').value;
              item.duration = document.getElementById('prescriptionDurationInput').value;
              // 取得複診時間的數量與單位，組合為「數量（單位）」的格式
              const fuNumEl = document.getElementById('prescriptionFollowUpNumberInput');
              const fuUnitEl = document.getElementById('prescriptionFollowUpUnitInput');
              const fuNumVal = fuNumEl ? (fuNumEl.value || '').trim() : '';
              const fuUnitVal = fuUnitEl ? fuUnitEl.value : '';
              if (fuNumVal) {
                item.followUp = fuNumVal + '（' + fuUnitVal + '）';
              } else {
                item.followUp = fuUnitVal;
              }
              item.content = document.getElementById('prescriptionContentTextarea').value;
              // 儲存中藥服用方法（note）到模板項。若無輸入則存為空字串。
              const noteVal = document.getElementById('prescriptionNoteInput') ? document.getElementById('prescriptionNoteInput').value : '';
              item.note = noteVal;
              item.lastModified = new Date().toISOString().split('T')[0];
              // 標記為已保存（非新建），避免取消時被移除
              if (item.isNew) {
                item.isNew = false;
              }
              modal.dataset.isNew = 'false';
              // 將資料保存至 Firestore
              try {
                await window.firebase.setDoc(
                  window.firebase.doc(window.firebase.db, 'prescriptionTemplates', String(item.id)),
                  item
                );
              } catch (error) {
                console.error('儲存醫囑模板資料至 Firestore 失敗:', error);
              }
              renderPrescriptionTemplates();
            } else if (editType === 'diagnosis') {
              const item = diagnosisTemplates.find(d => d.id === itemId);
              if (!item) return;
              // 檢查模板名稱必填
              const diagNameVal = (document.getElementById('diagnosisNameInput').value || '').trim();
              if (!diagNameVal) {
                if (typeof showToast === 'function') {
                  showToast('請輸入模板名稱！', 'error');
                } else {
                  alert('請輸入模板名稱！');
                }
                return;
              }
              item.name = diagNameVal;
              item.category = document.getElementById('diagnosisCategorySelect').value;
              // 儲存各診斷欄位內容
              item.chiefComplaint = document.getElementById('diagnosisChiefComplaintInput').value;
              item.currentHistory = document.getElementById('diagnosisCurrentHistoryInput').value;
              item.tongue = document.getElementById('diagnosisTongueInput').value;
              item.pulse = document.getElementById('diagnosisPulseInput').value;
              item.tcmDiagnosis = document.getElementById('diagnosisTcmDiagnosisInput').value;
              item.syndromeDiagnosis = document.getElementById('diagnosisSyndromeDiagnosisInput').value;
              // 移除舊診斷內容欄位，避免混淆（若存在）
              item.content = '';
              item.lastModified = new Date().toISOString().split('T')[0];
              // 標記為已保存（非新建），避免取消時被移除
              if (item.isNew) {
                item.isNew = false;
              }
              modal.dataset.isNew = 'false';
              // 將資料保存至 Firestore
              try {
                await window.firebase.setDoc(
                  window.firebase.doc(window.firebase.db, 'diagnosisTemplates', String(item.id)),
                  item
                );
              } catch (error) {
                console.error('儲存診斷模板資料至 Firestore 失敗:', error);
              }
              renderDiagnosisTemplates();
            }
            alert('保存成功！');
            hideEditModal();
          }

          /* addHerbIngredientField 函式已移除（未使用） */

          function addAcupointPointField() {
            const container = document.getElementById('acupointPoints');
            const div = document.createElement('div');
            // 使用 flex 布局讓刪除按鈕置於右側
            div.className = 'flex items-center gap-2';
            // 建立名稱與類型輸入框以及刪除按鈕，刪除按鈕點擊後可移除所在行
            div.innerHTML = '<input type="text" placeholder="穴位名稱" class="flex-1 px-2 py-1 border border-gray-300 rounded"><input type="text" placeholder="主穴/配穴" class="w-28 px-2 py-1 border border-gray-300 rounded"><button type="button" class="text-red-500 hover:text-red-700 text-sm" onclick="this.parentElement.remove()">刪除</button>';
            container.appendChild(div);
          }

          /*
           * 搜索並新增藥材至個人慣用藥方組合。
           * 在編輯藥方時，使用者可以在搜尋欄輸入關鍵字搜尋中藥庫中的藥材，並點擊結果將其加入藥材列表。
           */
          function searchHerbForCombo() {
            const input = document.getElementById('herbIngredientSearch');
            if (!input) return;
            const searchTerm = input.value.trim().toLowerCase();
            const resultsContainer = document.getElementById('herbIngredientSearchResults');
            const resultsList = document.getElementById('herbIngredientSearchList');
            if (!resultsContainer || !resultsList) return;
            if (searchTerm.length < 1) {
              resultsContainer.classList.add('hidden');
              return;
            }
            // 搜索 herbLibrary 中的中藥材與方劑，名稱、別名或功效中包含搜尋字串
            const matched = (Array.isArray(herbLibrary) ? herbLibrary : []).filter(item => item && (item.type === 'herb' || item.type === 'formula') && (
              (item.name && item.name.toLowerCase().includes(searchTerm)) ||
              (item.alias && item.alias.toLowerCase().includes(searchTerm)) ||
              (item.effects && item.effects.toLowerCase().includes(searchTerm))
            )).slice(0, 10);
            if (matched.length === 0) {
              resultsList.innerHTML = '<div class="p-2 text-center text-gray-500 text-sm">找不到符合條件的藥材</div>';
              resultsContainer.classList.remove('hidden');
              return;
            }
            resultsList.innerHTML = matched.map(item => {
              const safeName = (item.name || '').replace(/'/g, "\\'");
              const safeDosage = (item.dosage || '').replace(/'/g, "\\'");
              return '<div class="p-2 bg-green-50 hover:bg-green-100 border border-green-200 rounded cursor-pointer text-center text-sm" onclick="addHerbToCombo(\'' + safeName + '\', \'' + safeDosage + '\')">' + item.name + '</div>';
            }).join('');
            resultsContainer.classList.remove('hidden');
          }

          /**
           * 將指定藥材名稱與劑量加入目前編輯的藥材列表。
           * 新增後會清空搜尋欄並隱藏搜尋結果。
           * @param {string} name 藥材名稱
           * @param {string} dosage 預設劑量
           */
          function addHerbToCombo(name, dosage) {
            const container = document.getElementById('herbIngredients');
            if (!container) return;
            const div = document.createElement('div');
            // 每一行以 flex 排版，包含名稱、劑量、單位與刪除按鈕
            div.className = 'flex items-center gap-2';
            const nameInput = document.createElement('input');
            nameInput.type = 'text';
            nameInput.value = name || '';
            nameInput.placeholder = '藥材名稱';
            // 新增後的藥材名稱固定顯示，不可編輯
            nameInput.readOnly = true;
            nameInput.className = 'flex-1 px-2 py-1 border border-gray-300 rounded';
            const dosageInput = document.createElement('input');
            dosageInput.type = 'number';
            // 劑量欄位預設為空，不自動填入任何值
            dosageInput.value = '';
            dosageInput.placeholder = '';
            dosageInput.className = 'w-20 px-2 py-1 border border-gray-300 rounded';
            const unitSpan = document.createElement('span');
            unitSpan.textContent = '克';
            unitSpan.className = 'text-sm text-gray-700';
            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.textContent = '刪除';
            deleteBtn.className = 'text-red-500 hover:text-red-700 text-sm';
            deleteBtn.addEventListener('click', function() {
              if (div && div.parentElement) {
                div.parentElement.removeChild(div);
              }
            });
            // 組合元素
            div.appendChild(nameInput);
            div.appendChild(dosageInput);
            div.appendChild(unitSpan);
            div.appendChild(deleteBtn);
            container.appendChild(div);
            const resultsContainer = document.getElementById('herbIngredientSearchResults');
            if (resultsContainer) {
              resultsContainer.classList.add('hidden');
            }
            const searchInput = document.getElementById('herbIngredientSearch');
            if (searchInput) {
              searchInput.value = '';
            }
          }

          // 將自訂函式掛載至 window，使其可於內嵌事件處理器中被呼叫
          window.searchHerbForCombo = searchHerbForCombo;
          window.addHerbToCombo = addHerbToCombo;

          // 初始化
document.addEventListener('DOMContentLoaded', function() {
            // 初始渲染藥方、穴位與模板列表
            renderHerbCombinations();
            renderAcupointCombinations();
            renderPrescriptionTemplates();
            renderDiagnosisTemplates();
            // 在渲染模板後初始化搜尋功能，確保可找到相關元素
            try {
                if (typeof setupTemplateLibrarySearch === 'function') {
                    setupTemplateLibrarySearch();
                }
            } catch (_e) {
                console.error('初始化模板庫搜尋功能失敗:', _e);
            }

            /**
             * 一些彈窗（例如分類管理與編輯彈窗）原本是在個別功能區塊下的容器中定義。
             * 當這些父容器被切換為 hidden 時，彈窗也會隨之被隱藏，導致使用者在其他功能頁無法彈出對話框。
             * 為解決此問題，將這些彈窗節點移動到 body 底下，避免受父層顯示狀態影響。
             */
            // 將需要在診症系統中使用的彈窗節點移動到 body 底下，避免被隱藏區域遮蔽
            // 將需要在診症系統中使用的彈窗節點移動到 body 底下，避免受父容器顯示狀態影響
            // 包含診斷模板與醫囑模板彈窗在內的所有模態框
            [
                'categoryModal',
                'editModal',
                'herbComboModal',
                'acupointComboModal',
                // 新增將診斷模板與醫囑模板彈窗移至 body，避免因父層隱藏而無法顯示
                'diagnosisTemplateModal',
                'prescriptionTemplateModal'
            ].forEach(function(id) {
                const modal = document.getElementById(id);
                if (modal && modal.parentElement !== document.body) {
                    document.body.appendChild(modal);
                }
            });

            // 在添加事件監聽前，先初始化個人常用組合的搜尋與分類篩選介面
            try {
                if (typeof setupPersonalComboSearchAndFilter === 'function') {
                    setupPersonalComboSearchAndFilter();
                }
            } catch (_e) {
                // 若初始化失敗，不影響後續流程
            }

            // 監聽個人慣用藥方與穴位組合的搜尋與分類變更，以即時刷新列表
            try {
                // 搜尋輸入框：對應不同可能的 ID
                const herbSearchIds = ['herbComboSearch', 'searchHerbCombo', 'searchHerbCombination', 'herbComboSearchInput'];
                herbSearchIds.forEach(function(id) {
                    const el = document.getElementById(id);
                    if (el) {
                        el.addEventListener('input', function() {
                            renderHerbCombinations();
                        });
                    }
                });
                // 藥方分類下拉選單
                const herbCatIds = ['herbComboCategoryFilter', 'herbComboCategory', 'herbComboCategorySelect'];
                herbCatIds.forEach(function(id) {
                    const el = document.getElementById(id);
                    if (el) {
                        el.addEventListener('change', function() {
                            renderHerbCombinations();
                        });
                    }
                });
                // 穴位搜尋輸入
                const acuSearchIds = ['acupointComboSearch', 'searchAcupointCombo', 'acupointComboSearchInput'];
                acuSearchIds.forEach(function(id) {
                    const el = document.getElementById(id);
                    if (el) {
                        el.addEventListener('input', function() {
                            renderAcupointCombinations();
                        });
                    }
                });
                // 穴位分類下拉選單
                const acuCatIds = ['acupointComboCategoryFilter', 'acupointComboCategory', 'acupointComboCategorySelect'];
                acuCatIds.forEach(function(id) {
                    const el = document.getElementById(id);
                    if (el) {
                        el.addEventListener('change', function() {
                            renderAcupointCombinations();
                        });
                    }
                });
            } catch (e) {
                console.error('初始化搜尋與分類監聽器時發生錯誤:', e);
            }

            // 已移除舊版頁腳版權資訊初始化函式
          });

// 全局與登入版權聲明初始化：在 DOMContentLoaded 後插入對應的版權資訊。
document.addEventListener('DOMContentLoaded', function () {
  try {
    // 插入登入頁版權聲明（位於登入按鈕下方）
    const loginPage = document.getElementById('loginPage');
    if (loginPage && !document.getElementById('loginCopyright')) {
      // 尋找登入卡片容器
      let cardContainer = null;
      // 嘗試尋找具有 shadow 樣式的登入卡片
      cardContainer = loginPage.querySelector('.bg-white.rounded-2xl.shadow-2xl');
      // 若未找到，則退而求其次尋找首個白色背景容器
      if (!cardContainer) {
        cardContainer = loginPage.querySelector('.bg-white');
      }
      if (cardContainer) {
        const loginCopy = document.createElement('div');
        loginCopy.id = 'loginCopyright';
        loginCopy.className = 'text-center mt-8 text-xs text-gray-400';
        loginCopy.innerHTML = `
          <div class="border-t border-gray-200 pt-4">
            Copyright © 2025 <span class="text-gray-600 font-medium">名醫有限公司</span>. All rights reserved.
          </div>
        `;
        cardContainer.appendChild(loginCopy);
      }
    }

    // 插入全局版權聲明（頁面底部）
    if (!document.getElementById('globalCopyright')) {
      const globalContainer = document.createElement('div');
      globalContainer.id = 'globalCopyright';
      globalContainer.className = 'max-w-7xl mx-auto px-4 py-4 mt-8';
      globalContainer.innerHTML = `
        <div class="text-center border-t border-gray-200 pt-4">
          <div class="text-xs text-gray-400">
            Copyright © 2025 <span class="text-gray-600 font-medium">名醫有限公司</span>. All rights reserved.
          </div>
        </div>
      `;
      // 預設隱藏，登入頁面顯示時不顯示全局版權
      globalContainer.style.display = 'none';
      document.body.appendChild(globalContainer);
    }

    // 根據目前頁面狀態顯示或隱藏對應版權
    const loginVisible = loginPage && !loginPage.classList.contains('hidden') && window.getComputedStyle(loginPage).display !== 'none';
    const globalCopyright = document.getElementById('globalCopyright');
    const loginCopyright = document.getElementById('loginCopyright');
    if (loginVisible) {
      if (globalCopyright) globalCopyright.style.display = 'none';
      if (loginCopyright) loginCopyright.style.display = '';
    } else {
      if (globalCopyright) globalCopyright.style.display = '';
      if (loginCopyright) loginCopyright.style.display = 'none';
    }
  } catch (e) {
    console.error('初始化版權資訊時發生錯誤', e);
  }
});

/**
 * 顯示主系統頁面底部的版權聲明，隱藏登入頁內的版權。
 */
function showGlobalCopyright() {
  try {
    const globalCopyright = document.getElementById('globalCopyright');
    const loginCopyright = document.getElementById('loginCopyright');
    if (globalCopyright) {
      globalCopyright.style.display = '';
    }
    if (loginCopyright) {
      loginCopyright.style.display = 'none';
    }
  } catch (e) {
    console.error('顯示全局版權時發生錯誤', e);
  }
}

/**
 * 顯示登入頁內的版權聲明，隱藏頁面底部的版權。
 */
function hideGlobalCopyright() {
  try {
    const globalCopyright = document.getElementById('globalCopyright');
    const loginCopyright = document.getElementById('loginCopyright');
    if (globalCopyright) {
      globalCopyright.style.display = 'none';
    }
    if (loginCopyright) {
      loginCopyright.style.display = '';
    }
  } catch (e) {
    console.error('隱藏全局版權時發生錯誤', e);
  }
}
