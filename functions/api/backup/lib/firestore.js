/* ============================================================
 * Firestore / Realtime Database REST 客戶端（Cloudflare Workers）
 * ------------------------------------------------------------
 * 只依賴 fetch 與 Web Crypto；access token 由 google-auth.js 取得。
 *
 * 提供：
 *  - queryCollection()：分頁疊代任意 collection（頂層或診所子集合）
 *  - queryChangedSince()：以 updatedAt + __name__ 雙排序做增量查詢
 *  - listClinicIds()：列岀所有診所（用於備份 clinics/{id}/billingItems）
 *  - fetchRtdbSnapshot()：讀取 Realtime Database（排除即時掛號節點）
 * ============================================================ */

const FIRESTORE_BASE = 'https://firestore.googleapis.com/v1';
const PAGE_SIZE = 300;

// 與前端 exportClinicBackup 排除嘅 RTDB 節點一致（即時掛號／問診）
const RTDB_EXCLUDED_KEYS = ['appointments', 'consultations', 'consultation', 'onlineConsultations'];

export class FirestoreClient {
    constructor(accessToken, projectId, rtdbUrl) {
        this.token = accessToken;
        this.projectId = projectId;
        this.rtdbUrl = rtdbUrl
            || `https://${projectId}-default-rtdb.asia-southeast1.firebasedatabase.app`;
    }

    documentsPath() {
        return `${FIRESTORE_BASE}/projects/${this.projectId}/databases/(default)/documents`;
    }

    async _fireRunQuery(parent, structuredQuery) {
        const url = `${parent}:runQuery`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ structuredQuery })
        });
        const text = await response.text();
        let data;
        try {
            data = text ? JSON.parse(text) : [];
        } catch (error) {
            throw new Error(`Firestore 回應無法解析 (HTTP ${response.status}): ${text.slice(0, 300)}`);
        }
        if (!response.ok) {
            const message = data && data.error && data.error.message
                ? data.error.message
                : `HTTP ${response.status}`;
            throw new Error(`Firestore runQuery 失敗: ${message}`);
        }
        return Array.isArray(data) ? data : [data];
    }

    /**
     * 讀取單一文件，路徑相對於 documents（如 userAuthIndex/abc、users/xyz）。
     * 不存在時回傳 null。
     */
    async getDocument(docPath) {
        const response = await fetch(`${this.documentsPath()}/${docPath}`, {
            headers: { 'Authorization': `Bearer ${this.token}` }
        });
        if (response.status === 404) return null;
        const text = await response.text();
        if (!response.ok) {
            throw new Error(`讀取文件 ${docPath} 失敗 (HTTP ${response.status}): ${text.slice(0, 200)}`);
        }
        return normalizeDocument(JSON.parse(text));
    }

    /**
     * 疊代查詢結果，自動分頁。
     * @param {object} options
     * @param {string} options.collectionId collectionId（如 patients）
     * @param {string} [options.parentDocPath] 子集合父文件路徑（如 clinics/abc）
     * @param {object} [options.where] structuredQuery Filter
     * @param {Array}  [options.orderBy] structuredQuery OrderBy 陣列
     * @param {object} [options.startAt] 起點 cursor（{values, before}）
     * @param {number} [options.limit] 單頁上限（預設 300）
     * @param {function} [options.onDoc] 每筆文件回調（可避免大量結果常駐記憶體）
     * @returns {Promise<{docs: Array, nextCursor: object|null, readTime: string|null}>}
     */
    async queryCollection(options) {
        const {
            collectionId,
            parentDocPath = '',
            where = null,
            orderBy = [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
            startAt = null,
            limit: pageLimit = PAGE_SIZE,
            onDoc = null
        } = options;

        const parent = parentDocPath
            ? `${this.documentsPath()}/${parentDocPath}`
            : this.documentsPath();

        const collected = [];
        let cursor = startAt;
        let lastReadTime = null;

        // 安全上限，避免異常狀況下無限翻頁（300 × 2000 = 60 萬筆）
        for (let page = 0; page < 2000; page++) {
            const structuredQuery = {
                from: [{ collectionId }],
                orderBy,
                limit: pageLimit
            };
            if (where) structuredQuery.where = where;
            if (cursor) structuredQuery.startAt = cursor;

            const rows = await this._fireRunQuery(parent, structuredQuery);
            const pageDocs = [];
            for (const row of rows) {
                if (row.readTime) lastReadTime = row.readTime;
                if (row.document) pageDocs.push(normalizeDocument(row.document));
            }

            for (const doc of pageDocs) {
                if (onDoc) onDoc(doc);
                collected.push(doc);
            }

            if (pageDocs.length < pageLimit) {
                return { docs: collected, nextCursor: null, readTime: lastReadTime };
            }

            const last = pageDocs[pageDocs.length - 1];
            cursor = this._buildOrderCursor(orderBy, last);
            if (!cursor) {
                return { docs: collected, nextCursor: null, readTime: lastReadTime };
            }
        }
        throw new Error(`查詢 ${collectionId} 超過分頁安全上限`);
    }

    /**
     * 增量查詢：updatedAt >= cursor.ts，並以 __name__ 做同分秒排序。
     * @param {object} source {collectionId, parentDocPath?}
     * @param {object|null} watermark {ts: RFC3339, name: 完整文件路徑}
     */
    async queryChangedSince(source, watermark) {
        const orderBy = [
            { field: { fieldPath: 'updatedAt' }, direction: 'ASCENDING' },
            { field: { fieldPath: '__name__' }, direction: 'ASCENDING' }
        ];
        const where = {
            fieldFilter: {
                field: { fieldPath: 'updatedAt' },
                op: 'GREATER_THAN_OR_EQUAL',
                value: { timestampValue: watermark.ts }
            }
        };
        const startAt = {
            before: false,
            values: [
                { timestampValue: watermark.ts },
                { referenceValue: watermark.name }
            ]
        };
        return this.queryCollection({
            collectionId: source.collectionId,
            parentDocPath: source.parentDocPath || '',
            where,
            orderBy,
            startAt
        });
    }

    _buildOrderCursor(orderBy, lastDoc) {
        const values = [];
        for (const order of orderBy) {
            const fieldPath = order.field && order.field.fieldPath;
            if (fieldPath === '__name__') {
                values.push({ referenceValue: lastDoc.name });
            } else if (fieldPath === 'updatedAt') {
                const raw = lastDoc._rawUpdatedAt;
                if (!raw) return null;
                values.push({ timestampValue: raw });
            } else if (fieldPath === 'createdAt') {
                const raw = lastDoc._rawCreatedAt;
                if (!raw) return null;
                values.push({ timestampValue: raw });
            } else {
                return null;
            }
        }
        return { before: false, values };
    }

    /**
     * 列岀所有診所 ID（clinics 集合之文件 ID）。
     */
    async listClinicIds() {
        const ids = [];
        let pageToken = '';
        for (let page = 0; page < 1000; page++) {
            const url = `${this.documentsPath()}/clinics?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const data = await response.json();
            if (!response.ok) {
                // 診所集合不存在視為空集合
                if (response.status === 404) return [];
                throw new Error('列岀診所失敗: ' + ((data && data.error && data.error.message) || response.status));
            }
            const docs = data.documents || [];
            for (const doc of docs) {
                const id = (doc.name || '').split('/').pop();
                if (id) ids.push(id);
            }
            if (!data.nextPageToken) break;
            pageToken = data.nextPageToken;
        }
        return ids;
    }

    /**
     * 讀取 RTDB 根節點並排除即時掛號／問診資料。
     */
    async fetchRtdbSnapshot() {
        const url = `${this.rtdbUrl.replace(/\/$/, '')}/.json`;
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${this.token}` }
        });
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`RTDB 讀取失敗 (HTTP ${response.status}): ${text.slice(0, 200)}`);
        }
        const all = await response.json();
        if (!all || typeof all !== 'object') return null;
        const filtered = {};
        for (const key of Object.keys(all)) {
            if (!RTDB_EXCLUDED_KEYS.includes(key)) {
                filtered[key] = all[key];
            }
        }
        return filtered;
    }
}

/**
 * 將 Firestore v1 Document 轉為前端習用嘅一般 JSON 形態。
 * - 文件 id 獨立為 doc.id
 * - Timestamp 轉為 { seconds, nanoseconds }（與 Web SDK JSON.stringify 相容）
 * - 保留 doc.name 於 _name（內部用，不進入匯出檔）
 */
export function normalizeDocument(document) {
    const segments = (document.name || '').split('/documents/')[1] || '';
    const parts = segments.split('/');
    const id = parts.pop() || '';
    const data = normalizeFields(document.fields || {});
    return {
        id,
        name: document.name,
        data,
        _rawUpdatedAt: (document.fields && document.fields.updatedAt && document.fields.updatedAt.timestampValue) || null,
        _rawCreatedAt: (document.fields && document.fields.createdAt && document.fields.createdAt.timestampValue) || null
    };
}

function normalizeFields(fields) {
    const out = {};
    for (const [key, value] of Object.entries(fields || {})) {
        out[key] = normalizeValue(value);
    }
    return out;
}

function normalizeValue(value) {
    if (value === null || value === undefined) return null;
    if ('nullValue' in value) return null;
    if ('booleanValue' in value) return value.booleanValue;
    if ('integerValue' in value) return Number(value.integerValue);
    if ('doubleValue' in value) return value.doubleValue;
    if ('timestampValue' in value) return timestampToJson(value.timestampValue);
    if ('stringValue' in value) return value.stringValue;
    if ('bytesValue' in value) return value.bytesValue;
    if ('referenceValue' in value) {
        // 保留文件路徑（去掉專案前綴），例如 clinics/abc/billingItems/x
        const path = String(value.referenceValue).split('/documents/')[1];
        return path || value.referenceValue;
    }
    if ('geoPointValue' in value) {
        return { lat: value.geoPointValue.latitude, lng: value.geoPointValue.longitude };
    }
    if ('mapValue' in value) {
        return value.mapValue && value.mapValue.fields ? normalizeFields(value.mapValue.fields) : {};
    }
    if ('arrayValue' in value) {
        const values = (value.arrayValue && value.arrayValue.values) || [];
        return values.map(normalizeValue);
    }
    // 罕見型別（increment 等 sentinel 不應出現在讀取結果）
    return null;
}

/**
 * RFC3339（2026-09-18T03:17:00.123456Z）→ {seconds, nanoseconds}
 * 與 Firebase Web SDK Timestamp.toJSON() 輸出一致。
 */
function timestampToJson(rfc3339) {
    const match = String(rfc3339).match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})?$/);
    if (!match) return rfc3339;
    const frac = (match[2] || '').padEnd(9, '0').slice(0, 9);
    const tz = match[3] || 'Z';
    const epochMs = Date.parse(`${match[1]}${frac ? '.' + frac : ''}${tz}`);
    const epochSec = Math.floor(epochMs / 1000);
    return { seconds: epochSec, nanoseconds: Number(frac) };
}
