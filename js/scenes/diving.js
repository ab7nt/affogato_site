// Сцена погружения: рисует кадр секвенции по локальному прогрессу 0..1.
// Контракт сцены: { id, scrollLength, init(), resize(), render(progress, offsetFrac) }.
window.Affogato = window.Affogato || {};
Affogato.Scenes = Affogato.Scenes || {};

Affogato.Scenes.Diving = (function () {
  var canvas, ctx, frames;
  var lastFrame = -1;

  function applySize() {
    // Ограничиваем DPR: исходники 1280px, выше 2x прироста детализации нет.
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
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
  // панели в долях экрана (0 — на месте, -1 — целиком ушла вверх). Панель ровно
  // в высоту экрана, клип обрезает излишек cover-перекрытия — при переходе сцены
  // стыкуются без зазора и нахлёста.
  function drawFrame(img, offsetFrac) {
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

    hide: function () {
      Affogato.TitleOverlay.hide();
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

      drawFrame(frames[idx], offsetFrac || 0);
      Affogato.TitleOverlay.render(localProgress, offsetFrac || 0);
    },
  };

  return scene;
})();
