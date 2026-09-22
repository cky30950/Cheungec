/* ============================================================
 * Identity Toolkit Admin REST 客戶端（Cloudflare Pages Functions）
 * ------------------------------------------------------------
 * 以 Service Account OAuth token 呼叫 v1 管理端點（與 firebase-admin
 * 使用同一組 API）：
 *   POST /v1/projects/{pid}/accounts          建立單一帳號（明文密碼，同 createUser）
 *   POST /v1/projects/{pid}/accounts:update   設定 custom claims／撤銷 token
 *   POST /v1/projects/{pid}/accounts:delete   刪除 Auth 帳號
 *   GET  /v1/projects/{pid}/accounts:batchGet 分頁列出所有帳號（bootstrap 用）
 *
 * 注意：accounts:batchCreate 是「批量匯入已有雜湊密碼帳號」（importUsers）
 * 專用，必須帶 hashAlgorithm 且每個用戶要有 localId／passwordHash，
 * 不能用它建立明文密碼帳號。
 *
 * 需要 OAuth scope：cloud-platform（見 backup/lib/google-auth.js 的
 * FIREBASE_SCOPES）；Service Account 本身需具「Firebase 管理員」角色。
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
     * 更新帳號。可同時設定 custom claims、停用／啟用帳號及／或撤銷 refresh token。
     * @param {string} localId Firebase Auth uid
     * @param {object} options
     * @param {string} [options.customAttributes] JSON 字串（claims，總大小 ≤ 1000 bytes）
     * @param {boolean} [options.disableUser] true＝停用 Auth 帳號（封存/離職），
     *   false＝重新啟用（復職）；undefined＝不變更
     * @param {number} [options.validSince] Unix 秒；設定後早於此時間簽發的
     *   refresh token／工作階段失效（ID token 在到期前仍有效，故另以 active claim 阻擋）
     */
    async updateAccount(localId, options = {}) {
        if (!localId) throw new Error('updateAccount: 缺少 localId');
        const body = { localId: String(localId) };
        if (typeof options.customAttributes === 'string') {
            body.customAttributes = options.customAttributes;
        }
        if (typeof options.disableUser === 'boolean') {
            body.disableUser = options.disableUser;
        }
        if (options.validSince) {
            // API 要求字串形態的 Unix 秒
            body.validSince = String(Math.floor(Number(options.validSince)));
        }
        return this._post(':update', body);
    }

    /**
     * 以管理端 API 建立電郵／密碼帳號（不會影響管理員自己的瀏覽器工作階段）。
     * 對應 firebase-admin 的 createUser()：POST .../accounts（明文密碼）。
     * 切勿改用 accounts:batchCreate，那是匯入雜湊密碼帳號的端點。
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
        // path 傳空字串：URL 即 .../accounts（無 :verb 後綴）
        const data = await this._post('', account);
        if (!data.localId) {
            const err = new Error('建立帳號時伺服器未回傳 localId');
            err.status = 502;
            err.apiError = data;
            throw err;
        }
        return { uid: String(data.localId), email: data.email || email };
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
