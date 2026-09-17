/* ============================================================
 * Cloudflare Pages 排程函式
 * ------------------------------------------------------------
 * 由 Pages Cron Trigger 依 wrangler.toml [triggers].crons 排程呼叫，
 * 每日定時執行 Firestore → R2 備份同步。
 *
 * 若專案未啟用 Pages Cron Triggers，亦可改由外部排程服務
 * （cron-job.org、Google Cloud Scheduler 等）帶著
 * X-Backup-Cron-Secret 呼叫 POST /api/backup/sync，效果相同。
 * ============================================================ */

import { runBackupSync } from './api/backup/lib/sync.js';

export async function scheduled(controller, env, ctx) {
    const cron = (controller && controller.cron) || 'unknown';
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
