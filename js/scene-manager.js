// Таймлайн сцен: переводит сглаженный скролл (px) в активную сцену + её локальный
// прогресс. На стыке двух сцен — быстрый вертикальный переход: обе сцены едут
// одновременно (уходящая вверх, приходящая снизу).
window.Affogato = window.Affogato || {};

Affogato.SceneManager = (function () {
  var scenes = [];
  var viewportH = Affogato.Viewport.height();

  function register(scene) {
    scenes.push(scene);
  }

  function sceneIndex(id) {
    for (var i = 0; i < scenes.length; i++) {
      if (scenes[i].id === id) return i;
    }
    return -1;
  }

  // Длина перехода между сценами в px (из конфига — правится вживую).
  function transitionPx() {
    return Affogato.Config.scroll.transitionVH * viewportH;
  }

  function totalScrollPx() {
    var sum = 0;
    for (var i = 0; i < scenes.length; i++) {
      sum += scenes[i].scrollLength * viewportH;
    }
    if (scenes.length > 1) sum += (scenes.length - 1) * transitionPx();
    return sum;
  }

  function transitionRange(index) {
    var offset = 0;
    for (var i = 0; i < scenes.length; i++) {
      var sceneLen = scenes[i].scrollLength * viewportH;
      if (i === index) {
        return {
          start: offset + sceneLen,
          end: offset + sceneLen + transitionPx(),
        };
      }
      offset += sceneLen + transitionPx();
    }
    return null;
  }

  // Высота body задаёт диапазон нативного скролла:
  // суммарная длина сцен и переходов + один экран.
  // Размеры берём из стабильного Affogato.Viewport, иначе на iOS Safari
  // body «дышит» вместе с адресной строкой и сцены прыгают на каждом скролле.
  function layout() {
    viewportH = Affogato.Viewport.height();
    document.body.style.height = (totalScrollPx() + viewportH) + 'px';
    for (var i = 0; i < scenes.length; i++) {
      if (scenes[i].resize) scenes[i].resize(Affogato.Viewport.width(), viewportH);
    }
  }

  var clamp01 = Affogato.Utils.clamp01;

  function hideInactive(activeIndexes) {
    for (var i = 0; i < scenes.length; i++) {
      if (activeIndexes.indexOf(i) === -1 && scenes[i].hide) scenes[i].hide();
    }
  }

  // Рисует сцену под текущим скроллом. Внутри сцены offsetFrac = 0.
  // В окне перехода обе соседние сцены рисуются со смещением offsetFrac
  // (в долях экрана: 0 — на месте, -1 — целиком ушла вверх, +1 — ждёт снизу).
  function render(scrollPx) {
    var offset = 0;
    var transPx = transitionPx();
    for (var i = 0; i < scenes.length; i++) {
      var sceneLen = scenes[i].scrollLength * viewportH;
      var isLast = (i === scenes.length - 1);

      // Внутри самой сцены i.
      if (scrollPx < offset + sceneLen || isLast) {
        var local = sceneLen > 0 ? clamp01((scrollPx - offset) / sceneLen) : 0;
        hideInactive([i]);
        scenes[i].render(local, 0);
        return;
      }
      offset += sceneLen;

      // Окно перехода между сценой i и i+1 — обе едут вверх одновременно.
      if (scrollPx < offset + transPx) {
        var t = transPx > 0 ? clamp01((scrollPx - offset) / transPx) : 1;
        hideInactive([i, i + 1]);
        scenes[i].render(1, -t);          // уходящая:   0 → -1
        scenes[i + 1].render(0, 1 - t);   // приходящая: +1 → 0
        return;
      }
      offset += transPx;
    }
  }

  return {
    register: register,
    layout: layout,
    render: render,
    transitionRange: transitionRange,
    sceneIndex: sceneIndex,
  };
})();
