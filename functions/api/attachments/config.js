/* ============================================================
 * GET /api/attachments/config
 * ------------------------------------------------------------
 * 回傳附件功能公開設定（需 Bearer Firebase ID Token）：
 *   { signedGet, getTtlSec, publicBase, maxBytes, configured }
 * signedGet=true：圖片改走短 TTL 簽章 GET URL（/api/attachments/
 * sign 批量換發），publicBase 僅作關閉公開網域過渡期的降級備案。
 * configured 改以 R2 S3 憑證是否齊全判定（不再依賴公開網域）。
 * ============================================================ */

import { authenticateStaff } from './lib/auth.js';
import { jsonResponse, optionsResponse } from '../backup/lib/http.js';
import { DEFAULT_GET_TTL_SEC, MAX_GET_TTL_SEC } from './lib/attachments-store.js';

const DEFAULT_MAX_BYTES = 15 * 1024 * 1024;

export const onRequestOptions = () => optionsResponse();

export async function onRequestGet(context) {
    const { request, env } = context;
    try {
        await authenticateStaff(request, env);
        const maxBytes = Number(env.ATTACHMENT_MAX_BYTES) > 0
            ? Number(env.ATTACHMENT_MAX_BYTES)
            : DEFAULT_MAX_BYTES;
        const publicBase = String(env.R2_PUBLIC_BASE || '').replace(/\/+$/, '');
        const configured = Boolean(
            String(env.R2_ACCOUNT_ID || '').trim() &&
            String(env.R2_ACCESS_KEY_ID || '').trim() &&
            String(env.R2_SECRET_ACCESS_KEY || '').trim() &&
            String(env.R2_ATTACHMENTS_BUCKET || '').trim()
        );
        let getTtlSec = Number(env.ATTACHMENT_GET_URL_TTL) > 0
            ? Math.floor(Number(env.ATTACHMENT_GET_URL_TTL))
            : DEFAULT_GET_TTL_SEC;
        getTtlSec = Math.min(Math.max(getTtlSec, 60), MAX_GET_TTL_SEC);
        return jsonResponse({
            signedGet: true,
            getTtlSec,
            publicBase,
            maxBytes,
            configured
        });
    } catch (error) {
        const status = Number(error.status) > 0 ? Number(error.status) : 500;
        return jsonResponse({
            error: status === 401 ? 'UNAUTHORIZED' : 'CONFIG_FAILED',
            message: error.message || '讀取附件設定失敗'
        }, status);
    }
}
