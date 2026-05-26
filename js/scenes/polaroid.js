// Сцена песни: потрёпанная полароид-фотокарточка + личный текст справа.
// Карточка «живёт» в воде: дрейфует на подводном фоне.
window.Affogato = window.Affogato || {};
Affogato.Scenes = Affogato.Scenes || {};

// Глобальный трекер положения мыши: pointerenter/mouseenter не срабатывают,
// когда DOM-элемент появляется под неподвижным курсором (смена сцены), поэтому
// каждая карточка при переходе через порог видимости сама проверит rect.
if (!Affogato._cursorTracker) {
  Affogato._cursorTracker = { x: NaN, y: NaN, inside: false };
  window.addEventListener('pointermove', function (e) {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    Affogato._cursorTracker.x = e.clientX;
    Affogato._cursorTracker.y = e.clientY;
    Affogato._cursorTracker.inside = true;
  }, { passive: true });
  document.addEventListener('mouseleave', function () {
    Affogato._cursorTracker.inside = false;
  });
  window.addEventListener('blur', function () {
    Affogato._cursorTracker.inside = false;
  });
}

Affogato.Scenes.createPolaroid = function (item, index) {
  var canvas, ctx, el, polaroidEl, noteEl;
  var cfg = Affogato.Config.scenes.songs;
  var card = cfg.card;
  var hoverCfg = card.hover;
  var shownAt = null;
  // Положение карточки в череде песен: 0 — первая, 1 — последняя. Задаёт глубину
  // подводного света; масштабируется на любое число карточек в config.
  var count = cfg.items.length;
  var depth = count > 1 ? index / (count - 1) : 0;
  var depthStep = count > 1 ? 1 / (count - 1) : 0;
  var driftPhase = index * 1.7; // сдвиг фазы — карточки качаются по-разному

  var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Состояние интерактивного отклика на курсор/палец.
  var hover = {
    targetStrength: 0,
    strength: 0,
    targetX: 0,
    targetY: 0,
    x: 0,
    y: 0,
    rect: null,        // bounding rect кеш — снимаем на enter/activate, чистим на leave/resize
    pressTimer: null,
    pressStartX: 0,
    pressStartY: 0,
    pressActivated: false,
    pointerId: null,
  };

  var lastReveal = 0;
  var prevRevealAboveThreshold = false;

  function clamp01(v) {
    return v < 0 ? 0 : (v > 1 ? 1 : v);
  }

  function transitionOpacity(offsetFrac) {
    if (offsetFrac < 0) return clamp01(1 + offsetFrac);
    if (offsetFrac > 0) return clamp01(1 - offsetFrac);
    return 1;
  }

  // Дрейф элемента: мягкое покачивание по синусам разной частоты —
  // получается органичное «висит в воде», а не движение по кругу.
  function driftTransform(t, phase, transScale, rotScale) {
    var d = card.drift;
    var sp = d.speed;
    var x = Math.sin(t * 0.23 * sp + phase) * d.ampX * transScale;
    var y = Math.sin(t * 0.31 * sp + phase * 1.3) * d.ampY * transScale;
    var r = Math.sin(t * 0.19 * sp + phase * 0.7) * d.ampRot * rotScale;
    return 'translate3d(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px,0) rotate(' +
           r.toFixed(3) + 'deg)';
  }

  function createElement() {
    el = document.createElement('section');
    el.className = 'song-card-scene song-card-scene--variant-' + (index % 3);
    el.innerHTML =
      '<figure class="polaroid">' +
        '<img class="polaroid__image" alt="">' +
      '</figure>' +
      '<div class="song-note">' +
        '<div class="song-note__kicker"></div>' +
        '<h2 class="song-note__title"></h2>' +
        '<p class="song-note__text"></p>' +
      '</div>';

    el.querySelector('.polaroid__image').src = item.cover;
    el.querySelector('.polaroid__image').alt = item.title;
    el.querySelector('.song-note__kicker').textContent = item.year || '';
    el.querySelector('.song-note__title').textContent = item.title;
    el.querySelector('.song-note__text').textContent = item.note;

    polaroidEl = el.querySelector('.polaroid');
    noteEl = el.querySelector('.song-note');
    // URL обложки для маски ::after — экранируем кавычки на всякий случай.
    var safeCover = String(item.cover).replace(/"/g, '%22');
    polaroidEl.style.setProperty('--cover-url', 'url("' + safeCover + '")');
    document.body.appendChild(el);

    attachHoverHandlers();
  }

  function refreshRect() {
    hover.rect = polaroidEl.getBoundingClientRect();
  }

  function updateTargetFromPointer(clientX, clientY) {
    var r = hover.rect;
    if (!r || r.width === 0 || r.height === 0) return;
    var nx = ((clientX - r.left) / r.width  - 0.5) * 2;
    var ny = ((clientY - r.top)  / r.height - 0.5) * 2;
    // клампим в [-1, 1] — при выходе за пределы (rect устарел) угол не «улетает»
    hover.targetX = nx < -1 ? -1 : (nx > 1 ? 1 : nx);
    hover.targetY = ny < -1 ? -1 : (ny > 1 ? 1 : ny);
  }

  function activateHover() {
    hover.targetStrength = 1;
    refreshRect();
  }

  function releaseHover() {
    hover.targetStrength = 0;
    hover.targetX = 0;
    hover.targetY = 0;
    hover.pressActivated = false;
    if (hover.pressTimer !== null) {
      clearTimeout(hover.pressTimer);
      hover.pressTimer = null;
    }
    if (hover.pointerId !== null) {
      try { polaroidEl.releasePointerCapture(hover.pointerId); } catch (e) {}
      hover.pointerId = null;
    }
    polaroidEl.style.touchAction = '';
  }

  function attachHoverHandlers() {
    polaroidEl.addEventListener('pointerenter', function (e) {
      if (e.pointerType !== 'mouse') return;
      if (lastReveal < hoverCfg.revealThreshold) return;
      activateHover();
      updateTargetFromPointer(e.clientX, e.clientY);
    });

    polaroidEl.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'mouse') {
        if (hover.targetStrength === 0) return;
        updateTargetFromPointer(e.clientX, e.clientY);
        return;
      }
      // touch / pen
      if (hover.pressTimer !== null && !hover.pressActivated) {
        var dx = e.clientX - hover.pressStartX;
        var dy = e.clientY - hover.pressStartY;
        if (dx * dx + dy * dy > hoverCfg.touchMoveCancelPx * hoverCfg.touchMoveCancelPx) {
          clearTimeout(hover.pressTimer);
          hover.pressTimer = null;
        }
        return;
      }
      if (hover.pressActivated) {
        updateTargetFromPointer(e.clientX, e.clientY);
      }
    });

    polaroidEl.addEventListener('pointerleave', function (e) {
      if (e.pointerType !== 'mouse') return;
      releaseHover();
    });

    polaroidEl.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse') return;
      if (lastReveal < hoverCfg.revealThreshold) return;
      hover.pressStartX = e.clientX;
      hover.pressStartY = e.clientY;
      hover.pointerId = e.pointerId;
      if (hover.pressTimer !== null) clearTimeout(hover.pressTimer);
      hover.pressTimer = setTimeout(function () {
        hover.pressTimer = null;
        hover.pressActivated = true;
        // Захватываем pointer, чтобы дальнейшие move/up шли к элементу,
        // и отключаем browser-pan, чтобы скролл не уводил жест.
        try { polaroidEl.setPointerCapture(hover.pointerId); } catch (e2) {}
        polaroidEl.style.touchAction = 'none';
        activateHover();
        updateTargetFromPointer(hover.pressStartX, hover.pressStartY);
      }, hoverCfg.longPressMs);
    });

    polaroidEl.addEventListener('pointerup', function (e) {
      if (e.pointerType === 'mouse') return;
      releaseHover();
    });
    polaroidEl.addEventListener('pointercancel', function () {
      releaseHover();
    });

    window.addEventListener('resize', function () { hover.rect = null; });
    window.addEventListener('scroll', function () { hover.rect = null; }, true);
  }

  return {
    id: 'song-' + index,
    get scrollLength() { return cfg.scrollVH; },

    init: function (canvasEl) {
      canvas = canvasEl;
      ctx = canvas.getContext('2d');
      createElement();
    },

    resize: function () {},

    hide: function () {
      shownAt = null;
      lastReveal = 0;
      prevRevealAboveThreshold = false;
      releaseHover();
      // Без переходов снимаем эффект, чтобы скрытая карточка не светилась под пальцем
      hover.strength = 0;
      hover.x = 0;
      hover.y = 0;
      if (polaroidEl) {
        polaroidEl.classList.remove('is-tilting');
        polaroidEl.style.setProperty('--tilt-strength', 0);
      }
      if (el) {
        el.style.opacity = 0;
        el.style.display = 'none'; // скрытую карточку не рендерим
      }
    },

    render: function (localProgress, offsetFrac) {
      if (shownAt === null) shownAt = performance.now();
      el.style.display = '';

      var offset = offsetFrac || 0;
      // При входе карточки (offset > 0) интерполируем глубину от предыдущей сцены
      // к собственной: свет меняется без скачка. Для первой карточки «предыдущая»
      // считается глубокой (1) — иначе верх воды резко светлеет на стыке с погружением.
      var prevDepth = index === 0 ? 1 : depth - depthStep;
      var effDepth = offset > 0 ? (prevDepth + (depth - prevDepth) * (1 - offset)) : depth;
      Affogato.UnderwaterBg.render(ctx, canvas.width, canvas.height, effDepth);

      var elapsedSec = (performance.now() - shownAt) / 1000;
      var revealOpacity = clamp01(elapsedSec / (cfg.fadeInSec || 0.55));
      lastReveal = revealOpacity;
      // Если карточка ушла за пределы видимости — гасим активный hover,
      // чтобы при возвращении эффект стартовал с нуля.
      if (revealOpacity < hoverCfg.revealThreshold && hover.targetStrength !== 0) {
        releaseHover();
      }

      // При появлении новой карточки под уже стоящим курсором pointerenter
      // не выстрелит сам по себе. Как только revealOpacity переходит порог снизу
      // вверх — проверяем глобальную позицию мыши и активируем эффект, если
      // курсор внутри bounding-box карточки.
      var nowAbove = revealOpacity >= hoverCfg.revealThreshold;
      if (nowAbove && !prevRevealAboveThreshold) {
        var tracker = Affogato._cursorTracker;
        if (tracker && tracker.inside && !isNaN(tracker.x)) {
          var r = polaroidEl.getBoundingClientRect();
          if (tracker.x >= r.left && tracker.x <= r.right &&
              tracker.y >= r.top  && tracker.y <= r.bottom) {
            hover.rect = r;
            hover.targetStrength = 1;
            updateTargetFromPointer(tracker.x, tracker.y);
          }
        }
      }
      prevRevealAboveThreshold = nowAbove;

      // Плавное схождение к таргету — выполняется в общем render-цикле, без новых RAF.
      var ls = hoverCfg.lerpSpeed;
      hover.strength += (hover.targetStrength - hover.strength) * ls;
      hover.x += (hover.targetX - hover.x) * ls;
      hover.y += (hover.targetY - hover.y) * ls;
      if (hover.strength < 0.001) hover.strength = 0;

      var opacity = transitionOpacity(offset) * revealOpacity;
      var y = offset * 100 + (0.5 - localProgress) * 7;
      el.style.opacity = opacity.toFixed(3);
      el.style.transform = 'translate3d(-50%, ' + y.toFixed(2) + 'vh, 0)';

      // При hover яркость восстанавливается к 100%; текст не реагирует.
      var effCardOpacity = card.cardOpacity + (1 - card.cardOpacity) * hover.strength;
      polaroidEl.style.opacity = effCardOpacity;
      noteEl.style.opacity = card.textOpacity;

      // Транформ: дрейф снаружи + tilt/scale в локальной системе карточки.
      var t = performance.now() / 1000;
      var driftStr = driftTransform(t, driftPhase, 1, 1);
      var tiltStr = '';
      if (!reducedMotion && hover.strength > 0) {
        var rotY = hover.x * hoverCfg.maxAngle * hover.strength;
        var rotX = -hover.y * hoverCfg.maxAngle * hover.strength;
        tiltStr = ' perspective(900px) rotateY(' + rotY.toFixed(3) + 'deg) rotateX(' +
                  rotX.toFixed(3) + 'deg)';
      }
      var sc = 1 + (hoverCfg.scaleMax - 1) * hover.strength;
      polaroidEl.style.transform = driftStr + tiltStr + ' scale(' + sc.toFixed(4) + ')';

      // Свето-теневой ::after: рендерим только во время активного hover (через класс),
      // чтобы прямоугольный composite-слой не подсвечивал фон вокруг потёртой polaroid-формы.
      if (hover.strength > 0) {
        var angDeg = Math.atan2(hover.y, hover.x) * 180 / Math.PI;
        polaroidEl.style.setProperty('--tilt-angle', angDeg.toFixed(1) + 'deg');
        polaroidEl.style.setProperty('--tilt-strength', (hover.strength * hoverCfg.gradientMax).toFixed(3));
        if (!polaroidEl.classList.contains('is-tilting')) {
          polaroidEl.classList.add('is-tilting');
        }
      } else if (polaroidEl.classList.contains('is-tilting')) {
        polaroidEl.classList.remove('is-tilting');
        polaroidEl.style.setProperty('--tilt-strength', 0);
      }
    },
  };
};
