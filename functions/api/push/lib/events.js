/* ============================================================
 * 推播事件常數（單一真相來源）
 * ------------------------------------------------------------
 * 訂閱文件 events、subscribe 白名單校驗、notify 派送皆引用此處。
 * ============================================================ */

// 病人提交新預診（既有：每分鐘 cron 掃描）
export const EVENT_NEW_INQUIRY = 'new_inquiry';

// 病人進入候診中（推送給歸屬醫師）
export const EVENT_APPOINTMENT_WAITING = 'appointment_waiting';

// 完成診症（推送給護理師/診所管理/診所助理）
export const EVENT_APPOINTMENT_COMPLETED = 'appointment_completed';

// 公開頻道新訊息
export const EVENT_CHAT_PUBLIC = 'chat_public';

// 私人聊天新訊息
export const EVENT_CHAT_PRIVATE = 'chat_private';

/** 全部允許訂閱的事件（順序即設定 UI 顯示順序） */
export const ALL_PUSH_EVENTS = [
    EVENT_NEW_INQUIRY,
    EVENT_APPOINTMENT_WAITING,
    EVENT_APPOINTMENT_COMPLETED,
    EVENT_CHAT_PUBLIC,
    EVENT_CHAT_PRIVATE
];

/** 收到診症完成通知的職位 */
export const COMPLETED_NOTIFY_POSITIONS = ['護理師', '診所管理', '診所助理'];

/** 預設訂閱：全選 */
export const DEFAULT_EVENTS = [...ALL_PUSH_EVENTS];

export function isAllowedEvent(event) {
    return ALL_PUSH_EVENTS.includes(String(event));
}
