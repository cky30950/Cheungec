/* ============================================================
 * Cloudflare Pages 排程函式
 * ------------------------------------------------------------
 * 由 Pages Cron Trigger 依排程呼叫，執行 Firestore → R2 備份同步。
 *
 * 若專案未啟用 Pages Cron Triggers，備份亦可改由外部排程服務
 * （cron-job.org、Google Cloud Scheduler 等）帶著
 * X-Backup-Cron-Secret 呼叫 POST /api/backup/sync，效果相同。
 * ============================================================ */

import { runBackupSync } from './api/backup/lib/sync.js';

// 舊「新預診推播掃描」使用的每分鐘排程已移除。
// 若 Cloudflare 後台仍殘留 "* * * * *" Cron Trigger，此處直接略過，
// 避免每分鐘誤觸發備份同步；後台刪除該 Trigger 後可一併移除此判斷。
const LEGACY_NOTIFY_CRON = '* * * * *';

export async function scheduled(controller, env, ctx) {
    const cron = (controller && controller.cron) || 'unknown';

    if (cron === LEGACY_NOTIFY_CRON) {
        console.log(`[push] 新預診推播已移除，略過舊排程：${cron}`);
        return;
    }

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
}
