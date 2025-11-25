/*
 * 模組：穴位庫地圖整合
 * 本檔案定義了穴位座標資料與地圖初始化函式，將其與主系統分離。
 * 引入本檔案後，會定義 window.initAcupointMap()，以及在需要時自動將
 * 指定穴位的座標填入 acupointLibrary。
 */

(function() {
    'use strict';
    /**
     * 座標資料表：以穴位名稱為鍵，對應相對座標 (x, y)。
     * x 表示圖片寬度的百分比 (0~1)，y 表示圖片高度的百分比 (0~1)。
     * 若未提供某穴位的座標，將不在地圖上繪製該點。
     */
    const ACUPOINT_COORDS = {
        '俞府': { x: 0.1684, y: 0.7910 },
        '彧中': { x: 0.1686, y: 0.7756 },
        '神藏': { x: 0.1692, y: 0.7588 },
        '靈墟': { x: 0.1692, y: 0.7429 },
        '神封': { x: 0.1694, y: 0.7268 },
        '步廊': { x: 0.1694, y: 0.7109 },
        '幽門': { x: 0.1571, y: 0.6843 },
        '幽門': { x: 0.1571, y: 0.6843 },
        '幽門': { x: 0.1571, y: 0.6843 },
        '幽門': { x: 0.1571, y: 0.6843 },
        '幽門': { x: 0.1571, y: 0.6843 },
        '幽門': { x: 0.1571, y: 0.6843 },
        '幽門': { x: 0.1571, y: 0.6843 },
        '幽門': { x: 0.1571, y: 0.6843 },
        '幽門': { x: 0.1571, y: 0.6843 },
        '幽門': { x: 0.1571, y: 0.6843 },
        '幽門': { x: 0.1571, y: 0.6843 },
        '腹通谷': { x: 0.1571, y: 0.6704 },
        '陰都': { x: 0.1571, y: 0.6563 },
        '石關': { x: 0.1570, y: 0.6431 },
        '商曲': { x: 0.1570, y: 0.6296 },
        '肓俞': { x: 0.1571, y: 0.6008 },
        '四滿': { x: 0.1563, y: 0.5713 },
        '中注': { x: 0.1565, y: 0.5862 },
        '氣穴': { x: 0.1563, y: 0.5559 },
        '大赫': { x: 0.1561, y: 0.5408 },
        '橫骨': { x: 0.1560, y: 0.5247 },
        '中極': { x: 0.1516, y: 0.5413 },
        '曲骨': { x: 0.1519, y: 0.5256 },
        '紫宮': { x: 0.1529, y: 0.7593 },
        '玉堂': { x: 0.1531, y: 0.7423 },
        '膻中': { x: 0.1531, y: 0.7268 },
        '中庭': { x: 0.1531, y: 0.7112 },
        '鳩尾': { x: 0.1533, y: 0.6983 },
        '巨闕': { x: 0.1533, y: 0.6846 },
        '上脘': { x: 0.1531, y: 0.6707 },
        '中脘': { x: 0.1529, y: 0.6567 },
        '建里': { x: 0.1529, y: 0.6436 },
        '下脘': { x: 0.1528, y: 0.6299 },
        '水分': { x: 0.1526, y: 0.6157 },
        '神闕': { x: 0.1526, y: 0.6011 },
        '陰交': { x: 0.1526, y: 0.5864 },
        '氣海': { x: 0.1524, y: 0.5789 },
        '石門': { x: 0.1521, y: 0.5706 },
        '關元': { x: 0.1519, y: 0.5566 },
        '璇璣': { x: 0.1528, y: 0.7915 },
        '兌端': { x: 0.1524, y: 0.8663 },
        '華蓋': { x: 0.1529, y: 0.7756 },
        '承漿': { x: 0.1529, y: 0.8513 },
        '廉泉': { x: 0.1526, y: 0.8318 },
        '人迎': { x: 0.1624, y: 0.8264 },
        '扶突': { x: 0.1692, y: 0.8264 },
        '水突': { x: 0.1630, y: 0.8149 },
        '天鼎': { x: 0.1761, y: 0.8167 },
        '氣舍': { x: 0.1634, y: 0.8044 },
        '天突': { x: 0.1528, y: 0.8015 },
        '中府': { x: 0.1968, y: 0.7839 },
        '雲門': { x: 0.1965, y: 0.8006 },
        '上星': { x: 0.1518, y: 0.9534 },
        '神庭': { x: 0.1518, y: 0.9473 },
        '五處': { x: 0.1612, y: 0.9524 },
        '眉冲': { x: 0.1575, y: 0.9475 },
        '曲差': { x: 0.1610, y: 0.9473 },
        '頭臨泣': { x: 0.1645, y: 0.9467 },
        '頭維': { x: 0.1738, y: 0.9421 },
        '頷厭': { x: 0.1778, y: 0.9326 },
        '陽白': { x: 0.1647, y: 0.9213 },
        '攢竹': { x: 0.1576, y: 0.9089 },
        '印堂': { x: 0.1518, y: 0.9101 },
        '本神': { x: 0.1697, y: 0.9456 },
    '睛明': { x: 0.1573, y: 0.8992 },
    '絲竹空': { x: 0.1731, y: 0.9102 },
    '瞳子髎': { x: 0.1729, y: 0.8987 },
    '承泣': { x: 0.1649, y: 0.8923 },
    '上關': { x: 0.1755, y: 0.8896 },
    '下關': { x: 0.1760, y: 0.8801 },
    '四白': { x: 0.1650, y: 0.8867 },
    '巨髎': { x: 0.1652, y: 0.8760 },
    '顴髎': { x: 0.1709, y: 0.8784 },
    '迎香': { x: 0.1595, y: 0.8774 },
    '口禾髎': { x: 0.1563, y: 0.8718 },
    '素髎': { x: 0.1523, y: 0.8806 },
    '水溝': { x: 0.1523, y: 0.8713 },
    '地倉': { x: 0.1649, y: 0.8618 },
    '頰車': { x: 0.1718, y: 0.8589 },
    '大迎': { x: 0.1687, y: 0.8491 }
        // 在此加入更多穴位名稱及其對應座標
    };

    /*
     * 以下為簡繁字形轉換表，用於在讀取穴位座標時支援同一穴位名稱的不同寫法。
     * 部分穴位名稱在資料庫中可能採用簡體字，例如「云门」而非「雲門」。
     * 為避免因字形差異導致座標無法套用，這裡定義了簡繁對應關係，
     * 並在初始化時自動為 ACUPOINT_COORDS 增加對應的同義鍵。
     */
    const CHAR_TO_SIMPLIFIED = {
        '雲': '云',
        '門': '门',
        '處': '处',
        '頭': '头',
        '臨': '临',
        '維': '维',
        '頜': '颌',
        '厭': '厌',
        '陽': '阳',
        '攢': '攒',
        // 「衝」與「沖」皆可對應為「冲」，故統一轉為簡體「冲」。
        '衝': '冲',
        '沖': '冲'
    };
    const CHAR_TO_TRADITIONAL = {
        '云': ['雲'],
        '门': ['門'],
        '处': ['處'],
        '头': ['頭'],
        '临': ['臨'],
        '维': ['維'],
        '颌': ['頜'],
        '厌': ['厭'],
        '阳': ['陽'],
        '攒': ['攢'],
        // 「冲」可對應到「沖」與「衝」兩個繁體字，故提供兩種可能。
        '冲': ['沖', '衝']
    };

    /**
     * 將傳入字串中的繁體字轉為對應的簡體字。
     * 未出現在對照表中的字符將保持不變。
     * @param {string} str - 原始穴位名稱
     * @returns {string} 轉換為簡體字的名稱
     */
    function toSimplifiedName(str) {
        return Array.from(str).map(ch => CHAR_TO_SIMPLIFIED[ch] || ch).join('');
    }

    /**
     * 將傳入字串中的簡體字轉換成所有可能的繁體字組合。
     * 若某字符在對照表中有多個繁體對應，將列舉出所有組合可能。
     * 例如「眉冲」可對應到「眉沖」與「眉衝」。
     * @param {string} str - 原始穴位名稱
     * @returns {string[]} 轉換為繁體字的所有可能名稱陣列
     */
    function toTraditionalNames(str) {
        let results = [''];
        for (const ch of str) {
            const trads = CHAR_TO_TRADITIONAL[ch];
            if (trads && trads.length) {
                const newRes = [];
                for (const prefix of results) {
                    for (const t of trads) {
                        newRes.push(prefix + t);
                    }
                }
                results = newRes;
            } else {
                results = results.map(prefix => prefix + ch);
            }
        }
        return results;
    }

    // 根據簡繁轉換表為 ACUPOINT_COORDS 增加同義鍵。
    // 這樣可以同時支援簡體與繁體名稱，也能支援「冲」對應到「沖」「衝」的情形。
    (function generateSynonyms() {
        // 取得目前所有鍵的列表，以避免在迭代過程中處理新增的鍵
        const originalEntries = Object.entries(ACUPOINT_COORDS);
        for (const [name, coords] of originalEntries) {
            // 將原始名稱轉為簡體
            const simplified = toSimplifiedName(name);
            if (simplified && !(simplified in ACUPOINT_COORDS)) {
                ACUPOINT_COORDS[simplified] = coords;
            }
            // 將原始名稱轉為所有可能的繁體名稱
            const traditionals = toTraditionalNames(name);
            for (const trad of traditionals) {
                if (trad && !(trad in ACUPOINT_COORDS)) {
                    ACUPOINT_COORDS[trad] = coords;
                }
            }
        }
    })();

    /**
     * 將座標資料套用至全域 acupointLibrary。
     * 只有當 acupointLibrary 為陣列且項目沒有 x/y 屬性時才會套用。
     */
    function applyAcupointCoordinates() {
        // 從全域環境取得 acupointLibrary：使用全域變數或 window 屬性
        let library;
        try {
            // 優先使用全球變數 acupointLibrary（LET 宣告），若不存在再取 window.acupointLibrary
            library = typeof acupointLibrary !== 'undefined' ? acupointLibrary : window.acupointLibrary;
        } catch (_err) {
            library = window.acupointLibrary;
        }
        if (Array.isArray(library)) {
            // 將座標資料同步回 window，以便其他腳本可存取
            try {
                if (typeof window !== 'undefined') {
                    window.acupointLibrary = library;
                }
            } catch (_e) {}
            library.forEach(ac => {
                if (ac) {
                    // 取得穴位名稱，並移除括號及其後內容（例如 國際代碼）
                    const rawName = ac.name || '';
                    // 清理名稱：移除括號及其內容，例如「眉冲 (GB13)」->「眉冲」
                    const cleanedName = String(rawName).replace(/\s*\(.*\)$/, '');
                    // 先直接查找座標；若找不到，再將名稱轉為簡體後查找。
                    let coords = ACUPOINT_COORDS[cleanedName];
                    if (!coords) {
                        try {
                            const simplifiedKey = toSimplifiedName(cleanedName);
                            coords = ACUPOINT_COORDS[simplifiedKey];
                        } catch (_normErr) {
                            coords = undefined;
                        }
                    }
                    if (typeof ac.x === 'string' && !Number.isNaN(parseFloat(ac.x))) {
                        ac.x = parseFloat(ac.x);
                    }
                    if (typeof ac.y === 'string' && !Number.isNaN(parseFloat(ac.y))) {
                        ac.y = parseFloat(ac.y);
                    }
                    if (coords) {
                        // 如果尚未定義 x 或 y，則套用座標；避免覆蓋已有資料
                        if (typeof ac.x !== 'number') {
                            ac.x = coords.x;
                        }
                        if (typeof ac.y !== 'number') {
                            ac.y = coords.y;
                        }
                    }
                }
            });
        }
        // 將座標套用函式掛載到 window，使其他模組可直接調用。
        try {
            if (typeof window !== 'undefined') {
                window.applyAcupointCoordinates = applyAcupointCoordinates;
            }
        } catch (_e) {
            // 若無法掛載，不影響功能
        }
    }

    /**
     * 初始化穴位地圖。
     * 需在 DOM 存在 id="acupointMap" 的容器及已載入 Leaflet 後調用。
     * 地圖使用 Simple CRS，並根據 acupointLibrary 中的 x/y 座標放置標記。
     */
    window.initAcupointMap = function() {
        try {
            const mapContainer = document.getElementById('acupointMap');
            if (!mapContainer || mapContainer.dataset.initialized) {
                return;
            }
            mapContainer.dataset.initialized = 'true';
            // 準備圖片，載入完成後才建立地圖
            const img = new Image();
            img.src = 'images/combined_three.png';
            img.onload = function() {
                // 套用座標資料
                applyAcupointCoordinates();
                const w = img.width;
                const h = img.height;
                const map = L.map(mapContainer, {
                    crs: L.CRS.Simple,
                    // 不設定 minZoom，初始化後根據圖片尺寸計算
                    maxZoom: 4,
                    zoomControl: false,
                    attributionControl: false
                });
                const bounds = [[0,0],[h,w]];
                L.imageOverlay(img.src, bounds).addTo(map);
                try { map.invalidateSize(); } catch (_e) {}
                const baseZoom = map.getBoundsZoom(bounds);
                const initialZoom = baseZoom - 1;
                if (typeof map.setMinZoom === 'function') {
                    map.setMinZoom(initialZoom);
                } else {
                    map.options.minZoom = initialZoom;
                }
                if (typeof map.setMaxBounds === 'function') {
                    map.setMaxBounds(bounds);
                }
                map.options.maxBoundsViscosity = 1.0;
                const centerLat = h / 2;
                const centerLon = w / 2;
                map.setView([centerLat, centerLon], initialZoom);
                try {
                    setTimeout(function(){ try { map.invalidateSize(); } catch(_e) {} }, 50);
                    window.addEventListener('resize', function(){ try { map.invalidateSize(); } catch(_e) {} });
                    if (typeof ResizeObserver !== 'undefined') {
                        const ro = new ResizeObserver(function(){ try { map.invalidateSize(); } catch(_e) {} });
                        ro.observe(mapContainer);
                    }
                } catch (_e) {}

                // 調整滑鼠指標樣式
                //
                // Leaflet 預設會在可拖動的地圖容器上套用 ``cursor: grab`` 或 ``cursor: grabbing``
                // 的 CSS，這類手掌圖示在穴位圖上顯得較大且可能遮擋穴位位置。
                // 為了改善使用體驗，這裡主動指定地圖容器的 cursor，並在拖曳開始/結束
                // 時保持一致。您可以依需求將 'crosshair' 改為其他指標名稱，例如
                // 'default'、'move' 或 'pointer'，以取得最合適的效果。
                try {
                    const mapEl = map.getContainer();
                    if (mapEl && mapEl.style) {
                        // 使用十字線指標，較小且不會遮擋穴位
                        mapEl.style.cursor = 'crosshair';
                        // 在拖拉開始與結束時維持相同的指標樣式
                        map.on('dragstart', function() {
                            mapEl.style.cursor = 'crosshair';
                        });
                        map.on('dragend', function() {
                            mapEl.style.cursor = 'crosshair';
                        });
                    }
                } catch (_cursorErr) {
                    // 若因未知原因無法設定指標，不影響主要功能
                }
                // 從全域環境取得 acupointLibrary：使用全域變數或 window 屬性
                let library;
                try {
                    library = typeof acupointLibrary !== 'undefined' ? acupointLibrary : window.acupointLibrary;
                } catch (_err) {
                    library = window.acupointLibrary;
                }
                if (Array.isArray(library)) {
                    library.forEach(ac => {
                        if (ac && typeof ac.x === 'number' && typeof ac.y === 'number') {
                            const lat = h * ac.y;
                            const lon = w * ac.x;
                            // 使用 circleMarker 以小圓點表示穴位，避免標記遮住穴位本身
                            const marker = L.circleMarker([lat, lon], {
                                radius: 4,
                                color: '#2563eb',      // 外框顏色（藍色）
                                weight: 0,
                                fillColor: '#2563eb',   // 填充顏色
                                fillOpacity: 0.85
                            }).addTo(map);
                            let content = '';
                            try {
                                if (typeof getAcupointTooltipContent === 'function') {
                                    content = getAcupointTooltipContent(ac.name || '');
                                }
                            } catch (_err) {
                                content = ac.name || '';
                            }
                            if (content) {
                                const html = content.replace(/\n/g, '<br>');
                                // 如果全域定義了 showTooltip 則使用自訂提示框，否則使用 Leaflet 彈窗/提示
                                const hasCustomTooltip = (typeof showTooltip === 'function') && (typeof hideTooltip === 'function') && (typeof moveTooltip === 'function');
                                if (hasCustomTooltip) {
                                    // 綁定滑鼠事件以顯示自訂提示
                                    marker.on('mouseover', function(e) {
                                        // 由於 showTooltip 期望經過 encodeURIComponent 的內容
                                        try {
                                            showTooltip(e.originalEvent, encodeURIComponent(content));
                                        } catch (_ignore) {}
                                    });
                                    marker.on('mousemove', function(e) {
                                        try {
                                            moveTooltip(e.originalEvent);
                                        } catch (_ignore) {}
                                    });
                                    marker.on('mouseout', function() {
                                        try {
                                            hideTooltip();
                                        } catch (_ignore) {}
                                    });
                                } else {
                                    // 若沒有自訂提示框，則使用 Leaflet 的彈窗與工具提示
                                    if (typeof marker.bindPopup === 'function') {
                                        marker.bindPopup(html);
                                    }
                                    if (typeof marker.bindTooltip === 'function') {
                                        marker.bindTooltip(html, { direction: 'top', offset: [0, -10], opacity: 0.9 });
                                    }
                                }
                            }
                        }
                    });
                }

                // 在地圖上顯示滑鼠座標，方便判斷穴位位置。
                // 先嘗試在地圖容器內創建一個絕對定位的元素，避免控制元件改變地圖高度。
                // 使用絕對定位可確保不會推擠原本的布局，解決顯示座標時畫面下移的問題。
                try {
                    const mapEl = map.getContainer();
                    if (mapEl) {
                        // 確保地圖容器是相對定位，這樣絕對定位的座標顯示才能依附於地圖，不會導致版面移動
                        try {
                            const computedStyle = window.getComputedStyle(mapEl);
                            const pos = computedStyle ? computedStyle.position : mapEl.style.position;
                            if (!pos || pos === 'static') {
                                // 若沒有設定位罝則改為 relative
                                mapEl.style.position = 'relative';
                            }
                        } catch (_posErr) {
                            // 若無法讀取樣式仍嘗試將定位設為 relative
                            if (!mapEl.style.position) {
                                mapEl.style.position = 'relative';
                            }
                        }
                        // 若尚未存在 coordinateDisplay，則建立一個新的
                        let coordDiv = mapEl.querySelector('#coordinateDisplay');
                        if (!coordDiv) {
                            coordDiv = document.createElement('div');
                            coordDiv.id = 'coordinateDisplay';
                            coordDiv.className = 'leaflet-coordinate-display';
                            // 以絕對定位固定在左下角
                            coordDiv.style.position = 'absolute';
                            coordDiv.style.left = '8px';
                            coordDiv.style.bottom = '8px';
                            coordDiv.style.padding = '2px 4px';
                            coordDiv.style.fontSize = '12px';
                            coordDiv.style.background = 'rgba(255, 255, 255, 0.7)';
                            coordDiv.style.borderRadius = '4px';
                            coordDiv.style.color = '#000';
                            coordDiv.style.pointerEvents = 'none';
                            coordDiv.style.whiteSpace = 'nowrap';
                            // 提高 z-index 以避免被其他元素遮蔽
                            coordDiv.style.zIndex = '1000';
                            mapEl.appendChild(coordDiv);
                        }
                        // 監聽滑鼠移動事件，計算相對座標
                        map.on('mousemove', function(ev) {
                            let xCoord = ev.latlng.lng;
                            let yCoord = ev.latlng.lat;
                            // 將座標限制在圖片有效範圍
                            xCoord = Math.min(Math.max(xCoord, 0), w);
                            yCoord = Math.min(Math.max(yCoord, 0), h);
                            const relX = (xCoord / w).toFixed(4);
                            const relY = (yCoord / h).toFixed(4);
                            coordDiv.textContent = 'x: ' + relX + ', y: ' + relY;
                        });
                        // 當滑鼠離開地圖時清空顯示
                        map.on('mouseout', function() {
                            coordDiv.textContent = '';
                        });
                    }
                } catch (coordErr) {
                    console.warn('Failed to add coordinate display:', coordErr);
                }
            };
            img.onerror = function() {
                console.warn('Cannot load image for acupoint map');
            };
        } catch (e) {
            console.warn('Failed to initialize acupoint map:', e);
        }
    };
})();
