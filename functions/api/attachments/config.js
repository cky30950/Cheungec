/* ============================================================
 * GET /api/attachments/config
 * ------------------------------------------------------------
 * 回傳附件功能公開設定（需 Bearer Firebase ID Token）：
 *   { publicBase, maxBytes, configured }
 * publicBase 為 R2 public custom domain 網址（無結尾斜線），
 * 未設定時為空字串、configured=false，前端改顯示設定提示。
 * ============================================================ */

import { authenticateStaff } from './lib/auth.js';
import { jsonResponse, optionsResponse } from '../backup/lib/http.js';

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
        return jsonResponse({
            publicBase,
            maxBytes,
            configured: Boolean(publicBase)
        });
    } catch (error) {
        const status = Number(error.status) > 0 ? Number(error.status) : 500;
        return jsonResponse({
            error: status === 401 ? 'UNAUTHORIZED' : 'CONFIG_FAILED',
            message: error.message || '讀取附件設定失敗'
        }, status);
    }
}
