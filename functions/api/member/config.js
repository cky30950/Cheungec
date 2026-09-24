/* ============================================================
 * GET /api/member/config（公開）
 * ------------------------------------------------------------
 * 回傳 Turnstile site key（公開值，來自 Pages 環境變數
 * TURNSTILE_SITE_KEY）。前端取得後顯式渲染人機驗證元件。
 * Secret key 不會、也不可出現在此回應。
 * ============================================================ */

import { jsonResponse, optionsResponse } from '../backup/lib/http.js';

export const onRequestOptions = () => optionsResponse();

export async function onRequestGet(context) {
    const { env } = context;
    return jsonResponse({
        siteKey: env && env.TURNSTILE_SITE_KEY ? String(env.TURNSTILE_SITE_KEY) : ''
    });
}
