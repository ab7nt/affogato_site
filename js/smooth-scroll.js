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
  var nativeScrollBlocked = false;
  var scrollReadyAt = 0; // grace-период после разблокировки — игнор отложенных scroll-event
  var lockedScrollY = 0; // nativeY на момент блокировки — для восстановления при unblock

  function readTarget() {
    if (ignoreProgrammaticScroll) return;
    if (lockedAt !== null) return;
    if (autoTransition) return; // во время автоперехода нативный target нас не интересует
    if (performance.now() < scrollReadyAt) return; // отсекаем «эхо» iOS Safari
    target = window.scrollY || window.pageYOffset || 0;
  }

  // Блокировка нативного скролла на время автоперехода и locked-state плеера.
  // Без неё iOS Safari продолжает свою touch-инерцию параллельно и конфликтует
  // с syncNativeScroll() — отсюда «неадекватный» скролл при смене сцен.
  function preventNativeScroll(e) {
    if (!nativeScrollBlocked) return;
    if (e.cancelable) e.preventDefault();
  }

  // position:fixed на body — единственный способ мгновенно остановить идущую
  // touch-инерцию в iOS Safari. touch-action: none и preventDefault на touchmove
  // блокируют только новые жесты; уже стартовавшая инерция идёт без touchmove
  // и преспокойно конфликтует с нашим autoTransition.
  function blockNativeScroll() {
    if (nativeScrollBlocked) return;
    nativeScrollBlocked = true;
    lockedScrollY = window.scrollY || window.pageYOffset || 0;
    var bodyStyle = document.body.style;
    bodyStyle.position = 'fixed';
    bodyStyle.top = (-lockedScrollY) + 'px';
    bodyStyle.left = '0';
    bodyStyle.right = '0';
    bodyStyle.width = '100%';
    document.body.classList.add('scroll-locked');
    window.addEventListener('touchmove', preventNativeScroll, { passive: false });
    window.addEventListener('wheel', preventNativeScroll, { passive: false });
  }

  function unblockNativeScroll(restoreToY) {
    if (!nativeScrollBlocked) return;
    nativeScrollBlocked = false;
    var bodyStyle = document.body.style;
    bodyStyle.position = '';
    bodyStyle.top = '';
    bodyStyle.left = '';
    bodyStyle.right = '';
    bodyStyle.width = '';
    document.body.classList.remove('scroll-locked');
    window.removeEventListener('touchmove', preventNativeScroll);
    window.removeEventListener('wheel', preventNativeScroll);

    // Восстанавливаем nativeY на конечной позиции (после автоперехода — `to`).
    var y = typeof restoreToY === 'number' ? restoreToY : lockedScrollY;
    ignoreProgrammaticScroll = true;
    window.scrollTo(0, y);
    ignoreProgrammaticScroll = false;

    // iOS Safari присылает scroll-event с задержкой — после restore может
    // прилететь «эхо» со старой позицией. Игнорируем такие события ~280мс.
    scrollReadyAt = performance.now() + 280;
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
    var nativeY = window.scrollY || window.pageYOffset || 0;
    if (Math.abs(nativeY - value) < 0.5) return;
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
    blockNativeScroll(); // мгновенно гасит идущую touch-инерцию iOS
  }

  function scrollTo(value, durationSec) {
    startAutoTransition(current, value, durationSec);
  }

  function jumpTo(value) {
    lockedAt = null;
    autoTransition = null;
    current = value;
    target = value;
    if (nativeScrollBlocked) {
      unblockNativeScroll(value);
    } else {
      syncNativeScroll(value);
    }
  }

  function lockAtCurrent() {
    lockedAt = current;
    target = current;
    blockNativeScroll();
  }

  function unlock() {
    lockedAt = null;
    unblockNativeScroll(current);
    readTarget();
  }

  function maybeStartAutoTransition() {
    if (autoTransition) return;
    if (!autoTransitionProvider) return;

    var ranges = autoTransitionProvider();
    if (!ranges) return;
    if (!Array.isArray(ranges)) ranges = [ranges];

    // Мёртвая зона у границ: после автоперехода current стоит ровно на границе,
    // а target из-за суб-пиксельного округления нативного скролла чуть «дрожит».
    // Без зоны это запускало мгновенный переход в обратную сторону — дёрганье карточек.
    var EDGE_EPS = 2;

    for (var i = 0; i < ranges.length; i++) {
      var range = ranges[i];
      if (!range || range.end <= range.start) continue;

      var inRange = target > range.start + EDGE_EPS && target < range.end - EDGE_EPS;
      var fromTop = current <= range.start && target > range.start + EDGE_EPS;
      var fromBottom = current >= range.end && target < range.end - EDGE_EPS;

      // from = current, а не граница range: иначе сглаженная позиция, в которую
      // юзер уже частично «зашёл», откатывается назад в начале перехода —
      // визуально это и есть дёрганье на стыке сцен.
      var dur = range.durationSec || Affogato.Config.scroll.autoTransitionSec;
      if (fromTop || (inRange && target >= current)) {
        startAutoTransition(current, range.end, dur);
        return;
      } else if (fromBottom || (inRange && target < current)) {
        startAutoTransition(current, range.start, dur);
        return;
      }
    }
  }

  // Вызывается каждый кадр главного цикла, возвращает сглаженную позицию (px).
  // syncNativeScroll каждый кадр НЕ зовём — в iOS Safari он конфликтует с
  // нативной touch-инерцией, давая дёрганье. Синхронизируемся однократно
  // в начале (blockNativeScroll + syncNativeScroll) и при завершении.
  function update() {
    if (lockedAt !== null) {
      current = lockedAt;
      target = lockedAt;
      return current;
    }

    maybeStartAutoTransition();

    if (autoTransition) {
      var elapsed = performance.now() - autoTransition.startedAt;
      var p = elapsed / autoTransition.duration;
      if (p >= 1) {
        current = autoTransition.to;
        target = autoTransition.to;
        autoTransition = null;
        // unblock сам восстановит nativeY на `current` — отдельный sync не нужен.
        unblockNativeScroll(current);
        return current;
      }

      var k = easeInOutCubic(p);
      current = autoTransition.from + (autoTransition.to - autoTransition.from) * k;
      target = current;
      return current;
    }

    current += (target - current) * ease;
    // Защёлкиваем у цели, чтобы не крутить бесконечный микро-лёрп.
    if (Math.abs(target - current) < 0.05) current = target;
    return current;
  }

  function getState() {
    return {
      target: target,
      current: current,
      autoTransitioning: !!autoTransition,
      locked: lockedAt !== null,
    };
  }

  return {
    init: init,
    update: update,
    jumpTo: jumpTo,
    lockAtCurrent: lockAtCurrent,
    unlock: unlock,
    scrollTo: scrollTo,
    setAutoTransitionProvider: setAutoTransitionProvider,
    getState: getState,
  };
})();
