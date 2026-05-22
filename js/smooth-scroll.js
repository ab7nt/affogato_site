// Инерционный скролл: нативный scrollY — это таргет, а сглаженное значение
// плавно подтягивается к нему каждый кадр rAF. Отставание = ощущение инерции.
window.Affogato = window.Affogato || {};

Affogato.SmoothScroll = (function () {
  var target = 0;
  var current = 0;
  var ease = 0.09;

  function readTarget() {
    target = window.scrollY || window.pageYOffset || 0;
  }

  function init(opts) {
    if (opts && typeof opts.ease === 'number') ease = opts.ease;
    readTarget();
    current = target;
    window.addEventListener('scroll', readTarget, { passive: true });
  }

  // Вызывается каждый кадр главного цикла, возвращает сглаженную позицию (px).
  function update() {
    current += (target - current) * ease;
    // Защёлкиваем у цели, чтобы не крутить бесконечный микро-лёрп.
    if (Math.abs(target - current) < 0.05) current = target;
    return current;
  }

  return { init: init, update: update };
})();
