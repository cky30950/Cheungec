// 系統資料儲存
let currentUser = null;
let currentUserData = null;

// 初始化全域變數
let patients = [];
let consultations = [];
let appointments = [];
// 快取病人列表，避免重複從 Firestore 讀取
let patientCache = null;

// 快取診症記錄和用戶列表，避免重複從 Firestore 讀取
let consultationCache = null;
let userCache = null;

/**
 * 取得病人列表並使用本地快取。
 * @param {boolean} forceRefresh 是否強制重新從 Firestore 讀取資料
 * @returns {Promise<Array>} 病人資料陣列
 */
async function fetchPatients(forceRefresh = false) {
    try {
        if (forceRefresh || !patientCache) {
            const result = await window.firebaseDataManager.getPatients();
            if (result && result.success) {
                patientCache = result.data;
            } else {
                patientCache = null;
            }
        }
        return patientCache || [];
    } catch (error) {
        console.error('取得病人資料失敗:', error);
        // 回傳空陣列避免程式崩潰
        return [];
    }
}

/**
 * 取得診症記錄列表並使用本地快取。
 * @param {boolean} forceRefresh 是否強制重新從 Firestore 讀取資料
 * @returns {Promise<Array>} 診症資料陣列
 */
async function fetchConsultations(forceRefresh = false) {
    try {
        if (forceRefresh || !consultationCache) {
            const result = await window.firebaseDataManager.getConsultations();
            if (result && result.success) {
                consultationCache = result.data;
            } else {
                consultationCache = null;
            }
        }
        return consultationCache || [];
    } catch (error) {
        console.error('取得診症資料失敗:', error);
        return [];
    }
}

/**
 * 取得用戶列表並使用本地快取。
 * @param {boolean} forceRefresh 是否強制重新從 Firestore 讀取資料
 * @returns {Promise<Array>} 用戶資料陣列
 */
async function fetchUsers(forceRefresh = false) {
    try {
        if (forceRefresh || !userCache) {
            const result = await window.firebaseDataManager.getUsers();
            if (result && result.success) {
                userCache = result.data;
            } else {
                userCache = null;
            }
        }
        return userCache || [];
    } catch (error) {
        console.error('取得用戶資料失敗:', error);
        return [];
    }
}
        
        // 診所設定
        let clinicSettings = JSON.parse(localStorage.getItem('clinicSettings') || '{}');
        if (!clinicSettings.chineseName) {
            clinicSettings.chineseName = '中醫診所系統';
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
            
            // 2秒後淡出並移除
            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translateX(100%)';
                setTimeout(() => {
                    if (toast.parentNode) {
                        toast.parentNode.removeChild(toast);
                    }
                }, 300);
            }, 2000);
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
        
        // 生成病人編號函數
        function generatePatientNumber() {
            const existingNumbers = patients
                .map(p => p.patientNumber)
                .filter(num => num && num.startsWith('P'))
                .map(num => parseInt(num.substring(1)))
                .filter(num => !isNaN(num));
            
            const maxNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0;
            const newNumber = maxNumber + 1;
            return `P${newNumber.toString().padStart(6, '0')}`;
        }


        // 初始化中藥庫資料
        let herbLibrary = [];
        /**
         * 從 Firestore 讀取中藥庫資料，若資料不存在則自動使用預設值初始化。
         * 此函式會等待 Firebase 初始化完成後再執行。
         */
        async function initHerbLibrary() {
            // 等待 Firebase 初始化
            while (!window.firebase || !window.firebase.db) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
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

        const defaultBillingItems = [];

        // 初始化收費項目資料
        let billingItems = [];
        /**
         * 從 Firestore 讀取收費項目資料，若資料不存在則使用預設資料初始化。
         * 此函式會等待 Firebase 初始化完成後再執行。
         */
        async function initBillingItems() {
            // 等待 Firebase 初始化
            while (!window.firebase || !window.firebase.db) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
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

        const defaultUsers = [];

        // 初始化用戶資料：不使用本地預設，用空陣列代替，待由 Firebase 載入
        let users = [];

    

// 主要登入功能
async function attemptMainLogin() {
    const email = document.getElementById('mainLoginUsername').value.trim();
    const password = document.getElementById('mainLoginPassword').value.trim();
    
    if (!email || !password) {
        showToast('請輸入電子郵件和密碼！', 'error');
        return;
    }

    // 顯示載入狀態
    const loginButton = document.querySelector('button[onclick="attemptMainLogin()"]');
    const originalText = loginButton.textContent;
    loginButton.textContent = '登入中...';
    loginButton.disabled = true;

    try {
        // 等待 Firebase 初始化
        while (!window.firebase) {
            await new Promise(resolve => setTimeout(resolve, 100));
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
            // 若找不到對應用戶，使用 Firebase 資訊建立臨時用戶資料
            currentUserData = {
                id: null,
                uid: uid,
                username: firebaseUser.email,
                email: firebaseUser.email,
                name: firebaseUser.displayName || getUserNameFromEmail(firebaseUser.email),
                position: getUserPositionFromEmail(firebaseUser.email),
                active: true,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                lastLogin: new Date().toISOString()
            };
            currentUser = currentUserData.username;
        }

        // 在登入主系統前先載入中藥庫資料和收費項目資料
        // 目前中藥庫管理與收費項目管理僅在進入各頁面時會重新讀取 Firestore 資料，
        // 為了縮短首次進入功能頁面的等待時間，這裡於登入後就先行載入一次。
        try {
            // 若有定義 initHerbLibrary 函式，則執行一次
            if (typeof initHerbLibrary === 'function') {
                await initHerbLibrary();
            }
            // 若有定義 initBillingItems 函式，則執行一次
            if (typeof initBillingItems === 'function') {
                await initBillingItems();
            }
        } catch (error) {
            console.error('初始化中藥庫或收費項目資料失敗:', error);
        }

        // 登入成功，切換到主系統
        performLogin(currentUserData);
        // 登入後初始化系統資料（載入掛號、診療記錄、患者等）
        await initializeSystemAfterLogin();
        
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
        // 恢復按鈕狀態
        loginButton.textContent = originalText;
        loginButton.disabled = false;
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
            users = result.data.map(user => ({
                ...user,
                // 確保數據格式兼容性
                createdAt: user.createdAt ? (user.createdAt.seconds ? new Date(user.createdAt.seconds * 1000).toISOString() : user.createdAt) : new Date().toISOString(),
                updatedAt: user.updatedAt ? (user.updatedAt.seconds ? new Date(user.updatedAt.seconds * 1000).toISOString() : user.updatedAt) : new Date().toISOString(),
                lastLogin: user.lastLogin ? (user.lastLogin.seconds ? new Date(user.lastLogin.seconds * 1000).toISOString() : user.lastLogin) : null
            }));
            
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

// 幫助函數：從 email 獲取姓名
function getUserNameFromEmail(email) {
    if (email === 'admin@clinic.com') return '系統管理員';
    if (email === 'doctor@clinic.com') return '張中醫師';
    if (email === 'nurse@clinic.com') return '林護理師';
    return '用戶';
}

// 幫助函數：從 email 獲取職位
function getUserPositionFromEmail(email) {
    if (email === 'admin@clinic.com') return '診所管理';
    if (email === 'doctor@clinic.com') return '醫師';
    if (email === 'nurse@clinic.com') return '護理師';
    return '用戶';
}
        
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
            
            document.getElementById('userRole').textContent = `當前用戶：${getUserDisplayName(user)}`;
            document.getElementById('sidebarUserRole').textContent = `當前用戶：${getUserDisplayName(user)}`;
            
            generateSidebarMenu();
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
                userManagement: { title: '診所用戶管理', icon: '👤', description: '管理診所用戶權限' },
                financialReports: { title: '財務報表', icon: '📊', description: '收入分析與財務統計' },
                systemManagement: { title: '系統管理', icon: '⚙️', description: '統計資料、備份匯出' }
            };

            /*
             * 根據當前用戶的職位決定可使用的功能列表。一般職位僅能查看與診療相關的資料，
             * 「診所管理」職位可以額外存取財務報表、用戶管理與系統管理。
             */
            function getPermissionsForPosition(position) {
                const basePermissions = ['patientManagement', 'consultationSystem', 'herbLibrary', 'billingManagement'];
                // 「診所管理」職位可使用所有進階功能
                if (position === '診所管理') {
                    return [...basePermissions, 'financialReports', 'userManagement', 'systemManagement'];
                }
                // 醫師職位亦可管理用戶與系統，因此加入 userManagement 和 systemManagement 權限
                if (position === '醫師') {
                    return [...basePermissions, 'userManagement', 'systemManagement'];
                }
                // 其他職位僅具備基本功能
                return basePermissions;
            }

            // 取得當前用戶職位，沒有職位預設為一般使用者
            const userPosition = (currentUserData && currentUserData.position) || '';
            const permissions = getPermissionsForPosition(userPosition);

            // 依序建立側邊選單按鈕
            permissions.forEach(permission => {
                const item = menuItems[permission];
                if (!item) return;
                const button = document.createElement('button');
                button.className = 'w-full text-left p-4 rounded-lg hover:bg-gray-100 transition duration-200 border border-gray-200 mb-2';
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

        // 顯示指定區域
        function showSection(sectionId) {
            // 若為財務報表，僅限診所管理存取
            if (sectionId === 'financialReports') {
                if (!currentUserData || currentUserData.position !== '診所管理') {
                    showToast('權限不足，僅診所管理可使用此功能', 'error');
                    return;
                }
            }
            // 若為系統管理，診所管理及醫師皆可存取
            if (sectionId === 'systemManagement') {
                if (!currentUserData || !['診所管理', '醫師'].includes(currentUserData.position)) {
                    showToast('權限不足，僅診所管理或醫師可使用此功能', 'error');
                    return;
                }
            }
            // 若為用戶管理，診所管理及醫師皆可存取
            if (sectionId === 'userManagement') {
                if (!currentUserData || !['診所管理', '醫師'].includes(currentUserData.position)) {
                    showToast('權限不足，僅診所管理或醫師可使用此功能', 'error');
                    return;
                }
            }

            hideAllSections();
            document.getElementById('welcomePage').classList.add('hidden');
            document.getElementById(sectionId).classList.remove('hidden');

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
            ['patientManagement', 'consultationSystem', 'herbLibrary', 'billingManagement', 'userManagement', 'financialReports', 'systemManagement', 'welcomePage'].forEach(id => {
                document.getElementById(id).classList.add('hidden');
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
    }
}

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
                // 建立病人資料列表行，新增「查看病歷」按鈕觸發病歷查看彈窗
                row.innerHTML = `
                <td class="px-4 py-3 text-sm text-blue-600 font-medium">${patient.patientNumber || '未設定'}</td>
                <td class="px-4 py-3 text-sm text-gray-900 font-medium">${patient.name}</td>
                <td class="px-4 py-3 text-sm text-gray-900">${formatAge(patient.birthDate)}</td>
                <td class="px-4 py-3 text-sm text-gray-900">${patient.gender}</td>
                <td class="px-4 py-3 text-sm text-gray-900">${patient.phone}</td>
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
        const content = `
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
                        ${patient.allergies ? `<div><span class="font-medium">過敏史：</span><div class="mt-1 p-2 bg-red-50 rounded text-sm">${patient.allergies}</div></div>` : ''}
                        ${patient.history ? `<div><span class="font-medium">病史：</span><div class="mt-1 p-2 bg-gray-50 rounded text-sm">${patient.history}</div></div>` : ''}
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
        
        function loadConsultationSystem() {
            loadTodayAppointments();
            clearPatientSearch();
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
        
        // 顯示搜索結果
        resultsList.innerHTML = matchedPatients.map(patient => `
            <div class="p-4 hover:bg-gray-50 cursor-pointer transition duration-200" onclick="selectPatientForRegistration('${patient.id}')">
                <div>
                    <div class="font-semibold text-gray-900">${patient.name}</div>
                    <div class="text-sm text-gray-600">編號：${patient.patientNumber} | 年齡：${formatAge(patient.birthDate)} | 性別：${patient.gender}</div>
                    <div class="text-sm text-gray-500">電話：${patient.phone}</div>
                </div>
            </div>
        `).join('');
        
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
            
            // 顯示選中的病人資訊
            document.getElementById('selectedPatientInfo').innerHTML = `
                <div class="space-y-1">
                    <div><span class="font-medium">姓名：</span>${patient.name}</div>
                    <div><span class="font-medium">編號：</span>${patient.patientNumber}</div>
                    <div><span class="font-medium">年齡：</span>${formatAge(patient.birthDate)} | <span class="font-medium">性別：</span>${patient.gender}</div>
                    <div><span class="font-medium">電話：</span>${patient.phone}</div>
                </div>
            `;
            
            // 載入醫師選項
            loadDoctorOptions();
            
            // 設置預設掛號時間為當前時間（加5分鐘避免時間過期）
            const now = new Date();
            now.setMinutes(now.getMinutes() + 5); // 加5分鐘
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const localDateTime = `${year}-${month}-${day}T${hours}:${minutes}`;
            
            document.getElementById('appointmentDateTime').value = localDateTime;
            
            clearRegistrationForm();
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

    // 從 Firebase 讀取掛號資料
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

    const today = new Date().toDateString();
    let todayAppointments = appointments.filter(apt => 
        new Date(apt.appointmentTime).toDateString() === today
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
        // 從 Firebase 獲取所有病人資料
        const result = await window.firebaseDataManager.getPatients();
        const patientsData = result.success ? result.data : [];
        
        tbody.innerHTML = todayAppointments.map((appointment, index) => {
            // 從 Firebase 資料中尋找對應病人
            const patient = patientsData.find(p => p.id === appointment.patientId);
            
            if (!patient) {
                // 如果在 Firebase 找不到，嘗試從本地陣列找（向後兼容）
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
            
            // 使用 Firebase 病人資料
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
    // 建立新的監聽回調
    window.appointmentsListener = (snapshot) => {
        const data = snapshot.val() || {};
        // 將資料轉換為陣列並保存到全域變數
        appointments = Object.keys(data).map(key => {
            return { id: key, ...data[key] };
        });
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
                endDate.setDate(startDate.getDate() + 2);
                
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
function formatConsultationDate(dateInput) {
    const date = parseConsultationDate(dateInput);
    if (!date || isNaN(date.getTime())) {
        return '日期未知';
    }
    
    return date.toLocaleDateString('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
}

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
        // 同步更新到 Firebase
        await window.firebaseDataManager.updateAppointment(String(appointment.id), appointment);

        showToast(`${patient.name} 已確認到達，進入候診狀態！`, 'success');
        loadTodayAppointments();
        
    } catch (error) {
        console.error('確認到達錯誤:', error);
        showToast('處理確認到達時發生錯誤', 'error');
    }
}

        
 // 5. 修改移除掛號函數，支援 Firebase
async function removeAppointment(appointmentId) {
    const appointment = appointments.find(apt => apt && String(apt.id) === String(appointmentId));
    if (!appointment) {
        showToast('找不到掛號記錄！', 'error');
        return;
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
            // 使用字串比較，避免數字與字串類型不一致導致無法匹配
            if (String(currentConsultingAppointmentId) === String(appointmentId)) {
                closeConsultationForm();
                currentConsultingAppointmentId = null;
            }
        }
        
    } catch (error) {
        console.error('移除掛號錯誤:', error);
        showToast('移除掛號時發生錯誤', 'error');
    }
}

        

        
 // 4. 修改開始診症函數，支援 Firebase
async function startConsultation(appointmentId) {
    const appointment = appointments.find(apt => apt && String(apt.id) === String(appointmentId));
    if (!appointment) {
        showToast('找不到掛號記錄！', 'error');
        return;
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
            // 使用字串比較避免類型不一致
            String(apt.id) !== String(appointmentId) &&
            apt.appointmentDoctor === currentUserData.username &&
            new Date(apt.appointmentTime).toDateString() === new Date().toDateString()
        );
        
        if (consultingAppointment) {
            // 從 Firebase 獲取正在診症的病人資料
            const consultingPatient = result.data.find(p => p.id === consultingAppointment.patientId);
            const consultingPatientName = consultingPatient ? consultingPatient.name : '未知病人';
            
            if (confirm(`您目前正在為 ${consultingPatientName} 診症。\n\n是否要結束該病人的診症並開始為 ${patient.name} 診症？\n\n注意：${consultingPatientName} 的狀態將改回候診中。`)) {
                // 結束當前診症的病人
                consultingAppointment.status = 'waiting';
                delete consultingAppointment.consultationStartTime;
                delete consultingAppointment.consultingDoctor;
                
                // 關閉可能開啟的診症表單
                if (String(currentConsultingAppointmentId) === String(consultingAppointment.id)) {
                    closeConsultationForm();
                }
                
                showToast(`已結束 ${consultingPatientName} 的診症`, 'info');
            } else {
                return; // 用戶取消操作
            }
        }
        
        // 開始新的診症 - 正確設置狀態為診症中
        appointment.status = 'consulting';
        appointment.consultationStartTime = new Date().toISOString();
        appointment.consultingDoctor = currentUserData ? currentUserData.username : currentUser;
        
        // 立即保存狀態變更
        localStorage.setItem('appointments', JSON.stringify(appointments));
        // 同步更新到 Firebase
        await window.firebaseDataManager.updateAppointment(String(appointment.id), appointment);
        
        // 設置當前診症ID並顯示表單
        currentConsultingAppointmentId = appointmentId;
        showConsultationForm(appointment);
        
        // 重新載入列表以顯示正確狀態
        loadTodayAppointments();
        
        showToast(`開始為 ${patient.name} 診症`, 'success');
        
    } catch (error) {
        console.error('開始診症錯誤:', error);
        showToast('開始診症時發生錯誤', 'error');
    }
}
        
        // 繼續診症
        function continueConsultation(appointmentId) {
            const appointment = appointments.find(apt => apt && String(apt.id) === String(appointmentId));
            if (!appointment) return;
            
            currentConsultingAppointmentId = appointmentId;
            showConsultationForm(appointment);
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
        document.getElementById('formPatientName').textContent = `${patient.name} (${patient.patientNumber})`;
        document.getElementById('formAppointmentTime').textContent = new Date(appointment.appointmentTime).toLocaleString('zh-TW');
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
            endDate.setDate(startDate.getDate() + 2);
            
            const startDateStr = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`;
            const endDateStr = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;
            
            document.getElementById('formRestStartDate').value = startDateStr;
            document.getElementById('formRestEndDate').value = endDateStr;
            updateRestPeriod();
            
            // 如果掛號時有填寫主訴，則預填到主訴欄位
            if (appointment.chiefComplaint && appointment.chiefComplaint !== '無特殊主訴') {
                document.getElementById('formSymptoms').value = appointment.chiefComplaint;
            }
            
            // 自動添加預設診金收費項目
            addDefaultConsultationFee(patient);
            
            // 安全獲取診症儲存按鈕文本元素，避免為 null 時出錯
            const saveButtonTextElNew = document.getElementById('consultationSaveButtonText');
            if (saveButtonTextElNew) {
                saveButtonTextElNew.textContent = '保存病歷';
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
            document.getElementById('formUsage').value = '早晚一次，飯後服';
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
        function closeConsultationForm() {
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
                    
                    showToast(`已取消 ${patient.name} 的診症，病人回到候診狀態`, 'info');
                    
                    // 關閉表單並清理
                    closeConsultationForm();
                    currentConsultingAppointmentId = null;
                    loadTodayAppointments();
                }
            } else if (appointment.status === 'completed') {
                // 如果是已完成的診症，只是關閉編輯模式
                showToast('已退出病歷編輯模式', 'info');
                closeConsultationForm();
                currentConsultingAppointmentId = null;
            } else {
                // 其他狀態直接關閉
                closeConsultationForm();
                currentConsultingAppointmentId = null;
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
                                selectedBillingItems.push({
                                    // 包含索引避免在快速迴圈中生成相同的時間戳導致重複 ID
                                    id: `use-${purchasedPackage.id}-${Date.now()}-${i}`,
                                    name: usedName,
                                    category: 'packageUse',
                                    price: 0,
                                    unit: '次',
                                    description: '套票抵扣一次',
                                    quantity: 1,
                                    patientId: appointment.patientId,
                                    packageRecordId: purchasedPackage.id
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

    // 在進入 try 區塊之前禁用保存按鈕並記錄原始按鈕文字，
    // 以避免 finally 區塊無法存取 originalText 的錯誤（參考語法：let/const 具有塊級作用域）
    const saveButton = document.querySelector('[onclick="saveConsultation()"]');
    let originalText = '';
    if (saveButton) {
        originalText = saveButton.textContent;
        saveButton.textContent = '保存中...';
        saveButton.disabled = true;
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
        // 恢復按鈕狀態
        const saveButton = document.querySelector('[onclick="saveConsultation()"]');
        if (saveButton) {
            saveButton.textContent = originalText;
            saveButton.disabled = false;
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
                <div class="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
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
                    ${patient.allergies ? `
                    <div class="md:col-span-4">
                        <span class="font-medium text-red-600">過敏史：</span>
                        <span class="text-red-700 bg-red-50 px-2 py-1 rounded">${patient.allergies}</span>
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
                                ${consultation.updatedAt ? `
                                    <span class="text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded">
                                        已修改
                                    </span>
                                ` : ''}
                            </div>
                            <div class="flex space-x-2">
                                <button onclick="printConsultationRecord('${consultation.id}')" 
                                        class="text-green-600 hover:text-green-800 text-sm font-medium bg-green-50 px-3 py-2 rounded">
                                    📄 列印收據
                                </button>
                                <button onclick="printAttendanceCertificate('${consultation.id}')" 
                                        class="text-blue-600 hover:text-blue-800 text-sm font-medium bg-blue-50 px-3 py-2 rounded">
                                    📋 到診證明
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
                                    <div class="bg-gray-50 p-3 rounded-lg text-sm text-gray-900">${consultation.symptoms || '無記錄'}</div>
                                </div>
                                
                                ${consultation.tongue ? `
                                <div>
                                    <span class="text-sm font-semibold text-gray-700 block mb-2">舌象</span>
                                    <div class="bg-gray-50 p-3 rounded-lg text-sm text-gray-900">${consultation.tongue}</div>
                                </div>
                                ` : ''}
                                
                                ${consultation.pulse ? `
                                <div>
                                    <span class="text-sm font-semibold text-gray-700 block mb-2">脈象</span>
                                    <div class="bg-gray-50 p-3 rounded-lg text-sm text-gray-900">${consultation.pulse}</div>
                                </div>
                                ` : ''}
                                
                                ${consultation.currentHistory ? `
                                <div>
                                    <span class="text-sm font-semibold text-gray-700 block mb-2">現病史</span>
                                    <div class="bg-gray-50 p-3 rounded-lg text-sm text-gray-900">${consultation.currentHistory}</div>
                                </div>
                                ` : ''}
                                
                                <div>
                                    <span class="text-sm font-semibold text-gray-700 block mb-2">中醫診斷</span>
                                    <div class="bg-green-50 p-3 rounded-lg text-sm text-gray-900 border-l-4 border-green-400">${consultation.diagnosis || '無記錄'}</div>
                                </div>
                                
                                <div>
                                    <span class="text-sm font-semibold text-gray-700 block mb-2">證型診斷</span>
                                    <div class="bg-blue-50 p-3 rounded-lg text-sm text-gray-900 border-l-4 border-blue-400">${consultation.syndrome || '無記錄'}</div>
                                </div>
                                
                                ${consultation.acupunctureNotes ? `
                                <div>
                                    <span class="text-sm font-semibold text-gray-700 block mb-2">針灸備註</span>
                                    <div class="bg-orange-50 p-3 rounded-lg text-sm text-gray-900 border-l-4 border-orange-400">${consultation.acupunctureNotes}</div>
                                </div>
                                ` : ''}
                            </div>
                            
                            <div class="space-y-4">
                                <div>
                                    <span class="text-sm font-semibold text-gray-700 block mb-2">處方內容</span>
                                    <div class="bg-yellow-50 p-3 rounded-lg text-sm text-gray-900 border-l-4 border-yellow-400 whitespace-pre-line">${consultation.prescription || '無記錄'}</div>
                                </div>
                                
                                ${consultation.usage ? `
                                <div>
                                    <span class="text-sm font-semibold text-gray-700 block mb-2">服用方法</span>
                                    <div class="bg-gray-50 p-3 rounded-lg text-sm text-gray-900">${consultation.usage}</div>
                                </div>
                                ` : ''}
                                
                                ${consultation.treatmentCourse ? `
                                <div>
                                    <span class="text-sm font-semibold text-gray-700 block mb-2">療程</span>
                                    <div class="bg-gray-50 p-3 rounded-lg text-sm text-gray-900">${consultation.treatmentCourse}</div>
                                </div>
                                ` : ''}
                                
                                ${consultation.instructions ? `
                                <div>
                                    <span class="text-sm font-semibold text-gray-700 block mb-2">醫囑及注意事項</span>
                                    <div class="bg-red-50 p-3 rounded-lg text-sm text-gray-900 border-l-4 border-red-400">${consultation.instructions}</div>
                                </div>
                                ` : ''}
                                
                                ${consultation.followUpDate ? `
                                <div>
                                    <span class="text-sm font-semibold text-gray-700 block mb-2">複診時間</span>
                                    <div class="bg-purple-50 p-3 rounded-lg text-sm text-gray-900 border-l-4 border-purple-400">${new Date(consultation.followUpDate).toLocaleString('zh-TW')}</div>
                                </div>
                                ` : ''}
                                
                                ${consultation.billingItems ? `
                                <div>
                                    <span class="text-sm font-semibold text-gray-700 block mb-2">收費項目</span>
                                    <div class="bg-green-50 p-3 rounded-lg text-sm text-gray-900 border-l-4 border-green-400 whitespace-pre-line">${consultation.billingItems}</div>
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
        
        // 設置標題
        document.getElementById('medicalHistoryTitle').textContent = `${patient.name} 的診症記錄`;
        
        // 顯示病人基本資訊
        document.getElementById('medicalHistoryPatientInfo').innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
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
                ${patient.allergies ? `
                <div class="md:col-span-4">
                    <span class="font-medium text-red-600">過敏史：</span>
                    <span class="text-red-700 bg-red-50 px-2 py-1 rounded">${patient.allergies}</span>
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
                        ${consultation.updatedAt ? `
                            <span class="text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded">
                                已修改
                            </span>
                        ` : ''}
                    </div>
                    <div class="flex space-x-2">
                        <button onclick="printConsultationRecord('${consultation.id}')" 
                                class="text-green-600 hover:text-green-800 text-sm font-medium bg-green-50 px-3 py-2 rounded">
                            📄 列印收據
                        </button>
                        <button onclick="printAttendanceCertificate('${consultation.id}')" 
                                class="text-blue-600 hover:text-blue-800 text-sm font-medium bg-blue-50 px-3 py-2 rounded">
                            📋 到診證明
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
                            <div class="bg-gray-50 p-3 rounded-lg text-sm text-gray-900">${consultation.symptoms || '無記錄'}</div>
                        </div>
                        
                        ${consultation.tongue ? `
                        <div>
                            <span class="text-sm font-semibold text-gray-700 block mb-2">舌象</span>
                            <div class="bg-gray-50 p-3 rounded-lg text-sm text-gray-900">${consultation.tongue}</div>
                        </div>
                        ` : ''}
                        
                        ${consultation.pulse ? `
                        <div>
                            <span class="text-sm font-semibold text-gray-700 block mb-2">脈象</span>
                            <div class="bg-gray-50 p-3 rounded-lg text-sm text-gray-900">${consultation.pulse}</div>
                        </div>
                        ` : ''}
                        
                        ${consultation.currentHistory ? `
                        <div>
                            <span class="text-sm font-semibold text-gray-700 block mb-2">現病史</span>
                            <div class="bg-gray-50 p-3 rounded-lg text-sm text-gray-900">${consultation.currentHistory}</div>
                        </div>
                        ` : ''}
                        
                        <div>
                            <span class="text-sm font-semibold text-gray-700 block mb-2">中醫診斷</span>
                            <div class="bg-green-50 p-3 rounded-lg text-sm text-gray-900 border-l-4 border-green-400">${consultation.diagnosis || '無記錄'}</div>
                        </div>
                        
                        <div>
                            <span class="text-sm font-semibold text-gray-700 block mb-2">證型診斷</span>
                            <div class="bg-blue-50 p-3 rounded-lg text-sm text-gray-900 border-l-4 border-blue-400">${consultation.syndrome || '無記錄'}</div>
                        </div>
                        
                        ${consultation.acupunctureNotes ? `
                        <div>
                            <span class="text-sm font-semibold text-gray-700 block mb-2">針灸備註</span>
                            <div class="bg-orange-50 p-3 rounded-lg text-sm text-gray-900 border-l-4 border-orange-400">${consultation.acupunctureNotes}</div>
                        </div>
                        ` : ''}
                    </div>
                    
                    <div class="space-y-4">
                        <div>
                            <span class="text-sm font-semibold text-gray-700 block mb-2">處方內容</span>
                            <div class="bg-yellow-50 p-3 rounded-lg text-sm text-gray-900 border-l-4 border-yellow-400 whitespace-pre-line">${consultation.prescription || '無記錄'}</div>
                        </div>
                        
                        ${consultation.usage ? `
                        <div>
                            <span class="text-sm font-semibold text-gray-700 block mb-2">服用方法</span>
                            <div class="bg-gray-50 p-3 rounded-lg text-sm text-gray-900">${consultation.usage}</div>
                        </div>
                        ` : ''}
                        
                        ${consultation.treatmentCourse ? `
                        <div>
                            <span class="text-sm font-semibold text-gray-700 block mb-2">療程</span>
                            <div class="bg-gray-50 p-3 rounded-lg text-sm text-gray-900">${consultation.treatmentCourse}</div>
                        </div>
                        ` : ''}
                        
                        ${consultation.instructions ? `
                        <div>
                            <span class="text-sm font-semibold text-gray-700 block mb-2">醫囑及注意事項</span>
                            <div class="bg-red-50 p-3 rounded-lg text-sm text-gray-900 border-l-4 border-red-400">${consultation.instructions}</div>
                        </div>
                        ` : ''}
                        
                        ${consultation.followUpDate ? `
                        <div>
                            <span class="text-sm font-semibold text-gray-700 block mb-2">複診時間</span>
                            <div class="bg-purple-50 p-3 rounded-lg text-sm text-gray-900 border-l-4 border-purple-400">${formatConsultationDateTime(consultation.followUpDate)}</div>
                        </div>
                        ` : ''}
                        
                        ${consultation.billingItems ? `
                        <div>
                            <span class="text-sm font-semibold text-gray-700 block mb-2">收費項目</span>
                            <div class="bg-green-50 p-3 rounded-lg text-sm text-gray-900 border-l-4 border-green-400 whitespace-pre-line">${consultation.billingItems}</div>
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
    
    if (appointment.status !== 'completed' || !appointment.consultationId) {
        showToast('只能列印已完成診症的收據！', 'error');
        return;
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
    }
}

        
// 2. 修改從掛號記錄列印到診證明函數
async function printAttendanceCertificateFromAppointment(appointmentId) {
    const appointment = appointments.find(apt => apt && String(apt.id) === String(appointmentId));
    if (!appointment) {
        showToast('找不到掛號記錄！', 'error');
        return;
    }
    
    if (appointment.status !== 'completed' || !appointment.consultationId) {
        showToast('只能列印已完成診症的到診證明！', 'error');
        return;
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
    }
}
        
// 3. 修改從掛號記錄列印病假證明函數
async function printSickLeaveFromAppointment(appointmentId) {
    const appointment = appointments.find(apt => apt && String(apt.id) === String(appointmentId));
    if (!appointment) {
        showToast('找不到掛號記錄！', 'error');
        return;
    }
    
    if (appointment.status !== 'completed' || !appointment.consultationId) {
        showToast('只能列印已完成診症的病假證明！', 'error');
        return;
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
                        text-align: right;
                        margin: 8px 0;
                        font-size: 12px;
                        font-weight: bold;
                    }
                    .total-amount {
                        font-size: 12px;
                        color: #000;
                        border: 2px solid #000;
                        padding: 4px;
                        display: inline-block;
                        min-width: 60px;
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
                        font-weight: bold;
                        margin-bottom: 3px;
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
                        <div class="clinic-name">${clinicSettings.chineseName || '中醫診所系統'}</div>
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
                        <div class="info-row">
                            <span class="info-label">病歷號碼：</span>
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
                        <div class="diagnosis-title">診斷：</div>
                        <div>${consultation.diagnosis}</div>
                        ${consultation.syndrome ? `<div>證型：${consultation.syndrome}</div>` : ''}
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
                        <div style="margin-bottom: 8px; font-size: 10px;">應收金額：</div>
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
                                            allItems.push(`${itemName} ${dosage}g <span style="font-size: 8px;">(${composition})</span>`);
                                        } else {
                                            allItems.push(`${itemName} ${dosage}g`);
                                        }
                                    } else {
                                        // 普通藥材
                                        allItems.push(`${itemName} ${dosage}g`);
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
                            
                            // 然後顯示所有項目（包括方劑和藥材），每行4個橫向排列
                            if (regularItems.length > 0) {
                                for (let j = 0; j < regularItems.length; j += 4) {
                                    const lineItems = regularItems.slice(j, j + 4);
                                    result += `<div style="margin: 2px 0;">${lineItems.join('　')}</div>`;
                                }
                            }
                            
                            return result || consultation.prescription.replace(/\n/g, '<br>');
                        })()}</div>
                        ${consultation.usage ? `
                        <div style="margin-top: 8px; font-size: 12px;">
                            <strong>服用方法：</strong>${consultation.usage}
                        </div>
                        ` : ''}
                    </div>
                    ` : ''}
                    
                    <!-- 醫囑 -->
                    ${consultation.instructions ? `
                    <div style="margin: 10px 0; font-size: 12px; background: #fff3cd; padding: 8px; border: 1px solid #ffeaa7;">
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
                            <div class="clinic-name">${clinicSettings.chineseName || '中醫診所系統'}</div>
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
                            <div class="clinic-name">${clinicSettings.chineseName || '中醫診所系統'}</div>
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
                                let restDays = consultation.restDays ? parseInt(consultation.restDays) : 3;
                                
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

// 修復撤回診症功能
async function withdrawConsultation(appointmentId) {
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
    
    try {             
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
        // 修正：撤回診症提示通知不再包含診症日期
        const confirmMessage = `確定要撤回 ${patient.name} 的診症嗎？\n\n` +
                             `此操作將會：\n` +
                             `• 刪除該次診症記錄\n` +
                             `• 病人狀態回到「已掛號」\n` +
                             `• 所有診症資料將永久遺失\n\n` +
                             `診斷：${consultation.diagnosis || '無記錄'}\n\n` +
                             `注意：此操作無法復原！`;
        
        if (confirm(confirmMessage)) {
            // 刪除診症記錄
            const consultationIndex = consultations.findIndex(c => c.id === appointment.consultationId);
            if (consultationIndex !== -1) {
                consultations.splice(consultationIndex, 1);
                localStorage.setItem('consultations', JSON.stringify(consultations));
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
            await window.firebaseDataManager.updateAppointment(String(appointment.id), appointment);
            
            showToast(`已撤回 ${patient.name} 的診症，病人狀態回到已掛號`, 'success');
            
            // 如果正在編輯該病歷，則關閉表單。使用字串比較，避免 ID 類型不一致導致無法匹配
            if (String(currentConsultingAppointmentId) === String(appointmentId)) {
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
    }
}

// 修復修改病歷功能
async function editMedicalRecord(appointmentId) {
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
    
    try {            
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
        // 從 Firebase 獲取病人總數
        const result = await window.firebaseDataManager.getPatients();
        const totalPatients = result.success ? result.data.length : 0;
        
        // 更新病人總數顯示
        const totalPatientsElement = document.getElementById('totalPatients');
        if (totalPatientsElement) {
            totalPatientsElement.textContent = totalPatients;
        }
        
        // 從 Firebase 獲取掛號數據
        let appointmentsData = [];
        try {
            const appointmentResult = await window.firebaseDataManager.getAppointments();
            if (appointmentResult.success) {
                appointmentsData = appointmentResult.data;
                // 同步更新全域變數
                appointments = appointmentsData;
            }
        } catch (error) {
            console.error('獲取掛號數據錯誤:', error);
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
        // 如果 Firebase 讀取失敗，顯示 0
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
    while (!window.firebaseDataManager || !window.firebaseDataManager.isReady) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    try {
        // 載入掛號數據
        const appointmentResult = await window.firebaseDataManager.getAppointments();
        if (appointmentResult && appointmentResult.success) {
            appointments = appointmentResult.data;
        } else {
            appointments = [];
        }
        // 載入診療記錄
        const consultationResult = await window.firebaseDataManager.getConsultations();
        if (consultationResult && consultationResult.success) {
            consultations = consultationResult.data;
        } else {
            consultations = [];
        }
        // 載入患者數據
        const patientResult = await window.firebaseDataManager.getPatients();
        if (patientResult && patientResult.success) {
            patients = patientResult.data;
        } else {
            patients = [];
        }
        console.log('登入後系統資料初始化完成');
    } catch (error) {
        console.error('初始化系統資料失敗:', error);
        appointments = [];
        consultations = [];
        patients = [];
    }
    // 更新統計
    updateStatistics();
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
                chineseNameSpan.textContent = clinicSettings.chineseName || '中醫診所系統';
            }
            if (englishNameSpan) {
                englishNameSpan.textContent = clinicSettings.englishName || 'TCM Clinic';
            }
            
            // 更新登入頁面的診所名稱
            const loginTitle = document.getElementById('loginTitle');
            const loginEnglishTitle = document.getElementById('loginEnglishTitle');
            if (loginTitle) {
                loginTitle.textContent = clinicSettings.chineseName || '中醫診所系統';
            }
            if (loginEnglishTitle) {
                loginEnglishTitle.textContent = clinicSettings.englishName || 'TCM Clinic';
            }
            
            // 更新主頁面的診所名稱
            const systemTitle = document.getElementById('systemTitle');
            const systemEnglishTitle = document.getElementById('systemEnglishTitle');
            if (systemTitle) {
                systemTitle.textContent = clinicSettings.chineseName || '中醫診所系統';
            }
            if (systemEnglishTitle) {
                systemEnglishTitle.textContent = clinicSettings.englishName || 'TCM Clinic';
            }
            
            // 更新歡迎頁面的診所名稱
            const welcomeTitle = document.getElementById('welcomeTitle');
            const welcomeEnglishTitle = document.getElementById('welcomeEnglishTitle');
            if (welcomeTitle) {
                welcomeTitle.textContent = `歡迎使用${clinicSettings.chineseName || '中醫診所系統'}`;
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
            return `
                <div class="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition duration-200">
                    <div class="flex justify-between items-start mb-3">
                        <div>
                            <h4 class="text-lg font-semibold text-gray-900">${herb.name}</h4>
                            ${herb.alias ? `<p class="text-sm text-gray-600">${herb.alias}</p>` : ''}
                        </div>
                        <div class="flex space-x-1">
                            <button onclick="editHerb(${herb.id})" class="text-blue-600 hover:text-blue-800 text-sm">編輯</button>
                            <button onclick="deleteHerbItem(${herb.id})" class="text-red-600 hover:text-red-800 text-sm">刪除</button>
                        </div>
                    </div>
                    
                    <div class="space-y-2 text-sm">
                        ${herb.nature ? `<div><span class="font-medium text-gray-700">性味：</span>${herb.nature}</div>` : ''}
                        ${herb.meridian ? `<div><span class="font-medium text-gray-700">歸經：</span>${herb.meridian}</div>` : ''}
                        ${herb.effects ? `<div><span class="font-medium text-gray-700">功效：</span>${herb.effects}</div>` : ''}
                        ${herb.dosage ? `<div><span class="font-medium text-gray-700">劑量：</span><span class="text-blue-600 font-medium">${herb.dosage}</span></div>` : ''}
                        ${herb.cautions ? `<div><span class="font-medium text-red-600">注意：</span><span class="text-red-700">${herb.cautions}</span></div>` : ''}
                    </div>
                </div>
            `;
        }
        
        function createFormulaCard(formula) {
            return `
                <div class="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition duration-200">
                    <div class="flex justify-between items-start mb-3">
                        <div>
                            <h4 class="text-lg font-semibold text-gray-900">${formula.name}</h4>
                            ${formula.source ? `<p class="text-sm text-gray-600">出處：${formula.source}</p>` : ''}
                        </div>
                        <div class="flex space-x-1">
                            <button onclick="editFormula(${formula.id})" class="text-blue-600 hover:text-blue-800 text-sm">編輯</button>
                            <button onclick="deleteHerbItem(${formula.id})" class="text-red-600 hover:text-red-800 text-sm">刪除</button>
                        </div>
                    </div>
                    
                    <div class="space-y-3 text-sm">
                        ${formula.effects ? `<div><span class="font-medium text-gray-700">功效：</span>${formula.effects}</div>` : ''}
                        ${formula.indications ? `<div><span class="font-medium text-gray-700">主治：</span>${formula.indications}</div>` : ''}
                        ${formula.composition ? `
                            <div>
                                <span class="font-medium text-gray-700">組成：</span>
                                <div class="mt-1 p-2 bg-yellow-50 rounded text-xs whitespace-pre-line border-l-2 border-yellow-400">${formula.composition}</div>
                            </div>
                        ` : ''}
                        ${formula.usage ? `<div><span class="font-medium text-gray-700">用法：</span>${formula.usage}</div>` : ''}
                        ${formula.cautions ? `<div><span class="font-medium text-red-600">注意：</span><span class="text-red-700">${formula.cautions}</span></div>` : ''}
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
            ['herbName', 'herbAlias', 'herbNature', 'herbMeridian', 'herbEffects', 'herbIndications', 'herbDosage', 'herbCautions'].forEach(id => {
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
            document.getElementById('herbNature').value = herb.nature || '';
            document.getElementById('herbMeridian').value = herb.meridian || '';
            document.getElementById('herbEffects').value = herb.effects || '';
            document.getElementById('herbIndications').value = herb.indications || '';
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
            ['formulaName', 'formulaSource', 'formulaEffects', 'formulaIndications', 'formulaComposition', 'formulaUsage', 'formulaCautions'].forEach(id => {
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
            document.getElementById('formulaIndications').value = formula.indications || '';
            document.getElementById('formulaComposition').value = formula.composition || '';
            document.getElementById('formulaUsage').value = formula.usage || '';
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
            const categories = {
                consultation: { name: '診療費', icon: '🩺', items: [] },
                medicine: { name: '藥費', icon: '💊', items: [] },
                treatment: { name: '治療費', icon: '🔧', items: [] },
                other: { name: '其他', icon: '📋', items: [] },
                discount: { name: '折扣項目', icon: '💸', items: [] },
                package: { name: '套票項目', icon: '🎫', items: [] }
            };
            
            filteredItems.forEach(item => {
                if (categories[item.category]) {
                    categories[item.category].items.push(item);
                }
            });
            
            let html = '';
            
            Object.keys(categories).forEach(categoryKey => {
                const category = categories[categoryKey];
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
            
            return `
                <div class="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition duration-200 ${!item.active ? 'opacity-75' : ''}">
                    <div class="flex justify-between items-start mb-3">
                        <div class="flex-1">
                            <h4 class="text-lg font-semibold text-gray-900">${item.name}</h4>
                            <div class="flex items-center mt-1">
                                <span class="text-2xl font-bold text-green-600">$${Math.abs(item.price)}</span>
                                ${item.unit ? `<span class="text-sm text-gray-500 ml-1">/ ${item.unit}</span>` : ''}
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
                    
                    ${item.description ? `
                        <div class="text-sm text-gray-600 bg-gray-50 p-2 rounded">
                            ${item.description}
                        </div>
                    ` : ''}
                </div>
            `;
        }
        
        // 收費項目表單功能
        function showAddBillingItemForm() {
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
                    quantity: days
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
            if (index >= 0 && index < selectedPrescriptionItems.length) {
                const dosage = parseFloat(newDosage);
                if (dosage > 0 && dosage <= 100) {
                    selectedPrescriptionItems[index].customDosage = newDosage;
                    // 重新生成處方文本
                    updatePrescriptionDisplay();
                } else {
                    // 如果輸入無效，恢復原值
                    updatePrescriptionDisplay();
                    showToast('請輸入有效的藥量（0.5-100克）', 'warning');
                }
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
            
            // 檢查是否已經添加過
            const existingIndex = selectedBillingItems.findIndex(b => b.id === itemId);
            if (existingIndex !== -1) {
                // 如果已存在，增加數量
                selectedBillingItems[existingIndex].quantity += 1;
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
                    quantity: 1
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
            
            // 計算總費用
            let totalAmount = 0;
            let subtotalBeforeDiscount = 0;
            
            // 先計算非折扣項目的小計
            selectedBillingItems.forEach(item => {
                if (item.category !== 'discount') {
                    subtotalBeforeDiscount += item.price * item.quantity;
                }
            });
            
            // 計算折扣後的總金額
            totalAmount = subtotalBeforeDiscount;
            selectedBillingItems.forEach(item => {
                if (item.category === 'discount') {
                    if (item.price > 0 && item.price < 1) {
                        // 百分比折扣：對小計進行折扣計算
                        const discountAmount = subtotalBeforeDiscount * (1 - item.price) * item.quantity;
                        totalAmount -= discountAmount;
                    } else {
                        // 固定金額折扣
                        totalAmount += item.price * item.quantity;
                    }
                }
            });
            totalAmountSpan.textContent = `$${totalAmount}`;
            
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
                        // 數量控制區：套票使用項目僅顯示次數，不提供加減按鈕
                        const quantityControls = isPackageUse ? `
                                <div class="flex items-center space-x-2 mr-3">
                                    <span class="w-8 text-center font-semibold">${item.quantity}</span>
                                </div>
                        ` : `
                                <div class="flex items-center space-x-2 mr-3">
                                    <button onclick="updateBillingQuantity(${originalIndex}, -1)" class="w-6 h-6 bg-red-500 text-white rounded-full text-xs hover:bg-red-600 transition duration-200">-</button>
                                    <span class="w-8 text-center font-semibold">${item.quantity}</span>
                                    <button onclick="updateBillingQuantity(${originalIndex}, 1)" class="w-6 h-6 bg-green-500 text-white rounded-full text-xs hover:bg-green-600 transition duration-200">+</button>
                                </div>
                        `;
                        
                        if (item.category === 'discount' && item.price > 0 && item.price < 1) {
                            // 百分比折扣：顯示折扣金額
                            const discountAmount = subtotalBeforeDiscount * (1 - item.price) * item.quantity;
                            subtotal = -discountAmount;
                            subtotalDisplay = `-$${discountAmount.toFixed(0)}`;
                        } else {
                            // 一般項目或固定金額折扣
                            subtotal = item.price * item.quantity;
                            subtotalDisplay = `$${subtotal}`;
                        }
                        
                        return `
                            <div class="flex items-center ${bgColor} border rounded-lg p-3">
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
                                ${undoBtn}<button onclick="removeBillingItem(${originalIndex})" class="text-red-500 hover:text-red-700 font-bold text-lg px-2">×</button>
                            </div>
                        `;
                    }).join('')}
                </div>
                
                <!-- 小計和總計顯示 -->
                ${subtotalBeforeDiscount > 0 && selectedBillingItems.some(item => item.category === 'discount') ? `
                    <div class="mt-4 pt-3 border-t border-gray-200">
                        <div class="text-right space-y-1">
                            <div class="text-sm text-gray-600">
                                小計：<span class="font-medium">$${subtotalBeforeDiscount}</span>
                            </div>
                            ${selectedBillingItems.filter(item => item.category === 'discount').map(item => {
                                if (item.price > 0 && item.price < 1) {
                                    const discountAmount = subtotalBeforeDiscount * (1 - item.price) * item.quantity;
                                    return `<div class="text-sm text-red-600">
                                        ${item.name}：<span class="font-medium">-$${discountAmount.toFixed(0)}</span>
                                    </div>`;
                                } else {
                                    return `<div class="text-sm text-red-600">
                                        ${item.name}：<span class="font-medium">$${item.price * item.quantity}</span>
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
            
            // 如果有折扣項目，先顯示小計
            if (selectedBillingItems.some(item => item.category === 'discount')) {
                billingText += `小計：$${subtotalBeforeDiscount}\n\n`;
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
                        const discountAmount = subtotalBeforeDiscount * (1 - item.price) * item.quantity;
                        billingText += `${item.name} x${item.quantity} = -$${discountAmount.toFixed(0)}\n`;
                    } else {
                        // 固定金額折扣
                        billingText += `${item.name} x${item.quantity} = $${item.price * item.quantity}\n`;
                    }
                }
            });
            
            billingText += `\n總費用：$${Math.round(totalAmount)}`;
            hiddenTextarea.value = billingText.trim();
        }
        
        // 更新收費項目數量
        function updateBillingQuantity(index, change) {
            if (index >= 0 && index < selectedBillingItems.length) {
                const item = selectedBillingItems[index];
                // 如果是套票使用，且 change < 0，直接取消使用並退回次數
                if (change < 0 && item.category === 'packageUse') {
                    // 調用取消函式，這會自動移除該筆記錄並退回次數
                    undoPackageUse(item.patientId, item.packageRecordId, item.id);
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
                    quantity: 1
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
    try {            
const patientResult = await window.firebaseDataManager.getPatients();
if (!patientResult.success) {
    showToast('無法讀取病人資料！', 'error');
    return;
}

// 使用 appointment.patientId 作為查詢依據，避免未定義的 patientId 變數
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

// 直接載入，不需要確認
// 清空現有處方項目
selectedPrescriptionItems = [];

// 解析上次處方內容，重建處方項目
parsePrescriptionToItems(lastConsultation.prescription);

// 更新處方顯示
updatePrescriptionDisplay();

// showToast(`已載入 ${patient.name} 上次的處方內容`, 'success');
            } catch (error) {
        console.error('讀取病人資料錯誤:', error);
        showToast('讀取病人資料失敗', 'error');
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

// 直接載入，不需要確認
// 清空現有收費項目
selectedBillingItems = [];

    // 解析並載入上次收費項目
    parseBillingItemsFromText(lastConsultation.billingItems);
    
    // 根據要求：載入上次收費時，排除任何「使用套票」的抵扣項目。
    // 這些項目在 parseBillingItemsFromText 中會被標記為 category === 'packageUse'。
    // 套票本身的購買（category === 'package'）仍然會被載入。
    if (Array.isArray(selectedBillingItems) && selectedBillingItems.length > 0) {
        selectedBillingItems = selectedBillingItems.filter(item => item.category !== 'packageUse');
    }

    // 更新顯示
    updateBillingDisplay();
            } catch (error) {
        console.error('讀取病人資料錯誤:', error);
        showToast('讀取病人資料失敗', 'error');
    }
        }
        
// 解析收費項目文字並載入
function parseBillingItemsFromText(billingText) {
    if (!billingText) {
        return;
    }
    
    // 解析上次收費項目
    const billingLines = billingText.split('\n');
    
    billingLines.forEach(line => {
        line = line.trim();
        if (!line || line.includes('小計') || line.includes('總費用')) return;
        
        // 解析收費項目格式：項目名 x數量 = $金額 或 項目名 x數量 = -$金額
        const itemMatch = line.match(/^(.+?)\s+x(\d+)\s+=\s+([\-\$]?\d+)$/);
        if (itemMatch) {
            const itemName = itemMatch[1].trim();
            const quantity = parseInt(itemMatch[2]);
            
            // 在收費項目中尋找對應的項目
            const billingItem = billingItems.find(item => 
                item.active && item.name === itemName
            );
            
            if (billingItem) {
                const selectedItem = {
                    id: billingItem.id,
                    name: billingItem.name,
                    category: billingItem.category,
                    price: billingItem.price,
                    unit: billingItem.unit,
                    description: billingItem.description,
                    quantity: quantity
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
                        // 標記為從舊病歷載入，待恢復 meta 後可取消使用
                        isHistorical: true,
                        patientId: null,
                        packageRecordId: null
                    });
                } else {
                    // 如果在收費項目中找不到，創建一個臨時項目（用於已刪除的收費項目）
                    console.log(`找不到收費項目：${itemName}，可能已被刪除`);
                }
            }
        }
    });
}
        
        // 載入上次收費項目（內部函數 - 保留向後兼容）
        function loadPreviousBillingItemsFromConsultation(lastConsultation) {
            selectedBillingItems = [];
            parseBillingItemsFromText(lastConsultation.billingItems);
            updateBillingDisplay();
        }
        
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
                // 使用預設休息期間（今天到後天）
                const startDate = new Date();
                const endDate = new Date();
                endDate.setDate(startDate.getDate() + 2);
                
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

                // 根據要求：載入病歷時，排除任何「使用套票」的抵扣項目。
                // 這些項目在 parseBillingItemsFromText 中會被標記為 category === 'packageUse'。
                if (Array.isArray(selectedBillingItems) && selectedBillingItems.length > 0) {
                    selectedBillingItems = selectedBillingItems.filter(item => item.category !== 'packageUse');
                }

                // 嘗試為舊記錄補全套票使用的 meta 資訊（patientId 與 packageRecordId）。
                // 此步驟在移除套票使用項目後依然呼叫，不會對結果造成影響。
                try {
                    await restorePackageUseMeta(appointment.patientId);
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
        function clearConsultationFormOld() {
            ['formSymptoms', 'formTongue', 'formPulse', 'formCurrentHistory', 'formDiagnosis', 'formSyndrome', 'formAcupunctureNotes', 'formPrescription', 'formUsage', 'formTreatmentCourse', 'formInstructions', 'formFollowUpDate'].forEach(id => {
                document.getElementById(id).value = '';
            });
            
            // 清空處方項目
            selectedPrescriptionItems = [];
            updatePrescriptionDisplay();
            clearPrescriptionSearch();
            
            // 清空收費項目
            selectedBillingItems = [];
            updateBillingDisplay();
            clearBillingSearch();
        }



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
        
        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-50';
        row.innerHTML = `
            <td class="px-4 py-3 text-sm text-gray-900">${user.name}</td>
            <td class="px-4 py-3 text-sm text-gray-600">${user.position || '未設定'}</td>
            <td class="px-4 py-3 text-sm text-gray-600">${user.position === '醫師' ? (user.registrationNumber || '未設定') : '-'}</td>
            <td class="px-4 py-3 text-sm text-gray-900">${user.email || '未設定'}</td>
            <td class="px-4 py-3">
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusClass}">
                    ${statusText}
                </span>
            </td>
            <td class="px-4 py-3 text-sm text-gray-600">${lastLogin}</td>
            <td class="px-4 py-3 text-sm space-x-2">
                <button onclick="editUser('${user.id}')" class="text-blue-600 hover:text-blue-800">編輯</button>
                ${user.id !== currentUserData.id ? `
                    <button onclick="toggleUserStatus('${user.id}')" class="text-orange-600 hover:text-orange-800">
                        ${user.active ? '停用' : '啟用'}
                    </button>
                    <button onclick="deleteUser('${user.id}')" class="text-red-600 hover:text-red-800">刪除</button>
                ` : `
                    <span class="text-gray-400 text-xs">當前用戶</span>
                `}
            </td>
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
    const currentUsers = usersFromFirebase.length > 0 ? usersFromFirebase : users;
    const user = currentUsers.find(u => u.id === id);
    if (!user) return;
    
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

    // 顯示保存中狀態
    const saveButton = document.querySelector('[onclick="saveUser()"]');
    const originalText = saveButton.textContent;
    saveButton.textContent = '保存中...';
    saveButton.disabled = true;

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
        // 恢復按鈕狀態
        saveButton.textContent = originalText;
        saveButton.disabled = false;
    }
}

async function toggleUserStatus(id) {
    const currentUsers = usersFromFirebase.length > 0 ? usersFromFirebase : users;
    const user = currentUsers.find(u => u.id === id);
    if (!user) return;
    
    // 防止停用自己的帳號
    if (user.id === currentUserData.id) {
        showToast('不能停用自己的帳號！', 'error');
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
    const currentUsers = usersFromFirebase.length > 0 ? usersFromFirebase : users;
    const user = currentUsers.find(u => u.id === id);
    if (!user) return;
    
    // 防止刪除自己的帳號
    if (user.id === currentUserData.id) {
        showToast('不能刪除自己的帳號！', 'error');
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
            
            // 準備匯出資料
            const reportData = {
                reportInfo: {
                    title: `財務報表 - ${reportType}`,
                    period: `${startDate} 至 ${endDate}`,
                    generatedAt: new Date().toLocaleString('zh-TW')
                },
                summary: {
                    totalRevenue: document.getElementById('totalRevenue').textContent,
                    totalConsultations: document.getElementById('totalConsultations').textContent,
                    averageRevenue: document.getElementById('averageRevenue').textContent,
                    activeDoctors: document.getElementById('activeDoctors').textContent
                }
            };

            // 轉換為 JSON 字符串
            const jsonString = JSON.stringify(reportData, null, 2);
            
            // 創建下載
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `財務報表_${startDate}_${endDate}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            showToast('財務報表已匯出！', 'success');
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
        const pkg = packages.find(p => p.id === packageRecordId);
        
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
        const activePkgs = pkgs.filter(p => p.remainingUses > 0).sort((a,b)=> new Date(a.expiresAt)-new Date(b.expiresAt));
        
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
    const res = await consumePackage(patientId, packageRecordId);
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
        patientId: patientId,
        packageRecordId: res.record.id
    });
    updateBillingDisplay();
    await refreshPatientPackagesUI();
    showToast(`已使用套票：${res.record.name}，剩餘 ${res.record.remainingUses} 次`, 'success');
}

async function undoPackageUse(patientId, packageRecordId, usageItemId) {
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
            let baseName = item.name;
            // 移除名稱中的「使用套票」及前一個括號（若存在）
            const idx = baseName.indexOf('使用套票');
            if (idx !== -1) {
                if (idx > 0 && (baseName[idx - 1] === '(' || baseName[idx - 1] === '（')) {
                    baseName = baseName.substring(0, idx - 1).trim();
                } else {
                    baseName = baseName.substring(0, idx).trim();
                }
            }
            const candidatesForUndo = pkgsForUndo.filter(p => p.name === baseName);
            if (candidatesForUndo.length === 1) {
                item.packageRecordId = candidatesForUndo[0].id;
                item.isHistorical = false;
            } else if (candidatesForUndo.length > 1) {
                let chosenPkg = candidatesForUndo[0];
                for (const cPkg of candidatesForUndo) {
                    const usedCount = (cPkg.totalUses || 0) - (cPkg.remainingUses || 0);
                    const chosenUsed = (chosenPkg.totalUses || 0) - (chosenPkg.remainingUses || 0);
                    if (usedCount > chosenUsed) {
                        chosenPkg = cPkg;
                    }
                }
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
        const pkg = packages.find(p => p.id === pkgId);
        if (!pkg) {
            // 找不到對應的套票，直接移除項目
            selectedBillingItems = selectedBillingItems.filter(it => it.id !== usageItemId);
            updateBillingDisplay();
            showToast('找不到對應的套票，已移除項目', 'warning');
            return;
        }
        const updatedPackage = {
            ...pkg,
            // 將剩餘次數加 1，如果不存在則視為 0
            remainingUses: (pkg.remainingUses || 0) + 1
        };
        const result = await window.firebaseDataManager.updatePatientPackage(pkgId, updatedPackage);
        if (result && result.success) {
            /*
             * 如果套票使用項目的數量大於 1，代表當次診症已抵扣多次。
             * 此時取消使用只應減少數量並退回一次，並保留項目；
             * 若數量為 1，則從列表中移除該項目。
             */
            const currentItem = selectedBillingItems.find(it => it.id === usageItemId);
            if (currentItem && typeof currentItem.quantity === 'number' && currentItem.quantity > 1) {
                currentItem.quantity -= 1;
            } else {
                selectedBillingItems = selectedBillingItems.filter(it => it.id !== usageItemId);
            }
            updateBillingDisplay();
            await refreshPatientPackagesUI();
            showToast('已取消本次套票使用，次數已退回', 'success');
        } else {
            showToast('取消套票使用失敗', 'error');
        }
    } catch (error) {
        console.error('取消套票使用錯誤:', error);
        showToast('取消套票使用時發生錯誤', 'error');
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
                
                // 補充病人ID
                item.patientId = patientId;
                // 從名稱中移除後綴以找出套票名稱，例如「推拿療程（使用套票）」→「推拿療程」
                // 根據名稱推斷套票名稱：移除括號及「使用套票」字樣
                let baseName = item.name;
                const idx = baseName.indexOf('使用套票');
                if (idx !== -1) {
                    // 如果「使用套票」前有半形或全形括號，將其一併移除
                    if (idx > 0 && (baseName[idx - 1] === '(' || baseName[idx - 1] === '（')) {
                        baseName = baseName.substring(0, idx - 1).trim();
                    } else {
                        baseName = baseName.substring(0, idx).trim();
                    }
                }
                // 在病人的套票中尋找名稱匹配的項目
                const candidates = packages.filter(p => p.name === baseName);
                if (candidates.length === 1) {
                    item.packageRecordId = candidates[0].id;
                    // 找到對應的套票，取消歷史標記
                    item.isHistorical = false;
                } else if (candidates.length > 1) {
                    // 如果有多個同名套票，選擇已使用次數最多的那一個
                    let chosen = candidates[0];
                    for (const c of candidates) {
                        const usedCount = (c.totalUses || 0) - (c.remainingUses || 0);
                        const chosenUsed = (chosen.totalUses || 0) - (chosen.remainingUses || 0);
                        if (usedCount > chosenUsed) {
                            chosen = c;
                        }
                    }
                    item.packageRecordId = chosen.id;
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
        // 等待 Firebase 初始化
        while (!window.firebase) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
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
});
        
// 初始化系統
document.addEventListener('DOMContentLoaded', function() {
    
    updateClinicSettingsDisplay();
    
    
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
  window.updateRestPeriod = updateRestPeriod;
  window.useOnePackage = useOnePackage;
  window.undoPackageUse = undoPackageUse;
})();
