/*
 * 模組：穴位庫地圖整合
 * 本檔案定義了穴位座標資料與地圖初始化函式，將其與主系統分離。
 * 支援單一穴位名稱對應多個地圖座標（例如不同視角的圖示）。
 */

(function() {
    'use strict';

    /**
     * 座標資料表：以穴位名稱為鍵，對應座標陣列 [{x, y}, ...]。
     * 修改說明：值現在統一為陣列格式，以支援同名多穴位顯示。
     */
    const ACUPOINT_COORDS = {
        // --- 頭部/督脈 (包含重複定義的合併) ---
        '百會': [
            { x: 0.5733, y: 0.9157 }, 
            { x: 0.5733, y: 0.9161 }, 
            { x: 0.4519, y: 0.9773 }
        ],
        '長強': [
            { x: 0.5712, y: 0.1945 },
            { x: 0.4533, y: 0.4901 }
        ],
        
        // --- 其他穴位 (單一座標也包裹在陣列中) ---
        '會陰': [{ x: 0.5711, y: 0.2271 }],
        '支正': [{ x: 0.5445, y: 0.5344 }],
        '溫溜': [{ x: 0.5706, y: 0.5458 }],
        '三陽絡': [{ x: 0.5592, y: 0.5290 }],
        '會宗': [{ x: 0.5577, y: 0.5143 }],
        '支溝': [{ x: 0.5639, y: 0.5180 }],
        '偏歷': [{ x: 0.5751, y: 0.5237 }],
        '外關': [{ x: 0.5664, y: 0.5078 }],
        '養老': [{ x: 0.5633, y: 0.4888 }],
        '陽谷': [{ x: 0.5639, y: 0.4783 }],
        '陽池': [{ x: 0.5720, y: 0.4840 }],
        '陽谿': [{ x: 0.5856, y: 0.4920 }],
        '腕骨': [{ x: 0.5628, y: 0.4654 }],
        '合谷': [{ x: 0.5960, y: 0.4693 }],
        '後谿': [{ x: 0.5658, y: 0.4442 }],
        '中渚': [{ x: 0.5733, y: 0.4477 }],
        '三間': [{ x: 0.6013, y: 0.4540 }],
        '前谷': [{ x: 0.5681, y: 0.4326 }],
        '液門': [{ x: 0.5756, y: 0.4359 }],
        '二間': [{ x: 0.6044, y: 0.4424 }],
        '少澤': [{ x: 0.5747, y: 0.4092 }],
        '少衝': [{ x: 0.5798, y: 0.4103 }],
        '關衝': [{ x: 0.5883, y: 0.3979 }],
        '商陽': [{ x: 0.6142, y: 0.4086 }],
        '極泉': [{ x: 0.7487, y: 0.5597 }],
        '殷門': [{ x: 0.4800, y: 0.3645 }],
        '浮郄': [{ x: 0.4911, y: 0.2709 }],
        '委中': [{ x: 0.4809, y: 0.2584 }],
        '委陽': [{ x: 0.4914, y: 0.2589 }],
        '合陽': [{ x: 0.4808, y: 0.2313 }],
        '承筋': [{ x: 0.4821, y: 0.1909 }],
        '承山': [{ x: 0.4827, y: 0.1496 }],
        '飛揚': [{ x: 0.4907, y: 0.1365 }],
        '陽交': [{ x: 0.4995, y: 0.1363 }],
        '跗陽': [{ x: 0.4848, y: 0.0799 }],
        '崑崙': [{ x: 0.4814, y: 0.0401 }],
        '僕參': [{ x: 0.4805, y: 0.0183 }],
        '申脈': [{ x: 0.4872, y: 0.0314 }],
        '地五會': [{ x: 0.4961, y: 0.0279 }],
        '金門': [{ x: 0.4952, y: 0.0187 }],
        '俠溪': [{ x: 0.5006, y: 0.0261 }],
        '京骨': [{ x: 0.5000, y: 0.0180 }],
        '足竅陰': [{ x: 0.5054, y: 0.0248 }],
        '束骨': [{ x: 0.5044, y: 0.0178 }],
        '足通谷': [{ x: 0.5081, y: 0.0187 }],
        '至陰': [{ x: 0.5122, y: 0.0200 }],
        '陽綱': [{ x: 0.4791, y: 0.6581 }],
        '意捨': [{ x: 0.4790, y: 0.6444 }],
        '胃倉': [{ x: 0.4790, y: 0.6323 }],
        '肓門': [{ x: 0.4790, y: 0.6212 }],
        '京門': [{ x: 0.4965, y: 0.6155 }],
        '志室': [{ x: 0.4791, y: 0.6068 }],
        '次髎': [{ x: 0.4594, y: 0.5371 }],
        '中髎': [{ x: 0.4591, y: 0.5248 }],
        '下髎': [{ x: 0.4593, y: 0.5152 }],
        '會陽': [{ x: 0.4597, y: 0.4977 }],
        '膀胱俞': [{ x: 0.4665, y: 0.5373 }],
        '中膂俞': [{ x: 0.4665, y: 0.5244 }],
        '白環俞': [{ x: 0.4665, y: 0.5137 }],
        '胞肓': [{ x: 0.4790, y: 0.5375 }],
        '秩邊': [{ x: 0.4787, y: 0.5139 }],
        '環跳': [{ x: 0.5020, y: 0.5034 }],
        '承扶': [{ x: 0.4797, y: 0.4453 }],
        '肩井': [{ x: 0.4914, y: 0.8249 }],
        '巨骨': [{ x: 0.5152, y: 0.8164 }],
        '肩外俞': [{ x: 0.4803, y: 0.8082 }],
        '天髎': [{ x: 0.4959, y: 0.8126 }],
        '曲垣': [{ x: 0.4876, y: 0.7910 }],
        '附分': [{ x: 0.4786, y: 0.7916 }],
        '秉風': [{ x: 0.4984, y: 0.7964 }],
        '魄戶': [{ x: 0.4792, y: 0.7774 }],
        '臑俞': [{ x: 0.5156, y: 0.7921 }],
        '肩髎': [{ x: 0.5305, y: 0.7978 }],
        '膏肓': [{ x: 0.4791, y: 0.7574 }],
        '天宗': [{ x: 0.4987, y: 0.7626 }],
        '神堂': [{ x: 0.4789, y: 0.7416 }],
        '肩貞': [{ x: 0.5165, y: 0.7405 }],
        '譩譆': [{ x: 0.4789, y: 0.7237 }],
        '膈關': [{ x: 0.4788, y: 0.7081 }],
        '臑會': [{ x: 0.5317, y: 0.7287 }],
        '臂臑': [{ x: 0.5459, y: 0.7129 }],
        '魂門': [{ x: 0.4791, y: 0.6740 }],
        '消濼': [{ x: 0.5340, y: 0.6812 }],
        '手五里': [{ x: 0.5501, y: 0.6548 }],
        '清冷淵': [{ x: 0.5350, y: 0.6391 }],
        '肘髎': [{ x: 0.5498, y: 0.6321 }],
        '曲池': [{ x: 0.5575, y: 0.6217 }],
        '天井': [{ x: 0.5357, y: 0.6248 }],
        '小海': [{ x: 0.5275, y: 0.6042 }],
        '手三里': [{ x: 0.5620, y: 0.6026 }],
        '上廉': [{ x: 0.5637, y: 0.5900 }],
        '下廉': [{ x: 0.5660, y: 0.5780 }],
        '四瀆': [{ x: 0.5507, y: 0.5579 }],
        '大椎': [{ x: 0.4524, y: 0.8201 }],
        '陶道': [{ x: 0.4524, y: 0.8065 }],
        '身柱': [{ x: 0.4533, y: 0.7779 }],
        '神道': [{ x: 0.4528, y: 0.7419 }],
        '靈臺': [{ x: 0.4528, y: 0.7244 }],
        '至陽': [{ x: 0.4530, y: 0.7089 }],
        '筋縮': [{ x: 0.4530, y: 0.6728 }],
        '中樞': [{ x: 0.4533, y: 0.6586 }],
        '脊中': [{ x: 0.4530, y: 0.6448 }],
        '懸樞': [{ x: 0.4531, y: 0.6206 }],
        '命門': [{ x: 0.4530, y: 0.6059 }],
        '腰陽關': [{ x: 0.4534, y: 0.5760 }],
        '腰俞': [{ x: 0.4533, y: 0.5087 }],
        '肩中俞': [{ x: 0.4719, y: 0.8196 }],
        '大杼': [{ x: 0.4654, y: 0.8078 }],
        '風門': [{ x: 0.4657, y: 0.7930 }],
        '肺俞': [{ x: 0.4659, y: 0.7775 }],
        '厥陰俞': [{ x: 0.4660, y: 0.7584 }],
        '心俞': [{ x: 0.4660, y: 0.7412 }],
        '督俞': [{ x: 0.4665, y: 0.7248 }],
        '膈俞': [{ x: 0.4662, y: 0.7088 }],
        '肝俞': [{ x: 0.4665, y: 0.6739 }],
        '膽俞': [{ x: 0.4666, y: 0.6586 }],
        '脾俞': [{ x: 0.4665, y: 0.6446 }],
        '胃俞': [{ x: 0.4668, y: 0.6324 }],
        '三焦俞': [{ x: 0.4665, y: 0.6212 }],
        '腎俞': [{ x: 0.4666, y: 0.6061 }],
        '氣海俞': [{ x: 0.4666, y: 0.5904 }],
        '大腸俞': [{ x: 0.4665, y: 0.5757 }],
        '關元俞': [{ x: 0.4662, y: 0.5576 }],
        '上髎': [{ x: 0.4594, y: 0.5477 }],
        '小腸俞': [{ x: 0.4662, y: 0.5473 }],
        '湧泉': [{ x: 0.2568, y: 0.1752 }],
        '齦交': [{ x: 0.2492, y: 0.9074 }],
        '聚泉': [{ x: 0.0577, y: 0.8848 }],
        '絡卻': [{ x: 0.4630, y: 0.9703 }],
        '承靈': [{ x: 0.4721, y: 0.9701 }],
        '強間': [{ x: 0.4519, y: 0.9353 }],
        '天衝': [{ x: 0.4826, y: 0.9430 }],
        '腦戶': [{ x: 0.4521, y: 0.9128 }],
        '玉枕': [{ x: 0.4599, y: 0.9126 }],
        '腦空': [{ x: 0.4650, y: 0.9137 }],
        '浮白': [{ x: 0.4785, y: 0.9246 }],
        '角孫': [{ x: 0.4848, y: 0.9242 }],
        '頭竅陰': [{ x: 0.4767, y: 0.9115 }],
        '顱息': [{ x: 0.4821, y: 0.9104 }],
        '風府': [{ x: 0.4525, y: 0.8910 }],
        '風池': [{ x: 0.4645, y: 0.8894 }],
        '完骨': [{ x: 0.4695, y: 0.8916 }],
        '瘛脈': [{ x: 0.4788, y: 0.8973 }],
        '翳風': [{ x: 0.4758, y: 0.8875 }],
        '啞門': [{ x: 0.4525, y: 0.8790 }],
        '天柱': [{ x: 0.4590, y: 0.8667 }],
        '天牖': [{ x: 0.4706, y: 0.8667 }],
        '然谷': [{ x: 0.1681, y: 0.0869 }],
        '衝陽': [{ x: 0.1834, y: 0.0895 }],
        '太衝': [{ x: 0.1807, y: 0.0834 }],
        '公孫': [{ x: 0.1728, y: 0.0749 }],
        '陷谷': [{ x: 0.1916, y: 0.0773 }],
        '太白': [{ x: 0.1761, y: 0.0674 }],
        '內庭': [{ x: 0.1965, y: 0.0705 }],
        '行間': [{ x: 0.1907, y: 0.0655 }],
        '大都': [{ x: 0.1834, y: 0.0582 }],
        '隱白': [{ x: 0.1914, y: 0.0565 }],
        '大敦': [{ x: 0.1937, y: 0.0600 }],
        '厲兌': [{ x: 0.2031, y: 0.0598 }],
        '青靈': [{ x: 0.2175, y: 0.6677 }],
        '少海': [{ x: 0.2192, y: 0.6301 }],
        '曲澤': [{ x: 0.2314, y: 0.6345 }],
        '尺澤': [{ x: 0.2408, y: 0.6391 }],
        '孔最': [{ x: 0.2527, y: 0.5850 }],
        '郄門': [{ x: 0.2489, y: 0.5618 }],
        '間使': [{ x: 0.2541, y: 0.5404 }],
        '內關': [{ x: 0.2568, y: 0.5302 }],
        '靈道': [{ x: 0.2458, y: 0.5188 }],
        '通里': [{ x: 0.2479, y: 0.5133 }],
        '陰郄': [{ x: 0.2500, y: 0.5079 }],
        '神門': [{ x: 0.2521, y: 0.5028 }],
        '大陵': [{ x: 0.2617, y: 0.5087 }],
        '列缺': [{ x: 0.2695, y: 0.5284 }],
        '經渠': [{ x: 0.2695, y: 0.5219 }],
        '太淵': [{ x: 0.2715, y: 0.5131 }],
        '魚際': [{ x: 0.2840, y: 0.5003 }],
        '少商': [{ x: 0.3014, y: 0.4785 }],
        '勞宮': [{ x: 0.2745, y: 0.4776 }],
        '少府': [{ x: 0.2593, y: 0.4754 }],
        '中衝': [{ x: 0.2867, y: 0.4193 }],
        '箕門': [{ x: 0.1672, y: 0.4170 }],
        '伏兔': [{ x: 0.1898, y: 0.3964 }],
        '陰包': [{ x: 0.1597, y: 0.3746 }],
        '陰市': [{ x: 0.1863, y: 0.3619 }],
        '血海': [{ x: 0.1620, y: 0.3527 }],
        '梁丘': [{ x: 0.1845, y: 0.3503 }],
        '犢鼻': [{ x: 0.1834, y: 0.3051 }],
        '陰陵泉': [{ x: 0.1669, y: 0.2796 }],
        '足三里': [{ x: 0.1831, y: 0.2696 }],
        '地機': [{ x: 0.1662, y: 0.2431 }],
        '上巨虛': [{ x: 0.1845, y: 0.2355 }],
        '條口': [{ x: 0.1836, y: 0.2130 }],
        '豐隆': [{ x: 0.1895, y: 0.2127 }],
        '中都': [{ x: 0.1717, y: 0.2073 }],
        '下巨虛': [{ x: 0.1836, y: 0.2009 }],
        '漏谷': [{ x: 0.1627, y: 0.1935 }],
        '蠡溝': [{ x: 0.1704, y: 0.1817 }],
        '三陰交': [{ x: 0.1659, y: 0.1582 }],
        '商丘': [{ x: 0.1635, y: 0.1134 }],
        '中封': [{ x: 0.1698, y: 0.1146 }],
        '解谿': [{ x: 0.1761, y: 0.1172 }],
        '幽門': [{ x: 0.1571, y: 0.6843 }],
        '氣衝': [{ x: 0.1671, y: 0.5278 }],
        '急脈': [{ x: 0.1713, y: 0.5143 }],
        '陰廉': [{ x: 0.1669, y: 0.5019 }],
        '足五里': [{ x: 0.1671, y: 0.4888 }],
        '缺盆': [{ x: 0.1819, y: 0.8059 }],
        '氣戶': [{ x: 0.1822, y: 0.7944 }],
        '庫房': [{ x: 0.1836, y: 0.7774 }],
        '屋翳': [{ x: 0.1849, y: 0.7610 }],
        '膺窗': [{ x: 0.1855, y: 0.7451 }],
        '乳中': [{ x: 0.1857, y: 0.7269 }],
        '乳根': [{ x: 0.1854, y: 0.7120 }],
        '期門': [{ x: 0.1855, y: 0.6942 }],
        '腹哀': [{ x: 0.1836, y: 0.6426 }],
        '章門': [{ x: 0.1898, y: 0.6278 }],
        '大橫': [{ x: 0.1834, y: 0.6005 }],
        '腹結': [{ x: 0.1836, y: 0.5817 }],
        '府舍': [{ x: 0.1833, y: 0.5396 }],
        '衝門': [{ x: 0.1782, y: 0.5313 }],
        '髀關': [{ x: 0.1977, y: 0.4811 }],
        '周榮': [{ x: 0.1979, y: 0.7673 }],
        '胸鄉': [{ x: 0.1983, y: 0.7504 }],
        '天谿': [{ x: 0.1989, y: 0.7336 }],
        '天池': [{ x: 0.1929, y: 0.7305 }],
        '食竇': [{ x: 0.1997, y: 0.7168 }],
        '肩髃': [{ x: 0.2254, y: 0.7924 }],
        '天泉': [{ x: 0.2225, y: 0.7173 }],
        '天府': [{ x: 0.2311, y: 0.7088 }],
        '俠白': [{ x: 0.2329, y: 0.6987 }],
        '俞府': [{ x: 0.1684, y: 0.7910 }],
        '彧中': [{ x: 0.1686, y: 0.7756 }],
        '神藏': [{ x: 0.1692, y: 0.7588 }],
        '靈墟': [{ x: 0.1692, y: 0.7429 }],
        '神封': [{ x: 0.1694, y: 0.7268 }],
        '步廊': [{ x: 0.1694, y: 0.7109 }],
        '不容': [{ x: 0.1683, y: 0.6844 }],
        '承滿': [{ x: 0.1681, y: 0.6707 }],
        '梁門': [{ x: 0.1680, y: 0.6570 }],
        '關門': [{ x: 0.1680, y: 0.6437 }],
        '太乙': [{ x: 0.1680, y: 0.6297 }],
        '滑肉門': [{ x: 0.1678, y: 0.6155 }],
        '天樞': [{ x: 0.1678, y: 0.6013 }],
        '外陵': [{ x: 0.1677, y: 0.5866 }],
        '大巨': [{ x: 0.1677, y: 0.5714 }],
        '水道': [{ x: 0.1675, y: 0.5561 }],
        '歸來': [{ x: 0.1672, y: 0.5408 }],
        '腹通谷': [{ x: 0.1571, y: 0.6704 }],
        '陰都': [{ x: 0.1571, y: 0.6563 }],
        '石關': [{ x: 0.1570, y: 0.6431 }],
        '商曲': [{ x: 0.1570, y: 0.6296 }],
        '肓俞': [{ x: 0.1571, y: 0.6008 }],
        '四滿': [{ x: 0.1563, y: 0.5713 }],
        '中注': [{ x: 0.1565, y: 0.5862 }],
        '氣穴': [{ x: 0.1563, y: 0.5559 }],
        '大赫': [{ x: 0.1561, y: 0.5408 }],
        '橫骨': [{ x: 0.1560, y: 0.5247 }],
        '中極': [{ x: 0.1516, y: 0.5413 }],
        '曲骨': [{ x: 0.1519, y: 0.5256 }],
        '紫宮': [{ x: 0.1529, y: 0.7593 }],
        '玉堂': [{ x: 0.1531, y: 0.7423 }],
        '膻中': [{ x: 0.1531, y: 0.7268 }],
        '中庭': [{ x: 0.1531, y: 0.7112 }],
        '鳩尾': [{ x: 0.1533, y: 0.6983 }],
        '巨闕': [{ x: 0.1533, y: 0.6846 }],
        '上脘': [{ x: 0.1531, y: 0.6707 }],
        '中脘': [{ x: 0.1529, y: 0.6567 }],
        '建里': [{ x: 0.1529, y: 0.6436 }],
        '下脘': [{ x: 0.1528, y: 0.6299 }],
        '水分': [{ x: 0.1526, y: 0.6157 }],
        '神闕': [{ x: 0.1526, y: 0.6011 }],
        '陰交': [{ x: 0.1526, y: 0.5864 }],
        '氣海': [{ x: 0.1524, y: 0.5789 }],
        '石門': [{ x: 0.1521, y: 0.5706 }],
        '關元': [{ x: 0.1519, y: 0.5566 }],
        '璇璣': [{ x: 0.1528, y: 0.7915 }],
        '兌端': [{ x: 0.1524, y: 0.8663 }],
        '華蓋': [{ x: 0.1529, y: 0.7756 }],
        '承漿': [{ x: 0.1529, y: 0.8513 }],
        '廉泉': [{ x: 0.1526, y: 0.8318 }],
        '人迎': [{ x: 0.1624, y: 0.8264 }],
        '扶突': [{ x: 0.1692, y: 0.8264 }],
        '水突': [{ x: 0.1630, y: 0.8149 }],
        '天鼎': [{ x: 0.1761, y: 0.8167 }],
        '氣舍': [{ x: 0.1634, y: 0.8044 }],
        '天突': [{ x: 0.1528, y: 0.8015 }],
        '中府': [{ x: 0.1968, y: 0.7839 }],
        '雲門': [{ x: 0.1965, y: 0.8006 }],
        '上星': [{ x: 0.1518, y: 0.9534 }],
        '神庭': [{ x: 0.1518, y: 0.9473 }],
        '五處': [{ x: 0.1612, y: 0.9524 }],
        '眉冲': [{ x: 0.1575, y: 0.9475 }],
        '曲差': [{ x: 0.1610, y: 0.9473 }],
        '頭臨泣': [{ x: 0.1645, y: 0.9467 }],
        '頭維': [{ x: 0.1738, y: 0.9421 }],
        '頷厭': [{ x: 0.1778, y: 0.9326 }],
        '陽白': [{ x: 0.1647, y: 0.9213 }],
        '攢竹': [{ x: 0.1576, y: 0.9089 }],
        '印堂': [{ x: 0.1518, y: 0.9101 }],
        '本神': [{ x: 0.1697, y: 0.9456 }],
        '睛明': [{ x: 0.1573, y: 0.8992 }],
        '絲竹空': [{ x: 0.1731, y: 0.9102 }],
        '瞳子髎': [{ x: 0.1729, y: 0.8987 }],
        '承泣': [{ x: 0.1649, y: 0.8923 }],
        '上關': [{ x: 0.1755, y: 0.8896 }],
        '下關': [{ x: 0.1760, y: 0.8801 }],
        '四白': [{ x: 0.1650, y: 0.8867 }],
        '巨髎': [{ x: 0.1652, y: 0.8760 }],
        '顴髎': [{ x: 0.1709, y: 0.8784 }],
        '迎香': [{ x: 0.1595, y: 0.8774 }],
        '口禾髎': [{ x: 0.1563, y: 0.8718 }],
        '素髎': [{ x: 0.1523, y: 0.8806 }],
        '水溝': [{ x: 0.1523, y: 0.8713 }],
        '地倉': [{ x: 0.1649, y: 0.8618 }],
        '頰車': [{ x: 0.1718, y: 0.8589 }],
        '大迎': [{ x: 0.1687, y: 0.8491 }]
    };

    /*
     * 簡繁字形轉換表
     */
    const CHAR_TO_SIMPLIFIED = {
        '雲': '云', '門': '门', '處': '处', '頭': '头', '臨': '临',
        '維': '维', '頜': '颌', '厭': '厌', '陽': '阳', '攢': '攒',
        '衝': '冲', '沖': '冲'
    };
    const CHAR_TO_TRADITIONAL = {
        '云': ['雲'], '门': ['門'], '处': ['處'], '头': ['頭'], '临': ['臨'],
        '维': ['維'], '颌': ['頜'], '厌': ['厭'], '阳': ['陽'], '攒': ['攢'],
        '冲': ['沖', '衝']
    };

    function toSimplifiedName(str) {
        return Array.from(str).map(ch => CHAR_TO_SIMPLIFIED[ch] || ch).join('');
    }

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

    // 自動生成同義鍵
    (function generateSynonyms() {
        const originalEntries = Object.entries(ACUPOINT_COORDS);
        for (const [name, coordsList] of originalEntries) {
            const simplified = toSimplifiedName(name);
            if (simplified && !(simplified in ACUPOINT_COORDS)) {
                ACUPOINT_COORDS[simplified] = coordsList;
            }
            const traditionals = toTraditionalNames(name);
            for (const trad of traditionals) {
                if (trad && !(trad in ACUPOINT_COORDS)) {
                    ACUPOINT_COORDS[trad] = coordsList;
                }
            }
        }
    })();

    /**
     * 將座標資料套用至全域 acupointLibrary。
     * 修改：除了套用單一座標 x, y (為了相容性) 外，新增 multiCoords 陣列屬性。
     */
    function applyAcupointCoordinates() {
        let library;
        try {
            library = typeof acupointLibrary !== 'undefined' ? acupointLibrary : window.acupointLibrary;
        } catch (_err) {
            library = window.acupointLibrary;
        }
        
        if (Array.isArray(library)) {
            try {
                if (typeof window !== 'undefined') {
                    window.acupointLibrary = library;
                }
            } catch (_e) {}

            library.forEach(ac => {
                if (ac) {
                    const rawName = ac.name || '';
                    const cleanedName = String(rawName).replace(/\s*\(.*\)$/, '');
                    
                    // 尋找對應的座標陣列
                    let coordsList = ACUPOINT_COORDS[cleanedName];
                    if (!coordsList) {
                        try {
                            const simplifiedKey = toSimplifiedName(cleanedName);
                            coordsList = ACUPOINT_COORDS[simplifiedKey];
                        } catch (_normErr) {
                            coordsList = undefined;
                        }
                    }

                    // 處理已經存在於物件中的 x, y (字串轉數字)
                    if (typeof ac.x === 'string' && !Number.isNaN(parseFloat(ac.x))) ac.x = parseFloat(ac.x);
                    if (typeof ac.y === 'string' && !Number.isNaN(parseFloat(ac.y))) ac.y = parseFloat(ac.y);

                    if (coordsList && coordsList.length > 0) {
                        // 1. 為了相容舊邏輯，將第一個座標賦值給 x, y (若原本沒有)
                        if (typeof ac.x !== 'number') {
                            ac.x = coordsList[0].x;
                        }
                        if (typeof ac.y !== 'number') {
                            ac.y = coordsList[0].y;
                        }

                        // 2. 儲存完整的座標列表以支援多點顯示
                        ac.multiCoords = coordsList;
                    } else if (typeof ac.x === 'number' && typeof ac.y === 'number') {
                        // 若查無資料庫但本身有座標，也轉為 multiCoords 格式方便統一處理
                        ac.multiCoords = [{x: ac.x, y: ac.y}];
                    }
                }
            });
        }
        try {
            if (typeof window !== 'undefined') {
                window.applyAcupointCoordinates = applyAcupointCoordinates;
            }
        } catch (_e) {}
    }

    /**
     * 初始化穴位地圖。
     * 修改：使用 multiCoords 屬性來繪製多個點。
     */
    window.initAcupointMap = function() {
        try {
            const mapContainer = document.getElementById('acupointMap');
            if (!mapContainer || mapContainer.dataset.initialized) {
                return;
            }
            mapContainer.dataset.initialized = 'true';
            
            const img = new Image();
            img.src = 'images/combined_three.png';
            img.onload = function() {
                applyAcupointCoordinates();
                
                const w = img.width;
                const h = img.height;
                const map = L.map(mapContainer, {
                    crs: L.CRS.Simple,
                    maxZoom: 4,
                    zoomControl: false,
                    attributionControl: false
                });
                
                const bounds = [[0,0],[h,w]];
                L.imageOverlay(img.src, bounds).addTo(map);
                try { map.invalidateSize(); } catch (_e) {}
                
                const baseZoom = map.getBoundsZoom(bounds);
                const initialZoom = baseZoom - 1;
                
                if (typeof map.setMinZoom === 'function') map.setMinZoom(initialZoom);
                else map.options.minZoom = initialZoom;
                
                if (typeof map.setMaxBounds === 'function') map.setMaxBounds(bounds);
                
                map.options.maxBoundsViscosity = 1.0;
                map.setView([h / 2, w / 2], initialZoom);
                
                // Resize Observer and Events
                try {
                    setTimeout(function(){ try { map.invalidateSize(); } catch(_e) {} }, 50);
                    window.addEventListener('resize', function(){ try { map.invalidateSize(); } catch(_e) {} });
                    if (typeof ResizeObserver !== 'undefined') {
                        const ro = new ResizeObserver(function(){ try { map.invalidateSize(); } catch(_e) {} });
                        ro.observe(mapContainer);
                    }
                } catch (_e) {}

                // Cursor Style
                try {
                    const mapEl = map.getContainer();
                    if (mapEl && mapEl.style) {
                        mapEl.style.cursor = 'crosshair';
                        map.on('dragstart', function() { mapEl.style.cursor = 'crosshair'; });
                        map.on('dragend', function() { mapEl.style.cursor = 'crosshair'; });
                    }
                } catch (_cursorErr) {}

                // Marker Rendering Logic
                let library;
                try {
                    library = typeof acupointLibrary !== 'undefined' ? acupointLibrary : window.acupointLibrary;
                } catch (_err) {
                    library = window.acupointLibrary;
                }
                
                if (Array.isArray(library)) {
                    library.forEach(ac => {
                        if (!ac) return;

                        // 決定要繪製的座標列表
                        // 優先使用 applyAcupointCoordinates 生成的座標列表，否則使用單一 x,y
                        let pointsToDraw = [];
                        if (ac.multiCoords && Array.isArray(ac.multiCoords)) {
                            pointsToDraw = ac.multiCoords;
                        } else if (typeof ac.x === 'number' && typeof ac.y === 'number') {
                            pointsToDraw = [{x: ac.x, y: ac.y}];
                        }

                        // 遍歷所有座標進行繪製
                        pointsToDraw.forEach(pt => {
                            if (typeof pt.x !== 'number' || typeof pt.y !== 'number') return;
                            
                            const lat = h * pt.y;
                            const lon = w * pt.x;
                            
                            const marker = L.circleMarker([lat, lon], {
                                radius: 4,
                                color: '#2563eb',
                                weight: 0,
                                fillColor: '#2563eb',
                                fillOpacity: 0.85
                            }).addTo(map);

                            // Tooltip / Popup Logic
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
                                const hasCustomTooltip = (typeof showTooltip === 'function') && (typeof hideTooltip === 'function') && (typeof moveTooltip === 'function');
                                
                                if (hasCustomTooltip) {
                                    marker.on('mouseover', function(e) {
                                        try { showTooltip(e.originalEvent, encodeURIComponent(content)); } catch (_ignore) {}
                                    });
                                    marker.on('mousemove', function(e) {
                                        try { moveTooltip(e.originalEvent); } catch (_ignore) {}
                                    });
                                    marker.on('mouseout', function() {
                                        try { hideTooltip(); } catch (_ignore) {}
                                    });
                                } else {
                                    if (typeof marker.bindPopup === 'function') marker.bindPopup(html);
                                    if (typeof marker.bindTooltip === 'function') marker.bindTooltip(html, { direction: 'top', offset: [0, -10], opacity: 0.9 });
                                }
                            }
                        });
                    });
                }

                // Coordinate Display (Debug tool)
                try {
                    const mapEl = map.getContainer();
                    if (mapEl) {
                        try {
                            const computedStyle = window.getComputedStyle(mapEl);
                            const pos = computedStyle ? computedStyle.position : mapEl.style.position;
                            if (!pos || pos === 'static') mapEl.style.position = 'relative';
                        } catch (_posErr) {
                            if (!mapEl.style.position) mapEl.style.position = 'relative';
                        }
                        
                        let coordDiv = mapEl.querySelector('#coordinateDisplay');
                        if (!coordDiv) {
                            coordDiv = document.createElement('div');
                            coordDiv.id = 'coordinateDisplay';
                            coordDiv.className = 'leaflet-coordinate-display';
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
                            coordDiv.style.zIndex = '1000';
                            mapEl.appendChild(coordDiv);
                        }
                        
                        map.on('mousemove', function(ev) {
                            let xCoord = Math.min(Math.max(ev.latlng.lng, 0), w);
                            let yCoord = Math.min(Math.max(ev.latlng.lat, 0), h);
                            coordDiv.textContent = 'x: ' + (xCoord / w).toFixed(4) + ', y: ' + (yCoord / h).toFixed(4);
                        });
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
