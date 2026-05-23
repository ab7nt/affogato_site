// Стабильный источник размеров viewport. window.innerHeight в iOS Safari
// «дышит» при показе/скрытии адресной строки — это меняет canvas, body height
// и положения сцен на каждом скролле, отсюда мигания и дёрганье на стыках.
//
// Этот модуль кэширует размеры и пересчитывает их ТОЛЬКО при реальном resize:
// — любое изменение ширины,
// — изменение высоты больше 25% от базовой (поворот / реальный resize окна).
// Малые колебания высоты (UI-bar) игнорируются полностью.
window.Affogato = window.Affogato || {};

Affogato.Viewport = (function () {
  var w = window.innerWidth;
  var h = window.innerHeight;
  // Доля изменения высоты, начиная с которой считаем resize реальным.
  // 25% покрывает любую адресную строку (обычно 8–15% высоты экрана).
  var H_TOLERANCE = 0.25;
  var listeners = [];

  function poll() {
    var newW = window.innerWidth;
    var newH = window.innerHeight;
    var widthChanged = Math.abs(newW - w) > 2;
    var heightChanged = Math.abs(newH - h) > h * H_TOLERANCE;
    if (!widthChanged && !heightChanged) return;
    w = newW;
    h = newH;
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](); } catch (e) { /* listener сам логирует */ }
    }
  }

  window.addEventListener('resize', poll);
  // orientationchange приходит до resize и иногда без него — слушаем оба.
  window.addEventListener('orientationchange', function () {
    // Дать iOS Safari устаканить новый innerHeight после поворота.
    window.setTimeout(poll, 60);
  });

  return {
    width: function () { return w; },
    height: function () { return h; },
    onChange: function (fn) { listeners.push(fn); },
  };
})();
