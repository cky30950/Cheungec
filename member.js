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
        clinicName: '名醫中醫診所',
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
        errPhone: '請輸入有效香港手機號碼（8 位數）',
        errNoPatient: '系統中沒有以此手機登記的病人記錄。',
        errLoad: '查詢失敗，請稍後再試',
        patientLabel: '病人',
        langToggle: 'English'
    },
    en: {
        clinicName: 'MING YI Chinese Medicine Clinic',
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
        errPhone: 'Please enter a valid Hong Kong mobile number (8 digits)',
        errNoPatient: 'No patient record is registered with this mobile number.',
        errLoad: 'Lookup failed, please try again later',
        patientLabel: 'Patient',
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
        s.async = true;
        s.defer = true;
        s.onload = () => window.turnstile.ready(resolve);
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

async function lookup() {
    clearAuthMsg();
    if (!turnstileToken) {
        showAuthMsg('errCaptcha');
        return;
    }
    const phone = $('phoneInput').value;
    const digits = String(phone || '').replace(/\D/g, '');
    let local8 = '';
    if (digits.length === 8) {
        local8 = digits;
    } else if (digits.length === 11 && digits.indexOf('852') === 0) {
        local8 = digits.slice(3);
    }
    if (!/^[5-9]\d{7}$/.test(local8)) {
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
            body: JSON.stringify({ phone: local8, turnstileToken: turnstileToken })
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

function renderBalance() {
    const entry = patientEntries[activePatientIndex];
    const acc = entry && entry.account;
    const balance = acc ? Number(acc.balance) : 0;
    const bonus = acc ? Number(acc.bonusBalance) : 0;
    $('heroTotal').textContent = money(balance + bonus);
    $('heroBalance').textContent = money(balance);
    $('heroBonus').textContent = money(bonus);
}

function renderPackages() {
    const ul = $('packageList');
    const packages = patientEntries[activePatientIndex].packages || [];
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
    const txs = patientEntries[activePatientIndex].transactions || [];
    if (!txs.length) {
        ul.innerHTML = `<li class="empty">${t('noTransactions')}</li>`;
        return;
    }
    ul.innerHTML = txs.map((tx) => {
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
}

function renderAll() {
    renderPatientTabs();
    renderBalance();
    renderPackages();
    renderTransactions();
}

applyStaticI18n();
initTurnstile();
