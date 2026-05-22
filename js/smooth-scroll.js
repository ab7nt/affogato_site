// Инерционный скролл: нативный scrollY — это таргет, а сглаженное значение
// плавно подтягивается к нему каждый кадр rAF. Отставание = ощущение инерции.
window.Affogato = window.Affogato || {};

Affogato.SmoothScroll = (function () {
  var target = 0;
  var current = 0;
  var ease = 0.09;
  var autoTransitionProvider = null;
  var autoTransition = null;
  var ignoreProgrammaticScroll = false;

  function readTarget() {
    if (ignoreProgrammaticScroll) return;
    target = window.scrollY || window.pageYOffset || 0;
  }

  function init(opts) {
    if (opts && typeof opts.ease === 'number') ease = opts.ease;
    readTarget();
    current = target;
    window.addEventListener('scroll', readTarget, { passive: true });
  }

  function setAutoTransitionProvider(provider) {
    autoTransitionProvider = provider;
  }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function syncNativeScroll(value) {
    ignoreProgrammaticScroll = true;
    window.scrollTo(0, value);
    ignoreProgrammaticScroll = false;
  }

  function startAutoTransition(from, to, durationSec) {
    autoTransition = {
      from: from,
      to: to,
      duration: Math.max(0.1, durationSec || 0.9) * 1000,
      startedAt: performance.now(),
    };
    current = from;
    target = from;
    syncNativeScroll(from);
  }

  function maybeStartAutoTransition() {
    if (autoTransition) return;
    if (!autoTransitionProvider) return;

    var range = autoTransitionProvider();
    if (!range || range.end <= range.start) return;

    var inRange = target > range.start && target < range.end;
    var fromTop = current <= range.start && target > range.start;
    var fromBottom = current >= range.end && target < range.end;

    if (fromTop || (inRange && target >= current)) {
      startAutoTransition(range.start, range.end, Affogato.Config.scroll.autoTransitionSec);
    } else if (fromBottom || (inRange && target < current)) {
      startAutoTransition(range.end, range.start, Affogato.Config.scroll.autoTransitionSec);
    }
  }

  // Вызывается каждый кадр главного цикла, возвращает сглаженную позицию (px).
  function update() {
    maybeStartAutoTransition();

    if (autoTransition) {
      var elapsed = performance.now() - autoTransition.startedAt;
      var p = elapsed / autoTransition.duration;
      if (p >= 1) {
        current = autoTransition.to;
        target = autoTransition.to;
        syncNativeScroll(autoTransition.to);
        autoTransition = null;
        return current;
      }

      var k = easeInOutCubic(p);
      current = autoTransition.from + (autoTransition.to - autoTransition.from) * k;
      target = current;
      syncNativeScroll(current);
      return current;
    }

    current += (target - current) * ease;
    // Защёлкиваем у цели, чтобы не крутить бесконечный микро-лёрп.
    if (Math.abs(target - current) < 0.05) current = target;
    return current;
  }

  return { init: init, update: update, setAutoTransitionProvider: setAutoTransitionProvider };
})();
