/* ============================================================
 * POST /api/inquiry/submit（公開，無需登入）
 * ------------------------------------------------------------
 * 病人遞交中醫預診表單。先驗 Turnstile 人機驗證，通過後由
 * Service Account 寫入 inquiries（客戶端不可直接寫 Firestore），
 * 再於伺服端觸發員工新預診推播。
 *
 * 請求：
 *   { patientName, firstVisit, medicalProfile?, history, allergies,
 *     data, turnstileToken }
 * 回應：{ ok: true, id }
 *
 * 防濫用：
 *   - 匿名端點每 IP 每分鐘限流（inquiry 桶，預設 8 次）
 *   - Turnstile token 經 siteverify 驗證，必要欄位
 *   - 所有欄位設長度／大小上限；createdAt、expireAt 由伺服器時鐘產生
 * ============================================================ */

import { getAccessToken } from '../backup/lib/google-auth.js';
import { jsObjectToFirestoreFields } from '../backup/lib/firestore.js';
import { jsonResponse, optionsResponse } from '../backup/lib/http.js';
import { verifyTurnstile } from '../_lib/turnstile.js';
import { enforceAnonRateLimit, getClientIp } from '../_lib/rate-limit.js';
import { notifyNewInquiry } from '../push/lib/inquiry-notify.js';

// ── 輸入限制 ──
const MAX_NAME = 100;
const MAX_TEXT = 5000;
const MAX_PROFILE_JSON = 100 * 1024;
const MAX_DATA_JSON = 200 * 1024;
const TTL_MS = 24 * 60 * 60 * 1000; // 文件 24 小時後過期

function isPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// 字串欄位校驗：非字串或過長回 null
function boundedString(v, max) {
    if (typeof v !== 'string') return null;
    return v.length > max ? null : v;
}

export const onRequestOptions = () => optionsResponse();

export async function onRequestPost(context) {
    const { request, env } = context;
    try {
        const ip = getClientIp(request) || 'unknown';

        const limited = await enforceAnonRateLimit(request, env, 'inquiry');
        if (limited) return limited;

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

        const patientName = boundedString(body && body.patientName, MAX_NAME);
        if (!patientName || !patientName.trim()) {
            return jsonResponse({ error: 'INVALID_NAME', message: '請填寫姓名' }, 400);
        }

        const firstVisit = body && body.firstVisit === true;

        const history = boundedString(body && body.history, MAX_TEXT);
        const allergies = boundedString(body && body.allergies, MAX_TEXT);
        if (history === null || allergies === null) {
            return jsonResponse({ error: 'TEXT_TOO_LONG', message: '病史／過敏資料過長' }, 400);
        }

        let medicalProfile = null;
        if (body && body.medicalProfile !== null && body.medicalProfile !== undefined) {
            if (!isPlainObject(body.medicalProfile)) {
                return jsonResponse({ error: 'INVALID_PROFILE', message: '病史資料格式不正確' }, 400);
            }
            if (JSON.stringify(body.medicalProfile).length > MAX_PROFILE_JSON) {
                return jsonResponse({ error: 'PROFILE_TOO_LARGE', message: '病史資料過大，請精簡內容' }, 400);
            }
            medicalProfile = body.medicalProfile;
        }

        if (!isPlainObject(body && body.data)) {
            return jsonResponse({ error: 'INVALID_DATA', message: '預診資料格式不正確' }, 400);
        }
        if (JSON.stringify(body.data).length > MAX_DATA_JSON) {
            return jsonResponse({ error: 'DATA_TOO_LARGE', message: '預診資料過大，請精簡內容' }, 400);
        }
        const data = body.data;

        // createdAt／expireAt 一律用伺服器時鐘，客戶端不可指定
        const now = new Date();
        const fields = jsObjectToFirestoreFields({
            patientName,
            firstVisit,
            medicalProfile,
            history,
            allergies,
            data,
            createdAt: now,
            expireAt: new Date(now.getTime() + TTL_MS)
        });

        const auth = await getAccessToken(env);
        const url = `https://firestore.googleapis.com/v1/projects/${auth.projectId}`
            + '/databases/(default)/documents/inquiries';
        const writeRes = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${auth.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ fields })
        });
        const text = await writeRes.text();
        if (!writeRes.ok) {
            console.error('inquiry create failed:', writeRes.status, text.slice(0, 300));
            return jsonResponse({ error: 'SUBMIT_FAILED', message: '遞交失敗，請稍後再試' }, 502);
        }
        // 文件 ID 取自回傳 name：projects/.../documents/inquiries/<id>
        const id = String((JSON.parse(text) || {}).name || '').split('/').pop() || '';

        // 於伺服端觸發員工推播；失敗不影響遞交結果
        try {
            await notifyNewInquiry(env, id);
        } catch (notifyErr) {
            console.warn('inquiry notify failed:', notifyErr && notifyErr.message);
        }

        return jsonResponse({ ok: true, id });
    } catch (error) {
        if (error && error.message === 'TURNSTILE_NOT_CONFIGURED') {
            return jsonResponse({
                error: 'TURNSTILE_NOT_CONFIGURED',
                message: error.clientMessage || '人機驗證未完成設定'
            }, error.status || 500);
        }
        console.error('inquiry submit failed:', error);
        return jsonResponse({
            error: 'SUBMIT_FAILED',
            message: error && error.message ? error.message : '遞交服務發生錯誤'
        }, 500);
    }
}
