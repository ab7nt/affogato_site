// Модальная сцена «о проекте»: кликом «что это?» в верхней навигации
// запускается авто-проигрывание 81 кадра из into-the-forest_frames, на
// финальном кадре проявляется заглушка-текст. Выход — кнопка «обратно»
// (авто-проигрывание кадров в обратную сторону) или scroll-up с накоплением
// порога (как в плеере). В режиме «open» wheel/touch скраббит прогресс
// кадра в обе стороны, как в diving по скроллу.
window.Affogato = window.Affogato || {};

Affogato.Forest = (function () {
  var triggerEl, returnEl, shellEl, panelEl, contentEl, canvasEl, loadingEl, ctx;
  var frames = null;
  var loading = false;
  var mode = 'closed'; // 'closed' | 'loading' | 'descending' | 'open' | 'ascending'
  var progress = 0;    // 0..1 — позиция в секвенции кадров
  var animFrom = 0, animTo = 0, animStart = 0, animDuration = 0;
  var raf = null;
  var returnScrollDebt = 0;
  var lastReturnScrollAt = 0;
  var touchLastY = 0;

  // Чувствительность скраббинга: сколько px wheel/touch соответствует
  // полному перебору прогресса 0→1. Большее значение — медленнее реакция.
  var SCRUB_PX_PER_PROGRESS = 1100;

  // С какого прогресса подложка начинает проявляться. Полная видимость на
  // progress=1; всё, что раньше — линейно от 0 к 1.
  var PANEL_FADE_START = 0.78;

  function cfg() {
    return Affogato.Config.scenes.forest;
  }

  function clamp01(v) {
    return v < 0 ? 0 : (v > 1 ? 1 : v);
  }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

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

  function renderProgress(p) {
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

    // Подложка под текст «о проекте» и сам контент: начинают проявляться
    // уже на последних кадрах descent, синхронно с приближением хижины.
    // При скраббинге назад так же плавно гаснут.
    var overlayOpacity = clamp01((p - PANEL_FADE_START) / (1 - PANEL_FADE_START)).toFixed(3);
    if (panelEl) panelEl.style.opacity = overlayOpacity;
    if (contentEl) contentEl.style.opacity = overlayOpacity;
  }

  // ─────────────────────────────────── loading ──

  function framePath(n) {
    var f = cfg().frames;
    var num = String(n).padStart(f.pad, '0');
    return f.dir + '/' + f.prefix + num + f.ext;
  }

  function loadOne(src) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        if (img.decode) {
          img.decode().then(function () { resolve(img); }, function () { resolve(img); });
        } else {
          resolve(img);
        }
      };
      img.onerror = function () { resolve(img); };
      img.src = src;
    });
  }

  function loadFrames() {
    if (frames) return Promise.resolve(frames);
    if (loading) return loading;
    var f = cfg().frames;
    var tasks = [];
    for (var i = 0; i < f.count; i++) tasks.push(loadOne(framePath(f.start + i)));
    loading = Promise.all(tasks).then(function (imgs) {
      frames = imgs;
      loading = false;
      return frames;
    });
    return loading;
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
      progress = animFrom + (animTo - animFrom) * k;
      renderProgress(progress);
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
    mode = 'loading';
    showLoading(true);
    canvasEl.classList.add('is-visible');
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
      applyCanvasSize();
      progress = 0;
      renderProgress(0);
      shellEl.classList.remove('is-open');

      startAnim(0, 1, cfg().descentSec || 1.2, function () {
        mode = 'open';
        progress = 1;
        renderProgress(1);
        shellEl.classList.add('is-open');
        // Кнопка «обратно» появляется только сейчас — синхронно с заглушкой,
        // а не с самого старта погружения.
        document.body.classList.add('forest-content-open');
        returnScrollDebt = 0;
        lastReturnScrollAt = 0;
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
    shellEl.classList.remove('is-open');
    // Кнопку «обратно» уводим сразу через снятие класса — CSS transition
    // на .return-hint--forest = 0.35s, что синхронно с заглушкой (0.5s).
    document.body.classList.remove('forest-content-open');
    returnScrollDebt = 0;
    lastReturnScrollAt = 0;

    var fullDur = cfg().ascentSec || 1.2;
    // Длительность пропорциональна оставшейся доле — как player.closePlayer
    // (js/player.js:523): иначе таймер пройдёт после уже завершённой
    // анимации и оставит idle-хвост.
    var dur = Math.max(0.12, startProgress * fullDur);

    progress = startProgress;
    renderProgress(progress);

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
      Affogato.SmoothScroll.unlock();
      mode = 'closed';
      progress = 0;
    });
  }

  // ──────────────── scroll-out из «о проекте» ──

  function applyScrub(amount) {
    // amount > 0 — wheel вниз (углубляемся в кадры, прогресс растёт)
    // amount < 0 — wheel вверх (выходим обратно, прогресс падает)
    var delta = amount / SCRUB_PX_PER_PROGRESS;
    progress = clamp01(progress + delta);
    renderProgress(progress);
    // Заглушка «о проекте» видна только на финальном кадре. Любой скраббинг
    // её прячет; если юзер вернётся ровно на progress=1 — снова появится.
    if (mode === 'open' && shellEl) {
      if (progress >= 1) shellEl.classList.add('is-open');
      else shellEl.classList.remove('is-open');
    }
  }

  // Накопление scroll-up debt: повторяет логику player.collectReturnScroll
  // (js/player.js:361-392), но без отдельного preview-эффекта — кадровый
  // скраббинг прогресса сам служит «превью» возврата.
  function collectReturnScroll(amount) {
    if (mode !== 'open') return;
    var now = performance.now();
    if (!lastReturnScrollAt || now - lastReturnScrollAt > 850) {
      returnScrollDebt = 0;
    }
    lastReturnScrollAt = now;

    if (amount <= 0) {
      // wheel вниз — мы идём вперёд по кадрам, debt снимается медленнее
      // (как в плеере), не сбрасывается резко.
      returnScrollDebt = Math.max(0, returnScrollDebt + amount * 0.7);
      return;
    }

    returnScrollDebt += amount;
    var threshold = cfg().returnScrollThreshold || 900;
    if (returnScrollDebt >= threshold) {
      returnScrollDebt = 0;
      close({ startProgress: progress });
    }
  }

  function onWheel(e) {
    if (mode !== 'open') return;
    e.preventDefault();
    applyScrub(e.deltaY);
    // scroll-up (deltaY < 0) — копим debt; scroll-down — гасим (через amount<=0
    // ветку collectReturnScroll).
    collectReturnScroll(-e.deltaY);
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
    collectReturnScroll(dy * 2.2);
  }

  // ────────────────────────────── init ──

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
    panelEl = shellEl ? shellEl.querySelector('.forest-shell__panel') : null;
    contentEl = shellEl ? shellEl.querySelector('.forest-shell__content') : null;
    canvasEl = document.getElementById('forest-overlay');
    loadingEl = document.getElementById('forest-loading');
    if (!triggerEl || !canvasEl) return;

    ctx = canvasEl.getContext('2d');
    applyCanvasSize();
    Affogato.Viewport.onChange(function () {
      applyCanvasSize();
      if (mode !== 'closed') renderProgress(progress);
    });

    bindEvents();
  }

  function isActive() {
    return mode !== 'closed';
  }

  return { init: init, isActive: isActive };
})();
