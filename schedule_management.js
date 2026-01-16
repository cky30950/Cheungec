(function() {

        let currentDate = new Date();
        let currentView = 'month';
        let draggedShift = null;
        let currentStaffFilter = 'all';
        
        let selectedHolidayRegion = '';

        
        
        
        
        
        
        
        
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

        

        
        let shiftModalOpening = false;
        
        let shiftSubmitInProgress = false;

        
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

        

        
        function getHolidayForDate(date) {
            
            if (!selectedHolidayRegion) return null;
            const dateStr = formatDate(date);
            
            const mmdd = dateStr.slice(5);
            let list = [];
            if (selectedHolidayRegion === 'hk') {
                list = hkHolidays2025;
            } else if (selectedHolidayRegion === 'us') {
                list = usHolidays2025;
            }
            
            const match = list.find(h => {
                
                return h.date.slice(5) === mmdd;
            });
            if (match) {
                
                return { date: dateStr, name: match.name };
            }
            return null;
        }

        
        function changeHolidayRegion(region) {
            selectedHolidayRegion = region || '';
            
            if (typeof renderCalendar === 'function') {
                renderCalendar();
            }
        }
        
        
        
        
        
        let staff = [];
        
        window.staff = staff;

        
        
        
        
        if (typeof window.isAdminUser !== 'function') {
            window.isAdminUser = function () {
                try {
                    
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
                    
                    
                    try {
                        const claims = window.currentUserClaims || {};
                        const claimRole = (claims.role || claims.Role || '').toString().toLowerCase();
                        if (claimRole === 'admin') {
                            return true;
                        }
                    } catch (_claimErr) {
                        
                    }
                    
                    const userRole = (user.role || '').toString().toLowerCase();
                    if (userRole === 'admin') {
                        return true;
                    }
                    
                    const pos = (user.position || '').toString().trim();
                    if (pos && (pos === '診所管理' || pos.includes('管理'))) {
                        return true;
                    }
                    
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

        
        function ensureAdmin(operationName = null) {
            
            if (!window.isAdminUser || !window.isAdminUser()) {
                
                const opName = operationName || '此操作';
                const opText = translate(opName);
                
                showNotification(translate('只有管理員才能執行') + opText + translate('！'));
                return false;
            }
            return true;
        }

        
        function parseTimeToMinutes(timeStr) {
            if (!timeStr) return 0;
            const parts = timeStr.split(':');
            const hh = parseInt(parts[0], 10);
            const mm = parseInt(parts[1], 10) || 0;
            
            if (!isNaN(hh) && hh >= 24) {
                return 24 * 60 + (isNaN(mm) ? 0 : mm);
            }
            const hours = isNaN(hh) ? 0 : hh;
            const minutes = isNaN(mm) ? 0 : mm;
            return hours * 60 + minutes;
        }

        
        function findStaffById(id) {
            
            const member = staff.find(s => String(s.id) === String(id));
            if (member) return member;
            
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

        
        async function loadClinicStaff() {
            try {
                let usersList = [];
                
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
                
                if (usersList.length === 0) {
                    if (window.usersFromFirebase && Array.isArray(window.usersFromFirebase) && window.usersFromFirebase.length > 0) {
                        usersList = window.usersFromFirebase;
                    } else if (window.users && Array.isArray(window.users) && window.users.length > 0) {
                        usersList = window.users;
                    }
                }
                
                
                staff.splice(0, staff.length);
                usersList.forEach(u => {
                    
                    if (u.position === '醫師' || u.position === '護理師') {
                        staff.push({
                            id: u.id,
                            name: u.name || '',
                            role: u.position === '醫師' ? 'doctor' : 'nurse',
                            
                            department: u.department || '',
                            
                            level: u.position || '',
                            phone: u.phone || '',
                            email: u.email || '',
                            
                            maxHours: typeof u.maxHours === 'number' ? u.maxHours : 40
                        });
                    }
                });
                
                
                
                window.staff = staff;
            } catch (err) {
                console.error('載入診所用戶時發生錯誤：', err);
                
                staff.splice(0, staff.length);
                
                window.staff = staff;
            }
        }

        
        
        
        let shifts = [];

        
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
                
                const { id, ...data } = shift || {};
                const clinicId = shift && shift.clinicId ? String(shift.clinicId) : getCurrentClinicId();
                const path = `clinics/${clinicId}/scheduleShifts/${monthKey}/${id}`;
                const refPath = window.firebase.ref(window.firebase.rtdb, path);
                await window.firebase.set(refPath, data);
            } catch (e) {
                console.error('保存單筆排班資料失敗:', e);
            }
        }

        
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

        
        async function loadShiftsFromDb() {
            try {
                
                if (typeof waitForFirebaseDb === 'function') {
                    try {
                        await waitForFirebaseDb();
                    } catch (e) {
                        
                    }
                } else {
                    
                    for (let i = 0; i < 50 && (!window.firebase || !window.firebase.rtdb); i++) {
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                }
                if (!window.firebase || !window.firebase.rtdb) {
                    console.warn('Firebase Realtime Database 尚未準備就緒，無法載入排班資料');
                    return;
                }
                
                const monthKey = getMonthKey();
                const clinicId = getCurrentClinicId();
                const monthRef = window.firebase.ref(window.firebase.rtdb, `clinics/${clinicId}/scheduleShifts/${monthKey}`);
                const snapshot = await window.firebase.get(monthRef);
                const data = snapshot && snapshot.exists() ? snapshot.val() : null;
                
                shifts.splice(0, shifts.length);
                if (data) {
                    Object.keys(data).forEach(idKey => {
                        const shiftObj = data[idKey] || {};
                        
                        shifts.push({ id: isNaN(Number(idKey)) ? idKey : Number(idKey), ...shiftObj });
                    });
                }
            } catch (err) {
                
                try {
                    if (err && err.message && String(err.message).toLowerCase().includes('permission')) {
                        if (typeof showNotification === 'function') {
                            
                            showNotification(translate('您沒有權限讀取排班資料，如需存取請聯繫管理員'), 'error');
                        }
                    }
                } catch (_notifyErr) {
                    
                }
                console.error('載入排班資料失敗:', err);
            }
        }

        
        async function saveShiftsToDb() {
            try {
                if (typeof waitForFirebaseDb === 'function') {
                    try {
                        await waitForFirebaseDb();
                    } catch (e) {
                        
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
                
                for (const shift of shifts) {
                    await saveShiftToDb(shift);
                }
            } catch (err) {
                console.error('保存排班資料失敗:', err);
            }
        }
        
        
        function initializeSampleShifts() {
            const today = new Date();
            const currentMonth = today.getMonth();
            const currentYear = today.getFullYear();
            
            
            const baseDate = 26; 
            
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

        
        let currentFilters = {
            department: '',
            role: '',
            shiftType: '',
            staffSearch: ''
        };

        
        
        
        function handleEditShift(e, shiftId) {
            if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
            
            if (typeof window.scheduleEditShift === 'function') {
                window.scheduleEditShift(shiftId);
            } else if (typeof editShift === 'function') {
                
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

        
        if (typeof window !== 'undefined') {
            window.handleEditShift = handleEditShift;
            window.handleDeleteShift = handleDeleteShift;
        }

        
        
        

        
        function setupEventListeners() {
            
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
                        
                        endTime.value = '00:00';
                        break;
                    case 'night':
                        startTime.value = '00:00';
                        endTime.value = '08:00';
                        break;
                }
            });

            
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
                            
                            endTime.value = '00:00';
                            break;
                        case 'night':
                            startTime.value = '00:00';
                            endTime.value = '08:00';
                            break;
                    }
                }
            });

            
            document.getElementById('scheduleRange').addEventListener('change', function() {
                const customRangeGroup = document.getElementById('customRangeGroup');
                if (this.value === 'custom-range') {
                    customRangeGroup.style.display = 'block';
                } else {
                    customRangeGroup.style.display = 'none';
                }
            });

            
            document.getElementById('shiftForm').addEventListener('submit', function(e) {
                e.preventDefault();
                addShift();
            });

            
            document.getElementById('fixedScheduleForm').addEventListener('submit', function(e) {
                e.preventDefault();
                createFixedSchedule();
            });
        }

        
        function updateCurrentDate() {
            const options = { year: 'numeric', month: 'long' };
            document.getElementById('currentDate').textContent = currentDate.toLocaleDateString('zh-TW', options);
        }

        
        async function navigateCalendar(direction) {
            
            currentDate.setMonth(currentDate.getMonth() + direction);
            updateCurrentDate();
            
            try {
                await loadShiftsFromDb();
            } catch (_e) {
                
            }
            renderCalendar();
        }

        
        function changeView(view) {
            
            currentView = 'month';
            updateCurrentDate();
            renderCalendar();
        }

        
        function renderCalendar() {
            const grid = document.getElementById('calendarGrid');
            grid.innerHTML = '';
            grid.className = 'calendar-grid month-view';
            renderMonthView(grid);
        }

        
        function renderMonthView(grid) {
            
            const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
            weekdays.forEach(day => {
                const header = document.createElement('div');
                header.className = 'calendar-header';
                header.textContent = day;
                grid.appendChild(header);
            });

            
            const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
            const lastDay = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
            const startDate = new Date(firstDay);
            startDate.setDate(startDate.getDate() - firstDay.getDay());

            
            for (let i = 0; i < 42; i++) {
                const cellDate = new Date(startDate);
                cellDate.setDate(startDate.getDate() + i);
                
                const cell = document.createElement('div');
                cell.className = 'calendar-cell';
                
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

                
                const holidayInfo = getHolidayForDate(cellDate);
                if (holidayInfo) {
                    cell.classList.add('holiday');
                    const holidayLabel = document.createElement('div');
                    holidayLabel.className = 'holiday-label';
                    holidayLabel.textContent = holidayInfo.name;
                    cell.appendChild(holidayLabel);
                }

                
                const dayShifts = getShiftsForDate(cellDate).filter(passesFilter);
                dayShifts.forEach(shift => {
                    const shiftElement = createShiftElement(shift);
                    cell.appendChild(shiftElement);
                });

                
                setupCellDropZone(cell);
                
                grid.appendChild(cell);
            }
        }



        
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
            
            
            
            
            
            
            
            
            
            
            
            
            
            const positionLabel = staffMember.level || translate(staffMember.role === 'doctor' ? '醫師' : staffMember.role === 'nurse' ? '護理師' : '');
            
            const isAdmin = typeof window.isAdminUser === 'function' && window.isAdminUser();
            
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

            
            element.addEventListener('dragstart', function(e) {
                draggedShift = shift;
                this.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            });

            element.addEventListener('dragend', function() {
                this.classList.remove('dragging');
                draggedShift = null;
            });

            
            element.addEventListener('click', function(e) {
                if (!e.target.classList.contains('shift-action-btn')) {
                    showShiftDetails(shift);
                }
            });

            return element;
        }

        
        function calculateShiftDuration(startTime, endTime) {
            
            const startMinutes = parseTimeToMinutes(startTime);
            let endMinutes = parseTimeToMinutes(endTime);
            let duration = endMinutes - startMinutes;
            
            if (duration < 0) {
                duration += 24 * 60;
            }
            
            return Math.round((duration / 60) * 10) / 10;
        }

        
        function setupCellDropZone(cell) {
            cell.addEventListener('dragover', function(e) {
                e.preventDefault();
                
                
                const staffId = e.dataTransfer.getData('text/plain');
                if (staffId) {
                    e.dataTransfer.dropEffect = 'copy';
                } else if (draggedShift) {
                    e.dataTransfer.dropEffect = 'move';
                }
                
                this.classList.add('drop-zone');
            });

            cell.addEventListener('dragleave', function(e) {
                
                if (!this.contains(e.relatedTarget)) {
                    this.classList.remove('drop-zone');
                }
            });

            cell.addEventListener('drop', async function(e) {
                e.preventDefault();
                this.classList.remove('drop-zone');
                
                if (!ensureAdmin('新增或移動排班')) {
                    return;
                }
                const staffId = e.dataTransfer.getData('text/plain');
                
                if (staffId) {
                    
                    const staffMember = findStaffById(staffId);
                    if (staffMember) {
                        quickAddShiftFromDrag(staffMember, this.dataset.date);
                    }
                } else if (draggedShift) {
                    
                    const newDate = this.dataset.date;
                    
                    const oldDate = draggedShift.date;
                    
                    draggedShift.date = newDate;
                    
                    try {
                        await saveShiftToDb(draggedShift);
                        
                        const oldKey = getMonthKey(oldDate);
                        const newKey = getMonthKey(newDate);
                        if (oldKey !== newKey) {
                            await deleteShiftFromDb({ id: draggedShift.id, date: oldDate });
                        }
                    } catch (_err) {
                        
                    }
                    
                    renderCalendar();
                    updateStats();
                    showNotification(translate('排班已成功移動！'));
                }
            });

            
            cell.addEventListener('click', function(e) {
                
                if (!e.target.closest('.shift-item')) {
                    openShiftModal(this.dataset.date);
                }
            });
        }

        
        async function quickAddShiftFromDrag(staffMember, date, hour) {
            
            if (!ensureAdmin('新增排班')) {
                return;
            }
            
            const startTime = '08:00';
            const endTime = '16:00';
            const shiftType = 'morning';
            
            
            const existingShift = shifts.find(s =>
                String(s.staffId) === String(staffMember.id) &&
                s.date === date &&
                s.startTime === startTime
            );
            
            if (existingShift) {
                
                showNotification(`${staffMember.name} ${translate('在該時段已有排班！')}`);
                return;
            }
            
            
            const newShift = {
                id: Date.now(),
                
                staffId: String(staffMember.id),
                date: date,
                startTime: startTime,
                endTime: endTime,
                type: shiftType,
                status: 'confirmed',
                
                notes: '',
                clinicId: getCurrentClinicId()
            };
            
            shifts.push(newShift);
            
            try {
                await saveShiftToDb(newShift);
            } catch (_err) {
                
            }
            renderCalendar();
            renderStaffPanel(); 
            updateStats();
            
            
            
            
            
            
            const shiftTypeName = translate(getShiftTypeName(shiftType));
            
            showNotification(`${translate('已為')} ${staffMember.name} ${translate('新增')} ${shiftTypeName} (${startTime}-${endTime})${translate('！')}`);
        }

        
        function isToday(date) {
            const today = new Date();
            return date.toDateString() === today.toDateString();
        }

        
        function formatDate(date) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }

        function getShiftsForDate(date) {
            
            const dateStr = formatDate(date);
            return shifts.filter(shift => shift.date === dateStr);
        }

        
        function renderStaffPanel() {
            const grid = document.getElementById('staffGrid');
            grid.innerHTML = '';

            const filteredStaff = getFilteredStaff();

            filteredStaff.forEach(member => {
                const card = document.createElement('div');
                card.className = `staff-card ${member.role}`;
                card.draggable = true;
                card.dataset.staffId = member.id;
                

                
                
                
                const positionLabel = member.level || translate(member.role === 'doctor' ? '醫師' : member.role === 'nurse' ? '護理師' : '');
                card.innerHTML = `
                    <div class="staff-name">${member.name}<span class="staff-position"> ${positionLabel}</span></div>
                    <div class="drag-hint">🖱️</div>
                `;

                
                setupStaffDragEvents(card, member);
                
                grid.appendChild(card);
            });

            
            updateStaffSelects();
        }

        
        function setupStaffDragEvents(card, member) {
            let draggedStaffMember = null;

            card.addEventListener('dragstart', function(e) {
                draggedStaffMember = member;
                this.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'copy';
                e.dataTransfer.setData('text/plain', member.id);
                
                
                document.querySelectorAll('.calendar-cell').forEach(cell => {
                    cell.classList.add('drop-target');
                });
            });

            card.addEventListener('dragend', function() {
                this.classList.remove('dragging');
                draggedStaffMember = null;
                
                
                document.querySelectorAll('.calendar-cell').forEach(cell => {
                    cell.classList.remove('drop-target');
                });
            });

            
            card.draggedStaffMember = member;
        }

        
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

        
        function getTodayShiftsForStaff(staffId) {
            const today = new Date().toISOString().split('T')[0];
            
            return shifts.filter(shift => String(shift.staffId) === String(staffId) && shift.date === today);
        }

        
        function getStaffStatus(staffId, todayShifts) {
            if (todayShifts.length === 0) {
                return { class: '', icon: '✅', text: translate('可排班') };
            } else if (todayShifts.length === 1) {
                return { class: 'partial', icon: '⏰', text: translate('已排班') };
            } else {
                return { class: 'busy', icon: '🔴', text: translate('滿班') };
            }
        }

        
        function updateStaffSelects() {
            const select = document.getElementById('staffSelect');
            select.innerHTML = '';
            staff.forEach(member => {
                const option = document.createElement('option');
                option.value = member.id;
                
                const roleLabel = member.role === 'doctor' ? translate('醫師') : translate('護理師');
                option.textContent = `${member.name} (${roleLabel})`;
                select.appendChild(option);
            });

            
            const fixedSelect = document.getElementById('fixedStaffSelect');
            if (fixedSelect) {
                fixedSelect.innerHTML = '';
                staff.forEach(member => {
                    const option = document.createElement('option');
                    option.value = member.id;
                    
                    const roleLabelFixed = member.role === 'doctor' ? translate('醫師') : translate('護理師');
                    option.textContent = `${member.name} (${roleLabelFixed}) - ${member.department}`;
                    fixedSelect.appendChild(option);
                });
            }
        }

        
        function openShiftModal(date = null, staffId = null) {
            
            if (!ensureAdmin('新增或編輯排班')) {
                return;
            }
            
            if (shiftModalOpening) {
                return;
            }
            shiftModalOpening = true;
            
            setTimeout(() => {
                shiftModalOpening = false;
            }, 0);
            const modal = document.getElementById('shiftModal');
            const form = document.getElementById('shiftForm');
            
            
            form.reset();
            
            
            if (date) {
                document.getElementById('shiftDate').value = date;
            } else {
                document.getElementById('shiftDate').value = currentDate.toISOString().split('T')[0];
            }
            
            if (staffId) {
                document.getElementById('staffSelect').value = staffId;
            }
            
            
            document.getElementById('startTime').value = '08:00';
            document.getElementById('endTime').value = '16:00';

            
            if (document.getElementById('shiftNotes')) {
                document.getElementById('shiftNotes').value = '';
            }
            
            delete modal.dataset.editId;
            const titleEl = modal.querySelector('h3');
            if (titleEl) {
                    
                    titleEl.textContent = translate('新增排班');
            }
            
            try {
                const submitBtn = form.querySelector('button[type="submit"]');
                if (submitBtn) {
                    
                    submitBtn.textContent = translate('新增排班');
                }
            } catch (_e) {
                
            }
            modal.classList.add('show');
        }

        function closeModal() {
            document.getElementById('shiftModal').classList.remove('show');
        }

        
        async function addShift() {
            
            if (!ensureAdmin('新增或編輯排班')) {
                return;
            }
            
            if (shiftSubmitInProgress) {
                return;
            }
            
            shiftSubmitInProgress = true;
            const form = document.getElementById('shiftForm');
            const modal = document.getElementById('shiftModal');
            const editId = modal.dataset.editId;
            
            
            
            const staffId = document.getElementById('staffSelect').value;
            const date = document.getElementById('shiftDate').value;
            const startTime = document.getElementById('startTime').value;
            const endTime = document.getElementById('endTime').value;
            const type = document.getElementById('shiftType').value;

            if (!staffId || !date || !startTime || !endTime || !type) {
                
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
                
                shiftSubmitInProgress = false;
                return;
            }

            
                const conflict = shifts.find(s =>
                
                (editId ? String(s.id) !== String(editId) : true) &&
                String(s.staffId) === String(staffId) &&
                s.date === date &&
                s.startTime === startTime
            );
            if (conflict) {
                const staffMember = findStaffById(staffId);
                
                showNotification(`${staffMember.name} ${date} ${startTime} ${translate('已有排班，無法重複安排！')}`);
                
                shiftSubmitInProgress = false;
                return;
            }
            
            const shiftData = {
                
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
                
                const shiftIndex = shifts.findIndex(s => s.id == editId);
                if (shiftIndex !== -1) {
                    
                    const originalShift = { ...shifts[shiftIndex] };
                    
                    shifts[shiftIndex] = { ...shifts[shiftIndex], ...shiftData };
                    showNotification(translate('排班更新成功！'));
                    
                    await saveShiftToDb(shifts[shiftIndex]);
                    
                    try {
                        const oldKey = getMonthKey(originalShift.date);
                        const newKey = getMonthKey(shifts[shiftIndex].date);
                        if (oldKey !== newKey) {
                            await deleteShiftFromDb(originalShift);
                        }
                    } catch (_delErr) {
                        
                    }
                }
                delete modal.dataset.editId;
                
                modal.querySelector('h3').textContent = translate('新增排班');
            } else {
                
                const newShift = {
                    id: Date.now(),
                    ...shiftData
                };
                shifts.push(newShift);
                showNotification(translate('排班新增成功！'));
                
                await saveShiftToDb(newShift);
            }
            
            
            form.reset();
            modal.classList.remove('show');
            
            
            renderCalendar();
            updateStats();
            
            setTimeout(() => {
                shiftSubmitInProgress = false;
            }, 0);
        }

        
        
        
        

        
        function exportToICal() {
            let icalContent = [
                'BEGIN:VCALENDAR',
                'VERSION:2.0',
                'PRODID:-//醫療排班系統//排班行事曆//ZH',
                'CALSCALE:GREGORIAN'
            ];

            shifts.forEach(shift => {
                const staffMember = findStaffById(shift.staffId);
                
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
                
                
                
                let descriptionLines = [];
                const shiftTypeName = translate(getShiftTypeName(shift.type));
                descriptionLines.push(`${translate('班別:')} ${shiftTypeName}`);
                if (shift.notes) {
                    descriptionLines.push(`${translate('備註:')} ${shift.notes}`);
                }
                const descriptionString = descriptionLines.join('\\n');

                
                
                let location = translate('醫院');
                try {
                    const clinicSettings = JSON.parse(localStorage.getItem('clinicSettings') || '{}');
                    if (clinicSettings && clinicSettings.address) {
                        location = clinicSettings.address;
                    }
                } catch (_e) {
                    
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

            
            const blob = new Blob([icalContent.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            
            
            
            
            const baseName = translate('醫療排班行事曆');
            link.download = `${baseName}.ics`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            showNotification(translate('iCal 檔案已下載！'));
        }

        
        
        
        async function goToToday() {
            currentDate = new Date();
            updateCurrentDate();
            
            try {
                await loadShiftsFromDb();
            } catch (_e) {
                
            }
            renderCalendar();
            updateStats();
        }

        
        function applyFilters() {
            
            
            
            
            currentFilters.department = '';

            
            
            currentFilters.role = document.getElementById('roleFilter').value;
            currentFilters.shiftType = document.getElementById('shiftTypeFilter').value;
            currentFilters.staffSearch = document.getElementById('staffSearch').value.toLowerCase();
            
            renderCalendar();
            updateStats();
        }

        
        function passesFilter(shift) {
            const staffMember = findStaffById(shift.staffId);

            
            
            
            
            
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
                    
                    currentUser = null;
                }
                const currentUserId = currentUser && currentUser.id;
                
                
                if (!currentUserId || String(shift.staffId) !== String(currentUserId)) return false;
            } else {
                
                
                
                
                if (currentFilters.role && staffMember.role !== currentFilters.role) return false;
            }

            
            if (currentFilters.shiftType && shift.type !== currentFilters.shiftType) return false;
            if (currentFilters.staffSearch && !staffMember.name.toLowerCase().includes(currentFilters.staffSearch)) return false;

            return true;
        }

        
        function updateStats() {
            
        }




        
        async function clearAllShifts() {
            
            if (!ensureAdmin('清空所有排班')) {
                return;
            }
            const confirmedClear = await showConfirmation(translate('確定要清空所有排班嗎？此操作無法復原。'), 'warning');
            if (confirmedClear) {
                
                shifts = [];
                
                try {
                    const monthKey = getMonthKey();
                    const monthRef = window.firebase.ref(window.firebase.rtdb, `scheduleShifts/${monthKey}`);
                    await window.firebase.remove(monthRef);
                } catch (_err) {
                    
                }
                renderCalendar();
                updateStats();
                showNotification(translate('所有排班已清空！'));
            }
        }

        
        function editShift(shiftId) {
            
            if (!ensureAdmin('編輯排班')) {
                return;
            }
            const shift = shifts.find(s => s.id === shiftId);
            if (!shift) return;

            
            document.getElementById('staffSelect').value = shift.staffId;
            document.getElementById('shiftDate').value = shift.date;
            document.getElementById('startTime').value = shift.startTime;
            document.getElementById('endTime').value = shift.endTime;
            document.getElementById('shiftType').value = shift.type;

            
            const modal = document.getElementById('shiftModal');
            modal.dataset.editId = shiftId;
            
            modal.querySelector('h3').textContent = translate('編輯排班');
            
            try {
                const form = document.getElementById('shiftForm');
                const submitBtn = form ? form.querySelector('button[type="submit"]') : null;
                if (submitBtn) {
                    
                    submitBtn.textContent = translate('編輯排班');
                }
            } catch (_e) {
                
            }
            modal.classList.add('show');
        }

        
        async function deleteShift(shiftId) {
            
            if (!ensureAdmin('刪除排班')) {
                return;
            }
            
            
            
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
                    
                    const delShift = { ...shifts[shiftIndex] };
                    
                    shifts.splice(shiftIndex, 1);
                    
                    try {
                        await deleteShiftFromDb(delShift);
                    } catch (_err) {
                        
                    }
                    renderCalendar();
                    updateStats();
                    showNotification(translate('排班已刪除！'));
                } else {
                    showNotification(translate('刪除失敗：找不到排班資料！'));
                }
            }
        }

        
        async function showShiftDetails(shift) {
            const staffMember = findStaffById(shift.staffId);
            const duration = calculateShiftDuration(shift.startTime, shift.endTime);
            
            try {
                
                const langOk = (typeof localStorage !== 'undefined' && localStorage.getItem('lang')) || 'zh';
                const okLabel = langOk === 'en' ? 'OK' : '確定';
                
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

        
        function showShiftDetailsById(shiftId) {
            const shift = shifts.find(s => s.id === shiftId);
            if (shift) {
                showShiftDetails(shift);
            }
        }

        

        
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



        
        
        function showNotification(message, type = 'info') {
            try {
                
                if (typeof window.showToast === 'function') {
                    window.showToast(message, type);
                    return;
                } else if (typeof showToast === 'function') {
                    
                    showToast(message, type);
                    return;
                }
            } catch (_e) {
                
            }
            
            const notification = document.getElementById('notification');
            if (notification) {
                notification.textContent = message;
                notification.classList.add('show');
                setTimeout(() => {
                    notification.classList.remove('show');
                }, 3000);
            } else {
                
                alert(message);
            }
        }

        
        
        
        function openFixedScheduleModal() {
            
            if (!ensureAdmin('建立固定排班')) {
                return;
            }
            const modal = document.getElementById('fixedScheduleModal');
            const form = document.getElementById('fixedScheduleForm');
            
            
            form.reset();
            
            
            document.getElementById('fixedShiftType').value = 'morning';
            document.getElementById('fixedStartTime').value = '08:00';
            document.getElementById('fixedEndTime').value = '16:00';
            document.getElementById('scheduleRange').value = 'current-month';
            
            document.getElementById('fixedScheduleNotes').value = '';
            
            
            for (let i = 1; i <= 5; i++) {
                document.getElementById(`day${i}`).checked = true;
            }
            document.getElementById('day0').checked = false;
            document.getElementById('day6').checked = false;
            
            
            document.getElementById('customTimeGroup').style.display = 'none';
            document.getElementById('customRangeGroup').style.display = 'none';
            
            modal.classList.add('show');
        }

        
        function closeFixedScheduleModal() {
            document.getElementById('fixedScheduleModal').classList.remove('show');
        }

        
        async function createFixedSchedule() {
            
            if (!ensureAdmin('建立固定排班')) {
                return;
            }
            
            const staffId = document.getElementById('fixedStaffSelect').value;
            const shiftType = document.getElementById('fixedShiftType').value;
            const scheduleRange = document.getElementById('scheduleRange').value;
            const notes = document.getElementById('fixedScheduleNotes').value;
            const replaceExisting = document.getElementById('replaceExisting').checked;
            
            
            const selectedDays = [];
            for (let i = 0; i < 7; i++) {
                if (document.getElementById(`day${i}`).checked) {
                    selectedDays.push(i);
                }
            }
            
            if (selectedDays.length === 0) {
                
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
            
            
            let startTime, endTime;
            if (shiftType === 'custom') {
                startTime = document.getElementById('fixedStartTime').value;
                endTime = document.getElementById('fixedEndTime').value;
                if (!startTime || !endTime) {
                    
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
                    
                    'afternoon': { start: '16:00', end: '00:00' },
                    'night': { start: '00:00', end: '08:00' }
                };
                startTime = timeMap[shiftType].start;
                endTime = timeMap[shiftType].end;
            }
            
            
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
            
            
            
            let shiftIdCounter = Date.now();
            let addedCount = 0;
            let replacedCount = 0;

            for (let dt = new Date(startDate); dt <= endDate; dt.setDate(dt.getDate() + 1)) {
                const dayOfWeek = dt.getDay();
                if (selectedDays.includes(dayOfWeek)) {
                    const dateStr = formatDate(dt);
                    
                    const existingShiftIndex = shifts.findIndex(s =>
                        String(s.staffId) === String(staffId) && s.date === dateStr
                    );
                    if (existingShiftIndex !== -1) {
                        if (replaceExisting) {
                            
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
                                
                            }
                        }
                        
                    } else {
                        
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
                            
                        }
                    }
                }
            }

            
            renderCalendar();
            updateStats();
            closeFixedScheduleModal();

            
            const staffMember = findStaffById(staffId);
            
            let message = `${translate('固定排班建立完成！')}\n\n`;
            message += `${translate('人員：')}${staffMember.name}\n`;
            message += `${translate('新增排班：')}${addedCount} ${translate('天')}\n`;
            if (replacedCount > 0) {
                message += `${translate('替換排班：')}${replacedCount} ${translate('天')}\n`;
            }
            message += `${translate('時間：')}${startTime} - ${endTime}\n`;
            
            message += `${translate('工作日：')}${selectedDays.map(d => translate(['日','一','二','三','四','五','六'][d])).join('、')}`;

            
            showNotification(`${translate('已為')} ${staffMember.name} ${translate('建立固定排班')}！${translate('新增')} ${addedCount} ${translate('天')}${replacedCount > 0 ? `${translate('，替換')} ${replacedCount} ${translate('天')}` : ''}${translate('。')}`);
        }

        
        document.getElementById('shiftModal').addEventListener('click', function(e) {
            if (e.target === this) {
                closeModal();
            }
        });

        
        document.getElementById('fixedScheduleModal').addEventListener('click', function(e) {
            if (e.target === this) {
                closeFixedScheduleModal();
            }
        });

        
        function filterStaff(filter) {
            currentStaffFilter = filter;
            
            
            document.querySelectorAll('.staff-filter-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            event.target.classList.add('active');
            
            
            renderStaffPanel();
        }

        
        async function viewStaffSchedule(staffId) {
            const staffMember = findStaffById(staffId);
            const staffShifts = shifts.filter(s => String(s.staffId) === String(staffId))
                .sort((a, b) => new Date(a.date) - new Date(b.date));
            
            if (staffShifts.length === 0) {
                
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
            
            
            
            const lang = (typeof localStorage !== 'undefined' && localStorage.getItem('lang')) || 'zh';
            staffShifts.forEach(shift => {
                const dateObj = new Date(shift.date);
                const formattedDate = dateObj.toLocaleDateString(lang === 'en' ? 'en-US' : 'zh-TW');
                const duration = calculateShiftDuration(shift.startTime, shift.endTime);
                
                
                
                const shiftTypeName = translate(getShiftTypeName(shift.type));
                scheduleText += `📅 ${formattedDate} ${shift.startTime}-${shift.endTime} (${duration}h) - ${shiftTypeName}\n`;
                if (shift.notes) scheduleText += `   ${translate('備註:')} ${shift.notes}\n`;
            });
            
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

        
        async function contactStaff(staffId) {
            const staffMember = findStaffById(staffId);
            
            const contactInfo = `${translate('聯絡')} ${staffMember.name}:\n\n` +
                              `📞 ${translate('電話:')} ${staffMember.phone}\n` +
                              `📧 ${translate('信箱:')} ${staffMember.email}\n` +
                              `🏥 ${translate('部門:')} ${staffMember.department}\n` +
                              `👔 ${translate('職位:')} ${staffMember.level}`;
            
            
            const confirmedCall = await showConfirmation(contactInfo + '\n\n' + translate('要撥打電話嗎？'), 'question');
            if (confirmedCall) {
                
                window.open(`tel:${staffMember.phone}`, '_blank', 'noopener,noreferrer');
            }
        }

        
        
        function printCurrentMonthSchedule() {
            try {
                const year = currentDate.getFullYear();
                const month = currentDate.getMonth();
                const lastDay = new Date(year, month + 1, 0).getDate();
                
                const weekdays = ['日','一','二','三','四','五','六'];
                
                const lang = (typeof localStorage !== 'undefined' && localStorage.getItem('lang')) || 'zh';
                
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
                
                
                
                let title;
                if (lang === 'en') {
                    
                    const mm = String(month + 1).padStart(2, '0');
                    const clinicName = getCurrentClinicName();
                    title = translate('排班表') + ' - ' + year + '/' + mm + (clinicName ? ' - ' + translate('診所') + ': ' + clinicName : '');
                } else {
                    const clinicName = getCurrentClinicName();
                    title = year + ' 年 ' + (month + 1) + ' 月' + translate('排班表') + (clinicName ? '（' + translate('診所') + '：' + clinicName + '）' : '');
                }
                html += '<h2>' + title + '</h2>';
                
                html += '<table><thead><tr><th style="width:120px;">' + translate('日期') + '</th><th>' + translate('排班') + '</th></tr></thead><tbody>';
                
                for (let day = 1; day <= lastDay; day++) {
                    const dateObj = new Date(year, month, day);
                    const dateStr = formatDate(dateObj);
                    const dayShifts = shifts.filter(s => s.date === dateStr && passesFilter(s));
                    let cellContent;
                    if (dayShifts.length === 0) {
                        
                        cellContent = `<em>${translate('無排班')}</em>`;
                    } else {
                        dayShifts.sort((a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime));
                        cellContent = '<ul>';
                        dayShifts.forEach(shift => {
                            const staffMember = findStaffById(shift.staffId);
                            const duration = calculateShiftDuration(shift.startTime, shift.endTime);
                            
                            
                            
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
                    
                    const weekdayCh = weekdays[dateObj.getDay()];
                    const weekdayName = translate(weekdayCh);
                    let displayDate;
                    if (lang === 'en') {
                        
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


  window.scheduleNavigateCalendar = navigateCalendar;
  window.scheduleGoToToday = goToToday;
  
  
  window.scheduleExportToICal = exportToICal;
  
  window.scheduleApplyFilters = applyFilters;
  window.scheduleOpenFixedScheduleModal = openFixedScheduleModal;
  window.scheduleCloseFixedScheduleModal = closeFixedScheduleModal;
  window.scheduleCreateFixedSchedule = createFixedSchedule;
  
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

  
  window.schedulePrintShiftTable = printCurrentMonthSchedule;

  
  if (typeof window.scheduleUpdateAdminUI !== 'function') {
    window.scheduleUpdateAdminUI = function () {
      try {
        const isAdmin = window.isAdminUser && window.isAdminUser();
        const qaEl = document.getElementById('quickActions');
        const dragEl = document.getElementById('dragInstruction');
        
        
        if (qaEl) {
          if (isAdmin) {
            
            qaEl.style.display = '';
            if (qaEl.classList) qaEl.classList.remove('hidden');
          } else {
            
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
        
        console.warn('scheduleUpdateAdminUI error', err);
      }
    };
  }

  
  
  
  
  
  
  
  
  

  if (typeof window.handleEditShift !== 'function') {
    window.handleEditShift = function (e, shiftId) {
      
      if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
      
      if (typeof window.scheduleEditShift === 'function') {
        window.scheduleEditShift(shiftId);
      }
    };
  }
  if (typeof window.handleDeleteShift !== 'function') {
    window.handleDeleteShift = function (e, shiftId) {
      
      if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      
      if (typeof window.scheduleDeleteShift === 'function') {
        window.scheduleDeleteShift(shiftId);
      }
    };
  }

  
  window.scheduleChangeHolidayRegion = changeHolidayRegion;




if (typeof window.initializeScheduleManagement !== 'function') {
  window.initializeScheduleManagement = async function() {
    
    const isFirstInit = !window.scheduleInitialized;
    if (isFirstInit) {
      window.scheduleInitialized = true;
    }
    try {
      
      if (isFirstInit) {
        
        if (typeof updateCurrentDate === 'function') updateCurrentDate();
        
        if (typeof setupEventListeners === 'function') setupEventListeners();
        
        if (typeof loadClinicStaff === 'function') {
          await loadClinicStaff();
        }
        
        if (typeof loadShiftsFromDb === 'function') {
          await loadShiftsFromDb();
        }
        
        if (typeof renderCalendar === 'function') renderCalendar();
        if (typeof renderStaffPanel === 'function') renderStaffPanel();
        if (typeof updateStaffSelects === 'function') updateStaffSelects();
        
        if (typeof updateStats === 'function') updateStats();
      }
      
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
