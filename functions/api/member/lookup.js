/* ============================================================
 * POST /api/member/lookup（公開，無需登入、不發 SMS）
 * ------------------------------------------------------------
 * 病人輸入自己於診所登記的香港手機號碼，由 Service Account
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

// 接受 8 位香港號或 852 + 8 位；回傳 8 位本地號
function parseHkPhone(raw) {
    const digits = String(raw || '').replace(/\D/g, '');
    let local8 = '';
    if (digits.length === 8) {
        local8 = digits;
    } else if (digits.length === 11 && digits.indexOf('852') === 0) {
        local8 = digits.slice(3);
    }
    return /^[5-9]\d{7}$/.test(local8) ? local8 : '';
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

async function findPatients(client, local8) {
    // 職員建檔時電話可能存 8 位或 852 開頭，兩種都查再去重
    const variants = [local8, '852' + local8];
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

async function buildPatientEntry(client, patientDoc) {
    const patientId = patientDoc.id;
    const [accDoc, pkgPage, txPage] = await Promise.all([
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
            limit: 20
        })
    ]);

    // 僅回有效套票：尚有餘次且未過期
    const nowMs = Date.now();
    const packages = pkgPage.docs
        .map((d) => d.data)
        .filter((p) => {
            if (!(Number(p.remainingUses) > 0)) return false;
            if (!p.expiresAt) return true;
            const expSec = Number(p.expiresAt.seconds);
            return !isNaN(expSec) && expSec * 1000 >= nowMs;
        })
        .map((p) => ({
            name: p.name || p.packageName || '',
            totalUses: Number(p.totalUses) || 0,
            remainingUses: Number(p.remainingUses) || 0,
            expiresAt: p.expiresAt || null
        }));

    const account = accDoc && accDoc.data
        ? {
            balance: Number(accDoc.data.balance) || 0,
            bonusBalance: Number(accDoc.data.bonusBalance) || 0,
            status: String(accDoc.data.status || 'active')
        }
        : null;

    return {
        patientId,
        name: patientDoc.data.name || '',
        account,
        packages,
        transactions: txPage.docs.map((d) => d.data)
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

        const local8 = parseHkPhone(body && body.phone);
        if (!local8) {
            return jsonResponse({
                error: 'INVALID_PHONE',
                message: '請輸入有效香港手機號碼（8 位數）'
            }, 400);
        }

        const auth = await getAccessToken(env);
        const client = new FirestoreClient(
            auth.token,
            auth.projectId,
            env.FIREBASE_RTDB_URL || ''
        );

        const patientDocs = await findPatients(client, local8);
        const patients = await Promise.all(
            patientDocs.map((d) => buildPatientEntry(client, d))
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
