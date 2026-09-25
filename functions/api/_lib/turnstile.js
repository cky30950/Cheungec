/* ============================================================
 * Turnstile 伺服端驗證（共用）
 * ------------------------------------------------------------
 * 供所有「無 Firebase 登入」的公開寫入端點使用：客戶端提交
 * turnstile token，本模組以 Pages Secret TURNSTILE_SECRET_KEY
 * 向 Cloudflare siteverify 驗證。
 *
 * 注意：Firestore Security Rules 無法做此驗證，凡需要人機
 * 驗證的匿名寫入都必須經 Pages Function 以 Service Account 寫入。
 * ============================================================ */

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * 驗證客戶端 Turnstile token。
 *
 * @param {string} token 客戶端回呼取得的 turnstile token
 * @param {string} ip 客戶端 IP（CF-Connecting-IP）；可為空字串
 * @param {object} env Pages 環境（須含 TURNSTILE_SECRET_KEY）
 * @returns {Promise<boolean>} 驗證通過回 true；缺 token／驗證失敗回 false
 * @throws {Error} TURNSTILE_NOT_CONFIGURED（帶 status=500、clientMessage）
 */
export async function verifyTurnstile(token, ip, env) {
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
        response: String(token)
    });
    if (ip && ip !== 'unknown') form.set('remoteip', ip);

    try {
        const res = await fetch(SITEVERIFY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: form.toString()
        });
        const data = await res.json();
        return !!(data && data.success === true);
    } catch (error) {
        console.warn('turnstile siteverify request failed:', error.message);
        return false;
    }
}
