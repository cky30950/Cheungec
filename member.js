/* ============================================================
 * member.js — 病人會員查詢（無需登入、不發 SMS）
 * ------------------------------------------------------------
 * 輸入於診所登記的香港手機號碼 → POST /api/member/lookup
 * 由 Service Account 查詢並回傳：儲值餘額、有效套票、最近交易。
 * 頁面不直接連接 Firestore，不顯示任何病歷。
 * ============================================================ */

/* ---------------- i18n ---------------- */

const I18N = {
    zh: {
        clinicName: '名醫診所系統',
        authTitle: '會員查詢',
        authSub: '輸入於診所登記之手機號碼，即可查閱儲值餘額、套票及交易記錄。',
        phoneLabel: '手機號碼',
        phoneHint: '請輸入於診所登記之手機號碼。',
        lookup: '查詢',
        looking: '查詢中…',
        errCaptcha: '請先完成人機驗證',
        captchaNotSet: '人機驗證尚未設定，請聯絡診所職員',
        captchaFailed: '人機驗證無法完成，請重新整理頁面或稍後再試',
        captchaLoading: '人機驗證載入中…',
        totalBalance: '儲值總餘額 (HKD)',
        principal: '本金餘額',
        bonus: '贈送餘額',
        packages: '有效套票',
        transactions: '最近交易',
        back: '返回',
        prevPage: '上一頁',
        nextPage: '下一頁',
        noPackages: '目前沒有有效套票',
        noTransactions: '暫無交易記錄',
        noAccount: '未找到儲值帳戶',
        uses: '餘次',
        noExpiry: '無有效期',
        txTopup: '儲值充值',
        txPayment: '診症扣款',
        txRefund: '退款',
        txAdjust: '人工調整',
        txStatus: '狀態變更',
        errPhone: '請輸入於診所登記的電話號碼',
        errNoPatient: '系統中沒有以此電話登記的病人記錄。',
        errLoad: '查詢失敗，請稍後再試',
        patientLabel: '病人',
        selectClinic: '選擇診所',
        unassigned: '未分組',
        langToggle: 'English'
    },
    en: {
        clinicName: 'Dr.Great Clinic System',
        authTitle: 'Member Portal',
        authSub: 'Enter your mobile number registered with the clinic to view your stored-value balance, packages and transactions.',
        phoneLabel: 'Mobile number',
        phoneHint: 'Enter the number registered with the clinic.',
        lookup: 'Look up',
        looking: 'Looking up…',
        errCaptcha: 'Please complete the human verification',
        captchaNotSet: 'Human verification is not configured. Please contact the clinic.',
        captchaFailed: 'Human verification could not be completed. Please refresh the page or try again later.',
        captchaLoading: 'Loading human verification…',
        totalBalance: 'Total balance (HKD)',
        principal: 'Principal',
        bonus: 'Bonus',
        packages: 'Active packages',
        transactions: 'Recent transactions',
        back: 'Back',
        prevPage: 'Previous',
        nextPage: 'Next',
        noPackages: 'No active packages',
        noTransactions: 'No transactions yet',
        noAccount: 'No stored-value account found',
        uses: 'uses left',
        noExpiry: 'No expiry',
        txTopup: 'Top-up',
        txPayment: 'Consultation payment',
        txRefund: 'Refund',
        txAdjust: 'Manual adjustment',
        txStatus: 'Status change',
        errPhone: 'Please enter the phone number registered with the clinic',
        errNoPatient: 'No patient record is registered with this phone number.',
        errLoad: 'Lookup failed, please try again later',
        patientLabel: 'Patient',
        selectClinic: 'Select clinic',
        unassigned: 'Unassigned',
        langToggle: '中文'
    }
};

let lang = (function () {
    try {
        const saved = localStorage.getItem('memberLang');
        if (saved === 'en' || saved === 'zh') return saved;
    } catch (_e) {}
    return 'zh';
})();

function t(key) {
    return I18N[lang][key] || I18N.zh[key] || key;
}

function applyStaticI18n() {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
        el.textContent = t(el.getAttribute('data-i18n'));
    });
    document.documentElement.lang = lang === 'en' ? 'en' : 'zh-HK';
    document.getElementById('langToggle').textContent = t('langToggle');
}

document.getElementById('langToggle').addEventListener('click', () => {
    lang = lang === 'zh' ? 'en' : 'zh';
    try { localStorage.setItem('memberLang', lang); } catch (_e) {}
    applyStaticI18n();
    // 診所選項名稱隨語言更新（資料頁可見時）
    if (!$('dataView').classList.contains('hidden')) {
        renderClinicSelector();
    }
});

/* ---------------- UI helpers ---------------- */

const $ = (id) => document.getElementById(id);

function showAuthMsg(keyOrText, kind = 'error') {
    const el = $('authMsg');
    const text = I18N[lang][keyOrText] || keyOrText;
    el.textContent = text;
    el.className = 'msg ' + kind;
}

function clearAuthMsg() {
    const el = $('authMsg');
    el.textContent = '';
    el.className = 'msg';
}

function money(n) {
    return 'HK$' + Number(n || 0).toFixed(2);
}

function toDate(ts) {
    if (!ts) return null;
    if (typeof ts.seconds === 'number') return new Date(ts.seconds * 1000);
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
}

function formatDate(ts) {
    const d = toDate(ts);
    if (!d) return '';
    try {
        return d.toLocaleDateString(lang === 'en' ? 'en-HK' : 'zh-HK', {
            year: 'numeric', month: '2-digit', day: '2-digit'
        });
    } catch (_e) {
        return d.toLocaleDateString();
    }
}

function formatDateTime(ts) {
    const d = toDate(ts);
    if (!d) return '';
    try {
        return d.toLocaleString(lang === 'en' ? 'en-HK' : 'zh-HK', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit'
        });
    } catch (_e) {
        return d.toLocaleString();
    }
}

/* ---------------- Turnstile 人機驗證 ---------------- */

let widgetId = null;
let turnstileToken = '';
let captchaErrors = 0;

function loadTurnstileScript() {
    if (window.turnstile) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        // 官方規定：使用 turnstile.ready() 時不可加 async/defer；
        // 這裡以 onload 判斷載入完成，故不需要 ready()。
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('TURNSTILE_SCRIPT_FAILED'));
        document.head.appendChild(s);
    });
}

function setLookupEnabled() {
    $('lookupBtn').disabled = !turnstileToken;
}

function showTurnstileNote(key) {
    const note = $('turnstileNote');
    note.textContent = t(key);
    note.classList.remove('hidden');
}

function resetTurnstile() {
    turnstileToken = '';
    setLookupEnabled();
    if (widgetId !== null && window.turnstile) {
        try {
            window.turnstile.reset(widgetId);
        } catch (_e) {}
    }
}

async function initTurnstile() {
    try {
        const [cfg] = await Promise.all([
            fetch('/api/member/config').then((r) => r.json()),
            loadTurnstileScript()
        ]);
        const siteKey = cfg && cfg.siteKey ? String(cfg.siteKey) : '';
        if (!siteKey) {
            showTurnstileNote('captchaNotSet');
            return;
        }
        captchaErrors = 0;
        widgetId = window.turnstile.render('#turnstileWidget', {
            sitekey: siteKey,
            language: lang === 'en' ? 'en' : 'zh-HK',
            callback: (tok) => {
                captchaErrors = 0;
                turnstileToken = String(tok || '');
                setLookupEnabled();
            },
            'expired-callback': () => resetTurnstile(),
            'timeout-callback': () => resetTurnstile(),
            'error-callback': () => {
                // 官方建議：前 2 次回 false 交由 Turnstile 自動重試；
                // 持續失敗才顯示持久訊息並回 true（不再 console 報錯）。
                captchaErrors++;
                if (captchaErrors <= 2) return false;
                showTurnstileNote('captchaFailed');
                return true;
            }
        });
    } catch (err) {
        console.error('turnstile init failed:', err);
        showTurnstileNote('captchaNotSet');
    }
}

/* ---------------- 查詢 ---------------- */

let patientEntries = [];
let activePatientIndex = 0;
let activeClinicIndex = 0;
let txPage = 1;
const TX_PAGE_SIZE = 10;

function activeEntry() {
    return patientEntries[activePatientIndex] || null;
}

function activeClinic() {
    const e = activeEntry();
    const cs = e && Array.isArray(e.clinics) ? e.clinics : [];
    return cs[activeClinicIndex] || cs[0] || null;
}

function clinicDisplayName(c) {
    if (!c) return '';
    if (!c.clinicId) return t('unassigned');
    const n = c.clinicName
        && (c.clinicName[lang] || c.clinicName.zh || c.clinicName.en);
    return n || c.clinicId;
}

async function lookup() {
    clearAuthMsg();
    if (!turnstileToken) {
        showAuthMsg('errCaptcha');
        return;
    }
    const rawPhone = String($('phoneInput').value || '').trim();
    const digits = rawPhone.replace(/\D/g, '');
    // 不限制位數，只要輸入了電話號碼即可，比對由後端依登記電話處理
    if (digits.length < 4) {
        showAuthMsg('errPhone');
        return;
    }

    const btn = $('lookupBtn');
    btn.disabled = true;
    btn.textContent = t('looking');
    try {
        const res = await fetch('/api/member/lookup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: rawPhone, turnstileToken: turnstileToken })
        });
        let data;
        try {
            data = await res.json();
        } catch (_e) {
            data = null;
        }
        if (!res.ok) {
            showAuthMsg((data && data.message) || 'errLoad');
            return;
        }
        patientEntries = (data && Array.isArray(data.patients)) ? data.patients : [];
        activePatientIndex = 0;
        if (!patientEntries.length) {
            showAuthMsg('errNoPatient', 'info');
            return;
        }
        renderAll();
        $('authView').classList.add('hidden');
        $('dataView').classList.remove('hidden');
    } catch (err) {
        console.error('lookup error:', err);
        showAuthMsg('errLoad');
    } finally {
        btn.textContent = t('lookup');
        // Turnstile token 單次有效，每次嘗試後重置並等下一個 token
        resetTurnstile();
    }
}

$('lookupBtn').addEventListener('click', lookup);
$('phoneInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') lookup();
});

$('clinicSelect').addEventListener('change', (e) => {
    activeClinicIndex = Number(e.target.value) || 0;
    txPage = 1;
    renderBalance();
    renderPackages();
    renderTransactions();
});

$('backBtn').addEventListener('click', () => {
    $('dataView').classList.add('hidden');
    $('authView').classList.remove('hidden');
    resetTurnstile();
});

/* ---------------- 渲染 ---------------- */

function renderPatientTabs() {
    const tabsEl = $('patientTabs');
    if (patientEntries.length <= 1) {
        tabsEl.innerHTML = '';
        return;
    }
    tabsEl.innerHTML = patientEntries.map((entry, i) => {
        const active = i === activePatientIndex ? ' active' : '';
        const label = `${t('patientLabel')}: ${entry.name || entry.patientId}`;
        return `<button class="tab${active}" data-patient-idx="${i}" type="button">${label}</button>`;
    }).join('');
    tabsEl.querySelectorAll('[data-patient-idx]').forEach((btn) => {
        btn.addEventListener('click', () => {
            activePatientIndex = Number(btn.getAttribute('data-patient-idx')) || 0;
            renderAll();
        });
    });
}

function renderClinicSelector() {
    const card = $('clinicSelectCard');
    const sel = $('clinicSelect');
    const e = activeEntry();
    const cs = e && Array.isArray(e.clinics) ? e.clinics : [];
    if (cs.length <= 1) {
        card.classList.add('hidden');
        return;
    }
    card.classList.remove('hidden');
    if (activeClinicIndex >= cs.length) activeClinicIndex = 0;
    sel.innerHTML = cs.map((c, i) =>
        `<option value="${i}">${clinicDisplayName(c)}</option>`).join('');
    sel.value = String(activeClinicIndex);
}

function renderBalance() {
    const c = activeClinic();
    const balance = c ? Number(c.balance) : 0;
    const bonus = c ? Number(c.bonusBalance) : 0;
    $('heroTotal').textContent = money(balance + bonus);
    $('heroBalance').textContent = money(balance);
    $('heroBonus').textContent = money(bonus);
}

function renderPackages() {
    const ul = $('packageList');
    const c = activeClinic();
    const packages = c && c.packages ? c.packages : [];
    if (!packages.length) {
        ul.innerHTML = `<li class="empty">${t('noPackages')}</li>`;
        return;
    }
    ul.innerHTML = packages.map((p) => {
        const name = p.name || '';
        const remaining = Number(p.remainingUses);
        const total = Number(p.totalUses);
        const expiry = p.expiresAt ? formatDate(p.expiresAt) : t('noExpiry');
        return `
            <li>
                <div class="row">
                    <span class="name">${name}</span>
                    <span class="pill">${remaining}/${total} ${t('uses')}</span>
                </div>
                <div class="meta">${expiry}</div>
            </li>`;
    }).join('');
}

function txTypeLabel(type) {
    const map = {
        topup: 'txTopup',
        payment: 'txPayment',
        refund: 'txRefund',
        adjust: 'txAdjust',
        status: 'txStatus'
    };
    return t(map[type] || 'txAdjust');
}

function renderTransactions() {
    const ul = $('txList');
    const pager = $('txPager');
    const c = activeClinic();
    const txs = c && c.transactions ? c.transactions : [];
    if (!txs.length) {
        ul.innerHTML = `<li class="empty">${t('noTransactions')}</li>`;
        if (pager) pager.classList.add('hidden');
        return;
    }

    const totalPages = Math.ceil(txs.length / TX_PAGE_SIZE);
    if (txPage > totalPages) txPage = totalPages;
    if (txPage < 1) txPage = 1;
    const start = (txPage - 1) * TX_PAGE_SIZE;
    const pageTxs = txs.slice(start, start + TX_PAGE_SIZE);

    ul.innerHTML = pageTxs.map((tx) => {
        const amount = Number(tx.amount) || 0;
        const isNeg = amount < 0;
        const cls = isNeg ? 'amt-neg' : 'amt-pos';
        const sign = isNeg ? '-' : '+';
        const at = formatDateTime(tx.at);
        const note = tx.note ? String(tx.note) : '';
        const meta = [at, note].filter(Boolean).join(' · ');
        return `
            <li>
                <div class="row">
                    <span class="name">${txTypeLabel(tx.type)}</span>
                    <span class="${cls}">${sign}${money(Math.abs(amount))}</span>
                </div>
                <div class="meta">${meta}</div>
            </li>`;
    }).join('');

    if (pager) {
        if (totalPages > 1) {
            const pageInfo = lang === 'en'
                ? `Page ${txPage} / ${totalPages}`
                : `第 ${txPage} / ${totalPages} 頁`;
            pager.innerHTML = `
                <div class="pager-btns">
                    <button type="button" id="txPrevBtn" ${txPage <= 1 ? 'disabled' : ''}>${t('prevPage')}</button>
                    <button type="button" id="txNextBtn" ${txPage >= totalPages ? 'disabled' : ''}>${t('nextPage')}</button>
                </div>
                <span class="page-info">${pageInfo}`;
            $('txPrevBtn').addEventListener('click', () => goToTxPage(txPage - 1));
            $('txNextBtn').addEventListener('click', () => goToTxPage(txPage + 1));
            pager.classList.remove('hidden');
        } else {
            pager.classList.add('hidden');
        }
    }
}

function goToTxPage(p) {
    const c = activeClinic();
    const txs = c && c.transactions ? c.transactions : [];
    const totalPages = Math.ceil(txs.length / TX_PAGE_SIZE);
    const next = Math.max(1, Math.min(totalPages, Number(p)));
    if (next === txPage) return;
    txPage = next;
    renderTransactions();
}

function renderAll() {
    txPage = 1;
    activeClinicIndex = 0;
    renderPatientTabs();
    renderClinicSelector();
    renderBalance();
    renderPackages();
    renderTransactions();
}

applyStaticI18n();
initTurnstile();
