// Сцена погружения: рисует кадр секвенции по локальному прогрессу 0..1.
// Контракт сцены: { id, scrollLength, init(), resize(), render(progress, offsetFrac) }.
window.Affogato = window.Affogato || {};
Affogato.Scenes = Affogato.Scenes || {};

Affogato.Scenes.Diving = (function () {
  var canvas, ctx, frames;
  var lastFrame = -1;

  function applySize() {
    // Ограничиваем DPR: исходники 1280px, выше 2x прироста детализации нет.
    var perf = Affogato.Config.performance || {};
    var dpr = Math.min(window.devicePixelRatio || 1, perf.maxDpr || 1.5);
    var w = window.innerWidth;
    var h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.imageSmoothingQuality = 'high';
  }

  // Масштаб вписывания кадра в canvas по принципу cover (без полей).
  function coverScale() {
    var f = Affogato.Config.frames;
    return Math.max(canvas.width / f.width, canvas.height / f.height);
  }

  // Рисует кадр cover'ом внутри панели сцены. offsetFrac — вертикальное смещение
  // панели в долях экрана (0 — на месте, -1 — целиком ушла вверх). fadeOut — плотность
  // затемнения поверх кадра (0..1), уводит конец погружения в фейд перед переходом.
  function drawFrame(img, offsetFrac, fadeOut) {
    var f = Affogato.Config.frames;
    var cw = canvas.width, ch = canvas.height;
    var top = Math.round(offsetFrac * ch);
    var scale = coverScale();
    var dw = f.width * scale, dh = f.height * scale;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, top, cw, ch);
    ctx.clip();
    ctx.drawImage(img, (cw - dw) / 2, top + (ch - dh) / 2, dw, dh);
    if (fadeOut > 0) {
      ctx.fillStyle = 'rgba(0,0,0,' + Math.min(1, fadeOut).toFixed(3) + ')';
      ctx.fillRect(0, top, cw, ch);
    }
    ctx.restore();
  }

  var scene = {
    id: 'diving',
    // getter'ы — чтобы длины фаз можно было крутить вживую (после правки нужен SceneManager.layout());
    // frameIndex удобен для тюнинга — показывает текущий кадр.
    get scrollLength() { return Affogato.Config.scenes.diving.framesVH; },
    get frameIndex() { return lastFrame; },

    init: function (canvasEl, assets) {
      canvas = canvasEl;
      ctx = canvas.getContext('2d');
      frames = assets.frames;
    },

    resize: function () {
      applySize();
    },

    // offsetFrac — вертикальное смещение сцены при переходе (0 — на месте).
    render: function (localProgress, offsetFrac) {
      var cfg = Affogato.Config.scenes.diving;
      var count = frames.length;

      // Нелинейная привязка скролла к кадру: ускорение к концу при живом старте
      // (чистая степень p^k дала бы «мёртвый» старт — скорость 0 при p=0).
      var s = cfg.startSpeed;
      var p = localProgress;
      var eased = s * p + (1 - s) * p * p;
      var idx = Math.round(eased * (count - 1));
      if (idx < 0) idx = 0;
      if (idx > count - 1) idx = count - 1;
      lastFrame = idx;

      // Уводим хвост погружения в темноту, чтобы переход к карточкам не вспыхивал.
      var fadeStart = cfg.fadeOutStart != null ? cfg.fadeOutStart : 0.85;
      var fadeMax = cfg.fadeOutMax != null ? cfg.fadeOutMax : 0.9;
      var fade = 0;
      if (p > fadeStart && fadeStart < 1) {
        fade = ((p - fadeStart) / (1 - fadeStart)) * fadeMax;
      }

      drawFrame(frames[idx], offsetFrac || 0, fade);
      Affogato.TitleOverlay.render(localProgress, offsetFrac || 0);
    },
  };

  return scene;
})();
