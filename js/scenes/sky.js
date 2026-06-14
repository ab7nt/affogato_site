// Модальная сцена «написать»: кликом «написать» в верхней навигации
// запускается авто-проигрывание 81 кадра из into-the-sky, на финальном
// кадре проявляется панель с формой письма. Выход — кнопка «обратно»
// (авто-проигрывание кадров в обратную сторону) или scroll-up с
// накоплением порога. По структуре повторяет Affogato.Forest.
window.Affogato = window.Affogato || {};

Affogato.Sky = (function () {
  var triggerEl, returnEl, shellEl, panelEl, contentEl, canvasEl, loadingEl, ctx;
  var formEl, emailEl, messageEl, submitBtn, successEl, errorEl, titleEl;
  var sending = false;
  var sendController = null; // AbortController текущей отправки — прерываем при закрытии
  // Заголовки модальной панели: дефолтный («написать») и пост-сабмит
  // («отправлено»). Хардкод текста здесь и в [index.html] синхронен —
  // если меняешь, меняй в обоих местах.
  var TITLE_DEFAULT = 'написать';
  var TITLE_SENT = 'отправлено';

  // AJAX-endpoint FormSubmit.co. Использует плоский email — el/-алиасы
  // (вида el/woxoro) на AJAX-endpoint отдают 404; их формат предназначен
  // только для action обычной HTML-формы. Адрес активирован, спам-фильтр
  // FormSubmit (honeypot + _captcha=false) защищает от роботов.
  var FORMSUBMIT_ENDPOINT = 'https://formsubmit.co/ajax/affogato.sound@gmail.com';

  var frames = null;
  var loading = false;
  var mode = 'closed'; // 'closed' | 'loading' | 'descending' | 'open' | 'ascending'
  var progress = 0;
  var animFrom = 0, animTo = 0, animStart = 0, animDuration = 0;
  var raf = null;
  var returnScrollDebt = 0;
  var lastReturnScrollAt = 0;
  var touchLastY = 0;

  // Offscreen-снимок #stage в момент клика «написать». Накладывается поверх
  // sky-кадра с убывающей альфой на старте descent и нарастающей — на финале
  // ascent. Таким образом на стыке main-сцена и sky-overlay показывают
  // идентичные пиксели, и разница ракурсов между диванг-кадром и sky_0001
  // не видна — нет ни «cut», ни перспективного скачка.
  var snapshotCanvas = null;
  var snapshotCtx = null;

  var SCRUB_PX_PER_PROGRESS = 1100;
  var PANEL_FADE_START = 0.78;

  // На какой доле прогресса снимок главной сцены полностью «растворяется».
  // До этой точки sky-кадр виден всё больше, снимок — всё меньше.
  var SNAPSHOT_FADE_END = 0.1;

  function cfg() {
    return Affogato.Config.scenes.sky;
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

  function drawFrame(img) {
    var cw = canvasEl.width, ch = canvasEl.height;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, cw, ch);
    if (!img) return;
    var iw = img.naturalWidth || img.width || cw;
    var ih = img.naturalHeight || img.height || ch;
    var scale = Math.max(cw / iw, ch / ih);
    var dw = iw * scale, dh = ih * scale;
    ctx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
  }

  // Снимок текущего состояния главного канваса (#stage). Размеры подгоняем
  // под наш sky-overlay, чтобы drawImage в renderProgress работал 1:1.
  // Если канваса нет или drawImage упал — снимка просто не будет, и
  // renderProgress продолжит без бленда.
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

  function renderProgress(p) {
    if (!frames || !frames.length) return;
    var c = cfg();
    var s = c.startSpeed != null ? c.startSpeed : 0.4;
    var eased = s * p + (1 - s) * p * p;
    var idx = Math.round(eased * (frames.length - 1));
    if (idx < 0) idx = 0;
    if (idx > frames.length - 1) idx = frames.length - 1;

    drawFrame(frames[idx]);

    // Бесшовный стык: при p≈0 поверх sky-кадра рисуется снимок #stage с
    // альфой ≈ 1 — sky-overlay показывает ровно то же, что и main под ним,
    // разрыв перспективы не виден. По мере роста progress снимок гаснет, и
    // выходим в чистые sky-кадры; на закрытии — симметрично, снимок снова
    // проявляется к p=0.
    if (snapshotCanvas) {
      var snapshotAlpha = clamp01(1 - p / SNAPSHOT_FADE_END);
      if (snapshotAlpha > 0) {
        ctx.save();
        ctx.globalAlpha = snapshotAlpha;
        ctx.drawImage(snapshotCanvas, 0, 0, canvasEl.width, canvasEl.height);
        ctx.restore();
      }
    }

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
    // Снимок главной сцены делаем СРАЗУ — до hideSiteOverlays/lockAtCurrent
    // и до того, как mode='loading' остановит главный rAF. Это и есть «нулевое»
    // состояние sky-overlay, которое должно совпадать с тем что юзер видит.
    applyCanvasSize();
    captureMainSnapshot();
    mode = 'loading';
    showLoading(true);
    hideSiteOverlays();
    Affogato.SmoothScroll.lockAtCurrent();

    loadFrames().then(function () {
      if (mode !== 'loading') return;
      showLoading(false);
      mode = 'descending';
      document.body.classList.add('in-sky-mode');
      if (Affogato.TitleOverlay && Affogato.TitleOverlay.hide) {
        Affogato.TitleOverlay.hide();
      }
      progress = 0;
      // renderProgress(0) рисует sky_0001 и поверх — снимок #stage с альфой ≈ 1:
      // канвас выглядит как точная копия main-сцены. is-visible включает CSS
      // opacity-фейд, но визуально юзер не замечает, потому что под ним
      // абсолютно те же пиксели.
      renderProgress(0);
      shellEl.classList.remove('is-open');
      canvasEl.classList.add('is-visible');

      startAnim(0, 1, cfg().descentSec || 1.2, function () {
        mode = 'open';
        progress = 1;
        renderProgress(1);
        shellEl.classList.add('is-open');
        document.body.classList.add('sky-content-open');
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
    document.body.classList.remove('sky-content-open');
    returnScrollDebt = 0;
    lastReturnScrollAt = 0;

    var fullDur = cfg().ascentSec || 1.2;
    var dur = Math.max(0.12, startProgress * fullDur);

    progress = startProgress;
    renderProgress(progress);

    startAnim(startProgress, 0, dur, function () {
      if (Affogato.TitleOverlay && Affogato.TitleOverlay.reset) {
        Affogato.TitleOverlay.reset();
      }
      document.body.classList.remove('in-sky-mode');
      canvasEl.classList.remove('is-visible');
      Affogato.SmoothScroll.unlock();
      mode = 'closed';
      progress = 0;
      // Сброс формы — при следующем открытии «написать» юзер должен видеть
      // чистый textarea/email, а не результат предыдущей отправки.
      resetForm();
    });
  }

  // ──────────────── scroll-out из «написать» ──

  function applyScrub(amount) {
    var delta = amount / SCRUB_PX_PER_PROGRESS;
    progress = clamp01(progress + delta);
    renderProgress(progress);
    if (mode === 'open' && shellEl) {
      if (progress >= 1) shellEl.classList.add('is-open');
      else shellEl.classList.remove('is-open');
    }
  }

  function collectReturnScroll(amount) {
    if (mode !== 'open') return;
    var now = performance.now();
    if (!lastReturnScrollAt || now - lastReturnScrollAt > 850) {
      returnScrollDebt = 0;
    }
    lastReturnScrollAt = now;

    if (amount <= 0) {
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

  // Скролл внутри textarea: если у элемента ещё есть, куда скроллить, гасим
  // событие, чтобы оно не уходило в applyScrub и не сворачивало форму.
  function isScrollableTarget(target, deltaY) {
    var el = target;
    while (el && el !== document.body) {
      if (el === formEl || (formEl && formEl.contains(el))) {
        if (el.scrollHeight > el.clientHeight) {
          var atTop = el.scrollTop <= 0;
          var atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight;
          if (deltaY > 0 && !atBottom) return true;
          if (deltaY < 0 && !atTop) return true;
        }
      }
      el = el.parentNode;
    }
    return false;
  }

  function onWheel(e) {
    if (mode !== 'open') return;
    if (isScrollableTarget(e.target, e.deltaY)) return;
    e.preventDefault();
    applyScrub(e.deltaY);
    collectReturnScroll(-e.deltaY);
  }

  function onTouchStart(e) {
    if (mode === 'open' && e.touches && e.touches[0]) {
      touchLastY = e.touches[0].clientY;
    }
  }

  function onTouchMove(e) {
    if (mode !== 'open' || !e.touches || !e.touches[0]) return;
    var y = e.touches[0].clientY;
    var dy = y - touchLastY;
    touchLastY = y;
    if (isScrollableTarget(e.target, -dy)) return;
    if (e.cancelable) e.preventDefault();
    applyScrub(-dy * 2.2);
    collectReturnScroll(dy * 2.2);
  }

  // ─────────────────────────── форма ──

  function onFormSubmit(e) {
    e.preventDefault();
    if (sending) return;
    var message = ((messageEl && messageEl.value) || '').trim();
    if (!message) {
      if (messageEl) messageEl.focus();
      return;
    }

    sending = true;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'отправляется…';
    }
    hideError();

    var fd = new FormData(formEl);
    var email = ((emailEl && emailEl.value) || '').trim();
    if (email) fd.set('_replyto', email);

    sendController = new AbortController();
    fetch(FORMSUBMIT_ENDPOINT, {
      method: 'POST',
      headers: { 'Accept': 'application/json' },
      body: fd,
      signal: sendController.signal,
    }).then(function (res) {
      return res.json().catch(function () { return null; });
    }).then(function (data) {
      if (data && String(data.success) === 'true') {
        showSuccess();
      } else {
        showError((data && data.message) || 'не получилось отправить, попробуй ещё раз');
      }
    }).catch(function (err) {
      // Закрытие модалки прерывает запрос — это не ошибка связи, молчим.
      if (err && err.name === 'AbortError') return;
      showError('нет связи — проверь интернет и попробуй ещё раз');
    }).then(function () {
      sendController = null;
      sending = false;
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'отправить';
      }
    });
  }

  function showSuccess() {
    if (contentEl) contentEl.classList.add('is-sent');
    if (successEl) successEl.hidden = false;
    if (titleEl) titleEl.textContent = TITLE_SENT;
  }

  function showError(text) {
    if (!errorEl) return;
    errorEl.textContent = text;
    errorEl.hidden = false;
  }

  function hideError() {
    if (!errorEl) return;
    errorEl.hidden = true;
    errorEl.textContent = '';
  }

  function resetForm() {
    if (sendController) { sendController.abort(); sendController = null; }
    if (formEl) formEl.reset();
    if (contentEl) contentEl.classList.remove('is-sent');
    if (successEl) successEl.hidden = true;
    if (titleEl) titleEl.textContent = TITLE_DEFAULT;
    hideError();
    sending = false;
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'отправить';
    }
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
    if (formEl) {
      formEl.addEventListener('submit', onFormSubmit);
    }
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
  }

  function init() {
    triggerEl = document.getElementById('sky-trigger');
    returnEl = document.getElementById('sky-return');
    shellEl = document.getElementById('sky-shell');
    panelEl = shellEl ? shellEl.querySelector('.sky-shell__panel') : null;
    contentEl = shellEl ? shellEl.querySelector('.sky-shell__content') : null;
    canvasEl = document.getElementById('sky-overlay');
    loadingEl = document.getElementById('sky-loading');
    formEl = document.getElementById('sky-form');
    emailEl = document.getElementById('sky-form-email');
    messageEl = document.getElementById('sky-form-message');
    submitBtn = formEl ? formEl.querySelector('.sky-form__submit') : null;
    successEl = document.getElementById('sky-form-success');
    errorEl = document.getElementById('sky-form-error');
    titleEl = shellEl ? shellEl.querySelector('.sky-shell__title') : null;
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

  return { init: init, isActive: isActive, prefetch: prefetch };
})();
