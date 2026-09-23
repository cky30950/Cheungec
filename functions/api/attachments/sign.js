/* ============================================================
 * POST /api/attachments/sign
 * ------------------------------------------------------------
 * 員工端批量換取病歷物件的短 TTL R2 presigned GET URL。
 * Bucket 收斂為私營後，前端不再持有永久公開網址：
 *   列表縮圖、lightbox、病歷內嵌圖、代拍轉收圖一律先帶 key
 *   呼叫本端點換簽章 URL（可直接放 <img src>，無需標頭）。
 *
 * 需 Bearer Firebase ID Token（claims 路徑零 Firestore 讀取）。
 * 只做 key 嚴格白名單驗證，不查中繼文件：通過員工認證者本來
 * 就有全部 patientAttachments 的讀權，簽章端點不應放大成本。
 *
 * 請求：{ "keys": ["attachments/.../original.jpg", ...] }（≤100）
 * 回應：{ "urls": { key: url, ... }, "expiresAt": ISO, "ttlSec": n }
 * ============================================================ */

import { authenticateStaff } from './lib/auth.js';
import { jsonResponse, optionsResponse } from '../backup/lib/http.js';
import { signGetUrls, StoreError } from './lib/attachments-store.js';

export const onRequestOptions = () => optionsResponse();

export async function onRequestPost(context) {
    const { request, env } = context;
    try {
        await authenticateStaff(request, env);

        let body;
        try {
            body = await request.json();
        } catch (_e) {
            return jsonResponse({
                error: 'INVALID_REQUEST',
                message: '請求內容必須為 JSON'
            }, 400);
        }

        const result = await signGetUrls(env, body && body.keys);
        return jsonResponse(result);
    } catch (error) {
        if (error instanceof StoreError) {
            return jsonResponse({ error: error.code, message: error.message }, error.status);
        }
        const status = Number(error.status) > 0 ? Number(error.status) : 500;
        return jsonResponse({
            error: status === 401 ? 'UNAUTHORIZED' : 'SIGN_URLS_FAILED',
            message: error.message || '簽發讀取 URL 失敗'
        }, status);
    }
}
