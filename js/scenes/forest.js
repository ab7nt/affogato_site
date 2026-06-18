// Модальная сцена «о проекте»: кликом «что это?» в верхней навигации
// запускается авто-проигрывание 79 кадров из into-the-forest_frames. Текст
// «о проекте» подан ОДНИМ ЦЕНТРАЛЬНЫМ СТОЛБЦОМ обрывков: каждый привязан к
// своей полосе прогресса (data-band) и показывается по мере прохождения пути.
// Обрывок всплывает в центр на своей полосе, а пройденные уводятся вверх и в
// прозрачность. На быстром авто-пролёте блоки лишь мелькают (не прочитать);
// читаются на медленном РУЧНОМ скролле, когда ты сам задаёшь темп. Выход —
// кнопка «обратно» или накопление порога scroll-up (как в плеере).
window.Affogato = window.Affogato || {};

Affogato.Forest = (function () {
  var triggerEl, returnEl, shellEl, canvasEl, loadingEl, ctx;
  var frames = null;
  var loading = false;
  var mode = 'closed'; // 'closed' | 'loading' | 'descending' | 'open' | 'ascending'
  var progress = 0;    // 0..1 — позиция в секвенции кадров
  var animFrom = 0, animTo = 0, animStart = 0, animDuration = 0;
  var raf = null;
  var touchLastY = 0;

  // Обрывки текста: заполняется в init() из .forest-news__item.
  // { el, band, bandw }
  var items = [];

  // Чувствительность скраббинга: сколько px wheel/touch соответствует
  // полному перебору прогресса 0→1. Большее значение — медленнее реакция.
  var SCRUB_PX_PER_PROGRESS = 1100;

  // Offscreen-снимок #stage в момент клика «что это?». Накладывается поверх
  // forest-кадра с убывающей альфой на старте descent и нарастающей — на
  // финале ascent: на стыке main-сцена и forest-overlay показывают идентичные
  // пиксели, разница ракурсов между диванг-кадром и forest_0001 не видна.
  var snapshotCanvas = null;
  var snapshotCtx = null;

  // На какой доле прогресса снимок главной сцены полностью «растворяется».
  var SNAPSHOT_FADE_END = 0.1;

  function cfg() {
    return Affogato.Config.scenes.forest;
  }

  function newsCfg() {
    return cfg().news || {};
  }

  var clamp01 = Affogato.Utils.clamp01;
  var easeInOutCubic = Affogato.Utils.easeInOutCubic;

  // ───────────────────────────────────────── canvas ──

  function applyCanvasSize() {
    var perf = Affogato.Config.performance || {};
    var dpr = Math.min(window.devicePixelRatio || 1, perf.maxDpr || 1.5);
    var w = Affogato.Viewport.width();
    var h = Affogato.Viewport.height();
    canvasEl.width = Math.round(w * dpr);
    canvasEl.height = Math.round(h * dpr);
    canvasEl.style.width = w + 'px';
    canvasEl.style.height = h + 'px';
    ctx.imageSmoothingQuality = 'high';
  }

  function isMobile() {
    return !!(window.matchMedia && window.matchMedia('(max-width: 760px)').matches);
  }

  function drawFrame(img, offsetXFrac) {
    var cw = canvasEl.width, ch = canvasEl.height;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, cw, ch);
    if (!img) return;
    var iw = img.naturalWidth || img.width || cw;
    var ih = img.naturalHeight || img.height || ch;
    var scale = Math.max(cw / iw, ch / ih);
    var dw = iw * scale, dh = ih * scale;
    var offsetX = (offsetXFrac || 0) * dw;
    ctx.drawImage(img, (cw - dw) / 2 + offsetX, (ch - dh) / 2, dw, dh);
  }

  // Снимок текущего состояния главного канваса (#stage). Размер подгоняется
  // под forest-overlay, чтобы drawImage в drawCanvas работал 1:1.
  function captureMainSnapshot() {
    var stageCanvas = document.getElementById('stage');
    if (!stageCanvas || !canvasEl.width || !canvasEl.height) {
      snapshotCanvas = null;
      return;
    }
    if (!snapshotCanvas) {
      snapshotCanvas = document.createElement('canvas');
      snapshotCtx = snapshotCanvas.getContext('2d');
    }
    snapshotCanvas.width = canvasEl.width;
    snapshotCanvas.height = canvasEl.height;
    snapshotCtx.imageSmoothingQuality = 'high';
    try {
      snapshotCtx.drawImage(
        stageCanvas,
        0, 0, stageCanvas.width, stageCanvas.height,
        0, 0, snapshotCanvas.width, snapshotCanvas.height
      );
    } catch (e) {
      snapshotCanvas = null;
    }
  }

  // Рисует ТОЛЬКО canvas (кадр леса + бесшовный снимок #stage). Текстовые
  // обрывки — отдельно, в updateFragments.
  function drawCanvas(p) {
    if (!frames || !frames.length) return;
    var c = cfg();
    var s = c.startSpeed != null ? c.startSpeed : 0.4;
    var eased = s * p + (1 - s) * p * p;
    var idx = Math.round(eased * (frames.length - 1));
    if (idx < 0) idx = 0;
    if (idx > frames.length - 1) idx = frames.length - 1;

    // Мобильный pan: для последних кадров плавно сдвигаем изображение,
    // чтобы хижина не уезжала за правый край портретного экрана.
    var offsetXFrac = 0;
    var pan = c.mobilePan;
    if (pan && isMobile() && p > pan.startProgress) {
      var k = (p - pan.startProgress) / (1 - pan.startProgress);
      if (k > 1) k = 1;
      offsetXFrac = (pan.endShiftFrac || 0) * k;
    }
    drawFrame(frames[idx], offsetXFrac);

    // Бесшовный стык: при p≈0 поверх forest-кадра рисуется снимок #stage с
    // альфой ≈ 1 — forest-overlay показывает ровно те же пиксели, что main
    // под ним. По мере роста progress снимок гаснет и появляются forest-кадры;
    // на закрытии — симметрично, снимок снова проявляется к p=0.
    if (snapshotCanvas) {
      var snapshotAlpha = clamp01(1 - p / SNAPSHOT_FADE_END);
      if (snapshotAlpha > 0) {
        ctx.save();
        ctx.globalAlpha = snapshotAlpha;
        ctx.drawImage(snapshotCanvas, 0, 0, canvasEl.width, canvasEl.height);
        ctx.restore();
      }
    }
  }

  // ───────────────────────────────── обрывки текста ──

  // Позиции/прозрачность обрывков как функция от progress (единый столбец):
  //  • opacity — «колокол» вокруг своей полосы band (виден на своей полосе);
  //  • --py — вертикальный дрейф: пока блок «впереди» по пути (progress > band)
  //    он чуть ниже центра; на своей полосе — в центре; когда пройден
  //    (progress < band) — уходит вверх. На возврате (scroll-up, progress
  //    убывает) это читается как: текущий блок в центре, предыдущие — вверх
  //    и в прозрачность, следующий поднимается снизу.
  function updateFragments() {
    if (!items.length) return;
    var n = newsCfg();
    var half0 = n.bandHalfWidth != null ? n.bandHalfWidth : 0.13;
    var driftPx = n.driftPx != null ? n.driftPx : 340;
    var maxDrift = n.maxDriftPx != null ? n.maxDriftPx : 120;
    var dScale = (isMobile() && n.mobileScale != null) ? n.mobileScale : 1;

    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var half = it.bandw || half0;
      var delta = progress - it.band;         // >0 — впереди (ниже), <0 — пройден (выше)
      var t = half > 0 ? clamp01(1 - Math.abs(delta) / half) : 0;
      var op = t * t * (3 - 2 * t);           // smoothstep-колокол вокруг band
      var y = delta * driftPx * dScale;
      if (y > maxDrift) y = maxDrift; else if (y < -maxDrift) y = -maxDrift;
      var el = it.el;
      el.style.setProperty('--py', y.toFixed(1) + 'px');
      el.style.opacity = op.toFixed(3);
    }
  }

  function hideAllFragments() {
    for (var i = 0; i < items.length; i++) {
      var el = items[i].el;
      el.style.opacity = '0';
      el.style.setProperty('--py', '0px');
    }
  }

  // Единая отрисовка кадра: canvas + обрывки. Зовётся анимацией, скраббингом
  // и при ресайзе — всё чисто от progress, без отдельного rAF-цикла.
  function render(p) {
    progress = p;
    drawCanvas(p);
    updateFragments();
  }

  // ─────────────────────────────────────── loading ──

  function framePath(n) {
    var f = cfg().frames;
    var num = String(n).padStart(f.pad, '0');
    return f.dir + '/' + f.prefix + num + f.ext;
  }

  function loadFrames() {
    if (frames) return Promise.resolve(frames);
    if (loading) return loading;
    var f = cfg().frames;
    var tasks = [];
    for (var i = 0; i < f.count; i++) tasks.push(Affogato.Utils.loadImage(framePath(f.start + i)));
    loading = Promise.all(tasks).then(function (imgs) {
      frames = imgs;
      loading = false;
      return frames;
    });
    return loading;
  }

  // Фоновый прогрев: грузим кадры заранее (идемпотентно), чтобы первый open()
  // не ждал сети. Возвращаем промис — вызывающий может выстроить приоритет.
  function prefetch() {
    return loadFrames();
  }

  // ─────────────────────────────────────── UI ──

  // Прячем верхнюю навигацию, scroll-hint и прочие кнопки до старта анимации —
  // ровно как делает player.hideSiteOverlays (см. js/player.js:460-468).
  function hideSiteOverlays() {
    ['top-nav', 'scroll-hint', 'surface-hint', 'polaroid-return'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) {
        el.style.opacity = 0;
        el.style.pointerEvents = 'none';
      }
    });
  }

  function showLoading(on) {
    if (!loadingEl) return;
    loadingEl.classList.toggle('is-visible', !!on);
  }

  // ───────────────────────────── анимация ──

  function startAnim(from, to, durSec, onDone) {
    animFrom = from;
    animTo = to;
    animDuration = Math.max(0.05, durSec) * 1000;
    animStart = performance.now();

    function tick(now) {
      var p = (now - animStart) / animDuration;
      if (p >= 1) p = 1;
      var k = easeInOutCubic(p);
      render(animFrom + (animTo - animFrom) * k);
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        raf = null;
        if (onDone) onDone();
      }
    }

    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
  }

  // ─────────────────────────── open / close ──

  function open() {
    if (mode !== 'closed') return;
    // Снимок главной сцены делаем СРАЗУ — до hideSiteOverlays/lockAtCurrent
    // и до того, как mode='loading' остановит главный rAF. Это «нулевое»
    // состояние forest-overlay, которое должно совпадать с тем что юзер видит.
    applyCanvasSize();
    captureMainSnapshot();
    mode = 'loading';
    showLoading(true);
    hideSiteOverlays();
    Affogato.SmoothScroll.lockAtCurrent();

    loadFrames().then(function () {
      if (mode !== 'loading') return; // успели закрыться/прервать
      showLoading(false);
      mode = 'descending';
      document.body.classList.add('in-forest-mode');
      // hide() убирает inline opacity без transition — в forest титры
      // вообще не нужны, и при close() не будет «всплеска» от player-state
      // значений, который оставлял setStatic.
      if (Affogato.TitleOverlay && Affogato.TitleOverlay.hide) {
        Affogato.TitleOverlay.hide();
      }
      // renderProgress(0) рисует forest_0001 и поверх — снимок #stage с
      // альфой ≈ 1: канвас выглядит как точная копия main-сцены. is-visible
      // включает CSS opacity-фейд, но визуально нет «cut» — под канвасом
      // те же пиксели.
      render(0);
      canvasEl.classList.add('is-visible');

      startAnim(0, 1, cfg().descentSec || 1.2, function () {
        mode = 'open';
        render(1);
        // Кнопка «обратно» появляется только сейчас — когда долетели до места
        // и можно начинать скроллить столбец на возврате.
        document.body.classList.add('forest-content-open');
      });
    });
  }

  function close(opts) {
    if (mode !== 'open' && mode !== 'descending') return;
    opts = opts || {};
    var startProgress = clamp01(opts.startProgress != null ? opts.startProgress : progress);
    if (mode === 'descending' && raf) {
      cancelAnimationFrame(raf);
      raf = null;
    }
    mode = 'ascending';
    // Кнопку «обратно» уводим сразу через снятие класса — CSS transition
    // на .return-hint--forest = 0.35s.
    document.body.classList.remove('forest-content-open');

    var fullDur = cfg().ascentSec || 1.2;
    // Длительность пропорциональна оставшейся доле — как player.closePlayer
    // (js/player.js:523): иначе таймер пройдёт после уже завершённой
    // анимации и оставит idle-хвост.
    var dur = Math.max(0.12, startProgress * fullDur);

    render(startProgress);

    startAnim(startProgress, 0, dur, function () {
      // Снимаем класс in-forest-mode и одновременно reset() титров —
      // дочерние элементы остаются opacity:0 (hide их так и оставил),
      // а main loop при следующем кадре сам поставит правильное opacity
      // через render() для diving сцены.
      if (Affogato.TitleOverlay && Affogato.TitleOverlay.reset) {
        Affogato.TitleOverlay.reset();
      }
      document.body.classList.remove('in-forest-mode');
      canvasEl.classList.remove('is-visible');
      hideAllFragments();
      Affogato.SmoothScroll.unlock();
      mode = 'closed';
      progress = 0;
    });
  }

  // ──────────────── scroll-out из «о проекте» ──

  // Индекс кадра для прогресса (та же привязка, что в drawCanvas).
  function frameIndexAt(p) {
    if (!frames || !frames.length) return 0;
    var c = cfg();
    var s = c.startSpeed != null ? c.startSpeed : 0.4;
    var eased = s * p + (1 - s) * p * p;
    var idx = Math.round(eased * (frames.length - 1));
    if (idx < 0) idx = 0;
    if (idx > frames.length - 1) idx = frames.length - 1;
    return idx;
  }

  // Возврат полностью ручной. Единственная автоматика: при достижении на
  // возврате (scroll-up) последних N кадров секвенции — доигрываем их сами,
  // чтобы не зависнуть в пустом лесу у самого выхода. Вглубь (scroll-down)
  // ничего не дёргаем.
  function applyScrub(amount) {
    // amount > 0 — wheel вниз (углубляемся в кадры, прогресс растёт)
    // amount < 0 — wheel вверх (выходим обратно, прогресс падает)
    var next = clamp01(progress + amount / SCRUB_PX_PER_PROGRESS);
    render(next);
    if (amount < 0) {
      var tail = cfg().autoExitFrames != null ? cfg().autoExitFrames : 5;
      if (frameIndexAt(next) <= tail) close({ startProgress: next });
    }
  }

  function onWheel(e) {
    if (mode !== 'open') return;
    e.preventDefault();
    applyScrub(e.deltaY);
  }

  function onTouchStart(e) {
    if (mode === 'open' && e.touches && e.touches[0]) {
      touchLastY = e.touches[0].clientY;
    }
  }

  function onTouchMove(e) {
    if (mode !== 'open' || !e.touches || !e.touches[0]) return;
    if (e.cancelable) e.preventDefault();
    var y = e.touches[0].clientY;
    var dy = y - touchLastY;
    touchLastY = y;
    // dy > 0 — палец вниз (обычно соответствует scroll-up страницы).
    // Конвертируем в delta-эквивалент wheel: amount = -dy * factor.
    applyScrub(-dy * 2.2);
  }

  // ────────────────────────────── init ──

  function collectItems() {
    items = [];
    if (!shellEl) return;
    var nodes = shellEl.querySelectorAll('.forest-news__item');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var band = parseFloat(el.getAttribute('data-band'));
      if (isNaN(band)) band = 0.5;
      var bandwRaw = el.getAttribute('data-bandw');
      var bandw = bandwRaw != null ? parseFloat(bandwRaw) : 0;
      items.push({ el: el, band: band, bandw: bandw });
    }
  }

  function bindEvents() {
    triggerEl.addEventListener('click', function (e) {
      e.preventDefault();
      open();
    });
    returnEl.addEventListener('click', function () {
      close();
    });
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
  }

  function init() {
    triggerEl = document.getElementById('forest-trigger');
    returnEl = document.getElementById('forest-return');
    shellEl = document.getElementById('forest-shell');
    canvasEl = document.getElementById('forest-overlay');
    loadingEl = document.getElementById('forest-loading');
    if (!triggerEl || !canvasEl) return;

    collectItems();

    ctx = canvasEl.getContext('2d');
    applyCanvasSize();
    Affogato.Viewport.onChange(function () {
      applyCanvasSize();
      if (mode !== 'closed') render(progress);
    });

    bindEvents();
  }

  function isActive() {
    return mode !== 'closed';
  }

  return { init: init, isActive: isActive, prefetch: prefetch };
})();
