// Инерционный скролл: нативный scrollY — это таргет, а сглаженное значение
// плавно подтягивается к нему каждый кадр rAF. Отставание = ощущение инерции.
window.Affogato = window.Affogato || {};

Affogato.SmoothScroll = (function () {
  var target = 0;
  var current = 0;
  var ease = 0.09;
  var autoTransitionProvider = null;
  var autoTransition = null;
  var lockedAt = null;
  var ignoreProgrammaticScroll = false;

  function readTarget() {
    if (ignoreProgrammaticScroll) return;
    if (lockedAt !== null) return;
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
    lockedAt = null;
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

  function scrollTo(value, durationSec) {
    startAutoTransition(current, value, durationSec);
  }

  function jumpTo(value) {
    lockedAt = null;
    autoTransition = null;
    current = value;
    target = value;
    syncNativeScroll(value);
  }

  function lockAtCurrent() {
    lockedAt = current;
    target = current;
    syncNativeScroll(current);
  }

  function unlock() {
    lockedAt = null;
    readTarget();
  }

  function maybeStartAutoTransition() {
    if (autoTransition) return;
    if (!autoTransitionProvider) return;

    var ranges = autoTransitionProvider();
    if (!ranges) return;
    if (!Array.isArray(ranges)) ranges = [ranges];

    for (var i = 0; i < ranges.length; i++) {
      var range = ranges[i];
      if (!range || range.end <= range.start) continue;

      var inRange = target > range.start && target < range.end;
      var fromTop = current <= range.start && target > range.start;
      var fromBottom = current >= range.end && target < range.end;

      if (fromTop || (inRange && target >= current)) {
        startAutoTransition(range.start, range.end, range.durationSec || Affogato.Config.scroll.autoTransitionSec);
        return;
      } else if (fromBottom || (inRange && target < current)) {
        startAutoTransition(range.end, range.start, range.durationSec || Affogato.Config.scroll.autoTransitionSec);
        return;
      }
    }
  }

  // Вызывается каждый кадр главного цикла, возвращает сглаженную позицию (px).
  function update() {
    if (lockedAt !== null) {
      current = lockedAt;
      target = lockedAt;
      syncNativeScroll(lockedAt);
      return current;
    }

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

  return {
    init: init,
    update: update,
    jumpTo: jumpTo,
    lockAtCurrent: lockAtCurrent,
    unlock: unlock,
    scrollTo: scrollTo,
    setAutoTransitionProvider: setAutoTransitionProvider,
  };
})();
