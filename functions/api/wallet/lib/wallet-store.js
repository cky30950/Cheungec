/* ============================================================
 * 會員儲值錢包：Firestore 交易核心
 * ------------------------------------------------------------
 * 所有餘額變更均以 Service Account 經 Firestore 讀寫交易完成：
 *   beginTransaction → batchGet（冪等鍵 + 帳戶）→ commit
 * 客戶端規則對錢包集合一律拒寫；本模組繞過 Rules。
 *
 * 冪等：每個操作帶 idempotencyKey，SHA-256 後對應
 *   walletIdempotency/{hash}；重複請求直接回傳原結果，
 *   病歷重複提交不會重複扣款。
 * ============================================================ */

import { getAccessToken } from '../../backup/lib/google-auth.js';
import {
    FirestoreClient,
    jsObjectToFirestoreFields
} from '../../backup/lib/firestore.js';

const FS_BASE = 'https://firestore.googleapis.com/v1';
const AUTO_ID_ALPHABET =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export class WalletError extends Error {
    constructor(status, code, message) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function round2(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100) / 100;
}

async function sha256Hex(text) {
    const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(String(text))
    );
    return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * 生成 Firestore 風格 20 字 ID（機率上碰撞可忽略），
 * 供交易內建立流水文件（交易中無法用自動 ID 建立）。
 */
export function generateAutoId() {
    const bytes = new Uint8Array(20);
    crypto.getRandomValues(bytes);
    let out = '';
    for (let i = 0; i < 20; i++) {
        out += AUTO_ID_ALPHABET[bytes[i] % AUTO_ID_ALPHABET.length];
    }
    return out;
}

// ── Firestore 原始欄位解析 ──
function rawNumber(fields, key) {
    const v = fields && fields[key];
    if (!v) return 0;
    if (v.doubleValue !== undefined) return Number(v.doubleValue);
    if (v.integerValue !== undefined) return Number(v.integerValue);
    return 0;
}
function rawString(fields, key, fallback = '') {
    const v = fields && fields[key];
    return v && v.stringValue !== undefined ? v.stringValue : fallback;
}

function operatorName(claims) {
    return String(
        (claims && (claims.name || claims.email))
        || (claims && claims.sub)
        || 'staff'
    );
}

// ── 診所會員配置 ──

function normalizeConfig(raw) {
    const cfg = raw && typeof raw === 'object' ? raw : {};
    const tiers = Array.isArray(cfg.topupBonusTiers)
        ? cfg.topupBonusTiers
            .map((t) => ({
                minAmount: round2(t && t.minAmount),
                bonus: round2(t && t.bonus)
            }))
            .filter((t) => t.minAmount > 0 && t.bonus > 0)
            .sort((a, b) => b.minAmount - a.minAmount)
        : [];
    return {
        enabled: cfg.enabled !== false,
        discountItemId: String(cfg.discountItemId || ''),
        topupBonusTiers: tiers,
        deductBonusFirst: cfg.deductBonusFirst !== false
    };
}

/**
 * 讀取診所的會員配置（clinics/{clinicId}.membershipConfig）。
 * claims 無 clinicId 時（超級管理員）取第一間診所；
 * 完全無配置時回傳安全預設值。
 */
export async function getMembershipConfig(env, claims) {
    const auth = await getAccessToken(env);
    const client = new FirestoreClient(
        auth.token,
        auth.projectId,
        env.FIREBASE_RTDB_URL || ''
    );
    let clinicId = claims && claims.clinicId
        ? String(claims.clinicId)
        : '';
    if (!clinicId) {
        const ids = await client.listClinicIds();
        clinicId = ids[0] || '';
    }
    let raw = null;
    if (clinicId) {
        const clinic = await client.getDocument(
            `clinics/${encodeURIComponent(clinicId)}`
        );
        raw = clinic && clinic.data
            ? clinic.data.membershipConfig
            : null;
    }
    return normalizeConfig(raw);
}

function calcTopupBonus(config, amount) {
    if (!config || !config.enabled) return 0;
    const hit = config.topupBonusTiers.find(
        (tier) => amount >= tier.minAmount
    );
    return hit ? hit.bonus : 0;
}

// ── 冪等交易執行器 ──

/**
 * @param {object} env
 * @param {string} idemKey 冪等鍵（必填）
 * @param {function} resolveExtraDocs
 *   ({docsBase, projectId}) => string[] 需在交易內讀取的文件全名
 * @param {function} build
 *   ({byName: Map<string,object>, docsBase: string, projectId: string})
 *   => {writes: Array, result: object}
 * @returns {Promise<object>} result
 */
async function runIdempotentTransaction(env, idemKey, resolveExtraDocs, build) {
    if (!idemKey || typeof idemKey !== 'string') {
        throw new WalletError(400, 'MISSING_IDEMPOTENCY_KEY', '缺少 idempotencyKey');
    }
    const access = await getAccessToken(env);
    const pid = access.projectId;
    const docsBase =
        `${FS_BASE}/projects/${pid}/databases/(default)/documents`;
    const headers = {
        'Authorization': `Bearer ${access.token}`,
        'Content-Type': 'application/json'
    };
    const idemName =
        `${docsBase}/walletIdempotency/${await sha256Hex(idemKey)}`;
    const extraDocNames = typeof resolveExtraDocs === 'function'
        ? [].concat(resolveExtraDocs({ docsBase, projectId: pid }) || [])
        : [];
    const docNames = [idemName].concat(extraDocNames);

    const rollback = async (transaction) => {
        try {
            await fetch(`${docsBase}:rollback`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ transaction })
            });
        } catch (_e) { /* 交易逾時後端自動回收 */ }
    };

    for (let attempt = 0; attempt < 3; attempt++) {
        const beginRes = await fetch(`${docsBase}:beginTransaction`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ options: { readWrite: {} } })
        });
        if (!beginRes.ok) {
            const text = await beginRes.text();
            if (beginRes.status >= 500 && attempt < 2) {
                await sleep(120 * (attempt + 1));
                continue;
            }
            throw new WalletError(500, 'WALLET_TX_BEGIN_FAILED',
                `開始交易失敗 (HTTP ${beginRes.status}): ${text.slice(0, 150)}`);
        }
        const transaction = (await beginRes.json()).transaction;

        const batchRes = await fetch(`${docsBase}/batchGet`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ documents: docNames, transaction })
        });
        if (!batchRes.ok) {
            const text = await batchRes.text();
            await rollback(transaction);
            if (batchRes.status >= 500 && attempt < 2) {
                await sleep(120 * (attempt + 1));
                continue;
            }
            throw new WalletError(500, 'WALLET_TX_READ_FAILED',
                `交易讀取失敗 (HTTP ${batchRes.status}): ${text.slice(0, 150)}`);
        }

        const rows = await batchRes.json();
        const byName = new Map();
        let idemFields = null;
        for (const row of Array.isArray(rows) ? rows : []) {
            const name = row && row.found
                ? row.found.name
                : (row && row.missing);
            if (name) byName.set(name, row.found ? row.found.fields || {} : null);
        }
        idemFields = byName.get(idemName);

        // 冪等命中：回傳原結果，不再提交
        if (idemFields && idemFields.result) {
            await rollback(transaction);
            try {
                return JSON.parse(idemFields.result.stringValue || '{}');
            } catch (_e) {
                return { ok: true, idempotent: true };
            }
        }

        let built;
        try {
            built = await build({ byName, docsBase, projectId: pid });
        } catch (error) {
            await rollback(transaction);
            throw error;
        }

        // 冪等記錄寫在最後，內存處理結果
        const result = built.result;
        const writes = (built.writes || []).concat([{
            update: {
                name: idemName,
                fields: {
                    result: { stringValue: JSON.stringify(result) },
                    at: { stringValue: new Date().toISOString() }
                }
            }
        }]);

        const commitRes = await fetch(`${docsBase}:commit`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ transaction, writes })
        });
        if (!commitRes.ok) {
            const text = await commitRes.text();
            if (commitRes.status === 409 && attempt < 2) {
                await sleep(120 * (attempt + 1));
                continue;
            }
            throw new WalletError(500, 'WALLET_TX_COMMIT_FAILED',
                `交易提交失敗 (HTTP ${commitRes.status}): ${text.slice(0, 150)}`);
        }

        return result;
    }
    throw new WalletError(500, 'WALLET_TX_BUSY', '系統忙碌中，請重試');
}

// ── 流水文件建構 ──

function baseTxRecord(patientId, claims, key, at) {
    return {
        patientId,
        idempotencyKey: key,
        operatorUid: claims.sub,
        operatorName: operatorName(claims),
        at,
        // 備份系統以 updatedAt 做增量同步；交易不可變，updatedAt 即建立時間
        updatedAt: at,
        consultationId: '',
        appointmentId: '',
        note: ''
    };
}

function accountDocName(docsBase, patientId) {
    return `${docsBase}/patientWalletAccounts/${encodeURIComponent(patientId)}`;
}

function newTxWrite(docsBase, record) {
    const name = `${docsBase}/patientWalletTransactions/${generateAutoId()}`;
    return {
        write: { update: { name, fields: jsObjectToFirestoreFields(record) } },
        txId: name.split('/').pop()
    };
}

// ── 操作：充值 ──

/**
 * 充值。贈送額由伺服器依配置級距計算，客戶端不可指定。
 * @param {object} params {patientId, amount, appointmentId?, note?, idempotencyKey}
 */
export async function walletTopup(env, claims, params) {
    const patientId = String(params.patientId);
    const amount = round2(params.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
        throw new WalletError(400, 'INVALID_AMOUNT', '充值金額必須大於 0');
    }
    const config = await getMembershipConfig(env, claims);
    const bonusAmount = config.enabled
        ? round2(calcTopupBonus(config, amount))
        : 0;

    return runIdempotentTransaction(
        env,
        params.idempotencyKey,
        ({ docsBase }) => [accountDocName(docsBase, patientId)],
        ({ byName, docsBase }) => {
            const name = accountDocName(docsBase, patientId);
            const accFields = byName.get(name);
            const at = new Date().toISOString();
            const existed = !!accFields;
            const balance = round2(rawNumber(accFields, 'balance') + amount);
            const bonusBalance =
                round2(rawNumber(accFields, 'bonusBalance') + bonusAmount);

            const accountObj = {
                patientId,
                status: 'active',
                balance,
                bonusBalance,
                currency: 'HKD',
                createdAt: existed
                    ? rawString(accFields, 'createdAt') || at
                    : at,
                createdBy: existed
                    ? rawString(accFields, 'createdBy') || operatorName(claims)
                    : operatorName(claims),
                updatedAt: at
            };

            const txRecords = [];
            const topupTx = Object.assign(
                baseTxRecord(patientId, claims, params.idempotencyKey, at),
                {
                    type: 'topup',
                    amount,
                    appliesTo: 'balance',
                    balanceAfter: balance,
                    bonusBalanceAfter: bonusBalance
                }
            );
            if (params.appointmentId) topupTx.appointmentId = String(params.appointmentId);
            if (params.note) topupTx.note = String(params.note).slice(0, 300);
            txRecords.push(topupTx);

            if (bonusAmount > 0) {
                txRecords.push(Object.assign(
                    baseTxRecord(patientId, claims, params.idempotencyKey, at),
                    {
                        type: 'topupBonus',
                        amount: bonusAmount,
                        appliesTo: 'bonus',
                        balanceAfter: balance,
                        bonusBalanceAfter: bonusBalance
                    }
                ));
            }

            const txWrites = txRecords.map((record) => newTxWrite(docsBase, record));
            const writes = [{
                update: {
                    name,
                    fields: jsObjectToFirestoreFields(accountObj)
                }
            }].concat(txWrites.map((t) => t.write));

            return {
                writes,
                result: {
                    ok: true,
                    balance,
                    bonusBalance,
                    bonusAmount,
                    txId: txWrites[0] ? txWrites[0].txId : ''
                }
            };
        }
    );
}

// ── 操作：扣款（看診付款）──

/**
 * @param {object} params {patientId, amount, consultationId, appointmentId?, idempotencyKey}
 *   建議冪等鍵：pay:{consultationId}
 */
export async function walletPayment(env, claims, params) {
    const patientId = String(params.patientId);
    const amount = round2(params.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
        throw new WalletError(400, 'INVALID_AMOUNT', '付款金額必須大於 0');
    }
    const consultationId = String(params.consultationId || '');
    if (!consultationId) {
        throw new WalletError(400, 'MISSING_CONSULTATION', '缺少 consultationId');
    }

    return runIdempotentTransaction(
        env,
        params.idempotencyKey,
        ({ docsBase }) => [accountDocName(docsBase, patientId)],
        ({ byName, docsBase }) => {
            const name = accountDocName(docsBase, patientId);
            const accFields = byName.get(name);
            if (!accFields) {
                throw new WalletError(402, 'WALLET_NOT_FOUND',
                    '病人尚未開立儲值帳戶');
            }
            const status = rawString(accFields, 'status', 'active');
            if (status !== 'active') {
                throw new WalletError(402, 'WALLET_NOT_ACTIVE',
                    `儲值帳戶已${status === 'frozen' ? '凍結' : '關閉'}，無法付款`);
            }
            const bal = round2(rawNumber(accFields, 'balance'));
            const bbal = round2(rawNumber(accFields, 'bonusBalance'));
            if (round2(bal + bbal) < amount) {
                throw new WalletError(402, 'INSUFFICIENT_FUNDS',
                    `儲值餘額不足（可用 HK$${round2(bal + bbal).toFixed(2)}）`);
            }

            // 扣款順序：先贈送額後本金
            const fromBonus = round2(Math.min(bbal, amount));
            const fromBalance = round2(amount - fromBonus);
            const newBalance = round2(bal - fromBalance);
            const newBonus = round2(bbal - fromBonus);
            const at = new Date().toISOString();

            const accountObj = {
                patientId,
                status,
                balance: newBalance,
                bonusBalance: newBonus,
                currency: rawString(accFields, 'currency', 'HKD'),
                createdAt: rawString(accFields, 'createdAt') || at,
                createdBy: rawString(accFields, 'createdBy') || operatorName(claims),
                updatedAt: at
            };

            const appliesTo = fromBalance > 0 && fromBonus > 0
                ? 'mixed'
                : (fromBalance > 0 ? 'balance' : 'bonus');
            const txRecord = Object.assign(
                baseTxRecord(patientId, claims, params.idempotencyKey, at),
                {
                    type: 'payment',
                    amount: -amount,
                    appliesTo,
                    fromBalance,
                    fromBonus,
                    balanceAfter: newBalance,
                    bonusBalanceAfter: newBonus,
                    consultationId
                }
            );
            if (params.appointmentId) {
                txRecord.appointmentId = String(params.appointmentId);
            }
            const txBuilt = newTxWrite(docsBase, txRecord);

            return {
                writes: [
                    { update: { name, fields: jsObjectToFirestoreFields(accountObj) } },
                    txBuilt.write
                ],
                result: {
                    ok: true,
                    balance: newBalance,
                    bonusBalance: newBonus,
                    fromBalance,
                    fromBonus,
                    txId: txBuilt.txId
                }
            };
        }
    );
}

// ── 操作：退款 ──

/**
 * 全額或部分退還某診症單的儲值付款。
 * 需管理員；按原 payment 流水的本金/贈額比例回補。
 * @param {object} params {patientId, consultationId, amount?, note?, idempotencyKey}
 */
export async function walletRefund(env, claims, params) {
    const patientId = String(params.patientId);
    const consultationId = String(params.consultationId || '');
    if (!consultationId) {
        throw new WalletError(400, 'MISSING_CONSULTATION', '缺少 consultationId');
    }

    // 交易外查詢原付款流水（單欄位查詢，不需複合索引）
    const auth = await getAccessToken(env);
    const client = new FirestoreClient(
        auth.token,
        auth.projectId,
        env.FIREBASE_RTDB_URL || ''
    );
    const found = await client.queryCollection({
        collectionId: 'patientWalletTransactions',
        where: {
            fieldFilter: {
                field: { fieldPath: 'consultationId' },
                op: 'EQUAL',
                value: { stringValue: consultationId }
            }
        },
        limit: 50
    });
    const payments = found.docs.filter((d) => d.data && d.data.type === 'payment');
    if (!payments.length) {
        throw new WalletError(404, 'PAYMENT_NOT_FOUND',
            '找不到此診症單的儲值付款記錄');
    }
    let paidBalance = 0;
    let paidBonus = 0;
    payments.forEach((d) => {
        paidBalance += Number(d.data.fromBalance) || 0;
        paidBonus += Number(d.data.fromBonus) || 0;
    });
    paidBalance = round2(paidBalance);
    paidBonus = round2(paidBonus);
    const totalPaid = round2(paidBalance + paidBonus);

    let want = params.amount !== undefined && params.amount !== null
        ? round2(params.amount)
        : totalPaid;
    if (want <= 0) throw new WalletError(400, 'INVALID_AMOUNT', '退款金額必須大於 0');
    if (want > totalPaid) {
        throw new WalletError(400, 'REFUND_EXCEEDS_PAYMENT',
            `退款金額不可超過原付款 HK$${totalPaid.toFixed(2)}`);
    }
    const scale = totalPaid > 0 ? want / totalPaid : 0;
    const refundBonus = round2(paidBonus * scale);
    const refundBalance = round2(want - refundBonus);

    return runIdempotentTransaction(
        env,
        params.idempotencyKey,
        ({ docsBase }) => [accountDocName(docsBase, patientId)],
        ({ byName, docsBase }) => {
            const name = accountDocName(docsBase, patientId);
            const accFields = byName.get(name);
            if (!accFields) {
                throw new WalletError(404, 'WALLET_NOT_FOUND', '找不到儲值帳戶');
            }
            const newBalance = round2(rawNumber(accFields, 'balance') + refundBalance);
            const newBonus = round2(rawNumber(accFields, 'bonusBalance') + refundBonus);
            const at = new Date().toISOString();
            const status = rawString(accFields, 'status', 'active');

            const accountObj = {
                patientId,
                status,
                balance: newBalance,
                bonusBalance: newBonus,
                currency: rawString(accFields, 'currency', 'HKD'),
                createdAt: rawString(accFields, 'createdAt') || at,
                createdBy: rawString(accFields, 'createdBy') || operatorName(claims),
                updatedAt: at
            };

            const txRecord = Object.assign(
                baseTxRecord(patientId, claims, params.idempotencyKey, at),
                {
                    type: 'refund',
                    amount: want,
                    appliesTo: refundBalance > 0 && refundBonus > 0
                        ? 'mixed'
                        : (refundBalance > 0 ? 'balance' : 'bonus'),
                    fromBalance: refundBalance,
                    fromBonus: refundBonus,
                    balanceAfter: newBalance,
                    bonusBalanceAfter: newBonus,
                    consultationId
                }
            );
            if (params.note) txRecord.note = String(params.note).slice(0, 300);
            const txBuilt = newTxWrite(docsBase, txRecord);

            return {
                writes: [
                    { update: { name, fields: jsObjectToFirestoreFields(accountObj) } },
                    txBuilt.write
                ],
                result: {
                    ok: true,
                    balance: newBalance,
                    bonusBalance: newBonus,
                    refundedBalance: refundBalance,
                    refundedBonus: refundBonus,
                    txId: txBuilt.txId
                }
            };
        }
    );
}

// ── 操作：人工調整 ──

/**
 * 需管理員；強制填原因。新餘額不得為負。
 * @param {object} params {patientId, deltaBalance?, deltaBonus?, reason, idempotencyKey}
 */
export async function walletAdjust(env, claims, params) {
    const patientId = String(params.patientId);
    const deltaBalance = round2(params.deltaBalance);
    const deltaBonus = round2(params.deltaBonus);
    if (deltaBalance === 0 && deltaBonus === 0) {
        throw new WalletError(400, 'NO_CHANGE', '調整金額不得全部為 0');
    }
    if (Math.abs(deltaBalance) > 100000 || Math.abs(deltaBonus) > 100000) {
        throw new WalletError(400, 'AMOUNT_TOO_LARGE', '單次調整金額過大');
    }
    const reason = String(params.reason || '').trim();
    if (!reason) {
        throw new WalletError(400, 'REASON_REQUIRED', '必須填寫調整原因');
    }

    return runIdempotentTransaction(
        env,
        params.idempotencyKey,
        ({ docsBase }) => [accountDocName(docsBase, patientId)],
        ({ byName, docsBase }) => {
            const name = accountDocName(docsBase, patientId);
            const accFields = byName.get(name);
            if (!accFields) {
                throw new WalletError(404, 'WALLET_NOT_FOUND', '找不到儲值帳戶');
            }
            const newBalance = round2(rawNumber(accFields, 'balance') + deltaBalance);
            const newBonus = round2(rawNumber(accFields, 'bonusBalance') + deltaBonus);
            if (newBalance < 0 || newBonus < 0) {
                throw new WalletError(400, 'NEGATIVE_BALANCE',
                    '調整後餘額不可為負數');
            }
            const at = new Date().toISOString();
            const status = rawString(accFields, 'status', 'active');

            const accountObj = {
                patientId,
                status,
                balance: newBalance,
                bonusBalance: newBonus,
                currency: rawString(accFields, 'currency', 'HKD'),
                createdAt: rawString(accFields, 'createdAt') || at,
                createdBy: rawString(accFields, 'createdBy') || operatorName(claims),
                updatedAt: at
            };

            const appliesTo = deltaBalance !== 0 && deltaBonus !== 0
                ? 'mixed'
                : (deltaBalance !== 0 ? 'balance' : 'bonus');
            const txRecord = Object.assign(
                baseTxRecord(patientId, claims, params.idempotencyKey, at),
                {
                    type: 'adjust',
                    amount: round2(deltaBalance + deltaBonus),
                    appliesTo,
                    deltaBalance,
                    deltaBonus,
                    balanceAfter: newBalance,
                    bonusBalanceAfter: newBonus,
                    note: reason.slice(0, 300)
                }
            );
            const txBuilt = newTxWrite(docsBase, txRecord);

            return {
                writes: [
                    { update: { name, fields: jsObjectToFirestoreFields(accountObj) } },
                    txBuilt.write
                ],
                result: {
                    ok: true,
                    balance: newBalance,
                    bonusBalance: newBonus,
                    txId: txBuilt.txId
                }
            };
        }
    );
}

// ── 操作：帳戶狀態（凍結/關閉/復用）──

/**
 * 需管理員。非 active 狀態須附說明。
 * @param {object} params {patientId, status, note?, idempotencyKey}
 */
export async function walletSetStatus(env, claims, params) {
    const patientId = String(params.patientId);
    const status = String(params.status || '');
    if (!['active', 'frozen', 'closed'].includes(status)) {
        throw new WalletError(400, 'INVALID_STATUS', '狀態必須為 active/frozen/closed');
    }
    if (status !== 'active' && !String(params.note || '').trim()) {
        throw new WalletError(400, 'NOTE_REQUIRED', '凍結或關閉帳戶必須填寫說明');
    }

    return runIdempotentTransaction(
        env,
        params.idempotencyKey,
        ({ docsBase }) => [accountDocName(docsBase, patientId)],
        ({ byName, docsBase }) => {
            const name = accountDocName(docsBase, patientId);
            const accFields = byName.get(name);
            if (!accFields) {
                throw new WalletError(404, 'WALLET_NOT_FOUND', '找不到儲值帳戶');
            }
            const balance = round2(rawNumber(accFields, 'balance'));
            const bonusBalance = round2(rawNumber(accFields, 'bonusBalance'));
            if (status === 'closed' && round2(balance + bonusBalance) > 0) {
                throw new WalletError(400, 'BALANCE_REMAINING',
                    '帳戶仍有餘額，請先退款或調整後再關閉');
            }
            const at = new Date().toISOString();

            const accountObj = {
                patientId,
                status,
                balance,
                bonusBalance,
                currency: rawString(accFields, 'currency', 'HKD'),
                createdAt: rawString(accFields, 'createdAt') || at,
                createdBy: rawString(accFields, 'createdBy') || operatorName(claims),
                updatedAt: at
            };

            const txRecord = Object.assign(
                baseTxRecord(patientId, claims, params.idempotencyKey, at),
                {
                    type: 'adjust',
                    amount: 0,
                    appliesTo: 'mixed',
                    deltaBalance: 0,
                    deltaBonus: 0,
                    balanceAfter: balance,
                    bonusBalanceAfter: bonusBalance,
                    note: (`帳戶狀態變更為 ${status}` +
                        (params.note ? `：${String(params.note).trim()}` : '')).slice(0, 300)
                }
            );
            const txBuilt = newTxWrite(docsBase, txRecord);

            return {
                writes: [
                    { update: { name, fields: jsObjectToFirestoreFields(accountObj) } },
                    txBuilt.write
                ],
                result: { ok: true, status, balance, bonusBalance }
            };
        }
    );
}
