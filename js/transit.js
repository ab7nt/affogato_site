// Переход между основной частью сайта и плеером, в обе стороны:
// • направление 'up'   — всплытие (после финального видео или из плеера к началу)
// • направление 'down' — погружение (по клику «послушать» к стоп-кадру со дна)
// После 'down' canvas остаётся видимым в idle-режиме: стоп-кадр + лёгкая взвесь,
// чтобы фоном плеера дышала вода.
window.Affogato = window.Affogato || {};

Affogato.Transit = (function () {
  var canvas, ctx;
  var startedAt = 0;
  var duration = 1000;
  var raf = null;
  var direction = 'up';
  var stoneSource = null;
  var divingFrames = null;
  var phase = 'idle'; // 'idle' | 'animating' | 'idle-after-descent' | 'finished'
  var lastIdleDrawAt = 0;
  var onProgress = null;

  // Опорные точки фаз для 'up' (как в исходной всплытой анимации):
  // 0…STONE_END — камень уезжает вверх; STONE_END…WATER_END — тёмная вода;
  // WATER_END…1 — обратная прокрутка погружения. Для 'down' — зеркало.
  var STONE_END = 0.36;
  var WATER_END = 0.54;
  var DIVE_END_DOWN = 1 - WATER_END;  // 0.46
  var WATER_END_DOWN = 1 - STONE_END; // 0.64

  function clamp01(v) {
    return v < 0 ? 0 : (v > 1 ? 1 : v);
  }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function localProgress(progress, from, to) {
    return clamp01((progress - from) / (to - from));
  }

  function isImageReady(img) {
    if (!img) return false;
    if (img.readyState !== undefined) return img.readyState >= 2; // <video>
    return img.complete && (img.naturalWidth || img.width); // <img>
  }

  function resize() {
    var perf = Affogato.Config.performance || {};
    var dpr = Math.min(window.devicePixelRatio || 1, perf.maxDpr || 1.5);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.imageSmoothingQuality = 'high';
  }

  function drawCoverImage(img, y, scaleExtra, alpha, filter) {
    if (!isImageReady(img)) return;
    var w = canvas.width;
    var h = canvas.height;
    var iw = img.videoWidth || img.naturalWidth || img.width || w;
    var ih = img.videoHeight || img.naturalHeight || img.height || h;
    var scale = Math.max(w / iw, h / ih) * (scaleExtra || 1);
    var dw = iw * scale;
    var dh = ih * scale;

    ctx.save();
    ctx.globalAlpha = alpha;
    if (filter) ctx.filter = filter;
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2 + y, dw, dh);
    ctx.restore();
  }

  function drawDarkWater(progress, depth, speed) {
    var w = canvas.width;
    var h = canvas.height;

    Affogato.UnderwaterBg.render(ctx, w, h, depth, speed);

    var shade = ctx.createLinearGradient(0, 0, 0, h);
    shade.addColorStop(0, 'rgba(0,0,0,' + (0.42 + progress * 0.24).toFixed(3) + ')');
    shade.addColorStop(1, 'rgba(0,0,0,' + (0.62 + progress * 0.22).toFixed(3) + ')');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, w, h);

    var lift = ctx.createLinearGradient(0, 0, 0, h * 0.42);
    lift.addColorStop(0, 'rgba(86,120,132,' + (0.04 + progress * 0.05).toFixed(3) + ')');
    lift.addColorStop(1, 'rgba(86,120,132,0)');
    ctx.fillStyle = lift;
    ctx.fillRect(0, 0, w, h * 0.42);
  }

  // forwardness 0…1 — позиция в погружении: 0 = первый кадр (поверхность), 1 = последний (глубина).
  function drawDivingFrame(forwardness) {
    var count = divingFrames ? divingFrames.length : 0;
    var w = canvas.width;
    var h = canvas.height;
    if (!count) {
      drawDarkWater(1 - forwardness, forwardness, 8);
      return;
    }

    var cfg = Affogato.Config.scenes.diving;
    var eased = cfg.startSpeed * forwardness + (1 - cfg.startSpeed) * forwardness * forwardness;
    var idx = Math.round(eased * (count - 1));
    if (idx < 0) idx = 0;
    if (idx > count - 1) idx = count - 1;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    drawCoverImage(divingFrames[idx], 0, 1, 1);

    var fadeStart = cfg.fadeOutStart != null ? cfg.fadeOutStart : 0.85;
    var fadeMax = cfg.fadeOutMax != null ? cfg.fadeOutMax : 0.9;
    if (forwardness > fadeStart && fadeStart < 1) {
      var fade = ((forwardness - fadeStart) / (1 - fadeStart)) * fadeMax;
      ctx.fillStyle = 'rgba(0,0,0,' + Math.min(1, fade).toFixed(3) + ')';
      ctx.fillRect(0, 0, w, h);
    }
  }

  // 'up'-фаза: камень уезжает вверх, постепенно теряя яркость.
  function drawStoneFloatingUp(stoneP) {
    var h = canvas.height;
    drawCoverImage(
      stoneSource,
      -h * 0.9 * stoneP,
      1 + stoneP * 0.04,
      clamp01(0.92 - stoneP * 0.62),
      'brightness(' + (0.78 - stoneP * 0.2).toFixed(3) + ') contrast(0.92) saturate(0.72)'
    );
  }

  // 'down'-фаза: камень поднимается снизу, устанавливается в центре и проявляется.
  function drawStoneArriving(stoneP) {
    var h = canvas.height;
    var p = 1 - stoneP; // stoneP=0 — далеко снизу; stoneP=1 — на месте.
    drawCoverImage(
      stoneSource,
      h * 0.9 * p,
      1 + p * 0.04,
      clamp01(0.92 - p * 0.62),
      'brightness(' + (0.78 - p * 0.2).toFixed(3) + ') contrast(0.92) saturate(0.72)'
    );
  }

  function drawVignette(progress) {
    var w = canvas.width;
    var h = canvas.height;
    var p = easeInOutCubic(progress);
    var vignette = ctx.createRadialGradient(w * 0.5, h * 0.38, 0, w * 0.5, h * 0.38, h * 0.82);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,' + (0.58 - p * 0.26).toFixed(3) + ')');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);
  }

  function drawAscent(progress) {
    if (progress < STONE_END) {
      var stoneP = easeInOutCubic(localProgress(progress, 0, STONE_END));
      drawDarkWater(stoneP, 1, 7);
      drawStoneFloatingUp(stoneP);
    } else if (progress < WATER_END) {
      var waterP = easeInOutCubic(localProgress(progress, STONE_END, WATER_END));
      drawDarkWater(waterP, 1 - waterP * 0.32, 9);
    } else {
      var p = easeOutCubic(localProgress(progress, WATER_END, 1));
      drawDivingFrame(1 - p);
    }
    drawVignette(progress);
  }

  function drawDescent(progress) {
    if (progress < DIVE_END_DOWN) {
      var p = easeOutCubic(localProgress(progress, 0, DIVE_END_DOWN));
      drawDivingFrame(p);
    } else if (progress < WATER_END_DOWN) {
      var waterP = easeInOutCubic(localProgress(progress, DIVE_END_DOWN, WATER_END_DOWN));
      drawDarkWater(waterP, 1 - (1 - waterP) * 0.32, 9);
    } else {
      var stoneP = easeInOutCubic(localProgress(progress, WATER_END_DOWN, 1));
      drawDarkWater(1, 1, 7);
      drawStoneArriving(stoneP);
    }
    drawVignette(progress);
  }

  // Idle-кадр между погружением и всплытием: стоп-кадр со дна + лёгкая взвесь.
  // Без лучей и нижнего свечения — фон плеера держится спокойным.
  function drawIdleStone() {
    var w = canvas.width;
    var h = canvas.height;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    drawCoverImage(stoneSource, 0, 1, 1, 'brightness(0.78) contrast(0.92) saturate(0.72)');
    if (Affogato.UnderwaterBg.renderParticles) {
      Affogato.UnderwaterBg.renderParticles(ctx, w, h);
    }
    drawVignette(1);
  }

  function tick(timestamp) {
    var now = typeof timestamp === 'number' ? timestamp : performance.now();
    if (phase === 'animating') {
      var p = clamp01((now - startedAt) / duration);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (direction === 'down') drawDescent(p);
      else drawAscent(p);
      if (onProgress) onProgress(p, direction);

      if (p < 1) {
        raf = requestAnimationFrame(tick);
      } else if (direction === 'down') {
        phase = 'idle-after-descent';
        raf = requestAnimationFrame(tick);
      } else {
        phase = 'finished'; // последний кадр всплытия зависает до stop()
      }
    } else if (phase === 'idle-after-descent') {
      var perf = Affogato.Config.performance || {};
      var idleInterval = 1000 / (perf.transitIdleFps || 24);
      if (!lastIdleDrawAt || now - lastIdleDrawAt >= idleInterval) {
        lastIdleDrawAt = now;
        drawIdleStone();
      }
      raf = requestAnimationFrame(tick);
    }
  }

  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
  }

  // start(direction, durationSec, opts):
  //   opts.stoneImage — <img> со дна (для 'down' и для 'up' из плеера),
  //   opts.videoEl    — <video> финальной сцены (для 'up' после видео),
  //   opts.frames     — массив <img> кадров погружения.
  function start(dir, durationSec, opts) {
    direction = (dir === 'down') ? 'down' : 'up';
    opts = opts || {};
    stoneSource = opts.videoEl || opts.stoneImage || stoneSource;
    if (opts.videoEl && opts.videoEl.pause) opts.videoEl.pause();
    if (opts.frames) divingFrames = opts.frames;
    onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;

    duration = Math.max(0.3, durationSec || 0.8) * 1000;
    startedAt = performance.now();
    lastIdleDrawAt = 0;
    phase = 'animating';
    resize();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (direction === 'down') drawDescent(0);
    else drawAscent(0);

    canvas.style.transition = 'none';
    canvas.classList.add('visible');
    canvas.offsetHeight; // флашим opacity:1 до возврата transition
    canvas.style.transition = '';

    if (raf) cancelAnimationFrame(raf);
    tick();
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    phase = 'idle';
    stoneSource = null;
    onProgress = null;
    canvas.classList.remove('visible');
  }

  return { init: init, start: start, stop: stop };
})();
