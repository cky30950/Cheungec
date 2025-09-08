// 系統資料儲存
// 用戶登入後的資料
let currentUser = null;
let currentUserData = null;

/**
 * 全域的分頁設定，用於控制各模組的當前頁碼與每頁顯示數量。
 * 當搜尋或篩選條件改變時，應重置 currentPage 為 1。
 */
const paginationSettings = {
    herbLibrary: { currentPage: 1, itemsPerPage: 6 },
    personalHerbCombos: { currentPage: 1, itemsPerPage: 6 },
    personalAcupointCombos: { currentPage: 1, itemsPerPage: 6 },
    prescriptionTemplates: { currentPage: 1, itemsPerPage: 6 },
    diagnosisTemplates: { currentPage: 1, itemsPerPage: 6 },
    patientList: { currentPage: 1, itemsPerPage: 10 }
};

// 為穴位庫新增分頁設定，每頁顯示 6 筆資料
paginationSettings.acupointLibrary = { currentPage: 1, itemsPerPage: 6 };

// 快取病人篩選結果，用於分頁顯示
let patientListFiltered = [];

/**
 * 確保在指定父元素之後存在分頁容器，若不存在則建立。
 * 分頁容器統一使用 flex 排版與 margin-top 提升顯示效果。
 * @param {string} parentId - 將在其後插入分頁容器的元素 ID。
 * @param {string} paginationId - 分頁容器的 ID。
 * @returns {HTMLElement|null} 分頁容器元素。
 */
function ensurePaginationContainer(parentId, paginationId) {
    const parentEl = document.getElementById(parentId);
    if (!parentEl) return null;
    let container = document.getElementById(paginationId);
    // 如果分頁容器尚未創建，則先創建元素
    if (!container) {
        container = document.createElement('div');
        container.id = paginationId;
        // 使用 flex 置中和外距設定
        container.className = 'mt-4 flex justify-center';
    }

    /**
     * 判斷父元素是否位於表格（table/tbody/thead/tfoot/tr）內。
     * 如果是，直接將分頁容器插入在 table 元素之後，
     * 這樣可以避免在 table 結構內插入 <div> 造成排版問題。
     */
    const parentTag = parentEl.tagName ? parentEl.tagName.toLowerCase() : '';
    // 定義表格相關標籤
    const tableTags = ['table', 'tbody', 'thead', 'tfoot', 'tr', 'td', 'th'];
    // 找到最近的表格元素
    let tableEl = null;
    if (tableTags.includes(parentTag)) {
        // 若 parentEl 本身是表格相關標籤，嘗試往上尋找最近的 table
        tableEl = parentEl.closest('table');
    }
    if (tableEl) {
        const tableParent = tableEl.parentNode;
        // 預設將容器插入在 table 之後
        let insertionParent = tableParent;
        let referenceNode = tableEl.nextSibling;
        // 如果表格的父元素是 overflow-x-auto 容器，則應將分頁容器放在 overflow 容器之外
        if (tableParent && tableParent.classList && tableParent.classList.contains('overflow-x-auto')) {
            // 將插入目標設為 overflow 容器的父元素
            const overflowContainer = tableParent;
            insertionParent = overflowContainer.parentNode;
            referenceNode = overflowContainer.nextSibling;
        }
        // 如果當前容器尚未插入到正確的父容器中，則執行插入或移動
        if (!container.parentNode || container.parentNode !== insertionParent) {
            if (referenceNode) {
                insertionParent.insertBefore(container, referenceNode);
            } else {
                insertionParent.appendChild(container);
            }
        }
    } else {
        // 非表格場景，插入在 parentEl 後面
        const parentContainer = parentEl.parentNode;
        if (!container.parentNode || container.parentNode !== parentContainer) {
            if (parentEl.nextSibling) {
                parentContainer.insertBefore(container, parentEl.nextSibling);
            } else {
                parentContainer.appendChild(container);
            }
        }
    }
    return container;
}

/**
 * 在指定容器中渲染分頁控制按鈕。
 * 提供上一頁、下一頁以及部分頁碼按鈕，避免頁數過多時畫面擁擠。
 * @param {number} totalItems 總項目數量
 * @param {number} itemsPerPage 每頁顯示的項目數量
 * @param {number} currentPage 當前頁碼（從 1 開始）
 * @param {Function} onPageChange 頁碼變更回呼函式，接受新頁碼為參數
 * @param {HTMLElement} container 分頁容器元素
 */
function renderPagination(totalItems, itemsPerPage, currentPage, onPageChange, container) {
    if (!container) return;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    container.innerHTML = '';
    if (totalPages <= 1) {
        container.classList.add('hidden');
        return;
    }
    container.classList.remove('hidden');
    // 建立按鈕的輔助函式
    const createBtn = (page, text, disabled = false, active = false) => {
        const btn = document.createElement('button');
        btn.textContent = text;
        btn.className = 'mx-1 px-3 py-1 rounded border text-sm ' +
            (active
                ? 'bg-blue-500 text-white border-blue-500'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100');
        if (disabled) {
            btn.className += ' cursor-not-allowed opacity-50';
            btn.disabled = true;
        }
        btn.addEventListener('click', () => {
            if (!disabled && page !== currentPage && typeof onPageChange === 'function') {
                onPageChange(page);
            }
        });
        return btn;
    };
    // 上一頁按鈕
    container.appendChild(createBtn(Math.max(1, currentPage - 1), '上一頁', currentPage === 1));
    // 決定要顯示的頁碼範圍，最多顯示 5 個頁碼
    const maxVisible = 5;
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start < maxVisible - 1) {
        start = Math.max(1, end - maxVisible + 1);
    }
    for (let i = start; i <= end; i++) {
        container.appendChild(createBtn(i, String(i), false, i === currentPage));
    }
    // 下一頁按鈕
    container.appendChild(createBtn(Math.min(totalPages, currentPage + 1), '下一頁', currentPage === totalPages));
}

/**
 * 角色與對應可存取的系統區塊對照表。
 * 每個角色可存取哪些頁面（功能），在此集中定義。
 */
const ROLE_PERMISSIONS = {
  '診所管理': ['patientManagement', 'consultationSystem', 'templateLibrary', 'herbLibrary', 'acupointLibrary', 'billingManagement', 'userManagement', 'financialReports', 'systemManagement', 'personalSettings'],
  '醫師': ['patientManagement', 'consultationSystem', 'templateLibrary', 'herbLibrary', 'acupointLibrary', 'billingManagement', 'systemManagement', 'personalSettings'],
      '護理師': ['patientManagement', 'consultationSystem', 'templateLibrary', 'herbLibrary', 'acupointLibrary'],
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

  // 取得用戶職位並移除前後空白
  const pos = currentUserData.position.trim ? currentUserData.position.trim() : currentUserData.position;

  // 特別處理：用戶管理僅限診所管理者使用
  if (sectionId === 'userManagement') {
    return pos === '診所管理';
  }

  // 收費項目管理僅限診所管理者或醫師使用
  if (sectionId === 'billingManagement') {
    return pos === '診所管理' || pos === '醫師';
  }

  // 根據角色權限定義判斷（使用修剪後的職位）
  const allowed = ROLE_PERMISSIONS[pos] || [];
  return allowed.includes(sectionId);
}

// 初始化全域變數
let patients = [];
let consultations = [];
let appointments = [];
// 快取病人列表，避免重複從 Firestore 讀取
let patientCache = null;

// 病人套票與診療記錄的本地快取。
// 以 patientId 為索引，儲存先前查詢過的結果，用於減少重複讀取。
// 調用查詢函式時若未指定強制刷新且有快取，即直接回傳快取資料。
// 在新增、更新或消耗套票／診療記錄後，會依據情況更新或清除對應快取。
let patientPackagesCache = {};
let patientConsultationsCache = {};

// 用於游標分頁的病人列表快取。
// patientPagesCache[pageNumber] 儲存每頁已載入的病人資料；
// patientPageCursors[pageNumber] 儲存該頁最後一筆文件的快照，用於下一頁查詢。
let patientPagesCache = {};
let patientPageCursors = {};

// 快取病人總數，用於分頁計算。讀取一次後會快取，除非強制刷新。
let patientsCountCache = null;

// 標記初始化狀態，避免重複初始化中藥庫、穴位庫、收費項目與模板庫。
let herbLibraryLoaded = false;
// 新增：穴位庫是否已載入
let acupointLibraryLoaded = false;
let billingItemsLoaded = false;
let templateLibraryLoaded = false;

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
            // 如果 delta 為 0 則不做任何更新
            if (!delta) continue;
            try {
                // 重新讀取當前病人的套票，不使用快取以確保使用最新資料
                // 如果快取中已有資料，但我們需要計算最新的剩餘次數，可直接取得快取資料
                // 重新載入病人的套票（強制刷新），避免因其他裝置變更導致計算錯誤
                let packages = await getPatientPackages(patientId, true);
                // 比較 ID 時統一轉為字串，避免類型不一致導致找不到套票
                const pkg = packages.find(p => String(p.id) === String(packageRecordId));
                if (!pkg) continue;
                let newRemaining = (pkg.remainingUses || 0) + delta;
                // 約束 remainingUses 不小於 0，也不超過 totalUses（若 totalUses 定義）
                if (typeof pkg.totalUses === 'number') {
                    newRemaining = Math.max(0, Math.min(pkg.totalUses, newRemaining));
                } else {
                    newRemaining = Math.max(0, newRemaining);
                }
                // 組合更新後的套票資料
                const updatedPackage = { ...pkg, remainingUses: newRemaining };
                // 更新後端資料
                await window.firebaseDataManager.updatePatientPackage(packageRecordId, updatedPackage);
                // 更新本地快取，以便之後呼叫 getPatientPackages 能得到最新資料
                if (patientPackagesCache && Array.isArray(patientPackagesCache[patientId])) {
                    patientPackagesCache[patientId] = patientPackagesCache[patientId].map(p => {
                        if (String(p.id) === String(packageRecordId)) {
                            return { ...p, remainingUses: newRemaining };
                        }
                        return p;
                    });
                }
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
async function fetchPatients(forceRefresh = false, pageNumber = null) {
    // 若指定頁碼，使用游標方式僅讀取該頁資料
    if (pageNumber !== null && typeof pageNumber === 'number') {
        return await fetchPatientsPage(pageNumber, forceRefresh);
    }
    // 預設行為：從快取載入全部病人資料
    patientCache = await fetchDataWithCache(
        patientCache,
        () => window.firebaseDataManager.getPatients(),
        forceRefresh
    );
    return patientCache;
}

/**
 * 透過游標及 limit 方式分頁讀取病人資料。
 * 頁數從 1 開始計算。讀取後會快取該頁資料及最後一筆文件，以利下一頁查詢。
 * 當 forceRefresh 為 true 時，會清除所有分頁快取並重新讀取。
 *
 * @param {number} pageNumber 欲讀取的頁碼，從 1 起算
 * @param {boolean} forceRefresh 是否強制重新載入
 * @returns {Promise<Array>} 該頁病人資料陣列
 */
async function fetchPatientsPage(pageNumber = 1, forceRefresh = false) {
    // 參數檢查
    if (pageNumber < 1) pageNumber = 1;
    // 如果強制刷新，清空分頁快取
    if (forceRefresh) {
        patientPagesCache = {};
        patientPageCursors = {};
    }
    // 若快取中已有對應頁資料，直接返回
    if (!forceRefresh && patientPagesCache[pageNumber]) {
        return patientPagesCache[pageNumber];
    }
    await waitForFirebaseDb();
    try {
        const pageSize = paginationSettings && paginationSettings.patientList && paginationSettings.patientList.itemsPerPage
            ? paginationSettings.patientList.itemsPerPage
            : 10;
        // 建立基礎查詢：依照 createdAt 由舊至新排序
        let q = window.firebase.firestoreQuery(
            window.firebase.collection(window.firebase.db, 'patients'),
            window.firebase.orderBy('createdAt'),
            window.firebase.limit(pageSize)
        );
        // 如果頁碼大於 1，且前一頁已記錄最後一筆文件，則以該文件為起點
        if (pageNumber > 1) {
            const prevCursor = patientPageCursors[pageNumber - 1];
            if (prevCursor) {
                q = window.firebase.firestoreQuery(q, window.firebase.startAfter(prevCursor));
            }
        }
        const snapshot = await window.firebase.getDocs(q);
        const docs = [];
        snapshot.forEach((doc) => {
            docs.push({ id: doc.id, ...doc.data() });
        });
        // 記錄最後一個文件作為下一頁的游標
        if (docs.length > 0) {
            const lastDoc = snapshot.docs[snapshot.docs.length - 1];
            patientPageCursors[pageNumber] = lastDoc;
        }
        // 快取本頁資料
        patientPagesCache[pageNumber] = docs;
        return docs;
    } catch (error) {
        console.error('分頁讀取病人資料失敗:', error);
        return [];
    }
}

/**
 * 取得病人總數，透過 Firestore 聚合查詢 count()。
 * 結果將快取，以避免重複計算；除非 forceRefresh 為 true 才重新查詢。
 *
 * @param {boolean} forceRefresh 是否強制重新從 Firestore 讀取總數
 * @returns {Promise<number>} 病人數量
 */
async function getPatientsCount(forceRefresh = false) {
    // 若快取已存在且未要求強制刷新，直接返回快取值
    if (!forceRefresh && typeof patientsCountCache === 'number') {
        return patientsCountCache;
    }
    try {
        await waitForFirebaseDb();
        // 建立查詢（不指定排序或條件）
        const colRef = window.firebase.collection(window.firebase.db, 'patients');
        // 使用 Firestore 聚合查詢取得文件總數
        const countSnap = await window.firebase.getCountFromServer(colRef);
        const count = countSnap.data().count;
        patientsCountCache = typeof count === 'number' ? count : 0;
        return patientsCountCache;
    } catch (error) {
        console.error('取得病人總數失敗:', error);
        return 0;
    }
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
        text.textContent = '匯入進度 0%';
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
        text.textContent = '匯入進度 ' + percent + '%';
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
        text.textContent = success ? '匯入完成！' : '匯入失敗！';
        // 於 2 秒後隱藏進度條
        setTimeout(() => {
            container.classList.add('hidden');
        }, 2000);
    }
}

/**
 * 顯示資料匯入/清除進度條。
 * 這些函式與備份匯入進度條相似，但使用不同的容器元素。
 * @param {number} totalSteps 總步驟數，用於計算百分比
 */
function showImportProgressBar(totalSteps) {
    const container = document.getElementById('importProgressContainer');
    const bar = document.getElementById('importProgressBar');
    const text = document.getElementById('importProgressText');
    if (container && bar && text) {
        container.classList.remove('hidden');
        bar.style.width = '0%';
        text.textContent = '匯入進度 0%';
        container.dataset.totalSteps = totalSteps;
    }
}

/**
 * 更新資料匯入/清除進度條。
 * @param {number} currentStep 已完成的步驟數
 * @param {number} totalSteps 總步驟數
 */
function updateImportProgressBar(currentStep, totalSteps) {
    const container = document.getElementById('importProgressContainer');
    const bar = document.getElementById('importProgressBar');
    const text = document.getElementById('importProgressText');
    if (container && bar && text) {
        const percent = totalSteps > 0 ? Math.round((currentStep / totalSteps) * 100) : 0;
        bar.style.width = percent + '%';
        text.textContent = '匯入進度 ' + percent + '%';
    }
}

/**
 * 完成資料匯入/清除進度條。
 * @param {boolean} success 是否成功
 */
function finishImportProgressBar(success) {
    const container = document.getElementById('importProgressContainer');
    const bar = document.getElementById('importProgressBar');
    const text = document.getElementById('importProgressText');
    if (container && bar && text) {
        bar.style.width = '100%';
        text.textContent = success ? '匯入完成！' : '匯入失敗！';
        setTimeout(() => {
            container.classList.add('hidden');
        }, 2000);
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
        // 初始化穴位庫資料
        let acupointLibrary = [];
        // 穴位庫編輯狀態與篩選條件
        // 移除穴位編輯狀態變數（不再支援新增/編輯/刪除）
        // let editingAcupointId = null;
        let currentAcupointFilter = 'all';
        /**
         * 從 Firestore 讀取中藥庫資料，若資料不存在則自動使用預設值初始化。
         * 此函式會等待 Firebase 初始化完成後再執行。
         */
        async function initHerbLibrary(forceRefresh = false) {
            // 若已載入且不需要強制重新載入，直接返回以避免重複讀取
            if (herbLibraryLoaded && !forceRefresh) {
                return;
            }
            // 從本地 JSON 檔案載入中藥資料與方劑資料，若找不到則回退至 GitHub Raw
            try {
                const herbData = await fetchJsonWithFallback('herbLibrary.json');
                const formulaData = await fetchJsonWithFallback('herbformulaLibrary.json');
                const herbList = Array.isArray(herbData.herbLibrary) ? herbData.herbLibrary : [];
                const formulaList = Array.isArray(formulaData.herbLibrary) ? formulaData.herbLibrary : [];
                herbLibrary = [...herbList, ...formulaList];
                herbLibraryLoaded = true;
            } catch (error) {
                console.error('讀取本地 JSON 中藥庫資料失敗:', error);
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
        async function initBillingItems(forceRefresh = false) {
            // 若已載入且不需要強制重新載入，直接返回以避免重複讀取
            if (billingItemsLoaded && !forceRefresh) {
                return;
            }
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
                billingItemsLoaded = true;
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
        async function initTemplateLibrary(forceRefresh = false) {
            // 若已載入且不需要強制重新載入，仍執行渲染函式以確保頁面顯示，但不重新讀取資料
            if (templateLibraryLoaded && !forceRefresh) {
                if (typeof renderPrescriptionTemplates === 'function') {
                    try { renderPrescriptionTemplates(); } catch (_e) {}
                }
                if (typeof renderDiagnosisTemplates === 'function') {
                    try { renderDiagnosisTemplates(); } catch (_e) {}
                }
                if (typeof refreshTemplateCategoryFilters === 'function') {
                    try { refreshTemplateCategoryFilters(); } catch (_e) {}
                }
                return;
            }
            // 從本地 JSON 檔案載入醫囑模板與診斷模板資料，若找不到則回退至 GitHub Raw
            try {
                const presData = await fetchJsonWithFallback('prescriptionTemplates.json');
                const diagData = await fetchJsonWithFallback('diagnosisTemplates.json');
                prescriptionTemplates = Array.isArray(presData.prescriptionTemplates) ? presData.prescriptionTemplates : [];
                diagnosisTemplates = Array.isArray(diagData.diagnosisTemplates) ? diagData.diagnosisTemplates : [];
                templateLibraryLoaded = true;
            } catch (error) {
                console.error('讀取本地模板資料失敗:', error);
            }
            // 渲染模板內容
            try {
                if (typeof renderPrescriptionTemplates === 'function') {
                    try { renderPrescriptionTemplates(); } catch (_e) {}
                }
                if (typeof renderDiagnosisTemplates === 'function') {
                    try { renderDiagnosisTemplates(); } catch (_e) {}
                }
                // 在初次初始化模板庫後刷新分類篩選下拉選單，
                // 以確保「診斷模板」與「醫囑模板」篩選器顯示最新的分類
                if (typeof refreshTemplateCategoryFilters === 'function') {
                    try { refreshTemplateCategoryFilters(); } catch (_e) {}
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

/**
 * 根據掛號 ID 取得最新的掛號資料。
 *
 * 在長時間待機後，頁面中的全域掛號陣列可能已過期或為空，
 * 導致無法在本地找到對應的掛號記錄而無法修改或取消掛號。
 * 此函式會在需要時重新從 Firebase Realtime Database 載入掛號列表，
 * 並回傳指定 ID 的掛號物件。若兩次查詢仍找不到，則回傳 null。
 *
 * @param {string|number} appointmentId - 掛號 ID
 * @returns {Promise<Object|null>} 對應的掛號物件或 null
 */
async function getLatestAppointmentById(appointmentId) {
    // 等待 Firebase DataManager 準備好
    try {
        await waitForFirebaseDataManager();
    } catch (_e) {
        // 如果等待失敗，繼續執行，但可能會導致後續調用失敗
    }

    const idStr = String(appointmentId);
    let found = null;

    // 優先從當前記憶體的 appointments 陣列搜尋
    if (Array.isArray(appointments) && appointments.length > 0) {
        found = appointments.find(apt => apt && String(apt.id) === idStr) || null;
    }

    // 若仍未找到，嘗試從 localStorage 讀取快取並更新全域陣列
    if (!found) {
        try {
            const stored = localStorage.getItem('appointments');
            if (stored) {
                const parsed = JSON.parse(stored);
                if (Array.isArray(parsed)) {
                    // 如果全域陣列尚未初始化，使用儲存值
                    if (!Array.isArray(appointments) || appointments.length === 0) {
                        appointments = parsed.map(item => ({ ...item }));
                    }
                    found = parsed.find(item => item && String(item.id) === idStr) || null;
                }
            }
        } catch (e) {
            console.error('getLatestAppointmentById: 讀取本地掛號快取失敗:', e);
        }
    }

    // 若還是沒有找到，從後端讀取單筆資料
    if (!found) {
        try {
            const result = await window.firebaseDataManager.getAppointment(appointmentId);
            if (result && result.success && result.data) {
                found = result.data;
                // 更新全域陣列及本地快取
                if (!Array.isArray(appointments)) appointments = [];
                const index = appointments.findIndex(apt => apt && String(apt.id) === idStr);
                if (index >= 0) {
                    appointments[index] = { ...found };
                } else {
                    appointments.push({ ...found });
                }
                try {
                    localStorage.setItem('appointments', JSON.stringify(appointments));
                } catch (_storageErr) {
                    // 若無法寫入 localStorage，忽略
                }
            }
        } catch (err) {
            console.error('getLatestAppointmentById: 讀取單筆掛號時發生錯誤:', err);
        }
    }

    return found || null;
}

/**
 * 讀取位於 /data 目錄或 GitHub Pages raw 路徑的 JSON 檔案。
 * 這個輔助函式會先嘗試相對路徑 data/<fileName>，若回傳 404 或其他非成功狀態，
 * 並且當前網站運行在 GitHub Pages 網域（xxx.github.io），則回退至
 * https://raw.githubusercontent.com/<user>/<repo>/main/public/data/<fileName>。
 * @param {string} fileName - 要讀取的檔名，例如 'herbLibrary.json'
 * @returns {Promise<any>} 回傳解析後的 JSON 內容
 */
async function fetchJsonWithFallback(fileName) {
    const host = window.location.hostname;
    const isGithubPages = host && host.endsWith('github.io');
    // 如果不是運行在 GitHub Pages 域名下，先嘗試從相對路徑讀取資料
    if (!isGithubPages) {
        try {
            const relativeResponse = await fetch(`data/${fileName}`, { cache: 'reload' });
            if (relativeResponse.ok) {
                return await relativeResponse.json();
            }
            // 若非 2xx，拋出以便進入回退邏輯
            throw new Error(`Relative path HTTP error ${relativeResponse.status}`);
        } catch (relativeErr) {
            // 繼續嘗試回退邏輯
        }
    }
    // 若為 GitHub Pages 網域，或相對讀取失敗，嘗試從 raw.githubusercontent.com 讀取
    if (host && host.endsWith('github.io')) {
        try {
            const user = host.split('.')[0];
            const pathParts = window.location.pathname.split('/');
            const repo = pathParts.length > 1 ? pathParts[1] : '';
            if (user && repo) {
                // 嘗試從多個分支讀取檔案（先嘗試 main，再嘗試 master），方便兼容不同預設分支名稱
                const branches = ['main', 'master'];
                for (const branch of branches) {
                    const rawUrl = `https://raw.githubusercontent.com/${user}/${repo}/${branch}/public/data/${fileName}`;
                    try {
                        const rawResponse = await fetch(rawUrl, { cache: 'reload' });
                        if (rawResponse.ok) {
                            return await rawResponse.json();
                        }
                    } catch (fetchErr) {
                        // 忽略單一分支的 fetch 錯誤並嘗試下一個分支
                    }
                }
            }
        } catch (fallbackErr) {
            console.error(`回退至 GitHub raw 讀取 ${fileName} 失敗:`, fallbackErr);
            // 回退失敗時繼續往下拋出
        }
    }
    // 最終若仍無法取得資料，拋出錯誤以便呼叫者處理
    throw new Error(`無法取得 ${fileName} 資料`);
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

        // 在登入主系統前並行載入中藥庫資料、穴位庫資料、收費項目、分類資料與模板資料
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
            // 初始化穴位庫資料，使其與中藥庫和模板庫一樣於登入後即載入
            if (typeof initAcupointLibrary === 'function') {
                initTasks.push((async () => {
                    try {
                        await initAcupointLibrary();
                    } catch (err) {
                        console.error('初始化穴位庫資料失敗:', err);
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

        // 改為透過 fetchUsers(true) 讀取用戶列表，並利用快取避免重複讀取
        const data = await fetchUsers(true);
        if (data && data.length > 0) {
            // 更新本地 users 變數，僅同步必要欄位（排除 personalSettings）
            users = data.map(user => {
                const { personalSettings, ...rest } = user || {};
                return {
                    ...rest,
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
            console.log('已同步 Firebase 用戶數據到本地:', users.length, '筆 (使用快取)');
        } else {
            console.log('從 Firebase 取得的用戶資料為空或讀取失敗，使用本地數據');
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
            // 登入後更新歡迎頁卡片顯示
            if (typeof updateWelcomeCards === 'function') {
                try {
                    updateWelcomeCards();
                } catch (_e) {
                    // 忽略錯誤
                }
            }
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
                herbLibrary: { title: '中藥庫', icon: '🌿', description: '查看中藥材及方劑資料' },
                // 新增：穴位庫管理
                acupointLibrary: { title: '穴位庫', icon: '📌', description: '查看穴位資料' },
                billingManagement: { title: '收費項目管理', icon: '💰', description: '管理診療費用及收費項目' },
                // 將診所用戶管理的圖示更新為單人符號，以符合交換後的配置
                userManagement: { title: '診所用戶管理', icon: '👤', description: '管理診所用戶權限' },
                financialReports: { title: '財務報表', icon: '📊', description: '收入分析與財務統計' },
                systemManagement: { title: '系統管理', icon: '⚙️', description: '統計資料、備份匯出' },
                // 新增：個人設置（使用扳手符號作為圖示）
                personalSettings: { title: '個人設置', icon: '🔧', description: '管理慣用藥方及穴位組合' },
                // 新增：模板庫管理
                templateLibrary: { title: '模板庫', icon: '📚', description: '查看醫囑與診斷模板' }
            };

            // 根據當前用戶職位決定可使用的功能列表
            const userPosition = (currentUserData && currentUserData.position) || '';
            const permissions = ROLE_PERMISSIONS[userPosition] || [];

            // 依序建立側邊選單按鈕（再次檢查權限）
            permissions.forEach(permission => {
                const item = menuItems[permission];
                if (!item) return;
                // 避免顯示無權存取的功能
                if (!hasAccessToSection(permission)) return;
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
            } else if (sectionId === 'acupointLibrary') {
                loadAcupointLibrary();
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
            ['patientManagement', 'consultationSystem', 'herbLibrary', 'acupointLibrary', 'billingManagement', 'userManagement', 'financialReports', 'systemManagement', 'personalSettings', 'templateLibrary', 'welcomePage'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.classList.add('hidden');
            });
        }

        /**
         * 根據當前用戶權限，隱藏歡迎頁面中無法存取的功能卡片。
         */
        function updateWelcomeCards() {
            const welcomePageEl = document.getElementById('welcomePage');
            if (!welcomePageEl) return;
            const cards = welcomePageEl.querySelectorAll('.grid > div');
            cards.forEach(card => {
                const titleEl = card.querySelector('.font-semibold');
                const title = titleEl && titleEl.textContent ? titleEl.textContent.trim() : '';
                let sectionId = null;
                switch (title) {
                    case '病人資料管理':
                        sectionId = 'patientManagement';
                        break;
                    case '診症系統':
                        sectionId = 'consultationSystem';
                        break;
                    case '用戶管理':
                        sectionId = 'userManagement';
                        break;
                    case '系統管理':
                        sectionId = 'systemManagement';
                        break;
                    default:
                        sectionId = null;
                }
                if (sectionId && !hasAccessToSection(sectionId)) {
                    card.classList.add('hidden');
                } else {
                    card.classList.remove('hidden');
                }
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
        // 新增或更新病人後，除了清除病人列表快取之外，
        // 也應清除分頁游標與病人數量快取，
        // 以避免新增或更新的資料未立即反映在列表上。
        patientCache = null;
        // 清除分頁快取，包含每頁資料與游標
        if (typeof patientPagesCache === 'object') {
            patientPagesCache = {};
        }
        if (typeof patientPageCursors === 'object') {
            patientPageCursors = {};
        }
        // 清除病人總數快取以重新計算頁數
        patientsCountCache = null;

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
    if (!tbody) return;
    const searchInput = document.getElementById('searchPatient');
    const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : '';
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
        // 若有搜尋字串，載入全部病人資料並在前端進行篩選
        if (searchTerm) {
            const allPatients = await fetchPatients();
            const filteredPatients = Array.isArray(allPatients) ? allPatients.filter(patient =>
                (patient.name && patient.name.toLowerCase().includes(searchTerm)) ||
                (patient.phone && patient.phone.includes(searchTerm)) ||
                (patient.idCard && patient.idCard.toLowerCase().includes(searchTerm)) ||
                (patient.patientNumber && patient.patientNumber.toLowerCase().includes(searchTerm))
            ) : [];
            patientListFiltered = filteredPatients;
            renderPatientListTable(false);
        } else {
            // 無搜尋條件，使用伺服器分頁以減少讀取量
            // 取得當前頁碼；若未設定則預設為第一頁
            const currentPage = (paginationSettings && paginationSettings.patientList && paginationSettings.patientList.currentPage) || 1;
            // 透過分頁函式讀取當前頁的病人資料
            const pageItems = await fetchPatientsPage(currentPage);
            // 取得病人總數，用於計算總頁數
            const totalCount = await getPatientsCount();
            // 渲染當前頁面資料及分頁控制
            renderPatientListPage(pageItems, totalCount, currentPage);
        }
    } catch (error) {
        console.error('載入病人列表錯誤:', error);
        const msg = `
            <tr>
                <td colspan="6" class="px-4 py-8 text-center text-gray-500">
                    載入失敗，請檢查網路連接
                </td>
            </tr>
        `;
        tbody.innerHTML = msg;
    }
}

function loadPatientList() {
    loadPatientListFromFirebase();
}

/**
 * 根據當前的 patientListFiltered 內容渲染病人列表，支援分頁。
 * 在非分頁跳轉情況下會將頁碼重置為第一頁。
 * @param {boolean} pageChange 是否為分頁點擊導致的重新渲染
 */
function renderPatientListTable(pageChange = false) {
    const tbody = document.getElementById('patientList');
    if (!tbody) return;
    // 若無病人資料
    if (!Array.isArray(patientListFiltered) || patientListFiltered.length === 0) {
        const searchTermEl = document.getElementById('searchPatient');
        const searchTerm = searchTermEl ? searchTermEl.value.toLowerCase() : '';
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="px-4 py-8 text-center text-gray-500">
                    ${searchTerm ? '沒有找到符合條件的病人' : '尚無病人資料'}
                </td>
            </tr>
        `;
        const paginEl = ensurePaginationContainer('patientList', 'patientListPagination');
        if (paginEl) {
            paginEl.innerHTML = '';
            paginEl.classList.add('hidden');
        }
        return;
    }
    // 分頁：非頁面跳轉時重置當前頁
    if (!pageChange) {
        paginationSettings.patientList.currentPage = 1;
    }
    const totalItems = patientListFiltered.length;
    const itemsPerPage = paginationSettings.patientList.itemsPerPage;
    let currentPage = paginationSettings.patientList.currentPage;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    if (currentPage < 1) currentPage = 1;
    if (currentPage > totalPages) currentPage = totalPages;
    paginationSettings.patientList.currentPage = currentPage;
    const startIdx = (currentPage - 1) * itemsPerPage;
    const endIdx = startIdx + itemsPerPage;
    const pageItems = patientListFiltered.slice(startIdx, endIdx);
    // 清空表格
    tbody.innerHTML = '';
    // 渲染當前頁病人資料
    pageItems.forEach(patient => {
        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-50';
        // 轉義顯示的值，避免 XSS
        const safeNumber = window.escapeHtml(patient.patientNumber || '未設定');
        const safeName = window.escapeHtml(patient.name);
        const safeAge = window.escapeHtml(formatAge(patient.birthDate));
        const safeGender = window.escapeHtml(patient.gender);
        const safePhone = window.escapeHtml(patient.phone);
        row.innerHTML = `
            <td class="px-4 py-3 text-sm text-blue-600 font-medium">${safeNumber}</td>
            <td class="px-4 py-3 text-sm text-gray-900 font-medium">${safeName}</td>
            <td class="px-4 py-3 text-sm text-gray-900">${safeAge}</td>
            <td class="px-4 py-3 text-sm text-gray-900">${safeGender}</td>
            <td class="px-4 py-3 text-sm text-gray-900">${safePhone}</td>
            <td class="px-4 py-3 text-sm space-x-2">
                <button onclick="viewPatient('${patient.id}')" class="text-blue-600 hover:text-blue-800">查看</button>
                <button onclick="showPatientMedicalHistory('${patient.id}')" class="text-purple-600 hover:text-purple-800">病歷</button>
                <button onclick="editPatient('${patient.id}')" class="text-green-600 hover:text-green-800">編輯</button>
                <button onclick="deletePatient('${patient.id}')" class="text-red-600 hover:text-red-800">刪除</button>
            </td>
        `;
        tbody.appendChild(row);
    });
    // 分頁控制
    const paginEl = ensurePaginationContainer('patientList', 'patientListPagination');
    renderPagination(totalItems, itemsPerPage, currentPage, function(newPage) {
        paginationSettings.patientList.currentPage = newPage;
        renderPatientListTable(true);
    }, paginEl);
}

/**
 * 渲染伺服器分頁的病人列表。
 * 當搜尋條件為空時，使用此函式以避免載入整個集合。
 *
 * @param {Array} pageItems 當前頁的病人資料陣列
 * @param {number} totalItems 全部病人的總數
 * @param {number} currentPage 當前頁碼（從 1 開始）
 */
function renderPatientListPage(pageItems, totalItems, currentPage) {
    const tbody = document.getElementById('patientList');
    if (!tbody) return;
    // 若沒有任何病人資料，顯示提示
    if (!Array.isArray(pageItems) || pageItems.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="px-4 py-8 text-center text-gray-500">
                    尚無病人資料
                </td>
            </tr>
        `;
        const paginEl = ensurePaginationContainer('patientList', 'patientListPagination');
        if (paginEl) {
            paginEl.innerHTML = '';
            paginEl.classList.add('hidden');
        }
        return;
    }
    // 重新渲染表格內容
    tbody.innerHTML = '';
    pageItems.forEach(patient => {
        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-50';
        // 安全轉義顯示的值
        const safeNumber = window.escapeHtml(patient.patientNumber || '未設定');
        const safeName = window.escapeHtml(patient.name);
        const safeAge = window.escapeHtml(formatAge(patient.birthDate));
        const safeGender = window.escapeHtml(patient.gender);
        const safePhone = window.escapeHtml(patient.phone);
        row.innerHTML = `
            <td class="px-4 py-3 text-sm text-blue-600 font-medium">${safeNumber}</td>
            <td class="px-4 py-3 text-sm text-gray-900 font-medium">${safeName}</td>
            <td class="px-4 py-3 text-sm text-gray-900">${safeAge}</td>
            <td class="px-4 py-3 text-sm text-gray-900">${safeGender}</td>
            <td class="px-4 py-3 text-sm text-gray-900">${safePhone}</td>
            <td class="px-4 py-3 text-sm space-x-2">
                <button onclick="viewPatient('${patient.id}')" class="text-blue-600 hover:text-blue-800">查看</button>
                <button onclick="showPatientMedicalHistory('${patient.id}')" class="text-purple-600 hover:text-purple-800">病歷</button>
                <button onclick="editPatient('${patient.id}')" class="text-green-600 hover:text-green-800">編輯</button>
                <button onclick="deletePatient('${patient.id}')" class="text-red-600 hover:text-red-800">刪除</button>
            </td>
        `;
        tbody.appendChild(row);
    });
    // 分頁控制
    const paginEl = ensurePaginationContainer('patientList', 'patientListPagination');
    renderPagination(totalItems, paginationSettings.patientList.itemsPerPage, currentPage, function (newPage) {
        // 更新當前頁碼，重新載入資料（使用伺服器分頁）
        paginationSettings.patientList.currentPage = newPage;
        loadPatientList();
    }, paginEl);
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
                // 刪除病人後也需要清除分頁快取與病人總數快取，
                // 以免刪除後仍顯示在列表中或總數不變。
                patientCache = null;
                if (typeof patientPagesCache === 'object') {
                    patientPagesCache = {};
                }
                if (typeof patientPageCursors === 'object') {
                    patientPageCursors = {};
                }
                patientsCountCache = null;
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
                // 強制從資料庫取得套票，以避免跨裝置快取不一致
                const pkgs = await getPatientPackages(patient.id, true);
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
        
        /**
         * 載入診症（掛號）系統。
         *
         * 過期掛號清除僅需在切換到掛號系統時執行一次，
         * 因此在此函式中先執行清除過期掛號的檢查，然後再初始化日期選擇器
         * 並載入當天掛號列表。之後觸發更新掛號列表（例如日期變更或新增掛號）
         * 則不會重複執行清除。
         */
        function loadConsultationSystem() {
            // 先清除過期掛號，完成後再載入掛號列表
            clearOldAppointments()
                .catch(err => {
                    // 即使清除失敗仍繼續載入掛號列表
                    console.error('切換掛號系統時清除過期掛號錯誤:', err);
                })
                .finally(() => {
                    // 初始化掛號日期選擇器
                    try {
                        setupAppointmentDatePicker();
                    } catch (_e) {
                        // 忽略初始化失敗
                    }
                    // 載入選定日期的掛號列表
                    loadTodayAppointments();
                    // 清空病人搜尋欄位
                    clearPatientSearch();
                });
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
            
            // 建立掛號物件，除了傳入 ID 與帳號之外，同時儲存病人姓名與醫師姓名。
            // 這可避免日後在監聽掛號狀態時為了取得姓名而再次查詢病人集合。
            const appointment = {
                id: Date.now(),
                patientId: selectedPatientForRegistration.id,
                // 新增：直接保存病人姓名，供後續監聽或顯示使用
                patientName: selectedPatientForRegistration.name,
                appointmentTime: selectedTime.toISOString(),
                appointmentDoctor: appointmentDoctor,
                // 新增：直接保存醫師姓名，供後續監聽或顯示使用
                doctorName: selectedDoctor.name,
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
    // 已在切換到掛號系統時清除過期掛號，這裡不再重複執行。
    // 如果需要手動清除，請在調用 loadConsultationSystem 前呼叫 clearOldAppointments。
    // await clearOldAppointments();

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
    // 根據日期選擇器決定要監聽的日期範圍；若未選擇則監聽今日
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
        // ignore; fallback to today
    }
    // 計算該日期的開始與結束時間（UTC ISO 格式）
    const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
    const endOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59, 999);
    const startIso = startOfDay.toISOString();
    const endIso = endOfDay.toISOString();

    // 構建基本參考路徑
    const appointmentsRef = window.firebase.ref(window.firebase.rtdb, 'appointments');
    // 使用 Realtime Database 查詢以篩選當天的掛號資料，減少監聽範圍
    const appointmentsQuery = window.firebase.query(
        appointmentsRef,
        window.firebase.orderByChild('appointmentTime'),
        window.firebase.startAt(startIso),
        window.firebase.endAt(endIso)
    );
    // 如果先前已經有監聽器，先取消以避免重複觸發
    if (window.appointmentsListener && window.appointmentsQuery) {
        try {
            window.firebase.off(window.appointmentsQuery, 'value', window.appointmentsListener);
        } catch (e) {
            console.error('取消掛號監聽器時發生錯誤:', e);
        }
    }
    // 存儲本次查詢，以便後續取消監聽
    window.appointmentsQuery = appointmentsQuery;
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
                let patientsList = null;
                for (const apt of toNotify) {
                    // 僅通知該醫師所屬的掛號
                    if (apt.appointmentDoctor === currentUserData.username) {
                        // 優先使用掛號物件中的病人姓名
                        let patientName = '';
                        if (apt.patientName) {
                            patientName = apt.patientName;
                        } else {
                            // 僅當缺少 patientName 時才讀取一次完整病人列表
                            if (!patientsList) {
                                try {
                                    patientsList = await fetchPatients();
                                } catch (fetchErr) {
                                    console.error('讀取病人資料以取得姓名時發生錯誤:', fetchErr);
                                }
                            }
                            if (Array.isArray(patientsList)) {
                                const patient = patientsList.find(p => p.id === apt.patientId);
                                patientName = patient ? patient.name : '';
                            }
                        }
                        if (patientName) {
                            // 顯示提示並播放音效
                            showToast(`病人 ${patientName} 已進入候診中，請準備診症。`, 'info');
                            playNotificationSound();
                        }
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
    window.firebase.onValue(appointmentsQuery, window.appointmentsListener);
    // 在頁面卸載時自動取消監聽，以避免離開頁面後仍持續監聽造成資源浪費
    window.addEventListener('beforeunload', () => {
        if (window.appointmentsListener && window.appointmentsQuery) {
            try {
                window.firebase.off(window.appointmentsQuery, 'value', window.appointmentsListener);
            } catch (e) {
                console.error('取消掛號監聽器時發生錯誤:', e);
            }
        }
    });
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
                // 更新全域診症快取
                consultations = consultationResult.data;
                consultation = consultationResult.data.find(c => String(c.id) === String(consultationId));
            }
        } catch (error) {
            console.error('讀取診療記錄錯誤:', error);
        }
        // 如果本地找不到，嘗試直接從 Firestore 讀取指定 ID 的診症記錄
        if (!consultation) {
            try {
                const docRef = window.firebase.doc(window.firebase.db, 'consultations', String(consultationId));
                const docSnap = await window.firebase.getDoc(docRef);
                if (docSnap && docSnap.exists()) {
                    consultation = { id: docSnap.id, ...docSnap.data() };
                    // 加入本地快取
                    consultations.push(consultation);
                    localStorage.setItem('consultations', JSON.stringify(consultations));
                }
            } catch (err) {
                console.error('直接讀取診療記錄失敗:', err);
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
            <!--
              將操作按鈕欄保持內容寬度，不再撐滿整列。
              為了讓表頭「操作」與診症記錄按鈕左對齊，移除 w-full 以及 justify-end，
              使按鈕自然靠左排列。
            -->
            <td class="px-4 py-3 text-sm">
                <div class="flex flex-wrap gap-1">
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
    // 取得最新的掛號資料，避免長時間待機後本地資料過期
    const appointment = await getLatestAppointmentById(appointmentId);
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
    // 取得最新的掛號資料，避免長時間待機後本地資料過期
    const appointment = await getLatestAppointmentById(appointmentId);
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
    // 取得最新的掛號資料，避免長時間待機後本地資料過期
    const appointment = await getLatestAppointmentById(appointmentId);
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
                // 取得最新的掛號資料，避免長時間待機後本地資料過期
                const appointment = await getLatestAppointmentById(appointmentId);
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

        // --- 記錄本次診症所使用的套票變更，方便之後撤回診症時還原 ---
        try {
            const aggregatedChanges = {};
            for (const change of pendingPackageChanges) {
                if (!change || !change.patientId || !change.packageRecordId || typeof change.delta !== 'number') continue;
                const key = String(change.patientId) + '||' + String(change.packageRecordId);
                if (!aggregatedChanges[key]) {
                    aggregatedChanges[key] = {
                        patientId: change.patientId,
                        packageRecordId: change.packageRecordId,
                        delta: 0
                    };
                }
                aggregatedChanges[key].delta += change.delta;
            }
            const aggregatedList = Object.values(aggregatedChanges);
            if (aggregatedList.length > 0) {
                consultationData.packageChanges = aggregatedList;
            }
        } catch (agErr) {
            console.error('計算套票變更聚合時發生錯誤:', agErr);
        }

        // Determine whether this is an edit of an existing consultation or a new one
        // isEditing 已在函式開始時定義，這裡直接使用
        let operationSuccess = false;
        if (isEditing) {
            // For editing we preserve the original date and doctor information if available
            // 嘗試在本地緩存中尋找對應的診症紀錄，使用字串比對避免類型不一致
            let existing = consultations.find(c => String(c.id) === String(appointment.consultationId));
            if (!existing) {
                const consResult = await window.firebaseDataManager.getConsultations();
                if (consResult && consResult.success) {
                    // 更新全域診症快取
                    consultations = consResult.data;
                    existing = consResult.data.find(c => String(c.id) === String(appointment.consultationId));
                }
            }
            consultationData.date = existing && existing.date ? existing.date : new Date();
            consultationData.doctor = existing && existing.doctor ? existing.doctor : currentUser;
            // Update the existing consultation record
            const updateResult = await window.firebaseDataManager.updateConsultation(String(appointment.consultationId), consultationData);
            if (updateResult && updateResult.success) {
                operationSuccess = true;
                // Update local cache if present
                const idx = consultations.findIndex(c => String(c.id) === String(appointment.consultationId));
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
            // 強制重新取得診症記錄，避免跨裝置快取不一致
            const consultationResult = await window.firebaseDataManager.getPatientConsultations(patientId, true);
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
                            <div class="flex flex-wrap justify-end gap-1">
                                <button onclick="printConsultationRecord('${consultation.id}')" 
                                        class="text-green-600 hover:text-green-800 text-sm font-medium bg-green-50 px-3 py-2 rounded" style="transform: scale(0.75); transform-origin: left;">
                                    列印收據
                                </button>
                                <!-- 新增藥單醫囑列印按鈕，放在收據右側 -->
                                <button onclick="printPrescriptionInstructions('${consultation.id}')" 
                                        class="text-yellow-600 hover:text-yellow-800 text-sm font-medium bg-yellow-50 px-3 py-2 rounded" style="transform: scale(0.75); transform-origin: left;">
                                    藥單醫囑
                                </button>
                                <button onclick="printAttendanceCertificate('${consultation.id}')" 
                                        class="text-blue-600 hover:text-blue-800 text-sm font-medium bg-blue-50 px-3 py-2 rounded" style="transform: scale(0.75); transform-origin: left;">
                                    到診證明
                                </button>
                                ${(() => {
                                    // 檢查是否正在診症且為相同病人
                                    if (currentConsultingAppointmentId) {
                                        const currentAppointment = appointments.find(apt => apt && String(apt.id) === String(currentConsultingAppointmentId));
                                        if (currentAppointment && String(currentAppointment.patientId) === String(consultation.patientId)) {
                                            return `
                                                <button onclick="loadMedicalRecordToCurrentConsultation('${consultation.id}')" 
                                                        class="text-blue-600 hover:text-blue-800 text-sm font-medium bg-blue-50 px-3 py-2 rounded" style="transform: scale(0.75); transform-origin: left;">
                                                    載入病歷
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
        
        // 獲取該病人的所有診症記錄（強制刷新），避免跨裝置快取不一致
        const consultationResult = await window.firebaseDataManager.getPatientConsultations(patientId, true);
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
                    <div class="flex flex-wrap justify-end gap-1">
                        <button onclick="printConsultationRecord('${consultation.id}')" 
                                class="text-green-600 hover:text-green-800 text-sm font-medium bg-green-50 px-3 py-2 rounded" style="transform: scale(0.75); transform-origin: left;">
                            列印收據
                        </button>
                        <!-- 新增藥單醫囑列印按鈕，放在收據右側 -->
                        <button onclick="printPrescriptionInstructions('${consultation.id}')" 
                                class="text-yellow-600 hover:text-yellow-800 text-sm font-medium bg-yellow-50 px-3 py-2 rounded" style="transform: scale(0.75); transform-origin: left;">
                            藥單醫囑
                        </button>
                        <button onclick="printAttendanceCertificate('${consultation.id}')" 
                                class="text-blue-600 hover:text-blue-800 text-sm font-medium bg-blue-50 px-3 py-2 rounded" style="transform: scale(0.75); transform-origin: left;">
                            到診證明
                        </button>
                        ${(() => {
                            // 檢查是否正在診症且為相同病人
                            if (currentConsultingAppointmentId) {
                                const currentAppointment = appointments.find(apt => apt && String(apt.id) === String(currentConsultingAppointmentId));
                                if (currentAppointment && String(currentAppointment.patientId) === String(consultation.patientId)) {
                                    return `
                                        <button onclick="loadMedicalRecordToCurrentConsultation('${consultation.id}')" 
                                                class="text-blue-600 hover:text-blue-800 text-sm font-medium bg-blue-50 px-3 py-2 rounded" style="transform: scale(0.75); transform-origin: left;">
                                            載入病歷
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
        // 嘗試透過傳回的診症列表尋找對應記錄，使用字串比對避免類型不一致
        let consultation = consultationResult.data.find(c => String(c.id) === String(appointment.consultationId));
        // 更新全域診症快取
        consultations = consultationResult.data;
        // 如果未找到，改用 getDoc 直接讀取該診症記錄
        if (!consultation) {
            try {
                const docRef = window.firebase.doc(window.firebase.db, 'consultations', String(appointment.consultationId));
                const docSnap = await window.firebase.getDoc(docRef);
                if (docSnap && docSnap.exists()) {
                    consultation = { id: docSnap.id, ...docSnap.data() };
                    // 將新的診症記錄加入快取
                    consultations.push(consultation);
                    localStorage.setItem('consultations', JSON.stringify(consultations));
                }
            } catch (err) {
                console.error('讀取診症記錄失敗:', err);
            }
        }
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
        // 嘗試於返回列表中尋找對應診症記錄，使用字串比對避免類型不一致
        let consultation = consultationResult.data.find(c => String(c.id) === String(appointment.consultationId));
        // 更新全域診症快取
        consultations = consultationResult.data;
        // 若未找到，直接通過 getDoc 取得
        if (!consultation) {
            try {
                const docRef = window.firebase.doc(window.firebase.db, 'consultations', String(appointment.consultationId));
                const docSnap = await window.firebase.getDoc(docRef);
                if (docSnap && docSnap.exists()) {
                    consultation = { id: docSnap.id, ...docSnap.data() };
                    consultations.push(consultation);
                    localStorage.setItem('consultations', JSON.stringify(consultations));
                }
            } catch (err) {
                console.error('讀取診症記錄失敗:', err);
            }
        }
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
        // 嘗試於返回列表中尋找對應診症記錄，使用字串比對避免類型不一致
        let consultation = consultationResult.data.find(c => String(c.id) === String(appointment.consultationId));
        // 更新全域診症快取
        consultations = consultationResult.data;
        // 若未找到，直接通過 getDoc 根據 ID 讀取
        if (!consultation) {
            try {
                const docRef = window.firebase.doc(window.firebase.db, 'consultations', String(appointment.consultationId));
                const docSnap = await window.firebase.getDoc(docRef);
                if (docSnap && docSnap.exists()) {
                    consultation = { id: docSnap.id, ...docSnap.data() };
                    consultations.push(consultation);
                    localStorage.setItem('consultations', JSON.stringify(consultations));
                }
            } catch (err) {
                console.error('讀取診症記錄失敗:', err);
            }
        }
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
                                        
                                        // 方劑顯示格式：僅顯示名稱與劑量，不顯示組成
                                        allItems.push(`${itemName} ${dosage}g`);
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
        // 先嘗試在返回列表中尋找指定的診症記錄，使用字串比對
        let consultation = consultationResult.data.find(c => String(c.id) === String(appointment.consultationId));
        // 更新全域診症快取
        consultations = consultationResult.data;
        // 若未找到，直接從 Firestore 根據 ID 讀取
        if (!consultation) {
            try {
                const docRef = window.firebase.doc(window.firebase.db, 'consultations', String(appointment.consultationId));
                const docSnap = await window.firebase.getDoc(docRef);
                if (docSnap && docSnap.exists()) {
                    consultation = { id: docSnap.id, ...docSnap.data() };
                    consultations.push(consultation);
                    localStorage.setItem('consultations', JSON.stringify(consultations));
                }
            } catch (err) {
                console.error('讀取診症記錄失敗:', err);
            }
        }
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
                            // 建立方劑區塊，只顯示名稱與劑量，不顯示組成
                            // 若有組成行，前面已跳過
                            itemsList.push(`<div style="margin-bottom: 4px;">${itemName} ${dosage}g</div>`);
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
        // 嘗試取得對應的診症記錄。
        // Step 1: 從本地快取中尋找對應 ID 的診症記錄。
        let consultation = Array.isArray(consultations)
            ? consultations.find(c => String(c.id) === String(appointment.consultationId))
            : null;

        // Step 2: 若本地未找到，直接從 Firestore 讀取該筆診症記錄。
        if (!consultation) {
            try {
                const docRef = window.firebase.doc(
                    window.firebase.db,
                    'consultations',
                    String(appointment.consultationId)
                );
                const docSnap = await window.firebase.getDoc(docRef);
                if (docSnap && docSnap.exists()) {
                    consultation = { id: docSnap.id, ...docSnap.data() };
                    // 將此紀錄加入全域快取，便於後續使用
                    if (Array.isArray(consultations)) {
                        consultations.push(consultation);
                    } else {
                        consultations = [consultation];
                    }
                    localStorage.setItem('consultations', JSON.stringify(consultations));
                }
            } catch (err) {
                console.error('直接讀取診症記錄失敗:', err);
            }
        }

        // Step 3: 若仍未找到，透過病人 ID 讀取該病人所有診症記錄後搜尋。
        if (!consultation) {
            try {
                const consResult = await window.firebaseDataManager.getPatientConsultations(
                    appointment.patientId,
                    true
                );
                if (consResult && consResult.success) {
                    const records = consResult.data || [];
                    // 將這些紀錄合併到全域 consultations 快取中
                    if (Array.isArray(consultations)) {
                        records.forEach((rec) => {
                            if (!consultations.find(c => String(c.id) === String(rec.id))) {
                                consultations.push(rec);
                            }
                        });
                    } else {
                        consultations = records.slice();
                    }
                    localStorage.setItem('consultations', JSON.stringify(consultations));
                    // 再從這些紀錄中尋找目標紀錄
                    consultation = records.find(
                        (c) => String(c.id) === String(appointment.consultationId)
                    );
                }
            } catch (err) {
                console.error('透過病人 ID 讀取診症記錄失敗:', err);
            }
        }

        // Step 4: 若最終仍然找不到診症記錄，提示錯誤並返回。
        if (!consultation) {
            showToast(
                `無法撤回診症！找不到病人 ${patient.name} 的診症記錄資料。`,
                'error'
            );
            return;
        }

// 確認撤回操作
const confirmMessage = `確定要撤回 ${patient.name} 的診症嗎？\n\n` +
                     `此操作將會：\n` +
                     `• 刪除該次病歷記錄\n` +
                     `• 病人狀態回到「已掛號」\n` +
                     `• 退回本次病歷使用的套票\n` +
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
            (c) => String(c.id) === String(appointment.consultationId)
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

    // --- 退回本次診症使用的套票 ---
    try {
        if (consultation && Array.isArray(consultation.packageChanges)) {
            for (const change of consultation.packageChanges) {
                if (!change || typeof change.delta !== 'number') continue;
                const patientIdForPkg = change.patientId;
                const packageRecordIdForPkg = change.packageRecordId;
                // 強制刷新，取得最新套票資料
                const pkgs = await getPatientPackages(patientIdForPkg, true);
                const pkg = pkgs.find(p => String(p.id) === String(packageRecordIdForPkg));
                if (!pkg) continue;
                // 在撤回時將用量加回（反向處理 delta）
                let newRemaining = (pkg.remainingUses || 0) - change.delta;
                if (typeof pkg.totalUses === 'number') {
                    newRemaining = Math.max(0, Math.min(pkg.totalUses, newRemaining));
                } else {
                    newRemaining = Math.max(0, newRemaining);
                }
                const updatedPackage = { ...pkg, remainingUses: newRemaining };
                await window.firebaseDataManager.updatePatientPackage(packageRecordIdForPkg, updatedPackage);
                // 更新本地快取
                if (patientPackagesCache && Array.isArray(patientPackagesCache[patientIdForPkg])) {
                    patientPackagesCache[patientIdForPkg] = patientPackagesCache[patientIdForPkg].map(p => {
                        if (String(p.id) === String(packageRecordIdForPkg)) {
                            return { ...p, remainingUses: newRemaining };
                        }
                        return p;
                    });
                }
            }
        }
    } catch (err) {
        console.error('退回套票使用時發生錯誤:', err);
        showToast('退回套票時發生錯誤', 'warning');
    }
    // 從病人診症快取中移除該紀錄
    try {
        if (patientConsultationsCache && Array.isArray(patientConsultationsCache[patient.id])) {
            patientConsultationsCache[patient.id] = patientConsultationsCache[patient.id].filter(c => String(c.id) !== String(consultation.id));
        }
    } catch (_err) {}

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
        // 重新載入該病人的診療摘要，確保病歷列表和套票狀態即時更新
        try {
            await loadPatientConsultationSummary(patient.id);
        } catch (_e) {}
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
                // 更新全域診症快取
                consultations = consResult.data;
                consultation = consResult.data.find(c => String(c.id) === String(appointment.consultationId));
            }
        } catch (error) {
            console.error('讀取診療記錄錯誤:', error);
        }
        // 若未找到，嘗試使用 getDoc 直接讀取指定診症記錄
        if (!consultation) {
            try {
                const docRef = window.firebase.doc(window.firebase.db, 'consultations', String(appointment.consultationId));
                const docSnap = await window.firebase.getDoc(docRef);
                if (docSnap && docSnap.exists()) {
                    consultation = { id: docSnap.id, ...docSnap.data() };
                    // 將資料存入本地快取，避免下次重複讀取
                    consultations.push(consultation);
                    localStorage.setItem('consultations', JSON.stringify(consultations));
                }
            } catch (err) {
                console.error('直接讀取診症記錄失敗:', err);
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
        // 始終強制從資料庫取得最新的診症記錄，避免跨裝置快取不一致
        const result = await window.firebaseDataManager.getPatientConsultations(patientId, true);
        
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
        // 將套票資料保留在外層作用域，以便後續計算 activePkgCount
        let pkgs;
        try {
            // 始終強制重新載入套票，避免跨裝置快取不一致
            pkgs = await getPatientPackages(patientId, true);
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

        // 計算可用套票數量（activePkgCount）。
        // 優先使用病人文件中的 packageActiveCount 欄位，若不存在則退回至利用 pkgs 計算。
        let activePkgCount = 0;
        try {
            // 嘗試從快取或讀取所有病人資料中取得指定病人
            let allPatientsForCount = [];
            if (Array.isArray(patientCache) && patientCache.length > 0) {
                allPatientsForCount = patientCache;
            } else {
                // 若快取不存在，從 Firebase 讀取
                allPatientsForCount = await fetchPatients();
            }
            const targetPatient = allPatientsForCount.find((p) => String(p.id) === String(patientId));
            if (targetPatient && typeof targetPatient.packageActiveCount === 'number') {
                activePkgCount = targetPatient.packageActiveCount;
            } else {
                // 若病人資料中無彙總欄位，則使用已載入的 pkgs 計算
                if (Array.isArray(pkgs)) {
                    activePkgCount = pkgs.filter(p => p && typeof p.remainingUses === 'number' && p.remainingUses > 0).length;
                } else {
                    activePkgCount = 0;
                }
            }
        } catch (activeCountErr) {
            console.error('取得病人可用套票數量失敗:', activeCountErr);
            // 作為最後保險，使用 pkgs 計算
            if (Array.isArray(pkgs)) {
                try {
                    activePkgCount = pkgs.filter(p => p && typeof p.remainingUses === 'number' && p.remainingUses > 0).length;
                } catch (fallbackErr) {
                    activePkgCount = 0;
                }
            } else {
                activePkgCount = 0;
            }
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
                            ${activePkgCount} 個可用
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
                        ${activePkgCount} 個可用
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
        /**
         * 2025-09: 為了避免在登入後立即從 Firebase 讀取所有病歷記錄，
         * 我們不再於此自動讀取 consultations 資料。
         * 病歷記錄將在實際需要顯示或操作時再個別查詢，
         * 以降低初始化時的讀取量。
         *
         * 此處先從本地存儲讀取任何已緩存的診療記錄，
         * 若無緩存則保持空陣列，待使用時再讀取。
         */
        try {
            const storedConsultations = localStorage.getItem('consultations');
            if (storedConsultations) {
                const parsed = JSON.parse(storedConsultations);
                if (Array.isArray(parsed)) {
                    consultations = parsed;
                } else {
                    consultations = [];
                }
            } else {
                consultations = [];
            }
        } catch (e) {
            console.warn('讀取本地診療記錄快取時發生錯誤:', e);
            consultations = [];
        }
        console.log('登入後系統資料初始化完成（不自動讀取診療記錄）');
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
            
            // 搜尋功能：當搜尋條件變化時重置至第一頁並重新渲染
            const searchInput = document.getElementById('searchHerb');
            if (searchInput) {
                searchInput.addEventListener('input', function() {
                    paginationSettings.herbLibrary.currentPage = 1;
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
            
            // 切換分類時重置至第一頁並重新渲染
            paginationSettings.herbLibrary.currentPage = 1;
            displayHerbLibrary();
        }
        
        function displayHerbLibrary() {
            const searchTerm = document.getElementById('searchHerb').value.toLowerCase();
            const listContainer = document.getElementById('herbLibraryList');

            // 在搜尋條件下統計中藥庫數量，無論當前篩選類型為何。
            // 這允許「全部」按鈕顯示包括中藥材與方劑的總數量。
            // 另外也更新「中藥材」及「方劑」按鈕的數量提示，以便使用者快速瞭解各類型總數。
            (function updateHerbFilterCounts() {
                /**
                 * 根據搜尋條件過濾 herbLibrary。
                 * 為了讓使用者能夠搜尋到中藥材或方劑的詳細內容，
                 * 不再僅僅比對名稱或別名，而是將物件的所有主要欄位
                 * （字串或數值）合併為一段文字進行搜尋。
                 * 這樣可以支援搜尋性味、歸經、主治、用法等內容。
                 */
                const searchFiltered = Array.isArray(herbLibrary) ? herbLibrary.filter(item => {
                    try {
                        // 將所有值轉為字串並合併，用於全文搜尋
                        let combined = '';
                        Object.keys(item).forEach(key => {
                            if (key === 'id' || key === 'type') return;
                            const v = item[key];
                            if (!v) return;
                            if (Array.isArray(v)) {
                                combined += ' ' + v.join(' ');
                            } else if (typeof v === 'string' || typeof v === 'number') {
                                combined += ' ' + String(v);
                            }
                        });
                        combined = combined.toLowerCase();
                        return combined.includes(searchTerm);
                    } catch (_e) {
                        return false;
                    }
                }) : [];
                const totalAll = searchFiltered.length;
                const totalHerbsAll = searchFiltered.filter(item => item.type === 'herb').length;
                const totalFormulasAll = searchFiltered.filter(item => item.type === 'formula').length;
                // 更新各分類按鈕的顯示文字
                const allBtn = document.getElementById('filter-all');
                if (allBtn) {
                    allBtn.innerHTML = `全部 (${totalAll})`;
                }
                const herbBtn = document.getElementById('filter-herb');
                if (herbBtn) {
                    herbBtn.innerHTML = `中藥材 (${totalHerbsAll})`;
                }
                const formulaBtn = document.getElementById('filter-formula');
                if (formulaBtn) {
                    formulaBtn.innerHTML = `方劑 (${totalFormulasAll})`;
                }
            })();
            // 過濾資料：同樣使用全文搜尋，並根據類型篩選
            let filteredItems = Array.isArray(herbLibrary) ? herbLibrary.filter(item => {
                let matchesSearch = true;
                try {
                    let combined = '';
                    Object.keys(item).forEach(key => {
                        if (key === 'id' || key === 'type') return;
                        const v = item[key];
                        if (!v) return;
                        if (Array.isArray(v)) {
                            combined += ' ' + v.join(' ');
                        } else if (typeof v === 'string' || typeof v === 'number') {
                            combined += ' ' + String(v);
                        }
                    });
                    combined = combined.toLowerCase();
                    matchesSearch = combined.includes(searchTerm);
                } catch (_e) {
                    matchesSearch = false;
                }
                const matchesFilter = currentHerbFilter === 'all' || item.type === currentHerbFilter;
                return matchesSearch && matchesFilter;
            }) : [];
            // 若無資料，顯示提示並清除分頁
            if (!filteredItems || filteredItems.length === 0) {
                listContainer.innerHTML = `
                    <div class="text-center py-12 text-gray-500">
                        <div class="text-4xl mb-4">🌿</div>
                        <div class="text-lg font-medium mb-2">沒有找到相關資料</div>
                        <div class="text-sm">請嘗試其他搜尋條件或新增中藥材/方劑</div>
                    </div>
                `;
                // 隱藏分頁容器
                const paginEl = ensurePaginationContainer('herbLibraryList', 'herbLibraryPagination');
                if (paginEl) {
                    paginEl.innerHTML = '';
                    paginEl.classList.add('hidden');
                }
                return;
            }
            // 計算分頁並取得當前頁資料
            const totalItems = filteredItems.length;
            const itemsPerPage = paginationSettings.herbLibrary.itemsPerPage;
            let currentPage = paginationSettings.herbLibrary.currentPage;
            const totalPages = Math.ceil(totalItems / itemsPerPage);
            // 防止當前頁超出範圍
            if (currentPage < 1) currentPage = 1;
            if (currentPage > totalPages) currentPage = totalPages;
            paginationSettings.herbLibrary.currentPage = currentPage;
            const startIdx = (currentPage - 1) * itemsPerPage;
            const endIdx = startIdx + itemsPerPage;
            const pageItems = filteredItems.slice(startIdx, endIdx);
            // 計算當前篩選條件下各類型的總數（非頁面數量）
            // herbLibrary 包含中藥材與方劑兩種類型，這裡統計的是在篩選條件下
            // 所有符合條件的項目總數，避免只顯示當前頁的數量
            const totalHerbsInFiltered = filteredItems.filter(item => item.type === 'herb').length;
            const totalFormulasInFiltered = filteredItems.filter(item => item.type === 'formula').length;
            // 按類型分組顯示分頁資料
            const herbsInPage = pageItems.filter(item => item.type === 'herb');
            const formulasInPage = pageItems.filter(item => item.type === 'formula');
            let html = '';
            if (herbsInPage.length > 0 && (currentHerbFilter === 'all' || currentHerbFilter === 'herb')) {
                html += `
                    <div class="mb-8">
                        <h3 class="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                            <span class="mr-2">🌿</span>中藥材 (${totalHerbsInFiltered})
                        </h3>
                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            ${herbsInPage.map(herb => createHerbCard(herb)).join('')}
                        </div>
                    </div>
                `;
            }
            if (formulasInPage.length > 0 && (currentHerbFilter === 'all' || currentHerbFilter === 'formula')) {
                html += `
                    <div class="mb-8">
                        <h3 class="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                            <span class="mr-2">📋</span>方劑 (${totalFormulasInFiltered})
                        </h3>
                        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            ${formulasInPage.map(formula => createFormulaCard(formula)).join('')}
                        </div>
                    </div>
                `;
            }
            listContainer.innerHTML = html;
            // 產生分頁控制
            const paginationEl = ensurePaginationContainer('herbLibraryList', 'herbLibraryPagination');
            renderPagination(totalItems, itemsPerPage, currentPage, function(newPage) {
                paginationSettings.herbLibrary.currentPage = newPage;
                displayHerbLibrary();
            }, paginationEl);
        }
        
        function createHerbCard(herb) {
            // 為避免 XSS，對文字內容進行轉義
            const safeName = window.escapeHtml(herb.name);
            const safeAlias = herb.alias ? window.escapeHtml(herb.alias) : null;
            // 新增性味、歸經與主治欄位的轉義處理
            const safeNature = herb.nature ? window.escapeHtml(herb.nature) : null;
            const safeMeridian = herb.meridian ? window.escapeHtml(herb.meridian) : null;
            const safeEffects = herb.effects ? window.escapeHtml(herb.effects) : null;
            const safeIndications = herb.indications ? window.escapeHtml(herb.indications) : null;
            const safeDosage = herb.dosage ? window.escapeHtml(String(herb.dosage)) : null;
            const safeCautions = herb.cautions ? window.escapeHtml(herb.cautions) : null;
            // 中藥卡片：僅顯示資訊，不提供編輯/刪除操作
            return `
                <div class="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition duration-200">
                    <div class="flex justify-between items-start mb-3">
                        <div>
                            <h4 class="text-lg font-semibold text-gray-900">${safeName}</h4>
                            ${safeAlias ? `<p class="text-sm text-gray-600">${safeAlias}</p>` : ''}
                        </div>
                        <!-- 操作區已移除：不提供編輯或刪除按鈕 -->
                    </div>
                    
                    <div class="space-y-2 text-sm">
                        ${safeNature ? `<div><span class="font-medium text-gray-700">性味：</span>${safeNature}</div>` : ''}
                        ${safeMeridian ? `<div><span class="font-medium text-gray-700">歸經：</span>${safeMeridian}</div>` : ''}
                        ${safeEffects ? `<div><span class="font-medium text-gray-700">功效：</span>${safeEffects}</div>` : ''}
                        ${safeIndications ? `<div><span class="font-medium text-gray-700">主治：</span>${safeIndications}</div>` : ''}
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
            // 新增主治與用法欄位的轉義處理
            const safeIndications = formula.indications ? window.escapeHtml(formula.indications) : null;
            const safeComposition = formula.composition ? window.escapeHtml(formula.composition).replace(/\n/g, '<br>') : null;
            const safeUsage = formula.usage ? window.escapeHtml(formula.usage) : null;
            const safeCautions = formula.cautions ? window.escapeHtml(formula.cautions) : null;
            // 方劑卡片：僅顯示資訊，不提供編輯/刪除操作
            return `
                <div class="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition duration-200">
                    <div class="flex justify-between items-start mb-3">
                        <div>
                            <h4 class="text-lg font-semibold text-gray-900">${safeName}</h4>
                            ${safeSource ? `<p class="text-sm text-gray-600">出處：${safeSource}</p>` : ''}
                        </div>
                        <!-- 操作區已移除：不提供編輯或刪除按鈕 -->
                    </div>
                    
                    <div class="space-y-3 text-sm">
                        ${safeEffects ? `<div><span class="font-medium text-gray-700">功效：</span>${safeEffects}</div>` : ''}
                        ${safeIndications ? `<div><span class="font-medium text-gray-700">主治：</span>${safeIndications}</div>` : ''}
                        ${safeComposition ? `
                            <div>
                                <span class="font-medium text-gray-700">組成：</span>
                                <div class="mt-1 p-2 bg-yellow-50 rounded text-xs whitespace-pre-line border-l-2 border-yellow-400">${safeComposition}</div>
                            </div>
                        ` : ''}
                        ${safeUsage ? `<div><span class="font-medium text-gray-700">用法：</span>${safeUsage}</div>` : ''}
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
            // 清除中藥材表單欄位（包含性味、歸經與主治）
            ['herbName', 'herbAlias', 'herbNature', 'herbMeridian', 'herbEffects', 'herbIndications', 'herbDosage', 'herbCautions'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
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
            // 還原性味、歸經與主治欄位
            const natureInput = document.getElementById('herbNature');
            if (natureInput) natureInput.value = herb.nature || '';
            const meridianInput = document.getElementById('herbMeridian');
            if (meridianInput) meridianInput.value = herb.meridian || '';
            document.getElementById('herbEffects').value = herb.effects || '';
            const indicationsInput = document.getElementById('herbIndications');
            if (indicationsInput) indicationsInput.value = herb.indications || '';
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
            
            // 組合中藥物件（包含性味、歸經與主治欄位）
            const herb = {
                id: editingHerbId || Date.now(),
                type: 'herb',
                name: name,
                alias: document.getElementById('herbAlias').value.trim(),
                nature: document.getElementById('herbNature').value.trim(),
                meridian: document.getElementById('herbMeridian').value.trim(),
                effects: document.getElementById('herbEffects').value.trim(),
                indications: document.getElementById('herbIndications').value.trim(),
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
            
            // 不再將中藥材資料寫入 Firestore；資料僅保留於本地陣列
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
            // 清除方劑表單欄位（包含主治與用法）
            ['formulaName', 'formulaSource', 'formulaEffects', 'formulaComposition', 'formulaCautions', 'formulaIndications', 'formulaUsage'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
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
            // 還原主治與用法欄位
            const formInd = document.getElementById('formulaIndications');
            if (formInd) formInd.value = formula.indications || '';
            document.getElementById('formulaComposition').value = formula.composition || '';
            const formUsage = document.getElementById('formulaUsage');
            if (formUsage) formUsage.value = formula.usage || '';
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
            
            // 組合方劑物件（包含主治與用法欄位）
            const formula = {
                id: editingFormulaId || Date.now(),
                type: 'formula',
                name: name,
                source: document.getElementById('formulaSource').value.trim(),
                effects: document.getElementById('formulaEffects').value.trim(),
                indications: document.getElementById('formulaIndications').value.trim(),
                composition: composition,
                usage: document.getElementById('formulaUsage').value.trim(),
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
            
            // 不再將方劑資料寫入 Firestore；資料僅保留於本地陣列
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
                // 不再從 Firestore 刪除資料
                showToast(`${itemType}「${item.name}」已刪除！`, 'success');
                displayHerbLibrary();
            }
        }

        // 穴位庫管理功能
        /**
         * 初始化穴位庫資料。
         * 從本地 data 資料夾讀取 acupointLibrary.json。
         * 若檔案不存在或解析失敗，將使用預設資料填充。
         * @param {boolean} forceRefresh - 是否強制重新載入資料
         */
        async function initAcupointLibrary(forceRefresh = false) {
            if (acupointLibraryLoaded && !forceRefresh) {
                return;
            }
            try {
                const data = await fetchJsonWithFallback('acupointLibrary.json');
                // 支援資料根節點為 acupointLibrary 或直接為陣列
                let items = [];
                if (data) {
                    if (Array.isArray(data)) {
                        items = data;
                    } else if (Array.isArray(data.acupointLibrary)) {
                        items = data.acupointLibrary;
                    } else if (Array.isArray(data.acupoints)) {
                        items = data.acupoints;
                    }
                }
                // 確保每筆資料存在 id，若缺失則以當前時間戳加索引生成
                acupointLibrary = items.map((item, idx) => {
                    const newItem = { ...item };
                    if (!newItem.id) {
                        newItem.id = Date.now() + idx;
                    }
                    // 規範 functions 與 indications 為陣列
                    if (newItem.functions && !Array.isArray(newItem.functions)) {
                        newItem.functions = String(newItem.functions).split(/\n+/).map(s => s.trim()).filter(Boolean);
                    }
                    if (newItem.indications && !Array.isArray(newItem.indications)) {
                        newItem.indications = String(newItem.indications).split(/\n+/).map(s => s.trim()).filter(Boolean);
                    }
                    return newItem;
                });
                acupointLibraryLoaded = true;
            } catch (err) {
                console.error('無法讀取穴位庫資料：', err);
                // fallback：使用預設範例資料
                acupointLibrary = [
                    {
                        id: Date.now(),
                        name: '中府',
                        meridian: '手太陰肺經',
                        location: '胸外側部，雲門下1寸，平第一肋間隙，距前正中線6寸',
                        functions: ['宣肺理氣', '止咳平喘', '清熱化痰'],
                        indications: ['咳嗽', '氣喘', '胸痛', '肩背痛', '皮膚病'],
                        method: '斜刺或平刺0.5-0.8寸',
                        category: '肺之募穴',
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString()
                    }
                ];
                acupointLibraryLoaded = true;
            }
        }

        /**
         * 載入穴位庫管理畫面。若資料尚未初始化，會先讀取資料。
         * 綁定搜尋輸入框的事件，當搜尋字串變化時重置頁碼並重新渲染列表。
         */
        async function loadAcupointLibrary() {
            // 權限檢查：護理師與診所管理者、醫師可使用；其他角色禁止
            if (!hasAccessToSection('acupointLibrary')) {
                showToast('權限不足，無法存取穴位庫管理', 'error');
                return;
            }
            // 若尚未載入資料則初始化
            if (!acupointLibraryLoaded || !Array.isArray(acupointLibrary) || acupointLibrary.length === 0) {
                await initAcupointLibrary();
            }
            // 綁定搜尋事件：僅綁定一次
            const searchInput = document.getElementById('searchAcupoint');
            if (searchInput && !searchInput.dataset.listenerAdded) {
                searchInput.addEventListener('input', function() {
                    // 搜尋時重置頁碼為 1
                    paginationSettings.acupointLibrary.currentPage = 1;
                    displayAcupointLibrary();
                });
                searchInput.dataset.listenerAdded = 'true';
            }
            // 初次或重新載入時顯示列表
            displayAcupointLibrary();
        }

        /**
         * 切換經絡篩選條件並更新列表。
         * @param {string} meridian - 篩選的經絡名稱或 'all' 表示全部
         */
        function filterAcupointLibrary(meridian) {
            currentAcupointFilter = meridian;
            // 重置當前頁碼為 1
            paginationSettings.acupointLibrary.currentPage = 1;
            // 更新按鈕樣式
            // 取得分類篩選容器。前端 HTML 使用 id="acupointFilterContainer"
            // 這裡修正名稱以避免與不存在的 acupointFilterButtons 不符導致無法更新按鈕樣式
            const container = document.getElementById('acupointFilterContainer');
            if (container) {
                Array.from(container.children).forEach(btn => {
                    btn.className = 'px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition duration-200';
                });
                const safeId = meridian === 'all' ? 'all' : meridian.replace(/\s+/g, '-').replace(/[^\w-]/g, '');
                const selectedBtn = document.getElementById('acupoint-filter-' + safeId);
                if (selectedBtn) {
                    selectedBtn.className = 'px-4 py-2 rounded-lg text-sm font-medium bg-blue-100 text-blue-800 transition duration-200';
                }
            }
            displayAcupointLibrary();
        }

        /**
         * 根據搜尋及篩選條件顯示穴位庫列表，並處理分頁。
         */
        function displayAcupointLibrary() {
            const listContainer = document.getElementById('acupointLibraryList');
            const searchInput = document.getElementById('searchAcupoint');
            const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
            // 依搜尋字串過濾資料
            const searchFiltered = Array.isArray(acupointLibrary) ? acupointLibrary.filter(item => {
                const nameMatch = item.name && item.name.toLowerCase().includes(searchTerm);
                const meridianMatch = item.meridian && item.meridian.toLowerCase().includes(searchTerm);
                const locationMatch = item.location && item.location.toLowerCase().includes(searchTerm);
                const funcMatch = item.functions && Array.isArray(item.functions) ? item.functions.join(' ').toLowerCase().includes(searchTerm) : (item.functions ? String(item.functions).toLowerCase().includes(searchTerm) : false);
                const indMatch = item.indications && Array.isArray(item.indications) ? item.indications.join(' ').toLowerCase().includes(searchTerm) : (item.indications ? String(item.indications).toLowerCase().includes(searchTerm) : false);
                // 針法/治療方法搜尋
                const methodMatch = item.method && item.method.toLowerCase().includes(searchTerm);
                // 分類搜尋
                const categoryMatch = item.category && item.category.toLowerCase().includes(searchTerm);
                return nameMatch || meridianMatch || locationMatch || funcMatch || indMatch || methodMatch || categoryMatch;
            }) : [];
            // 計算各經絡的總數量，用於篩選按鈕顯示
            const meridianCounts = {};
            searchFiltered.forEach(item => {
                const m = item.meridian || '';
                if (!meridianCounts[m]) meridianCounts[m] = 0;
                meridianCounts[m]++;
            });
            // 更新篩選按鈕
            // 取得分類篩選容器。前端 HTML 使用 id="acupointFilterContainer"
            // 修正 ID 名稱，避免因為找不到元素而不顯示分類按鈕
            const filterContainer = document.getElementById('acupointFilterContainer');
            if (filterContainer) {
                filterContainer.innerHTML = '';
                // 全部按鈕
                const allBtn = document.createElement('button');
                allBtn.id = 'acupoint-filter-all';
                const totalAll = searchFiltered.length;
                allBtn.textContent = totalAll > 0 ? `全部 (${totalAll})` : '全部 (0)';
                allBtn.className = 'px-4 py-2 rounded-lg text-sm font-medium ' + (currentAcupointFilter === 'all' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700 hover:bg-gray-200') + ' transition duration-200';
                allBtn.addEventListener('click', () => filterAcupointLibrary('all'));
                filterContainer.appendChild(allBtn);
                // 其他經絡按鈕
                Object.keys(meridianCounts).forEach(m => {
                    const btn = document.createElement('button');
                    const safeId = m.replace(/\s+/g, '-').replace(/[^\w-]/g, '');
                    btn.id = 'acupoint-filter-' + safeId;
                    btn.textContent = `${m} (${meridianCounts[m]})`;
                    btn.className = 'px-4 py-2 rounded-lg text-sm font-medium ' + (currentAcupointFilter === m ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700 hover:bg-gray-200') + ' transition duration-200';
                    btn.addEventListener('click', () => filterAcupointLibrary(m));
                    filterContainer.appendChild(btn);
                });
            }
            // 根據經絡篩選
            const meridianFiltered = currentAcupointFilter === 'all' ? searchFiltered : searchFiltered.filter(item => item.meridian === currentAcupointFilter);
            // 若無資料，顯示提示並隱藏分頁
            if (!meridianFiltered || meridianFiltered.length === 0) {
                listContainer.innerHTML = `\n                    <div class="text-center py-12 text-gray-500">\n                        <div class="text-4xl mb-4">📌</div>\n                        <div class="text-lg font-medium mb-2">沒有找到相關穴位</div>\n                        <div class="text-sm">請嘗試其他搜尋條件</div>\n                    </div>\n                `;
                const paginEl = ensurePaginationContainer('acupointLibraryList', 'acupointLibraryPagination');
                if (paginEl) {
                    paginEl.innerHTML = '';
                    paginEl.classList.add('hidden');
                }
                return;
            }
            // 計算分頁
            const totalItems = meridianFiltered.length;
            const itemsPerPage = paginationSettings.acupointLibrary.itemsPerPage;
            let currentPage = paginationSettings.acupointLibrary.currentPage;
            const totalPages = Math.ceil(totalItems / itemsPerPage);
            if (currentPage < 1) currentPage = 1;
            if (currentPage > totalPages) currentPage = totalPages;
            paginationSettings.acupointLibrary.currentPage = currentPage;
            const startIdx = (currentPage - 1) * itemsPerPage;
            const endIdx = startIdx + itemsPerPage;
            const pageItems = meridianFiltered.slice(startIdx, endIdx);
            // 依照經絡分組
            const groups = {};
            pageItems.forEach(item => {
                const m = item.meridian || '';
                if (!groups[m]) groups[m] = [];
                groups[m].push(item);
            });
            let html = '';
            Object.keys(groups).forEach(m => {
                // 取得此經絡在搜尋條件下的總數量
                const totalForMeridian = meridianCounts[m] || groups[m].length;
                html += `\n                    <div class="mb-8">\n                        <h3 class="text-lg font-semibold text-gray-800 mb-4 flex items-center">\n                            <span class="mr-2">📌</span>${window.escapeHtml(m)} (${totalForMeridian})\n                        </h3>\n                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">\n                            ${groups[m].map(ac => createAcupointCard(ac)).join('')}\n                        </div>\n                    </div>\n                `;
            });
            listContainer.innerHTML = html;
            // 渲染分頁控制
            const paginationEl = ensurePaginationContainer('acupointLibraryList', 'acupointLibraryPagination');
            renderPagination(totalItems, itemsPerPage, currentPage, function(newPage) {
                paginationSettings.acupointLibrary.currentPage = newPage;
                displayAcupointLibrary();
            }, paginationEl);
        }

        /**
         * 建立單一穴位的卡片 HTML 字串。
         * @param {object} ac - 穴位資料物件
         * @returns {string}
         */
        function createAcupointCard(ac) {
            const safeName = window.escapeHtml(ac.name || '');
            const safeMeridian = ac.meridian ? window.escapeHtml(ac.meridian) : '';
            const safeLocation = ac.location ? window.escapeHtml(ac.location) : '';
            const funcs = Array.isArray(ac.functions) ? ac.functions : (ac.functions ? [ac.functions] : []);
            const inds = Array.isArray(ac.indications) ? ac.indications : (ac.indications ? [ac.indications] : []);
            const safeFunctions = funcs.length > 0 ? funcs.map(item => window.escapeHtml(item)).join('、') : '';
            const safeIndications = inds.length > 0 ? inds.map(item => window.escapeHtml(item)).join('、') : '';
            const safeMethod = ac.method ? window.escapeHtml(ac.method) : '';
            const safeCategory = ac.category ? window.escapeHtml(ac.category) : '';
            return `\n                <div class="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition duration-200">\n                    <div class="flex justify-between items-start mb-3">\n                        <div>\n                            <h4 class="text-lg font-semibold text-gray-900">${safeName}</h4>\n                            ${safeMeridian ? `<p class="text-sm text-gray-600">${safeMeridian}</p>` : ''}\n                        </div>\n                        <!-- 編輯與刪除按鈕已移除，僅顯示資料 -->\n                    </div>\n                    <div class="space-y-2 text-sm">\n                        ${safeLocation ? `<div><span class="font-medium text-gray-700">定位：</span>${safeLocation}</div>` : ''}\n                        ${safeFunctions ? `<div><span class="font-medium text-gray-700">功能：</span>${safeFunctions}</div>` : ''}\n                        ${safeIndications ? `<div><span class="font-medium text-gray-700">主治：</span>${safeIndications}</div>` : ''}\n                        ${safeMethod ? `<div><span class="font-medium text-gray-700">針法：</span>${safeMethod}</div>` : ''}\n                        ${safeCategory ? `<div><span class="font-medium text-gray-700">穴性：</span>${safeCategory}</div>` : ''}\n                    </div>\n                </div>\n            `;
        }

        /**
         * 以下函式與 UI 操作相關，用於新增、編輯與刪除穴位資料。
         * 現在系統改用只讀模式，故不再需要這些函式，已移除實作。
         * 如需重新啟用此功能，可重新撰寫相應的表單與事件處理邏輯。
         */

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
                    // 百分比折扣 (例如 0.85 = 8.5 折)。
                    // 將折扣倍率乘以 10 以取得折扣表示，保留 1 位小數以避免將 8.5 四捨五入成 9。
                    // 若結果為整數則不顯示小數點。
                    pricePrefix = '';
                    const discountRate = item.price * 10;
                    displayPrice = Number.isInteger(discountRate) ? discountRate : discountRate.toFixed(1);
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
            
            // 搜索匹配的中藥材和方劑，並根據匹配程度排序
            let matchedItems = (Array.isArray(herbLibrary) ? herbLibrary : []).filter(item => {
                const lowerName = item.name ? item.name.toLowerCase() : '';
                const lowerAlias = item.alias ? item.alias.toLowerCase() : '';
                const lowerEffects = item.effects ? item.effects.toLowerCase() : '';
                return lowerName.includes(searchTerm) || lowerAlias.includes(searchTerm) || lowerEffects.includes(searchTerm);
            }).map(item => {
                // 計算匹配分數：名稱匹配優先、別名次之、功效再次
                const lowerName = item.name ? item.name.toLowerCase() : '';
                const lowerAlias = item.alias ? item.alias.toLowerCase() : '';
                const lowerEffects = item.effects ? item.effects.toLowerCase() : '';
                let score = Infinity;
                if (lowerName.includes(searchTerm)) {
                    score = lowerName.indexOf(searchTerm);
                } else if (lowerAlias.includes(searchTerm)) {
                    score = 100 + lowerAlias.indexOf(searchTerm);
                } else if (lowerEffects.includes(searchTerm)) {
                    score = 200 + lowerEffects.indexOf(searchTerm);
                }
                return { item, score };
            }).sort((a, b) => a.score - b.score).map(obj => obj.item);
            // 只取前 10 個結果
            matchedItems = matchedItems.slice(0, 10);
            
            if (!matchedItems || matchedItems.length === 0) {
                resultsList.innerHTML = `
                    <div class="p-3 text-center text-gray-500 text-sm">
                        找不到符合條件的中藥材或方劑
                    </div>
                `;
                resultsContainer.classList.remove('hidden');
                return;
            }
            
            // 顯示搜索結果，移除劑量欄，並使用自訂 tooltip
            resultsList.innerHTML = matchedItems.map(item => {
                const typeName = item.type === 'herb' ? '中藥材' : '方劑';
                const bgColor = 'bg-yellow-50 hover:bg-yellow-100 border-yellow-200';
                // 組合完整資訊作為 tooltip 內容，並進行編碼
                const details = [];
                details.push('名稱：' + item.name);
                if (item.alias) details.push('別名：' + item.alias);
                if (item.type === 'herb') {
                    if (item.nature) details.push('性味：' + item.nature);
                    if (item.meridian) details.push('歸經：' + item.meridian);
                }
                if (item.effects) details.push('功效：' + item.effects);
                if (item.indications) details.push('主治：' + item.indications);
                if (item.type === 'formula') {
                    if (item.composition) details.push('組成：' + item.composition.replace(/\n/g, '、'));
                    if (item.usage) details.push('用法：' + item.usage);
                }
                if (item.cautions) details.push('注意：' + item.cautions);
                const encoded = encodeURIComponent(details.join('\n'));
                return `
                    <div class="p-3 ${bgColor} border rounded-lg cursor-pointer transition duration-200" data-tooltip="${encoded}"
                         onmouseenter="showTooltip(event, this.getAttribute('data-tooltip'))"
                         onmousemove="moveTooltip(event)" onmouseleave="hideTooltip()"
                         onclick="addToPrescription('${item.type}', ${item.id})">
                        <div class="text-center">
                            <div class="font-semibold text-gray-900 text-sm mb-1">${window.escapeHtml(item.name)}</div>
                            <div class="text-xs bg-white text-gray-600 px-2 py-1 rounded mb-2">${typeName}</div>
                            ${item.effects ? `<div class="text-xs text-gray-600 mt-1">${window.escapeHtml(item.effects.substring(0, 30))}${item.effects.length > 30 ? '...' : ''}</div>` : ''}
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
            
            // 顯示已添加的項目，為每個項目建立自訂 tooltip 以顯示完整資訊
            const displayHtml = `
                <div class="space-y-3">
                    ${selectedPrescriptionItems.map((item, index) => {
                        const bgColor = 'bg-yellow-50 border-yellow-200';
                        // 從 herbLibrary 中找到完整的藥材或方劑資料
                        const fullItem = (Array.isArray(herbLibrary) ? herbLibrary : []).find(h => h && h.id === item.id);
                        // 構建詳細資訊內容
                        const details = [];
                        if (fullItem) {
                            details.push('名稱：' + (fullItem.name || ''));
                            if (fullItem.alias) details.push('別名：' + fullItem.alias);
                            if (fullItem.type === 'herb') {
                                if (fullItem.nature) details.push('性味：' + fullItem.nature);
                                if (fullItem.meridian) details.push('歸經：' + fullItem.meridian);
                            }
                            if (fullItem.effects) details.push('功效：' + fullItem.effects);
                            if (fullItem.indications) details.push('主治：' + fullItem.indications);
                            if (fullItem.type === 'formula') {
                                if (fullItem.composition) details.push('組成：' + fullItem.composition.replace(/\n/g, '、'));
                                if (fullItem.usage) details.push('用法：' + fullItem.usage);
                            }
                            if (fullItem.cautions) details.push('注意：' + fullItem.cautions);
                        }
                        const encoded = encodeURIComponent(details.join('\n'));
                        // 建立 HTML，並綁定 tooltip 事件於整個項目容器
                        return `
                            <div class="${bgColor} border rounded-lg p-3 cursor-pointer"
                                 data-tooltip="${encoded}"
                                 onmouseenter="showTooltip(event, this.getAttribute('data-tooltip'))"
                                 onmousemove="moveTooltip(event)"
                                 onmouseleave="hideTooltip()">
                                <div class="flex items-center">
                                    <div class="flex-1">
                                        <div class="font-semibold text-gray-900">${window.escapeHtml(item.name)}</div>
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
                                ${''}
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
                    // 為方劑僅記錄名稱與劑量，不包含組成
                    prescriptionText += `${item.name} ${dosage}g\n\n`;
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
                // 移除處方項目時，若游標仍在原位置會導致 tooltip 殘留，故手動隱藏
                if (typeof hideTooltip === 'function') {
                    hideTooltip();
                }
                
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
                // 讀取病人的診症記錄（強制刷新），避免跨裝置快取不一致
                const consultationResult = await window.firebaseDataManager.getPatientConsultations(patient.id, true);
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
                // 從 Firebase 取得病人的診症記錄並按日期排序（強制刷新），避免跨裝置快取不一致
                const consultationResult = await window.firebaseDataManager.getPatientConsultations(patient.id, true);
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
        // 改為使用 fetchUsers() 以利用快取減少讀取次數
        const data = await fetchUsers();
        if (Array.isArray(data) && data.length > 0) {
            usersFromFirebase = data;
            users = data.map(user => ({
                ...user,
                createdAt: user.createdAt ? (user.createdAt.seconds ? new Date(user.createdAt.seconds * 1000).toISOString() : user.createdAt) : new Date().toISOString(),
                updatedAt: user.updatedAt ? (user.updatedAt.seconds ? new Date(user.updatedAt.seconds * 1000).toISOString() : user.updatedAt) : new Date().toISOString(),
                lastLogin: user.lastLogin ? (user.lastLogin.seconds ? new Date(user.lastLogin.seconds * 1000).toISOString() : user.lastLogin) : null
            }));
            console.log('已載入用戶數據 (使用快取):', usersFromFirebase.length, '筆');
        } else {
            // 如果讀取失敗或無資料，使用本地 users 數據
            usersFromFirebase = users;
            console.log('快取或 Firebase 讀取失敗，使用本地用戶數據');
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
                // 使用 fetchUsers() 以利用快取減少讀取次數
                const data = await fetchUsers();
                if (Array.isArray(data) && data.length > 0) {
                    users = data.map(user => {
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
                console.error('載入用戶資料失敗:', error);
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
        // 讀取病人與診症資料，並透過 fetchUsers() 取得用戶列表
        const [patientsRes, consultationsRes] = await Promise.all([
            window.firebaseDataManager.getPatients(),
            window.firebaseDataManager.getConsultations()
        ]);
        const patientsData = patientsRes && patientsRes.success && Array.isArray(patientsRes.data) ? patientsRes.data : [];
        const consultationsData = consultationsRes && consultationsRes.success && Array.isArray(consultationsRes.data) ? consultationsRes.data : [];
        // 使用 fetchUsers(true) 以取得最新用戶列表（並利用快取降低讀取次數）
        let usersData = [];
        try {
            const fetchedUsers = await fetchUsers(true);
            if (Array.isArray(fetchedUsers)) {
                usersData = fetchedUsers;
            }
        } catch (_fetchErr) {
            console.warn('匯出備份時取得用戶列表失敗，將不包含用戶資料');
        }
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
        // Note: 中藥庫與模板庫資料不再納入備份檔案，僅保留其他核心資料
        const backup = {
            patients: patientsData,
            consultations: consultationsData,
            users: usersData,
            // herbLibrary: herbData, // 移除中藥庫資料備份
            billingItems: billingData,
            patientPackages: packageData,
            clinicSettings: clinicSettings,
            // prescriptionTemplates: prescriptionTemplatesData, // 移除醫囑模板備份
            // diagnosisTemplates: diagnosisTemplatesData, // 移除診斷模板備份
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
    // 顯示匯入進度條，由於不再涵蓋中藥庫及模板庫，總步驟數調整為 6
    const totalStepsForBackupImport = 6;
    showBackupProgressBar(totalStepsForBackupImport);
    try {
        const text = await file.text();
        const data = JSON.parse(text);
        // 傳入進度回調以更新匯入進度
        await importClinicBackup(data, function(step, total) {
            updateBackupProgressBar(step, total);
        });
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
    // 中藥庫與模板庫不再還原，總步驟數調整為 6
    let totalSteps = 6;
    // 若第二個參數為函式，視為進度回調；第三個參數為總步驟數（可選）
    if (arguments.length >= 2 && typeof arguments[1] === 'function') {
        progressCallback = arguments[1];
    }
    if (arguments.length >= 3 && typeof arguments[2] === 'number') {
        totalSteps = arguments[2];
    }
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
    // 覆蓋各集合並更新進度
    let stepCount = 0;
    await replaceCollection('patients', Array.isArray(data.patients) ? data.patients : []);
    stepCount++;
    if (progressCallback) progressCallback(stepCount, totalSteps);

    await replaceCollection('consultations', Array.isArray(data.consultations) ? data.consultations : []);
    stepCount++;
    if (progressCallback) progressCallback(stepCount, totalSteps);

    await replaceCollection('users', Array.isArray(data.users) ? data.users : []);
    stepCount++;
    if (progressCallback) progressCallback(stepCount, totalSteps);

    // 跳過 herbLibrary 匯入

    await replaceCollection('billingItems', Array.isArray(data.billingItems) ? data.billingItems : []);
    stepCount++;
    if (progressCallback) progressCallback(stepCount, totalSteps);

    await replaceCollection('patientPackages', Array.isArray(data.patientPackages) ? data.patientPackages : []);
    stepCount++;
    if (progressCallback) progressCallback(stepCount, totalSteps);

    // 只覆蓋問診資料，不再覆蓋醫囑模板與診斷模板
    await replaceCollection('inquiries', Array.isArray(data.inquiries) ? data.inquiries : []);
    stepCount++;
    if (progressCallback) progressCallback(stepCount, totalSteps);
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
    // 保持現有的中藥庫與模板庫資料，不從備份中還原
    billingItems = Array.isArray(data.billingItems) ? data.billingItems : [];
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
    // 若最後仍未達到總步驟數，進行最後一次更新以顯示 100%
    if (progressCallback && stepCount < totalSteps) {
        progressCallback(totalSteps, totalSteps);
    }
}

/**
 * 觸發模板庫資料匯入。
 * 點擊匯入模板資料按鈕時，觸發隱藏的檔案選擇器。
 */
function triggerTemplateImport() {
  try {
    const input = document.getElementById('templateImportFile');
    if (input) {
      // Reset the input so selecting the same file again triggers change
      input.value = '';
      input.click();
    }
  } catch (e) {
    console.error('觸發模板匯入時發生錯誤:', e);
  }
}

/**
 * 處理選擇的模板庫匯入檔案。
 * 檔案應為 JSON 格式，包含 prescriptionTemplates 或 diagnosisTemplates 陣列，或直接為模板陣列。
 * 匯入會覆蓋現有的模板庫資料。
 * @param {File} file 使用者選擇的檔案
 */
async function handleTemplateImportFile(file) {
  if (!file) return;
  try {
    // 提醒使用者匯入將新增資料，不會刪除現有資料
    if (!window.confirm('匯入模板資料將新增資料（不會刪除現有模板庫資料），是否繼續？')) {
      return;
    }
    const text = await file.text();
    const data = JSON.parse(text);
    // 將檔案內容拆分成醫囑模板與診斷模板
    let prescriptions = [];
    let diagnoses = [];
    // 如果是陣列，根據欄位判斷類型
    if (Array.isArray(data)) {
      data.forEach(item => {
        if (!item || typeof item !== 'object') return;
        // 若未指定 id，產生一個唯一 id
        if (item.id === undefined || item.id === null) {
          item.id = Date.now() + Math.floor(Math.random() * 10000);
        }
        // 跳過中藥或方劑資料
        if (item.type === 'herb' || item.type === 'formula') {
          return;
        }
        // 透過診斷模板特有欄位判斷
        if ('chiefComplaint' in item || 'currentHistory' in item || 'tcmDiagnosis' in item || 'syndromeDiagnosis' in item) {
          diagnoses.push(item);
        } else {
          prescriptions.push(item);
        }
      });
    } else if (data && typeof data === 'object') {
      // JSON 物件可能包含 prescriptionTemplates、diagnosisTemplates 或其他命名
      if (Array.isArray(data.prescriptionTemplates)) {
        prescriptions = data.prescriptionTemplates.map(item => {
          if (!item || typeof item !== 'object') return null;
          // 跳過中藥或方劑資料
          if (item.type === 'herb' || item.type === 'formula') {
            return null;
          }
          if (item.id === undefined || item.id === null) {
            item.id = Date.now() + Math.floor(Math.random() * 10000);
          }
          return item;
        }).filter(Boolean);
      }
      if (Array.isArray(data.prescriptions)) {
        // 兼容名稱 prescriptions
        const arr = data.prescriptions.map(item => {
          if (!item || typeof item !== 'object') return null;
          // 跳過中藥或方劑資料
          if (item.type === 'herb' || item.type === 'formula') {
            return null;
          }
          if (item.id === undefined || item.id === null) {
            item.id = Date.now() + Math.floor(Math.random() * 10000);
          }
          return item;
        }).filter(Boolean);
        prescriptions = prescriptions.concat(arr);
      }
      if (Array.isArray(data.diagnosisTemplates)) {
        diagnoses = data.diagnosisTemplates.map(item => {
          if (!item || typeof item !== 'object') return null;
          // 跳過中藥或方劑資料
          if (item.type === 'herb' || item.type === 'formula') {
            return null;
          }
          if (item.id === undefined || item.id === null) {
            item.id = Date.now() + Math.floor(Math.random() * 10000);
          }
          return item;
        }).filter(Boolean);
      }
      if (Array.isArray(data.diagnoses)) {
        const arr = data.diagnoses.map(item => {
          if (!item || typeof item !== 'object') return null;
          // 跳過中藥或方劑資料
          if (item.type === 'herb' || item.type === 'formula') {
            return null;
          }
          if (item.id === undefined || item.id === null) {
            item.id = Date.now() + Math.floor(Math.random() * 10000);
          }
          return item;
        }).filter(Boolean);
        diagnoses = diagnoses.concat(arr);
      }
      // 若資料包含單一 templates 陣列
       if (Array.isArray(data.templates)) {
        data.templates.forEach(item => {
          if (!item || typeof item !== 'object') return;
          // 跳過中藥或方劑資料
          if (item.type === 'herb' || item.type === 'formula') {
            return;
          }
          if (item.id === undefined || item.id === null) {
            item.id = Date.now() + Math.floor(Math.random() * 10000);
          }
          if ('chiefComplaint' in item || 'currentHistory' in item || 'tcmDiagnosis' in item || 'syndromeDiagnosis' in item) {
            diagnoses.push(item);
          } else {
            prescriptions.push(item);
          }
        });
      }
    }
    // 如未找到任何模板資料，根據模式決定是否提示錯誤
    const hasPrescriptions = Array.isArray(prescriptions) && prescriptions.length > 0;
    const hasDiagnoses = Array.isArray(diagnoses) && diagnoses.length > 0;
    if (!hasPrescriptions && !hasDiagnoses) {
      if (!window.isCombinedImportMode) {
        showToast('未偵測到有效的模板資料', 'error');
      }
      return;
    }
    // 計算總步驟：醫囑模板與診斷模板項目總數
    const totalSteps =
      (Array.isArray(prescriptions) ? prescriptions.length : 0) +
      (Array.isArray(diagnoses) ? diagnoses.length : 0);
    try {
      showImportProgressBar(totalSteps);
      let processedCount = 0;
      await importTemplateLibraryData(
        prescriptions,
        diagnoses,
        () => {
          // 增加處理計數並更新進度條
          processedCount++;
          updateImportProgressBar(processedCount, totalSteps);
        }
      );
      finishImportProgressBar(true);
      showToast('模板資料匯入完成！', 'success');
    } catch (err) {
      finishImportProgressBar(false);
      throw err;
    }
  } catch (err) {
    console.error('處理模板匯入檔案時發生錯誤:', err);
    showToast('匯入模板資料失敗，請確認檔案格式是否正確', 'error');
  }
}

/**
 * 將模板庫資料寫入 Firestore，覆蓋現有的醫囑模板與診斷模板集合。
 * 同步更新本地變數並重新渲染界面。
 * @param {Array} prescriptions 醫囑模板陣列
 * @param {Array} diagnoses 診斷模板陣列
 */
async function importTemplateLibraryData(prescriptions, diagnoses, progressCallback) {
  try {
    // Firestore 不再用於模板庫管理，移除遠端寫入及初始化等待。
    // 定義資料處理 helper，只用於調整進度條，不與 Firestore 互動。
    async function upsertCollectionItems(collectionName, items) {
      if (!Array.isArray(items) || items.length === 0) return;
      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        // 遞增進度
        if (typeof progressCallback === 'function') {
          progressCallback();
        }
      }
    }
    // 先初始化本地全域變數為空陣列（如果尚未存在）
    if (typeof prescriptionTemplates === 'undefined') {
      prescriptionTemplates = [];
    }
    if (typeof diagnosisTemplates === 'undefined') {
      diagnosisTemplates = [];
    }
    // 更新/新增醫囑模板
    if (Array.isArray(prescriptions) && prescriptions.length > 0) {
      // 不再寫入至 Firestore，僅更新本地資料並調整進度
      await upsertCollectionItems('prescriptionTemplates', prescriptions);
      // 合併到本地資料：根據 id 替換或新增
      const updated = Array.isArray(prescriptionTemplates) ? [...prescriptionTemplates] : [];
      prescriptions.forEach(item => {
        if (!item || typeof item !== 'object') return;
        const idx = updated.findIndex(p => String(p.id) === String(item.id));
        if (idx >= 0) {
          updated[idx] = { ...updated[idx], ...item };
        } else {
          updated.push(item);
        }
      });
      prescriptionTemplates = updated;
    }
    // 更新/新增診斷模板
    if (Array.isArray(diagnoses) && diagnoses.length > 0) {
      // 不再寫入至 Firestore，僅更新本地資料並調整進度
      await upsertCollectionItems('diagnosisTemplates', diagnoses);
      const updatedDiag = Array.isArray(diagnosisTemplates) ? [...diagnosisTemplates] : [];
      diagnoses.forEach(item => {
        if (!item || typeof item !== 'object') return;
        const idx = updatedDiag.findIndex(d => String(d.id) === String(item.id));
        if (idx >= 0) {
          updatedDiag[idx] = { ...updatedDiag[idx], ...item };
        } else {
          updatedDiag.push(item);
        }
      });
      diagnosisTemplates = updatedDiag;
    }
    // 重新渲染模板列表
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
    // 更新分類下拉選單
    if (typeof refreshTemplateCategoryFilters === 'function') {
      try {
        refreshTemplateCategoryFilters();
      } catch (_e) {}
    }
  } catch (error) {
    console.error('匯入模板資料時發生錯誤:', error);
    throw error;
  }
}

/**
 * 觸發中藥庫資料匯入。
 * 點擊匯入中藥資料按鈕時，觸發隱藏的檔案選擇器。
 */
function triggerHerbImport() {
  try {
    const input = document.getElementById('herbImportFile');
    if (input) {
      input.value = '';
      input.click();
    }
  } catch (e) {
    console.error('觸發中藥庫匯入時發生錯誤:', e);
  }
}

/**
 * 處理選擇的中藥庫匯入檔案。
 * 檔案應為 JSON 格式，包含 herbLibrary 陣列，或直接為中藥庫條目陣列。
 * 匯入會覆蓋現有的中藥庫資料。
 * @param {File} file 使用者選擇的檔案
 */
async function handleHerbImportFile(file) {
  if (!file) return;
  try {
    if (!window.confirm('匯入中藥資料將新增資料（不會刪除現有中藥庫資料），是否繼續？')) {
      return;
    }
    const text = await file.text();
    const data = JSON.parse(text);
    let items = [];
    if (Array.isArray(data)) {
      items = data;
    } else if (data && typeof data === 'object') {
      if (Array.isArray(data.herbLibrary)) {
        items = data.herbLibrary;
      } else if (Array.isArray(data.herbs)) {
        items = data.herbs;
      } else if (Array.isArray(data.items)) {
        items = data.items;
      }
    }
    // 過濾僅保留中藥或方劑資料
    if (Array.isArray(items)) {
      items = items.filter(item => {
        return item && typeof item === 'object' && (item.type === 'herb' || item.type === 'formula');
      });
    }
    if (!Array.isArray(items) || items.length === 0) {
      if (!window.isCombinedImportMode) {
        showToast('未偵測到有效的中藥庫資料', 'error');
      }
      return;
    }
    // 給未設置 id 的項目產生 id
    items = items.map(item => {
      if (!item || typeof item !== 'object') return item;
      if (item.id === undefined || item.id === null) {
        item.id = Date.now() + Math.floor(Math.random() * 10000);
      }
      return item;
    });
    // 計算總步驟
    const totalSteps = Array.isArray(items) ? items.length : 0;
    try {
      showImportProgressBar(totalSteps);
      let processedCount = 0;
      await importHerbLibraryData(items, () => {
        processedCount++;
        updateImportProgressBar(processedCount, totalSteps);
      });
      finishImportProgressBar(true);
      showToast('中藥資料匯入完成！', 'success');
    } catch (err2) {
      finishImportProgressBar(false);
      throw err2;
    }
  } catch (err) {
    console.error('處理中藥匯入檔案時發生錯誤:', err);
    showToast('匯入中藥資料失敗，請確認檔案格式是否正確', 'error');
  }
}

/**
 * 將中藥庫資料寫入 Firestore，覆蓋現有的 herbLibrary 集合。
 * 同步更新本地變數並重新渲染中藥庫列表。
 * @param {Array} items 中藥庫資料陣列
 */
async function importHerbLibraryData(items, progressCallback) {
  try {
    // 不再使用 Firestore，移除遠端初始化等待。
    if (!Array.isArray(items) || items.length === 0) {
      return;
    }
    // 確保本地變數存在
    if (typeof herbLibrary === 'undefined') {
      herbLibrary = [];
    }
    // 逐一新增/更新藥材資料
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const idStr = String(item.id);
      // 不再寫入至 Firestore，只更新本地資料並調整進度
      if (typeof progressCallback === 'function') {
        progressCallback();
      }
      // 更新本地陣列：若已存在則覆蓋，否則加入
      const idx = herbLibrary.findIndex(h => String(h.id) === idStr);
      if (idx >= 0) {
        herbLibrary[idx] = { ...herbLibrary[idx], ...item };
      } else {
        herbLibrary.push(item);
      }
    }
    // 重新載入並顯示資料
    if (typeof initHerbLibrary === 'function') {
      try {
        await initHerbLibrary();
      } catch (_e) {}
    }
    if (typeof displayHerbLibrary === 'function') {
      try {
        displayHerbLibrary();
      } catch (_e) {}
    }
  } catch (error) {
    console.error('匯入中藥資料時發生錯誤:', error);
    throw error;
  }
}

/**
 * 清除所有模板資料（醫囑與診斷模板）。
 * 顯示進度條並逐一刪除資料。
 */
// 已移除 clearTemplateData 功能

/**
 * 清除所有中藥資料。
 * 顯示進度條並逐一刪除資料。
 */
// 已移除 clearHerbData 功能

/**
 * 觸發匯入模板與中藥資料的檔案選擇器。
 * 清空檔案輸入框並打開檔案選擇對話框。
 */
// 已移除 triggerTemplateAndHerbImport 功能

/**
 * 處理選擇的模板及中藥資料檔案。
 * 會先顯示確認提示，再依次執行模板匯入與中藥匯入。
 * 在合併匯入模式下，將會抑制單項匯入時的確認提示與無效資料錯誤提示。
 * @param {File} file 使用者選擇的檔案
 */
// 已移除 handleTemplateAndHerbImportFile 功能

/**
 * 將模板與中藥庫資料匯出為 JSON 檔案。
 * 會從 Firestore 讀取醫囑模板、診斷模板及中藥庫資料，組合成單一檔案下載。
 */
// 已移除 exportTemplateAndHerbData 功能

        
// 套票管理函式
// 取得指定患者的套票清單，並使用本地快取避免重複讀取。
// 新增 forceRefresh 參數允許呼叫端強制重新讀取資料。
async function getPatientPackages(patientId, forceRefresh = false) {
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
    // 如果有快取且不需要強制刷新，直接回傳快取內容
    if (!forceRefresh && patientPackagesCache && Array.isArray(patientPackagesCache[patientId])) {
        return patientPackagesCache[patientId];
    }
    try {
        const result = await window.firebaseDataManager.getPatientPackages(patientId);
        const packages = result.success ? result.data : [];
        // 將結果存入快取供下次使用
        if (packages) {
            patientPackagesCache[patientId] = packages;
        }
        return packages;
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
            // 建立新套票記錄並更新本地快取
            const newPkg = { ...record, id: result.id };
            if (Array.isArray(patientPackagesCache[patientId])) {
                // 若快取存在，附加新套票
                patientPackagesCache[patientId] = [...patientPackagesCache[patientId], newPkg];
            } else {
                // 建立新的快取陣列
                patientPackagesCache[patientId] = [newPkg];
            }
            return newPkg;
        }
        return null;
    } catch (error) {
        console.error('購買套票錯誤:', error);
        return null;
    }
}

async function consumePackage(patientId, packageRecordId) {
    try {
        // 始終從資料庫重新取得套票，避免跨裝置快取不一致
        const packages = await getPatientPackages(patientId, true);
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
            // 更新本地快取中的對應套票剩餘次數
            if (Array.isArray(patientPackagesCache[patientId])) {
                patientPackagesCache[patientId] = patientPackagesCache[patientId].map(p => {
                    if (String(p.id) === String(packageRecordId)) {
                        return { ...p, remainingUses: (p.remainingUses || 0) - 1 };
                    }
                    return p;
                });
            }
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
        // 始終重新載入套票，避免跨裝置快取不一致
        const packages = await getPatientPackages(patientId, true);
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
        // 始終重新載入套票資料，避免跨裝置快取不一致
        const pkgs = await getPatientPackages(patientId, true);
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
                // 使用強制刷新取得最新套票資料，避免跨裝置快取不一致
                const pkgsForUndo = await getPatientPackages(item.patientId, true);
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
            // 強制重新取得病人的套票，避免跨裝置快取不一致
            const packages = await getPatientPackages(item.patientId, true);
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
        // 強制重新載入套票，避免跨裝置快取不一致
        const packages = await getPatientPackages(patientId, true);
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
        // 設置初始狀態與快取欄位
        this.isReady = false;
        // 用於緩存病人列表，避免在同一工作階段重複向 Firestore 讀取整個 patients 集合
        this.patientsCache = null;
        // 用於緩存診症記錄列表與其分頁資訊
        this.consultationsCache = null;
        this.consultationsLastVisible = null;
        this.consultationsHasMore = false;
        // 用於緩存用戶列表與其分頁資訊
        this.usersCache = null;
        this.usersLastVisible = null;
        this.usersHasMore = false;
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
                    // 初始化套票彙總欄位，避免未購買套票時為 undefined
                    packageActiveCount: 0,
                    packageRemainingUses: 0,
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

    /**
     * 讀取病人列表並使用內部快取。
     * 預設情況下若已存在快取，直接回傳快取內容以避免重複讀取。
     * 傳入 forceRefresh=true 可強制刷新快取並重新從 Firestore 取得最新資料。
     *
     * @param {boolean} forceRefresh 是否強制重新載入
     * @returns {Promise<{ success: boolean, data: Array }>} 病人資料
     */
    async getPatients(forceRefresh = false) {
        if (!this.isReady) return { success: false, data: [] };
        try {
            // 若已存在快取且不需強制刷新，直接回傳快取
            // 包含空陣列亦應視為有效快取，避免在沒有病人時每次都去讀取
            if (!forceRefresh && this.patientsCache !== null) {
                return { success: true, data: this.patientsCache };
            }
            const querySnapshot = await window.firebase.getDocs(
                window.firebase.collection(window.firebase.db, 'patients')
            );
            const patients = [];
            querySnapshot.forEach((doc) => {
                patients.push({ id: doc.id, ...doc.data() });
            });
            // 將結果寫入快取
            this.patientsCache = patients;
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
            // 新增診症後清除全域診症快取
            this.consultationsCache = null;
            // 同時清除或更新單一病人的診症快取，以便下次重新讀取
            try {
                if (consultationData && consultationData.patientId) {
                    delete patientConsultationsCache[consultationData.patientId];
                } else {
                    // 如果缺少病人 ID，清除所有病人診症快取
                    patientConsultationsCache = {};
                }
            } catch (_err) {
                // 若執行快取清理時發生錯誤，直接重置快取
                patientConsultationsCache = {};
            }
            return { success: true, id: docRef.id };
        } catch (error) {
            console.error('添加診症記錄失敗:', error);
            showToast('保存診症記錄失敗', 'error');
            return { success: false, error: error.message };
        }
    }

    /**
     * 讀取診症記錄列表並使用內部快取。
     * 預設情況下若已存在快取，直接回傳快取內容以避免重複讀取。
     * 傳入 forceRefresh=true 可強制刷新快取並重新從 Firestore 取得最新資料。
     *
     * @param {boolean} forceRefresh 是否強制重新載入
     * @returns {Promise<{ success: boolean, data: Array }>} 診症記錄資料
     */
    /**
     * 取得診症記錄列表。
     * 預設僅讀取第一批資料，並將游標與快取存入實例屬性，供後續分頁使用。
     * 若傳入 forceRefresh=true 則重置游標並重新讀取第一批資料。
     *
     * @param {boolean} forceRefresh 是否強制重新從 Firestore 讀取第一頁資料
     * @returns {Promise<{ success: boolean, data: Array, hasMore: boolean }>}
     */
    async getConsultations(forceRefresh = false) {
        if (!this.isReady) return { success: false, data: [] };
        try {
            // 如果有快取且不需強制刷新，直接回傳快取資料及是否還有下一頁
            if (!forceRefresh && this.consultationsCache !== null) {
                return { success: true, data: this.consultationsCache, hasMore: !!this.consultationsHasMore };
            }
            // 清除既有快取與游標
            this.consultationsCache = [];
            this.consultationsLastVisible = null;
            this.consultationsHasMore = false;
            const pageSize = 100;
            // 建立查詢：使用 limit 控制單次載入筆數
            const q = window.firebase.firestoreQuery(
                window.firebase.collection(window.firebase.db, 'consultations'),
                window.firebase.limit(pageSize)
            );
            const querySnapshot = await window.firebase.getDocs(q);
            const consultations = [];
            querySnapshot.forEach((docSnap) => {
                consultations.push({ id: docSnap.id, ...docSnap.data() });
            });
            // 設定游標為最後一筆文件
            this.consultationsLastVisible = querySnapshot.docs.length > 0 ? querySnapshot.docs[querySnapshot.docs.length - 1] : null;
            // 判斷是否還有下一頁
            this.consultationsHasMore = querySnapshot.docs.length === pageSize;
            // 更新快取
            this.consultationsCache = consultations;
            console.log('已從 Firebase 讀取診症記錄，載入', consultations.length, '筆');
            return { success: true, data: consultations, hasMore: this.consultationsHasMore };
        } catch (error) {
            console.error('讀取診症記錄失敗:', error);
            return { success: false, data: [] };
        }
    }

    /**
     * 取得診症記錄的下一頁資料。
     * 需要先呼叫 getConsultations() 讀取第一批資料後，才能使用本方法。
     * 本方法會更新快取及游標並將新加入的資料附加至快取陣列。
     * 若沒有更多資料可讀取，將回傳空陣列並維持 hasMore 為 false。
     *
     * @returns {Promise<{ success: boolean, data: Array, hasMore: boolean }>}
     */
    async getConsultationsNextPage() {
        if (!this.isReady) return { success: false, data: [] };
        try {
            // 若上一頁沒有讀取滿 pageSize，表示沒有更多資料
            if (!this.consultationsHasMore || !this.consultationsLastVisible) {
                return { success: true, data: [], hasMore: false };
            }
            const pageSize = 100;
            // 建立查詢：從上一頁最後一筆之後開始
            const q = window.firebase.firestoreQuery(
                window.firebase.collection(window.firebase.db, 'consultations'),
                window.firebase.startAfter(this.consultationsLastVisible),
                window.firebase.limit(pageSize)
            );
            const snapshot = await window.firebase.getDocs(q);
            const newData = [];
            snapshot.forEach((docSnap) => {
                newData.push({ id: docSnap.id, ...docSnap.data() });
            });
            // 更新游標
            this.consultationsLastVisible = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : this.consultationsLastVisible;
            // 判斷是否還有更多資料
            this.consultationsHasMore = snapshot.docs.length === pageSize;
            // 將新資料附加至快取
            this.consultationsCache = Array.isArray(this.consultationsCache) ? this.consultationsCache.concat(newData) : newData;
            return { success: true, data: this.consultationsCache, hasMore: this.consultationsHasMore };
        } catch (error) {
            console.error('讀取診症記錄下一頁失敗:', error);
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
            // 更新診症後清除全域診症快取
            this.consultationsCache = null;
            // 更新單一病人診症快取或清除全部快取
            try {
                if (consultationData && consultationData.patientId) {
                    delete patientConsultationsCache[consultationData.patientId];
                } else {
                    // 如果無法確定病人 ID，則清除所有病人診症快取
                    patientConsultationsCache = {};
                }
            } catch (_err) {
                patientConsultationsCache = {};
            }
            return { success: true };
        } catch (error) {
            console.error('更新診症記錄失敗:', error);
            return { success: false, error: error.message };
        }
    }

    async getPatientConsultations(patientId, forceRefresh = false) {
        if (!this.isReady) return { success: false, data: [] };

        try {
            // 若快取存在且不需要強制刷新，直接回傳快取資料
            if (!forceRefresh && patientConsultationsCache && Array.isArray(patientConsultationsCache[patientId])) {
                return { success: true, data: patientConsultationsCache[patientId] };
            }
            /**
             * 改為直接使用 Firestore 查詢特定 patientId 的診療記錄，避免先讀取全部後再過濾。
             * 這樣可降低讀取量，僅在開啟病歷時讀取該病患相關的診療記錄。
             */
            // 使用 where 條件建立查詢
            const colRef = window.firebase.collection(window.firebase.db, 'consultations');
            const q = window.firebase.firestoreQuery(colRef, window.firebase.where('patientId', '==', patientId));
            const querySnapshot = await window.firebase.getDocs(q);
            const patientConsultations = [];
            querySnapshot.forEach((docSnap) => {
                patientConsultations.push({ id: docSnap.id, ...docSnap.data() });
            });
            // 按日期（若有 date 欄位）或 createdAt 排序，最新在前
            patientConsultations.sort((a, b) => {
                const dateA = a.date
                    ? (a.date.seconds ? new Date(a.date.seconds * 1000) : new Date(a.date))
                    : (a.createdAt && a.createdAt.seconds ? new Date(a.createdAt.seconds * 1000) : new Date(a.createdAt));
                const dateB = b.date
                    ? (b.date.seconds ? new Date(b.date.seconds * 1000) : new Date(b.date))
                    : (b.createdAt && b.createdAt.seconds ? new Date(b.createdAt.seconds * 1000) : new Date(b.createdAt));
                return dateB - dateA;
            });
            // 儲存至快取以供後續使用
            patientConsultationsCache[patientId] = patientConsultations;
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

    /**
     * 取得用戶列表。
     * 預設僅讀取第一批資料，並將游標與快取存入實例屬性，供後續分頁使用。
     * 若傳入 forceRefresh=true 則重置游標並重新讀取第一批資料。
     *
     * @param {boolean} forceRefresh 是否強制重新從 Firestore 讀取第一頁資料
     * @returns {Promise<{ success: boolean, data: Array, hasMore: boolean }>}
     */
    async getUsers(forceRefresh = false) {
        if (!this.isReady) return { success: false, data: [] };
        try {
            // 有快取且不需強制刷新時直接回傳現有快取
            if (!forceRefresh && this.usersCache !== null) {
                return { success: true, data: this.usersCache, hasMore: !!this.usersHasMore };
            }
            // 重置快取與游標
            this.usersCache = [];
            this.usersLastVisible = null;
            this.usersHasMore = false;
            const pageSize = 100;
            const q = window.firebase.firestoreQuery(
                window.firebase.collection(window.firebase.db, 'users'),
                window.firebase.limit(pageSize)
            );
            const snapshot = await window.firebase.getDocs(q);
            const users = [];
            snapshot.forEach((docSnap) => {
                users.push({ id: docSnap.id, ...docSnap.data() });
            });
            this.usersLastVisible = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null;
            this.usersHasMore = snapshot.docs.length === pageSize;
            this.usersCache = users;
            console.log('已從 Firebase 讀取用戶數據，載入', users.length, '筆');
            return { success: true, data: users, hasMore: this.usersHasMore };
        } catch (error) {
            console.error('讀取用戶數據失敗:', error);
            return { success: false, data: [] };
        }
    }

    /**
     * 取得用戶列表的下一頁資料。
     * 需要先呼叫 getUsers() 取得第一頁後，才能使用本方法。
     * 本方法會更新快取及游標並將新資料附加至快取。
     * 若沒有更多資料可讀取，將回傳空陣列並維持 hasMore 為 false。
     *
     * @returns {Promise<{ success: boolean, data: Array, hasMore: boolean }>}
     */
    async getUsersNextPage() {
        if (!this.isReady) return { success: false, data: [] };
        try {
            if (!this.usersHasMore || !this.usersLastVisible) {
                return { success: true, data: [], hasMore: false };
            }
            const pageSize = 100;
            const q = window.firebase.firestoreQuery(
                window.firebase.collection(window.firebase.db, 'users'),
                window.firebase.startAfter(this.usersLastVisible),
                window.firebase.limit(pageSize)
            );
            const snapshot = await window.firebase.getDocs(q);
            const newData = [];
            snapshot.forEach((docSnap) => {
                newData.push({ id: docSnap.id, ...docSnap.data() });
            });
            this.usersLastVisible = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : this.usersLastVisible;
            this.usersHasMore = snapshot.docs.length === pageSize;
            this.usersCache = Array.isArray(this.usersCache) ? this.usersCache.concat(newData) : newData;
            return { success: true, data: this.usersCache, hasMore: this.usersHasMore };
        } catch (error) {
            console.error('讀取用戶資料下一頁失敗:', error);
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

    /**
     * 讀取單一掛號資料。
     * 透過指定掛號 ID 的路徑讀取，避免一次載入整個 appointments 清單，
     * 以減少無用的資料傳輸。當資料存在時回傳 { id, ...data }；
     * 若節點不存在則回傳 null。
     *
     * @param {string|number} id - 掛號 ID
     * @returns {Promise<{ success: boolean, data: Object|null }>}
     */
    async getAppointment(id) {
        if (!this.isReady) return { success: false, data: null };
        try {
            const snapshot = await window.firebase.get(
                window.firebase.ref(window.firebase.rtdb, 'appointments/' + id)
            );
            const data = snapshot.val();
            if (data !== null && data !== undefined) {
                return { success: true, data: { id: String(id), ...data } };
            } else {
                return { success: false, data: null };
            }
        } catch (error) {
            console.error('讀取單一掛號失敗:', error);
            return { success: false, data: null };
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
            // 在成功添加套票後，更新病人文件中的套票彙總欄位。
            try {
                // 套票資料中應包含 patientId
                if (packageData && packageData.patientId) {
                    await this.updatePatientPackageAggregates(packageData.patientId);
                }
            } catch (aggErr) {
                console.error('新增套票後更新套票彙總欄位失敗:', aggErr);
            }
            return { success: true, id: docRef.id };
        } catch (error) {
            console.error('添加患者套票失敗:', error);
            return { success: false, error: error.message };
        }
    }

    async getPatientPackages(patientId) {
        if (!this.isReady) return { success: false, data: [] };
        try {
            // 使用條件查詢僅取得該病人的套票，避免一次讀取整個 patientPackages 集合
            const q = window.firebase.firestoreQuery(
                window.firebase.collection(window.firebase.db, 'patientPackages'),
                window.firebase.where('patientId', '==', patientId)
            );
            const querySnapshot = await window.firebase.getDocs(q);
            const packages = [];
            querySnapshot.forEach((doc) => {
                packages.push({ id: doc.id, ...doc.data() });
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
            // 更新本地快取中的套票資料
            try {
                // 如果 packageData 中包含 patientId，且 global 的 patientPackagesCache 有該病人的資料
                if (packageData && packageData.patientId && patientPackagesCache && Array.isArray(patientPackagesCache[packageData.patientId])) {
                    const pidStr = String(packageData.patientId);
                    patientPackagesCache[pidStr] = patientPackagesCache[pidStr].map(p => {
                        if (String(p.id) === String(packageId)) {
                            // 將更新後的資料合併到本地快取中
                            return { ...p, ...packageData };
                        }
                        return p;
                    });
                }
            } catch (cacheErr) {
                console.warn('更新套票後更新本地快取失敗:', cacheErr);
            }
            // 套票更新後，同步更新對應病人的套票彙總欄位。
            try {
                if (packageData && packageData.patientId) {
                    await this.updatePatientPackageAggregates(packageData.patientId);
                }
            } catch (aggErr) {
                console.error('更新套票後更新套票彙總欄位失敗:', aggErr);
            }
            return { success: true };
        } catch (error) {
            console.error('更新患者套票失敗:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 更新指定病人文件的套票彙總欄位。
     * 彙總欄位包括：
     * - packageActiveCount：當前仍有剩餘次數的套票數量
     * - packageRemainingUses：當前所有有效套票剩餘次數之和
     * 此函式在添加或更新套票後呼叫，用於去正規化包套票資料，
     * 避免在顯示病人列表時反覆查詢 patientPackages。
     * 若查詢 getCountFromServer 失敗，將回退至讀取文件數量並統計。
     *
     * @param {string} patientId 病人 ID
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async updatePatientPackageAggregates(patientId) {
        // 如果資料管理器尚未準備好，則略過更新
        if (!this.isReady) {
            return { success: false, error: 'Data manager not ready' };
        }
        try {
            // 構建查詢：篩選此病人的套票且剩餘次數大於 0
            const packagesCollection = window.firebase.collection(window.firebase.db, 'patientPackages');
            const activeQuery = window.firebase.firestoreQuery(
                packagesCollection,
                window.firebase.where('patientId', '==', patientId),
                window.firebase.where('remainingUses', '>', 0)
            );
            // 使用 Firestore 聚合查詢 count() 取得有效套票數量
            let activeCount = 0;
            try {
                const countSnap = await window.firebase.getCountFromServer(activeQuery);
                const cnt = countSnap && countSnap.data && typeof countSnap.data().count === 'number' ? countSnap.data().count : 0;
                activeCount = cnt;
            } catch (countErr) {
                // 若聚合查詢失敗，退回使用 getDocs 計算文件數
                try {
                    const fallbackSnap = await window.firebase.getDocs(activeQuery);
                    activeCount = fallbackSnap.size;
                } catch (fallbackErr) {
                    console.warn('取得有效套票數量失敗:', fallbackErr);
                    activeCount = 0;
                }
            }
            // 計算剩餘次數總和：讀取有效套票文件並累加 remainingUses
            let totalRemainingUses = 0;
            try {
                const snap = await window.firebase.getDocs(activeQuery);
                snap.forEach((docSnap) => {
                    const d = docSnap.data();
                    if (d && typeof d.remainingUses === 'number') {
                        totalRemainingUses += d.remainingUses;
                    }
                });
            } catch (sumErr) {
                console.warn('計算套票剩餘次數失敗:', sumErr);
                totalRemainingUses = 0;
            }
            // 更新病人文件中的彙總欄位
            try {
                const patientRef = window.firebase.doc(window.firebase.db, 'patients', patientId);
                await window.firebase.updateDoc(patientRef, {
                    packageActiveCount: activeCount,
                    packageRemainingUses: totalRemainingUses,
                    updatedAt: new Date(),
                    updatedBy: currentUser || 'system'
                });
            } catch (updateErr) {
                console.error('更新病人套票彙總欄位失敗:', updateErr);
                return { success: false, error: updateErr.message };
            }
            return { success: true };
        } catch (err) {
            console.error('更新患者套票彙總欄位錯誤:', err);
            return { success: false, error: err.message };
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
                q = window.firebase.firestoreQuery(
                    baseRef,
                    window.firebase.where('patientName', '==', patientName),
                    window.firebase.orderBy('createdAt', 'desc')
                );
            } else {
                q = window.firebase.firestoreQuery(baseRef, window.firebase.orderBy('createdAt', 'desc'));
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
            const now = new Date();
            // 計算今日凌晨時間（本地時區）。任何發生在此時間之前的紀錄將被視為過期。
            const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const inquiriesRef = window.firebase.collection(window.firebase.db, 'inquiries');

            // 儲存待刪除文件的 ID，避免重複處理
            const idsToDelete = new Set();
            const docsToDelete = [];

            /*
             * Firestore 支援條件查詢，我們將依據 createdAt 與 expireAt 分別查詢過期文件。
             * 這樣只讀取符合篩選條件的文件，避免先讀取全部再過濾。
             * 注意：若某筆文件同時具備 createdAt 與 expireAt 且皆小於今日凌晨，會在兩次查詢中出現，
             *       因此需用 Set 去除重複，並再驗證目標日期以保險無誤。
             */
            try {
                // 查詢 createdAt 在今日凌晨之前的文件
                const qCreated = window.firebase.firestoreQuery(
                    inquiriesRef,
                    window.firebase.where('createdAt', '<', startOfToday)
                );
                const snapshotCreated = await window.firebase.getDocs(qCreated);
                snapshotCreated.forEach((doc) => {
                    docsToDelete.push(doc);
                });
            } catch (err) {
                console.warn('查詢過期 createdAt 問診資料失敗:', err);
            }

            try {
                // 查詢 expireAt 在今日凌晨之前的文件
                const qExpire = window.firebase.firestoreQuery(
                    inquiriesRef,
                    window.firebase.where('expireAt', '<', startOfToday)
                );
                const snapshotExpire = await window.firebase.getDocs(qExpire);
                snapshotExpire.forEach((doc) => {
                    docsToDelete.push(doc);
                });
            } catch (err) {
                console.warn('查詢過期 expireAt 問診資料失敗:', err);
            }

            const deletions = [];
            // 驗證並彙整需要刪除的文件
            docsToDelete.forEach((doc) => {
                // 避免同一文件被重複加入
                if (idsToDelete.has(doc.id)) return;
                const data = doc.data();
                let createdDate = null;
                if (data.createdAt) {
                    if (data.createdAt.seconds !== undefined) {
                        createdDate = new Date(data.createdAt.seconds * 1000);
                    } else {
                        createdDate = new Date(data.createdAt);
                    }
                }
                let targetDate = createdDate;
                if (!targetDate && data.expireAt) {
                    if (data.expireAt.seconds !== undefined) {
                        targetDate = new Date(data.expireAt.seconds * 1000);
                    } else {
                        targetDate = new Date(data.expireAt);
                    }
                }
                // 如果目標日期存在且早於今日凌晨，則加入刪除佇列
                if (targetDate && targetDate < startOfToday) {
                    idsToDelete.add(doc.id);
                    deletions.push(
                        window.firebase.deleteDoc(
                            window.firebase.doc(window.firebase.db, 'inquiries', doc.id)
                        )
                    );
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

    // 保持所有中藥材及方劑欄位可見（包含性味、歸經、主治、用法）
    
    
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
            // 搜尋時重置分頁至第一頁
            paginationSettings.patientList.currentPage = 1;
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
                // 先替換 'event' 與 'this' 為特殊標記，避免直接 eval 解析錯誤
                const replaced = trimmed
                    .replace(/\bevent\b/g, '__EVENT__')
                    .replace(/\bthis\b/g, '__THIS__');
                let args;
                try {
                    /*
                     * 使用動態函式的方式來解析包含 __EVENT__/__THIS__ 標記的引數字串，
                     * 並將實際的 event 與元素物件作為參數注入。這樣就可以正確解析
                     * 複雜的屬性存取表達式（例如 __THIS__.files[0]），避免將 __THIS__
                     * 當作字串處理導致無法讀取屬性。
                     */
                    const fn = new Function('__EVENT__', '__THIS__', 'return [' + replaced + '];');
                    args = fn(event, el);
                } catch (e) {
                    console.error('解析 inline 事件參數失敗:', argsStr, e);
                    args = [];
                }
                // args 現在已經是包含正確值的陣列，無需再替換特殊標記
                return args;
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

  // 數據匯入相關函式
  window.triggerTemplateImport = triggerTemplateImport;
  window.handleTemplateImportFile = handleTemplateImportFile;
  window.triggerHerbImport = triggerHerbImport;
  window.handleHerbImportFile = handleHerbImportFile;

  // 已移除合併匯入/匯出及清除資料相關函式
  // 預留 isCombinedImportMode 旗標為 false，以維持既有匯入流程的邏輯判斷
  window.isCombinedImportMode = false;

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
            // Firebase 不再使用：僅將分類資料儲存至 localStorage
            localStorage.setItem('categories', JSON.stringify(categories));
          } catch (err) {
            console.error('保存分類資料至本地失敗:', err);
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
          function renderHerbCombinations(pageChange = false) {
            const container = document.getElementById('herbCombinationsContainer');
            if (!container) return;
            container.innerHTML = '';
            // 更新中藥組合總數至標籤顯示
            try {
              const totalCount = Array.isArray(herbCombinations)
                ? herbCombinations.filter(item => item && item.name && String(item.name).trim() !== '').length
                : 0;
              const countElem = document.getElementById('herbCount');
              if (countElem) {
                countElem.textContent = String(totalCount);
              }
            } catch (_e) {}
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
            // 過濾掉未命名的新建組合
            list = Array.isArray(list)
              ? list.filter(item => item && item.name && String(item.name).trim() !== '')
              : [];
            // 分頁邏輯：在非分頁變更情況下重置當前頁至 1
            if (!pageChange) {
              paginationSettings.personalHerbCombos.currentPage = 1;
            }
            const totalItems = Array.isArray(list) ? list.length : 0;
            const itemsPerPage = paginationSettings.personalHerbCombos.itemsPerPage;
            let currentPage = paginationSettings.personalHerbCombos.currentPage;
            const totalPages = totalItems > 0 ? Math.ceil(totalItems / itemsPerPage) : 1;
            if (currentPage < 1) currentPage = 1;
            if (currentPage > totalPages) currentPage = totalPages;
            paginationSettings.personalHerbCombos.currentPage = currentPage;
            const startIdx = (currentPage - 1) * itemsPerPage;
            const endIdx = startIdx + itemsPerPage;
            const pageItems = Array.isArray(list) ? list.slice(startIdx, endIdx) : [];
            if (!pageItems || pageItems.length === 0) {
              // 無資料顯示提示並隱藏分頁
              container.innerHTML = '<div class="w-full md:col-span-2 text-center text-gray-400 text-lg py-10">創建自己的組合</div>';
              const paginEl = ensurePaginationContainer('herbCombinationsContainer', 'herbCombosPagination');
              if (paginEl) {
                paginEl.innerHTML = '';
                paginEl.classList.add('hidden');
              }
              return;
            }
            // 渲染當前頁項目
            pageItems.forEach(item => {
              const card = document.createElement('div');
              card.className = 'bg-white p-6 rounded-lg border-2 border-green-200';
              const category = item && item.category ? item.category : '';
              card.innerHTML = `
                <div class="flex justify-between items-start mb-3">
                  <div>
                    <h3 class="text-lg font-semibold text-green-800">${item.name}</h3>
                    <div class="text-xs text-green-600 mt-1">${category}</div>
                  </div>
                  <div class="flex gap-2">
                    <button class="text-blue-600 hover:text-blue-800 text-sm" onclick="showEditModal('herb', '${item.name}')">編輯</button>
                    <button class="text-red-600 hover:text-red-800 text-sm" onclick="deleteHerbCombination(${item.id})">刪除</button>
                  </div>
                </div>
                <p class="text-gray-600 mb-3">${item.description}</p>
                <div class="text-sm text-gray-700 space-y-1">
                  ${item.ingredients.map(ing => {
                    const dosage = ing && ing.dosage ? String(ing.dosage).trim() : '';
                    const displayDosage = dosage ? (dosage + '克') : '';
                    const nameVal = ing && ing.name ? ing.name : '';
                    // 取得該藥材的提示內容並編碼
                    const tooltipContent = getHerbTooltipContent(nameVal);
                    const encoded = tooltipContent ? encodeURIComponent(tooltipContent) : '';
                    let attrs = '';
                    if (tooltipContent) {
                      // Use proper escaping for single quotes inside single-quoted strings. The
                      // original implementation attempted to escape the single quotes surrounding
                      // the `data-tooltip` attribute name using double backslashes (\\'), which
                      // resulted in the string being prematurely terminated and caused a
                      // `SyntaxError: Unexpected identifier` at runtime. To correctly embed
                      // single quotes within a single-quoted JavaScript string, a single
                      // backslash (\') should be used. This matches the pattern used in
                      // similar code elsewhere in this file (see line ~16266).
                      attrs = ' data-tooltip="' + encoded + '" onmouseenter="showTooltip(event, this.getAttribute(\'data-tooltip\'))" onmousemove="moveTooltip(event)" onmouseleave="hideTooltip()"';
                    }
                    return '<div class="flex justify-between items-center p-2 bg-green-50 hover:bg-green-100 border border-green-200 rounded text-sm"' + attrs + '>' +
                      '<span class="text-green-800">' + nameVal + '</span>' +
                      '<span class="text-green-600">' + displayDosage + '</span>' +
                      '</div>';
                  }).join('')}
                </div>
              `;
              container.appendChild(card);
            });
            // 分頁控制元件
            const paginEl = ensurePaginationContainer('herbCombinationsContainer', 'herbCombosPagination');
            renderPagination(totalItems, itemsPerPage, currentPage, function(newPage) {
              paginationSettings.personalHerbCombos.currentPage = newPage;
              renderHerbCombinations(true);
            }, paginEl);
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
          function renderAcupointCombinations(pageChange = false) {
            // 根據搜尋關鍵字與分類篩選並渲染個人慣用穴位組合。
            const container = document.getElementById('acupointCombinationsContainer');
            if (!container) return;
            container.innerHTML = '';
            // 更新穴位組合總數至標籤顯示
            try {
              const totalCount = Array.isArray(acupointCombinations)
                ? acupointCombinations.filter(item => item && item.name && String(item.name).trim() !== '').length
                : 0;
              const countElem = document.getElementById('acupointCount');
              if (countElem) {
                countElem.textContent = String(totalCount);
              }
            } catch (_e) {}
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
            // 分頁邏輯：非分頁變更時將頁數重置為 1
            if (!pageChange) {
              paginationSettings.personalAcupointCombos.currentPage = 1;
            }
            const totalItems = Array.isArray(list) ? list.length : 0;
            const itemsPerPage = paginationSettings.personalAcupointCombos.itemsPerPage;
            let currentPage = paginationSettings.personalAcupointCombos.currentPage;
            const totalPages = totalItems > 0 ? Math.ceil(totalItems / itemsPerPage) : 1;
            if (currentPage < 1) currentPage = 1;
            if (currentPage > totalPages) currentPage = totalPages;
            paginationSettings.personalAcupointCombos.currentPage = currentPage;
            const startIdx = (currentPage - 1) * itemsPerPage;
            const endIdx = startIdx + itemsPerPage;
            const pageItems = Array.isArray(list) ? list.slice(startIdx, endIdx) : [];
            if (!pageItems || pageItems.length === 0) {
              container.innerHTML = '<div class="w-full md:col-span-2 text-center text-gray-400 text-lg py-10">創建自己的組合</div>';
              const paginEl = ensurePaginationContainer('acupointCombinationsContainer', 'acupointCombosPagination');
              if (paginEl) {
                paginEl.innerHTML = '';
                paginEl.classList.add('hidden');
              }
              return;
            }
            // 渲染當前頁資料
            pageItems.forEach(item => {
              const card = document.createElement('div');
              card.className = 'bg-white p-6 rounded-lg border-2 border-blue-200';
              const category = item && item.category ? item.category : '';
              card.innerHTML = `
                <div class="flex justify-between items-start mb-3">
                  <div>
                    <h3 class="text-lg font-semibold text-blue-800">${item.name}</h3>
                    <div class="text-xs text-blue-600 mt-1">${category}</div>
                  </div>
                  <div class="flex gap-2">
                    <button class="text-blue-600 hover:text-blue-800 text-sm" onclick="showEditModal('acupoint', '${item.name}')">編輯</button>
                    <button class="text-red-600 hover:text-red-800 text-sm" onclick="deleteAcupointCombination(${item.id})">刪除</button>
                  </div>
                </div>
                <div class="text-sm text-gray-700 space-y-1">
                  ${item.points.map(pt => {
                    // 取得名稱與類型，處理可能為空或未定義的情況
                    const nameVal = pt && pt.name ? pt.name : '';
                    const typeVal = pt && pt.type ? pt.type : '';
                    // 取得該穴位的提示內容並進行 URL 編碼
                    const tooltipContent = getAcupointTooltipContent(nameVal);
                    const encoded = tooltipContent ? encodeURIComponent(tooltipContent) : '';
                    // 根據是否有提示內容來組合 tooltip 屬性與事件
                    let attrs = '';
                    if (tooltipContent) {
                      // 此處必須以 \`data-tooltip\` 加上單引號包裹，在單引號字串中需使用 \\\' 轉義
                      attrs = ' data-tooltip="' + encoded + '" onmouseenter="showTooltip(event, this.getAttribute(\'data-tooltip\'))" onmousemove="moveTooltip(event)" onmouseleave="hideTooltip()"';
                    }
                    // 返回渲染字串，使用藍色系樣式以區分穴位類型
                    return '<div class="flex justify-between items-center p-2 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded text-sm"' + attrs + '>' +
                      '<span class="text-blue-800">' + window.escapeHtml(nameVal) + '</span>' +
                      '<span class="text-blue-600 bg-blue-100 px-2 py-1 rounded">' + window.escapeHtml(typeVal) + '</span>' +
                      '</div>';
                  }).join('')}
                </div>
                <div class="mt-3 pt-3 border-t border-gray-200 text-sm text-gray-600">
                  <p>針法：${item.technique}</p>
                </div>
              `;
              container.appendChild(card);
            });
            // 分頁控制
            const paginEl = ensurePaginationContainer('acupointCombinationsContainer', 'acupointCombosPagination');
            renderPagination(totalItems, itemsPerPage, currentPage, function(newPage) {
              paginationSettings.personalAcupointCombos.currentPage = newPage;
              renderAcupointCombinations(true);
            }, paginEl);
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
                  // 透過 fetchUsers(true) 獲取用戶列表，並以快取降低讀取頻率
                  const userList = await fetchUsers(true);
                  if (Array.isArray(userList) && userList.length > 0) {
                    userRecord = userList.find(u => {
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
          function renderPrescriptionTemplates(list, pageChange = false) {
            const container = document.getElementById('prescriptionTemplatesContainer');
            container.innerHTML = '';
            // 取得要顯示的模板列表；若傳入特定列表則使用之，否則使用全域列表。
            const templates = Array.isArray(list) ? list : prescriptionTemplates;
            // 過濾掉尚未儲存的新建項目
            const displayTemplates = Array.isArray(templates) ? templates.filter(t => !t.isNew) : [];
            // 更新醫囑模板總數至標籤顯示
            try {
              const totalCount = Array.isArray(prescriptionTemplates)
                ? prescriptionTemplates.filter(p => p && !p.isNew).length
                : 0;
              const countElem = document.getElementById('prescriptionCount');
              if (countElem) {
                countElem.textContent = String(totalCount);
              }
            } catch (_e) {}
            // 分頁：若非頁面跳轉則重置至第一頁
            if (!pageChange) {
              paginationSettings.prescriptionTemplates.currentPage = 1;
            }
            const totalItems = displayTemplates.length;
            const itemsPerPage = paginationSettings.prescriptionTemplates.itemsPerPage;
            let currentPage = paginationSettings.prescriptionTemplates.currentPage;
            const totalPages = totalItems > 0 ? Math.ceil(totalItems / itemsPerPage) : 1;
            if (currentPage < 1) currentPage = 1;
            if (currentPage > totalPages) currentPage = totalPages;
            paginationSettings.prescriptionTemplates.currentPage = currentPage;
            const startIdx = (currentPage - 1) * itemsPerPage;
            const endIdx = startIdx + itemsPerPage;
            const pageItems = displayTemplates.slice(startIdx, endIdx);
            // 若無模板資料
            if (!pageItems || pageItems.length === 0) {
              container.innerHTML = '<div class="text-center text-gray-500 py-8">暫無醫囑模板</div>';
              const paginEl = ensurePaginationContainer('prescriptionTemplatesContainer', 'prescriptionTemplatesPagination');
              if (paginEl) {
                paginEl.innerHTML = '';
                paginEl.classList.add('hidden');
              }
              return;
            }
            // 渲染當前頁模板
            pageItems.forEach(item => {
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
                    <!-- 操作按鈕已移除 -->
                  </div>
                </div>
                <div class="bg-gray-50 p-4 rounded-lg text-gray-700">
                  ${item.content.split('\n').map(p => '<p class="mb-2">' + p + '</p>').join('')}
                </div>
              `;
              container.appendChild(card);
            });
            // 分頁控制
            const paginEl = ensurePaginationContainer('prescriptionTemplatesContainer', 'prescriptionTemplatesPagination');
            renderPagination(totalItems, itemsPerPage, currentPage, function(newPage) {
              paginationSettings.prescriptionTemplates.currentPage = newPage;
              renderPrescriptionTemplates(templates, true);
            }, paginEl);
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
            // 不再從 Firestore 刪除醫囑模板；直接重新渲染列表
            renderPrescriptionTemplates();
          }

          // 渲染診斷模板
          function renderDiagnosisTemplates(list, pageChange = false) {
            const container = document.getElementById('diagnosisTemplatesContainer');
            container.innerHTML = '';
            // 取得要顯示的診斷模板列表；若傳入特定列表則使用之，否則使用全域列表。
            const templates = Array.isArray(list) ? list : diagnosisTemplates;
            // 過濾掉尚未儲存的模板
            const displayTemplates = Array.isArray(templates) ? templates.filter(t => !t.isNew) : [];
            // 更新診斷模板總數至標籤顯示
            try {
              const totalCount = Array.isArray(diagnosisTemplates)
                ? diagnosisTemplates.filter(t => t && !t.isNew).length
                : 0;
              const countElem = document.getElementById('diagnosisCount');
              if (countElem) {
                countElem.textContent = String(totalCount);
              }
            } catch (_e) {}
            // 分頁：非頁面跳轉時重置頁數
            if (!pageChange) {
              paginationSettings.diagnosisTemplates.currentPage = 1;
            }
            const totalItems = displayTemplates.length;
            const itemsPerPage = paginationSettings.diagnosisTemplates.itemsPerPage;
            let currentPage = paginationSettings.diagnosisTemplates.currentPage;
            const totalPages = totalItems > 0 ? Math.ceil(totalItems / itemsPerPage) : 1;
            if (currentPage < 1) currentPage = 1;
            if (currentPage > totalPages) currentPage = totalPages;
            paginationSettings.diagnosisTemplates.currentPage = currentPage;
            const startIdx = (currentPage - 1) * itemsPerPage;
            const endIdx = startIdx + itemsPerPage;
            const pageItems = displayTemplates.slice(startIdx, endIdx);
            // 若無資料顯示提示並隱藏分頁
            if (!pageItems || pageItems.length === 0) {
              container.innerHTML = '<div class="text-center text-gray-500 py-8">暫無診斷模板</div>';
              const paginEl = ensurePaginationContainer('diagnosisTemplatesContainer', 'diagnosisTemplatesPagination');
              if (paginEl) {
                paginEl.innerHTML = '';
                paginEl.classList.add('hidden');
              }
              return;
            }
            // 渲染當前頁資料
            pageItems.forEach(item => {
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
                    <!-- 操作按鈕已移除 -->
                  </div>
                </div>
                <div class="bg-gray-50 p-4 rounded-lg text-gray-700">
                  ${contentHtml}
                </div>
              `;
              container.appendChild(card);
            });
            // 分頁控制
            const paginEl = ensurePaginationContainer('diagnosisTemplatesContainer', 'diagnosisTemplatesPagination');
            renderPagination(totalItems, itemsPerPage, currentPage, function(newPage) {
              paginationSettings.diagnosisTemplates.currentPage = newPage;
              renderDiagnosisTemplates(templates, true);
            }, paginEl);
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
            // 不再從 Firestore 刪除診斷模板；直接重新渲染列表
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
              /**
               * 依據搜尋字串和分類篩選醫囑模板。
               * 以前僅比對模板名稱，現在改為將模板的所有主要欄位合併後進行全文搜尋，
               * 以便使用者能透過內容關鍵字快速找到相關醫囑模板。
               */
              const filterPrescriptions = function() {
                const term = pInput ? pInput.value.trim().toLowerCase() : '';
                const cat = pCategory ? pCategory.value : '';
                let filtered = Array.isArray(prescriptionTemplates) ? prescriptionTemplates.filter(item => {
                  // 全文搜尋：將所有值（字串/數值/陣列）串接並轉小寫
                  if (!term) return true;
                  try {
                    let combined = '';
                    Object.keys(item).forEach(key => {
                      if (['id', 'isNew', 'lastModified'].includes(key)) return;
                      const v = item[key];
                      if (!v) return;
                      if (Array.isArray(v)) {
                        combined += ' ' + v.join(' ');
                      } else if (typeof v === 'string' || typeof v === 'number') {
                        combined += ' ' + String(v);
                      }
                    });
                    combined = combined.toLowerCase();
                    return combined.includes(term);
                  } catch (_e) {
                    return false;
                  }
                }) : [];
                // 若選擇非全部類別，則依據類別進一步篩選
                if (cat && cat !== '全部類別' && cat !== '全部分類') {
                  filtered = filtered.filter(item => item.category === cat);
                }
                // 搜尋或分類變更時將頁碼重置為 1
                paginationSettings.prescriptionTemplates.currentPage = 1;
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
              /**
               * 依據搜尋字串和分類篩選診斷模板。
               * 與醫囑模板類似，將模板的主要內容（包含主訴、現病史、舌象、脈象、
               * 中醫診斷、證型診斷及一般 content 欄位）合併為一段文字進行全文搜尋。
               */
              const filterDiagnosis = function() {
                const term = dInput ? dInput.value.trim().toLowerCase() : '';
                const cat = dCategory ? dCategory.value : '';
                let filtered = Array.isArray(diagnosisTemplates) ? diagnosisTemplates.filter(item => {
                  if (!term) return true;
                  try {
                    let combined = '';
                    Object.keys(item).forEach(key => {
                      if (['id', 'isNew', 'lastModified'].includes(key)) return;
                      const v = item[key];
                      if (!v) return;
                      if (Array.isArray(v)) {
                        combined += ' ' + v.join(' ');
                      } else if (typeof v === 'string' || typeof v === 'number') {
                        combined += ' ' + String(v);
                      }
                    });
                    combined = combined.toLowerCase();
                    return combined.includes(term);
                  } catch (_e) {
                    return false;
                  }
                }) : [];
                if (cat && cat !== '全部科別' && cat !== '全部分類') {
                  filtered = filtered.filter(item => item.category === cat);
                }
                // 搜尋或分類變更時重置頁碼
                paginationSettings.diagnosisTemplates.currentPage = 1;
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
            // 若為穴位組合，使用搜尋介面及提示框顯示完整資料。此邏輯將在此返回，避免進入舊的穴位分支。
            if (itemType === 'acupoint') {
              // 建立已存在穴位行的 HTML，每行包含提示資訊、名稱、類型選擇與刪除按鈕
              const acupointRowsHtml = Array.isArray(item.points)
                ? item.points.map(pt => {
                    const nameVal = (pt && pt.name) ? pt.name : '';
                    const typeVal = (pt && pt.type) ? pt.type : '主穴';
                    const tooltipContent = getAcupointTooltipContent(nameVal);
                    const encoded = tooltipContent ? encodeURIComponent(tooltipContent) : '';
                    const nameAttr = nameVal ? (' data-acupoint-name="' + nameVal.replace(/\"/g, '&quot;') + '"') : '';
                    let tooltipAttr = '';
                    if (tooltipContent) {
                      // 將鼠標提示字串中的單引號正確跳脫。原本使用 \\'data-tooltip\\' 會在字串中留下兩個反斜線，導致語法錯誤。
                      // 改為使用 \'data-tooltip\'，即可正確產生內嵌屬性，避免解析錯誤。
                      tooltipAttr = ' data-tooltip="' + encoded + '" onmouseenter="showTooltip(event, this.getAttribute(\'data-tooltip\'))" onmousemove="moveTooltip(event)" onmouseleave="hideTooltip()"';
                    }
                    const options = ['主穴','配穴'].map(opt => '<option value="' + opt + '" ' + (opt === typeVal ? 'selected' : '') + '>' + opt + '</option>').join('');
                    return '<div class="flex items-center gap-2 p-2 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded"' + nameAttr + tooltipAttr + '>' +
                      '<span class="flex-1 text-blue-800">' + (typeof window !== 'undefined' && window.escapeHtml ? window.escapeHtml(nameVal) : nameVal) + '</span>' +
                      '<select class="w-24 px-2 py-1 border border-gray-300 rounded">' + options + '</select>' +
                      '<button type="button" class="text-red-500 hover:text-red-700 text-sm" onclick="this.parentElement.remove()">刪除</button>' +
                      '</div>';
                  }).join('')
                : '';
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
                    <label class="block text-gray-700 font-medium mb-2">搜尋穴位</label>
                    <input type="text" id="acupointPointSearch" placeholder="搜尋穴位名稱、定位、功能或經絡..." class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-400 focus:outline-none" oninput="searchAcupointForCombo()">
                    <div id="acupointPointSearchResults" class="hidden">
                      <div class="bg-white border border-blue-200 rounded max-h-40 overflow-y-auto">
                        <div id="acupointPointSearchList" class="grid grid-cols-1 md:grid-cols-2 gap-2 p-2"></div>
                      </div>
                    </div>
                  </div>
                  <div>
                    <label class="block text-gray-700 font-medium mb-2">穴位</label>
                    <div id="acupointPoints" class="space-y-2">${acupointRowsHtml}</div>
                  </div>
                  <div>
                    <label class="block text-gray-700 font-medium mb-2">針法</label>
                    <input type="text" id="acupointTechniqueInput" value="${item.technique || ''}" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-400 focus:outline-none">
                  </div>
                </div>
              `;
              return;
            }
            // 根據不同類型渲染編輯內容
            if (itemType === 'herb') {
              // 使用綠色長方格顯示既有藥材，並提供搜尋功能新增藥材
              // 每個藥材行包含名稱（不可編輯）、劑量輸入框、單位與刪除按鈕
              const herbIngredientsHtml = Array.isArray(item.ingredients)
                ? item.ingredients.map(ing => {
                    const nameVal = (ing && ing.name) ? ing.name : '';
                    const dosageVal = (ing && ing.dosage) ? ing.dosage : '';
                    // 取得提示內容並進行 URI 編碼供屬性使用
                    const tooltipContent = getHerbTooltipContent(nameVal);
                    const encoded = tooltipContent ? encodeURIComponent(tooltipContent) : '';
                    // 屬性字串：若存在名稱則添加 data-herb-name，若存在 tooltip 則添加相關屬性與事件
                    const nameAttr = nameVal ? (' data-herb-name="' + nameVal.replace(/\"/g, '&quot;') + '"') : '';
                    let tooltipAttr = '';
                    if (tooltipContent) {
                      tooltipAttr = ' data-tooltip="' + encoded + '" onmouseenter="showTooltip(event, this.getAttribute(\'data-tooltip\'))" onmousemove="moveTooltip(event)" onmouseleave="hideTooltip()"';
                    }
                    return '<div class="flex items-center gap-2 p-2 bg-green-50 hover:bg-green-100 border border-green-200 rounded"' + nameAttr + tooltipAttr + '>' +
                      // 名稱以 span 顯示，不可編輯
                      '<span class="flex-1 text-green-800">' + (typeof window !== 'undefined' && window.escapeHtml ? window.escapeHtml(nameVal) : nameVal) + '</span>' +
                      // 劑量輸入欄
                      '<input type="number" value="' + (dosageVal || '') + '" placeholder="" class="w-20 px-2 py-1 border border-gray-300 rounded">' +
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
                    <input type="text" id="herbIngredientSearch" placeholder="搜尋中藥材、方劑名稱或功能..." class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-400 focus:outline-none" oninput="searchHerbForCombo()">
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
${item.points.map(pt => '<div class="flex items-center gap-2"><input type="text" value="' + (pt.name || '') + '" placeholder="穴位名稱" class="w-1/2 px-2 py-1 border border-gray-300 rounded"><input type="text" value="' + (pt.type || '') + '" placeholder="主穴/配穴" class="w-28 px-2 py-1 border border-gray-300 rounded"><button type="button" class="text-red-500 hover:text-red-700 text-sm" onclick="this.parentElement.remove()">刪除</button></div>').join('')}
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
                // 若名稱為空，提示錯誤並停止保存。改用頂部彈窗提示，不再使用瀏覽器 alert。
                showToast('請輸入組合名稱！', 'error');
                return;
              }
              // 更新資料
              item.name = nameVal;
              item.category = document.getElementById('herbCategorySelect').value;
              item.description = document.getElementById('herbDescriptionTextarea').value;
              const ingredientRows = document.querySelectorAll('#herbIngredients > div');
              // 將每一列的資料取出為物件陣列
              const newIngredients = Array.from(ingredientRows).map(row => {
                // 優先使用 dataset.herbName（新設計）；若不存在則退回舊結構
                let name = '';
                let dosage = '';
                if (row.dataset && row.dataset.herbName) {
                  name = row.dataset.herbName;
                  const dosageInput = row.querySelector('input[type="number"]');
                  dosage = dosageInput ? dosageInput.value : '';
                } else {
                  const select = row.querySelector('select');
                  const inputs = row.querySelectorAll('input');
                  if (select) {
                    name = select.value;
                    dosage = inputs[0] ? inputs[0].value : '';
                  } else if (inputs.length >= 2) {
                    name = inputs[0].value;
                    dosage = inputs[1].value;
                  } else if (inputs.length === 1) {
                    name = inputs[0].value;
                  }
                }
                return { name: name, dosage: dosage };
              });
              // 過濾出名稱非空的藥材，用於檢查是否至少新增一項
              const validIngredients = newIngredients.filter(ing => ing && ing.name && String(ing.name).trim() !== '');
              if (validIngredients.length === 0) {
                // 若沒有任何藥材，提示錯誤並中止保存
                showToast('請至少添加一個藥材！', 'error');
                return;
              }
              item.ingredients = newIngredients;
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
                // 使用統一的右上角提示顯示錯誤信息
                showToast('請輸入組合名稱！', 'error');
                return;
              }
              item.name = acupointNameVal;
              item.category = document.getElementById('acupointCategorySelect').value;
              const pointRows = document.querySelectorAll('#acupointPoints > div');
              // 將每一列的穴位資料取出為物件陣列，支援新舊兩種結構
              const newPoints = Array.from(pointRows).map(row => {
                let name = '';
                let type = '';
                // 新版本：名稱存在於 dataset.acupointName，類型由 select 取得
                if (row.dataset && row.dataset.acupointName) {
                  name = row.dataset.acupointName;
                  const selectEl = row.querySelector('select');
                  type = selectEl ? selectEl.value : '';
                } else {
                  // 舊版本：名稱與類型儲存在 input 中
                  const inputs = row.querySelectorAll('input');
                  if (inputs.length >= 2) {
                    name = inputs[0].value;
                    type = inputs[1].value;
                  } else if (inputs.length === 1) {
                    name = inputs[0].value;
                  }
                }
                return { name: name, type: type };
              });
              // 過濾出名稱非空的穴位，用於檢查是否至少新增一項
              const validPoints = newPoints.filter(pt => pt && pt.name && String(pt.name).trim() !== '');
              if (validPoints.length === 0) {
                // 若沒有任何穴位，提示錯誤並中止保存
                showToast('請至少添加一個穴位！', 'error');
                return;
              }
              item.points = newPoints;
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
                // 使用頂部彈窗提示用戶輸入模板名稱
                showToast('請輸入模板名稱！', 'error');
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
              // 不再將醫囑模板資料寫入 Firestore；直接重新渲染列表
              renderPrescriptionTemplates();
            } else if (editType === 'diagnosis') {
              const item = diagnosisTemplates.find(d => d.id === itemId);
              if (!item) return;
              // 檢查模板名稱必填
              const diagNameVal = (document.getElementById('diagnosisNameInput').value || '').trim();
              if (!diagNameVal) {
                // 使用頂部彈窗提示用戶輸入診斷模板名稱
                showToast('請輸入模板名稱！', 'error');
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
              // 不再將診斷模板資料寫入 Firestore；直接重新渲染列表
              renderDiagnosisTemplates();
            }
            // 保存成功後顯示成功提示，不再使用瀏覽器 alert
            showToast('保存成功！', 'success');
            hideEditModal();
          }

          /* addHerbIngredientField 函式已移除（未使用） */

          function addAcupointPointField() {
            const container = document.getElementById('acupointPoints');
            const div = document.createElement('div');
            // 使用 flex 布局讓刪除按鈕置於右側
            div.className = 'flex items-center gap-2';
            // 建立名稱與類型輸入框以及刪除按鈕，刪除按鈕點擊後可移除所在行
    // 調整穴位名稱欄位寬度為一半，避免在手機或小螢幕上過長
    div.innerHTML = '<input type="text" placeholder="穴位名稱" class="w-1/2 px-2 py-1 border border-gray-300 rounded"><input type="text" placeholder="主穴/配穴" class="w-28 px-2 py-1 border border-gray-300 rounded"><button type="button" class="text-red-500 hover:text-red-700 text-sm" onclick="this.parentElement.remove()">刪除</button>';
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
              // 當搜尋字串為空時，同步隱藏任何提示框
              if (typeof hideTooltip === 'function') {
                hideTooltip();
              }
              return;
            }
            // 搜索並根據匹配程度排序 herbLibrary 中的中藥材與方劑（名稱、別名或功效）
            let matched = (Array.isArray(herbLibrary) ? herbLibrary : [])
              .filter(item => item && (item.type === 'herb' || item.type === 'formula') && (
                (item.name && item.name.toLowerCase().includes(searchTerm)) ||
                (item.alias && item.alias.toLowerCase().includes(searchTerm)) ||
                (item.effects && item.effects.toLowerCase().includes(searchTerm))
              ))
              .map(item => {
                const ln = item.name ? item.name.toLowerCase() : '';
                const la = item.alias ? item.alias.toLowerCase() : '';
                const le = item.effects ? item.effects.toLowerCase() : '';
                let score = Infinity;
                if (ln.includes(searchTerm)) {
                  score = ln.indexOf(searchTerm);
                } else if (la.includes(searchTerm)) {
                  score = 100 + la.indexOf(searchTerm);
                } else if (le.includes(searchTerm)) {
                  score = 200 + le.indexOf(searchTerm);
                }
                return { item, score };
              })
              .sort((a, b) => a.score - b.score)
              .map(obj => obj.item);
            // 只取前 10 筆
            matched = matched.slice(0, 10);
            if (matched.length === 0) {
              resultsList.innerHTML = '<div class="p-2 text-center text-gray-500 text-sm">找不到符合條件的藥材</div>';
              resultsContainer.classList.remove('hidden');
              // 沒有符合項目時，隱藏提示框
              if (typeof hideTooltip === 'function') {
                hideTooltip();
              }
              return;
            }
            // 顯示搜尋結果：移除劑量顯示並使用 tooltip 顯示詳細資料
            resultsList.innerHTML = matched.map(item => {
              const safeName = (item.name || '').replace(/'/g, "\\'");
              // 構建詳細資訊內容
              const details = [];
              details.push('名稱：' + (item.name || ''));
              if (item.alias) details.push('別名：' + item.alias);
              if (item.type === 'herb') {
                if (item.nature) details.push('性味：' + item.nature);
                if (item.meridian) details.push('歸經：' + item.meridian);
              }
              if (item.effects) details.push('功效：' + item.effects);
              if (item.indications) details.push('主治：' + item.indications);
              if (item.type === 'formula') {
                if (item.composition) details.push('組成：' + item.composition.replace(/\n/g, '、'));
                if (item.usage) details.push('用法：' + item.usage);
              }
              if (item.cautions) details.push('注意：' + item.cautions);
              const encoded = encodeURIComponent(details.join('\n'));
              // 使用模板字串來組合 HTML，避免字串串接時的引號轉義錯誤
              // 這裡使用單引號包裹 safeName 參數，並確保任何單引號都已在上方以 \\ 替換
              return `<div class="p-2 bg-green-50 hover:bg-green-100 border border-green-200 rounded cursor-pointer text-center text-sm" data-tooltip="${encoded}" onmouseenter="showTooltip(event, this.getAttribute('data-tooltip'))" onmousemove="moveTooltip(event)" onmouseleave="hideTooltip()" onclick="addHerbToCombo('${safeName}', '')">${window.escapeHtml(item.name)}</div>`;
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
            // 建立新的一行，並使用綠色背景與邊框樣式
            const div = document.createElement('div');
            div.className = 'flex items-center gap-2 p-2 bg-green-50 hover:bg-green-100 border border-green-200 rounded';
            // 儲存藥材名稱於 dataset，方便後續保存時讀取
            if (name) {
              div.dataset.herbName = name;
            }
            // 設定提示內容（若查詢不到則不設定）
            const tooltipContent = getHerbTooltipContent(name || '');
            if (tooltipContent) {
              const encoded = encodeURIComponent(tooltipContent);
              div.setAttribute('data-tooltip', encoded);
              div.addEventListener('mouseenter', function(e) {
                showTooltip(e, this.getAttribute('data-tooltip'));
              });
              div.addEventListener('mousemove', function(e) {
                moveTooltip(e);
              });
              div.addEventListener('mouseleave', function() {
                hideTooltip();
              });
            }
            // 名稱以 span 顯示（不可編輯）
            const nameSpan = document.createElement('span');
            nameSpan.className = 'flex-1 text-green-800';
            nameSpan.textContent = name || '';
            div.appendChild(nameSpan);
            // 劑量輸入欄
            const dosageInput = document.createElement('input');
            dosageInput.type = 'number';
            dosageInput.value = '';
            dosageInput.placeholder = '';
            dosageInput.className = 'w-20 px-2 py-1 border border-gray-300 rounded';
            div.appendChild(dosageInput);
            // 單位
            const unitSpan = document.createElement('span');
            unitSpan.textContent = '克';
            unitSpan.className = 'text-sm text-gray-700';
            div.appendChild(unitSpan);
            // 刪除按鈕
            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.textContent = '刪除';
            deleteBtn.className = 'text-red-500 hover:text-red-700 text-sm';
            deleteBtn.addEventListener('click', function() {
              if (div && div.parentElement) {
                div.parentElement.removeChild(div);
              }
            });
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
            // 新增完藥材後隱藏提示框，以免留下殘影
            if (typeof hideTooltip === 'function') {
              hideTooltip();
            }
          }

          // 將自訂函式掛載至 window，使其可於內嵌事件處理器中被呼叫
          window.searchHerbForCombo = searchHerbForCombo;
          window.addHerbToCombo = addHerbToCombo;

          /*
           * 搜索並新增穴位至個人慣用穴位組合。
           * 在編輯穴位組合時，使用者可以在搜尋欄輸入關鍵字搜尋穴位庫中的穴位，並點擊結果將其加入穴位列表。
           */
          async function searchAcupointForCombo() {
            const input = document.getElementById('acupointPointSearch');
            if (!input) return;
            const searchTerm = input.value.trim().toLowerCase();
            const resultsContainer = document.getElementById('acupointPointSearchResults');
            const resultsList = document.getElementById('acupointPointSearchList');
            if (!resultsContainer || !resultsList) return;
            // 如果尚未載入穴位庫資料，則嘗試初始化一次。
            // 由於 initAcupointLibrary 返回 promise，這裡使用 await 以確保資料就緒後再進行搜尋。
            try {
              if (!acupointLibraryLoaded || !Array.isArray(acupointLibrary) || acupointLibrary.length === 0) {
                await initAcupointLibrary();
              }
            } catch (_e) {
              // 初始化失敗時不中斷搜尋流程，僅記錄錯誤並繼續。
              console.error('載入穴位庫資料失敗：', _e);
            }
            if (searchTerm.length < 1) {
              // 若輸入為空，隱藏結果容器並隱藏提示框
              resultsContainer.classList.add('hidden');
              if (typeof hideTooltip === 'function') {
                hideTooltip();
              }
              return;
            }
            // 過濾並根據匹配程度排序 acupointLibrary 中的穴位（名稱、經絡、定位、功效或主治）
            let matched = (Array.isArray(acupointLibrary) ? acupointLibrary : [])
              .filter(item => item && (
                (item.name && item.name.toLowerCase().includes(searchTerm)) ||
                (item.meridian && item.meridian.toLowerCase().includes(searchTerm)) ||
                (item.location && item.location.toLowerCase().includes(searchTerm)) ||
                (item.functions && (Array.isArray(item.functions) ? item.functions.join(' ').toLowerCase().includes(searchTerm) : String(item.functions).toLowerCase().includes(searchTerm))) ||
                (item.indications && (Array.isArray(item.indications) ? item.indications.join(' ').toLowerCase().includes(searchTerm) : String(item.indications).toLowerCase().includes(searchTerm)))
              ))
              .map(item => {
                const n = item.name ? item.name.toLowerCase() : '';
                const m = item.meridian ? item.meridian.toLowerCase() : '';
                const l = item.location ? item.location.toLowerCase() : '';
                const f = item.functions ? (Array.isArray(item.functions) ? item.functions.join(' ').toLowerCase() : String(item.functions).toLowerCase()) : '';
                const i = item.indications ? (Array.isArray(item.indications) ? item.indications.join(' ').toLowerCase() : String(item.indications).toLowerCase()) : '';
                let score = Infinity;
                if (n.includes(searchTerm)) {
                  score = n.indexOf(searchTerm);
                } else if (m.includes(searchTerm)) {
                  score = 100 + m.indexOf(searchTerm);
                } else if (l.includes(searchTerm)) {
                  score = 200 + l.indexOf(searchTerm);
                } else if (f.includes(searchTerm)) {
                  score = 300 + f.indexOf(searchTerm);
                } else if (i.includes(searchTerm)) {
                  score = 400 + i.indexOf(searchTerm);
                }
                return { item, score };
              })
              .sort((a, b) => a.score - b.score)
              .map(obj => obj.item);
            // 只顯示前十項
            matched = matched.slice(0, 10);
            if (matched.length === 0) {
              resultsList.innerHTML = '<div class="p-2 text-center text-gray-500 text-sm">找不到符合條件的穴位</div>';
              resultsContainer.classList.remove('hidden');
              // 沒有匹配項目時也隱藏提示框
              if (typeof hideTooltip === 'function') {
                hideTooltip();
              }
              return;
            }
            // 顯示搜尋結果，每個結果可點擊加入穴位清單，並顯示 tooltip 詳細資料
            resultsList.innerHTML = matched.map(item => {
              const safeName = (item.name || '').replace(/'/g, "\\'");
              const details = [];
              details.push('名稱：' + (item.name || ''));
              if (item.meridian) details.push('經絡：' + item.meridian);
              if (item.location) details.push('定位：' + item.location);
              if (item.functions) {
                const funcs = Array.isArray(item.functions) ? item.functions.join('、') : String(item.functions);
                details.push('功效：' + funcs);
              }
              if (item.indications) {
                const inds = Array.isArray(item.indications) ? item.indications.join('、') : String(item.indications);
                details.push('主治：' + inds);
              }
              if (item.method) details.push('針法：' + item.method);
              if (item.category) details.push('分類：' + item.category);
              const encoded = encodeURIComponent(details.join('\n'));
              // 使用模板字串來組合 HTML，避免字串串接時的引號轉義錯誤
              // 注意 safeName 中的單引號已使用 \ 替換，因此可以安全地放入單引號包裹的 onclick 引數
              return `<div class="p-2 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded cursor-pointer text-center text-sm" data-tooltip="${encoded}" onmouseenter="showTooltip(event, this.getAttribute('data-tooltip'))" onmousemove="moveTooltip(event)" onmouseleave="hideTooltip()" onclick="addAcupointToCombo('${safeName}')">${window.escapeHtml(item.name)}</div>`;
            }).join('');
            resultsContainer.classList.remove('hidden');
          }

          /**
           * 將指定穴位名稱加入目前編輯的穴位列表。
           * 新增後會清空搜尋欄並隱藏搜尋結果。
           * @param {string} name 穴位名稱
           */
          function addAcupointToCombo(name) {
            const container = document.getElementById('acupointPoints');
            if (!container) return;
            // 建立新的一行，使用藍色背景與邊框樣式
            const div = document.createElement('div');
            div.className = 'flex items-center gap-2 p-2 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded';
            // 儲存穴位名稱於 dataset，方便後續保存時讀取
            if (name) {
              div.dataset.acupointName = name;
            }
            // 設定提示內容（若查詢不到則不設定）
            const tooltipContent = getAcupointTooltipContent(name || '');
            if (tooltipContent) {
              const encoded = encodeURIComponent(tooltipContent);
              div.setAttribute('data-tooltip', encoded);
              div.addEventListener('mouseenter', function(e) {
                showTooltip(e, this.getAttribute('data-tooltip'));
              });
              div.addEventListener('mousemove', function(e) {
                moveTooltip(e);
              });
              div.addEventListener('mouseleave', function() {
                hideTooltip();
              });
            }
            // 名稱以 span 顯示
            const nameSpan = document.createElement('span');
            nameSpan.className = 'flex-1 text-blue-800';
            nameSpan.textContent = name || '';
            div.appendChild(nameSpan);
            // 類型選擇（主穴/配穴）
            const select = document.createElement('select');
            select.className = 'w-24 px-2 py-1 border border-gray-300 rounded';
            ['主穴','配穴'].forEach(opt => {
              const opEl = document.createElement('option');
              opEl.value = opt;
              opEl.textContent = opt;
              select.appendChild(opEl);
            });
            div.appendChild(select);
            // 刪除按鈕
            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.textContent = '刪除';
            deleteBtn.className = 'text-red-500 hover:text-red-700 text-sm';
            deleteBtn.addEventListener('click', function() {
              if (div && div.parentElement) {
                div.parentElement.removeChild(div);
              }
            });
            div.appendChild(deleteBtn);
            container.appendChild(div);
            // 清空搜尋欄並隱藏結果
            const resultsContainer = document.getElementById('acupointPointSearchResults');
            if (resultsContainer) {
              resultsContainer.classList.add('hidden');
            }
            const searchInput = document.getElementById('acupointPointSearch');
            if (searchInput) {
              searchInput.value = '';
            }
            // 新增完穴位後隱藏提示框，以免留下殘影
            if (typeof hideTooltip === 'function') {
              hideTooltip();
            }
          }

          /**
           * 取得指定穴位的完整提示內容。
           * 根據 acupointLibrary 中的資料組合名稱、經絡、定位、功效、主治、針法與分類。
           * 如果找不到對應的資料則回傳空字串。
           * @param {string} name 穴位名稱
           * @returns {string} 組合的詳細內容，以換行符分隔
           */
          function getAcupointTooltipContent(name) {
            if (!name || !Array.isArray(acupointLibrary) || acupointLibrary.length === 0) return '';
            const item = acupointLibrary.find(a => a && a.name === name);
            if (!item) return '';
            const details = [];
            details.push('名稱：' + (item.name || ''));
            if (item.meridian) details.push('經絡：' + item.meridian);
            if (item.location) details.push('定位：' + item.location);
            if (item.functions) {
              const funcs = Array.isArray(item.functions) ? item.functions.join('、') : String(item.functions);
              details.push('功效：' + funcs);
            }
            if (item.indications) {
              const inds = Array.isArray(item.indications) ? item.indications.join('、') : String(item.indications);
              details.push('主治：' + inds);
            }
            if (item.method) details.push('針法：' + item.method);
            if (item.category) details.push('分類：' + item.category);
            return details.join('\n');
          }

          // 將穴位搜索與新增函式掛載至 window，使其可由行內事件調用
          window.searchAcupointForCombo = searchAcupointForCombo;
          window.addAcupointToCombo = addAcupointToCombo;

  /**
   * 自訂工具提示函式：顯示、移動與隱藏。
   * 此 tooltip 會立即顯示並跟隨滑鼠移動，展示完整的中藥材或方劑資訊。
   * @param {MouseEvent} event 滑鼠事件
   * @param {string} encodedContent encodeURIComponent 處理後的提示內容
   */
  function showTooltip(event, encodedContent) {
    const tooltip = document.getElementById('tooltip');
    if (!tooltip) return;
    const content = decodeURIComponent(encodedContent || '');
    // 使用 innerText 可以處理換行符號，避免 XSS
    tooltip.innerText = content;
    tooltip.classList.remove('hidden');
    // 設置初始位置，稍微偏移以免遮擋游標
    const offsetX = 10;
    const offsetY = 10;
    // 使用 clientX/clientY 以取得視窗內座標，配合 position:fixed 讓提示靠近游標
    // 若使用 pageX/pageY，當畫面有滾動時會導致位置偏移
    tooltip.style.left = (event.clientX + offsetX) + 'px';
    tooltip.style.top = (event.clientY + offsetY) + 'px';
  }

  function moveTooltip(event) {
    const tooltip = document.getElementById('tooltip');
    if (!tooltip || tooltip.classList.contains('hidden')) return;
    const offsetX = 10;
    const offsetY = 10;
    // 使用 clientX/clientY 以取得視窗內座標，配合 position:fixed 讓提示靠近游標
    tooltip.style.left = (event.clientX + offsetX) + 'px';
    tooltip.style.top = (event.clientY + offsetY) + 'px';
  }

  function hideTooltip() {
    const tooltip = document.getElementById('tooltip');
    if (!tooltip) return;
    tooltip.classList.add('hidden');
  }

  /**
   * 取得指定中藥材或方劑的完整提示內容。
   * 根據 herbLibrary 中的資料組合名稱、別名、性味、歸經、功效、主治、組成、用法與注意事項。
   * 如果找不到對應的資料則回傳空字串。
   * @param {string} name 藥材或方劑名稱
   * @returns {string} 組合的詳細內容，以換行符分隔
   */
  function getHerbTooltipContent(name) {
    if (!name || !Array.isArray(herbLibrary) || herbLibrary.length === 0) return '';
    // 嘗試在 herbLibrary 中尋找名稱精確匹配的資料
    const item = herbLibrary.find(h => h && h.name === name);
    if (!item) return '';
    const details = [];
    details.push('名稱：' + (item.name || ''));
    if (item.alias) details.push('別名：' + item.alias);
    // 中藥材類型特有屬性
    if (item.type === 'herb') {
      if (item.nature) details.push('性味：' + item.nature);
      if (item.meridian) details.push('歸經：' + item.meridian);
    }
    // 功效與主治
    if (item.effects) details.push('功效：' + item.effects);
    if (item.indications) details.push('主治：' + item.indications);
    // 方劑類型的其他屬性
    if (item.type === 'formula') {
      if (item.composition) details.push('組成：' + item.composition.replace(/\n/g, '、'));
      if (item.usage) details.push('用法：' + item.usage);
    }
    if (item.cautions) details.push('注意：' + item.cautions);
    return details.join('\n');
  }

  // 將 tooltip 函式掛載至 window，供行內事件處理器調用
  window.showTooltip = showTooltip;
  window.moveTooltip = moveTooltip;
  window.hideTooltip = hideTooltip;

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
