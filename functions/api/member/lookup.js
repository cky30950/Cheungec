/* ============================================================
 * POST /api/member/lookup（公開，無需登入、不發 SMS）
 * ------------------------------------------------------------
 * 病人輸入自己於診所登記的電話號碼（不限位數），由 Service Account
 * 代為查詢並回傳：儲值帳戶、有效套票、最近 20 筆交易。
 * 不回傳病歷、身份證等任何 PHI；病人姓名僅供本人識別記錄。
 *
 * 請求：{ phone: "91234567", turnstileToken: "..." }
 * 回應：{ patients: [{ patientId, name, account, packages, transactions }] }
 *
 * 人機驗證：turnstileToken 經 Cloudflare siteverify 以
 * TURNSTILE_SECRET_KEY（Pages Secret）驗證，必要欄位。
 *
 * 防濫用：同 IP 每 10 分鐘最多 30 次（isolate 內 best-effort；
 * 建議同時在 Cloudflare 儀表板加 Rate Limiting 規則）。
 * ============================================================ */

import { getAccessToken } from '../backup/lib/google-auth.js';
import { FirestoreClient } from '../backup/lib/firestore.js';
import { jsonResponse, optionsResponse } from '../backup/lib/http.js';

export const onRequestOptions = () => optionsResponse();

// ── 簡易 IP 限速（模組級，單 isolate 生效）──
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 30;
const rateHits = new Map(); // ip -> timestamps[]

function rateLimit(ip) {
    const now = Date.now();
    let hits = rateHits.get(ip);
    if (!hits) {
        hits = [];
        rateHits.set(ip, hits);
    }
    while (hits.length && now - hits[0] > RATE_WINDOW_MS) hits.shift();
    if (hits.length >= RATE_MAX) return false;
    hits.push(now);
    return true;
}

// 不限制電話位數：依病人輸入產生各種可能的登記格式。
// 職員建檔時電話可能存原值、純數字、8 位本地號或 852 開頭等寫法。
function phoneMatchVariants(raw) {
    const input = String(raw || '').trim();
    if (!input) return [];
    const variants = new Set();
    variants.add(input); // 與存檔原值比對
    const digits = input.replace(/\D/g, '');
    if (digits.length < 4) return [];
    variants.add(digits); // 純數字

    // 香港 8 位本地號與 852 開頭之間互換，並涵蓋常見含分隔的寫法
    const locals = [];
    if (digits.length === 11 && digits.indexOf('852') === 0) {
        locals.push(digits.slice(3));
    } else if (digits.length === 8) {
        locals.push(digits);
    }
    locals.forEach((l8) => {
        variants.add(l8);
        variants.add('852' + l8);
        variants.add('+852' + l8);
        variants.add(`${l8.slice(0, 4)} ${l8.slice(4)}`);
        variants.add(`+852 ${l8.slice(0, 4)} ${l8.slice(4)}`);
        variants.add(`(852) ${l8.slice(0, 4)}-${l8.slice(4)}`);
    });
    return Array.from(variants);
}

function eqFilter(fieldPath, value) {
    return {
        fieldFilter: {
            field: { fieldPath },
            op: 'EQUAL',
            value
        }
    };
}

// 套票到期日可能以 ISO 字串（現行寫法）或 Firestore Timestamp（{seconds}）儲存，
// 統一轉成毫秒；無法解析回 null。
function expiryToMs(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'object') {
        if (Number.isFinite(Number(v.seconds))) return Number(v.seconds) * 1000;
        if (Number.isFinite(Number(v._seconds))) return Number(v._seconds) * 1000;
    }
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : t;
}

// ── Turnstile 伺服端驗證 ──
async function verifyTurnstile(token, ip, env) {
    const secret = env && env.TURNSTILE_SECRET_KEY ? String(env.TURNSTILE_SECRET_KEY) : '';
    if (!secret) {
        const err = new Error('TURNSTILE_NOT_CONFIGURED');
        err.status = 500;
        err.clientMessage = '人機驗證未完成設定，請聯絡診所職員';
        throw err;
    }
    if (!token) return false;

    const form = new URLSearchParams({
        secret,
        response: token
    });
    if (ip && ip !== 'unknown') form.set('remoteip', ip);

    let data = null;
    try {
        const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: form.toString()
        });
        data = await res.json();
    } catch (error) {
        console.warn('turnstile siteverify request failed:', error.message);
        return false;
    }
    return !!(data && data.success === true);
}

async function findPatients(client, variants) {
    // 以各種可能格式查詢再去重
    const pages = await Promise.all(
        variants.map((v) => client.queryCollection({
            collectionId: 'patients',
            where: eqFilter('phone', { stringValue: v }),
            orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
            limit: 20
        }))
    );
    const byId = new Map();
    pages.forEach((page) => {
        page.docs.forEach((d) => {
            if (!byId.has(d.id)) byId.set(d.id, d);
        });
    });
    return Array.from(byId.values());
}

async function fetchRtdbAppointment(rtdbUrl, token, appointmentId) {
    try {
        const base = String(rtdbUrl || '').replace(/\/$/, '');
        const res = await fetch(
            `${base}/appointments/${encodeURIComponent(appointmentId)}.json`,
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        if (!res.ok) return null;
        return await res.json();
    } catch (_e) {
        return null;
    }
}

// 批次（並行）讀取文件，回傳 Map(id → data)；失敗或缺件跳過。
async function fetchDocMap(client, collectionId, ids, opts = {}) {
    const cap = opts.cap || 50;
    const uniq = Array.from(new Set((ids || []).filter(Boolean))).slice(0, cap);
    const docs = await Promise.all(uniq.map(async (id) => {
        try {
            const d = await client.getDocument(`${collectionId}/${encodeURIComponent(id)}`);
            return d && d.data ? [id, d.data] : null;
        } catch (_e) {
            return null;
        }
    }));
    return new Map(docs.filter(Boolean));
}

async function buildPatientEntry(client, token, patientDoc, clinicNameMap) {
    const patientId = patientDoc.id;
    const [accDoc, pkgPage, txPage, consPage] = await Promise.all([
        client.getDocument(`patientWalletAccounts/${encodeURIComponent(patientId)}`),
        client.queryCollection({
            collectionId: 'patientPackages',
            where: eqFilter('patientId', { stringValue: patientId }),
            orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
            limit: 100
        }),
        client.queryCollection({
            collectionId: 'patientWalletTransactions',
            where: eqFilter('patientId', { stringValue: patientId }),
            orderBy: [{ field: { fieldPath: 'at' }, direction: 'DESCENDING' }],
            limit: 300
        }),
        // 病人的診症記錄：用於把套票按使用診所歸組
        client.queryCollection({
            collectionId: 'consultations',
            where: eqFilter('patientId', { stringValue: patientId }),
            orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
            limit: 200
        })
    ]);

    // ── 1. 交易 → 診所歸屬 ──
    const allTxs = txPage.docs.map((d) => d.data);
    const consultationIds = allTxs
        .map((tx) => tx.consultationId)
        .filter((id) => id);
    const appointmentIds = allTxs
        .map((tx) => tx.appointmentId)
        .filter((id) => id);

    const [consMap, apptDataList] = await Promise.all([
        fetchDocMap(client, 'consultations', consultationIds),
        Promise.all(Array.from(new Set(appointmentIds)).slice(0, 50)
            .map((id) => fetchRtdbAppointment(client.rtdbUrl, token, id)))
    ]);
    const apptMap = new Map();
    Array.from(new Set(appointmentIds)).slice(0, 50).forEach((id, i) => {
        if (apptDataList[i]) apptMap.set(id, apptDataList[i]);
    });

    // 先解析 topup 單：其同 idempotencyKey 的 topupBonus 照單歸同一診所
    const idemClinicMap = new Map();
    allTxs.forEach((tx) => {
        if (tx.type !== 'topup') return;
        let cid = (tx.consultationId && consMap.has(tx.consultationId)
            && consMap.get(tx.consultationId).clinicId)
            || (tx.appointmentId && apptMap.has(tx.appointmentId)
            && apptMap.get(tx.appointmentId).clinicId)
            || '';
        if (tx.idempotencyKey) idemClinicMap.set(tx.idempotencyKey, String(cid || ''));
    });

    function txClinicId(tx) {
        if (tx.consultationId) {
            const c = consMap.get(tx.consultationId);
            if (c && c.clinicId) return String(c.clinicId);
        }
        if (tx.appointmentId) {
            const a = apptMap.get(tx.appointmentId);
            if (a && a.clinicId) return String(a.clinicId);
        }
        if (tx.type === 'topupBonus' && tx.idempotencyKey
            && idemClinicMap.has(tx.idempotencyKey)) {
            return idemClinicMap.get(tx.idempotencyKey);
        }
        return ''; // 無法歸屬 → 未分組
    }

    // ── 2. 套票 → 診所歸屬（依使用記錄）──
    const pkgClinicMap = new Map();
    consPage.docs.forEach((d) => {
        const c = d.data || {};
        if (!c.clinicId) return;
        const items = Array.isArray(c.financialSummaryItems)
            ? c.financialSummaryItems : [];
        items.forEach((it) => {
            if (it && it.packageRecordId
                && !pkgClinicMap.has(String(it.packageRecordId))) {
                pkgClinicMap.set(String(it.packageRecordId), String(c.clinicId));
            }
        });
    });

    // ── 3. 僅保留有效套票並歸組 ──
    const nowMs = Date.now();
    const packages = pkgPage.docs
        .map((d) => ({ id: d.id, data: d.data }))
        .filter((p) => Number(p.data.remainingUses) > 0)
        .filter((p) => {
            if (!p.data.expiresAt) return true;
            const expMs = expiryToMs(p.data.expiresAt);
            return expMs === null ? true : expMs >= nowMs;
        })
        .map((p) => ({
            clinicId: pkgClinicMap.has(p.id) ? pkgClinicMap.get(p.id) : '',
            name: p.data.name || p.data.packageName || '',
            totalUses: Number(p.data.totalUses) || 0,
            remainingUses: Number(p.data.remainingUses) || 0,
            expiresAt: p.data.expiresAt || null
        }));

    const account = accDoc && accDoc.data
        ? {
            balance: Number(accDoc.data.balance) || 0,
            bonusBalance: Number(accDoc.data.bonusBalance) || 0,
            status: String(accDoc.data.status || 'active')
        }
        : null;

    // ── 4. 分組：餘額（依完整流水計算）＋近期交易（每組上限 30）──
    const groups = new Map();
    const ensureGroup = (cid) => {
        if (!groups.has(cid)) {
            const names = clinicNameMap.get(cid);
            groups.set(cid, {
                clinicId: cid,
                clinicName: names || { zh: '', en: '' },
                balance: 0,
                bonusBalance: 0,
                packages: [],
                transactions: []
            });
        }
        return groups.get(cid);
    };

    allTxs.forEach((tx) => {
        const cid = txClinicId(tx);
        const g = ensureGroup(cid);
        switch (tx.type) {
            case 'topup':
                g.balance += Number(tx.amount) || 0;
                break;
            case 'topupBonus':
                g.bonusBalance += Number(tx.amount) || 0;
                break;
            case 'payment':
                g.balance += Number(tx.fromBalance) || 0;
                g.bonusBalance += Number(tx.fromBonus) || 0;
                break;
            case 'refund':
                g.balance += Number(tx.fromBalance) || 0;
                g.bonusBalance += Number(tx.fromBonus) || 0;
                break;
            case 'adjust':
                // 優先採本金/贈送拆分欄位
                if (Number.isFinite(Number(tx.deltaBalance))) {
                    g.balance += Number(tx.deltaBalance);
                    g.bonusBalance += Number(tx.deltaBonus) || 0;
                } else {
                    g.balance += Number(tx.amount) || 0;
                }
                break;
            default:
                break;
        }
        if (g.transactions.length < 30) g.transactions.push(tx);
    });

    packages.forEach((p) => {
        // 從未使用而病人只有單一診所時，歸入該診所；多診所且無證據→未分組
        let cid = p.clinicId;
        if (!cid && groups.size === 1 && groups.has('') === false) {
            cid = Array.from(groups.keys())[0];
        }
        ensureGroup(cid).packages.push({
            name: p.name,
            totalUses: p.totalUses,
            remainingUses: p.remainingUses,
            expiresAt: p.expiresAt
        });
    });

    const clinics = Array.from(groups.values()).map((g) => {
        g.balance = Math.round(g.balance * 100) / 100;
        g.bonusBalance = Math.round(g.bonusBalance * 100) / 100;
        return g;
    });

    // 有明確診所的排在前，未分組墊後
    clinics.sort((a, b) => (a.clinicId ? 0 : 1) - (b.clinicId ? 0 : 1));

    return {
        patientId,
        name: patientDoc.data.name || '',
        account,
        clinics
    };
}

export async function onRequestPost(context) {
    const { request, env } = context;
    try {
        const ip = request.headers.get('CF-Connecting-IP')
            || request.headers.get('X-Forwarded-For')
            || 'unknown';
        if (!rateLimit(ip)) {
            return jsonResponse({
                error: 'RATE_LIMITED',
                message: '查詢次數過多，請於 10 分鐘後再試'
            }, 429);
        }

        let body;
        try {
            body = await request.json();
        } catch (_e) {
            return jsonResponse({ error: 'INVALID_REQUEST', message: '請求內容必須為 JSON' }, 400);
        }
        const token = body && body.turnstileToken ? String(body.turnstileToken) : '';
        const human = await verifyTurnstile(token, ip, env);
        if (!human) {
            return jsonResponse({
                error: 'TURNSTILE_FAILED',
                message: '人機驗證失敗，請重新勾選驗證方塊後再試'
            }, 400);
        }

        const phoneVariants = phoneMatchVariants(body && body.phone);
        if (!phoneVariants.length) {
            return jsonResponse({
                error: 'INVALID_PHONE',
                message: '請輸入於診所登記的電話號碼'
            }, 400);
        }

        const auth = await getAccessToken(env);
        const client = new FirestoreClient(
            auth.token,
            auth.projectId,
            env.FIREBASE_RTDB_URL || ''
        );

        // 診所名稱表（id → 中英文名），供分組顯示
        const clinicsPage = await client.queryCollection({
            collectionId: 'clinics',
            orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
            limit: 50
        });
        const clinicNameMap = new Map();
        clinicsPage.docs.forEach((d) => {
            clinicNameMap.set(d.id, {
                zh: d.data.chineseName || '',
                en: d.data.englishName || ''
            });
        });

        const patientDocs = await findPatients(client, phoneVariants);
        const patients = await Promise.all(
            patientDocs.map((d) => buildPatientEntry(client, auth.token, d, clinicNameMap))
        );

        return jsonResponse({ patients });
    } catch (error) {
        console.error('member lookup failed:', error);
        // 明確設定錯誤（如 TURNSTILE_NOT_CONFIGURED）保留其狀態碼與使用者訊息
        if (error && error.message === 'TURNSTILE_NOT_CONFIGURED') {
            return jsonResponse({
                error: 'TURNSTILE_NOT_CONFIGURED',
                message: error.clientMessage || '人機驗證未完成設定'
            }, error.status || 500);
        }
        return jsonResponse({
            error: 'LOOKUP_FAILED',
            message: error && error.message ? error.message : '查詢服務發生錯誤'
        }, 500);
    }
}
