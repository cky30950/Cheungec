// i18n.js - basic internationalisation support for the clinic system

/**
 * Translation dictionaries keyed by original Chinese text.  Each property
 * corresponds to a supported language (zh for Chinese, en for English).
 * The keys in each dictionary should match the original Chinese content
 * found in the HTML.  When switching languages the code will replace
 * elements' textContent and placeholders based on the mapping below.  If a
 * translation is not found for a particular string the original text will
 * be left unchanged.
 */
window.translations = {
    zh: {
        // Chinese translations simply map original text to itself.  This
        // dictionary only needs entries for strings that have English
        // translations below – everything else will remain unchanged.
        "庫存：": "庫存：",
        "警戒：": "警戒：",
        "您可以匯出診所資料備份（包含所有功能資料，不含模板庫、中藥庫及穴位庫），或匯入之前的備份檔案。實時掛號及問診資料不包含在備份中。": "您可以匯出診所資料備份（包含所有功能資料，不含模板庫、中藥庫及穴位庫），或匯入之前的備份檔案。實時掛號及問診資料不包含在備份中。",
        "搜尋穴位名稱、定位、功能或經絡...": "搜尋穴位名稱、定位、功能或經絡...",
        "暫無診症記錄": "暫無診症記錄",
        "該病人尚未有診症記錄": "該病人尚未有診症記錄",
        "總診療次數": "總診療次數",
        "最近診療": "最近診療",
        "無": "無",
        "無安排": "無安排",
        "下次複診": "下次複診",
        "套票情況": "套票情況",
        "尚未購買套票": "尚未購買套票",
        "可於診療時購買套票享優惠": "可於診療時購買套票享優惠",
        "有效套票": "有效套票",
        "下一頁": "下一頁",
        "上一頁": "上一頁",
        // Pagination: first and last page labels
        "最前一頁": "最前一頁",
        "最後一頁": "最後一頁",
        "失效套票": "失效套票",
        "統計期間": "統計期間",
        "編輯收費項目": "編輯收費項目",
        "組合名稱": "組合名稱",
        "分類": "分類",
        "適應症描述": "適應症描述",
        "搜尋藥材或方劑": "搜尋藥材或方劑",
        "藥材": "藥材",
        "搜尋穴位": "搜尋穴位",
        "穴位": "穴位",
        "針法": "針法",
        "克": "克",
        "刪除": "刪除",
        "撤回診症": "撤回診症",
        "移除掛號": "移除掛號",
        "創建自己的組合": "創建自己的組合",
        "停用": "停用",
        "啟用": "啟用",
        "從未登入": "從未登入",
        "主管理員不可修改": "主管理員不可修改",
        "編輯用戶": "編輯用戶",
        "收入分析與財務統計": "收入分析與財務統計",
        "診療費收入": "診療費收入",
        "藥費收入": "藥費收入",
        "治療費收入": "治療費收入",
        "其他收入": "其他收入",
        "套票收入": "套票收入",
        "套票使用": "套票使用",
        "取消使用": "取消使用",
        "載入病歷": "載入病歷",
        "無特殊主訴": "無特殊主訴",
        "病歷編號": "病歷編號",
        "醫師": "醫師",
        "的診症記錄": "的診症記錄",
        "的病歷記錄": "的病歷記錄",
        "當前用戶": "當前用戶",
        "編輯": "編輯",
        "病歷": "病歷",
        "編輯病人資料": "編輯病人資料",
        "更新": "更新",
        "已掛號": "已掛號",
        "候診中": "候診中",
        "診症中": "診症中",
        "+ 新增收費項目": "+ 新增收費項目",
        "+ 新增用戶": "+ 新增用戶",
        "+ 新增病人": "+ 新增病人",
        "+ 新增穴位組合": "+ 新增穴位組合",
        "+ 新增藥方組合": "+ 新增藥方組合",
        "管理分類": "管理分類",
        "一般用戶": "一般用戶",
        "上月": "上月",
        "上週": "上週",
        "不使用問診資料": "不使用問診資料",
        "中藥庫": "中藥庫",
        "中藥服用方法": "中藥服用方法",
        // 批量入庫相關翻譯
        "批量入庫": "批量入庫",
        "新增藥材": "新增藥材",
        "請選擇中藥": "請選擇中藥",
        "數量": "數量",
        "單位": "單位",
        "批量入庫失敗！": "批量入庫失敗！",
        "中藥材": "中藥材",
        "中藥材名稱 *": "中藥材名稱 *",
        "中醫診斷 *": "中醫診斷 *",
        "中醫註冊編號 *": "中醫註冊編號 *",
        "主治": "主治",
        "主要服務": "主要服務",
        "主訴 *": "主訴 *",
        "主訴症狀": "主訴症狀",
        "人": "人",
        "今天": "今天",
        "今年": "今年",
        "佔比": "佔比",
        "使用注意": "使用注意",
        "保存": "保存",
        "保存病歷": "保存病歷",
        "個人設置": "個人設置",
        "停用的帳號將無法登入系統": "停用的帳號將無法登入系統",
        "備註": "備註",
        "儲存": "儲存",
        "內科疾病": "內科疾病",
        "全部": "全部",
        "全部分類": "全部分類",
        "全部用戶": "全部用戶",
        "全部科別": "全部科別",
        "全部醫師": "全部醫師",
        "全部針法": "全部針法",
        "全部類別": "全部類別",
        "其他": "其他",
        "出生日期 *": "出生日期 *",
        "出處": "出處",
        "別名": "別名",
        "到診時間": "到診時間",
        "刷新": "刷新",
        "功效": "功效",
        "匯入備份": "匯入備份",
        "匯出": "匯出",
        "匯出備份": "匯出備份",
        "去年": "去年",
        "取消": "取消",
        "取消診症": "取消診症",
        "啟用此收費項目": "啟用此收費項目",
        "啟用此用戶帳號": "啟用此用戶帳號",
        "四肢部": "四肢部",
        "報表類型": "報表類型",
        "天": "天",
        "套票可用次數 *": "套票可用次數 *",
        "套票項目": "套票項目",
        "女": "女",
        "姓名": "姓名",
        "姓名 *": "姓名 *",
        "婦科疾病": "婦科疾病",
        "婦科調理": "婦科調理",
        "完成診症次數": "完成診症次數",
        "密碼": "密碼",
        "實際到診的時間（用於證明書）": "實際到診的時間（用於證明書）",
        "對應 Firebase Authentication 帳號的 UID": "對應 Firebase Authentication 帳號的 UID",
        "尚未載入或無套票": "尚未載入或無套票",
        "已停用": "已停用",
        "常用劑量": "常用劑量",
        "常用穴位組合": "常用穴位組合",
        "常用藥方組合": "常用藥方組合",
        "平均單價": "平均單價",
        "平均消費": "平均消費",
        "平補平瀉": "平補平瀉",
        "年報表": "年報表",
        "年齡": "年齡",
        "年齡：": "年齡：",
        // Generic number label colon variant used in registration search
        "編號：": "編號：",
        "序號": "序號",
        "建議休息期間": "建議休息期間",
        "建議病人下次回診的時間": "建議病人下次回診的時間",
        "快速選擇": "快速選擇",
        "性別": "性別",
        "性別 *": "性別 *",
        "性別：": "性別：",
        "性味": "性味",
        "您可以匯出診所資料備份（包含所有功能資料，不含模板庫與中藥庫），或匯入之前的備份檔案。實時掛號資料不包含在備份中。": "您可以匯出診所資料備份（包含所有功能資料，不含模板庫與中藥庫），或匯入之前的備份檔案。實時掛號資料不包含在備份中。",
        "感冒類": "感冒類",
        "折扣項目": "折扣項目",
        "折扣項目：輸入0.9表示9折，輸入9會自動轉為9折，或輸入負數表示固定金額折扣": "折扣項目：輸入0.9表示9折，輸入9會自動轉為9折，或輸入負數表示固定金額折扣",
        "掛號列表": "掛號列表",
        "掛號時間": "掛號時間",
        "掛號時間：": "掛號時間：",
        "掛號診症系統": "掛號診症系統",
        "掛號醫師": "掛號醫師",
        "掛號醫師 *": "掛號醫師 *",
        // Colon variant for registration doctor to ensure proper translation lookup
        "掛號醫師：": "掛號醫師：",
        "搜索病人掛號": "搜索病人掛號",
        "操作": "操作",
        "收入佔比": "收入佔比",
        "收入摘要": "收入摘要",
        "收入金額": "收入金額",
        "收費金額 *": "收費金額 *",
        "收費項目": "收費項目",
        "收費項目管理": "收費項目管理",
        "新增": "新增",
        "新增、查看、管理病人資料": "新增、查看、管理病人資料",
        "新增中藥材": "新增中藥材",
        "新增分類": "新增分類",
        "新增收費項目": "新增收費項目",
        "新增方劑": "新增方劑",
        "新增用戶": "新增用戶",
        "新增病人資料": "新增病人資料",
        "方劑": "方劑",
        "方劑名稱 *": "方劑名稱 *",
        "日報表": "日報表",
        "日期": "日期",
        "昨天": "昨天",
        "更新報表": "更新報表",
        "最後登入": "最後登入",
        "月報表": "月報表",
        "有效天數 *": "有效天數 *",
        "有診症的醫師": "有診症的醫師",
        "服務分析": "服務分析",
        "服務類型": "服務類型",
        "服藥天數": "服藥天數",
        "本月": "本月",
        "本週": "本週",
        "模板庫": "模板庫",
        "次/日": "次/日",
        "次數": "次數",
        "歸經": "歸經",
        "每日明細": "每日明細",
        "每日次數": "每日次數",
        "每次診症平均": "每次診症平均",
        "治療費": "治療費",
        "注意事項": "注意事項",
        "活躍醫師": "活躍醫師",
        "消化系統": "消化系統",
        "清熱類": "清熱類",
        "清除": "清除",
        "瀉法": "瀉法",
        "狀態": "狀態",
        "現有分類": "現有分類",
        "現病史": "現病史",
        "用戶管理": "用戶管理",
        "用於病假證明書的建議休息期間": "用於病假證明書的建議休息期間",
        "用法": "用法",
        "男": "男",
        "病人姓名": "病人姓名",
        "病人掛號": "病人掛號",
        "病人詳細資料": "病人詳細資料",
        "病人資料管理": "病人資料管理",
        "病人資訊": "病人資訊",
        "病人：": "病人：",
        "病史及備註": "病史及備註",
        "病史及備註：": "病史及備註：",
        "病歷記錄": "病歷記錄",
        // 病歷管理功能
        "病歷管理": "病歷管理",
        "搜尋病歷編號、病人姓名或醫師...": "搜尋病歷編號、病人姓名或醫師...",
        "病歷詳細資訊": "病歷詳細資訊",
        "檢視": "檢視",
        "療程": "療程",
        // 新增：病歷管理功能的介紹與診症列表中的取消候診
        "查看及搜尋病歷": "查看及搜尋病歷",
        "取消候診": "取消候診",
        "登入系統": "登入系統",
        "登出": "登出",
        "登出系統": "登出系統",
        "確認掛號": "確認掛號",
        "穴位庫": "穴位庫",
        "管理診所用戶權限": "管理診所用戶權限",
        "簡潔的掛號流程管理": "簡潔的掛號流程管理",
        "系統功能概覽": "系統功能概覽",
        "系統管理": "系統管理",
        "組成 *": "組成 *",
        "結束日期": "結束日期",
        "結束：": "結束：",
        "統計期間收入": "統計期間收入",
        "統計資料、備份匯出": "統計資料、備份匯出",
        "編號": "編號",
        "編輯組合": "編輯組合",
        "總收入": "總收入",
        "總計：": "總計：",
        "總費用：": "總費用：",
        "總金額": "總金額",
        "聯絡地址": "聯絡地址",
        "職位": "職位",
        "職位 *": "職位 *",
        "背腰部": "背腰部",
        "胸腹部": "胸腹部",
        "脈象": "脈象",
        "自訂期間": "自訂期間",
        "自購買日起算": "自購買日起算",
        "舌象": "舌象",
        "若病人已填寫問診，可在此選擇預填資訊": "若病人已填寫問診，可在此選擇預填資訊",
        "藥費": "藥費",
        "處方內容": "處方內容",
        "補法": "補法",
        "補益類": "補益類",
        "複診時間": "複診時間",
        "計費單位": "計費單位",
        "記錄症狀、診斷、開立處方": "記錄症狀、診斷、開立處方",
        "診所中文名稱 *": "診所中文名稱 *",
        "診所中文名稱：": "診所中文名稱：",
        "診所功能": "診所功能",
        "診所地址": "診所地址",
        "診所收入分析與財務統計": "診所收入分析與財務統計",
        "診所營業時間": "診所營業時間",
        "診所用戶管理": "診所用戶管理",
        "診所管理": "診所管理",
        "診所英文名稱": "診所英文名稱",
        "診所英文名稱：": "診所英文名稱：",
        "診所設定": "診所設定",
        "診所資料修改": "診所資料修改",
        "診所電話": "診所電話",
        "診斷模板": "診斷模板",
        "診症人次": "診症人次",
        "診症系統": "診症系統",
        "診症記錄": "診症記錄",
        "列印收據": "列印收據",
        "藥單醫囑": "藥單醫囑",
        "到診證明": "到診證明",
        "病假證明": "病假證明",
        "修改病歷": "修改病歷",
        "已完成": "已完成",
        "確認到達": "確認到達",
        "開始診症": "開始診症",
        "繼續診症": "繼續診症",
        "完成診症": "完成診症",
        "保存病歷": "保存病歷",
        "診療費": "診療費",
        "註冊編號": "註冊編號",
        "詳細財務報表": "詳細財務報表",
        "請使用上方搜索功能添加中藥材或方劑": "請使用上方搜索功能添加中藥材或方劑",
        "請使用上方搜索功能添加收費項目": "請使用上方搜索功能添加收費項目",
        "請輸入您的電子郵件及密碼登入": "請輸入您的電子郵件及密碼登入",
        "請輸入病人姓名、編號或電話進行搜索": "請輸入病人姓名、編號或電話進行搜索",
        "請選擇...": "請選擇...",
        "請選擇性別": "請選擇性別",
        "請選擇職位": "請選擇職位",
        "請選擇醫師": "請選擇醫師",
        "請選擇開始和結束日期": "請選擇開始和結束日期",
        "請選擇類別": "請選擇類別",
        "請點擊「更新報表」來載入資料": "請點擊「更新報表」來載入資料",
        "請點擊左上角選單按鈕開始使用系統功能": "請點擊左上角選單按鈕開始使用系統功能",
        "證型診斷": "證型診斷",
        "護理師": "護理師",
        "財務報表": "財務報表",
        "資料備份與還原": "資料備份與還原",
        "資料更新時間：": "資料更新時間：",
        "身分證字號 *": "身分證字號 *",
        "週報表": "週報表",
        "過敏史": "過敏史",
        "過敏史：": "過敏史：",
        "選擇問診資料": "選擇問診資料",
        "配合艾灸": "配合艾灸",
        "醫囑及注意事項": "醫囑及注意事項",
        "醫囑模板": "醫囑模板",
        "醫師": "醫師",
        "醫師業績": "醫師業績",
        "醫師篩選": "醫師篩選",
        "醫師職位必須填寫註冊編號": "醫師職位必須填寫註冊編號",
        "金額": "金額",
        "針灸備註": "針灸備註",
        "開始日期": "開始日期",
        "開始：": "開始：",
        "關閉": "關閉",
        "電子郵件": "電子郵件",
        "電話": "電話",
        "電話號碼": "電話號碼",
        "電話號碼 *": "電話號碼 *",
        "項目": "項目",
        "項目名稱 *": "項目名稱 *",
        "項目說明": "項目說明",
        "項目類別 *": "項目類別 *",
        "頭面部": "頭面部",
        "🌿 慣用中藥組合": "🌿 慣用中藥組合",
        "🌿 載入常用藥方": "🌿 載入常用藥方",
        "🎫 病人套票": "🎫 病人套票",
        "💰 載入上次收費": "💰 載入上次收費",
        "💰 選擇收費項目：": "💰 選擇收費項目：",
        "📋 載入上次處方": "📋 載入上次處方",
        "📋 載入醫囑模板": "📋 載入醫囑模板",
        "📋 醫囑模板": "📋 醫囑模板",
        "📍 慣用穴位組合": "📍 慣用穴位組合",
        "📍 載入常用穴位": "📍 載入常用穴位",
        "🔍 搜索中藥庫：": "🔍 搜索中藥庫：",
        "🔍 搜索穴位：": "🔍 搜索穴位：",
        "🔍 診斷模板": "🔍 診斷模板",
        "🔍 載入診斷模板": "🔍 載入診斷模板",
        /*
         * 加入個人設置與收費項目管理按鈕的完整字串，包含前導 + 號。這些字串在
         * 英文介面中需要對應翻譯，中文介面則保持原樣。未添加將導致 i18n 在
         * 找不到鍵時退回原字串。參見 system.html 中行 1715 與 1745。
         */
        "+ 管理分類": "+ 管理分類",
        /* 以下為補充的翻譯鍵，用於補齊介面上尚未翻譯的中文文字 */
        "不含模板庫與中藥庫": "不含模板庫與中藥庫",
        "中藥材名稱": "中藥材名稱",
        "中醫診斷": "中醫診斷",
        "中醫註冊編號": "中醫註冊編號",
        "主訴": "主訴",
        "來載入資料": "來載入資料",
        "備份匯出": "備份匯出",
        "出生日期": "出生日期",
        "包含所有功能資料": "包含所有功能資料",
        "可在此選擇預填資訊": "可在此選擇預填資訊",
        "套票可用次數": "套票可用次數",
        "實時掛號資料不包含在備份中": "實時掛號資料不包含在備份中",
        "實際到診的時間": "實際到診的時間",
        "對應": "對應",
        "帳號的": "帳號的",
        "您可以匯出診所資料備份": "您可以匯出診所資料備份",
        "慣用中藥組合": "慣用中藥組合",
        "慣用穴位組合": "慣用穴位組合",
        "或匯入之前的備份檔案": "或匯入之前的備份檔案",
        "或輸入負數表示固定金額折扣": "或輸入負數表示固定金額折扣",
        "搜索中藥庫": "搜索中藥庫",
        "搜索穴位": "搜索穴位",
        "收費金額": "收費金額",
        "新增病人": "新增病人",
        "新增穴位組合": "新增穴位組合",
        "新增藥方組合": "新增藥方組合",
        "方劑名稱": "方劑名稱",
        "會自動轉為": "會自動轉為",
        "有效天數": "有效天數",
        "查看": "查看",
        "用於證明書": "用於證明書",
        "病人": "病人",
        "病人套票": "病人套票",
        "管理病人資料": "管理病人資料",
        "組成": "組成",
        "結束": "結束",
        "統計資料": "統計資料",
        "編號或電話進行搜索": "編號或電話進行搜索",
        "總計": "總計",
        "總費用": "總費用",
        "若病人已填寫問診": "若病人已填寫問診",
        "表示": "表示",
        "記錄症狀": "記錄症狀",
        "診所中文名稱": "診所中文名稱",
        "診斷": "診斷",
        "請輸入病人姓名": "請輸入病人姓名",
        "請選擇": "請選擇",
        "請點擊": "請點擊",
        "資料更新時間": "資料更新時間",
        "身分證字號": "身分證字號",
        "載入上次收費": "載入上次收費",
        "載入上次處方": "載入上次處方",
        "載入常用穴位": "載入常用穴位",
        "載入常用藥方": "載入常用藥方",
        "載入診斷模板": "載入診斷模板",
        "載入醫囑模板": "載入醫囑模板",
        "輸入": "輸入",
        "選擇收費項目": "選擇收費項目",
        "開始": "開始",
        "開立處方": "開立處方",
        "項目名稱": "項目名稱",
        "項目類別": "項目類別",
        "查看醫囑與診斷模板": "查看醫囑與診斷模板",
        "查看中藥材及方劑資料": "查看中藥材及方劑資料",
        "查看穴位資料": "查看穴位資料",
        // ------- Added comma above to fix syntax error -------
        "管理診療費用及收費項目": "管理診療費用及收費項目",
        // 下面新增登入頁輸入欄位的佔位提示翻譯（中文版就是原文）
        // 以下為新增的輸入欄位提示，中文版就是原文
        "中醫病名診斷...": "中醫病名診斷...",
        "例如：10": "例如：10",
        "例如：180（半年）": "例如：180（半年）",
        "例：0912-345-678": "例：0912-345-678",
        "例：3-9g": "例：3-9g",
        "例：7天、2週、1個月等...": "例：7天、2週、1個月等...",
        "例：A123456789": "例：A123456789",
        "例：傷寒論、金匱要略": "例：傷寒論、金匱要略",
        "例：次、劑、包": "例：次、劑、包",
        "例：肺、脾經": "例：肺、脾經",
        "例：辛、溫": "例：辛、溫",
        "例：週一至週五 09:00-18:00": "例：週一至週五 09:00-18:00",
        "其他名稱或別名": "其他名稱或別名",
        "搜尋中藥材、方劑名稱或功能...": "搜尋中藥材、方劑名稱或功能...",
        "搜尋收費項目名稱...": "搜尋收費項目名稱...",
        "搜尋用戶名稱或電子郵件...": "搜尋用戶名稱或電子郵件...",
        "搜尋病人姓名、編號或電話...": "搜尋病人姓名、編號或電話...",
        "搜尋病人編號、姓名或電話...": "搜尋病人編號、姓名或電話...",
        "搜尋穴位、經絡名稱或功能...": "搜尋穴位、經絡名稱或功能...",
        "搜尋穴位名稱、經絡或定位...": "搜尋穴位名稱、經絡或定位...",
        "搜尋穴位組合名稱...": "搜尋穴位組合名稱...",
        "搜尋藥方組合名稱...": "搜尋藥方組合名稱...",
        "搜尋診斷模板名稱或內容...": "搜尋診斷模板名稱或內容...",
        "搜尋醫囑模板名稱...": "搜尋醫囑模板名稱...",
        "搜索中藥材、方劑名稱或功能...": "搜索中藥材、方劑名稱或功能...",
        "搜索收費項目名稱...": "搜索收費項目名稱...",
        "煎煮方法、服用時間、劑量等...": "煎煮方法、服用時間、劑量等...",
        "病人主要不適症狀、發病時間、症狀特點等...": "病人主要不適症狀、發病時間、症狀特點等...",
        "發病經過、症狀變化、治療經過等...": "發病經過、症狀變化、治療經過等...",
        "禁忌、注意事項等": "禁忌、注意事項等",
        "禁忌或注意事項": "禁忌或注意事項",
        "系統自動計算": "系統自動計算",
        "脈位、脈率、脈力、脈形等...": "脈位、脈率、脈力、脈形等...",
        "舌質、舌苔、舌形等...": "舌質、舌苔、舌形等...",
        "請描述主治": "請描述主治",
        "請描述主要功效": "請描述主要功效",
        "請描述收費項目的詳細內容": "請描述收費項目的詳細內容",
        "請描述方劑主治": "請描述方劑主治",
        "請描述方劑主要功效": "請描述方劑主要功效",
        "請描述方劑用法": "請描述方劑用法",
        "請簡述病人的主要症狀...": "請簡述病人的主要症狀...",
        "請記錄重要病史、家族病史、慢性疾病等": "請記錄重要病史、家族病史、慢性疾病等",
        "請詳細記錄藥物過敏或食物過敏史": "請詳細記錄藥物過敏或食物過敏史",
        "請輸入 Firebase UID（可不填）": "請輸入 Firebase UID（可不填）",
        "請輸入中藥材名稱": "請輸入中藥材名稱",
        "請輸入中醫註冊編號": "請輸入中醫註冊編號",
        "請輸入姓名": "請輸入姓名",
        "請輸入完整地址": "請輸入完整地址",
        "請輸入收費項目名稱": "請輸入收費項目名稱",
        "請輸入方劑名稱": "請輸入方劑名稱",
        "請輸入方劑組成，例如：&#10;人參&#10;白朮&#10;茯苓&#10;甘草": "請輸入方劑組成，例如：&#10;人參&#10;白朮&#10;茯苓&#10;甘草",
        "請輸入真實姓名": "請輸入真實姓名",
        "請輸入診所中文名稱": "請輸入診所中文名稱",
        "請輸入診所完整地址": "請輸入診所完整地址",
        "請輸入診所英文名稱": "請輸入診所英文名稱",
        "請輸入診所電話號碼": "請輸入診所電話號碼",
        "請輸入電話號碼": "請輸入電話號碼",
        "輸入分類名稱...": "輸入分類名稱...",
        "辨證分型、病機分析...": "辨證分型、病機分析...",
        "針灸穴位、手法、注意事項等...": "針灸穴位、手法、注意事項等...",
        "飲食宜忌、生活調護、注意事項等...": "飲食宜忌、生活調護、注意事項等...",
        "搜尋診斷模板...": "搜尋診斷模板...",
        "搜尋醫囑模板...": "搜尋醫囑模板...",
        "搜索常用藥方...": "搜索常用藥方...",
        "搜索常用穴位組合...": "搜索常用穴位組合...",
        "搜尋常用藥方...": "搜尋常用藥方...",
        "搜尋常用穴位...": "搜尋常用穴位...",
        "穴位名稱": "穴位名稱",
        // Add colon variants and navigation terms to ensure labels translate properly
        "醫師：": "醫師：",
        "病歷編號：": "病歷編號：",
        "較舊": "較舊",
        "較新": "較新",
        "時間未知": "時間未知",
        "如：服藥完畢後": "如：服藥完畢後",
        "請輸入電子郵件": "請輸入電子郵件",
        "請輸入密碼": "請輸入密碼",
        "管理慣用藥方及穴位組合": "管理慣用藥方及穴位組合",
        /* Additional keys added to fill missing translations in the zh dictionary.
         * These entries mirror the Chinese originals and enable proper mapping
         * when switching languages. */
        "組合名稱 *": "組合名稱 *",
        "個可用": "個可用",
        "管理中藥分類": "管理中藥分類",
        "管理穴位分類": "管理穴位分類",
        "管理醫囑分類": "管理醫囑分類",
        "管理診斷分類": "管理診斷分類",
        // 簡體中文搜索提示變體
        "搜索穴位、經絡名稱或功能...": "搜索穴位、經絡名稱或功能...",
        "搜索穴位名稱、經絡或定位...": "搜索穴位名稱、經絡或定位...",

        // 補充未翻譯的提示訊息（原文即為中文）
        "保存庫存變更失敗！": "保存庫存變更失敗！",
        "兩次輸入的密碼不一致！": "兩次輸入的密碼不一致！",
        "密碼長度至少需 6 位數！": "密碼長度至少需 6 位數！",
        "庫存已更新！": "庫存已更新！",
        "建立 Firebase 帳號失敗：": "建立 Firebase 帳號失敗：",
        "找不到輸入欄位，請重新載入頁面": "找不到輸入欄位，請重新載入頁面",
        "請填寫電子郵件地址！": "請填寫電子郵件地址！",
        "請輸入並確認密碼！": "請輸入並確認密碼！",

        // 個人統計分析與帳號安全設定相關翻譯（原文即為中文）
        "個人統計分析": "個人統計分析",
        "統計醫師個人用藥與穴位使用情況，提供用藥和穴位偏好分析。": "統計醫師個人用藥與穴位使用情況，提供用藥和穴位偏好分析。",
        "常用方劑": "常用方劑",
        "常用中藥": "常用中藥",
        "常用穴位": "常用穴位",
        "帳號安全設定": "帳號安全設定",
        "在此可以安全地變更您的登入密碼或刪除帳號。此操作將影響您在系統中的登入權限，請謹慎操作。": "在此可以安全地變更您的登入密碼或刪除帳號。此操作將影響您在系統中的登入權限，請謹慎操作。",
        "變更密碼": "變更密碼",
        "當前密碼": "當前密碼",
        "新密碼": "新密碼",
        "確認新密碼": "確認新密碼",
        "請輸入當前密碼": "請輸入當前密碼",
        "請輸入新密碼": "請輸入新密碼",
        "請再次輸入新密碼": "請再次輸入新密碼",
        "更新密碼": "更新密碼",
        "刪除帳號": "刪除帳號",
        "刪除帳號後，您將無法再登入系統，且所有與此帳號相關的資料將無法恢復。請慎重操作！": "刪除帳號後，您將無法再登入系統，且所有與此帳號相關的資料將無法恢復。請慎重操作！",
        "密碼確認": "密碼確認",
        "請輸入您的密碼": "請輸入您的密碼",
        // 新增：個人統計與帳號安全相關的側邊說明
        "統計個人用藥與穴位偏好": "統計個人用藥與穴位偏好",
        "變更密碼及刪除帳號": "變更密碼及刪除帳號",

        // ==== Herb and inventory management translations (self‑mapping for Chinese) ====
        "編輯庫存": "編輯庫存",
        "剩餘數量": "剩餘數量",
        "補貨警戒量": "補貨警戒量",
        "存庫量 (g)": "存庫量 (g)",
        "請輸入存庫量": "請輸入存庫量",
        "補貨警戒量 (g)": "補貨警戒量 (g)",
        "庫存低於此值顯示紅色": "庫存低於此值顯示紅色",
        "斤": "斤",
        "兩": "兩",
        "錢": "錢",

        // Herb library sorting labels
        "排序方式": "排序方式",
        "庫存最多": "庫存最多",
        "庫存最少": "庫存最少",
        "使用最多": "使用最多",
        "使用最少": "使用最少",
        // Schedule calendar translations
        "行事曆排班": "行事曆排班",
        "排班與行事曆管理": "排班與行事曆管理",
        "請選擇醫師或護理師": "請選擇醫師或護理師",
        "輸入排班標題": "輸入排班標題",
        "值班": "值班",
        "新增排班事件失敗": "新增排班事件失敗",
        "更新排班事件失敗": "更新排班事件失敗",
        "刪除排班事件失敗": "刪除排班事件失敗",
        "載入排班事件失敗": "載入排班事件失敗",
        "行事曆元件載入失敗，請檢查網絡連線": "行事曆元件載入失敗，請檢查網絡連線",
        "載入行事曆時發生錯誤": "載入行事曆時發生錯誤",
        "沒有排班資料可匯出": "沒有排班資料可匯出",
        "已匯出行事曆": "已匯出行事曆",
        "匯出行事曆失敗": "匯出行事曆失敗",
        "刪除此排班嗎？": "刪除此排班嗎？",
        // 新增訂閱與付款管理相關翻譯條目
        "訂閱與付款": "訂閱與付款",
        "您可以查看並管理系統訂閱或付款狀態。": "您可以查看並管理系統訂閱或付款狀態。",
        "管理訂閱/付款": "管理訂閱/付款",
        "無法取得客戶門戶連結！": "無法取得客戶門戶連結！",
        "開啟付款管理視窗失敗！": "開啟付款管理視窗失敗！",
        // 庫存類型選擇
        "顆粒沖劑": "顆粒沖劑",
        "飲片": "飲片",
    },
    en: {
        // Updated inventory and alert labels without trailing space
        "庫存：": "Inventory:",
        "警戒：": "Alert:",
        "您可以匯出診所資料備份（包含所有功能資料，不含模板庫、中藥庫及穴位庫），或匯入之前的備份檔案。實時掛號及問診資料不包含在備份中。": "You can export a backup of your clinic data (including all functional data, excluding the template library, Chinese medicine library, and acupoint library), or import a previous backup file. Real-time registration and consultation data are not included in the backup.",
        "找不到對應的診症記錄！": "Matching consultation record not found!",
        "請輸入方劑組成！": "Please enter the formula composition!",
        "只能列印已完成診症的病假證明！": "Only completed consultations can have sick leave certificates printed!",
        "列印病假證明時發生錯誤": "An error occurred while printing the sick leave certificate",
        "請至少添加一個穴位！": "Please add at least one acupoint!",
        "請輸入組合名稱！": "Please enter the combination name!",
        "已取消本次套票使用，次數已退回": "This package use has been cancelled and the use count has been returned",
        "只能列印已完成診症的收據！": "Receipts can only be printed for completed consultations!",
        "已載入常用穴位組合：": "Loaded frequently used acupoint combination:",
        "新增用戶失敗，請稍後再試": "Failed to add user, please try again later",
        "請輸入收費項目名稱！": "Please enter the billing item name!",
        "診症完成後無法調整套票數量": "Package quantity cannot be adjusted after the consultation is completed",
        "選擇的醫師無效，請重新選擇！": "Selected doctor is invalid, please choose again!",
        "未偵測到有效的中藥庫資料": "No valid Chinese medicine library data detected",
        // Inventory type selector translations
        "顆粒沖劑": "Granules",
        "飲片": "Herbal slices",
        // Batch restocking translations
        "批量入庫": "Batch restock",
        "新增藥材": "Add Herb",
        "請選擇中藥": "Select Herb",
        "數量": "Quantity",
        "單位": "Unit",
        "批量入庫失敗！": "Batch restock failed!",
        // Inventory management translations
        "編輯庫存": "Edit Inventory",
        "剩餘數量": "Remaining Quantity",
        "補貨警戒量": "Restock Threshold",
        "存庫量 (g)": "Stock Quantity (g)",
        "請輸入存庫量": "Please enter stock quantity",
        "補貨警戒量 (g)": "Restock Threshold (g)",
        "庫存低於此值顯示紅色": "Displays red when inventory falls below this value",
        "斤": "Jin",
        "兩": "Liang",
        "錢": "Qian",

        // Additional translations for inventory display and usage
        "餘量：": "Remaining:",
        "剩餘": "Remaining",
        "使用次數": "Usage Count",

        // Herb library sorting labels
        "排序方式": "Sort by",
        "庫存最多": "Most Stock",
        "庫存最少": "Least Stock",
        "使用最多": "Most Used",
        "使用最少": "Least Used",
        // Schedule calendar translations
        "行事曆排班": "Schedule Calendar",
        "排班與行事曆管理": "Schedule and Calendar Management",
        "請選擇醫師或護理師": "Please select a doctor or nurse",
        "輸入排班標題": "Enter schedule title",
        "值班": "On Duty",
        "新增排班事件失敗": "Failed to add schedule",
        "更新排班事件失敗": "Failed to update schedule",
        "刪除排班事件失敗": "Failed to delete schedule",
        "載入排班事件失敗": "Failed to load schedules",
        "行事曆元件載入失敗，請檢查網絡連線": "Calendar component failed to load, please check network connection",
        "載入行事曆時發生錯誤": "An error occurred while loading the calendar",
        "沒有排班資料可匯出": "No schedule data to export",
        "已匯出行事曆": "Schedule exported",
        "匯出行事曆失敗": "Failed to export schedule",
        "刪除此排班嗎？": "Delete this schedule?",
        // Subscription & billing management translations
        "訂閱與付款": "Subscription & Billing",
        "您可以查看並管理系統訂閱或付款狀態。": "You can view and manage your system subscription or billing status.",
        "管理訂閱/付款": "Manage Subscription/Billing",
        "無法取得客戶門戶連結！": "Unable to obtain customer portal link!",
        "開啟付款管理視窗失敗！": "Failed to open the billing management window!",
        "折扣項目不允許修改數量": "The quantity of discount items cannot be modified",
        "請填寫必要資料（姓名、性別、電話、出生日期、身分證字號）！": "Please fill in the required fields (name, gender, phone, date of birth, ID number)!",
        "請至少添加一個藥材！": "Please add at least one herb!",
        "保存掛號數據失敗": "Failed to save registration data",
        "請確認出生日期是否正確！": "Please verify that the date of birth is correct!",
        "備份資料匯入完成！": "Backup data import completed!",
        "中醫診所收據已準備列印！": "The clinic receipt is ready to print!",
        "已載入診斷模板": "Diagnosis template loaded",
        "到診證明書已準備列印！": "Arrival certificate is ready to print!",
        "無法顯示醫囑模板": "Unable to display prescription template",
        "無法讀取病人資料": "Unable to read patient data",
        "列印藥單醫囑時發生錯誤": "An error occurred while printing the prescription instructions",
        "系統錯誤：未選擇病人！": "System error: no patient selected!",
        "每個診症僅能使用一項折扣優惠": "Only one discount can be used per consultation",
        "診症完成後無法刪除套票": "Packages cannot be removed after consultation completion",
        "找不到套票使用項目": "Package usage item not found",
        "請輸入診所中文名稱！": "Please enter the clinic's Chinese name!",
        "掛號時間不能早於現在時間！": "Registration time cannot be earlier than the current time!",
        "您的帳號已被停用，請聯繫管理員": "Your account has been disabled, please contact the administrator",
        "請輸入有效的收費金額！": "Please enter a valid billing amount!",
        "找不到當前診症記錄！": "Current consultation record not found!",
        "載入醫囑模板失敗": "Failed to load prescription template",
        "不能刪除最後一個診所管理帳號！": "Cannot delete the last clinic administrator account!",
        "繼續診症時發生錯誤": "An error occurred while resuming the consultation",
        "保存成功！": "Saved successfully!",
        "病人資料已成功新增！": "Patient data successfully added!",
        "病人資料已成功更新！": "Patient data successfully updated!",
        "找不到診症記錄，將使用空白表單": "Consultation record not found, using blank form",
        "請選擇日期範圍！": "Please select a date range!",
        "匯入模板資料失敗，請確認檔案格式是否正確": "Failed to import template data, please check if the file format is correct",
        "取消套票使用時發生錯誤": "An error occurred while cancelling package use",
        "讀取病人資料失敗": "Failed to read patient data",
        "刪除時發生錯誤": "An error occurred during deletion",
        "權限不足，無法編輯收費項目": "Insufficient permissions to edit billing items",
        "匯入備份失敗，請確認檔案格式是否正確": "Failed to import backup, please check if the file format is correct",
        "載入診症記錄失敗，將使用空白表單": "Failed to load consultation record, using blank form",
        "請選擇掛號時間！": "Please select a registration time!",
        "移除掛號時發生錯誤": "An error occurred while removing the registration",
        "讀取診症記錄失敗": "Failed to read consultation record",
        "診症記錄已更新！": "Consultation record updated!",
        "請輸入方劑名稱！": "Please enter the formula name!",
        "電子郵件格式不正確！": "Invalid email format!",
        "刪除用戶時發生錯誤": "An error occurred while deleting user",
        "權限不足，無法存取穴位庫管理": "Insufficient permissions to access acupoint library management",
        "未偵測到有效的模板資料": "No valid template data detected",
        "不能停用自己的帳號！": "Cannot disable your own account!",

        // --- Added translations for chat system ---
        "聊天": "Chat",
        "主頻道": "Main Channel",
        "輸入訊息...": "Enter message...",
        "發送": "Send",
        "未知用戶": "Unknown user",
        "私人聊天": "Private chat",

        // --- Added translations for medical scheduling system UI ---
        "醫療排班系統": "Medical Scheduling System",
        "上一個": "Previous",
        "下一個": "Next",
        "今天": "Today",
        "顯示假期: 無": "Show holidays: None",
        "香港假期": "Hong Kong Holidays",
        "美國假期": "US Holidays",
        "同步 Google": "Sync Google",
        "匯出 iCal": "Export iCal",
        "列印更表": "Print Schedule",
        "職位篩選": "Role Filter",
        "所有職位": "All roles",
        "班別篩選": "Shift Type Filter",
        "所有班別": "All shift types",
        "早班": "Morning",
        "中班": "Afternoon",
        "夜班": "Night",
        "急診": "Emergency",
        "搜尋人員": "Search staff",
        "輸入姓名...": "Enter name...",
        "固定上班": "Fixed shift",
        "清空排班": "Clear schedule",
        "醫護人員": "Medical staff",
        "拖拽人員到行事曆新增排班": "Drag staff to the calendar to add shift",
        "全部": "All",
        "新增排班": "Add shift",
        "人員": "Staff",
        "日期": "Date",
        "開始時間": "Start time",
        "結束時間": "End time",
        "班別": "Shift type",
        "早班 (08:00-16:00)": "Morning (08:00-16:00)",
        "中班 (16:00-24:00)": "Afternoon (16:00-24:00)",
        "夜班 (00:00-08:00)": "Night (00:00-08:00)",
        "急診班": "Emergency",
        "自訂時間": "Custom",
        // Shift type label used when a custom schedule is chosen.  Without
        // this entry the label "自訂" would remain untranslated on the
        // calendar and in notifications.  It is distinct from
        // "自訂時間" which refers specifically to the custom time option.
        "自訂": "Custom",
        "備註": "Notes",
        "輸入備註資訊...": "Enter notes...",
        "取消": "Cancel",
        "設定固定上班時間": "Set fixed shift time",
        "選擇人員": "Select staff",
        "固定班別": "Fixed shift type",
        "工作日選擇": "Working days",
        "日": "Sun",
        "一": "Mon",
        "二": "Tue",
        "三": "Wed",
        "四": "Thu",
        "五": "Fri",
        "六": "Sat",
        "應用範圍": "Apply range",
        "本月份": "This month",
        "下個月": "Next month",
        "本月及下個月": "This month and next",
        "自訂日期範圍": "Custom date range",
        "開始日期": "Start date",
        "結束日期": "End date",
        "固定上班排程": "Fixed shift schedule",
        "覆蓋現有排班（如果有衝突）": "Overwrite existing shifts (if there is a conflict)",
        "建立固定排班": "Create fixed schedule",

        // --- Added translations for scheduling notifications and prompts ---
        "請填寫所有必填欄位！": "Please fill in all required fields!",
        "排班更新成功！": "Shift updated successfully!",
        "排班新增成功！": "Shift added successfully!",
        "正在開啟 Google Calendar...": "Opening Google Calendar...",
        "沒有排班資料可同步": "No schedule data to sync",
        "iCal 檔案已下載！": "iCal file downloaded!",
        "所有排班已清空！": "All shifts have been cleared!",
        "找不到要刪除的排班！": "Unable to find the shift to delete!",
        "排班已刪除！": "Shift deleted!",
        "刪除失敗：找不到排班資料！": "Deletion failed: shift not found!",
        "排班已成功移動！": "Shift moved successfully!",
        "排班已成功移動！": "Shift moved successfully!",
        "請至少選擇一個工作日！": "Please select at least one working day!",
        "請設定自訂時間！": "Please set a custom time!",
        "請設定自訂日期範圍！": "Please set a custom date range!",
        "在該時段已有排班！": "already has a shift in this time slot!",
        "已有排班，無法重複安排！": "already has a shift, cannot schedule again!",
        "請至少選擇一個工作日！": "Please select at least one working day!",
        "請設定自訂時間！": "Please set a custom time!",
        "請設定自訂日期範圍！": "Please set a custom date range!",
        "目前沒有排班記錄。": "currently has no shift records.",
        "無法開啟列印視窗，請檢查瀏覽器設定。": "Unable to open the print window, please check your browser settings.",
        "列印排班表時發生錯誤！": "An error occurred while printing the schedule!",
        "沒有發現排班衝突！": "No schedule conflicts detected!",
        "個排班衝突：\n\n": " schedule conflicts:\n\n",
        "有重疊排班\n": " has overlapping shifts on \n",
        "只有管理員才能執行": "Only administrators can perform ",
        "！": "!",
        "確定要清空所有排班嗎？此操作無法復原。": "Are you sure you want to clear all shifts? This action cannot be undone.",
        // Confirmation dialog translations
        "確定要刪除以下排班嗎？": "Are you sure you want to delete the following shift?",
        "人員：": "Staff:",
        "此操作無法復原！": "This action cannot be undone!",
        "排班詳情：": "Shift details:",
        "姓名：": "Name:",
        "職位：": "Position:",
        "時間：": "Time:",
        "小時": "hours",
        "備註：": "Notes:",
        "聯絡電話：": "Contact phone:",
        "電子郵件：": "Email:",
        "日期：": "Date:",
        "無": "None",
        "可排班": "Available",
        "已排班": "Scheduled",
        // Additional translations for schedule list and contact
        "的排班記錄：": " shift records:",
        "備註:": "Notes:",
        "聯絡": "Contact",
        "電話:": "Phone:",
        "信箱:": "Email:",
        "部門:": "Department:",
        "職位:": "Position:",
        "要撥打電話嗎？": "Would you like to call?",
        // Translations for additional scheduling messages
        "已為": "Added for",
        "新增": "added",
        "您沒有權限讀取排班資料，如需存取請聯繫管理員": "You do not have permission to read schedule data. Please contact the administrator to access it.",

        // Additional scheduling translations
        "建立固定排班": "create fixed schedule",
        "固定排班建立完成！": "Fixed schedule created successfully!",
        "新增排班：": "Added shifts:",
        // Specific phrases for actions in the scheduling system
        "新增排班": "Add shift",
        "編輯排班": "Edit shift",
        "刪除排班": "Delete shift",
        "新增或編輯排班": "Add or edit shift",
        "新增或移動排班": "Add or move shift",
        "清空所有排班": "Clear all shifts",
        "替換排班：": "Replaced shifts:",
        "替換": "replaced",
        "工作日：": "Working days:",
        // Additional labels used in the scheduling UI
        // When confirming deletion or showing details, colon versions of labels
        // need their own translation keys. Without these entries, the
        // translate helper will fall back to the Chinese original.  Add
        // translations for "日期：", "無" and "班別：".
        "日期：": "Date:",
        "無": "None",
        "班別：": "Shift type:",
        "班別:": "Shift type:",
        "一般排班": "General shift",
        "無排班": "No shifts",
        "醫院": "Hospital",
        "排班": "Shift",
        "滿班": "Full",
        "排班表": "Shift schedule",
        // Filename base used when exporting the schedule to iCal.  When
        // generating the .ics file, the code retrieves this translation and
        // appends '.ics' so that the exported file has a localized name.
        "醫療排班行事曆": "Medical shift schedule",
        // Placeholder name for unknown staff in example data.  This is only
        // shown when a staff entry lacks a name; do not confuse it with the
        // chat system's "未知用戶" (Unknown user) which is translated separately.
        "未知人員": "Unknown staff",
        // Navigation labels for previous/next month in the scheduling calendar
        "上一個月": "Previous month",
        "下一個月": "Next month",

        // Labels for the scheduling menu item and its description
        "醫療排班": "Medical scheduling",
        "排班與行事曆查看": "View schedules and calendar",

        // Generic phrase used when referring to an unspecified operation (e.g., in admin checks)
        "此操作": "this action",
        "，替換": ", replaced",
        "。": ".",
        "請輸入中藥材名稱！": "Please enter the herb name!",
        "處理確認到達時發生錯誤": "An error occurred while processing arrival confirmation",
        "載入診症表單時發生錯誤": "An error occurred while loading the consultation form",
        "收費項目已新增！": "Billing item added!",
        "除折扣項目外，收費金額不能為負數！": "Except for discount items, billing amount cannot be negative!",
        "藥單醫囑已準備列印！": "Prescription instructions are ready to print!",
        "主管理員帳號不可編輯！": "Super admin accounts cannot be edited!",
        "退回套票時發生錯誤": "An error occurred while refunding the package",
        "診症完成後無法新增套票": "Cannot add packages after the consultation is completed",
        "請輸入電子郵件和密碼！": "Please enter email and password!",
        "備份資料已匯出！": "Backup data has been exported!",
        "請輸入有效的藥量（0.5-100克）": "Please enter a valid dosage (0.5-100 grams)",
        "載入用戶數據時發生錯誤，使用本地數據": "Error loading user data, using local data",
        "登入成功！": "Login successful!",
        "刪除中...": "Deleting...",
        "主管理員帳號不可停用！": "Super admin accounts cannot be disabled!",
        "刪除用戶失敗，請稍後再試": "Failed to delete user, please try again later",
        "無法讀取診症記錄": "Unable to read consultation record",
        "方劑資料已更新！": "Formula data updated!",
        "主管理員帳號不可刪除！": "Super admin accounts cannot be deleted!",
        "更新用戶資料失敗，請稍後再試": "Failed to update user data, please try again later",
        "保存病人數據失敗": "Failed to save patient data",
        "保存時發生錯誤，請稍後再試": "An error occurred while saving, please try again later",
        "請輸入有效的電話號碼！": "Please enter a valid phone number!",
        "出生日期不能晚於今天！": "Date of birth cannot be later than today!",
        "保存時發生錯誤": "An error occurred while saving",
        "刪除診症記錄時發生錯誤": "An error occurred while deleting the consultation record",
        "方劑已新增！": "Formula added!",
        "請輸入有效天數！": "Please enter a valid number of days!",
        "請填寫必要資料（姓名、職位）！": "Please fill in the required fields (name, position)!",
        "病人資料已刪除！": "Patient data deleted!",
        "找不到掛號記錄！": "Registration record not found!",
        "用戶已成功新增！": "User added successfully!",
        "找不到指定的診症記錄！": "Specified consultation record not found!",
        "登出時發生錯誤": "An error occurred during logout",
        "處理中...": "Processing...",
        "更新失敗，請稍後再試": "Update failed, please try again later",
        "系統錯誤：找不到診症記錄！": "System error: consultation record not found!",
        "更新用戶狀態時發生錯誤": "An error occurred while updating user status",
        "診症記錄已保存！": "Consultation record saved!",
        "找不到選定的醫囑模板": "Selected prescription template not found",
        "權限不足，無法執行此操作": "Insufficient permissions to perform this operation",
        "中藥材資料已更新！": "Herb data updated!",
        "權限不足，無法新增收費項目": "Insufficient permissions to add billing items",
        "模板資料匯入完成！": "Template data import completed!",
        "列印到診證明時發生錯誤": "An error occurred while printing the arrival certificate",
        "已載入醫囑模板": "Prescription template loaded",
        "無法讀取診症記錄！": "Unable to read consultation record!",
        "保存診症記錄失敗，請稍後再試": "Failed to save consultation record, please try again later",
        "收費項目已更新！": "Billing item updated!",
        "請選擇項目類別！": "Please select an item category!",
        "同名折扣項目僅能使用一項": "Only one discount item with the same name can be used",
        "保存用戶數據失敗": "Failed to save user data",
        "只有管理員可以刪除病人": "Only administrators can delete patients",
        "找不到診症記錄！": "Consultation record not found!",
        "請輸入模板名稱！": "Please enter the template name!",
        "中藥資料匯入完成！": "Herb data import completed!",
        "開始診症時發生錯誤": "An error occurred while starting the consultation",
        "此帳號尚未被授權，請聯繫系統管理員": "This account has not been authorized, please contact the system administrator",
        "權限不足，您沒有存取此功能的權限": "Insufficient permissions, you do not have access to this function",
        "用戶資料已成功更新！": "User data updated successfully!",
        "新增失敗，請稍後再試": "Addition failed, please try again later",
        "此電子郵件已存在，請使用其他電子郵件！": "This email already exists, please use another email!",
        "匯入中藥資料失敗，請確認檔案格式是否正確": "Failed to import herb data, please check if the file format is correct",
        "權限不足，無法存取收費項目管理": "Insufficient permissions to access billing item management",
        "請先開始診症！": "Please start the consultation first!",
        "財務報表已更新！": "Financial report updated!",
        "已成功登出": "Successfully logged out",
        "無法連接到伺服器，請稍後再試": "Unable to connect to server, please try again later",
        "刪除失敗，請稍後再試": "Deletion failed, please try again later",
        "數據管理器尚未準備就緒": "Data manager is not ready yet",
        "只能載入相同病人的病歷記錄！": "Only medical records for the same patient can be loaded!",
        "保存診症記錄失敗": "Failed to save consultation record",
        "列印收據時發生錯誤": "An error occurred while printing the receipt",
        "無法讀取病人資料！": "Unable to read patient data!",
        "折扣項目已存在，無法重複使用": "Discount item already exists and cannot be used again",
        "請輸入套票可用次數！": "Please enter available package uses!",
        "財務報表已匯出！": "Financial report exported!",
        "醫師職位必須填寫中醫註冊編號！": "The doctor's position must include the Chinese medicine registration number!",
        "只有該掛號的醫師才能開始診症！": "Only the doctor for this registration can start the consultation!",
        "掛號失敗，請稍後再試": "Registration failed, please try again later",
        "已退出病歷編輯模式": "Exited medical record edit mode",
        "找不到病人資料": "Patient data not found",
        "診所資料已成功更新！": "Clinic data updated successfully!",
        "不能刪除自己的帳號！": "Cannot delete your own account!",
        "更新診症記錄失敗，請稍後再試": "Failed to update consultation record, please try again later",
        "中藥材已新增！": "Herb added!",
        "請選擇掛號醫師！": "Please select a registration doctor!",
        "找不到病人資料！": "Patient data not found!",
        "找不到對應的套票，已移除項目": "Corresponding package not found, item removed",
        "已載入常用藥方組合：": "Loaded frequently used prescription combinations:",
        "匯出備份失敗，請稍後再試": "Failed to export backup, please try again later",
        "只能列印已完成診症的藥單醫囑！": "Prescription instructions can only be printed for completed consultations!",
        "請填寫必填欄位：主訴、中醫診斷！": "Please fill in the required fields: chief complaint and Chinese medical diagnosis!",
        "只能列印已完成診症的到診證明！": "Arrival certificates can only be printed for completed consultations!",
        "請輸入有效的電子郵件格式！": "Please enter a valid email format!",
        "權限不足，無法保存收費項目": "Insufficient permissions to save billing items",
        "已移除套票使用項目，未退回次數": "Package usage item removed without returning uses",
        "病假證明書已準備列印！": "Sick leave certificate is ready to print!",
        "電話格式不正確，請輸入 7-15 位數字！": "Invalid phone format, please enter 7-15 digits!",
        "權限不足，無法刪除收費項目": "Insufficient permissions to delete billing items",
        "搜尋穴位名稱、定位、功能或經絡...": "Search for acupoint names, locations, functions or meridians...",
        "暫無診症記錄": "No medical records yet",
        "該病人尚未有診症記錄": "This patient has no medical records yet",
        "總診療次數": "Total number of visits",
        "最近診療": "Last visit",
        "無": "None",
        "無安排": "No plans",
        "下次複診": "Next follow-up visit",
        "套票情況": "Package status",
        "尚未購買套票": "Not purchased package yet",
        "可於診療時購買套票享優惠": "Discount available when purchasing package during visit",
        "有效套票": "Valid packages",
        "下一頁": "Next page",
        "上一頁": "Previous page",
        // Pagination: first and last page labels
        "最前一頁": "First page",
        "最後一頁": "Last page",
        "失效套票": "Expired packages",
        "統計期間": "Statistical Period",
        "編輯收費項目": "Edit Fee Items",
        "組合名稱": "Combination Name",
        "分類": "Category",
        "適應症描述": "Indication Description",
        "搜尋藥材或方劑": "Search for Herbs or Prescriptions",
        "藥材": "Herb",
        "搜尋穴位": "Search for Acupoints",
        "穴位": "Acupoints",
        "針法": "Acupuncture Method",
        // Use abbreviated unit to display quantity in grams
        "克": "g",
        "刪除": "Delete",
        "撤回診症": "Withdraw",
        "移除掛號": "Remove",
        "創建自己的組合": "Create your own package",
        "停用": "Disable",
        "啟用": "Enable",
        "從未登入": "Never logged in",
        "主管理員不可修改": "Primary administrator cannot modify",
        "編輯用戶": "Edit user",
        "收入分析與財務統計": "Income analysis and financial statistics",
        "診療費收入": "Consultation fee income",
        "藥費收入": "TCM herbs fee income",
        "治療費收入": "Treatment fee income",
        "其他收入": "Other income",
        "套票收入": "Package income",
        "套票使用": "Package Use",
        "取消使用": "Cancel Use",
        "載入病歷": "Load Record",
        "無特殊主訴": "None",
        "病歷編號": "Record Number",
        "醫師": "Doctor",
        // Updated translations for dynamic record labels.  These translate
        // the suffix portion only; the patient's name preceding
        // "的診症記錄" or "的病歷記錄" will be retained during
        // dynamic translation (see translateNode below).
        "的診症記錄": "'s Consultation Records",
        "的病歷記錄": "'s Medical Records",
        "當前用戶": "Current User",

        // Additional variant with trailing colon for labels that include punctuation.
        // Add trailing space after colon so that dynamic names are separated
        "當前用戶：": "Current User: ",

        // Add translations for meridian names.  These entries allow the
        // translation logic to translate dynamic strings such as
        // "手太陰肺經 (11)" by matching the base name and preserving
        // the numeric suffix (see translateNode for dynamic logic).
        "手太陰肺經": "Hand Taiyin Lung Meridian",
        "手陽明大腸經": "Hand Yangming Large Intestine Meridian",
        "足陽明胃經": "Foot Yangming Stomach Meridian",
        "足太陰脾經": "Foot Taiyin Spleen Meridian",
        "手少陰心經": "Hand Shaoyin Heart Meridian",
        "手太陽小腸經": "Hand Taiyang Small Intestine Meridian",
        "足太陽膀胱經": "Foot Taiyang Bladder Meridian",
        "足少陰腎經": "Foot Shaoyin Kidney Meridian",
        "手厥陰心包經": "Hand Jueyin Pericardium Meridian",
        "手少陽三焦經": "Hand Shaoyang Sanjiao Meridian",
        "足少陽膽經": "Foot Shaoyang Gallbladder Meridian",
        "足厥陰肝經": "Foot Jueyin Liver Meridian",
        "督脈": "Governing Vessel",
        "任脈": "Conception Vessel",
        "編輯": "Edit",
        "病歷": "Record",
        "編輯病人資料": "Edit Patient Information",
        "更新": "Update",
        "已掛號": "Registered",
        "候診中": "Waiting",
        "診症中": "Seeing",
        "+ 新增收費項目": "+ Add Billing Item",
        "+ 新增用戶": "+ Add User",
        "+ 新增病人": "+ Add Patient",
        "+ 新增穴位組合": "+ Add Acupoint Combo",
        "+ 新增藥方組合": "+ Add Formula Combo",
        "管理分類": "Manage Categories",
        "一般用戶": "General User",
        "上月": "Last Month",
        "上週": "Last Week",
        "不使用問診資料": "Do not use consultation data",
        "中藥庫": "Herbal Library",
        "中藥服用方法": "Herb Usage Method",
        "中藥材": "Chinese Herbs",
        "中藥材名稱 *": "Herb Name *",
        "中醫診斷 *": "TCM Diagnosis *",
        "中醫註冊編號 *": "TCM Registration Number *",
        "主治": "Indications",
        "主要服務": "Main Service",
        "主訴 *": "Chief Complaint *",
        "主訴症狀": "Symptoms",
        "人": "People",
        "今天": "Today",
        "今年": "This Year",
        "佔比": "Proportion",
        "使用注意": "Usage Notes",
        "保存": "Save",
        "保存病歷": "Save Medical Record",
        "個人設置": "Personal Settings",
        "停用的帳號將無法登入系統": "Disabled accounts will not be able to log in",
        "備註": "Notes",
        "儲存": "Save",
        "內科疾病": "Internal Diseases",
        "全部": "All",
        "全部分類": "All Categories",
        "全部用戶": "All Users",
        "全部科別": "All Departments",
        "全部醫師": "All Doctors",
        "全部針法": "All Needling Methods",
        "全部類別": "All Types",
        "其他": "Others",
        "出生日期 *": "Date of Birth *",
        "出處": "Source",
        "別名": "Alias",
        "到診時間": "Arrival Time",
        "刷新": "Refresh",
        "功效": "Effect",
        "匯入備份": "Import Backup",
        "匯出": "Export",
        "匯出備份": "Export Backup",
        "去年": "Last Year",
        "取消": "Cancel",
        "取消診症": "Cancel Consultation",
        "啟用此收費項目": "Enable this billing item",
        "啟用此用戶帳號": "Enable this user account",
        "四肢部": "Limbs",
        "報表類型": "Report Type",
        "天": "Days",
        "套票可用次數 *": "Package Available Uses *",
        "套票項目": "Package Item",
        "女": "Female",
        "姓名": "Name",
        "姓名 *": "Name *",
        "婦科疾病": "Gynecological Diseases",
        "婦科調理": "Gynecological Treatment",
        "完成診症次數": "Completed Consultations",
        "密碼": "Password",
        "實際到診的時間（用於證明書）": "Actual arrival time (for certificates)",
        "對應 Firebase Authentication 帳號的 UID": "UID corresponding to Firebase Auth account",
        "尚未載入或無套票": "No packages loaded",
        "已停用": "Disabled",
        "常用劑量": "Common Dosage",
        "常用穴位組合": "Common Acupoint Combos",
        "常用藥方組合": "Common Herbal Combos",
        "平均單價": "Average Price",
        "平均消費": "Average Spending",
        "平補平瀉": "Neutral Tonification",
        "年報表": "Annual Report",
        "年齡": "Age",
        "年齡：": "Age:",
        "序號": "No.",
        "建議休息期間": "Recommended rest period",
        "建議病人下次回診的時間": "Recommended next appointment time",
        "快速選擇": "Quick Select",
        "性別": "Gender",
        "性別 *": "Gender *",
        "性別：": "Gender:",
        "性味": "Nature and Taste",
        "您可以匯出診所資料備份（包含所有功能資料，不含模板庫與中藥庫），或匯入之前的備份檔案。實時掛號資料不包含在備份中。": "You can export clinic data backup (including all functional data, excluding template and herb libraries), or import a previous backup. Real‑time registration data is not included in the backup.",
        "感冒類": "Cold Remedies",
        "折扣項目": "Discount Item",
        "折扣項目：輸入0.9表示9折，輸入9會自動轉為9折，或輸入負數表示固定金額折扣": "Discount item: enter 0.9 for 10% off, entering 9 will automatically convert to 10% off, or enter a negative number for a fixed amount discount",
        "掛號列表": "Registration List",
        "掛號時間": "Registration Time",
        "掛號時間：": "Registration Time:",
        "掛號診症系統": "Registration and Consultation System",
        "掛號醫師": "Doctor",
        "掛號醫師 *": "Doctor *",
        // Colon variant for registration doctor to ensure proper translation lookup
        "掛號醫師：": "Doctor:",
        "搜索病人掛號": "Search patient registrations",
        "操作": "Actions",
        "收入佔比": "Revenue Share",
        "收入摘要": "Revenue Summary",
        "收入金額": "Revenue Amount",
        "收費金額 *": "Charge Amount *",
        "收費項目": "Billing Items",
        "收費項目管理": "Billing Item Management",
        "新增": "Add",
        "新增、查看、管理病人資料": "Add, view, and manage patient data",
        "新增中藥材": "Add Herb",
        "新增分類": "Add Category",
        "新增收費項目": "Add Billing Item",
        "新增方劑": "Add Formula",
        "新增用戶": "Add User",
        "新增病人資料": "Add Patient Data",
        "方劑": "Formula",
        "方劑名稱 *": "Formula Name *",
        "日報表": "Daily Report",
        "日期": "Date",
        "昨天": "Yesterday",
        "更新報表": "Update Report",
        "最後登入": "Last Login",
        "月報表": "Monthly Report",
        "有效天數 *": "Valid Days *",
        "有診症的醫師": "Doctors with Consultations",
        "服務分析": "Service Analysis",
        "服務類型": "Service Type",
        "服藥天數": "Days of Medication",
        "本月": "This Month",
        "本週": "This Week",
        "模板庫": "Template Library",
        "次/日": "Times/Day",
        "次數": "Times",
        "歸經": "Meridian Entry",
        "每日明細": "Daily Details",
        "每日次數": "Daily Count",
        "每次診症平均": "Average per Consultation",
        "治療費": "Treatment Fee",
        "注意事項": "Precautions",
        "活躍醫師": "Active Doctors",
        "消化系統": "Digestive System",
        "清熱類": "Heat‑Clearing Category",
        "清除": "Clear",
        "瀉法": "Sedation",
        "狀態": "Status",
        "現有分類": "Existing Categories",
        "現病史": "Current Medical History",
        "用戶管理": "User Management",
        "用於病假證明書的建議休息期間": "Suggested rest period for sick leave certificate",
        "用法": "Usage",
        "男": "Male",
        "病人姓名": "Patient",
        "病人掛號": "Patient Registration",
        "病人詳細資料": "Patient Details",
        "病人資料管理": "Patient Management",
        "病人資訊": "Patient Information",
        "病人：": "Patient:",
        "病史及備註": "Medical History & Notes",
        "病史及備註：": "Medical History & Notes:",
        "病歷記錄": "Medical Records",
        // Medical record management page
        "病歷管理": "Medical Record Management",
        "搜尋病歷編號、病人姓名或醫師...": "Search record number, patient name or doctor...",
        "病歷詳細資訊": "Medical Record Details",
        "檢視": "View",
        "療程": "Treatment Course",
        // Added translations for medical record management description and cancel waiting action
        "查看及搜尋病歷": "View and search medical records",
        "取消候診": "Cancel arrival",
        "登入系統": "Login",
        "登出": "Logout",
        "登出系統": "Logout System",
        "確認掛號": "Confirm Registration",
        "穴位庫": "Acupoint Library",
        "管理診所用戶權限": "Manage clinic user permissions",
        "簡潔的掛號流程管理": "Concise registration process management",
        "系統功能概覽": "System Function Overview",
        "系統管理": "System Management",
        "組成 *": "Composition *",
        "結束日期": "End Date",
        "結束：": "End:",
        "統計期間收入": "Income for the period",
        "統計資料、備份匯出": "Statistics & Backup Export",
        "編號": "ID",
        // Generic number label colon variant used in registration search
        "編號：": "ID:",
        "編輯組合": "Edit Combo",
        "總收入": "Total Revenue",
        "總計：": "Total:",
        "總費用：": "Total Cost:",
        "總金額": "Total Amount",
        "聯絡地址": "Contact Address",
        "職位": "Position",
        "職位 *": "Position *",
        "背腰部": "Back and Waist",
        "胸腹部": "Chest and Abdomen",
        "脈象": "Pulse",
        "自訂期間": "Custom Period",
        "自購買日起算": "Count from purchase date",
        "舌象": "Tongue",
        "若病人已填寫問診，可在此選擇預填資訊": "If patient has filled out the questionnaire, you can select to auto‑fill information here",
        "藥費": "Medicine Fee",
        "處方內容": "Prescription Content",
        "補法": "Tonification",
        "補益類": "Tonifying Category",
        "複診時間": "Follow‑up Time",
        "計費單位": "Billing Unit",
        "記錄症狀、診斷、開立處方": "Record symptoms, diagnosis, and prescribe",
        "診所中文名稱 *": "Clinic Chinese Name *",
        "診所中文名稱：": "Clinic Chinese Name:",
        "診所功能": "Clinic Functions",
        "診所地址": "Clinic Address",
        "診所收入分析與財務統計": "Clinic Revenue Analysis & Financial Statistics",
        "診所營業時間": "Clinic Operating Hours",
        "診所用戶管理": "Clinic User Management",
        "診所管理": "Clinic Management",
        "診所英文名稱": "Clinic English Name",
        "診所英文名稱：": "Clinic English Name:",
        "診所設定": "Clinic Settings",
        "診所資料修改": "Clinic Data Modification",
        "診所電話": "Clinic Phone",
        "診斷模板": "Diagnosis Templates",
        "診症人次": "Number of Consultations",
        "診症系統": "Consultation System",
        "診症記錄": "Records",
        // Added translations for colon variants and navigation terms
        "醫師：": "Doctor:",
        "病歷編號：": "Record Number:",
        "較舊": "Older",
        "較新": "Newer",
        "時間未知": "Unknown time",
        "列印收據": "Receipts",
        "藥單醫囑": "Prescriptions",
        "到診證明": "Att. Certs",
        "病假證明": "Doctor's Note",
        "修改病歷": "Edit",
        "已完成": "Done",
        "確認到達": "Confirm arrival",
        "開始診症": "Start consultation",
        "繼續診症": "Continue consultation",
        "完成診症": "Complete consultation",
        "保存病歷": "Save consultation",
        "診療費": "Consultation Fee",
        "註冊編號": "Registration Number",
        "詳細財務報表": "Detailed Financial Report",
        "請使用上方搜索功能添加中藥材或方劑": "Please use the search function above to add herbs or formulas",
        "請使用上方搜索功能添加收費項目": "Please use the search function above to add billing items",
        "請輸入您的電子郵件及密碼登入": "Please enter your email and password to log in",
        "請輸入病人姓名、編號或電話進行搜索": "Please enter patient name, ID, or phone number to search",
        "請選擇...": "Please select...",
        "請選擇性別": "Please select gender",
        "請選擇職位": "Please select position",
        "請選擇醫師": "Please select doctor",
        "請選擇開始和結束日期": "Please select start and end dates",
        "請選擇類別": "Please select category",
        "請點擊「更新報表」來載入資料": "Please click 'Update Report' to load data",
        "請點擊左上角選單按鈕開始使用系統功能": "Please click the menu button at the top left to start using system functions",
        "證型診斷": "Pattern Diagnosis",
        "護理師": "Nurse",
        "財務報表": "Financial Report",
        "資料備份與還原": "Data Backup and Restore",
        "資料更新時間：": "Data update time:",
        "身分證字號 *": "ID Card Number *",
        "週報表": "Weekly Report",
        "過敏史": "Allergy History",
        "過敏史：": "Allergy History:",
        "選擇問診資料": "Select consultation data",
        "配合艾灸": "Combined with moxibustion",
        "醫囑及注意事項": "Doctor's advice and precautions",
        "醫囑模板": "Doctor's Advice Templates",
        "醫師": "Doctor",
        "醫師業績": "Doctor Performance",
        "醫師篩選": "Doctor Filter",
        "醫師職位必須填寫註冊編號": "The doctor position must have a registration number",
        "金額": "Amount",
        "針灸備註": "Acupuncture Notes",
        "開始日期": "Start Date",
        "開始：": "Start:",
        "關閉": "Close",
        "電子郵件": "Email",
        "電話": "Phone",
        "電話號碼": "Phone Number",
        "電話號碼 *": "Phone Number *",
        "項目": "Item",
        "項目名稱 *": "Item Name *",
        "項目說明": "Item Description",
        "項目類別 *": "Item Category *",
        "頭面部": "Head and Face",
        "🌿 慣用中藥組合": "🌿 Common Herbal Formulas",
        "🌿 載入常用藥方": "🌿 Load Common Formulas",
        "🎫 病人套票": "🎫 Patient Packages",
        "💰 載入上次收費": "💰 Load Last Billing",
        "💰 選擇收費項目：": "💰 Select Billing Items:",
        "📋 載入上次處方": "📋 Load Last Prescription",
        "📋 載入醫囑模板": "📋 Load Advice Templates",
        "📋 醫囑模板": "📋 Advice Templates",
        "📍 慣用穴位組合": "📍 Common Acupoint Combos",
        "📍 載入常用穴位": "📍 Load Common Points",
        "🔍 搜索中藥庫：": "🔍 Search Herbal Library:",
        "🔍 搜索穴位：": "🔍 Search Acupoints:",
        "🔍 診斷模板": "🔍 Diagnosis Templates",
        "🔍 載入診斷模板": "🔍 Load Diagnosis Templates",

        /*
         * Additional translations for action buttons in the personal settings and billing
         * item management sections.  Without these exact mappings the English UI would
         * still display Chinese when the language is switched.  The keys here include
         * the leading "+" symbol and a space to match the actual button labels in
         * system.html.  See lines 1715 and 1745 in system.html for reference.
         */
        "+ 管理分類": "+ Manage Categories",
        /* Additional translations to cover previously untranslated visible text */
        "不含模板庫與中藥庫": "Excluding template and herb libraries",
        "中藥材名稱": "Herbal ingredient name",
        "中醫診斷": "TCM diagnosis",
        "中醫註冊編號": "TCM registration number",
        "主訴": "Chief complaint",
        "來載入資料": "Load data",
        "備份匯出": "Export backup",
        "出生日期": "Date of birth",
        "包含所有功能資料": "Includes all functional data",
        "可在此選擇預填資訊": "You may select to prefill information here",
        "套票可用次數": "Package available uses",
        "實時掛號資料不包含在備份中": "Real‑time registration data is not included in backups",
        "實際到診的時間": "Actual arrival time",
        "對應": "Corresponding",
        "帳號的": "Account's",
        "您可以匯出診所資料備份": "You may export clinic data backups",
        "慣用中藥組合": "Common herbal combinations",
        "慣用穴位組合": "Common acupoint combinations",
        "或匯入之前的備份檔案": "or import a previous backup file",
        "或輸入負數表示固定金額折扣": "or enter a negative number for a fixed amount discount",
        "搜索中藥庫": "Search herbal library",
        "搜索穴位": "Search acupoints",
        "收費金額": "Charge amount",
        "新增病人": "Add patient",
        "新增穴位組合": "Add acupoint combination",
        "新增藥方組合": "Add herbal formula combination",
        "方劑名稱": "Formula name",
        "會自動轉為": "will automatically convert to",
        "有效天數": "Valid days",
        "查看": "View",
        "用於證明書": "For certificates",
        "病人": "Patient",
        "病人套票": "Patient packages",
        "管理病人資料": "Manage patient data",
        "組成": "Composition",
        "結束": "End",
        "統計資料": "Statistics",
        "編號或電話進行搜索": "Search by ID or phone",
        "總計": "Total",
        "總費用": "Total cost",
        "若病人已填寫問診": "If patient has filled in consultation",
        "表示": "Indicates",
        "記錄症狀": "Record symptoms",
        "診所中文名稱": "Clinic Chinese name",
        "診斷": "Diagnosis",
        "請輸入病人姓名": "Please enter patient name",
        "請選擇": "Please select",
        "請點擊": "Please click",
        "資料更新時間": "Data update time",
        "身分證字號": "ID card number",
        "載入上次收費": "Load last billing",
        "載入上次處方": "Load last prescription",
        "載入常用穴位": "Load common acupoints",
        "載入常用藥方": "Load common formulas",
        "載入診斷模板": "Load diagnosis template",
        "載入醫囑模板": "Load advice template",
        "輸入": "Input",
        "選擇收費項目": "Select billing item",
        "開始": "Start",
        "開立處方": "Prescribe",
        "項目名稱": "Item name",
        "項目類別": "Item category",
        "查看醫囑與診斷模板": "View medical order and diagnosis templates",
        "查看中藥材及方劑資料": "View information on Chinese herbal medicines and prescriptions",
        "查看穴位資料": "View acupoint information",
        "管理診療費用及收費項目": "Manage medical expenses and charges",
        "管理慣用藥方及穴位組合": "Manage commonly used prescriptions and acupoint combinations",
        /* Additional translations added to cover previously untranslated Chinese labels.
         * These keys correspond to new features like category management and dynamic labels. */
        "組合名稱 *": "Combination Name *",
        "個可用": "available",
        "管理中藥分類": "Manage herb categories",
        "管理穴位分類": "Manage acupoint categories",
        "管理醫囑分類": "Manage prescription categories",
        "管理診斷分類": "Manage diagnosis categories",
        // Simplified Chinese search hints
        "搜索穴位、經絡名稱或功能...": "Search acupoints, meridian name, or function...",
        "搜索穴位名稱、經絡或定位...": "Search acupoint name, meridian, or location...",
        // Additional placeholder translations
        "中醫病名診斷...": "TCM disease name diagnosis...",
        "例如：10": "e.g.: 10",
        "例如：180（半年）": "e.g.: 180 (half year)",
        "例：0912-345-678": "e.g.: 0912-345-678",
        "例：3-9g": "e.g.: 3-9g",
        "例：7天、2週、1個月等...": "e.g.: 7 days, 2 weeks, 1 month, etc...",
        "例：A123456789": "e.g.: A123456789",
        "例：傷寒論、金匱要略": "e.g.: Shang Han Lun, Jin Gui Yao Lue",
        "例：次、劑、包": "e.g.: times, doses, packs",
        "例：肺、脾經": "e.g.: Lung, Spleen meridian",
        "例：辛、溫": "e.g.: Pungent, Warm",
        "例：週一至週五 09:00-18:00": "e.g.: Mon-Fri 09:00-18:00",
        "其他名稱或別名": "Other names or aliases",
        "搜尋中藥材、方劑名稱或功能...": "Search herb or formula name or function...",
        "搜尋收費項目名稱...": "Search billing item name...",
        "搜尋用戶名稱或電子郵件...": "Search user name or email...",
        "搜尋病人姓名、編號或電話...": "Search patient name, ID, or phone...",
        "搜尋病人編號、姓名或電話...": "Search patient ID, name, or phone...",
        "搜尋穴位、經絡名稱或功能...": "Search acupoint, meridian name, or function...",
        "搜尋穴位名稱、經絡或定位...": "Search acupoint name, meridian, or location...",
        "搜尋穴位組合名稱...": "Search acupoint combination name...",
        "搜尋藥方組合名稱...": "Search formula combination name...",
        "搜尋診斷模板名稱或內容...": "Search diagnosis template name or content...",
        "搜尋醫囑模板名稱...": "Search advice template name...",
        "搜索中藥材、方劑名稱或功能...": "Search herb or formula name or function...",
        "搜索收費項目名稱...": "Search billing item name...",
        "煎煮方法、服用時間、劑量等...": "Decoction method, administration time, dosage, etc...",
        "病人主要不適症狀、發病時間、症狀特點等...": "Patient's main discomfort symptoms, onset time, symptom characteristics, etc...",
        "發病經過、症狀變化、治療經過等...": "Course of illness, symptom changes, treatment process, etc...",
        "禁忌、注意事項等": "Contraindications, precautions, etc.",
        "禁忌或注意事項": "Contraindications or precautions",
        "系統自動計算": "Automatically calculated by the system",
        "脈位、脈率、脈力、脈形等...": "Pulse position, pulse rate, pulse strength, pulse shape, etc...",
        "舌質、舌苔、舌形等...": "Tongue color, tongue coating, tongue shape, etc...",
        "請描述主治": "Please describe indications",
        "請描述主要功效": "Please describe main effects",
        "請描述收費項目的詳細內容": "Please describe billing item details",
        "請描述方劑主治": "Please describe the formula indications",
        "請描述方劑主要功效": "Please describe the formula's main effects",
        "請描述方劑用法": "Please describe the formula usage",
        "請簡述病人的主要症狀...": "Please briefly describe the patient's main symptoms...",
        "請記錄重要病史、家族病史、慢性疾病等": "Please record important medical history, family history, chronic diseases, etc.",
        "請詳細記錄藥物過敏或食物過敏史": "Please record in detail any drug or food allergy history",
        "請輸入 Firebase UID（可不填）": "Please enter Firebase UID (optional)",
        "請輸入中藥材名稱": "Please enter herb name",
        "請輸入中醫註冊編號": "Please enter TCM registration number",
        "請輸入姓名": "Please enter name",
        "請輸入完整地址": "Please enter full address",
        "請輸入收費項目名稱": "Please enter billing item name",
        "請輸入方劑名稱": "Please enter formula name",
        "請輸入方劑組成，例如：&#10;人參&#10;白朮&#10;茯苓&#10;甘草": "Please enter formula composition, e.g.:&#10;Ginseng&#10;Atractylodes&#10;Poria&#10;Licorice",
        "請輸入真實姓名": "Please enter real name",
        "請輸入診所中文名稱": "Please enter clinic Chinese name",
        "請輸入診所完整地址": "Please enter clinic full address",
        "請輸入診所英文名稱": "Please enter clinic English name",
        "請輸入診所電話號碼": "Please enter clinic phone number",
        "請輸入電話號碼": "Please enter phone number",
        "輸入分類名稱...": "Enter category name...",
        "辨證分型、病機分析...": "Pattern classification, pathogenesis analysis...",
        "針灸穴位、手法、注意事項等...": "Acupuncture points, techniques, precautions, etc...",
        "飲食宜忌、生活調護、注意事項等...": "Dietary recommendations, lifestyle care, precautions, etc...",
        "搜尋診斷模板...": "Search diagnosis templates...",
        "搜尋醫囑模板...": "Search advice templates...",
        "搜索常用藥方...": "Search common formulas...",
        "搜索常用穴位組合...": "Search common acupoint combinations...",
        "搜尋常用藥方...": "Search common formulas...",
        "搜尋常用穴位...": "Search common acupoints...",
        "穴位名稱": "Acupoint name",
        "如：服藥完畢後": "e.g.: after finishing medication",
        // Added translations for login page input placeholders
        "請輸入電子郵件": "Please enter your email",
        "請輸入密碼": "Please enter your password"
        ,
        // Age units for dynamic age formatting.  These entries allow the
        // translation logic to convert age suffixes such as "30歲", "6個月"
        // and "5天" by matching the numeric prefix and appending the
        // translated unit.  See translateNode for the corresponding regex.
        "歲": "years",
        "個月": "months",
        "天": "days"
    }
};

    // Add translation helper and dynamic translations for runtime messages
    (function() {
        /**
         * Helper function to translate a given text according to the currently selected language.
         * Falls back to the original text if no translation is found.
         * @param {string} text - The original Chinese text to translate.
         * @returns {string} Translated text based on current language or original text if not found.
         */
        function t(text) {
            try {
                const lang = localStorage.getItem('lang') || 'zh';
                const dict = window.translations && window.translations[lang] || {};
                return dict[text] || text;
            } catch (e) {
                return text;
            }
        }
        // Expose translation helper globally so other scripts (e.g., system.js) can use it.
        window.t = t;
        // Define dynamic runtime translations. These keys correspond to messages created dynamically in system.js.
        const dynamicTranslations = {
            '基本資料': 'Basic Information',
            '醫療資訊': 'Medical Information',
            '病人編號：': 'Patient ID:',
            '姓名：': 'Name:',
            '年齡：': 'Age:',
            '性別：': 'Gender:',
            '電話：': 'Phone:',
            '身分證：': 'ID Number:',
            '出生日期：': 'Date of Birth:',
            '地址：': 'Address:',
            '病史及備註：': 'Medical History & Notes:',
            '過敏史：': 'Allergies:',
            '建檔日期：': 'Created At:',
    // 標題用於病人列表中顯示建檔日期
    '建檔日期': 'Created At',
            '更新日期：': 'Updated At:',
            '診症記錄摘要': 'Consultation Summary',
            '載入診症記錄中...': 'Loading consultation records...',
            // -----------------------------------------------------------------
            // Additional in‑progress status translations
            // These strings appear on buttons or status labels while actions
            // such as saving, updating or loading are underway.  Without
            // corresponding English translations the UI will continue to show
            // Chinese when the language is switched.  By defining them here
            // they will be merged into both zh and en dictionaries below.
            '保存中...': 'Saving...',
            '儲存中...': 'Saving...',
            '更新中...': 'Updating...',
            '載入中...': 'Loading...',
            '讀取中...': 'Loading...',
            '列印中...': 'Printing...',
            '掛號中...': 'Registering...',
            '登入中...': 'Logging in...',
            '未設定': 'Not set',
            '未知': 'Unknown',
            '使用一次': 'Use once',
            '不能停用自己的帳號！': 'You cannot disable your own account!',
            '不能刪除最後一個診所管理帳號！': 'Cannot delete the last clinic admin account!',
            '不能刪除自己的帳號！': 'You cannot delete your own account!',
            '中藥材已新增！': 'Herb added!',
            '中藥材資料已更新！': 'Herb data updated!',
            '中藥資料匯入完成！': 'Herbal data import completed!',
            '中醫診所收據已準備列印！': 'TCM clinic receipt is ready for printing!',
            '主管理員帳號不可停用！': 'The super admin account cannot be disabled!',
            '主管理員帳號不可刪除！': 'The super admin account cannot be deleted!',
            '主管理員帳號不可編輯！': 'The super admin account cannot be edited!',
            '使用套票時發生錯誤': 'An error occurred while using the package',
            '保存成功！': 'Saved successfully!',
            '保存掛號數據失敗': 'Failed to save registration data',
            '保存時發生錯誤': 'An error occurred during saving',
            '保存時發生錯誤，請稍後再試': 'An error occurred during saving, please try again later',
            '保存用戶數據失敗': 'Failed to save user data',
            '保存病人數據失敗': 'Failed to save patient data',
            '保存診症記錄失敗': 'Failed to save consultation record',
            '保存診症記錄失敗，請稍後再試': 'Failed to save consultation record, please try again later',
            '備份資料匯入完成！': 'Backup data import completed!',
            '備份資料已匯出！': 'Backup data has been exported!',
            '出生日期不能晚於今天！': 'Date of birth cannot be later than today!',
            '列印到診證明時發生錯誤': 'An error occurred while printing arrival certificate',
            '列印收據時發生錯誤': 'An error occurred while printing receipt',
            '列印病假證明時發生錯誤': 'An error occurred while printing medical certificate',
            '列印藥單醫囑時發生錯誤': 'An error occurred while printing prescription instructions',
            '刪除中...': 'Deleting...',
            '刪除失敗，請稍後再試': 'Deletion failed, please try again later',
            '刪除時發生錯誤': 'An error occurred during deletion',
            '刪除用戶失敗，請稍後再試': 'Failed to delete user, please try again later',
            '刪除用戶時發生錯誤': 'An error occurred while deleting user',
            '刪除診症記錄時發生錯誤': 'An error occurred while deleting consultation record',
            '到診證明書已準備列印！': 'Arrival certificate is ready for printing!',
            '匯入中藥資料失敗，請確認檔案格式是否正確': 'Failed to import herb data, please check the file format',
            '匯入備份失敗，請確認檔案格式是否正確': 'Failed to import backup, please check the file format',
            '匯入模板資料失敗，請確認檔案格式是否正確': 'Failed to import template data, please check the file format',
            '匯出備份失敗，請稍後再試': 'Failed to export backup, please try again later',
            '取消套票使用時發生錯誤': 'An error occurred while canceling package usage',

            // Added translations for previously untranslated toast messages
            '保存庫存變更失敗！': 'Failed to save inventory changes!',
            '兩次輸入的密碼不一致！': 'The two entered passwords do not match!',
            '密碼長度至少需 6 位數！': 'Password must be at least 6 characters long!',
            '庫存已更新！': 'Inventory updated!',
            '建立 Firebase 帳號失敗：': 'Failed to create Firebase account:',
            '找不到輸入欄位，請重新載入頁面': 'Input field not found, please reload the page',
            '請填寫電子郵件地址！': 'Please enter your email address!',
            '請輸入並確認密碼！': 'Please enter and confirm your password!',

            // Personal statistics analysis and account security settings translations
            '個人統計分析': 'Personal Statistics Analysis',
            '統計醫師個人用藥與穴位使用情況，提供用藥和穴位偏好分析。': 'Analyze the doctor’s personal herb and acupoint usage to provide herb and acupoint preference analysis.',
            '常用方劑': 'Common Formulas',
            '常用中藥': 'Common Herbs',
            '常用穴位': 'Common Acupoints',
            '帳號安全設定': 'Account Security Settings',
            '在此可以安全地變更您的登入密碼或刪除帳號。此操作將影響您在系統中的登入權限，請謹慎操作。': 'Here you can safely change your login password or delete your account. This operation will affect your access to the system, please proceed with caution.',
            '變更密碼': 'Change Password',
            '當前密碼': 'Current Password',
            '新密碼': 'New Password',
            '確認新密碼': 'Confirm New Password',
            '請輸入當前密碼': 'Please enter your current password',
            '請輸入新密碼': 'Please enter a new password',
            '請再次輸入新密碼': 'Please re-enter the new password',
            '更新密碼': 'Update Password',
            '刪除帳號': 'Delete Account',
            '刪除帳號後，您將無法再登入系統，且所有與此帳號相關的資料將無法恢復。請慎重操作！': 'After deleting your account, you will no longer be able to log into the system, and all data associated with this account will be irrecoverable. Please proceed carefully.',
            '密碼確認': 'Password Confirmation',
            '請輸入您的密碼': 'Please enter your password',
            // Sidebar descriptions for personal statistics and account security
            '統計個人用藥與穴位偏好': 'Analyze personal herb and acupoint preferences',
            '變更密碼及刪除帳號': 'Change Password and Delete Account',
            '只有管理員可以刪除病人': 'Only administrators can delete patients',
            '只有該掛號的醫師才能開始診症！': 'Only the doctor of this registration can start the consultation!',
            '只能列印已完成診症的到診證明！': 'Only arrival certificates for completed consultations can be printed!',
            '只能列印已完成診症的收據！': 'Only receipts for completed consultations can be printed!',
            '只能列印已完成診症的病假證明！': 'Only medical certificates for completed consultations can be printed!',
            '只能列印已完成診症的藥單醫囑！': 'Only prescription instructions for completed consultations can be printed!',
            '只能載入相同病人的病歷記錄！': "Only the same patient's medical record can be loaded!",
            '同名折扣項目僅能使用一項': 'Only one discount item with the same name can be used',
            '已取消本次套票使用，次數已退回': 'Package usage has been canceled and the usage count has been returned',
            '已成功登出': 'Logged out successfully',
            '已移除套票使用項目，未退回次數': 'Package usage item removed without returning usage count',
            '已載入常用穴位組合：': 'Common acupoint combo loaded:',
            '已載入常用藥方組合：': 'Common herbal combo loaded:',
            '已載入診斷模板': 'Diagnosis template loaded',
            '已載入醫囑模板': 'Prescription template loaded',
            '已退出病歷編輯模式': 'Exited medical record editing mode',
            '您的帳號已被停用，請聯繫管理員': 'Your account has been disabled, please contact the administrator',
            '找不到套票使用項目': 'Package usage item not found',
            '找不到對應的套票，已移除項目': 'Corresponding package not found, item has been removed',
            '找不到對應的診症記錄！': 'Corresponding consultation record not found!',
            '找不到指定的診症記錄！': 'Specified consultation record not found!',
            '找不到掛號記錄！': 'Registration record not found!',
            '找不到當前診症記錄！': 'Current consultation record not found!',
            '找不到病人資料': 'Patient data not found',
            '找不到病人資料！': 'Patient data not found!',
            '找不到診症記錄！': 'Consultation record not found!',
            '找不到診症記錄，將使用空白表單': 'Consultation record not found, a blank form will be used',
            '找不到選定的醫囑模板': 'Selected prescription template not found',
            '折扣項目不允許修改數量': 'Quantity modification is not allowed for discount items',
            '折扣項目已存在，無法重複使用': 'Discount item already exists and cannot be used again',
            '掛號失敗，請稍後再試': 'Registration failed, please try again later',
            '掛號時間不能早於現在時間！': 'The registration time cannot be earlier than the current time!',
            '收費項目已新增！': 'Billing item added!',
            '收費項目已更新！': 'Billing item updated!',
            '數據管理器尚未準備就緒': 'Data manager is not ready yet',
            '新增失敗，請稍後再試': 'Failed to add, please try again later',
            '新增用戶失敗，請稍後再試': 'Failed to add user, please try again later',
            '方劑已新增！': 'Formula added!',
            '方劑資料已更新！': 'Formula data updated!',
            '更新失敗，請稍後再試': 'Update failed, please try again later',
            '更新用戶狀態時發生錯誤': 'An error occurred while updating user status',
            '更新用戶資料失敗，請稍後再試': 'Failed to update user data, please try again later',
            '更新診症記錄失敗，請稍後再試': 'Failed to update consultation record, please try again later',
            '未偵測到有效的中藥庫資料': 'No valid herb library data detected',
            '未偵測到有效的模板資料': 'No valid template data detected',
            '模板資料匯入完成！': 'Template data import completed!',
            '權限不足，您沒有存取此功能的權限': 'Insufficient privileges, you do not have access to this feature',
            '權限不足，無法保存收費項目': 'Insufficient privileges to save billing items',
            '權限不足，無法刪除收費項目': 'Insufficient privileges to delete billing items',
            '權限不足，無法執行此操作': 'Insufficient privileges to perform this operation',
            '權限不足，無法存取收費項目管理': 'Insufficient privileges to access billing items management',
            '權限不足，無法存取穴位庫管理': 'Insufficient privileges to access acupoint library management',
            '權限不足，無法新增收費項目': 'Insufficient privileges to add billing items',
            '權限不足，無法編輯收費項目': 'Insufficient privileges to edit billing items',
            '此帳號尚未被授權，請聯繫系統管理員': 'This account has not been authorized, please contact the system administrator',
            '此電子郵件已存在，請使用其他電子郵件！': 'This email already exists, please use another one!',
            '每個診症僅能使用一項折扣優惠': 'Only one discount can be used per consultation',
            '無法讀取病人資料': 'Unable to read patient data',
            '無法讀取病人資料！': 'Unable to read patient data!',
            '無法讀取診症記錄': 'Unable to read consultation record',
            '無法讀取診症記錄！': 'Unable to read consultation record!',
            '無法連接到伺服器，請稍後再試': 'Unable to connect to the server, please try again later',
            '無法顯示醫囑模板': 'Unable to display prescription templates',
            '用戶已成功新增！': 'User added successfully!',
            '用戶資料已成功更新！': 'User data updated successfully!',
            '病人資料已刪除！': 'Patient data has been deleted!',
            '病人資料已成功新增！': 'Patient data added successfully!',
            '病人資料已成功更新！': 'Patient data updated successfully!',
            '病假證明書已準備列印！': 'Medical certificate is ready for printing!',
            '登入成功！': 'Login successful!',
            '登出時發生錯誤': 'An error occurred during logout',
            '移除掛號時發生錯誤': 'An error occurred while removing the registration',
            '系統錯誤：找不到診症記錄！': 'System error: Consultation record not found!',
            '系統錯誤：未選擇病人！': 'System error: No patient selected!',
            '繼續診症時發生錯誤': 'An error occurred while continuing consultation',
            '藥單醫囑已準備列印！': 'Prescription instructions are ready for printing!',
            '處理中...': 'Processing...',
            '處理確認到達時發生錯誤': 'An error occurred while processing arrival confirmation',
            '診所資料已成功更新！': 'Clinic data updated successfully!',
            '診症完成後無法刪除套票': 'Packages cannot be deleted after the consultation is completed',
            '診症完成後無法新增套票': 'Packages cannot be added after the consultation is completed',
            '診症完成後無法調整套票數量': 'Package quantities cannot be adjusted after the consultation is completed',
            '診症記錄已保存！': 'Consultation record saved!',
            '診症記錄已更新！': 'Consultation record updated!',
            '請先開始診症！': 'Please start the consultation first!',
            '請填寫必填欄位：主訴、中醫診斷！': 'Please fill in the required fields: chief complaint, TCM diagnosis!',
            '請填寫必要資料（姓名、性別、電話、出生日期、身分證字號）！': 'Please fill in the required information (name, gender, phone, date of birth, ID number)!',
            '請填寫必要資料（姓名、職位）！': 'Please fill in the required information (name, position)!',
            '請確認出生日期是否正確！': 'Please confirm whether the date of birth is correct!',
            '請至少添加一個穴位！': 'Please add at least one acupoint!',
            '請至少添加一個藥材！': 'Please add at least one herb!',
            '請輸入中藥材名稱！': 'Please enter the herb name!',
            '請輸入套票可用次數！': 'Please enter the available uses of the package!',
            '請輸入收費項目名稱！': 'Please enter the billing item name!',
            '請輸入方劑名稱！': 'Please enter the formula name!',
            '請輸入方劑組成！': 'Please enter the formula composition!',
            '請輸入有效天數！': 'Please enter the valid number of days!',
            '請輸入有效的收費金額！': 'Please enter a valid amount for the billing item!',
            '請輸入有效的藥量（0.5-100克）': 'Please enter a valid medicine dosage (0.5-100 grams)',
            '請輸入有效的電子郵件格式！': 'Please enter a valid email format!',
            '請輸入有效的電話號碼！': 'Please enter a valid phone number!',
            '請輸入模板名稱！': 'Please enter the template name!',
            '請輸入組合名稱！': 'Please enter the combo name!',
            '請輸入診所中文名稱！': 'Please enter the clinic name in Chinese!',
            '請輸入電子郵件和密碼！': 'Please enter your email and password!',
            '請選擇掛號時間！': 'Please choose a registration time!',
            '請選擇掛號醫師！': 'Please choose a consulting doctor!',
            '請選擇日期範圍！': 'Please select a date range!',
            '請選擇項目類別！': 'Please select the item category!',
            '讀取病人資料失敗': 'Failed to read patient data',
            '讀取診症記錄失敗': 'Failed to read consultation record',
            '財務報表已匯出！': 'Financial report exported!',
            '財務報表已更新！': 'Financial report updated!',
            '載入用戶數據時發生錯誤，使用本地數據': 'An error occurred while loading user data, using local data',
            '載入診症表單時發生錯誤': 'An error occurred while loading the consultation form',
            '載入診症記錄失敗，將使用空白表單': 'Failed to load consultation record, a blank form will be used',
            '載入醫囑模板失敗': 'Failed to load prescription templates',
            '退回套票時發生錯誤': 'An error occurred when returning package',
            '選擇的醫師無效，請重新選擇！': 'The selected doctor is invalid, please choose again!',
            '醫師職位必須填寫中醫註冊編號！': "The doctor's position must include a TCM registration number!",
            '開始診症時發生錯誤': 'An error occurred while starting the consultation',
            '除折扣項目外，收費金額不能為負數！': 'Except for discount items, the charge amount cannot be negative!',
            '電子郵件格式不正確！': 'The email format is incorrect!',
            '電話格式不正確，請輸入 7-15 位數字！': 'Invalid phone number format, please enter 7-15 digits!',
            '載入失敗，請檢查網路連接': 'Load failed, please check your network connection',
            '沒有找到符合條件的病人': 'No patients found that match the criteria',
            '尚無病人資料': 'No patient data yet',
            '匯入進度': 'Import progress',
            '匯入完成！': 'Import complete!',
            '匯入失敗！': 'Import failed!'
        };
        // Merge dynamic translations into the existing dictionaries.
        Object.keys(dynamicTranslations).forEach(function(key) {
            // Ensure the zh dictionary keeps the original Chinese text.
            if (!window.translations.zh[key]) {
                window.translations.zh[key] = key;
            }
            // Always set the English translation to the provided value.
            window.translations.en[key] = dynamicTranslations[key];
        });
    })();

// Declare isTranslating early so it is available wherever referenced.
// Using var ensures the declaration is hoisted and accessible before use.
// Track whether a translation is currently being applied to avoid recursive invocation
var isTranslating = false;

// Keep a record of the last language each node was translated into.
// We use a data attribute on each element (data-last-lang) rather than a WeakMap
// to persist the last translated language across DOM updates.  This helps
// prevent repeatedly re‑translating the same node when it hasn't changed
// languages, which can improve performance on pages with large DOMs.


/**
 * Save the original text and placeholder values for each element.  This
 * allows switching languages back and forth by always referencing the
 * original Chinese string as the lookup key.  Only leaf elements (with
 * no child elements) are considered for text replacement to avoid
 * overriding nested HTML structures.
 */
function storeOriginalText() {
    const all = document.querySelectorAll('*');
    all.forEach(el => {
        // Only store text for leaf nodes to prevent replacing content of complex elements
        if (el.children.length === 0) {
            const text = (el.textContent || '').trim();
            if (text) {
                if (!el.dataset.originalText) {
                    el.dataset.originalText = text;
                }
            }
            if (el.getAttribute('placeholder')) {
                const ph = el.getAttribute('placeholder').trim();
                if (ph && !el.dataset.originalPlaceholder) {
                    el.dataset.originalPlaceholder = ph;
                }
            }
        }
    });
}

/**
 * Recursively translate a DOM node and its descendants.  This function
 * ensures that the original text and placeholder values are stored on
 * first encounter, and then looks up a translated value from the
 * provided dictionary.  It operates on leaf nodes only (elements
 * without child elements) to avoid altering internal structures.
 * @param {Node} node The DOM node to translate.
 * @param {Object} dict The translation dictionary for the current language.
 */
function translateNode(node, dict, lang) {
    // Guard against null/undefined nodes
    if (!node) return;
    /**
     * When encountering a text node, translate its contents directly.  We
     * preserve the original trimmed Chinese text and leading/trailing
     * whitespace so that repeated translations or language switches do
     * not destroy the formatting.  The translated value is looked up
     * from the provided dictionary; if none is found the original
     * Chinese text is retained.  A custom __lastLang property is used
     * to prevent re‑translating the same node multiple times when the
     * language has not changed.
     */
    if (node.nodeType === Node.TEXT_NODE) {
        const fullText = node.nodeValue || '';
        // Extract the trimmed content (Chinese or previously translated) by
        // removing leading and trailing whitespace.  If the trimmed text
        // is empty there is nothing to translate.
        const trimmed = fullText.trim();
        if (!trimmed) return;
        // Store original trimmed text and whitespace on first encounter
        if (node.__originalText === undefined) {
            node.__originalText = trimmed;
            // Capture leading/trailing whitespace from the original node value
            const leadingMatch = fullText.match(/^\s*/);
            const trailingMatch = fullText.match(/\s*$/);
            node.__leadingWhitespace = leadingMatch ? leadingMatch[0] : '';
            node.__trailingWhitespace = trailingMatch ? trailingMatch[0] : '';
        }
        // Only update the text if we haven't already translated to this
        // language.  This avoids unnecessary DOM mutations when
        // MutationObserver triggers and ensures that switching languages
        // restores the correct value.
        if (node.__lastLang !== lang) {
            const original = node.__originalText;
            let replacement = original;
            if (dict && Object.prototype.hasOwnProperty.call(dict, original)) {
                // Direct match found in dictionary
                replacement = dict[original];
            } else {
                // Handle dynamic patterns such as counts in parentheses and
                // suffixed medical/consultation record labels.  These
                // patterns preserve the dynamic portion (e.g. patient name or
                // numeric count) while translating the static Chinese part.
                // 1. Patterns like "X (123)": translate X and keep
                //    "(123)" suffix.
                const parenMatch = original.match(/^(.*?)(\s*\(\d+\))$/);
                if (parenMatch) {
                    const base = parenMatch[1].trim();
                    const suffix = parenMatch[2];
                    if (dict && Object.prototype.hasOwnProperty.call(dict, base)) {
                        replacement = dict[base] + suffix;
                    }
                } else {
                    // 2. Pattern for numeric available counts like "11 個可用".
                    //    Extract the numeric prefix and translate the "個可用" suffix.
                    const availableMatch = original.match(/^(\d+)\s*個可用$/);
                    // 3. Pattern for ages such as "30歲", "6個月" or "5天".
                    //    Extract the numeric prefix and translate the suffix if present in the dictionary.
                    const ageMatch = original.match(/^(\d+)\s*(歲|個月|天)$/);
                    if (availableMatch && dict && Object.prototype.hasOwnProperty.call(dict, '個可用')) {
                        replacement = availableMatch[1] + ' ' + dict['個可用'];
                    } else if (ageMatch && dict && Object.prototype.hasOwnProperty.call(dict, ageMatch[2])) {
                        replacement = ageMatch[1] + ' ' + dict[ageMatch[2]];
                    } else {
                        // 4. Patterns like "Name的診症記錄" or "Name的病歷記錄".
                        //    Extract the name and translate the suffix.
                        const diagMatch = original.match(/^(.+?)(的診症記錄)$/);
                        const medMatch = original.match(/^(.+?)(的病歷記錄)$/);
                        if (diagMatch && dict && Object.prototype.hasOwnProperty.call(dict, diagMatch[2])) {
                            replacement = diagMatch[1] + dict[diagMatch[2]];
                        } else if (medMatch && dict && Object.prototype.hasOwnProperty.call(dict, medMatch[2])) {
                            replacement = medMatch[1] + dict[medMatch[2]];
                        } else {
                            // 5. Generic pattern for base strings ending with a full‑width colon (：) and dynamic suffix.
                            //    For example: "當前用戶：王五".  If the base (including colon) exists in the dictionary,
                            //    translate it and preserve the trailing dynamic part.
                            const colonMatch = original.match(/^(.+?：)(.*)$/);
                            if (colonMatch && dict && Object.prototype.hasOwnProperty.call(dict, colonMatch[1])) {
                                replacement = dict[colonMatch[1]] + colonMatch[2];
                            }
                        }
                    }
                }
            }
            // Combine preserved whitespace with the translated or original text
            node.nodeValue = (node.__leadingWhitespace || '') + replacement + (node.__trailingWhitespace || '');
            node.__lastLang = lang;
        }
        return;
    }
    // If the node is not an element, there is nothing further to do
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    // If the element has no child elements it is considered a leaf node for
    // the purposes of translating its own textContent and placeholder.  We
    // use dataset to persist the original text and placeholder values.
    if (node.children.length === 0) {
        if (node.dataset.lastLang !== lang) {
            const currentText = (node.textContent || '').trim();
            if (currentText) {
                if (!node.dataset.originalText) {
                    node.dataset.originalText = currentText;
                }
                const original = node.dataset.originalText;
                let replacement = original;
                if (dict && Object.prototype.hasOwnProperty.call(dict, original)) {
                    // Direct match
                    replacement = dict[original];
                } else {
                    // Dynamic patterns similar to those used for text nodes
                    const parenMatch = original && original.match(/^(.*?)(\s*\(\d+\))$/);
                    if (parenMatch) {
                        const base = parenMatch[1].trim();
                        const suffix = parenMatch[2];
                        if (dict && Object.prototype.hasOwnProperty.call(dict, base)) {
                            replacement = dict[base] + suffix;
                        }
                    } else {
                        // Age pattern: e.g. "30歲", "6個月", "5天"
                        const ageMatch = original && original.match(/^(\d+)\s*(歲|個月|天)$/);
                        if (ageMatch && dict && Object.prototype.hasOwnProperty.call(dict, ageMatch[2])) {
                            replacement = ageMatch[1] + ' ' + dict[ageMatch[2]];
                        } else {
                            const diagMatch = original && original.match(/^(.+?)(的診症記錄)$/);
                            const medMatch = original && original.match(/^(.+?)(的病歷記錄)$/);
                            if (diagMatch && dict && Object.prototype.hasOwnProperty.call(dict, diagMatch[2])) {
                                replacement = diagMatch[1] + dict[diagMatch[2]];
                            } else if (medMatch && dict && Object.prototype.hasOwnProperty.call(dict, medMatch[2])) {
                                replacement = medMatch[1] + dict[medMatch[2]];
                            } else {
                                // Generic colon pattern: base with colon and dynamic suffix
                                const colonMatch = original && original.match(/^(.+?：)(.*)$/);
                                if (colonMatch && dict && Object.prototype.hasOwnProperty.call(dict, colonMatch[1])) {
                                    replacement = dict[colonMatch[1]] + colonMatch[2];
                                }
                            }
                        }
                    }
                }
                node.textContent = replacement;
            }
            // Translate the placeholder attribute on leaf elements
            if (node.hasAttribute('placeholder')) {
                const phVal = node.getAttribute('placeholder').trim();
                if (!node.dataset.originalPlaceholder && phVal) {
                    node.dataset.originalPlaceholder = phVal;
                }
                const originalPh = node.dataset.originalPlaceholder;
                if (originalPh && dict && Object.prototype.hasOwnProperty.call(dict, originalPh)) {
                    node.setAttribute('placeholder', dict[originalPh]);
                }
            }
            // Translate the data-placeholder attribute used for contenteditable placeholders
            if (node.hasAttribute('data-placeholder')) {
                const dpVal = node.getAttribute('data-placeholder').trim();
                if (!node.dataset.originalDataPlaceholder && dpVal) {
                    node.dataset.originalDataPlaceholder = dpVal;
                }
                const originalDP = node.dataset.originalDataPlaceholder;
                if (originalDP && dict && Object.prototype.hasOwnProperty.call(dict, originalDP)) {
                    node.setAttribute('data-placeholder', dict[originalDP]);
                }
            }
            node.dataset.lastLang = lang;
        }
    }
    // Recursively translate all child nodes.  We iterate over childNodes
    // instead of children so that text nodes are also processed.
    Array.from(node.childNodes).forEach(child => translateNode(child, dict, lang));
}

/**
 * Apply translations based on the currently selected language.  The
 * language code is stored in localStorage under the key 'lang'.  If not
 * present the default language is Chinese ('zh').  For each element
 * containing a data‑original‑text attribute the translation is looked up
 * in the dictionary; if found the textContent is replaced, otherwise the
 * text remains unchanged.  Placeholders are handled similarly.
 */
function applyTranslations() {
    // Guard against recursive invocation when triggered by mutation observer
    if (isTranslating) return;
    isTranslating = true;
    try {
        const lang = localStorage.getItem('lang') || 'zh';
        const dict = window.translations[lang] || {};
        // Translate the entire document body
        translateNode(document.body, dict, lang);
    } finally {
        // Reset flag after translation
        isTranslating = false;
    }
}

/**
 * Change the current language and persist it to localStorage.  This
 * function triggers translation immediately after updating the stored
 * language code.
 * @param {string} lang - the language code ('zh' or 'en')
 */
function setLanguage(lang) {
    localStorage.setItem('lang', lang);
    applyTranslations();
}

// Observe DOM mutations to automatically translate dynamically added
// elements (such as modals or lists that are created after initial
// page load).  Whenever new nodes are added the translations are
// applied.  This helps ensure that dynamic content will also be
// translated without needing to call applyTranslations manually in
// every script.

const observer = new MutationObserver(mutations => {
    // Do not react to mutations while a translation is being applied.
    if (isTranslating) return;
    const lang = localStorage.getItem('lang') || 'zh';
    const dict = window.translations[lang] || {};
    mutations.forEach(m => {
        if (m.addedNodes && m.addedNodes.length > 0) {
            m.addedNodes.forEach(node => {
                // Only translate nodes that are elements
                translateNode(node, dict, lang);
            });
        }
    });
});

// Setup event listeners on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    const savedLang = localStorage.getItem('lang') || 'zh';
    const langSelector = document.getElementById('languageSelector');
    if (langSelector) {
        langSelector.value = savedLang;
        langSelector.addEventListener('change', () => {
            setLanguage(langSelector.value);
        });
    }
    applyTranslations();
    // Observe the entire document body for dynamic content. Previously we only observed
    // the #mainSystem container which meant elements outside of it (e.g. login page,
    // toast notifications, or modals) were not automatically translated. By observing
    // document.body we ensure all dynamically added content is translated when the
    // language changes.
    observer.observe(document.body, { childList: true, subtree: true });
});
