// Бутстрап: предзагрузка кадров → инициализация сцен → главный rAF-цикл.
(function () {
  // Отключаем восстановление позиции скролла при перезагрузке — стартуем сверху.
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  var loader = document.getElementById('loader');
  var loaderProgress = document.getElementById('loader-progress');
  var transitOverlay = document.getElementById('transit-overlay');
  var topNav = document.getElementById('top-nav');
  var scrollHint = document.getElementById('scroll-hint');
  var surfaceHint = document.getElementById('surface-hint');
  var polaroidReturn = document.getElementById('polaroid-return');
  var canvas = document.getElementById('stage');
  var isReturningToStart = false;

  function onProgress(p) {
    loaderProgress.textContent = Math.round(p * 100) + '%';
  }

  function updateTopNav(scrollPx) {
    var fadeDistance = Affogato.Viewport.height() * 0.28;
    var reveal = Affogato.TitleOverlay.getAlbumReveal();
    var opacity = reveal * Math.max(0, 1 - scrollPx / fadeDistance);
    topNav.style.opacity = opacity.toFixed(3);
    topNav.style.pointerEvents = opacity > 0.08 ? 'auto' : 'none';
  }

  function updateScrollHint(scrollPx, finalSceneStartPx) {
    var fadeDistance = Affogato.Viewport.height() * 0.28;
    var beforeFinal = Math.max(0, Math.min(1, (finalSceneStartPx - scrollPx) / fadeDistance));
    scrollHint.style.opacity = beforeFinal.toFixed(3);
    scrollHint.style.pointerEvents = beforeFinal > 0.08 ? 'auto' : 'none';
    scrollHint.tabIndex = beforeFinal > 0.08 ? 0 : -1;
  }

  // «На поверхность»: видна со 2-й полароид-карточки. На 1-й её роль уже
  // исполняет «вернуться» (там «один уровень вверх» = к началу), дублирование
  // не нужно. На diving (polaroidIdx = -1) — скрыта. Step-функция (visible /
  // hidden) — сглаживанием занимается CSS-transition opacity 0.6s.
  function updateSurfaceHint(scrollPx, polaroidIdx, finalSceneStartPx) {
    if (!surfaceHint) return;
    var EPS = 4;
    var beyondFirst = polaroidIdx >= 1;
    var beforeFinal = scrollPx < finalSceneStartPx - EPS;
    var visible = beyondFirst && beforeFinal;
    surfaceHint.style.opacity = visible ? '1' : '0';
    surfaceHint.style.pointerEvents = visible ? 'auto' : 'none';
    surfaceHint.tabIndex = visible ? 0 : -1;
  }

  // «Вернуться»: видна на всех полароид-сценах (включая 1-ю), но не на diving.
  // Действие контекстное — определяется при клике по текущей карточке.
  function updatePolaroidReturn(polaroidIdx) {
    if (!polaroidReturn) return;
    var visible = polaroidIdx >= 0;
    polaroidReturn.style.opacity = visible ? '1' : '0';
    polaroidReturn.style.pointerEvents = visible ? 'auto' : 'none';
    polaroidReturn.tabIndex = visible ? 0 : -1;
  }

  // Режим титров: на полароид-сценах АФФОГАТО смещается ниже (titles.polaroid),
  // чтобы не пересекаться с «вернуться» сверху по центру. Переключение
  // диффирующее — setStatic вызывается только при смене режима. В плеере и
  // во время возврата к началу не вмешиваемся: там собственные механизмы
  // (player.js → setStatic('player'), returnToSurface → TitleOverlay.reset).
  var currentTitleMode = null;
  function syncTitleMode(polaroidIdx) {
    var playerActive = Affogato.Player && Affogato.Player.isActive();
    if (playerActive || isReturningToStart) {
      currentTitleMode = null; // владельцем стейта временно становится тот механизм
      return;
    }
    var want = polaroidIdx >= 0 ? 'polaroid' : null;
    if (want === currentTitleMode) return;
    if (want === 'polaroid') {
      Affogato.TitleOverlay.setStatic(true, 'polaroid');
    } else {
      Affogato.TitleOverlay.setStatic(false);
    }
    currentTitleMode = want;
  }

  function start(frames) {
    var SM = Affogato.SceneManager;
    var diving = Affogato.Scenes.Diving;
    var songScenes = Affogato.Config.scenes.songs.items.map(function (item, index) {
      return Affogato.Scenes.createPolaroid(item, index);
    });
    var stoneVideo = Affogato.Scenes.createStoneVideo(Affogato.Config.scenes.stoneVideo);

    Affogato.TitleOverlay.init();
    Affogato.Transit.init(transitOverlay);
    diving.init(canvas, { frames: frames });
    songScenes.forEach(function (scene) { scene.init(canvas); });
    stoneVideo.init(canvas);
    SM.register(diving);
    songScenes.forEach(function (scene) { SM.register(scene); });
    SM.register(stoneVideo);
    SM.layout(); // задаёт высоту body и размер canvas

    // Локальный плеер: «послушать» в верхней навигации перехватывается.
    // Берём по id, а не первой <a> — рядом теперь есть «что это?», и порядок
    // может измениться.
    var listenLink = document.getElementById('listen-link');
    if (listenLink && Affogato.Player) {
      Affogato.Player.init({ triggerEl: listenLink, frames: frames });
    }

    // Модальная сцена «о проекте» (лес). Триггер и кадры — внутри модуля.
    if (Affogato.Forest) Affogato.Forest.init();

    // Модальная сцена «написать» (небо). Структурно симметрична forest.
    if (Affogato.Sky) Affogato.Sky.init();

    function getForwardTransitionTarget(scrollPx) {
      var finalIndex = SM.sceneIndex('stoneVideo');
      var edgeEps = 2;
      for (var i = 0; i < finalIndex; i++) {
        var range = SM.transitionRange(i);
        if (range && scrollPx < range.end - edgeEps) return range.end;
      }
      return null;
    }

    // Индекс активной полароид-карточки (0..N-1) или -1 если мы не на
    // полароидной сцене. На transition между двумя полароидами возвращаем
    // индекс «следующей» — куда юзер уже едет (после её начала и нашего
    // edgeEps). Используется кнопкой «вернуться» и updateSurfaceHint.
    function currentPolaroidIndex(scrollPx) {
      var edgeEps = 4;
      // Нижняя граница: пока юзер не вышел из перехода diving→polaroid[0],
      // мы ещё на главной — никакая полароид-кнопка показываться не должна.
      var firstGlobal = SM.sceneIndex(songScenes[0].id);
      var rangeBefore = firstGlobal > 0 ? SM.transitionRange(firstGlobal - 1) : null;
      var firstPolaroidStart = rangeBefore ? rangeBefore.end : 0;
      if (scrollPx < firstPolaroidStart - edgeEps) return -1;

      for (var i = 0; i < songScenes.length; i++) {
        var globalIndex = SM.sceneIndex(songScenes[i].id);
        var rangeAfter = SM.transitionRange(globalIndex);
        // Если впереди нет следующего перехода (последняя сцена в registry) —
        // мы на ней по факту.
        if (!rangeAfter) return i;
        if (scrollPx < rangeAfter.end - edgeEps) return i;
      }
      return -1;
    }

    // Точка «начала» полароид-карточки по индексу: место, куда юзер
    // прилетает после автоперехода с предыдущей сцены. Для polaroid[0]
    // это конец transition с diving.
    function polaroidSceneStart(polaroidIndex) {
      var globalIndex = SM.sceneIndex(songScenes[polaroidIndex].id);
      var rangeBefore = SM.transitionRange(globalIndex - 1);
      return rangeBefore ? rangeBefore.end : 0;
    }

    scrollHint.addEventListener('click', function () {
      var playerActive = Affogato.Player && Affogato.Player.isActive();
      var forestActive = Affogato.Forest && Affogato.Forest.isActive();
      var skyActive = Affogato.Sky && Affogato.Sky.isActive();
      if (isReturningToStart || playerActive || forestActive || skyActive) return;
      var state = Affogato.SmoothScroll.getState ? Affogato.SmoothScroll.getState() : null;
      if (state && state.autoTransitioning) return;
      var current = state ? state.current : (window.scrollY || window.pageYOffset || 0);
      var target = getForwardTransitionTarget(current);
      if (target === null) return;
      Affogato.SmoothScroll.scrollTo(target, Affogato.Config.scroll.hintTransitionSec || 1.55);
    });

    window.scrollTo(0, 0);
    Affogato.SmoothScroll.init({ ease: Affogato.Config.scroll.ease });
    Affogato.SmoothScroll.setAutoTransitionProvider(function () {
      var ranges = [];
      ranges.push(SM.transitionRange(0));
      songScenes.forEach(function (scene) {
        var index = SM.sceneIndex(scene.id);
        var range = SM.transitionRange(index);
        if (range) {
          range.durationSec = Affogato.Config.scroll.songTransitionSec;
          ranges.push(range);
        }
      });
      return ranges;
    });
    // Возврат к началу: используется как автозавершение финального видео,
    // так и ручной клик «на поверхность» с полароид-сцены. opts.videoEl —
    // источник для «камень-фазы» подъёма (есть только когда возвращаемся
    // после финального видео); без него фаза 0..STONE_END = просто тёмная
    // вода с veil, что для подъёма из толщи воды семантически корректно.
    function returnToSurface(opts) {
      if (isReturningToStart) return;
      opts = opts || {};
      var returnMs = Affogato.Config.scroll.returnToTopSec * 1000;
      isReturningToStart = true;
      document.body.classList.add('is-returning-to-start');
      Affogato.Transit.start('up', Affogato.Config.scroll.returnToTopSec, {
        videoEl: opts.videoEl,
        frames: frames,
      });
      window.setTimeout(function () {
        Affogato.SmoothScroll.jumpTo(0);
        Affogato.TitleOverlay.reset();
        songScenes.forEach(function (scene) { scene.hide(); });
        stoneVideo.hide();
        SM.render(0);
      }, Math.max(120, returnMs - 90));
      window.setTimeout(function () {
        Affogato.Transit.stop();
        SM.render(0);
        isReturningToStart = false;
        document.body.classList.remove('is-returning-to-start');
      }, returnMs + 240);
    }

    stoneVideo.onEnded(function () {
      returnToSurface({ videoEl: stoneVideo.getVideoElement() });
    });

    if (surfaceHint) {
      surfaceHint.addEventListener('click', function () {
        var playerActive = Affogato.Player && Affogato.Player.isActive();
        if (isReturningToStart || playerActive) return;
        var state = Affogato.SmoothScroll.getState ? Affogato.SmoothScroll.getState() : null;
        if (state && state.autoTransitioning) return;
        returnToSurface();
      });
    }

    // «Вернуться» — на один уровень вверх. С 1-й полароид-карточки = к началу
    // через canvas-анимацию подъёма (как «на поверхность»). С 2-й и далее —
    // плавный scrollTo в начало предыдущей карточки.
    if (polaroidReturn) {
      polaroidReturn.addEventListener('click', function () {
        var playerActive = Affogato.Player && Affogato.Player.isActive();
        if (isReturningToStart || playerActive) return;
        var state = Affogato.SmoothScroll.getState ? Affogato.SmoothScroll.getState() : null;
        if (state && state.autoTransitioning) return;
        var current = state ? state.current : (window.scrollY || window.pageYOffset || 0);
        var idx = currentPolaroidIndex(current);
        if (idx <= 0) {
          // 1-я карточка или не на полароиде вообще (защита): подъём к началу.
          returnToSurface();
          return;
        }
        var target = polaroidSceneStart(idx - 1);
        // Та же длительность, что у «погрузиться» — даёт ощутимую инерцию подъёма
        // (songTransitionSec=0.55 слишком резкий, ощущается как клик-скачок).
        Affogato.SmoothScroll.scrollTo(target, Affogato.Config.scroll.hintTransitionSec || 1.55);
      });
    }

    // Рисуем первый кадр до показа canvas — чтобы не мигнуло пустотой.
    SM.render(0);

    document.body.classList.add('ready');
    loader.classList.add('hidden');

    Affogato.Viewport.onChange(function () { SM.layout(); });

    var lastFrameAt = 0;
    function loop(timestamp) {
      // На время плеера и финального подъёма главный цикл стоит: иначе
      // updateTopNav/updateScrollHint перезаписывают inline opacity=0 и top-nav
      // успевает плавно «вернуться» поверх угасающего transit-canvas.
      var playerActive = Affogato.Player && Affogato.Player.isActive();
      var forestActive = Affogato.Forest && Affogato.Forest.isActive();
      var skyActive = Affogato.Sky && Affogato.Sky.isActive();
      if (isReturningToStart || playerActive || forestActive || skyActive) {
        window.setTimeout(function () {
          requestAnimationFrame(loop);
        }, (Affogato.Config.performance && Affogato.Config.performance.sleepMs) || 180);
        return;
      }

      var now = typeof timestamp === 'number' ? timestamp : performance.now();
      var perf = Affogato.Config.performance || {};
      var scrollState = Affogato.SmoothScroll.getState ? Affogato.SmoothScroll.getState() : null;
      var isScrollActive = !scrollState ||
        scrollState.autoTransitioning ||
        Math.abs(scrollState.target - scrollState.current) > 0.2;
      var fps = isScrollActive ? (perf.activeFps || 60) : (perf.idleFps || 30);
      var frameInterval = 1000 / fps;
      if (lastFrameAt && now - lastFrameAt < frameInterval) {
        requestAnimationFrame(loop);
        return;
      }
      lastFrameAt = now;

      var scrollPx = Affogato.SmoothScroll.update();
      var stoneIndex = SM.sceneIndex('stoneVideo');
      var previousTransition = SM.transitionRange(stoneIndex - 1);
      var stoneStart = previousTransition ? previousTransition.end : Infinity;
      var polaroidIdx = currentPolaroidIndex(scrollPx);
      updateTopNav(scrollPx);
      updateScrollHint(scrollPx, stoneStart);
      updateSurfaceHint(scrollPx, polaroidIdx, stoneStart);
      updatePolaroidReturn(polaroidIdx);
      syncTitleMode(polaroidIdx);
      SM.render(scrollPx);
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    // Фоновый прогрев модальных сцен: их кадры (forest 79, sky 81) грузятся
    // лениво при первом клике и дают заметную паузу. Догружаем заранее в
    // простое время после старта — forest в приоритете (его чаще открывают
    // первым), sky следом, чтобы не конкурировать за сеть/декодирование.
    scheduleIdle(function () {
      var forest = Affogato.Forest;
      var sky = Affogato.Sky;
      var afterForest = (forest && forest.prefetch) ? forest.prefetch() : Promise.resolve();
      Promise.resolve(afterForest).then(function () {
        if (sky && sky.prefetch) sky.prefetch();
      });
    });
  }

  // Отложить работу на простое время: requestIdleCallback, иначе таймер-фолбэк
  // (Safari < 17 без rIC). timeout гарантирует запуск, даже если простоя нет.
  function scheduleIdle(fn) {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(fn, { timeout: 2500 });
    } else {
      window.setTimeout(fn, 1200);
    }
  }

  Affogato.Preloader.loadAll(onProgress).then(start);
})();
