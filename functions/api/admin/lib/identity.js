/* ============================================================
 * Identity Toolkit Admin REST 客戶端（Cloudflare Pages Functions）
 * ------------------------------------------------------------
 * 以 Service Account OAuth token 呼叫 v1 管理端點（與 firebase-admin
 * 使用同一組 API）：
 *   POST /v1/projects/{pid}/accounts:update   設定 custom claims／撤銷 token
 *   POST /v1/projects/{pid}/accounts:delete   刪除 Auth 帳號
 *   GET  /v1/projects/{pid}/accounts:batchGet 分頁列出所有帳號（bootstrap 用）
 *
 * 需要 scope：https://www.googleapis.com/auth/identitytoolkit.admin
 * （已加諸 backup/lib/google-auth.js 的 FIREBASE_SCOPES）
 * ============================================================ */

const IDENTITY_BASE = 'https://identitytoolkit.googleapis.com/v1/projects';

export class IdentityClient {
    constructor(accessToken, projectId) {
        this.token = accessToken;
        this.projectId = projectId;
    }

    _base() {
        return `${IDENTITY_BASE}/${encodeURIComponent(this.projectId)}/accounts`;
    }

    async _post(path, body) {
        const response = await fetch(`${this._base()}${path}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body || {})
        });
        const text = await response.text();
        let data = {};
        try {
            data = text ? JSON.parse(text) : {};
        } catch (_e) {
            data = { raw: text };
        }
        if (!response.ok) {
            const message = data && data.error && data.error.message
                ? data.error.message
                : `HTTP ${response.status}`;
            const err = new Error(`Identity Toolkit ${path} 失敗: ${message}`);
            err.status = response.status;
            err.apiError = data;
            throw err;
        }
        return data;
    }

    /**
     * 更新帳號。可同時設定 custom claims 及／或撤銷 refresh token。
     * @param {string} localId Firebase Auth uid
     * @param {object} options
     * @param {string} [options.customAttributes] JSON 字串（claims，總大小 ≤ 1000 bytes）
     * @param {number} [options.validSince] Unix 秒；設定後早於此時間簽發的
     *   refresh token／工作階段失效（ID token 在到期前仍有效，故另以 active claim 阻擋）
     */
    async updateAccount(localId, options = {}) {
        if (!localId) throw new Error('updateAccount: 缺少 localId');
        const body = { localId: String(localId) };
        if (typeof options.customAttributes === 'string') {
            body.customAttributes = options.customAttributes;
        }
        if (options.validSince) {
            // API 要求字串形態的 Unix 秒
            body.validSince = String(Math.floor(Number(options.validSince)));
        }
        return this._post(':update', body);
    }

    /**
     * 以管理端 API 建立電郵／密碼帳號（不會影響管理員自己的瀏覽器工作階段）。
     * @param {object} props {email, password, displayName}
     * @returns {Promise<{uid:string, email:string}>}
     */
    async createEmailAccount(props = {}) {
        const email = String(props.email || '').trim();
        const password = String(props.password || '');
        if (!email || !password) {
            const err = new Error('createEmailAccount: 缺少 email 或 password');
            err.status = 400;
            throw err;
        }
        const account = { email, password };
        if (props.displayName) account.displayName = String(props.displayName).slice(0, 100);
        const data = await this._post(':batchCreate', { users: [account] });
        const created = data.users && data.users[0] ? data.users[0] : {};
        if (!created.localId) {
            const err = new Error('batchCreate 未回傳 localId');
            err.status = 502;
            err.apiError = data;
            throw err;
        }
        return { uid: String(created.localId), email };
    }

    /**
     * 刪除 Auth 帳號。
     * 帳號不存在（USER_NOT_FOUND / 404）視為成功（冪等）。
     */
    async deleteAccount(localId) {
        if (!localId) throw new Error('deleteAccount: 缺少 localId');
        try {
            return await this._post(':delete', { localId: String(localId) });
        } catch (error) {
            const code = error.apiError && error.apiError.error && error.apiError.error.message;
            if (error.status === 404 || /USER_NOT_FOUND/i.test(String(code || ''))) {
                return { localId, notFound: true };
            }
            throw error;
        }
    }

    /**
     * 分頁列出專案內所有 Auth 帳號。
     * @returns {Promise<{users: Array, nextPageToken: string}>}
     */
    async batchGet(maxResults = 500, pageToken = '') {
        const params = new URLSearchParams({ maxResults: String(maxResults) });
        if (pageToken) params.set('nextPageToken', pageToken);
        const response = await fetch(`${this._base()}:batchGet?${params.toString()}`, {
            headers: { 'Authorization': `Bearer ${this.token}` }
        });
        const data = await response.json();
        if (!response.ok) {
            const message = data && data.error && data.error.message
                ? data.error.message
                : `HTTP ${response.status}`;
            throw new Error(`Identity Toolkit accounts:batchGet 失敗: ${message}`);
        }
        return {
            users: Array.isArray(data.users) ? data.users : [],
            nextPageToken: data.nextPageToken || ''
        };
    }
}

/**
 * 安全地把 claims 物件序列化成 Identity Toolkit 要求的 JSON 字串。
 * 超出 1000 bytes 時剔除描述性欄位，仍過大則拋錯。
 */
export function serializeCustomAttributes(claims) {
    const byteSize = (s) => new TextEncoder().encode(s).length;
    const json = JSON.stringify(claims || {});
    if (byteSize(json) <= 1000) return json;
    // 移除不影響授權判斷的描述性欄位後重試
    const minimal = {
        staff: claims.staff,
        active: claims.active,
        admin: claims.admin,
        userId: claims.userId,
        clinicId: claims.clinicId,
        position: claims.position
    };
    const minJson = JSON.stringify(minimal);
    if (byteSize(minJson) <= 1000) return minJson;
    throw new Error('Custom claims 超出 1000 bytes 上限');
}
