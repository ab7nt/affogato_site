// Визуальный подъём к началу: стоп-кадр финального видео уходит вверх,
// затем вода и быстрая обратная прокрутка первой секвенции.
window.Affogato = window.Affogato || {};

Affogato.ReturnAscent = (function () {
  var canvas, ctx;
  var startedAt = 0;
  var duration = 1000;
  var raf = null;
  var sourceVideo = null;
  var divingFrames = null;

  var STONE_END = 0.36;
  var WATER_END = 0.54;

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

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.imageSmoothingQuality = 'high';
  }

  function drawCoverImage(img, y, scaleExtra, alpha, filter) {
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

  function drawDivingReverse(progress) {
    var count = divingFrames ? divingFrames.length : 0;
    var w = canvas.width;
    var h = canvas.height;
    if (!count) {
      drawDarkWater(progress, 1 - progress, 8);
      return;
    }

    var cfg = Affogato.Config.scenes.diving;
    var p = easeOutCubic(progress);
    var forward = 1 - p;
    var easedForward = cfg.startSpeed * forward + (1 - cfg.startSpeed) * forward * forward;
    var idx = Math.round(easedForward * (count - 1));
    if (idx < 0) idx = 0;
    if (idx > count - 1) idx = count - 1;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    drawCoverImage(divingFrames[idx], 0, 1, 1, 'brightness(' + (0.72 + p * 0.28).toFixed(3) + ') contrast(0.95) saturate(0.82)');

    var veil = ctx.createLinearGradient(0, 0, 0, h);
    veil.addColorStop(0, 'rgba(0,0,0,' + (0.22 - p * 0.14).toFixed(3) + ')');
    veil.addColorStop(1, 'rgba(0,0,0,' + (0.52 - p * 0.30).toFixed(3) + ')');
    ctx.fillStyle = veil;
    ctx.fillRect(0, 0, w, h);

    var surface = ctx.createLinearGradient(0, 0, 0, h * 0.28);
    surface.addColorStop(0, 'rgba(128,162,170,' + (p * 0.14).toFixed(3) + ')');
    surface.addColorStop(1, 'rgba(128,162,170,0)');
    ctx.fillStyle = surface;
    ctx.fillRect(0, 0, w, h * 0.28);
  }

  function draw(progress) {
    var w = canvas.width;
    var h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    if (progress < STONE_END) {
      var stoneP = easeInOutCubic(localProgress(progress, 0, STONE_END));
      drawDarkWater(stoneP, 1, 7);

      if (sourceVideo && sourceVideo.readyState >= 2) {
        drawCoverImage(
          sourceVideo,
          -h * 0.9 * stoneP,
          1 + stoneP * 0.04,
          clamp01(0.92 - stoneP * 0.62),
          'brightness(' + (0.78 - stoneP * 0.2).toFixed(3) + ') contrast(0.92) saturate(0.72)'
        );
      }
    } else if (progress < WATER_END) {
      var waterP = easeInOutCubic(localProgress(progress, STONE_END, WATER_END));
      drawDarkWater(waterP, 1 - waterP * 0.32, 9);
    } else {
      drawDivingReverse(localProgress(progress, WATER_END, 1));
    }

    var p = easeInOutCubic(progress);
    var vignette = ctx.createRadialGradient(w * 0.5, h * 0.38, 0, w * 0.5, h * 0.38, h * 0.82);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,' + (0.58 - p * 0.26).toFixed(3) + ')');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);
  }

  function tick() {
    var p = clamp01((performance.now() - startedAt) / duration);
    draw(p);
    if (p < 1) raf = requestAnimationFrame(tick);
  }

  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
  }

  function start(durationSec, videoEl, frames) {
    sourceVideo = videoEl || null;
    if (sourceVideo) sourceVideo.pause();
    divingFrames = frames || null;
    duration = Math.max(0.3, durationSec || 0.8) * 1000;
    startedAt = performance.now();
    resize();
    draw(0);
    canvas.style.transition = 'none';
    canvas.classList.add('visible');
    canvas.offsetHeight; // применяем opacity: 1 до возврата transition
    canvas.style.transition = '';
    if (raf) cancelAnimationFrame(raf);
    tick();
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    sourceVideo = null;
    divingFrames = null;
    canvas.classList.remove('visible');
  }

  return { init: init, start: start, stop: stop };
})();
