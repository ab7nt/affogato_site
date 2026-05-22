// Бутстрап: предзагрузка кадров → инициализация сцен → главный rAF-цикл.
(function () {
  // Отключаем восстановление позиции скролла при перезагрузке — стартуем сверху.
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  var loader = document.getElementById('loader');
  var loaderProgress = document.getElementById('loader-progress');
  var returnCurtain = document.getElementById('return-curtain');
  var canvas = document.getElementById('stage');

  function onProgress(p) {
    loaderProgress.textContent = Math.round(p * 100) + '%';
  }

  function start(frames) {
    var SM = Affogato.SceneManager;
    var diving = Affogato.Scenes.Diving;
    var songScenes = Affogato.Config.scenes.songs.items.map(function (item, index) {
      return Affogato.Scenes.createPolaroid(item, index);
    });
    var preVideoDark = Affogato.Scenes.createDark('preVideoDark', Affogato.Config.scenes.preVideoDark);
    var stoneVideo = Affogato.Scenes.createStoneVideo(Affogato.Config.scenes.stoneVideo);
    var returnDark = Affogato.Scenes.createDark('returnDark', Affogato.Config.scenes.returnDark);

    Affogato.TitleOverlay.init();
    diving.init(canvas, { frames: frames });
    songScenes.forEach(function (scene) { scene.init(canvas); });
    preVideoDark.init(canvas);
    stoneVideo.init(canvas);
    returnDark.init(canvas);
    SM.register(diving);
    songScenes.forEach(function (scene) { SM.register(scene); });
    SM.register(preVideoDark);
    SM.register(stoneVideo);
    SM.register(returnDark);
    SM.layout(); // задаёт высоту body и размер canvas

    window.scrollTo(0, 0);
    Affogato.SmoothScroll.init({ ease: Affogato.Config.scroll.ease });
    Affogato.SmoothScroll.setAutoTransitionProvider(function () {
      var preVideo = SM.sceneIndex('preVideoDark');
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
      if (preVideo !== -1) ranges.push(SM.transitionRange(preVideo));
      return ranges;
    });
    stoneVideo.onEnded(function () {
      var returnMs = Affogato.Config.scroll.returnToTopSec * 1000;
      returnCurtain.classList.add('visible');
      window.setTimeout(function () {
        Affogato.SmoothScroll.scrollTo(0, Affogato.Config.scroll.returnToTopSec);
      }, 380);
      window.setTimeout(function () {
        Affogato.TitleOverlay.reset();
        SM.render(0);
      }, 380 + returnMs + 80);
      window.setTimeout(function () {
        returnCurtain.classList.remove('visible');
      }, 380 + returnMs + 220);
    });

    // Рисуем первый кадр до показа canvas — чтобы не мигнуло пустотой.
    SM.render(0);

    document.body.classList.add('ready');
    loader.classList.add('hidden');

    window.addEventListener('resize', function () { SM.layout(); });

    function loop() {
      SM.render(Affogato.SmoothScroll.update());
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  Affogato.Preloader.loadAll(onProgress).then(start);
})();
