// Бутстрап: предзагрузка кадров → инициализация сцен → главный rAF-цикл.
(function () {
  // Отключаем восстановление позиции скролла при перезагрузке — стартуем сверху.
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  var loader = document.getElementById('loader');
  var loaderProgress = document.getElementById('loader-progress');
  var transitOverlay = document.getElementById('transit-overlay');
  var topNav = document.getElementById('top-nav');
  var scrollHint = document.getElementById('scroll-hint');
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
    var listenLink = topNav ? topNav.querySelector('a') : null;
    if (listenLink && Affogato.Player) {
      Affogato.Player.init({ triggerEl: listenLink, frames: frames });
    }

    function getForwardTransitionTarget(scrollPx) {
      var finalIndex = SM.sceneIndex('stoneVideo');
      var edgeEps = 2;
      for (var i = 0; i < finalIndex; i++) {
        var range = SM.transitionRange(i);
        if (range && scrollPx < range.end - edgeEps) return range.end;
      }
      return null;
    }

    scrollHint.addEventListener('click', function () {
      var playerActive = Affogato.Player && Affogato.Player.isActive();
      if (isReturningToStart || playerActive) return;
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
    stoneVideo.onEnded(function () {
      var returnMs = Affogato.Config.scroll.returnToTopSec * 1000;
      isReturningToStart = true;
      Affogato.Transit.start('up', Affogato.Config.scroll.returnToTopSec, {
        videoEl: stoneVideo.getVideoElement(),
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
      }, returnMs + 240);
    });

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
      if (isReturningToStart || playerActive) {
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
      updateTopNav(scrollPx);
      updateScrollHint(scrollPx, stoneStart);
      SM.render(scrollPx);
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  Affogato.Preloader.loadAll(onProgress).then(start);
})();
