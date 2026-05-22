// Бутстрап: предзагрузка кадров → инициализация сцен → главный rAF-цикл.
(function () {
  // Отключаем восстановление позиции скролла при перезагрузке — стартуем сверху.
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  var loader = document.getElementById('loader');
  var loaderProgress = document.getElementById('loader-progress');
  var returnAscent = document.getElementById('return-ascent');
  var topNav = document.getElementById('top-nav');
  var scrollHint = document.getElementById('scroll-hint');
  var canvas = document.getElementById('stage');

  function onProgress(p) {
    loaderProgress.textContent = Math.round(p * 100) + '%';
  }

  function updateTopNav(scrollPx) {
    var fadeDistance = window.innerHeight * 0.28;
    var reveal = Affogato.TitleOverlay.getAlbumReveal();
    var opacity = reveal * Math.max(0, 1 - scrollPx / fadeDistance);
    topNav.style.opacity = opacity.toFixed(3);
    topNav.style.pointerEvents = opacity > 0.08 ? 'auto' : 'none';
  }

  function updateScrollHint(scrollPx, finalSceneStartPx) {
    var fadeDistance = window.innerHeight * 0.28;
    var beforeFinal = Math.max(0, Math.min(1, (finalSceneStartPx - scrollPx) / fadeDistance));
    scrollHint.style.opacity = beforeFinal.toFixed(3);
  }

  function start(frames) {
    var SM = Affogato.SceneManager;
    var diving = Affogato.Scenes.Diving;
    var songScenes = Affogato.Config.scenes.songs.items.map(function (item, index) {
      return Affogato.Scenes.createPolaroid(item, index);
    });
    var stoneVideo = Affogato.Scenes.createStoneVideo(Affogato.Config.scenes.stoneVideo);

    Affogato.TitleOverlay.init();
    Affogato.ReturnAscent.init(returnAscent);
    diving.init(canvas, { frames: frames });
    songScenes.forEach(function (scene) { scene.init(canvas); });
    stoneVideo.init(canvas);
    SM.register(diving);
    songScenes.forEach(function (scene) { SM.register(scene); });
    SM.register(stoneVideo);
    SM.layout(); // задаёт высоту body и размер canvas

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
      Affogato.ReturnAscent.start(Affogato.Config.scroll.returnToTopSec, stoneVideo.getVideoElement(), frames);
      window.setTimeout(function () {
        Affogato.SmoothScroll.jumpTo(0);
        Affogato.TitleOverlay.reset();
        SM.render(0);
      }, Math.max(120, returnMs - 90));
      window.setTimeout(function () {
        Affogato.ReturnAscent.stop();
      }, returnMs + 240);
    });

    // Рисуем первый кадр до показа canvas — чтобы не мигнуло пустотой.
    SM.render(0);

    document.body.classList.add('ready');
    loader.classList.add('hidden');

    window.addEventListener('resize', function () { SM.layout(); });

    function loop() {
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
