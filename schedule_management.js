(function() {
// 全域變數
        let currentDate = new Date();
        let currentView = 'month';
        let draggedShift = null;
        let currentStaffFilter = 'all';
        // 公眾假期顯示控制：'' 表示不顯示，'hk' 表示顯示香港公眾假期，'us' 表示顯示美國公眾假期
        let selectedHolidayRegion = '';

        // ------------------------------------------------------------------
        // Translation helper
        //
        // The schedule management module makes use of various alert and
        // notification messages. To support multiple languages, define a
        // helper function that retrieves the translated string based on the
        // current language (stored in localStorage under 'lang'). If the
        // translation is missing, fall back to the original Chinese text.
        function translate(key) {
            try {
                const lang = localStorage.getItem('lang') || 'zh';
                const dict = window.translations && window.translations[lang];
                if (dict && Object.prototype.hasOwnProperty.call(dict, key)) {
                    return dict[key];
                }
                return key;
            } catch (_e) {
                return key;
            }
        }

        /*
         * ------------------------------------------------------------------
         * 防止重複動作旗標
         *
         * 有使用者回報在點擊日曆格或提交排班表單時會看到兩次相同的操作被觸發，
         * 這通常是由於瀏覽器在不同元素上綁定了多個事件處理程序，導致同一事件被
         * 短時間內重複處理。以下旗標用於暫時鎖定模態框開啟與表單送出的行為，確
         * 保每次使用者操作只會觸發一次對應的函式。鎖定會在下一個事件循環解除，
         * 不會影響正常的後續操作。
         */

        // 當 shiftModalOpening 為 true 時，表示排班模態框正在開啟過程中，避免重複呼叫 openShiftModal
        let shiftModalOpening = false;
        // 當 shiftSubmitInProgress 為 true 時，表示正在處理新增/編輯排班，避免重複呼叫 addShift
        let shiftSubmitInProgress = false;

        // 定義 2025 年香港與美國公眾假期列表。若擴充其他年份，可新增相應物件。
        const hkHolidays2025 = [
            { date: '2025-01-01', name: '元旦' },
            { date: '2025-01-29', name: '農曆新年初一' },
            { date: '2025-01-30', name: '農曆新年初二' },
            { date: '2025-01-31', name: '農曆新年初三' },
            { date: '2025-04-04', name: '清明節' },
            { date: '2025-04-18', name: '耶穌受難日' },
            { date: '2025-04-19', name: '耶穌受難日翌日' },
            { date: '2025-04-21', name: '復活節星期一' },
            { date: '2025-05-01', name: '勞動節' },
            { date: '2025-05-05', name: '佛誕' },
            { date: '2025-05-31', name: '端午節' },
            { date: '2025-07-01', name: '香港特區成立紀念日' },
            { date: '2025-10-01', name: '國慶日' },
            { date: '2025-10-07', name: '中秋節翌日' },
            { date: '2025-10-29', name: '重陽節' },
            { date: '2025-12-25', name: '聖誕節' },
            { date: '2025-12-26', name: '聖誕節後第一個周日' }
        ];

        const usHolidays2025 = [
            { date: '2025-01-01', name: 'New Year’s Day' },
            { date: '2025-01-20', name: 'Martin Luther King Jr. Day' },
            { date: '2025-01-20', name: 'Inauguration Day' },
            { date: '2025-02-17', name: 'Washington’s Birthday' },
            { date: '2025-05-26', name: 'Memorial Day' },
            { date: '2025-06-19', name: 'Juneteenth National Independence Day' },
            { date: '2025-07-04', name: 'Independence Day' },
            { date: '2025-09-01', name: 'Labor Day' },
            { date: '2025-10-13', name: 'Columbus Day' },
            { date: '2025-11-11', name: 'Veterans Day' },
            { date: '2025-11-27', name: 'Thanksgiving Day' },
            { date: '2025-12-25', name: 'Christmas Day' }
        ];

        /*
         * 為了滿足「假期只顯示 1 個月」的問題需求，允許假期資訊在未來年份也能正確顯示。
         * 本系統目前僅列出 2025 年的公眾假期，但如果使用者瀏覽的月份位於其他年份，
         * 仍希望根據同一月份與日期顯示對應的假期名稱。例如 2026-01-01 仍顯示元旦假期。
         * 因此在 getHolidayForDate 函式中將會以月份與日期為鍵，從 2025 年資料中尋找假期，
         * 並回傳相同名稱的假期資訊。這樣即使日期超出預設的假期年份，也能顯示未來一年或更久的假期。
         */

        /**
         * 取得特定日期的公眾假期資訊。
         * 如果目前沒有設定顯示任何假期，回傳 null。
         * @param {Date} date 日期物件
         * @returns {{date:string,name:string}|null} 假期資料
         */
        function getHolidayForDate(date) {
            // 如果沒有選擇假期地區，直接不顯示假期
            if (!selectedHolidayRegion) return null;
            const dateStr = formatDate(date);
            // 取月份與日期（MM-DD）以供匹配 2025 年的假期資料
            const mmdd = dateStr.slice(5);
            let list = [];
            if (selectedHolidayRegion === 'hk') {
                list = hkHolidays2025;
            } else if (selectedHolidayRegion === 'us') {
                list = usHolidays2025;
            }
            // 嘗試在相應的假期列表中尋找相同月份與日期的假期
            const match = list.find(h => {
                // 假期日期格式為 YYYY-MM-DD，取出 MM-DD 進行比較
                return h.date.slice(5) === mmdd;
            });
            if (match) {
                // 回傳包含目前日期字串與假期名稱的物件
                return { date: dateStr, name: match.name };
            }
            return null;
        }

        /**
         * 更改顯示的公眾假期地區，並重新渲染行事曆。
         * @param {string} region '' 表示不顯示，'hk' 表示香港，'us' 表示美國
         */
        function changeHolidayRegion(region) {
            selectedHolidayRegion = region || '';
            // 重新渲染行事曆以套用假期變更
            if (typeof renderCalendar === 'function') {
                renderCalendar();
            }
        }
        
        // 醫護人員資料
        // 預設為空陣列，實際人員資料將透過載入診所用戶後填充。
        // 我們同時將此陣列引用存放於 window.staff，使得其他程式碼（如 system.html 中的排班管理程式）
        // 可以共用同一份人員資料，避免因為預設示範資料而與實際資料不一致。
        let staff = [];
        // 將 staff 指向全域，便於舊有程式碼讀取
        window.staff = staff;

        // -------------------------------
        // 管理員檢查與權限判斷工具
        // -------------------------------
        /**
         * 判斷當前登入用戶是否具有管理員權限。
         * 管理員可以是職位包含「管理」的用戶（如「診所管理」），或是電子郵件為 admin@clinic.com 的用戶。
         * @returns {boolean} 若為管理員則回傳 true，否則 false。
         */
        if (typeof window.isAdminUser !== 'function') {
            window.isAdminUser = function () {
                try {
                    // 嘗試從各種來源取得使用者資料（currentUserData、window.currentUserData、window.currentUser）
                    let user = null;
                    if (typeof currentUserData !== 'undefined' && currentUserData) {
                        user = currentUserData;
                    } else if (typeof window.currentUserData !== 'undefined' && window.currentUserData) {
                        user = window.currentUserData;
                    } else if (typeof window.currentUser !== 'undefined' && window.currentUser) {
                        user = window.currentUser;
                    } else {
                        user = {};
                    }
                    // 先檢查 Firebase 自訂 claims 中的角色權限（透過 window.currentUserClaims 傳入）。
                    // 若 role 為 'admin'，則視為管理員。
                    try {
                        const claims = window.currentUserClaims || {};
                        const claimRole = (claims.role || claims.Role || '').toString().toLowerCase();
                        if (claimRole === 'admin') {
                            return true;
                        }
                    } catch (_claimErr) {
                        // 忽略 claims 解析錯誤
                    }
                    // 若使用者資料中有 role 屬性，亦可作為權限判斷依據（大小寫不敏感）
                    const userRole = (user.role || '').toString().toLowerCase();
                    if (userRole === 'admin') {
                        return true;
                    }
                    // 原有判斷：職稱包含「管理」即視為管理員，例如「診所管理」「系統管理」等
                    const pos = (user.position || '').toString().trim();
                    if (pos && (pos === '診所管理' || pos.includes('管理'))) {
                        return true;
                    }
                    // 或者使用特定電子郵件身分
                    const email = (user.email || '').toString().toLowerCase().trim();
                    if (email === 'admin@clinic.com') {
                        return true;
                    }
                    return false;
                } catch (_e) {
                    return false;
                }
            };
        }

        /**
         * 確認使用者是否為管理員。若非管理員則顯示提示並返回 false。
         * @param {string} operationName - 顯示於提示中的操作名稱
         * @returns {boolean} 若為管理員則回傳 true，否則 false
         */
        function ensureAdmin(operationName = null) {
            // 若 isAdminUser 未定義或回傳 false，則拒絕操作
            if (!window.isAdminUser || !window.isAdminUser()) {
                // Use the provided operation name if any, otherwise default to a generic phrase. Translate the operation name if possible.
                const opName = operationName || '此操作';
                const opText = translate(opName);
                // Build translated admin-only message
                showNotification(translate('只有管理員才能執行') + opText + translate('！'));
                return false;
            }
            return true;
        }

        /**
         * 將時間字串（HH:MM）解析為分鐘。支援 24:00 視為一天的最後一刻。
         * 若小時為 24 且分鐘為 0，則回傳 24*60。
         * @param {string} timeStr
         * @returns {number} 從零點開始的分鐘數
         */
        function parseTimeToMinutes(timeStr) {
            if (!timeStr) return 0;
            const parts = timeStr.split(':');
            const hh = parseInt(parts[0], 10);
            const mm = parseInt(parts[1], 10) || 0;
            // 處理 24:00 或 24:XX
            if (!isNaN(hh) && hh >= 24) {
                return 24 * 60 + (isNaN(mm) ? 0 : mm);
            }
            const hours = isNaN(hh) ? 0 : hh;
            const minutes = isNaN(mm) ? 0 : mm;
            return hours * 60 + minutes;
        }

        /**
         * 透過人員 ID 查詢人員資料。若找不到對應的人員，回傳一個預設物件
         * 以避免程式在存取 undefined 屬性時產生錯誤。
         * @param {number|string} id 人員 ID
         * @returns {Object} 人員物件
         */
        function findStaffById(id) {
            /**
             * 在比較人員 ID 時，避免直接使用嚴格等號比對，因為資料來源（例如 Firebase）
             * 可能會將 ID 存為字串，而表單元素的值也通常為字串。為了避免因型別不一致
             * 造成無法匹配，將兩者轉為字串後比較。
             */
            const member = staff.find(s => String(s.id) === String(id));
            if (member) return member;
            // 提供基本預設值，確保後續程式可以安全存取屬性
            return {
                id: id,
                name: '未知人員',
                role: 'doctor',
                department: '',
                level: '',
                phone: '',
                email: '',
                maxHours: 0
            };
        }

        /**
         * 從系統的診所用戶載入醫護人員。此函式嘗試從全域函式 fetchUsers (由
         * system.js 提供) 取得用戶清單，並過濾出職位為「醫師」或「護理師」的
         * 用戶，將其映射為排班系統需要的 staff 結構。若無法取得用戶資料，
         * 將維持 staff 為空陣列，以避免載入預設示範用戶。
         */
        async function loadClinicStaff() {
            try {
                let usersList = [];
                /*
                 * 讀取診所人員資料，優先使用本地快取。由於使用者要求僅在登入後
                 * 才讀取排班資料，且希望依賴本地的用戶數據，因此不再呼叫
                 * fetchUsers() 或等待 Firebase 服務。改為從 localStorage
                 * 與全域緩存變數讀取用戶資料。這樣可避免在未登入或離線狀態下
                 * 發出遠端請求。
                 */
                try {
                    const stored = localStorage.getItem('users');
                    if (stored) {
                        const parsed = JSON.parse(stored);
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            usersList = parsed;
                        }
                    }
                } catch (e) {
                    console.warn('讀取本地用戶數據失敗:', e);
                }
                // 若 localStorage 中沒有資料，嘗試從全域快取讀取
                if (usersList.length === 0) {
                    if (window.usersFromFirebase && Array.isArray(window.usersFromFirebase) && window.usersFromFirebase.length > 0) {
                        usersList = window.usersFromFirebase;
                    } else if (window.users && Array.isArray(window.users) && window.users.length > 0) {
                        usersList = window.users;
                    }
                }
                // 將用戶資料轉換為排班人員格式
                // 清空原陣列以維持同一個引用，避免其他腳本無法取得最新資料
                staff.splice(0, staff.length);
                usersList.forEach(u => {
                    // 僅納入醫師與護理師
                    if (u.position === '醫師' || u.position === '護理師') {
                        staff.push({
                            id: u.id,
                            name: u.name || '',
                            role: u.position === '醫師' ? 'doctor' : 'nurse',
                            // 部門若無資料則使用空字串，避免 undefined
                            department: u.department || '',
                            // level 可使用 position 表示，例如主治醫師或護理師
                            level: u.position || '',
                            phone: u.phone || '',
                            email: u.email || '',
                            // 若有 maxHours 欄位則使用，否則預設 40
                            maxHours: typeof u.maxHours === 'number' ? u.maxHours : 40
                        });
                    }
                });
                // 更新全域 staff 指向最新的資料陣列，確保其他腳本能取得最新人員
                // 由於我們使用 splice 清空陣列並重新填充，不會改變引用，
                // 因此仍將 window.staff 指向同一個陣列。
                window.staff = staff;
            } catch (err) {
                console.error('載入診所用戶時發生錯誤：', err);
                // 若出錯則維持 staff 為空陣列
                staff.splice(0, staff.length);
                // 同步全域 staff（仍指向同一陣列）
                window.staff = staff;
            }
        }

        // 排班資料 - 使用當前月份的日期
        // 將排班依年月分割儲存在 Realtime Database，例如 scheduleShifts/2025-10/{shiftId}
        // 本地僅保存正在檢視月份的排班列表以減少下載量。
        let shifts = [];

        /**
         * 依據日期字串 (YYYY-MM-DD) 取得年月鍵，用於在 RTDB 中的節點。
         * 若未提供日期，則使用 currentDate。輸出格式為 YYYY-MM。
         * @param {string} dateStr 日期字串，例如 2025-10-01
         * @returns {string} 年月鍵，例如 '2025-10'
         */
        function getMonthKey(dateStr) {
            try {
                if (dateStr && typeof dateStr === 'string' && dateStr.length >= 7) {
                    return dateStr.slice(0, 7);
                }
                const d = currentDate instanceof Date ? currentDate : new Date();
                const y = d.getFullYear();
                const m = (d.getMonth() + 1).toString().padStart(2, '0');
                return `${y}-${m}`;
            } catch (_e) {
                const d = new Date();
                return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
            }
        }

        /**
         * 將單筆排班資料寫入至 Firebase Realtime Database。
         * 僅寫入該排班，而不覆蓋整個排班集合。
         * @param {Object} shift 排班物件，必須包含 id、date 等欄位
         */
        function getCurrentClinicId() {
            try {
                const cid = localStorage.getItem('currentClinicId');
                return cid || 'local-default';
            } catch (_e) {
                return 'local-default';
            }
        }
        function getCurrentClinicName() {
            let name = '';
            try {
                const cid = getCurrentClinicId();
                const stored = localStorage.getItem('clinics');
                if (stored) {
                    const list = JSON.parse(stored);
                    if (Array.isArray(list)) {
                        const found = list.find(c => String(c.id) === String(cid));
                        if (found) {
                            name = found.chineseName || found.englishName || '';
                        }
                    }
                }
                if (!name) {
                    const cs = localStorage.getItem('clinicSettings');
                    if (cs) {
                        const obj = JSON.parse(cs);
                        name = obj.chineseName || obj.englishName || '';
                    }
                }
            } catch (_e) {}
            return name || '';
        }
        async function saveShiftToDb(shift) {
            try {
                if (!window.firebase || !window.firebase.rtdb || !shift) return;
                const monthKey = getMonthKey(shift.date);
                // 從 shift 物件中移除 id 以避免 id 存入資料庫值
                const { id, ...data } = shift || {};
                const clinicId = shift && shift.clinicId ? String(shift.clinicId) : getCurrentClinicId();
                const path = `clinics/${clinicId}/scheduleShifts/${monthKey}/${id}`;
                const refPath = window.firebase.ref(window.firebase.rtdb, path);
                await window.firebase.set(refPath, data);
            } catch (e) {
                console.error('保存單筆排班資料失敗:', e);
            }
        }

        /**
         * 從 Firebase Realtime Database 中刪除單筆排班資料。
         * @param {Object} shift 排班物件，需要 id 與 date
         */
        async function deleteShiftFromDb(shift) {
            try {
                if (!window.firebase || !window.firebase.rtdb || !shift) return;
                const monthKey = getMonthKey(shift.date);
                const clinicId = shift && shift.clinicId ? String(shift.clinicId) : getCurrentClinicId();
                const path = `clinics/${clinicId}/scheduleShifts/${monthKey}/${shift.id}`;
                const refPath = window.firebase.ref(window.firebase.rtdb, path);
                await window.firebase.remove(refPath);
            } catch (e) {
                console.error('刪除排班資料失敗:', e);
            }
        }

        /**
         * 從 Firebase Realtime Database 載入排班資料。
         * 只在進入排班管理系統時讀取一次，不使用實時監聽。
         * 讀取完成後會更新全域 shifts 陣列，但不會自動渲染畫面，需由呼叫者重新渲染。
         */
        async function loadShiftsFromDb() {
            try {
                // 優先使用系統提供的等待函式，確保 Firebase 資料庫已就緒
                if (typeof waitForFirebaseDb === 'function') {
                    try {
                        await waitForFirebaseDb();
                    } catch (e) {
                        // 如果等待失敗則忽略，後續將自行檢查 firebase 物件
                    }
                } else {
                    // 如果沒有 waitForFirebaseDb，則簡單輪詢直到 firebase.rtdb 可用
                    for (let i = 0; i < 50 && (!window.firebase || !window.firebase.rtdb); i++) {
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                }
                if (!window.firebase || !window.firebase.rtdb) {
                    console.warn('Firebase Realtime Database 尚未準備就緒，無法載入排班資料');
                    return;
                }
                // 只載入目前月份的排班資料，以減少下載量
                const monthKey = getMonthKey();
                const clinicId = getCurrentClinicId();
                const monthRef = window.firebase.ref(window.firebase.rtdb, `clinics/${clinicId}/scheduleShifts/${monthKey}`);
                const snapshot = await window.firebase.get(monthRef);
                const data = snapshot && snapshot.exists() ? snapshot.val() : null;
                // 清空現有資料，保持陣列引用不變
                shifts.splice(0, shifts.length);
                if (data) {
                    Object.keys(data).forEach(idKey => {
                        const shiftObj = data[idKey] || {};
                        // 將鍵轉為數字 ID（若為數字字串）並合併資料
                        shifts.push({ id: isNaN(Number(idKey)) ? idKey : Number(idKey), ...shiftObj });
                    });
                }
            } catch (err) {
                // 如果因權限不足導致讀取失敗，向使用者顯示通知
                try {
                    if (err && err.message && String(err.message).toLowerCase().includes('permission')) {
                        if (typeof showNotification === 'function') {
                            // Use translated message when lacking permission to read schedule data
                            showNotification(translate('您沒有權限讀取排班資料，如需存取請聯繫管理員'), 'error');
                        }
                    }
                } catch (_notifyErr) {
                    // 忽略顯示通知時的錯誤
                }
                console.error('載入排班資料失敗:', err);
            }
        }

        /**
         * 將當前 shifts 陣列寫入 Firebase Realtime Database。
         * 每當新增、編輯或刪除排班後呼叫本函式，以確保資料持久化。
         */
        async function saveShiftsToDb() {
            try {
                if (typeof waitForFirebaseDb === 'function') {
                    try {
                        await waitForFirebaseDb();
                    } catch (e) {
                        // 忽略等待失敗
                    }
                } else {
                    for (let i = 0; i < 50 && (!window.firebase || !window.firebase.rtdb); i++) {
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                }
                if (!window.firebase || !window.firebase.rtdb) {
                    console.warn('Firebase Realtime Database 尚未準備就緒，無法保存排班資料');
                    return;
                }
                // 逐筆寫入排班資料，以避免覆蓋整個排班集合。
                for (const shift of shifts) {
                    await saveShiftToDb(shift);
                }
            } catch (err) {
                console.error('保存排班資料失敗:', err);
            }
        }
        
        // 初始化一些示範排班資料
        function initializeSampleShifts() {
            const today = new Date();
            const currentMonth = today.getMonth();
            const currentYear = today.getFullYear();
            
            // 確保使用一致的日期，避免視圖間不同步
            const baseDate = 26; // 統一使用26號作為示範日期
            
            shifts = [
                { id: 1, staffId: 1, date: `${currentYear}-${(currentMonth + 1).toString().padStart(2, '0')}-${baseDate.toString().padStart(2, '0')}`, startTime: '08:00', endTime: '16:00', type: 'morning', status: 'confirmed', notes: '門診' },
                { id: 2, staffId: 4, date: `${currentYear}-${(currentMonth + 1).toString().padStart(2, '0')}-${baseDate.toString().padStart(2, '0')}`, startTime: '08:00', endTime: '16:00', type: 'morning', status: 'confirmed', notes: '病房' },
                { id: 3, staffId: 2, date: `${currentYear}-${(currentMonth + 1).toString().padStart(2, '0')}-${(baseDate + 1).toString().padStart(2, '0')}`, startTime: '16:00', endTime: '24:00', type: 'afternoon', status: 'pending', notes: '手術房' },
                { id: 4, staffId: 5, date: `${currentYear}-${(currentMonth + 1).toString().padStart(2, '0')}-${(baseDate + 1).toString().padStart(2, '0')}`, startTime: '16:00', endTime: '24:00', type: 'afternoon', status: 'confirmed', notes: '病房' },
                { id: 5, staffId: 3, date: `${currentYear}-${(currentMonth + 1).toString().padStart(2, '0')}-${(baseDate + 2).toString().padStart(2, '0')}`, startTime: '00:00', endTime: '08:00', type: 'night', status: 'confirmed', notes: '急診' },
                { id: 6, staffId: 6, date: `${currentYear}-${(currentMonth + 1).toString().padStart(2, '0')}-${(baseDate + 2).toString().padStart(2, '0')}`, startTime: '00:00', endTime: '08:00', type: 'night', status: 'confirmed', notes: '急診' },
                { id: 7, staffId: 7, date: `${currentYear}-${(currentMonth + 1).toString().padStart(2, '0')}-${(baseDate - 1).toString().padStart(2, '0')}`, startTime: '09:00', endTime: '17:00', type: 'morning', status: 'confirmed', notes: '兒科門診' },
                { id: 8, staffId: 8, date: `${currentYear}-${(currentMonth + 1).toString().padStart(2, '0')}-${(baseDate - 1).toString().padStart(2, '0')}`, startTime: '09:00', endTime: '17:00', type: 'morning', status: 'confirmed', notes: '兒科病房' }
            ];
        }

        // 篩選狀態
        let currentFilters = {
            department: '',
            role: '',
            shiftType: '',
            staffSearch: ''
        };

        // 包裝函式：處理班表上的編輯與刪除按鈕點擊。
        // 這些函式僅在內部調用 event.stopPropagation() / preventDefault() 並呼叫實際的
        // 編輯或刪除函式。若 scheduleEditShift / scheduleDeleteShift 不存在，則回退到本地函式。
        function handleEditShift(e, shiftId) {
            if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
            // 使用 scheduleEditShift（global）如果可用
            if (typeof window.scheduleEditShift === 'function') {
                window.scheduleEditShift(shiftId);
            } else if (typeof editShift === 'function') {
                // fallback
                editShift(shiftId);
            }
        }

        function handleDeleteShift(e, shiftId) {
            if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
            if (e && typeof e.preventDefault === 'function') e.preventDefault();
            if (typeof window.scheduleDeleteShift === 'function') {
                window.scheduleDeleteShift(shiftId);
            } else if (typeof deleteShift === 'function') {
                deleteShift(shiftId);
            }
        }

        // 將包裝函式掛載至 window，使 inline onclick 可以順利呼叫
        if (typeof window !== 'undefined') {
            window.handleEditShift = handleEditShift;
            window.handleDeleteShift = handleDeleteShift;
        }

        // 延遲初始化
        // 不在 DOMContentLoaded 時自動載入排班資料和人員資料。
        // 初始化將在使用者登入並進入醫療排班區塊時觸發。

        // 設定事件監聽器
        function setupEventListeners() {
            // 班別選擇變更
            document.getElementById('shiftType').addEventListener('change', function() {
                const type = this.value;
                const startTime = document.getElementById('startTime');
                const endTime = document.getElementById('endTime');
                
                switch(type) {
                    case 'morning':
                        startTime.value = '08:00';
                        endTime.value = '16:00';
                        break;
                    case 'afternoon':
                        startTime.value = '16:00';
                        // 將原本的 24:00 改為 00:00，以避免 HTML <input type="time"> 不接受 24:00
                        endTime.value = '00:00';
                        break;
                    case 'night':
                        startTime.value = '00:00';
                        endTime.value = '08:00';
                        break;
                }
            });

            // 固定排班班別選擇變更
            document.getElementById('fixedShiftType').addEventListener('change', function() {
                const type = this.value;
                const customTimeGroup = document.getElementById('customTimeGroup');
                const startTime = document.getElementById('fixedStartTime');
                const endTime = document.getElementById('fixedEndTime');
                
                if (type === 'custom') {
                    customTimeGroup.style.display = 'block';
                } else {
                    customTimeGroup.style.display = 'none';
                    switch(type) {
                        case 'morning':
                            startTime.value = '08:00';
                            endTime.value = '16:00';
                            break;
                        case 'afternoon':
                            startTime.value = '16:00';
                            // 改用 00:00，避免 HTML <input type="time"> 不支援 24:00
                            endTime.value = '00:00';
                            break;
                        case 'night':
                            startTime.value = '00:00';
                            endTime.value = '08:00';
                            break;
                    }
                }
            });

            // 排程範圍選擇變更
            document.getElementById('scheduleRange').addEventListener('change', function() {
                const customRangeGroup = document.getElementById('customRangeGroup');
                if (this.value === 'custom-range') {
                    customRangeGroup.style.display = 'block';
                } else {
                    customRangeGroup.style.display = 'none';
                }
            });

            // 表單提交
            document.getElementById('shiftForm').addEventListener('submit', function(e) {
                e.preventDefault();
                addShift();
            });

            // 固定排班表單提交
            document.getElementById('fixedScheduleForm').addEventListener('submit', function(e) {
                e.preventDefault();
                createFixedSchedule();
            });
        }

        // 更新當前日期顯示
        function updateCurrentDate() {
            const options = { year: 'numeric', month: 'long' };
            document.getElementById('currentDate').textContent = currentDate.toLocaleDateString('zh-TW', options);
        }

        // 導航行事曆
        async function navigateCalendar(direction) {
            // 調整月份
            currentDate.setMonth(currentDate.getMonth() + direction);
            updateCurrentDate();
            // 載入新的月份排班資料，以便顯示對應月份的排班
            try {
                await loadShiftsFromDb();
            } catch (_e) {
                // 錯誤已在 loadShiftsFromDb 中處理
            }
            renderCalendar();
        }

        // 切換視圖（僅保留月視圖）
        function changeView(view) {
            // 僅支援月視圖
            currentView = 'month';
            updateCurrentDate();
            renderCalendar();
        }

        // 渲染行事曆
        function renderCalendar() {
            const grid = document.getElementById('calendarGrid');
            grid.innerHTML = '';
            grid.className = 'calendar-grid month-view';
            renderMonthView(grid);
        }

        // 渲染月視圖
        function renderMonthView(grid) {
            // 添加星期標題
            const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
            weekdays.forEach(day => {
                const header = document.createElement('div');
                header.className = 'calendar-header';
                header.textContent = day;
                grid.appendChild(header);
            });

            // 獲取月份的第一天和最後一天
            const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
            const lastDay = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
            const startDate = new Date(firstDay);
            startDate.setDate(startDate.getDate() - firstDay.getDay());

            // 渲染42個格子（6週）
            for (let i = 0; i < 42; i++) {
                const cellDate = new Date(startDate);
                cellDate.setDate(startDate.getDate() + i);
                
                const cell = document.createElement('div');
                cell.className = 'calendar-cell';
                // 使用本地時間格式化日期，避免使用 ISO 字串導致時區偏移
                cell.dataset.date = formatDate(cellDate);
                
                if (cellDate.getMonth() !== currentDate.getMonth()) {
                    cell.classList.add('other-month');
                }
                
                if (isToday(cellDate)) {
                    cell.classList.add('today');
                }

                const dayNumber = document.createElement('div');
                dayNumber.className = 'day-number';
                dayNumber.textContent = cellDate.getDate();
                cell.appendChild(dayNumber);

                // 如果啟用了公眾假期顯示，並且今天是假期，則加上假期樣式與標籤
                const holidayInfo = getHolidayForDate(cellDate);
                if (holidayInfo) {
                    cell.classList.add('holiday');
                    const holidayLabel = document.createElement('div');
                    holidayLabel.className = 'holiday-label';
                    holidayLabel.textContent = holidayInfo.name;
                    cell.appendChild(holidayLabel);
                }

                // 添加排班
                const dayShifts = getShiftsForDate(cellDate).filter(passesFilter);
                dayShifts.forEach(shift => {
                    const shiftElement = createShiftElement(shift);
                    cell.appendChild(shiftElement);
                });

                // 添加拖放功能
                setupCellDropZone(cell);
                
                grid.appendChild(cell);
            }
        }



        // 創建排班元素
        function createShiftElement(shift) {
            const staffMember = findStaffById(shift.staffId);
            const element = document.createElement('div');
            
            let shiftClasses = `shift-item ${staffMember.role}`;
            if (shift.type === 'emergency') shiftClasses += ' emergency';
            if (shift.status === 'overtime') shiftClasses += ' overtime';
            
            element.className = shiftClasses;
            element.draggable = true;
            element.dataset.shiftId = shift.id;
            
            const duration = calculateShiftDuration(shift.startTime, shift.endTime);
            const statusIcon = shift.status === 'confirmed' ? '✓' : shift.status === 'pending' ? '⏳' : '❌';
            
            // 使用單一函式處理按鈕點擊以便 inline 事件僅包含函式呼叫。
            // 直接在 onclick 中調用多個語句（例如 event.stopPropagation(); editShift(...)) 會導致
            // system.js 的 parseArgs 函式無法正確解析，產生 SyntaxError。
            // 因此改為調用包裝函式 handleEditShift / handleDeleteShift，由包裝函式自行處理
            // 停止事件冒泡和觸發實際的編輯或刪除邏輯。
            // 根據職位顯示中文名稱，如果 level 為空則從 role 推斷
            // Determine the display label for the staff member's position.  If a
            // specific level is provided (which may already be localised), use it.
            // Otherwise map the role ('doctor' or 'nurse') to the default
            // Chinese title and translate it using the translate helper. This
            // ensures doctor/nurse labels inside shift elements reflect the
            // current language setting.
            const positionLabel = staffMember.level || translate(staffMember.role === 'doctor' ? '醫師' : staffMember.role === 'nurse' ? '護理師' : '');
            // 判斷當前使用者是否為管理員。非管理員時不顯示編輯與刪除按鈕。
            const isAdmin = typeof window.isAdminUser === 'function' && window.isAdminUser();
            // 根據權限組織操作按鈕的 HTML；僅管理員可見。
            let actionsHtml = '';
            if (isAdmin) {
                actionsHtml = `
                        <button class="shift-action-btn" onclick="handleEditShift(event, ${shift.id})" title="${translate('編輯')}">✏️</button>
                        <button class="shift-action-btn" onclick="handleDeleteShift(event, ${shift.id})" title="${translate('刪除')}">🗑️</button>
                `;
            }
            element.innerHTML = `
                <div class="shift-header">
                    <div class="shift-name">
                        ${staffMember.name}<span class="staff-position"> ${positionLabel}</span>
                    </div>
                    <div class="shift-actions">
                        ${actionsHtml.trim()}
                    </div>
                </div>
                <div class="shift-details">
                    ${shift.startTime}-${shift.endTime} (${duration}h)<br>
                    ${shift.notes || translate('一般排班')}
                </div>
            `;

            // 拖拽事件
            element.addEventListener('dragstart', function(e) {
                draggedShift = shift;
                this.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            });

            element.addEventListener('dragend', function() {
                this.classList.remove('dragging');
                draggedShift = null;
            });

            // 點擊事件（防止拖拽時觸發）
            element.addEventListener('click', function(e) {
                if (!e.target.classList.contains('shift-action-btn')) {
                    showShiftDetails(shift);
                }
            });

            return element;
        }

        // 計算排班時數
        function calculateShiftDuration(startTime, endTime) {
            // 使用分鐘單位計算班次時長，以支援跨日及 24:00 等特例
            const startMinutes = parseTimeToMinutes(startTime);
            let endMinutes = parseTimeToMinutes(endTime);
            let duration = endMinutes - startMinutes;
            // 若結束時間早於開始時間，視為跨日，補加 24 小時
            if (duration < 0) {
                duration += 24 * 60;
            }
            // 將分鐘換算成小時並保留一位小數
            return Math.round((duration / 60) * 10) / 10;
        }

        // 設定格子拖放區域
        function setupCellDropZone(cell) {
            cell.addEventListener('dragover', function(e) {
                e.preventDefault();
                
                // 檢查是否是人員拖拽或排班拖拽
                const staffId = e.dataTransfer.getData('text/plain');
                if (staffId) {
                    e.dataTransfer.dropEffect = 'copy';
                } else if (draggedShift) {
                    e.dataTransfer.dropEffect = 'move';
                }
                
                this.classList.add('drop-zone');
            });

            cell.addEventListener('dragleave', function(e) {
                // 只有當滑鼠真正離開格子時才移除樣式
                if (!this.contains(e.relatedTarget)) {
                    this.classList.remove('drop-zone');
                }
            });

            cell.addEventListener('drop', async function(e) {
                e.preventDefault();
                this.classList.remove('drop-zone');
                // 僅限管理員拖放操作
                if (!ensureAdmin('新增或移動排班')) {
                    return;
                }
                const staffId = e.dataTransfer.getData('text/plain');
                
                if (staffId) {
                    // 人員拖拽 - 快速新增排班
                    const staffMember = findStaffById(staffId);
                    if (staffMember) {
                        quickAddShiftFromDrag(staffMember, this.dataset.date);
                    }
                } else if (draggedShift) {
                    // 排班拖拽 - 移動排班
                    const newDate = this.dataset.date;
                    // 紀錄原本日期，以便跨月份時刪除舊路徑
                    const oldDate = draggedShift.date;
                    // 更新排班日期
                    draggedShift.date = newDate;
                    // 將更新後的排班寫入資料庫
                    try {
                        await saveShiftToDb(draggedShift);
                        // 如果跨月份則刪除原路徑的資料
                        const oldKey = getMonthKey(oldDate);
                        const newKey = getMonthKey(newDate);
                        if (oldKey !== newKey) {
                            await deleteShiftFromDb({ id: draggedShift.id, date: oldDate });
                        }
                    } catch (_err) {
                        /* 保存錯誤已在函式中處理 */
                    }
                    // 重新渲染日曆並更新統計
                    renderCalendar();
                    updateStats();
                    showNotification(translate('排班已成功移動！'));
                }
            });

            // 點擊添加排班
            cell.addEventListener('click', function(e) {
                // 避免在拖拽操作時觸發點擊
                if (!e.target.closest('.shift-item')) {
                    openShiftModal(this.dataset.date);
                }
            });
        }

        // 快速新增排班（從拖拽）
        async function quickAddShiftFromDrag(staffMember, date, hour) {
            // 僅允許管理員操作
            if (!ensureAdmin('新增排班')) {
                return;
            }
            // 月視圖 - 預設早班
            const startTime = '08:00';
            const endTime = '16:00';
            const shiftType = 'morning';
            
            // 檢查是否已有排班衝突
            const existingShift = shifts.find(s =>
                String(s.staffId) === String(staffMember.id) &&
                s.date === date &&
                s.startTime === startTime
            );
            
            if (existingShift) {
                // Preserve the staff name and translate the static suffix
                showNotification(`${staffMember.name} ${translate('在該時段已有排班！')}`);
                return;
            }
            
            // 新增排班
            const newShift = {
                id: Date.now(),
                // 使用字串型別存儲 staffId，以避免型別不一致
                staffId: String(staffMember.id),
                date: date,
                startTime: startTime,
                endTime: endTime,
                type: shiftType,
                status: 'confirmed',
                // 拖拽新增排班不再自動加入備註文字
                notes: '',
                clinicId: getCurrentClinicId()
            };
            
            shifts.push(newShift);
            // 儲存單筆排班至資料庫（非阻塞，如出錯則在 console 顯示）
            try {
                await saveShiftToDb(newShift);
            } catch (_err) {
                /* 忽略保存錯誤，已在 saveShiftToDb 中處理 */
            }
            renderCalendar();
            renderStaffPanel(); // 更新人員狀態
            updateStats();
            
            // Translate the shift type name before composing the message.  This
            // ensures that the notification appears in the currently
            // selected language.  Without this call, shift type names like
            // "早班" or "夜班" would remain in Chinese even when the UI
            // language is English.
            const shiftTypeName = translate(getShiftTypeName(shiftType));
            // Compose notification message for newly added shift using translations
            showNotification(`${translate('已為')} ${staffMember.name} ${translate('新增')} ${shiftTypeName} (${startTime}-${endTime})${translate('！')}`);
        }

        // 輔助函數
        function isToday(date) {
            const today = new Date();
            return date.toDateString() === today.toDateString();
        }

        /**
         * 格式化日期為 YYYY-MM-DD，使用本地時間，而非 toISOString 以避免時區偏移導致日期提前或延後。
         * @param {Date} date 日期物件
         * @returns {string} 格式化後的日期字串
         */
        function formatDate(date) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }

        function getShiftsForDate(date) {
            // 使用本地時間格式化日期，避免時區導致日期錯誤
            const dateStr = formatDate(date);
            return shifts.filter(shift => shift.date === dateStr);
        }

        // 渲染人員面板
        function renderStaffPanel() {
            const grid = document.getElementById('staffGrid');
            grid.innerHTML = '';

            const filteredStaff = getFilteredStaff();

            filteredStaff.forEach(member => {
                const card = document.createElement('div');
                card.className = `staff-card ${member.role}`;
                card.draggable = true;
                card.dataset.staffId = member.id;
                

                
                // 顯示人員姓名與職位（level 為職稱）。若無 level 則根據 role 推斷，並使用翻譯
                // 將預設中文職稱轉換為當前語言。例如 doctor -> 醫師 -> Doctor（在英文下）。
                const positionLabel = member.level || translate(member.role === 'doctor' ? '醫師' : member.role === 'nurse' ? '護理師' : '');
                card.innerHTML = `
                    <div class="staff-name">${member.name}<span class="staff-position"> ${positionLabel}</span></div>
                    <div class="drag-hint">🖱️</div>
                `;

                // 設定拖拽事件
                setupStaffDragEvents(card, member);
                
                grid.appendChild(card);
            });

            // 更新人員選擇下拉選單
            updateStaffSelects();
        }

        // 設定人員拖拽事件
        function setupStaffDragEvents(card, member) {
            let draggedStaffMember = null;

            card.addEventListener('dragstart', function(e) {
                draggedStaffMember = member;
                this.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'copy';
                e.dataTransfer.setData('text/plain', member.id);
                
                // 高亮可放置的區域
                document.querySelectorAll('.calendar-cell').forEach(cell => {
                    cell.classList.add('drop-target');
                });
            });

            card.addEventListener('dragend', function() {
                this.classList.remove('dragging');
                draggedStaffMember = null;
                
                // 移除高亮
                document.querySelectorAll('.calendar-cell').forEach(cell => {
                    cell.classList.remove('drop-target');
                });
            });

            // 儲存到全域變數供其他函數使用
            card.draggedStaffMember = member;
        }

        // 獲取篩選後的人員
        function getFilteredStaff() {
            const filter = currentStaffFilter || 'all';
            
            switch (filter) {
                case 'doctor':
                    return staff.filter(s => s.role === 'doctor');
                case 'nurse':
                    return staff.filter(s => s.role === 'nurse');
                default:
                    return staff;
            }
        }

        // 獲取今日人員排班
        function getTodayShiftsForStaff(staffId) {
            const today = new Date().toISOString().split('T')[0];
            // 以字串比對人員 ID，避免型別不一致
            return shifts.filter(shift => String(shift.staffId) === String(staffId) && shift.date === today);
        }

        // 獲取人員狀態
        function getStaffStatus(staffId, todayShifts) {
            if (todayShifts.length === 0) {
                return { class: '', icon: '✅', text: translate('可排班') };
            } else if (todayShifts.length === 1) {
                return { class: 'partial', icon: '⏰', text: translate('已排班') };
            } else {
                return { class: 'busy', icon: '🔴', text: translate('滿班') };
            }
        }

        // 更新人員選擇下拉選單
        function updateStaffSelects() {
            const select = document.getElementById('staffSelect');
            select.innerHTML = '';
            staff.forEach(member => {
                const option = document.createElement('option');
                option.value = member.id;
                // Localise the doctor/nurse label for the staff select dropdown
                const roleLabel = member.role === 'doctor' ? translate('醫師') : translate('護理師');
                option.textContent = `${member.name} (${roleLabel})`;
                select.appendChild(option);
            });

            // 更新固定排班人員選擇下拉選單
            const fixedSelect = document.getElementById('fixedStaffSelect');
            if (fixedSelect) {
                fixedSelect.innerHTML = '';
                staff.forEach(member => {
                    const option = document.createElement('option');
                    option.value = member.id;
                    // Localise the doctor/nurse label for the fixed schedule staff select
                    const roleLabelFixed = member.role === 'doctor' ? translate('醫師') : translate('護理師');
                    option.textContent = `${member.name} (${roleLabelFixed}) - ${member.department}`;
                    fixedSelect.appendChild(option);
                });
            }
        }

        // 模態框操作
        function openShiftModal(date = null, staffId = null) {
            // 僅允許管理員開啟新增/編輯排班視窗
            if (!ensureAdmin('新增或編輯排班')) {
                return;
            }
            // 若模態框正在開啟，避免重複觸發導致重複執行
            if (shiftModalOpening) {
                return;
            }
            shiftModalOpening = true;
            // 在下一個事件循環解除鎖定，防止瞬間重複觸發
            setTimeout(() => {
                shiftModalOpening = false;
            }, 0);
            const modal = document.getElementById('shiftModal');
            const form = document.getElementById('shiftForm');
            
            // 重置表單
            form.reset();
            
            // 設定預設值
            if (date) {
                document.getElementById('shiftDate').value = date;
            } else {
                document.getElementById('shiftDate').value = currentDate.toISOString().split('T')[0];
            }
            
            if (staffId) {
                document.getElementById('staffSelect').value = staffId;
            }
            
            // 設定預設時間
            document.getElementById('startTime').value = '08:00';
            document.getElementById('endTime').value = '16:00';

            // 清空備註欄位（若存在）
            if (document.getElementById('shiftNotes')) {
                document.getElementById('shiftNotes').value = '';
            }
            // 移除編輯模式標記並將標題重設為「新增排班」。
            delete modal.dataset.editId;
            const titleEl = modal.querySelector('h3');
            if (titleEl) {
                    // Set modal title using translation for "新增排班"
                    titleEl.textContent = translate('新增排班');
            }
            // 根據目前模式調整提交按鈕文字為「新增排班」
            try {
                const submitBtn = form.querySelector('button[type="submit"]');
                if (submitBtn) {
                    // Use translated label for add shift button
                    submitBtn.textContent = translate('新增排班');
                }
            } catch (_e) {
                /* 若表單不存在按鈕則忽略 */
            }
            modal.classList.add('show');
        }

        function closeModal() {
            document.getElementById('shiftModal').classList.remove('show');
        }

        // 新增或編輯排班
        async function addShift() {
            // 僅允許管理員新增或編輯排班
            if (!ensureAdmin('新增或編輯排班')) {
                return;
            }
            // 如果已有排班提交正在進行，直接返回以避免重複動作
            if (shiftSubmitInProgress) {
                return;
            }
            // 設置旗標，表示正在處理新增/編輯排班
            shiftSubmitInProgress = true;
            const form = document.getElementById('shiftForm');
            const modal = document.getElementById('shiftModal');
            const editId = modal.dataset.editId;
            
            // 驗證必填欄位
            // 直接使用下拉選單的值，避免將字串 ID 轉成數字導致與實際人員資料型別不一致
            const staffId = document.getElementById('staffSelect').value;
            const date = document.getElementById('shiftDate').value;
            const startTime = document.getElementById('startTime').value;
            const endTime = document.getElementById('endTime').value;
            const type = document.getElementById('shiftType').value;

            if (!staffId || !date || !startTime || !endTime || !type) {
                // 必填欄位缺漏時使用 toast 提示錯誤。若 toast 未定義則回退至 alert。
                const msgRequired = translate('請填寫所有必填欄位！');
                try {
                    if (typeof window.showToast === 'function') {
                        window.showToast(msgRequired, 'error');
                    } else if (typeof showToast === 'function') {
                        showToast(msgRequired, 'error');
                    } else {
                        alert(msgRequired);
                    }
                } catch (_e) {
                    alert(msgRequired);
                }
                // 釋放提交鎖定，讓使用者可以再次嘗試
                shiftSubmitInProgress = false;
                return;
            }

            // 檢查是否已有相同人員在相同日期與開始時間的排班，避免重複建立
                const conflict = shifts.find(s =>
                // 排除正在編輯的排班
                (editId ? String(s.id) !== String(editId) : true) &&
                String(s.staffId) === String(staffId) &&
                s.date === date &&
                s.startTime === startTime
            );
            if (conflict) {
                const staffMember = findStaffById(staffId);
                // Compose a notification preserving the user's name and translating the suffix
                showNotification(`${staffMember.name} ${date} ${startTime} ${translate('已有排班，無法重複安排！')}`);
                // 釋放提交鎖定，以便使用者修正後可重新提交
                shiftSubmitInProgress = false;
                return;
            }
            
            const shiftData = {
                // 將 staffId 保持為字串型別，以確保與 staff 陣列中的 id 一致
                staffId: staffId,
                date: date,
                startTime: startTime,
                endTime: endTime,
                type: type,
                status: 'confirmed',
                notes: document.getElementById('shiftNotes') ? document.getElementById('shiftNotes').value : '',
                clinicId: getCurrentClinicId()
            };
            
            if (editId) {
                // 編輯模式
                const shiftIndex = shifts.findIndex(s => s.id == editId);
                if (shiftIndex !== -1) {
                    // 儲存編輯前的日期以便跨月份時刪除原資料
                    const originalShift = { ...shifts[shiftIndex] };
                    // 更新本地排班陣列
                    shifts[shiftIndex] = { ...shifts[shiftIndex], ...shiftData };
                    showNotification(translate('排班更新成功！'));
                    // 將更新後的排班寫入資料庫
                    await saveShiftToDb(shifts[shiftIndex]);
                    // 若日期跨月份則刪除原路徑的排班資料
                    try {
                        const oldKey = getMonthKey(originalShift.date);
                        const newKey = getMonthKey(shifts[shiftIndex].date);
                        if (oldKey !== newKey) {
                            await deleteShiftFromDb(originalShift);
                        }
                    } catch (_delErr) {
                        // 忽略刪除錯誤
                    }
                }
                delete modal.dataset.editId;
                // 恢復新增排班的標題
                modal.querySelector('h3').textContent = translate('新增排班');
            } else {
                // 新增模式
                const newShift = {
                    id: Date.now(),
                    ...shiftData
                };
                shifts.push(newShift);
                showNotification(translate('排班新增成功！'));
                // 寫入單筆排班資料
                await saveShiftToDb(newShift);
            }
            
            // 重置表單並關閉視窗
            form.reset();
            modal.classList.remove('show');
            
            // 更新顯示
            renderCalendar();
            updateStats();
            // 排班提交處理完成，延遲釋放鎖定避免緊接著的事件連續觸發
            setTimeout(() => {
                shiftSubmitInProgress = false;
            }, 0);
        }

        // 已移除同步至 Google Calendar 的功能
        // function syncToGoogle() {
        //     /* 此函式已停用。 */
        // }

        // 匯出 iCal
        function exportToICal() {
            let icalContent = [
                'BEGIN:VCALENDAR',
                'VERSION:2.0',
                'PRODID:-//醫療排班系統//排班行事曆//ZH',
                'CALSCALE:GREGORIAN'
            ];

            shifts.forEach(shift => {
                const staffMember = findStaffById(shift.staffId);
                // 計算跨日與 24:00 結束的班次
                let endDateStr = shift.date;
                let endTimeStr = shift.endTime;
                const startMinutes = parseTimeToMinutes(shift.startTime);
                let endMinutes = parseTimeToMinutes(shift.endTime);
                if (endMinutes <= startMinutes || endMinutes >= 24 * 60) {
                    const dateObj = new Date(shift.date);
                    dateObj.setDate(dateObj.getDate() + 1);
                    endDateStr = dateObj.toISOString().split('T')[0];
                    if (endMinutes >= 24 * 60) {
                        endTimeStr = '00:00';
                    }
                }
                const startDateTime = `${shift.date.replace(/-/g, '')}T${shift.startTime.replace(':', '')}00`;
                const endDateTime = `${endDateStr.replace(/-/g, '')}T${endTimeStr.replace(':', '')}00`;
                
                // Compose a description containing the shift type and notes.  Use the
                // translate helper to localise both the label and the shift type name.
                let descriptionLines = [];
                const shiftTypeName = translate(getShiftTypeName(shift.type));
                descriptionLines.push(`${translate('班別:')} ${shiftTypeName}`);
                if (shift.notes) {
                    descriptionLines.push(`${translate('備註:')} ${shift.notes}`);
                }
                const descriptionString = descriptionLines.join('\\n');

                // Retrieve the clinic address from local storage if available; otherwise
                // use a translated default ("醫院" -> "Hospital" in English).
                let location = translate('醫院');
                try {
                    const clinicSettings = JSON.parse(localStorage.getItem('clinicSettings') || '{}');
                    if (clinicSettings && clinicSettings.address) {
                        location = clinicSettings.address;
                    }
                } catch (_e) {
                    /* 如果解析失敗，保持預設地點 */
                }
                const roleLabel = staffMember.role === 'doctor' ? translate('醫師') : staffMember.role === 'nurse' ? translate('護理師') : '';
                icalContent.push(
                    'BEGIN:VEVENT',
                    `UID:${shift.id}@medical-schedule.com`,
                    `DTSTART:${startDateTime}`,
                    `DTEND:${endDateTime}`,
                    `SUMMARY:${staffMember.name} - ${roleLabel}${translate('排班')}`,
                    `DESCRIPTION:${descriptionString}`,
                    `LOCATION:${location}`,
                    'END:VEVENT'
                );
            });

            icalContent.push('END:VCALENDAR');

            // 創建下載連結
            const blob = new Blob([icalContent.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            // Set the filename using translated base name for iCal file. The translation
            // dictionary includes an entry for '醫療排班行事曆'.  We append the .ics
            // extension after translating so that the file name is localized when
            // downloading the calendar file.
            const baseName = translate('醫療排班行事曆');
            link.download = `${baseName}.ics`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            showNotification(translate('iCal 檔案已下載！'));
        }

        // 新增功能函數
        
        // 回到今天
        async function goToToday() {
            currentDate = new Date();
            updateCurrentDate();
            // 載入當月份的排班資料
            try {
                await loadShiftsFromDb();
            } catch (_e) {
                // 錯誤已在 loadShiftsFromDb 中處理
            }
            renderCalendar();
            updateStats();
        }

        // 應用篩選
        function applyFilters() {
            // The department filter has been removed from the UI.  Assign a blank
            // value here to ensure we always include all departments and to avoid
            // querying a missing element in the DOM.  Leaving it unset can
            // inadvertently retain an old filter value.
            currentFilters.department = '';

            // Continue retrieving the other filter values normally.  These
            // elements still exist in the UI, so it's safe to access them.
            currentFilters.role = document.getElementById('roleFilter').value;
            currentFilters.shiftType = document.getElementById('shiftTypeFilter').value;
            currentFilters.staffSearch = document.getElementById('staffSearch').value.toLowerCase();
            
            renderCalendar();
            updateStats();
        }

        // 檢查排班是否符合篩選條件
        function passesFilter(shift) {
            const staffMember = findStaffById(shift.staffId);

            // When the role filter is set to "self" we want to show only
            // the current user's own shifts.  The current user information
            // may be stored in several different global variables depending
            // on how authentication data is loaded.  Try each possible
            // location in turn to find a user object with an id.
            if (currentFilters.role === 'self') {
                let currentUser = null;
                try {
                    if (typeof currentUserData !== 'undefined' && currentUserData && currentUserData.id !== undefined) {
                        currentUser = currentUserData;
                    } else if (typeof window !== 'undefined' && window.currentUserData && window.currentUserData.id !== undefined) {
                        currentUser = window.currentUserData;
                    } else if (typeof window !== 'undefined' && window.currentUser && window.currentUser.id !== undefined) {
                        currentUser = window.currentUser;
                    }
                } catch (_e) {
                    // ignore errors when retrieving currentUser
                    currentUser = null;
                }
                const currentUserId = currentUser && currentUser.id;
                // If we cannot determine the current user's id or the shift
                // does not belong to the current user, exclude the shift.
                if (!currentUserId || String(shift.staffId) !== String(currentUserId)) return false;
            } else {
                // Do not filter by department.  The department filter has been
                // removed from the UI, so always allow all departments.  For
                // role filters like doctor or nurse, ensure the staff member's
                // role matches the selected value.
                if (currentFilters.role && staffMember.role !== currentFilters.role) return false;
            }

            // Apply remaining filters for shift type and staff name search.
            if (currentFilters.shiftType && shift.type !== currentFilters.shiftType) return false;
            if (currentFilters.staffSearch && !staffMember.name.toLowerCase().includes(currentFilters.staffSearch)) return false;

            return true;
        }

        // 更新統計資訊
        function updateStats() {
            // 統計功能已移除，保留函數以避免錯誤
        }




        // 清空所有排班
        async function clearAllShifts() {
            // 僅允許管理員清空排班
            if (!ensureAdmin('清空所有排班')) {
                return;
            }
            const confirmedClear = await showConfirmation(translate('確定要清空所有排班嗎？此操作無法復原。'), 'warning');
            if (confirmedClear) {
                // 清除目前月份的所有排班
                shifts = [];
                // 從資料庫移除當月節點
                try {
                    const monthKey = getMonthKey();
                    const monthRef = window.firebase.ref(window.firebase.rtdb, `scheduleShifts/${monthKey}`);
                    await window.firebase.remove(monthRef);
                } catch (_err) {
                    // 錯誤已在 firebase.remove 中記錄
                }
                renderCalendar();
                updateStats();
                showNotification(translate('所有排班已清空！'));
            }
        }

        // 編輯排班
        function editShift(shiftId) {
            // 僅允許管理員編輯排班
            if (!ensureAdmin('編輯排班')) {
                return;
            }
            const shift = shifts.find(s => s.id === shiftId);
            if (!shift) return;

            // 填入現有資料到表單
            document.getElementById('staffSelect').value = shift.staffId;
            document.getElementById('shiftDate').value = shift.date;
            document.getElementById('startTime').value = shift.startTime;
            document.getElementById('endTime').value = shift.endTime;
            document.getElementById('shiftType').value = shift.type;

            // 標記為編輯模式
            const modal = document.getElementById('shiftModal');
            modal.dataset.editId = shiftId;
            // Set modal header to translated 'Edit shift'
            modal.querySelector('h3').textContent = translate('編輯排班');
            // 根據目前模式調整提交按鈕文字為「編輯排班」
            try {
                const form = document.getElementById('shiftForm');
                const submitBtn = form ? form.querySelector('button[type="submit"]') : null;
                if (submitBtn) {
                    // Set submit button label to translated 'Edit shift'
                    submitBtn.textContent = translate('編輯排班');
                }
            } catch (_e) {
                /* 忽略錯誤 */
            }
            modal.classList.add('show');
        }

        // 刪除排班
        async function deleteShift(shiftId) {
            // 僅允許管理員刪除排班
            if (!ensureAdmin('刪除排班')) {
                return;
            }
            // 事件傳播在 handleDeleteShift 中處理，此函式僅執行刪除邏輯
            
            // 獲取排班資訊用於確認對話框
            const shift = shifts.find(s => s.id == shiftId);
            if (!shift) {
                    showNotification(translate('找不到要刪除的排班！'));
                return;
            }
            
            const staffMember = findStaffById(shift.staffId);
            const confirmMessage = translate('確定要刪除以下排班嗎？') + '\n\n' +
                                 translate('人員：') + `${staffMember.name}\n` +
                                 translate('日期：') + `${shift.date}\n` +
                                 translate('時間：') + `${shift.startTime} - ${shift.endTime}\n` +
                                 translate('備註：') + `${shift.notes || translate('無')}\n\n` +
                                 translate('此操作無法復原！');
            
            const confirmedDelShift = await showConfirmation(confirmMessage, 'warning');
            if (confirmedDelShift) {
                const shiftIndex = shifts.findIndex(s => s.id == shiftId);
                if (shiftIndex !== -1) {
                    // 儲存將要刪除的排班資訊，以便刪除資料庫
                    const delShift = { ...shifts[shiftIndex] };
                    // 從本地陣列移除
                    shifts.splice(shiftIndex, 1);
                    // 刪除資料庫中的排班
                    try {
                        await deleteShiftFromDb(delShift);
                    } catch (_err) {
                        // 錯誤已在 deleteShiftFromDb 中記錄
                    }
                    renderCalendar();
                    updateStats();
                    showNotification(translate('排班已刪除！'));
                } else {
                    showNotification(translate('刪除失敗：找不到排班資料！'));
                }
            }
        }

        // 顯示排班詳情
        async function showShiftDetails(shift) {
            const staffMember = findStaffById(shift.staffId);
            const duration = calculateShiftDuration(shift.startTime, shift.endTime);
            // 使用 SweetAlert2 顯示排班詳情。若 Swal 不存在則退回 alert。
            try {
                // 決定確定按鈕的標籤文字
                const langOk = (typeof localStorage !== 'undefined' && localStorage.getItem('lang')) || 'zh';
                const okLabel = langOk === 'en' ? 'OK' : '確定';
                // 使用 HTML 格式的字串展示排班詳情，替換換行為 <br/>
                const html =
                    `${translate('姓名：')}${staffMember.name}<br>` +
                    `${translate('職位：')}${staffMember.level}<br>` +
                    `${translate('日期：')}${shift.date}<br>` +
                    `${translate('時間：')}${shift.startTime} - ${shift.endTime} (${duration} ${translate('小時')})<br>` +
                    `${translate('備註：')}${shift.notes || translate('無')}<br>` +
                    `${translate('聯絡電話：')}${staffMember.phone}<br>` +
                    `${translate('電子郵件：')}${staffMember.email}`;
                await Swal.fire({
                    icon: 'info',
                    title: translate('排班詳情：'),
                    html: html,
                    confirmButtonText: okLabel
                });
            } catch (_err) {
                // 若 SweetAlert2 不可用則回退到 alert
                alert(`${translate('排班詳情：')}` + '\n' +
                    `${translate('姓名：')}${staffMember.name}` + '\n' +
                    `${translate('職位：')}${staffMember.level}` + '\n' +
                    `${translate('日期：')}${shift.date}` + '\n' +
                    `${translate('時間：')}${shift.startTime} - ${shift.endTime} (${duration} ${translate('小時')})` + '\n' +
                    `${translate('備註：')}${shift.notes || translate('無')}` + '\n' +
                    `${translate('聯絡電話：')}${staffMember.phone}` + '\n' +
                    `${translate('電子郵件：')}${staffMember.email}`);
            }
        }

        // 根據ID顯示排班詳情
        function showShiftDetailsById(shiftId) {
            const shift = shifts.find(s => s.id === shiftId);
            if (shift) {
                showShiftDetails(shift);
            }
        }

        // 列印功能已移除，故不再提供 printMonthlySchedule 與 generatePrintContent 函式

        // 獲取班別名稱
        function getShiftTypeName(type) {
            const types = {
                'morning': '早班',
                'afternoon': '中班',
                'night': '夜班',
                'emergency': '急診',
                'custom': '自訂'
            };
            return types[type] || type;
        }



        // 顯示通知
        /**
         * 顯示通知訊息的輔助函式。
         *
         * 這個函式會優先嘗試使用全域的 showToast（由 system.js 提供），
         * 讓訊息以 Toastr 的形式顯示。如果 showToast 不存在，則會退回
         * 到原本的 notification DOM 元素，最後如果連 DOM 也沒有，才會
         * 使用 alert 作為終極回退。可接受第二個參數 type 以指定訊息類型。
         * @param {string} message 要顯示的訊息
         * @param {string} [type='info'] 訊息類型，可為 'info'、'success'、'warning'、'error'
         */
        function showNotification(message, type = 'info') {
            try {
                // 優先使用全域 showToast（由 system.js 定義）。
                if (typeof window.showToast === 'function') {
                    window.showToast(message, type);
                    return;
                } else if (typeof showToast === 'function') {
                    // 若非在 window 上仍存在 showToast，則呼叫之
                    showToast(message, type);
                    return;
                }
            } catch (_e) {
                // 忽略錯誤，繼續回退
            }
            // 如果沒有 toast 功能，嘗試使用頁面上的 notification 元素顯示訊息
            const notification = document.getElementById('notification');
            if (notification) {
                notification.textContent = message;
                notification.classList.add('show');
                setTimeout(() => {
                    notification.classList.remove('show');
                }, 3000);
            } else {
                // 最後退回到 alert
                alert(message);
            }
        }

        // 固定排班功能
        
        // 開啟固定排班模態框
        function openFixedScheduleModal() {
            // 僅允許管理員建立固定排班
            if (!ensureAdmin('建立固定排班')) {
                return;
            }
            const modal = document.getElementById('fixedScheduleModal');
            const form = document.getElementById('fixedScheduleForm');
            
            // 重置表單
            form.reset();
            
            // 設定預設值
            document.getElementById('fixedShiftType').value = 'morning';
            document.getElementById('fixedStartTime').value = '08:00';
            document.getElementById('fixedEndTime').value = '16:00';
            document.getElementById('scheduleRange').value = 'current-month';
            // 清空備註欄位，預設不填入任何文字
            document.getElementById('fixedScheduleNotes').value = '';
            
            // 預設選擇週一到週五
            for (let i = 1; i <= 5; i++) {
                document.getElementById(`day${i}`).checked = true;
            }
            document.getElementById('day0').checked = false;
            document.getElementById('day6').checked = false;
            
            // 隱藏自訂時間和日期範圍
            document.getElementById('customTimeGroup').style.display = 'none';
            document.getElementById('customRangeGroup').style.display = 'none';
            
            modal.classList.add('show');
        }

        // 關閉固定排班模態框
        function closeFixedScheduleModal() {
            document.getElementById('fixedScheduleModal').classList.remove('show');
        }

        // 建立固定排班
        async function createFixedSchedule() {
            // 僅允許管理員建立固定排班
            if (!ensureAdmin('建立固定排班')) {
                return;
            }
            // 直接使用字串型別的 ID，避免因 parseInt 造成與 staff.id 之間的型別不一致
            const staffId = document.getElementById('fixedStaffSelect').value;
            const shiftType = document.getElementById('fixedShiftType').value;
            const scheduleRange = document.getElementById('scheduleRange').value;
            const notes = document.getElementById('fixedScheduleNotes').value;
            const replaceExisting = document.getElementById('replaceExisting').checked;
            
            // 獲取選擇的工作日
            const selectedDays = [];
            for (let i = 0; i < 7; i++) {
                if (document.getElementById(`day${i}`).checked) {
                    selectedDays.push(i);
                }
            }
            
            if (selectedDays.length === 0) {
                // 未選擇工作日時提示錯誤
                const msgNoDay = translate('請至少選擇一個工作日！');
                try {
                    if (typeof window.showToast === 'function') {
                        window.showToast(msgNoDay, 'error');
                    } else if (typeof showToast === 'function') {
                        showToast(msgNoDay, 'error');
                    } else {
                        alert(msgNoDay);
                    }
                } catch (_e) {
                    alert(msgNoDay);
                }
                return;
            }
            
            // 獲取時間
            let startTime, endTime;
            if (shiftType === 'custom') {
                startTime = document.getElementById('fixedStartTime').value;
                endTime = document.getElementById('fixedEndTime').value;
                if (!startTime || !endTime) {
                    // 自訂班別未填寫起迄時間，使用 toast 提示
                    const msgCustomTime = translate('請設定自訂時間！');
                    try {
                        if (typeof window.showToast === 'function') {
                            window.showToast(msgCustomTime, 'error');
                        } else if (typeof showToast === 'function') {
                            showToast(msgCustomTime, 'error');
                        } else {
                            alert(msgCustomTime);
                        }
                    } catch (_e) {
                        alert(msgCustomTime);
                    }
                    return;
                }
            } else {
                const timeMap = {
                    'morning': { start: '08:00', end: '16:00' },
                    // 將下午班的結束時間設為 00:00，表示跨日到隔天凌晨
                    'afternoon': { start: '16:00', end: '00:00' },
                    'night': { start: '00:00', end: '08:00' }
                };
                startTime = timeMap[shiftType].start;
                endTime = timeMap[shiftType].end;
            }
            
            // 獲取日期範圍
            let startDate, endDate;
            const today = new Date();
            
            switch (scheduleRange) {
                case 'current-month':
                    startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
                    endDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
                    break;
                case 'next-month':
                    startDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
                    endDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 2, 0);
                    break;
                case 'current-and-next':
                    startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
                    endDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 2, 0);
                    break;
                case 'custom-range':
                    const startDateStr = document.getElementById('rangeStartDate').value;
                    const endDateStr = document.getElementById('rangeEndDate').value;
                    if (!startDateStr || !endDateStr) {
                        // 自訂日期範圍未填寫時提示錯誤
                        const msgRange = translate('請設定自訂日期範圍！');
                        try {
                            if (typeof window.showToast === 'function') {
                                window.showToast(msgRange, 'error');
                            } else if (typeof showToast === 'function') {
                                showToast(msgRange, 'error');
                            } else {
                                alert(msgRange);
                            }
                        } catch (_e) {
                            alert(msgRange);
                        }
                        return;
                    }
                    startDate = new Date(startDateStr);
                    endDate = new Date(endDateStr);
                    break;
            }
            
            // 生成排班並立即同步至資料庫
            // 使用當前時間戳作為起始 ID，後續自增；不將 ID 轉為數字
            let shiftIdCounter = Date.now();
            let addedCount = 0;
            let replacedCount = 0;

            for (let dt = new Date(startDate); dt <= endDate; dt.setDate(dt.getDate() + 1)) {
                const dayOfWeek = dt.getDay();
                if (selectedDays.includes(dayOfWeek)) {
                    const dateStr = formatDate(dt);
                    // 檢查是否已有排班（使用字串比對人員 ID）
                    const existingShiftIndex = shifts.findIndex(s =>
                        String(s.staffId) === String(staffId) && s.date === dateStr
                    );
                    if (existingShiftIndex !== -1) {
                        if (replaceExisting) {
                            // 替換現有排班：更新本地資料並寫入資料庫
                            shifts[existingShiftIndex] = {
                                ...shifts[existingShiftIndex],
                                startTime: startTime,
                                endTime: endTime,
                                type: shiftType,
                                notes: notes
                            };
                            replacedCount++;
                            try {
                                await saveShiftToDb(shifts[existingShiftIndex]);
                            } catch (_err) {
                                // 保存單筆排班錯誤在 saveShiftToDb 中已處理
                            }
                        }
                        // 如果不替換，跳過這一天
                    } else {
                        // 新增排班：推到本地陣列並寫入資料庫
                        const newShift = {
                            id: shiftIdCounter++,
                            staffId: staffId,
                            date: dateStr,
                            startTime: startTime,
                            endTime: endTime,
                            type: shiftType,
                            status: 'confirmed',
                            notes: notes
                        };
                        shifts.push(newShift);
                        addedCount++;
                        try {
                            await saveShiftToDb(newShift);
                        } catch (_err) {
                            // 保存單筆排班錯誤在 saveShiftToDb 中已處理
                        }
                    }
                }
            }

            // 資料寫入完成後，重新渲染當前月份行事曆並更新統計
            renderCalendar();
            updateStats();
            closeFixedScheduleModal();

            // 顯示結果
            const staffMember = findStaffById(staffId);
            // Compose a detailed fixed schedule message (unused currently)
            let message = `${translate('固定排班建立完成！')}\n\n`;
            message += `${translate('人員：')}${staffMember.name}\n`;
            message += `${translate('新增排班：')}${addedCount} ${translate('天')}\n`;
            if (replacedCount > 0) {
                message += `${translate('替換排班：')}${replacedCount} ${translate('天')}\n`;
            }
            message += `${translate('時間：')}${startTime} - ${endTime}\n`;
            // Convert day indices to translated labels
            message += `${translate('工作日：')}${selectedDays.map(d => translate(['日','一','二','三','四','五','六'][d])).join('、')}`;

            // Show a notification summarizing the fixed schedule creation
            showNotification(`${translate('已為')} ${staffMember.name} ${translate('建立固定排班')}！${translate('新增')} ${addedCount} ${translate('天')}${replacedCount > 0 ? `${translate('，替換')} ${replacedCount} ${translate('天')}` : ''}${translate('。')}`);
        }

        // 點擊模態框外部關閉
        document.getElementById('shiftModal').addEventListener('click', function(e) {
            if (e.target === this) {
                closeModal();
            }
        });

        // 點擊固定排班模態框外部關閉
        document.getElementById('fixedScheduleModal').addEventListener('click', function(e) {
            if (e.target === this) {
                closeFixedScheduleModal();
            }
        });

        // 人員篩選功能
        function filterStaff(filter) {
            currentStaffFilter = filter;
            
            // 更新按鈕狀態
            document.querySelectorAll('.staff-filter-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            event.target.classList.add('active');
            
            // 重新渲染人員面板
            renderStaffPanel();
        }

        // 查看人員排班
        async function viewStaffSchedule(staffId) {
            const staffMember = findStaffById(staffId);
            const staffShifts = shifts.filter(s => String(s.staffId) === String(staffId))
                .sort((a, b) => new Date(a.date) - new Date(b.date));
            
            if (staffShifts.length === 0) {
                // 若沒有排班記錄則使用 toast 提示。若 toast 不存在則回退至 alert。
                const noScheduleMsg = `${staffMember.name} ${translate('目前沒有排班記錄。')}`;
                try {
                    if (typeof window.showToast === 'function') {
                        window.showToast(noScheduleMsg, 'info');
                    } else if (typeof showToast === 'function') {
                        showToast(noScheduleMsg, 'info');
                    } else {
                        alert(noScheduleMsg);
                    }
                } catch (_e) {
                    alert(noScheduleMsg);
                }
                return;
            }
            
            let scheduleText = `${staffMember.name} ${translate('的排班記錄：')}\n\n`;
            // Determine the current language to format dates properly.  When the
            // language is English we use 'en-US', otherwise fall back to
            // traditional Chinese locale.
            const lang = (typeof localStorage !== 'undefined' && localStorage.getItem('lang')) || 'zh';
            staffShifts.forEach(shift => {
                const dateObj = new Date(shift.date);
                const formattedDate = dateObj.toLocaleDateString(lang === 'en' ? 'en-US' : 'zh-TW');
                const duration = calculateShiftDuration(shift.startTime, shift.endTime);
                // Translate the shift type name before inserting it into the
                // schedule text.  This ensures names like "早班" or "夜班"
                // are shown as "Morning" and "Night" in English.
                const shiftTypeName = translate(getShiftTypeName(shift.type));
                scheduleText += `📅 ${formattedDate} ${shift.startTime}-${shift.endTime} (${duration}h) - ${shiftTypeName}\n`;
                if (shift.notes) scheduleText += `   ${translate('備註:')} ${shift.notes}\n`;
            });
            // 使用 SweetAlert2 顯示排班記錄；若 SweetAlert2 不可用則回退 alert
            try {
                const langOk = (typeof localStorage !== 'undefined' && localStorage.getItem('lang')) || 'zh';
                const okLabel = langOk === 'en' ? 'OK' : '確定';
                const scheduleHtml = scheduleText.replace(/\n/g, '<br/>');
                await Swal.fire({
                    icon: 'info',
                    html: scheduleHtml,
                    confirmButtonText: okLabel
                });
            } catch (_err) {
                alert(scheduleText);
            }
        }

        // 聯絡人員
        async function contactStaff(staffId) {
            const staffMember = findStaffById(staffId);
            // Build contact information using translated labels while preserving icons and data.
            const contactInfo = `${translate('聯絡')} ${staffMember.name}:\n\n` +
                              `📞 ${translate('電話:')} ${staffMember.phone}\n` +
                              `📧 ${translate('信箱:')} ${staffMember.email}\n` +
                              `🏥 ${translate('部門:')} ${staffMember.department}\n` +
                              `👔 ${translate('職位:')} ${staffMember.level}`;
            
            // 使用 SweetAlert2 確認是否撥打電話。使用 showConfirmation（由 system.js 提供）提示使用者。
            const confirmedCall = await showConfirmation(contactInfo + '\n\n' + translate('要撥打電話嗎？'), 'question');
            if (confirmedCall) {
                // 在實際應用中，這裡可以整合電話系統
                window.open(`tel:${staffMember.phone}`, '_blank', 'noopener,noreferrer');
            }
        }

        // 列印當前月份排班表
        // 使用 currentDate 決定月份，並考慮目前篩選條件。
        function printCurrentMonthSchedule() {
            try {
                const year = currentDate.getFullYear();
                const month = currentDate.getMonth();
                const lastDay = new Date(year, month + 1, 0).getDate();
                // Chinese weekday symbols; use translate() for English names
                const weekdays = ['日','一','二','三','四','五','六'];
                // Determine current language for localisation
                const lang = (typeof localStorage !== 'undefined' && localStorage.getItem('lang')) || 'zh';
                // Start HTML document.  The lang attribute reflects the current language.
                let html = '<!DOCTYPE html><html lang="' + (lang === 'zh' ? 'zh-TW' : 'en') + '"><head><meta charset="UTF-8"><title>' + translate('排班表') + '</title>';
                html += '<style>';
                html += 'body{font-family:\'Noto Sans TC\',sans-serif;padding:20px;}';
                html += 'h2{text-align:center;margin:0 0 20px;font-size:20px;}';
                html += 'table{width:100%;border-collapse:collapse;margin-top:10px;}';
                html += 'th,td{border:1px solid #ccc;padding:6px;vertical-align:top;font-size:14px;}';
                html += 'th{background:#f3f4f6;font-weight:600;}';
                html += 'ul{margin:0;padding-left:20px;}';
                html += 'li{margin-bottom:4px;line-height:1.4;}';
                html += 'em{color:#6b7280;}';
                html += '</style></head><body>';
                // Generate the title differently based on language.  In English we
                // use a hyphenated format (e.g. "Shift schedule - 2025/05"),
                // whereas in Chinese we retain the original format.
                let title;
                if (lang === 'en') {
                    // Use zero‑padded month for consistency
                    const mm = String(month + 1).padStart(2, '0');
                    const clinicName = getCurrentClinicName();
                    title = translate('排班表') + ' - ' + year + '/' + mm + (clinicName ? ' - ' + translate('診所') + ': ' + clinicName : '');
                } else {
                    const clinicName = getCurrentClinicName();
                    title = year + ' 年 ' + (month + 1) + ' 月' + translate('排班表') + (clinicName ? '（' + translate('診所') + '：' + clinicName + '）' : '');
                }
                html += '<h2>' + title + '</h2>';
                // Table header: translate the headings
                html += '<table><thead><tr><th style="width:120px;">' + translate('日期') + '</th><th>' + translate('排班') + '</th></tr></thead><tbody>';
                // Generate each day's row
                for (let day = 1; day <= lastDay; day++) {
                    const dateObj = new Date(year, month, day);
                    const dateStr = formatDate(dateObj);
                    const dayShifts = shifts.filter(s => s.date === dateStr && passesFilter(s));
                    let cellContent;
                    if (dayShifts.length === 0) {
                        // Use translation for "No shifts" when printing the schedule
                        cellContent = `<em>${translate('無排班')}</em>`;
                    } else {
                        dayShifts.sort((a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime));
                        cellContent = '<ul>';
                        dayShifts.forEach(shift => {
                            const staffMember = findStaffById(shift.staffId);
                            const duration = calculateShiftDuration(shift.startTime, shift.endTime);
                            // Translate the shift type name for the printed schedule.  Without
                            // translation the names would remain in Chinese even when
                            // printing in English.
                            const typeName = translate(getShiftTypeName(shift.type));
                            let info = staffMember.name;
                            if (staffMember.level) info += ' ' + staffMember.level;
                            info += ' ' + shift.startTime + '-' + shift.endTime + ' (' + duration + 'h)';
                            info += ' - ' + typeName;
                            if (shift.notes) info += ' - ' + shift.notes;
                            cellContent += '<li>' + info + '</li>';
                        });
                        cellContent += '</ul>';
                    }
                    // Determine the weekday name based on current language
                    const weekdayCh = weekdays[dateObj.getDay()];
                    const weekdayName = translate(weekdayCh);
                    let displayDate;
                    if (lang === 'en') {
                        // Format as mm/dd (Weekday)
                        const mm = String(month + 1).padStart(2, '0');
                        const dd = String(day).padStart(2, '0');
                        displayDate = mm + '/' + dd + ' (' + weekdayName + ')';
                    } else {
                        displayDate = (month + 1) + '月' + day + '日 (' + weekdayCh + ')';
                    }
                    html += '<tr><td>' + displayDate + '</td><td>' + cellContent + '</td></tr>';
                }
                html += '</tbody></table></body></html>';
                const printWin = window.open('', '_blank');
                if (printWin) {
                    printWin.document.open();
                    printWin.document.write(html);
                    printWin.document.close();
                    printWin.focus();
                    setTimeout(() => {
                        try { printWin.print(); } catch (_) {} finally { printWin.close(); }
                    }, 300);
                } else {
                    // 使用 Toast 提示無法開啟列印視窗的錯誤；若無 toast 則回退 alert
                    const unableMsg = translate('無法開啟列印視窗，請檢查瀏覽器設定。');
                    try {
                        if (typeof window.showToast === 'function') {
                            window.showToast(unableMsg, 'error');
                        } else if (typeof showToast === 'function') {
                            showToast(unableMsg, 'error');
                        } else {
                            alert(unableMsg);
                        }
                    } catch (_e) {
                        alert(unableMsg);
                    }
                }
            } catch (err) {
                console.error('printCurrentMonthSchedule error', err);
                // 於列印排班表錯誤時使用 Toast 通知；若無 toast 則回退 alert
                const errMsg = translate('列印排班表時發生錯誤！');
                try {
                    if (typeof window.showToast === 'function') {
                        window.showToast(errMsg, 'error');
                    } else if (typeof showToast === 'function') {
                        showToast(errMsg, 'error');
                    } else {
                        alert(errMsg);
                    }
                } catch (_e) {
                    alert(errMsg);
                }
            }
        }

// Expose functions to global schedule namespace
  window.scheduleNavigateCalendar = navigateCalendar;
  window.scheduleGoToToday = goToToday;
  // 已移除同步 Google 功能，不再暴露 scheduleSyncToGoogle
  // window.scheduleSyncToGoogle = undefined;
  window.scheduleExportToICal = exportToICal;
  // 列印功能：暴露 schedulePrintShiftTable 以列印當前月份的排班表
  window.scheduleApplyFilters = applyFilters;
  window.scheduleOpenFixedScheduleModal = openFixedScheduleModal;
  window.scheduleCloseFixedScheduleModal = closeFixedScheduleModal;
  window.scheduleCreateFixedSchedule = createFixedSchedule;
  // 已移除檢查衝突功能：不再將 checkConflicts 暴露至全域
  window.scheduleClearAllShifts = clearAllShifts;
  window.scheduleOpenShiftModal = openShiftModal;
  window.scheduleCloseModal = closeModal;
  window.scheduleAddShift = addShift;
  window.scheduleFilterStaff = filterStaff;
  window.scheduleEditShift = editShift;
  window.scheduleDeleteShift = deleteShift;
  window.scheduleQuickAddShiftFromDrag = quickAddShiftFromDrag;
  window.scheduleContactStaff = contactStaff;
  window.scheduleViewStaffSchedule = viewStaffSchedule;
  window.scheduleShowShiftDetails = showShiftDetails;
  window.scheduleShowShiftDetailsById = showShiftDetailsById;
  window.scheduleUpdateStats = updateStats;
  if (typeof window.scheduleReloadForClinic !== 'function') {
    window.scheduleReloadForClinic = async function () {
      try {
        await loadShiftsFromDb();
        renderCalendar();
        renderStaffPanel();
        updateStats();
      } catch (e) {
        console.warn('scheduleReloadForClinic error', e);
      }
    };
  }

  // 列印當月排班表函式
  window.schedulePrintShiftTable = printCurrentMonthSchedule;

  /**
   * 根據當前登入使用者的權限動態調整排班管理介面的顯示項目。
   * 管理員會看到固定上班與清空排班按鈕，以及拖拽提示文字；
   * 非管理員則隱藏這些元素。此函式可安全重複調用，每次調用都會
   * 重新檢查使用者身份並更新對應的 UI。
   */
  if (typeof window.scheduleUpdateAdminUI !== 'function') {
    window.scheduleUpdateAdminUI = function () {
      try {
        const isAdmin = window.isAdminUser && window.isAdminUser();
        const qaEl = document.getElementById('quickActions');
        const dragEl = document.getElementById('dragInstruction');
        // 如果元素存在，根據 isAdmin 動態設置 display 屬性。使用明確的
        // display 值來確保在不同瀏覽器和樣式設定下正確顯示。
        if (qaEl) {
          if (isAdmin) {
            // 管理員：恢復預設顯示，確保按鈕可見
            qaEl.style.display = '';
            if (qaEl.classList) qaEl.classList.remove('hidden');
          } else {
            // 非管理員：隱藏快速操作區塊
            qaEl.style.display = 'none';
            if (qaEl.classList) qaEl.classList.add('hidden');
          }
        }
        if (dragEl) {
          if (isAdmin) {
            dragEl.style.display = '';
            if (dragEl.classList) dragEl.classList.remove('hidden');
          } else {
            dragEl.style.display = 'none';
            if (dragEl.classList) dragEl.classList.add('hidden');
          }
        }
      } catch (err) {
        // 若遇到錯誤，僅在控制台記錄，不影響其他功能
        console.warn('scheduleUpdateAdminUI error', err);
      }
    };
  }

  // ----------------------------------------------------------------------
  // Inline event handler wrappers
  //
  // schedule_management.js 為行事曆排班系統暴露了一組以 schedule* 為前綴的 API，
  // 其中包含編輯與刪除排班的函式。排班項目的 HTML 標記使用了 onclick="handleEditShift(...)"
  // 與 onclick="handleDeleteShift(...)" 等 inline 事件。在某些佈署環境中，
  // 這些包裝函式是由 system.html 內嵌腳本提供的。但當我們停用舊有腳本時，
  // handleEditShift / handleDeleteShift 可能不存在。
  // 為了保證排班項目按鈕可以正常工作，我們在此為 window 物件提供後備實作。

  if (typeof window.handleEditShift !== 'function') {
    window.handleEditShift = function (e, shiftId) {
      // 停止事件向上冒泡，以免點擊事件被父元素捕獲
      if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
      // 調用 scheduleEditShift 以開啟編輯介面
      if (typeof window.scheduleEditShift === 'function') {
        window.scheduleEditShift(shiftId);
      }
    };
  }
  if (typeof window.handleDeleteShift !== 'function') {
    window.handleDeleteShift = function (e, shiftId) {
      // 停止事件冒泡並阻止預設行為（例如點擊後跳轉）
      if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      // 調用 scheduleDeleteShift 以刪除排班
      if (typeof window.scheduleDeleteShift === 'function') {
        window.scheduleDeleteShift(shiftId);
      }
    };
  }

  // 公眾假期選擇函式暴露至全域，供 HTML 選單呼叫
  window.scheduleChangeHolidayRegion = changeHolidayRegion;

// 延遲初始化排班系統：
// 將初始化邏輯封裝為函式，僅當用戶登入並進入排班管理區塊時才呼叫。
// 調整邏輯：即使已初始化過，仍會執行 UI 權限調整，使管理員按鈕可在登入後正確顯示。
if (typeof window.initializeScheduleManagement !== 'function') {
  window.initializeScheduleManagement = async function() {
    // 判斷是否第一次初始化，用於執行一次性的重度操作
    const isFirstInit = !window.scheduleInitialized;
    if (isFirstInit) {
      window.scheduleInitialized = true;
    }
    try {
      // 僅在第一次初始化時載入資料及渲染畫面
      if (isFirstInit) {
        // 更新當前日期顯示
        if (typeof updateCurrentDate === 'function') updateCurrentDate();
        // 設定事件監聽器
        if (typeof setupEventListeners === 'function') setupEventListeners();
        // 載入診所人員（使用本地用戶資料）
        if (typeof loadClinicStaff === 'function') {
          await loadClinicStaff();
        }
        // 從資料庫讀取排班資料
        if (typeof loadShiftsFromDb === 'function') {
          await loadShiftsFromDb();
        }
        // 渲染行事曆與人員面板
        if (typeof renderCalendar === 'function') renderCalendar();
        if (typeof renderStaffPanel === 'function') renderStaffPanel();
        if (typeof updateStaffSelects === 'function') updateStaffSelects();
        // 更新統計資訊
        if (typeof updateStats === 'function') updateStats();
      }
      // 每次進入排班頁面時都更新按鈕的顯示狀態，以反映當前使用者權限
      if (typeof window.scheduleUpdateAdminUI === 'function') {
        try {
          window.scheduleUpdateAdminUI();
        } catch (uiErr) {
          console.warn('Failed to update admin UI on initialize', uiErr);
        }
      }
    } catch (e) {
      console.error('Schedule init error', e);
    }
  };
}
})();
