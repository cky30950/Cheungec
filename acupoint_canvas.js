// acupoint_canvas.js: 動態穴位圖繪製與互動
(function() {
  /**
   * 等待 document ready，並在 ready 時執行 callback。
   * @param {Function} fn
   */
  function ready(fn) {
    if (document.readyState !== 'loading') {
      fn();
    } else {
      document.addEventListener('DOMContentLoaded', fn);
    }
  }

  // 初始化 Konva 畫布與標記
  window.initAcupointCanvas = function() {
    try {
      // 需先載入 Konva，並確保穴位資料存在
      if (typeof Konva === 'undefined' || !Array.isArray(window.acupointLibrary)) {
        return;
      }
      const container = document.getElementById('acupointImageContainer');
      if (!container) return;
      // 容器需為相對定位
      const compStyle = window.getComputedStyle(container);
      if (compStyle.position === 'static' || !compStyle.position) {
        container.style.position = 'relative';
      }
      // 找或建 overlay
      let overlay = container.querySelector('#acupointCanvasStage');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'acupointCanvasStage';
        overlay.style.position = 'absolute';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.right = '0';
        overlay.style.bottom = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.pointerEvents = 'auto';
        // 確保畫布層位於圖片之上
        overlay.style.zIndex = '10';
        container.appendChild(overlay);
      } else {
        overlay.innerHTML = '';
        // 確保畫布層位於圖片之上
        overlay.style.zIndex = '10';
      }
      // 移除舊舞台
      if (window._acupointStage && typeof window._acupointStage.destroy === 'function') {
        try { window._acupointStage.destroy(); } catch (e) { /* ignore */ }
        window._acupointStage = null;
        window._acupointLayer = null;
      }
      // 取得寬高比例
      const imgEl = document.getElementById('acupointImage');
      const stageWidth = container.clientWidth || 600;
      let ratio = 1;
      if (imgEl && imgEl.naturalWidth && imgEl.naturalHeight) {
        ratio = imgEl.naturalHeight / imgEl.naturalWidth;
      }
      window._acupointRatio = ratio;
      const stageHeight = stageWidth * ratio;
      overlay.style.height = stageHeight + 'px';
      const stage = new Konva.Stage({ container: overlay, width: stageWidth, height: stageHeight });
      window._acupointStage = stage;
      const layer = new Konva.Layer();
      stage.add(layer);
      window._acupointLayer = layer;
      // 載入背景圖
      const bgImg = new Image();
      bgImg.onload = function() {
        const imgRatio = bgImg.height / bgImg.width || 1;
        if (Math.abs(imgRatio - ratio) > 0.01) {
          window._acupointRatio = imgRatio;
          const newHeight = stageWidth * imgRatio;
          stage.height(newHeight);
          overlay.style.height = newHeight + 'px';
        }
        const bg = new Konva.Image({ image: bgImg, x: 0, y: 0, width: stage.width(), height: stage.height(), name: 'acupoint-bg' });
        layer.add(bg);
        window.drawAcupointMarkers(stage, layer);
        stage.draw();
      };
      // 使用現有圖片來源
      bgImg.src = (imgEl && imgEl.getAttribute('src')) ? imgEl.getAttribute('src') : 'images/combined_three.png';
      // 只綁定一次 resize
      if (!window.initAcupointCanvas._resized) {
        window.addEventListener('resize', debounce(window.resizeAcupointCanvas, 200));
        window.initAcupointCanvas._resized = true;
      }
    } catch (err) {
      console.warn('initAcupointCanvas error:', err);
    }
  };

  // 繪製穴位標記
  window.drawAcupointMarkers = function(stage, layer) {
    if (!stage || !layer || !Array.isArray(window.acupointLibrary) || window.acupointLibrary.length === 0) return;
    const groups = {};
    window.acupointLibrary.forEach(function(ac) {
      const m = ac.meridian || '未分類';
      if (!groups[m]) groups[m] = [];
      groups[m].push(ac);
    });
    const meridians = Object.keys(groups);
    const columns = meridians.length || 1;
    const stageW = stage.width();
    const stageH = stage.height();
    meridians.forEach(function(m, mi) {
      const list = groups[m];
      const count = list.length;
      list.forEach(function(ac, idx) {
        const normX = (mi + 0.5) / columns;
        const normY = (idx + 1) / (count + 1);
        ac._normX = normX;
        ac._normY = normY;
        const x = stageW * normX;
        const y = stageH * normY;
        const circle = new Konva.Circle({ x: x, y: y, radius: 4, fill: 'rgba(0, 119, 204, 0.6)', stroke: '#0077cc', strokeWidth: 1, name: 'acupoint-shape' });
        circle.acupointData = ac;
        circle.on('mouseenter', function() {
          try { stage.container().style.cursor = 'pointer'; } catch (e) {}
          window.showAcupointTooltip(ac, this.x(), this.y(), stage);
        });
        circle.on('mouseleave', function() {
          try { stage.container().style.cursor = 'default'; } catch (e) {}
          window.hideAcupointTooltip();
        });
        circle.on('click', function() {
          window.handleAcupointClick(ac);
        });
        layer.add(circle);
      });
    });
  };

  // 調整尺寸時重新布局
  window.resizeAcupointCanvas = function() {
    try {
      const stage = window._acupointStage;
      const layer = window._acupointLayer;
      if (!stage || !layer) return;
      const overlay = stage.container();
      const container = overlay.parentElement;
      const width = container.clientWidth || 600;
      const ratio = window._acupointRatio || 1;
      const height = width * ratio;
      overlay.style.height = height + 'px';
      stage.width(width);
      stage.height(height);
      const bg = layer.findOne('.acupoint-bg');
      if (bg) { bg.width(width); bg.height(height); }
      layer.find('.acupoint-shape').each(function(shape) {
        const nx = shape.acupointData && shape.acupointData._normX;
        const ny = shape.acupointData && shape.acupointData._normY;
        if (typeof nx === 'number' && typeof ny === 'number') {
          shape.x(width * nx);
          shape.y(height * ny);
        }
      });
      stage.draw();
    } catch (err) {
      console.warn('resizeAcupointCanvas error:', err);
    }
  };

  // 顯示提示
  window.showAcupointTooltip = function(ac, x, y, stage) {
    try {
      let tooltip = document.getElementById('acupointTooltip');
      if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'acupointTooltip';
        tooltip.style.position = 'absolute';
        tooltip.style.pointerEvents = 'none';
        tooltip.style.background = 'rgba(255, 255, 255, 0.95)';
        tooltip.style.border = '1px solid #ccc';
        tooltip.style.borderRadius = '4px';
        tooltip.style.padding = '4px 6px';
        tooltip.style.fontSize = '12px';
        tooltip.style.color = '#333';
        tooltip.style.zIndex = '9999';
        document.body.appendChild(tooltip);
      }
      tooltip.textContent = (ac && ac.name) ? ac.name : '';
      const rect = stage.container().getBoundingClientRect();
      tooltip.style.left = (rect.left + x + 8) + 'px';
      tooltip.style.top = (rect.top + y - 24) + 'px';
      tooltip.style.display = 'block';
    } catch (err) {
      /* ignore */
    }
  };

  // 隱藏提示
  window.hideAcupointTooltip = function() {
    const tooltip = document.getElementById('acupointTooltip');
    if (tooltip) {
      tooltip.style.display = 'none';
    }
  };

  // 點擊顯示詳情
  window.handleAcupointClick = function(ac) {
    if (!ac) return;
    const funcs = Array.isArray(ac.functions) ? ac.functions.join('、') : (ac.functions || '');
    const inds = Array.isArray(ac.indications) ? ac.indications.join('、') : (ac.indications || '');
    const html = `\n      ${ac.meridian ? `<p><strong>經絡：</strong>${ac.meridian}</p>` : ''}\n      ${ac.location ? `<p><strong>定位：</strong>${ac.location}</p>` : ''}\n      ${funcs ? `<p><strong>功能：</strong>${funcs}</p>` : ''}\n      ${inds ? `<p><strong>主治：</strong>${inds}</p>` : ''}\n      ${ac.method ? `<p><strong>針法：</strong>${ac.method}</p>` : ''}\n      ${ac.category ? `<p><strong>穴性：</strong>${ac.category}</p>` : ''}\n    `;
    Swal.fire({ title: ac.name || '', html: html, confirmButtonText: '關閉' });
  };

  // 掛鉤 loadAcupointLibrary，在載入穴位庫後初始化畫布
  ready(function() {
    const maxAttempts = 20;
    let attempts = 0;
    const timer = setInterval(function() {
      attempts += 1;
      if (typeof window.loadAcupointLibrary === 'function') {
        const original = window.loadAcupointLibrary;
        window.loadAcupointLibrary = async function(...args) {
          const result = await original.apply(this, args);
          try {
            if (typeof window.initAcupointCanvas === 'function') {
              window.initAcupointCanvas();
            }
          } catch (err) { console.warn(err); }
          return result;
        };
        clearInterval(timer);
      } else if (attempts >= maxAttempts) {
        clearInterval(timer);
      }
    }, 200);
  });
})();