/* ============================================================
 * Cloudflare Pages 排程函式
 * ------------------------------------------------------------
 * 由 Pages Cron Trigger 依排程呼叫，依 controller.cron 字串分流：
 *  - "* * * * *"（每分鐘）：新預診推播掃描
 *  - 其他排程（原備份設定）：Firestore → R2 備份同步，行為不變
 *
 * 若專案未啟用 Pages Cron Triggers，備份亦可改由外部排程服務
 * （cron-job.org、Google Cloud Scheduler 等）帶著
 * X-Backup-Cron-Secret 呼叫 POST /api/backup/sync，效果相同。
 * ============================================================ */

import { runBackupSync } from './api/backup/lib/sync.js';
import { notifyNewInquiries } from './api/push/lib/notify-inquiries.js';

const NOTIFY_CRON = '* * * * *';

export async function scheduled(controller, env, ctx) {
    const cron = (controller && controller.cron) || 'unknown';

    if (cron === NOTIFY_CRON) {
        console.log(`[push] cron 觸發：${cron}`);
        try {
            const result = await notifyNewInquiries(env);
            console.log(
                `[push] 掃描完成：近窗 ${result.scanned} 筆、新單 ${result.newCount} 筆` +
                `、已通知 ${result.notifiedIds.length} 筆、待重試 ${result.failedIds.length} 筆`
            );
        } catch (error) {
            // 不重新拋出——cron 失敗不需重試機制，下分鐘自然重跑；
            // 錯誤留痕即可，避免持續性錯誤造成 Cron 錯誤通知噪音
            console.error('[push] cron 掃描失敗:', error);
        }
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
