/* ============================================================
 * Cloudflare Pages 排程函式
 * ------------------------------------------------------------
 * 注意：新版 Pages Dashboard 已無 Cron Triggers 設定入口，本專案實際
 * 由「外部獨立 Worker」依排程帶密鑰呼叫 HTTP 端點：
 *   - 備份：POST /api/backup/sync     （X-Backup-Cron-Secret）
 *   - 回收：POST /api/attachments/reap（X-Attachment-Reap-Secret）
 * 本檔僅供仍可使用 Pages Cron 的環境作原生分流；外部 Worker 調度時不會執行。
 * ============================================================ */

import { runBackupSync } from './api/backup/lib/sync.js';
import { runAttachmentReaper } from './api/attachments/lib/reaper.js';

// 舊「新預診推播掃描」使用的每分鐘排程已移除。
// 若 Cloudflare 後台仍殘留 "* * * * *" Cron Trigger，此處直接略過，
// 避免每分鐘誤觸發備份同步；後台刪除該 Trigger 後可一併移除此判斷。
const LEGACY_NOTIFY_CRON = '* * * * *';

// 每日 03:17 UTC（香港時間 11:17）執行病歷附件孤兒回收（R2 無主物件＋重試佇列）。
// 實際排程設於外部 Worker；外部 Worker 需帶 X-Attachment-Reap-Secret
// POST /api/attachments/reap。
const ATTACHMENT_REAPER_CRON = '17 3 * * *';

// 每日 14:00 UTC（香港時間 22:00）執行 Firestore → R2 備份同步。
// 實際排程設於外部 Worker；外部 Worker 需帶 X-Backup-Cron-Secret
// POST /api/backup/sync。
const BACKUP_SYNC_CRON = '0 14 * * *';

export async function scheduled(controller, env, ctx) {
    const cron = (controller && controller.cron) || 'unknown';

    if (cron === LEGACY_NOTIFY_CRON) {
        console.log(`[push] 新預診推播已移除，略過舊排程：${cron}`);
        return;
    }

    if (cron === ATTACHMENT_REAPER_CRON) {
        console.log(`[reaper] cron 觸發：${cron}`);
        try {
            const result = await runAttachmentReaper(env, { trigger: `cron:${cron}` });
            console.log(`[reaper] 回收完成：超齡刪除 ${result.stalePurged}，`
                + `佇列成功 ${result.queueSucceeded}，安全網刪除 ${result.sweepPurged}，`
                + `DLQ ${result.queueDlq}`);
        } catch (error) {
            console.error('[reaper] cron 回收失敗:', error);
            throw error;
        }
        return;
    }

    if (cron === BACKUP_SYNC_CRON) {
        console.log(`[backup] cron 觸發：${cron}`);
        try {
            const result = await runBackupSync(env, {
                trigger: `cron:${cron}`,
                actor: 'pages-cron'
            });
            console.log(`[backup] 同步完成：${result.status}，Firestore 讀取 ${result.firestoreReads} 次`);
        } catch (error) {
            console.error('[backup] cron 同步失敗:', error);
            throw error;
        }
        return;
    }

    // 白名單以外的排程一律不動作：避免後台新增 trigger 時誤觸發備份。
    console.warn(`[cron] 未識別的排程，略過：${cron}`
        + `（備份 ${BACKUP_SYNC_CRON}／附件回收 ${ATTACHMENT_REAPER_CRON}）`);
}
